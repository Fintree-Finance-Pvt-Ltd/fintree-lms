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

// function generateTxnId(prefix = "CONSENT") {
//   const timestamp = Date.now();
//   const random = Math.floor(Math.random() * 100000);
//   return `${prefix}${timestamp}${random}`.slice(0, 25);
// }

// function formatAmount(value) {
//   const num = Number(value);

//   if (!Number.isFinite(num) || num < 0) {
//     throw new Error("Invalid amount");
//   }

//   return num.toFixed(2);
// }

// function addDays(days) {
//   const date = new Date();
//   date.setDate(date.getDate() + days);
//   return date.toISOString().slice(0, 10);
// }

// function addYears(years) {
//   const date = new Date();
//   date.setFullYear(date.getFullYear() + years);
//   return date.toISOString().slice(0, 10);
// }

// function todayDate() {
//   return new Date().toISOString().slice(0, 10);
// }

// function stringifyStable(obj) {
//   return JSON.stringify(obj);
// }

// /**
//  * PayU SI / Consent hash:
//  *
//  * sha512(
//  *   key|txnid|amount|productinfo|firstname|email|
//  *   udf1|udf2|udf3|udf4|udf5||||||si_details|salt
//  * )
//  */
// function generateConsentHash(params) {
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
//     "",
//     "",
//     "",
//     "",
//     "",
//     params.si_details,
//     PAYU_CONFIG.salt,
//   ].join("|");

//   if (process.env.PAYU_DEBUG === "true") {
//     console.log("PayU consent hash string:", hashString);
//   }

//   return sha512(hashString);
// }

// /**
//  * PayU response reverse hash:
//  *
//  * sha512(
//  *   salt|status||||||udf5|udf4|udf3|udf2|udf1|
//  *   email|firstname|productinfo|amount|txnid|key
//  * )
//  */
// function generateResponseHash(body) {
//   const hashString = [
//     PAYU_CONFIG.salt,
//     body.status || "",
//     "",
//     "",
//     "",
//     "",
//     "",
//     body.udf5 || "",
//     body.udf4 || "",
//     body.udf3 || "",
//     body.udf2 || "",
//     body.udf1 || "",
//     body.email || "",
//     body.firstname || "",
//     body.productinfo || "",
//     body.amount || "",
//     body.txnid || "",
//     body.key || "",
//   ].join("|");

//   const finalHashString = body.additionalCharges
//     ? `${body.additionalCharges}|${hashString}`
//     : hashString;

//   if (process.env.PAYU_DEBUG === "true") {
//     console.log("PayU response hash string:", finalHashString);
//   }

//   return sha512(finalHashString);
// }

// function verifyPayuResponseHash(body) {
//   if (!body || !body.hash) {
//     return false;
//   }

//   const calculatedHash = generateResponseHash(body).toLowerCase();
//   const receivedHash = String(body.hash).toLowerCase();

//   return calculatedHash === receivedHash;
// }

// function generateRecurringHash(command, var1String) {
//   return sha512(
//     `${PAYU_CONFIG.key}|${command}|${var1String}|${PAYU_CONFIG.salt}`
//   );
// }

// module.exports = {
//   PAYU_CONFIG,
//   sha512,
//   generateTxnId,
//   formatAmount,
//   addDays,
//   addYears,
//   todayDate,
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
};

function sha512(value) {
  return crypto
    .createHash("sha512")
    .update(String(value), "utf8")
    .digest("hex");
}

function clean(value) {
  if (value === undefined || value === null) {
    return "";
  }

  return String(value).trim();
}

function generateTxnId(prefix = "SUB") {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomBytes(5).toString("hex");

  return `${prefix}${timestamp}${random}`.slice(0, 25);
}

function formatAmount(value) {
  const amount = Number(value);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Invalid amount");
  }

  return amount.toFixed(2);
}

function formatDateInTimeZone(
  date = new Date(),
  timeZone = "Asia/Kolkata"
) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const values = {};

  for (const part of parts) {
    if (part.type !== "literal") {
      values[part.type] = part.value;
    }
  }

  return `${values.year}-${values.month}-${values.day}`;
}

function todayDate() {
  return formatDateInTimeZone(new Date(), "Asia/Kolkata");
}

function isValidDate(value) {
  const dateString = clean(value);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    return false;
  }

  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function addYearsToDate(dateString, years) {
  if (!isValidDate(dateString)) {
    throw new Error("Invalid date");
  }

  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  const originalMonth = date.getUTCMonth();

  date.setUTCFullYear(date.getUTCFullYear() + years);

  // Handle February 29.
  if (date.getUTCMonth() !== originalMonth) {
    date.setUTCDate(0);
  }

  return date.toISOString().slice(0, 10);
}

/**
 * Subscription consent request hash:
 *
 * SHA512(
 *   key|txnid|amount|productinfo|firstname|email|
 *   udf1|udf2|udf3|udf4|udf5||||||si_details|salt
 * )
 */
function generateConsentHash(params) {
  const hashString = [
    clean(params.key),
    clean(params.txnid),
    clean(params.amount),
    clean(params.productinfo),
    clean(params.firstname),
    clean(params.email),
    clean(params.udf1),
    clean(params.udf2),
    clean(params.udf3),
    clean(params.udf4),
    clean(params.udf5),
    "",
    "",
    "",
    "",
    "",
    clean(params.si_details),
    PAYU_CONFIG.salt,
  ].join("|");

  return sha512(hashString);
}

/**
 * PayU reverse response hash:
 *
 * SHA512(
 *   salt|status||||||udf5|udf4|udf3|udf2|udf1|
 *   email|firstname|productinfo|amount|txnid|key
 * )
 */
function generateResponseHash(body) {
  const reverseHashString = [
    PAYU_CONFIG.salt,
    clean(body.status),
    "",
    "",
    "",
    "",
    "",
    clean(body.udf5),
    clean(body.udf4),
    clean(body.udf3),
    clean(body.udf2),
    clean(body.udf1),
    clean(body.email),
    clean(body.firstname),
    clean(body.productinfo),
    clean(body.amount),
    clean(body.txnid),
    clean(body.key),
  ].join("|");

  const additionalCharges =
    body.additionalCharges ?? body.additional_charges;

  const hasAdditionalCharges =
    additionalCharges !== undefined &&
    additionalCharges !== null &&
    clean(additionalCharges) !== "";

  const finalHashString = hasAdditionalCharges
    ? `${clean(additionalCharges)}|${reverseHashString}`
    : reverseHashString;

  return sha512(finalHashString);
}

function verifyPayuResponseHash(body) {
  if (!body?.hash || !PAYU_CONFIG.salt) {
    return false;
  }

  const calculatedHash = generateResponseHash(body).toLowerCase();
  const receivedHash = clean(body.hash).toLowerCase();

  if (
    calculatedHash.length !== receivedHash.length ||
    !/^[a-f0-9]{128}$/.test(receivedHash)
  ) {
    return false;
  }

  return crypto.timingSafeEqual(
    Buffer.from(calculatedHash, "utf8"),
    Buffer.from(receivedHash, "utf8")
  );
}

module.exports = {
  PAYU_CONFIG,
  clean,
  generateTxnId,
  formatAmount,
  todayDate,
  isValidDate,
  addYearsToDate,
  generateConsentHash,
  verifyPayuResponseHash,
};