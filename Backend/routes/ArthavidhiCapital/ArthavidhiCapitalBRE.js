/*
 * ARTHAVIDHI CAPITAL — BRE FUNCTION GUIDE
 *
 * This module defines internal functions, NOT HTTP API endpoints.
 * No PAN, Aadhaar, bureau-provider, AML-provider or payout API is called here.
 * A backend route/service imports and calls these exported functions.
 *
 * Main execution chain:
 * autoRunArthavidhiCapitalBreIfReady(lan)
 *   -> load booking and latest saved bureau report
 *   -> evaluateStoredArthavidhiPolicy(loan, report)
 *      -> readPolicyInputs() + extractArthavidhiPolicyBureau()
 *      -> evaluateArthavidhiCreditPolicy()
 *   -> getArthavidhiLoginDecision(bre, amlStatus, amlReason)
 *   -> save BRE result and case status; commit transaction
 *
 * Booking helper (separate from the chain above):
 * mergeArthavidhiBookingAssessment(input, stored)
 *   -> validate/merge assessment fields; returns    an object, does not save it
 *
 * Database reads: loan_booking_arthavidhi, loan_cibil_reports.
 * Database writes here: loan_booking_arthavidhi.
 * Rejection also calls releaseArthavidhiReservations() in another service.
 *
 * Rule results and exported interfaces are kept stable for existing callers.
 */

const db = require("../../config/db");

// Reading order:
// 1. evaluateArthavidhiCreditPolicy: eligibility rules A-F below.
// 2. readPolicyInputs / mergeArthavidhiBookingAssessment: booking data helpers.
// 3. extractArthavidhiPolicyBureau: saved Experian XML -> credit facts.
// 4. evaluateStoredArthavidhiPolicy: combine saved facts and calculate the result.
// 5. getArthavidhiLoginDecision: result + AML -> workflow status (no DB write).
// 6. autoRunArthavidhiCapitalBreIfReady: load, evaluate and save the case.
//
// Result meanings:
// REJECTED = a supplied fact breaks a rule.
// REVIEW   = required information or a supported review is missing.
// APPROVED = all core checks passed; this is not credit approval or payout approval.

// Arthavidhi core BRE: amount, age, monthly tenure and bureau credit history.

// Monthly revenue is a BRE rule. Other business, banking and document assessments
// remain management review, not additional BRE gates.

// Unknown bureau facts are not treated as clean credit history.

/*
 * 1. CORE ELIGIBILITY EVALUATOR — no database writes or external calls.
 * Input: { loan, bureau, assessment }, optional settings.
 * Checks: amount, age, bureau score/deviations, enquiries, adverse history,
 * monthly repayment setting and amount-based tenure bands.
 * Output: APPROVED / REJECTED / REVIEW plus reasons and eligible amount.
 * It does not approve credit, move money or save the result by itself.
 */
