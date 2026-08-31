const express = require("express");
const db = require("../../config/db");
const verifyApiKey = require("../../middleware/apiKeyAuth");

const router = express.Router();

const TABLE_NAME = "loan_booking_ya_money";
const SEQUENCE_KEY = "YA_MONEY_BUSINESS_LOAN";

const LENDER = "Ya Money";
const PRODUCT = "Ya Money";
const LOAN_TYPE = "Business Loan";
const PARTNER_LOAN_PREFIX = "YAMPL";
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

function isValidDate(dateText) {
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

function readLoginData(body) {
  const requestedAmount =
    body.requested_amount ?? body.requiested_amount ?? body.loan_amount;

  return {
    login_date: clean(body.login_date) || todayDate(),
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

    // Udyam is optional. Empty value will be saved as NULL.
    udyam_number: upperOrNull(body.udyam_number),

    business_address: nullIfEmpty(body.business_address),
    business_pincode: digitsOnly(body.business_pincode) || null,
    business_city: nullIfEmpty(body.business_city),
    business_state: nullIfEmpty(body.business_state),

    source: nullIfEmpty(body.source),
  };
}

function validateLoginData(data) {
  if (!isValidDate(data.login_date)) {
    return "login_date must be in YYYY-MM-DD format";
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

  if (data.pan_number && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(data.pan_number)) {
    return "pan_number is invalid";
  }

  if (data.aadhaar_number && !/^\d{12}$/.test(data.aadhaar_number)) {
    return "aadhaar_number must be 12 digits";
  }

  if (data.customer_pincode && !/^[1-9][0-9]{5}$/.test(data.customer_pincode)) {
    return "customer_pincode must be 6 digits";
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

  const nextSequence = rows.length
    ? Number(rows[0].last_sequence) + 1
    : 11000;

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
    partnerLoanId: `${PARTNER_LOAN_PREFIX}${nextSequence}`,
    lan: `${LAN_PREFIX}${nextSequence}`,
  };
}

async function insertLogin(connection, data, ids, createdBy) {
  const loanAmount = data.requested_amount;

  const sql = `
    INSERT INTO ${TABLE_NAME} (
      partner_loan_id,
      lan,
      lender,
      product,
      loan_type,
      login_date,
      customer_name,
      mobile_number,
      email,
      pan_number,
      aadhaar_number,
      customer_address,
      customer_pincode,
      customer_city,
      customer_state,
      requested_amount,
      loan_amount,
      business_name,
      business_type,
      gst_number,
      udyam_number,
      business_address,
      business_pincode,
      business_city,
      business_state,
      status,
      stage,
      source,
      created_by,
      updated_by
    ) VALUES (${new Array(30).fill("?").join(", ")})
  `;

  const values = [
    ids.partnerLoanId,
    ids.lan,
    LENDER,
    PRODUCT,
    LOAN_TYPE,
    data.login_date,
    data.customer_name,
    data.mobile_number,
    data.email,
    data.pan_number,
    data.aadhaar_number || null,
    data.customer_address,
    data.customer_pincode,
    data.customer_city,
    data.customer_state,
    data.requested_amount,
    loanAmount,
    data.business_name,
    data.business_type,
    data.gst_number,
    data.udyam_number,
    data.business_address,
    data.business_pincode,
    data.business_city,
    data.business_state,
    "Login",
    "Login",
    data.source,
    createdBy,
    createdBy,
  ];

  const [result] = await connection.query(sql, values);
  return result.insertId;
}

function sendServerError(res, error) {
  console.error("Ya Money login error:", error);

  if (error.code === "ER_NO_SUCH_TABLE") {
    return res.status(500).json({
      success: false,
      message: "Ya Money table is missing",
    });
  }

  if (error.code === "ER_BAD_FIELD_ERROR") {
    return res.status(500).json({
      success: false,
      message: "Ya Money table columns do not match the API code",
    });
  }

  if (error.code === "ER_DUP_ENTRY") {
    return res.status(409).json({
      success: false,
      message: "Duplicate Ya Money login",
    });
  }

  return res.status(500).json({
    success: false,
    message: "Unable to create Ya Money login",
  });
}

router.post("/yaMoney/login", verifyApiKey, async (req, res) => {
  let connection;

  try {
    const data = readLoginData(req.body || {});
    const validationError = validateLoginData(data);

    if (validationError) {
      return res.status(400).json({
        success: false,
        message: validationError,
      });
    }

    connection = await db.promise().getConnection();
    await connection.beginTransaction();

    const duplicates = await findDuplicateFields(connection, data);

    if (duplicates.length) {
      await connection.rollback();

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

    return res.status(201).json({
      success: true,
      message: "Ya Money login created",
      data: {
        id: insertId,
        partner_loan_id: ids.partnerLoanId,
        lan: ids.lan,
        status: "Login",
      },
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }

    return sendServerError(res, error);
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

module.exports = router;
