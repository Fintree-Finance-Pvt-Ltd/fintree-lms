const db = require("../../config/db");
const express = require("express");
const verifyApiKey = require("../../middleware/apiKeyAuth");
const { initAadhaarKyc } = require("../../services/digitapaadharservice");
const { getPanCardDetails } = require("../../services/pancardapiservice");
const { initDoqfyEsign } = require("../../services/doqfyEsignService");
const { initEsign } = require("../../services/esignService");
const { getLoanContext } = require("../../utils/lanHelper");
const authenticateUser = require("../../middleware/verifyToken");

const router = express.Router();

// const { runBureau } = require("../../services/Bueraupullapiservice");
const { runBureau } = require("../../services/Bueraupullapiservice");

const { autoApproveZebrsIfBureauVerified } = require("../Zebrs/zebrsBre");

const ZEBRS_LOAN_TABLE = "loan_booking_zebrs";

const emptyToNull = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  return value;
};

function stringifyForDb(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch (error) {
    console.error("Failed to stringify bureau response:", error);

    return JSON.stringify({
      error: "Unable to serialize bureau response",
    });
  }
}

const numberOrNull = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const num = Number(value);
  return Number.isNaN(num) ? null : num;
};

const normalizePan = (value) =>
  String(value || "")
    .trim()
    .toUpperCase();

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

  residence_ownership: emptyToNull(data.Residence_Ownership),
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

  manufacturing_year: numberOrNull(data.Manufacturing_Year),
  sales_invoice_number: emptyToNull(data.Sales_Invoice_Number),
  sales_invoice_date: emptyToNull(data.Sales_Invoice_Date),
  downpayment_paid_by_borrower: numberOrNull(
    data.Downpayment_Paid_By_The_Borrower,
  ),
  vehicle_registration_cost: numberOrNull(data.Vehicle_Registration_Cost),

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
    const { lan, application_id } =
      await generateLoanIdentifiers("ZEBRS_DEALER");

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

    const selectedProductId = Number(data.selected_product_id);

    if (!Number.isInteger(selectedProductId) || selectedProductId <= 0) {
      await conn.rollback();

      return res.status(400).json({
        success: false,
        message: "Valid selected_product_id is required",
      });
    }

    const [productRows] = await conn.query(
      `
  SELECT
    id,
    application_id,
    battery_type,
    battery_name,
    e_rickshaw_model,
    e_rickshaw_model_price
  FROM zebrs_dealer_products
  WHERE id = ?
    AND application_id = ?
  LIMIT 1
  `,
      [Number(data.selected_product_id), dealer.application_id],
    );

    if (!productRows.length) {
      await conn.rollback();

      return res.status(404).json({
        success: false,
        message: "Selected product was not found for this Zebrs dealer",
      });
    }

    const selectedProduct = productRows[0];

    /*
     * Use product-master values instead of trusting frontend values.
     */
    data.selected_product_id = selectedProduct.id;
    data.Battery_Type = selectedProduct.battery_type;
    data.Battery_Name = selectedProduct.battery_name;
    data.E_Rikshaw_model = selectedProduct.e_rickshaw_model;

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

    const { cust_lan, cust_partner_loan_id } =
      await generateLoanIdentifiers("ZEBRS_CUSTOMER");

    const customerPayload = buildCustomerOnboardPayload(
      data,
      cust_lan,
      cust_partner_loan_id,
      dealer,
    );

    await insertExistingColumns(conn, ZEBRS_LOAN_TABLE, customerPayload);

    /*
     * First save the Zebrs loan.
     */
    await conn.commit();

    /*
     * Then run bureau only for the borrower.
     */
    let bureauResult;

    try {
      bureauResult = await runZebrsBureauValidation({
        pool: conn,
        lan: cust_lan,
        applicantType: "BORROWER",
        partyNo: 1,

        applicantData: {
          customer_name:
            customerPayload.customer_name ||
            [customerPayload.first_name, customerPayload.last_name]
              .filter(Boolean)
              .join(" "),

          first_name: customerPayload.first_name,
          last_name: customerPayload.last_name,
          dob: customerPayload.dob,
          gender: customerPayload.gender,
          pan_number: customerPayload.pan_card,
          mobile_number: customerPayload.mobile_number,

          current_address: [
            customerPayload.permanent_address_line_1,
            customerPayload.permanent_address_line_2,
          ]
            .filter(Boolean)
            .join(", "),

          current_village_city: customerPayload.permanent_village_city,

          current_state: customerPayload.permanent_state,

          current_pincode: customerPayload.permanent_pincode,

          loan_amount: customerPayload.loan_amount,

          loan_tenure: customerPayload.loan_tenure,
        },
      });
    } catch (bureauError) {
      console.error(
        `Zebrs borrower bureau failed for LAN ${cust_lan}:`,
        bureauError,
      );

      bureauResult = {
        success: false,
        status: "FAILED",
        score: null,
        error: bureauError.message || String(bureauError),
      };
    }

    let breResult;

    try {
      console.log(`🚀 Starting Zebrs BRE for LAN: ${cust_lan}`);

      breResult = await autoApproveZebrsIfBureauVerified(cust_lan);
      console.log(`✅ Zebrs BRE completed for LAN ${cust_lan}:`, breResult);
    } catch (breError) {
      console.error(`Zebrs BRE failed for LAN ${cust_lan}:`, breError);

      breResult = {
        success: false,
        status: "ERROR",
        reason: breError.message || String(breError),
      };
    }

    return res.status(201).json({
      success: true,
      message: "Zebrs customer onboarded successfully",
      partner_loan_id: cust_partner_loan_id,
      lan: cust_lan,
      bureau: {
        success: bureauResult?.success || false,
        status: bureauResult?.status || "FAILED",
      },

      bre: {
        success: breResult?.success || false,
        status: breResult?.status || "NOT_EXECUTED",
      },
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

router.post("/generate-aadhaar-kyc-url", verifyApiKey, async (req, res) => {
  try {
    const { lan, mobile_number, email_id, customer_name } = req.body;
    console.log("Received request to generate Aadhaar KYC URL for LAN:", lan);

    const [loanRows] = await db
      .promise()
      .query("SELECT * FROM loan_booking_zebrs WHERE lan = ?", [lan]);

    if (loanRows.length === 0) {
      console.log("❌ Loan not found. Cannot validate.");
      return;
    }

    const loan = loanRows[0];

    await db
      .promise()
      .query("INSERT IGNORE INTO kyc_verification_status (lan) VALUES (?)", [
        lan,
      ]);

    await db
      .promise()
      .query(
        "UPDATE kyc_verification_status SET aadhaar_status='INITIATED' WHERE lan=?",
        [lan],
      );

    const kycUrl = await initAadhaarKyc(
      lan,
      mobile_number,
      email_id,
      customer_name,
    );

    if (!kycUrl) {
      console.error("Failed to generate Aadhaar KYC URL for LAN:", lan);
      return res
        .status(500)
        .json({ error: "Failed to generate Aadhaar KYC URL" });
    }

    if (kycUrl) {
      await db.promise().query(
        `UPDATE kyc_verification_status 
         SET aadhaar_transaction_id=?, aadhaar_kyc_url=?, aadhaar_unique_id=? 
         WHERE lan=?`,
        [kycUrl.unifiedTransactionId, kycUrl.kycUrl, kycUrl.uniqueId, lan],
      );
    }

    console.log(
      "Successfully generated Aadhaar KYC URL for LAN:",
      lan,
      "URL:",
      kycUrl.kycUrl,
    );
    res.json({ kycUrl: kycUrl.kycUrl });
  } catch (error) {
    console.error("Error generating Aadhaar KYC URL:", error.message);
    res.status(500).json({ error: "Failed to generate Aadhaar KYC URL" });
  }
});

router.post("/v1/zebrs-aadhaar-webhook", async (req, res) => {
  try {
    const payload = req.body || {};

    console.log(
      "📥 ZEBRS Aadhaar Webhook Payload:",
      JSON.stringify(payload).slice(0, 500)
    );

    const transactionId = payload.transactionId;
    const status = String(payload.status || "").toLowerCase();
    const data = payload.data || {};

    const uniqueId =
      data?.uniqueId ||
      payload?.uniqueId ||
      payload?.model?.uniqueId ||
      null;

    // Always acknowledge callbacks that cannot be processed.
    if (!transactionId && !uniqueId) {
      console.warn("ZEBRS Aadhaar webhook missing transactionId and uniqueId");
      return res.status(200).send("ignored");
    }

    // Find the matching ZEBRS KYC record.
    const [rows] = await db.promise().query(
      `SELECT lan, applicant_type
       FROM kyc_verification_status
       WHERE (aadhaar_transaction_id = ? AND ? IS NOT NULL)
          OR (aadhaar_unique_id = ? AND ? IS NOT NULL)
       LIMIT 1`,
      [transactionId, transactionId, uniqueId, uniqueId]
    );

    if (!rows.length) {
      console.warn("No matching ZEBRS Aadhaar KYC record", {
        transactionId,
        uniqueId
      });

      return res.status(200).send("no-matching-record");
    }

    const lan = rows[0].lan;

    // Ensure this callback belongs to a ZEBRS loan.
    const [loanRows] = await db.promise().query(
      `SELECT lan
       FROM loan_booking_zebrs
       WHERE lan = ?
       LIMIT 1`,
      [lan]
    );

    if (!loanRows.length) {
      console.warn("Aadhaar callback is not for a ZEBRS loan:", lan);
      return res.status(200).send("not-zebrs-loan");
    }

    if (status !== "success") {
      await db.promise().query(
        `UPDATE kyc_verification_status
         SET aadhaar_status = 'FAILED',
             aadhaar_api_response = ?
         WHERE lan = ?
           AND aadhaar_transaction_id = ?`,
        [JSON.stringify(payload), lan, transactionId]
      );

      console.log("❌ ZEBRS Aadhaar verification failed:", lan);
      return res.status(200).send("failure-processed");
    }

    // Successful verification: save the callback response.
    await db.promise().query(
      `UPDATE kyc_verification_status
       SET aadhaar_status = 'VERIFIED',
           aadhaar_api_response = ?
       WHERE lan = ?
         AND aadhaar_transaction_id = ?`,
      [JSON.stringify(payload), lan, transactionId]
    );

    console.log("✅ ZEBRS Aadhaar VERIFIED for LAN:", lan);

    return res.status(200).send("ok");
  } catch (error) {
    console.error("❌ ZEBRS Aadhaar webhook error:", error);

    // Acknowledge to avoid repeated callbacks; monitor errors in logs.
    return res.status(200).send("error-logged");
  }
});

router.post("/partner/ops-initiate", async (req, res) => {
  try {
    const { lan } = req.body;

    if (!lan) {
      return res.status(400).json({
        success: false,
        message: "LAN is required",
      });
    }

    const [result] = await db.promise().query(
      `UPDATE loan_booking_zebrs
       SET status = 'ops-initiate'
       WHERE lan = ?
         AND status = 'Approved'`,
      [lan],
    );

    if (result.affectedRows === 0) {
      return res.status(409).json({
        success: false,
        message: "Loan not found or loan is not in Approved status",
        lan,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Loan status updated to ops-initiate",
      lan,
      status: "ops-initiate",
    });
  } catch (err) {
    console.error("ZEBRS ops-initiate error:", err.message);

    return res.status(500).json({
      success: false,
      message: "Failed to update loan status",
    });
  }
});

// pan verification

router.post("/pan-verify", verifyApiKey, async (req, res) => {
  try {
    const { lan, pan_number, customer_name } = req.body;
    console.log("Received request to verify PAN number:", pan_number);

    const [loanRows] = await db
      .promise()
      .query("SELECT * FROM loan_booking_zebrs WHERE lan = ?", [lan]);

    if (loanRows.length === 0) {
      console.log("❌ Loan not found. Cannot validate.");
      return;
    }

    const loan = loanRows[0];

    await db
      .promise()
      .query("INSERT IGNORE INTO kyc_verification_status (lan) VALUES (?)", [
        lan,
      ]);
    await db
      .promise()
      .query(
        "UPDATE kyc_verification_status SET pan_status='INITIATED' WHERE lan=?",
        [lan],
      );
    const panDetails = await getPanCardDetails(pan_number, customer_name);

    await db
      .promise()
      .query(
        "UPDATE kyc_verification_status SET pan_status=?, pan_api_response=? WHERE lan=?",
        [
          // panDetails.success ? "VERIFIED" : "FAILED",
          panDetails.success ? "VERIFIED" : "FAILED",
          JSON.stringify(panDetails.response || {}),
          lan,
        ],
      );
    console.log(
      "Successfully verified PAN number for LAN:",
      lan,
      "PAN:",
      pan_number,
      "Result:",
      panDetails,
    );
    res.json({ panDetails: panDetails });
  } catch (error) {
    console.error("Error verifying PAN number:", error.message);
    res.status(500).json({ error: "Failed to verify PAN number" });
  }
});

router.post("/esign-initiate", verifyApiKey, async (req, res) => {
  try {
    const { lan, mobile_number, email_id, customer_name } = req.body;
  } catch (error) {
    console.error("Error initiating eSign:", error.message);
    res.status(500).json({ error: "Failed to initiate eSign" });
  }
});
// GET ZEBRS record by application_id
router.get("/product/:applicationId", async (req, res) => {
  try {
    const { applicationId } = req.params;

    const [rows] = await db.promise().query(
      `SELECT
          id,
          application_id,
          battery_type,
          battery_name,
          e_rickshaw_model,
          e_rickshaw_model_price,
          created_at
       FROM zebrs_dealer_products
       WHERE application_id = ?
       LIMIT 1`,
      [applicationId],
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Product not found for this application ID",
      });
    }

    return res.status(200).json({
      success: true,
      data: rows[0],
    });
  } catch (error) {
    console.error("Error fetching ZEBRS product:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// "/:lan/esign/:type" for esign

async function runZebrsBureauValidation({
  pool,
  lan,
  applicantType,
  partyNo,
  applicantData,
}) {
  const panNumber = String(applicantData?.pan_number || "")
    .trim()
    .toUpperCase();

  if (!panNumber) {
    await pool.query(
      `
      UPDATE kyc_verification_status
      SET
        bureau_status = 'FAILED',
        bureau_api_response = ?
      WHERE lan = ?
        AND applicant_type = ?
        AND party_no = ?
      `,
      [
        stringifyForDb({
          error: "PAN number missing for bureau",
        }),
        lan,
        applicantType,
        partyNo,
      ],
    );

    return {
      success: false,
      skipped: false,
      applicantType,
      partyNo,
      reason: "PAN number missing for bureau",
      score: null,
    };
  }

  const [existingKycRows] = await pool.query(
    `
  SELECT id
  FROM kyc_verification_status
  WHERE lan = ?
    AND applicant_type = ?
    AND party_no = ?
  LIMIT 1
  `,
    [lan, applicantType, partyNo],
  );

  if (!existingKycRows.length) {
    await pool.query(
      `
    INSERT INTO kyc_verification_status (
      lan,
      applicant_type,
      party_no,
      bureau_status,
      bureau_api_response
    )
    VALUES (?, ?, ?, 'PENDING', NULL)
    `,
      [lan, applicantType, partyNo],
    );
  }

  await pool.query(
    `
    UPDATE kyc_verification_status
    SET
      bureau_status = 'INITIATED',
      bureau_api_response = NULL
    WHERE lan = ?
      AND applicant_type = ?
      AND party_no = ?
    `,
    [lan, applicantType, partyNo],
  );

  const bureauResult = await runBureau({
    enquiry_reason: 3,
    finance_purpose: 11,

    customer_name: applicantData.customer_name,
    first_name: applicantData.first_name,
    last_name: applicantData.last_name,
    dob: applicantData.dob,
    gender: applicantData.gender,

    pan_number: panNumber,
    mobile_number: applicantData.mobile_number,

    current_address: applicantData.current_address,
    current_village_city: applicantData.current_village_city,
    current_state: applicantData.current_state,
    current_pincode: applicantData.current_pincode,

    loan_amount: applicantData.loan_amount,
    loan_tenure: applicantData.loan_tenure,
  }).catch((error) => {
    console.error(`❌ Zebrs ${applicantType}-${partyNo} Bureau Error:`, error);

    return {
      success: false,
      score: null,
      response: {
        error: error.message || String(error),
      },
    };
  });

  /*
   * Dummy bureau response for Zebrs testing.
   * This does not call the actual bureau provider.
   */

  // this is dummy bureau response for testing purposes.
  // const bureauResult = {
  //   success: true,
  //   score: 750,
  //   response: {
  //     provider: "DUMMY_BUREAU",
  //     status: "SUCCESS",
  //     message: "Dummy bureau report generated successfully",
  //     score: 750,
  //     pan_number: applicantData.pan_number,
  //     customer_name: applicantData.customer_name,
  //     enquiry_id: `DUMMY-${lan}-${Date.now()}`,
  //     generated_at: new Date().toISOString(),
  //   },
  // };

  // const bureauStatus = bureauResult.success ? "VERIFIED" : "FAILED";
  const bureauScore =
    bureauResult?.score !== undefined &&
    bureauResult?.score !== null &&
    Number.isFinite(Number(bureauResult.score))
      ? Number(bureauResult.score)
      : null;

  const bureauStatus =
    bureauResult?.success === true && bureauScore !== null
      ? "VERIFIED"
      : "FAILED";

  const bureauResponse = stringifyForDb(
    bureauResult.response || {
      success: bureauResult.success,
      score: bureauScore,
      // score: bureauResult.score ?? null,
    },
  );

  // const bureauScore =
  //   bureauResult.score !== undefined && bureauResult.score !== null
  //     ? Number(bureauResult.score)
  //     : null;

  await pool.query(
    `
    UPDATE kyc_verification_status
    SET
      bureau_status = ?,
      bureau_api_response = ?
    WHERE lan = ?
      AND applicant_type = ?
      AND party_no = ?
    `,
    [bureauStatus, bureauResponse, lan, applicantType, partyNo],
  );

  await pool.query(
    `
    INSERT INTO loan_cibil_reports (
      lan,
      applicant_type,
      party_no,
      source_applicant_id,
      pan_number,
      score,
      report_xml,
      created_at
    )
    VALUES (?, ?, ?, NULL, ?, ?, ?, NOW())
    `,
    [lan, applicantType, partyNo, panNumber, bureauScore, bureauResponse],
  );

  /*
   * Save the borrower score directly in loan_booking_zebrs.
   * Guarantor and co-applicant scores remain available in
   * loan_cibil_reports.
   */
  if (bureauScore !== null && applicantType === "BORROWER") {
    await pool.query(
      `
      UPDATE ${ZEBRS_LOAN_TABLE}
      SET
        cibil_score = ?,
        bureau_score = ?
      WHERE lan = ?
      `,
      [bureauScore, bureauScore, lan],
    );
  }

  console.log(`📌 Zebrs ${applicantType}-${partyNo} Bureau: ${bureauStatus}`);

  return {
    success: Boolean(bureauResult.success),
    status: bureauStatus,
    applicantType,
    partyNo,
    score: bureauScore,
  };
}

router.post("/bre/zebrs/:lan", verifyApiKey, async (req, res) => {
  try {
    const lan = String(req.params.lan || "")
      .trim()
      .toUpperCase();

    if (!lan) {
      return res.status(400).json({
        success: false,
        message: "LAN is required",
      });
    }

    const [loanRows] = await db.promise().query(
      `
        SELECT lan
        FROM loan_booking_zebrs
        WHERE lan = ?
        LIMIT 1
        `,
      [lan],
    );

    if (!loanRows.length) {
      return res.status(404).json({
        success: false,
        message: `Zebrs loan not found for LAN ${lan}`,
      });
    }

    console.log(`🚀 Manually running Zebrs BRE for ${lan}`);

    const breResult = await autoApproveZebrsIfBureauVerified(lan);

    console.log(`✅ Manual Zebrs BRE completed for ${lan}:`, breResult);

    return res.status(200).json({
      success: true,
      message: "Zebrs BRE executed successfully",
      lan,
      bre: breResult,
    });
  } catch (error) {
    console.error("Manual Zebrs BRE execution failed:", error);

    return res.status(500).json({
      success: false,
      message: "Zebrs BRE execution failed",
      error: error.sqlMessage || error.message || String(error),
    });
  }
});

// ============================================
// GET ZEBRS LOAN STATUS BY LAN
// ============================================
router.get("/status/:lan", verifyApiKey, async (req, res) => {
  try {
    const lan = String(req.params.lan || "")
      .trim()
      .toUpperCase();

    console.log("📌 HIT ZEBRS STATUS API:", lan);

    if (!lan) {
      return res.status(400).json({
        success: false,
        message: "LAN is required",
      });
    }
    const [rows] = await db.promise().query(
      `
        SELECT
          lan,
          partner_loan_id,
          status,
          stage,
          zebrs_bre_status,
          zebrs_bre_reason,
          zebrs_bre_checked_at,
          updated_at
        FROM loan_booking_zebrs
        WHERE lan = ?
        LIMIT 1
      `,
      [lan],
    );
    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: `Zebrs loan not found for LAN ${lan}`,
      });
    }
    return res.status(200).json({
      success: true,
      message: "Zebrs loan status fetched successfully",
      data: rows[0],
    });
  } catch (error) {
    console.error("❌ Error fetching Zebrs loan status:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch Zebrs loan status",
      error: error.sqlMessage || error.message,
    });
  }
});

router.post("/:lan/esign/:type", verifyApiKey, async (req, res) => {
  const { lan, type } = req.params;
  const { bookingTable } = getLoanContext(lan);

  try {
    if (type === "agreement") {
      const [rows] = await db
        .promise()
        .query(
          `SELECT agreement_esign_status FROM ${bookingTable} WHERE lan=?`,
          [lan],
        );
    }
    console.log("[ZEBRS ESIGN] Calling initZebrsEsign...");

    const out = await initDoqfyEsign(lan, type.toUpperCase());

    // const out = await initEsign(lan, type.toUpperCase());
    console.log("[ZEBRS ESIGN] Response:", out);

    return res.json(out);
  } catch (err) {
    console.error("[ZEBRS ESIGN ERROR]", err);

    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

router.get("/v1/rps", verifyApiKey, async (req, res) => {
  try {
    const cleanLan = String(req.query.lan || "")
      .trim()
      .toUpperCase();

    if (!cleanLan) {
      return res.status(400).json({
        message: "LAN is required.",
      });
    }

    // Fetch Zebrs loan
    const [[loan]] = await db.promise().query(
      `
        SELECT
          lan,
          partner_loan_id,
          customer_name,
          status,
          loan_amount
          
        FROM loan_booking_zebrs
        WHERE lan = ?
        LIMIT 1
        `,
      [cleanLan],
    );

    if (!loan) {
      return res.status(404).json({
        message: "Zebrs loan not found.",
      });
    }

    // Fetch repayment schedule
    const [rpsRows] = await db.promise().query(
      `
        SELECT
          id,
          due_date,
          emi,
          principal,
          interest,
          opening,
          closing,
          remaining_principal,
          remaining_interest,
          remaining_emi,
          status
        FROM manual_rps_zebrs
        WHERE lan = ?
        ORDER BY due_date ASC, id ASC
        `,
      [cleanLan],
    );

    if (!rpsRows.length) {
      return res.status(404).json({
        message: "Zebrs repayment schedule not found.",
      });
    }

    // Summary
    const totalExpectedRepayment = rpsRows.reduce(
      (sum, row) => sum + Number(row.emi || 0),
      0,
    );

    const totalPrincipal = rpsRows.reduce(
      (sum, row) => sum + Number(row.principal || 0),
      0,
    );

    const totalInterest = rpsRows.reduce(
      (sum, row) => sum + Number(row.interest || 0),
      0,
    );

    // Format installments
    const installments = rpsRows.map((row, index) => ({
      installment_number: index + 1,

      due_date: row.due_date
        ? new Date(row.due_date).toISOString().split("T")[0]
        : null,

      emi: Number(row.emi || 0),
      principal: Number(row.principal || 0),
      interest: Number(row.interest || 0),

      opening_principal: Number(row.opening || 0),
      closing_principal: Number(row.closing || 0),

      remaining_principal: Number(row.remaining_principal || 0),
      remaining_interest: Number(row.remaining_interest || 0),
      remaining_emi: Number(row.remaining_emi || 0),

      status: row.status,
    }));

    return res.status(200).json({
      message: "Zebrs repayment schedule fetched successfully.",
      data: {
        lan: loan.lan,
        partner_loan_id: loan.partner_loan_id,
        customer_name: loan.customer_name,
        case_status: loan.status,

        loan_amount: Number(loan.loan_amount || 0),

        regular_emi_amount: Number(loan.emi_amount || rpsRows[0]?.emi || 0),

        summary: {
          installment_count: rpsRows.length,
          total_expected_repayment: totalExpectedRepayment,
          total_principal: totalPrincipal,
          total_interest: totalInterest,
        },

        installments,
      },
    });
  } catch (error) {
    console.error("Error fetching Zebrs RPS:", error);

    return res.status(500).json({
      message: "Internal server error.",
      error: error.message,
    });
  }
});

// Dealer's List

router.get("/dealer-list", authenticateUser, async (req, res) => {
  try {
    const [rows] = await db.promise().query(`
      SELECT
        id,
        application_id,
        lan,
        dealer_id,
        business_name,
        trade_name,
        business_type,
        owner_name,
        owner_mobile,
        owner_email,
        showroom_address,
        city,
        state,
        pincode,
        status,
        login_date,
        created_at
      FROM zebrs_dealer_booking
      ORDER BY created_at DESC
    `);

    return res.status(200).json(rows);
  } catch (error) {
    console.error("Zebrs Dealer List Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch Zebrs dealers",
      error: error.message,
    });
  }
});

// ==========================================
// ZEBRS DEALER CREDIT APPROVAL LIST
// ==========================================
router.get("/dealers-login-cases", authenticateUser, async (req, res) => {
  try {
    const [rows] = await db.promise().query(`
      SELECT
        id,
        application_id,
        lan,
        dealer_id,
        business_name,
        trade_name,
        business_type,
        owner_name,
        owner_mobile,
        owner_email,
        city,
        state,
        status,
        login_date,
        created_at
      FROM zebrs_dealer_booking
      WHERE UPPER(COALESCE(status, 'ACTIVE'))
        IN ('ACTIVE', 'APPROVED', 'REJECTED')
      ORDER BY created_at DESC
    `);

    return res.status(200).json(rows);
  } catch (error) {
    console.error("Zebrs Dealer Credit List Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch Zebrs dealer credit list",
      error: error.message,
    });
  }
});

// ==========================================
// ZEBRS DEALER STATUS UPDATE
// ==========================================
router.patch("/dealer/status/:lan", authenticateUser, async (req, res) => {
  try {
    const lan = String(req.params.lan || "")
      .trim()
      .toUpperCase();
    const status = String(req.body?.status || "")
      .trim()
      .toUpperCase();

    if (!lan) {
      return res.status(400).json({
        success: false,
        message: "Dealer LAN is required",
      });
    }

    if (!["APPROVED", "REJECTED"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Status must be APPROVED or REJECTED",
      });
    }

    const [result] = await db.promise().query(
      `UPDATE zebrs_dealer_booking
       SET status = ?
       WHERE lan = ?
         AND UPPER(status) = 'ACTIVE'`,
      [status, lan],
    );

    if (!result.affectedRows) {
      return res.status(409).json({
        success: false,
        message: "Dealer not found or already processed",
      });
    }

    return res.status(200).json({
      success: true,
      message: `Dealer ${status.toLowerCase()} successfully`,
      lan,
      status,
    });
  } catch (error) {
    console.error("Zebrs Dealer Status Update Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update dealer status",
      error: error.message,
    });
  }
});