function evaluateArthavidhiCreditPolicy(
  { loan = {}, bureau = {}, assessment = {} } = {},
  settings = {},
) {
  settings = {
    minimumAmount: 10000,
    repaymentFrequency: "monthly",
    ...settings,
  };

  const rejected = [];
  const pending = [];
  const deviations = [];

  const readNumber = (value) =>
    value === null || value === undefined || String(value).trim() === ""
      ? null
      : Number.isFinite(Number(value))
        ? Number(value)
        : null;

  const checkRange = (value, min, max, code) => {
    const n = readNumber(value);
    if (n === null) pending.push(`${code}_MISSING`);
    else if (n < min || n > max) rejected.push(code);
    return n;
  };

  const requireVerification = (key) => {
    if (assessment[key] !== true)
      pending.push(`${key.toUpperCase()}_REQUIRES_VERIFICATION`);
  };

  // A. Requested/proposed amount and age. Default minimum: 10,000.
  const requested = readNumber(loan.requested_amount ?? loan.loan_amount);

  const amount = readNumber(assessment.proposed_loan_amount ?? requested);

  if (requested !== null && requested > 100000)
    rejected.push("REQUESTED_AMOUNT_ABOVE_100000");

  if (requested !== null && amount !== null && amount > requested)
    rejected.push("PROPOSED_AMOUNT_EXCEEDS_REQUESTED");

  if (amount === null) pending.push("LOAN_AMOUNT_MISSING");
  else if (amount <= 0 || amount > 100000)
    rejected.push("LOAN_AMOUNT_OUTSIDE_POLICY");

  if (![10000, 25000].includes(settings.minimumAmount))
    pending.push("MINIMUM_AMOUNT_POLICY_CONFLICT");
  else if (amount !== null && amount < settings.minimumAmount)
    rejected.push("LOAN_AMOUNT_BELOW_MINIMUM");

  checkRange(loan.age, 21, 60, "AGE_OUTSIDE_21_60");

  // Revenue comes from booking assessment JSON; missing data is not assumed valid.
  const monthlyRevenue = readNumber(assessment.monthly_revenue ?? loan.monthly_revenue);
  if (monthlyRevenue === null) pending.push("MONTHLY_REVENUE_MISSING");
  else if (monthlyRevenue < 25000) rejected.push("MONTHLY_REVENUE_BELOW_25000");

  // B. Score bands and co-borrower/deviation requirements.
  const score = readNumber(bureau.score);

  if (bureau.no_hit === true)
    deviations.push("NO_HIT_REQUIRES_BUSINESS_MANAGER_AND_HO_REVIEW");
  else if (score === null) pending.push("BUREAU_SCORE_MISSING");
  else if (!Number.isInteger(score)) pending.push("BUREAU_SCORE_INVALID");
  else if (score < 600) rejected.push("BUREAU_SCORE_BELOW_600");
  else if (score < 650)
    deviations.push("SCORE_600_649_REQUIRES_BUSINESS_MANAGER_AND_HO_REVIEW");
  else if (score < 700) requireVerification("co_borrower_verified");

  if (
    bureau.no_hit === true ||
    (score !== null && score >= 600 && score < 650)
  ) {
    if (
      ![30000, 50000].includes(
        assessment.ho_deviation_amount_cap ?? settings.deviationAmountCap,
      ) ||
      !String(assessment.ho_review_notes || "").trim()
    )
      pending.push("DEVIATION_30000_50000_CAP_UNSPECIFIED");
    else if (
      amount !== null &&
      amount >
        Number(
          assessment.ho_deviation_amount_cap ?? settings.deviationAmountCap,
        )
    )
      rejected.push("DEVIATION_AMOUNT_EXCEEDS_CAP");

    requireVerification("clean_minor_bureau_verified");
    requireVerification("business_manager_approval_verified");
  }

  // C. Enquiry limits and matching disbursements.
  const enquiries = readNumber(bureau.enquiries_6m),
    disbursements = readNumber(bureau.disbursements_against_enquiries_6m);

  if (enquiries === null) pending.push("ENQUIRIES_6M_MISSING");
  else if (enquiries >= 20) {
    if (disbursements === null)
      pending.push("DISBURSEMENTS_AGAINST_ENQUIRIES_MISSING");
    else if (disbursements === 0)
      rejected.push("AT_LEAST_20_ENQUIRIES_WITH_NO_DISBURSEMENT");
  }

  checkRange(
    bureau.unsecured_bl_pl_enquiries_3m,
    0,
    10,
    "UNSECURED_BL_PL_ENQUIRIES_3M_EXCEED_10",
  );

  // D. Adverse credit flags: true rejects; unknown requires review.
  for (const key of [
    "dpd_60_plus_12m",
    "dpd_90_plus_24m",
    "any_write_off",
    "any_settlement",
    "any_suit_filed",
    "restructured_3y",
  ]) {
    if (bureau[key] === true) rejected.push(key.toUpperCase());
    else if (bureau[key] !== false)
      pending.push(`${key.toUpperCase()}_UNKNOWN`);
  }

  // E. Monthly repayment and tenure by amount band.
  if (settings.repaymentFrequency !== "monthly")
    pending.push("REPAYMENT_POLICY_CONFIRMATION_REQUIRED");

  const tenure = readNumber(assessment.tenure_months ?? loan.loan_tenure);

  if (tenure === null) pending.push("TENURE_MONTHS_MISSING");
  else if (amount !== null) {
    const band =
      amount <= 25000 ? [6, 12] : amount <= 50000 ? [9, 18] : [12, 18];

    if (!Number.isInteger(tenure) || tenure < band[0] || tenure > band[1])
      rejected.push("TENURE_OUTSIDE_AMOUNT_BAND");
  }

  // F. A rejection takes priority, then missing-data review, then approval.
  const decision = rejected.length
    ? "REJECTED"
    : pending.length
      ? "REVIEW"
      : "APPROVED";

  return {
    policy: "ARTHAVIDHI_CORE_BRE",
    eligible: decision === "APPROVED",
    eligibleAmount: decision === "APPROVED" ? amount : null,
    assessedAmount: amount,
    decision,
    rejections: [...new Set(rejected)],
    pending: [...new Set(pending)],
    deviations: [...new Set(deviations)],
    reason: [...rejected, ...pending, ...deviations].join(", "),
  };
}

