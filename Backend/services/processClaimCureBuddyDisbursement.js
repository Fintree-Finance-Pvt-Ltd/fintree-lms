const db = require("../config/db");

const RPS_TABLE = "manual_rps_claim_cure_buddy";

function addUtcDays(value, days) {
  const dateOnly = new Date(value).toISOString().split("T")[0];
  const date = new Date(`${dateOnly}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().split("T")[0];
}

async function processClaimCureBuddyDisbursement({
  lan,
  disbursementUTR,
  disbursementDate,
}) {
  const normalizedLan = String(lan || "").trim().toUpperCase();

  if (!normalizedLan.startsWith("CCB")) {
    return { skipped: true, reason: "NOT_CLAIM_CURE_BUDDY" };
  }

  if (!disbursementUTR || !disbursementDate) {
    return { skipped: true, reason: "MISSING_UTR_OR_DATE" };
  }

  const effectiveDisbursementDate = new Date(disbursementDate);
  if (Number.isNaN(effectiveDisbursementDate.getTime())) {
    throw new Error(`Invalid ClaimCureBuddy disbursement date: ${disbursementDate}`);
  }

  let connection;
  let transactionCompleted = false;

  try {
    connection = await db.promise().getConnection();
    await connection.beginTransaction();

    const [[loan]] = await connection.query(
      `SELECT
         lb.loan_amount,
         lb.interest_rate,
         lb.loan_tenure,
         lb.status,
         s.total_interest_amount,
         s.total_repayment_amount
       FROM loan_booking_claim_cure_buddy lb
       LEFT JOIN claim_cure_buddy_loan_summary s ON s.lan = lb.lan
       WHERE lb.lan = ?
       LIMIT 1
       FOR UPDATE`,
      [normalizedLan],
    );

    if (!loan) {
      throw new Error(`ClaimCureBuddy loan not found: ${normalizedLan}`);
    }

    const principal = Number(loan.loan_amount);
    const tenureDays = Number(loan.loan_tenure);
    const interest = Number(loan.total_interest_amount);
    const totalRepayment = Number(loan.total_repayment_amount);

    if (!Number.isFinite(principal) || principal <= 0) {
      throw new Error(`Invalid ClaimCureBuddy loan amount: ${loan.loan_amount}`);
    }

    if (!Number.isInteger(tenureDays) || tenureDays <= 0) {
      throw new Error(`Invalid ClaimCureBuddy tenure days: ${loan.loan_tenure}`);
    }

    if (!Number.isFinite(interest) || interest < 0) {
      throw new Error(
        `ClaimCureBuddy signed interest is unavailable: ${loan.total_interest_amount}`,
      );
    }

    if (!Number.isFinite(totalRepayment) || totalRepayment <= 0) {
      throw new Error(
        `ClaimCureBuddy signed repayment amount is unavailable: ${loan.total_repayment_amount}`,
      );
    }

    const [existingRps] = await connection.query(
      `SELECT id FROM ${RPS_TABLE} WHERE lan = ? LIMIT 1`,
      [normalizedLan],
    );

    const [existingUtr] = await connection.query(
      `SELECT 1 FROM ev_disbursement_utr
       WHERE Disbursement_UTR = ? OR LAN = ?
       LIMIT 1`,
      [String(disbursementUTR).trim(), normalizedLan],
    );

    if (existingRps.length || existingUtr.length) {
      await connection.rollback();
      transactionCompleted = true;
      return {
        skipped: true,
        reason: existingRps.length ? "RPS_ALREADY_EXISTS" : "DISBURSEMENT_ALREADY_RECORDED",
      };
    }

    const disbursementDateOnly = effectiveDisbursementDate
      .toISOString()
      .split("T")[0];
    const dueDate = addUtcDays(effectiveDisbursementDate, tenureDays);

    await connection.query(
      `INSERT INTO ${RPS_TABLE}
       (lan, emi_no, due_date, emi, interest, principal,
        remaining_principal, remaining_interest, remaining_emi,
        opening, closing, status, dpd)
       VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'Pending', 0)`,
      [
        normalizedLan,
        dueDate,
        totalRepayment,
        interest,
        principal,
        principal,
        interest,
        totalRepayment,
        principal,
      ],
    );

    await connection.query(
      `INSERT INTO ev_disbursement_utr
       (Disbursement_UTR, Disbursement_Date, LAN)
       VALUES (?, ?, ?)`,
      [String(disbursementUTR).trim(), disbursementDateOnly, normalizedLan],
    );

    await connection.query(
      `UPDATE claim_cure_buddy_loan_summary
       SET disbursement_date = ?,
           disbursement_transaction_reference = ?,
           repayment_date = ?
       WHERE lan = ?`,
      [disbursementDateOnly, String(disbursementUTR).trim(), dueDate, normalizedLan],
    );

    await connection.query(
      `UPDATE loan_booking_claim_cure_buddy
       SET status = 'Disbursed', stage = 'Disbursed', updated_at = NOW()
       WHERE lan = ?`,
      [normalizedLan],
    );

    await connection.commit();
    transactionCompleted = true;

    console.log("[ClaimCureBuddy][SUCCESS] Bullet RPS generated", {
      lan: normalizedLan,
      dueDate,
      principal,
      interest,
      totalRepayment,
    });

    return { success: true, dueDate };
  } catch (error) {
    if (connection && !transactionCompleted) {
      await connection.rollback();
    }
    throw error;
  } finally {
    if (connection) connection.release();
  }
}

module.exports = { processClaimCureBuddyDisbursement };
