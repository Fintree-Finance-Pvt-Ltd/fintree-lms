/**
 * PL Partner BRE policy.
 *
 * Ported from Backend/routes/switchMyLoan/rapidMoneyPolicy.js. Values are
 * currently identical to the RapidMoney policy as placeholders — tune the
 * POLICY constants below directly once the actual PL Partner credit policy
 * is finalized. Kept as a separate file/module so RapidMoney's policy is
 * never affected by changes here.
 *
 * The bureau-report XML parser from rapidMoneyPolicy.js is intentionally
 * not ported yet: PL Partner has no real bureau integration wired up
 * (see plPartnerBre.js), so there is no XML to parse. Add it here when
 * real bureau pull is wired in.
 */
const POLICY = Object.freeze({
  MIN_BUREAU_SCORE: 550,

  MIN_LOAN_AMOUNT: 5000,
  MAX_LOAN_AMOUNT: 15000,
  LOAN_AMOUNT_MULTIPLE: 1000,

  FIRST_TIME_CUSTOMER_LIMIT: 5000,
  REPEAT_CUSTOMER_UNDER_28_LIMIT: 10000,
  MAX_REPEAT_CUSTOMER_LIMIT: 15000,
  MIN_UNSECURED_AGGREGATE: 10000,

  ENQUIRY_REJECT_FROM_30_DAYS: 5,
  OVERDUE_REJECT_FROM: 1000,

  DPD_REJECT_ABOVE_LAST_3_MONTHS: 10,
  DPD_REJECT_ABOVE_LAST_9_MONTHS: 30,
  DPD_REJECT_ABOVE_LAST_12_MONTHS: 60,
});