router.get("/dealer-details/:lan", authenticateUser, async (req, res) => {
  try {
    const lan = String(req.params.lan || "")
      .trim()
      .toUpperCase();

    if (!lan) {
      return res.status(400).json({
        success: false,
        message: "Dealer LAN is required",
      });
    }

    const [rows] = await db.promise().query(
      `
      SELECT
        d.*,
        p.id AS product_id,
        p.battery_type,
        p.battery_name,
        p.e_rickshaw_model,
        p.e_rickshaw_model_price
      FROM zebrs_dealer_booking d
      LEFT JOIN zebrs_dealer_products p
        ON d.application_id = p.application_id
      WHERE d.lan = ?
      ORDER BY p.id ASC
      `,
      [lan],
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Zebrs dealer not found",
      });
    }

    const dealer = {
      ...rows[0],
      products: rows
        .filter((r) => r.product_id !== null)
        .map((r) => ({
          id: r.product_id,
          battery_type: r.battery_type,
          battery_name: r.battery_name,
          e_rickshaw_model: r.e_rickshaw_model,
          price: r.e_rickshaw_model_price,
        })),
    };

    delete dealer.product_id;
    delete dealer.battery_type;
    delete dealer.battery_name;
    delete dealer.e_rickshaw_model;
    delete dealer.e_rickshaw_model_price;

    return res.status(200).json(dealer);
  } catch (error) {
    console.error("Zebrs Dealer Details Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch Zebrs dealer details",
      error: error.message,
    });
  }
});

