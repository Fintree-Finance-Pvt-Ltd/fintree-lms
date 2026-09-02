const db = require("../config/db");
const { generateRepaymentSchedule } = require("../utils/repaymentScheduleGenerator");
const {
  generateRapidMoneyRepaymentSchedule,
} = require("../utils/generateRapidMoneyRepaymentSchedule");
const {
  generateQuickMoneyRepaymentSchedule,
} = require("../utils/generateQuickMoneyRepaymentSchedule");
const { sendLoanWebhook } = require("../utils/webhook");
const partnerLimitService = require("./partnerLimitService");
const { getMonthYear } = require("../utils/partnerHelpers");

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

async function processQuickMoneyDisbursement({
  lan,
  disbursementUTR,
  disbursementDate,
}) {
  console.log("[Quick Money][START] Processing disbursement", {
    lan,
    disbursementUTR,
    disbursementDate,
  });

  // Basic validation
  if (!lan) {
    return {
      skipped: true,
      reason: "NOT_QuickMoney",
    };
  }

  if (!disbursementUTR || !disbursementDate) {
    console.log(
      "[Quick Money][SKIP] Missing UTR or Disbursement Date",
      {
        disbursementUTR,
        disbursementDate,
      }
    );

    return {
      skipped: true,
      reason: "MISSING_UTR_OR_DATE",
    };
  }

  let conn;

  try {
    console.log(
      "[Quick Money][DB] Getting DB connection"
    );

    conn = await db.promise().getConnection();

    await conn.beginTransaction();

    /* =================================================
       1) Fetch Quick Money loan (lock row)
    ================================================= */

    const [[loan]] = await conn.query(
      `
      SELECT
        partner_loan_id,
        application_id,
        repayment_date,
        loan_amount,
        interest_rate,
        tenure,
        status
      FROM loan_booking_quick_money
      WHERE lan = ?
      FOR UPDATE
      `,
      [lan]
    );

    if (!loan) {
      throw new Error(
        `Quick Money loan not found: ${lan}`
      );
    }

    // Already disbursed
    if (
      String(loan.status).toLowerCase() ===
      "disbursed"
    ) {
      await conn.rollback();

      return {
        skipped: true,
        reason: "ALREADY_DISBURSED",
      };
    }

    /* =================================================
       2) Idempotency: prevent duplicate UTR inserts
    ================================================= */

    const [utrExists] = await conn.query(
      `
      SELECT 1
      FROM ev_disbursement_utr
      WHERE Disbursement_UTR = ?
      LIMIT 1
      `,
      [disbursementUTR]
    );

    if (utrExists.length > 0) {
      await conn.rollback();

      return {
        skipped: true,
        reason: "DUPLICATE_UTR",
      };
    }

    /* =================================================
       3) Existing RPS check
    ================================================= */

    const [existingRps] = await conn.query(
      `
      SELECT id
      FROM manual_rps_quick_money
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
       4) Generate repayment schedule
    ================================================= */

    console.log(
      "[Quick Money][STEP 4] Generating repayment schedule",
      {
        lan,
        application_id: loan.application_id,
        repayment_date: loan.repayment_date,
        amount: loan.loan_amount,
        interest_rate: loan.interest_rate,
        tenure: loan.tenure,
        disbursementDate,
      }
    );

    await generateQuickMoneyRepaymentSchedule(
      conn,
      lan,
      loan.loan_amount,
      loan.interest_rate,
      loan.tenure,
      disbursementDate,
      loan.repayment_date
    );

    /* =================================================
       5) Insert disbursement UTR
    ================================================= */

    console.log(
      "[Quick Money][STEP 5] Inserting disbursement UTR"
    );

    await conn.query(
      `
      INSERT INTO ev_disbursement_utr
      (
        Disbursement_UTR,
        Disbursement_Date,
        LAN
      )
      VALUES (?, ?, ?)
      `,
      [
        disbursementUTR,
        disbursementDate,
        lan,
      ]
    );

    console.log(
      "[Quick Money][STEP 5] Disbursement UTR inserted"
    );

    /* =================================================
       6) Update loan status
    ================================================= */

    console.log(
      "[Quick Money][STEP 6] Updating loan status to Disbursed",
      { lan }
    );

    await conn.query(
      `
      UPDATE loan_booking_quick_money
      SET status = 'Disbursed'
      WHERE lan = ?
      `,
      [lan]
    );

    /* =================================================
       7) Commit
    ================================================= */

    console.log(
      "[Quick Money][DB] Committing transaction"
    );

    await conn.commit();

    console.log(
      "[Quick Money][SUCCESS] Disbursement completed successfully",
      { lan }
    );

    return {
      success: true,
      lan,
      disbursementUTR,
      disbursementDate,
    };

  } catch (err) {

    if (conn) {
      await conn.rollback();
    }

    console.error(
      "[Quick Money][ERROR]",
      {
        lan,
        error: err.message,
      }
    );

    throw err;

  } finally {

    if (conn) {
      conn.release();
    }
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

// async function processCarePayDisbursement({ lan, disbursementUTR, disbursementDate }) {
//   console.log("[CarePay][START] Processing disbursement", {
//     lan,
//     disbursementUTR,
//     disbursementDate,
//   });

//   if (!lan || !lan.startsWith("CARE")) {
//     return { skipped: true, reason: "NOT_CAREPAY" };
//   }

//   if (!disbursementUTR || !disbursementDate) {
//     return { skipped: true, reason: "MISSING_UTR_OR_DATE" };
//   }

//   let conn;
//   try {
//     conn = await db.promise().getConnection();
//     await conn.beginTransaction();

//     const [[loan]] = await conn.query(
//       `
//       SELECT
//         partner_loan_id,
//         COALESCE(loan_amount, request_amount) AS loan_amount,
//         interest_rate,
//         loan_tenure,
//         processing_fee,
//           net_disbursement,
//         product,
//         lender,
//         status
//       FROM loan_booking_carepay
//       WHERE lan = ?
//       FOR UPDATE
//       `,
//       [lan],
//     );

//     if (!loan) throw new Error(`CarePay loan not found: ${lan}`);

//     if (String(loan.status).toLowerCase() === "disbursed") {
//       const amount = Number(loan.loan_amount || 0);

//       if (!Number.isFinite(amount) || amount <= 0) {
//         throw new Error("INVALID_CAREPAY_DISBURSEMENT_AMOUNT");
//       }

//       const effectiveDisbursementDate = new Date(disbursementDate);

//       if (Number.isNaN(effectiveDisbursementDate.getTime())) {
//         throw new Error(`Invalid CarePay disbursement date: ${disbursementDate}`);
//       }

//       const { month, year } = getMonthYear(effectiveDisbursementDate);
//       const partnerName = "CAREPAY";
//       const partner = await partnerLimitService.getOrCreatePartner(
//         conn,
//         partnerName,
//       );
//       const limit = await partnerLimitService.getPartnerMonthlyLimit(
//         conn,
//         partner.partner_id,
//         month,
//         year,
//       );
//       let limitResult;

//       try {
//         limitResult = await partnerLimitService.updateDisbursedLimit(
//           conn,
//           limit.id,
//           amount,
//           lan,
//         );
//       } catch (err) {
//         if (err.message === "DISBURSEMENT_LIMIT_EXCEEDED") {
//           err.meta = {
//             ...(err.meta || {}),
//             partnerName,
//             lan,
//             month,
//             year,
//           };
//         }

//         throw err;
//       }

//       await conn.commit();

//       return {
//         skipped: true,
//         reason: "ALREADY_DISBURSED",
//         limitResult,
//       };
//     }

//     const [utrExists] = await conn.query(
//       `SELECT 1 FROM ev_disbursement_utr WHERE Disbursement_UTR = ? LIMIT 1`,
//       [disbursementUTR],
//     );

//     if (utrExists.length > 0) {
//       await conn.rollback();
//       return { skipped: true, reason: "DUPLICATE_UTR" };
//     }

//     await generateRepaymentSchedule(
//       conn,
//       lan,
//       loan.loan_amount,
//       null,
//       loan.interest_rate,
//       loan.loan_tenure,
//       disbursementDate,
//       null,
//       null,
//       null,
//       loan.product,
//       loan.lender || "CAREPAY",
//       null,
//       null,
//       loan.processing_fee || 0,
//     );

//     await conn.query(
//       `INSERT INTO ev_disbursement_utr (Disbursement_UTR, Disbursement_Date, LAN) VALUES (?, ?, ?)`,
//       [disbursementUTR, disbursementDate, lan],
//     );

//     await conn.query(
//       `UPDATE loan_booking_carepay SET status = 'Disbursed' WHERE lan = ?`,
//       [lan],
//     );

//     const amount = Number(loan.loan_amount || 0);

//     if (!Number.isFinite(amount) || amount <= 0) {
//       throw new Error("INVALID_CAREPAY_DISBURSEMENT_AMOUNT");
//     }

//     const effectiveDisbursementDate = new Date(disbursementDate);

//     if (Number.isNaN(effectiveDisbursementDate.getTime())) {
//       throw new Error(`Invalid CarePay disbursement date: ${disbursementDate}`);
//     }

//     const { month, year } = getMonthYear(effectiveDisbursementDate);
//     const partnerName = "CAREPAY";
//     const partner = await partnerLimitService.getOrCreatePartner(
//       conn,
//       partnerName,
//     );
//     const limit = await partnerLimitService.getPartnerMonthlyLimit(
//       conn,
//       partner.partner_id,
//       month,
//       year,
//     );
//     let limitResult;

//     try {
//       limitResult = await partnerLimitService.updateDisbursedLimit(
//         conn,
//         limit.id,
//         amount,
//         lan,
//       );
//     } catch (err) {
//       if (err.message === "DISBURSEMENT_LIMIT_EXCEEDED") {
//         err.meta = {
//           ...(err.meta || {}),
//           partnerName,
//           lan,
//           month,
//           year,
//         };
//       }

//       throw err;
//     }

//     console.log("[CarePay][LIMIT] Disbursement limit processed", {
//       lan,
//       loanAmount: loan.loan_amount,
//       limitResult,
//     });

//     await conn.commit();

//     try {
//       const carePayWebhookPayload = {
//         external_ref_no: String(loan.partner_loan_id || "").trim(),
//         utr: String(disbursementUTR).trim(),
//         disbursement_date: new Date(disbursementDate).toISOString().split("T")[0],
//         reference_number: lan,
//         status: "DISBURSED",
//         reject_reason: null,
//       };

//       const webhookResult = await sendLoanWebhook(carePayWebhookPayload);

//       console.log("CarePay disbursement webhook successful", {
//         lan,
//         payload: carePayWebhookPayload,
//         webhookResult,
//       });
//     } catch (webhookErr) {
//       console.error("CarePay disbursement webhook failed", {
//         lan,
//         message: webhookErr.message,
//         responseStatus: webhookErr.response?.status || null,
//         responseData: webhookErr.response?.data || null,
//       });
//     }

//     return { success: true };
//   } catch (err) {
//     if (conn) await conn.rollback();
//     throw err;
//   } finally {
//     if (conn) conn.release();
//   }
// }

async function processCarePayDisbursement({
  lan,
  disbursementUTR,
  disbursementDate,
}) {
  console.log("[CarePay][START] Processing disbursement", {
    lan,
    disbursementUTR,
    disbursementDate,
  });

  if (!lan || !String(lan).toUpperCase().startsWith("CARE")) {
    return {
      skipped: true,
      reason: "NOT_CAREPAY",
    };
  }

  if (!disbursementUTR || !disbursementDate) {
    return {
      skipped: true,
      reason: "MISSING_UTR_OR_DATE",
    };
  }

  let conn;
  let transactionCompleted = false;

  try {
    conn = await db.promise().getConnection();
    await conn.beginTransaction();

    const [[loan]] = await conn.query(
      `
      SELECT
        partner_loan_id,
        COALESCE(loan_amount, request_amount) AS loan_amount,
        interest_rate,
        loan_tenure,
        processing_fee,
        net_disbursement,
        product,
        lender,
        status
      FROM loan_booking_carepay
      WHERE lan = ?
      FOR UPDATE
      `,
      [lan],
    );

    if (!loan) {
      throw new Error(`CarePay loan not found: ${lan}`);
    }

    /*
     * Validate loan amount.
     */
    const loanAmount = Number(loan.loan_amount);

    if (!Number.isFinite(loanAmount) || loanAmount <= 0) {
      throw new Error(
        `INVALID_CAREPAY_DISBURSEMENT_AMOUNT: ${loan.loan_amount}`,
      );
    }

    /*
     * net_disbursement is sent to CarePay webhook as
     * finalDisbursedAmount.
     */
    const rawNetDisbursement = loan.net_disbursement;
    const finalDisbursedAmount = Number(rawNetDisbursement);

    if (
      rawNetDisbursement === null ||
      rawNetDisbursement === undefined ||
      String(rawNetDisbursement).trim() === "" ||
      !Number.isFinite(finalDisbursedAmount) ||
      finalDisbursedAmount <= 0
    ) {
      throw new Error(
        `INVALID_CAREPAY_NET_DISBURSEMENT: ${rawNetDisbursement}`,
      );
    }

    /*
     * Validate disbursement date once and reuse it.
     */
    const effectiveDisbursementDate = new Date(disbursementDate);

    if (Number.isNaN(effectiveDisbursementDate.getTime())) {
      throw new Error(
        `Invalid CarePay disbursement date: ${disbursementDate}`,
      );
    }

    /*
     * Existing business logic:
     * update the partner limit even when the loan is already disbursed.
     *
     * Ensure updateDisbursedLimit() is idempotent by LAN.
     */
    if (String(loan.status).toLowerCase() === "disbursed") {
      const { month, year } = getMonthYear(
        effectiveDisbursementDate,
      );

      const partnerName = "CAREPAY";

      const partner =
        await partnerLimitService.getOrCreatePartner(
          conn,
          partnerName,
        );

      const limit =
        await partnerLimitService.getPartnerMonthlyLimit(
          conn,
          partner.partner_id,
          month,
          year,
        );

      let limitResult;

      try {
        limitResult =
          await partnerLimitService.updateDisbursedLimit(
            conn,
            limit.id,
            loanAmount,
            lan,
          );
      } catch (err) {
        if (err.message === "DISBURSEMENT_LIMIT_EXCEEDED") {
          err.meta = {
            ...(err.meta || {}),
            partnerName,
            lan,
            month,
            year,
          };
        }

        throw err;
      }

      await conn.commit();
      transactionCompleted = true;

      return {
        skipped: true,
        reason: "ALREADY_DISBURSED",
        limitResult,
      };
    }

    /*
     * Prevent duplicate UTR insertion.
     */
    const [utrExists] = await conn.query(
      `
      SELECT 1
      FROM ev_disbursement_utr
      WHERE Disbursement_UTR = ?
      LIMIT 1
      `,
      [disbursementUTR],
    );

    if (utrExists.length > 0) {
      await conn.rollback();
      transactionCompleted = true;

      return {
        skipped: true,
        reason: "DUPLICATE_UTR",
      };
    }

    /*
     * Generate repayment schedule.
     */
    await generateRepaymentSchedule(
      conn,
      lan,
      loanAmount,
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

    /*
     * Insert disbursement UTR.
     */
    await conn.query(
      `
      INSERT INTO ev_disbursement_utr
        (
          Disbursement_UTR,
          Disbursement_Date,
          LAN
        )
      VALUES (?, ?, ?)
      `,
      [disbursementUTR, disbursementDate, lan],
    );

    /*
     * Update CarePay loan status.
     */
    await conn.query(
      `
      UPDATE loan_booking_carepay
      SET status = 'Disbursed'
      WHERE lan = ?
      `,
      [lan],
    );

    /*
     * Update partner monthly disbursement limit.
     */
    const { month, year } = getMonthYear(
      effectiveDisbursementDate,
    );

    const partnerName = "CAREPAY";

    const partner =
      await partnerLimitService.getOrCreatePartner(
        conn,
        partnerName,
      );

    const limit =
      await partnerLimitService.getPartnerMonthlyLimit(
        conn,
        partner.partner_id,
        month,
        year,
      );

    let limitResult;

    try {
      limitResult =
        await partnerLimitService.updateDisbursedLimit(
          conn,
          limit.id,
          loanAmount,
          lan,
        );
    } catch (err) {
      if (err.message === "DISBURSEMENT_LIMIT_EXCEEDED") {
        err.meta = {
          ...(err.meta || {}),
          partnerName,
          lan,
          month,
          year,
        };
      }

      throw err;
    }

    console.log(
      "[CarePay][LIMIT] Disbursement limit processed",
      {
        lan,
        loanAmount,
        netDisbursement: finalDisbursedAmount,
        limitResult,
      },
    );

    /*
     * Commit all database changes before sending webhook.
     */
    await conn.commit();
    transactionCompleted = true;

    /*
     * Send webhook after successful commit.
     */
    const carePayWebhookPayload = {
      external_ref_no: String(
        loan.partner_loan_id || "",
      ).trim(),
      utr: String(disbursementUTR).trim(),
      disbursement_date: effectiveDisbursementDate
        .toISOString()
        .split("T")[0],
      reference_number: String(lan).trim(),
      status: "DISBURSED",
      reject_reason: null,

      // loan_booking_carepay.net_disbursement
      finalDisbursedAmount,
    };

    const webhookResult = await sendLoanWebhook(
      carePayWebhookPayload,
    );

    if (webhookResult?.success) {
      console.log(
        "[CarePay][WEBHOOK] Webhook sent successfully",
        {
          lan,
          payload: carePayWebhookPayload,
          status: webhookResult.status,
          responseData: webhookResult.data,
        },
      );
    } else {
      console.error(
        "[CarePay][WEBHOOK] Webhook was not sent",
        {
          lan,
          payload: carePayWebhookPayload,
          webhookResult:
            webhookResult || {
              success: false,
              reason: "EMPTY_WEBHOOK_RESULT",
            },
        },
      );
    }

    return {
      success: true,
      limitResult,
      webhookResult,
    };
  } catch (err) {
    if (conn && !transactionCompleted) {
      try {
        await conn.rollback();
      } catch (rollbackError) {
        console.error(
          "[CarePay][ROLLBACK] Failed to rollback transaction",
          {
            lan,
            message: rollbackError.message,
          },
        );
      }
    }

    console.error(
      "[CarePay][ERROR] Disbursement processing failed",
      {
        lan,
        message: err.message,
        meta: err.meta || null,
      },
    );

    throw err;
  } finally {
    if (conn) {
      conn.release();
    }
  }
}

const YA_MONEY_BOOKING_TABLE = "loan_booking_ya_money";
const YA_MONEY_RPS_TABLE = "manual_rps_ya_money";
const YA_MONEY_PARTNER_NAME = "YAMONEY";

const roundYaMoneyAmount = (value) =>
  Math.round((Number(value) + Number.EPSILON) * 100) / 100;

function formatYaMoneyDateYMD(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date: ${value}`);
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function calculateYaMoneyEmi(loanAmount, annualInterestRate, tenure) {
  const monthlyRate = annualInterestRate / 12 / 100;

  if (monthlyRate === 0) {
    return loanAmount / tenure;
  }

  const multiplier = Math.pow(1 + monthlyRate, tenure);
  return (loanAmount * monthlyRate * multiplier) / (multiplier - 1);
}

function getYaMoneyDueDate(disbursementDate, monthOffset) {
  const disbursedAt = new Date(disbursementDate);

  if (Number.isNaN(disbursedAt.getTime())) {
    throw new Error(`Invalid Ya Money disbursement date: ${disbursementDate}`);
  }

  const dueDate = new Date(disbursedAt);
  const firstMonthGap = disbursedAt.getDate() <= 20 ? 1 : 2;

  dueDate.setDate(1);
  dueDate.setMonth(dueDate.getMonth() + firstMonthGap + monthOffset);
  dueDate.setDate(5);
  dueDate.setHours(12, 0, 0, 0);

  return dueDate;
}

async function generateYaMoneyRepaymentSchedule({
  conn,
  lan,
  loanAmount,
  interestRate,
  tenure,
  disbursementDate,
  emiAmount,
}) {
  const principalAmount = roundYaMoneyAmount(loanAmount);
  const annualInterestRate = Number(interestRate || 0);
  const repaymentTenure = Number(tenure);

  if (!Number.isFinite(principalAmount) || principalAmount <= 0) {
    throw new Error(`Invalid Ya Money loan amount: ${loanAmount}`);
  }

  if (!Number.isFinite(annualInterestRate) || annualInterestRate < 0) {
    throw new Error(`Invalid Ya Money interest rate: ${interestRate}`);
  }

  if (
    !Number.isInteger(repaymentTenure) ||
    repaymentTenure <= 0
  ) {
    throw new Error(`Invalid Ya Money tenure: ${tenure}`);
  }

  const [existingRps] = await conn.query(
    `
    SELECT 1
    FROM ${YA_MONEY_RPS_TABLE}
    WHERE lan = ?
    LIMIT 1
    `,
    [lan],
  );

  if (existingRps.length > 0) {
    return {
      skipped: true,
      reason: "RPS_ALREADY_EXISTS",
    };
  }

  const persistedEmi = Number(emiAmount);
  const regularEmi =
    Number.isFinite(persistedEmi) && persistedEmi > 0
      ? roundYaMoneyAmount(persistedEmi)
      : roundYaMoneyAmount(
          calculateYaMoneyEmi(
            principalAmount,
            annualInterestRate,
            repaymentTenure,
          ),
        );

  if (!Number.isFinite(regularEmi) || regularEmi <= 0) {
    throw new Error(`Unable to calculate Ya Money EMI for LAN ${lan}`);
  }

  const monthlyRate = annualInterestRate / 12 / 100;
  let openingPrincipal = principalAmount;
  const rpsData = [];

  for (let installment = 1; installment <= repaymentTenure; installment += 1) {
    const dueDate = getYaMoneyDueDate(disbursementDate, installment - 1);
    let interest = roundYaMoneyAmount(openingPrincipal * monthlyRate);
    let principal = roundYaMoneyAmount(regularEmi - interest);

    if (monthlyRate === 0) {
      interest = 0;
      principal = roundYaMoneyAmount(regularEmi);
    }

    if (principal <= 0 && installment !== repaymentTenure) {
      throw new Error(
        `Invalid Ya Money principal for LAN ${lan}, installment ${installment}`,
      );
    }

    if (installment === repaymentTenure || principal > openingPrincipal) {
      principal = openingPrincipal;
    }

    const actualEmi = roundYaMoneyAmount(principal + interest);
    const closingPrincipal = Math.max(
      0,
      roundYaMoneyAmount(openingPrincipal - principal),
    );

    rpsData.push([
      lan,
      formatYaMoneyDateYMD(dueDate),
      actualEmi,
      interest,
      principal,
      principal,
      interest,
      actualEmi,
      openingPrincipal,
      closingPrincipal,
      "Pending",
    ]);

    openingPrincipal = closingPrincipal;
  }

  if (Math.abs(openingPrincipal) > 0.01) {
    throw new Error(
      `Ya Money RPS did not close correctly. Remaining principal: ${openingPrincipal}`,
    );
  }

  await conn.query(
    `
    INSERT INTO ${YA_MONEY_RPS_TABLE}
      (
        lan,
        due_date,
        emi,
        interest,
        principal,
        remaining_principal,
        remaining_interest,
        remaining_emi,
        opening,
        closing,
        status
      )
    VALUES ?
    `,
    [rpsData],
  );

  await conn.query(
    `
    UPDATE ${YA_MONEY_BOOKING_TABLE}
    SET emi_amount = ?
    WHERE lan = ?
    `,
    [regularEmi, lan],
  );

  return {
    success: true,
    rowsInserted: rpsData.length,
    regularEmi,
  };
}

async function updateYaMoneyDisbursementLimit({
  conn,
  lan,
  loanAmount,
  disbursementDate,
}) {
  const { month, year } = getMonthYear(disbursementDate);

  const partner = await partnerLimitService.getOrCreatePartner(
    conn,
    YA_MONEY_PARTNER_NAME,
  );

  const limit = await partnerLimitService.getPartnerMonthlyLimit(
    conn,
    partner.partner_id,
    month,
    year,
  );

  try {
    return await partnerLimitService.updateDisbursedLimit(
      conn,
      limit.id,
      loanAmount,
      lan,
    );
  } catch (err) {
    if (err.message === "DISBURSEMENT_LIMIT_EXCEEDED") {
      err.meta = {
        ...(err.meta || {}),
        partnerName: YA_MONEY_PARTNER_NAME,
        lan,
        month,
        year,
      };
    }

    throw err;
  }
}

async function processYaMoneyDisbursement({
  lan,
  disbursementUTR,
  disbursementDate,
}) {
  const normalizedLan = String(lan || "").trim().toUpperCase();

  console.log("[YaMoney][START] Processing disbursement", {
    lan: normalizedLan,
    disbursementUTR,
    disbursementDate,
  });

  if (!normalizedLan || !normalizedLan.startsWith("YAM")) {
    return {
      skipped: true,
      reason: "NOT_YAMONEY",
    };
  }

  if (!disbursementUTR || !disbursementDate) {
    return {
      skipped: true,
      reason: "MISSING_UTR_OR_DATE",
    };
  }

  let conn;
  let transactionCompleted = false;

  try {
    conn = await db.promise().getConnection();
    await conn.beginTransaction();

    const [[loan]] = await conn.query(
      `
      SELECT
        partner_loan_id,
        loan_amount,
        interest AS interest_rate,
        loan_tenure,
        emi_amount,
        processing_fee,
        net_disbursement,
        product,
        lender,
        status
      FROM ${YA_MONEY_BOOKING_TABLE}
      WHERE lan = ?
      FOR UPDATE
      `,
      [normalizedLan],
    );

    if (!loan) {
      throw new Error(`Ya Money loan not found: ${normalizedLan}`);
    }

    const loanAmount = Number(loan.loan_amount);

    if (!Number.isFinite(loanAmount) || loanAmount <= 0) {
      throw new Error(
        `INVALID_YAMONEY_DISBURSEMENT_AMOUNT: ${loan.loan_amount}`,
      );
    }

    const rawNetDisbursement = loan.net_disbursement;
    const finalDisbursedAmount = Number(rawNetDisbursement);

    if (
      rawNetDisbursement === null ||
      rawNetDisbursement === undefined ||
      String(rawNetDisbursement).trim() === "" ||
      !Number.isFinite(finalDisbursedAmount) ||
      finalDisbursedAmount <= 0
    ) {
      throw new Error(
        `INVALID_YAMONEY_NET_DISBURSEMENT: ${rawNetDisbursement}`,
      );
    }

    const effectiveDisbursementDate = new Date(disbursementDate);

    if (Number.isNaN(effectiveDisbursementDate.getTime())) {
      throw new Error(
        `Invalid Ya Money disbursement date: ${disbursementDate}`,
      );
    }

    if (String(loan.status).toLowerCase() === "disbursed") {
      const limitResult = await updateYaMoneyDisbursementLimit({
        conn,
        lan: normalizedLan,
        loanAmount,
        disbursementDate: effectiveDisbursementDate,
      });

      await conn.commit();
      transactionCompleted = true;

      return {
        skipped: true,
        reason: "ALREADY_DISBURSED",
        limitResult,
      };
    }

    /*
     * Prevent duplicate UTR insertion.
     */
    const [utrExists] = await conn.query(
      `
      SELECT 1
      FROM ev_disbursement_utr
      WHERE Disbursement_UTR = ?
      LIMIT 1
      `,
      [disbursementUTR],
    );

    if (utrExists.length > 0) {
      await conn.rollback();
      transactionCompleted = true;

      return {
        skipped: true,
        reason: "DUPLICATE_UTR",
      };
    }

    /*
     * Generate repayment schedule.
     */
    const rpsResult = await generateYaMoneyRepaymentSchedule({
      conn,
      lan: normalizedLan,
      loanAmount,
      disbursementDate,
      interestRate: loan.interest_rate,
      tenure: loan.loan_tenure,
      emiAmount: loan.emi_amount,
    });

    /*
     * Insert disbursement UTR.
     */
    await conn.query(
      `
      INSERT INTO ev_disbursement_utr
        (
          Disbursement_UTR,
          Disbursement_Date,
          LAN
        )
      VALUES (?, ?, ?)
      `,
      [disbursementUTR, disbursementDate, normalizedLan],
    );

    await conn.query(
      `
      UPDATE ${YA_MONEY_BOOKING_TABLE}
      SET status = 'Disbursed',
          stage = 'Disbursed'
      WHERE lan = ?
      `,
      [normalizedLan],
    );

    const limitResult = await updateYaMoneyDisbursementLimit({
      conn,
      lan: normalizedLan,
      loanAmount,
      disbursementDate: effectiveDisbursementDate,
    });

    console.log(
      "[YaMoney][LIMIT] Disbursement limit processed",
      {
        lan: normalizedLan,
        loanAmount,
        netDisbursement: finalDisbursedAmount,
        rpsResult,
        limitResult,
      },
    );

    /*
     * Commit all database changes before sending webhook.
     */
    await conn.commit();
    transactionCompleted = true;

    /*
     * Send webhook after successful commit.
     */
    const yaMoneyWebhookPayload = {
      external_ref_no: String(
        loan.partner_loan_id || "",
      ).trim(),
      utr: String(disbursementUTR).trim(),
      disbursement_date: effectiveDisbursementDate
        .toISOString()
        .split("T")[0],
      reference_number: normalizedLan,
      status: "DISBURSED",
      reject_reason: null,
    };

    const webhookResult = await sendLoanWebhook(
      yaMoneyWebhookPayload,
    );

    if (webhookResult) {
      console.log(
        "[YaMoney][WEBHOOK] Webhook sent successfully",
        {
          lan: normalizedLan,
          payload: yaMoneyWebhookPayload,
          webhookResult,
        },
      );
    } else {
      console.error(
        "[YaMoney][WEBHOOK] Webhook was not sent",
        {
          lan: normalizedLan,
          payload: yaMoneyWebhookPayload,
          webhookResult:
            webhookResult || {
              success: false,
              reason: "EMPTY_WEBHOOK_RESULT",
            },
        },
      );
    }

    return {
      success: true,
      rpsResult,
      limitResult,
      webhookResult,
    };
  } catch (err) {
    if (conn && !transactionCompleted) {
      try {
        await conn.rollback();
      } catch (rollbackError) {
        console.error(
          "[YaMoney][ROLLBACK] Failed to rollback transaction",
          {
            lan: normalizedLan,
            message: rollbackError.message,
          },
        );
      }
    }

    console.error(
      "[YaMoney][ERROR] Disbursement processing failed",
      {
        lan: normalizedLan,
        message: err.message,
        meta: err.meta || null,
      },
    );

    throw err;
  } finally {
    if (conn) {
      conn.release();
    }
  }
}

module.exports = {
  processEmiClubDisbursement,
  processRapidMoneyDisbursement,
  processQuickMoneyDisbursement,
  processLoanDigitDisbursement,
  processFinsoDisbursement,
  processCarePayDisbursement,
  processYaMoneyDisbursement,
};
