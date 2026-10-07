const axios = require("axios");

/**
 * Sends CirclePe Houser BRE Status Webhook to client / partner.
 *
 * @param {Object} params
 * @param {string} params.app_id External application ID
 * @param {string} params.lan System Loan Account Number
 * @param {string} params.partner_loan_id Partner Loan ID
 * @param {string} params.customer_name Customer Name
 * @param {number} params.loan_amount Sanctioned Loan Amount
 * @param {string} params.status BRE Approved or BRE Rejected
 * @param {string} params.bre_decision BRE APPROVED or BRE REJECTED
 * @param {Array<string>} [params.reasons] Rejection reasons (if rejected)
 * @param {Object} [params.checks] Details of individual rule checks
 * @returns {Promise<Object|null>}
 */
async function sendCirclePeHouserBREWebhook(params) {
  const {
    app_id,
    lan,
    partner_loan_id,
    customer_name,
    loan_amount,
    status,
    bre_decision,
    reasons = [],
    checks = {},
  } = params;

  const webhookUrl =
    process.env.CIRCLE_PE_HOUSER_BRE_WEBHOOK_URL ||
    process.env.CIRCLE_PE_HOUSER_WEBHOOK_URL;

  if (!webhookUrl) {
    console.warn(
      `⚠️ CIRCLE_PE_HOUSER_BRE_WEBHOOK_URL / CIRCLE_PE_HOUSER_WEBHOOK_URL not configured. Webhook skipped for LAN: ${lan}`,
    );
    return null;
  }

  const isApproved =
    status === "BRE Approved" || bre_decision === "BRE APPROVED";

  const payload = {
    event: isApproved ? "LOAN_BRE_APPROVED" : "LOAN_BRE_REJECTED",
    app_id,
    lan,
    partner_loan_id,
    customer_name,
    loan_amount,
    status,
    decision: bre_decision,
    description: isApproved
      ? "Loan application has successfully passed the BRE criteria. Please call the final loan submit / disbursement API to complete the journey."
      : "Loan application has been rejected by BRE policy checks.",
    next_step: isApproved ? "CALL_FINAL_SUBMIT_API" : "APPLICATION_REJECTED",
    reasons: reasons.length > 0 ? reasons : null,
    checks,
    timestamp: new Date().toISOString(),
  };

  try {
    console.log(
      `🚀 Sending CirclePe Houser BRE webhook for LAN: ${lan} to ${webhookUrl}`,
    );

    const response = await axios.post(webhookUrl, payload, {
      headers: {
        "Content-Type": "application/json",
      },
      timeout: 10000,
    });

    console.log(
      `✅ CirclePe Houser BRE webhook delivered successfully for LAN: ${lan} (HTTP ${response.status})`,
    );

    return {
      success: true,
      statusCode: response.status,
      data: response.data,
    };
  } catch (error) {
    console.error(`❌ CirclePe Houser BRE webhook failed for LAN: ${lan}:`, {
      message: error.message,
      statusCode: error.response?.status || null,
      responseData: error.response?.data || null,
    });

    return {
      success: false,
      error: error.message,
    };
  }
}

module.exports = {
  sendCirclePeHouserBREWebhook,
};
