const axios = require("axios");

const BASE_URL = "https://web.rapidmoney.in";

const headers = {
  Authorization: `Bearer ${process.env.RAPID_MONEY_WEBHOOK_TOKEN}`,
  "Content-Type": "application/json",
};

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

    const response = await axios.post(url, requestBody, { headers });

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

    const response = await axios.post(url, requestBody, { headers });

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