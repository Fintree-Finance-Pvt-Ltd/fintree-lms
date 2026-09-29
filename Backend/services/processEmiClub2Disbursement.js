const db = require("../config/db");
const { generateRepaymentSchedule } = require("../utils/repaymentScheduleGenerator");
const { sendLoanWebhook } = require("../utils/webhook");
const partnerLimitService = require("./partnerLimitService");

const LAN_PREFIX = "FINE2";

async function processEmiClub2Disbursement({ lan, disbursementUTR, disbursementDate }) {
  if (!lan || !lan.startsWith(LAN_PREFIX)) {
    return { skipped: true, reason: "NOT_EMICLUB2" };
  }
  if (!disbursementUTR || !disbursementDate || Number.isNaN(Date.parse(disbursementDate))) {
    throw new Error("Valid disbursementUTR and disbursementDate are required");
  }

  let conn;
  let loan;
  let alreadyDisbursed = false;
  try {
    conn = await db.promise().getConnection();
    await conn.beginTransaction();

    const [loans] = await conn.query(
      `SELECT partner_loan_id, loan_amount, roi_apr AS interest_rate,
              loan_tenure, product, lender, status
       FROM loan_booking_emiclub2 WHERE lan = ? FOR UPDATE`,
      [lan]
    );
    loan = loans[0];
    if (!loan) throw new Error(`EMIClub2 loan not found: ${lan}`);
    const [existingUtr] = await conn.query(
      `SELECT LAN AS lan, Disbursement_UTR AS utr FROM ev_disbursement_utr
       WHERE Disbursement_UTR = ? OR LAN = ? FOR UPDATE`,
      [disbursementUTR, lan]
    );
    if (existingUtr.some(row => row.lan !== lan || String(row.utr) !== String(disbursementUTR))) {
      throw new Error("UTR or LAN already belongs to a different disbursement");
    }
    const status = String(loan.status).toLowerCase();
    alreadyDisbursed = existingUtr.length > 0;
    if (!alreadyDisbursed && !["approved", "api approved"].includes(status)) {
      throw new Error("EMIClub2 loan must be approved before disbursement");
    }
    if (loan.lender !== "EMICLUB2" || loan.product !== "Monthly Loan") {
      throw new Error("Invalid EMIClub2 lender or product");
    }
    if (!alreadyDisbursed) {
    const [[existingSchedule]] = await conn.query(
      "SELECT COUNT(*) AS count FROM manual_rps_emiclub2 WHERE lan = ?", [lan]
    );
    if (Number(existingSchedule.count)) throw new Error("EMIClub2 schedule already exists without a disbursement UTR");
    await generateRepaymentSchedule(
      conn, lan, loan.loan_amount, null, loan.interest_rate,
      loan.loan_tenure, disbursementDate, null, null, null,
      loan.product, loan.lender
    );

    const [schedule] = await conn.query(
      `SELECT COUNT(*) AS count FROM manual_rps_emiclub2 WHERE lan = ?`,
      [lan]
    );
    if (!Number(schedule[0].count)) {
      throw new Error(`EMIClub2 RPS was not generated in manual_rps_emiclub2 for ${lan}`);
    }

    await conn.query(
      `INSERT INTO ev_disbursement_utr (Disbursement_UTR, Disbursement_Date, LAN)
       VALUES (?, ?, ?)`,
      [disbursementUTR, disbursementDate, lan]
    );
    await conn.query(
      `UPDATE loan_booking_emiclub2 SET status = 'Disbursed' WHERE lan = ?`,
      [lan]
    );
    await partnerLimitService.recordDisbursementUsage(conn, {
      partnerName: "EMICLUB2", amount: Number(loan.loan_amount), lan,
    });
    }
    await conn.commit();
  } catch (error) {
    if (conn) await conn.rollback();
    throw error;
  } finally {
    if (conn) conn.release();
  }

  // A repeated callback retries notification without repeating financial writes.
  try {
    await sendLoanWebhook({
      external_ref_no: loan.partner_loan_id || null,
      utr: disbursementUTR,
      disbursement_date: new Date(disbursementDate).toISOString().slice(0, 10),
      reference_number: lan,
      status: "DISBURSED",
      reject_reason: null,
    });
    return { success: true, alreadyDisbursed, webhookSent: true };
  } catch (error) {
    console.error(`[EMICLUB2] Disbursement committed but webhook failed for ${lan}:`, error);
    return { success: true, alreadyDisbursed, webhookSent: false, webhookError: error.message };
  }
}

module.exports = { processEmiClub2Disbursement };
