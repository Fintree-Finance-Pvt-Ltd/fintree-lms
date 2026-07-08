const {
  POLICY,
  calculateAge,
  validateLoanAmount,
  isNewCustomer,
  calculateRepeatCreditLimit,
} = require("./rapidMoneyPolicy");
const POLICY_VERSION = "RAPID_MONEY_POLICY_PDF_2026_07";
function rule(passed, reason = null, derivedValues = {}, executed = true) {
  return { executed, passed, reason, derived_values: derivedValues };
}
function addReason(reasons, value) {
  if (value && !reasons.includes(value)) {
    reasons.push(value);
  }
}
function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}
function parseRequiredNumber(value, field, errors, options = {}) {
  const { minimum = null, integer = false } = options;
  if (value === undefined || value === null || value === "") {
    errors.push(`${field} is required`);
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    errors.push(`${field} must be a valid number`);
    return null;
  }
  if (integer && !Number.isInteger(parsed)) {
    errors.push(`${field} must be an integer`);
  }
  if (minimum !== null && parsed < minimum) {
    errors.push(`${field} must be at least ${minimum}`);
  }
  return parsed;
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
  };
}
function evaluateRapidMoneyEligibility(payload = {}) {
  const validationErrors = [];
  const aml = payload.aml || {};
  const bureau = payload.bureau || {};
  /* * A fixed as-of date makes age testing * deterministic. */ const asOfDate =
    payload.as_of_date ? new Date(payload.as_of_date) : new Date();
  if (Number.isNaN(asOfDate.getTime())) {
    validationErrors.push("as_of_date must be a valid date");
  }
  if (!payload.dob) {
    validationErrors.push("dob is required");
  }
  const loanAmount = parseRequiredNumber(
    payload.loan_amount,
    "loan_amount",
    validationErrors,
    { minimum: 0 },
  );
  const totalDisbursed = parseRequiredNumber(
    payload.total_disbursed_applications,
    "total_disbursed_applications",
    validationErrors,
    { minimum: 0, integer: true },
  );
  let previousLoanAmount = 0;
  if (
    payload.previous_loan_amount !== undefined &&
    payload.previous_loan_amount !== null &&
    payload.previous_loan_amount !== ""
  ) {
    previousLoanAmount = parseRequiredNumber(
      payload.previous_loan_amount,
      "previous_loan_amount",
      validationErrors,
      { minimum: 0 },
    );
  }
  if (!aml.status) {
    validationErrors.push("aml.status is required");
  }
  /* * Bureau score may be null so that the * BUREAU_SCORE_MISSING rule can be tested. */ let bureauScore =
    null;
  if (
    bureau.score !== undefined &&
    bureau.score !== null &&
    bureau.score !== ""
  ) {
    bureauScore = Number(bureau.score);
    if (!Number.isFinite(bureauScore)) {
      validationErrors.push("bureau.score must be a valid number or null");
    }
  }
  const panCount = parseRequiredNumber(
    bureau.pan_count,
    "bureau.pan_count",
    validationErrors,
    { minimum: 0, integer: true },
  );
  const enquiries30Days = parseRequiredNumber(
    bureau.enquiries_30d,
    "bureau.enquiries_30d",
    validationErrors,
    { minimum: 0, integer: true },
  );
  const totalOverdueAmount = parseRequiredNumber(
    bureau.total_overdue_amount,
    "bureau.total_overdue_amount",
    validationErrors,
    { minimum: 0 },
  );
  const maxDpd3m = parseRequiredNumber(
    bureau.max_dpd_3m,
    "bureau.max_dpd_3m",
    validationErrors,
    { minimum: 0 },
  );
  const maxDpd9m = parseRequiredNumber(
    bureau.max_dpd_9m,
    "bureau.max_dpd_9m",
    validationErrors,
    { minimum: 0 },
  );
  const maxDpd12m = parseRequiredNumber(
    bureau.max_dpd_12m,
    "bureau.max_dpd_12m",
    validationErrors,
    { minimum: 0 },
  );
  const unsecuredTotal = parseRequiredNumber(
    bureau.unsecured_total,
    "bureau.unsecured_total",
    validationErrors,
    { minimum: 0 },
  );
  const unsecuredCount = parseRequiredNumber(
    bureau.unsecured_count,
    "bureau.unsecured_count",
    validationErrors,
    { minimum: 0, integer: true },
  );
  if (validationErrors.length) {
    return {
      policyVersion: POLICY_VERSION,
      decision: "VALIDATION_ERROR",
      reason: validationErrors[0],
      reasons: validationErrors,
      validationErrors,
      creditLimit: null,
      age: null,
      newCustomer: null,
      rules: createInitialRules(),
    };
  }
  const reasons = [];
  const technicalReasons = [];
  const rules = createInitialRules();
  /* * --------------------------------- * AML * --------------------------------- */ const amlStatus =
    String(aml.status).trim().toUpperCase();
  if (amlStatus === "CLEAR") {
    rules.AML_CHECK_RPM = rule(true, null, {
      status: amlStatus,
      score: aml.score ?? null,
      totalMatches: aml.total_matches ?? null,
    });
  } else if (amlStatus === "REJECT") {
    addReason(reasons, "AML_HIGH_RISK_MATCH");
    rules.AML_CHECK_RPM = rule(false, "AML_HIGH_RISK_MATCH", {
      status: amlStatus,
      score: aml.score ?? null,
      totalMatches: aml.total_matches ?? null,
    });
  } else if (amlStatus === "REVIEW") {
    addReason(reasons, "AML_MEDIUM_RISK_MATCH");
    rules.AML_CHECK_RPM = rule(false, "AML_MEDIUM_RISK_MATCH", {
      status: amlStatus,
      score: aml.score ?? null,
      totalMatches: aml.total_matches ?? null,
    });
  } else {
    addReason(technicalReasons, "AML_STATUS_INVALID");
    rules.AML_CHECK_RPM = rule(false, "AML_STATUS_INVALID", {
      status: amlStatus || null,
      score: aml.score ?? null,
      totalMatches: aml.total_matches ?? null,
    });
  }
  /* * --------------------------------- * Customer classification and age * --------------------------------- */ const newCustomer =
    isNewCustomer(totalDisbursed);
  const age = calculateAge(payload.dob, asOfDate);
  /* * --------------------------------- * Loan amount rule * --------------------------------- */ const loanAmountResult =
    validateLoanAmount(loanAmount);
  addReason(reasons, loanAmountResult.reason);
  rules.LOAN_AMOUNT_CHECK_RPM = rule(
    loanAmountResult.passed,
    loanAmountResult.reason,
    {
      requestedLoanAmount: loanAmountResult.amount,
      minimumLoanAmount: POLICY.MIN_LOAN_AMOUNT,
      maximumLoanAmount: POLICY.MAX_LOAN_AMOUNT,
      requiredMultiple: POLICY.LOAN_AMOUNT_MULTIPLE,
    },
  );
  /* * --------------------------------- * Credit-limit calculation * --------------------------------- */ let creditLimit =
    null;
  let repeatLimitDetails = null;
  if (newCustomer) {
  creditLimit =
    POLICY.FIRST_TIME_CUSTOMER_LIMIT;

  const firstTimeLimitAdjusted =
    loanAmount >
    POLICY.FIRST_TIME_CUSTOMER_LIMIT;

  rules.FIRST_TIME_LIMIT_CHECK_RPM =
    rule(
      true,
      null,
      {
        applicable: true,

        requestedLoanAmount:
          loanAmount,

        assignedCreditLimit:
          POLICY
            .FIRST_TIME_CUSTOMER_LIMIT,

        limitAdjusted:
          firstTimeLimitAdjusted,

        adjustmentReason:
          firstTimeLimitAdjusted
            ? "REQUESTED_AMOUNT_CAPPED_TO_FIRST_TIME_LIMIT"
            : null,
      },
    );

  rules.REPEAT_LIMIT_CHECK_RPM =
    rule(
      true,
      null,
      {
        applicable: false,
      },
    );

  rules.REPEAT_AGE_CAP_CHECK_RPM =
    rule(
      true,
      null,
      {
        applicable: false,
      },
    );
} else {
    rules.FIRST_TIME_LIMIT_CHECK_RPM = rule(true, null, { applicable: false });
    if (age === null) {
      addReason(reasons, "AGE_MISSING_OR_INVALID_FOR_REPEAT_CUSTOMER");
    }
    if (previousLoanAmount === null || previousLoanAmount <= 0) {
      addReason(reasons, "PREVIOUS_LOAN_AMOUNT_MISSING_FOR_REPEAT_CUSTOMER");
    }
    repeatLimitDetails = calculateRepeatCreditLimit(
      totalDisbursed,
      previousLoanAmount,
      age,
    );
    creditLimit = repeatLimitDetails.creditLimit;
    const repeatLimitFailed =
      !creditLimit || creditLimit < POLICY.MIN_LOAN_AMOUNT;
    if (repeatLimitFailed) {
      addReason(reasons, "REPEAT_CUSTOMER_CREDIT_LIMIT_BELOW_MINIMUM_LOAN");
    }
    rules.REPEAT_LIMIT_CHECK_RPM = rule(
      !repeatLimitFailed,
      repeatLimitFailed
        ? "REPEAT_CUSTOMER_CREDIT_LIMIT_BELOW_MINIMUM_LOAN"
        : null,
      {
        applicable: true,
        previousLoanAmount,
        repeatLoanCount: totalDisbursed,
        multiplier: repeatLimitDetails.multiplier,
        rawLimit: repeatLimitDetails.rawLimit,
        cappedLimit: repeatLimitDetails.cappedLimit,
        roundedLimit: repeatLimitDetails.roundedLimit,
        maximumPolicyCap: POLICY.MAX_REPEAT_CUSTOMER_LIMIT,
      },
    );
    const ageCapApplicable =
  age !== null &&
  age < 28;

const ageCapAdjusted =
  ageCapApplicable &&
  loanAmount >
    POLICY.REPEAT_CUSTOMER_UNDER_28_LIMIT;

rules.REPEAT_AGE_CAP_CHECK_RPM =
  rule(
    true,
    null,
    {
      applicable:
        ageCapApplicable,

      age,

      requestedLoanAmount:
        loanAmount,

      maximumAllowedAmount:
        POLICY
          .REPEAT_CUSTOMER_UNDER_28_LIMIT,

      ageCapApplied:
        repeatLimitDetails
          .ageCapApplied,

      limitAdjusted:
        ageCapAdjusted,

      adjustmentReason:
        ageCapAdjusted
          ? "REQUESTED_AMOUNT_CAPPED_TO_UNDER_28_LIMIT"
          : null,
    },
  );
  }
  const numericCreditLimit =
  Number(creditLimit);

const validCreditLimit =
  Number.isFinite(numericCreditLimit) &&
  numericCreditLimit >=
    POLICY.MIN_LOAN_AMOUNT;

const approvedLoanAmount =
  validCreditLimit
    ? Math.min(
        loanAmount,
        numericCreditLimit,
      )
    : null;

const limitAdjusted =
  validCreditLimit &&
  loanAmount >
    numericCreditLimit;

if (!validCreditLimit) {
  addReason(
    reasons,
    "CREDIT_LIMIT_COULD_NOT_BE_CALCULATED",
  );
}

rules.CREDIT_LIMIT_CHECK_RPM =
  rule(
    validCreditLimit,

    validCreditLimit
      ? null
      : "CREDIT_LIMIT_COULD_NOT_BE_CALCULATED",

    {
      creditLimit:
        validCreditLimit
          ? numericCreditLimit
          : null,

      requestedLoanAmount:
        loanAmount,

      approvedLoanAmount,

      limitAdjusted,

      adjustmentReason:
        limitAdjusted
          ? "REQUESTED_AMOUNT_CAPPED_TO_CREDIT_LIMIT"
          : null,

      newCustomer,
    },
  );
  /* * --------------------------------- * Bureau score * --------------------------------- */ let scoreReason =
    null;
  if (bureauScore === null || bureauScore === undefined) {
    scoreReason = "BUREAU_SCORE_MISSING";
  } else if (bureauScore < POLICY.MIN_BUREAU_SCORE) {
    scoreReason = "BUREAU_SCORE_BELOW_650";
  }
  addReason(reasons, scoreReason);
  rules.BUREAU_SCORE_CHECK_RPM = rule(!scoreReason, scoreReason, {
    bureauScore,
    minimumRequiredScore: POLICY.MIN_BUREAU_SCORE,
  });
  /* * --------------------------------- * Dual PAN * --------------------------------- */ const hasDualPan =
    typeof bureau.has_dual_pan === "boolean"
      ? bureau.has_dual_pan
      : panCount > 1;
  if (hasDualPan) {
    addReason(reasons, "DUAL_PAN_FOUND");
  }
  rules.DUAL_PAN_CHECK_RPM = rule(
    !hasDualPan,
    hasDualPan ? "DUAL_PAN_FOUND" : null,
    { panCount, hasDualPan },
  );
  /* * --------------------------------- * Enquiries * --------------------------------- */ const enquiriesFailed =
    enquiries30Days >= POLICY.ENQUIRY_REJECT_FROM_30_DAYS;
  if (enquiriesFailed) {
    addReason(reasons, "ENQUIRIES_GTE_5_LAST_30_DAYS");
  }
  rules.ENQUIRIES_30D_CHECK_RPM = rule(
    !enquiriesFailed,
    enquiriesFailed ? "ENQUIRIES_GTE_5_LAST_30_DAYS" : null,
    { enquiries30Days, rejectFrom: POLICY.ENQUIRY_REJECT_FROM_30_DAYS },
  );
  /* * --------------------------------- * Overdue * --------------------------------- */ const overdueFailed =
    totalOverdueAmount >= POLICY.OVERDUE_REJECT_FROM;
  if (overdueFailed) {
    addReason(reasons, "OVERDUE_AMOUNT_GTE_1000");
  }
  rules.OVERDUE_AMOUNT_CHECK_RPM = rule(
    !overdueFailed,
    overdueFailed ? "OVERDUE_AMOUNT_GTE_1000" : null,
    { totalOverdueAmount, maximumAllowedExclusive: POLICY.OVERDUE_REJECT_FROM },
  );
  /* * --------------------------------- * DPD rules * --------------------------------- */ const dpd3mFailed =
    maxDpd3m > POLICY.DPD_REJECT_ABOVE_LAST_3_MONTHS;
  if (dpd3mFailed) {
    addReason(reasons, "DPD_GT_30_LAST_3_MONTHS");
  }
  rules.DPD_30_LAST_3M_CHECK_RPM = rule(
    !dpd3mFailed,
    dpd3mFailed ? "DPD_GT_30_LAST_3_MONTHS" : null,
    {
      maximumObservedDpd: maxDpd3m,
      rejectWhenAbove: POLICY.DPD_REJECT_ABOVE_LAST_3_MONTHS,
    },
  );
  const dpd9mFailed = maxDpd9m > POLICY.DPD_REJECT_ABOVE_LAST_9_MONTHS;
  if (dpd9mFailed) {
    addReason(reasons, "DPD_GT_60_LAST_9_MONTHS");
  }
  rules.DPD_60_LAST_9M_CHECK_RPM = rule(
    !dpd9mFailed,
    dpd9mFailed ? "DPD_GT_60_LAST_9_MONTHS" : null,
    {
      maximumObservedDpd: maxDpd9m,
      rejectWhenAbove: POLICY.DPD_REJECT_ABOVE_LAST_9_MONTHS,
    },
  );
  const dpd12mFailed = maxDpd12m > POLICY.DPD_REJECT_ABOVE_LAST_12_MONTHS;
  if (dpd12mFailed) {
    addReason(reasons, "DPD_GT_90_LAST_12_MONTHS");
  }
  rules.DPD_90_LAST_12M_CHECK_RPM = rule(
    !dpd12mFailed,
    dpd12mFailed ? "DPD_GT_90_LAST_12_MONTHS" : null,
    {
      maximumObservedDpd: maxDpd12m,
      rejectWhenAbove: POLICY.DPD_REJECT_ABOVE_LAST_12_MONTHS,
    },
  );
  /* * --------------------------------- * Unsecured tradeline aggregate * --------------------------------- */ const unsecuredFailed =
    newCustomer && unsecuredTotal < POLICY.MIN_UNSECURED_AGGREGATE;
  if (unsecuredFailed) {
    addReason(reasons, "UNSECURED_TRADELINE_AGGREGATE_BELOW_200000");
  }
  rules.UNSECURED_AGGREGATION_CHECK_RPM = rule(
    !unsecuredFailed,
    unsecuredFailed ? "UNSECURED_TRADELINE_AGGREGATE_BELOW_200000" : null,
    {
      applicable: newCustomer,
      unsecuredAggregate: unsecuredTotal,
      unsecuredTradelineCount: unsecuredCount,
      minimumRequiredAggregate: POLICY.MIN_UNSECURED_AGGREGATE,
    },
  );
  const allReasons = [...technicalReasons, ...reasons];
  const decision = technicalReasons.length
    ? "TECHNICAL_FAILURE"
    : reasons.length
      ? "REJECTED"
      : "APPROVED";
  return {
    policyVersion: POLICY_VERSION,
    testMode: true,
    decision,
    reason: allReasons[0] || null,
    reasons: allReasons,
    technicalReasons,
    policyRejectionReasons: reasons,
    age,
    newCustomer,
    creditLimit,
    requestedLoanAmount:
    loanAmount,

  approvedLoanAmount,

  limitAdjusted,
    input: {
      asOfDate: asOfDate.toISOString().slice(0, 10),
      loanAmount,
      dob: payload.dob,
      previousLoanAmount,
      totalDisbursedApplications: totalDisbursed,
      aml: {
        status: amlStatus,
        score: aml.score ?? null,
        totalMatches: aml.total_matches ?? null,
      },
      bureau: {
        score: bureauScore,
        panCount,
        hasDualPan,
        enquiries30Days,
        totalOverdueAmount,
        maxDpd3m,
        maxDpd9m,
        maxDpd12m,
        unsecuredTotal,
        unsecuredCount,
      },
    },
    rules,
  };
}
module.exports = { evaluateRapidMoneyEligibility };