router.get("/customer-details/:lan", authenticateUser, async (req, res) => {
  res.set({
    "Cache-Control": "no-store, no-cache, must-revalidate",
    Pragma: "no-cache",
    Expires: "0",
  });

  const lan = String(req.params.lan || "")
    .trim()
    .toUpperCase();

  if (!/^ZBCL\d+$/.test(lan)) {
    return res.status(400).json({
      success: false,
      message: "Invalid Zebrs customer LAN",
    });
  }

  try {
    // 1. Fetch customer loan
    const [loanRows] = await db.promise().query(
      `SELECT *
         FROM loan_booking_zebrs
         WHERE lan = ?
         LIMIT 1`,
      [lan],
    );

    if (!loanRows.length) {
      return res.status(404).json({
        success: false,
        message: "Zebrs customer not found",
      });
    }

    const row = loanRows[0];

    // 2. Fetch latest KYC records for all parties
    const [kycRows] = await db.promise().query(
      `SELECT
           id,
           applicant_type,
           party_no,
           pan_status,
           aadhaar_status,
           bureau_status,
           aadhaar_kyc_url,
           aadhaar_transaction_id,
           aadhaar_unique_id,
           aadhaar_initiated_at,
           aadhaar_retry_count
         FROM kyc_verification_status
         WHERE lan = ?
           AND applicant_type IN (
             'BORROWER',
             'GUARANTOR',
             'CO_APPLICANT'
           )
           AND party_no = 1
         ORDER BY id DESC`,
      [lan],
    );

    const latest = {};

    for (const item of kycRows) {
      if (!latest[item.applicant_type]) {
        latest[item.applicant_type] = item;
      }
    }

    const formatVerification = (type) => {
      const k = latest[type];

      if (!k) {
        return {
          kyc_id: null,
          pan_status: "PENDING",
          aadhaar_status: "PENDING",
          bureau_status: "PENDING",
          aadhaar_kyc_url: null,
          aadhaar_transaction_id: null,
          aadhaar_unique_id: null,
          aadhaar_initiated_at: null,
          aadhaar_retry_count: 0,
          aadhaar_can_retry: false,
          retry_available_at: null,
          retry_seconds_remaining: 0,
        };
      }

      const count = Number(k.aadhaar_retry_count || 0);
      const status = String(k.aadhaar_status || "PENDING").toUpperCase();

      const initiated = k.aadhaar_initiated_at
        ? new Date(k.aadhaar_initiated_at)
        : null;

      const validDate = initiated && !Number.isNaN(initiated.getTime());

      const availableAt = validDate
        ? new Date(initiated.getTime() + 24 * 60 * 60 * 1000)
        : null;

      const seconds = availableAt
        ? Math.max(0, Math.ceil((availableAt.getTime() - Date.now()) / 1000))
        : 0;

      // Informational only: the initiation API
      // must independently enforce retry rules.
      const canRetry =
        status !== "VERIFIED" &&
        count < 2 &&
        ((!validDate && status === "PENDING") ||
          (validDate &&
            seconds === 0 &&
            ["PENDING", "FAILED", "INITIATED"].includes(status)));

      return {
        kyc_id: k.id,
        pan_status: k.pan_status || "PENDING",
        aadhaar_status: k.aadhaar_status || "PENDING",
        bureau_status: k.bureau_status || "PENDING",
        aadhaar_kyc_url: k.aadhaar_kyc_url || null,
        aadhaar_transaction_id: k.aadhaar_transaction_id || null,
        aadhaar_unique_id: k.aadhaar_unique_id || null,
        aadhaar_initiated_at: k.aadhaar_initiated_at || null,
        aadhaar_retry_count: count,
        aadhaar_can_retry: canRetry,
        retry_available_at: availableAt,
        retry_seconds_remaining: seconds,
      };
    };

    const borrower = formatVerification("BORROWER");

    const guarantor = row.guarantor_name
      ? formatVerification("GUARANTOR")
      : null;

    // Current shared Zebrs schema does not contain
    // co-applicant information.
    const coApplicant = null;

    // 3. Complete loan response
    const loan = {
      ...row,

      guarantor: row.guarantor_name
        ? {
            name: row.guarantor_name,
            dob: row.guarantor_dob,
            pan: row.guarantor_pan,
            mobile: row.guarantor_mobile,
            email: row.guarantor_email,
            relationship_with_borrower: row.relationship_with_borrower,
          }
        : null,

      loan_details: {
        requested_loan_amount: row.requested_loan_amount,
        loan_amount: row.loan_amount,
        interest_rate: row.interest_rate,
        apr: row.apr,
        loan_tenure: row.loan_tenure,
        disbursal_amount: row.disbursal_amount,
        processing_fee: row.processing_fee,
        processing_fee_percentage: row.processing_fee_percentage,
      },

      permanent_address: {
        address_line_1: row.permanent_address_line_1,
        address_line_2: row.permanent_address_line_2,
        city: row.permanent_village_city,
        district: row.permanent_district,
        state: row.permanent_state,
        pincode: row.permanent_pincode,
        ownership: row.residence_ownership,
      },

      bank_details: {
        customer_name_as_per_bank: row.customer_name_as_per_bank,
        customer_bank_name: row.customer_bank_name,
        customer_account_number: row.customer_account_number,
        bank_ifsc_code: row.bank_ifsc_code,
        bank_status: row.bank_status,
      },

      dealer_details: {
        dealer_id: row.dealer_id,
        dealer_name: row.dealer_name,
        dealer_contact: row.dealer_contact,
      },

      product_details: {
        battery_name: row.battery_name,
        battery_type: row.battery_type,
        battery_serial_no_1: row.battery_serial_no_1,
        battery_serial_no_2: row.battery_serial_no_2,
        chassis_no: row.chassis_no,
        manufacturing_year: row.manufacturing_year,
        sales_invoice_number: row.sales_invoice_number,
        sales_invoice_date: row.sales_invoice_date,
        downpayment_paid_by_borrower: row.downpayment_paid_by_borrower,
        vehicle_registration_cost: row.vehicle_registration_cost,
      },

      verification_status: {
        borrower,
        guarantor,
        co_applicant: coApplicant,
      },

      verification_links: {
        borrower_aadhaar_url: borrower.aadhaar_kyc_url,
        guarantor_aadhaar_url: guarantor?.aadhaar_kyc_url || null,
        co_applicant_aadhaar_url: null,
      },

      esign_details: {
        agreement_status: row.agreement_esign_status,
        document_id: row.agreement_esign_document_id,
        sanction_status: row.sanction_esign_status,
      },

      nach_details: {
        umrn: row.enach_umrn || null,
      },
    };

    // 4. BRE response
    const bre = {
      status: row.zebrs_bre_status,
      reason: row.zebrs_bre_reason,
      checked_at: row.zebrs_bre_checked_at,
      cibil_score: row.cibil_score,
      bureau_score: row.bureau_score,
      enquiries_30d: row.zebrs_enquiries_30d,
      dpd_6m_flag: row.zebrs_dpd_6m_flag,
      overdue_12m_flag: row.zebrs_overdue_12m_flag,
      written_off_3y_flag: row.zebrs_written_off_3y_flag,
      dpd_30plus_24m_flag: row.zebrs_30plus_24m_flag,
      dpd_90plus_36m_flag: row.zebrs_90plus_36m_flag,
      max_dpd_6m: row.zebrs_max_dpd_6m,
      max_dpd_24m: row.zebrs_max_dpd_24m,
      max_dpd_36m: row.zebrs_max_dpd_36m,
      emi_overdue_amount: row.zebrs_emi_overdue_amount,
      cc_overdue_flag: row.zebrs_cc_overdue_amount,
      credit_card_overdue_amount: row.zebrs_credit_card_overdue_amount,
      deviation_flag: row.zebrs_deviation_flag,
    };

    return res.status(200).json({
      success: true,
      message: "Zebrs customer details fetched successfully",
      loan,
      kyc: borrower,
      bre,
    });
  } catch (error) {
    console.error("Zebrs customer-details error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch Zebrs customer details",
    });
  }
});

