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
  PERFIOS_PAN_URL = "https://hub.perfios.com/api/kyc/v3/pan-profile-detailed",
  PERFIOS_AUTH_KEY, // Perfios x-auth-key, set in .env
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

  try {
    const res = await axios.post(ZOOP_PAN_API_URL, payload, {
      headers: {
        "Content-Type": "application/json",
        "api-key": ZOOP_API_KEY,
        "app-id": ZOOP_APP_ID,
      },
      timeout: 30000,
      validateStatus: () => true,
    });

    const raw = res.data;

    console.log(
      "Zoop response:",
      JSON.stringify(raw, null, 2)
    );

    const httpOk = res.status === 200;

    const apiSuccess =
      raw?.success === true ||
      raw?.status === "success" ||
      raw?.data?.result === "success" ||
      raw?.response_code === "100";

    const success = httpOk && apiSuccess;

    if (!success) {
      console.log("Zoop API failed:", {
        httpStatus: res.status,
        responseCode: raw?.response_code,
        message:
          raw?.response_message ||
          raw?.message ||
          "Unknown Zoop error",
      });
    }

    return {
      success,
      provider: "ZOOP",
      reason: success
        ? "OK"
        : raw?.response_message ||
          raw?.message ||
          "ZOOP_API_FAILURE",

      nameMatch:
        raw?.result?.name_match_score !== undefined
          ? Number(raw.result.name_match_score)
          : null,

      raw,
      response: raw,
      httpStatus: res.status,
    };
  } catch (error) {
    console.error(
      "Zoop request failed:",
      error?.message || error
    );

    return {
      success: false,
      provider: "ZOOP",
      reason: "ZOOP_REQUEST_ERROR",
      nameMatch: null,
      raw: null,
      response: null,
      error: error?.message || "Unknown Zoop error",
    };
  }
}

/**
 * Fallback provider: Perfios
 * Request:
 *  POST https://hub.perfios.com/api/kyc/v3/pan-profile-detailed
 *  Headers:
 *    x-auth-key: <PERFIOS_AUTH_KEY>
 *    Content-Type: application/json
 *  Body:
 *    { "pan": "BHHPL9968H", "name": "harish lodh", "consent": "Y", "clientData": { "caseId": "..." } }
 */
async function callPerfiosPan(panNumber, panHolderName) {
  if (!PERFIOS_PAN_URL || !PERFIOS_AUTH_KEY) {
    throw new Error("PERFIOS PAN env config missing");
  }

  const payload = {
    pan: panNumber.toUpperCase(),
    name: panHolderName,
    consent: "Y",
    clientData: {
      caseId: uuidv4(),
    },
  };

  const res = await axios.post(PERFIOS_PAN_URL, payload, {
    headers: {
      "Content-Type": "application/json",
      "x-auth-key": PERFIOS_AUTH_KEY,
    },
    timeout: 30000,
    validateStatus: () => true,
  });

  const raw = res.data;
  const result = raw?.result;

  console.log("Perfios response:", JSON.stringify(raw, null, 2));

  // Perfios statusCode 101 = successful fetch; PAN must also be Active
  const panActive = String(result?.status || "").toLowerCase() === "active";
  const success =
    res.status === 200 &&
    Number(raw?.statusCode) === 101 &&
    !!result &&
    panActive;

  // Name match comes back in result.profileMatch[] as { parameter: "name", matchScore, matchResult }
  const nameProfile = Array.isArray(result?.profileMatch)
    ? result.profileMatch.find((p) => p?.parameter === "name")
    : null;

  let nameMatch = null;
  if (nameProfile && typeof nameProfile.matchResult === "boolean") {
    nameMatch = nameProfile.matchResult;
  } else {
    const respName = normalizeName(result?.name);
    const inputName = normalizeName(panHolderName);
    if (respName && inputName) {
      nameMatch =
        respName === inputName ||
        respName.includes(inputName) ||
        inputName.includes(respName);
    }
  }

  let reason = "OK";
  if (!success) {
    reason =
      result && !panActive
        ? `PAN_STATUS_${String(result?.status || "UNKNOWN").toUpperCase()}`
        : raw?.message || raw?.error || "PERFIOS_API_FAILURE";
  }

  return {
    success,
    provider: "PERFIOS",
    reason,
    nameMatch,
    nameMatchScore:
      nameProfile?.matchScore !== undefined
        ? Number(nameProfile.matchScore)
        : null,
    raw,
    response: raw,
    httpStatus: res.status,
  };
}

/**
 * Unified helper used by Helium Validation Engine
 * Returns:
 * {
 *   success: boolean,
 *   provider: "ZOOP"|"PERFIOS"|null,
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

  // 2️⃣ Fallback to Perfios
  try {
    const perfiosResult = await callPerfiosPan(panNumber, panHolderName);
    console.log("perfiosresult", perfiosResult);
    if (perfiosResult.success) {
      console.log("✅ PAN verified via PERFIOS");
    } else {
      console.warn("⚠️ Perfios PAN did not succeed:", perfiosResult.reason);
    }
    return perfiosResult;
  } catch (err) {
    console.error(
      "❌ Perfios PAN error:",
      err?.response?.data || err.message || err
    );
    return {
      success: false,
      provider: "PERFIOS",
      reason: "PERFIOS_ERROR",
      nameMatch: null,
      raw: err?.response?.data || { error: err.message || String(err) },
      response: err?.response?.data || { error: err.message || String(err) },
    };
  }
}

module.exports = {
  getPanCardDetails,
  callZoopPan,
  callPerfiosPan,
};
