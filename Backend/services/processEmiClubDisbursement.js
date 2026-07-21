const db = require("../config/db");
const { generateRepaymentSchedule } = require("../utils/repaymentScheduleGenerator");
const {
  generateRapidMoneyRepaymentSchedule,
} = require("../utils/generateRapidMoneyRepaymentSchedule");
const { sendLoanWebhook } = require("../utils/webhook");

async function processEmiClubDisbursement({ lan, disbursementUTR, disbursementDate }) {
   console.log("[EMICLUB][START] Processing disbursement", {
    lan,
    disbursementUTR,
    disbursementDate,
  });
  // ✅ Only EMI CLUB
  if (!lan || !lan.startsWith("FINE")) return { skipped: true, reason: "NOT_EMICLUB" };
   console.log("[EMICLUB][SKIP] Not an EMI CLUB loan", { lan });

  // ✅ Basic validation
  if (!disbursementUTR || !disbursementDate) {

     console.log("[EMICLUB][SKIP] Missing UTR or Disbursement Date", {
      disbursementUTR,
      disbursementDate,
    });

    return { skipped: true, reason: "MISSING_UTR_OR_DATE" };
  }

  let conn;
  try {

       console.log("[EMICLUB][DB] Getting DB connection");

    conn = await db.promise().getConnection();
    await conn.beginTransaction();

    /* =================================================
       1) Fetch EMI CLUB loan (lock row)
    ================================================= */
    const [[loan]] = await conn.query(
      `
      SELECT partner_loan_id, loan_amount, roi_apr AS interest_rate, loan_tenure, product, lender 
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
 console.log("[EMICLUB][STEP 3] Generating repayment schedule", {
      lan,
      amount: loan.loan_amount,
      interest_rate: loan.interest_rate,
      tenure: loan.loan_tenure,
      disbursementDate,
    });

    await generateRepaymentSchedule(
      conn,
      lan,
      loan.loan_amount,
      null,
      loan.interest_rate,
      loan.loan_tenure,
      disbursementDate,
      null,
      null,
      null,
      loan.product,
      loan.lender
    );

    /* =================================================
       4) Insert into ev_disbursement_utr
    ================================================= */

      console.log("[EMICLUB][STEP 4] Inserting disbursement UTR");
    await conn.query(
      `
      INSERT INTO ev_disbursement_utr
        (Disbursement_UTR, Disbursement_Date, LAN)
      VALUES (?, ?, ?)
      `,
      [disbursementUTR, disbursementDate, lan]
    );

  console.log("[EMICLUB][STEP 4] Disbursement UTR inserted");

    /* =================================================
       5) Update EMI CLUB loan status to Disbursed
    ================================================= */

    console.log("[EMICLUB][STEP 5] Updating loan status to Disbursed", { lan });
    await conn.query(
      `UPDATE loan_booking_emiclub SET status = 'Disbursed' WHERE lan = ?`,
      [lan]
    );


        console.log("[EMICLUB][DB] Committing transaction");
    await conn.commit();

    /* =================================================
       6) Webhook (do AFTER commit)
    ================================================= */
      console.log("[EMICLUB][STEP 6] Sending disbursement webhook", {
      lan,
      utr: disbursementUTR,
    });

    await sendLoanWebhook({
      external_ref_no: loan.partner_loan_id || null,
      utr: disbursementUTR,
      disbursement_date: new Date(disbursementDate).toISOString().split("T")[0],
      reference_number: lan,
      status: "DISBURSED",
      reject_reason: null,
    });

 console.log("[EMICLUB][SUCCESS] Disbursement completed successfully", { lan });

    return { success: true };
  } catch (err) {
    if (conn) await conn.rollback();
    throw err;
  } finally {
    if (conn) conn.release();
  }
}


async function processRapidMoneyDisbursement({ lan, disbursementUTR, disbursementDate }) {
   console.log("[Rapid money][START] Processing disbursement", {
    lan,
    disbursementUTR,
    disbursementDate,
  });
  // ✅ Only EMI CLUB
  if (!lan || !lan.startsWith("RML")) return { skipped: true, reason: "NOT_RapidMoney" };
   console.log("[Rapid money][SKIP] Not an Rapid Money loan", { lan });

  // ✅ Basic validation
  if (!disbursementUTR || !disbursementDate) {

     console.log("[Rapid money][SKIP] Missing UTR or Disbursement Date", {
      disbursementUTR,
      disbursementDate,
    });

    return { skipped: true, reason: "MISSING_UTR_OR_DATE" };
  }

  let conn;
  try {

       console.log("[Rapid money][DB] Getting DB connection");

    conn = await db.promise().getConnection();
    await conn.beginTransaction();

    /* =================================================
       1) Fetch EMI CLUB loan (lock row)
    ================================================= */
    const [[loan]] = await conn.query(
      `
      SELECT partner_loan_id, application_id, repayment_date, loan_amount, interest_rate, tenure, status
      FROM loan_booking_switch_my_loan
      WHERE lan = ?
      FOR UPDATE
      `,
      [lan]
    );

    if (!loan) throw new Error(`Rapid Money loan not found: ${lan}`);

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

    const [existingRps] = await conn.query(
  `
  SELECT id
  FROM manual_rps_switch_my_loan
  WHERE lan = ?
  LIMIT 1
  `,
  [lan]
);

if (existingRps.length > 0) {
  await conn.rollback();

  return {
    skipped: true,
    reason: "RPS_ALREADY_EXISTS",
  };
}

    /* =================================================
       3) Generate Repayment Schedule (RPS)
       IMPORTANT: pass conn (transaction connection)
    ================================================= */
 console.log("[Rapid money][STEP 3] Generating repayment schedule", {
      lan,
      application_id: loan.application_id,
      repayment_date: loan.repayment_date,
      amount: loan.loan_amount,
      interest_rate: loan.interest_rate,
      tenure: loan.tenure,
      disbursementDate,
    });

    await generateRapidMoneyRepaymentSchedule(
      conn,
      lan,
      loan.loan_amount,
      loan.interest_rate,
      loan.tenure,
      disbursementDate,
      loan.repayment_date
    );

    /* =================================================
       4) Insert into ev_disbursement_utr
    ================================================= */

      console.log("[Rapid money][STEP 4] Inserting disbursement UTR");
    await conn.query(
      `
      INSERT INTO ev_disbursement_utr
        (Disbursement_UTR, Disbursement_Date, LAN)
      VALUES (?, ?, ?)
      `,
      [disbursementUTR, disbursementDate, lan]
    );

  console.log("[Rapid money][STEP 4] Disbursement UTR inserted");

    /* =================================================
       5) Update Rapid Money loan status to Disbursed
    ================================================= */

    console.log("[Rapid money][STEP 5] Updating loan status to Disbursed", { lan });
    await conn.query(
      `UPDATE loan_booking_switch_my_loan SET status = 'Disbursed' WHERE lan = ?`,
      [lan]
    );


        console.log("[Rapid money][DB] Committing transaction");
    await conn.commit();

    /* =================================================
       6) Webhook (do AFTER commit)
    ================================================= */
      console.log("[Rapid money][STEP 6] Sending disbursement webhook", {
      lan,
      utr: disbursementUTR,
    });

 console.log("[Rapid money][SUCCESS] Disbursement completed successfully", { lan });

    return { success: true };
  } catch (err) {
    if (conn) await conn.rollback();
    throw err;
  } finally {
    if (conn) conn.release();
  }
}

async function processLoanDigitDisbursement({ lan, disbursementUTR, disbursementDate }) {
   console.log("[Loan Digit][START] Processing disbursement", { lan, disbursementUTR, disbursementDate });

  if (!lan || (!lan.startsWith("LDF") && !lan.startsWith("LDG") && !lan.startsWith("LDD"))) {
    return { skipped: true, reason: "NOT_LOAN_DIGIT" };
  }

  if (!disbursementUTR || !disbursementDate) {
    return { skipped: true, reason: "MISSING_UTR_OR_DATE" };
  }

  let conn;
  try {
    conn = await db.promise().getConnection();
    await conn.beginTransaction();

    const [[loan]] = await conn.query(
      `
      SELECT partner_loan_id, loan_amount, interest_rate, loan_tenure, pre_emi, product, lender, status
      FROM loan_booking_loan_digit
      WHERE lan = ?
      FOR UPDATE
      `,
      [lan]
    );

    if (!loan) throw new Error(`Loan Digit loan not found: ${lan}`);

    if (String(loan.status).toLowerCase() === "disbursed") {
      await conn.rollback();
      return { skipped: true, reason: "ALREADY_DISBURSED" };
    }

    const [utrExists] = await conn.query(
      `SELECT 1 FROM ev_disbursement_utr WHERE Disbursement_UTR = ? LIMIT 1`,
      [disbursementUTR]
    );

    if (utrExists.length > 0) {
      await conn.rollback();
      return { skipped: true, reason: "DUPLICATE_UTR" };
    }

    // Generate RPS
    await generateRepaymentSchedule(
      conn,
      lan,
      loan.loan_amount,
      null, // subvention_amount
      loan.interest_rate,
      loan.loan_tenure,
      disbursementDate,
      null, // retention
      null, // advance emis
      loan.pre_emi, // pre_emi
      loan.product,
      loan.lender || "Loan Digit"
    );

    // Insert UTR
    await conn.query(
      `INSERT INTO ev_disbursement_utr (Disbursement_UTR, Disbursement_Date, LAN) VALUES (?, ?, ?)`,
      [disbursementUTR, disbursementDate, lan]
    );

    // Update status
    await conn.query(
      `UPDATE loan_booking_loan_digit SET status = 'DISBURSED' WHERE lan = ?`,
      [lan]
    );

    await conn.commit();

    try {
      if (loan.partner_loan_id) {
        await sendLoanWebhook({
          external_ref_no: loan.partner_loan_id,
          utr: disbursementUTR,
          disbursement_date: new Date(disbursementDate).toISOString().split("T")[0],
          reference_number: lan,
          status: "DISBURSED",
          reject_reason: null,
        });
      }
    } catch (webhookErr) {
      console.error(`⚠️ LoanDigit webhook failed for ${lan}:`, webhookErr.message);
    }

    return { success: true };
  } catch (err) {
    if (conn) await conn.rollback();
    throw err;
  } finally {
    if (conn) conn.release();
  }
}

async function processFinsoDisbursement({ lan, disbursementUTR, disbursementDate }) {
   console.log("[Finso][START] Processing disbursement", { lan, disbursementUTR, disbursementDate });

  if (!lan || !lan.startsWith("FINS")) {
    return { skipped: true, reason: "NOT_FINSO" };
  }

  if (!disbursementUTR || !disbursementDate) {
    return { skipped: true, reason: "MISSING_UTR_OR_DATE" };
  }

  let conn;
  try {
    conn = await db.promise().getConnection();
    await conn.beginTransaction();

    const [[loan]] = await conn.query(
      `
      SELECT partner_loan_id, loan_amount, interest_rate, loan_tenure, pre_emi, product, lender, status
      FROM loan_booking_finso
      WHERE lan = ?
      FOR UPDATE
      `,
      [lan]
    );

    if (!loan) throw new Error(`Finso loan not found: ${lan}`);

    if (String(loan.status).toLowerCase() === "disbursed") {
      await conn.rollback();
      return { skipped: true, reason: "ALREADY_DISBURSED" };
    }

    const [utrExists] = await conn.query(
      `SELECT 1 FROM ev_disbursement_utr WHERE Disbursement_UTR = ? LIMIT 1`,
      [disbursementUTR]
    );

    if (utrExists.length > 0) {
      await conn.rollback();
      return { skipped: true, reason: "DUPLICATE_UTR" };
    }

    // Generate RPS
    await generateRepaymentSchedule(
      conn,
      lan,
      loan.loan_amount,
      null, // subvention_amount
      loan.interest_rate,
      loan.loan_tenure,
      disbursementDate,
      null, // retention
      null, // advance emis
      loan.pre_emi, // pre_emi
      loan.product,
      loan.lender || "Finso"
    );

    // Insert UTR
    await conn.query(
      `INSERT INTO ev_disbursement_utr (Disbursement_UTR, Disbursement_Date, LAN) VALUES (?, ?, ?)`,
      [disbursementUTR, disbursementDate, lan]
    );

    // Update status
    await conn.query(
      `UPDATE loan_booking_finso SET status = 'DISBURSED' WHERE lan = ?`,
      [lan]
    );

    await conn.commit();

    try {
      if (loan.partner_loan_id) {
        await sendLoanWebhook({
          external_ref_no: loan.partner_loan_id,
          utr: disbursementUTR,
          disbursement_date: new Date(disbursementDate).toISOString().split("T")[0],
          reference_number: lan,
          status: "DISBURSED",
          reject_reason: null,
        });
      }
    } catch (webhookErr) {
      console.error(`⚠️ Finso webhook failed for ${lan}:`, webhookErr.message);
    }

    return { success: true };
  } catch (err) {
    if (conn) await conn.rollback();
    throw err;
  } finally {
    if (conn) conn.release();
  }
}

async function processCarePayDisbursement({ lan, disbursementUTR, disbursementDate }) {
  console.log("[CarePay][START] Processing disbursement", {
    lan,
    disbursementUTR,
    disbursementDate,
  });

  if (!lan || !lan.startsWith("CARE")) {
    return { skipped: true, reason: "NOT_CAREPAY" };
  }

  if (!disbursementUTR || !disbursementDate) {
    return { skipped: true, reason: "MISSING_UTR_OR_DATE" };
  }

  let conn;
  try {
    conn = await db.promise().getConnection();
    await conn.beginTransaction();

    const [[loan]] = await conn.query(
      `
      SELECT
        partner_loan_id,
        loan_amount,
        interest_rate,
        loan_tenure,
        processing_fee,
        product,
        lender,
        status
      FROM loan_booking_carepay
      WHERE lan = ?
      FOR UPDATE
      `,
      [lan],
    );

    if (!loan) throw new Error(`CarePay loan not found: ${lan}`);

    if (String(loan.status).toLowerCase() === "disbursed") {
      await conn.rollback();
      return { skipped: true, reason: "ALREADY_DISBURSED" };
    }

    const [utrExists] = await conn.query(
      `SELECT 1 FROM ev_disbursement_utr WHERE Disbursement_UTR = ? LIMIT 1`,
      [disbursementUTR],
    );

    if (utrExists.length > 0) {
      await conn.rollback();
      return { skipped: true, reason: "DUPLICATE_UTR" };
    }

    await generateRepaymentSchedule(
      conn,
      lan,
      loan.loan_amount,
      null,
      loan.interest_rate,
      loan.loan_tenure,
      disbursementDate,
      null,
      null,
      null,
      loan.product,
      loan.lender || "CAREPAY",
      null,
      null,
      loan.processing_fee || 0,
    );

    await conn.query(
      `INSERT INTO ev_disbursement_utr (Disbursement_UTR, Disbursement_Date, LAN) VALUES (?, ?, ?)`,
      [disbursementUTR, disbursementDate, lan],
    );

    await conn.query(
      `UPDATE loan_booking_carepay SET status = 'Disbursed' WHERE lan = ?`,
      [lan],
    );

    await conn.commit();

    try {
      const carePayWebhookPayload = {
        external_ref_no: String(loan.partner_loan_id || "").trim(),
        utr: String(disbursementUTR).trim(),
        disbursement_date: new Date(disbursementDate).toISOString().split("T")[0],
        reference_number: lan,
        status: "DISBURSED",
        reject_reason: null,
      };

      const webhookResult = await sendLoanWebhook(carePayWebhookPayload);

      console.log("CarePay disbursement webhook successful", {
        lan,
        payload: carePayWebhookPayload,
        webhookResult,
      });
    } catch (webhookErr) {
      console.error("CarePay disbursement webhook failed", {
        lan,
        message: webhookErr.message,
        responseStatus: webhookErr.response?.status || null,
        responseData: webhookErr.response?.data || null,
      });
    }

    return { success: true };
  } catch (err) {
    if (conn) await conn.rollback();
    throw err;
  } finally {
    if (conn) conn.release();
  }
}

module.exports = {
  processEmiClubDisbursement,
  processRapidMoneyDisbursement,
  processLoanDigitDisbursement,
  processFinsoDisbursement,
  processCarePayDisbursement,
};