router.get("/credit-initiated-loans", authenticateUser, async (req, res) => {
  const {
    page = "1",
    pageSize = "50",
    search = "",
    sortBy = "lan",
    sortDir = "desc",
  } = req.query;

  const table = "loan_booking_zebrs";
  const prefix = "ZBCL";

  const pg = Math.max(1, parseInt(page, 10) || 1);

  const limit = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 50));

  const offset = (pg - 1) * limit;

  const safeSortDir = String(sortDir).toLowerCase() === "asc" ? "ASC" : "DESC";

  const allowedSort = [
    "lan",
    "partner_loan_id",
    "customer_name",
    "mobile_number",
    "loan_amount",
    "status",
    "stage",
    "created_at",
    "updated_at",
    "zebrs_bre_checked_at",
  ];

  const sortCol = allowedSort.includes(sortBy) ? sortBy : "created_at";

  try {
    const searchText = String(search || "").trim();

    const searchClause = searchText
      ? `
          AND (
            lb.lan LIKE ?
            OR lb.customer_name LIKE ?
            OR lb.partner_loan_id LIKE ?
            OR lb.mobile_number LIKE ?
          )
        `
      : "";

    const searchParams = searchText ? Array(4).fill(`%${searchText}%`) : [];

    // ONLY pending Credit Initiated cases.
    // Rejected cases are fetched by the separate
    // /bre-rejected-loans endpoint.
    const whereClause = `
        WHERE lb.status = 'Credit Initiated'
          AND lb.stage IN (
            'BRE Deviation',
            'BRE Approved'
          )
          AND lb.lan LIKE ?
          ${searchClause}
      `;

    const countSql = `
        SELECT COUNT(*) AS total
        FROM ?? lb
        ${whereClause}
      `;

    const dataSql = `
        SELECT
          lb.id,
          lb.lan,
          lb.partner_loan_id,

          lb.customer_name,
          lb.mobile_number,
          lb.pan_card,

          lb.loan_amount,
          lb.requested_loan_amount,
          lb.disbursal_amount,
          lb.interest_rate,
          lb.loan_tenure,

          lb.cibil_score,
          lb.bureau_score,

          lb.zebrs_bre_status,
          lb.zebrs_bre_reason,
          lb.zebrs_bre_checked_at,

          lb.status,
          lb.stage,

          lb.credit_rejection_remark,

          lb.created_at,
          lb.updated_at

        FROM ?? lb
        ${whereClause}

        ORDER BY lb.\`${sortCol}\` ${safeSortDir}
        LIMIT ? OFFSET ?
      `;

    const [[countRows], [rows]] = await Promise.all([
      db.promise().query(countSql, [table, `${prefix}%`, ...searchParams]),

      db
        .promise()
        .query(dataSql, [table, `${prefix}%`, ...searchParams, limit, offset]),
    ]);

    return res.status(200).json({
      rows,
      pagination: {
        page: pg,
        pageSize: limit,
        total: Number(countRows[0]?.total || 0),
      },
    });
  } catch (error) {
    console.error("Error fetching Zebrs Credit Initiated Loans:", error);

    return res.status(500).json({
      success: false,
      message: "Database error fetching Zebrs credit initiated loans",
    });
  }
});

