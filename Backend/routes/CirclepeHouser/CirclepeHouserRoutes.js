const express = require("express");
const db = require("../../config/db");
const verifyApiKey = require("../../middleware/apiKeyAuth");

const { generateLoanIdentifiers } = require("../excelUpload");
const { evaluateCirclePeHouserBRE } = require("./circlepeHouserBRE");
const { sendCirclePeHouserBREWebhook } = require("./circlepeHouserWebhook");
const {
  generateRepaymentScheduleCirclePeHouser,
} = require("../../utils/repaymentScheduleGenerator");

const router = express.Router();

const TABLE_NAME = "loan_booking_circle_pe_houser";
const LENDER_TYPE = "circle pe houser";

/**
 * Creates an error carrying an HTTP status code.
 */
function apiError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

/**
 * Allows temporary compatibility with:
 * 1. Recommended API snake_case keys
 * 2. Existing camelCase test keys
 * 3. Original Excel column names
 */
function firstValue(body, keys) {
  for (const key of keys) {
    if (body[key] !== undefined && body[key] !== null && body[key] !== "") {
      return body[key];
    }
  }

  return null;
}

function cleanString(value) {
  if (value === undefined || value === null) {
    return "";
  }

  return String(value).trim();
}

function cleanDigits(value) {
  return cleanString(value).replace(/\D/g, "");
}

function parseNumber(value, fieldName) {
  if (value === undefined || value === null || value === "") {
    throw apiError(400, `${fieldName} is required`);
  }

  const number = Number(String(value).replace(/,/g, "").trim());

  if (!Number.isFinite(number)) {
    throw apiError(400, `${fieldName} must be a valid number`);
  }

  return number;
}

function parseInteger(value, fieldName) {
  const number = parseNumber(value, fieldName);

  if (!Number.isInteger(number)) {
    throw apiError(400, `${fieldName} must be an integer`);
  }

  return number;
}

function validateDate(value, fieldName) {
  const date = cleanString(value);

  if (!date) {
    throw apiError(400, `${fieldName} is required`);
  }

  // API date format: YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw apiError(400, `${fieldName} must be in YYYY-MM-DD format`);
  }

  const parsedDate = new Date(`${date}T00:00:00Z`);

  if (Number.isNaN(parsedDate.getTime())) {
    throw apiError(400, `${fieldName} is not a valid date`);
  }

  return date;
}

/**
 * Maps JSON/Excel-style keys to one consistent object.
 */
function mapRequestBody(body) {
  return {
    loan_application_date: firstValue(body, [
      "loan_application_date",
      "loanApplicationDate",
    ]),

    app_id: firstValue(body, ["app_id", "App_Id", "appId"]),
    partner_loan_id: firstValue(body, ["partner_loan_id"]),

    customer_name: firstValue(body, ["customer_name", "customerName"]),

    gender: firstValue(body, ["gender"]),

    date_of_birth: firstValue(body, ["date_of_birth", "dateOfBirth"]),

    fathers_name: firstValue(body, [
      "fathers_name",
      "father_name",
      "fatherName",
    ]),

    mobile_number: firstValue(body, ["mobile_number", "mobileNumber"]),
    email_id: firstValue(body, ["email_id", "emailId"]),
    pan_number: firstValue(body, ["pan_number", "panNumber"]),
    aadhaar_number: firstValue(body, ["aadhaar_number"]),

    current_address: firstValue(body, ["current_address"]),
    current_village_city: firstValue(body, ["current_village_city"]),
    current_district: firstValue(body, ["current_district"]),
    current_state: firstValue(body, ["current_state"]),
    current_pincode: firstValue(body, ["current_pincode"]),

    current_address_line1: firstValue(body, ["current_address"]),

    current_address_pincode: firstValue(body, [
      "current_pincode",
      "current_address_pincode",
      "currentAddressPincode",
    ]),

    loan_amount: firstValue(body, ["loan_amount"]),
    loan_amount_sanctioned: firstValue(body, ["loan_amount_sanctioned"]),
    interest_percent: firstValue(body, ["interest_percent"]),
    loan_tenure_months: firstValue(body, ["loan_tenure_months"]),

    monthly_emi: firstValue(body, ["monthly_emi"]),
    credit_score: firstValue(body, ["credit_score"]),

    product: firstValue(body, ["product"]),

    residence_type: firstValue(body, ["residence_type"]),

    customer_type: firstValue(body, ["customer_type"]),
    bank_name: firstValue(body, ["bank_name"]),
    beneficiary_name: firstValue(body, ["beneficiary_name"]),
    institute_account_number: firstValue(body, ["institute_account_number"]),
    ifsc_code: firstValue(body, ["ifsc_code"]),
  };
}

