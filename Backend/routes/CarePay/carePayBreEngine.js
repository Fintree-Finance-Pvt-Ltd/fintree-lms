const isProvided = (value) =>
  value !== undefined && value !== null && String(value).trim() !== "";
const CAREPAY_BRE_APPROVED_STATUS = "BRE Approved";

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

const toNumber = (value, fallback = null) => {
  if (!isProvided(value)) return fallback;
  const num = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(num) ? num : fallback;
};

const toArray = (value) => {
  if (Array.isArray(value)) return value;
  if (!isProvided(value)) return [];
  return [value];
};

const monthsDiff = (from, to) => {
  if (!from || !to || Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return null;
  }
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
};

const extractCarePayBureauDpd = (bureauResponse) => {
  if (!bureauResponse || typeof bureauResponse !== "object") {
    return null;
  }

  const profile = bureauResponse?.INProfileResponse;
  if (!profile || typeof profile !== "object") {
    return null;
  }

  const accounts = toArray(profile?.CAIS_Account?.CAIS_Account_DETAILS);
  if (!accounts.length) {
    return null;
  }

  const now = new Date();
  let hasDpd3M = false;
  let hasDpd6M = false;
  let has60Plus6M = false;
  let has90Plus6M = false;
  let maxDpd = 0;

  for (const account of accounts) {
    const histories = toArray(account?.CAIS_Account_History);

    for (const history of histories) {
      const year = toNumber(history?.Year, null);
      const month = toNumber(history?.Month, null);
      const dpd = toNumber(history?.Days_Past_Due, 0);

      if (!year || !month) continue;

      const historyDate = new Date(year, month - 1, 1);
      const monthsAgo = monthsDiff(historyDate, now);

      if (monthsAgo === null || monthsAgo < 0) continue;

      if (dpd > 0) {
        if (monthsAgo < 3) hasDpd3M = true;
        if (monthsAgo < 6) {
          hasDpd6M = true;
          if (dpd >= 60) has60Plus6M = true;
          if (dpd >= 90) has90Plus6M = true;
        }
      }

      if (dpd > maxDpd) maxDpd = dpd;
    }
  }

  return {
    has_dpd_3m: hasDpd3M,
    has_dpd_6m: hasDpd6M,
    has_60plus_dpd_6m: has60Plus6M,
    has_90plus_dpd_6m: has90Plus6M,
    max_dpd: maxDpd,
  };
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
    caseStatus: reasons.length ? "Rejected" : CAREPAY_BRE_APPROVED_STATUS,
    reason: reasons.length ? reasons.join(", ") : "ELIGIBLE",
    reasons,
    bureauScore: score,
  };
};


const buildBreSnapshot = ({ data, requestAmount, bureauScore = null, decision, bureauResponse = null }) => {
  const policy = getCarePayPolicy(data.loan_type);

  const age = calculateCarePayAge(data.dob, data.age);
  const tenure = toFiniteNumber(data.loan_tenure);
  const amount = toFiniteNumber(requestAmount);
  const annualIncome = normalizeCarePayAnnualIncome(data);

  const score =
    toFiniteNumber(bureauScore) ??
    toFiniteNumber(data.cibil_score) ??
    toFiniteNumber(data.cibil_score_fintree);

  const isNtcCustomer = String(data.customer_type || "")
    .trim()
    .toLowerCase()
    .includes("ntc");

  const dpdFacts = extractCarePayBureauDpd(bureauResponse);

  return {
    evaluated_at: new Date().toISOString(),

    // raw inputs used by BRE
    inputs: {
      loan_type: data.loan_type ?? null,
      dob: data.dob ?? null,
      age_supplied: data.age ?? null,
      loan_tenure: data.loan_tenure ?? null,
      request_amount: requestAmount ?? null,
      annual_income: data.annual_income ?? null,
      monthly_income: data.monthly_income ?? null,
      net_monthly_income: data.net_monthly_income ?? null,
      cibil_score: data.cibil_score ?? null,
      cibil_score_fintree: data.cibil_score_fintree ?? null,
      bureau_score_used: bureauScore ?? null,
      customer_type: data.customer_type ?? null,
    },

    // values the engine actually computed / normalised
    computed: {
      age,
      tenure,
      amount,
      annual_income: annualIncome,
      bureau_score: score,
      is_ntc_customer: isNtcCustomer,
      dpd: dpdFacts,
    },

    // policy applied for this loan_type
    policy,

    // decision
    decision: {
      status: decision.status,       // BRE APPROVED | BRE FAILED
      caseStatus: decision.caseStatus, // BRE Approved | Rejected
      reason: decision.reason,
      reasons: decision.reasons,
    },
  };
};

module.exports = {
  evaluateCarePayLoginBre,
  buildBreSnapshot,
  getCarePayPolicy,
  calculateCarePayAge,
  normalizeCarePayAnnualIncome,
  toFiniteNumber,
  isProvided,
};
