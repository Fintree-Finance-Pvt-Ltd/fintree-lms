const express = require("express");
const db = require("../../config/db");
const verifyApiKey = require("../../middleware/apiKeyAuth");
const authenticateUser = require("../../middleware/verifyToken");
const { runBureau } = require("../../services/Bueraupullapiservice");
const { sendClientWebhook } = require("./yaMoneyWebhookService");
const { runBRE } = require("./yaMoneyBre");

const router = express.Router();

const TABLE_NAME = "loan_booking_ya_money";
const SEQUENCE_KEY = "YA_MONEY_BUSINESS_LOAN";

const LENDER = "Ya Money";
const PRODUCT = "Ya Money";
const LOAN_TYPE = "Business Loan";
const LAN_PREFIX = "YAM";

function clean(value) {
  return String(value ?? "").trim();
}

function digitsOnly(value) {
  return clean(value).replace(/\D/g, "");
}

function nullIfEmpty(value) {
  const text = clean(value);
  return text || null;
}

function upperOrNull(value) {
  const text = clean(value);
  return text ? text.toUpperCase() : null;
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function readNumber(value) {
  const text = clean(value).replace(/,/g, "");
  return text ? Number(text) : NaN;
}

function roundAmount(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function isValidDate(value) {
  const dateText = clean(value);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) {
    return false;
  }

  const [year, month, day] = dateText.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function calculateAgeFromDob(value) {
  const dobText = clean(value);

  if (!isValidDate(dobText)) {
    return NaN;
  }

  const [year, month, day] = dobText.split("-").map(Number);
  const today = new Date();
  let age = today.getFullYear() - year;
  const monthDelta = today.getMonth() + 1 - month;

  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < day)) {
    age -= 1;
  }

  return age;
}

function splitName(fullName) {
  const parts = clean(fullName).split(/\s+/).filter(Boolean);
  const firstName = parts[0] || "";
  const lastName = parts.length > 1 ? parts[parts.length - 1] : firstName;
  const middleName = parts.length > 2 ? parts.slice(1, -1).join(" ") : "";

  return {
    firstName,
    middleName,
    lastName,
  };
}

function serializeBureauResponse(response) {
  if (response === null || response === undefined) {
    return null;
  }

  if (typeof response === "string") {
    return response;
  }

  try {
    return JSON.stringify(response);
  } catch (error) {
    return JSON.stringify({
      serialization_error: true,
      message: error.message,
    });
  }
}

function isLikelyXml(value) {
  const text = clean(value);
  return text.startsWith("<") && text.includes(">");
}

function validateLoginData(data) {
  if (!data.partnerLoanId) {
    return "partner_loan_id is required";
  }

  if (!data.customer_name) {
    return "customer_name is required";
  }

  if (!/^[6-9]\d{9}$/.test(data.mobile_number)) {
    return "mobile_number must be a valid 10-digit Indian mobile number";
  }

  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    return "email is invalid";
  }

  if (!data.pan_number) {
    return "pan_number is required";
  }

  if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(data.pan_number)) {
    return "pan_number is invalid";
  }

  if (!data.aadhaar_number) {
    return "aadhaar_number is required";
  }

  if (!/^\d{12}$/.test(data.aadhaar_number)) {
    return "aadhaar_number must be 12 digits";
  }

  if (!data.customer_address) {
    return "customer_address is required";
  }

  if (!data.customer_city) {
    return "customer_city is required";
  }

  if (!data.customer_state) {
    return "customer_state is required";
  }

  if (!data.customer_pincode) {
    return "customer_pincode is required";
  }

  if (!/^[1-9][0-9]{5}$/.test(data.customer_pincode)) {
    return "customer_pincode must be 6 digits";
  }

  if (!isValidDate(data.dob)) {
    return "dob must be a valid date in YYYY-MM-DD format";
  }

  if (
    !Number.isInteger(data.loan_tenure) ||
    data.loan_tenure < 6 ||
    data.loan_tenure > 24
  ) {
    return "loan_tenure must be between 6 and 24 months";
  }

  if (!Number.isFinite(data.requested_amount) || data.requested_amount <= 0) {
    return "requested_amount must be greater than zero";
  }

  if (
    data.gst_number &&
    !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(data.gst_number)
  ) {
    return "gst_number is invalid";
  }

  if (
    data.udyam_number &&
    !/^UDYAM-[A-Z]{2}-[0-9]{2}-[0-9]{7}$/.test(data.udyam_number)
  ) {
    return "udyam_number is invalid. Expected format: UDYAM-MH-12-1234567";
  }

  if (data.business_pincode && !/^[1-9][0-9]{5}$/.test(data.business_pincode)) {
    return "business_pincode must be 6 digits";
  }

  return null;
}