function validateLoanData(body) {
  const data = mapRequestBody(body);

  data.loan_application_date = validateDate(
    data.loan_application_date,
    "loan_application_date",
  );

  data.date_of_birth = validateDate(data.date_of_birth, "date_of_birth");

  data.app_id = cleanString(data.app_id).toUpperCase();

  if (!data.app_id) {
    throw apiError(400, "app_id is required");
  }

  if (!/^[A-Z0-9_-]{3,50}$/.test(data.app_id)) {
    throw apiError(400, "app_id contains invalid characters");
  }

  data.customer_name = cleanString(data.customer_name);

  if (!data.customer_name) {
    throw apiError(400, "customer_name is required");
  }

  data.gender = cleanString(data.gender);

  if (!["Male", "Female", "Other"].includes(data.gender)) {
    throw apiError(400, "gender must be Male, Female or Other");
  }

  data.fathers_name = cleanString(data.fathers_name);

  data.mobile_number = cleanDigits(data.mobile_number);

  if (!/^[6-9]\d{9}$/.test(data.mobile_number)) {
    throw apiError(
      400,
      "mobile_number must be a valid 10-digit Indian mobile number",
    );
  }

  data.email_id = cleanString(data.email_id).toLowerCase();

  if (data.email_id && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email_id)) {
    throw apiError(400, "email_id is invalid");
  }

  data.pan_number = cleanString(data.pan_number).toUpperCase();

  if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(data.pan_number)) {
    throw apiError(400, "pan_number is invalid");
  }

  /*
   * Excel contains only Aadhaar's last four digits.
   * It must be sent as a string, e.g. "0050".
   */
  data.aadhaar_number = cleanDigits(data.aadhaar_number);

  if (!/^\d{4}$/.test(data.aadhaar_number)) {
    throw apiError(
      400,
      "aadhaar_number must contain exactly the last 4 digits",
    );
  }

  data.current_address_line1 = cleanString(data.current_address_line1);

  if (!data.current_address_line1) {
    throw apiError(400, "current_address_line1 is required");
  }

  data.current_address_pincode = cleanDigits(data.current_address_pincode);

  if (!/^[1-9][0-9]{5}$/.test(data.current_address_pincode)) {
    throw apiError(400, "current_address_pincode must be 6 digits");
  }

  data.loan_amount_sanctioned = parseNumber(
    data.loan_amount_sanctioned,
    "loan_amount_sanctioned",
  );

  if (data.loan_amount_sanctioned <= 0) {
    throw apiError(400, "loan_amount_sanctioned must be greater than zero");
  }

  data.interest_percent = parseNumber(
    data.interest_percent,
    "interest_percent",
  );

  if (data.interest_percent < 0 || data.interest_percent > 100) {
    throw apiError(400, "interest_percent must be between 0 and 100");
  }

  data.loan_tenure_months = parseInteger(
    data.loan_tenure_months,
    "loan_tenure_months",
  );

  if (data.loan_tenure_months < 1 || data.loan_tenure_months > 120) {
    throw apiError(400, "loan_tenure_months must be between 1 and 120");
  }

  data.monthly_emi = parseNumber(data.monthly_emi, "monthly_emi");

  if (data.monthly_emi < 0) {
    throw apiError(400, "monthly_emi cannot be negative");
  }

  data.credit_score = parseInteger(data.credit_score, "credit_score");

  /*
   * Existing upload API accepts:
   * - CIBIL from 500 to 900
   * - -1 when score is unavailable
   */
  if (
    data.credit_score !== -1 &&
    (data.credit_score < 500 || data.credit_score > 900)
  ) {
    throw apiError(400, "credit_score must be between 500 and 900, or -1");
  }

  data.product = cleanString(data.product);

  if (!["Monthly Loan", "Bullet Loan"].includes(data.product)) {
    throw apiError(400, "product must be Monthly Loan or Bullet Loan");
  }

  if (data.product === "Monthly Loan" && data.monthly_emi <= 0) {
    throw apiError(
      400,
      "monthly_emi must be greater than zero for Monthly Loan",
    );
  }

  if (data.product === "Bullet Loan") {
    if (data.loan_tenure_months !== 1) {
      throw apiError(400, "Bullet Loan tenure must be 1 month");
    }

    if (data.monthly_emi !== 0) {
      throw apiError(400, "monthly_emi must be 0 for Bullet Loan");
    }
  }

  data.residence_type = cleanString(data.residence_type);

  if (!data.residence_type) {
    throw apiError(400, "residence_type is required");
  }

  data.customer_type = cleanString(data.customer_type);

  if (!data.customer_type) {
    throw apiError(400, "customer_type is required");
  }

  data.bank_name = cleanString(data.bank_name);

  if (!data.bank_name) {
    throw apiError(400, "bank_name is required");
  }

  data.beneficiary_name = cleanString(data.beneficiary_name);

  if (!data.beneficiary_name) {
    throw apiError(400, "beneficiary_name is required");
  }

  data.institute_account_number = cleanString(
    data.institute_account_number,
  ).replace(/\s/g, "");

  if (!/^[A-Z0-9]{6,30}$/i.test(data.institute_account_number)) {
    throw apiError(400, "institute_account_number is invalid");
  }

  data.ifsc_code = cleanString(data.ifsc_code).toUpperCase();

  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(data.ifsc_code)) {
    throw apiError(400, "ifsc_code is invalid");
  }

  return data;
}

