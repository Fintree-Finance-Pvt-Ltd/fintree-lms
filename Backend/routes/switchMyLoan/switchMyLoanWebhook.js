const axios = require("axios");

const BASE_URL = "https://web.rapidmoney.in";

function getHeaders() {
  const token = process.env.RAPID_MONEY_WEBHOOK_TOKEN || "y2v8v4e4b1g7f9a3c6e2b4d8f1a7d5e9b2d6g3a8c1f4e7d0f2a1c6e5b1d8f3c5";

  console.log("[SML] Token check:", {
    hasToken: Boolean(token),
    tokenLength: token ? String(token).trim().length : 0,
  });

  if (!token) {
    throw new Error("RAPID_MONEY_WEBHOOK_TOKEN is missing in .env");
  }

  return {
    Authorization: `Bearer ${String(token).trim().replace(/^Bearer\s+/i, "")}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

/**
 * Loan Rejection Webhook
 */
async function sendRejectionWebhook(applicationId) {
  try {
    const url = `${BASE_URL}/api-api/v1/webhooks/fintree/loan-rejected`;

    const requestBody = {
      payload: {
        status: "rejected",
        lead_id: applicationId,
      },
    };

    console.log("[SML] Sending rejection webhook", {
      applicationId,
      url,
    });

    console.log(
      "[SML] Rejection webhook request body:",
      JSON.stringify(requestBody, null, 2),
    );

    const response = await axios.post(url, requestBody, {
      headers: getHeaders(),
    });

    console.log("[SML] Rejection webhook sent successfully", {
      applicationId,
      status: response?.status,
      data: response?.data,
    });

    return response.data;
  } catch (error) {
    console.error("[SML] Rejection webhook failed", {
      applicationId,
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
    });

    return null;
  }
}

/**
 * Loan Disbursement Webhook
 */
async function sendDisbursementWebhook({
  applicationId,
  transactionId,
  disbursementDate,
  repaymentDate,
}) {
  try {
    const url = `${BASE_URL}/api-api/v1/webhooks/fintree/disbursement-status`;

    const requestBody = {
      payload: {
        status: "disbursed",
        lead_id: applicationId,
        transaction_id: transactionId,
        disbursement_date: disbursementDate,
        repayment_date: repaymentDate,
      },
    };

    console.log("[SML] Sending disbursement webhook", {
      applicationId,
      url,
    });

    console.log(
      "[SML] Disbursement webhook request body:",
      JSON.stringify(requestBody, null, 2),
    );

    const response = await axios.post(url, requestBody, {
      headers: getHeaders(),
    });

    console.log("[SML] Disbursement webhook sent successfully", {
      applicationId,
      status: response?.status,
      data: response?.data,
    });

    return response.data;
  } catch (error) {
    console.error("[SML] Disbursement webhook failed", {
      applicationId,
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
    });

    return null;
  }
}

module.exports = {
  sendRejectionWebhook,
  sendDisbursementWebhook,
};