// services/heliumBreService.js

function calculateAge(dobDate) {
  if (!dobDate) return null;
  const d = dobDate instanceof Date ? dobDate : new Date(dobDate);
  const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--;
  return age;
}

function mapExperianScoreToPolicy(experianScore) {
  if (experianScore == null) return 25;
  if (experianScore >= 740) return 90;
  if (experianScore >= 690) return 75;
  if (experianScore >= 640) return 50;
  return 25;
}

function mapAgeScore(age) {
  if (age == null) return 25;
  if (age >= 45 && age <= 60) return 90;
  if (age >= 35 && age < 45) return 75;
  if (age >= 25 && age < 35) return 50;
  if (age >= 18 && age < 25) return 25;
  return 25;
}

function mapCustomerTypeScore(type) {
  if (!type) return 50;
  const t = String(type).toLowerCase();
  if (t.includes("family")) return 90;
  return 50; // individual / others
}

function mapEmploymentScore(empType) {
  if (!empType) return 50;
  const e = String(empType).toLowerCase();
  if (e.includes("salaried")) return 90;
  if (e.includes("business") || e.includes("self")) return 50;
  return 50;
}

function mapIncomeRentScore(netIncome, avgRent) {
  if (!netIncome || !avgRent || avgRent <= 0) return 25;
  const ratio = netIncome / avgRent;
  if (ratio >= 4) return 90;
  if (ratio >= 3) return 75;
  if (ratio >= 2) return 50;
  return 25;
}

function computeHeliumRiskScore({
  dob,
  cibilScore,
  customerType,
  employmentType,
  netMonthlyIncome,
  avgMonthlyRent,
}) {
  const age = calculateAge(dob);
  const creditScoreComp = mapExperianScoreToPolicy(cibilScore);
  const ageScore = mapAgeScore(age);
  const custTypeScore = mapCustomerTypeScore(customerType);
  const empScore = mapEmploymentScore(employmentType);
  const incomeScore = mapIncomeRentScore(netMonthlyIncome, avgMonthlyRent);

  const demographicScore = (ageScore + custTypeScore) / 2;

  const hrs =
    0.35 * creditScoreComp +
    0.25 * incomeScore +
    0.15 * empScore +
    0.25 * demographicScore;

  // Round to 2 decimals
  const finalHrs = Math.round(hrs * 100) / 100;

  // Risk bucket mapping
  let riskBand = "Not Eligible";
  let loanMonths = 0;
  let depositMonths = 0;

  if (finalHrs >= 80) {
    riskBand = "Low";
    loanMonths = 3;
    depositMonths = 1;
  } else if (finalHrs >= 70) {
    riskBand = "Moderate";
    loanMonths = 2;
    depositMonths = 2;
  } else if (finalHrs >= 50) {
    riskBand = "High";
    loanMonths = 1;
    depositMonths = 3;
  } else {
    riskBand = "Not Eligible";
    loanMonths = 0;
    depositMonths = 0;
  }

  return {
    hrs: finalHrs,
    riskBand,
    loanMonths,
    depositMonths,
  };
}

module.exports = {
  computeHeliumRiskScore,
};
