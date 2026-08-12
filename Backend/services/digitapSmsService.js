// services/digitapEmailService.js

const axios = require("axios");
const crypto = require("crypto");

exports.initEmailKyc = async (
  lan,
  mobile_number,
  email_id,
  customer_name
) => {
  try {
    console.log("🚀 Starting Email KYC INIT for LAN:", lan);

    const randomSuffix = crypto.randomBytes(5).toString("hex");
    const uid = `${lan}_${Date.now()}_${randomSuffix}`;

    const payload = {
      serviceId: "4",
      isSendOtp: true,
      mobile: mobile_number,
      emailId: email_id,
      uid,
      redirectionUrl: process.env.AADHAAR_REDIRECT_URL,
    };

    console.log(
      "client id from env",
      process.env.DIGITAP_SMS_CLIENT_ID
    );

    // Base64 encode client_id:client_secret
    const authHeader = Buffer.from(
      `${process.env.DIGITAP_SMS_CLIENT_ID}:${process.env.DIGITAP_SMS_CLIENT_SECRET}`
    ).toString("base64");

    const response = await axios.post(
      `${process.env.DIGITAP_SMS_BASE_URL}/ent/v1/kyc/generate-url`,
      payload,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader,
        },
      }
    );

    const model = response.data.model;

    console.log("model", model);

    return {
      success: true,
      kycUrl: model?.shortUrl || model?.url,
      uid,
    };
  } catch (err) {
    console.error(
      "❌ Email KYC INIT Error:",
      err.response?.data || err.message
    );

    return {
      success: false,
      error: err.response?.data || err.message,
    };
  }
};
