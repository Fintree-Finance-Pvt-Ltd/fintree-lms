const crypto = require("crypto");

/**
 * Returns a clean string.
 */
function clean(value) {
  return String(value ?? "").trim();
}

/**
 * Read a required environment variable.
 *
 * We fail immediately instead of generating an invalid Easebuzz
 * signature when the merchant key or salt is missing.
 */
function requireEnvironmentVariable(name) {
  const value = clean(process.env[name]);

  if (!value) {
    const error = new Error(
      `${name} is not configured in environment variables`,
    );

    error.code = "EASEBUZZ_CONFIGURATION_ERROR";
    error.statusCode = 500;

    throw error;
  }

  return value;
}

/**
 * SHA-512 hexadecimal hash.
 *
 * Easebuzz Authorization values are SHA-512 hashes represented
 * as lowercase hexadecimal strings.
 */
function sha512Hex(value) {
  return crypto
    .createHash("sha512")
    .update(String(value), "utf8")
    .digest("hex");
}

/**
 * SHA-256 binary hash.
 *
 * Do not convert this to hexadecimal before deriving the AES key
 * and IV. Easebuzz asks for bytes from the SHA-256 result.
 */
function sha256Buffer(value) {
  return crypto
    .createHash("sha256")
    .update(String(value), "utf8")
    .digest();
}

/**
 * Easebuzz AES-256 key.
 *
 * Documentation:
 * - SHA-256 hash of merchant key
 * - first 32 bytes
 *
 * SHA-256 already produces exactly 32 bytes.
 */
function deriveEasebuzzAesKey(merchantKey) {
  const key = sha256Buffer(merchantKey).subarray(0, 32);

  if (key.length !== 32) {
    throw new Error(
      "Unable to derive a valid 32-byte Easebuzz AES key",
    );
  }

  return key;
}

/**
 * Easebuzz AES-CBC IV.
 *
 * Documentation:
 * - SHA-256 hash of merchant salt
 * - first 16 bytes
 */
function deriveEasebuzzAesIv(merchantSalt) {
  const iv = sha256Buffer(merchantSalt).subarray(0, 16);

  if (iv.length !== 16) {
    throw new Error(
      "Unable to derive a valid 16-byte Easebuzz AES IV",
    );
  }

  return iv;
}

/**
 * Encrypt a value using AES-256-CBC.
 *
 * Node.js automatically applies PKCS#7 padding when
 * setAutoPadding(true) is enabled. This gives a ciphertext whose
 * underlying padded plaintext length is a multiple of 16 bytes.
 *
 * The encrypted result is returned as Base64.
 *
 * Important:
 * Compare this encoding with the official Easebuzz Python sample.
 * If that sample returns hexadecimal instead of Base64, change:
 *
 * encrypted.toString("base64")
 *
 * to:
 *
 * encrypted.toString("hex")
 */
function encryptEasebuzzValue(
  plaintext,
  {
    merchantKey = process.env.EASEBUZZ_MERCHANT_KEY,
    merchantSalt = process.env.EASEBUZZ_MERCHANT_SALT,
  } = {},
) {
  if (
    plaintext === undefined ||
    plaintext === null ||
    plaintext === ""
  ) {
    return "";
  }

  const normalizedMerchantKey = clean(merchantKey);
  const normalizedMerchantSalt = clean(merchantSalt);

  if (!normalizedMerchantKey) {
    const error = new Error(
      "Easebuzz merchant key is required for encryption",
    );

    error.code = "EASEBUZZ_CONFIGURATION_ERROR";
    throw error;
  }

  if (!normalizedMerchantSalt) {
    const error = new Error(
      "Easebuzz merchant salt is required for encryption",
    );

    error.code = "EASEBUZZ_CONFIGURATION_ERROR";
    throw error;
  }

  const aesKey = deriveEasebuzzAesKey(
    normalizedMerchantKey,
  );

  const aesIv = deriveEasebuzzAesIv(
    normalizedMerchantSalt,
  );

  const cipher = crypto.createCipheriv(
    "aes-256-cbc",
    aesKey,
    aesIv,
  );

  cipher.setAutoPadding(true);

  const encrypted = Buffer.concat([
    cipher.update(String(plaintext), "utf8"),
    cipher.final(),
  ]);

  return encrypted.toString("base64");
}