router.patch("/credit-decision/:lan", authenticateUser, async (req, res) => {
  const lan = String(req.params.lan || "")
    .trim()
    .toUpperCase();

  const action = String(req.body?.action || "")
    .trim()
    .toLowerCase();

  const remark = String(req.body?.remark || "").trim();

  if (!/^ZBCL\d+$/.test(lan)) {
    return res.status(400).json({
      success: false,
      message: "Invalid Zebrs LAN",
    });
  }

  if (!["approve", "reject"].includes(action)) {
    return res.status(400).json({
      success: false,
      message: "Action must be approve or reject",
    });
  }

  if (action === "reject") {
    if (remark.length < 5 || remark.length > 1000) {
      return res.status(400).json({
        success: false,
        message: "Rejection reason must be 5 to 1000 characters",
      });
    }
  }

  try {
    const approved = action === "approve";

    const newStatus = approved ? "Operations Initiated" : "Rejected";

    const newStage = approved ? "Credit Approved" : "Credit Rejected";

    const [result] = await db.promise().query(
      `
          UPDATE loan_booking_zebrs
          SET
            status = ?,
            stage = ?,
            credit_rejection_remark = ?,
            updated_at = NOW()
          WHERE lan = ?
            AND status = 'Credit Initiated'
            AND stage IN ('BRE Deviation', 'BRE Approved')
        `,
      [newStatus, newStage, approved ? null : remark, lan],
    );

    if (result.affectedRows === 0) {
      return res.status(409).json({
        success: false,
        message: "Loan not found or already processed",
      });
    }

    return res.status(200).json({
      success: true,
      message: approved
        ? "Zebrs loan approved successfully"
        : "Zebrs loan rejected successfully",
      lan,
      status: newStatus,
      stage: newStage,
      credit_rejection_remark: approved ? null : remark,
    });
  } catch (error) {
    console.error("Zebrs credit decision error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update Zebrs loan",
    });
  }
});

