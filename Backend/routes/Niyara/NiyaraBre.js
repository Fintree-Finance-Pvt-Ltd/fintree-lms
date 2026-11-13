
const MIN_BUREAU_SCORE = 680;

const POLICY = Object.freeze({
  minLoan: 25000,
  maxLoan: 300000,
  maxNtcLoan: 150000,

  minAge: 21,
  maxAgeAtMaturity: 65,

  minTenureMonths: 3,
  maxTenureMonths: 24,

  minBusinessRevenueMonthly: 25000,
  minBusinessVintageMonths: 12,
  minBureauVintageMonths: 24,

  maxEnquiries3m: 6,

  minInterestRate: 39,
  maxInterestRate: 45,

  minProcessingFeePercent: 3,
  maxProcessingFeePercent: 5,

  documentationCharges: 300,
});

const ELIGIBLE_ENTITIES = new Set([
  "PROPRIETORSHIP",
  "PARTNERSHIP",
  "LLP",
  "AOP",
  "BOI",
  "REGISTERED AOP",
  "REGISTERED BOI",
  "TRUST",
  "COMPANY",
  "PRIVATE LIMITED COMPANY",
  "PUBLIC LIMITED COMPANY",
  "OPC",
]);

const ELIGIBLE_PURPOSES = new Set([
  "WORKING CAPITAL",
  "BUSINESS EXPANSION",
  "EXPANSION",
  "CAPEX",
  "CAPITAL EXPENDITURE",
  "HIGH COST DEBT REPAYMENT",
  "REPAYMENT OF HIGH COST DEBT",
]);

const EXCLUDED_INDUSTRIES = new Set([
  "JEWELLER",
  "JEWELLERY",
  "BULLION TRADING",
  "BULLION TRADER",
  "POLITICIAN",
  "POLITICS",
  "WINE SHOP",
  "LIQUOR SHOP",
  "ALCOHOL RETAIL",
  "LOTTERY",
  "GAMBLING",
  "REAL ESTATE BROKER",
  "REAL ESTATE BROKERAGE",
  "DSA",
  "DIRECT SELLING AGENT",
]);

function readNumber(value) {
  if (value === null || value === undefined || value === "") {
    return NaN;
  }

  const number = Number(String(value).replace(/,/g, "").trim());

  return Number.isFinite(number) ? number : NaN;
}