/*
 * 2. POLICY JSON READER — no database calls.
 * Accepts a stored object or JSON string. Invalid/non-object JSON becomes {}.
 */
function readPolicyInputs(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
}

// Booking and drafts use the existing policy JSON column; provider facts and HO approvals are not intake fields.

/*
 * 3. BOOKING ASSESSMENT VALIDATOR — no database calls.
 * Merges allowed numeric, boolean and text inputs into existing assessment.
 * Unsupported keys throw HTTP-style status: 400 errors for the route to handle.
 * A changed input removes prior HO/BM sign-offs from the returned object.
 * The calling route must persist the returned object.
 */
function mergeArthavidhiBookingAssessment(input, stored = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw Object.assign(new Error("Invalid policy assessment"), {
      status: 400,
    });

  const numeric = new Set([
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
  ]);

  const booleans = new Set([
    "micro_small_business_verified",
    "owned_residence",
    "owned_business_premises",
    "co_borrower_verified",
    "applicable_co_applicants_verified",
    "independent_income_assessment_verified",
    "business_verification_documents_verified",
    "ownership_proof_verified",
    "field_investigation_verified",
    "location_risk_review_verified",
    "applicant_and_related_party_kyc_verified",
    "applicable_business_licences_verified",
    "business_end_use",
  ]);

  const strings = new Set([
    "industry",
    "bank_account_type",
    "verification_notes",
  ]);

  const result = { ...readPolicyInputs(stored) };

  for (const [key, value] of Object.entries(input)) {
    if (!numeric.has(key) && !booleans.has(key) && !strings.has(key))
      throw Object.assign(
        new Error("Unsupported booking assessment field: " + key),
        { status: 400 },
      );

    if (value === "" || value == null) {
      delete result[key];
      continue;
    }

    if (numeric.has(key)) {
      if (
        !["string", "number"].includes(typeof value) ||
        !/^\d+(?:\.\d{1,2})?$/.test(String(value)) ||
        !Number.isFinite(Number(value)) ||
        Number(value) > 1e13
      )
        throw Object.assign(new Error("Invalid " + key), { status: 400 });

      if (key === "bank_statement_months" && !Number.isInteger(Number(value)))
        throw Object.assign(
          new Error("Bank statement months must be a whole number"),
          { status: 400 },
        );

      result[key] = Number(value);
    } else if (booleans.has(key)) {
      if (typeof value !== "boolean")
        throw Object.assign(new Error("Invalid " + key), { status: 400 });

      result[key] = value;
    } else {
      if (typeof value !== "string" || value.length > 2000)
        throw Object.assign(new Error("Invalid " + key), { status: 400 });

      result[key] = value.trim();
    }
  }

  // An intake edit must not keep a sign-off of changed assessment facts.

  if (
    Object.keys(input).some(
      (key) =>
        JSON.stringify(result[key]) !==
        JSON.stringify(readPolicyInputs(stored)[key]),
    )
  )
    for (const key of Object.keys(result))
      if (key.startsWith("ho_") || key === "business_manager_approval_verified")
        delete result[key];

  return result;
}

/*
 * 4. SAVED BUREAU XML PARSER — does not pull a new bureau report.
 * Reads report.score/report_xml into facts used by the evaluator.
 * Extracts enquiries, adverse flags and DPD history where understood.
 * Missing/unrecognised facts stay unknown; malformed XML gets parse_error.
 * Recognises the existing synthetic UAT marker without verifying a provider.
 */
