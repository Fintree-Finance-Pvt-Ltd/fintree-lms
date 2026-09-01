function readNumber(value) {
  const text = String(value ?? "").replace(/,/g, "").trim();
  return text === "" ? NaN : Number(text);
}

const MIN_BUREAU_SCORE = 685;

function readBoolean(value) {
  return value === true || String(value ?? "").trim().toLowerCase() === "true";
}

function runBRE(data) {
  const errors = [];
  const skipBureau = readBoolean(data.skip_bureau);

  const loanAmount = readNumber(data.loan_amount);
  const age = readNumber(data.age);
  const annualIncome = readNumber(data.annual_income);
  const bureauScore = readNumber(
    data.bureau_score ?? data.cibil_score ?? data.fintree_cibil_score,
  );

  //  new changes
  if (!Number.isFinite(loanAmount)) {
    errors.push("loan_amount is required");
  } else if (loanAmount < 10000 || loanAmount > 200000) {
    errors.push("Loan amount must be between 10,000 and 2,00,000");
  }

  if (!Number.isFinite(age)) {
    errors.push("age is required");
  } else if (age < 21 || age > 60) {
    errors.push("Applicant age must be between 21 and 60 years");
  }

  if (!Number.isFinite(annualIncome)) {
    errors.push("annual_income is required");
  } else if (annualIncome < 300000) {
    errors.push("Minimum annual income must be 3,00,000");
  }

  if (!skipBureau) {
    if (!Number.isFinite(bureauScore)) {
      errors.push("bureau_score is required");
    } else if (bureauScore < MIN_BUREAU_SCORE) {
      errors.push(`Minimum bureau score must be ${MIN_BUREAU_SCORE}`);
    }
  }

  const reason = errors.length ? errors.join(", ") : "ELIGIBLE";

  return {
    eligible: errors.length === 0,
    decision: errors.length === 0 ? "APPROVED" : "REJECTED",
    reason,
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
