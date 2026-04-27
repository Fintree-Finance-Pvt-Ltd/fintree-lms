// src/modules/ckyc/ckyc.crypto.js
const fs = require('fs');
const crypto = require('crypto');
const forge = require('node-forge');
const { AES_KEY_SIZE } = require('./ckyc.constants');

function generateSessionKey() {
  return crypto.randomBytes(AES_KEY_SIZE); // 32 bytes = 256-bit
}

function toBase64(buffer) {
  return Buffer.from(buffer).toString('base64');
}

function fromBase64(base64) {
  return Buffer.from(base64, 'base64');
}

/**
 * CKYC sample uses AES symmetric encryption for PID data.
 * We will use AES-256-CBC with random IV.
 * Since interoperability sometimes depends on exact mode,
 * verify with UAT if they expect IV-prefixed payload or fixed handling.
 */
function encryptPidData(pidXml, sessionKey) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', sessionKey, iv);

  const encrypted = Buffer.concat([
    cipher.update(Buffer.from(pidXml, 'utf8')),
    cipher.final(),
  ]);

  // return iv + encrypted payload together
  return Buffer.concat([iv, encrypted]);
}

/**
 * Optional helper if response decryption is needed later
 */
function decryptPidData(encryptedBuffer, sessionKey) {
  const iv = encryptedBuffer.subarray(0, 16);
  const data = encryptedBuffer.subarray(16);

  const decipher = crypto.createDecipheriv('aes-256-cbc', sessionKey, iv);

  const decrypted = Buffer.concat([
    decipher.update(data),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

function loadCkycPublicKey() {
  const certPath = process.env.CKYC_PUBLIC_KEY_PATH;
  console.log('Loading CKYC public key from:', certPath);
  if (!certPath) {
    throw new Error('CKYC_PUBLIC_KEY_PATH is not configured');
  }

  const certPemOrDer = fs.readFileSync(certPath);

  const text = certPemOrDer.toString('utf8');

  // If PEM already
  if (text.includes('BEGIN CERTIFICATE')) {
    const cert = forge.pki.certificateFromPem(text);
    return forge.pki.publicKeyToPem(cert.publicKey);
  }

  // else assume DER .cer
  const derBinary = certPemOrDer.toString('binary');
  const asn1Obj = forge.asn1.fromDer(derBinary);
  const cert = forge.pki.certificateFromAsn1(asn1Obj);
  return forge.pki.publicKeyToPem(cert.publicKey);
}

/**
 * CKYC PDF for v1.3 says:
 * Encrypt session key using RSA/NONE/OAEPWithSHA256AndMGF1Padding
 */
function encryptSessionKeyWithCKYCPublicKey(sessionKey) {
  const publicKeyPem = loadCkycPublicKey();

  return crypto.publicEncrypt(
    {
      key: publicKeyPem,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    sessionKey
  );
}

/**
 * Loads private key + certificate from .p12/.pfx
 * This will be used in next step for XML signing
 */
function loadP12PrivateKey() {
  const p12Path = process.env.CKYC_P12_PATH;
  const p12Password = process.env.CKYC_P12_PASSWORD;

  if (!p12Path || !p12Password) {
    throw new Error('CKYC_P12_PATH or CKYC_P12_PASSWORD missing');
  }

  const p12Buffer = fs.readFileSync(p12Path);
  const p12Der = forge.util.createBuffer(p12Buffer.toString('binary'));
  const p12Asn1 = forge.asn1.fromDer(p12Der);
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, p12Password);

  let privateKeyPem = null;
  let certificatePem = null;

  for (const safeContents of p12.safeContents) {
    for (const safeBag of safeContents.safeBags) {
      if (safeBag.type === forge.pki.oids.pkcs8ShroudedKeyBag && safeBag.key) {
        privateKeyPem = forge.pki.privateKeyToPem(safeBag.key);
      }

      if (safeBag.type === forge.pki.oids.certBag && safeBag.cert) {
        certificatePem = forge.pki.certificateToPem(safeBag.cert);
      }
    }
  }

  if (!privateKeyPem) {
    throw new Error('Private key not found in P12/PFX');
  }

  return {
    privateKeyPem,
    certificatePem,
  };
}

module.exports = {
  generateSessionKey,
  toBase64,
  fromBase64,
  encryptPidData,
  decryptPidData,
  loadCkycPublicKey,
  encryptSessionKeyWithCKYCPublicKey,
  loadP12PrivateKey,
};