const db = require("../../config/db");
const express = require("express");
const verifyApiKey = require("../../middleware/apiKeyAuth");
const initAadhaarKyc = require("../../services/digitapaadharservice");
const { getPanCardDetails } = require("../../services/pancardapiservice");
const router = express.Router();


const generateLoanIdentifiers = async (lender) => {
  let prefixLan = "ZBDLR";
  let applicationPrefix = "ZBDLRAPP";
  let custPrefixLan = "ZBCL";
  let custPartnerLoanId = "ZBCFL";

  const [rows] = await db
    .promise()
    .query(
      "SELECT last_sequence FROM loan_sequences WHERE lender_name=? FOR UPDATE",
      [lender],
    );

  let newSequence;

  if (rows.length > 0) {
    newSequence = rows[0].last_sequence + 1;

    await db
      .promise()
      .query("UPDATE loan_sequences SET last_sequence=? WHERE lender_name=?", [
        newSequence,
        lender,
      ]);
  } else {
    newSequence = 11000;

    await db
      .promise()
      .query(
        "INSERT INTO loan_sequences (lender_name,last_sequence) VALUES (?,?)",
        [lender, newSequence],
      );
  }

  return {
    application_id: `${applicationPrefix}${newSequence}`,
    lan: `${prefixLan}${newSequence}`,
    cust_lan: `${custPrefixLan}${newSequence}`,
    cust_partner_loan_id: `${custPartnerLoanId}${newSequence}`,
  };
};

router.post("/dealer/create", verifyApiKey, async (req, res) => {
  const conn = await db.promise().getConnection();

  try {
    const data = req.body;

    // 1️⃣ Generate internal IDs
    const { lan, application_id } = await generateLoanIdentifiers("ZEBRS_DEALER");

    await conn.beginTransaction();

    // 2️⃣ Insert dealer details
    const dealerQuery = `
      INSERT INTO zebrs_dealer_booking
      (
        application_id, lan, dealer_id,
        business_name, trade_name, business_type,
        pan_number, gst_number,
        owner_name, owner_mobile, owner_email,
        showroom_address, city, state, pincode,
        bank_name, branch_name, account_holder_name, account_number, ifsc_code,
        cheque_ocr_bank_name, cheque_ocr_branch_name,
        cheque_ocr_account_holder_name, cheque_ocr_account_number,
        cheque_ocr_ifsc_code,
        cheque_uploaded_at,
        status, created_at, login_date
      )
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW(),'ACTIVE',NOW(),CURDATE())
    `;

    const dealerValues = [
      application_id,
      lan,
      lan,

      data.business_name,
      data.trade_name || null,
      data.business_type,

      data.pan_number,
      data.gst_number,

      data.owner_name,
      data.owner_mobile,
      data.owner_email || null,

      data.showroom_address,
      data.city,
      data.state,
      data.pincode,

      data.bank_name,
      data.branch_name?.trim() || null,
      data.account_holder_name,
      data.account_number,
      data.ifsc_code,

      data.cheque_ocr_bank_name || null,
      data.cheque_ocr_branch_name || null,
      data.cheque_ocr_account_holder_name || null,
      data.cheque_ocr_account_number || null,
      data.cheque_ocr_ifsc_code || null,
    ];

    await conn.query(dealerQuery, dealerValues);

    // 3️⃣ Insert products if provided
    if (data.products && data.products.length > 0) {
      const productQuery = `
        INSERT INTO zebrs_dealer_products
        (application_id, battery_type, battery_name, e_rickshaw_model, e_rickshaw_model_price)
        VALUES ?
      `;

      const productValues = data.products.map((p) => [
        application_id,
        p.battery_type || null,
        p.battery_name || null,
        p.e_rickshaw_model || null,
        p.price || null,
      ]);

      await conn.query(productQuery, [productValues]);
    }

    if (data.oem && data.oem.length > 0) {
      const oemQuery = `INSERT INTO zebrs_oem_details ( application_id, oem_name, vehicle_type, vehicle_model, variant, battery_type, price) VALUES ?`;

      const oemValues = data.oem.map((o) => [
        application_id,
        o.oem_name || null,
        o.vehicle_type || null,
        o.vehicle_model || null,
        o.variant || null,
        o.battery_type || null,
        o.price || null,
      ]);
      await conn.query(oemQuery, [oemValues]);
    }

    await conn.commit();

    res.json({
      message: "Zebrs dealer + products created successfully",
      lan: lan,
      application_id: application_id,
    });
  } catch (err) {
    await conn.rollback();
    console.error("Zebrs Dealer Creation Error:", err);

    res.status(500).json({
      message: "Zebrs dealer creation failed",
      error: err.message,
    });
  } finally {
    conn.release();
  }
});




