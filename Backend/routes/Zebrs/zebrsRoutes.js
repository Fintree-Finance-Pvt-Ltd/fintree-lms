const db = require("../../config/db");
const express = require("express");
const verifyApiKey = require("../../middleware/apiKeyAuth");
const initAadhaarKyc = require("../../services/digitapaadharservice");
const { getPanCardDetails } = require("../../services/pancardapiservice");
const router = express.Router();

// const { runBureau } = require("../../services/Bueraupullapiservice");
const { runBureau } = require("../../services/Bueraupullapiservice");

const {
  autoApproveZebrsIfBureauVerified,
} = require("../Zebrs/zebrsBre");

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

  residence_ownership: emptyToNull(
  data.Residence_Ownership,
),
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
vehicle_registration_cost: numberOrNull(
  data.Vehicle_Registration_Cost,
),

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

    const selectedProductId = Number(data.selected_product_id);

if (
  !Number.isInteger(selectedProductId) ||
  selectedProductId <= 0
) {
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
  [
     Number(data.selected_product_id),
    dealer.application_id,
  ],
);

if (!productRows.length) {
  await conn.rollback();

  return res.status(404).json({
    success: false,
    message:
      "Selected product was not found for this Zebrs dealer",
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

    const { cust_lan, cust_partner_loan_id } = await generateLoanIdentifiers(
      "ZEBRS_CUSTOMER",
    );

   const customerPayload = buildCustomerOnboardPayload(
  data,
  cust_lan,
  cust_partner_loan_id,
  dealer,
);

await insertExistingColumns(
  conn,
  ZEBRS_LOAN_TABLE,
  customerPayload,
);

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
        [
          customerPayload.first_name,
          customerPayload.last_name,
        ]
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

      current_village_city:
        customerPayload.permanent_village_city,

      current_state:
        customerPayload.permanent_state,

      current_pincode:
        customerPayload.permanent_pincode,

      loan_amount:
        customerPayload.loan_amount,

      loan_tenure:
        customerPayload.loan_tenure,
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

  breResult =
    await autoApproveZebrsIfBureauVerified(
      cust_lan,
    );
      console.log(
    `✅ Zebrs BRE completed for LAN ${cust_lan}:`,
    breResult,
  );
} catch (breError) {
  console.error(
    `Zebrs BRE failed for LAN ${cust_lan}:`,
    breError,
  );

  breResult = {
    success: false,
    status: "ERROR",
    reason:
      breError.message ||
      String(breError),
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
      [applicationId]
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
    console.error(
      `❌ Zebrs ${applicantType}-${partyNo} Bureau Error:`,
      error,
    );

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
  bureauResult?.success === true &&
  bureauScore !== null
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
    [
      bureauStatus,
      bureauResponse,
      lan,
      applicantType,
      partyNo,
    ],
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
    [
      lan,
      applicantType,
      partyNo,
      panNumber,
      bureauScore,
      bureauResponse,
    ],
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

  console.log(
    `📌 Zebrs ${applicantType}-${partyNo} Bureau: ${bureauStatus}`,
  );

  return {
    success: Boolean(bureauResult.success),
    status: bureauStatus,
    applicantType,
    partyNo,
    score: bureauScore,
  };
}


  router.post(
  "/bre/zebrs/:lan",
  verifyApiKey,
  async (req, res) => {
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

      const breResult =
        await autoApproveZebrsIfBureauVerified(lan);

      console.log(
        `✅ Manual Zebrs BRE completed for ${lan}:`,
        breResult,
      );

      return res.status(200).json({
        success: true,
        message: "Zebrs BRE executed successfully",
        lan,
        bre: breResult,
      });
    } catch (error) {
      console.error(
        "Manual Zebrs BRE execution failed:",
        error,
      );

      return res.status(500).json({
        success: false,
        message: "Zebrs BRE execution failed",
        error:
          error.sqlMessage ||
          error.message ||
          String(error),
      });
    }
  },
);

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
          stage
         
        FROM loan_booking_zebrs
        WHERE lan = ?
        LIMIT 1
      `,
      [lan]
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
 

module.exports = router;

