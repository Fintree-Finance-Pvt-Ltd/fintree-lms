const db = require("../../config/db");
const express = require("express");
const verifyApiKey = require("../../middleware/apiKeyAuth");
const initAadhaarKyc = require("../../services/digitapaadharservice");
const { getPanCardDetails } = require("../../services/pancardapiservice");
const router = express.Router();

const ZEBRS_LOAN_TABLE = "loan_booking_zebrs";

const emptyToNull = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  return value;
};

const numberOrNull = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const num = Number(value);
  return Number.isNaN(num) ? null : num;
};

const normalizePan = (value) => String(value || "").trim().toUpperCase();

const normalizeMobile = (value) => String(value || "").replace(/\D/g, "");

const insertExistingColumns = async (conn, table, payload) => {
  const [columns] = await conn.query("SHOW COLUMNS FROM ??", [table]);
  const allowedColumns = new Set(columns.map((column) => column.Field));
  const entries = Object.entries(payload).filter(([key]) =>
    allowedColumns.has(key),
  );

  if (!entries.length) {
    throw new Error(`No matching columns found for ${table}`);
  }

  const columnPlaceholders = entries.map(() => "??").join(", ");
  const valuePlaceholders = entries.map(() => "?").join(", ");
  const columnNames = entries.map(([key]) => key);
  const values = entries.map(([, value]) => value);

  await conn.query(
    `INSERT INTO ?? (${columnPlaceholders}) VALUES (${valuePlaceholders})`,
    [table, ...columnNames, ...values],
  );
};

const buildCustomerOnboardPayload = (data, lan, partnerLoanId, dealer) => ({
  lender_type: emptyToNull(data.lenderType),
  lender: emptyToNull(data.lender) || "Zebrs",
  status: "Login",
  partner_loan_id: partnerLoanId,
  lan,

  login_date: emptyToNull(data.LOGIN_DATE),
  first_name: emptyToNull(data.First_Name),
  last_name: emptyToNull(data.Last_Name),
  customer_name: emptyToNull(data.Customer_Name),
  dob: emptyToNull(data.Borrower_DOB),
  father_name: emptyToNull(data.Father_Name),
  mobile_number: emptyToNull(data.Mobile_Number),
  email: emptyToNull(data.Email),
  pan_card: emptyToNull(data.Pan_Card),
  gender: emptyToNull(data.Gender),

  permanent_address_line_1: emptyToNull(data.Address_Line_1),
  permanent_address_line_2: emptyToNull(data.Address_Line_2),
  permanent_village_city: emptyToNull(data.Village),
  permanent_district: emptyToNull(data.District),
  permanent_state: emptyToNull(data.State),
  permanent_pincode: emptyToNull(data.Pincode),

  requested_loan_amount: numberOrNull(data.Loan_Amount),
  loan_amount: numberOrNull(data.Loan_Amount),
  interest_rate: numberOrNull(data.Interest_Rate),
  loan_tenure: numberOrNull(data.Tenure),
  disbursal_amount: numberOrNull(data.Disbursal_Amount),
  processing_fee: numberOrNull(data.Processing_Fee),
  processing_fee_percentage: numberOrNull(data.Processing_Fee_Percentage),

  guarantor_name: emptyToNull(data.GURANTOR),
  guarantor_dob: emptyToNull(data.GURANTOR_DOB),
  guarantor_email: emptyToNull(data.GURANTOR_EMAIL),
  guarantor_pan: emptyToNull(data.GURANTOR_PAN),
  guarantor_mobile: emptyToNull(data.GURANTOR_MOBILE),
  relationship_with_borrower: emptyToNull(data.Relationship_with_Borrower),
  guarantor_address_line_1: emptyToNull(data.GURANTOR_Address_Line_1),
  guarantor_address_line_2: emptyToNull(data.GURANTOR_Address_Line_2),
  guarantor_village_city: emptyToNull(data.GURANTOR_Village),
  guarantor_district: emptyToNull(data.GURANTOR_District),
  guarantor_state: emptyToNull(data.GURANTOR_State),
  guarantor_pincode: emptyToNull(data.GURANTOR_Pincode),

  co_applicant_name: emptyToNull(data.Co_Applicant),
  co_applicant_dob: emptyToNull(data.Co_Applicant_DOB),
  co_applicant_email: emptyToNull(data.Co_Applicant_Email),
  co_applicant_pan: emptyToNull(data.Co_Applicant_PAN),
  co_applicant_mobile: emptyToNull(data.Co_Applicant_Mobile),
  co_applicant_address_line_1: emptyToNull(data.Co_Applicant_Address_Line_1),
  co_applicant_address_line_2: emptyToNull(data.Co_Applicant_Address_Line_2),
  co_applicant_village_city: emptyToNull(data.Co_Applicant_Village),
  co_applicant_district: emptyToNull(data.Co_Applicant_District),
  co_applicant_state: emptyToNull(data.Co_Applicant_State),
  co_applicant_pincode: emptyToNull(data.Co_Applicant_Pincode),

  customer_name_as_per_bank: emptyToNull(data.customer_name_as_per_bank),
  customer_bank_name: emptyToNull(data.customer_bank_name),
  customer_account_number: emptyToNull(data.customer_account_number),
  bank_ifsc_code: emptyToNull(data.bank_ifsc_code),

  dealer_lan: emptyToNull(dealer.lan),
  selected_dealer_application_id: emptyToNull(dealer.application_id),
  dealer_id: emptyToNull(dealer.dealer_id || dealer.lan),
  trade_name: emptyToNull(dealer.trade_name),
  dealer_name: emptyToNull(dealer.business_name),
  dealer_contact: emptyToNull(dealer.owner_mobile),
  dealer_email: emptyToNull(dealer.owner_email),
  gst_no: emptyToNull(dealer.gst_number),
  pan_number: emptyToNull(dealer.pan_number),
  dealer_address: emptyToNull(dealer.showroom_address),
  dealer_city: emptyToNull(dealer.city),
  dealer_state: emptyToNull(dealer.state),
  dealer_pincode: emptyToNull(dealer.pincode),

  dealer_bank_name: emptyToNull(dealer.bank_name),
  dealer_account_number: emptyToNull(dealer.account_number),
  dealer_ifsc: emptyToNull(dealer.ifsc_code),
  dealer_name_in_bank: emptyToNull(dealer.account_holder_name),

  selected_product_id: numberOrNull(data.selected_product_id),
  battery_name: emptyToNull(data.Battery_Name),
  battery_type: emptyToNull(data.Battery_Type),
  battery_serial_no_1: emptyToNull(data.Battery_Serial_no_1),
  battery_serial_no_2: emptyToNull(data.Battery_Serial_no_2),
  e_rikshaw_model: emptyToNull(data.E_Rikshaw_model),
  chassis_no: emptyToNull(data.Chassis_no),

  borrower_mobile_verified: 0,
  guarantor_mobile_verified: 0,
  co_applicant_mobile_verified: 0,
});

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


