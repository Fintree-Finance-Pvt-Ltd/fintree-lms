const db = require("../config/db");
const {
  generateRepaymentScheduleClaimBuddy,
} = require("../utils/repaymentScheduleGenerator");

const RPS_TABLE = "manual_rps_claim_buddy";

/*
 * Finalise a Claim Buddy disbursement once the UTR is received.
 *
 * In one transaction:
 *   1. Generate the single-row bullet RPS (same calculation as Clayyo)
 *   2. Store the UTR in ev_disbursement_utr
 *   3. Mark the loan DISBURSED
 *
 * If RPS generation fails, nothing is committed and the loan stays in
 * DISBURSEMENT INITIATED so it can be reprocessed. Safe to call more than
 * once for the same LAN (webhook retries, payout status sync).
 */
async function processClaimBuddyDisbursement({
  lan,
  disbursementUTR,
  disbursementDate,
}) {
  const normalizedLan = String(lan || "").trim().toUpperCase();

  if (!normalizedLan.startsWith("CBF")) {
    return { skipped: true, reason: "NOT_CLAIM_BUDDY" };
  }

  const utr = String(disbursementUTR || "").trim();

  if (!utr || !disbursementDate) {
    return { skipped: true, reason: "MISSING_UTR_OR_DATE" };
  }

  const effectiveDisbursementDate = new Date(disbursementDate);

  if (Number.isNaN(effectiveDisbursementDate.getTime())) {
    throw new Error(`Invalid Claim Buddy disbursement date: ${disbursementDate}`);
  }

  const disbursementDateOnly = effectiveDisbursementDate
    .toISOString()
    .split("T")[0];

  let connection;
  let transactionCompleted = false;

  try {
    connection = await db.promise().getConnection();
    await connection.beginTransaction();

    const [[loan]] = await connection.query(
      `SELECT
         lan,
         status,
         loan_amount,
         final_limit,
         approved_limit,
         interest_rate,
         loan_tenure
       FROM loan_booking_claim_buddy
       WHERE lan = ?
       LIMIT 1
       FOR UPDATE`,
      [normalizedLan],
    );

    if (!loan) {
      throw new Error(`Claim Buddy loan not found: ${normalizedLan}`);
    }

    const [existingRps] = await connection.query(
      `SELECT id FROM ${RPS_TABLE} WHERE lan = ? LIMIT 1`,
      [normalizedLan],
    );

    // Already fully processed (e.g. webhook retry)
    if (loan.status === "DISBURSED" && existingRps.length) {
      await connection.rollback();
      transactionCompleted = true;

      return { skipped: true, reason: "ALREADY_DISBURSED" };
    }

    if (!["DISBURSEMENT INITIATED", "DISBURSED"].includes(loan.status)) {
      throw new Error(
        `Claim Buddy loan ${normalizedLan} is not in DISBURSEMENT INITIATED status (current: ${loan.status})`,
      );
    }

    // Same principal the payout used (final_limit), as in Clayyo
    const disbursedAmount = Number(
      loan.final_limit || loan.approved_limit || loan.loan_amount || 0,
    );

    if (!Number.isFinite(disbursedAmount) || disbursedAmount <= 0) {
      throw new Error(
        `Invalid Claim Buddy disbursed amount for ${normalizedLan}: ${disbursedAmount}`,
      );
    }

    const interestRate = Number(loan.interest_rate || 0);
    const tenure = Number(loan.loan_tenure);

    if (!existingRps.length) {
      await generateRepaymentScheduleClaimBuddy(
        connection,
        normalizedLan,
        disbursedAmount,
        interestRate,
        tenure,
        effectiveDisbursementDate,
      );
    }

    const [existingUtr] = await connection.query(
      `SELECT 1 FROM ev_disbursement_utr
       WHERE Disbursement_UTR = ? OR LAN = ?
       LIMIT 1`,
      [utr, normalizedLan],
    );

    if (!existingUtr.length) {
      await connection.query(
        `INSERT INTO ev_disbursement_utr
         (Disbursement_UTR, Disbursement_Date, LAN)
         VALUES (?, ?, ?)`,
        [utr, disbursementDateOnly, normalizedLan],
      );
    }

    await connection.query(
      `UPDATE loan_booking_claim_buddy
       SET status = 'DISBURSED',
           stage = 'DISBURSED',
           disbursed_at = ?,
           updated_at = NOW()
       WHERE lan = ?`,
      [effectiveDisbursementDate, normalizedLan],
    );

    await connection.commit();
    transactionCompleted = true;

    console.log("[ClaimBuddy][SUCCESS] Disbursed with bullet RPS", {
      lan: normalizedLan,
      utr,
      disbursementDate: disbursementDateOnly,
      disbursedAmount,
      interestRate,
      tenure,
    });

    return { success: true, lan: normalizedLan, disbursedAmount };
  } catch (error) {
    if (connection && !transactionCompleted) {
      await connection.rollback();
    }

    throw error;
  } finally {
    if (connection) connection.release();
  }
}

module.exports = { processClaimBuddyDisbursement };