function toFiniteNumber(value) {
  if (value === null || value === undefined || value === "") return null;

  const normalized = String(value)
    .replace(/,/g, "")
    .replace(/[^0-9.-]/g, "")
    .trim();

  if (!normalized) return null;

  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function calculateAge(dob, asOf = new Date()) {
  if (!dob) return null;

  const birthDate = dob instanceof Date ? new Date(dob) : new Date(dob);
  const currentDate = asOf instanceof Date ? new Date(asOf) : new Date(asOf);

  if (
    Number.isNaN(birthDate.getTime()) ||
    Number.isNaN(currentDate.getTime())
  ) {
    return null;
  }

  let age = currentDate.getFullYear() - birthDate.getFullYear();

  const birthdayNotReached =
    currentDate.getMonth() < birthDate.getMonth() ||
    (currentDate.getMonth() === birthDate.getMonth() &&
      currentDate.getDate() < birthDate.getDate());

  if (birthdayNotReached) age -= 1;
  return age;
}

function validateLoanAmount(value) {
  const amount = toFiniteNumber(value);

  if (amount === null || amount <= 0) {
    return {
      passed: false,
      reason: "INVALID_LOAN_AMOUNT",
      amount,
    };
  }

  if (amount < POLICY.MIN_LOAN_AMOUNT || amount > POLICY.MAX_LOAN_AMOUNT) {
    return {
      passed: false,
      reason: "LOAN_AMOUNT_OUTSIDE_POLICY_RANGE",
      amount,
    };
  }

  if (amount % POLICY.LOAN_AMOUNT_MULTIPLE !== 0) {
    return {
      passed: false,
      reason: "LOAN_AMOUNT_NOT_MULTIPLE_OF_POLICY_STEP",
      amount,
    };
  }

  return {
    passed: true,
    reason: null,
    amount,
  };
}

function isNewCustomer(totalDisbursedApplications) {
  const count = Number(totalDisbursedApplications ?? 0);
  return !Number.isFinite(count) || count <= 0;
}

function roundDownToThousand(value) {
  return (
    Math.floor(Number(value || 0) / POLICY.LOAN_AMOUNT_MULTIPLE) *
    POLICY.LOAN_AMOUNT_MULTIPLE
  );
}

function getRepeatMultiplier(totalDisbursedApplications) {
  const count = Number(totalDisbursedApplications ?? 0);

  if (!Number.isInteger(count) || count <= 0) return null;
  if (count <= 2) return 1.25;
  if (count <= 6) return 2;
  return 2.5;
}

function calculateRepeatCreditLimit(
  totalDisbursedApplications,
  previousLoanAmount,
  age,
) {
  const multiplier = getRepeatMultiplier(totalDisbursedApplications);
  const previousAmount = toFiniteNumber(previousLoanAmount);

  if (multiplier === null || previousAmount === null || previousAmount <= 0) {
    return {
      creditLimit: null,
      multiplier,
      rawLimit: null,
      cappedLimit: null,
      roundedLimit: null,
      ageCapApplied: false,
    };
  }

  const rawLimit = previousAmount * multiplier;
  let cappedLimit = Math.min(rawLimit, POLICY.MAX_REPEAT_CUSTOMER_LIMIT);
  let ageCapApplied = false;

  if (age !== null && age < 28) {
    cappedLimit = Math.min(cappedLimit, POLICY.REPEAT_CUSTOMER_UNDER_28_LIMIT);
    ageCapApplied = true;
  }

  const roundedLimit = roundDownToThousand(cappedLimit);

  return {
    creditLimit: roundedLimit,
    multiplier,
    rawLimit: round2(rawLimit),
    cappedLimit: round2(cappedLimit),
    roundedLimit,
    ageCapApplied,
  };
}

// GST is a fixed government rate, not lender-specific — same constant runBre.js uses.
const GST_ON_PROCESSING_FEE_RATE = 0.18;

/**
 * Ported from Backend/routes/switchMyLoan/runBre.js's calculateNetDisbursalAmount.
 * Nets the processing fee + GST on the fee off the gross approved amount,
 * the same way switchMyLoan does before disbursal.
 */
function calculateNetDisbursalAmount({
  creditLimit,
  processingFeeRate,
  gstRate = GST_ON_PROCESSING_FEE_RATE,
}) {
  const grossApprovedAmount = toFiniteNumber(creditLimit);
  const pfRate = toFiniteNumber(processingFeeRate);
  const gst = toFiniteNumber(gstRate) ?? GST_ON_PROCESSING_FEE_RATE;

  if (!Number.isFinite(grossApprovedAmount) || grossApprovedAmount <= 0) {
    return {
      ok: false,
      reason: "INVALID_GROSS_APPROVED_AMOUNT",
      grossApprovedAmount: grossApprovedAmount ?? 0,
      processingFeeRate: pfRate ?? 0,
      processingFeeAmount: 0,
      gstRate: gst,
      gstOnProcessingFee: 0,
      totalDeduction: 0,
      netDisbursalAmount: null,
    };
  }

  // processing_fee is stored as a fraction (0.15 = 15%), so valid values are 0-1.
  if (!Number.isFinite(pfRate) || pfRate < 0 || pfRate > 1) {
    return {
      ok: false,
      reason: "INVALID_PROCESSING_FEE_RATE",
      grossApprovedAmount,
      processingFeeRate: pfRate ?? 0,
      processingFeeAmount: 0,
      gstRate: gst,
      gstOnProcessingFee: 0,
      totalDeduction: 0,
      netDisbursalAmount: null,
    };
  }

  const processingFeeAmount = round2(grossApprovedAmount * pfRate);
  const gstOnProcessingFee = round2(processingFeeAmount * gst);
  const totalDeduction = round2(processingFeeAmount + gstOnProcessingFee);
  const netDisbursalAmount = round2(grossApprovedAmount - totalDeduction);

  if (!Number.isFinite(netDisbursalAmount) || netDisbursalAmount <= 0) {
    return {
      ok: false,
      reason: "NET_DISBURSAL_AMOUNT_INVALID",
      grossApprovedAmount,
      processingFeeRate: pfRate,
      processingFeeAmount,
      gstRate: gst,
      gstOnProcessingFee,
      totalDeduction,
      netDisbursalAmount,
    };
  }

  return {
    ok: true,
    reason: null,
    grossApprovedAmount,
    processingFeeRate: pfRate,
    processingFeeAmount,
    gstRate: gst,
    gstOnProcessingFee,
    totalDeduction,
    netDisbursalAmount,
  };
}

module.exports = {
  POLICY,
  GST_ON_PROCESSING_FEE_RATE,
  calculateAge,
  validateLoanAmount,
  isNewCustomer,
  getRepeatMultiplier,
  calculateRepeatCreditLimit,
  calculateNetDisbursalAmount,
  round2,
};
