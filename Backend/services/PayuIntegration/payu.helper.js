// const crypto = require("crypto");

// const PAYU_CONFIG = {
//   key: process.env.PAYU_KEY,
//   salt: process.env.PAYU_SALT,

//   paymentUrl:
//     process.env.PAYU_ENV === "production"
//       ? "https://secure.payu.in/_payment"
//       : "https://test.payu.in/_payment",

//   postServiceUrl:
//     process.env.PAYU_ENV === "production"
//       ? "https://info.payu.in/merchant/postservice.php"
//       : "https://test.payu.in/merchant/postservice.php",
// };

// function sha512(value) {
//   return crypto.createHash("sha512").update(value).digest("hex");
// }

// function generateTxnId(prefix = "TXN") {
//   return `${prefix}${Date.now()}${Math.floor(Math.random() * 10000)}`;
// }

// function stringifyStable(obj) {
//   return JSON.stringify(obj);
// }

// function generateConsentHash(params, siDetailsString) {
//   const udf1 = params.udf1 || "";
//   const udf2 = params.udf2 || "";
//   const udf3 = params.udf3 || "";
//   const udf4 = params.udf4 || "";
//   const udf5 = params.udf5 || "";

//   const hashString =
//     [
//       params.key,
//       params.txnid,
//       params.amount,
//       params.productinfo,
//       params.firstname,
//       params.email,
//       udf1,
//       udf2,
//       udf3,
//       udf4,
//       udf5,
//     ].join("|") +
//     `||||||${siDetailsString}|${PAYU_CONFIG.salt}`;

//   console.log("PAYU CONSENT HASH STRING:", hashString);

//   return sha512(hashString);
// }

// function verifyPayuResponseHash(body) {
//   const reverseHashString =
//     `${PAYU_CONFIG.salt}|${body.status}||||||` +
//     `${body.udf5 || ""}|${body.udf4 || ""}|${body.udf3 || ""}|` +
//     `${body.udf2 || ""}|${body.udf1 || ""}|${body.email}|` +
//     `${body.firstname}|${body.productinfo}|${body.amount}|` +
//     `${body.txnid}|${body.key}`;

//   const calculated = sha512(reverseHashString).toLowerCase();

//   return calculated === String(body.hash || "").toLowerCase();
// }

// function generateRecurringHash(command, var1String) {
//   return sha512(
//     `${PAYU_CONFIG.key}|${command}|${var1String}|${PAYU_CONFIG.salt}`
//   );
// }

// module.exports = {
//   PAYU_CONFIG,
//   generateTxnId,
//   stringifyStable,
//   generateConsentHash,
//   verifyPayuResponseHash,
//   generateRecurringHash,
// };


const crypto = require("crypto");

const PAYU_CONFIG = {
  key: process.env.PAYU_KEY,
  salt: process.env.PAYU_SALT,

  paymentUrl:
    process.env.PAYU_ENV === "production"
      ? "https://secure.payu.in/_payment"
      : "https://test.payu.in/_payment",

  postServiceUrl:
    process.env.PAYU_ENV === "production"
      ? "https://info.payu.in/merchant/postservice.php"
      : "https://test.payu.in/merchant/postservice.php",
};

function sha512(value) {
  return crypto.createHash("sha512").update(value).digest("hex");
}

function generateTxnId(prefix = "CONSENT") {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 100000);
  return `${prefix}${timestamp}${random}`.slice(0, 25);
}

function formatAmount(value) {
  const num = Number(value);

  if (!Number.isFinite(num) || num < 0) {
    throw new Error("Invalid amount");
  }

  return num.toFixed(2);
}

function addDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function addYears(years) {
  const date = new Date();
  date.setFullYear(date.getFullYear() + years);
  return date.toISOString().slice(0, 10);
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function stringifyStable(obj) {
  return JSON.stringify(obj);
}

/**
 * PayU SI / Consent hash:
 *
 * sha512(
 *   key|txnid|amount|productinfo|firstname|email|
 *   udf1|udf2|udf3|udf4|udf5||||||si_details|salt
 * )
 */
function generateConsentHash(params) {
  const udf1 = params.udf1 || "";
  const udf2 = params.udf2 || "";
  const udf3 = params.udf3 || "";
  const udf4 = params.udf4 || "";
  const udf5 = params.udf5 || "";

  const hashString = [
    params.key,
    params.txnid,
    params.amount,
    params.productinfo,
    params.firstname,
    params.email,
    udf1,
    udf2,
    udf3,
    udf4,
    udf5,
    "",
    "",
    "",
    "",
    "",
    params.si_details,
    PAYU_CONFIG.salt,
  ].join("|");

  if (process.env.PAYU_DEBUG === "true") {
    console.log("PayU consent hash string:", hashString);
  }

  return sha512(hashString);
}

/**
 * PayU response reverse hash:
 *
 * sha512(
 *   salt|status||||||udf5|udf4|udf3|udf2|udf1|
 *   email|firstname|productinfo|amount|txnid|key
 * )
 */
function generateResponseHash(body) {
  const hashString = [
    PAYU_CONFIG.salt,
    body.status || "",
    "",
    "",
    "",
    "",
    "",
    body.udf5 || "",
    body.udf4 || "",
    body.udf3 || "",
    body.udf2 || "",
    body.udf1 || "",
    body.email || "",
    body.firstname || "",
    body.productinfo || "",
    body.amount || "",
    body.txnid || "",
    body.key || "",
  ].join("|");

  const finalHashString = body.additionalCharges
    ? `${body.additionalCharges}|${hashString}`
    : hashString;

  if (process.env.PAYU_DEBUG === "true") {
    console.log("PayU response hash string:", finalHashString);
  }

  return sha512(finalHashString);
}

function verifyPayuResponseHash(body) {
  if (!body || !body.hash) {
    return false;
  }

  const calculatedHash = generateResponseHash(body).toLowerCase();
  const receivedHash = String(body.hash).toLowerCase();

  return calculatedHash === receivedHash;
}

function generateRecurringHash(command, var1String) {
  return sha512(
    `${PAYU_CONFIG.key}|${command}|${var1String}|${PAYU_CONFIG.salt}`
  );
}

module.exports = {
  PAYU_CONFIG,
  sha512,
  generateTxnId,
  formatAmount,
  addDays,
  addYears,
  todayDate,
  stringifyStable,
  generateConsentHash,
  verifyPayuResponseHash,
  generateRecurringHash,
};