const axios = require("axios");

const BASE_URL = "https://uat.rapidmoney.in";

const headers = {
  Authorization: `Bearer ${process.env.RAPID_MONEY_WEBHOOK_TOKEN}`,
  "Content-Type": "application/json"
};


/**
 * Loan Rejection Webhook
 */
async function sendRejectionWebhook(applicationId) {

  try {

    const response = await axios.post(
      `${BASE_URL}/api-api/v1/webhooks/fintree/loan-rejected`,
      {
        payload: {
          status: "Rejected",
          lead_id: applicationId
        }
      },
      { headers }
    );

    return response.data;

  } catch (error) {

    console.error("Rejection webhook failed:", error.message);

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
  repaymentDate
}) {

  try {

    const response = await axios.post(
      `${BASE_URL}/api-api/v1/webhooks/fintree/disbursement-status`,
      {
        payload: {
          status: "Disbursed",
          lead_id: applicationId,
          transaction_id: transactionId,
          disbursement_date: disbursementDate,
          repayment_date: repaymentDate
        }
      },
      { headers }
    );

    return response.data;

  } catch (error) {

    console.error("Disbursement webhook failed:", error.message);

    return null;
  }
}


module.exports = {
  sendRejectionWebhook,
  sendDisbursementWebhook
};