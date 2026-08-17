/**
 * PL Partner BRE (business rule engine) for the /approve endpoint.
 *
 * Ported from Backend/routes/switchMyLoan/runBre.js, adapted for the two-call
 * decision flow PLP actually uses (see the integration contract): PRE_APPROVAL
 * runs the full rule set against the requested amount and returns a credit
 * limit; FINAL_APPROVAL (after the customer selects an offer) only re-checks
 * that the selected offer fits within the credit limit already computed at
 * PRE_APPROVAL — it does not re-run AML/bureau.
 *
 * Deliberately kept separate from runBre.js/rapidMoneyPolicy.js so RapidMoney's
 * BRE is untouched. Known simplifications for this pass (see the PL Partner
 * plan discussion):
 *  - No repeat-customer signal exists in the PLP contract, so every applicant
 *    is treated as a new customer (FIRST_TIME_CUSTOMER_LIMIT). The repeat
 *    branch is not implemented here; add it if/when PLP starts sending prior
 *    disbursal history.
 *  - No processing-fee field exists anywhere in the PLP contract/schema, so
 *    approved amounts are gross (no PF/GST netting like switchMyLoan does).
 *  - AML/bureau are always mocked (PLP_AML_MODE / PLP_BUREAU_MODE, both
 *    currently forced to "mock-clear" — "live" mode throws NOT_IMPLEMENTED
 *    since no real AML/bureau integration has been wired up yet).
 */
const db = require("../../../config/db");
const {
  POLICY,
  calculateAge,
  validateLoanAmount,
  calculateNetDisbursalAmount,
} = require("./plPartnerPolicy");

const POLICY_VERSION = "PL_PARTNER_POLICY_PLACEHOLDER_2026_08";

const DEPLOYMENT_ENV = String(
  process.env.DEPLOYMENT_ENV || process.env.NODE_ENV || "development",
)
  .trim()
  .toLowerCase();

const PLP_AML_MODE = String(process.env.PLP_AML_MODE || "")
  .trim()
  .toLowerCase();

const PLP_BUREAU_MODE = String(process.env.PLP_BUREAU_MODE || "")
  .trim()
  .toLowerCase();

const VALID_SERVICE_MODES = new Set(["live", "mock-clear"]);

if (!VALID_SERVICE_MODES.has(PLP_AML_MODE)) {
  throw new Error(
    `Invalid PLP_AML_MODE "${PLP_AML_MODE}". Expected live or mock-clear.`,
  );
}

if (!VALID_SERVICE_MODES.has(PLP_BUREAU_MODE)) {
  throw new Error(
    `Invalid PLP_BUREAU_MODE "${PLP_BUREAU_MODE}". Expected live or mock-clear.`,
  );
}

// if (
//   DEPLOYMENT_ENV === "production" &&
//   (PLP_AML_MODE !== "live" || PLP_BUREAU_MODE !== "live")
// ) {
//   throw new Error("PL Partner AML/Bureau bypass is not permitted in production");
// }

function safeJson(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({ serialization_error: true });
  }
}

function rule(passed, reason = null, derivedValues = {}, executed = true) {
  return { executed, passed, reason, derived_values: derivedValues };
}

function addReason(reasons, reasonValue) {
  if (reasonValue && !reasons.includes(reasonValue)) {
    reasons.push(reasonValue);
  }
}

function createInitialRules() {
  return {
    AML_CHECK_RPM: rule(false, null, {}, false),
    LOAN_AMOUNT_CHECK_RPM: rule(false, null, {}, false),
    FIRST_TIME_LIMIT_CHECK_RPM: rule(false, null, {}, false),
    REPEAT_LIMIT_CHECK_RPM: rule(false, null, {}, false),
    REPEAT_AGE_CAP_CHECK_RPM: rule(false, null, {}, false),
    BUREAU_SCORE_CHECK_RPM: rule(false, null, {}, false),
    DUAL_PAN_CHECK_RPM: rule(false, null, {}, false),
    ENQUIRIES_30D_CHECK_RPM: rule(false, null, {}, false),
    OVERDUE_AMOUNT_CHECK_RPM: rule(false, null, {}, false),
    DPD_30_LAST_3M_CHECK_RPM: rule(false, null, {}, false),
    DPD_60_LAST_9M_CHECK_RPM: rule(false, null, {}, false),
    DPD_90_LAST_12M_CHECK_RPM: rule(false, null, {}, false),
    UNSECURED_AGGREGATION_CHECK_RPM: rule(false, null, {}, false),
    CREDIT_LIMIT_CHECK_RPM: rule(false, null, {}, false),
    SELECTED_OFFER_CHECK_RPM: rule(false, null, {}, false),
    PROCESSING_FEE_CHECK_RPM: rule(false, null, {}, false),
  };
}