router.get("/operation-initiated-loans", authenticateUser, async (req, res) => {
  const {
    page = "1",
    pageSize = "25",
    search = "",
    sortBy = "lan",
    sortDir = "desc",
  } = req.query;

  const table = "loan_booking_zebrs";
  const prefix = "ZBCL";

  const pg = Math.max(1, parseInt(page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 25));
  const offset = (pg - 1) * limit;

  const allowedSort = [
    "lan",
    "partner_loan_id",
    "customer_name",
    "mobile_number",
    "loan_amount",
    "created_at",
    "updated_at",
    "zebrs_bre_checked_at",
  ];

  const sortCol = allowedSort.includes(sortBy) ? sortBy : "lan";

  const safeSortDir = String(sortDir).toLowerCase() === "asc" ? "ASC" : "DESC";

  try {
    const searchText = String(search || "").trim();

    const searchClause = searchText
      ? `
          AND (
            lb.lan LIKE ?
            OR lb.customer_name LIKE ?
            OR lb.partner_loan_id LIKE ?
            OR lb.mobile_number LIKE ?
          )
        `
      : "";

    const searchParams = searchText ? Array(4).fill(`%${searchText}%`) : [];

    const whereClause = `
        WHERE lb.status = 'Operations Initiated'
          AND lb.stage = 'Credit Approved'
          AND lb.lan LIKE ?
          ${searchClause}
      `;

    const countSql = `
        SELECT COUNT(*) AS total
        FROM ?? lb
        ${whereClause}
      `;

    const dataSql = `
        SELECT
          lb.id,
          lb.lan,
          lb.partner_loan_id,

          lb.customer_name,
          lb.mobile_number,
          lb.email,
          lb.pan_card,

          lb.loan_amount,
          lb.requested_loan_amount,
          lb.disbursal_amount,
          lb.interest_rate,
          lb.apr,
          lb.loan_tenure,
          lb.processing_fee,
          lb.processing_fee_percentage,

          lb.cibil_score,
          lb.bureau_score,

          lb.zebrs_bre_status,
          lb.zebrs_bre_reason,
          lb.zebrs_bre_checked_at,

          lb.customer_name_as_per_bank,
          lb.customer_bank_name,
          lb.customer_account_number,
          lb.bank_ifsc_code,
          lb.bank_status,

          lb.agreement_esign_status,
          lb.agreement_esign_document_id,
          lb.sanction_esign_status,
          lb.enach_umrn,

          lb.login_date,
          lb.status,
          lb.stage,
          lb.created_at,
          lb.updated_at

        FROM ?? lb
        ${whereClause}

        ORDER BY lb.\`${sortCol}\` ${safeSortDir}

        LIMIT ? OFFSET ?
      `;

    const queryParams = [table, `${prefix}%`, ...searchParams];

    const [[countRows], [rows]] = await Promise.all([
      db.promise().query(countSql, queryParams),
      db.promise().query(dataSql, [...queryParams, limit, offset]),
    ]);

    return res.status(200).json({
      rows,
      pagination: {
        page: pg,
        pageSize: limit,
        total: Number(countRows[0]?.total || 0),
      },
    });
  } catch (error) {
    console.error("Error fetching Zebrs Operations Initiated Loans:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch Zebrs operations initiated loans",
    });
  }
});

