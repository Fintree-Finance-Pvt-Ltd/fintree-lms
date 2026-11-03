const fs = require("fs");
const path = require("path");
const express = require("express");
const db = require("../../config/db");
const verifyApiKey = require("../../middleware/apiKeyAuth");
const authenticateUser = require("../../middleware/verifyToken");
const { getLoanContext } = require("../../utils/lanHelper");
const { initDoqfyEsign } = require("../../services/doqfyEsignService");
const { runBureau } = require("../../services/Bueraupullapiservice");
const { runBRE } = require("../Niyara/NiyaraBre");
const {
  screenLoanBooking,
} = require("../../services/trackwizz/screeningService");
const { approveAndInitiatePayout } = require("../../services/payout.service");

const router = express.Router();

// Niyara UBL Configuration
const TABLE_NAME = "loan_booking_niyara";
const SEQUENCE_KEY = "NIYARA_UBL";
const LAN_PREFIX = "NYRA";
const LENDER = "Niyara";
const PRODUCT = "UBL";
const LOAN_TYPE = "Business Loan";

// Helper Functions
function clean(value) {
  return String(value ?? "").trim();
}

function nullIfEmpty(value) {
  return clean(value) || null;
}

function upperOrNull(value) {
  const text = clean(value);
  return text ? text.toUpperCase() : null;
}

function digitsOnly(value) {
  return clean(value).replace(/\D/g, "");
}

function readNumber(value) {
  const text = clean(value).replace(/,/g, "");
  return text === "" ? NaN : Number(text);
}

function todayDate() {
  return new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
}

function isValidDate(value) {
  const text = clean(value);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return false;
  }

  const [year, month, day] = text.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function calculateAgeFromDob(dob) {
  if (!isValidDate(dob)) return NaN;

  const today = todayDate();
  const [y, m, d] = dob.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);

  return ty - y - (tm < m || (tm === m && td < d) ? 1 : 0);
}

// Validate Login Details
function validateLoginData(data) {
  if (!data.partner_loan_id) {
    return "partner_loan_id is required";
  }

  if (data.partner_loan_id.length > 50) {
    return "partner_loan_id exceeds 50 characters";
  }

  if (!data.customer_name) {
    return "customer_name is required";
  }

  if (data.customer_name.length > 150) {
    return "customer_name exceeds 150 characters";
  }

  if (!/^[6-9]\d{9}$/.test(data.mobile_number)) {
    return "Invalid 10-digit mobile_number";
  }

  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    return "Invalid email";
  }

  if (!data.pan_number || !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(data.pan_number)) {
    return "Invalid PAN number";
  }

  if (!isValidDate(data.borrower_dob) || data.borrower_dob > data.login_date) {
    return "Valid borrower_dob is required (YYYY-MM-DD)";
  }

  if (!Number.isFinite(data.annual_income) || data.annual_income < 0) {
    return "Valid annual_income is required";
  }

  if (!Number.isFinite(data.requested_amount) || data.requested_amount <= 0) {
    return "requested_amount must be greater than zero";
  }

  if (!data.customer_address) {
    return "customer_address is required";
  }

  if (!data.customer_city || !data.customer_state) {
    return "customer_city and customer_state are required";
  }

  if (!/^[1-9][0-9]{5}$/.test(data.customer_pincode || "")) {
    return "Invalid customer_pincode";
  }

  if (data.business_pincode && !/^[1-9][0-9]{5}$/.test(data.business_pincode)) {
    return "Invalid business_pincode";
  }

  if (
    data.gst_number &&
    !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(data.gst_number)
  ) {
    return "Invalid gst_number";
  }

  return null;
}

// Generate Unique LAN
async function generateLoanIds(connection) {
  const [rows] = await connection.query(
    `SELECT last_sequence
     FROM loan_sequences
     WHERE lender_name = ?
     FOR UPDATE`,
    [SEQUENCE_KEY],
  );

  if (rows.length !== 1) {
    throw new Error("NIYARA_SEQUENCE_NOT_INITIALIZED");
  }

  const nextSequence = Number(rows[0].last_sequence) + 1;

  if (!Number.isSafeInteger(nextSequence)) {
    throw new Error("NIYARA_SEQUENCE_INVALID");
  }

  await connection.query(
    `UPDATE loan_sequences
     SET last_sequence = ?
     WHERE lender_name = ?`,
    [nextSequence, SEQUENCE_KEY],
  );

  return {
    lan: `${LAN_PREFIX}${nextSequence}`,
  };
}