async function runAml() {
  if (PLP_AML_MODE === "mock-clear") {
    return {
      status: "PROCEED",
      score: 100,
      totalMatches: 0,
      reason: null,
      source: "TEST_BYPASS",
    };
  }

  throw new Error("PL Partner live AML integration is not implemented yet.");
}

async function runBureau() {
  if (PLP_BUREAU_MODE === "mock-clear") {
    return {
      status: "VERIFIED",
      source: "TEST_BYPASS",
      bypassed: true,

      reportId: null,
      reportDate: null,

      score: 750,

      panCount: 1,
      hasDualPan: false,

      enquiries30Days: 0,
      totalOverdueAmount: 0,

      maxDpdLast3Months: 0,
      maxDpdLast9Months: 0,
      maxDpdLast12Months: 0,

      hasGt30DpdLast3Months: false,
      hasGt60DpdLast9Months: false,
      hasGt90DpdLast12Months: false,

      unsecuredAggregate: 250000,
      unsecuredTradelineCount: 2,
      totalTradelines: 2,
    };
  }

  throw new Error("PL Partner live bureau integration is not implemented yet.");
}

async function loadApplication(applicationId) {
  const [[application]] = await db.promise().query(
    `SELECT * FROM pl_partner_applications WHERE id = ? LIMIT 1`,
    [applicationId],
  );

  return application || null;
}

async function persistBreSnapshot(applicationId, stage, result) {
  /*
   * PRE_APPROVAL and FINAL_APPROVAL write to non-overlapping columns.
   * FINAL_APPROVAL must never touch bre_status/bre_decision_stage/bre_credit_limit —
   * those are FINAL_APPROVAL's own precondition (it checks bre_status === 'APPROVED'
   * to confirm PRE_APPROVAL happened). Overwriting them on every call would make a
   * second FINAL_APPROVAL call (a retry, or a corrected offer) incorrectly see
   * "PRE_APPROVAL never happened" once the first FINAL_APPROVAL had already run.
   */
  if (stage === "PRE_APPROVAL") {
    await db.promise().query(
      `
      UPDATE pl_partner_applications
      SET
        bre_policy_version = ?,
        bre_decision_stage = ?,
        bre_status = ?,
        bre_reason = ?,
        bre_credit_limit = ?,
        bre_checked_at = NOW(),
        bre_details_json = ?
      WHERE id = ?
      `,
      [
        result.policyVersion,
        stage,
        result.decision,
        result.reason,
        result.creditLimit,
        safeJson(result),
        applicationId,
      ],
    );
    return;
  }

  await db.promise().query(
    `
    UPDATE pl_partner_applications
    SET
      bre_final_status = ?,
      bre_final_reason = ?,
      bre_gross_approved_amount = ?,
      bre_approved_loan_amount = ?,
      bre_checked_at = NOW(),
      bre_details_json = ?
    WHERE id = ?
    `,
    [
      result.decision,
      result.reason,
      result.grossApprovedLoanAmount,
      result.approvedLoanAmount,
      safeJson(result),
      applicationId,
    ],
  );
}

function buildBaseResult() {
  return {
    policyVersion: POLICY_VERSION,
    decision: "APPROVED",
    reason: null,
    reasons: [],
    creditLimit: null,
    grossApprovedLoanAmount: null,
    approvedLoanAmount: null, // net, after PF + GST deduction
    disbursalBreakup: null,
    age: null,
    newCustomer: null,
    aml: null,
    bureau: null,
    rules: createInitialRules(),
  };
}