router.post("/:lan/approve", authenticateUser, async (req, res) => {
  try {
    const lan = String(req.params.lan || "")
      .trim()
      .toUpperCase();

    if (!/^ZBCL\d+$/.test(lan)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Zebrs LAN",
      });
    }

    const [result] = await db.promise().query(
      `
        UPDATE loan_booking_zebrs
        SET
          status = 'Approved',
          stage = 'Operation Approved',
          updated_at = NOW()
        WHERE lan = ?
          AND status = 'Operations Initiated'
          AND stage = 'Credit Approved'
          AND UPPER(TRIM(COALESCE(bank_status, ''))) =
              'MANDATE_CREATED'
        `,
      [lan],
    );

    if (result.affectedRows === 0) {
      const [rows] = await db.promise().query(
        `
          SELECT status, stage, bank_status
          FROM loan_booking_zebrs
          WHERE lan = ?
          LIMIT 1
          `,
        [lan],
      );

      if (!rows.length) {
        return res.status(404).json({
          success: false,
          message: "Zebrs loan not found",
        });
      }

      const loan = rows[0];

      if (
        String(loan.bank_status || "")
          .trim()
          .toUpperCase() !== "MANDATE_CREATED"
      ) {
        return res.status(400).json({
          success: false,
          message: "Loan cannot be approved until mandate is created",
        });
      }

      return res.status(409).json({
        success: false,
        message: "Loan already processed or not in Operations Initiated stage",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Zebrs loan approved successfully",
      lan,
      status: "Approved",
      stage: "Operation Approved",
    });
  } catch (error) {
    console.error("Zebrs Operations Approve Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to approve Zebrs loan",
    });
  }
});

router.post("/:lan/reject", authenticateUser, async (req, res) => {
  try {
    const lan = String(req.params.lan || "")
      .trim()
      .toUpperCase();

    const reason = String(req.body?.reason || req.body?.remark || "").trim();

    if (!/^ZBCL\d+$/.test(lan)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Zebrs LAN",
      });
    }

    if (reason.length < 5 || reason.length > 1000) {
      return res.status(400).json({
        success: false,
        message: "Rejection reason must be between 5 and 1000 characters",
      });
    }

    const [result] = await db.promise().query(
      `
        UPDATE loan_booking_zebrs
        SET
          status = 'Rejected',
          stage = 'Operation Rejected',
          operation_rejection_remark = ?,
          updated_at = NOW()
        WHERE lan = ?
          AND status = 'Operations Initiated'
          AND stage = 'Credit Approved'
          AND UPPER(TRIM(COALESCE(bank_status, ''))) =
              'MANDATE_CREATED'
        `,
      [reason, lan],
    );

    if (result.affectedRows === 0) {
      const [rows] = await db.promise().query(
        `
          SELECT status, stage, bank_status
          FROM loan_booking_zebrs
          WHERE lan = ?
          LIMIT 1
          `,
        [lan],
      );

      if (!rows.length) {
        return res.status(404).json({
          success: false,
          message: "Zebrs loan not found",
        });
      }

      if (
        String(rows[0].bank_status || "")
          .trim()
          .toUpperCase() !== "MANDATE_CREATED"
      ) {
        return res.status(400).json({
          success: false,
          message: "Loan cannot be rejected until mandate is created",
        });
      }

      return res.status(409).json({
        success: false,
        message: "Loan already processed or not in Operations Initiated stage",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Zebrs loan rejected successfully",
      lan,
      status: "Rejected",
      stage: "Operation Rejected",
      operation_rejection_remark: reason,
    });
  } catch (error) {
    console.error("Zebrs Operations Reject Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to reject Zebrs loan",
    });
  }
});