async function findDuplicateFields(connection, data) {
  const duplicateFields = [];

  const fieldsToCheck = [
    {
      column: "partner_loan_id",
      value: data.partnerLoanId,
      message: "Partner loan id already exists",
    },
    {
      column: "mobile_number",
      value: data.mobile_number,
      message: "Mobile number already exists",
    },
    {
      column: "pan_number",
      value: data.pan_number,
      message: "PAN number already exists",
    },
    {
      column: "aadhaar_number",
      value: data.aadhaar_number,
      message: "Aadhaar number already exists",
    },
  ];

  for (const field of fieldsToCheck) {
    if (!field.value) {
      continue;
    }

    const [rows] = await connection.query(
      `SELECT id FROM ${TABLE_NAME} WHERE ${field.column} = ? LIMIT 1`,
      [field.value],
    );

    if (rows.length > 0) {
      duplicateFields.push({
        field: field.column,
        message: field.message,
      });
    }
  }

  return duplicateFields;
}

async function generateLoanIds(connection) {
  const [rows] = await connection.query(
    `SELECT last_sequence
     FROM loan_sequences
     WHERE lender_name = ?
     FOR UPDATE`,
    [SEQUENCE_KEY],
  );

  const nextSequence = rows.length ? Number(rows[0].last_sequence) + 1 : 11000;

  if (rows.length) {
    await connection.query(
      `UPDATE loan_sequences
       SET last_sequence = ?
       WHERE lender_name = ?`,
      [nextSequence, SEQUENCE_KEY],
    );
  } else {
    await connection.query(
      `INSERT INTO loan_sequences (lender_name, last_sequence)
       VALUES (?, ?)`,
      [SEQUENCE_KEY, nextSequence],
    );
  }

  return {
    lan: `${LAN_PREFIX}${nextSequence}`,
  };
}

async function insertLogin(connection, data, ids, createdBy) {
  const row = {
    partner_loan_id: data.partnerLoanId,
    lan: ids.lan,
    lender: LENDER,
    product: PRODUCT,
    loan_type: LOAN_TYPE,
    login_date: data.login_date,
    age: data.age,
    annual_income: data.annual_income,
    customer_name: data.customer_name,
    mobile_number: data.mobile_number,
    email: data.email,
    pan_number: data.pan_number,
    aadhaar_number: data.aadhaar_number || null,
    customer_address: data.customer_address,
    customer_pincode: data.customer_pincode,
    customer_city: data.customer_city,
    customer_state: data.customer_state,
    requested_amount: data.requested_amount,
    loan_amount: null,
    business_name: data.business_name,
    business_type: data.business_type,
    gst_number: data.gst_number,
    udyam_number: data.udyam_number,
    business_address: data.business_address,
    business_pincode: data.business_pincode,
    business_city: data.business_city,
    business_state: data.business_state,
    status: "Login",
    stage: "Login",
    created_by: createdBy,
    updated_by: createdBy,
  };
  const columns = Object.keys(row);
  const placeholders = columns.map(() => "?").join(", ");

  const [result] = await connection.query(
    `INSERT INTO ${TABLE_NAME} (${columns.join(", ")})
     VALUES (${placeholders})`,
    Object.values(row),
  );
  return result.insertId;
}