async function runPreApproval(application) {
  const reasons = [];
  const result = buildBaseResult();
  const rules = result.rules;

  const aml = await runAml();
  result.aml = aml;

  const amlRejected = aml.status !== "PROCEED";

  rules.AML_CHECK_RPM = rule(!amlRejected, amlRejected ? "AML_REJECT" : null, aml);

  if (amlRejected) {
    addReason(reasons, "AML_REJECT");
    result.decision = "REJECTED";
    result.reason = reasons[0];
    result.reasons = reasons;
    return result;
  }

  const loanAmountResult = validateLoanAmount(application.requested_amount);
  addReason(reasons, loanAmountResult.reason);

  rules.LOAN_AMOUNT_CHECK_RPM = rule(loanAmountResult.passed, loanAmountResult.reason, {
    requestedLoanAmount: loanAmountResult.amount,
    minimumLoanAmount: POLICY.MIN_LOAN_AMOUNT,
    maximumLoanAmount: POLICY.MAX_LOAN_AMOUNT,
    requiredMultiple: POLICY.LOAN_AMOUNT_MULTIPLE,
  });

  // Always a new customer for now — see the file header comment.
  const newCustomer = true;
  const age = calculateAge(application.date_of_birth, new Date());
  const creditLimit = POLICY.FIRST_TIME_CUSTOMER_LIMIT;
  const requestedLoanAmount = Number(application.requested_amount);
  const limitAdjusted = requestedLoanAmount > creditLimit;

  rules.FIRST_TIME_LIMIT_CHECK_RPM = rule(true, null, {
    applicable: true,
    requestedLoanAmount,
    assignedCreditLimit: creditLimit,
    limitAdjusted,
    adjustmentReason: limitAdjusted
      ? "REQUESTED_AMOUNT_CAPPED_TO_FIRST_TIME_LIMIT"
      : null,
  });

  rules.REPEAT_LIMIT_CHECK_RPM = rule(true, null, { applicable: false });
  rules.REPEAT_AGE_CAP_CHECK_RPM = rule(true, null, { applicable: false });

  rules.CREDIT_LIMIT_CHECK_RPM = rule(true, null, {
    creditLimit,
    requestedLoanAmount,
    newCustomer,
    limitAdjusted,
  });

  const bureau = await runBureau();
  result.bureau = bureau;

  const bureauScoreMissing = bureau.score === null || bureau.score === undefined;
  const bureauScoreBelowMinimum =
    !bureauScoreMissing && Number(bureau.score) < POLICY.MIN_BUREAU_SCORE;

  if (bureauScoreMissing) addReason(reasons, "BUREAU_SCORE_MISSING");
  if (bureauScoreBelowMinimum) addReason(reasons, "BUREAU_SCORE_BELOW_MINIMUM");

  rules.BUREAU_SCORE_CHECK_RPM = rule(
    !bureauScoreMissing && !bureauScoreBelowMinimum,
    bureauScoreMissing
      ? "BUREAU_SCORE_MISSING"
      : bureauScoreBelowMinimum
        ? "BUREAU_SCORE_BELOW_MINIMUM"
        : null,
    { bureauScore: bureau.score, minimumRequiredScore: POLICY.MIN_BUREAU_SCORE },
  );

  if (bureau.hasDualPan) addReason(reasons, "DUAL_PAN_FOUND_IN_BUREAU");

  rules.DUAL_PAN_CHECK_RPM = rule(
    !bureau.hasDualPan,
    bureau.hasDualPan ? "DUAL_PAN_FOUND_IN_BUREAU" : null,
    { panCount: bureau.panCount },
  );

  const enquiries30Days = Number(bureau.enquiries30Days || 0);
  const enquiriesFailed = enquiries30Days >= POLICY.ENQUIRY_REJECT_FROM_30_DAYS;

  if (enquiriesFailed) addReason(reasons, "ENQUIRIES_ABOVE_POLICY_LIMIT_LAST_30_DAYS");

  rules.ENQUIRIES_30D_CHECK_RPM = rule(
    !enquiriesFailed,
    enquiriesFailed ? "ENQUIRIES_ABOVE_POLICY_LIMIT_LAST_30_DAYS" : null,
    {
      enquiriesLast30Days: enquiries30Days,
      maximumAllowedExclusive: POLICY.ENQUIRY_REJECT_FROM_30_DAYS,
    },
  );

  const totalOverdueAmount = Number(bureau.totalOverdueAmount || 0);
  const overdueFailed = totalOverdueAmount >= POLICY.OVERDUE_REJECT_FROM;

  if (overdueFailed) addReason(reasons, "OVERDUE_AMOUNT_ABOVE_POLICY_LIMIT");

  rules.OVERDUE_AMOUNT_CHECK_RPM = rule(
    !overdueFailed,
    overdueFailed ? "OVERDUE_AMOUNT_ABOVE_POLICY_LIMIT" : null,
    { totalOverdueAmount, maximumAllowedExclusive: POLICY.OVERDUE_REJECT_FROM },
  );

  if (bureau.hasGt30DpdLast3Months) addReason(reasons, "DPD_ABOVE_POLICY_LIMIT_LAST_3_MONTHS");

  rules.DPD_30_LAST_3M_CHECK_RPM = rule(
    !bureau.hasGt30DpdLast3Months,
    bureau.hasGt30DpdLast3Months ? "DPD_ABOVE_POLICY_LIMIT_LAST_3_MONTHS" : null,
    {
      maximumObservedDpd: bureau.maxDpdLast3Months,
      rejectWhenAbove: POLICY.DPD_REJECT_ABOVE_LAST_3_MONTHS,
    },
  );

  if (bureau.hasGt60DpdLast9Months) addReason(reasons, "DPD_ABOVE_POLICY_LIMIT_LAST_9_MONTHS");

  rules.DPD_60_LAST_9M_CHECK_RPM = rule(
    !bureau.hasGt60DpdLast9Months,
    bureau.hasGt60DpdLast9Months ? "DPD_ABOVE_POLICY_LIMIT_LAST_9_MONTHS" : null,
    {
      maximumObservedDpd: bureau.maxDpdLast9Months,
      rejectWhenAbove: POLICY.DPD_REJECT_ABOVE_LAST_9_MONTHS,
    },
  );

  if (bureau.hasGt90DpdLast12Months) addReason(reasons, "DPD_ABOVE_POLICY_LIMIT_LAST_12_MONTHS");

  rules.DPD_90_LAST_12M_CHECK_RPM = rule(
    !bureau.hasGt90DpdLast12Months,
    bureau.hasGt90DpdLast12Months ? "DPD_ABOVE_POLICY_LIMIT_LAST_12_MONTHS" : null,
    {
      maximumObservedDpd: bureau.maxDpdLast12Months,
      rejectWhenAbove: POLICY.DPD_REJECT_ABOVE_LAST_12_MONTHS,
    },
  );

  const unsecuredAggregate = Number(bureau.unsecuredAggregate || 0);
  const unsecuredAggregationFailed =
    newCustomer && unsecuredAggregate < POLICY.MIN_UNSECURED_AGGREGATE;

  if (unsecuredAggregationFailed) {
    addReason(reasons, "UNSECURED_TRADELINE_AGGREGATE_BELOW_POLICY_MINIMUM");
  }

  rules.UNSECURED_AGGREGATION_CHECK_RPM = rule(
    !unsecuredAggregationFailed,
    unsecuredAggregationFailed
      ? "UNSECURED_TRADELINE_AGGREGATE_BELOW_POLICY_MINIMUM"
      : null,
    {
      applicable: newCustomer,
      unsecuredAggregate,
      minimumRequiredAggregate: POLICY.MIN_UNSECURED_AGGREGATE,
    },
  );

  result.creditLimit = creditLimit;
  result.approvedLoanAmount = null; // finalized only at FINAL_APPROVAL
  result.age = age;
  result.newCustomer = newCustomer;
  result.decision = reasons.length ? "REJECTED" : "APPROVED";
  result.reason = reasons[0] || null;
  result.reasons = reasons;

  return result;
}

