// services/ckycDownloadService.js
//
// Thin client for the third-party CKYC search + OTP-download APIs
// documented in routes/switchMyLoan/befiscckycresponse.txt. Base URL
// is a placeholder (CKYC_BUREAU_BASE_URL) pending the real host; auth
// uses x-api-key / x-client-id headers (CKYC_BUREAU_API_KEY /
// CKYC_BUREAU_CLIENT_ID) as confirmed by the vendor.
//
// Flow: search (PAN + DOB + mobile) -> ckycReferenceId -> send-otp
// (that reference + mobile) -> OTP -> verify-otp (requestId from
// send-otp's response + OTP) -> full CKYC profile.

const axios = require("axios");

const CKYC_BUREAU_BASE_URL = process.env.CKYC_BUREAU_BASE_URL || "";
const CKYC_BUREAU_API_KEY = process.env.CKYC_BUREAU_API_KEY || "";
const CKYC_BUREAU_CLIENT_ID = process.env.CKYC_BUREAU_CLIENT_ID || "";

const CKYC_CONSENT_TEXT =
  "We confirm obtaining valid customer consent to access/process their ckyc data. Consent remains valid, informed, and unwithdrawn.";

function authHeaders() {
  return {
    "x-api-key": CKYC_BUREAU_API_KEY,
    "x-client-id": CKYC_BUREAU_CLIENT_ID,
    "Content-Type": "application/json",
  };
}

async function searchCkyc({ pan_number, dob, mobile_number }) {
  const response = await axios.post(
    `${CKYC_BUREAU_BASE_URL}/api/v1/ckyc/search`,
    {
      idType: "PAN",
      idNumber: pan_number,
      dob,
      mobileNumber: mobile_number,
      consent: "Y",
      consentText: CKYC_CONSENT_TEXT,
    },
    { headers: authHeaders(), timeout: 30000 },
  );
  return response.data;
}

async function sendCkycOtp({ ckyc_reference_id, mobile_number }) {
  const response = await axios.post(
    `${CKYC_BUREAU_BASE_URL}/api/v1/ckyc/download/send-otp`,
    {
      ckycNo: ckyc_reference_id,
      authFactorType: "MOBILE",
      authFactor: mobile_number,
      consent: "Y",
      consentText: CKYC_CONSENT_TEXT,
    },
    { headers: authHeaders(), timeout: 30000 },
  );
  return response.data;
}

async function verifyCkycOtp({ request_id, otp }) {
  const response = await axios.post(
    `${CKYC_BUREAU_BASE_URL}/api/v1/ckyc/download/verify-otp`,
    {
      requestId: request_id,
      otp,
      consent: "Y",
      consentText: CKYC_CONSENT_TEXT,
    },
    { headers: authHeaders(), timeout: 30000 },
  );
  return response.data;
}

module.exports = {
  searchCkyc,
  sendCkycOtp,
  verifyCkycOtp,
};