function buildBureauPayload(data) {
  const name = splitName(data.customer_name);

  return {
    enquiry_reason: "05",
    customer_name: data.customer_name,
    first_name: name.firstName,
    middle_name: name.middleName,
    last_name: name.lastName,
    dob: data.dob,
    gender: data.gender,
    pan_number: data.pan_number,
    mobile_number: data.mobile_number,
    current_address: data.customer_address,
    current_village_city: data.customer_city,
    current_state: data.customer_state,
    current_pincode: data.customer_pincode,
    loan_amount: data.requested_amount,
    loan_tenure: data.loan_tenure,
  };
}

async function updateLoanBureauScoreIfPresent(lan, score) {
  if (score === null || score === undefined) {
    return;
  }

  try {
    await db.promise().query(
      `UPDATE ${TABLE_NAME}
       SET cibil_score = ?
       WHERE lan = ?`,
      [score, lan],
    );
  } catch (error) {
    if (error.code === "ER_BAD_FIELD_ERROR") {
      console.warn(
        "[YA-MONEY] cibil_score column missing; score saved in loan_cibil_reports",
        { lan },
      );
      return;
    }

    throw error;
  }
}

async function persistBureauResult(lan, data, bureauResult) {
  const responseText = serializeBureauResponse(bureauResult?.response);
  const score = bureauResult?.score ?? null;
  const bureauVerified =
    bureauResult?.success === true && score !== null && score !== undefined;

  await db.promise().query(
    "INSERT IGNORE INTO kyc_verification_status (lan) VALUES (?)",
    [lan],
  );

  await db.promise().query(
    `UPDATE kyc_verification_status
     SET bureau_status = ?,
         bureau_api_response = ?
     WHERE lan = ?`,
    [bureauVerified ? "VERIFIED" : "FAILED", responseText, lan],
  );

  if (bureauVerified && isLikelyXml(responseText)) {
    await db.promise().query(
      `INSERT INTO loan_cibil_reports (lan, pan_number, score, report_xml, created_at)
       VALUES (?, ?, ?, ?, NOW())`,
      [lan, data.pan_number, score, responseText],
    );
  }

  await updateLoanBureauScoreIfPresent(lan, score);

  return {
    success: bureauVerified,
    status: bureauVerified ? "VERIFIED" : "FAILED",
    score,
  };
}

async function pullAndPersistBureau(lan, data) {
  const bureauResult = await runBureau(buildBureauPayload(data));
  const persisted = await persistBureauResult(lan, data, bureauResult);

  return {
    ...persisted,
    raw_success: bureauResult?.success === true,
  };
}

async function updateBreStatus(connection, insertId, breResult, updatedBy) {
  const status = breResult.eligible ? "bre_approved" : "bre_rejected";
  const reason = breResult.reason || "ELIGIBLE";

  await connection.query(
    `UPDATE ${TABLE_NAME}
     SET status = ?,
         stage = ?,
         bre_reason = ?,
         updated_by = ?
     WHERE id = ?`,
    [status, status, reason, updatedBy, insertId],
  );

  return status;
}

function sendServerError(res, error) {
  console.error("Ya Money route error:", error);

  const messages = {
    ER_NO_SUCH_TABLE: "Ya Money table is missing",
    ER_BAD_FIELD_ERROR: "Ya Money table columns do not match the API code",
    ER_DUP_ENTRY: "Duplicate Ya Money login",
  };

  return res.status(error.code === "ER_DUP_ENTRY" ? 409 : 500).json({
    success: false,
    message: messages[error.code] || "Something went wrong",
  });
}

function getUserName(req) {
  return req.user?.name || req.user?.id || null;
}

