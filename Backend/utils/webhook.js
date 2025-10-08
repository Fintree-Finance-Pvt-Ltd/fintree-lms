// Backend/utils/webhook.js
const axios = require("axios");


const WEBHOOK_URL = process.env.UTR_WEBHOOK_URL_EMICLUB || "https://your-webhook-url-here.com/api/utr";

/**
 * Sends webhook notification when loan status changes.
 * @param {Object} data
 */
async function sendLoanWebhook(data) {
  const payload = {
    external_ref_no: data.external_ref_no,   // Our Loan ID
    utr: data.utr,                           // UTR number
    disbursement_date: data.disbursement_date, // Format: YYYY-MM-DD
    reference_number: data.reference_number, // System Loan ID (LAN)
    status: data.status,                     // DISBURSED or REJECTED
    reject_reason: data.reject_reason || null
  };

  try {
    const response = await axios.post(WEBHOOK_URL, payload, {
      headers: { "Content-Type": "application/json" },
    });
    console.log(`✅ Webhook sent successfully for ${data.reference_number}:`, response.data);
  } catch (error) {
    console.error(`❌ Webhook failed for ${data.reference_number}:`, error.message);
    throw error;
  }
}

module.exports = { sendLoanWebhook };
// Backend/routes/utrRoutes.js