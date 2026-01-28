const db = require("../config/db");
const { generateRepaymentSchedule } = require("../utils/repaymentScheduleGenerator");
const { sendLoanWebhook } = require("../utils/webhook");

async function processEmiClubDisbursement({ lan, disbursementUTR, disbursementDate }) {
  // ✅ Only EMI CLUB
  if (!lan || !lan.startsWith("FINE")) return { skipped: true, reason: "NOT_EMICLUB" };

  // ✅ Basic validation
  if (!disbursementUTR || !disbursementDate) {
    return { skipped: true, reason: "MISSING_UTR_OR_DATE" };
  }

  let conn;
  try {
    conn = await db.promise().getConnection();
    await conn.beginTransaction();

    /* =================================================
       1) Fetch EMI CLUB loan (lock row)
    ================================================= */
    const [[loan]] = await conn.query(
      `
      SELECT 
        loan_amount,
        roi_apr AS interest_rate,
        loan_tenure,
        emi_day,
        product,
        lender,
        partner_loan_id,
        status
      FROM loan_booking_emiclub
      WHERE lan = ?
      FOR UPDATE
      `,
      [lan]
    );

    if (!loan) throw new Error(`EMI CLUB loan not found: ${lan}`);

    // Optional: if already disbursed, skip safely
    if (String(loan.status).toLowerCase() === "disbursed") {
      await conn.rollback();
      return { skipped: true, reason: "ALREADY_DISBURSED" };
    }

    /* =================================================
       2) Idempotency: prevent duplicate UTR inserts
    ================================================= */
    const [utrExists] = await conn.query(
      `SELECT 1 FROM ev_disbursement_utr WHERE Disbursement_UTR = ? LIMIT 1`,
      [disbursementUTR]
    );

    if (utrExists.length > 0) {
      await conn.rollback();
      return { skipped: true, reason: "DUPLICATE_UTR" };
    }

    /* =================================================
       3) Generate Repayment Schedule (RPS)
       IMPORTANT: pass conn (transaction connection)
    ================================================= */
    await generateRepaymentSchedule(
      conn,
      lan,
      loan.loan_amount,
      loan.emi_day,
      loan.interest_rate,
      loan.loan_tenure,
      disbursementDate,
      null, // subvention_amount
      null, // no_of_advance_emis
      null, // salary_day
      loan.product,
      loan.lender
    );

    /* =================================================
       4) Insert into ev_disbursement_utr
    ================================================= */
    await conn.query(
      `
      INSERT INTO ev_disbursement_utr
        (Disbursement_UTR, Disbursement_Date, LAN)
      VALUES (?, ?, ?)
      `,
      [disbursementUTR, disbursementDate, lan]
    );

    /* =================================================
       5) Update EMI CLUB loan status to Disbursed
    ================================================= */
    await conn.query(
      `UPDATE loan_booking_emiclub SET status = 'Disbursed' WHERE lan = ?`,
      [lan]
    );

    await conn.commit();

    /* =================================================
       6) Webhook (do AFTER commit)
    ================================================= */
    await sendLoanWebhook({
      external_ref_no: loan.partner_loan_id || null,
      utr: disbursementUTR,
      disbursement_date: new Date(disbursementDate).toISOString().split("T")[0],
      reference_number: lan,
      status: "DISBURSED",
      reject_reason: null,
    });

    return { success: true };
  } catch (err) {
    if (conn) await conn.rollback();
    throw err;
  } finally {
    if (conn) conn.release();
  }
}

module.exports = { processEmiClubDisbursement };
