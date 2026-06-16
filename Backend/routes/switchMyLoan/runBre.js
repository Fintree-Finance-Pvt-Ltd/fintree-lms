// bre/runBre.js
// Rapid Money / Switch My Loan BRE
// Performs AML check + credit limit check only. MNRL removed.

const db = require("../../config/db");
const { amlCheck } = require("../../utils/amlCrimescanService");

/* ─────────────────────────────────────────────
   Pure helpers
───────────────────────────────────────────── */

function roundDownToThousand(value) {
  return Math.floor(Number(value || 0) / 1000) * 1000;
}

function isNewCustomer(totalDisbursedApplications) {
  return Number(totalDisbursedApplications ?? 0) === 0;
}

function calculateCreditLimit(data) {
  const totalDisbursed = Number(data.total_disbursed_applications ?? 0);
  const previousLoanAmount = Number(data.previous_loan_amount ?? 0);

  let limit = 0;

  if (totalDisbursed === 0) limit = 8000;
  else if (totalDisbursed <= 2) limit = previousLoanAmount * 1.25;
  else if (totalDisbursed <= 6) limit = previousLoanAmount * 2;
  else limit = previousLoanAmount * 2.5;

  if (limit > 15000) limit = 15000;
  if (limit < 8000) limit = 8000;

  return roundDownToThousand(limit);
}

function getAmlDecision(score, totalMatches) {
  // No AML match → safe
  if (totalMatches === 0) return "CLEAR";
  if (score >= 70) return "CLEAR";
  return "REJECT";
}

/* ─────────────────────────────────────────────
   MAIN BRE FUNCTION
───────────────────────────────────────────── */
async function runBRE(data) {
  const lan = data.lan;

  /* STEP 1: Check if AML already run for this LAN */
  const [rows] = await db.promise().query(
    `SELECT aml_score, aml_status
     FROM loan_booking_switch_my_loan
     WHERE lan = ?`,
    [lan]
  );

  let amlScore = rows?.[0]?.aml_score ?? null;
  let amlStatus = rows?.[0]?.aml_status ?? null;

  console.log(`[BRE] LAN=${lan} existing aml_score=${amlScore} aml_status=${amlStatus}`);

  /* STEP 2: Run AML if not already done */
  if (amlScore === null) {
    console.log(`[BRE] Triggering AML check for LAN=${lan}`);

    let amlResult;
    try {
      amlResult = await amlCheck("switch-my-loan", {
        customer_name: data.customer_name,
        location: data.city,
        father_name: data.father_name,
        pan_number: data.pan_number,
        phone: data.mobile,
      });
    } catch (amlErr) {
      console.error(`[BRE] AML API failed for LAN=${lan}:`, amlErr.message);
      // Fail-safe: reject on AML error to prevent risky approvals
      return {
        decision: "REJECTED",
        reason: "AML_CHECK_FAILED",
        amlScore: null,
      };
    }

    console.log(`[BRE] AML Result for LAN=${lan}:`, JSON.stringify(amlResult));

    const totalMatches = Number(amlResult?.total ?? 0);

    if (totalMatches === 0) {
      // No AML match → safe, set perfect score
      amlScore = 100;
    } else {
      const match = amlResult.results?.[0];
      amlScore = match?.score ?? 0;
    }

    amlStatus = getAmlDecision(amlScore, totalMatches);

    // Persist AML result
    await db.promise().query(
      `UPDATE loan_booking_switch_my_loan
       SET aml_score = ?, aml_status = ?, aml_checked_at = NOW()
       WHERE lan = ?`,
      [amlScore, amlStatus, lan]
    );
  }

  /* STEP 3: Reject if AML flagged */
  if (amlStatus === "REJECT") {
    console.warn(`[BRE] AML REJECT for LAN=${lan} score=${amlScore}`);
    return {
      decision: "REJECTED",
      reason: "AML_HIGH_RISK_MATCH",
      amlScore,
    };
  }

  if (amlStatus === "REVIEW") {
    console.warn(`[BRE] AML REVIEW treated as REJECT for LAN=${lan} score=${amlScore}`);
    return {
      decision: "REJECTED",
      reason: "AML_MEDIUM_RISK_MATCH",
      amlScore,
    };
  }

  /* STEP 4: Credit limit check */
  const requestedLoanAmount = Number(data.loan_amount ?? 0);

  if (requestedLoanAmount <= 0) {
    console.warn(`[BRE] Invalid loan_amount=${requestedLoanAmount} for LAN=${lan}`);
    return {
      decision: "REJECTED",
      reason: "INVALID_LOAN_AMOUNT",
      requestedLoanAmount,
    };
  }

  const totalDisbursed = Number(data.total_disbursed_applications ?? 0);
  const newCustomer = isNewCustomer(totalDisbursed);
  const creditLimit = calculateCreditLimit(data);

  console.log(`[BRE] LAN=${lan} requestedLoanAmount=${requestedLoanAmount} creditLimit=${creditLimit} newCustomer=${newCustomer}`);

  if (requestedLoanAmount > creditLimit) {
    console.warn(`[BRE] Loan amount ${requestedLoanAmount} exceeds credit limit ${creditLimit} for LAN=${lan}`);
    return {
      decision: "REJECTED",
      reason: "LOAN_AMOUNT_EXCEEDS_CREDIT_LIMIT",
      requestedLoanAmount,
      creditLimit,
    };
  }

  /* STEP 5: APPROVED */
  console.log(`[BRE] APPROVED for LAN=${lan}`);

  return {
    decision: "APPROVED",
    creditLimit,
    aml: {
      status: amlStatus,
      score: amlScore,
    },

    rules: {
      CREDIT_LIMIT_CHECK_RPM: {
        derived_values: {
          LIMIT_ASSIGNMENT_IS_NEW_CUSTOMER_RPM: newCustomer ? creditLimit : 0,
          LIMIT_ASSIGNMENT_IS_REPEAT_CUSTOMER_RPM: newCustomer ? 0 : creditLimit,
        },
      },
    },
  };
}

module.exports = runBRE;