// Insert Loan Booking
async function insertLogin(connection, data, ids, createdBy) {
  const row = {
    partner_loan_id: data.partner_loan_id,
    lan: ids.lan,
    lender: LENDER,
    product: PRODUCT,
    loan_type: LOAN_TYPE,

    login_date: data.login_date,
    borrower_dob: data.borrower_dob,
    age: data.age,
    annual_income: data.annual_income,

    customer_name: data.customer_name,
    mobile_number: data.mobile_number,
    email: data.email,
    pan_number: data.pan_number,
    aadhaar_number: data.aadhaar_number,

    gender: data.gender,

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

    source: data.source,

    status: "Login",
    stage: "Login",

    created_by: createdBy,
    updated_by: createdBy,
  };

  const columns = Object.keys(row);
  const placeholders = columns.map(() => "?").join(", ");

  const sql = `
    INSERT INTO ${TABLE_NAME}
    (${columns.map((c) => `\`${c}\``).join(", ")})
    VALUES (${placeholders})
  `;

  const [result] = await connection.query(sql, Object.values(row));

  return result.insertId;
}

function verifyNiyaraPartner(req, res, next) {
  const partnerName = String(req.partner?.name || "")
    .trim()
    .toLowerCase();

  if (partnerName !== "niyara") {
    return res.status(403).json({
      success: false,
      message: "Only Niyara partner can access this API",
    });
  }

  next();
}

// ==========================================
// NIYARA LOAN LIST HELPER
// ==========================================

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

const NIYARA_SORT_COLUMNS = {
  id: "id",
  lan: "lan",
  partner_loan_id: "partner_loan_id",
  customer_name: "customer_name",
  business_name: "business_name",
  requested_amount: "requested_amount",
  loan_amount: "loan_amount",
  login_date: "login_date",
  status: "status",
  stage: "stage",
  created_at: "created_at",
};

function readPositiveInteger(value, fallback) {
  const number = Number(value);

  return Number.isSafeInteger(number) && number > 0 ? number : fallback;
}

async function fetchNiyaraLoans(
  req,
  res,
  { partnerCreditOnly = false, creditOnly = false } = {},
) {
  try {
    const page = readPositiveInteger(req.query.page, 1);

    const pageSize = Math.min(
      readPositiveInteger(req.query.pageSize, DEFAULT_PAGE_SIZE),
      MAX_PAGE_SIZE,
    );

    const offset = (page - 1) * pageSize;

    const search = clean(req.query.search);
    const status = clean(req.query.status).toLowerCase();

    const sortBy = clean(req.query.sortBy).toLowerCase();

    const sortColumn = NIYARA_SORT_COLUMNS[sortBy] || "id";

    const sortDir =
      clean(req.query.sortDir).toLowerCase() === "asc" ? "ASC" : "DESC";

    // Dynamic filters
    const conditions = ["lan LIKE ?"];
    const params = [`${LAN_PREFIX}%`];

    // Only BRE + AML verified cases for Partner Credit
    if (partnerCreditOnly) {
      conditions.push(
        "LOWER(TRIM(status)) = 'bre_approved'",
        "LOWER(TRIM(stage)) = 'partner_credit_pending'",
        "UPPER(TRIM(niyara_bre_status)) = 'APPROVED'",
        "UPPER(TRIM(aml_status)) = 'PROCEED'",
        "niyara_bre_checked_at IS NOT NULL",
        "aml_checked_at IS NOT NULL",
      );
    }

    if (creditOnly) {
      conditions.push(
        "status = 'partner_credit_approved'",
        "stage = 'ff_credit_pending'",
        "partner_credit_decision = 'APPROVED'",
        "UPPER(TRIM(niyara_bre_status)) = 'APPROVED'",
        "UPPER(TRIM(aml_status)) = 'PROCEED'",
        "niyara_bre_checked_at IS NOT NULL",
        "aml_checked_at IS NOT NULL",
      );
    }

    // Search
    if (search) {
      conditions.push(`
        (
          lan LIKE ?
          OR partner_loan_id LIKE ?
          OR customer_name LIKE ?
          OR business_name LIKE ?
          OR mobile_number LIKE ?
        )
      `);

      const searchValue = `%${search}%`;

      params.push(
        searchValue,
        searchValue,
        searchValue,
        searchValue,
        searchValue,
      );
    }

    // Status filter
    if (status) {
      conditions.push("LOWER(TRIM(status)) = ?");
      params.push(status);
    }

    const whereClause = conditions.join(" AND ");

    // Total count
    const [[countRow]] = await db.promise().query(
      `
      SELECT COUNT(*) AS total
      FROM ${TABLE_NAME}
      WHERE ${whereClause}
      `,
      params,
    );

    // Fetch paginated loans
    const [rows] = await db.promise().query(
      `
      SELECT
        id,
        lan,
        partner_loan_id,
        lender,
        product,
        loan_type,
        login_date,

        customer_name,
        mobile_number,
        business_name,
        business_type,

        requested_amount,
        loan_amount,

        status,
        stage,

        created_at,
        updated_at

      FROM ${TABLE_NAME}
      WHERE ${whereClause}

      ORDER BY ${sortColumn} ${sortDir}
      LIMIT ? OFFSET ?
      `,
      [...params, pageSize, offset],
    );

    return res.status(200).json({
      success: true,
      message: "Niyara loans fetched successfully",
      rows,
      pagination: {
        page,
        pageSize,
        total: Number(countRow.total || 0),
        totalPages: Math.ceil(Number(countRow.total || 0) / pageSize),
      },
      filters: {
        search: search || null,
        status: status || null,
        sortBy: sortColumn,
        sortDir,
      },
    });
  } catch (error) {
    console.error("[NIYARA] All loans error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch Niyara loans",
    });
  }
}
// POST /api/niyara/login


router.post("/login", verifyApiKey, verifyNiyaraPartner, async (req, res) => {
  let connection;
  let transactionStarted = false;
  let bookingCommitted = false;
  let verificationLocked = false;
  let lockName = null;

  let insertId = null;
  let ids = null;
  let data = null;

  try {
    const body = req.body;

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return res.status(400).json({
        success: false,
        message: "Valid JSON object is required",
      });
    }

    const dob = clean(
      body.borrower_dob ?? body.dob ?? body.date_of_birth
    );

    const aadhaarInput = clean(
      body.aadhaar_number ?? body.aadhar_number
    );

    if (aadhaarInput && !/^\d{12}$/.test(aadhaarInput)) {
      return res.status(400).json({
        success: false,
        message: "aadhaar_number must contain 12 digits",
      });
    }

    data = {
      partner_loan_id: clean(body.partner_loan_id),

      login_date: todayDate(),
      borrower_dob: dob,
      age: calculateAgeFromDob(dob),

      annual_income: readNumber(body.annual_income),

      customer_name: clean(body.customer_name),
      mobile_number: digitsOnly(body.mobile_number),
      email: nullIfEmpty(body.email)?.toLowerCase() || null,
      pan_number: upperOrNull(body.pan_number),

      // Store masked Aadhaar only.
      aadhaar_number: aadhaarInput
        ? `XXXXXXXX${aadhaarInput.slice(-4)}`
        : null,

      gender: nullIfEmpty(body.gender),

      customer_address: nullIfEmpty(body.customer_address),
      customer_pincode: digitsOnly(body.customer_pincode),
      customer_city: nullIfEmpty(body.customer_city),
      customer_state: nullIfEmpty(body.customer_state),

      requested_amount: readNumber(
        body.requested_amount ?? body.loan_amount
      ),

      business_name: nullIfEmpty(body.business_name),
      business_type: nullIfEmpty(body.business_type),
      gst_number: upperOrNull(body.gst_number),
      udyam_number: upperOrNull(body.udyam_number),

      business_address: nullIfEmpty(body.business_address),
      business_pincode: digitsOnly(body.business_pincode),
      business_city: nullIfEmpty(body.business_city),
      business_state: nullIfEmpty(body.business_state),

      source: "PARTNER_API",
    };

    const validationError = validateLoginData(data);

    if (validationError) {
      return res.status(400).json({
        success: false,
        message: validationError,
      });
    }

    // Preliminary BRE uses existing policy.
    // Without a verified score, final BRE cannot be approved.
    const preliminaryBre = runBRE({
      requested_amount: data.requested_amount,
      age: data.age,
      annual_income: data.annual_income,
      bureau_score: null,
    });

    // ----------------------------------------------------
    // STEP 1: CREATE LOAN BOOKING
    // ----------------------------------------------------

    connection = await db.promise().getConnection();

    await connection.beginTransaction();
    transactionStarted = true;

    ids = await generateLoanIds(connection);

    insertId = await insertLogin(
      connection,
      data,
      ids,
      req.partner.name
    );

    await connection.commit();
    transactionStarted = false;
    bookingCommitted = true;

    const lan = ids.lan;

    // ----------------------------------------------------
    // STEP 2: CHECK VERIFIED CUSTOMER BUREAU CONSENT
    // ----------------------------------------------------
    // Consent must come from a trusted customer consent
    // process. Do not accept a simple consent:true flag
    // in the partner request as verification.

    const [[consent]] = await connection.query(
      `
      SELECT id
      FROM loan_documents
      WHERE lan = ?
        AND doc_name = 'NIYARA_BUREAU_CONSENT_VERIFIED'
      LIMIT 1
      `,
      [lan]
    );

    if (!consent) {
      return res.status(201).json({
        success: true,
        message: "Niyara loan login created successfully",
        data: {
          id: insertId,
          partner_loan_id: data.partner_loan_id,
          lan,
          status: "Login",
          stage: "Login",
          preliminary_bre: preliminaryBre.decision,
          verification: {
            completed: false,
            code: "CONSENT_REQUIRED",
            bureau_status: "NOT_INITIATED",
            bre_status: "PENDING",
            aml_status: "NOT_INITIATED",
          },
          next_step: "BORROWER_BUREAU_CONSENT_PENDING",
        },
      });
    }

    // ----------------------------------------------------
    // STEP 3: PREVENT CONCURRENT VERIFICATION
    // ----------------------------------------------------

    lockName = `niyara-verify:${lan}`;

    const [[lock]] = await connection.query(
      "SELECT GET_LOCK(?, 0) AS acquired",
      [lockName]
    );

    if (Number(lock.acquired) !== 1) {
      throw new Error("Verification already in progress");
    }

    verificationLocked = true;

    // Reload trusted data from DB instead of using
    // the request body for provider verification.

    const [[loan]] = await connection.query(
      `
      SELECT
        lan,
        status,
        stage,
        customer_name,
        DATE_FORMAT(borrower_dob, '%Y-%m-%d') AS dob,
        age,
        gender,
        annual_income,
        pan_number,
        mobile_number,
        customer_address,
        customer_city,
        customer_state,
        customer_pincode,
        requested_amount,
        cibil_score
      FROM loan_booking_niyara
      WHERE lan = ?
      LIMIT 1
      `,
      [lan]
    );

    if (
      !loan ||
      loan.status !== "Login" ||
      loan.stage !== "Login"
    ) {
      throw new Error("Loan is not eligible for verification");
    }

    // ----------------------------------------------------
    // STEP 4: EXPERIAN BUREAU
    // ----------------------------------------------------

    const [[savedReport]] = await connection.query(
      `
      SELECT pan_number, score, report_xml
      FROM loan_cibil_reports
      WHERE lan = ?
      ORDER BY id DESC
      LIMIT 1
      `,
      [lan]
    );

    let score;

    if (savedReport) {
      const [[kyc]] = await connection.query(
        `
        SELECT bureau_status
        FROM kyc_verification_status
        WHERE lan = ?
          AND bureau_status = 'VERIFIED'
        LIMIT 1
        `,
        [lan]
      );

      score = Number(savedReport.score);

      if (
        !kyc ||
        savedReport.pan_number !== loan.pan_number ||
        loan.cibil_score == null ||
        Number(loan.cibil_score) !== score ||
        !Number.isInteger(score) ||
        score < 300 ||
        score > 900 ||
        typeof savedReport.report_xml !== "string" ||
        !savedReport.report_xml.includes("<INProfileResponse")
      ) {
        throw new Error("Existing Bureau record needs verification");
      }
    } else {
      if (loan.cibil_score != null) {
        throw new Error("Bureau score exists without a report");
      }

      const parts = clean(loan.customer_name)
        .split(/\s+/)
        .filter(Boolean);

      const firstName = parts[0] || "";
      const lastName = parts[parts.length - 1] || "";
      const middleName = parts.slice(1, -1).join(" ");

      const stateAliases = {
        HARYANA: "HARAYANA",
        GUJARAT: "GUJRAT",
        ODISHA: "ORRISA",
        UTTARAKHAND: "UTTRANCHAL",
        PUDUCHERRY: "PONDICHERRY",
      };

      const state = clean(loan.customer_state).toUpperCase();
      const bureauState = stateAliases[state] || state;

      const supportedStates = new Set(
        "JAMMU AND KASHMIR|HIMACHAL PRADESH|PUNJAB|CHANDIGARH|UTTRANCHAL|HARAYANA|DELHI|RAJASTHAN|UTTAR PRADESH|BIHAR|SIKKIM|ARUNACHAL PRADESH|NAGALAND|MANIPUR|MIZORAM|TRIPURA|MEGHALAYA|ASSAM|WEST BENGAL|JHARKHAND|ORRISA|CHHATTISGARH|MADHYA PRADESH|GUJRAT|MAHARASHTRA|ANDHRA PRADESH|KARNATAKA|GOA|LAKSHADWEEP|KERALA|TAMIL NADU|PONDICHERRY|TELANGANA".split(
          "|"
        )
      );

      const amount = Number(loan.requested_amount);

      if (
        !firstName ||
        !loan.dob ||
        !loan.pan_number ||
        !loan.mobile_number ||
        !loan.customer_address ||
        !loan.customer_city ||
        !loan.customer_pincode ||
        !supportedStates.has(bureauState) ||
        !Number.isFinite(amount) ||
        amount <= 0
      ) {
        throw new Error("Incomplete or invalid Bureau inputs");
      }

      const xmlFields = [
        firstName,
        middleName,
        lastName,
        loan.customer_address,
        loan.customer_city,
      ];

      if (
        xmlFields.some((value) =>
          /[<&\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(
            String(value)
          )
        )
      ) {
        throw new Error("Unsupported characters in Bureau inputs");
      }

      const genderInput = clean(loan.gender).toLowerCase();

      const bureauGender =
        genderInput === "f"
          ? "female"
          : genderInput === "m"
            ? "male"
            : genderInput;

      const bureau = await runBureau({
        first_name: firstName,
        middle_name: middleName,
        last_name: lastName,
        dob: loan.dob,
        gender: bureauGender,
        pan_number: loan.pan_number,
        mobile_number: loan.mobile_number,
        current_address: loan.customer_address,
        current_village_city: loan.customer_city,
        current_state: bureauState,
        current_pincode: loan.customer_pincode,
        loan_amount: amount,
        loan_tenure: 0,
        enquiry_reason: "05",
        finance_purpose: 99,
      });

      score = Number(bureau?.score);

      if (
        bureau?.success !== true ||
        bureau.score == null ||
        !Number.isInteger(score) ||
        score < 300 ||
        score > 900 ||
        typeof bureau.response !== "string" ||
        !bureau.response.includes("<INProfileResponse")
      ) {
        throw new Error("Valid Experian Bureau report unavailable");
      }

      // Save verified Bureau report transactionally.
      await connection.beginTransaction();
      transactionStarted = true;

      await connection.query(
        `
        INSERT INTO loan_cibil_reports
          (lan, pan_number, score, report_xml, created_at)
        VALUES (?, ?, ?, ?, NOW())
        `,
        [lan, loan.pan_number, score, bureau.response]
      );

      await connection.query(
        `
        INSERT IGNORE INTO kyc_verification_status (lan)
        VALUES (?)
        `,
        [lan]
      );

      await connection.query(
        `
        UPDATE kyc_verification_status
        SET bureau_status = 'VERIFIED',
            bureau_api_response = ?
        WHERE lan = ?
        `,
        [bureau.response, lan]
      );

      const [updated] = await connection.query(
        `
        UPDATE loan_booking_niyara
        SET cibil_score = ?,
            updated_at = NOW()
        WHERE lan = ?
          AND status = 'Login'
          AND stage = 'Login'
          AND cibil_score IS NULL
        `,
        [score, lan]
      );

      if (updated.affectedRows !== 1) {
        throw new Error("Loan state changed during Bureau verification");
      }

      await connection.commit();
      transactionStarted = false;
    }

    // ----------------------------------------------------
    // STEP 5: RUN FINAL NIYARA BRE
    // ----------------------------------------------------

    const bre = runBRE({
      requested_amount: loan.requested_amount,
      age: loan.age,
      annual_income: loan.annual_income,
      bureau_score: score,
    });

    if (bre.decision === "PENDING") {
      throw new Error("BRE inputs incomplete");
    }

    // ----------------------------------------------------
    // STEP 6: RUN TRACKWIZZ AML
    // ----------------------------------------------------

    const aml = await screenLoanBooking("niyara", lan);

    const amlStatus = clean(
      aml.amlStatus || aml.decision
    ).toUpperCase();

    const [[screening]] = await connection.query(
      `
      SELECT status
      FROM screening_requests
      WHERE id = ?
        AND partner_key = 'niyara'
        AND lan = ?
      LIMIT 1
      `,
      [aml.screeningRequestId || 0, lan]
    );

    const amlCompleted =
      aml.degraded !== true &&
      screening?.status === "COMPLETED";

    const amlApproved =
      amlCompleted &&
      amlStatus === "PROCEED";

    // ----------------------------------------------------
    // STEP 7: SET FINAL STATUS / STAGE
    // ----------------------------------------------------

    let status = "Login";
    let stage = "Login";

    if (bre.decision === "REJECTED") {
      status = "bre_rejected";
      stage = "bre_rejected";
    } else if (bre.decision === "APPROVED" && amlApproved) {
      status = "bre_approved";
      stage = "partner_credit_pending";
    } else if (amlCompleted && amlStatus === "STOP") {
      status = "aml_rejected";
      stage = "aml_rejected";
    }

    const [updated] = await connection.query(
      `
      UPDATE loan_booking_niyara
      SET niyara_bre_status = ?,
          niyara_bre_reason = ?,
          niyara_bre_checked_at = NOW(),
          status = ?,
          stage = ?,
          updated_at = NOW()
      WHERE lan = ?
        AND status = 'Login'
        AND stage = 'Login'
        AND (
          niyara_bre_status IS NULL
          OR niyara_bre_status IN ('APPROVED', 'PENDING')
        )
      `,
      [bre.decision, bre.reason, status, stage, lan]
    );

    if (updated.affectedRows !== 1) {
      throw new Error("Loan verification state changed");
    }

    return res.status(201).json({
      success: true,
      message: "Niyara loan created and verification processed",
      data: {
        id: insertId,
        partner_loan_id: data.partner_loan_id,
        lan,
        status,
        stage,
        verification: {
          completed: true,
          bre_status: bre.decision,
          aml_status: amlStatus,
          bureau_checked: true,
        },
        next_step:
          status === "bre_approved"
            ? "PARTNER_CREDIT"
            : null,
      },
    });
  } catch (error) {
    if (connection && transactionStarted) {
      try {
        await connection.rollback();
        transactionStarted = false;
      } catch (rollbackError) {
        console.error("[NIYARA] Rollback error:", rollbackError);
      }
    }

    console.error("[NIYARA] Login error:", error);

    // Booking has already been committed.
    // Never return "booking failed" for a completed insert.
    if (bookingCommitted) {
      return res.status(201).json({
        success: true,
        message:
          "Niyara loan created; automatic verification is pending",
        data: {
          id: insertId,
          partner_loan_id: data?.partner_loan_id,
          lan: ids.lan,
          status: "Login",
          stage: "Login",
          verification: {
            completed: false,
            code: "VERIFICATION_PENDING_RETRY",
          },
          next_step: "RETRY_VERIFICATION",
        },
      });
    }

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "Duplicate partner_loan_id or LAN",
      });
    }

    return res.status(500).json({
      success: false,
      message:
        error.message === "NIYARA_SEQUENCE_NOT_INITIALIZED"
          ? "Niyara LAN sequence not initialized"
          : "Failed to create Niyara loan login",
    });
  } finally {
    if (connection) {
      if (verificationLocked && lockName) {
        try {
          await connection.query(
            "SELECT RELEASE_LOCK(?)",
            [lockName]
          );
        } catch (lockError) {
          console.error("[NIYARA] Lock release error:", lockError);
        }
      }

      connection.release();
    }
  }
});

// GET /api/niyara/customer-details/:lan

router.get( "/customer-details/:lan",
  verifyApiKey,
  verifyNiyaraPartner,
  async (req, res) => {
    try {
      const lan = clean(req.params.lan).toUpperCase();

      // Validate Niyara LAN
      if (!/^NYRA\d+$/.test(lan)) {
        return res.status(400).json({
          success: false,
          message: "Valid Niyara LAN is required",
        });
      }

      // Fetch loan booking details
      const [[loan]] = await db.promise().query(
        `
        SELECT
          id,
          partner_loan_id,
          lan,
          lender,
          product,
          loan_type,
          DATE_FORMAT(login_date, '%Y-%m-%d') AS login_date,

          customer_name,
          first_name,
          middle_name,
          last_name,
          mobile_number,
          email,
          pan_number,
          DATE_FORMAT(borrower_dob, '%Y-%m-%d') AS borrower_dob,
          age,
          gender,
          annual_income,

          customer_address,
          address_line_2,
          customer_pincode,
          customer_city,
          customer_state,
          district,

          business_name,
          business_type,
          gst_number,
          udyam_number,
          business_address,
          business_pincode,
          business_city,
          business_state,
          business_district,
          business_vintage,
          industry,

          requested_amount,
          loan_amount,
          loan_tenure,
          interest,
          emi_amount,
          processing_fee,
          insurance_amount,
          net_disbursement,
          repayment_frequency,
          tenure_unit,

          status,
          stage,
          source,
          created_by,
          updated_by,
          created_at,
          updated_at

        FROM ${TABLE_NAME}
        WHERE lan = ?
        LIMIT 1
        `,
        [lan],
      );

      if (!loan) {
        return res.status(404).json({
          success: false,
          message: "Niyara loan not found",
        });
      }

      return res.status(200).json({
        success: true,
        message: "Niyara customer details fetched successfully",
        data: {
          loan,
        },
      });
    } catch (error) {
      console.error("[NIYARA] Customer details error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to fetch Niyara customer details",
      });
    }
  },
);

// GET /api/niyara/all-loans

router.get("/all-loans", verifyApiKey, verifyNiyaraPartner, (req, res) => {
  return fetchNiyaraLoans(req, res);
});

// GET /api/niyara/partner-credit-loans

router.get("/partner-credit-loans",
  verifyApiKey,
  verifyNiyaraPartner,
  (req, res) => {
    return fetchNiyaraLoans(req, res, {
      partnerCreditOnly: true,
    });
  },
);

// PATCH /api/niyara/:lan/partner-credit-decision

router.patch("/:lan/partner-credit-decision",
  verifyApiKey,
  verifyNiyaraPartner,
  async (req, res) => {
    try {
      const lan = clean(req.params.lan).toUpperCase();
      const decision = clean(req.body?.decision).toLowerCase();
      const reason = clean(req.body?.reason);

      if (!/^NYRA\d+$/.test(lan)) {
        return res.status(400).json({
          success: false,
          message: "Invalid Niyara LAN",
        });
      }

      if (!["approve", "reject"].includes(decision)) {
        return res.status(400).json({
          success: false,
          message: "decision must be approve or reject",
        });
      }

      if (decision === "reject" && !reason) {
        return res.status(400).json({
          success: false,
          message: "Rejection reason is required",
        });
      }

      if (reason.length > 1000) {
        return res.status(400).json({
          success: false,
          message: "Reason cannot exceed 1000 characters",
        });
      }

      const approved = decision === "approve";

      const newStatus = approved
        ? "partner_credit_approved"
        : "partner_credit_rejected";

      const newStage = approved
        ? "ff_credit_pending"
        : "partner_credit_rejected";

      const decidedBy = `NIYARA_API_KEY:${req.partner.id}`;

      const [result] = await db.promise().query(
        `UPDATE ${TABLE_NAME}
         SET status = ?,
             stage = ?,
             partner_credit_decision = ?,
             partner_credit_decision_reason = ?,
             partner_credit_decision_by = ?,
             partner_credit_decided_at = NOW(),
             updated_by = ?
         WHERE lan = ?
           AND status = 'bre_approved'
           AND stage = 'partner_credit_pending'
           AND niyara_bre_status = 'APPROVED'
           AND aml_status = 'PROCEED'
           AND niyara_bre_checked_at IS NOT NULL
           AND aml_checked_at IS NOT NULL
           AND partner_credit_decision IS NULL`,
        [
          newStatus,
          newStage,
          approved ? "APPROVED" : "REJECTED",
          reason || null,
          decidedBy,
          decidedBy,
          lan,
        ],
      );

      if (!result.affectedRows) {
        return res.status(409).json({
          success: false,
          message: "Loan not eligible for Partner Credit decision",
        });
      }

      return res.status(200).json({
        success: true,
        message: approved
          ? "Partner Credit approved successfully"
          : "Partner Credit rejected successfully",
        data: {
          lan,
          status: newStatus,
          stage: newStage,
          decision: approved ? "APPROVED" : "REJECTED",
          next_step: approved ? "CREDIT_REVIEW" : null,
        },
      });
    } catch (error) {
      console.error("[NIYARA] Partner Credit error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to process Partner Credit decision",
      });
    }
  },
);

// GET /api/niyara/credit-loans
router.get("/credit-loans", authenticateUser, (req, res) => {
  return fetchNiyaraLoans(req, res, {
    creditOnly: true,
  });
});

// PATCH /api/niyara/:lan/credit-decision

router.patch("/:lan/credit-decision", authenticateUser, async (req, res) => {
  try {
    const lan = clean(req.params.lan).toUpperCase();
    const decision = clean(req.body?.decision).toLowerCase();
    const reason = clean(req.body?.reason);

    if (!/^NYRA\d+$/.test(lan)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Niyara LAN",
      });
    }

    if (!["approve", "reject"].includes(decision)) {
      return res.status(400).json({
        success: false,
        message: "decision must be approve or reject",
      });
    }

    if (decision === "reject" && !reason) {
      return res.status(400).json({
        success: false,
        message: "Rejection reason is required",
      });
    }

    if (reason.length > 1000) {
      return res.status(400).json({
        success: false,
        message: "Reason cannot exceed 1000 characters",
      });
    }

    const approved = decision === "approve";

    const newStatus = approved ? "credit_approved" : "credit_rejected";

    const newStage = approved ? "esign_enach_pending" : "credit_rejected";

    const updatedBy = String(req.user?.id ?? req.user?.name ?? "");

    if (!updatedBy) {
      return res.status(403).json({
        success: false,
        message: "Authenticated user identity required",
      });
    }

    const [result] = await db.promise().query(
      `UPDATE ${TABLE_NAME}
         SET status = ?,
             stage = ?,
             credit_decision_by = ?,
             credit_decision_reason = ?,
             updated_by = ?
         WHERE lan = ?
           AND status = 'partner_credit_approved'
           AND stage = 'ff_credit_pending'
           AND partner_credit_decision = 'APPROVED'
           AND niyara_bre_status = 'APPROVED'
           AND aml_status = 'PROCEED'
           AND niyara_bre_checked_at IS NOT NULL
           AND aml_checked_at IS NOT NULL`,
      [newStatus, newStage, updatedBy, reason || null, updatedBy, lan],
    );

    if (!result.affectedRows) {
      return res.status(409).json({
        success: false,
        message: "Loan not eligible for Credit decision",
      });
    }

    return res.status(200).json({
      success: true,
      message: approved
        ? "Niyara Credit approved successfully"
        : "Niyara Credit rejected successfully",
      data: {
        lan,
        decision: approved ? "APPROVED" : "REJECTED",
        status: newStatus,
        stage: newStage,
        reason: reason || null,
        decided_by: updatedBy,
        next_step: approved ? "ESIGN_ENACH" : null,
      },
    });
  } catch (error) {
    console.error("[NIYARA] Credit decision error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to process Credit decision",
    });
  }
});

// POST /api/niyara/:lan/esign/:type
router.post("/:lan/esign/:type", authenticateUser, async (req, res) => {
  try {
    const lan = clean(req.params.lan).toUpperCase();
    const type = clean(req.params.type).toUpperCase();

    // 1. Validate LAN
    if (!/^NYRA\d+$/.test(lan)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Niyara LAN",
      });
    }

    // 2. Validate document type
    if (!["SANCTION", "AGREEMENT"].includes(type)) {
      return res.status(400).json({
        success: false,
        message: "Type must be sanction or agreement",
      });
    }

    // 3. Fetch Niyara loan
    const [[loan]] = await db.promise().query(
      `SELECT
           lan,
           status,
           stage,
           loan_amount,
           loan_tenure,
           interest,
           sanction_esign_status,
           agreement_esign_status
         FROM ${TABLE_NAME}
         WHERE lan = ?
         LIMIT 1`,
      [lan],
    );

    if (!loan) {
      return res.status(404).json({
        success: false,
        message: "Niyara loan not found",
      });
    }

    // 4. Credit must be approved
    if (
      loan.status !== "credit_approved" ||
      loan.stage !== "esign_enach_pending"
    ) {
      return res.status(409).json({
        success: false,
        message: "Credit approval is required before eSign",
      });
    }

    // 5. Final loan terms required
    if (
      !(Number(loan.loan_amount) > 0) ||
      !(Number(loan.loan_tenure) > 0) ||
      loan.interest == null ||
      !Number.isFinite(Number(loan.interest))
    ) {
      return res.status(409).json({
        success: false,
        message: "Final loan details are incomplete",
      });
    }

    // 6. Prevent duplicate initiation
    const currentStatus = clean(
      type === "SANCTION"
        ? loan.sanction_esign_status
        : loan.agreement_esign_status,
    ).toUpperCase();

    if (
      ["INITIATED", "IN_PROGRESS", "REQUESTED", "SIGNED"].includes(
        currentStatus,
      )
    ) {
      return res.status(409).json({
        success: false,
        message: `${type} eSign already ${currentStatus}`,
      });
    }

    // 7. Agreement template check
    if (type === "AGREEMENT") {
      const context = getLoanContext(lan);

      const templateFile = context.agreementTemplate;

      if (
        !templateFile ||
        !fs.existsSync(path.join(__dirname, "../../templates", templateFile))
      ) {
        return res.status(409).json({
          success: false,
          message: "Niyara agreement template is not ready",
        });
      }
    }

    // 8. Reuse existing Doqfy service
    const result = await initDoqfyEsign(lan, type);

    if (!result?.success) {
      return res.status(502).json({
        success: false,
        message: "Doqfy eSign initiation failed",
      });
    }

    // 9. Response
    return res.status(200).json({
      success: true,
      message: `Niyara ${type} eSign initiated successfully`,
      data: {
        lan,
        document_type: type,
        order_id: result.orderId,
        sign_url: result.sign_url || null,
        status: "INITIATED",
      },
    });
  } catch (error) {
    console.error("[NIYARA] eSign error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to initiate Niyara eSign",
    });
  }
});

// GET /api/niyara/:lan/esign-status

router.get("/:lan/esign-status", authenticateUser, async (req, res) => {
  try {
    const lan = clean(req.params.lan).toUpperCase();

    if (!/^NYRA\d+$/.test(lan)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Niyara LAN",
      });
    }

    // 1. Fetch loan eSign details
    const [[loan]] = await db.promise().query(
      `SELECT
          lan,
          sanction_esign_status,
          sanction_esign_document_id,
          agreement_esign_status,
          agreement_esign_document_id
        FROM ${TABLE_NAME}
        WHERE lan = ?
        LIMIT 1`,
      [lan],
    );

    if (!loan) {
      return res.status(404).json({
        success: false,
        message: "Niyara loan not found",
      });
    }

    // 2. Fetch the matching Doqfy documents
    const [documents] = await db.promise().query(
      `SELECT
          document_id,
          document_type,
          status,
          signed_file_path
        FROM esign_documents
        WHERE lan = ?
          AND document_id IN (?, ?)`,
      [
        lan,
        loan.sanction_esign_document_id || "",
        loan.agreement_esign_document_id || "",
      ],
    );

    const getStatus = (type, bookingStatus, documentId) => {
      const document = documents.find(
        (item) =>
          String(item.document_id) === String(documentId) &&
          String(item.document_type).toUpperCase() === type,
      );

      const status = String(bookingStatus || "NOT_INITIATED").toUpperCase();

      const signed =
        status === "SIGNED" &&
        String(document?.status || "").toUpperCase() === "SIGNED" &&
        Boolean(document?.signed_file_path);

      return {
        status,
        document_id: documentId || null,
        signed_pdf_available: Boolean(document?.signed_file_path),
        verified_signed: signed,
      };
    };

    // 3. Sanction status
    const sanction = getStatus(
      "SANCTION",
      loan.sanction_esign_status,
      loan.sanction_esign_document_id,
    );

    // 4. Agreement status
    const agreement = getStatus(
      "AGREEMENT",
      loan.agreement_esign_status,
      loan.agreement_esign_document_id,
    );

    return res.status(200).json({
      success: true,
      message: "Niyara eSign status fetched successfully",
      data: {
        lan,
        sanction,
        agreement,
        esign_completed: sanction.verified_signed && agreement.verified_signed,
      },
    });
  } catch (error) {
    console.error("[NIYARA] eSign status error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch Niyara eSign status",
    });
  }
});

//Esign Mandate Status

router.get("/:lan/enach-status", authenticateUser, async (req, res) => {
  try {
    const lan = clean(req.params.lan).toUpperCase();

    if (!/^NYRA\d+$/.test(lan)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Niyara LAN",
      });
    }

    const [[loan]] = await db.promise().query(
      `SELECT lan, bank_status
         FROM ${TABLE_NAME}
         WHERE lan = ?
         LIMIT 1`,
      [lan],
    );

    if (!loan) {
      return res.status(404).json({
        success: false,
        message: "Niyara loan not found",
      });
    }

    const [mandates] = await db.promise().query(
      `SELECT
          document_id,
          status,
          mandate_amount,
          umrn,
          auth_url
        FROM enach_mandates
        WHERE lan = ?`,
      [lan],
    );

    return res.status(200).json({
      success: true,
      message: "Niyara eNACH status fetched successfully",
      data: {
        lan,
        bank_status: loan.bank_status || null,
        enach_status: mandates.length
          ? mandates.length === 1
            ? mandates[0].status
            : "MULTIPLE_MANDATES"
          : "NOT_INITIATED",
        mandates,
        mandate_exists: mandates.length > 0,
      },
    });
  } catch (error) {
    console.error("[NIYARA] eNACH status error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch eNACH status",
    });
  }
});

router.get("/ops-maker-loans", authenticateUser, async (req, res) => {
  try {
    const [rows] = await db.promise().query(
      `SELECT
          lan,
          customer_name,
          mobile_number,
          loan_amount,
          status,
          stage,
          sanction_esign_status,
          agreement_esign_status,
          bank_status,
          ops_maker_decision,
          created_at
        FROM ${TABLE_NAME}
        WHERE status = 'credit_approved'
          AND stage = 'esign_enach_pending'
        ORDER BY id DESC`,
    );

    return res.status(200).json({
      success: true,
      message: "Niyara Ops Maker loans fetched successfully",
      rows,
      total: rows.length,
    });
  } catch (error) {
    console.error("[NIYARA] Ops Maker loans:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch Ops Maker loans",
    });
  }
});

router.get("/ops-checker-loans", authenticateUser, async (req, res) => {
  try {
    const [rows] = await db.promise().query(
      `SELECT
          lan,
          customer_name,
          mobile_number,
          loan_amount,
          status,
          stage,
          ops_maker_decision,
          ops_maker_decision_by,
          ops_maker_decided_at,
          created_at
        FROM ${TABLE_NAME}
        WHERE status = 'ops_maker_initiated'
          AND stage = 'ops_checker_pending'
          AND ops_maker_decision = 'APPROVED'
        ORDER BY id DESC`,
    );

    return res.status(200).json({
      success: true,
      message: "Niyara Ops Checker loans fetched successfully",
      rows,
      total: rows.length,
    });
  } catch (error) {
    console.error("[NIYARA] Ops Checker loans:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch Ops Checker loans",
    });
  }
});

router.patch("/:lan/ops-maker-decision", authenticateUser, async (req, res) => {
  try {
    const lan = clean(req.params.lan).toUpperCase();
    const decision = clean(req.body?.decision).toLowerCase();
    const reason = clean(req.body?.reason);

    const updatedBy = String(req.user?.id ?? req.user?.name ?? "");

    // 1. Validation
    if (!/^NYRA\d+$/.test(lan)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Niyara LAN",
      });
    }

    if (!["approve", "reject"].includes(decision)) {
      return res.status(400).json({
        success: false,
        message: "decision must be approve or reject",
      });
    }

    if (decision === "reject" && !reason) {
      return res.status(400).json({
        success: false,
        message: "Rejection reason required",
      });
    }

    if (reason.length > 1000) {
      return res.status(400).json({
        success: false,
        message: "Reason too long",
      });
    }

    if (!updatedBy) {
      return res.status(403).json({
        success: false,
        message: "User identity required",
      });
    }

    const approved = decision === "approve";

    const newStatus = approved ? "ops_maker_initiated" : "ops_maker_rejected";

    const newStage = approved ? "ops_checker_pending" : "ops_maker_rejected";

    // 2. Require completed documents for approval.
    // This checks persisted provider records.
    // Webhook authentication must be implemented
    // before enabling live financial approvals.
    const approvalConditions = approved
      ? `
          AND sanction_esign_status = 'SIGNED'
          AND agreement_esign_status = 'SIGNED'
          AND bank_status = 'MANDATE_CREATED'

          AND EXISTS (
            SELECT 1
            FROM esign_documents sd
            WHERE sd.lan = ${TABLE_NAME}.lan
              AND sd.document_id =
                  ${TABLE_NAME}.sanction_esign_document_id
              AND sd.document_type = 'SANCTION'
              AND sd.status = 'SIGNED'
              AND sd.signed_file_path IS NOT NULL
          )

          AND EXISTS (
            SELECT 1
            FROM esign_documents ad
            WHERE ad.lan = ${TABLE_NAME}.lan
              AND ad.document_id =
                  ${TABLE_NAME}.agreement_esign_document_id
              AND ad.document_type = 'AGREEMENT'
              AND ad.status = 'SIGNED'
              AND ad.signed_file_path IS NOT NULL
          )

          AND EXISTS (
            SELECT 1
            FROM enach_mandates m
            WHERE m.lan = ${TABLE_NAME}.lan
              AND UPPER(TRIM(m.status)) IN
                  ('SUCCESS', 'REGISTERED', 'ACTIVE')
              AND NULLIF(TRIM(m.umrn), '') IS NOT NULL
              AND m.webhook_payload IS NOT NULL
          )
        `
      : "";

    // 3. Atomic decision update
    const [result] = await db.promise().query(
      `UPDATE ${TABLE_NAME}
         SET
           status = ?,
           stage = ?,
           ops_maker_decision = ?,
           ops_maker_decision_reason = ?,
           ops_maker_decision_by = ?,
           ops_maker_decided_at = NOW(),
           updated_by = ?
         WHERE lan = ?
           AND status = 'credit_approved'
           AND stage = 'esign_enach_pending'
           AND ops_maker_decision IS NULL
           ${approvalConditions}`,
      [
        newStatus,
        newStage,
        approved ? "APPROVED" : "REJECTED",
        reason || null,
        updatedBy,
        updatedBy,
        lan,
      ],
    );

    if (!result.affectedRows) {
      return res.status(409).json({
        success: false,
        message:
          "Loan is not eligible for Ops Maker decision. Check stage, eSign and eNACH.",
      });
    }

    // 4. Response
    return res.status(200).json({
      success: true,
      message: approved
        ? "Niyara Ops Maker approved successfully"
        : "Niyara Ops Maker rejected successfully",
      data: {
        lan,
        decision: approved ? "APPROVED" : "REJECTED",
        status: newStatus,
        stage: newStage,
        decided_by: updatedBy,
        next_step: approved ? "OPS_CHECKER" : null,
      },
    });
  } catch (error) {
    console.error("[NIYARA] Ops Maker error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to process Ops Maker decision",
    });
  }
});

router.patch("/:lan/ops-checker-decision",
  authenticateUser,
  async (req, res) => {
    try {
      const lan = clean(req.params.lan).toUpperCase();
      const decision = clean(req.body?.decision).toLowerCase();
      const reason = clean(req.body?.reason);

      const updatedBy = String(req.user?.id ?? req.user?.name ?? "").trim();

      // 1. Validate request
      if (!/^NYRA\d+$/.test(lan)) {
        return res.status(400).json({
          success: false,
          message: "Invalid Niyara LAN",
        });
      }

      if (!["approve", "reject"].includes(decision)) {
        return res.status(400).json({
          success: false,
          message: "decision must be approve or reject",
        });
      }

      if (decision === "reject" && !reason) {
        return res.status(400).json({
          success: false,
          message: "Rejection reason is required",
        });
      }

      if (reason.length > 1000) {
        return res.status(400).json({
          success: false,
          message: "Reason cannot exceed 1000 characters",
        });
      }

      if (!updatedBy) {
        return res.status(403).json({
          success: false,
          message: "Authenticated user identity required",
        });
      }

      // 2. Fetch Niyara loan
      const [[loan]] = await db.promise().query(
        `SELECT
           lan,
           status,
           stage,
           ops_maker_decision,
           ops_maker_decision_by,
           ops_checker_decision
         FROM ${TABLE_NAME}
         WHERE lan = ?
         LIMIT 1`,
        [lan],
      );

      if (!loan) {
        return res.status(404).json({
          success: false,
          message: "Niyara loan not found",
        });
      }

      // 3. Ops Maker approval required
      if (
        loan.status !== "ops_maker_initiated" ||
        loan.stage !== "ops_checker_pending" ||
        loan.ops_maker_decision !== "APPROVED" ||
        loan.ops_checker_decision != null
      ) {
        return res.status(409).json({
          success: false,
          message: "Loan is not eligible for Ops Checker decision",
          current_status: loan.status,
          current_stage: loan.stage,
        });
      }

      // 4. Maker and Checker must be different users
      if (
        !loan.ops_maker_decision_by ||
        String(loan.ops_maker_decision_by).toLowerCase() ===
          updatedBy.toLowerCase()
      ) {
        return res.status(403).json({
          success: false,
          message: "Ops Checker must be different from Ops Maker",
        });
      }

      const approved = decision === "approve";

      const newStatus = approved
        ? "ops_checker_approved"
        : "ops_checker_rejected";

      const newStage = approved
        ? "disbursement_pending"
        : "ops_checker_rejected";

      // 5. Recheck documents/mandate for approval.
      // Production must also verify provider authenticity.
      const approvalConditions = approved
        ? `
          AND sanction_esign_status = 'SIGNED'
          AND agreement_esign_status = 'SIGNED'
          AND bank_status = 'MANDATE_CREATED'

          AND EXISTS (
            SELECT 1 FROM esign_documents s
            WHERE s.lan = ${TABLE_NAME}.lan
              AND s.document_id =
                ${TABLE_NAME}.sanction_esign_document_id
              AND s.document_type = 'SANCTION'
              AND s.status = 'SIGNED'
              AND s.signed_file_path IS NOT NULL
          )

          AND EXISTS (
            SELECT 1 FROM esign_documents a
            WHERE a.lan = ${TABLE_NAME}.lan
              AND a.document_id =
                ${TABLE_NAME}.agreement_esign_document_id
              AND a.document_type = 'AGREEMENT'
              AND a.status = 'SIGNED'
              AND a.signed_file_path IS NOT NULL
          )

          AND EXISTS (
            SELECT 1 FROM enach_mandates m
            WHERE m.lan = ${TABLE_NAME}.lan
              AND UPPER(TRIM(m.status)) IN
                ('SUCCESS', 'REGISTERED', 'ACTIVE')
              AND NULLIF(TRIM(m.umrn), '') IS NOT NULL
              AND m.webhook_payload IS NOT NULL
          )
        `
        : "";

      // 6. Atomic status update
      const [result] = await db.promise().query(
        `UPDATE ${TABLE_NAME}
         SET
           status = ?,
           stage = ?,
           ops_checker_decision = ?,
           ops_checker_decision_reason = ?,
           ops_checker_decision_by = ?,
           ops_checker_decided_at = NOW(),
           updated_by = ?
         WHERE lan = ?
           AND status = 'ops_maker_initiated'
           AND stage = 'ops_checker_pending'
           AND ops_maker_decision = 'APPROVED'
           AND ops_checker_decision IS NULL
           AND ops_maker_decision_by IS NOT NULL
           AND LOWER(ops_maker_decision_by) <> LOWER(?)
           ${approvalConditions}`,
        [
          newStatus,
          newStage,
          approved ? "APPROVED" : "REJECTED",
          reason || null,
          updatedBy,
          updatedBy,
          lan,
          updatedBy,
        ],
      );

      if (!result.affectedRows) {
        return res.status(409).json({
          success: false,
          message:
            "Ops Checker decision not allowed. Check Maker approval and verification status.",
        });
      }

      // 7. Return response
      return res.status(200).json({
        success: true,
        message: approved
          ? "Niyara Ops Checker approved successfully"
          : "Niyara Ops Checker rejected successfully",
        data: {
          lan,
          decision: approved ? "APPROVED" : "REJECTED",
          status: newStatus,
          stage: newStage,
          decided_by: updatedBy,
          next_step: approved ? "DISBURSEMENT" : null,
        },
      });
    } catch (error) {
      console.error("[NIYARA] Ops Checker error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to process Ops Checker decision",
      });
    }
  },
);

router.post("/:lan/disbursement", authenticateUser, async (req, res) => {
  let conn;
  let lockAcquired = false;

  const lan = clean(req.params.lan).toUpperCase();
  const lockName = `niyara-payout:${lan}`;

  try {
    if (!/^NYRA\d+$/.test(lan) || lan.length > 50) {
      return res.status(400).json({
        success: false,
        message: "Invalid Niyara LAN",
      });
    }

    // Restrict to explicitly authorized users.
    const role = String(req.user?.role || "").toUpperCase();
    const permissions = Array.isArray(req.user?.permissions)
      ? req.user.permissions
      : [];

    if (
      role !== "SUPERADMIN" &&
      !permissions.includes("NIYARA_DISBURSEMENT_INITIATE")
    ) {
      return res.status(403).json({
        success: false,
        message: "Disbursement permission required",
      });
    }

    // Never process simulated payout as a real disbursement.
    if (process.env.ENABLE_REAL_PAYOUT !== "true") {
      return res.status(409).json({
        success: false,
        message: "Real payout is disabled",
      });
    }

    conn = await db.promise().getConnection();

    const [[lock]] = await conn.query("SELECT GET_LOCK(?, 0) AS acquired", [
      lockName,
    ]);

    if (Number(lock.acquired) !== 1) {
      return res.status(409).json({
        success: false,
        message: "Niyara payout already being processed",
      });
    }

    lockAcquired = true;

    const [[loan]] = await conn.query(
      `SELECT
           status,
           stage,
           ops_maker_decision,
           ops_checker_decision,
           niyara_bre_status,
           aml_status,
           cibil_score
         FROM loan_booking_niyara
         WHERE lan = ?
         LIMIT 1`,
      [lan],
    );

    if (!loan) {
      return res.status(404).json({
        success: false,
        message: "Niyara loan not found",
      });
    }

    if (
      loan.status !== "ops_checker_approved" ||
      loan.stage !== "disbursement_pending" ||
      loan.ops_maker_decision !== "APPROVED" ||
      loan.ops_checker_decision !== "APPROVED" ||
      loan.niyara_bre_status !== "APPROVED" ||
      loan.aml_status !== "PROCEED" ||
      loan.cibil_score == null
    ) {
      return res.status(409).json({
        success: false,
        message: "Niyara loan is not eligible for payout",
        current_status: loan.status,
        current_stage: loan.stage,
      });
    }

    // Never blindly retry an existing payout.
    // Even a FAILED or unknown result needs reconciliation.
    const [[existing]] = await conn.query(
      `SELECT unique_request_number, status, payout_status
         FROM quick_transfers
         WHERE lan = ?
         ORDER BY id DESC
         LIMIT 1`,
      [lan],
    );

    if (existing) {
      return res.status(409).json({
        success: false,
        message: "Existing payout requires reconciliation",
        payout_status: existing.payout_status || existing.status,
        unique_request_number: existing.unique_request_number,
      });
    }

    const payoutResult = await approveAndInitiatePayout({
      lan,
      table: "loan_booking_niyara",
    });

    if (!payoutResult.success) {
      return res.status(409).json({
        success: false,
        message: payoutResult.message || "Payout initiation failed",
      });
    }

    const payoutStatus = String(payoutResult.payout_status || "").toLowerCase();

    const finalStatuses = ["success", "completed", "processed"];
    const pendingStatuses = [
      "initiated",
      "pending",
      "queued",
      "processing",
      "in_progress",
    ];

    const [[updatedLoan]] = await conn.query(
      `SELECT status, stage
         FROM loan_booking_niyara
         WHERE lan = ?`,
      [lan],
    );

    const disbursed =
      finalStatuses.includes(payoutStatus) &&
      updatedLoan?.status === "Disbursed";

    return res.status(disbursed ? 200 : 202).json({
      success: true,
      message: disbursed
        ? "Niyara loan disbursed successfully"
        : pendingStatuses.includes(payoutStatus)
          ? "Payout initiated; awaiting confirmation"
          : "Payout result requires reconciliation",
      data: {
        lan,
        payout_status: payoutStatus,
        loan_status: updatedLoan?.status,
        stage: updatedLoan?.stage,
        unique_request_number: payoutResult.unique_request_number,
        disbursed,
      },
    });
  } catch (error) {
    console.error("[NIYARA] Disbursement error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to process Niyara disbursement",
    });
  } finally {
    if (conn) {
      try {
        if (lockAcquired) {
          await conn.query("SELECT RELEASE_LOCK(?)", [lockName]);
        }
      } finally {
        conn.release();
      }
    }
  }
});

router.patch("/:lan/final-details", authenticateUser, async (req, res) => {
  let connection;

  try {
    const lan = clean(req.params.lan).toUpperCase();

    if (!/^NYRA\d+$/.test(lan)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Niyara LAN",
      });
    }

    const {
      loan_amount,
      loan_tenure,
      interest,
      emi_amount,
      processing_fee = 0,
      insurance_amount = 0,
      repayment_frequency,
      tenure_unit,
      bank_name,
      name_in_bank,
      account_number,
      ifsc,
    } = req.body || {};

    const amount = Number(loan_amount);
    const tenure = Number(loan_tenure);
    const rate = Number(interest);
    const emi = Number(emi_amount);
    const pf = Number(processing_fee);
    const insurance = Number(insurance_amount);

    if (
      !Number.isFinite(amount) ||
      amount <= 0 ||
      !Number.isSafeInteger(tenure) ||
      tenure <= 0 ||
      interest == null ||
      !Number.isFinite(rate) ||
      rate < 0 ||
      !Number.isFinite(emi) ||
      emi <= 0 ||
      !Number.isFinite(pf) ||
      pf < 0 ||
      !Number.isFinite(insurance) ||
      insurance < 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid final loan financial details",
      });
    }

    const netDisbursement = Math.round((amount - pf - insurance) * 100) / 100;

    if (netDisbursement <= 0) {
      return res.status(400).json({
        success: false,
        message: "Net disbursement must be greater than zero",
      });
    }

    const frequency = clean(repayment_frequency);
    const tenureUnit = clean(tenure_unit);
    const bankName = clean(bank_name);
    const nameInBank = clean(name_in_bank);
    const accountNo = clean(account_number);
    const bankIfsc = clean(ifsc).toUpperCase();

    if (
      !frequency ||
      !tenureUnit ||
      !bankName ||
      !nameInBank ||
      !accountNo ||
      !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(bankIfsc)
    ) {
      return res.status(400).json({
        success: false,
        message: "Complete repayment and bank details required",
      });
    }

    const updatedBy = String(req.user?.id ?? req.user?.name ?? "").trim();

    if (!updatedBy) {
      return res.status(403).json({
        success: false,
        message: "Authenticated user identity required",
      });
    }

    connection = await db.promise().getConnection();
    await connection.beginTransaction();

    const [[loan]] = await connection.query(
      `SELECT
           lan,
           status,
           stage,
           requested_amount,
           ops_maker_decision
         FROM ${TABLE_NAME}
         WHERE lan = ?
         FOR UPDATE`,
      [lan],
    );

    if (!loan) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: "Niyara loan not found",
      });
    }

    if (
      loan.status !== "credit_approved" ||
      loan.stage !== "esign_enach_pending" ||
      loan.ops_maker_decision != null
    ) {
      await connection.rollback();
      return res.status(409).json({
        success: false,
        message: "Loan is not eligible for final details",
      });
    }

    if (
      Number(loan.requested_amount) > 0 &&
      amount > Number(loan.requested_amount)
    ) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: "Approved amount exceeds requested amount",
      });
    }

    // Do not modify terms after document or mandate initiation.
    const [[esign]] = await connection.query(
      `SELECT COUNT(*) AS total
         FROM esign_documents
         WHERE lan = ?`,
      [lan],
    );

    const [[mandate]] = await connection.query(
      `SELECT COUNT(*) AS total
         FROM enach_mandates
         WHERE lan = ?`,
      [lan],
    );

    if (Number(esign.total) > 0 || Number(mandate.total) > 0) {
      await connection.rollback();
      return res.status(409).json({
        success: false,
        message: "Loan documents or mandate already initiated",
      });
    }

    await connection.query(
      `UPDATE ${TABLE_NAME}
         SET
           loan_amount = ?,
           loan_tenure = ?,
           interest = ?,
           emi_amount = ?,
           processing_fee = ?,
           insurance_amount = ?,
           net_disbursement = ?,
           repayment_frequency = ?,
           tenure_unit = ?,
           bank_name = ?,
           name_in_bank = ?,
           account_number = ?,
           ifsc = ?,
           bank_status = 'PENDING_VERIFICATION',
           updated_by = ?,
           updated_at = NOW()
         WHERE lan = ?`,
      [
        amount,
        tenure,
        rate,
        emi,
        pf,
        insurance,
        netDisbursement,
        frequency,
        tenureUnit,
        bankName,
        nameInBank,
        accountNo,
        bankIfsc,
        updatedBy,
        lan,
      ],
    );

    await connection.commit();

    return res.status(200).json({
      success: true,
      message: "Niyara final loan details saved successfully",
      data: {
        lan,
        status: "credit_approved",
        stage: "esign_enach_pending",
        loan_amount: amount,
        loan_tenure: tenure,
        interest: rate,
        emi_amount: emi,
        processing_fee: pf,
        insurance_amount: insurance,
        net_disbursement: netDisbursement,
        bank_status: "PENDING_VERIFICATION",
        next_step: "BANK_VERIFICATION_ESIGN_ENACH",
      },
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }

    console.error("[NIYARA] Final details:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to save final loan details",
    });
  } finally {
    if (connection) connection.release();
  }
});

router.post("/:lan/verify", authenticateUser, async (req, res) => {
  let conn;
  let locked = false;
  let transactionStarted = false;

  const lan = clean(req.params.lan).toUpperCase();
  const lockName = `niyara-verify:${lan}`;

  try {
    if (!/^NYRA\d+$/.test(lan)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Niyara LAN",
      });
    }

    conn = await db.promise().getConnection();

    // Prevent concurrent verification requests for the same LAN.
    const [[lock]] = await conn.query("SELECT GET_LOCK(?, 0) AS acquired", [
      lockName,
    ]);

    if (Number(lock.acquired) !== 1) {
      return res.status(409).json({
        success: false,
        message: "Verification already in progress",
      });
    }

    locked = true;

    const [[loan]] = await conn.query(
      `SELECT
         lan, status, stage, customer_name,
         DATE_FORMAT(borrower_dob, '%Y-%m-%d') AS dob,
         age, gender, annual_income, pan_number,
         mobile_number, customer_address, customer_city,
         customer_state, customer_pincode,
         requested_amount, cibil_score, niyara_bre_status
       FROM ${TABLE_NAME}
       WHERE lan = ?
       LIMIT 1`,
      [lan],
    );

    if (!loan) {
      return res.status(404).json({
        success: false,
        message: "Niyara loan not found",
      });
    }

    if (loan.status !== "Login" || loan.stage !== "Login") {
      return res.status(409).json({
        success: false,
        message: "Only Login-stage loans can be verified",
      });
    }

    // Keep your existing Bureau-consent guard.
    // This record MUST be created by a trusted consent process.
    const [[consent]] = await conn.query(
      `SELECT id
       FROM loan_documents
       WHERE lan = ?
         AND doc_name = 'NIYARA_BUREAU_CONSENT_VERIFIED'
       LIMIT 1`,
      [lan],
    );

    if (!consent) {
      return res.status(409).json({
        success: false,
        message: "Verified Bureau consent is required",
      });
    }

    // Reuse completed reports; don't pay for another enquiry.
    const [[savedReport]] = await conn.query(
      `SELECT pan_number, score, report_xml
       FROM loan_cibil_reports
       WHERE lan = ?
       ORDER BY id DESC
       LIMIT 1`,
      [lan],
    );

    let score;

    if (savedReport) {
      // Do not reuse incomplete, mismatched or unverified data.
      const [[kyc]] = await conn.query(
        `SELECT bureau_status
         FROM kyc_verification_status
         WHERE lan = ?
           AND bureau_status = 'VERIFIED'
         LIMIT 1`,
        [lan],
      );

      score = Number(savedReport.score);

      if (
        !kyc ||
        savedReport.pan_number !== loan.pan_number ||
        loan.cibil_score == null ||
        Number(loan.cibil_score) !== score ||
        !Number.isInteger(score) ||
        score < 300 ||
        score > 900 ||
        typeof savedReport.report_xml !== "string" ||
        !savedReport.report_xml.includes("<INProfileResponse")
      ) {
        return res.status(409).json({
          success: false,
          message: "Existing Bureau record needs verification",
        });
      }
    } else {
      if (loan.cibil_score != null) {
        return res.status(409).json({
          success: false,
          message: "Bureau score exists without a report",
        });
      }

      const parts = clean(loan.customer_name).split(/\s+/).filter(Boolean);

      const firstName = parts[0] || "";
      const lastName = parts[parts.length - 1] || "";
      const middleName = parts.slice(1, -1).join(" ");

      const stateAliases = {
        HARYANA: "HARAYANA",
        GUJARAT: "GUJRAT",
        ODISHA: "ORRISA",
        UTTARAKHAND: "UTTRANCHAL",
        PUDUCHERRY: "PONDICHERRY",
      };

      const state = clean(loan.customer_state).toUpperCase();
      const bureauState = stateAliases[state] || state;

      // Must match names recognized by your existing service.
      const supportedStates = new Set(
        "JAMMU AND KASHMIR|HIMACHAL PRADESH|PUNJAB|CHANDIGARH|UTTRANCHAL|HARAYANA|DELHI|RAJASTHAN|UTTAR PRADESH|BIHAR|SIKKIM|ARUNACHAL PRADESH|NAGALAND|MANIPUR|MIZORAM|TRIPURA|MEGHALAYA|ASSAM|WEST BENGAL|JHARKHAND|ORRISA|CHHATTISGARH|MADHYA PRADESH|GUJRAT|MAHARASHTRA|ANDHRA PRADESH|KARNATAKA|GOA|LAKSHADWEEP|KERALA|TAMIL NADU|PONDICHERRY|TELANGANA".split(
          "|",
        ),
      );

      const amount = Number(loan.requested_amount);

      if (
        !firstName ||
        !loan.dob ||
        !loan.pan_number ||
        !loan.mobile_number ||
        !loan.customer_address ||
        !loan.customer_city ||
        !loan.customer_pincode ||
        !supportedStates.has(bureauState) ||
        !Number.isFinite(amount) ||
        amount <= 0
      ) {
        return res.status(422).json({
          success: false,
          message: "Incomplete or invalid Bureau inputs",
        });
      }

      // The shared SOAP builder doesn't escape XML text.
      const xmlFields = [
        firstName,
        lastName,
        middleName,
        loan.customer_address,
        loan.customer_city,
      ];

      if (
        xmlFields.some((v) =>
          /[<&\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(String(v)),
        )
      ) {
        return res.status(422).json({
          success: false,
          message: "Unsupported characters in Bureau inputs",
        });
      }

      const genderInput = clean(loan.gender).toLowerCase();

      const bureauGender =
        genderInput === "f"
          ? "female"
          : genderInput === "m"
            ? "male"
            : genderInput;

      const bureau = await runBureau({
        first_name: firstName,
        middle_name: middleName,
        last_name: lastName,
        dob: loan.dob,
        gender: loan.gender,
        pan_number: loan.pan_number,
        mobile_number: loan.mobile_number,
        current_address: loan.customer_address,
        current_village_city: loan.customer_city,
        current_state: bureauState,
        current_pincode: loan.customer_pincode,
        loan_amount: amount,
        loan_tenure: 0,
        enquiry_reason: "05",
        finance_purpose: 99,
      });

      score = Number(bureau?.score);

      if (
        bureau?.success !== true ||
        bureau.score == null ||
        !Number.isInteger(score) ||
        score < 300 ||
        score > 900 ||
        typeof bureau.response !== "string" ||
        !bureau.response.includes("<INProfileResponse")
      ) {
        return res.status(502).json({
          success: false,
          message: "Valid Experian Bureau report unavailable",
        });
      }

      await conn.beginTransaction();
      transactionStarted = true;

      await conn.query(
        `INSERT INTO loan_cibil_reports
          (lan, pan_number, score, report_xml, created_at)
         VALUES (?, ?, ?, ?, NOW())`,
        [lan, loan.pan_number, score, bureau.response],
      );

      await conn.query(
        `INSERT IGNORE INTO kyc_verification_status (lan)
         VALUES (?)`,
        [lan],
      );

      await conn.query(
        `UPDATE kyc_verification_status
         SET bureau_status = 'VERIFIED',
             bureau_api_response = ?
         WHERE lan = ?`,
        [bureau.response, lan],
      );

      const [updated] = await conn.query(
        `UPDATE ${TABLE_NAME}
         SET cibil_score = ?, updated_at = NOW()
         WHERE lan = ?
           AND status = 'Login'
           AND stage = 'Login'
           AND cibil_score IS NULL`,
        [score, lan],
      );

      if (!updated.affectedRows) {
        await conn.rollback();
        transactionStarted = false;
        return res.status(409).json({
          success: false,
          message: "Loan state changed during verification",
        });
      }

      await conn.commit();
      transactionStarted = false;
    }

    // Run your existing Niyara BRE.
    const bre = runBRE({
      requested_amount: loan.requested_amount,
      age: loan.age,
      annual_income: loan.annual_income,
      bureau_score: score,
    });

    if (bre.decision === "PENDING") {
      return res.status(422).json({
        success: false,
        message: "BRE inputs incomplete",
        data: { bre },
      });
    }

    // Run existing TrackWizz AML.
    const aml = await screenLoanBooking("niyara", lan);

    const amlStatus = clean(aml.amlStatus || aml.decision).toUpperCase();

    // Check the persisted provider screening completed.
    const [[screening]] = await conn.query(
      `SELECT status
       FROM screening_requests
       WHERE id = ?
         AND partner_key = 'niyara'
         AND lan = ?
       LIMIT 1`,
      [aml.screeningRequestId || 0, lan],
    );

    const amlApproved =
      aml.degraded !== true &&
      amlStatus === "PROCEED" &&
      screening?.status === "COMPLETED";

    let status = "Login";
    let stage = "Login";

    if (bre.decision === "REJECTED") {
      status = "bre_rejected";
      stage = "bre_rejected";
    } else if (amlApproved && bre.decision === "APPROVED") {
      status = "bre_approved";
      stage = "partner_credit_pending";
    } else if (
      aml.degraded !== true &&
      screening?.status === "COMPLETED" &&
      amlStatus === "STOP"
    ) {
      status = "aml_rejected";
      stage = "aml_rejected";
    }

    const [updated] = await conn.query(
      `UPDATE ${TABLE_NAME}
       SET niyara_bre_status = ?,
           niyara_bre_reason = ?,
           niyara_bre_checked_at = NOW(),
           status = ?,
           stage = ?,
           updated_at = NOW()
       WHERE lan = ?
         AND status = 'Login'
         AND stage = 'Login'
         AND (
           niyara_bre_status IS NULL
           OR niyara_bre_status IN ('APPROVED', 'PENDING')
         )`,
      [bre.decision, bre.reason, status, stage, lan],
    );

    if (!updated.affectedRows) {
      return res.status(409).json({
        success: false,
        message: "Loan verification state changed",
      });
    }

    return res.json({
      success: true,
      message: "Niyara verification processed",
      data: {
        lan,
        bureau_score: score,
        bre_status: bre.decision,
        aml_status: amlStatus,
        status,
        stage,
        next_step: status === "bre_approved" ? "PARTNER_CREDIT" : null,
      },
    });
  } catch (error) {
    if (conn && transactionStarted) {
      try {
        await conn.rollback();
      } catch (rollbackError) {
        console.error("[NIYARA] Rollback error:", rollbackError);
      }
    }

    console.error("[NIYARA] Verification error:", error);

    return res.status(500).json({
      success: false,
      message: "Niyara verification failed",
    });
  } finally {
    if (conn) {
      if (locked) {
        try {
          await conn.query("SELECT RELEASE_LOCK(?)", [lockName]);
        } catch (lockError) {
          console.error("[NIYARA] Lock release error:", lockError);
        }
      }

      conn.release();
    }
  }
});

// Export Router
module.exports = router;
