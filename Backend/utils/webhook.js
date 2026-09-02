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




// // Backend/utils/webhook.js
// const axios = require("axios");

// const WEBHOOK_URL = process.env.UTR_WEBHOOK_URL_EMICLUB;
// const LOAN_DIGIT_WEBHOOK_URL = process.env.LOAN_DIGIT_WEBHOOK_URL;
// const FINSO_WEBHOOK_URL = process.env.FINSO_WEBHOOK_URL;
// // You can keep this hardcoded, or move it to env.
// const CAREPAY_WEBHOOK_URL = process.env.CAREPAY_WEBHOOK_URL;
// const STERLION_WEBHOOK_URL = process.env.STERLION_WEBHOOK_URL;
// const FINSO_WEBHOOK_USERNAME = process.env.FINSO_WEBHOOK_USERNAME;
// const FINSO_WEBHOOK_PASSWORD = process.env.FINSO_WEBHOOK_PASSWORD;

// /**
//  * Sends webhook notification when loan status changes.
//  * @param {Object} data
//  */
// async function sendLoanWebhook(data) {
//   const { external_ref_no, utr, disbursement_date, reference_number, status, reject_reason } = data;

//   console.log("sending webhook to emiclub");
//   if (!reference_number) {
//     console.error("❌ Missing reference_number in webhook data");
//     return;
//   }

//   const payload = {
//     external_ref_no,           // Our Loan ID
//     utr,                       // UTR number
//     disbursement_date,         // Format: YYYY-MM-DD
//     reference_number,          // System Loan ID (LAN)
//     status,                    // DISBURSED or REJECTED
//     reject_reason: reject_reason || null,
//   };

//   try {
//     const ref = reference_number.toUpperCase();
//     let url;
//     let config = {
//       headers: { "Content-Type": "application/json" },
//     };

//     if (ref.startsWith("FINE")) {
//       url = WEBHOOK_URL;
//     } else if (ref.startsWith("LDF")) {
//       url = LOAN_DIGIT_WEBHOOK_URL;
//        } else if (ref.startsWith("CARE")) {
//       url = CAREPAY_WEBHOOK_URL;
//     } else if (ref.startsWith("STRL")) {
//       url = STERLION_WEBHOOK_URL;
//     } else if (ref.startsWith("FINS")) {
//       url = FINSO_WEBHOOK_URL;
//       // config.auth = {
//       //   username: FINSO_WEBHOOK_USERNAME,
//       //   password: FINSO_WEBHOOK_PASSWORD,
//       // };
//     } else {
//       console.warn(`⚠️ Unknown reference prefix for ${reference_number}. Webhook not sent.`);
//       return;
//     }

//     const response = await axios.post(url, payload, config);

//     console.log(`✅ Webhook sent successfully for ${reference_number}:`, response.data);
//     return response.data;

//   } catch (error) {
//     console.error(`❌ Webhook failed for ${reference_number}:`, error.message);
//     // Optional: Don't throw error to prevent breaking the main process
//     // throw error;
//   }
// }

// module.exports = { sendLoanWebhook };



/////////////////// 
// Backend/utils/webhook.js
const axios = require("axios");

const WEBHOOK_URL = process.env.UTR_WEBHOOK_URL_EMICLUB;
const LOAN_DIGIT_WEBHOOK_URL = process.env.LOAN_DIGIT_WEBHOOK_URL;
const FINSO_WEBHOOK_URL = process.env.FINSO_WEBHOOK_URL;
const CAREPAY_WEBHOOK_URL = process.env.CAREPAY_WEBHOOK_URL;
const STERLION_WEBHOOK_URL = process.env.STERLION_WEBHOOK_URL;
const YAMONEY_WEBHOOK_URL = process.env.YAMONEY_DISBURSEMENT_WEBHOOK_URL;

const FINSO_WEBHOOK_USERNAME = process.env.FINSO_WEBHOOK_USERNAME;
const FINSO_WEBHOOK_PASSWORD = process.env.FINSO_WEBHOOK_PASSWORD;

// circlepe houser webhook url
const CIRCLE_PE_HOUSER_WEBHOOK_URL = process.env.CIRCLE_PE_HOUSER_WEBHOOK_URL;

/**
 * Sends webhook notification when loan status changes.
 *
 * @param {Object} data
 * @returns {Promise<*>}
 */
async function sendLoanWebhook(data) {
  const {
    external_ref_no,
    utr,
    disbursement_date,
    reference_number,
    status,
    reject_reason,
    finalDisbursedAmount,
  } = data;

  if (!reference_number) {
    console.error("❌ Missing reference_number in webhook data");
    return;
  }

  const payload = {
    external_ref_no,
    utr,
    disbursement_date,
    reference_number,
    status,
    reject_reason: reject_reason || null,
  };

  try {
    const ref = String(reference_number).trim().toUpperCase();

    let url;

    const config = {
      headers: {
        "Content-Type": "application/json",
      },
    };

    if (ref.startsWith("FINE")) {
      url = WEBHOOK_URL;
    } else if (
      ref.startsWith("LDF") ||
      ref.startsWith("LDG") ||
      ref.startsWith("LDD")
    ) {
      url = LOAN_DIGIT_WEBHOOK_URL;
    } else if (ref.startsWith("CARE")) {
      url = CAREPAY_WEBHOOK_URL;

      const rawFinalDisbursedAmount = finalDisbursedAmount;
      const parsedFinalDisbursedAmount = Number(
        rawFinalDisbursedAmount,
      );

      if (
        rawFinalDisbursedAmount === null ||
        rawFinalDisbursedAmount === undefined ||
        String(rawFinalDisbursedAmount).trim() === "" ||
        !Number.isFinite(parsedFinalDisbursedAmount) ||
        parsedFinalDisbursedAmount <= 0
      ) {
        console.error(
          `❌ Missing or invalid finalDisbursedAmount for CarePay loan ${reference_number}`,
          {
            finalDisbursedAmount: rawFinalDisbursedAmount,
          },
        );

        return;
      }

      // Only CarePay receives this additional field.
      payload.finalDisbursedAmount =
        parsedFinalDisbursedAmount;
    } else if (ref.startsWith("STRL")) {
      url = STERLION_WEBHOOK_URL;
    } else if (ref.startsWith("FINS")) {
      url = FINSO_WEBHOOK_URL;
    } else if (ref.startsWith("YAM")) {
      url = YAMONEY_WEBHOOK_URL;
    } else if (ref.startsWith("CIRHUF")) {
      url = CIRCLE_PE_HOUSER_WEBHOOK_URL;

      // Enable this when Finso basic authentication is required.
      // config.auth = {
      //   username: FINSO_WEBHOOK_USERNAME,
      //   password: FINSO_WEBHOOK_PASSWORD,
      // };
    } else {
      console.warn(
        `⚠️ Unknown reference prefix for ${reference_number}. Webhook not sent.`,
      );

      return;
    }

    if (!url) {
      console.error(
        `❌ Webhook URL is not configured for ${reference_number}`,
      );

      return;
    }

    console.log(`Sending webhook for ${reference_number}`, {
      url,
      payload,
    });

    const response = await axios.post(url, payload, config);

    console.log(
      `✅ Webhook sent successfully for ${reference_number}:`,
      response.data,
    );

    return response.data;
  } catch (error) {
    console.error(
      `❌ Webhook failed for ${reference_number}:`,
      {
        message: error.message,
        responseStatus: error.response?.status || null,
        responseData: error.response?.data || null,
      },
    );

    // The error is not thrown, so webhook failure will not
    // interrupt the main disbursement process.
    return;
  }
}

module.exports = { sendLoanWebhook };
