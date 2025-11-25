// // services/smsService.js

// const axios = require("axios");
// const {
//   ALOT_API_URL = "https://alotsolutions.in/api/mt/SendSMS",
//   ALOT_USER,
//   ALOT_PASSWORD,
//   SENDER_ID,
//   DLT_PEID,
//   ALOT_CHANNEL = "TRANS",
//   ALOT_DCS_DEFAULT = "0",
//   ALOT_FLASH = "0",
//   ALOT_ROUTE = "5",
// } = process.env;

// function cleanMobile(m) {
//   if (!m) return null;
//   const d = String(m).replace(/\D/g, "");
//   if (d.length === 10) return "91" + d; 
//   if (d.length === 12 && d.startsWith("91")) return d;
//   return d;
// }

// function isUnicode(text) {
//   return /[^\x00-\x7F]/.test(text || "");
// }

// exports.sendSms = async ({ mobile, message, dltTemplateId }) => {
//   const msisdn = cleanMobile(mobile);
//   if (!msisdn) throw new Error("Invalid mobile number");

//   const smsUrl = `${ALOT_API_URL}?user=${encodeURIComponent(
//     ALOT_USER
//   )}&password=${encodeURIComponent(
//     ALOT_PASSWORD
//   )}&senderid=${SENDER_ID}&channel=${ALOT_CHANNEL}&DCS=${
//     isUnicode(message) ? "8" : ALOT_DCS_DEFAULT
//   }&flashsms=${ALOT_FLASH}&number=${msisdn}&text=${encodeURIComponent(
//     message
//   )}&route=${ALOT_ROUTE}&DLTTemplateId=${dltTemplateId || ""}&PEID=${DLT_PEID}`;

//   const res = await axios.get(smsUrl, { timeout: 20000 });
//   const body =
//     typeof res.data === "string" ? res.data : JSON.stringify(res.data);

//   const ok = /success|^1701\b|^000\b/i.test(body);
//   if (!ok) throw new Error(`ALOT send failed: ${body}`);

//   return body.slice(0, 100);
// };



// services/smsService.js
const axios = require("axios");

const {
  ALOT_API_URL = "https://alotsolutions.in/api/mt/SendSMS",
  ALOT_USER,
  ALOT_PASSWORD,
  SENDER_ID,
  DLT_PEID,
  ALOT_CHANNEL = "TRANS",
  ALOT_DCS_DEFAULT = "0",
  ALOT_FLASH = "0",
  ALOT_ROUTE = "5",
} = process.env;

if (!ALOT_USER || !ALOT_PASSWORD || !SENDER_ID || !DLT_PEID) {
  throw new Error("SMS env config missing: check ALOT_USER/PASSWORD/SENDER_ID/DLT_PEID");
}


function cleanMobile(m) {
  if (!m) return null;
  const d = String(m).replace(/\D/g, "");
  if (d.length === 10) return "91" + d; // India default
  if (d.length === 12 && d.startsWith("91")) return d;
  return d;
}

function isUnicode(text) {
  return /[^\x00-\x7F]/.test(text || "");
}

exports.sendSms = async ({ mobile, message, dltTemplateId }) => {
  const msisdn = cleanMobile(mobile);
  if (!msisdn) throw new Error("Invalid mobile number");

  // 🔍 Log env + input
  console.log("🔧 SMS ENV CONFIG:", {
    ALOT_API_URL,
    ALOT_USER,
    ALOT_PASSWORD: ALOT_PASSWORD ? "***" : undefined,
    SENDER_ID,
    DLT_PEID,
    ALOT_CHANNEL,
    ALOT_ROUTE,
    dltTemplateId,
  });
  console.log("🔧 SMS INPUT:", { mobile, msisdn, messageLen: message.length });

  const smsUrl = `${ALOT_API_URL}?user=${encodeURIComponent(
    ALOT_USER || ""
  )}&password=${encodeURIComponent(
    ALOT_PASSWORD || ""
  )}&senderid=${SENDER_ID || ""}&channel=${ALOT_CHANNEL}&DCS=${
    isUnicode(message) ? "8" : ALOT_DCS_DEFAULT
  }&flashsms=${ALOT_FLASH}&number=${msisdn}&text=${encodeURIComponent(
    message
  )}&route=${ALOT_ROUTE}&DLTTemplateId=${dltTemplateId || ""}&PEID=${DLT_PEID || ""}`;

  console.log("📤 SMS URL:", smsUrl);

  const res = await axios.get(smsUrl, { timeout: 20000 });
  const body =
    typeof res.data === "string" ? res.data : JSON.stringify(res.data);

  console.log("📥 SMS RAW RESPONSE:", body);

  const ok = /success|^1701\b|^000\b/i.test(body);
  if (!ok) throw new Error(`ALOT send failed: ${body}`);

  return body.slice(0, 100);
};