function extractArthavidhiPolicyBureau(report, asOf = new Date()) {
  const facts = { score: report?.score ?? null };

  if (!report?.report_xml) return facts;

  try {
    const { XMLParser, XMLValidator } = require("fast-xml-parser");

    const text = String(report.report_xml);

    if (
      /<!DOCTYPE|<!ENTITY/i.test(text) ||
      XMLValidator.validate(text) !== true
    )
      return { ...facts, parse_error: true };

    const profile = new XMLParser({
      ignoreAttributes: false,
      parseTagValue: false,
      trimValues: true,
    }).parse(text)?.INProfileResponse;

    if (!profile) return { ...facts, parse_error: true };

    const arr = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

    const num = (v) =>
      v == null || String(v).trim() === ""
        ? null
        : Number.isFinite(Number(v))
          ? Number(v)
          : null;

    const date = (v) => {
      const t = String(v || "").replace(/\D/g, "");
      if (t.length !== 8) return null;
      const year = Number(t.slice(0, 4)) > 1900 ? t.slice(0, 4) : t.slice(4),
        month = Number(t.slice(0, 4)) > 1900 ? t.slice(4, 6) : t.slice(2, 4),
        day = Number(t.slice(0, 4)) > 1900 ? t.slice(6) : t.slice(0, 2);
      const d = new Date(`${year}-${month}-${day}T00:00:00Z`);
      return Number.isFinite(d.getTime()) &&
        d.toISOString().slice(0, 10) === `${year}-${month}-${day}`
        ? d
        : null;
    };

    const months = (d) =>
      d
        ? (asOf.getUTCFullYear() - d.getUTCFullYear()) * 12 +
          asOf.getUTCMonth() -
          d.getUTCMonth()
        : null;

    const within = (d, n) => {
      if (!d || d > asOf) return false;
      const first = new Date(
        Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() - n, 1),
      );
      const last = new Date(
        Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
      ).getUTCDate();
      const cutoff = new Date(
        Date.UTC(
          first.getUTCFullYear(),
          first.getUTCMonth(),
          Math.min(asOf.getUTCDate(), last),
        ),
      );
      return d >= cutoff;
    };

    const message = String(profile.UserMessage?.UserMessageText || "");

    if (message.startsWith("ARTHAVIDHI_UAT_SYNTHETIC_BUREAU_V1"))
      facts.synthetic = true;

    facts.no_hit = /\bno[ -]?hit\b|no credit history|no records found/i.test(
      message,
    );

    facts.score = num(profile.SCORE?.BureauScore) ?? num(report.score);

    if (facts.score !== null && facts.score < 0 && !facts.no_hit)
      facts.score = null;

    const caps = profile.CAPS,
      details =
        caps?.CAPS_Application_Details ?? profile.CAPS_Application_Details;

    const enquiryList = arr(details);

    if (
      details != null ||
      num(caps?.CAPS_Summary?.CAPSLast180Days) === 0 ||
      facts.no_hit
    ) {
      let total = 0,
        unsecured = 0,
        validDates = true,
        validTypes = true;

      for (const enquiry of enquiryList) {
        const d = date(enquiry.Date_of_Request ?? enquiry.Enquiry_Date);
        if (!d) {
          validDates = false;
          continue;
        }
        if (within(d, 6)) total++;
        if (within(d, 3)) {
          const type = String(
            enquiry.Type_of_Loan ?? enquiry.Loan_Type ?? enquiry.Product ?? "",
          ).toUpperCase();
          if (/PERSONAL|BUSINESS|^BL$|^PL$/.test(type)) unsecured++;
          else if (!/HOME|HOUSING|AUTO|CAR|GOLD|MORTGAGE|SECURED/.test(type))
            validTypes = false;
        }
      }

      if (validDates) facts.enquiries_6m = total;

      if (validDates && validTypes)
        facts.unsecured_bl_pl_enquiries_3m = unsecured;
    }

    const accountDetails = profile.CAIS_Account?.CAIS_Account_DETAILS,
      accounts = arr(accountDetails);

    const noAccounts =
      num(profile.CAIS_Summary?.Credit_Account?.CreditAccountTotal) === 0 ||
      facts.no_hit;

    if (accountDetails != null || noAccounts) {
      Object.assign(facts, {
        dpd_60_plus_12m: false,
        dpd_90_plus_24m: false,
        any_write_off: false,
        any_settlement: false,
        any_suit_filed: false,
        restructured_3y: false,
      });

      for (const account of accounts) {
        const status = [
          account.Account_Status,
          account.Written_Off_Settled_Status,
          account.Suit_Filed_Wilful_Default,
          account.Restructured_Status,
        ]
          .filter((v) => v != null)
          .join(" ")
          .toUpperCase();

        if (
          /WRIT[T]?EN.?OFF|WRITE.?OFF/.test(status) ||
          num(account.Written_Off_Amt_Total) > 0
        )
          facts.any_write_off = true;

        if (/SETTLED|SETTLEMENT/.test(status)) facts.any_settlement = true;

        if (/SUIT|WILFUL|WILLFUL/.test(status)) facts.any_suit_filed = true;

        // Numeric provider status codes require a documented code mapping; do

        // not interpret an unknown code as a clean account.

        for (const [field, target] of [
          ["Written_Off_Settled_Status", "any_write_off"],
          ["Written_Off_Settled_Status", "any_settlement"],
          ["Suit_Filed_Wilful_Default", "any_suit_filed"],
        ])
          if (
            (account[field] == null ||
              (/^\d+$/.test(String(account[field])) &&
                Number(account[field]) !== 0)) &&
            facts[target] !== true
          )
            delete facts[target];

        if (
          /RESTRUCTUR/.test(status) &&
          !/NOT RESTRUCTUR|NO RESTRUCTUR|UNRESTRUCTUR/.test(status)
        ) {
          const age = months(
            date(account.Restructured_Date ?? account.Date_Reported),
          );
          if (age === null && facts.restructured_3y !== true)
            delete facts.restructured_3y;
          else if (age !== null && age >= 0 && age < 36)
            facts.restructured_3y = true;
        } else if (
          account.Restructured_Status == null &&
          facts.restructured_3y !== true
        )
          delete facts.restructured_3y;

        const histories = arr(account.CAIS_Account_History),
          covered12 = new Set(),
          covered24 = new Set();

        for (const history of histories) {
          const year = Number(history.Year),
            month = Number(history.Month);

          const d =
            history.Year && history.Month
              ? Number.isInteger(year) &&
                year >= 1900 &&
                Number.isInteger(month) &&
                month >= 1 &&
                month <= 12
                ? new Date(Date.UTC(year, month - 1, 1))
                : null
              : date(history.Date ?? history.Date_Reported);

          const age = months(d),
            raw = history.Days_Past_Due ?? history.DPD,
            dpd = String(raw).toUpperCase() === "STD" ? 0 : num(raw);

          if (
            age === null ||
            !Number.isFinite(age) ||
            age < 0 ||
            dpd === null ||
            dpd < 0
          ) {
            if (facts.dpd_60_plus_12m !== true) delete facts.dpd_60_plus_12m;
            if (facts.dpd_90_plus_24m !== true) delete facts.dpd_90_plus_24m;
            continue;
          }

          if (age < 12) {
            covered12.add(age);
            if (dpd >= 60) facts.dpd_60_plus_12m = true;
          }

          if (age < 24) {
            covered24.add(age);
            if (dpd >= 90) facts.dpd_90_plus_24m = true;
          }
        }

        const openedAge = months(
          date(account.Date_Opened ?? account.DateOpened),
        );

        const closedValue = account.Date_Closed ?? account.DateClosed,
          closedAge = closedValue ? months(date(closedValue)) : 0;

        for (const [key, window, covered] of [
          ["dpd_60_plus_12m", 12, covered12],
          ["dpd_90_plus_24m", 24, covered24],
        ]) {
          const required =
            openedAge === null ||
            closedAge === null ||
            openedAge < 0 ||
            closedAge < 0
              ? null
              : Math.max(0, Math.min(window - 1, openedAge) - closedAge + 1);

          if (
            facts[key] !== true &&
            (required === null || covered.size < required)
          )
            delete facts[key];
        }
      }
    }

    return facts;
  } catch {
    return { ...facts, parse_error: true };
  }
}