router.post("/generate-aadhaar-kyc-url",verifyApiKey, async (req, res) => {
  try {
    const { lan, mobile_number, email_id, customer_name } = req.body;
    console.log("Received request to generate Aadhaar KYC URL for LAN:", lan);

    const [loanRows] = await db.promise().query(
      "SELECT * FROM loan_booking_zebrs WHERE lan = ?",
      [lan]
    );

    if (loanRows.length === 0) {
      console.log("❌ Loan not found. Cannot validate.");
      return;
    }

    const loan = loanRows[0];

    await db.promise().query(
      "INSERT IGNORE INTO kyc_verification_status (lan) VALUES (?)",
      [lan],
    );

    await db.promise().query(
      "UPDATE kyc_verification_status SET aadhaar_status='INITIATED' WHERE lan=?",
      [lan]
    );

    const kycUrl = await initAadhaarKyc(lan, mobile_number, email_id, customer_name);

    if (!kycUrl) {
      console.error("Failed to generate Aadhaar KYC URL for LAN:", lan);
      return res.status(500).json({ error: "Failed to generate Aadhaar KYC URL" });
    }

     if (kycUrl) {
      await db.promise().query(
        `UPDATE kyc_verification_status 
         SET aadhaar_transaction_id=?, aadhaar_kyc_url=?, aadhaar_unique_id=? 
         WHERE lan=?`,
        [
          kycUrl.unifiedTransactionId,
          kycUrl.kycUrl,
          kycUrl.uniqueId,
          lan,
        ]
      );
    }
    
    console.log("Successfully generated Aadhaar KYC URL for LAN:", lan, "URL:", kycUrl.kycUrl);
    res.json({ kycUrl: kycUrl.kycUrl });
  } catch (error) {
    console.error("Error generating Aadhaar KYC URL:", error.message);
    res.status(500).json({ error: "Failed to generate Aadhaar KYC URL" });
  }
});

// pan verification

router.post("/pan-verify", verifyApiKey, async (req, res) => {
    try {
        const { lan, pan_number, customer_name } = req.body;
        console.log("Received request to verify PAN number:", pan_number);

         const [loanRows] = await db.promise().query(
      "SELECT * FROM loan_booking_zebrs WHERE lan = ?",
      [lan]
    );

    if (loanRows.length === 0) {
      console.log("❌ Loan not found. Cannot validate.");
      return;
    }

    const loan = loanRows[0];

          await db.promise().query(
      "INSERT IGNORE INTO kyc_verification_status (lan) VALUES (?)",
      [lan],
    );
    await db.promise().query(
      "UPDATE kyc_verification_status SET pan_status='INITIATED' WHERE lan=?",
      [lan]
    );
        const panDetails = await getPanCardDetails(pan_number, customer_name);

        await db.promise().query(
      "UPDATE kyc_verification_status SET pan_status=?, pan_api_response=? WHERE lan=?",
      [
        // panDetails.success ? "VERIFIED" : "FAILED",
        panDetails.success ? "VERIFIED" : "FAILED",
        JSON.stringify(panDetails.response || {}),
        lan,
      ]
    );
          console.log("Successfully verified PAN number for LAN:", lan, "PAN:", pan_number, "Result:", panDetails);
        res.json({ panDetails: panDetails });
    } catch (error) {
        console.error("Error verifying PAN number:", error.message);
        res.status(500).json({ error: "Failed to verify PAN number" });
    }
});

router.post("/esign-initiate", verifyApiKey, async (req, res) => {
    try {
        const { lan, mobile_number, email_id, customer_name } = req.body;
    } catch (error) {        console.error("Error initiating eSign:", error.message);
        res.status(500).json({ error: "Failed to initiate eSign" });
    }
});

// "/:lan/esign/:type" for esign


module.exports = router;