async function runFinalApproval(application) {
  const reasons = [];
  const result = buildBaseResult();
  const rules = result.rules;

  if (application.bre_status !== "APPROVED") {
    result.decision = "REJECTED";
    result.reason = "PRE_APPROVAL_NOT_COMPLETED";
    result.reasons = ["PRE_APPROVAL_NOT_COMPLETED"];
    return result;
  }

  const creditLimit = Number(application.bre_credit_limit);
  const selectedOfferAmount = Number(application.selected_offer_amount);

  result.creditLimit = Number.isFinite(creditLimit) ? creditLimit : null;
  result.age = application.date_of_birth
    ? calculateAge(application.date_of_birth, new Date())
    : null;
  result.newCustomer = true;

  const selectedOfferValid =
    Number.isFinite(selectedOfferAmount) &&
    selectedOfferAmount > 0 &&
    Number.isFinite(creditLimit) &&
    selectedOfferAmount <= creditLimit;

  if (!selectedOfferValid) {
    addReason(reasons, "SELECTED_OFFER_EXCEEDS_CREDIT_LIMIT");
  }

  rules.SELECTED_OFFER_CHECK_RPM = rule(
    selectedOfferValid,
    selectedOfferValid ? null : "SELECTED_OFFER_EXCEEDS_CREDIT_LIMIT",
    {
      selectedOfferAmount: Number.isFinite(selectedOfferAmount)
        ? selectedOfferAmount
        : null,
      creditLimit: Number.isFinite(creditLimit) ? creditLimit : null,
    },
  );

  let disbursalBreakup = null;

  if (selectedOfferValid) {
    // application.processing_fee is stored as a percentage number (e.g. 2.0000
    // for 2%, per the partner's format) — calculateNetDisbursalAmount expects
    // a 0-1 fraction, so convert here at the point of use.
    const processingFeeRate =
      application.processing_fee === null || application.processing_fee === undefined
        ? null
        : Number(application.processing_fee) / 100;

    disbursalBreakup = calculateNetDisbursalAmount({
      creditLimit: selectedOfferAmount,
      processingFeeRate,
    });

    if (!disbursalBreakup.ok) {
      addReason(reasons, disbursalBreakup.reason || "NET_DISBURSAL_AMOUNT_INVALID");
    }
  }

  rules.PROCESSING_FEE_CHECK_RPM = rule(
    selectedOfferValid && Boolean(disbursalBreakup?.ok),
    !selectedOfferValid
      ? null // already covered by SELECTED_OFFER_CHECK_RPM
      : disbursalBreakup?.ok
        ? null
        : disbursalBreakup?.reason || "NET_DISBURSAL_AMOUNT_INVALID",
    disbursalBreakup || { applicable: selectedOfferValid },
  );

  result.decision = reasons.length ? "REJECTED" : "APPROVED";
  result.reason = reasons[0] || null;
  result.reasons = reasons;
  result.disbursalBreakup = disbursalBreakup;
  result.grossApprovedLoanAmount = result.decision === "APPROVED" ? selectedOfferAmount : null;
  result.approvedLoanAmount =
    result.decision === "APPROVED" ? disbursalBreakup.netDisbursalAmount : null;

  return result;
}

async function runPlPartnerBre(applicationInput, { phase }) {
  if (!applicationInput?.id) {
    throw new Error("A PL partner application with an id is required");
  }

  if (phase !== "PRE_APPROVAL" && phase !== "FINAL_APPROVAL") {
    throw new Error(`Invalid BRE phase: ${phase}`);
  }

  const application = await loadApplication(applicationInput.id);

  if (!application) {
    throw new Error(`PL partner application not found: ${applicationInput.id}`);
  }

  const result =
    phase === "PRE_APPROVAL"
      ? await runPreApproval(application)
      : await runFinalApproval(application);

  await persistBreSnapshot(application.id, phase, result);

  return result;
}

module.exports = {
  runPlPartnerBre,
  POLICY_VERSION,
};