/*
 * 5. STORED-DATA ADAPTER — no database calls itself.
 * Reads the supplied loan's assessment JSON; strips HO fields without actor/notes.
 * Optionally applies finalTerms, parses the supplied bureau report, and runs BRE.
 * Existing documented manual bureau review can supply otherwise unknown facts.
 * breStage adds a label only: this version has no separate final-policy checklist.
 */
function evaluateStoredArthavidhiPolicy(
  loan,
  report,
  { finalTerms, breStage = false } = {},
) {
  const assessment = {
    ...readPolicyInputs(loan.arthavidhi_capital_policy_inputs),
  };

  const reviewed =
    assessment.ho_review_by && String(assessment.ho_review_notes || "").trim();

  if (!reviewed)
    for (const key of Object.keys(assessment))
      if (key.startsWith("ho_")) delete assessment[key];

  assessment.tenure_months = assessment.tenure_months ?? loan.loan_tenure;

  assessment.proposed_interest_rate =
    assessment.proposed_interest_rate ?? loan.interest ?? loan.interest_rate;

  if (finalTerms)
    Object.assign(assessment, {
      proposed_loan_amount: finalTerms.loan_amount,
      tenure_months: finalTerms.loan_tenure,
      proposed_interest_rate: finalTerms.interest_rate,
    });

  const bureau = extractArthavidhiPolicyBureau(report);

  if (
    assessment.enquiry_disbursements_verified === true &&
    String(assessment.verification_notes || "").trim()
  ) {
    bureau.disbursements_against_enquiries_6m =
      assessment.disbursements_against_enquiries_6m;

    if (bureau.enquiries_6m === undefined)
      bureau.enquiries_6m = assessment.bureau_enquiries_6m;

    if (bureau.unsecured_bl_pl_enquiries_3m === undefined)
      bureau.unsecured_bl_pl_enquiries_3m =
        assessment.bureau_unsecured_bl_pl_enquiries_3m;
  }

  if (
    assessment.bureau_history_review_verified === true &&
    String(assessment.verification_notes || "").trim()
  )
    for (const key of [
      "dpd_60_plus_12m",
      "dpd_90_plus_24m",
      "any_write_off",
      "any_settlement",
      "any_suit_filed",
      "restructured_3y",
    ])
      if (
        assessment[`bureau_${key}`] === true ||
        (bureau[key] === undefined &&
          typeof assessment[`bureau_${key}`] === "boolean")
      )
        bureau[key] = assessment[`bureau_${key}`];

  const result = evaluateArthavidhiCreditPolicy({ loan, bureau, assessment });

  if (bureau.synthetic === true) {
    result.synthetic = true;
    result.dataSource = "UAT_DEMO_NOT_PROVIDER_VERIFIED";
  }

  if (breStage) result.assessmentStage = "BRE";

  return result;
}

