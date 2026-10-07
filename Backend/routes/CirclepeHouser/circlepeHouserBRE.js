/**
 * CirclePe Houser Business Rule Engine (BRE)
 * Validates loan applications against defined policy & underwriting rules.
 */

// ─── Configurable Policy Rules & Thresholds ──────────────────────────────────
const CIRCLE_PE_HOUSER_BRE_CONFIG = {
  // Age Limits (in years)
  minAge: 21,
  maxAge: 60,

  // Credit Score Thresholds
  minCibilScore: 650,
  allowNtc: true, // Allow New-to-Credit (-1 or 0) if configured, set to false to strictly reject

  // Loan Amount Limits (in INR)
  minLoanAmount: 5000,
  maxLoanAmount: 1000000,

  // Loan Tenure Limits (in Months)
  minTenureMonths: 1,
  maxTenureMonths: 60,

  // Interest Rate Limits (% per annum)
  minInterestRate: 0,
  maxInterestRate: 60,

  // Allowed Gender values
  allowedGenders: ["Male", "Female", "Other"],

  // Allowed Products
  allowedProducts: ["Monthly Loan", "Bullet Loan"],
};

/**
 * Helper to calculate age from Date of Birth
 */
function calculateAge(dob) {
  if (!dob) return null;
  const birthDate = new Date(dob);
  if (Number.isNaN(birthDate.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }

  return age;
}

/**
 * Evaluates CirclePe Houser BRE rules on a loan application payload.
 *
 * @param {Object} loanData Validated loan data object
 * @param {Object} [customConfig] Optional rule override
 * @returns {Object} BRE evaluation result
 */
function evaluateCirclePeHouserBRE(loanData, customConfig = {}) {
  const config = { ...CIRCLE_PE_HOUSER_BRE_CONFIG, ...customConfig };
  const failures = [];
  const checks = {};

  // 1. Age Rule
  const age = calculateAge(loanData.date_of_birth || loanData.dob);
  if (age === null) {
    failures.push("Invalid or missing Date of Birth");
    checks.age = { passed: false, value: null, rule: `${config.minAge} to ${config.maxAge} years`, message: "Missing/invalid DOB" };
  } else if (age < config.minAge || age > config.maxAge) {
    failures.push(`Age (${age} yrs) is outside the eligible range of ${config.minAge}-${config.maxAge} years`);
    checks.age = { passed: false, value: age, rule: `${config.minAge} to ${config.maxAge} years`, message: "Age criteria not met" };
  } else {
    checks.age = { passed: true, value: age, rule: `${config.minAge} to ${config.maxAge} years` };
  }

  // 2. CIBIL / Bureau Score Rule
  const cibil = Number(loanData.credit_score ?? loanData.cibil_score);
  if (Number.isNaN(cibil)) {
    failures.push("Credit score is missing or invalid");
    checks.cibilScore = { passed: false, value: cibil, rule: `>= ${config.minCibilScore}`, message: "Invalid CIBIL score" };
  } else if (cibil === -1 || cibil === 0) {
    if (!config.allowNtc) {
      failures.push("New to credit (No CIBIL score) is not permitted under current policy");
      checks.cibilScore = { passed: false, value: cibil, rule: `>= ${config.minCibilScore}`, message: "NTC not allowed" };
    } else {
      checks.cibilScore = { passed: true, value: cibil, rule: `NTC Allowed (-1)`, message: "New to credit accepted" };
    }
  } else if (cibil < config.minCibilScore) {
    failures.push(`CIBIL Score (${cibil}) is below the minimum threshold of ${config.minCibilScore}`);
    checks.cibilScore = { passed: false, value: cibil, rule: `>= ${config.minCibilScore}`, message: "CIBIL score below cutoff" };
  } else {
    checks.cibilScore = { passed: true, value: cibil, rule: `>= ${config.minCibilScore}` };
  }

  // 3. Loan Amount Rule
  const loanAmount = Number(loanData.loan_amount_sanctioned ?? loanData.loan_amount);
  if (!loanAmount || loanAmount < config.minLoanAmount || loanAmount > config.maxLoanAmount) {
    failures.push(`Loan Amount (₹${loanAmount}) is outside the acceptable limit of ₹${config.minLoanAmount} - ₹${config.maxLoanAmount}`);
    checks.loanAmount = { passed: false, value: loanAmount, rule: `₹${config.minLoanAmount} - ₹${config.maxLoanAmount}`, message: "Amount limit exceeded/below threshold" };
  } else {
    checks.loanAmount = { passed: true, value: loanAmount, rule: `₹${config.minLoanAmount} - ₹${config.maxLoanAmount}` };
  }

  // 4. Loan Tenure Rule
  const tenure = Number(loanData.loan_tenure_months ?? loanData.loan_tenure);
  if (!tenure || tenure < config.minTenureMonths || tenure > config.maxTenureMonths) {
    failures.push(`Loan Tenure (${tenure} months) is outside acceptable range of ${config.minTenureMonths}-${config.maxTenureMonths} months`);
    checks.tenure = { passed: false, value: tenure, rule: `${config.minTenureMonths} - ${config.maxTenureMonths} months`, message: "Tenure out of policy" };
  } else {
    checks.tenure = { passed: true, value: tenure, rule: `${config.minTenureMonths} - ${config.maxTenureMonths} months` };
  }

  // 5. Interest Rate Rule
  const interest = Number(loanData.interest_percent ?? loanData.interest_rate);
  if (interest === undefined || interest < config.minInterestRate || interest > config.maxInterestRate) {
    failures.push(`Interest rate (${interest}%) is outside allowed range of ${config.minInterestRate}%-${config.maxInterestRate}%`);
    checks.interestRate = { passed: false, value: interest, rule: `${config.minInterestRate}% - ${config.maxInterestRate}%` };
  } else {
    checks.interestRate = { passed: true, value: interest, rule: `${config.minInterestRate}% - ${config.maxInterestRate}%` };
  }

  // 6. PAN & Aadhaar Integrity Rule
  const pan = String(loanData.pan_number || "").trim().toUpperCase();
  const isPanValid = /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan);
  const aadhaar = String(loanData.aadhaar_number || loanData.aadhar_number || "").trim();
  const isAadhaarValid = /^\d{4}$/.test(aadhaar) || /^\d{12}$/.test(aadhaar);

  if (!isPanValid) {
    failures.push("PAN number format is invalid");
    checks.pan = { passed: false, value: pan, rule: "Valid 10-character PAN format" };
  } else {
    checks.pan = { passed: true, value: pan };
  }

  if (!isAadhaarValid) {
    failures.push("Aadhaar digits format is invalid");
    checks.aadhaar = { passed: false, value: aadhaar, rule: "Valid 4-digit last digits or 12-digit Aadhaar" };
  } else {
    checks.aadhaar = { passed: true, value: aadhaar };
  }

  // 7. Banking Details Rule
  const ifsc = String(loanData.ifsc_code || loanData.ifsc || "").trim().toUpperCase();
  const accNo = String(loanData.institute_account_number || loanData.account_number || "").trim();
  const isIfscValid = /^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc);
  const isAccValid = accNo.length >= 6 && accNo.length <= 30;

  if (!isIfscValid || !isAccValid) {
    failures.push("Banking information (IFSC or Account Number) is invalid");
    checks.bankDetails = { passed: false, value: { ifsc, accNo }, rule: "Valid IFSC and Account Number" };
  } else {
    checks.bankDetails = { passed: true, value: { ifsc, accNo } };
  }

  // 8. Pincode Rule
  const pincode = String(loanData.current_address_pincode || loanData.current_pincode || "").trim();
  const isPincodeValid = /^[1-9][0-9]{5}$/.test(pincode);
  if (!isPincodeValid) {
    failures.push("Address pincode is invalid (must be 6-digit number)");
    checks.pincode = { passed: false, value: pincode, rule: "Valid 6-digit Indian PIN code" };
  } else {
    checks.pincode = { passed: true, value: pincode };
  }

  // Final Decision
  const passed = failures.length === 0;
  const decision = passed ? "BRE APPROVED" : "BRE REJECTED";
  const status = passed ? "BRE Approved" : "BRE Rejected";

  return {
    passed,
    decision,
    status,
    reasons: failures,
    checks,
    evaluatedAt: new Date().toISOString(),
  };
}

module.exports = {
  CIRCLE_PE_HOUSER_BRE_CONFIG,
  calculateAge,
  evaluateCirclePeHouserBRE,
};
