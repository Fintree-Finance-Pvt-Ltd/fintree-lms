const db = require("../config/db");

const toNumber = (value, fallback = null) => {
  if (value === undefined || value === null || value === "") return fallback;

  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const normalize = (value) =>
  String(value || "")
    .trim()
    .toUpperCase();

const calculateAge = (dob) => {
  if (!dob) return null;

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

const estimateEmi = ({ amount, annualRate, tenure }) => {
  const loanAmount = toNumber(amount, 0);
  const rate = toNumber(annualRate, 0) / 100 / 12;
  const months = toNumber(tenure, 0);

  if (!loanAmount || !months) return 0;
  if (!rate) return loanAmount / months;

  const factor = Math.pow(1 + rate, months);
  return (loanAmount * rate * factor) / (factor - 1);
};

const evaluateSterlionPolicy = ({ loan, bureauScore }) => {
  const reasons = [];
  const deviations = [];
  const pending = [];

  const requestAmount = toNumber(loan.request_amount, 0);
  const tenure = toNumber(loan.loan_tenure, 0);
  const interestRate = toNumber(loan.interest_rate, 24);
  const annualIncome = toNumber(loan.annual_income, 0);
  const monthlyIncome =
    toNumber(loan.monthly_income, null) || (annualIncome ? annualIncome / 12 : 0);
  const monthlyObligation = toNumber(loan.monthly_obligation, 0);
  const businessVintageMonths = toNumber(loan.business_vintage_months, 0);
  const score = toNumber(bureauScore ?? loan.cibil_score_fintree, null);
  const age = calculateAge(loan.dob);
  const constitution = normalize(loan.business_type);

  if (requestAmount < 50000) reasons.push("REQUEST_AMOUNT_BELOW_50000");
  if (requestAmount > 5000000) reasons.push("REQUEST_AMOUNT_ABOVE_5000000");

  if (!tenure) reasons.push("TENURE_MISSING");
  if (tenure > 36) reasons.push("TENURE_ABOVE_36_MONTHS");

  if (age === null) {
    reasons.push("AGE_MISSING");
  } else {
    if (age < 21) reasons.push("AGE_BELOW_21");
    if (age > 65) reasons.push("AGE_ABOVE_65");
  }

  if (businessVintageMonths < 24) {
    reasons.push("BUSINESS_VINTAGE_BELOW_24_MONTHS");
  }

  if (annualIncome < 300000) {
    reasons.push("ANNUAL_INCOME_BELOW_300000");
  }

  if (
    constitution &&
    ![
      "PROPRIETORSHIP",
      "SOLE PROPRIETORSHIP",
      "PARTNERSHIP",
      "PARTNERSHIP FIRM",
      "PRIVATE LIMITED",
      "PVT LTD",
      "LLP",
      "LIMITED LIABILITY PARTNERSHIP",
    ].includes(constitution)
  ) {
    deviations.push("BUSINESS_TYPE_REQUIRES_CREDIT_REVIEW");
  }

  if (!loan.gst_number && !loan.udyam_registration_no) {
    deviations.push("GST_OR_UDYAM_MISSING");
  }

  if (score === null) {
    pending.push("BUREAU_SCORE_MISSING");
  } else if (score < 650) {
    reasons.push("CIBIL_SCORE_BELOW_650");
  } else if (score < 700) {
    deviations.push("CIBIL_SCORE_650_TO_699");
  }

  const proposedEmi = estimateEmi({
    amount: requestAmount,
    annualRate: interestRate,
    tenure,
  });
  const foir = monthlyIncome ? (monthlyObligation + proposedEmi) / monthlyIncome : null;

  if (foir === null) {
    reasons.push("MONTHLY_INCOME_MISSING");
  } else if (foir > 0.75) {
    reasons.push("FOIR_ABOVE_75_PERCENT");
  } else if (foir > 0.65) {
    deviations.push("FOIR_65_TO_75_PERCENT");
  }

  let breStatus = "BRE APPROVED";

  if (reasons.length) {
    breStatus = "BRE REJECTED";
  } else if (pending.length) {
    breStatus = "Pending";
  } else if (deviations.length) {
    breStatus = "BRE DEVIATION";
  }

  return {
    breStatus,
    reasons,
    deviations,
    pending,
    bureauScore: score,
    estimatedEmi: Math.round(proposedEmi),
    foir: foir === null ? null : Number((foir * 100).toFixed(2)),
  };
};

const runSterlionBre = async (lan, bureauScore = null) => {
  const [rows] = await db.promise().query(
    `SELECT *
     FROM loan_booking_sterlion
     WHERE lan = ?
     LIMIT 1`,
    [lan],
  );

  const loan = rows[0];
  if (!loan) {
    throw new Error(`Sterlion loan not found for LAN ${lan}`);
  }

  const decision = evaluateSterlionPolicy({ loan, bureauScore });
  const reasonText = [
    ...(decision.reasons || []),
    ...(decision.deviations || []),
    ...(decision.pending || []),
  ].length
    ? [
        ...decision.reasons,
        ...decision.deviations,
        ...decision.pending,
      ].join(", ")
    : "ELIGIBLE";

  let status = "Login";
  let stage = "BRE Approved";

  if (decision.breStatus === "BRE REJECTED") {
    status = "rejected";
    stage = "BRE Rejected";
  } else if (decision.breStatus === "BRE DEVIATION") {
    stage = "BRE Deviation";
  } else if (decision.breStatus === "Pending") {
    stage = "BRE Pending";
  }

  await db.promise().query(
    `UPDATE loan_booking_sterlion
     SET
       sterlion_bre_status = ?,
       sterlion_bre_reason = ?,
       sterlion_bre_checked_at = NOW(),
       cibil_score_fintree = COALESCE(?, cibil_score_fintree),
       estimated_emi = ?,
       foir_percentage = ?,
       status = ?,
       stage = ?,
       reject_reason = ?
     WHERE lan = ?`,
    [
      decision.breStatus,
      reasonText,
      decision.bureauScore,
      decision.estimatedEmi,
      decision.foir,
      status,
      stage,
      decision.reasons.length ? decision.reasons.join(", ") : null,
      lan,
    ],
  );

  return {
    ...decision,
    reasonText,
    status,
    stage,
  };
};

module.exports = {
  evaluateSterlionPolicy,
  runSterlionBre,
};