/*
 * 6. CASE STATUS MAPPER — no database calls.
 * Combines a BRE result with the saved AML status; does not run AML screening.
 * REJECTED -> bre_rejected; otherwise AML STOP -> aml_rejected.
 * bre_approved requires a real verified bureau, AML PROCEED and BRE APPROVED.
 * Other incomplete cases -> Login, aml_review or policy_review as coded below.
 */
function getArthavidhiLoginDecision(bre, amlStatus, amlReason, bureauVerified = false) {
  const aml = String(amlStatus || "ERROR").trim().toUpperCase();
  const blockedReasons = [];
  if (bureauVerified !== true || bre.synthetic === true)
    blockedReasons.push("Bureau verification is incomplete or unavailable. Complete a successful provider bureau check.");
  if (aml !== "PROCEED")
    blockedReasons.push("AML " + aml + ": " + (amlReason || "Screening has not cleared. Retry AML screening."));
  if (bre.eligible !== true || bre.decision !== "APPROVED")
    blockedReasons.push("BRE " + (bre.decision || "PENDING") + ": " + (bre.reason || "Credit policy checks are incomplete."));
  const reason = blockedReasons.join(" | ");
  if (bre.decision === "REJECTED") return {status:"bre_rejected",reason};
  if (aml === "STOP") return {status:"aml_rejected",reason};
  if (aml !== "PROCEED") return {status:"aml_review",reason};
  if (blockedReasons.length) return {status:"policy_review",reason};
  return {status:"bre_approved",reason:"Bureau verified, AML cleared and BRE approved."};
}

/*
 * 7. DATABASE RUNNER — the main entry point for an existing AVCL case.
 * Opens a connection/transaction and locks the booking row.
 * Reads the latest loan_cibil_reports record matching LAN + PAN.
 * Evaluates supported cases, updates booking/BRE columns and commits.
 * Returns NOT_FOUND/SKIPPED without an update for missing/ineligible-stage loans.
 * On rejection, calls the separate reservation-release service before commit.
 * On error: rollback; finally: release the connection.
 * This function runs ONLY when some route/service explicitly calls it.
 */
