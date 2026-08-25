// services/aadhaarService.js
const express = require("express");

const axios = require("axios");
const crypto = require("crypto");
const { sendSms } = require("./smsService");
const nodemailer = require("nodemailer");
const { sendAadhaarKycMail } = require("../jobs/mailer");
const db = require("../config/db");

const router = express.Router();

exports.initAadhaarKyc = async (
  lan,
  mobile_number,
  email_id,
  customer_name,
) => {
  try {
    console.log("🚀 Starting Aadhaar INIT for LAN:", lan);

    const randomSuffix = crypto.randomBytes(5).toString("hex");
    const uniqueId = `${lan}_${Date.now()}_${randomSuffix}`;

    const payload = {
      uniqueId,
      redirectionUrl: process.env.AADHAAR_REDIRECT_URL,
      expiryHours: 72,
    };

    console.log(
      "client and secret id from env",
      process.env.DIGITAP_CLIENT_ID,
      process.env.DIGITAP_CLIENT_SECRET,
    );

    const authHeader = Buffer.from(
      `${process.env.DIGITAP_CLIENT_ID}:${process.env.DIGITAP_CLIENT_SECRET}`,
    ).toString("base64");

    const response = await axios.post(
      `${process.env.DIGITAP_BASE_URL}/kyc-unified/v1/generate-url/`,
      payload,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${authHeader}`,
        },
      },
    );

    console.log("CLIENT ID:", process.env.DIGITAP_CLIENT_ID);
    console.log("CLIENT SECRET EXISTS:", !!process.env.DIGITAP_CLIENT_SECRET);
    console.log("BASE URL:", process.env.DIGITAP_SMS_BASE_URL);

    const model = response.data.model;
    const kycUrl = model.shortUrl || model.url;
    console.log("model", model);
    console.log("kycurl", kycUrl);
    const loanName = "Personal Loan"; // dynamic
    const validityMinutes = 10;
    // -------------------------
    // SEND SMS TO CUSTOMER
    // -------------------------
    // if (mobile_number) {
    //   const message = `Dear ${customer_name}, to complete your Aadhaar DigiLocker KYC for ${loanName}, please click ${model.shortUrl || model.url}. This link is valid for ${validityMinutes} minutes. Do not share this link or any OTP with anyone. - Regards Fintree Finance Pvt Ltd.`;
    //   await sendSms({
    //     mobile: mobile_number,
    //     message,
    //     dltTemplateId: process.env.DLT_TEMPLATE_ID_AADHAAR_KYC,
    //   });

    //   console.log("📨 Aadhaar KYC SMS sent to:", mobile_number);
    // }

    // 🔹 Send Email (NEW)
    console.log("just before email-id");
    if (email_id) {
      console.log("started aadhar kyc mail sending");
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

router.get("/aadhaar/details/:unifiedTransactionId", async (req, res) => {
  try {
    const { unifiedTransactionId } = req.params;
    const { lan } = req.query;

    if (!lan) {
      return res.status(400).json({
        success: false,
        message: "LAN is required",
      });
    }

    if (!unifiedTransactionId) {
      return res.status(400).json({
        success: false,
        message: "unifiedTransactionId is required",
      });
    }

    // ✅ USE SAME CREDENTIALS THAT YOU USE
    // INSIDE initAadhaarKyc()
    const clientId = process.env.DIGITAP_CLIENT_ID;
    const clientSecret = process.env.DIGITAP_CLIENT_SECRET;
    const baseUrl = process.env.DIGITAP_BASE_URL;

    if (!clientId || !clientSecret || !baseUrl) {
      return res.status(500).json({
        success: false,
        message: "Digitap KYC configuration is missing",
      });
    }

    // Basic Base64(client_id:client_secret)
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString(
      "base64",
    );

    const url =
      `${baseUrl}/kyc-unified/v1/` +
      `${encodeURIComponent(unifiedTransactionId)}` +
      `/details/`;

    console.log("=================================");
    console.log("AADHAAR DETAILS TEST API");
    console.log("LAN:", lan);
    console.log("Transaction ID:", unifiedTransactionId);
    console.log("URL:", url);
    console.log("=================================");

    const response = await axios.get(url, {
      headers: {
        Authorization: `Basic ${basicAuth}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      timeout: 30000,
    });

    console.log(
      "AADHAAR DETAILS RESPONSE:",
      JSON.stringify(response.data, null, 2),
    );
    const apiResponse = response.data || {};
    const model = apiResponse.model || null;

    // Save complete raw response
    // without changing aadhaar_status or aadhaar_transaction_id
    if (model) {
      let aadhaarDob = null;

      if (model.dob) {
        const match = String(model.dob)
          .trim()
          .match(/^(\d{2})-(\d{2})-(\d{4})$/);

        if (match) {
          const [, day, month, year] = match;
          aadhaarDob = `${year}-${month}-${day}`;
        }
      }

      const address = model.address || {};

      const aadhaarAddress = [
        address.house,
        address.street,
        address.landmark,
        address.loc,
        address.po,
        address.vtc,
        address.subdist,
        address.dist,
        address.state,
        address.pc,
        address.country,
      ]
        .filter(Boolean)
        .map((value) => String(value).trim())
        .join(", ");

      const [updateResult] = await db.promise().query(
        `UPDATE kyc_verification_status
     SET aadhaar_unique_id = ?,
         aadhaar_name = ?,
         aadhaar_masked_number = ?,
         aadhaar_dob = ?,
         aadhaar_address = ?,
         aadhaar_api_response = ?,
         updated_at = NOW()
     WHERE lan = ?
       AND applicant_type = 'BORROWER'
       AND party_no = 1`,
        [
          model.uniqueid || null,
          model.name || null,
          model.maskedAdharNumber || null,
          aadhaarDob,
          aadhaarAddress || null,

          // Complete vendor response
          JSON.stringify(apiResponse),

          String(lan).trim().toUpperCase(),
        ],
      );

      console.log("AADHAAR DETAILS DB UPDATE:", {
        lan,
        affectedRows: updateResult.affectedRows,
      });
    }

    // ✅ NO DATABASE UPDATE
    // ✅ aadhaar_status NOT UPDATED
    // ✅ aadhaar_transaction_id NOT UPDATED

    return res.status(200).json({
      success: true,
      lan: String(lan).trim().toUpperCase(),
      unifiedTransactionId,
      provider_response: response.data,
    });
  } catch (error) {
    console.error(
      "AADHAAR DETAILS API ERROR:",
      error.response?.data || error.message,
    );

    const providerResponse = error.response?.data || {
      message: error.message,
    };

    try {
      await db.promise().query(
        `UPDATE kyc_verification_status
       SET aadhaar_api_response = ?,
           updated_at = NOW()
       WHERE lan = ?
         AND applicant_type = 'BORROWER'
         AND party_no = 1`,
        [
          JSON.stringify(providerResponse),
          String(req.query.lan || "")
            .trim()
            .toUpperCase(),
        ],
      );
    } catch (dbError) {
      console.error("AADHAAR ERROR RESPONSE DB SAVE FAILED:", dbError);
    }

    return res.status(error.response?.status || 500).json({
      success: false,
      message:
        error.response?.data?.msg ||
        error.response?.data?.message ||
        error.response?.data?.error ||
        error.message ||
        "Failed to fetch Aadhaar details",

      provider_response: providerResponse,
    });
  }
});
exports.router = router;
