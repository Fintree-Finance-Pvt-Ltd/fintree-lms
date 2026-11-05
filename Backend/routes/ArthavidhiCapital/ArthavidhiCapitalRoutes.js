



const {
  toArthavidhiBookingRecord,
  fromArthavidhiBookingRecord,
  loadArthavidhiBookingEditability,
} = require("../../services/ArthavidhiCapitalAgreementStatus");

// Arthavidhi UBL intake, bureau and payout. Mounted at /api/arthavidhi-capital.
/*
 * PAGE -> API -> LOAN STATUS (all paths below use this mount)
 *
 * Loan Booking: POST /login {action:"save_draft"} -> Draft; resume uses the same LAN.
 * Booking/profile are editable only in Draft. A mobile cannot belong to another case.
 * Loan Booking: POST /login -> Login, then bureau + AML + BRE run on the saved case.
 * Case details: POST /:lan/retry-bureau or /:lan/aml-screening -> reruns BRE if ready.
 * Case details: POST /:lan/run-bre -> evaluates the stored credit-policy inputs.
 *   ArthavidhiCapitalBRE.js owns these outcomes: Login, bre_approved, bre_rejected,
 *   aml_review, aml_rejected, policy_review. Provider errors never mean verification.
 * Partner Credit Review: bre_approved -> PATCH /:lan/partner-review-decision
 *   save -> bre_approved; approve -> partner_approved; reject -> partner_rejected.
 * Internal Credit Team: partner_approved -> PATCH /:lan/credit-decision
 *   -> credit_approved / credit_rejected. Both reviews are staff decisions with audit.
 * E-sign & Mandate: PATCH /:lan/final-details -> signing_pending.
 * Both provider confirmations -> ops_initiate (Ops Maker queue).
 * Signing: POST /:lan/esign and /:lan/mandate update agreement/mandate records;
 *   their callbacks confirm completion and may hand off completed signing to Maker.
 * Ops Maker: PATCH /:lan/ops-maker-decision -> approved / OPS_REJECTED.
 * Ops Checker: PUT /:lan/ops-checker-decision -> disburse_initiate, or OPS_REJECTED.
 *   Finance pays manually. Authenticated UTR upload settles Disbursed + monthly RPS.
 * Queue refresh may reconcile signing completion; it never approves credit or payout.
 *
 * Shared provider functions, also used by the reference products:
 * Bureau: Bueraupullapiservice.runBureau (Experian; same function as Ya Money).
 * AML: trackwizz/screeningService.screenLoanBooking (same function as Ya Money).
 * PAN: lookupArthavidhiPan below (Zoop, then Finanalyz fallback; AVCL only).
 * Aadhaar: digitapaadharservice (Digitap; same service as ClaimCureBuddy).
 *
 * File order: intake helpers -> intake/legacy endpoints -> bureau/BRE adapters
 * -> booking identity endpoints -> staff queues, signing, credit and ops endpoints.
 * Legacy URL aliases remain for existing clients; they are not a second journey.
 */