async function autoRunArthavidhiCapitalBreIfReady(lanInput, { bureauResult } = {}) {
  const lan = String(lanInput || "")
    .trim()
    .toUpperCase();
  if (!/^AVCL\d+$/.test(lan)) throw new Error("Invalid Arthavidhi LAN");

  const conn = await db.promise().getConnection();

  try {
    await conn.beginTransaction();

    // DB step 1: lock and load the case; only supported stages can be evaluated.
    const [[loan]] = await conn.query(
      "SELECT * FROM loan_booking_arthavidhi WHERE lan=? FOR UPDATE",
      [lan],
    );

    if (!loan) {
      await conn.rollback();
      return { status: "NOT_FOUND", lan };
    }

    if (
      ![
        "login",
        "credit initiated",
        "bre_approved",
        "policy_review",
        "aml_review",
      ].includes(String(loan.status).trim().toLowerCase())
    ) {
      await conn.rollback();
      return { status: "SKIPPED", lan };
    }

    // DB step 2: load the latest saved bureau report for this case and PAN.
    const [[report]] = await conn.query(
      "SELECT score,report_xml FROM loan_cibil_reports WHERE lan=? AND pan_number=? ORDER BY created_at DESC,id DESC LIMIT 1",
      [lan, loan.pan_number],
    );

    // DB step 3: assess report readiness and run the existing evaluator.
    const facts = extractArthavidhiPolicyBureau(report);

    const hasScore =
      report?.score !== null &&
      report?.score !== undefined &&
      String(report.score).trim() !== "" &&
      Number.isFinite(Number(report.score));

    const bureauReady = Boolean(
      report?.report_xml &&
      !facts.parse_error &&
      (hasScore || facts.no_hit === true),
    );

    const bre = evaluateStoredArthavidhiPolicy(
      loan,
      bureauReady ? report : null,
      { breStage: true },
    );

    const [[kyc]] = await conn.query(
      "SELECT bureau_status FROM kyc_verification_status WHERE lan=? AND applicant_type='BORROWER' AND party_no=1 LIMIT 1", [lan],
    );
    const bureauVerified = bureauReady && facts.synthetic !== true &&
      (bureauResult === undefined || (bureauResult.success === true && bureauResult.status === "VERIFIED")) &&
      String(kyc?.bureau_status || "").trim().toUpperCase() === "VERIFIED";
    // DB step 4: all three checks must clear before Partner Credit Review.
    const decision = getArthavidhiLoginDecision(
      bre,
      loan.aml_status,
      loan.aml_reason,
      bureauVerified,
    );

    const breStatus =
      bre.decision === "REJECTED"
        ? "BRE REJECTED"
        : bre.eligible
          ? "BRE APPROVED"
          : bre.decision === "PENDING"
            ? "BRE PENDING"
            : "BRE REVIEW";

    // DB step 5: persist the result, reasons, offer and status on the booking.
    await conn.query(
      `UPDATE loan_booking_arthavidhi SET status=?,stage=?,bre_reason=?,arthavidhi_capital_bre_status=?,arthavidhi_capital_bre_reason=?,arthavidhi_capital_bre_checked_at=NOW(),arthavidhi_capital_final_offer=?,arthavidhi_capital_policy_result=?,arthavidhi_capital_offer_tenure_days=NULL,arthavidhi_capital_deviation_flag=? WHERE lan=?`,
      [
        decision.status,
        decision.status,
        decision.reason,
        breStatus,
        decision.reason,
        bre.eligibleAmount ?? null,
        JSON.stringify(bre),
        bre.deviations.length ? 1 : 0,
        lan,
      ],
    );

    // DB step 6: release reservations on rejection, then commit the transaction.
    if (["bre_rejected", "aml_rejected"].includes(decision.status))
      await require("../../services/arthavidhiRejection").releaseArthavidhiReservations(
        conn,
        lan,
      );

    await conn.commit();
    return { ...bre, ...decision, lan, breStatus };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

// Public exports imported by your routes/services.
module.exports = {
  mergeArthavidhiBookingAssessment,
  autoRunArthavidhiCapitalBreIfReady,
  getArthavidhiLoginDecision,
  evaluateArthavidhiCreditPolicy,
  evaluateStoredArthavidhiPolicy,
  readPolicyInputs,
  extractArthavidhiPolicyBureau,
};