async function updateCreditStatus(lan, status, updatedBy) {
  const [result] = await db.promise().query(
    `UPDATE ${TABLE_NAME}
     SET status = ?,
         stage = ?,
         updated_by = ?
     WHERE lan = ?
       AND status = 'bre_approved'`,
    [status, status, updatedBy, lan],
  );

  if (!result.affectedRows) {
    return null;
  }

  const [[loan]] = await db.promise().query(
    `SELECT
       lan,
       customer_name,
       mobile_number,
       requested_amount,
       COALESCE(loan_amount, requested_amount) AS approved_amount
     FROM ${TABLE_NAME}
     WHERE lan = ?
     LIMIT 1`,
    [lan],
  );

  return loan || null;
}

function sendApprovalWebhook(loan, approvedBy) {
  const payload = {
    event: "LOAN_APPROVED",
    lan: loan.lan,
    customer_name: loan.customer_name,
    mobile_number: loan.mobile_number,
    requested_amount: Number(loan.requested_amount),
    approved_amount: Number(loan.approved_amount),
    status: "credit_approved",
    approved_by: approvedBy,
    approved_at: new Date().toISOString(),
  };

  setImmediate(() => {
    sendClientWebhook(payload).catch((error) => {
      console.error("[YA-MONEY] Credit approval webhook error", {
        lan: loan.lan,
        message: error.message,
      });
    });
  });
}

function readFinalLoanData(body) {
  return {
    loan_amount: readNumber(body.loan_amount),
    loan_tenure: readNumber(body.loan_tenure ?? body.tenure),
    interest: readNumber(
      body.interest ??
        body.interest_rate ??
        body.intrest_rate ??
        body.intrests_rate,
    ),
    umrn: clean(body.umrn).toUpperCase(),
    sanction_date: clean(body.sanction_date ?? body.saction_date),
    processing_fee: clean(body.processing_fee)
      ? readNumber(body.processing_fee)
      : null,
    processing_fee_percent: clean(body.processing_fee_percent)
      ? readNumber(body.processing_fee_percent)
      : null,
  };
}

function validateFinalLoanData(data, savedCase) {
  const requestedAmount = Number(savedCase.requested_amount);

  if (!Number.isFinite(data.loan_amount) || data.loan_amount <= 0) {
    return "loan_amount is required";
  }

  if (data.loan_amount < 10000 || data.loan_amount > 200000) {
    return "loan_amount must be between 10,000 and 2,00,000";
  }

  if (data.loan_amount > requestedAmount) {
    return "loan_amount must be less than or equal to requested_amount";
  }

  if (
    !Number.isInteger(data.loan_tenure) ||
    data.loan_tenure < 6 ||
    data.loan_tenure > 24
  ) {
    return "loan_tenure must be between 6 and 24 months";
  }

  if (
    !Number.isFinite(data.interest) ||
    data.interest < 0 ||
    data.interest > 100
  ) {
    return "interest must be between 0 and 100";
  }

  if (!data.umrn) {
    return "umrn is required";
  }

  if (data.umrn.length > 50) {
    return "umrn must be 50 characters or less";
  }

  if (!isValidDate(data.sanction_date)) {
    return "sanction_date must be a valid date in YYYY-MM-DD format";
  }

  if (
    data.processing_fee !== null &&
    (!Number.isFinite(data.processing_fee) || data.processing_fee < 0)
  ) {
    return "processing_fee must be zero or more";
  }

  if (
    data.processing_fee_percent !== null &&
    (!Number.isFinite(data.processing_fee_percent) ||
      data.processing_fee_percent < 0 ||
      data.processing_fee_percent > 100)
  ) {
    return "processing_fee_percent must be between 0 and 100";
  }

  return null;
}

function calculateEmi(loanAmount, interest, tenure) {
  const monthlyRate = interest / 12 / 100;

  if (monthlyRate === 0) {
    return loanAmount / tenure;
  }

  const multiplier = Math.pow(1 + monthlyRate, tenure);
  return (loanAmount * monthlyRate * multiplier) / (multiplier - 1);
}

