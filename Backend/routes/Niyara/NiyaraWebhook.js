function readNumber(value) {
  const text = String(value ?? "")
    .replace(/,/g, "")
    .trim();
  return text === "" ? NaN : Number(text);
}

// TEMPORARY: YaMoney reference rules.
// Replace with the approved Niyara UBL policy.
const MIN_BUREAU_SCORE = 685;
const MIN_LOAN_AMOUNT = 10000;
const MAX_LOAN_AMOUNT = 200000;
const MIN_AGE = 21;
const MAX_AGE = 60;
const MIN_ANNUAL_INCOME = 300000;

function runBRE(data, options = {}) {
  const errors = [];

  // Bureau bypass must be authorized by backend,
  // never directly from partner/customer payload.
  const skipBureau = options.skipBureau === true;

  const loanAmount = readNumber(data.loan_amount ?? data.requested_amount);

  const age = readNumber(data.age);
  const annualIncome = readNumber(data.annual_income);

  const bureauScore = readNumber(
    data.bureau_score ?? data.cibil_score ?? data.fintree_cibil_score,
  );

  // 1. Loan Amount Validation
  if (!Number.isFinite(loanAmount)) {
    errors.push("loan_amount is required");
  } else if (loanAmount < MIN_LOAN_AMOUNT || loanAmount > MAX_LOAN_AMOUNT) {
    errors.push("Loan amount must be between 10,000 and 2,00,000");
  }

  // 2. Age Validation
  if (!Number.isFinite(age)) {
    errors.push("age is required");
  } else if (age < MIN_AGE || age > MAX_AGE) {
    errors.push("Applicant age must be between 21 and 60 years");
  }

  // 3. Annual Income Validation
  if (!Number.isFinite(annualIncome)) {
    errors.push("annual_income is required");
  } else if (annualIncome < MIN_ANNUAL_INCOME) {
    errors.push("Minimum annual income must be 3,00,000");
  }

  // 4. Bureau Validation
  if (!skipBureau) {
    if (!Number.isFinite(bureauScore)) {
      errors.push("bureau_score is required");
    } else if (bureauScore < MIN_BUREAU_SCORE) {
      errors.push(`Minimum bureau score must be ${MIN_BUREAU_SCORE}`);
    }
  }

  // 5. BRE Decision
  const eligible = errors.length === 0;

  return {
    eligible,
    decision: eligible ? "APPROVED" : "REJECTED",
    reason: eligible ? "ELIGIBLE" : errors.join(", "),
    reasons: errors,

    bureau_score: Number.isFinite(bureauScore) ? bureauScore : null,

    minimum_bureau_score: MIN_BUREAU_SCORE,
    bureau_validation_enabled: !skipBureau,
    bureau_validation_skipped: skipBureau,

    errors,
  };
}

module.exports = {
  MIN_BUREAU_SCORE,
  runBRE,
};
