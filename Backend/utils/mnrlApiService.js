const axios = require("axios");
const crypto = require("crypto");
const db = require("../config/db");

const BASE_URL = process.env.DIGITAP_UAT_BASE_URL;

/**
 * Risk decision engine
 */
function deriveDecision(result_code, mobile_status, fri_status, severity) {
  if (result_code === 103) return "CLEAR";

  if (mobile_status === "REVOKED") return "EDD_REQUIRED";

  if (fri_status === "Flagged for reverification") return "REVERIFY";

  if (severity === "Very High Severity") return "BLOCK";

  return "CLEAR";
}

/**
 * Save API response into MySQL
 */
async function saveResult(data, lan, payload) {
  try {
    if (!data) return null;

    const result = data.result || {};
    const revocation = result.revocation_details || {};
    const fri = result.fraud_risk_indicator_details || {};

    const safe = (v) => (v === undefined ? null : v);

    const decision = deriveDecision(
      data.result_code,
      result.mobile_number_status,
      fri.status,
      fri.severity_index
    );

    const insertQuery = `
      INSERT INTO mobile_revocation_lookup_logs (
        lan,
        client_ref_num,
        request_id,
        mobile_number,
        http_response_code,
        result_code,
        message,
        mobile_number_status,
        telecom_service_provider,
        licensed_service_area,
        revocation_date,
        revocation_reason,
        action_taken_post_revocation,
        fri_flagged_date,
        fri_flagged_reason,
        fri_severity_index,
        fri_status,
        distribution_details,
        decision,
        request_payload,
        response_payload
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await db.execute(insertQuery, [
      safe(lan),
      safe(data.client_ref_num),
      safe(data.request_id),
      safe(result.mobile_number),
      safe(data.http_response_code),
      safe(data.result_code),
      safe(data.message),
      safe(result.mobile_number_status),
      safe(result.telecom_service_provider),
      safe(result.licensed_service_area),
      safe(revocation.revocation_date),
      safe(revocation.revocation_reason),
      safe(revocation.action_taken_post_revocation),
      safe(fri.flagged_date),
      safe(fri.flagged_reason),
      safe(fri.severity_index),
      safe(fri.status),
      safe(JSON.stringify(fri.distribution_details || null)),
      safe(decision),
      safe(JSON.stringify(payload)),
      safe(JSON.stringify(data)),
    ]);

    return {
      lan,
      request_id: data.request_id,
      result_code: data.result_code,
      message: data.message,
      mobile_number_status: result.mobile_number_status || null,
      telecom_service_provider: result.telecom_service_provider || null,
      licensed_service_area: result.licensed_service_area || null,
      revocation_reason: revocation.revocation_reason || null,
      revocation_date: revocation.revocation_date || null,
      severity_index: fri.severity_index || null,
      fri_status: fri.status || null,
      decision,
    };

  } catch (err) {
    console.error("DB Save Error:", err.message);
    throw err;
  }
}

/**
 * Main API function
 */
async function mobileRevocationLookup(mobile_number, lan) {
  try {
    if (!mobile_number) {
      throw new Error("Mobile number is required");
    }

    if (!/^(91)?[6-9]\d{9}$/.test(mobile_number)) {
      throw new Error("Invalid mobile number format");
    }

    const client_ref_num = `${lan}_${Date.now()}_${crypto
      .randomBytes(5)
      .toString("hex")}`;

    const payload = {
     mobile: String(mobile_number),
  client_ref_num: String(client_ref_num)
};

    const authHeader = Buffer.from(
      `${process.env.DIGITAP_UAT_CLIENT_ID}:${process.env.DIGITAP_UAT_CLIENT_SECRET}`
    ).toString("base64");

    const response = await axios.post(
      `${BASE_URL}/validation/misc/v1/mobile-revocation-lookup`,
      payload,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${authHeader}`,
        },
        timeout: 30000,
      }
    );


    const parsedResult = await saveResult(
      response.data,
      lan,
      payload
    );

    return parsedResult;
  } catch (error) {
    if (error.response) {
      console.error("Digitap API Error:", error.response.data);

      await db.promise().execute(
        `
        INSERT INTO mobile_revocation_lookup_logs (
          lan,
          mobile_number,
          message,
          response_payload
        )
        VALUES (?, ?, ?, ?)
        `,
        [
          lan,
          mobile_number,
          error.response.data.error || "Digitap API error",
          JSON.stringify(error.response.data),
        ]
      );

      throw new Error(
        error.response.data.error || "Digitap API failed"
      );
    }

    console.error("System Error:", error.message);
    throw error;
  }
}

module.exports = mobileRevocationLookup;