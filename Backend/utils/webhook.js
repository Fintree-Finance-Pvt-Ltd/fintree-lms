// // Backend/utils/webhook.js
// const axios = require("axios");


// const WEBHOOK_URL = process.env.UTR_WEBHOOK_URL_EMICLUB
// const FINSO_WEBHOOK_URL = process.env.FINSO_WEBHOOK_URL

// /**
//  * Sends webhook notification when loan status changes.
//  * @param {Object} data
//  */
// async function sendLoanWebhook(data) {
//   const payload = {
//     external_ref_no: data.external_ref_no,   // Our Loan ID
//     utr: data.utr,                           // UTR number
//     disbursement_date: data.disbursement_date, // Format: YYYY-MM-DD
//     reference_number: data.reference_number, // System Loan ID (LAN)
//     status: data.status,                     // DISBURSED or REJECTED
//     reject_reason: data.reject_reason || null
//   };

//   try {

//     if (reference_number.startsWith("FINE")){
//       const response = await axios.post(WEBHOOK_URL, payload, {
//       headers: { "Content-Type": "application/json" },
//     });
//     console.log(`✅ Webhook sent successfully for ${data.reference_number}:`, response.data);
//     }

//     else if (reference_number.startsWith("FINS")){
//       const response = await axios.post(FINSO_WEBHOOK_URL, payload, {
//       headers: { "Content-Type": "application/json" },
//     });
//     console.log(`✅ Webhook sent successfully for ${data.reference_number}:`, response.data);
//     }
    
//   } catch (error) {
//     console.error(`❌ Webhook failed for ${data.reference_number}:`, error.message);
//     throw error;
//   }
// }

// module.exports = { sendLoanWebhook };
// // Backend/routes/utrRoutes.js




// Backend/utils/webhook.js
const axios = require("axios");

const WEBHOOK_URL = process.env.UTR_WEBHOOK_URL_EMICLUB;
const FINSO_WEBHOOK_URL = process.env.FINSO_WEBHOOK_URL;
const FINSO_WEBHOOK_USERNAME = process.env.FINSO_WEBHOOK_USERNAME;
const FINSO_WEBHOOK_PASSWORD = process.env.FINSO_WEBHOOK_PASSWORD;

/**
 * Sends webhook notification when loan status changes.
 * @param {Object} data
 */
async function sendLoanWebhook(data) {
  const { external_ref_no, utr, disbursement_date, reference_number, status, reject_reason } = data;

  if (!reference_number) {
    console.error("❌ Missing reference_number in webhook data");
    return;
  }

  const payload = {
    external_ref_no,           // Our Loan ID
    utr,                       // UTR number
    disbursement_date,         // Format: YYYY-MM-DD
    reference_number,          // System Loan ID (LAN)
    status,                    // DISBURSED or REJECTED
    reject_reason: reject_reason || null,
  };

  try {
    const ref = reference_number.toUpperCase();
    let url;
    let config = {
      headers: { "Content-Type": "application/json" },
    };

    if (ref.startsWith("FINE")) {
      url = WEBHOOK_URL;
    } else if (ref.startsWith("FINS")) {
      url = FINSO_WEBHOOK_URL;
      config.auth = {
        username: FINSO_WEBHOOK_USERNAME,
        password: FINSO_WEBHOOK_PASSWORD,
      };
    } else {
      console.warn(`⚠️ Unknown reference prefix for ${reference_number}. Webhook not sent.`);
      return;
    }

    const response = await axios.post(url, payload, config);

    console.log(`✅ Webhook sent successfully for ${reference_number}:`, response.data);
    return response.data;

  } catch (error) {
    console.error(`❌ Webhook failed for ${reference_number}:`, error.message);
    // Optional: Don't throw error to prevent breaking the main process
    // throw error;
  }
}

module.exports = { sendLoanWebhook };