router.post("/login/zebrs-customer", verifyApiKey, async (req, res) => {
  const conn = await db.promise().getConnection();

  try {
    const data = req.body;
    const dealerLan = String(
      data.dealer_lan || data.dealerLan || data.dealer_id || "",
    ).trim();

    if (!dealerLan) {
      return res.status(400).json({
        success: false,
        message: "dealer_lan is required",
      });
    }

    await conn.beginTransaction();

    const [dealerRows] = await conn.query(
      `
      SELECT *
      FROM zebrs_dealer_booking
      WHERE lan = ?
      LIMIT 1
      `,
      [dealerLan],
    );

    if (!dealerRows.length) {
      await conn.rollback();

      return res.status(404).json({
        success: false,
        message: "Dealer not found for dealer_lan",
      });
    }

    const dealer = dealerRows[0];
    const normalizedPan = normalizePan(data.Pan_Card);
    const normalizedMobile = normalizeMobile(data.Mobile_Number);
    const duplicateConditions = [];
    const duplicateParams = [];

    if (normalizedPan) {
      duplicateConditions.push("UPPER(pan_card) = ?");
      duplicateParams.push(normalizedPan);
      data.Pan_Card = normalizedPan;
    }

    if (normalizedMobile) {
      duplicateConditions.push("mobile_number = ?");
      duplicateParams.push(normalizedMobile);
      data.Mobile_Number = normalizedMobile;
    }

    if (duplicateConditions.length) {
      const [duplicateRows] = await conn.query(
        `
        SELECT lan, pan_card, mobile_number
        FROM loan_booking_zebrs
        WHERE ${duplicateConditions.join(" OR ")}
        LIMIT 1
        `,
        duplicateParams,
      );

      if (duplicateRows.length) {
        await conn.rollback();

        const duplicate = duplicateRows[0];
        const duplicateFields = [];

        if (
          normalizedPan &&
          normalizePan(duplicate.pan_card) === normalizedPan
        ) {
          duplicateFields.push("pan_card");
        }

        if (
          normalizedMobile &&
          normalizeMobile(duplicate.mobile_number) === normalizedMobile
        ) {
          duplicateFields.push("mobile_number");
        }

        return res.status(409).json({
          success: false,
          message: `Duplicate ${duplicateFields.join(" and ")} found`,
          duplicate_fields: duplicateFields,
          existing_lan: duplicate.lan,
        });
      }
    }

    const { cust_lan, cust_partner_loan_id } = await generateLoanIdentifiers(
      "ZEBRS_CUSTOMER",
    );

    await insertExistingColumns(
      conn,
      ZEBRS_LOAN_TABLE,
      buildCustomerOnboardPayload(data, cust_lan, cust_partner_loan_id, dealer),
    );

    await conn.commit();

    return res.status(201).json({
      success: true,
      message: "Zebrs customer onboarded successfully",
      partner_loan_id: cust_partner_loan_id,
      lan: cust_lan,
    });
  } catch (err) {
    await conn.rollback();
    console.error("Zebrs customer onboard error:", err);

    return res.status(500).json({
      success: false,
      message: "Zebrs customer onboard failed",
      error: err.sqlMessage || err.message,
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