function validateExternalCirclePeHouserData(body) {
  const data = mapRequestBody(body);

  // Application Date
  data.loan_application_date = validateDate(
    data.loan_application_date,
    "loan_application_date",
  );

  // APP ID (Optional)
  data.app_id = cleanString(data.app_id).toUpperCase() || null;

  // Partner Loan ID (Optional)
  data.partner_loan_id = cleanString(data.partner_loan_id) || null;

  // Customer Name
  data.customer_name = cleanString(data.customer_name);

  if (!data.customer_name) {
    throw apiError(400, "customer_name is required");
  }

  // Gender
  data.gender = cleanString(data.gender);

  if (!["Male", "Female", "Other", "M", "F"].includes(data.gender)) {
    throw apiError(400, "gender must be Male, Female or Other");
  }

  // DOB
  data.date_of_birth = validateDate(data.date_of_birth, "date_of_birth");

  // Father Name & Mother Name
  data.fathers_name = cleanString(data.fathers_name) || null;

  // Mobile
  data.mobile_number = cleanDigits(data.mobile_number);

  if (!/^[6-9]\d{9}$/.test(data.mobile_number)) {
    throw apiError(
      400,
      "mobile_number must be a valid 10-digit Indian mobile number",
    );
  }

  // Email
  data.email_id = cleanString(data.email_id).toLowerCase();

  if (data.email_id && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email_id)) {
    throw apiError(400, "email_id is invalid");
  }

  // PAN
  data.pan_number = cleanString(data.pan_number).toUpperCase();

  if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(data.pan_number)) {
    throw apiError(400, "pan_number is invalid");
  }

  // Aadhaar last 4 digits
  data.aadhaar_number = cleanDigits(data.aadhaar_number);

  if (!/^\d{4}$/.test(data.aadhaar_number)) {
    throw apiError(
      400,
      "aadhaar_number must contain exactly the last 4 digits",
    );
  }

  // Current Address Details
  data.current_address = cleanString(
    data.current_address || data.current_address_line1,
  );

  if (!data.current_address) {
    throw apiError(400, "current_address is required");
  }

  data.current_village_city = cleanString(data.current_village_city) || null;
  data.current_district = cleanString(data.current_district) || null;
  data.current_state = cleanString(data.current_state) || null;

  data.current_pincode = cleanDigits(
    data.current_pincode || data.current_address_pincode,
  );

  if (!/^[1-9][0-9]{5}$/.test(data.current_pincode)) {
    throw apiError(400, "current_pincode must be 6 digits");
  }

  data.current_address_line1 = data.current_address;
  data.current_address_pincode = data.current_pincode;

  // Loan Amount
  data.loan_amount = parseNumber(
    data.loan_amount || data.loan_amount_sanctioned,
    "loan_amount",
  );

  if (data.loan_amount <= 0) {
    throw apiError(400, "loan_amount must be greater than zero");
  }

  data.loan_amount_sanctioned = data.loan_amount;

  // Credit Score
  data.credit_score = parseInteger(data.credit_score, "credit_score");

  if (
    data.credit_score !== -1 &&
    (data.credit_score < 500 || data.credit_score > 900)
  ) {
    throw apiError(400, "credit_score must be between 500 and 900, or -1");
  }

  // Product
  data.product = cleanString(data.product);

  if (!["Monthly Loan", "Bullet Loan"].includes(data.product)) {
    throw apiError(400, "product must be Monthly Loan or Bullet Loan");
  }

  // Residence Type
  data.residence_type = cleanString(data.residence_type);

  if (!data.residence_type) {
    throw apiError(400, "residence_type is required");
  }

  // Customer Type
  data.customer_type = cleanString(data.customer_type);

  if (!data.customer_type) {
    throw apiError(400, "customer_type is required");
  }

  return data;
}