function normalize(value) {
  return String(value ?? "")
    .trim()
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function readBoolean(value) {
  if (value === true || value === 1 || value === "1") return true;
  if (value === false || value === 0 || value === "0") return false;

  const text = normalize(value);

  if (["TRUE", "YES", "VERIFIED", "COMPLETED"].includes(text)) {
    return true;
  }

  if (["FALSE", "NO", "FAILED", "REJECTED"].includes(text)) {
    return false;
  }

  return null;
}

function runBRE(data = {}) {
  const failures = [];
  const missing = [];

  const fail = (message) => failures.push(message);
  const pending = (message) => missing.push(message);

  const loanAmount = readNumber(data.requested_amount);
  const age = readNumber(data.age);
  const tenure = readNumber(data.loan_tenure ?? data.tenure);
  const bureauScore = readNumber(data.bureau_score);

  const isNtc = readBoolean(data.is_ntc);

  // const revenue = readNumber(data.monthly_business_revenue);
  // const businessVintage = readNumber(data.business_vintage_months);
  const bureauVintage = readNumber(data.bureau_vintage_months);
  const enquiries3m = readNumber(data.enquiries_3m);

  const interestRate = readNumber(data.interest_rate ?? data.roi);
  const processingFee = readNumber(data.processing_fee_percentage);

  const businessType = normalize(data.business_type);
  // const loanPurpose = normalize(data.loan_purpose);
  const industry = normalize(data.industry);

  // 1. Loan amount
  if (!Number.isFinite(loanAmount)) {
    pending("Requested loan amount is required");
  } else if (
    loanAmount < POLICY.minLoan ||
    loanAmount > POLICY.maxLoan
  ) {
    fail("Loan amount must be between 25,000 and 3,00,000");
  }

  // 2. New-to-credit assessment
  if (isNtc === null) {
    pending("NTC classification is required");
  } else if (isNtc) {
    if (
      Number.isFinite(loanAmount) &&
      loanAmount > POLICY.maxNtcLoan
    ) {
      fail("NTC loan amount cannot exceed 1,50,000");
    }

    const bankingAssessment = readBoolean(
      data.banking_assessment_approved
    );

    const householdAssessment = readBoolean(
      data.household_assessment_completed
    );

    if (bankingAssessment === null) {
      pending("NTC banking assessment is required");
    } else if (!bankingAssessment) {
      fail("NTC banking assessment not approved");
    }

    if (householdAssessment === null) {
      pending("NTC household assessment is required");
    } else if (!householdAssessment) {
      fail("NTC household assessment not completed");
    }
  }

  // 3. Tenure
  if (!Number.isInteger(tenure)) {
    pending("Loan tenure in months is required");
  } else if (
    tenure < POLICY.minTenureMonths ||
    tenure > POLICY.maxTenureMonths
  ) {
    fail("Loan tenure must be between 3 and 24 months");
  }

  // 4. Borrower age
  if (!Number.isInteger(age)) {
    pending("Valid borrower age is required");
  } else if (age < POLICY.minAge) {
    fail("Minimum borrower age is 21 years");
  } else if (age >= POLICY.maxAgeAtMaturity) {
    fail("Borrower must be below 65 years at maturity");
  }

  // Exact age-at-maturity check requires a trusted DOB
  // and expected maturity date.
  if (
    Number.isInteger(age) &&
    age >= 63 &&
    age < 65 &&
    Number.isInteger(tenure)
  ) {
    const dob = data.borrower_dob;
    const maturityDate = data.expected_maturity_date;

    const dobMs = Date.parse(dob);
    const maturityMs = Date.parse(maturityDate);

    if (
      !dob ||
      !maturityDate ||
      !Number.isFinite(dobMs) ||
      !Number.isFinite(maturityMs)
    ) {
      pending("DOB and expected maturity date required");
    } else {
      const birth = new Date(dobMs);
      const maturity = new Date(maturityMs);

      const sixtyFifthBirthday = new Date(
        Date.UTC(
          birth.getUTCFullYear() + 65,
          birth.getUTCMonth(),
          birth.getUTCDate()
        )
      );

      if (maturity > sixtyFifthBirthday) {
        fail("Borrower age exceeds 65 years at maturity");
      }
    }
  }

  // 5. Bureau score
  if (isNtc === false) {
    if (!Number.isInteger(bureauScore)) {
      pending("Verified Bureau score is required");
    } else if (bureauScore < MIN_BUREAU_SCORE) {
      fail("Minimum CIBIL score must be 680");
    }
  }

  // 6. Enquiries during latest three months
  if (!Number.isInteger(enquiries3m)) {
    pending("Latest 3-month Bureau enquiries required");
  } else if (enquiries3m < 0 || enquiries3m > POLICY.maxEnquiries3m) {
    fail("Maximum 6 Bureau enquiries allowed in 3 months");
  }

  // 7. Monthly business revenue
  // if (!Number.isFinite(revenue)) {
  //   pending("Monthly business revenue is required");
  // } else if (revenue < POLICY.minBusinessRevenueMonthly) {
  //   fail("Minimum monthly business revenue is 25,000");
  // }

  // 8. Business vintage
  // if (!Number.isFinite(businessVintage)) {
  //   pending("Verified business vintage is required");
  // } else if (businessVintage < POLICY.minBusinessVintageMonths) {
  //   fail("Minimum business vintage is 12 months");
  // }

  // 9. Bureau vintage
  // NTC customers follow their separate assessment policy.
  if (isNtc === false) {
    if (!Number.isFinite(bureauVintage)) {
      pending("Bureau vintage is required");
    } else if (bureauVintage < POLICY.minBureauVintageMonths) {
      fail("Minimum Bureau vintage is 24 months");
    }
  }

  // 10. Entity type
  if (!businessType) {
    pending("Business entity type is required");
  } else if (!ELIGIBLE_ENTITIES.has(businessType)) {
    fail("Business entity type is not eligible");
  }

  // 11. Loan purpose
  // if (!loanPurpose) {
  //   pending("Loan purpose is required");
  // } else if (!ELIGIBLE_PURPOSES.has(loanPurpose)) {
  //   fail("Loan purpose is not permitted under Niyara policy");
  // }

  // 12. Negative industry
  if (!industry) {
    pending("Industry classification is required");
  } else if (EXCLUDED_INDUSTRIES.has(industry)) {
    fail("Industry is excluded under Niyara policy");
  }

  // 13. Interest rate: reducing balance
  if (!Number.isFinite(interestRate)) {
    pending("Interest rate is required");
  } else if (
    interestRate < POLICY.minInterestRate ||
    interestRate > POLICY.maxInterestRate
  ) {
    fail("Interest rate must be 39% to 45% p.a. reducing");
  }

  // 14. Processing fee
  if (!Number.isFinite(processingFee)) {
    pending("Processing fee percentage is required");
  } else if (
    processingFee < POLICY.minProcessingFeePercent ||
    processingFee > POLICY.maxProcessingFeePercent
  ) {
    fail("Processing fee must be between 3% and 5%");
  }

  // 15. Property ownership / local stability


  // 18. Final decision
  const decision =
    failures.length > 0
      ? "REJECTED"
      : missing.length > 0
        ? "PENDING"
        : "APPROVED";

  const errors = [...failures, ...missing];

  return {
    eligible: decision === "APPROVED",
    decision,
    reason: errors.length ? errors.join(", ") : "ELIGIBLE",
    reasons: errors,

    failures,
    missing,

    bureau_score: Number.isInteger(bureauScore)
      ? bureauScore
      : null,

    minimum_bureau_score: MIN_BUREAU_SCORE,

    is_ntc: isNtc,
    max_loan_amount: isNtc
      ? POLICY.maxNtcLoan
      : POLICY.maxLoan,

    documentation_charges: POLICY.documentationCharges,

    bureau_validation_enabled: true,
    bureau_validation_skipped: isNtc === true,

    errors,
  };
}

module.exports = {
  MIN_BUREAU_SCORE,
  POLICY,
  runBRE,
};
