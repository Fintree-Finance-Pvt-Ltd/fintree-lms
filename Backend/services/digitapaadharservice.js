// services/aadhaarService.js

const axios = require("axios");
const crypto = require("crypto");
const { sendSms } = require("./smsService");
const nodemailer = require("nodemailer");
const { sendAadhaarKycMail } = require("../jobs/mailer");

exports.initAadhaarKyc = async (lan, mobile_number, email_id, customer_name) => {
  try {
    console.log("🚀 Starting Aadhaar INIT for LAN:", lan);

    const randomSuffix = crypto.randomBytes(5).toString("hex");
    const uniqueId = `${lan}_${Date.now()}_${randomSuffix}`;

    const payload = {
      uniqueId,
      redirectionUrl: process.env.AADHAAR_REDIRECT_URL,
      expiryHours: 72,
    };

    const authHeader = Buffer.from(
      `${process.env.DIGITAP_CLIENT_ID}:${process.env.DIGITAP_CLIENT_SECRET}`
    ).toString("base64");

    const response = await axios.post(
      `${process.env.DIGITAP_BASE_URL}/kyc-unified/v1/generate-url/`,
      payload,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${authHeader}`,
        },
      }
    );

    const model = response.data.model;
    const kycUrl = model.shortUrl || model.url;
    const loanName = "Personal Loan";      // dynamic
const validityMinutes = 10; 
    // -------------------------
    // SEND SMS TO CUSTOMER
    // -------------------------
    if (mobile_number) {
      const message = `Dear ${customer_name}, to complete your Aadhaar DigiLocker KYC for ${loanName}, please click ${model.shortUrl || model.url}. This link is valid for ${validityMinutes} minutes. Do not share this link or any OTP with anyone. - Regards Fintree Finance Pvt Ltd.`;
      await sendSms({
        mobile: mobile_number,
        message,
        dltTemplateId: process.env.DLT_TEMPLATE_ID_AADHAAR_KYC,
      });

      console.log("📨 Aadhaar KYC SMS sent to:", mobile_number);
    }

    // 🔹 Send Email (NEW)
    if (email_id) {
      try {
        await sendAadhaarKycMail({
          to: email_id,
          customerName: customer_name,
          lan,
          kycUrl,
        });
        console.log("📧 Aadhaar KYC Email sent:", email_id);
      } catch (mailErr) {
        console.error("❌ Failed to send Aadhaar KYC Email:", mailErr.message);
      }
    }

    return {
      success: true,
      unifiedTransactionId: model.unifiedTransactionId,
      kycUrl: model.url,
      uniqueId,
    };
  } catch (err) {
    console.error("❌ Aadhaar INIT Error:", err.response?.data || err.message);

    return {
      success: false,
      error: err.response?.data || err.message,
    };
  }
};