router.post("/circle-pe-houser", verifyApiKey, async (req, res) => {
  let connection;

  try {
    const loanData = validateLoanData(req.body);

    /*
     * Check duplicate external application ID.
     */
    const [existingLoans] = await db.promise().query(
      `
          SELECT app_id, lan
          FROM ${TABLE_NAME}
          WHERE app_id = ?
          LIMIT 1
        `,
      [loanData.app_id],
    );

    if (existingLoans.length > 0) {
      return res.status(409).json({
        success: false,
        code: "DUPLICATE_APP_ID",
        message: `app_id ${loanData.app_id} already exists`,
        data: {
          app_id: existingLoans[0].app_id,
          lan: existingLoans[0].lan,
        },
      });
    }

    /*
     * Uses the same LAN and partner-loan-ID generator
     * as the existing Excel upload API.
     */
    const { partnerLoanId, lan } = await generateLoanIdentifiers(LENDER_TYPE);

    connection = await db.promise().getConnection();
    await connection.beginTransaction();

    const insertQuery = `
      INSERT INTO ${TABLE_NAME} (
        login_date,
        lan,
        partner_loan_id,
        app_id,
        customer_name,
        gender,
        dob,
        father_name,
        mobile_number,
        email_id,
        pan_number,
        aadhar_number,
        current_address,
        current_pincode,
        loan_amount,
        interest_rate,
        loan_tenure,
        emi_amount,
        cibil_score,
        product,
        lender,
        residence_type,
        customer_type,
        bank_name,
        name_in_bank,
        account_number,
        ifsc,
        net_disbursement,
        agreement_date,
        status
      )
      VALUES (${new Array(30).fill("?").join(",")})
    `;

    const insertValues = [
      loanData.loan_application_date,
      lan,
      partnerLoanId,
      loanData.app_id,
      loanData.customer_name,
      loanData.gender,
      loanData.date_of_birth,
      loanData.fathers_name || null,
      loanData.mobile_number,
      loanData.email_id || null,
      loanData.pan_number,
      loanData.aadhaar_number,
      loanData.current_address_line1,
      loanData.current_address_pincode,
      loanData.loan_amount_sanctioned,
      loanData.interest_percent,
      loanData.loan_tenure_months,
      loanData.monthly_emi,
      loanData.credit_score,
      loanData.product,
      LENDER_TYPE,
      loanData.residence_type,
      loanData.customer_type,
      loanData.bank_name,
      loanData.beneficiary_name,
      loanData.institute_account_number,
      loanData.ifsc_code,
      loanData.loan_amount_sanctioned,
      loanData.loan_application_date,
      "Login",
    ];

    const [insertResult] = await connection.query(insertQuery, insertValues);

    await connection.commit();

    return res.status(201).json({
      success: true,
      code: "LOAN_CREATED",
      message: "Circle Pe Houser loan created successfully",
      data: {
        id: insertResult.insertId,
        app_id: loanData.app_id,
        lan,
        partner_loan_id: partnerLoanId,
        product: loanData.product,
        status: "Login",
      },
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }

    console.error("Circle Pe Houser JSON API error:", error);

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        code: "DUPLICATE_RECORD",
        message: "Duplicate loan record",
      });
    }

    return res.status(error.statusCode || 500).json({
      success: false,
      code:
        error.statusCode === 400 ? "VALIDATION_ERROR" : "INTERNAL_SERVER_ERROR",
      message: error.message || "Unable to create Circle Pe Houser loan",
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

router.post("/circle-pe-houser/external", verifyApiKey, async (req, res) => {
  let connection;

  try {
    const loanData = validateExternalCirclePeHouserData(req.body);

    /*
     * Check duplicate loan application using:
     * - partner_loan_id (if provided)
     * - pan_number
     * - mobile_number
     * - email_id (if provided)
     * - app_id (if provided)
     */
    const duplicateConditions = [];
    const duplicateParams = [];

    if (loanData.partner_loan_id) {
      duplicateConditions.push("partner_loan_id = ?");
      duplicateParams.push(loanData.partner_loan_id);
    }

    if (loanData.pan_number) {
      duplicateConditions.push("pan_number = ?");
      duplicateParams.push(loanData.pan_number);
    }

    if (loanData.mobile_number) {
      duplicateConditions.push("mobile_number = ?");
      duplicateParams.push(loanData.mobile_number);
    }

    if (loanData.email_id) {
      duplicateConditions.push("email_id = ?");
      duplicateParams.push(loanData.email_id);
    }

    if (loanData.app_id) {
      duplicateConditions.push("app_id = ?");
      duplicateParams.push(loanData.app_id);
    }

    if (duplicateConditions.length > 0) {
      const [existingMatches] = await db.promise().query(
        `
          SELECT lan, partner_loan_id, app_id, pan_number, mobile_number, email_id, status
          FROM ${TABLE_NAME}
          WHERE ${duplicateConditions.join(" OR ")}
          LIMIT 1
        `,
        duplicateParams,
      );

      if (existingMatches.length > 0) {
        const match = existingMatches[0];
        let duplicateField = "Record";
        let duplicateValue = "";

        if (
          loanData.partner_loan_id &&
          match.partner_loan_id === loanData.partner_loan_id
        ) {
          duplicateField = "partner_loan_id";
          duplicateValue = loanData.partner_loan_id;
        } else if (
          loanData.pan_number &&
          match.pan_number === loanData.pan_number
        ) {
          duplicateField = "pan_number";
          duplicateValue = loanData.pan_number;
        } else if (
          loanData.mobile_number &&
          match.mobile_number === loanData.mobile_number
        ) {
          duplicateField = "mobile_number";
          duplicateValue = loanData.mobile_number;
        } else if (loanData.email_id && match.email_id === loanData.email_id) {
          duplicateField = "email_id";
          duplicateValue = loanData.email_id;
        } else if (loanData.app_id && match.app_id === loanData.app_id) {
          duplicateField = "app_id";
          duplicateValue = loanData.app_id;
        }

        return res.status(409).json({
          success: false,
          code: "DUPLICATE_RECORD",
          message: `Duplicate loan application found with matching ${duplicateField}: ${duplicateValue} (Existing LAN: ${match.lan}, Status: ${match.status})`,
          data: {
            lan: match.lan,
            partner_loan_id: match.partner_loan_id,
            status: match.status,
            matched_field: duplicateField,
            matched_value: duplicateValue,
          },
        });
      }
    }

    /*
     * Uses the same LAN and partner-loan-ID generator
     * as the existing Excel upload API.
     */
    const { partnerLoanId: autoPartnerLoanId, lan } =
      await generateLoanIdentifiers(LENDER_TYPE);

    const partnerLoanId = loanData.partner_loan_id || autoPartnerLoanId;

    connection = await db.promise().getConnection();
    await connection.beginTransaction();

    const insertQuery = `
        INSERT INTO ${TABLE_NAME} (
          login_date,
          lan,
          partner_loan_id,
          app_id,

          customer_name,
          gender,
          dob,
          father_name,

          mobile_number,
          email_id,
          pan_number,
          aadhar_number,

          current_address,
          current_village_city,
          current_district,
          current_state,
          current_pincode,

          loan_amount,
          cibil_score,
          product,
          lender,

          residence_type,
          customer_type,

          status
        )
        VALUES (${new Array(24).fill("?").join(",")})
      `;

    // ── Evaluate Business Rule Engine (BRE) ──────────────────────────
    const breResult = evaluateCirclePeHouserBRE(loanData);
    const initialStatus = breResult.status; // "BRE Approved" or "BRE Rejected"
    const finalAppId = loanData.app_id || lan;

    const insertValues = [
      loanData.loan_application_date,
      lan,
      partnerLoanId,
      finalAppId,

      loanData.customer_name,
      loanData.gender,
      loanData.date_of_birth,
      loanData.fathers_name || null,

      loanData.mobile_number,
      loanData.email_id || null,
      loanData.pan_number,
      loanData.aadhaar_number,

      loanData.current_address,
      loanData.current_village_city || null,
      loanData.current_district || null,
      loanData.current_state || null,
      loanData.current_pincode,

      loanData.loan_amount,
      loanData.credit_score,
      loanData.product,
      LENDER_TYPE,

      loanData.residence_type,
      loanData.customer_type,

      initialStatus,
    ];

    const [insertResult] = await connection.query(insertQuery, insertValues);

    await connection.commit();

    // ── Dispatch BRE Webhook asynchronously to Client/Partner ────────
    sendCirclePeHouserBREWebhook({
      lan,
      partner_loan_id: partnerLoanId,
      customer_name: loanData.customer_name,
      loan_amount: loanData.loan_amount,
      status: initialStatus,
      bre_decision: breResult.decision,
      reasons: breResult.reasons,
      checks: breResult.checks,
    }).catch((whErr) => {
      console.error("CirclePe Houser Webhook invocation error:", whErr);
    });

    return res.status(201).json({
      success: true,
      code: "LOAN_CREATED",
      message: `Circle Pe Houser loan processed with BRE status: ${initialStatus}`,
      data: {
        id: insertResult.insertId,
        lan,
        partner_loan_id: partnerLoanId,
        loan_amount: loanData.loan_amount,
        product: loanData.product,
        status: initialStatus,
        breDecision: breResult.decision,
        breReasons: breResult.reasons,
        breChecks: breResult.checks,
      },
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }

    console.error("Circle Pe Houser JSON API error:", error);

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        code: "DUPLICATE_RECORD",
        message: "Duplicate loan record",
      });
    }

    return res.status(error.statusCode || 500).json({
      success: false,
      code:
        error.statusCode === 400 ? "VALIDATION_ERROR" : "INTERNAL_SERVER_ERROR",
      message: error.message || "Unable to create Circle Pe Houser loan",
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

async function handleCirclePeHouserFinalSubmit(req, res) {
  let connection;

  try {
    const body = req.body || {};

    // Loan Identifier
    const lan = cleanString(body.lan);

    if (!lan) {
      throw apiError(400, "lan is required");
    }

    // eNACH Details
    const enachUmrn = cleanString(body.enach_umrn);
    const enachStatus = cleanString(body.enach_status || "Success");
    const enachAuthMode = cleanString(body.enach_auth_mode);

    if (!enachUmrn) {
      throw apiError(400, "enach_umrn is required for final submission");
    }

    // eSign Details
    const esignStatus = cleanString(body.esign_status || "Signed");

    let agreementDate = body.agreement_date;
    if (agreementDate) {
      agreementDate = validateDate(agreementDate, "agreement_date");
    } else {
      agreementDate = new Date().toISOString().split("T")[0];
    }

    // Bank Details
    const bankName = cleanString(body.bank_name);
    const beneficiaryName = cleanString(body.beneficiary_name);
    const accountNumber = cleanString(body.account_number).replace(/\s/g, "");
    const accountType = cleanString(
      body.account_type || "savings",
    ).toLowerCase();
    const ifscCode = cleanString(body.ifsc_code).toUpperCase();

    // Loan Terms
    const interestPercent = body.interest_rate;
    const loanTenureMonths = body.loan_tenure;
    const monthlyEmi = body.emi_amount;
    const netDisbursement = body.net_disbursement;

    // Database Connection
    connection = await db.promise().getConnection();
    await connection.beginTransaction();

    // ── 1. Find existing loan ──
    const findQuery = `SELECT * FROM ${TABLE_NAME} WHERE lan = ? LIMIT 1`;
    const findParams = [lan];

    const [existingRows] = await connection.query(findQuery, findParams);

    if (existingRows.length === 0) {
      throw apiError(404, "Loan record not found in CirclePe Houser");
    }

    const currentLoan = existingRows[0];
    const targetLan = currentLoan.lan;

    // Check already disbursed
    if (String(currentLoan.status).toLowerCase() === "disbursed") {
      throw apiError(400, `Loan ${targetLan} is already disbursed`);
    }

    // ── 2. Validate Bank Details ──
    if (!bankName) {
      throw apiError(400, "bank_name is required");
    }
    if (!beneficiaryName) {
      throw apiError(400, "beneficiary_name is required");
    }
    if (!accountNumber) {
      throw apiError(400, "account_number is required");
    }

    if (!ifscCode || !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifscCode)) {
      throw apiError(400, "Valid IFSC code is required");
    }

    // ── 3. Validate Loan Details ──
    const finalLoanAmount =
      body.loan_amount !== undefined &&
      body.loan_amount !== null &&
      body.loan_amount !== ""
        ? parseNumber(body.loan_amount, "loan_amount")
        : parseNumber(currentLoan.loan_amount, "loan_amount");

    const finalInterestRate = parseNumber(interestPercent, "interest_rate");

    const finalTenure = parseInteger(loanTenureMonths, "loan_tenure");

    const finalEmi = parseNumber(monthlyEmi, "emi_amount");

    const finalNetDisbursement = parseNumber(
      netDisbursement,
      "net_disbursement",
    );

    if (finalNetDisbursement <= 0) {
      throw apiError(400, "net_disbursement must be greater than zero");
    }

    if (finalNetDisbursement > finalLoanAmount) {
      throw apiError(
        400,
        `net_disbursement (${finalNetDisbursement}) cannot be greater than loan_amount (${finalLoanAmount})`,
      );
    }

    const productType = currentLoan.product || "Monthly Loan";

    const NEW_STATUS = "Disburse initiate";

    // ── 4. Update Loan ──
    const updateLoanQuery = `
      UPDATE ${TABLE_NAME}
      SET
        bank_name = ?,
        name_in_bank = ?,
        account_number = ?,
        ifsc = ?,
        loan_amount = ?,
        interest_rate = ?,
        loan_tenure = ?,
        emi_amount = ?,
        net_disbursement = ?,
        agreement_date = ?,
        status = ?
      WHERE lan = ?
    `;

    const updateLoanValues = [
      bankName,
      beneficiaryName,
      accountNumber,
      ifscCode,
      finalLoanAmount,
      finalInterestRate,
      finalTenure,
      finalEmi,
      finalNetDisbursement,
      agreementDate,
      NEW_STATUS,
      targetLan,
    ];

    await connection.query(updateLoanQuery, updateLoanValues);

    // ── 5. Upsert eNACH Mandate ──
    try {
      await connection.query(
        `
          INSERT INTO enach_mandates (
            lan,
            document_id,
            customer_identifier,
            status,
            mandate_amount,
            account_no,
            account_type,
            ifsc,
            bank_name,
            umrn
          )
          VALUES (?, ?, ?, 'ACTIVE', ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            umrn = VALUES(umrn),
            bank_name = VALUES(bank_name),
            account_no = VALUES(account_no),
            account_type = VALUES(account_type),
            ifsc = VALUES(ifsc),
            status = 'ACTIVE',
            mandate_amount = VALUES(mandate_amount)
        `,
        [
          targetLan,
          `MANDATE_${targetLan}`,
          currentLoan.mobile_number || currentLoan.customer_name || targetLan,
          finalEmi || finalLoanAmount,
          accountNumber,
          accountType,
          ifscCode,
          bankName,
          enachUmrn,
        ],
      );
    } catch (mandateErr) {
      console.warn("eNACH mandate table upsert notice:", mandateErr.message);
    }

    // ── 6. Generate RPS ──
    await connection.query(
      `DELETE FROM manual_rps_circle_pe_houser WHERE lan = ?`,
      [targetLan],
    );

    await generateRepaymentScheduleCirclePeHouser(
      connection,
      targetLan,
      finalLoanAmount,
      finalInterestRate,
      finalTenure,
      agreementDate,
      productType,
      LENDER_TYPE,
    );

    await connection.commit();

    // ── 7. Response ──
    return res.status(200).json({
      success: true,
      code: "DISBURSEMENT_INITIATED",
      message:
        "Circle Pe Houser loan final submission completed successfully. Status is now Disburse initiate.",

      data: {
        lan: targetLan,
        partner_loan_id: currentLoan.partner_loan_id,
        customer_name: currentLoan.customer_name,

        loan_amount: finalLoanAmount,
        net_disbursement: finalNetDisbursement,
        interest_rate: finalInterestRate,
        loan_tenure: finalTenure,
        monthly_emi: finalEmi,

        product: productType,

        enach_umrn: enachUmrn,
        enach_status: enachStatus,

        esign_status: esignStatus,
        agreement_date: agreementDate,

        disbursement_bank: {
          bank_name: bankName,
          beneficiary_name: beneficiaryName,
          account_number: accountNumber,
          ifsc: ifscCode,
        },

        status: NEW_STATUS,
        submitted_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }

    console.error("Circle Pe Houser Final Submit error:", error);

    return res.status(error.statusCode || 500).json({
      success: false,
      code:
        error.statusCode === 400 ? "VALIDATION_ERROR" : "INTERNAL_SERVER_ERROR",
      message:
        error.message || "Failed to process Circle Pe Houser final submit",
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

// Register Final Submit endpoints
router.post(
  "/circle-pe-houser/final-submit",
  verifyApiKey,
  handleCirclePeHouserFinalSubmit,
);

module.exports = router;
