const express = require("express");
const db = require("../../config/db");
const verifyApiKey = require("../../middleware/apiKeyAuth");
const crypto = require("crypto");
const runBRE = require("./runBre");
const { allocateRepaymentByLAN } = require("../../utils/allocate");
const { excelSerialDateToJS, queryDB } = require("../../utils/helpers");
const { sendRejectionWebhook, sendDisbursementWebhook } = require("./switchMyLoanWebhook");
const router = express.Router();

const parsePartnerDate = (dateStr) => {
  if (!dateStr) return null;

  const months = {
    Jan: "01",
    Feb: "02",
    Mar: "03",
    Apr: "04",
    May: "05",
    Jun: "06",
    Jul: "07",
    Aug: "08",
    Sep: "09",
    Oct: "10",
    Nov: "11",
    Dec: "12",
  };

  const parts = String(dateStr).split("-");
  if (parts.length !== 3) {
    throw new Error("Invalid date format. Expected DD-MMM-YYYY");
  }

  const [day, mon, year] = parts;
  const month = months[mon];

  if (!month) {
    throw new Error("Invalid month in date");
  }

  return `${year}-${month}-${String(day).padStart(2, "0")}`;
};
const parseApiDate = (value) => {
  if (!value) return null;

  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  if (typeof value === "string" && /^\d{2}-\d{2}-\d{4}$/.test(value)) {
    const [d, m, y] = value.split("-");
    return `${y}-${m}-${d}`;
  }

  if (typeof value === "string" && /^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
    const [d, m, y] = value.split("/");
    return `${y}-${m}-${d}`;
  }

  return null;
};

const toClientError = (err) => {
  if (!err) return { message: "Unknown error" };
  const { message, code, errno, sqlState, sqlMessage } = err;
  return { message: sqlMessage || message || "Error", code, errno, sqlState };
};