router.get("/bre-rejected-loans", authenticateUser, async (req, res) => {
  const {
    page = "1",
    pageSize = "50",
    search = "",
    sortBy = "updated_at",
    sortDir = "desc",
  } = req.query;

  const pageNumber = Math.max(1, parseInt(page, 10) || 1);

  const limit = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 50));

  const offset = (pageNumber - 1) * limit;

  const allowedSort = [
    "lan",
    "partner_loan_id",
    "customer_name",
    "mobile_number",
    "loan_amount",
    "status",
    "stage",
    "created_at",
    "updated_at",
    "zebrs_bre_checked_at",
  ];

  const sortColumn = allowedSort.includes(sortBy) ? sortBy : "updated_at";

  const direction = String(sortDir).toLowerCase() === "asc" ? "ASC" : "DESC";

  try {
    const searchText = String(search || "").trim();

    const searchClause = searchText
      ? `
          AND (
            lb.lan LIKE ?
            OR lb.partner_loan_id LIKE ?
            OR lb.customer_name LIKE ?
            OR lb.mobile_number LIKE ?
            OR lb.zebrs_bre_reason LIKE ?
            OR lb.credit_rejection_remark LIKE ?
            OR lb.operation_rejection_remark LIKE ?
          )
        `
      : "";

    const searchParams = searchText ? Array(7).fill(`%${searchText}%`) : [];

    /*
     * Rejected Zebrs cases:
     *
     * 1. BRE failed/rejected
     * 2. Credit rejected
     * 3. Operation rejected
     *
     * BRE flags do not make an already-approved
     * or disbursed loan appear as a rejected case.
     */
    const whereClause = `
        WHERE lb.lan LIKE ?
          AND (
            (
              UPPER(TRIM(COALESCE(lb.status, '')))
                IN ('BRE REJECTED', 'BRE FAILED')
            )
            OR
            (
              UPPER(TRIM(COALESCE(lb.stage, '')))
                IN (
                  'BRE REJECTED',
                  'BRE FAILED',
                  'CREDIT REJECTED',
                  'OPERATION REJECTED'
                )
            )
            OR
            (
              UPPER(TRIM(COALESCE(lb.status, ''))) =
                'REJECTED'
            )
            OR
            (
              UPPER(TRIM(COALESCE(lb.zebrs_bre_status, '')))
                IN ('REJECTED', 'BRE REJECTED', 'BRE FAILED')
              AND UPPER(TRIM(COALESCE(lb.status, '')))
                NOT IN (
                  'APPROVED',
                  'OPERATIONS INITIATED',
                  'DISBURSED',
                  'DISBURSE INITIATE'
                )
              AND UPPER(TRIM(COALESCE(lb.stage, '')))
                NOT IN (
                  'CREDIT APPROVED',
                  'OPERATION APPROVED'
                )
            )
          )
          ${searchClause}
      `;

    const countSql = `
        SELECT COUNT(*) AS total
        FROM loan_booking_zebrs lb
        ${whereClause}
      `;

    const dataSql = `
        SELECT
          lb.id,
          lb.lan,
          lb.partner_loan_id,
          lb.customer_name,
          lb.mobile_number,
          lb.pan_card,
          lb.email,

          lb.loan_amount,
          lb.interest_rate,
          lb.loan_tenure,

          lb.cibil_score,
          lb.bureau_score,

          lb.status,
          lb.stage,
          lb.bank_status,

          lb.zebrs_bre_status,
          lb.zebrs_bre_reason,
          lb.zebrs_bre_checked_at,

          lb.credit_rejection_remark,
          lb.operation_rejection_remark,

          CASE
            WHEN UPPER(TRIM(COALESCE(lb.stage, '')))
              = 'OPERATION REJECTED'
              THEN 'Operation Rejected'

            WHEN UPPER(TRIM(COALESCE(lb.stage, '')))
              = 'CREDIT REJECTED'
              THEN 'Credit Rejected'

            WHEN UPPER(TRIM(COALESCE(lb.stage, '')))
              IN ('BRE FAILED', 'BRE REJECTED')
              THEN 'BRE Rejected'

            WHEN UPPER(TRIM(COALESCE(lb.status, '')))
              IN ('BRE FAILED', 'BRE REJECTED')
              THEN 'BRE Rejected'

            WHEN UPPER(TRIM(COALESCE(lb.zebrs_bre_status, '')))
              IN ('REJECTED', 'BRE REJECTED', 'BRE FAILED')
              THEN 'BRE Rejected'

            ELSE 'Rejected'
          END AS rejection_type,

          CASE
            WHEN UPPER(TRIM(COALESCE(lb.stage, '')))
              = 'OPERATION REJECTED'
              THEN COALESCE(
                NULLIF(TRIM(lb.operation_rejection_remark), ''),
                NULLIF(TRIM(lb.zebrs_bre_reason), '')
              )

            WHEN UPPER(TRIM(COALESCE(lb.stage, '')))
              = 'CREDIT REJECTED'
              THEN COALESCE(
                NULLIF(TRIM(lb.credit_rejection_remark), ''),
                NULLIF(TRIM(lb.zebrs_bre_reason), '')
              )

            ELSE COALESCE(
              NULLIF(TRIM(lb.zebrs_bre_reason), ''),
              NULLIF(TRIM(lb.credit_rejection_remark), ''),
              NULLIF(TRIM(lb.operation_rejection_remark), '')
            )
          END AS rejection_remark,

          lb.created_at,
          lb.updated_at

        FROM loan_booking_zebrs lb

        ${whereClause}

        ORDER BY lb.\`${sortColumn}\` ${direction},
                 lb.id DESC

        LIMIT ? OFFSET ?
      `;

    const params = ["ZBCL%", ...searchParams];

    const [[countRows], [rows]] = await Promise.all([
      db.promise().query(countSql, params),

      db.promise().query(dataSql, [...params, limit, offset]),
    ]);

    return res.status(200).json({
      success: true,
      rows,
      pagination: {
        page: pageNumber,
        pageSize: limit,
        total: Number(countRows[0]?.total || 0),
      },
    });
  } catch (error) {
    console.error("Zebrs BRE Rejected Loans Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch Zebrs rejected loans",
    });
  }
});

module.exports = router;
