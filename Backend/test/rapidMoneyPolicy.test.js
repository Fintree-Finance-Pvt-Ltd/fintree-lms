const test = require("node:test");
const assert = require("node:assert/strict");
const {
  validateAge,
  validateLoanAmount,
  validateTenure,
  validateRepaymentDate,
  calculateRepeatCreditLimit,
  validatePricing,
  parseBureauReport,
} = require("../routes/switchMyLoan/rapidMoneyPolicy");

test("age boundaries", () => {
  const asOf = new Date("2026-07-01T00:00:00Z");
  assert.equal(validateAge("2000-07-01", asOf).passed, true);
  assert.equal(validateAge("2000-07-02", asOf).reason, "AGE_BELOW_26");
  assert.equal(validateAge("1968-07-01", asOf).passed, true);
  assert.equal(validateAge("1967-06-30", asOf).reason, "AGE_ABOVE_58");
  assert.equal(validateAge("not-a-date", asOf).reason, "AGE_MISSING_OR_INVALID");
});

test("loan amount policy", () => {
  assert.equal(validateLoanAmount(8000).passed, true);
  assert.equal(validateLoanAmount(15000).passed, true);
  assert.equal(validateLoanAmount(7000).reason, "LOAN_AMOUNT_OUTSIDE_8000_TO_15000");
  assert.equal(validateLoanAmount(16000).reason, "LOAN_AMOUNT_OUTSIDE_8000_TO_15000");
  assert.equal(validateLoanAmount(8500).reason, "LOAN_AMOUNT_NOT_MULTIPLE_OF_1000");
});

test("tenure policy", () => {
  assert.equal(validateTenure(35).passed, true);
  assert.equal(validateTenure(40).passed, true);
  assert.equal(validateTenure(34).reason, "TENURE_OUTSIDE_35_TO_40_DAYS");
  assert.equal(validateTenure(41).reason, "TENURE_OUTSIDE_35_TO_40_DAYS");
});

test("repayment presentation day", () => {
  assert.equal(validateRepaymentDate("2026-08-05").passed, true);
  assert.equal(validateRepaymentDate("2026-08-15").passed, true);
  assert.equal(validateRepaymentDate("2026-08-10").reason, "REPAYMENT_DATE_MUST_BE_5TH_OR_15TH");
  assert.equal(validateRepaymentDate("bad").reason, "REPAYMENT_DATE_MISSING_OR_INVALID");
});

test("credit limit boundaries", () => {
  assert.equal(calculateRepeatCreditLimit(0, null), 8000);
  assert.equal(calculateRepeatCreditLimit(1, 8000), 10000);
  assert.equal(calculateRepeatCreditLimit(2, 8000), 10000);
  assert.equal(calculateRepeatCreditLimit(3, 6000), 12000);
  assert.equal(calculateRepeatCreditLimit(6, 6000), 12000);
  assert.equal(calculateRepeatCreditLimit(7, 6000), 15000);
  assert.equal(calculateRepeatCreditLimit(7, 10000), 15000);
  assert.equal(calculateRepeatCreditLimit(1, 11000), 13000);
});

test("pricing policy examples", () => {
  const cases = [
    [8000, 322, 960, 172.8, 6867.2, 224.91],
    [10000, 403, 1200, 216, 8584, 218.92],
    [12000, 483, 1440, 259.2, 10300.8, 214.83],
    [15000, 604, 1800, 324, 12876, 210.82],
  ];
  for (const [loanAmount, interestAmount, pfAmount, pfGst, disbursalAmount, apr] of cases) {
    const result = validatePricing({ loanAmount, tenure: 35, interestRate: 0.12, processingFee: 12, assessmentFee: 199 });
    assert.equal(result.pricing.interestAmount, interestAmount);
    assert.equal(result.pricing.pfAmount, pfAmount);
    assert.equal(result.pricing.pfGst, pfGst);
    assert.equal(result.pricing.disbursalAmount, disbursalAmount);
    assert.equal(result.pricing.apr, apr);
  }
  assert.ok(validatePricing({ loanAmount: 8000, tenure: 35, interestRate: 0.12, processingFee: 13, assessmentFee: 199 }).reasons.includes("PROCESSING_FEE_RATE_ABOVE_12_PERCENT"));
  assert.ok(validatePricing({ loanAmount: 8000, tenure: 35, interestRate: 0.13, processingFee: 12, assessmentFee: 199 }).reasons.includes("ANNUAL_FLAT_IRR_ABOVE_42_PERCENT"));
  assert.ok(validatePricing({ loanAmount: 8000, tenure: 35, interestRate: 0.12, processingFee: 12, assessmentFee: 0 }).reasons.includes("ASSESSMENT_FEE_AMOUNT_INVALID"));
});

test("bureau parser extracts score and unsecured aggregate", () => {
  const xml = `<INProfileResponse><SCORE><BureauScore>700</BureauScore></SCORE><CAIS_Account><Account_Type>05</Account_Type><Highest_Credit_or_Original_Loan_Amount>125000</Highest_Credit_or_Original_Loan_Amount></CAIS_Account><CAIS_Account><Account_Type>10</Account_Type><Original_Loan_Amount>100000</Original_Loan_Amount></CAIS_Account><CAIS_Account><Account_Type>02</Account_Type><Sanctioned_Amount>500000</Sanctioned_Amount></CAIS_Account></INProfileResponse>`;
  const parsed = parseBureauReport(xml, 10, "REUSED_REPORT");
  assert.equal(parsed.score, 700);
  assert.equal(parsed.totalTradelines, 3);
  assert.equal(parsed.unsecuredTradelineCount, 2);
  assert.equal(parsed.unsecuredAggregate, 225000);
  assert.deepEqual(parsed.unmappedAccountTypeCodes, []);
});

test("bureau parser fails safely on unmapped numeric account type", () => {
  const xml = `<INProfileResponse><SCORE><BureauScore>700</BureauScore></SCORE><CAIS_Account><Account_Type>999</Account_Type><Sanctioned_Amount>250000</Sanctioned_Amount></CAIS_Account></INProfileResponse>`;
  const parsed = parseBureauReport(xml);
  assert.deepEqual(parsed.unmappedAccountTypeCodes, ["999"]);
  assert.equal(parsed.unsecuredAggregate, 0);
});