async function processRows(sheetData, res) {
  const successRows = [];
  const rowErrors = [];
  const missingLANs = [];
  const duplicateUTRs = [];

  try {
    if (!sheetData.length) {
      return res.status(400).json({ message: "Empty or invalid data" });
    }

    /**
     * Normalize headers (Excel + JSON compatibility)
     */
    sheetData = sheetData.map((row) => ({
      LAN: row.LAN || row.lan,
      UTR: row.UTR || row.utr,

      "Payment Date": row["Payment Date"] || row.payment_date,

      "Bank Date":
        row["Bank Date"] ||
        row.bank_date ||
        row["Payment Date"] ||
        row.payment_date,

      "Payment Id": row["Payment Id"] || row.payment_id,

      "Payment Mode": row["Payment Mode"] || row.payment_mode,

      "Transfer Amount": row["Transfer Amount"] || row.transfer_amount,

      __row: row.__row,
    }));

    /**
     * Validate required columns
     */
    const required = [
      "LAN",
      "UTR",
      "Payment Date",
      "Payment Id",
      "Payment Mode",
      "Transfer Amount",
    ];

    const missingHeaders = required.filter((h) => !(h in sheetData[0]));

    if (missingHeaders.length) {
      return res.status(400).json({
        message: "Missing required column(s)",
        details: { missing_headers: missingHeaders },
      });
    }

    /**
     * Fetch valid LANs
     */
    const uniqueLANs = [
      ...new Set(sheetData.map((r) => r["LAN"]).filter(Boolean)),
    ];

    let validLANs = new Set();

    if (uniqueLANs.length) {
      const results = await Promise.all([
        queryDB(`SELECT lan FROM loan_booking_switch_my_loan WHERE lan IN (?)`, [uniqueLANs]),
      ]);

      validLANs = new Set(results.flat().map((r) => r.lan));
    }

    /**
     * Process each row
     */
    for (const row of sheetData) {
      const rowNumber = row.__row || 1;

      const lan = row["LAN"];
      const utr = row["UTR"];

      const bank_date =
        typeof row["Bank Date"] === "string"
          ? row["Bank Date"]
          : excelSerialDateToJS(row["Bank Date"]);

      const payment_date =
        typeof row["Payment Date"] === "string"
          ? row["Payment Date"]
          : excelSerialDateToJS(row["Payment Date"]);
          
      const payment_id = row["Payment Id"];
      const payment_mode = row["Payment Mode"];
      const transfer_amount = row["Transfer Amount"];

      /**
       * Validation
       */
      if (
        !lan ||
        !utr ||
        !payment_date ||
        !payment_id ||
        !payment_mode ||
        !transfer_amount
      ) {
        rowErrors.push({
          row: rowNumber,
          lan,
          utr,
          bank_date,
          payment_date,
          payment_id,
          payment_mode,
          transfer_amount,
          stage: "validation",
          reason: "Missing required fields",
        });

        continue;
      }

      /**
       * LAN existence check
       */
      if (!validLANs.has(lan)) {
        if (!missingLANs.includes(lan)) {
          missingLANs.push(lan);
        }

        rowErrors.push({
          row: rowNumber,
          lan,
          utr,
          stage: "validation",
          reason: "LAN not found",
        });

        continue;
      }

      /**
       * Select upload table
       */
      let table = "repayments_upload";

      if (lan.startsWith("ADK")) {
        table = "repayments_upload_adikosh";
      }

      /**
       * Duplicate UTR check
       */
      const [dup] = await queryDB(
        `SELECT COUNT(*) AS cnt FROM ${table} WHERE utr = ?`,
        [utr],
      );

      if (dup.cnt > 0) {
        if (!duplicateUTRs.includes(utr)) {
          duplicateUTRs.push(utr);
        }

        rowErrors.push({
          row: rowNumber,
          lan,
          utr,
          stage: "pre-insert",
          reason: "Duplicate UTR",
        });

        continue;
      }

      /**
       * Penal charge SP
       */
      await queryDB(`CALL sp_generate_penal_charge(?)`, [lan]);

      /**
       * Insert repayment
       */
      await queryDB(
        `INSERT INTO ${table}
        (lan, bank_date, utr, payment_date, payment_id, payment_mode, transfer_amount)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          lan,
          bank_date,
          utr,
          payment_date,
          payment_id,
          payment_mode,
          transfer_amount,
        ],
      );

      /**
       * Allocation
       */
      await allocateRepaymentByLAN(lan, {
        lan,
        bank_date,
        utr,
        payment_date,
        payment_id,
        payment_mode,
        transfer_amount,
      });

      successRows.push(rowNumber);
    }

    return res.json({
      message: `Upload completed. ${successRows.length} row(s) processed successfully.`,
      total_rows: sheetData.length,
      inserted_rows: successRows.length,
      failed_rows: rowErrors.length,
      success_rows: successRows,
      row_errors: rowErrors,
      missing_lans: missingLANs,
      duplicate_utrs: duplicateUTRs,
    });
  } catch (err) {
    console.error("Processor error:", err);

    return res.status(500).json({
      message: "Processing failed",
      error: toClientError(err),
    });
  }
}

const generateApplicationId = () => {
  return crypto.randomUUID();
};

const normalizeDate = (date) => {
  if (!date) return null;

  const apiFormat = parseApiDate(date);
  if (apiFormat) return apiFormat;

  const partnerFormat = parsePartnerDate(date);
  if (partnerFormat) return partnerFormat;

  throw new Error("Invalid date format. Use YYYY-MM-DD or DD-MMM-YYYY");
};

const generateLoanIdentifiers = async (connection, lender) => {
  const normalizedLender = lender.trim();

  let prefixLan;

  if (normalizedLender === "SWITCH-MY-LOAN") {
    prefixLan = "SML10";
  } else {
    throw new Error("Invalid lender type.");
  }

  const [rows] = await connection.query(
    "SELECT last_sequence FROM loan_sequences WHERE lender_name = ? FOR UPDATE",
    [normalizedLender]
  );

  let newSequence;

  if (rows.length > 0) {
    newSequence = rows[0].last_sequence + 1;
    await connection.query(
      "UPDATE loan_sequences SET last_sequence = ? WHERE lender_name = ?",
      [newSequence, normalizedLender]
    );
  } else {
    newSequence = 11000;
    await connection.query(
      "INSERT INTO loan_sequences (lender_name, last_sequence) VALUES (?, ?)",
      [normalizedLender, newSequence]
    );
  }

  return {
    lan: `${prefixLan}${newSequence}`,
  };
};

const normalizeCreateUpdatePayload = (data) => {
  return {
    full_name: data.full_name ?? null,
    pan_number: data.pan_number ?? null,
    father_name: data.father_name ?? null,
    dob: data.dob ?? null,
    gender: data.gender ?? null,
    mobile: data.mobile ?? null,
    email: data.email ?? null,
    pincode: data.pincode ?? null,
    state: data.state ?? null,
    city: data.city ?? null,
    district: data.district ?? null,

    residence_status: data.residence_status ?? null,
    employment_type: data.employment_type ?? null,
    company_type: data.company_type ?? null,
    company_name: data.company_name ?? null,
    designation: data.designation ?? null,
    salary_range: data.salary_range ?? null,
    salary_mode: data.salary_mode ?? null,
    nature_of_business: data.nature_of_business ?? null,
    industry_type: data.industry_type ?? null,
    monthly_income: data.monthly_income ?? null,

    address_line_1: data.address_line_1 ?? null,
    address_line_2: data.address_line_2 ?? null,
    address_pincode: data.address_pincode ?? null,
    address_city: data.address_city ?? null,
    address_state: data.address_state ?? null,
    is_current_address:
      data.is_current_address === undefined ? null : data.is_current_address,
    current_address_line_1: data.current_address_line_1 ?? null,
    current_address_line_2: data.current_address_line_2 ?? null,
    current_address_pincode: data.current_address_pincode ?? null,
    current_address_city: data.current_address_city ?? null,
    current_address_state: data.current_address_state ?? null,

    loan_amount: data.loan_amount ?? null,
    tenure: data.tenure ?? null,
    loan_type: data.loan_type ?? null,
    monthly_emi: data.monthly_emi ?? null,
    interest_rate: data.interest_rate ?? null,
    processing_fee: data.processing_fee ?? null,
    repayment_count: data.repayment_count ?? null,
    payment_frequency: data.payment_frequency ?? null,
    loan_application_date: data.loan_application_date
      ? normalizeDate(data.loan_application_date)
      : null,
    agreement_date: data.agreement_date
      ? normalizeDate(data.agreement_date)
      : null,
    repayment_date: data.repayment_date
      ? normalizeDate(data.repayment_date)
      : null,
    agreement_signature_type: data.agreement_signature_type ?? null,
    source: data.source ?? null,
    preferred_language: data.preferred_language ?? null,
    previous_loan_amount: data.previous_loan_amount ?? null,
    total_disbursed_applications: data.total_disbursed_applications ?? null,

    bank_ac_name: data.bank_account?.ac_name ?? null,
    bank_ac_number: data.bank_account?.ac_number ?? null,
    bank_ifsc_code: data.bank_account?.ifsc_code ?? null,
    bank_nach_umrn: data.bank_account?.nach_umrn ?? null,
    bank_upi_id: data.bank_account?.upi_id ?? null,

    kyc_json: data.kyc ? JSON.stringify(data.kyc) : null,
    bank_json: data.bank_account ? JSON.stringify(data.bank_account) : null,
  };
};

// 1) ASSESSMENT FEE API
router.post("/v1/loan/assessment-fee", verifyApiKey, async (req, res) => {
  let connection;
  let transactionStarted = false;

  try {
    connection = await db.promise().getConnection();

    const { partner_loan_id, amount, payment_date, payment_id } = req.body;

    if (!partner_loan_id) {
      return res.status(400).json({
        is_success: false,
        error: {
          message: "partner_loan_id is required",
          code: "request_validation_error",
        },
      });
    }

    if (amount === undefined || amount === null || Number(amount) <= 0) {
      return res.status(400).json({
        is_success: false,
        error: {
          message: "amount must be greater than 0",
          code: "request_validation_error",
        },
      });
    }

    if (!payment_date) {
      return res.status(400).json({
        is_success: false,
        error: {
          message: "payment_date is required",
          code: "request_validation_error",
        },
      });
    }

    if (!payment_id) {
      return res.status(400).json({
        is_success: false,
        error: {
          message: "payment_id is required",
          code: "request_validation_error",
        },
      });
    }

    const formattedPaymentDate = parsePartnerDate(payment_date);

    await connection.beginTransaction();
    transactionStarted = true;

    const [existingPayment] = await connection.query(
      `SELECT id FROM switch_my_loan_assessment_fee WHERE payment_id = ? LIMIT 1`,
      [payment_id]
    );

    if (existingPayment.length > 0) {
      await connection.rollback();
      transactionStarted = false;

      return res.status(409).json({
        is_success: false,
        error: {
          message: "payment_id already exists",
          code: "duplicate_payment_id",
        },
      });
    }

    const [existingCase] = await connection.query(
      `SELECT id, application_id, partner_loan_id, lan
       FROM loan_booking_switch_my_loan
       WHERE partner_loan_id = ?
       LIMIT 1`,
      [partner_loan_id]
    );

    let applicationId;
    let lan = null;

    if (existingCase.length > 0) {
      applicationId = existingCase[0].application_id;
      lan = existingCase[0].lan || null;

      if (!applicationId) {
        applicationId = generateApplicationId();

        await connection.query(
          `UPDATE loan_booking_switch_my_loan
           SET application_id = ?
           WHERE partner_loan_id = ?`,
          [applicationId, partner_loan_id]
        );
      }
    } else {
      applicationId = generateApplicationId();

      await connection.query(
        `INSERT INTO loan_booking_switch_my_loan (
          lan,
          application_id,
          partner_loan_id,
          assessment_fee_amount,
          assessment_fee_payment_date,
          assessment_fee_payment_id,
          assessment_fee_status,
          status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          null,
          applicationId,
          partner_loan_id,
          amount,
          formattedPaymentDate,
          payment_id,
          "RECEIVED",
          "ASSESSMENT_FEE_RECEIVED",
        ]
      );
    }

    await connection.query(
      `INSERT INTO switch_my_loan_assessment_fee (
        application_id,
        partner_loan_id,
        lan,
        amount,
        payment_date,
        payment_id,
        api_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        applicationId,
        partner_loan_id,
        lan,
        amount,
        formattedPaymentDate,
        payment_id,
        "RECEIVED",
      ]
    );

    await connection.query(
      `UPDATE loan_booking_switch_my_loan
       SET
         assessment_fee_amount = ?,
         assessment_fee_payment_date = ?,
         assessment_fee_payment_id = ?,
         assessment_fee_status = ?,
         status = ?
       WHERE partner_loan_id = ?`,
      [
        amount,
        formattedPaymentDate,
        payment_id,
        "RECEIVED",
        "ASSESSMENT_FEE_RECEIVED",
        partner_loan_id,
      ]
    );

    await connection.commit();
    transactionStarted = false;

    return res.json({
      is_success: true,
      data: {
        status: "assessment fee details submitted successfully",
        application_id: applicationId,
      },
    });
  } catch (err) {
    if (connection && transactionStarted) {
      await connection.rollback();
    }

    console.error("Assessment fee API error:", err);

    return res.status(500).json({
      is_success: false,
      error: {
        message: err.message || "Failed to submit assessment fee details",
        code: "server_error",
      },
    });
  } finally {
    if (connection) connection.release();
  }
});

// 2) CREATE / SUBMIT LOAN APPLICATION
router.post("/v1/create", verifyApiKey, async (req, res) => {
  let connection;
  let transactionStarted = false;

  try {
    connection = await db.promise().getConnection();

    const data = req.body;

    if (!data.partner_loan_id) {
      return res.status(400).json({
        message: "partner_loan_id required",
      });
    }

    if (!data.lenderType || data.lenderType !== "SWITCH-MY-LOAN") {
      return res.status(400).json({
        message: "Invalid lenderType",
      });
    }

    const payload = normalizeCreateUpdatePayload(data);

    await connection.beginTransaction();
    transactionStarted = true;

    // 🔍 Check if assessment-fee entry exists
    const [existing] = await connection.query(
      `SELECT id, lan, application_id, status
       FROM loan_booking_switch_my_loan
       WHERE partner_loan_id = ?
       LIMIT 1`,
      [data.partner_loan_id]
    );

    // ❌ If assessment-fee not called first → reject
    if (!existing.length) {
      await connection.rollback();
      transactionStarted = false;

      return res.status(400).json({
        message:
          "Assessment fee not received. Cannot create loan case.",
      });
    }

    const existingCase = existing[0];

    // ❌ Prevent duplicate create calls
    if (
      existingCase.status === "STEP_1_COMPLETED" ||
      existingCase.status === "DETAILS_UPDATED" ||
      existingCase.status === "APPLICATION_COMPLETED"
    ) {
      await connection.rollback();
      transactionStarted = false;

      return res.status(409).json({
        message: "Loan case already created",
        lan: existingCase.lan,
        application_id: existingCase.application_id,
      });
    }

    // ❌ Only allow creation after assessment fee
    if (existingCase.status !== "ASSESSMENT_FEE_RECEIVED") {
      await connection.rollback();
      transactionStarted = false;

      return res.status(400).json({
        message:
          "Loan case not eligible for creation at current stage",
      });
    }

    let lan = existingCase.lan;
    let applicationId = existingCase.application_id;

    // Generate application_id if missing
    if (!applicationId) {
      applicationId = generateApplicationId();

      await connection.query(
        `UPDATE loan_booking_switch_my_loan
         SET application_id = ?
         WHERE partner_loan_id = ?`,
        [applicationId, data.partner_loan_id]
      );
    }

    // Generate LAN if missing
    if (!lan) {
      const generated = await generateLoanIdentifiers(
        connection,
        "SWITCH-MY-LOAN"
      );

      lan = generated.lan;
    }

    // ✅ Update existing record only
    await connection.query(
      `UPDATE loan_booking_switch_my_loan
       SET
         lan = ?,
         application_id = ?,
         full_name = ?,
         pan_number = ?,
         father_name = ?,
         dob = ?,
         gender = ?,
         mobile = ?,
         email = ?,
         pincode = ?,
         state = ?,
         city = ?,
         district = ?,
         residence_status = ?,
         employment_type = ?,
         company_type = ?,
         company_name = ?,
         designation = ?,
         salary_range = ?,
         salary_mode = ?,
         nature_of_business = ?,
         industry_type = ?,
         monthly_income = ?,
         address_line_1 = ?,
         address_line_2 = ?,
         address_pincode = ?,
         address_city = ?,
         address_state = ?,
         is_current_address = ?,
         current_address_line_1 = ?,
         current_address_line_2 = ?,
         current_address_pincode = ?,
         current_address_city = ?,
         current_address_state = ?,
         loan_amount = ?,
         tenure = ?,
         loan_type = ?,
         monthly_emi = ?,
         interest_rate = ?,
         processing_fee = ?,
         repayment_count = ?,
         payment_frequency = ?,
         loan_application_date = ?,
         agreement_date = ?,
         repayment_date = ?,
         agreement_signature_type = ?,
         source = ?,
         preferred_language = ?,
         previous_loan_amount = ?,
         total_disbursed_applications = ?,
         bank_ac_name = ?,
         bank_ac_number = ?,
         bank_ifsc_code = ?,
         bank_nach_umrn = ?,
         bank_upi_id = ?,
         kyc_json = ?,
         bank_json = ?,
         status = ?
       WHERE partner_loan_id = ?`,
      [
        lan,
        applicationId,
        payload.full_name,
        payload.pan_number,
        payload.father_name,
        payload.dob,
        payload.gender,
        payload.mobile,
        payload.email,
        payload.pincode,
        payload.state,
        payload.city,
        payload.district,
        payload.residence_status,
        payload.employment_type,
        payload.company_type,
        payload.company_name,
        payload.designation,
        payload.salary_range,
        payload.salary_mode,
        payload.nature_of_business,
        payload.industry_type,
        payload.monthly_income,
        payload.address_line_1,
        payload.address_line_2,
        payload.address_pincode,
        payload.address_city,
        payload.address_state,
        payload.is_current_address,
        payload.current_address_line_1,
        payload.current_address_line_2,
        payload.current_address_pincode,
        payload.current_address_city,
        payload.current_address_state,
        payload.loan_amount,
        payload.tenure,
        payload.loan_type,
        payload.monthly_emi,
        payload.interest_rate,
        payload.processing_fee,
        payload.repayment_count,
        payload.payment_frequency,
        payload.loan_application_date,
        payload.agreement_date,
        payload.repayment_date,
        payload.agreement_signature_type,
        payload.source,
        payload.preferred_language,
        payload.previous_loan_amount,
        payload.total_disbursed_applications,
        payload.bank_ac_name,
        payload.bank_ac_number,
        payload.bank_ifsc_code,
        payload.bank_nach_umrn,
        payload.bank_upi_id,
        payload.kyc_json,
        payload.bank_json,
        "STEP_1_COMPLETED",
        data.partner_loan_id,
      ]
    );

    await connection.commit();
    transactionStarted = false;

    return res.json({
      message: "Loan case created",
      lan,
      application_id: applicationId,
    });
  } catch (err) {
    if (connection && transactionStarted) {
      await connection.rollback();
    }

    console.error("Create loan error:", err);

    return res.status(500).json({
      message: "Creation failed",
      error: err.message,
    });
  } finally {
    if (connection) connection.release();
  }
});

router.put("/v1/update-details", verifyApiKey, async (req, res) => {
  let connection;
  let transactionStarted = false;

  try {
    connection = await db.promise().getConnection();

    const data = req.body;

    if (!data.partner_loan_id) {
      return res.status(400).json({
        message: "partner_loan_id is required",
      });
    }

    await connection.beginTransaction();
    transactionStarted = true;

    const [existing] = await connection.query(
      `SELECT *
       FROM loan_booking_switch_my_loan
       WHERE partner_loan_id = ?
       LIMIT 1`,
      [data.partner_loan_id]
    );

    if (!existing.length) {
      await connection.rollback();
      transactionStarted = false;

      return res.status(404).json({
        message: "Loan case not found",
      });
    }

    const row = existing[0];

    if (row.status === "ASSESSMENT_FEE_RECEIVED") {
      await connection.rollback();
      transactionStarted = false;

      return res.status(400).json({
        message: "Loan case not yet created. Call create API first.",
      });
    }

    let lan = row.lan;
    let applicationId = row.application_id;

    const preUpdateFields = [];
    const preUpdateValues = [];

    if (!applicationId) {
      applicationId = generateApplicationId();
      preUpdateFields.push("application_id = ?");
      preUpdateValues.push(applicationId);
    }

    if (!lan) {
      const generated = await generateLoanIdentifiers(
        connection,
        "SWITCH-MY-LOAN"
      );
      lan = generated.lan;
      preUpdateFields.push("lan = ?");
      preUpdateValues.push(lan);
    }

    if (preUpdateFields.length > 0) {
      preUpdateValues.push(data.partner_loan_id);

      await connection.query(
        `UPDATE loan_booking_switch_my_loan
         SET ${preUpdateFields.join(", ")}
         WHERE partner_loan_id = ?`,
        preUpdateValues
      );
    }

    const updateFields = [];
    const updateValues = [];

    const addField = (column, value) => {
      if (value !== undefined) {
        updateFields.push(`${column} = ?`);
        updateValues.push(value);
      }
    };

    // basic fields
    addField("full_name", data.full_name);
    addField("pan_number", data.pan_number);
    addField("father_name", data.father_name);
    addField("dob", data.dob);
    addField("gender", data.gender);
    addField("mobile", data.mobile);
    addField("email", data.email);

    addField("pincode", data.pincode);
    addField("state", data.state);
    addField("city", data.city);
    addField("district", data.district);

    addField("residence_status", data.residence_status);
    addField("employment_type", data.employment_type);
    addField("company_type", data.company_type);
    addField("company_name", data.company_name);
    addField("designation", data.designation);
    addField("salary_range", data.salary_range);
    addField("salary_mode", data.salary_mode);

    addField("nature_of_business", data.nature_of_business);
    addField("industry_type", data.industry_type);
    addField("monthly_income", data.monthly_income);

    addField("address_line_1", data.address_line_1);
    addField("address_line_2", data.address_line_2);
    addField("address_pincode", data.address_pincode);
    addField("address_city", data.address_city);
    addField("address_state", data.address_state);

    addField("is_current_address", data.is_current_address);

    addField("current_address_line_1", data.current_address_line_1);
    addField("current_address_line_2", data.current_address_line_2);
    addField("current_address_pincode", data.current_address_pincode);
    addField("current_address_city", data.current_address_city);
    addField("current_address_state", data.current_address_state);

    addField("loan_amount", data.loan_amount);
    addField("tenure", data.tenure);
    addField("loan_type", data.loan_type);
    addField("monthly_emi", data.monthly_emi);
    addField("interest_rate", data.interest_rate);
    addField("processing_fee", data.processing_fee);

    addField("repayment_count", data.repayment_count);
    addField("payment_frequency", data.payment_frequency);

    addField(
      "loan_application_date",
      data.loan_application_date
        ? normalizeDate(data.loan_application_date)
        : undefined
    );
    addField(
      "agreement_date",
      data.agreement_date
        ? normalizeDate(data.agreement_date)
        : undefined
    );
    addField(
      "repayment_date",
      data.repayment_date
        ? normalizeDate(data.repayment_date)
        : undefined
    );

    addField("agreement_signature_type", data.agreement_signature_type);
    addField("source", data.source);
    addField("preferred_language", data.preferred_language);

    addField("previous_loan_amount", data.previous_loan_amount);
    addField("total_disbursed_applications", data.total_disbursed_applications);

    // nested bank_account payload support
    if (data.bank_account) {
      addField("bank_ac_name", data.bank_account.ac_name);
      addField("bank_ac_number", data.bank_account.ac_number);
      addField("bank_ifsc_code", data.bank_account.ifsc_code);
      addField("bank_nach_umrn", data.bank_account.nach_umrn);
      addField("bank_upi_id", data.bank_account.upi_id);
    }

    // nested kyc payload support
    if (data.kyc !== undefined) {
      addField("kyc_json", JSON.stringify(data.kyc));
    }

    // nested bank_account payload support
    if (data.bank_account) {
      addField("bank_json", JSON.stringify(data.bank_account));
    }


    if (updateFields.length === 0) {
      await connection.rollback();
      transactionStarted = false;

      return res.status(400).json({
        message: "No fields provided for update",
      });
    }

    // merged-state status logic
    const effectiveLoanAmount =
      data.loan_amount !== undefined ? data.loan_amount : row.loan_amount;
    const effectiveTenure =
      data.tenure !== undefined ? data.tenure : row.tenure;

    const status =
      effectiveLoanAmount && effectiveTenure
        ? "APPLICATION_COMPLETED"
        : "DETAILS_UPDATED";

    updateFields.push("status = ?");
    updateValues.push(status);

    updateValues.push(data.partner_loan_id);

    await connection.query(
      `UPDATE loan_booking_switch_my_loan
       SET ${updateFields.join(", ")}
       WHERE partner_loan_id = ?`,
      updateValues
    );

    await connection.commit();
    transactionStarted = false;

    return res.json({
      message: "Loan details updated successfully",
      lan,
      application_id: applicationId,
    });
  } catch (error) {
    if (connection && transactionStarted) {
      await connection.rollback();
    }

    console.error("Update details error:", error);

    return res.status(500).json({
      message: "Failed to update loan details",
      error: error.message,
    });
  } finally {
    if (connection) connection.release();
  }
});



///        4)      approve api
// 4) APPROVE API
router.post(
  "/v1/loan/:application_id/approve",
  verifyApiKey,
  async (req, res) => {
    let connection;
    let transactionStarted = false;

    try {
      connection = await db.promise().getConnection();

      const { application_id } = req.params;
      const { onboarding_completed } = req.body;

      if (!application_id) {
        return res.status(400).json({
          is_success: false,
          error: {
            message: "application_id is required",
            code: "request_validation_error",
          },
        });
      }

      if (typeof onboarding_completed !== "boolean") {
        return res.status(400).json({
          is_success: false,
          error: {
            message: "onboarding_completed must be boolean",
            code: "request_validation_error",
          },
        });
      }

      const [existing] = await connection.query(
        `SELECT *
         FROM loan_booking_switch_my_loan
         WHERE application_id = ?
         LIMIT 1`,
        [application_id]
      );

      if (!existing.length) {
        return res.status(404).json({
          is_success: false,
          error: {
            message: "Loan application not found",
            code: "not_found",
          },
        });
      }

      const loan = existing[0];

      if (!loan.partner_loan_id) {
        return res.status(400).json({
          is_success: false,
          error: {
            message: "partner_loan_id missing for application",
            code: "request_validation_error",
          },
        });
      }

      if (
        !loan.assessment_fee_payment_id ||
        loan.assessment_fee_status !== "RECEIVED"
      ) {
        return res.status(400).json({
          is_success: false,
          error: {
            message: "Assessment fee not completed",
            code: "request_validation_error",
          },
        });
      }

      const breEngineResult = await runBRE(loan);

if (breEngineResult.decision === "REJECTED") {


  // await sendRejectionWebhook(application_id);

  await connection.query(
    `UPDATE loan_booking_switch_my_loan
     SET status = ?
     WHERE application_id = ?`,
    ["REJECTED", application_id]
  );



  return res.status(400).json({
    is_success: false,
    error: {
      message: "Loan rejected via BRE",
      reason: breEngineResult.reason,
      aml_score: breEngineResult.amlScore
    }
  });
}

const breResponse = breEngineResult.rules;

      if (onboarding_completed === false) {
        return res.json({
          is_success: true,
          data: {
            status: "Approved",
            bre_response: breResponse,
          },
        });
      }

      await connection.beginTransaction();
      transactionStarted = true;

      await connection.query(
        `UPDATE loan_booking_switch_my_loan
         SET
           status = ?,
           updated_at = CURRENT_TIMESTAMP
         WHERE application_id = ?`,
        ["APPROVED", application_id]
      );

      await connection.commit();
      transactionStarted = false;

      return res.json({
        is_success: true,
        data: {
          status: "Approved",
          bre_response: breResponse,
        },
      });
    } catch (err) {
      if (connection && transactionStarted) {
        await connection.rollback();
      }

      console.error("Approve API error:", err);

      return res.status(500).json({
        is_success: false,
        error: {
          message: err.message || "Approval failed",
          code: "server_error",
        },
      });
    } finally {
      if (connection) connection.release();
    }
  }
);

////////////// 5) trigger fund disbursal api
router.post(
  "/v1/loan/:application_id/disburse",
  verifyApiKey,
  async (req, res) => {

    let connection;
    let transactionStarted = false;

    try {

      connection = await db.promise().getConnection();

      const { application_id } = req.params;
      const { trigger_fund } = req.body;

      if (!application_id) {
        return res.status(400).json({
          message: "application_id required"
        });
      }

      if (trigger_fund !== true) {
        return res.status(400).json({
          message: "trigger_fund must be true"
        });
      }

      await connection.beginTransaction();
      transactionStarted = true;

      const [rows] = await connection.query(
        `SELECT status, loan_amount, processing_fee
         FROM loan_booking_switch_my_loan
         WHERE application_id = ?
         LIMIT 1`,
        [application_id]
      );

      if (!rows.length) {

        await connection.rollback();
        transactionStarted = false;

        return res.status(404).json({
          message: "Loan case not found"
        });
      }

      const loan = rows[0];

      if (loan.status !== "APPROVED") {

        await connection.rollback();
        transactionStarted = false;

        return res.status(400).json({
          message: "Loan not eligible for disbursement"
        });
      }

      const disbursalAmount =
        Number(loan.loan_amount || 0) -
        Number(loan.processing_fee || 0);

      await connection.query(
        `UPDATE loan_booking_switch_my_loan
         SET status = 'DISBURSED'
         WHERE application_id = ?`,
        [application_id]
      );

      await connection.commit();
      transactionStarted = false;

      return res.json({
        is_success: true,
        data: {
          status: "Disbursal Initiated",
          amount: disbursalAmount.toFixed(2),
          transaction_time: null,
          transaction_id: null
        }
      });

    } catch (err) {

      if (connection && transactionStarted) {
        await connection.rollback();
      }

      console.error("Disburse error:", err);

      return res.status(500).json({
        message: "Disbursement failed",
        error: err.message
      });

    } finally {

      if (connection) connection.release();

    }
  }
);


///////////////////// 6) Repayment API
router.post(
  "/v1/loan/:application_id/repayment",
  verifyApiKey,
  async (req, res) => {

    try {

      const { application_id } = req.params;
      const {
        amount,
        payment_date,
        payment_id,
        payment_mode,
        utr
      } = req.body;

      if (!application_id) {
        return res.status(400).json({
          message: "application_id required"
        });
      }

      if (!amount || !payment_date || !payment_id) {
        return res.status(400).json({
          message:
            "amount, payment_date, payment_id required"
        });
      }

      const [loan] = await db.promise().query(
        `SELECT lan
         FROM loan_booking_switch_my_loan
         WHERE application_id = ?
         LIMIT 1`,
        [application_id]
      );

      if (!loan.length) {
        return res.status(404).json({
          message: "Loan case not found"
        });
      }

      const lan = loan[0].lan;

      if (!lan) {
        return res.status(400).json({
          message: "LAN not generated yet"
        });
      }

      const paymentDate = parseApiDate(payment_date);

      const sheetData = [
        {
          LAN: lan,
          UTR: utr || payment_id,
          "Payment Date": paymentDate,
          "Bank Date": paymentDate,
          "Payment Id": payment_id,
          "Payment Mode": payment_mode || "API",
          "Transfer Amount": amount,
          __row: 1
        }
      ];

      return await processRows(sheetData, res);

    } catch (err) {

      console.error("Repayment API error:", err);

      return res.status(500).json({
        message: "Repayment failed",
        error: err.message
      });

    }
  }
);

///////////////////// 7) Loan charges api 
router.post(
  "/v1/loan/:application_id/repayment-charges",
  verifyApiKey,
  async (req, res) => {
    try {
      const { application_id } = req.params;
      const { type, amount, due_date, remarks } = req.body;

      if (!application_id)
        return res.status(400).json({
          message: "application_id required",
        });

      if (!type || !amount || !due_date)
        return res.status(400).json({
          message: "type, amount, due_date required",
        });

      const [loan] = await db.promise().query(
        `SELECT lan
         FROM loan_booking_switch_my_loan
         WHERE application_id = ?
         LIMIT 1`,
        [application_id]
      );

      if (!loan.length)
        return res.status(404).json({
          message: "Loan case not found",
        });

      const lan = loan[0].lan;

      const parsedDate = parseApiDate(due_date);

      await db.promise().query(
        `INSERT INTO loan_charges
        (lan, charge_date, due_date, amount, charge_type, remarks)
        VALUES (?, CURDATE(), ?, ?, ?, ?)`,
        [lan, parsedDate, amount, type, remarks || null]
      );

      return res.json({
        is_success: true,
        message: "Charge added successfully",
        lan,
      });
    } catch (err) {
      console.error("Charge insert error:", err);

      return res.status(500).json({
        message: "Charge creation failed",
        error: err.message,
      });
    }
  }
);

/////////////////////// 8 ) extra chrges waiver api
router.post(
  "/v1/loan/extra_charge_waiver",
  verifyApiKey,
  async (req, res) => {
    try {
      const rows = req.body.data;

      if (!Array.isArray(rows) || !rows.length)
        return res.status(400).json({
          message: "Invalid payload",
        });

      for (const row of rows) {
        const {
          partner_loan_id,
          charge_type,
          waiver_amount,
        } = row;

        if (
          !partner_loan_id ||
          !charge_type ||
          !waiver_amount
        ) {
          return res.status(400).json({
            message:
              "partner_loan_id, charge_type, waiver_amount required",
          });
        }

        const [loan] = await db.promise().query(
          `SELECT lan
           FROM loan_booking_switch_my_loan
           WHERE partner_loan_id = ?
           LIMIT 1`,
          [partner_loan_id]
        );

        if (!loan.length)
          return res.status(404).json({
            message: `Loan not found for ${partner_loan_id}`,
          });

        const lan = loan[0].lan;

        const [charge] = await db.promise().query(
          `SELECT id, amount, waived_amount
           FROM loan_charges
           WHERE lan = ?
           AND charge_type = ?
           AND paid_status = 'Unpaid'
           ORDER BY due_date ASC
           LIMIT 1`,
          [lan, charge_type]
        );

        if (!charge.length)
          return res.status(404).json({
            message: "Charge not found or already settled",
          });

        const chargeRow = charge[0];

        const newWaivedAmount =
          Number(chargeRow.waived_amount) +
          Number(waiver_amount);

        const newStatus =
          newWaivedAmount >= chargeRow.amount
            ? "Waived"
            : "Partially Waived";

        await db.promise().query(
          `UPDATE loan_charges
           SET waived_amount = ?,
               waived_off = ?,
               paid_status = ?
           WHERE id = ?`,
          [
            newWaivedAmount,
            waiver_amount,
            newStatus,
            chargeRow.id,
          ]
        );
      }

      return res.json({
        is_success: true,
        message: "Charge waiver applied successfully",
      });
    } catch (err) {
      console.error("Waiver error:", err);

      return res.status(500).json({
        message: "Waiver failed",
        error: err.message,
      });
    }
  }
);

module.exports = router;















// 3) UPDATE DETAILS
// router.put("/v1/update-details", verifyApiKey, async (req, res) => {
//   let connection;
//   let transactionStarted = false;

//   try {
//     connection = await db.promise().getConnection();

//     const data = req.body;

//     if (!data.partner_loan_id) {
//       return res.status(400).json({ message: "partner_loan_id is required" });
//     }

//     const payload = normalizeCreateUpdatePayload(data);

//     await connection.beginTransaction();
//     transactionStarted = true;

//     const [existing] = await connection.query(
//       `SELECT id, lan, application_id
//        FROM loan_booking_switch_my_loan
//        WHERE partner_loan_id = ?
//        LIMIT 1`,
//       [data.partner_loan_id]
//     );

//     if (!existing.length) {
//       await connection.rollback();
//       transactionStarted = false;

//       return res.status(404).json({
//         message: "Loan case not found for provided partner_loan_id",
//       });
//     }

//     let lan = existing[0].lan || null;
//     let applicationId = existing[0].application_id || null;

//     if (!applicationId) {
//       applicationId = generateApplicationId();
//     }

//     if (!lan) {
//       const generated = await generateLoanIdentifiers(connection, "SWITCH-MY-LOAN");
//       lan = generated.lan;
//     }
    

//     await connection.query(
//       `UPDATE loan_booking_switch_my_loan
//        SET
//          lan = ?,
//          application_id = ?,
//          full_name = ?,
//          pan_number = ?,
//          father_name = ?,
//          dob = ?,
//          gender = ?,
//          mobile = ?,
//          email = ?,
//          pincode = ?,
//          state = ?,
//          city = ?,
//          district = ?,
//          residence_status = ?,
//          employment_type = ?,
//          company_type = ?,
//          company_name = ?,
//          designation = ?,
//          salary_range = ?,
//          salary_mode = ?,
//          nature_of_business = ?,
//          industry_type = ?,
//          monthly_income = ?,
//          address_line_1 = ?,
//          address_line_2 = ?,
//          address_pincode = ?,
//          address_city = ?,
//          address_state = ?,
//          is_current_address = ?,
//          current_address_line_1 = ?,
//          current_address_line_2 = ?,
//          current_address_pincode = ?,
//          current_address_city = ?,
//          current_address_state = ?,
//          loan_amount = ?,
//          tenure = ?,
//          loan_type = ?,
//          monthly_emi = ?,
//          interest_rate = ?,
//          processing_fee = ?,
//          repayment_count = ?,
//          payment_frequency = ?,
//          loan_application_date = ?,
//          agreement_date = ?,
//          repayment_date = ?,
//          agreement_signature_type = ?,
//          source = ?,
//          preferred_language = ?,
//          previous_loan_amount = ?,
//          total_disbursed_applications = ?,
//          bank_ac_name = ?,
//          bank_ac_number = ?,
//          bank_ifsc_code = ?,
//          bank_nach_umrn = ?,
//          bank_upi_id = ?,
//          kyc_json = ?,
//          status = ?
//        WHERE partner_loan_id = ?`,
//       [
//         lan,
//         applicationId,
//         payload.full_name,
//         payload.pan_number,
//         payload.father_name,
//         payload.dob,
//         payload.gender,
//         payload.mobile,
//         payload.email,
//         payload.pincode,
//         payload.state,
//         payload.city,
//         payload.district,
//         payload.residence_status,
//         payload.employment_type,
//         payload.company_type,
//         payload.company_name,
//         payload.designation,
//         payload.salary_range,
//         payload.salary_mode,
//         payload.nature_of_business,
//         payload.industry_type,
//         payload.monthly_income,
//         payload.address_line_1,
//         payload.address_line_2,
//         payload.address_pincode,
//         payload.address_city,
//         payload.address_state,
//         payload.is_current_address,
//         payload.current_address_line_1,
//         payload.current_address_line_2,
//         payload.current_address_pincode,
//         payload.current_address_city,
//         payload.current_address_state,
//         payload.loan_amount,
//         payload.tenure,
//         payload.loan_type,
//         payload.monthly_emi,
//         payload.interest_rate,
//         payload.processing_fee,
//         payload.repayment_count,
//         payload.payment_frequency,
//         payload.loan_application_date,
//         payload.agreement_date,
//         payload.repayment_date,
//         payload.agreement_signature_type,
//         payload.source,
//         payload.preferred_language,
//         payload.previous_loan_amount,
//         payload.total_disbursed_applications,
//         payload.bank_ac_name,
//         payload.bank_ac_number,
//         payload.bank_ifsc_code,
//         payload.bank_nach_umrn,
//         payload.bank_upi_id,
//         payload.kyc_json,
//         payload.loan_amount && payload.tenure
//   ? "APPLICATION_COMPLETED"
//   : "DETAILS_UPDATED",
//         data.partner_loan_id,
//       ]
//     );

//     await connection.commit();
//     transactionStarted = false;

//     return res.json({
//       message: "Step 2 + Step 3 details updated successfully",
//       lan,
//       application_id: applicationId,
//     });
//   } catch (error) {
//     if (connection && transactionStarted) {
//       await connection.rollback();
//     }

//     console.error("Update details error:", error);

//     return res.status(500).json({
//       message: "Failed to update loan details",
//       error: error.message,
//     });
//   } finally {
//     if (connection) connection.release();
//   }
// });
