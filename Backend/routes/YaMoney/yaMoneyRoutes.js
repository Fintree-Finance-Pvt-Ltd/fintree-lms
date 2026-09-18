const express = require("express");
const db = require("../../config/db");
const verifyApiKey = require("../../middleware/apiKeyAuth");
const authenticateUser = require("../../middleware/verifyToken");
const { runBureau } = require("../../services/Bueraupullapiservice");
const { sendClientWebhook } = require("./yaMoneyWebhookService");
const { runBRE } = require("./yaMoneyBre");
const { approveAndInitiatePayout } = require("../../services/payout.service");
const partnerLimitService = require("../../services/partnerLimitService");
const {
  screenLoanBooking,
} = require("../../services/trackwizz/screeningService");

const router = express.Router();

// routes
const TABLE_NAME = "loan_booking_ya_money";
const SEQUENCE_KEY = "YA_MONEY_BUSINESS_LOAN";

const LENDER = "Ya Money";
const PRODUCT = "Ya Money";
const LOAN_TYPE = "Business Loan";
const LAN_PREFIX = "YAM";
const PARTNER_LIMIT_NAME = "YAMONEY";
const AML_SCREENING_PRODUCT = "ya_money";
const YA_MONEY_BUREAU_ENABLED = true;
const YA_MONEY_AML_COLUMNS = [
  "aml_status",
  "aml_score",
  "aml_total_matches",
  "aml_reason",
  "aml_api_response",
  "aml_checked_at",
];
const TRACKWIZZ_AML_STATUSES = new Set(["PROCEED", "REVIEW", "STOP"]);
const STATUS_EXPRESSION =
  "LOWER(REPLACE(REPLACE(TRIM(lb.status), '-', '_'), ' ', '_'))";
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const SORT_COLUMNS = {
  lan: "lan",
  LAN: "lan",
  partner_loan_id: "partner_loan_id",
  customer_name: "customer_name",
  business_name: "business_name",
  mobile_number: "mobile_number",
  requested_amount: "requested_amount",
  loan_amount: "loan_amount",
  login_date: "login_date",
  status: "status",
  stage: "stage",
};
const ACTIVE_PAYOUT_STATUSES = new Set([
  "initiated",
  "pending",
  "queued",
  "processing",
  "in_progress",
  "success",
  "completed",
  "processed",
]);

function clean(value) {
  return String(value ?? "").trim();
}

function digitsOnly(value) {
  return clean(value).replace(/\D/g, "");
}