function calculateFinalAmounts(data) {
  let processingFee = 0;

  if (data.processing_fee !== null) {
    processingFee = data.processing_fee;
  } else if (data.processing_fee_percent !== null) {
    processingFee = (data.loan_amount * data.processing_fee_percent) / 100;
  }

  return {
    emi_amount: roundAmount(
      calculateEmi(data.loan_amount, data.interest, data.loan_tenure),
    ),
    processing_fee: roundAmount(processingFee),
    net_disbursement: roundAmount(data.loan_amount - processingFee),
  };
}

async function getCaseByLan(lan) {
  const [[loan]] = await db.promise().query(
    `SELECT id, lan, requested_amount, status
     FROM ${TABLE_NAME}
     WHERE lan = ?
     LIMIT 1`,
    [lan],
  );

  return loan || null;
}

async function saveFinalLoanDetails(lan, data, calculation, updatedBy) {
  const [result] = await db.promise().query(
    `UPDATE ${TABLE_NAME}
     SET loan_amount = ?,
         loan_tenure = ?,
         interest = ?,
         umrn = ?,
         sanction_date = ?,
         emi_amount = ?,
         processing_fee = ?,
         net_disbursement = ?,
         status = 'final_approved',
         stage = 'final_approved',
         updated_by = ?
     WHERE lan = ?
       AND status = 'credit_approved'`,
    [
      data.loan_amount,
      data.loan_tenure,
      data.interest,
      data.umrn,
      data.sanction_date,
      calculation.emi_amount,
      calculation.processing_fee,
      calculation.net_disbursement,
      updatedBy,
      lan,
    ],
  );

  return result.affectedRows > 0;
}

