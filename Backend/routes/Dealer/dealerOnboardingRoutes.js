const express = require("express");
const db = require("../../config/db");
const { runDealerValidations } = require("../../services/dealerValidationEngine");
const verifyApiKey = require("../../middleware/apiKeyAuth");

const router = express.Router();

/**
 * ✅ Dealer LAN generator (transaction safe)
 */
const generateDealerLan = async (conn) => {
  const [rows] = await conn.query(
    "SELECT last_sequence FROM loan_sequences WHERE lender_name='DEALER' FOR UPDATE"
  );

  let seq;
  if (rows.length) {
    seq = rows[0].last_sequence + 1;
    await conn.query(
      "UPDATE loan_sequences SET last_sequence=? WHERE lender_name='DEALER'",
      [seq]
    );
  } else {
    seq = 50001;
    await conn.query(
      "INSERT INTO loan_sequences (lender_name,last_sequence) VALUES ('DEALER',?)",
      [seq]
    );
  }

  return `DLR${seq}`;
};

router.post("/v1/dealer/onboard", verifyApiKey, async (req, res) => {
  const conn = await db.promise().getConnection();
  try {
    const data = req.body;

    // 1️⃣ Required fields validation
    const required = [
  "login_date",
  "first_name",
  "last_name",
  "dealer_type",
  "dob",
  "gender",
  "father_name",
  "pan_number",
  "pan_name",
  "Dealer_aadhar_number",
  "business_pan_number",
  "business_pan_name",
  "business_name",

  // current address
  "current_address",
  "current_village_city",
  "current_state",
  "current_pincode",

  // shop address
  "shop_address",
  "shop_city",
  "shop_state",
  "shop_pincode",

  // bank
  "bank_account_holder_name",
  "bank_account_number",
  "ifsc_code",
  "bank_name",

  // contact
  "mobile_number",
  "email_id"
];


    const missing = required.filter(
      f => data[f] === undefined || data[f] === null || String(data[f]).trim() === ""
    );

    if (missing.length) {
      return res.status(400).json({
        message: `Missing fields: ${missing.join(", ")}`
      });
    }

    await conn.beginTransaction();

    // 2️⃣ Duplicate dealer check (PAN or Aadhaar)
   const [dup] = await conn.query(
  `SELECT dealer_LAN 
   FROM dealer_onboarding
   WHERE pan_number = ? OR Dealer_aadhar_number = ?`,
  [data.pan_number, data.Dealer_aadhar_number]
);


    if (dup.length) {
      await conn.rollback();
      return res.status(409).json({
        message: "Dealer already exists with same PAN or Aadhaar",
        dealer_lan: dup[0].dealer_LAN
      });
    }

    // 3️⃣ Generate Dealer LAN
    const dealerLAN = await generateDealerLan(conn);

    // 4️⃣ Insert dealer onboarding
    await conn.query(
  `INSERT INTO dealer_onboarding (
    login_date, dealer_LAN,
    first_name, middle_name, last_name,
    dealer_type, dob, gender,
    father_name, mother_name,
    pan_number, pan_name,
    Dealer_aadhar_number,
    business_pan_number, business_pan_name,
    gst_number, cin_number, udyam_number,
    business_name,
    current_address, current_village_city, current_state, current_pincode,
    shop_address, shop_city, shop_state, shop_pincode,
    bank_account_holder_name, bank_account_number,
    ifsc_code, bank_name,
    mobile_number, email_id,product,status,lan
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  [
    data.login_date,
    dealerLAN,

    data.first_name,
    data.middle_name || null,
    data.last_name,

    data.dealer_type,
    data.dob,
    data.gender,

    data.father_name,
    data.mother_name || null,

    data.pan_number,
    data.pan_name,
    data.Dealer_aadhar_number,

    data.business_pan_number,
    data.business_pan_name,

    data.gst_number || null,
    data.cin_number || null,
    data.udyam_number || null,

    data.business_name,

    data.current_address,
    data.current_village_city,
    data.current_state,
    data.current_pincode,

    data.shop_address,
    data.shop_city,
    data.shop_state,
    data.shop_pincode,

    data.bank_account_holder_name,
    data.bank_account_number,
    data.ifsc_code,
    data.bank_name,

    data.mobile_number,
    data.email_id || null,

    "Mobile Finance",
    "Login",
    dealerLAN
  ]
);


    // 5️⃣ Insert dealer KYC row
    await conn.query(
      "INSERT INTO dealer_kyc_verification_status (dealer_lan) VALUES (?)",
      [dealerLAN]
    );

    await conn.commit();

    // 6️⃣ Respond immediately
    res.json({
      message: "Dealer onboarded successfully",
      dealer_lan: dealerLAN
    });

    // 7️⃣ Run async validations
    runDealerValidations(dealerLAN);



  } catch (err) {
    await conn.rollback();
    console.error("Dealer Onboarding Error:", err);
    res.status(500).json({
      message: "Dealer onboarding failed",
      error: err.sqlMessage || err.message
    });
  } finally {
    conn.release();
  }
});

module.exports = router;
