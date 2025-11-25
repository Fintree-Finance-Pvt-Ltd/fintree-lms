// const axios = require("axios");
// const { v4: uuidv4 } = require("uuid");

// const getPanCardDetails = async (panNumber, panHolderName) => {
//   try {
//     if (!panNumber || !panHolderName) {
//       return {
//         success: false,
//         message: "PAN number or name missing",
//       };
//     }

//     const payload = {
//       mode: "sync",
//       data: {
//         customer_pan_number: panNumber.toUpperCase(),
//         pan_holder_name: panHolderName.toUpperCase(),
//         consent: "Y",
//         consent_text:
//           "I hereby declare my consent agreement for fetching my information via ZOOP API",
//       },
//       task_id: uuidv4(),
//     };

//     const zoopresponse = await axios.post(
//       process.env.ZOOP_PAN_API_URL,
//       payload,
//       {
//         headers: {
//           "Content-Type": "application/json",
//           "api-key": process.env.ZOOP_API_KEY,
//           app_id: process.env.ZOOP_APP_ID,
//         },
//       }
//     );

   

//     const result = zoopresponse.data;

//     // Determine verification status based on Zoop response
//     const isVerified =
//       result?.result?.extra_fields?.is_pan_verified === "yes" ||
//       result?.result?.isValid === true;

//     return {
//       success: isVerified,
//       response: result,
//     };
//   } catch (error) {
//     console.error("❌ PAN Verification Error:", error.response?.data || error.message);

//     return {
//       success: false,
//       response: error.response?.data || error.message,
//     };
//   }
// };

// module.exports = {
//   getPanCardDetails,
// };


// services/pancardapiservice.js

const axios = require("axios");
const { v4: uuidv4 } = require("uuid");

const {
  ZOOP_PAN_API_URL,
  ZOOP_API_KEY,
  ZOOP_APP_ID,
  FINANALYZ_PAN_URL = "https://aasandbox.finanalyz.com/eKyc/pan-Details",
  FINANALYZ_X_API_KEY, // put your sandbox XApiKey here in .env
} = process.env;

// Normalize name for comparison
function normalizeName(name) {
  if (!name) return "";
  return String(name)
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Primary provider: ZOOP
 */
async function callZoopPan(panNumber, panHolderName) {
  if (!ZOOP_PAN_API_URL || !ZOOP_API_KEY || !ZOOP_APP_ID) {
    throw new Error("ZOOP PAN env config missing");
  }

  const payload = {
    mode: "sync",
    data: {
      customer_pan_number: panNumber.toUpperCase(),
      pan_holder_name: panHolderName.toUpperCase(),
      consent: "Y",
      consent_text:
        "I hereby declare my consent agreement for fetching my information via ZOOP API",
    },
    task_id: uuidv4(),
  };

  const res = await axios.post(ZOOP_PAN_API_URL, payload, {
    headers: {
      "Content-Type": "application/json",
      "api-key": ZOOP_API_KEY,
      app_id: ZOOP_APP_ID,
    },
    timeout: 30000,
    validateStatus: () => true,
  });

  // You may need to adjust this depending on Zoop's actual response structure
  // For now we assume HTTP 200 and some `success` flag in data
  const raw = res.data;
  const httpOk = res.status === 200;
  const apiSuccess =
    raw?.success === true ||
    raw?.status === "success" ||
    raw?.data?.result === "success";

  const success = httpOk && apiSuccess;

  // If Zoop returns name data, you can map & compare, but since we don't
  // have an example here, we'll keep nameMatch as null.
  return {
    success,
    provider: "ZOOP",
    reason: success ? "OK" : "ZOOP_API_FAILURE",
    nameMatch: null,
    raw,
    response: raw,
  };
}

/**
 * Fallback provider: Finanalyz
 * Request:
 *  POST https://aasandbox.finanalyz.com/eKyc/pan-Details
 *  Headers:
 *    XApiKey: <FINANALYZ_X_API_KEY>
 *    Content-Type: application/json
 *  Body:
 *    { "panNumber": "BORPJ7852J" }
 */
async function callFinanalyzPan(panNumber, panHolderName) {
  if (!FINANALYZ_PAN_URL || !FINANALYZ_X_API_KEY) {
    throw new Error("FINANALYZ PAN env config missing");
  }

  const payload = {
    panNumber: panNumber.toUpperCase(),
  };

  const res = await axios.post(FINANALYZ_PAN_URL, payload, {
    headers: {
      "Content-Type": "application/json",
      accept: "*/*",
      XApiKey: FINANALYZ_X_API_KEY,
    },
    timeout: 30000,
    validateStatus: () => true,
  });

  const raw = res.data;
  const code = raw?.data?.response?.code;
  const isValid = raw?.data?.response?.isValid === true;
  const success = code === 200 && isValid;

  // name match based on Finanalyz response.name
  const respName = normalizeName(raw?.data?.response?.name);
  const inputName = normalizeName(panHolderName);
  let nameMatch = null;
  if (respName && inputName) {
    // simple contains or equality check
    nameMatch =
      respName === inputName ||
      respName.includes(inputName) ||
      inputName.includes(respName);
  }

  return {
    success,
    provider: "FINANALYZ",
    reason: success ? "OK" : "FINANALYZ_API_FAILURE",
    nameMatch,
    raw,
    response: raw,
  };
}

/**
 * Unified helper used by Helium Validation Engine
 * Returns:
 * {
 *   success: boolean,
 *   provider: "ZOOP"|"FINANALYZ"|null,
 *   reason: string,
 *   nameMatch: boolean|null,
 *   raw: any
 * }
 */
async function getPanCardDetails(panNumber, panHolderName) {
  if (!panNumber || !panHolderName) {
    return {
      success: false,
      provider: null,
      reason: "MISSING_FIELDS",
      nameMatch: null,
      raw: null,
    };
  }

  // 1️⃣ Try Zoop first
  try {
    const zoopResult = await callZoopPan(panNumber, panHolderName);
    console.log("zoopresult", zoopResult);
    if (zoopResult.success) {
      console.log("✅ PAN verified via ZOOP");
      return zoopResult;
    }
    console.warn("⚠️ Zoop PAN check did not succeed, falling back:", zoopResult.reason);
  } catch (err) {
    console.error(
      "❌ Zoop PAN error:",
      err?.response?.data || err.message || err
    );
  }

  // 2️⃣ Fallback to Finanalyz
  try {
    const finResult = await callFinanalyzPan(panNumber, panHolderName);
    console.log("finresult", finResult);
    if (finResult.success) {
      console.log("✅ PAN verified via FINANALYZ");
    } else {
      console.warn("⚠️ Finanalyz PAN did not succeed:", finResult.reason);
    }
    return finResult;
  } catch (err) {
    console.error(
      "❌ Finanalyz PAN error:",
      err?.response?.data || err.message || err
    );
    return {
      success: false,
      provider: "FINANALYZ",
      reason: "FINANALYZ_ERROR",
      nameMatch: null,
      raw: err?.response?.data || { error: err.message || String(err) },
      response: err?.response?.data || { error: err.message || String(err) },
    };
  }
}

module.exports = {
  getPanCardDetails,
};
