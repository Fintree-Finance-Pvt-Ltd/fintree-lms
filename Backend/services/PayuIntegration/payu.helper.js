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
//   // Keep the same string for hash and request.
//   return JSON.stringify(obj);
// }

// function generateConsentHash(params, siDetailsString) {
//   const udf1 = params.udf1 || "";
//   const udf2 = params.udf2 || "";
//   const udf3 = params.udf3 || "";
//   const udf4 = params.udf4 || "";
//   const udf5 = params.udf5 || "";

//   const hashString = [
//     params.key,
//     params.txnid,
//     params.amount,
//     params.productinfo,
//     params.firstname,
//     params.email,
//     udf1,
//     udf2,
//     udf3,
//     udf4,
//     udf5,
//   ].join("|") + `||||||${siDetailsString}|${PAYU_CONFIG.salt}`;

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
//   return sha512(`${PAYU_CONFIG.key}|${command}|${var1String}|${PAYU_CONFIG.salt}`);
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

function generateTxnId(prefix = "TXN") {
  return `${prefix}${Date.now()}${Math.floor(Math.random() * 10000)}`;
}

function stringifyStable(obj) {
  return JSON.stringify(obj);
}

function generateConsentHash(params, siDetailsString) {
  const udf1 = params.udf1 || "";
  const udf2 = params.udf2 || "";
  const udf3 = params.udf3 || "";
  const udf4 = params.udf4 || "";
  const udf5 = params.udf5 || "";

  const hashString =
    [
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
    ].join("|") +
    `||||||${siDetailsString}|${PAYU_CONFIG.salt}`;

  console.log("PAYU CONSENT HASH STRING:", hashString);

  return sha512(hashString);
}

function verifyPayuResponseHash(body) {
  const reverseHashString =
    `${PAYU_CONFIG.salt}|${body.status}||||||` +
    `${body.udf5 || ""}|${body.udf4 || ""}|${body.udf3 || ""}|` +
    `${body.udf2 || ""}|${body.udf1 || ""}|${body.email}|` +
    `${body.firstname}|${body.productinfo}|${body.amount}|` +
    `${body.txnid}|${body.key}`;

  const calculated = sha512(reverseHashString).toLowerCase();

  return calculated === String(body.hash || "").toLowerCase();
}

function generateRecurringHash(command, var1String) {
  return sha512(
    `${PAYU_CONFIG.key}|${command}|${var1String}|${PAYU_CONFIG.salt}`
  );
}

module.exports = {
  PAYU_CONFIG,
  generateTxnId,
  stringifyStable,
  generateConsentHash,
  verifyPayuResponseHash,
  generateRecurringHash,
};