router.post("/login", verifyApiKey, async (req, res) => {
  let connection;
  let transactionStarted = false;

  try {
    const body = req.body || {};

    const requestedAmount =
      body.requested_amount ?? body.requiested_amount ?? body.loan_amount;
    const dob = clean(body.dob ?? body.date_of_birth ?? body.customer_dob);

    const data = {
      login_date: todayDate(),
      partnerLoanId: clean(body.partner_loan_id),
      dob,
      age: calculateAgeFromDob(dob),
      annual_income: body.annual_income || null,
      loan_tenure: readNumber(
        body.loan_tenure ?? body.tenure ?? body.requested_tenure,
      ),
      gender: nullIfEmpty(body.gender) || "Male",
      customer_name: clean(body.customer_name),
      mobile_number: digitsOnly(body.mobile_number),
      email: nullIfEmpty(body.email)?.toLowerCase() || null,
      pan_number: upperOrNull(body.pan_number),
      aadhaar_number: digitsOnly(body.aadhaar_number || body.aadhar_number),

      customer_address: nullIfEmpty(body.customer_address),
      customer_pincode: digitsOnly(body.customer_pincode) || null,
      customer_city: nullIfEmpty(body.customer_city),
      customer_state: nullIfEmpty(body.customer_state),

      requested_amount: Number(clean(requestedAmount).replace(/,/g, "")),

      business_name: nullIfEmpty(body.business_name),
      business_type: nullIfEmpty(body.business_type),
      gst_number: upperOrNull(body.gst_number),
      udyam_number: upperOrNull(body.udyam_number),

      business_address: nullIfEmpty(body.business_address),
      business_pincode: digitsOnly(body.business_pincode) || null,
      business_city: nullIfEmpty(body.business_city),
      business_state: nullIfEmpty(body.business_state),
    };
    const validationError = validateLoginData(data);

    if (validationError) {
      return res.status(400).json({
        success: false,
        message: validationError,
      });
    }

    connection = await db.promise().getConnection();
    await connection.beginTransaction();
    transactionStarted = true;

    const duplicates = await findDuplicateFields(connection, data);

    if (duplicates.length) {
      await connection.rollback();
      transactionStarted = false;

      return res.status(409).json({
        success: false,
        message: duplicates.map((item) => item.message).join(", "),
        duplicate_fields: duplicates.map((item) => item.field),
      });
    }

    const ids = await generateLoanIds(connection);
    const createdBy = req.partner?.name || null;
    const insertId = await insertLogin(connection, data, ids, createdBy);
    await connection.commit();
    transactionStarted = false;
    connection.release();
    connection = null;

    const bureau = await pullAndPersistBureau(ids.lan, data);
    const breResult = runBRE({
      loan_amount: data.requested_amount,
      age: data.age,
      annual_income: data.annual_income,
      bureau_score: bureau.score,
    });
    const finalStatus = await updateBreStatus(
      db.promise(),
      insertId,
      breResult,
      createdBy,
    );

    return res.status(201).json({
      success: true,
      message: "Ya Money login created",
      data: {
        id: insertId,
        partner_loan_id: data.partnerLoanId,
        lan: ids.lan,
        status: finalStatus,
        bureau,
        bre: breResult,
      },
    });
  } catch (error) {
    if (connection && transactionStarted) {
      await connection.rollback();
    }

    return sendServerError(res, error);
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

router.patch("/:lan/credit-decision", authenticateUser, async (req, res) => {
  try {
    const lan = clean(req.params.lan).toUpperCase();
    const decision = clean(
      req.body?.decision || req.body?.status,
    ).toLowerCase();
    const decisionStatusMap = {
      approve: "credit_approved",
      approved: "credit_approved",
      credit_approved: "credit_approved",
      reject: "credit_rejected",
      rejected: "credit_rejected",
      credit_rejected: "credit_rejected",
    };

    if (!lan) {
      return res.status(400).json({
        success: false,
        message: "LAN is required",
      });
    }

    const status = decisionStatusMap[decision];

    if (!status) {
      return res.status(400).json({
        success: false,
        message: "decision must be approve or reject",
      });
    }

    const updatedBy = getUserName(req);
    const loan = await updateCreditStatus(lan, status, updatedBy);

    if (!loan) {
      return res.status(404).json({
        success: false,
        message: "Case not found or not in bre_approved status",
      });
    }

    if (status === "credit_approved") {
      sendApprovalWebhook(loan, updatedBy);
    }

    return res.json({
      success: true,
      message:
        status === "credit_approved"
          ? "Case credit approved"
          : "Case credit rejected",
      data: {
        lan,
        status,
      },
    });
  } catch (error) {
    return sendServerError(res, error);
  }
});

router.patch("/:lan/final-details", authenticateUser, async (req, res) => {
  try {
    const lan = clean(req.params.lan).toUpperCase();

    if (!lan) {
      return res.status(400).json({
        success: false,
        message: "LAN is required",
      });
    }

    const savedCase = await getCaseByLan(lan);

    if (!savedCase) {
      return res.status(404).json({
        success: false,
        message: "Case not found",
      });
    }

    if (savedCase.status !== "credit_approved") {
      return res.status(409).json({
        success: false,
        message: "Case must be credit_approved before final details",
      });
    }

    const data = readFinalLoanData(req.body || {});
    const validationError = validateFinalLoanData(data, savedCase);

    if (validationError) {
      return res.status(400).json({
        success: false,
        message: validationError,
      });
    }

    const calculation = calculateFinalAmounts(data);

    if (calculation.processing_fee > data.loan_amount) {
      return res.status(400).json({
        success: false,
        message: "processing_fee cannot be greater than loan_amount",
      });
    }

    const affectedRows = await saveFinalLoanDetails(
      lan,
      data,
      calculation,
      getUserName(req),
    );

    if (!affectedRows) {
      return res.status(409).json({
        success: false,
        message: "Case must be credit_approved before final details",
      });
    }

    return res.json({
      success: true,
      message: "Final loan details saved",
      data: {
        lan,
        status: "final_approved",
        loan_amount: data.loan_amount,
        loan_tenure: data.loan_tenure,
        interest: data.interest,
        umrn: data.umrn,
        sanction_date: data.sanction_date,
        emi_amount: calculation.emi_amount,
        processing_fee: calculation.processing_fee,
        net_disbursement: calculation.net_disbursement,
      },
    });
  } catch (error) {
    return sendServerError(res, error);
  }
});

module.exports = router;
