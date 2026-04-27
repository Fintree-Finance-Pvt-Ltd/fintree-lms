// test-ckyc-crypto.js
require('dotenv').config();

const {
  generateSessionKey,
  encryptPidData,
  encryptSessionKeyWithCKYCPublicKey,
  toBase64,
  loadP12PrivateKey,
} = require('./ckyc.crypto');

const pidXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<PID_DATA>
  <DATE_TIME>04-04-2026 16:45:00</DATE_TIME>
  <ID_NO>ABCDE1234F</ID_NO>
  <ID_TYPE>C</ID_TYPE>
</PID_DATA>`;

try {
  const sessionKey = generateSessionKey();
  console.log('Session key bytes:', sessionKey.length);

  const encryptedPid = encryptPidData(pidXml, sessionKey);
  console.log('Encrypted PID base64:', toBase64(encryptedPid));

  const encryptedSessionKey = encryptSessionKeyWithCKYCPublicKey(sessionKey);
  console.log('Encrypted Session Key base64:', toBase64(encryptedSessionKey));

  const certData = loadP12PrivateKey();
  console.log('Private key loaded:', !!certData.privateKeyPem);
  console.log('Certificate loaded:', !!certData.certificatePem);
} catch (err) {
  console.error('CKYC crypto test failed:', err.message);
}