/**
 * Generate EasyCollect create/update link hash.
 *
 * Sequence:
 * key|merchant_txn|name|email|phone|amount|
 * udf1|udf2|udf3|udf4|udf5|message|salt
 */
function generateEasyCollectHash({
  merchantKey,
  merchantSalt,
  merchantTxn,
  name,
  email = "",
  phone,
  amount,
  udf1 = "",
  udf2 = "",
  udf3 = "",
  udf4 = "",
  udf5 = "",
  message = "",
}) {
  const sequence = [
    merchantKey,
    merchantTxn,
    name,
    email,
    phone,
    amount,
    udf1,
    udf2,
    udf3,
    udf4,
    udf5,
    message,
    merchantSalt,
  ].join("|");

  return sha512Hex(sequence);
}

/**
 * Optional decryption helper.
 *
 * This should mainly be used for local testing. The production
 * mandate flow does not need to decrypt values after they are
 * submitted to Easebuzz.
 */
function decryptEasebuzzValue(
  encryptedValue,
  {
    merchantKey = process.env.EASEBUZZ_MERCHANT_KEY,
    merchantSalt = process.env.EASEBUZZ_MERCHANT_SALT,
  } = {},
) {
  const encrypted = clean(encryptedValue);

  if (!encrypted) {
    return "";
  }

  const aesKey = deriveEasebuzzAesKey(merchantKey);
  const aesIv = deriveEasebuzzAesIv(merchantSalt);

  const decipher = crypto.createDecipheriv(
    "aes-256-cbc",
    aesKey,
    aesIv,
  );

  decipher.setAutoPadding(true);

  const decrypted = Buffer.concat([
    decipher.update(
      Buffer.from(encrypted, "base64"),
    ),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}

/**
 * Normalize a mandate amount for the access-key API.
 *
 * The API expects a JSON number with up to two decimal places.
 *
 * Examples:
 *  "100.00" -> 100
 *  "100.50" -> 100.5
 *  100.567  -> error
 *
 * The returned amountText must be used in the access-key
 * Authorization hash because it matches the JSON numeric value.
 */
function normalizeEasebuzzAmount(value, field = "amount") {
  const raw = clean(value);

  if (!raw) {
    const error = new Error(`${field} is required`);
    error.code = "EASEBUZZ_VALIDATION_ERROR";
    error.statusCode = 400;
    throw error;
  }

  if (!/^\d+(\.\d{1,2})?$/.test(raw)) {
    const error = new Error(
      `${field} must contain a maximum of two decimal places`,
    );

    error.code = "EASEBUZZ_VALIDATION_ERROR";
    error.statusCode = 400;

    throw error;
  }

  const amount = Number(raw);

  if (!Number.isFinite(amount)) {
    const error = new Error(`${field} is invalid`);
    error.code = "EASEBUZZ_VALIDATION_ERROR";
    error.statusCode = 400;
    throw error;
  }

  if (amount < 1) {
    const error = new Error(
      `${field} must be at least INR 1`,
    );

    error.code = "EASEBUZZ_VALIDATION_ERROR";
    error.statusCode = 400;
    throw error;
  }

  if (amount > 100000000) {
    const error = new Error(
      `${field} cannot exceed INR 10 crore`,
    );

    error.code = "EASEBUZZ_VALIDATION_ERROR";
    error.statusCode = 400;
    throw error;
  }

  return {
    /**
     * Use this in the JSON request body.
     */
    amount,

    /**
     * Use this exact value in the Authorization hash.
     */
    amountText: String(amount),
  };
}

/**
 * Generate Authorization header for:
 *
 * POST /autocollect/v1/access-key/generate/
 *
 * Hash format:
 * key|amount|transaction_id|salt
 */
function generateAccessKeyAuthorization({
  merchantKey = process.env.EASEBUZZ_MERCHANT_KEY,
  merchantSalt = process.env.EASEBUZZ_MERCHANT_SALT,
  amount,
  transactionId,
}) {
  const key = clean(merchantKey);
  const salt = clean(merchantSalt);
  const txnId = clean(transactionId);

  if (!key) {
    throw new Error(
      "Easebuzz merchant key is required",
    );
  }

  if (!salt) {
    throw new Error(
      "Easebuzz merchant salt is required",
    );
  }

  if (!txnId) {
    const error = new Error(
      "Easebuzz transaction ID is required",
    );

    error.code = "EASEBUZZ_VALIDATION_ERROR";
    error.statusCode = 400;

    throw error;
  }

  const normalizedAmount =
    normalizeEasebuzzAmount(amount);

  const hashSequence = [
    key,
    normalizedAmount.amountText,
    txnId,
    salt,
  ].join("|");

  return {
    authorization: sha512Hex(hashSequence),
    amount: normalizedAmount.amount,
    amountText: normalizedAmount.amountText,
  };
}

/**
 * Generate form Authorization for eNACH and UPI.
 *
 * Easebuzz format:
 *
 * key|encrypted_account_number|ifsc|
 * encrypted_upi_handle|salt
 *
 * Empty fields must remain in the sequence so the "|" separators
 * are preserved.
 */
function generateEnachUpiAuthorization({
  merchantKey = process.env.EASEBUZZ_MERCHANT_KEY,
  merchantSalt = process.env.EASEBUZZ_MERCHANT_SALT,
  encryptedAccountNumber = "",
  ifsc = "",
  encryptedUpiHandle = "",
}) {
  const key = clean(merchantKey);
  const salt = clean(merchantSalt);

  if (!key || !salt) {
    const error = new Error(
      "Easebuzz merchant key and salt are required",
    );

    error.code = "EASEBUZZ_CONFIGURATION_ERROR";
    error.statusCode = 500;

    throw error;
  }

  const hashSequence = [
    key,
    clean(encryptedAccountNumber),
    clean(ifsc).toUpperCase(),
    clean(encryptedUpiHandle),
    salt,
  ].join("|");

  return sha512Hex(hashSequence);
}

/**
 * Generate form Authorization for SI card mode.
 *
 * Easebuzz format:
 *
 * key|encrypted_card_number|encrypted_card_cvv|salt
 */
function generateSiCardAuthorization({
  merchantKey = process.env.EASEBUZZ_MERCHANT_KEY,
  merchantSalt = process.env.EASEBUZZ_MERCHANT_SALT,
  encryptedCardNumber,
  encryptedCardCvv,
}) {
  const key = clean(merchantKey);
  const salt = clean(merchantSalt);
  const cardNumber = clean(encryptedCardNumber);
  const cardCvv = clean(encryptedCardCvv);

  if (!key || !salt) {
    const error = new Error(
      "Easebuzz merchant key and salt are required",
    );

    error.code = "EASEBUZZ_CONFIGURATION_ERROR";
    error.statusCode = 500;

    throw error;
  }

  if (!cardNumber || !cardCvv) {
    const error = new Error(
      "Encrypted card number and CVV are required",
    );

    error.code = "EASEBUZZ_VALIDATION_ERROR";
    error.statusCode = 400;

    throw error;
  }

  const hashSequence = [
    key,
    cardNumber,
    cardCvv,
    salt,
  ].join("|");

  return sha512Hex(hashSequence);
}

/**
 * Read configured credentials once a request actually needs them.
 *
 * Do not read them at application import time, because that makes
 * tests and environment configuration harder.
 */
function getEasebuzzCredentials() {
  return {
    merchantKey: requireEnvironmentVariable(
      "EASEBUZZ_MERCHANT_KEY",
    ),

    merchantSalt: requireEnvironmentVariable(
      "EASEBUZZ_MERCHANT_SALT",
    ),

    subMerchantId: clean(
      process.env.EASEBUZZ_SUB_MERCHANT_ID,
    ),
  };
}

module.exports = {
  sha512Hex,
  deriveEasebuzzAesKey,
  deriveEasebuzzAesIv,
  encryptEasebuzzValue,
  decryptEasebuzzValue,
  normalizeEasebuzzAmount,
  generateEasyCollectHash,
  generateAccessKeyAuthorization,
  generateEnachUpiAuthorization,
  generateSiCardAuthorization,
  getEasebuzzCredentials,
};