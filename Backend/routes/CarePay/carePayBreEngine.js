const isProvided = (value) =>
  value !== undefined && value !== null && String(value).trim() !== "";

const toFiniteNumber = (value, fallback = null) => {
  if (!isProvided(value)) return fallback;

  const num = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(num) ? num : fallback;
};

const calculateCarePayAge = (dob, fallbackAge) => {
  const suppliedAge = toFiniteNumber(fallbackAge);
  if (suppliedAge !== null) return suppliedAge;

  if (!isProvided(dob)) return null;

  const birthDate = new Date(dob);
  if (Number.isNaN(birthDate.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();

  if (
    monthDiff < 0 ||
    (monthDiff === 0 && today.getDate() < birthDate.getDate())
  ) {
    age -= 1;
  }

  return age;
};

const getCarePayPolicy = (loanType) => {
  const normalizedLoanType = String(loanType || "")
    .trim()
    .toLowerCase();

  if (normalizedLoanType === "short-term personal loan") {
    return {
      minAge: 18,
      maxAge: 65,
      minTenure: 1,
      maxTenure: 9,
      minAmount: 5000,
      maxAmount: 500000,
      minAnnualIncome: 114000,
      minBureauScore: 680,
    };
  }

  return {
    minAge: 18,
    maxAge: 60,
    minTenure: 2,
    maxTenure: 24,
    minAmount: 5000,
    maxAmount: 500000,
    minAnnualIncome: 120000,
    minBureauScore: 680,
  };
};

const normalizeCarePayAnnualIncome = (data) => {
  const annualIncome = toFiniteNumber(data.annual_income);
  if (annualIncome !== null) return annualIncome;

  const monthlyIncome = toFiniteNumber(
    data.monthly_income ?? data.net_monthly_income,
  );
  if (monthlyIncome === null) return null;

  return monthlyIncome * 12;
};

const evaluateCarePayLoginBre = ({ data, requestAmount, bureauScore = null }) => {
  const policy = getCarePayPolicy(data.loan_type);
  const reasons = [];

  const age = calculateCarePayAge(data.dob, data.age);
  if (age === null) {
    reasons.push("AGE_MISSING");
  } else if (age < policy.minAge || age > policy.maxAge) {
    reasons.push(`AGE_NOT_IN_${policy.minAge}_${policy.maxAge}`);
  }

  const tenure = toFiniteNumber(data.loan_tenure);
  if (tenure === null) {
    reasons.push("TENURE_MISSING");
  } else if (tenure < policy.minTenure || tenure > policy.maxTenure) {
    reasons.push(`TENURE_NOT_IN_${policy.minTenure}_${policy.maxTenure}`);
  }

  const amount = toFiniteNumber(requestAmount);
  if (amount === null) {
    reasons.push("REQUEST_AMOUNT_MISSING");
  } else if (amount < policy.minAmount || amount > policy.maxAmount) {
    reasons.push(`REQUEST_AMOUNT_NOT_IN_${policy.minAmount}_${policy.maxAmount}`);
  }

  const annualIncome = normalizeCarePayAnnualIncome(data);
  if (annualIncome === null) {
    reasons.push("INCOME_MISSING");
  } else if (annualIncome < policy.minAnnualIncome) {
    reasons.push(`INCOME_BELOW_${policy.minAnnualIncome}`);
  }

  const score =
    toFiniteNumber(bureauScore) ??
    toFiniteNumber(data.cibil_score) ??
    toFiniteNumber(data.cibil_score_fintree);
  const isNtcCustomer = String(data.customer_type || "")
    .trim()
    .toLowerCase()
    .includes("ntc");

  if (!isNtcCustomer && score !== null && score < policy.minBureauScore) {
    reasons.push(`CIBIL_SCORE_BELOW_${policy.minBureauScore}`);
  }

  return {
    status: reasons.length ? "BRE FAILED" : "BRE APPROVED",
    caseStatus: reasons.length ? "Rejected" : "BRE Approved",
    reason: reasons.length ? reasons.join(", ") : "ELIGIBLE",
    reasons,
    bureauScore: score,
  };
};

module.exports = {
  evaluateCarePayLoginBre,
};
