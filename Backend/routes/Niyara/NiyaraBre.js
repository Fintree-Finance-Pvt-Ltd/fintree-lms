const MIN_BUREAU_SCORE = 685;

function readNumber(value) {
  if (value === null || value === undefined) return NaN;

  const text = String(value).replace(/,/g, "").trim();
  return text === "" ? NaN : Number(text);
}

function runBRE(data) {
  const failures = [];
  const missing = [];

  // Values must come from trusted server-side records,
  // not directly from a customer's request body.
  const loanAmount = readNumber(data.requested_amount);
  const age = readNumber(data.age);
  const annualIncome = readNumber(data.annual_income);
  const bureauScore = readNumber(data.bureau_score);

  // 1. Loan amount
  if (!Number.isFinite(loanAmount)) {
    missing.push("requested_amount is required");
  } else if (loanAmount < 10000 || loanAmount > 200000) {
    failures.push("Loan amount must be between 10,000 and 2,00,000");
  }

  // 2. Applicant age
  if (!Number.isInteger(age)) {
    missing.push("Valid age is required");
  } else if (age < 21 || age > 60) {
    failures.push("Applicant age must be between 21 and 60 years");
  }

  // 3. Annual income
  if (!Number.isFinite(annualIncome)) {
    missing.push("annual_income is required");
  } else if (annualIncome < 300000) {
    failures.push("Minimum annual income must be 3,00,000");
  }

  // 4. Bureau score — mandatory
  if (!Number.isInteger(bureauScore)) {
    missing.push("Verified bureau_score is required");
  } else if (bureauScore < MIN_BUREAU_SCORE) {
    failures.push(`Minimum bureau score must be ${MIN_BUREAU_SCORE}`);
  }

  const decision = failures.length
    ? "REJECTED"
    : missing.length
      ? "PENDING"
      : "APPROVED";

  const errors = [...failures, ...missing];

  return {
    eligible: decision === "APPROVED",
    decision,
    reason: errors.length ? errors.join(", ") : "ELIGIBLE",
    reasons: errors,
    bureau_score: Number.isInteger(bureauScore) ? bureauScore : null,
    minimum_bureau_score: MIN_BUREAU_SCORE,
    bureau_validation_enabled: true,
    bureau_validation_skipped: false,
    errors,
  };
}

module.exports = {
  MIN_BUREAU_SCORE,
  runBRE,
};