function cleanAccountNumber(value) {
  return clean(value).replace(/\s+/g, "");
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

function isValidIfsc(value) {
  return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(clean(value).toUpperCase());
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

  if (YA_MONEY_BUREAU_ENABLED && !data.customer_address) {
    return "customer_address is required";
  }

  if (YA_MONEY_BUREAU_ENABLED && !data.customer_city) {
    return "customer_city is required";
  }

  if (YA_MONEY_BUREAU_ENABLED && !data.customer_state) {
    return "customer_state is required";
  }

  if (YA_MONEY_BUREAU_ENABLED && !data.customer_pincode) {
    return "customer_pincode is required";
  }

  if (data.customer_pincode && !/^[1-9][0-9]{5}$/.test(data.customer_pincode)) {
    return "customer_pincode must be 6 digits";
  }

  if (YA_MONEY_BUREAU_ENABLED && !isValidDate(data.dob)) {
    return "dob must be a valid date in YYYY-MM-DD format";
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

function toNumberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

async function assertYaMoneyAmlColumns() {
  const [rows] = await db.promise().query(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME IN (${YA_MONEY_AML_COLUMNS.map(() => "?").join(", ")})`,
    [TABLE_NAME, ...YA_MONEY_AML_COLUMNS],
  );
  const existing = new Set(rows.map((row) => row.COLUMN_NAME));
  const missing = YA_MONEY_AML_COLUMNS.filter((column) => !existing.has(column));

  if (missing.length) {
    const error = new Error(
      `Ya Money AML columns missing: ${missing.join(", ")}`,
    );
    error.code = "YA_MONEY_AML_COLUMNS_MISSING";
    error.missingColumns = missing;
    throw error;
  }
}

async function runYaMoneyAml(lan) {
  try {
    await assertYaMoneyAmlColumns();

    const aml = await screenLoanBooking(AML_SCREENING_PRODUCT, lan);
    const status = clean(aml.amlStatus || aml.decision).toUpperCase();
    const reason = clean(aml.amlReason || aml.reason);

    return {
      status,
      score: toNumberOrNull(aml.amlScore),
      total_matches: toNumberOrNull(aml.amlTotalMatches ?? aml.hitsCount),
      reason: reason || null,
      source: "TRACKWIZZ",
      screening_request_id: aml.screeningRequestId || null,
      report_stored: aml.reportStored === true,
      degraded: aml.degraded === true,
      technical_reason: TRACKWIZZ_AML_STATUSES.has(status)
        ? null
        : "AML_STATUS_INVALID",
    };
  } catch (error) {
    const reason =
      error.code === "YA_MONEY_AML_COLUMNS_MISSING"
        ? error.message
        : `AML unavailable: ${error.message}`;

    console.error("[YA-MONEY] AML screening failed", {
      lan,
      code: error.code,
      message: error.message,
    });

    return {
      status: "ERROR",
      score: null,
      total_matches: null,
      reason: reason.slice(0, 255),
      source: "TRACKWIZZ",
      screening_request_id: null,
      report_stored: false,
      degraded: true,
      technical_reason: error.code || "AML_SCREENING_FAILED",
    };
  }
}

function buildAmlBlockReason(amlResult) {
  const status = clean(amlResult?.status).toUpperCase() || "ERROR";
  const reason = clean(amlResult?.reason);

  return reason ? `AML ${status}: ${reason}` : `AML ${status}`;
}

function getLoginDecision(breResult, amlResult) {
  if (!breResult.eligible) {
    return {
      status: "bre_rejected",
      reason: breResult.reason || "BRE_REJECTED",
    };
  }

  const amlStatus = clean(amlResult?.status).toUpperCase();

  if (amlStatus === "PROCEED") {
    return {
      status: "bre_approved",
      reason: breResult.reason || "ELIGIBLE",
    };
  }

  if (amlStatus === "STOP") {
    return {
      status: "aml_rejected",
      reason: buildAmlBlockReason(amlResult),
    };
  }

  return {
    status: "aml_review",
    reason: buildAmlBlockReason(amlResult),
  };
}

async function updateBreStatus(
  connection,
  insertId,
  breResult,
  amlResult,
  updatedBy,
) {
  const decision = getLoginDecision(breResult, amlResult);

  await connection.query(
    `UPDATE ${TABLE_NAME}
     SET status = ?,
         stage = ?,
         bre_reason = ?,
         updated_by = ?
     WHERE id = ?`,
    [decision.status, decision.status, decision.reason, updatedBy, insertId],
  );

  return decision.status;
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

function normalizeStatus(value) {
  return clean(value).toLowerCase().replace(/[\s-]+/g, "_");
}

function readPositiveInteger(value, fallback) {
  const number = Number(value);

  if (!Number.isInteger(number) || number <= 0) {
    return fallback;
  }

  return number;
}

function readListOptions(query) {
  const page = readPositiveInteger(query.page, 1);
  const requestedPageSize = readPositiveInteger(
    query.pageSize,
    DEFAULT_PAGE_SIZE,
  );
  const pageSize = Math.min(requestedPageSize, MAX_PAGE_SIZE);
  const sortKey = clean(query.sortBy) || "lan";
  const sortColumn =
    SORT_COLUMNS[sortKey] || SORT_COLUMNS[sortKey.toLowerCase()] || "lan";
  const sortDir = clean(query.sortDir).toLowerCase() === "desc" ? "DESC" : "ASC";

  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize,
    search: clean(query.search),
    sortColumn,
    sortDir,
  };
}

function buildStatusFilter(statuses) {
  const normalizedStatuses = [
    ...new Set(statuses.map(normalizeStatus).filter(Boolean)),
  ];

  if (!normalizedStatuses.length) {
    return {
      clause: "",
      params: [],
      statuses: [],
    };
  }

  const statusPlaceholders = normalizedStatuses.map(() => "?").join(", ");

  return {
    clause: ` AND ${STATUS_EXPRESSION} IN (${statusPlaceholders})`,
    params: normalizedStatuses,
    statuses: normalizedStatuses,
  };
}

function buildSearchFilter(search) {
  if (!search) {
    return {
      clause: "",
      params: [],
    };
  }

  const value = `%${search}%`;

  return {
    clause: ` AND (
      lb.lan LIKE ?
      OR lb.partner_loan_id LIKE ?
      OR lb.customer_name LIKE ?
      OR lb.business_name LIKE ?
      OR lb.mobile_number LIKE ?
    )`,
    params: [value, value, value, value, value],
  };
}

async function fetchYaMoneyLoans(req, res, statuses = []) {
  const options = readListOptions(req.query || {});
  const statusFilter = buildStatusFilter(statuses);
  const searchFilter = buildSearchFilter(options.search);
  const baseWhere = `WHERE lb.lan LIKE ?${statusFilter.clause}${searchFilter.clause}`;
  const baseParams = [
    `${LAN_PREFIX}%`,
    ...statusFilter.params,
    ...searchFilter.params,
  ];

  try {
    const [[countRow]] = await db.promise().query(
      `SELECT COUNT(*) AS total
       FROM ${TABLE_NAME} lb
       ${baseWhere}`,
      baseParams,
    );

    const [rows] = await db.promise().query(
      `SELECT lb.*
       FROM ${TABLE_NAME} lb
       ${baseWhere}
       ORDER BY lb.${options.sortColumn} ${options.sortDir}
       LIMIT ? OFFSET ?`,
      [...baseParams, options.pageSize, options.offset],
    );

    return res.json({
      rows,
      pagination: {
        page: options.page,
        pageSize: options.pageSize,
        total: Number(countRow?.total || 0),
      },
      filters: {
        statuses: statusFilter.statuses,
        search: options.search || null,
      },
    });
  } catch (error) {
    return sendServerError(res, error);
  }
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

async function fetchYaMoneyOpsCheckerLoan(lan) {
  const [[loan]] = await db.promise().query(
    `SELECT lan, partner_loan_id, status
     FROM ${TABLE_NAME}
     WHERE lan = ?
     LIMIT 1`,
    [lan],
  );

  return loan || null;
}

async function getYaMoneyOpsCheckerColumns() {
  const [rows] = await db.promise().query(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME IN ('ops_checker_id', 'ops_checker_name')`,
    [TABLE_NAME],
  );

  return new Set(rows.map((row) => row.COLUMN_NAME));
}

async function updateYaMoneyOpsCheckerStatus({
  lan,
  status,
  stage = status,
  opsCheckerId = null,
  opsCheckerName = null,
  updatedBy = null,
}) {
  const fields = ["status = ?", "stage = ?", "updated_by = ?"];
  const params = [status, stage, updatedBy || opsCheckerName || null];
  const columns = await getYaMoneyOpsCheckerColumns();

  if (columns.has("ops_checker_id")) {
    fields.push("ops_checker_id = ?");
    params.push(opsCheckerId || null);
  }

  if (columns.has("ops_checker_name")) {
    fields.push("ops_checker_name = ?");
    params.push(opsCheckerName || null);
  }

  const [result] = await db.promise().query(
    `UPDATE ${TABLE_NAME}
     SET ${fields.join(", ")}
     WHERE lan = ?`,
    [...params, lan],
  );

  return result;
}

async function fetchLatestYaMoneyPayout(lan) {
  const [[transfer]] = await db.promise().query(
    `SELECT
       unique_request_number,
       status,
       payout_status
     FROM quick_transfers
     WHERE lan = ?
     ORDER BY id DESC
     LIMIT 1`,
    [lan],
  );

  return transfer || null;
}

async function fetchLatestYaMoneyAml(lan, loan) {
  const aml = {
    status: loan.aml_status || null,
    score: loan.aml_score ?? null,
    total_matches: loan.aml_total_matches ?? null,
    reason: loan.aml_reason || null,
    checked_at: loan.aml_checked_at || null,
    source: "TRACKWIZZ",
    screening_request_id: null,
    request_id: null,
    screening_status: null,
    report_stored: false,
    report_file_name: null,
    error_code: null,
    error_message: null,
  };

  try {
    const [[screening]] = await db.promise().query(
      `SELECT
         id,
         request_id,
         status,
         suggested_action,
         hits_count,
         report_pdf IS NOT NULL AS report_stored,
         report_file_name,
         report_storage_error,
         error_code,
         error_message
       FROM screening_requests
       WHERE partner_key = ?
         AND lan = ?
       ORDER BY id DESC
       LIMIT 1`,
      [AML_SCREENING_PRODUCT, lan],
    );

    if (screening) {
      aml.screening_request_id = screening.id;
      aml.request_id = screening.request_id;
      aml.screening_status = screening.status;
      aml.report_stored = Boolean(screening.report_stored);
      aml.report_file_name = screening.report_file_name || null;
      aml.error_code = screening.error_code || null;
      aml.error_message =
        screening.error_message || screening.report_storage_error || null;

      if (!aml.status && screening.suggested_action) {
        aml.status = clean(screening.suggested_action).toUpperCase();
      }

      if (aml.total_matches === null || aml.total_matches === undefined) {
        aml.total_matches = screening.hits_count ?? null;
      }
    }
  } catch (error) {
    if (error.code !== "ER_NO_SUCH_TABLE" && error.code !== "ER_BAD_FIELD_ERROR") {
      throw error;
    }

    aml.error_code = error.code;
    aml.error_message = "AML screening table is not available";
  }

  return aml.status ||
    aml.score !== null ||
    aml.total_matches !== null ||
    aml.reason ||
    aml.screening_request_id ||
    aml.error_code
    ? aml
    : null;
}

function getPayoutStatus(transfer) {
  return normalizeStatus(transfer?.payout_status || transfer?.status || "");
}

function sendCreditDecisionWebhook(loan, status, decidedBy) {
  const approved = status === "credit_approved";
  const payload = {
    event: approved ? "LOAN_APPROVED" : "LOAN_REJECTED",
    lan: loan.lan,
    customer_name: loan.customer_name,
    mobile_number: loan.mobile_number,
    requested_amount: Number(loan.requested_amount),
    status,
    decision: approved ? "APPROVED" : "REJECTED",
    decided_by: decidedBy,
    decided_at: new Date().toISOString(),
  };

  if (approved) {
    payload.approved_amount = Number(loan.approved_amount);
  }

  setImmediate(() => {
    sendClientWebhook(payload).catch((error) => {
      console.error("[YA-MONEY] Credit decision webhook error", {
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
    insurance_amount: clean(body.insurance_amount)
      ? readNumber(body.insurance_amount)
      : null,
    pre_emi_interest: clean(
      body.pre_emi_interest ?? body.pre_emi_interest_amount,
    )
      ? readNumber(body.pre_emi_interest ?? body.pre_emi_interest_amount)
      : null,
    name_in_bank: clean(
      body.name_in_bank ??
        body.account_holder_name ??
        body.beneficiary_name ??
        body.bank_account_holder_name ??
        body.customer_name_as_per_bank,
    ),
    bank_name: nullIfEmpty(body.bank_name ?? body.bankName),
    account_number: cleanAccountNumber(
      body.account_number ??
        body.bank_account_number ??
        body.customer_account_number ??
        body.bank_ac_number,
    ),
    ifsc: clean(
      body.ifsc ??
        body.ifsc_code ??
        body.bank_ifsc_code ??
        body.bank_ifsc,
    ).toUpperCase(),
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
    return "loan_tenure is required and must be between 6 and 24 months";
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

  if (!data.name_in_bank) {
    return "name_in_bank is required for payment";
  }

  if (data.name_in_bank.length > 150) {
    return "name_in_bank must be 150 characters or less";
  }

  if (data.bank_name && data.bank_name.length > 150) {
    return "bank_name must be 150 characters or less";
  }

  if (!data.account_number) {
    return "account_number is required for payment";
  }

  if (!/^\d{6,30}$/.test(data.account_number)) {
    return "account_number must be 6 to 30 digits";
  }

  if (!data.ifsc) {
    return "ifsc is required for payment";
  }

  if (!isValidIfsc(data.ifsc)) {
    return "ifsc is invalid";
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

  if (
    data.insurance_amount !== null &&
    (!Number.isFinite(data.insurance_amount) || data.insurance_amount < 0)
  ) {
    return "insurance_amount must be zero or more";
  }

  if (
    data.pre_emi_interest !== null &&
    (!Number.isFinite(data.pre_emi_interest) || data.pre_emi_interest < 0)
  ) {
    return "pre_emi_interest must be zero or more";
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

  const insuranceAmount = data.insurance_amount !== null ? data.insurance_amount : 0;
  const preEmiInterest = data.pre_emi_interest !== null ? data.pre_emi_interest : 0;

  return {
    emi_amount: roundAmount(
      calculateEmi(data.loan_amount, data.interest, data.loan_tenure),
    ),
    processing_fee: roundAmount(processingFee),
    insurance_amount: roundAmount(insuranceAmount),
    pre_emi_interest: roundAmount(preEmiInterest),
    net_disbursement: roundAmount(
      data.loan_amount - processingFee - insuranceAmount - preEmiInterest,
    ),
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
         name_in_bank = ?,
         bank_name = ?,
         account_number = ?,
         ifsc = ?,
         emi_amount = ?,
         processing_fee = ?,
         insurance_amount = ?,
         pre_emi_interest = ?,
         net_disbursement = ?,
         status = 'ops_initiate',
         stage = 'ops_initiate',
         updated_by = ?
     WHERE lan = ?
       AND status = 'credit_approved'`,
    [
      data.loan_amount,
      data.loan_tenure,
      data.interest,
      data.umrn,
      data.sanction_date,
      data.name_in_bank,
      data.bank_name,
      data.account_number,
      data.ifsc,
      calculation.emi_amount,
      calculation.processing_fee,
      calculation.insurance_amount,
      calculation.pre_emi_interest,
      calculation.net_disbursement,
      updatedBy,
      lan,
    ],
  );

  return result.affectedRows > 0;
}

router.get("/all-loans", authenticateUser, (req, res) =>
  fetchYaMoneyLoans(req, res),
);

router.get("/credit-screen-loans", authenticateUser, (req, res) =>
  fetchYaMoneyLoans(req, res, ["bre_approved"]),
);

router.get("/ops-maker-loans", authenticateUser, (req, res) =>
  fetchYaMoneyLoans(req, res, ["ops_initiate", "ops_initiated"]),
);

router.get("/ops-checker-loans", authenticateUser, (req, res) =>
  fetchYaMoneyLoans(req, res, ["approved"]),
);

router.get("/disbursed-loans", authenticateUser, (req, res) =>
  fetchYaMoneyLoans(req, res, ["disbursed"]),
);

router.get("/customer-details/:lan", authenticateUser, async (req, res) => {
  const lan = clean(req.params.lan).toUpperCase();

  if (!lan || !lan.startsWith(LAN_PREFIX)) {
    return res.status(400).json({
      success: false,
      message: "Valid Ya Money LAN is required",
    });
  }

  try {
    const [[loan]] = await db.promise().query(
      `SELECT *
       FROM ${TABLE_NAME}
       WHERE lan = ?
       LIMIT 1`,
      [lan],
    );

    if (!loan) {
      return res.status(404).json({
        success: false,
        message: "Ya Money customer details not found",
      });
    }

    const [
      [kycRows],
      [cibilReports],
      [payouts],
      [utrRows],
      aml,
    ] = await Promise.all([
      db.promise().query(
        `SELECT *
         FROM kyc_verification_status
         WHERE lan = ?`,
        [lan],
      ),
      db.promise().query(
        `SELECT id, pan_number, score, created_at
         FROM loan_cibil_reports
         WHERE lan = ?
         ORDER BY created_at DESC, id DESC
         LIMIT 3`,
        [lan],
      ),
      db.promise().query(
        `SELECT *
         FROM quick_transfers
         WHERE lan = ?
         ORDER BY id DESC
         LIMIT 5`,
        [lan],
      ),
      db.promise().query(
        `SELECT *
         FROM ev_disbursement_utr
         WHERE LAN = ?
         ORDER BY id DESC
         LIMIT 1`,
        [lan],
      ),
      fetchLatestYaMoneyAml(lan, loan),
    ]);

    return res.json({
      success: true,
      data: {
        loan,
        kyc: kycRows,
        cibil_reports: cibilReports,
        latest_cibil_report: cibilReports[0] || null,
        payouts,
        latest_payout: payouts[0] || null,
        disbursement_utr: utrRows[0] || null,
        aml,
      },
    });
  } catch (error) {
    console.error("[YA-MONEY] Customer details fetch error", {
      lan,
      message: error.message,
      stack: error.stack,
    });

    return res.status(500).json({
      success: false,
      message: "Failed to fetch Ya Money customer details",
      error: error.sqlMessage || error.message,
    });
  }
});

router.post("/login", verifyApiKey, async (req, res) => {
  let connection;
  let transactionStarted = false;

  try {
    const body = req.body || {};

    const requestedAmount =
      body.requested_amount ?? body.requiested_amount ?? body.loan_amount;
    const dob = clean(body.dob ?? body.date_of_birth ?? body.customer_dob);
    const calculatedAge = calculateAgeFromDob(dob);

    const data = {
      login_date: todayDate(),
      partnerLoanId: clean(body.partner_loan_id),
      dob,
      age: Number.isFinite(calculatedAge) ? calculatedAge : readNumber(body.age),
      annual_income: body.annual_income || null,
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

    await partnerLimitService.trackPartnerBookingNonBlocking(
      connection,
      PARTNER_LIMIT_NAME,
      data.requested_amount,
      ids.lan,
      data.login_date,
    );

    await connection.commit();
    transactionStarted = false;
    connection.release();
    connection = null;

    const bureau = YA_MONEY_BUREAU_ENABLED
      ? await pullAndPersistBureau(ids.lan, data)
      : {
          success: false,
          status: "SKIPPED",
          score: null,
          skipped: true,
          reason: "YA_MONEY_BUREAU_DISABLED_FOR_UAT",
        };
    const breResult = runBRE({
      loan_amount: data.requested_amount,
      age: data.age,
      annual_income: data.annual_income,
      bureau_score: bureau.score,
      skip_bureau: !YA_MONEY_BUREAU_ENABLED,
    });
    const aml = await runYaMoneyAml(ids.lan);
    const finalStatus = await updateBreStatus(
      db.promise(),
      insertId,
      breResult,
      aml,
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
        aml,
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

    sendCreditDecisionWebhook(loan, status, updatedBy);

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

router.put("/:lan/ops-checker-pay", authenticateUser, async (req, res) => {
  try {
    const lan = clean(req.params.lan).toUpperCase();
    const requestedStatus = normalizeStatus(req.body?.status);
    const opsCheckerId = req.body?.ops_checker_id || req.user?.id || null;
    const opsCheckerName =
      req.body?.ops_checker_name || getUserName(req) || null;

    if (!lan) {
      return res.status(400).json({
        success: false,
        message: "LAN is required",
      });
    }

    if (!["approved", "ops_rejected", "rejected"].includes(requestedStatus)) {
      return res.status(400).json({
        success: false,
        message: "status must be APPROVED or OPS_REJECTED",
      });
    }

    const loan = await fetchYaMoneyOpsCheckerLoan(lan);

    if (!loan) {
      return res.status(404).json({
        success: false,
        message: "Ya Money loan not found",
      });
    }

    if (normalizeStatus(loan.status) !== "approved") {
      return res.status(409).json({
        success: false,
        message: "Only Approved Ya Money loans can be handled by Ops Checker",
      });
    }

    if (["ops_rejected", "rejected"].includes(requestedStatus)) {
      const result = await updateYaMoneyOpsCheckerStatus({
        lan,
        status: "OPS_REJECTED",
        stage: "OPS_REJECTED",
        opsCheckerId,
        opsCheckerName,
        updatedBy: opsCheckerName,
      });

      if (!result.affectedRows) {
        return res.status(404).json({
          success: false,
          message: "Ya Money loan not found",
        });
      }

      return res.json({
        success: true,
        status: "SUCCESS",
        lan,
        final_status: "OPS_REJECTED",
        message: "Loan rejected by operations checker successfully",
      });
    }

    await updateYaMoneyOpsCheckerStatus({
      lan,
      status: "Approved",
      stage: "Approved",
      opsCheckerId,
      opsCheckerName,
      updatedBy: opsCheckerName,
    });

    const activeTransfer = await fetchLatestYaMoneyPayout(lan);
    const activePayoutStatus = getPayoutStatus(activeTransfer);

    if (ACTIVE_PAYOUT_STATUSES.has(activePayoutStatus)) {
      return res.status(409).json({
        success: false,
        status: "FAILED",
        message: `Payout already ${activePayoutStatus} for this LAN`,
        payout_status: activePayoutStatus,
        unique_request_number:
          activeTransfer?.unique_request_number || null,
      });
    }

    const payoutResult = await approveAndInitiatePayout({
      lan,
      table: TABLE_NAME,
    });

    if (!payoutResult.success) {
      return res.status(400).json({
        success: false,
        status: "FAILED",
        message: payoutResult.message || "Payout initiation failed",
      });
    }

    const finalPayoutStatuses = new Set([
      "success",
      "completed",
      "processed",
    ]);
    const isPayoutFinal = finalPayoutStatuses.has(
      String(payoutResult.payout_status || "").toLowerCase(),
    );
    const finalStatus = isPayoutFinal ? "Disbursed" : "Approved";

    return res.json({
      success: true,
      status: "SUCCESS",
      lan,
      final_status: finalStatus,
      payout_status: payoutResult.payout_status || null,
      unique_request_number: payoutResult.unique_request_number || null,
      message:
        "Loan approved by operations checker and payout initiated successfully",
    });
  } catch (error) {
    console.error("[YA-MONEY] Ops checker payout error", {
      lan: req.params?.lan,
      message: error.message,
      stack: error.stack,
    });

    return res.status(500).json({
      success: false,
      status: "FAILED",
      message: error.message || "Failed to approve Ya Money payout",
      error: error.sqlMessage || error.message,
    });
  }
});

router.patch("/:lan/final-details", async (req, res) => {
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

    if (calculation.net_disbursement <= 0) {
      return res.status(400).json({
        success: false,
        message:
          "processing_fee, insurance_amount and pre_emi_interest combined must be less than loan_amount for payment",
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
        name_in_bank: data.name_in_bank,
        bank_name: data.bank_name,
        account_number: data.account_number,
        ifsc: data.ifsc,
        emi_amount: calculation.emi_amount,
        processing_fee: calculation.processing_fee,
        insurance_amount: calculation.insurance_amount,
        pre_emi_interest: calculation.pre_emi_interest,
        net_disbursement: calculation.net_disbursement,
      },
    });
  } catch (error) {
    return sendServerError(res, error);
  }
});

module.exports = router;