const express = require("express");
const db = require("../../config/db");
const authenticateUser = require("../../middleware/verifyToken");
const partnerLimitService = require("../../services/partnerLimitService");
const partnerFldgService = require("../../services/partnerFldgService");
const { getMonthYear } = require("../../utils/partnerHelpers");
const router = express.Router();
const verifyApiKey = require("../../middleware/apiKeyAuth");
const TABLE = "loan_booking_arthavidhi";
const PARTNER = "Arthavidhi Capital";
const SEQUENCE = "ARTHAVIDHI_CAPITAL_CUSTOMER";
const fields = [
  "login_date",
  "first_name",
  "middle_name",
  "last_name",
  "gender",
  "borrower_dob",
  "father_name",
  "mother_name",
  "mobile_number",
  "email",
  "pan_card",
  "aadhar_number",
  "address_line_1",
  "address_line_2",
  "village",
  "district",
  "state",
  "pincode",
  "business_village",
  "business_district",
  "business_state",
  "business_pincode",
  "loan_amount",
  "interest_rate",
  "loan_tenure",
  "cibil_score",
  "business_name",
  "company_type",
  "business_vintage",
  "industry",
  "annual_turnover",
  "abb_value",
  "bounce_count_6m",
  "net_profit",
  "loanemi_obligations",
  "employment_type",
  "pre_emi",
  "processing_fee",
  "disbursal_amount",
  "emi_amount",
  "apr",
  "agreement_date",
  "udyam_registration",
  "property_type",
  "aa_bank_name",
  "aa_branch_name",
  "aa_account_type",
  "aa_name_in_bank",
  "aa_account_number",
  "aa_ifsc",
  "bank_name",
  "name_in_bank",
  "account_number",
  "ifsc",
];
const monetary = [
  "loan_amount",
  "interest_rate",
  "annual_turnover",
  "abb_value",
  "net_profit",
  "loanemi_obligations",
  "pre_emi",
  "processing_fee",
  "disbursal_amount",
  "emi_amount",
  "apr",
];
const required = [
  "login_date",
  "first_name",
  "borrower_dob",
  "mobile_number",
  "pan_card",
  "aadhar_number",
  "address_line_1",
  "village",
  "state",
  "pincode",
  "loan_amount",
];
function bad(message, status = 400) {
  const e = new Error(message);
  e.status = status;
  throw e;
}
async function requireUniqueArthavidhiMobile(conn,mobile,lan="") {
  if(!/^[6-9]\d{9}$/.test(String(mobile||"")))return;
  const [[duplicate]]=await conn.query("SELECT lan FROM loan_booking_arthavidhi WHERE mobile_number=? AND lan<>? LIMIT 1",[String(mobile),String(lan)]);
  if(duplicate)bad("This mobile number already belongs to another Arthavidhi application. Resume the existing case instead of creating another.",409);
}
function amount(value, field, positive = false) {
  const s = String(value).trim();
  if (!/^\d{1,13}(?:\.\d{1,2})?$/.test(s))
    bad(`${field} must be a non-negative decimal with up to two places`);
  const [w, f = ""] = s.split(".");
  const maxDigits =
    field === "interest_rate" || field === "fldg_percent"
      ? 3
      : ["annual_turnover", "abb_value", "net_profit", "loanemi_obligations"].includes(
        field,
      )
        ? 13
        : ["pre_emi", "processing_fee", "disbursal_amount"].includes(field)
          ? 8
          : 10;
  if (BigInt(w).toString().length > maxDigits)
    bad(`${field} exceeds the supplied column precision`);
  const canonical = `${BigInt(w)}.${f.padEnd(2, "0")}`;
  if (positive && BigInt(canonical.replace(".", "")) === 0n)
    bad(`${field} must be greater than zero`);
  return canonical;
}
const paise = (v) => BigInt(String(v).replace(".", ""));
function isoDate(value, field) {
  const s = String(value),
    d = new Date(`${s}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(s) ||
    !Number.isFinite(d.getTime()) ||
    d.toISOString().slice(0, 10) !== s
  )
    bad(`${field} must be YYYY-MM-DD`);
  return s;
}
function normalize(body) {
  if (!body || typeof body !== "object" || Array.isArray(body))
    bad("Send one customer object for manual booking");
  const aliases = {
    pan_number: "pan_card",
    aadhaar_number: "aadhar_number",
    customer_address: "address_line_1",
    customer_city: "village",
    customer_state: "state",
    customer_pincode: "pincode",
    requested_amount: "loan_amount",
    business_type: "company_type",
    udyam_number: "udyam_registration",
    business_city: "business_village",
  };
  const raw = {
    ...body,
    borrower_dob: body.borrower_dob ?? body.dob,
    account_number: body.account_number ?? body.account_no ?? body.acc_no,
    ifsc: body.ifsc ?? body.bank_ifsc,
    disbursal_amount: body.disbursal_amount ?? body.net_disbursement,
  };
  for (const [field, alias] of Object.entries(aliases))
    if (body[field] !== undefined) raw[alias] = body[field];
  raw.login_date =
    raw.login_date ||
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  if (body.customer_name) {
    const names = String(body.customer_name).trim().split(/\s+/);
    raw.first_name = names[0];
    raw.last_name = names.length > 1 ? names.at(-1) : names[0];
    raw.middle_name = names.length > 2 ? names.slice(1, -1).join(" ") : null;
  }
  const allowed = new Set([
    ...fields,
    ...Object.keys(aliases),
    "customer_name",
    "age",
    "annual_income",
    "gst_number",
    "business_address",
    "dob",
    "account_no",
    "acc_no",
    "bank_ifsc",
    "product",
    "net_disbursement",
    "partner_loan_id",
    "assessment",
  ]);
  for (const k of Object.keys(body)) if (!allowed.has(k)) bad(`Unsupported field: ${k}`);
  const data = {};
  for (const k of fields) {
    const v = raw[k];
    if (v != null && !["string", "number"].includes(typeof v)) bad(`Invalid ${k}`);
    data[k] = v == null || String(v).trim() === "" ? null : String(v).trim();
  }
  const missing = required.filter((k) => data[k] === null);
  if (missing.length) bad(`${missing.join(", ")} required`);
  for (const k of monetary)
    if (data[k] !== null)
      data[k] = amount(
        data[k],
        k,
        ["loan_amount", "interest_rate", "disbursal_amount"].includes(k),
      );
  for (const k of ["login_date", "borrower_dob", "agreement_date"])
    if (data[k] !== null) data[k] = isoDate(data[k], k);
  data.agreement_date = data.agreement_date || data.login_date;
  data.pan_card = data.pan_card.toUpperCase();
  if (!/^[A-Z]{5}\d{4}[A-Z]$/.test(data.pan_card)) bad("Invalid PAN format");
  if (!/^[6-9]\d{9}$/.test(data.mobile_number)) bad("Invalid mobile number");
  if (!/^(?:\d{12}|[Xx*]{8}\d{4})$/.test(data.aadhar_number))
    bad("Enter a valid Aadhaar number or the masked number fetched from DigiLocker");
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) bad("Invalid email");
  for (const k of ["pincode", "business_pincode"])
    if (data[k] && !/^\d{6}$/.test(data[k])) bad(`Invalid ${k}`);
  for (const k of ["ifsc", "aa_ifsc"])
    if (data[k]) {
      data[k] = data[k].toUpperCase();
      if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(data[k])) bad(`Invalid ${k}`);
    }
  if (data.loan_tenure !== null) {
    const tenure = Number(data.loan_tenure);
    if (!Number.isSafeInteger(tenure) || tenure < 6 || tenure > 18)
      bad("loan_tenure must contain 6-18 months");
    data.loan_tenure = tenure;
  }
  for (const k of ["cibil_score", "bounce_count_6m"])
    if (data[k] !== null) {
      const n = Number(data[k]);
      if (!Number.isSafeInteger(n) || n < (k === "cibil_score" ? -1 : 0))
        bad(`Invalid ${k}`);
      data[k] = n;
    }
  for (const k of ["disbursal_amount", "processing_fee"])
    if (data[k] !== null && paise(data[k]) > paise(data.loan_amount))
      bad(`${k} cannot exceed loan_amount`);
  if (
    data.apr !== null &&
    (!Number.isInteger(Number(data.apr)) || Number(data.apr) > 2147483647)
  )
    bad("apr must be an integer for the supplied schema");
  data.customer_name = body.customer_name
    ? String(body.customer_name).trim()
    : [data.first_name, data.middle_name, data.last_name].filter(Boolean).join(" ");
  data.last_name = data.last_name || data.first_name;
  if (body.product !== undefined && body.product !== "UBL")
    bad("This manual route is for UBL");
  if (
    body.partner_loan_id != null &&
    (!String(body.partner_loan_id).trim() ||
      String(body.partner_loan_id).trim().length > 50)
  )
    bad("partner_loan_id must contain 1-50 characters");
  if (body.partner_loan_id != null)
    data.partner_loan_id = String(body.partner_loan_id).trim();
  const birth = new Date(`${data.borrower_dob}T00:00:00Z`),
    today = new Date();
  data.age =
    today.getUTCFullYear() -
    birth.getUTCFullYear() -
    (today.getUTCMonth() < birth.getUTCMonth() ||
      (today.getUTCMonth() === birth.getUTCMonth() &&
        today.getUTCDate() < birth.getUTCDate())
      ? 1
      : 0);
  if (data.age < 0 || data.age > 120) bad("Invalid date of birth");
  for (const field of ["annual_income", "gst_number", "business_address"])
    if (body[field] != null && String(body[field]).trim())
      data[field] =
        field === "annual_income"
          ? amount(body[field], field)
          : String(body[field]).trim();
  if(body.assessment!==undefined){
    const {mergeArthavidhiBookingAssessment}=require("./ArthavidhiCapitalBRE");
    const assessment=mergeArthavidhiBookingAssessment(body.assessment);
    if(Object.entries(assessment).some(([key,value])=>key.endsWith("_verified")&&value===true)&&!assessment.verification_notes)bad("Add verification notes describing the evidence checked before marking policy checks verified.");
    data.arthavidhi_capital_policy_inputs=JSON.stringify(assessment);
    if(assessment.business_vintage_years!==undefined)data.business_vintage=String(assessment.business_vintage_years);
    if(assessment.industry!==undefined)data.industry=assessment.industry;
    if(assessment.average_bank_balance!==undefined)data.abb_value=amount(assessment.average_bank_balance,"abb_value");
  }
  if(data.business_vintage!==null&&!/^\d+(?:\.\d{1,2})?$/.test(data.business_vintage))bad("Business vintage must be a non-negative number of years");
  data.product = "UBL";
  data.lender = PARTNER;
  data.status = "Login";
  return data;
}

function bookingFailure(error) {
  if (error.status)
    return {
      status: error.status,
      code: error.code || "BOOKING_VALIDATION_FAILED",
      message: error.message,
    };
  if (
    error.code === "ER_USER_LIMIT_REACHED" ||
    error.code === "ER_TOO_MANY_USER_CONNECTIONS"
  ) {
    const resource = String(error.sqlMessage || error.message || "")
      .match(
        /\bmax_(?:user_connections|connections_per_hour|queries_per_hour|questions|updates|connections)\b/i,
      )?.[0]
      ?.toLowerCase();
    const detail = resource ? ` (${resource})` : "";
    return {
      status: 503,
      code: error.code,
      resource,
      message: `The database account has reached its hosting resource limit${detail}. The database administrator must check the account quota before booking can continue.`,
    };
  }
  if (error.message === "No limit record for partner/month/year")
    return {
      status: 409,
      code: "PARTNER_MONTHLY_LIMIT_MISSING",
      message:
        "Configure the current month's partner limit for Arthavidhi Capital before booking.",
    };
  if (error.message === "Invalid AVCL sequence")
    return {
      status: 503,
      code: "AVCL_SEQUENCE_INVALID",
      message: "The Arthavidhi loan-number sequence needs to be aligned before booking.",
    };
  const known = {
    ER_BAD_FIELD_ERROR: [
      503,
      "Arthavidhi's database schema is missing a required column. Run its schema setup before booking.",
    ],
    ER_NO_SUCH_TABLE: [
      503,
      "A required database table is missing. Complete the Arthavidhi database setup before booking.",
    ],
    ER_NO_DEFAULT_FOR_FIELD: [
      503,
      "A required database field has no default. Check the Arthavidhi table mapping.",
    ],
    ER_DUP_ENTRY: [
      409,
      "A customer or loan identifier already exists. Check the existing case before retrying.",
    ],
    ER_DATA_TOO_LONG: [400, "A booking value exceeds the database column length."],
    ER_WARN_DATA_OUT_OF_RANGE: [
      400,
      "A booking amount exceeds the database column range.",
    ],
    WARN_DATA_TRUNCATED: [
      400,
      "A booking value is incompatible with the configured database column.",
    ],
    ER_LOCK_WAIT_TIMEOUT: [409, "Loan booking is temporarily busy. Please retry."],
    ER_LOCK_DEADLOCK: [
      409,
      "Loan booking encountered a concurrent update. Please retry.",
    ],
    ECONNREFUSED: [503, "The backend cannot connect to the database."],
    ETIMEDOUT: [503, "The database connection timed out."],
    ER_ACCESS_DENIED_ERROR: [
      503,
      "The backend database connection is not configured correctly.",
    ],
  };
  const match = known[error.code];
  return {
    status: match ? match[0] : 500,
    code: error.code || "BOOKING_INTERNAL_ERROR",
    message: match
      ? match[1]
      : "Unable to save Arthavidhi loan. Share the error code and step with the developer.",
  };
}

async function saveArthavidhiDraft(req, res) {
  let conn, mobileLocked=false, mobileLockName;
  try {
    if (!req.user) bad("Staff login required to save a draft", 403);
    const body = req.body || {},
      name = String(body.customer_name || "").trim();
    if (!name && !/^[6-9]\d{9}$/.test(String(body.mobile_number || "")))
      bad("Enter the customer name or a valid mobile number before saving a draft");
    const limits = {
      customer_name: 150,
      father_name: 255,
      mobile_number: 10,
      email: 150,
      pan_number: 10,
      aadhaar_number: 255,
      customer_address: 500,
      customer_city: 100,
      customer_state: 100,
      customer_pincode: 6,
      business_name: 200,
      business_type: 100,
      gst_number: 15,
      udyam_number: 30,
      business_address: 500,
      business_pincode: 6,
      business_city: 100,
      business_state: 100,
      gender: 255,
      business_vintage: 255,
      industry: 255,
    };
    const record = {};
    for (const [key, max] of Object.entries(limits)) {
      const value = body[key] == null ? null : String(body[key]).trim();
      if (value && value.length > max) bad(`${key} exceeds ${max} characters`);
      record[key] = value || null;
    }
    record.customer_name = record.customer_name || "Pending identity verification";
    record.mobile_number = record.mobile_number || "";
    record.login_date = body.login_date
      ? isoDate(body.login_date, "login_date")
      : new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
    record.requested_amount =
      body.requested_amount == null || body.requested_amount === ""
        ? "0.00"
        : amount(body.requested_amount, "loan_amount");
    record.loan_amount =
      Number(record.requested_amount) > 0 ? record.requested_amount : null;
    record.annual_income =
      body.annual_income == null || body.annual_income === ""
        ? null
        : amount(body.annual_income, "annual_income");
    record.annual_turnover=body.annual_turnover==null||body.annual_turnover===""?null:amount(body.annual_turnover,"annual_turnover");
    record.borrower_dob = body.dob ? isoDate(body.dob, "dob") : null;
    record.interest =
      body.interest_rate == null || body.interest_rate === ""
        ? null
        : amount(body.interest_rate, "interest_rate");
    record.processing_fee =
      body.processing_fee == null || body.processing_fee === ""
        ? null
        : amount(body.processing_fee, "processing_fee");
    record.loan_tenure =
      body.loan_tenure == null || body.loan_tenure === ""
        ? null
        : Number(body.loan_tenure);
    if (
      record.loan_tenure !== null &&
      (!Number.isInteger(record.loan_tenure) ||
        record.loan_tenure < 6 ||
        record.loan_tenure > 18)
    )
      bad("Requested tenure must be 6-18 months");
    if(body.assessment!==undefined){
      const {mergeArthavidhiBookingAssessment}=require("./ArthavidhiCapitalBRE");
      record.arthavidhi_capital_policy_inputs=JSON.stringify(mergeArthavidhiBookingAssessment(body.assessment));
    }
    record.status = "Draft";
    record.stage = "Draft";
    conn = await db.promise().getConnection();
    if(/^[6-9]\d{9}$/.test(record.mobile_number)){
      mobileLockName=`avcl-otp-mobile:${record.mobile_number}`;
      const [[lock]]=await conn.query("SELECT GET_LOCK(?,0) AS acquired",[mobileLockName]);
      mobileLocked=Number(lock?.acquired)===1;if(!mobileLocked)bad("This mobile is being updated. Retry once the current request completes.",409);
      await requireUniqueArthavidhiMobile(conn,record.mobile_number,body.lan);
    }
    await conn.beginTransaction();
    let lan = String(body.lan || "")
      .trim()
      .toUpperCase(),
      partnerId;
    if (lan) {
      if (!/^AVCL\d+$/.test(lan)) bad("Invalid Arthavidhi LAN");
      const [[draft]] = await conn.query(
        `SELECT lan,status,partner_loan_id,arthavidhi_capital_identity,arthavidhi_capital_policy_inputs FROM ${TABLE} WHERE lan=? FOR UPDATE`,
        [lan],
      );
      if (!draft) bad("Draft not found", 404);
      if (String(draft.status).toLowerCase() !== "draft")
        bad("Only an unsubmitted draft can be edited", 409);
      partnerId = draft.partner_loan_id;
      if(body.assessment!==undefined)record.arthavidhi_capital_policy_inputs=JSON.stringify(require("./ArthavidhiCapitalBRE").mergeArthavidhiBookingAssessment(body.assessment,draft.arthavidhi_capital_policy_inputs));
      let verified = {};
      try {
        verified = JSON.parse(draft.arthavidhi_capital_identity || "{}");
      } catch { }
      if (verified.required) {
        if (verified.mobile !== record.mobile_number)
          bad("Restart mobile verification before changing the verified mobile", 409);
        if (verified.pan && verified.pan !== record.pan_number)
          bad("Restart identity verification before changing PAN", 409);
        if (verified.pan_name) record.customer_name = verified.pan_name;
      }
      await conn.query(
        `UPDATE ${TABLE} SET ${Object.keys(record)
          .map((k) => `\`${k}\`=?`)
          .join(",")} WHERE lan=?`,
        [...Object.values(record), lan],
      );
    } else {
      await conn.query(
        "INSERT INTO loan_sequences (lender_name,last_sequence) VALUES (?,10999) ON DUPLICATE KEY UPDATE lender_name=VALUES(lender_name)",
        [SEQUENCE],
      );
      const [[sequence]] = await conn.query(
        "SELECT last_sequence FROM loan_sequences WHERE lender_name=? FOR UPDATE",
        [SEQUENCE],
      );
      const next = Number(sequence.last_sequence) + 1;
      if (!Number.isSafeInteger(next) || next < 11000)
        throw new Error("Invalid AVCL sequence");
      lan = `AVCL${next}`;
      partnerId = `AVCLFL${next}`;
      Object.assign(record, {
        lan,
        partner_loan_id: partnerId,
        lender: PARTNER,
        product: "UBL",
        loan_type: "Business Loan",
        login_date: record.login_date,
      });
      await conn.query(
        `INSERT INTO ${TABLE} (${Object.keys(record)
          .map((k) => `\`${k}\``)
          .join(",")}) VALUES (${Object.keys(record)
            .map(() => "?")
            .join(",")})`,
        Object.values(record),
      );
      await conn.query("UPDATE loan_sequences SET last_sequence=? WHERE lender_name=?", [
        next,
        SEQUENCE,
      ]);
    }
    await conn.commit();
    if(mobileLocked){await conn.query("SELECT RELEASE_LOCK(?)",[mobileLockName]);mobileLocked=false;}
    return res.json({
      is_success: true,
      message: "Draft saved. Resume it from All Loans.",
      data: { lan, partner_loan_id: partnerId, status: "Draft" },
    });
  } catch (error) {
    if (conn) await conn.rollback();
    const failure = bookingFailure(error);
    return res
      .status(failure.status)
      .json({ is_success: false, message: failure.message, error_code: failure.code });
  } finally {
    if (conn) {try{if(mobileLocked)await conn.query("SELECT RELEASE_LOCK(?)",[mobileLockName]);}finally{conn.release();}}
  }
}

function arthavidhiCheckConfiguration() {
  const missing = ["EXPERIAN_URL", "EXPERIAN_USER", "EXPERIAN_PASSWORD"].filter(
    (key) => !String(process.env[key] || "").trim(),
  );
  const amlMissing = String(process.env.TW_API_TOKEN || "").trim()
    ? []
    : ["TW_API_TOKEN"];
  return {
    bureau: { ready: !missing.length, missingFields: missing },
    aml: { ready: !amlMissing.length, missingFields: amlMissing },
  };
}
async function runArthavidhiAml(lan, { retry = false } = {}) {
  const numberOrNull = (value) =>
    value == null || value === ""
      ? null
      : Number.isFinite(Number(value))
        ? Number(value)
        : null;
  try {
    const { screenLoanBooking } = require("../../services/trackwizz/screeningService");
    // Use Ya Money's shared TrackWizz service; an explicit retry must bypass its cached result.
    const result = retry
      ? await screenLoanBooking("arthavidhi_capital", lan, { force: true })
      : await screenLoanBooking("arthavidhi_capital", lan);
    const status = String(result.amlStatus || result.decision || "ERROR")
      .trim()
      .toUpperCase();
    const success = !result.degraded && ["PROCEED", "STOP", "REVIEW"].includes(status);
    return {
      success,
      status: success ? status : "ERROR",
      score: numberOrNull(result.amlScore),
      total_matches: numberOrNull(result.amlTotalMatches ?? result.hitsCount),
      reason: result.amlReason || result.reason || null,
      source: "TRACKWIZZ",
      screening_request_id: result.screeningRequestId || null,
      report_stored: result.reportStored === true,
      degraded: result.degraded === true,
      technical_reason: success ? null : "AML_STATUS_INVALID",
    };
  } catch (error) {
    console.error("Arthavidhi AML failed", {
      code: error.code || "AML_SCREENING_FAILED",
    });
    return {
      success: false,
      status: "ERROR",
      code: error.code || "AML_SCREENING_FAILED",
      reason: `AML unavailable: ${error.message || "Screening failed"}`.slice(0, 255),
      score: null,
      total_matches: null,
      source: "TRACKWIZZ",
      screening_request_id: null,
      report_stored: false,
      degraded: true,
      technical_reason: error.code || "AML_SCREENING_FAILED",
    };
  }
}
async function editArthavidhiPreBureauCase(req,res) {
  return res.status(409).json({is_success:false,message:"Submitted booking details are locked. Resume Draft cases only; review-stage term changes belong to Partner Credit Review.",error_code:"BOOKING_LOCKED"});
}
// BEGIN ARTHAVIDHI LOAN BOOKING
/*
 * LOAN BOOKING ENTRY POINT
 * POST /api/arthavidhi-capital/loan-booking (same handler as /login).
 * authenticateIntake validates staff JWT or Arthavidhi partner API key.
 *
 * action: save_draft  -> save/resume Draft; no bureau/AML/BRE calls.
 * action: edit_pending -> reject edits to a submitted application.
 * no action           -> submit booking using the numbered steps below.
 * /v1/avcl-lb is the legacy batch adapter; it reuses this same handler.
 */
// The legacy batch adapter reuses this callback; the main route is inline.
let submitArthavidhiBooking;
router.post(["/login", "/loan-booking", "/arthavidhi-capital/loan-booking"],
  authenticateIntake,
  submitArthavidhiBooking = async (req, res) => {
    let mobileLocked = false;
    let mobileLockName;

    // Draft saving is separate from final submission.
    if (req.body?.action === "edit_pending") return editArthavidhiPreBureauCase(req, res);
    if (req.body?.action === "save_draft") return saveArthavidhiDraft(req, res);
    let conn,
      committed = false,
      step = "validation";
    try {
      // 1. Validate submitted customer, business and loan details.
      const { lan: resumeInput, ...bookingBody } = req.body || {};
      const data = normalize(bookingBody);
      {
        const requiredBusinessFields = [
          "business_name", "company_type", "industry", "business_vintage",
          "annual_turnover", "udyam_registration", "business_address",
          "business_pincode", "business_village", "business_state",
        ];
        const missingProfile = requiredBusinessFields.filter(
          key => data[key] == null || String(data[key]).trim() === "",
        );
        const assessment = arthavidhiIdentity(data.arthavidhi_capital_policy_inputs);
        if (assessment.monthly_revenue == null) missingProfile.push("monthly_revenue");
        if (missingProfile.length)
          bad("Complete business profile before booking: " + missingProfile.join(", "));
      }
      if (!resumeInput && /[Xx*]/.test(data.aadhar_number || ""))
        bad("Masked Aadhaar requires a verified DigiLocker draft", 409);
      // 2. Lock this mobile and start the booking transaction.
      step = "database_connection";
      conn = await db.promise().getConnection();
      mobileLockName = `avcl-otp-mobile:${data.mobile_number}`;
      const [[mobileLock]]=await conn.query("SELECT GET_LOCK(?,0) AS acquired",[mobileLockName]);
      mobileLocked = Number(mobileLock?.acquired) === 1;
      if (!mobileLocked)
        bad("This mobile is being updated. Retry once the current request completes.", 409);
      await requireUniqueArthavidhiMobile(conn,data.mobile_number,resumeInput);
      await conn.beginTransaction();
      // 3. Resume a verified Draft or allocate LAN/partner ID; reject duplicate PAN.
      step = "loan_sequence";
      // Same AVCL sequence as the existing customer flow. UNIQUE lender_name required.
      await conn.query(
        "INSERT INTO loan_sequences (lender_name,last_sequence) VALUES (?,10999) ON DUPLICATE KEY UPDATE lender_name=VALUES(lender_name)",
        [SEQUENCE],
      );
      const [[sequence]] = await conn.query(
        "SELECT last_sequence FROM loan_sequences WHERE lender_name=? FOR UPDATE",
        [SEQUENCE],
      );
      let draft;
      if (resumeInput) {
        if (!req.user) bad("Staff login required to resume a draft", 403);
        if (!/^AVCL\d+$/.test(String(resumeInput))) bad("Invalid Arthavidhi LAN");
        const [[saved]] = await conn.query(
          `SELECT lan,partner_loan_id,status,arthavidhi_capital_identity FROM ${TABLE} WHERE lan=? FOR UPDATE`,
          [resumeInput],
        );
        if (!saved || String(saved.status).toLowerCase() !== "draft")
          bad("Only an unsubmitted draft can be booked", 409);
        draft = saved;
        await requireArthavidhiIdentity(conn, saved, data);
      }
      const [existing] = await conn.query(
        `SELECT lan FROM ${TABLE} WHERE pan_number=? AND lan<>? LIMIT 1`,
        [data.pan_card, draft?.lan || ""],
      );
      if (existing.length) bad("Customer already exists for this PAN", 409);
      const next = Number(sequence.last_sequence) + 1;
      if (!Number.isSafeInteger(next) || next < 11000)
        throw new Error("Invalid AVCL sequence");
      data.lan = draft?.lan || `AVCL${next}`;
      data.partner_loan_id =
        draft?.partner_loan_id || data.partner_loan_id || `AVCLFL${next}`;
      if (!draft) {
        const [collision] = await conn.query(
          `SELECT lan FROM ${TABLE} WHERE lan=? LIMIT 1`,
          [data.lan],
        );
        if (collision.length) bad("AVCL sequence must be aligned with existing loans", 409);
      }
      // 4. Check partner booking limits and FLDG before saving the application.
      const { month, year } = getMonthYear(new Date());
      step = "partner_configuration";
      const partner = await partnerLimitService.getOrCreatePartner(conn, PARTNER);
      step = "booking_limit";
      const limit = await partnerLimitService.validatePartnerBookingLimit(
        conn,
        partner.partner_id,
        Number(data.loan_amount),
        month,
        year,
      );
      if (!limit.valid) bad(limit.message || "Monthly booking limit exceeded", 409);
      step = "fldg_configuration";
      const [[config]] = await conn.query(
        "SELECT fldg_percent,fldg_status FROM partner_master WHERE partner_id=?",
        [partner.partner_id],
      );
      if (!config) bad("Arthavidhi partner configuration is missing", 503);
      let requiredFldg = "0.00";
      if (Number(config.fldg_status) === 1) {
        const pct = amount(config.fldg_percent, "fldg_percent");
        requiredFldg = String((paise(data.loan_amount) * paise(pct) + 5000n) / 10000n);
        requiredFldg = `${BigInt(requiredFldg) / 100n}.${String(BigInt(requiredFldg) % 100n).padStart(2, "0")}`;
        if (paise(requiredFldg) > 0n) {
          const check = await partnerFldgService.validateFldgAvailability(
            conn,
            partner.partner_id,
            Number(requiredFldg),
          );
          if (!check.valid) bad("Insufficient FLDG availability", 409);
        }
      }
      // 5. Save the case (promote Draft or insert new booking).
      step = "loan_insert";
      const record = toArthavidhiBookingRecord(data);
      const keys = Object.keys(record);
      if (draft)
        await conn.query(
          `UPDATE ${TABLE} SET ${keys.map((k) => `\`${k}\`=?`).join(",")} WHERE lan=?`,
          [...keys.map((k) => record[k]), data.lan],
        );
      else {
        await conn.query(
          `INSERT INTO ${TABLE} (${keys.map((k) => `\`${k}\``).join(",")}) VALUES (${keys.map(() => "?").join(",")})`,
          keys.map((k) => record[k]),
        );
        await conn.query("UPDATE loan_sequences SET last_sequence=? WHERE lender_name=?", [
          next,
          SEQUENCE,
        ]);
      }
      // 6. Reserve booking limit/FLDG and commit. Provider calls happen later.
      step = "booking_limit_update";
      await partnerLimitService.updateBookedLimit(
        conn,
        limit.limitId,
        Number(data.loan_amount),
        data.lan,
      );
      if (paise(requiredFldg) > 0n)
        await partnerFldgService.reserveFldg(
          conn,
          partner.partner_id,
          data.lan,
          Number(requiredFldg),
          "Arthavidhi Capital manual UBL booking",
        );
      await conn.commit();
      committed = true;
      await conn.query("SELECT RELEASE_LOCK(?)", [mobileLockName]);
      mobileLocked = false;
      conn.release();
      conn = null;
      // 7. Run bureau -> AML -> BRE after commit, with the same saved LAN.
      const { bureau, aml, bre } = await runArthavidhiBookingChecks(data.lan, data);
      const currentStatus = [
        "bre_approved",
        "bre_rejected",
        "policy_review",
        "aml_review",
        "aml_rejected",
      ].includes(bre.status)
        ? bre.status
        : "Login";
      // 8. Return the retained application and check results to Review & Book.
      // HTTP 201 means the application is saved, not that credit is approved.
      return res
        .status(201)
        .json({
          is_success: true,
          message: currentStatus === "bre_approved" ? "Booking checks passed. Ready for Partner Credit Review." : "Application retained. Review the incomplete or failed booking checks.",
          data: {
            lan: data.lan,
            partner_loan_id: data.partner_loan_id,
            customer_name: data.customer_name,
            status: currentStatus,
            bureau,
            bre,
            aml,
            next_action:
              currentStatus === "policy_review"
                ? "Review the highlighted policy issues on Review & Book before continuing."
                : currentStatus === "bre_approved"
                  ? "Review the case in Partner Credit Review."
                  : currentStatus === "bre_rejected"
                    ? "Review the BRE rejection reason in case details."
                    : currentStatus === "aml_rejected"
                      ? "Case rejected by AML. Review the screening reason."
                      : currentStatus === "aml_review"
                        ? "AML review required before the case can enter Credit Team."
                        : "Open case details and review the eligibility check.",
          },
        });
    } catch (error) {
      if (conn && !committed) {
        try {
          await conn.rollback();
        } catch (rollbackError) {
          console.error("Arthavidhi booking rollback failed", { code: rollbackError.code });
        }
      }
      const failure = bookingFailure(error);
      if (!error.status)
        console.error("Arthavidhi manual booking failed", {
          code: failure.code,
          step,
          resource: failure.resource,
        });
      return res
        .status(failure.status)
        .json({
          is_success: false,
          message: failure.message,
          error_code: failure.code,
          step,
          ...(failure.resource ? { resource: failure.resource } : {}),
        });
    } finally {
      if (conn) {
        try {
          if (mobileLocked) await conn.query("SELECT RELEASE_LOCK(?)", [mobileLockName]);
        } finally {
          conn.release();
        }
      }
    }
});
// END ARTHAVIDHI LOAN BOOKING

function authenticateIntake(req, res, next) {
  // The shared staff client also sends a default partner key. A supplied staff
  // token must be validated as staff auth, without falling back to API-key auth.
  if (req.headers.authorization || !req.headers["x-api-key"])
    return authenticateUser(req, res, next);
  return verifyApiKey(req, res, () => {
    const partner = String(req.partner?.name || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    if (!["arthavidhicapital", "avcl"].includes(partner))
      return res
        .status(403)
        .json({ message: "This route is only for Arthavidhi Capital partner." });
    return next();
  });
}
// One login handler for the manual screen and partner intake. Old booking URLs
// remain aliases so existing callers do not break.
// Booking URLs are registered inline above.
registerArthavidhiWorkflow(router, { pullBureau: pullArthavidhiCapitalBureau });

// Partner intake counterpart retained alongside the new manual staff booking.
router.post("/v1/avcl-lb", verifyApiKey, async (req, res) => {
  const partner = String(req.partner?.name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  if (!["arthavidhicapital", "avcl"].includes(partner))
    return res
      .status(403)
      .json({ message: "This route is only for Arthavidhi Capital partner." });
  const lender = String(req.headers["x-lender"] ?? req.headers.lender ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  if (!["arthavidhicapital", "avcl"].includes(lender))
    return res.status(400).json({ message: "Send x-lender: AVCL" });
  const records = Array.isArray(req.body) ? req.body : [req.body],
    results = [];
  if (!records.length || records.length > 100)
    return res.status(400).json({ message: "Send 1-100 records" });
  for (const body of records) {
    const capture = {
      code: 200,
      status(code) {
        this.code = code;
        return this;
      },
      json(out) {
        this.output = out;
        return this;
      },
    };
    await submitArthavidhiBooking({ ...req, body }, capture);
    if (capture.code === 201)
      results.push({ message: capture.output.message, ...capture.output.data });
    else results.push({ error: capture.output.message, status_code: capture.code });
  }
  return res.json({
    message: "Arthavidhi Capital upload completed.",
    results,
    row_errors: [],
  });
});

router.get(
  "/v1/arthavidhi-capital-lan-status/:lan",
  authenticateUser,
  async (req, res) => {
    try {
      const [rows] = await db
        .promise()
        .query(`SELECT lan,status FROM ${TABLE} WHERE lan=? LIMIT 1`, [req.params.lan]);
      if (!rows.length) return res.status(404).json({ message: "LAN not found." });
      return res.json({
        message: "LAN status fetched successfully.",
        data: fromArthavidhiBookingRecord(rows[0]),
      });
    } catch (e) {
      return res.status(500).json({ message: "Failed to fetch LAN status." });
    }
  },
);
router.get(
  "/v1/arthavidhi-capital-customer-details/:lan",
  authenticateUser,
  async (req, res) => {
    try {
      const [rows] = await db
        .promise()
        .query(`SELECT * FROM ${TABLE} WHERE lan=? LIMIT 1`, [req.params.lan]);
      if (!rows.length)
        return res
          .status(404)
          .json({
            is_success: false,
            error: { message: "LAN not found.", code: "not_found" },
          });
      return res.json({
        is_success: true,
        message: "Customer details fetched successfully.",
        data: rows[0],
      });
    } catch (e) {
      return res
        .status(500)
        .json({ is_success: false, error: { message: "Failed to fetch details" } });
    }
  },
);
router.get(
  "/v1/arthavidhi-capital-ops-maker-approved-loans",
  authenticateUser,
  async (req, res) => {
    try {
      const [rows] = await db
        .promise()
        .query(`SELECT * FROM ${TABLE} WHERE status='approved' ORDER BY lan DESC`);
      return res.json({ data: rows });
    } catch (e) {
      return res
        .status(500)
        .json({ status: "FAILED", message: "Unable to fetch ops maker approved loans" });
    }
  },
);
router.post("/v1/arthavidhi-capital-bank-details", authenticateUser, async (req, res) => {
  const records = Array.isArray(req.body) ? req.body : [req.body];
  const results = [];
  try {
    for (const raw of records) {
      if (!raw || typeof raw !== "object")
        return res.status(400).json({ message: "Invalid bank details payload" });
      const data = {
        ...raw,
        account_number: raw.account_number ?? raw.account_no ?? raw.acc_no,
        ifsc: String(raw.ifsc ?? raw.bank_ifsc ?? "")
          .trim()
          .toUpperCase(),
      };
      if (!data.lan || !data.bank_name || !data.account_number || !data.ifsc)
        return res
          .status(400)
          .json({ message: "lan, bank_name, account_number and ifsc are required" });
      if (!/^AVCL\d+$/.test(data.lan) || !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(data.ifsc))
        return res.status(400).json({ message: "Invalid LAN or IFSC" });
      const [out] = await db
        .promise()
        .query(
          `UPDATE ${TABLE} SET umrn=?,bank_name=?,name_in_bank=COALESCE(?,name_in_bank),account_number=?,ifsc=? WHERE lan=? AND LOWER(status) IN ('login','bre_approved','credit initiated','disburse initiate')`,
          [
            data.e_mandate_no ?? null,
            data.bank_name,
            data.name_in_bank ?? null,
            String(data.account_number),
            data.ifsc,
            data.lan,
          ],
        );
      if (!out.affectedRows) {
        const [rows] = await db
          .promise()
          .query(`SELECT lan FROM ${TABLE} WHERE lan=?`, [data.lan]);
        return res
          .status(rows.length ? 409 : 404)
          .json({
            message: rows.length
              ? "Bank details cannot be changed at the current status"
              : "LAN not found.",
          });
      }
      results.push({
        message: "Arthavidhi Capital loan bank details updated successfully.",
        lan: data.lan,
      });
    }
    return res.json({
      message: "Arthavidhi Capital bank details processed successfully.",
      results,
    });
  } catch (e) {
    return res.status(500).json({ message: "Unable to update bank details" });
  }
});

// Manual payment only: checker approves the case; finance pays outside the app.
// Legacy pay URL remains an alias and cannot initiate a provider payout.
router.put(
  ["/v1/arthavidhi-capital-ops-checker-approved-loan/:lan", "/:lan/ops-checker-pay", "/:lan/ops-checker-decision"],
  authenticateUser,
  async (req, res) => {
    const lan = String(req.params.lan || "");
    let conn,
      committed = false;
    try {
      if (!/^AVCL\d+$/.test(lan)) bad("Invalid LAN");
      if (!req.body || typeof req.body !== "object" || Array.isArray(req.body))
        bad("Invalid request body");
      const user = req.user || {};
      const actor = user.id ?? user.userId ?? user.user_id;
      if (actor == null)
        bad(
          "Authenticated checker identity missing; map verifyToken identity in this route",
          401,
        );
      const checkerName = user.name ?? user.username ?? user.full_name ?? null;
      const status = req.body.status;
      if (status !== "OPS_REJECTED" && String(status).toLowerCase() !== "approved")
        bad("status must be approved or OPS_REJECTED");
      conn = await db.promise().getConnection();
      await conn.beginTransaction();
      const [[storedLoan]] = await conn.query(
        `SELECT * FROM ${TABLE} WHERE lan=? LIMIT 1 FOR UPDATE`,
        [lan],
      );
      const loan = fromArthavidhiBookingRecord(storedLoan);
      if (!loan) bad("Loan not found", 404);
      if (String(loan.ops_maker_id) === String(actor))
        bad("Operations maker cannot approve their own payout", 403);
      const [[attempt]] = await conn.query(
        "SELECT request_id,state FROM arthavidhi_capital_payout_attempts WHERE lan=?",
        [lan],
      );
      if (attempt) bad("A legacy API payout exists. Reconcile it before manual payment",409);
      const [transfers] = await conn.query("SELECT id FROM quick_transfers WHERE lan=? LIMIT 1",[lan]);
      if (transfers.length) bad("An API transfer already exists. Reconcile it before manual payment",409);
      if (String(loan.status).toLowerCase() === "disburse_initiate" && String(status).toLowerCase() === "approved") {
        await conn.rollback();
        return res.json({status:"SUCCESS",success:true,lan,final_status:"disburse_initiate",message:"Checker approval already saved. Awaiting manual payment and UTR upload."});
      }
      if (String(loan.status).toLowerCase() !== "approved")
        bad("Loan must be approved by operations maker first", 409);
      if (status === "OPS_REJECTED") {
        const reason = String(req.body.reason || "").trim();
        if (!reason || reason.length > 2000)
          bad("Operations rejection reason required (up to 2000 characters)");
        await conn.query(
          `UPDATE ${TABLE} SET status='OPS_REJECTED',stage='OPS_REJECTED',ops_checker_id=?,ops_checker_name=? WHERE lan=?`,
          [String(actor), checkerName, lan],
        );
        await require("../../services/arthavidhiRejection").releaseArthavidhiReservations(
          conn,
          lan,
        );
        await conn.query(
          "INSERT INTO arthavidhi_capital_audit (lan,event_type,actor_id,details) VALUES (?,'CHECKER_REJECTED',?,?)",
          [lan, String(actor), JSON.stringify({ reason })],
        );
        await conn.commit();
        committed = true;
        conn.release();conn=null;
        await require("./arthavidhiWebhook").sendArthavidhiWebhook(
          lan,"OPS_REJECTED",{external_ref_no:loan.partner_loan_id,reject_reason:reason},
        );
        return res.json({
          status: "SUCCESS",
          message: "Loan rejected by operations checker successfully",
        });
      }
      if (!loan.ops_maker_id) bad("Recorded maker approval required", 409);
      require("../../services/ArthavidhiCapitalAgreementStatus").requireArthavidhiPolicyApproval(
        loan,
      );
      await require("../../services/ArthavidhiCapitalAgreementStatus").requireArthavidhiActiveMandate(
        conn,
        loan,
      );
      if (String(loan.aml_status).toUpperCase() !== "PROCEED")
        bad("AML must be PROCEED before payout", 409);
      const [[kyc]] = await conn.query(
        "SELECT pan_status,aadhaar_status,bureau_status FROM kyc_verification_status WHERE lan=? AND applicant_type='BORROWER' AND party_no=1",
        [lan],
      );
      if (
        !kyc ||
        ![kyc.pan_status, kyc.aadhaar_status].every(
          (v) => String(v).toUpperCase() === "VERIFIED",
        ) ||
        (String(kyc.bureau_status).toUpperCase() !== "VERIFIED" &&
          !require("../../services/ArthavidhiCapitalAgreementStatus").hasApprovedArthavidhiNoHit(
            loan,
          ))
      )
        bad("Borrower KYC and bureau/deviation must be verified before payout", 409);
      const [signed] = await conn.query(
        "SELECT id FROM esign_documents WHERE lan=? AND document_type='AGREEMENT' AND UPPER(TRIM(status)) IN ('SIGNED','COMPLETED','SIGN_COMPLETE') LIMIT 1",
        [lan],
      );
      if (!signed.length) bad("Signed agreement required before payout", 409);
      const payoutAmount = amount(
        loan.disbursal_amount ?? loan.loan_amount,
        "disbursal_amount",
        true,
      );
      if (paise(payoutAmount) > paise(amount(loan.loan_amount, "loan_amount", true)))
        bad("Invalid disbursal amount", 409);
      const { month, year } = getMonthYear(new Date());
      const partner = await partnerLimitService.getOrCreatePartner(conn, PARTNER);
      const limit = await partnerLimitService.validatePartnerDisbursementLimit(
        conn,
        partner.partner_id,
        Number(payoutAmount),
        month,
        year,
      );
      if (!limit.valid) bad(limit.message || "Disbursement limit exceeded", 400);
      await conn.query(
        `UPDATE ${TABLE} SET status='disburse_initiate',stage='Awaiting Manual Payment',ops_checker_id=?,ops_checker_name=? WHERE lan=?`,
        [String(actor),checkerName,lan],
      );
      await conn.query("INSERT INTO arthavidhi_capital_audit (lan,event_type,actor_id,details) VALUES (?,'MANUAL_PAYMENT_APPROVED',?,?)",
        [lan,String(actor),JSON.stringify({payment_mode:"MANUAL",net_disbursement:payoutAmount})]);
      await conn.commit();committed=true;
      return res.json({success:true,status:"SUCCESS",lan,final_status:"disburse_initiate",
        message:"Checker approved. Finance must pay manually, then upload the bank UTR to disburse and generate RPS."});
    } catch (e) {
      if (conn && !committed) {
        try {
          await conn.rollback();
        } catch (_) { }
      }
      return res
        .status(e.status || 500)
        .json({
          status: "FAILED",
          message: e.status
            ? e.message
            : committed
              ? "Checker approval saved. Awaiting manual payment and UTR"
              : "Failed to approve loan by operations checker",
        });
    } finally {
      if (conn) conn.release();
    }
  },
);
// Reuse the exact bureau transport/parser used by Ya Money. Only persistence
// targets Arthavidhi's booking row and borrower KYC record.
// Provider adapters: call the shared Ya Money services, persist only this product's case.
async function pullArthavidhiCapitalBureau(lan, input) {
  const missingFields = ["EXPERIAN_URL", "EXPERIAN_USER", "EXPERIAN_PASSWORD"].filter(
    (key) => !String(process.env[key] || "").trim(),
  );
  if (missingFields.length)
    return {
      success: false,
      status: "PENDING",
      code: "EXPERIAN_CONFIG_MISSING",
      missingFields,
      message: `Configure ${missingFields.join(", ")} in Backend/.env and restart the backend.`,
    };
  let conn,
    locked = false;
  const lockName = `avcl-intake:${String(lan).trim().toUpperCase()}`;
  try {
    conn = await db.promise().getConnection();
    const [[lock]] = await conn.query("SELECT GET_LOCK(?,0) AS acquired", [lockName]);
    locked = Number(lock?.acquired) === 1;
    if (!locked)
      return {
        success: false,
        status: "PENDING",
        code: "BUREAU_IN_PROGRESS",
        message:
          "A case edit or bureau request is already in progress. Refresh before retrying.",
      };
    const [[stored]] = await conn.query(`SELECT * FROM ${TABLE} WHERE lan=?`, [lan]);
    if (!stored)
      throw Object.assign(new Error("Loan not found"), { code: "LOAN_NOT_FOUND" });
    const data = fromArthavidhiBookingRecord(stored);
    const names = String(
      data.customer_name ||
      [data.first_name, data.middle_name, data.last_name].filter(Boolean).join(" "),
    )
      .trim()
      .split(/\s+/);
    const dob = data.borrower_dob ?? data.dob;
    const { runBureau } = require("../../services/Bueraupullapiservice");
    const result = await runBureau({
      enquiry_reason: "05",
      customer_name: data.customer_name,
      first_name: names[0],
      middle_name: names.length > 2 ? names.slice(1, -1).join(" ") : "",
      last_name: names.length > 1 ? names.at(-1) : names[0],
      dob,
      gender: data.gender,
      pan_number: data.pan_card,
      mobile_number: data.mobile_number,
      current_address: data.address_line_1,
      current_village_city: data.village,
      current_state: data.state,
      current_pincode: data.pincode,
      loan_amount: data.requested_amount ?? data.loan_amount,
    });
    const hasScore =
      result.score !== null &&
      result.score !== undefined &&
      String(result.score).trim() !== "";
    const score = hasScore ? Number(result.score) : null;
    const verified =
      result.success === true &&
      hasScore &&
      Number.isInteger(score) &&
      score >= -2147483648 &&
      score <= 2147483647;
    const report =
      typeof result.response === "string"
        ? result.response
        : JSON.stringify(result.response ?? { success: false });
    await conn.beginTransaction();
    // A failed attempt is recorded with a null score so an old report cannot
    // silently stand in for the latest failed request when BRE is refreshed.
    await conn.query(
      "INSERT INTO loan_cibil_reports (lan,pan_number,score,report_xml,created_at) VALUES (?,?,?,?,NOW())",
      [lan, data.pan_card, verified ? score : null, report],
    );
    await conn.query(`UPDATE ${TABLE} SET cibil_score=? WHERE lan=?`, [
      verified ? score : null,
      lan,
    ]);
    await conn.query(
      `INSERT INTO kyc_verification_status (lan,applicant_type,party_no,pan_number,bureau_status)
      VALUES (?,'BORROWER',1,?,?) ON DUPLICATE KEY UPDATE bureau_status=VALUES(bureau_status),pan_number=VALUES(pan_number)`,
      [lan, data.pan_card, verified ? "VERIFIED" : "FAILED"],
    );
    await conn.commit();
    return {
      success: verified,
      status: verified ? "VERIFIED" : "FAILED",
      code: verified ? "BUREAU_SAVED" : "BUREAU_PULL_FAILED",
      score: verified ? score : null,
      message: verified
        ? "Bureau report fetched and saved."
        : "Bureau did not return a valid score. Check the provider response in backend diagnostics.",
    };
  } catch (error) {
    if (conn)
      try {
        await conn.rollback();
      } catch (_) { }
    console.error("Arthavidhi bureau pull failed", {
      code: error.code || "BUREAU_PULL_FAILED",
    });
    return {
      success: false,
      status: "PENDING",
      code: "BUREAU_PULL_FAILED",
      message: "Bureau request or report persistence failed. Check backend diagnostics.",
    };
  } finally {
    if (conn) {
      try {
        if (locked) await conn.query("SELECT RELEASE_LOCK(?)", [lockName]);
      } finally {
        conn.release();
      }
    }
  }
}
async function runArthavidhiBookingChecks(lan, data) {
  const bureau = await pullArthavidhiCapitalBureau(lan, data);
  const aml = await runArthavidhiAml(lan);
  const bre = await triggerArthavidhiCapitalBre(lan, bureau);
  return {bre,bureau,aml};
}
async function triggerArthavidhiCapitalBre(lan, bureau) {
  let engine;
  try {
    engine = require("./ArthavidhiCapitalBRE");
  } catch (error) {
    if (error.code !== "MODULE_NOT_FOUND")
      console.error("Arthavidhi BRE load failed", {
        code: error.code || "BRE_LOAD_FAILED",
      });
    return { status: "PENDING", code: "ARTHAVIDHI_BRE_MODULE_REQUIRED" };
  }
  if (typeof engine.autoRunArthavidhiCapitalBreIfReady !== "function")
    return { status: "PENDING", code: "ARTHAVIDHI_BRE_EXPORT_REQUIRED" };
  try {
    return await engine.autoRunArthavidhiCapitalBreIfReady(lan, { bureauResult: bureau });
  } catch (error) {
    console.error("Arthavidhi BRE failed", { code: error.code || "BRE_FAILED" });
    return { status: "PENDING", code: "BRE_FAILED" };
  }
}

// Identity verification follows ClaimCureBuddy's providers, with AVCL-only
// persistence. It does not call ClaimCureBuddy's BRE or automatic payout.
function arthavidhiIdentity(value) {
  try {
    return typeof value === "string" ? JSON.parse(value) || {} : value || {};
  } catch {
    return {};
  }
}
// Arthavidhi-only PAN-number lookup. Other products retain their shared
// name-based verifier. Provider URLs/credentials are the same configured APIs.
async function lookupArthavidhiPan(panNumber) {
  const pan = String(panNumber || "").toUpperCase();
  if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan))
    return {success:false,provider:null,reason:"INVALID_PAN",response:null};
  const axios = require("axios");
  const attempts = [];
  for (const provider of ["ZOOP", "FINANALYZ"]) {
    try {
      let response;
      if (provider === "ZOOP") {
        if (!process.env.ZOOP_PAN_API_URL || !process.env.ZOOP_API_KEY || !process.env.ZOOP_APP_ID)
          throw Object.assign(new Error("Zoop configuration missing"), {code:"PAN_CONFIG_MISSING"});
        response = await axios.post(process.env.ZOOP_PAN_API_URL, {
          mode:"sync",task_id:require("crypto").randomUUID(),
          data:{customer_pan_number:pan,consent:"Y",consent_text:"I hereby declare my consent agreement for fetching my information via ZOOP API"},
        }, {headers:{"Content-Type":"application/json","api-key":process.env.ZOOP_API_KEY,"app-id":process.env.ZOOP_APP_ID},timeout:30000,validateStatus:()=>true});
      } else {
        if (!process.env.FINANALYZ_X_API_KEY)
          throw Object.assign(new Error("Finanalyz configuration missing"), {code:"PAN_CONFIG_MISSING"});
        response = await axios.post(process.env.FINANALYZ_PAN_URL || "https://aasandbox.finanalyz.com/eKyc/pan-Details",
          {panNumber:pan}, {headers:{"Content-Type":"application/json",accept:"*/*",XApiKey:process.env.FINANALYZ_X_API_KEY},timeout:30000,validateStatus:()=>true});
      }
      const raw = response.data;
      const verified = provider === "ZOOP"
        ? raw?.success === true || raw?.status === "success" || raw?.data?.result === "success"
        : raw?.data?.response?.code === 200 && raw?.data?.response?.isValid === true;
      const success = response.status === 200 && verified;
      attempts.push({provider,httpStatus:response.status,success});
      const result = {success,provider,httpStatus:response.status,response:raw,raw,attempts};
      if (success || provider === "FINANALYZ") return result;
    } catch (error) {
      const httpStatus = error.response?.status ?? null;
      attempts.push({provider,httpStatus,success:false});
      if (provider === "FINANALYZ") return {success:false,provider,httpStatus,attempts,
        reason:"FINANALYZ_ERROR",response:error.response?.data || {error:"PAN lookup service unavailable or configuration missing"}};
    }
  }
}

function arthavidhiPanResult(result) {
  const root = result?.response ?? result?.raw ?? result?.data ?? {};
  const layers = [],
    queue = [{ value: root, depth: 0 }],
    seen = new Set();
  while (queue.length && layers.length < 24) {
    let { value, depth } = queue.shift();
    if (typeof value === "string" && value.length < 100000) {
      try {
        value = JSON.parse(value);
      } catch {
        continue;
      }
    }
    if (!value || typeof value !== "object" || Array.isArray(value) || seen.has(value))
      continue;
    seen.add(value);
    layers.push(value);
    if (depth < 5)
      for (const key of ["data", "result", "response", "payload", "body"])
        if (value[key] != null) queue.push({ value: value[key], depth: depth + 1 });
  }
  const detail = layers.find((value) => Object.hasOwn(value, "isValid"));
  // The shared helper compares code === 200. Some responses encode it as
  // "200"; accept only an explicit successful Finanalyz validity response.
  const validFinanalyz =
    result?.provider === "FINANALYZ" &&
    Number(detail?.code) === 200 &&
    detail?.isValid === true;
  const explicitlyInvalid = layers.some(
    (value) =>
      value.isValid === false ||
      value.isValid === "false" ||
      value.is_pan_verified === "no" ||
      ["INVALID", "DELETED", "DEACTIVATED"].includes(
        String(value.pan_status || "").toUpperCase(),
      ),
  );
  const transportFailed = Number(result?.httpStatus) >= 400;
  const success = Boolean(
    (result?.success === true || validFinanalyz) &&
    !explicitlyInvalid &&
    !transportFailed,
  );
  const profile =
    [...layers]
      .reverse()
      .find(
        (value) =>
          value.user_full_name ||
          value.name_on_card ||
          value.full_name ||
          value.fullName ||
          value.name ||
          value.pan_name ||
          value.panName ||
          value.registered_name ||
          value.registeredName ||
          value.first_name ||
          value.firstName ||
          value.user_first_name,
      ) || {};
  const name = String(
    profile.user_full_name ||
    profile.name_on_card ||
    profile.full_name ||
    profile.fullName ||
    profile.name ||
    profile.pan_name ||
    profile.panName ||
    profile.registered_name ||
    profile.registeredName ||
    [
      profile.first_name || profile.firstName || profile.user_first_name,
      profile.user_middle_name,
      profile.last_name || profile.lastName || profile.user_last_name,
    ]
      .filter(Boolean)
      .join(" "),
  ).trim();
  const rawDobs = layers
    .flatMap((value) => [
      value.dob,
      value.date_of_birth,
      value.dateOfBirth,
      value.birthDate,
      value.user_dob,
      value.DOB,
    ])
    .filter((value) => typeof value === "string" && value.trim());
  let dob = null;
  for (const rawDob of rawDobs) {
    const date = rawDob.trim();
    const iso = date.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T ].*)?$/),
      indian = date.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    const candidate = iso
      ? `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`
      : indian
        ? `${indian[3]}-${indian[2].padStart(2, "0")}-${indian[1].padStart(2, "0")}`
        : null;
    const parsed = candidate ? new Date(`${candidate}T00:00:00Z`) : null;
    if (
      parsed &&
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === candidate
    ) {
      dob = candidate;
      break;
    }
  }
  const provider = String(result?.provider || "UNKNOWN");
  const responseCode = layers
    .map((value) => value.statusCode ?? value.status_code ?? value.code)
    .find((value) => value !== null && value !== undefined);
  const status = transportFailed
    ? Number(result.httpStatus)
    : layers
      .map((value) => value.statusCode ?? value.status_code ?? value.code)
      .find((value) => [401, 403, 429, 500, 502, 503, 504].includes(Number(value)));
  const diagnosticText = JSON.stringify(root).toLowerCase();
  let code = "PAN_PROVIDER_REJECTED",
    message =
      "PAN could not be verified. Check the PAN number and retry. If it is correct, check the provider's response in backend diagnostics.",
    httpStatus = 422;
  if (
    Number(status) === 401 ||
    Number(status) === 403 ||
    /invalid.{0,12}(api.?key|credential|token)|unauthori[sz]ed|authentication failed/.test(
      diagnosticText,
    )
  ) {
    code = "PAN_PROVIDER_AUTH_FAILED";
    message =
      "PAN provider authentication failed. Check the PAN provider credentials in Backend/.env and restart the backend.";
    httpStatus = 503;
  } else if (
    /insufficient.{0,15}(balance|credit)|wallet|subscription expired|quota exceeded/.test(
      diagnosticText,
    )
  ) {
    code = "PAN_PROVIDER_ACCOUNT_LIMIT";
    message =
      "PAN provider account balance, subscription or quota needs attention before verification can continue.";
    httpStatus = 503;
  } else if (Number(status) === 429) {
    code = "PAN_PROVIDER_RATE_LIMITED";
    message = "PAN provider request limit reached. Wait before retrying.";
    httpStatus = 503;
  } else if (
    Number(status) >= 500 ||
    /env config missing|timeout|timed out|econnrefused|enotfound/.test(diagnosticText) ||
    result?.reason === "FINANALYZ_ERROR"
  ) {
    code = "PAN_PROVIDER_UNAVAILABLE";
    message =
      "PAN verification service is unavailable or misconfigured. Check the provider connection and configuration before retrying.";
    httpStatus = 502;
  } else if (!success && !explicitlyInvalid) {
    code = "PAN_PROVIDER_RESPONSE_UNRECOGNIZED";
    message =
      "PAN provider did not return a recognised verification result. This does not confirm that the PAN is invalid; the provider response needs checking.";
    httpStatus = 502;
  }
  const providerAttempts = Array.isArray(result?.attempts)
    ? result.attempts
      .filter((attempt) => ["ZOOP", "FINANALYZ"].includes(attempt.provider))
      .map((attempt) => ({
        provider: attempt.provider,
        httpStatus: Number.isInteger(attempt.httpStatus) ? attempt.httpStatus : null,
        success: attempt.success === true,
      }))
    : [];
  if (
    !success &&
    providerAttempts.some(
      (attempt) => attempt.provider === "ZOOP" && [401, 403].includes(attempt.httpStatus),
    ) &&
    providerAttempts.some(
      (attempt) => attempt.provider === "FINANALYZ" && attempt.httpStatus >= 500,
    )
  ) {
    code = "PAN_PROVIDERS_UNAVAILABLE";
    message =
      "PAN verification is unavailable: Zoop authentication failed and the Finanalyz fallback returned a server error. The provider configuration needs attention.";
    httpStatus = 503;
  }
  const responseShape = layers.map((value) =>
    Object.keys(value)
      .filter((key) => /^[a-zA-Z_][a-zA-Z0-9_]{0,39}$/.test(key))
      .slice(0, 25),
  );
  return {
    success,
    name,
    dob,
    provider,
    code,
    message,
    httpStatus,
    providerCode: status ?? detail?.code ?? responseCode ?? null,
    providerHttpStatus: result?.httpStatus ?? null,
    responseShape,
    providerAttempts,
  };
}
function arthavidhiAadhaarProfile(kyc) {
  const payload = arthavidhiIdentity(kyc?.aadhaar_api_response);
  let address =
    payload.data?.address ||
    payload.payload?.data?.address ||
    payload.model?.address ||
    kyc?.aadhaar_address;
  if (typeof address === "string") {
    try {
      address = JSON.parse(address);
    } catch {
      address = { addressLine1: address };
    }
  }
  address = address?.address || address || {};
  const dob = kyc?.aadhaar_dob;
  const masked = String(kyc?.aadhaar_masked_number || "").replace(/[\s-]/g, "");
  return {
    customer_name: kyc?.aadhaar_name || "",
    dob:
      dob instanceof Date
        ? `${dob.getFullYear()}-${String(dob.getMonth() + 1).padStart(2, "0")}-${String(dob.getDate()).padStart(2, "0")}`
        : String(dob || "").slice(0, 10),
    aadhaar_number: masked ? `XXXXXXXX${masked.slice(-4)}` : "",
    customer_address:
      [address.house, address.street, address.landmark, address.loc]
        .filter(Boolean)
        .join(", ") ||
      address.addressLine1 ||
      address.address_line_1 ||
      "",
    customer_city:
      address.vtc || address.city || address.po || address.dist || address.district || "",
    customer_state: address.state || "",
    customer_pincode: String(address.pc || address.pincode || ""),
  };
}
async function requireArthavidhiIdentity(conn, loan, data) {
  const identity = arthavidhiIdentity(loan?.arthavidhi_capital_identity);
  if (!identity.required) {
    if (/[Xx*]/.test(data.aadhar_number || ""))
      bad("Masked Aadhaar requires verified DigiLocker KYC", 409);
    return;
  }
  const [[kyc]] = await conn.query(
    "SELECT * FROM kyc_verification_status WHERE lan=? AND applicant_type='BORROWER' AND party_no=1",
    [loan.lan],
  );
  if (!identity.mobile_verified_at || identity.mobile !== data.mobile_number)
    bad("Verify the customer's current mobile number by OTP", 409);
  if (
    kyc?.pan_status !== "VERIFIED" ||
    kyc.pan_number !== data.pan_card ||
    identity.pan !== data.pan_card
  )
    bad("Verify this PAN before booking", 409);
  if (
    kyc?.aadhaar_status !== "VERIFIED" ||
    identity.aadhaar_pan !== data.pan_card ||
    identity.aadhaar_mobile !== data.mobile_number
  )
    bad("Complete Aadhaar DigiLocker verification before booking", 409);
  const profile = arthavidhiAadhaarProfile(kyc);
  if (profile.dob && profile.dob !== data.borrower_dob)
    bad("Date of birth must match the verified Aadhaar record", 409);
  if (
    profile.aadhaar_number &&
    profile.aadhaar_number.slice(-4) !== String(data.aadhar_number).slice(-4)
  )
    bad("Aadhaar must match the verified DigiLocker record", 409);
  const verifiedName = identity.pan_name;
  if (
    verifiedName &&
    String(data.customer_name).trim().toUpperCase() !== verifiedName.trim().toUpperCase()
  )
    bad("Customer name must match the verified PAN record", 409);
}
async function arthavidhiIdentityRequest(req, res, work, { readOnly = false } = {}) {
  let conn,
    locked = false,
    smsLocked = false,
    committed = false;
  const smsLockName = ["/otp/send","/otp/verify"].some(path=>req.route?.path?.endsWith(path))
    ? `avcl-otp-mobile:${String(req.body.mobile || "")}`
    : null;
  const lan = String(req.params.lan || "")
    .trim()
    .toUpperCase(),
    lockName = `avcl-intake:${lan}`;
  try {
    if ((req.user?.id ?? req.user?.userId ?? req.user?.user_id) == null)
      bad("Staff login required", 403);
    if (!/^AVCL\d+$/.test(lan)) bad("Invalid Arthavidhi LAN");
    conn = await db.promise().getConnection();
    const [[lock]] = await conn.query("SELECT GET_LOCK(?,0) AS acquired", [lockName]);
    locked = Number(lock?.acquired) === 1;
    if (!locked) bad("Another identity check or case update is in progress", 409);
    if (smsLockName) {
      const [[smsLock]] = await conn.query("SELECT GET_LOCK(?,0) AS acquired", [
        smsLockName,
      ]);
      smsLocked = Number(smsLock?.acquired) === 1;
      if (!smsLocked) bad("A mobile OTP request is already in progress", 429);
    }
    await conn.beginTransaction();
    const [[loan]] = await conn.query(`SELECT * FROM ${TABLE} WHERE lan=? FOR UPDATE`, [
      lan,
    ]);
    if (!loan) bad("Case not found", 404);
    if (!readOnly && String(loan.status).toLowerCase() !== "draft") {
      const [editable] = await loadArthavidhiBookingEditability(conn, [loan]);
      if (!editable.can_edit_booking)
        bad("Identity is locked after bureau completion or credit progression", 409);
    }
    const [[kyc]] = await conn.query(
      "SELECT * FROM kyc_verification_status WHERE lan=? AND applicant_type='BORROWER' AND party_no=1",
      [lan],
    );
    const result = await work({
      conn,
      loan,
      kyc: kyc || {},
      identity: arthavidhiIdentity(loan.arthavidhi_capital_identity),
      lan,
    });
    await conn.commit();
    committed = true;
    // A successful response lets the browser immediately verify or refresh.
    // Release advisory locks first; otherwise that follow-up can see a false
    // "identity check in progress" despite this request already succeeding.
    if (smsLocked) {
      await conn.query("SELECT RELEASE_LOCK(?)", [smsLockName]);
      smsLocked = false;
    }
    if (locked) {
      await conn.query("SELECT RELEASE_LOCK(?)", [lockName]);
      locked = false;
    }
    return res.status(result.httpStatus || 200).json(result.body || result);
  } catch (error) {
    if (conn && !committed)
      try {
        await conn.rollback();
      } catch { }
    const failure = bookingFailure(error);
    return res
      .status(failure.status)
      .json({ success: false, message: failure.message, error_code: failure.code });
  } finally {
    if (conn) {
      try {
        if (smsLocked) await conn.query("SELECT RELEASE_LOCK(?)", [smsLockName]);
        if (locked) await conn.query("SELECT RELEASE_LOCK(?)", [lockName]);
      } finally {
        conn.release();
      }
    }
  }
}
async function saveArthavidhiIdentity(conn, lan, identity) {
  await conn.query(`UPDATE ${TABLE} SET arthavidhi_capital_identity=? WHERE lan=?`, [
    JSON.stringify(identity),
    lan,
  ]);
}
function arthavidhiOtpHash(lan, mobile, otp) {
  const secret = process.env.OTP_HASH_PEPPER || process.env.JWT_SECRET;
  if (!secret) bad("Configure OTP_HASH_PEPPER before mobile verification", 503);
  return require("crypto")
    .createHmac("sha256", secret)
    .update(`${lan}:${mobile}:${otp}`)
    .digest("hex");
}
// Booking identity: mobile -> PAN -> Aadhaar. These update KYC, not credit/ops approval.
router.post("/:lan/identity/otp/send", authenticateUser, (req, res) =>
  arthavidhiIdentityRequest(req, res, async ({ conn, loan, lan, identity }) => {
    const mobile = String(req.body.mobile || "").trim();
    if (!/^[6-9]\d{9}$/.test(mobile)) bad("Enter a valid 10-digit mobile number");
    if (identity.mobile_verified_at) bad("Mobile is already verified for this application. Repeat verification and mobile changes are locked.",409);
    await requireUniqueArthavidhiMobile(conn,mobile,lan);
    if (req.body.consent !== true) bad("Customer consent is required before sending OTP");
    const missing = [
      "ALOT_API_URL",
      "ALOT_USER",
      "ALOT_PASSWORD",
      "SENDER_ID",
      "DLT_PEID",
      "MOBILE_OTP_TEMPLATE_ID",
    ].filter((key) => !process.env[key]);
    if (missing.length)
      bad(`Configure ${missing.join(", ")} before sending mobile OTP`, 503);
    const [[last]] = await conn.query(
      "SELECT TIMESTAMPDIFF(SECOND,created_at,UTC_TIMESTAMP()) AS elapsed FROM arthavidhi_capital_otp_sessions WHERE lan=? OR mobile_number=? ORDER BY id DESC LIMIT 1",
      [lan, mobile],
    );
    if (last && Number(last.elapsed) < 60)
      bad("Wait 60 seconds before requesting another OTP", 429);
    const otp = String(require("crypto").randomInt(100000, 1000000)),
      hash = arthavidhiOtpHash(lan, mobile, otp);
    let response;
    try {
      response = await require("axios").get(process.env.ALOT_API_URL, {
        params: {
          user: process.env.ALOT_USER,
          password: process.env.ALOT_PASSWORD,
          senderid: process.env.SENDER_ID,
          channel: "TRANS",
          DCS: "0",
          flashsms: "0",
          number: mobile,
          text: `OTP for mobile number verification is ${otp}. Do not share this OTP with anyone. Thanks & Regards Fintree Finance Private Limited.`,
          route: "5",
          DLTTemplateId: process.env.MOBILE_OTP_TEMPLATE_ID,
          PEID: process.env.DLT_PEID,
        },
        timeout: 15000,
      });
    } catch {
      bad("SMS provider is unavailable. OTP was not sent; retry later", 502);
    }
    if (
      !/success|^1701\b|^000\b/i.test(
        typeof response.data === "string" ? response.data : JSON.stringify(response.data),
      )
    )
      bad("SMS provider did not accept the OTP", 502);
    await conn.query(
      "INSERT INTO arthavidhi_capital_otp_sessions (lan,mobile_number,otp_hash,expires_at,created_at) VALUES (?,?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 5 MINUTE),UTC_TIMESTAMP())",
      [lan, mobile, hash],
    );
    const sameMobile = identity.mobile === mobile && req.body.restartIdentity !== true;
    const next = {
      ...(sameMobile ? identity : {}),
      required: true,
      mobile,
      consent_at: new Date().toISOString(),
      consent_version: "ARTHAVIDHI_IDENTITY_V1",
      consent_recorded_by: String(req.user.id ?? req.user.userId ?? req.user.user_id),
    };
    if (!sameMobile)
      await conn.query(
        "UPDATE kyc_verification_status SET pan_status='PENDING',aadhaar_status='PENDING',bureau_status='PENDING',aadhaar_transaction_id=NULL,aadhaar_unique_id=NULL,aadhaar_kyc_url=NULL WHERE lan=? AND applicant_type='BORROWER' AND party_no=1",
        [lan],
      );
    await saveArthavidhiIdentity(conn, lan, next);
    await conn.query(`UPDATE ${TABLE} SET mobile_number=? WHERE lan=?`, [
      mobile,
      loan.lan,
    ]);
    return {
      success: true,
      message: "OTP sent to the customer's mobile",
      expiresInSeconds: 300,
      resendAfterSeconds: 60,
    };
  }),
);
router.post("/:lan/identity/otp/verify", authenticateUser, (req, res) =>
  arthavidhiIdentityRequest(req, res, async ({ conn, lan, identity }) => {
    const mobile = String(req.body.mobile || ""),
      otp = String(req.body.otp || "");
    if (req.body.consent !== true || !/^\d{6}$/.test(otp) || mobile !== identity.mobile)
      bad("Enter the six-digit OTP for the current mobile and confirm customer consent");
    await requireUniqueArthavidhiMobile(conn,mobile,lan);
    if(identity.mobile_verified_at)return {success:true,message:"Mobile is already verified",mobileVerified:true};
    const [[session]] = await conn.query(
      "SELECT *,expires_at<=UTC_TIMESTAMP() AS expired FROM arthavidhi_capital_otp_sessions WHERE lan=? ORDER BY id DESC LIMIT 1 FOR UPDATE",
      [lan],
    );
    if (
      !session ||
      session.mobile_number !== mobile ||
      session.expired ||
      session.verified_at ||
      session.attempts >= 5
    )
      bad("OTP is expired, already used or locked. Request a new OTP", 409);
    const expected = Buffer.from(session.otp_hash, "hex"),
      supplied = Buffer.from(arthavidhiOtpHash(lan, mobile, otp), "hex");
    if (
      expected.length !== supplied.length ||
      !require("crypto").timingSafeEqual(expected, supplied)
    ) {
      await conn.query(
        "UPDATE arthavidhi_capital_otp_sessions SET attempts=attempts+1 WHERE id=?",
        [session.id],
      );
      return {
        httpStatus: 422,
        body: {
          success: false,
          message: "Incorrect OTP. A maximum of five attempts is allowed.",
        },
      };
    }
    await conn.query(
      "UPDATE arthavidhi_capital_otp_sessions SET verified_at=UTC_TIMESTAMP() WHERE id=?",
      [session.id],
    );
    await saveArthavidhiIdentity(conn, lan, {
      ...identity,
      mobile_verified_at: new Date().toISOString(),
    });
    return { success: true, message: "Mobile verified", mobileVerified: true };
  }),
);
router.post("/:lan/identity/pan", authenticateUser, (req, res) =>
  arthavidhiIdentityRequest(req, res, async ({ conn, loan, kyc, lan, identity }) => {
    if (!identity.mobile_verified_at || identity.mobile !== loan.mobile_number)
      bad("Verify mobile before PAN", 409);
    const pan = String(req.body.panNumber || "")
      .trim()
      .toUpperCase();
    if (!/^[A-Z]{5}\d{4}[A-Z]$/.test(pan)) bad("Enter a valid PAN");
    if (identity.pan && identity.pan !== pan)
      bad(
        "PAN is already verified. Restart mobile verification for an identity correction",
        409,
      );
    if (identity.pan === pan && kyc.pan_status === "VERIFIED")
      return {
        success: true,
        customerName: identity.pan_name,
        dob: identity.pan_dob || null,
        panVerified: true,
      };
    const [duplicate] = await conn.query(
      `SELECT lan FROM ${TABLE} WHERE pan_number=? AND lan<>? LIMIT 1`,
      [pan, lan],
    );
    if (duplicate.length) bad("Another Arthavidhi case already uses this PAN", 409);
    let result;
    try {
      result = await lookupArthavidhiPan(pan);
    } catch {
      bad("PAN provider is unavailable. Retry later", 502);
    }
    const verification = arthavidhiPanResult(result);
    if (!verification.success) {
      // Persist a failed attempt without advancing identity or the case. Only
      // safe diagnostic fields are returned; credentials/provider payloads stay private.
      const diagnostics = {
        provider: verification.provider,
        providerCode: verification.providerCode,
        providerHttpStatus: verification.providerHttpStatus,
        code: verification.code,
        responseShape: verification.responseShape,
        providerAttempts: verification.providerAttempts,
      };
      await conn.query(
        "INSERT INTO kyc_verification_status (lan,applicant_type,party_no,source_applicant_id,applicant_name,mobile_number,pan_number,pan_status,pan_api_response) VALUES (?,'BORROWER',1,?,?,?,?,'FAILED',?) ON DUPLICATE KEY UPDATE pan_number=VALUES(pan_number),pan_status='FAILED',pan_api_response=VALUES(pan_api_response)",
        [
          lan,
          loan.id,
          loan.customer_name,
          identity.mobile,
          pan,
          JSON.stringify(diagnostics),
        ],
      );
      console.warn("Arthavidhi PAN verification incomplete", diagnostics);
      return {
        httpStatus: verification.httpStatus,
        body: {
          success: false,
          message: verification.message,
          error_code: verification.code,
          provider: verification.provider,
          provider_code: verification.providerCode,
          provider_http_status: verification.providerHttpStatus,
          provider_attempts: verification.providerAttempts,
        },
      };
    }
    if (!verification.name)
      return {
        httpStatus: 502,
        body: {
          success: false,
          error_code: "PAN_PROFILE_MISSING",
          message:
            "PAN validity was confirmed but the provider did not return the holder name. Retry the provider lookup before proceeding.",
        },
      };
    const name = verification.name;
    await conn.query(
      "INSERT INTO kyc_verification_status (lan,applicant_type,party_no,source_applicant_id,applicant_name,mobile_number,pan_number,pan_status,pan_api_response) VALUES (?,'BORROWER',1,?,?,?,?,'VERIFIED',?) ON DUPLICATE KEY UPDATE applicant_name=VALUES(applicant_name),mobile_number=VALUES(mobile_number),pan_number=VALUES(pan_number),pan_status='VERIFIED',pan_api_response=VALUES(pan_api_response)",
      [
        lan,
        loan.id,
        name,
        identity.mobile,
        pan,
        JSON.stringify(result.response ?? result),
      ],
    );
    await conn.query(
      `UPDATE ${TABLE} SET customer_name=?,pan_number=?${verification.dob ? ",borrower_dob=?" : ""} WHERE lan=?`,
      [name, pan, ...(verification.dob ? [verification.dob] : []), lan],
    );
    await saveArthavidhiIdentity(conn, lan, {
      ...identity,
      pan,
      pan_name: name,
      pan_dob: verification.dob,
    });
    return {
      success: true,
      panVerified: true,
      customerName: name,
      dob: verification.dob,
      message: verification.dob
        ? "PAN verified. Name and date of birth fetched."
        : "PAN verified. Name fetched; the provider did not return DOB. Enter it or fetch it through Aadhaar DigiLocker.",
    };
  }),
);
router.post("/:lan/identity/aadhaar", authenticateUser, (req, res) =>
  arthavidhiIdentityRequest(req, res, async ({ conn, loan, kyc, lan, identity }) => {
    if (
      !identity.mobile_verified_at ||
      identity.mobile !== loan.mobile_number ||
      !identity.pan ||
      kyc.pan_status !== "VERIFIED" ||
      kyc.pan_number !== identity.pan
    )
      bad("Verify mobile and PAN before DigiLocker", 409);
    if (
      kyc.aadhaar_status === "VERIFIED" &&
      identity.aadhaar_pan === identity.pan &&
      identity.aadhaar_mobile === identity.mobile
    )
      return { success: true, status: "VERIFIED" };
    if (
      kyc.aadhaar_status === "INITIATED" &&
      kyc.aadhaar_kyc_url &&
      identity.aadhaar_pan === identity.pan &&
      identity.aadhaar_mobile === identity.mobile
    )
      return { success: true, status: "INITIATED", kycUrl: kyc.aadhaar_kyc_url };
    const missing = [
      "DIGITAP_CLIENT_ID",
      "DIGITAP_CLIENT_SECRET",
      "DIGITAP_BASE_URL",
      "AADHAAR_REDIRECT_URL",
    ].filter((key) => !process.env[key]);
    if (missing.length) bad(`Configure ${missing.join(", ")} before DigiLocker KYC`, 503);
    let result;
    try {
      result = await require("../../services/digitapaadharservice").initAadhaarKyc(
        lan,
        identity.mobile,
        loan.email || "",
        identity.pan_name || loan.customer_name,
      );
    } catch {
      bad("DigiLocker initiation is unavailable. Retry later", 502);
    }
    if (!result?.success || !result.kycUrl || !result.unifiedTransactionId)
      bad("DigiLocker did not return a valid KYC request", 502);
    if (new URL(result.kycUrl).protocol !== "https:")
      bad("DigiLocker returned an invalid link", 502);
    await conn.query(
      "UPDATE kyc_verification_status SET aadhaar_status='INITIATED',aadhaar_transaction_id=?,aadhaar_unique_id=?,aadhaar_kyc_url=? WHERE lan=? AND applicant_type='BORROWER' AND party_no=1",
      [result.unifiedTransactionId, result.uniqueId, result.kycUrl, lan],
    );
    await saveArthavidhiIdentity(conn, lan, {
      ...identity,
      aadhaar_pan: identity.pan,
      aadhaar_mobile: identity.mobile,
    });
    return { success: true, status: "INITIATED", kycUrl: result.kycUrl };
  }),
);
router.get("/:lan/identity", authenticateUser, (req, res) =>
  arthavidhiIdentityRequest(
    req,
    res,
    async ({ conn, loan, kyc, lan, identity }) => {
      const mobileVerified = Boolean(
        identity.mobile_verified_at && identity.mobile === loan.mobile_number,
      );
      const panVerified = Boolean(
        mobileVerified &&
        identity.pan &&
        identity.pan === loan.pan_number &&
        kyc.pan_status === "VERIFIED" &&
        kyc.pan_number === identity.pan,
      );
      let aadhaarRefresh = null;
      if (
        panVerified &&
        kyc.aadhaar_status === "INITIATED" &&
        kyc.aadhaar_transaction_id &&
        kyc.aadhaar_unique_id &&
        identity.aadhaar_pan === identity.pan &&
        identity.aadhaar_mobile === identity.mobile
      ) {
        let response;
        try {
          response =
            await require("../../services/digitapaadharservice").fetchAadhaarKycDetails(
              kyc.aadhaar_transaction_id,
            );
        } catch (error) {
          const httpStatus = Number(error.response?.status) || null;
          const pending = [404, 409, 425].includes(httpStatus);
          // A saved identity/link remains usable even if the vendor's result
          // endpoint is not ready. This is not a successful KYC verification.
          aadhaarRefresh = {
            success: false,
            code: pending ? "DIGITAP_RESULT_PENDING" : "DIGITAP_STATUS_UNAVAILABLE",
            provider_http_status: httpStatus,
            message: pending
              ? "DigiLocker result is not available yet. Complete the existing customer link, then fetch Aadhaar details."
              : [401, 403].includes(httpStatus)
                ? "Digitap rejected the status request authentication. The existing customer link is retained; check the provider configuration."
                : "Digitap status refresh is temporarily unavailable. The existing customer link is retained; retry Fetch Aadhaar Address later.",
          };
          console.error("Arthavidhi Aadhaar status refresh unavailable", {lan,code:error.code || aadhaarRefresh.code,provider_http_status:httpStatus});
        }
        const model = response?.model;
        if (Number(response?.code) === 200 && model) {
          if (
            String(model.uniqueId || model.uniqueid || "") !==
            String(kyc.aadhaar_unique_id)
          )
            bad(
              "Digitap returned a result for a different KYC request; status was not changed",
              502,
            );
          const dob = arthavidhiPanResult({
            success: true,
            response: { dob: model.dob },
          }).dob;
          const masked = String(
            model.maskedAdharNumber || model.maskedAadhaar || "",
          ).replace(/[\s-]/g, "");
          if (
            model.name &&
            dob &&
            /\d{4}$/.test(masked) &&
            model.address &&
            typeof model.address === "object"
          ) {
            const address = [
              model.address.house,
              model.address.street,
              model.address.loc,
              model.address.vtc,
              model.address.dist,
              model.address.state,
              model.address.pc,
            ]
              .filter(Boolean)
              .join(", ");
            const [[current]] = await conn.query(
              "SELECT aadhaar_status,aadhaar_transaction_id,aadhaar_unique_id FROM kyc_verification_status WHERE lan=? AND applicant_type='BORROWER' AND party_no=1 FOR UPDATE",
              [lan],
            );
            if (
              current?.aadhaar_transaction_id !== kyc.aadhaar_transaction_id ||
              current?.aadhaar_unique_id !== kyc.aadhaar_unique_id
            )
              bad("Aadhaar request changed while refreshing. Reload this case", 409);
            if (current.aadhaar_status !== "VERIFIED") {
              await conn.query(
                "UPDATE kyc_verification_status SET aadhaar_status='VERIFIED',aadhaar_name=?,aadhaar_dob=?,aadhaar_masked_number=?,aadhaar_address=?,aadhaar_api_response=?,updated_at=NOW() WHERE lan=? AND applicant_type='BORROWER' AND party_no=1 AND aadhaar_transaction_id=? AND aadhaar_unique_id=?",
                [
                  model.name,
                  dob,
                  `XXXXXXXX${masked.slice(-4)}`,
                  address,
                  JSON.stringify(response),
                  lan,
                  kyc.aadhaar_transaction_id,
                  kyc.aadhaar_unique_id,
                ],
              );
              await conn.query(
                "INSERT INTO arthavidhi_capital_audit (lan,event_type,actor_id,details) VALUES (?,'AADHAAR_STATUS_SYNCED',?,?)",
                [
                  lan,
                  String(req.user.id ?? req.user.userId ?? req.user.user_id),
                  JSON.stringify({ source: "DIGITAP_DETAILS", status: "VERIFIED" }),
                ],
              );
            }
            Object.assign(kyc, {
              aadhaar_status: "VERIFIED",
              aadhaar_name: model.name,
              aadhaar_dob: dob,
              aadhaar_masked_number: `XXXXXXXX${masked.slice(-4)}`,
              aadhaar_address: address,
              aadhaar_api_response: JSON.stringify(response),
            });
          }
        }
      }
      const aadhaarVerified = Boolean(
        panVerified &&
        kyc.aadhaar_status === "VERIFIED" &&
        identity.aadhaar_pan === identity.pan &&
        identity.aadhaar_mobile === identity.mobile,
      );
      const profile = aadhaarVerified ? arthavidhiAadhaarProfile(kyc) : null;
      const savedPan = panVerified
        ? arthavidhiPanResult({
          success: true,
          response: arthavidhiIdentity(kyc.pan_api_response),
        })
        : null;
      const panDob = panVerified
        ? identity.pan_dob || (savedPan?.success ? savedPan.dob : null) || null
        : null;
      // Drafts alone are autofilled. Submitted case terms/status are never changed by refresh.
      if (profile && String(loan.status).toLowerCase() === "draft") {
        const fields = Object.fromEntries(
          Object.entries({
            aadhaar_number: profile.aadhaar_number,
            borrower_dob: profile.dob,
            customer_address: profile.customer_address,
            customer_city: profile.customer_city,
            customer_state: profile.customer_state,
            customer_pincode: profile.customer_pincode,
          }).filter(([, value]) => value),
        );
        if (Object.keys(fields).length)
          await conn.query(
            `UPDATE ${TABLE} SET ${Object.keys(fields)
              .map((key) => `\`${key}\`=?`)
              .join(",")} WHERE lan=?`,
            [...Object.values(fields), lan],
          );
      }
      let kycUrl = null;
      try {
        if (new URL(kyc.aadhaar_kyc_url).protocol === "https:")
          kycUrl = kyc.aadhaar_kyc_url;
      } catch { }
      return {
        success: true,
        data: {
          mobileVerified,
          panVerified,
          aadhaarVerified,
          mobile: loan.mobile_number,
          pan: loan.pan_number,
          customerName: panVerified
            ? identity.pan_name
            : loan.customer_name === "Pending identity verification"
              ? ""
              : loan.customer_name,
          panDob,
          aadhaarStatus: kyc.aadhaar_status || "PENDING",
          aadhaarRefresh,
          kycUrl,
          profile,
        },
      };
    },
    { readOnly: true },
  ),
);

// BEGIN ARTHAVIDHI WORKFLOW
function registerArthavidhiWorkflow(router, { pullBureau } = {}) {
  const db = require("../../config/db");
  const auth = require("../../middleware/verifyToken");
  const {
    autoRunArthavidhiCapitalBreIfReady,
    evaluateStoredArthavidhiPolicy,
    readPolicyInputs,
  } = require("./ArthavidhiCapitalBRE");
  const { buildMonthlySchedule } = require("../../services/arthavidhiDailySchedule");
  const {
    fromArthavidhiBookingRecord,
    loadArthavidhiBookingEditability,
    loadArthavidhiCapitalAgreementStatus,
    loadArthavidhiCapitalMandateStatus,
    advanceArthavidhiSigningIfComplete,
    arthavidhiSigningErrorDetails,
  } = require("../../services/ArthavidhiCapitalAgreementStatus");
  const { releaseArthavidhiReservations } = require("../../services/arthavidhiRejection");
  const { sendArthavidhiWebhook } = require("./arthavidhiWebhook");
  const TABLE = "loan_booking_arthavidhi";
  const status = (v) =>
    String(v || "")
      .trim()
      .toLowerCase();
  const fail = (message, code = 400) => {
    throw Object.assign(new Error(message), { status: code });
  };
  function lanOf(req) {
    const lan = String(req.params.lan || "")
      .trim()
      .toUpperCase();
    if (!/^AVCL\d+$/.test(lan)) fail("Invalid Arthavidhi LAN");
    return lan;
  }
  function actorOf(req) {
    const id = req.user?.id ?? req.user?.userId ?? req.user?.user_id;
    if (id == null) fail("Authenticated staff identity required", 401);
    return String(id);
  }
  async function requireCreditPage(req,page) {
    if(status(req.user?.role)==="admin")return;
    const [grants]=await db.promise().query("SELECT p.id FROM pages p JOIN user_permissions up ON up.page_id=p.id WHERE up.user_id=? AND p.path=? LIMIT 1",[actorOf(req),"/arthavidhi-capital/"+page]);
    if(!grants.length)fail("Access to this Arthavidhi review screen has not been assigned to your user",403);
  }
  function requireHoActor(req) {
    const roles = String(process.env.ARTHAVIDHI_HO_ROLES || "HO,Head Office,HO Credit")
      .split(",")
      .map(status);
    if (!roles.includes(status(req.user?.role ?? req.user?.role_name)))
      fail(
        "An authorised HO role is required for Arthavidhi credit approval and policy exceptions",
        403,
      );
  }
  async function policyReport(conn, loan) {
    const [[report]] = await conn.query(
      "SELECT score,report_xml FROM loan_cibil_reports WHERE lan=? AND pan_number=? ORDER BY created_at DESC,id DESC LIMIT 1",
      [loan.lan, loan.pan_number ?? loan.pan_card],
    );
    return report;
  }
  function money(v, name, positive = false) {
    if (
      !/^\d+(?:\.\d{1,2})?$/.test(String(v ?? "")) ||
      !Number.isSafeInteger(Math.round(Number(v) * 100)) ||
      Number(v) < 0 ||
      (positive && Number(v) === 0)
    )
      fail(`Invalid ${name}`);
    return Number(v);
  }
  const wrap = (fn) => async (req, res) => {
    try {
      await fn(req, res);
    } catch (e) {
      if (!e.status)
        console.error("Arthavidhi workflow failed", { code: e.code || "INTERNAL_ERROR" });
      res
        .status(e.status || 500)
        .json({
          success: false,
          message: e.status ? e.message : "Unable to process Arthavidhi request",
        });
    }
  };
  async function transact(fn) {
    const conn = await db.promise().getConnection();
    let result;
    try {
      await conn.beginTransaction();
      result = await fn(conn);
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
    // A decision may return its notification; send after commit and release.
    if (typeof result === "function") await result();
    return result;
  }
  async function locked(conn, lan) {
    const [[loan]] = await conn.query(`SELECT * FROM ${TABLE} WHERE lan=? FOR UPDATE`, [
      lan,
    ]);
    if (!loan) fail("Loan not found", 404);
    return fromArthavidhiBookingRecord(loan);
  }
  async function audit(conn, lan, event, actor, details) {
    await conn.query(
      "INSERT INTO arthavidhi_capital_audit (lan,event_type,actor_id,details) VALUES (?,?,?,?)",
      [lan, event, actor, JSON.stringify(details)],
    );
  }

  // Staff endpoints use the helpers above directly; no second registration layer.
  const queues = {
    "all-loans": [],
    "partner-credit-loans": ["bre_approved"],
    "credit-screen-loans": ["partner_approved"],
    "final-details-loans": ["credit_approved"],
    "signing-loans": ["credit_approved", "signing_pending"],
    "ops-maker-loans": ["ops_initiate"],
    "ops-checker-loans": ["approved", "disburse_initiate"],
    "disbursed-loans": ["disbursed"],
  };
  for (const [path, statuses] of Object.entries(queues)) {
    router.get(
      `/${path}`,
      auth,
      wrap(async (req, res) => {
        if(path==="partner-credit-loans")await requireCreditPage(req,"partner-credit");
        if(path==="credit-screen-loans")await requireCreditPage(req,"credit-team");
        const page = Number(req.query.page || 1),
          pageSize = Number(req.query.pageSize || 50);
        if (
          !Number.isSafeInteger(page) ||
          page < 1 ||
          !Number.isInteger(pageSize) ||
          pageSize < 1 ||
          pageSize > 200 ||
          !Number.isSafeInteger((page - 1) * pageSize)
        )
          fail("Invalid pagination");
        const search = String(req.query.search || "").trim();
        if (search.length > 100) fail("Search is too long");
        const columns = new Set([
          "lan",
          "login_date",
          "customer_name",
          "loan_amount",
          "status",
        ]);
        const sort = columns.has(req.query.sortBy) ? req.query.sortBy : "lan";
        const direction = status(req.query.sortDir) === "asc" ? "ASC" : "DESC";
        let where = "WHERE lan LIKE 'AVCL%'";
        const params = [];
        if (statuses.length) {
          where += " AND LOWER(TRIM(status)) IN (?)";
          params.push(statuses);
        }
        if (path === "partner-credit-loans") {
          where += " AND UPPER(TRIM(aml_status))='PROCEED' AND UPPER(TRIM(arthavidhi_capital_bre_status))='BRE APPROVED'";
          where += " AND CASE WHEN JSON_VALID(arthavidhi_capital_policy_result) THEN JSON_UNQUOTE(JSON_EXTRACT(arthavidhi_capital_policy_result,'$.eligible'))='true' AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(arthavidhi_capital_policy_result,'$.synthetic')),'false')<>'true' ELSE false END";
          where += " AND EXISTS (SELECT 1 FROM kyc_verification_status k WHERE k.lan="+TABLE+".lan AND k.applicant_type='BORROWER' AND k.party_no=1 AND UPPER(TRIM(k.bureau_status))='VERIFIED')";
        }
        if (search) {
          where +=
            " AND (lan LIKE ? OR customer_name LIKE ? OR mobile_number LIKE ? OR partner_loan_id LIKE ?)";
          params.push(...Array(4).fill(`%${search}%`));
        }
        await advanceArthavidhiSigningIfComplete(db.promise());
        const [[count]] = await db
          .promise()
          .query(`SELECT COUNT(*) AS total FROM ${TABLE} ${where}`, params);
        const [rows] = await db
          .promise()
          .query(
            `SELECT * FROM ${TABLE} ${where} ORDER BY ${sort} ${direction},lan ${direction} LIMIT ? OFFSET ?`,
            [...params, pageSize, (page - 1) * pageSize],
          );
        const enriched = await loadArthavidhiCapitalMandateStatus(
          db.promise(),
          await loadArthavidhiCapitalAgreementStatus(
            db.promise(),
            await loadArthavidhiBookingEditability(db.promise(), rows),
          ),
        );
        res.json({
          rows: enriched,
          pagination: { page, pageSize, total: Number(count.total) },
          filters: { statuses, search },
        });
      }),
    );
  }
  router.get(
    "/customer-details/:lan",
    auth,
    wrap(async (req, res) => {
      const lan = lanOf(req);
      const [[loan]] = await db
        .promise()
        .query(`SELECT * FROM ${TABLE} WHERE lan=?`, [lan]);
      if (!loan) fail("Loan not found", 404);
      const [kyc] = await db
        .promise()
        .query(
          "SELECT applicant_type,party_no,pan_status,aadhaar_status,bureau_status,applicant_name,aadhaar_name,aadhaar_dob,aadhaar_masked_number,aadhaar_address FROM kyc_verification_status WHERE lan=?",
          [lan],
        );
      const [repayments] = await db
        .promise()
        .query(
          "SELECT * FROM manual_rps_arthavidhi_capital WHERE lan=? ORDER BY due_date,id",
          [lan],
        );
      const [enriched] = await loadArthavidhiCapitalMandateStatus(
        db.promise(),
        await loadArthavidhiCapitalAgreementStatus(
          db.promise(),
          await loadArthavidhiBookingEditability(db.promise(), [loan]),
        ),
      );
      res.json({
        success: true,
        data: {
          ...enriched,
          kyc,
          repayments,
          check_configuration: arthavidhiCheckConfiguration(),
          tenure_unit: enriched.tenure_unit || "unconfirmed",
          repayment_frequency: enriched.repayment_frequency || "unconfirmed",
        },
      });
    }),
  );
  router.get(
    "/:lan/completion-status",
    auth,
    wrap(async (req, res) => {
      const lan = lanOf(req);
      await advanceArthavidhiSigningIfComplete(db.promise(), lan);
      const [[storedLoan]] = await db
        .promise()
        .query(`SELECT * FROM ${TABLE} WHERE lan=?`, [lan]);
      const loan = fromArthavidhiBookingRecord(storedLoan);
      if (!loan) fail("Loan not found", 404);
      const [current] = await loadArthavidhiCapitalMandateStatus(
        db.promise(),
        await loadArthavidhiCapitalAgreementStatus(db.promise(), [loan]),
      );
      res.json({
        success: true,
        data: {
          lan,
          status: current.status,
          agreement_esign_status: current.agreement_esign_status,
          agreement_sign_url: current.agreement_sign_url,
          agreement_esign_document_id: current.agreement_esign_document_id,
          agreement_esign_can_send: current.agreement_esign_can_send,
          mandate_status: current.mandate_status,
          mandate_umrn: current.mandate_umrn,
          mandate_document_id: current.mandate_document_id,
          mandate_amount: current.mandate_amount,
          mandate_auth_url: current.mandate_auth_url,
          mandate_ready: current.mandate_ready,
          mandate_can_send: current.mandate_can_send,
          mandate_block_reason: current.mandate_block_reason,
        },
      });
    }),
  );
  // Customer completion: agreement and mandate statuses are separate from loan.status.
  router.post(
    "/:lan/esign",
    auth,
    wrap(async (req, res) => {
      const lan = lanOf(req);
      actorOf(req);
      try {
        const { initDoqfyEsign } = require("../../services/doqfyEsignService");
        const result = await initDoqfyEsign(lan, "AGREEMENT");
        if (result.already_initiated)
          return res.json({
            ...result,
            message:
              "Agreement request already exists. Use the saved signing link or refresh its status.",
          });
        let notification = {
          status: "PENDING",
          message: "Signing link is not available yet. Refresh the agreement status.",
        };
        if (result.sign_url) {
          try {
            const [[customer]] = await db
              .promise()
              .query(`SELECT customer_name,email FROM ${TABLE} WHERE lan=?`, [lan]);
            const { sendAgreementSigningMail } = require("../../jobs/mailer");
            notification = await sendAgreementSigningMail({
              to: customer?.email,
              customerName: customer?.customer_name,
              lan,
              signUrl: result.sign_url,
            });
          } catch (error) {
            console.error("Arthavidhi signing notification failed", {
              code: error.code || "SIGNING_EMAIL_FAILED",
            });
            notification = {
              status: "FAILED",
              message:
                "Agreement created, but email delivery failed. Check the customer's email and SMTP configuration; share the saved signing link with the customer.",
            };
          }
        }
        res.json({
          ...result,
          notification,
          message:
            notification.status === "SENT"
              ? "Agreement signing link emailed to the customer. Awaiting customer signature."
              : notification.message,
        });
      } catch (e) {
        const details = arthavidhiSigningErrorDetails(e);
        if (e.status) return res.status(e.status).json({success:false,message:details.reason || "Agreement validation failed.",error_code:e.code || "ESIGN_VALIDATION_FAILED",step:e.arthavidhi_step || "agreement_validation",error_details:details});
        if (/template.*not found|ENOENT/i.test(e.message))
          return res.status(503).json({success:false,error_code:"AGREEMENT_TEMPLATE_MISSING",message:"Arthavidhi agreement template is missing. Add the approved customer loan agreement template and configure ARTHAVIDHI_CAPITAL_AGREEMENT_TEMPLATE before sending e-sign."});
        console.error("Arthavidhi agreement initiation failed", {lan,code:e.code || "ESIGN_INITIATION_FAILED"});
        const messages = {
          loan_lookup: "Unable to load the Arthavidhi case for agreement signing.",
          signer_details: "Customer name and mobile or email are required for the agreement signer.",
          agreement_pdf: "Agreement PDF could not be generated. Check the template, saved terms and backend PDF renderer.",
          pdf_file: "Generated agreement PDF could not be read from backend uploads.",
          provider_order: "Doqfy could not create the signing order. Check its response in the backend terminal.",
          esign_persistence: "The signing order reached the database-save step, but saving it failed. Check provider orders before retrying to avoid a duplicate.",
          booking_update: "The signing request was stored, but updating the case failed. Refresh the existing request before sending again.",
        };
        const summary = messages[e.arthavidhi_step] || "Unable to initiate agreement signing.";
        return res.status(502).json({success:false,message:details.reason ? `${summary} Reason: ${details.reason}` : summary,error_code:e.code || "ESIGN_INITIATION_FAILED",step:e.arthavidhi_step || "agreement_initiation",provider_http_status:e.provider_http_status || null,error_details:details});
      }
    }),
  );
  // Prepare saved terms only; the frontend sends them to the existing eNACH route.
  router.post("/:lan/mandate-details", auth, wrap(async (req, res) => {
      const lan = lanOf(req);
      actorOf(req);
      const conn = await db.promise().getConnection();
      const lockName = `avcl-mandate:${lan}`;
      let acquired = false;
      try {
        const [[lock]] = await conn.query("SELECT GET_LOCK(?,0) AS acquired", [lockName]);
        acquired = Number(lock?.acquired) === 1;
        if (!acquired)
          fail("Mandate initiation is already processing. Refresh its status.", 409);
        const [[storedLoan]] = await conn.query(`SELECT * FROM ${TABLE} WHERE lan=?`, [
          lan,
        ]);
        const loan = fromArthavidhiBookingRecord(storedLoan);
        if (!loan) fail("Loan not found", 404);
        if (!["signing_pending", "ops_initiate", "approved"].includes(status(loan.status)))
          fail("Save final loan details before initiating the mandate", 409);
        const [current] = await loadArthavidhiCapitalMandateStatus(conn, [loan]);
        if (!current.mandate_can_send)
          return res.json({
            success: true,
            already_initiated: true,
            message: current.mandate_ready
              ? "Mandate is already active"
              : "Mandate request already exists; open the authorisation link or refresh its status",
            data: {
              mandate_status: current.mandate_status,
              mandate_auth_url: current.mandate_auth_url,
            },
          });
        const today = new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Kolkata",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date());
        const todayDate = new Date(`${today}T00:00:00Z`);
        const defaultCollection = new Date(
          Date.UTC(todayDate.getUTCFullYear(), todayDate.getUTCMonth() + 1, 5),
        )
          .toISOString()
          .slice(0, 10);
        const start = String(req.body?.start_date || defaultCollection);
        const startAt = new Date(`${start}T00:00:00Z`);
        if (
          !/^\d{4}-\d{2}-\d{2}$/.test(start) ||
          !Number.isFinite(startAt.getTime()) ||
          startAt.toISOString().slice(0, 10) !== start ||
          start < today
        )
          fail("Mandate start date must be today or later");
        if (startAt.getUTCDate() !== 5)
          fail("Monthly mandate collection date must be the 5th");
        const endAt = new Date(startAt);
        endAt.setUTCMonth(endAt.getUTCMonth() + Number(loan.loan_tenure) - 1);
        const schedule = buildMonthlySchedule(
          loan.loan_amount,
          loan.interest_rate,
          loan.loan_tenure,
          start,
        );
        const amount = Math.max(...schedule.rpsData.map((r) => r.emi));
        const accountType = String(req.body?.account_type || "savings").toLowerCase();
        if (!["savings", "current"].includes(accountType))
          fail("Account type must be savings or current");
        if (
          !loan.account_number ||
          !loan.ifsc ||
          !loan.name_in_bank ||
          !loan.mobile_number
        )
          fail(
            "Complete final bank details and customer mobile before mandate initiation",
            409,
          );

        res.json({success:true,data:{
          lan,customer_identifier:loan.mobile_number,amount,
          start_date:start,end_date:endAt.toISOString().slice(0,10),
          frequency:"monthly",account_type:accountType,account_no:loan.account_number,
          ifsc:loan.ifsc,name_in_bank:loan.name_in_bank,bank_name:loan.bank_name,
        }});
      } finally {
        try {
          if (acquired) await conn.query("SELECT RELEASE_LOCK(?)", [lockName]);
        } finally {
          conn.release();
        }
      }
    }));
  // Eligibility: the BRE module owns loan status changes after bureau/AML checks.
  router.post(
    "/:lan/run-bre",
    auth,
    wrap(async (req, res) => {
      const actor = actorOf(req),
        lan = lanOf(req);
      if (req.body?.assessment) {
        const input = req.body.assessment;
        if (!input || typeof input !== "object" || Array.isArray(input))
          fail("Invalid policy assessment");
        const numeric = new Set([
          "proposed_loan_amount",
          "business_vintage_years",
          "monthly_revenue",
          "rented_business_stability_years",
          "bank_statement_months",
          "inward_cheque_return_percent",
          "outward_cheque_return_percent",
          "average_bank_balance",
          "minimum_daily_bank_balance",
          "assessed_monthly_income",
          "existing_monthly_obligations",
          "residence_business_distance_km",
          "tenure_months",
          "proposed_interest_rate",
          "disbursements_against_enquiries_6m",
          "ho_foir_limit_percent",
          "ho_deviation_amount_cap",
          "bureau_enquiries_6m",
          "bureau_unsecured_bl_pl_enquiries_3m",
        ]);
        const booleans = new Set([
          "micro_small_business_verified",
          "owned_residence",
          "owned_business_premises",
          "co_borrower_verified",
          "applicable_co_applicants_verified",
          "clean_minor_bureau_verified",
          "business_manager_approval_verified",
          "independent_income_assessment_verified",
          "business_verification_documents_verified",
          "ownership_proof_verified",
          "field_investigation_verified",
          "location_risk_review_verified",
          "applicant_and_related_party_kyc_verified",
          "applicable_business_licences_verified",
          "business_end_use",
          "enquiry_disbursements_verified",
          "ho_foir_reviewed",
          "ho_distance_reviewed",
          "ho_six_month_bank_reviewed",
          "ho_risk_grade_reviewed",
          "ho_llp_documentation_reviewed",
          "bureau_history_review_verified",
          "bureau_dpd_60_plus_12m",
          "bureau_dpd_90_plus_24m",
          "bureau_any_write_off",
          "bureau_any_settlement",
          "bureau_any_suit_filed",
          "bureau_restructured_3y",
        ]);
        const strings = new Set([
          "industry",
          "bank_account_type",
          "risk_grade",
          "verification_notes",
          "ho_review_notes",
        ]);
        await transact(async (conn) => {
          const loan = await locked(conn, lan);
          if (
            ![
              "login",
              "bre_approved",
              "credit initiated",
              "policy_review",
              "aml_review",
            ].includes(status(loan.status))
          )
            fail("Assessment is locked after credit decision", 409);
          const stored = readPolicyInputs(loan.arthavidhi_capital_policy_inputs),
            updated = { ...stored };
          let hoChanged = false, assessmentChanged = false;
          for (const [key, value] of Object.entries(input)) {
            if (!numeric.has(key) && !booleans.has(key) && !strings.has(key))
              fail(`Unsupported assessment field: ${key}`);
            let clean = value;
            if (numeric.has(key)) {
              if (value === "" || value == null) clean = null;
              else {
                clean = Number(value);
                if (!Number.isFinite(clean) || clean < 0) fail(`Invalid ${key}`);
              }
            }
            if (booleans.has(key) && typeof value !== "boolean") fail(`Invalid ${key}`);
            if (strings.has(key)) {
              if (typeof value !== "string" || value.length > 2000)
                fail(`Invalid ${key}`);
              clean = value.trim();
            }
            if (
              key.startsWith("ho_") &&
              JSON.stringify(clean) !==
              JSON.stringify(
                stored[key] ??
                (booleans.has(key) ? false : numeric.has(key) ? null : ""),
              )
            ) {
              requireHoActor(req);
              hoChanged = true;
            }
            if(!key.startsWith("ho_")&&JSON.stringify(clean)!==JSON.stringify(stored[key]))assessmentChanged=true;
            updated[key] = clean;
          }
          if(assessmentChanged&&!hoChanged)for(const key of Object.keys(updated))if(key.startsWith("ho_")||key==="business_manager_approval_verified")delete updated[key];
          if (hoChanged) {
            if (!String(updated.ho_review_notes || "").trim())
              fail("HO review notes are required");
            updated.ho_review_by = actor;
            updated.ho_review_at = new Date().toISOString();
          }
          if (!String(updated.verification_notes || "").trim())
            fail("Record the documents and evidence checked in verification notes");
          await conn.query(
            `UPDATE ${TABLE} SET arthavidhi_capital_policy_inputs=? WHERE lan=?`,
            [JSON.stringify(updated), lan],
          );
          await audit(conn, lan, "POLICY_ASSESSMENT_SAVED", actor, {
            fields: Object.keys(input),
            ho_review: hoChanged,
          });
        });
      }
      const result = await autoRunArthavidhiCapitalBreIfReady(lanOf(req));
      if (result.status === "NOT_FOUND") fail("Loan not found", 404);
      res.json({ success: true, data: result });
    }),
  );
  router.post(
    "/:lan/retry-bureau",
    auth,
    wrap(async (req, res) => {
      const lan = lanOf(req);
      actorOf(req);
      const [[storedLoan]] = await db
        .promise()
        .query(`SELECT * FROM ${TABLE} WHERE lan=?`, [lan]);
      const loan = fromArthavidhiBookingRecord(storedLoan);
      if (!loan) fail("Loan not found", 404);
      const technicalRejection =
        status(loan.status) === "bre_rejected" &&
        String(loan.arthavidhi_capital_bre_reason || loan.bre_reason || "").trim() ===
        "bureau_score is required";
      if (
        ![
          "login",
          "bre_approved",
          "credit initiated",
          "policy_review",
          "aml_review",
        ].includes(status(loan.status)) &&
        !technicalRejection
      )
        fail("Bureau cannot be rerun after a policy rejection or credit decision", 409);
      if (technicalRejection)
        await transact(async (conn) => {
          const current = await locked(conn, lan);
          if (
            status(current.status) !== "bre_rejected" ||
            String(
              current.arthavidhi_capital_bre_reason || current.bre_reason || "",
            ).trim() !== "bureau_score is required"
          )
            fail("Case status changed. Refresh before retrying.", 409);
          const {
            restoreArthavidhiReservations,
          } = require("../../services/arthavidhiRejection");
          await restoreArthavidhiReservations(conn, current);
          await conn.query(
            `UPDATE ${TABLE} SET status='Login',stage='Login' WHERE lan=?`,
            [lan],
          );
          await audit(conn, lan, "BUREAU_TECHNICAL_RETRY", actorOf(req), {
            reason: "Missing provider score",
          });
        });
      const bureau = await pullBureau(lan, loan);
      const bre =
        bureau.status !== "VERIFIED"
          ? {
            status: "PENDING",
            code: bureau.code,
            reason:
              bureau.message ||
              "Bureau check has not completed. Credit eligibility remains pending.",
          }
          : await autoRunArthavidhiCapitalBreIfReady(lan);
      res.json({
        success: bureau.status === "VERIFIED",
        message: bureau.message,
        data: { bureau, bre },
      });
    }),
  );
  router.post(
    "/:lan/aml-screening",
    auth,
    wrap(async (req, res) => {
      const lan = lanOf(req);
      actorOf(req);
      const [[loan]] = await db
        .promise()
        .query(`SELECT status FROM ${TABLE} WHERE lan=?`, [lan]);
      if (!loan) fail("Loan not found", 404);
      if (
        ![
          "login",
          "bre_approved",
          "credit initiated",
          "policy_review",
          "aml_review",
          "credit_approved",
          "ops_initiate",
        ].includes(status(loan.status))
      )
        fail("AML screening is locked at this stage", 409);
      const result = await runArthavidhiAml(lan, { retry: true });
      const bre = result.success
        ? await autoRunArthavidhiCapitalBreIfReady(lan)
        : { status: "PENDING", reason: result.reason };
      res
        .status(result.success ? 200 : 503)
        .json({
          success: result.success,
          message: result.reason,
          data: { ...result, bre },
        });
    }),
  );
  // Partner review is a separate hand-off; booking identity/profile remain immutable.
  router.patch("/:lan/partner-review-decision",auth,wrap(async(req,res)=>{
    await requireCreditPage(req,"partner-credit");
    const lan=lanOf(req),actor=actorOf(req),decision=status(req.body?.decision),reason=String(req.body?.reason||"").trim();
    if(!["approve","reject","save"].includes(decision))fail("Choose approve, reject or save");
    if(reason.length>2000||(decision==="reject"&&!reason))fail("A rejection reason is required (maximum 2000 characters)");
    let nextStatus="bre_approved";
    await transact(async conn=>{
      const loan=await locked(conn,lan);
      if(status(loan.status)!=="bre_approved")fail("Partner review is available only after BRE approval and before partner hand-off",409);
      const originalPolicy=readPolicyInputs(loan.arthavidhi_capital_policy_result);
      if(originalPolicy.eligible!==true||!String(loan.arthavidhi_capital_bre_status||"").toUpperCase().startsWith("BRE APPROVED"))fail("An approved BRE result is required for partner review",409);
      if(decision!=="reject"){
        const [[kyc]]=await conn.query("SELECT bureau_status FROM kyc_verification_status WHERE lan=? AND applicant_type='BORROWER' AND party_no=1 LIMIT 1",[lan]);
        const blockers=[];
        if(originalPolicy.synthetic===true||String(kyc?.bureau_status||"").toUpperCase()!=="VERIFIED")blockers.push("Bureau verification is incomplete; complete the provider bureau check");
        if(String(loan.aml_status||"").toUpperCase()!=="PROCEED")blockers.push("AML has not cleared: "+(loan.aml_reason||loan.aml_status||"PENDING"));
        if(blockers.length)fail("Case cannot proceed to Partner Credit: "+blockers.join("; "),409);
      }
      if(decision==="reject"){
        nextStatus="partner_rejected";
        await conn.query("UPDATE loan_booking_arthavidhi SET status=?,stage=?,updated_by=? WHERE lan=?",[nextStatus,nextStatus,actor,lan]);
        await releaseArthavidhiReservations(conn,lan);
        await audit(conn,lan,"PARTNER_CREDIT_REJECTED",actor,{reason});return;
      }
      const terms=req.body?.terms||{};
      if(typeof terms!=="object"||Array.isArray(terms)||Object.keys(terms).some(key=>!["loan_amount","loan_tenure","interest_rate","processing_fee"].includes(key)))fail("Only loan amount, tenure, interest rate and processing fee can be changed during partner review");
      const amount=money(terms.loan_amount??loan.loan_amount??loan.requested_amount,"loan_amount",true);
      const rate=money(terms.interest_rate??loan.interest_rate??loan.interest,"interest_rate");
      const fee=money(terms.processing_fee??loan.processing_fee??0,"processing_fee");
      const tenure=Number(terms.loan_tenure??loan.loan_tenure),band=amount<=25000?[6,12]:amount<=50000?[9,18]:[12,18];
      if(amount<10000||amount>100000||amount>Number(loan.requested_amount)||amount>Number(loan.arthavidhi_capital_final_offer??originalPolicy.eligibleAmount??loan.requested_amount))fail("Partner amount must be within the booked amount and approved BRE offer",409);
      if(!Number.isInteger(tenure)||tenure<band[0]||tenure>band[1])fail("Tenure is outside the amount band",409);
      if(rate>100||fee>=amount)fail("Invalid interest rate or processing fee",409);
      buildMonthlySchedule(amount,rate,tenure,"2026-01-01");
      nextStatus=decision==="approve"?"partner_approved":"bre_approved";
      const review={reviewed_by:actor,reviewed_at:new Date().toISOString(),decision,reason,approved_amount:amount,terms:{loan_amount:amount,loan_tenure:tenure,interest_rate:rate,processing_fee:fee}};
      await conn.query("UPDATE loan_booking_arthavidhi SET loan_amount=?,loan_tenure=?,interest=?,processing_fee=?,status=?,stage=?,arthavidhi_capital_policy_result=?,updated_by=? WHERE lan=?",[amount,tenure,rate,fee,nextStatus,nextStatus,JSON.stringify({...originalPolicy,partner_review:review}),actor,lan]);
      await audit(conn,lan,decision==="approve"?"PARTNER_CREDIT_APPROVED":"PARTNER_TERMS_SAVED",actor,{reason,previous:{loan_amount:loan.loan_amount,loan_tenure:loan.loan_tenure,interest:loan.interest_rate,processing_fee:loan.processing_fee},terms:review.terms});
    });
    res.json({success:true,data:{lan,status:nextStatus}});
  }));
  // Credit Team decision: writes credit_approved or credit_rejected below.
  router.patch(
    "/:lan/credit-decision",
    auth,
    wrap(async (req, res) => {
      await requireCreditPage(req,"credit-team");
      const lan = lanOf(req),
        actor = actorOf(req),
        decision = status(req.body?.decision);
      if (!["approved", "approve", "rejected", "reject"].includes(decision))
        fail("decision must be approved or rejected");
      const approved = ["approved", "approve"].includes(decision);
      const reason = String(req.body?.reason || "").trim();
      if (!approved && !reason) fail("Rejection reason required");
      if (reason.length > 2000) fail("Reason exceeds 2000 characters");
      await transact(async (conn) => {
        const loan = await locked(conn, lan);
        if (
          !["partner_approved"].includes(
            status(loan.status),
          )
        )
          fail("Case must be in the pre-credit review queue", 409);
        // Credit Team records its manual review; provider/BRE facts are not rewritten.
        const policy = readPolicyInputs(loan.arthavidhi_capital_policy_result);
        if (approved && Object.keys(policy).length) {
          await conn.query(
            `UPDATE ${TABLE} SET arthavidhi_capital_policy_result=? WHERE lan=?`,
            [JSON.stringify({
              ...policy,
              ho_approved_by: actor,
              ho_approval_notes: reason,
              ho_approved_at: new Date().toISOString(),
              credit_decision_mode: "MANUAL_REVIEW",
            }), lan],
          );
        }
        await conn.query(
          `UPDATE ${TABLE} SET status=?,stage=?,credit_decision_by=?,credit_decision_reason=? WHERE lan=?`,
          [
            approved ? "credit_approved" : "credit_rejected",
            approved ? "credit_approved" : "credit_rejected",
            actor,
            reason,
            lan,
          ],
        );
        await audit(conn, lan, approved ? "CREDIT_APPROVED" : "CREDIT_REJECTED", actor, {
          reason, decision_mode: "MANUAL_REVIEW", bre_status: loan.arthavidhi_capital_bre_status, aml_status: loan.aml_status, synthetic_bureau: policy.synthetic === true,
        });
        if (!approved) await releaseArthavidhiReservations(conn, lan);
        return () => sendArthavidhiWebhook(lan,approved ? "CREDIT_APPROVED" : "CREDIT_REJECTED",{
          external_ref_no:loan.partner_loan_id,reject_reason:approved ? null : reason,
        });
      });
      res.json({
        success: true,
        data: { lan, status: approved ? "credit_approved" : "credit_rejected" },
      });
    }),
  );
  // Final terms stay in the signing queue until agreement AND mandate complete.
  router.patch(
    "/:lan/final-details",
    auth,
    wrap(async (req, res) => {
      const lan = lanOf(req),
        actor = actorOf(req),
        body = req.body || {};
      const amount = money(body.loan_amount, "loan_amount", true),
        rate = money(body.interest ?? body.interest_rate, "interest");
      const feePercent =
        body.processing_fee_percent == null || body.processing_fee_percent === ""
          ? 0
          : money(body.processing_fee_percent, "processing_fee_percent");
      if (feePercent > 100) fail("processing_fee_percent must be between 0 and 100");
      const fee =
        body.processing_fee == null || body.processing_fee === ""
          ? Math.round(amount * feePercent) / 100
          : money(body.processing_fee, "processing_fee");
      const insurance = money(body.insurance_amount ?? 0, "insurance_amount");
      const preEmi = money(
        body.pre_emi_interest ?? body.pre_emi_interest_amount ?? 0,
        "pre_emi_interest",
      );
      const netDisbursement = Math.round((amount - fee - insurance - preEmi) * 100) / 100;
      const umrn = String(body.umrn ?? "")
        .trim()
        .toUpperCase();
      if (umrn.length > 50) fail("umrn must be 50 characters or less");
      const customerEmail = String(body.email ?? "")
        .trim()
        .toLowerCase();
      if (customerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail))
        fail("Invalid customer email");
      const tenure = Number(body.loan_tenure);
      if (!Number.isInteger(tenure) || tenure < 6 || tenure > 18)
        fail("loan_tenure must contain 6-18 months");
      if (rate > 100) fail("interest must be between 0 and 100");
      const bank = {
        bank_name: String(body.bank_name || "").trim(),
        name_in_bank: String(body.name_in_bank || "").trim(),
        account_number: String(body.account_number || "").trim(),
        ifsc: String(body.ifsc || "")
          .trim()
          .toUpperCase(),
      };
      if (
        !bank.bank_name ||
        !bank.name_in_bank ||
        !/^\d{6,25}$/.test(bank.account_number) ||
        !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(bank.ifsc)
      )
        fail("Valid bank details required");
      if (netDisbursement <= 0)
        fail(
          "Processing fee, insurance and pre-EMI interest combined must be less than loan amount",
        );
      const date = String(body.sanction_date ?? body.agreement_date ?? "");
      const schedule = buildMonthlySchedule(amount, rate, tenure, date);
      await transact(async (conn) => {
        const loan = await locked(conn, lan);
        const partnerReview=readPolicyInputs(loan.arthavidhi_capital_policy_result).partner_review;
        if(Number(partnerReview?.approved_amount)>0&&amount>Number(partnerReview.approved_amount))fail("Final amount exceeds the partner-reviewed amount",409);
        if (status(loan.status) !== "credit_approved")
          fail("Case must be credit_approved before final details", 409);
        const offer = Number(loan.arthavidhi_capital_final_offer);
        const requested = Number(loan.requested_amount ?? loan.loan_amount);
        if (!Number.isFinite(requested) || requested <= 0)
          fail("A valid booked requested amount is required before final details", 409);
        if (amount > requested)
          fail("Approved amount cannot exceed the booked requested amount", 409);
        if (Number.isFinite(offer) && offer > 0 && amount > offer)
          fail(`Approved amount cannot exceed the BRE offer of INR ${offer}`, 409);
        if (amount < 10000 || amount > 100000)
          fail("Loan amount must be between 10,000 and 1,00,000");
        const tenureBand = amount <= 25000 ? [6, 12] : amount <= 50000 ? [9, 18] : [12, 18];
        if (tenure < tenureBand[0] || tenure > tenureBand[1])
          fail(`For INR ${amount}, tenure must be ${tenureBand[0]}-${tenureBand[1]} months`);
        const approval = readPolicyInputs(loan.arthavidhi_capital_policy_result);
        // Like Ya Money, this endpoint saves terms for an already credit-stage
        // case. A manually staged UAT case can prepare customer authorisation
        // without manufacturing an approved offer or a successful policy result.
        // Existing real approvals are rechecked against changed financial terms;
        // payout retains its policy/KYC/AML gates after manual operations review.
        if (approval.eligible === true && approval.ho_approved_by) {
          const evaluation = evaluateStoredArthavidhiPolicy(
            loan,
            await policyReport(conn, loan),
            { hoApproval: true, finalTerms: { loan_amount: amount, loan_tenure: tenure, interest_rate: rate } },
          );
          if (!evaluation.eligible)
            fail(`Final terms do not satisfy the credit policy: ${evaluation.reason}`, 409);
        }
        await conn.query(
          `UPDATE ${TABLE} SET loan_amount=?,interest=?,loan_tenure=?,processing_fee=?,net_disbursement=?,emi_amount=?,sanction_date=?,bank_name=?,name_in_bank=?,account_number=?,ifsc=?,repayment_frequency='monthly',tenure_unit='months',insurance_amount=?,pre_emi_interest=?,umrn=COALESCE(NULLIF(?,''),umrn),email=COALESCE(NULLIF(?,''),email),updated_by=?,status='signing_pending',stage='signing_pending' WHERE lan=?`,
          [
            amount,
            rate,
            tenure,
            fee,
            netDisbursement,
            schedule.emi,
            date,
            bank.bank_name,
            bank.name_in_bank,
            bank.account_number,
            bank.ifsc,
            insurance,
            preEmi,
            umrn,
            customerEmail,
            actor,
            lan,
          ],
        );
        await audit(conn, lan, "FINAL_DETAILS_SAVED", actor, {
          loan_amount: amount,
          loan_tenure: tenure,
          interest_rate: rate,
          processing_fee: fee,
          credit_policy_verified: approval.eligible === true && Boolean(approval.ho_approved_by),
        });
      });
      res.json({
        success: true,
        message: "Final loan details saved",
        data: {
          lan,
          status: "signing_pending",
          loan_amount: amount,
          loan_tenure: tenure,
          interest: rate,
          umrn: umrn || null,
          sanction_date: date,
          processing_fee: fee,
          insurance_amount: insurance,
          pre_emi_interest: preEmi,
          net_disbursement: netDisbursement,
          emi_amount: schedule.emi,
          tenure_unit: "months",
        },
      });
    }),
  );
  // Ops Maker decision: writes approved (checker queue) or OPS_REJECTED.
  router.patch(
    "/:lan/ops-maker-decision",
    auth,
    wrap(async (req, res) => {
      const lan = lanOf(req),
        actor = actorOf(req),
        decision = status(req.body?.decision);
      if (!["approved", "rejected"].includes(decision))
        fail("decision must be approved or rejected");
      const reason = String(req.body?.reason || "").trim();
      if (reason.length > 2000 || (decision === "rejected" && !reason))
        fail("Valid rejection reason required");
      await transact(async (conn) => {
        const loan = await locked(conn, lan);
        if (status(loan.status) !== "ops_initiate")
          fail("Case must be in ops_initiate", 409);
        // Maker records manual operations review; payout validates provider completion separately.
        await conn.query(
          `UPDATE ${TABLE} SET status=?,stage=?,ops_maker_id=? WHERE lan=?`,
          [
            decision === "approved" ? "approved" : "OPS_REJECTED",
            decision === "approved" ? "approved" : "OPS_REJECTED",
            actor,
            lan,
          ],
        );
        await audit(
          conn,
          lan,
          decision === "approved" ? "MAKER_APPROVED" : "MAKER_REJECTED",
          actor,
          { reason, decision_mode: "MANUAL_REVIEW", bre_status: loan.arthavidhi_capital_bre_status, aml_status: loan.aml_status },
        );
        if (decision === "rejected") await releaseArthavidhiReservations(conn, lan);
        if (decision === "rejected")
          return () => sendArthavidhiWebhook(lan, "OPS_REJECTED", {
            external_ref_no: loan.partner_loan_id,
            reject_reason: reason,
          });
      });
      res.json({
        success: true,
        data: { lan, status: decision === "approved" ? "approved" : "OPS_REJECTED" },
      });
    }),
  );
}
// END ARTHAVIDHI WORKFLOW

module.exports = router;
