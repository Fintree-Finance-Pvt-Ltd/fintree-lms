// const cron = require("node-cron");
// const db = require("../config/db");
// const { generateAllPending } = require("./cibilPdfService");

// // Run every day at 12:05 AM server time
// cron.schedule("*/2 * * * *", async () => {
//   console.log("⏰ Running DPD update (every 2 min)...");

//   // List of tables to update, matching the stored procedure
//   const tables = [
//     "manual_rps_ev_loan",
//     "manual_rps_wctl",
//     "manual_rps_gq_non_fsf",
//     "manual_rps_gq_non_fsf_fintree",
//     "manual_rps_gq_fsf",
//     "manual_rps_adikosh",
//     "manual_rps_adikosh_fintree",
//     "manual_rps_adikosh_partner",
//     "manual_rps_adikosh_fintree_roi",
//     "manual_rps_embifi_loan",
//     "manual_rps_emiclub",
//     "manual_rps_bl_loan",
//     "manual_rps_circlepe",
//     "manual_rps_finso_loan",
//     "manual_rps_hey_ev",
//     "manual_rps_gq_fsf_fintree"

//   ];

//   try {
//     for (const table of tables) {
//       //console.log(`🔄 Updating table: ${table}`);

//       // Single UPDATE query with CASE statements, matching the stored procedure
//       await db.promise().query(`
//         UPDATE ${table}
//         SET
//           status = CASE
//     WHEN remaining_principal = 0 AND remaining_interest = 0 THEN 'Paid'

//     WHEN (
//         (emi > 0 AND remaining_emi < 0)
//            ) THEN 'Part Paid'

//     WHEN due_date < CURDATE() AND remaining_principal > 0 THEN 'Late'
//     WHEN due_date = CURDATE() AND remaining_principal > 0 THEN 'Due'
//     WHEN due_date > CURDATE() THEN 'Not Set'

//     ELSE status
// END,
//           dpd = CASE
//             WHEN remaining_principal = 0 AND remaining_interest = 0 THEN 0
//             WHEN due_date > CURDATE() THEN 0
//             WHEN due_date <= CURDATE() THEN GREATEST(DATEDIFF(CURDATE(), due_date), 0)
//             ELSE dpd
//           END
//       `);

//     }

//     console.log("✅ All tables updated successfully");
//     // 2️⃣ Call your OOD ledger procedure for all LANs (yesterday’s date)
//     const sql = `CALL sp_cc_ood_generate_all(
//       DATE_SUB(CURDATE(), INTERVAL 1 DAY),
//       DATE_SUB(CURDATE(), INTERVAL 1 DAY)
//     )`;
//     await db.promise().query(sql);

//     console.log("✅ OOD ledger generated successfully for all LANs");

//   } catch (err) {
//     console.error("❌ Cron job failed:", err.sqlMessage || err.message);
//   }
// });

// cron.schedule("*/2 * * * *", async () => {
//   console.log("🧾 Running CIBIL PDF generator (every 2 min)...");
//   try {
//     const results = await generateAllPending(150);
//     const ok = results.filter(r => r.ok).length;
//     const fail = results.length - ok;
//     console.log(`✅ PDF job finished | processed: ${results.length}, success: ${ok}, failed: ${fail}`);
//     results.filter(r => !r.ok).forEach(r => console.error(`  ↳ id=${r.id} error=${r.error}`));
//   } catch (e) {
//     console.error("❌ PDF cron failed:", e.message);
//   }
// });

// cron.schedule("*/2 * * * *", async () => {
//   try {
//      const sql = `CALL update_risk_and_bucket()`;
//     await db.promise().query(sql);
//     console.log("✅ Risk done");
//   } catch (e) {
//     console.error("❌ Risk cron failed:", e.message);
//   }
// });

// require('../server');
///////////////
const cron = require("node-cron");
const db = require("../config/db");
const { generateAllPending } = require("./cibilPdfService");
const { runDailyInterestAccrual } = require( "./wctlccodinterestengine");
const startAadhaarCron = require("./aadhaarPdfCron");
const { sendLoanWebhook } = require("../utils/webhook");

// 1️⃣ DPD + OOD Cron
cron.schedule("*/2 * * * *", async () => {
  console.log("⏰ Running DPD update (every 2 min)...");

  const tables = [
    "manual_rps_ev_loan",
    "manual_rps_wctl",
    "manual_rps_gq_non_fsf",
    "manual_rps_gq_non_fsf_fintree",
    "manual_rps_gq_fsf",
    "manual_rps_adikosh",
    "manual_rps_adikosh_fintree",
    "manual_rps_adikosh_partner",
    "manual_rps_adikosh_fintree_roi",
    "manual_rps_embifi_loan",
    "manual_rps_emiclub",
    "manual_rps_bl_loan",
    "manual_rps_circlepe",
    "manual_rps_finso_loan",
    "manual_rps_hey_ev",
    "manual_rps_gq_fsf_fintree",
    "manual_rps_helium",
    "manual_rps_hey_ev_battery",
    "manual_rps_zypay"
  ];

  try {
    for (const table of tables) {
      await db.promise().query(`
        UPDATE ${table}
        SET
          status = CASE
              WHEN remaining_principal = 0 
         AND remaining_interest = 0 
    THEN 'Paid'

   WHEN emi > 0
     AND remaining_emi > 0
     AND remaining_emi < emi
THEN 'Part Paid'


    WHEN due_date < CURDATE() 
         AND (remaining_principal > 0 and remaining_interest > 0)
    THEN 'Late'

    WHEN due_date = CURDATE() 
         AND (remaining_principal > 0 OR remaining_interest > 0)
    THEN 'Due'

    WHEN due_date > CURDATE() 
    THEN 'Not Set'
            ELSE status
          END,
          dpd = CASE
            WHEN remaining_principal = 0 AND remaining_interest = 0 THEN 0
            WHEN due_date > CURDATE() THEN 0
            WHEN due_date <= CURDATE() THEN GREATEST(DATEDIFF(CURDATE(), due_date), 0)
            ELSE dpd
          END
      `);
    }

    console.log("✅ All tables updated successfully");

    const sql = `CALL sp_cc_ood_generate_all(
      DATE_SUB(CURDATE(), INTERVAL 1 DAY),
      DATE_SUB(CURDATE(), INTERVAL 1 DAY)
    )`;
    await db.promise().query(sql);

    console.log("✅ OOD ledger generated successfully for all LANs");

  } catch (err) {
    console.error("❌ Cron job failed:", err.sqlMessage || err.message);
  }
});

// 2️⃣ PDF generator cron
cron.schedule("*/2 * * * *", async () => {
  console.log("🧾 Running CIBIL PDF generator (every 2 min)...");
  try {
    const results = await generateAllPending(150);
    const ok = results.filter(r => r.ok).length;
    const fail = results.length - ok;
    console.log(`✅ PDF job finished | processed: ${results.length}, success: ${ok}, failed: ${fail}`);
    results.filter(r => !r.ok).forEach(r => console.error(`  ↳ id=${r.id} error=${r.error}`));
  } catch (e) {
    console.error("❌ PDF cron failed:", e.message);
  }
});

// 3️⃣ Risk & Bucket cron
cron.schedule("*/2 * * * *", async () => {
  try {
    const sql = `CALL update_risk_and_bucket()`;
    await db.promise().query(sql);
    console.log("✅ Risk done");
  } catch (e) {
    console.error("❌ Risk cron failed:", e.message);
  }
});

// 4️⃣ WhatsApp Due Date Reminder Cron
// Runs every day at 9:00 AM server time
cron.schedule(
  "0 9 * * *",
  async () => {
    console.log("📱 Running WhatsApp Due Date Reminder Service...");
    try {
      const { triggerReminderService } = require("../services/WhatsAppDueDateReminderService");

      const result = await triggerReminderService();

      if (result.success) {
        console.log("✅ WhatsApp reminder job completed:", result);
      } else {
        console.error("❌ WhatsApp reminder job failed:", result.message);
      }
    } catch (e) {
      console.error("❌ WhatsApp reminder cron failed:", e.message);
    }
  },
  {
    timezone: "Asia/Kolkata",
  }
);



///////////////////// EMI CLUB CRON JOB /////////////////////
// cron.schedule("*/2 * * * *", async () => {
//   console.log("⏰ Document validation cron started");

//   try {
//     const checkMissingDocsQuery = `
//       SELECT lb.lan
//       FROM loan_booking_emiclub lb
//       WHERE lb.status = 'Login'
//       AND lb.login_at <= NOW() - INTERVAL 5 MINUTE
//       AND EXISTS (
//           SELECT 1
//           FROM (
//               SELECT 'KYC' AS doc_name UNION ALL
//               SELECT 'PAN_CARD' UNION ALL
//               SELECT 'OFFLINE_VERIFICATION_OF_AADHAAR' UNION ALL
//               SELECT 'PROFILE_IMAGE' UNION ALL
//               SELECT 'INVOICE' UNION ALL
//               SELECT 'AGREEMENT' UNION ALL
//               SELECT 'KFS_DOCUMENT' UNION ALL
//               SELECT 'AUDIT_REPORT' UNION ALL
//               SELECT 'PAN_VERIFICATION_AUDIT_TRAIL' UNION ALL
//               SELECT 'CIBIL_REPORT'
//           ) required_docs
//           WHERE NOT EXISTS (
//               SELECT 1
//               FROM loan_documents ld
//               WHERE ld.lan = lb.lan
//               AND ld.doc_name = required_docs.doc_name
//           )
//       );
//     `;

//     const [rows] = await db.promise().query(checkMissingDocsQuery);

//     if (rows.length === 0) {
//       console.log("✅ No LANs eligible for rejection");
//       return;
//     }

//     console.log(`⚠️ ${rows.length} LAN(s) eligible for rejection`);

//     for (const { lan } of rows) {
//       try {
//         // Reject only once
//         const updateQuery = `
//           UPDATE loan_booking_emiclub
//           SET status = 'Rejected'
//           WHERE lan = ?
//           AND status = 'Login'
//         `;

//         const [result] = await db.promise().query(updateQuery, [lan]);

//         if (result.affectedRows === 0) {
//           console.log(`ℹ️ LAN ${lan} already processed`);
//           continue;
//         }

//         console.log(`❌ LAN ${lan} rejected`);

//         // Send webhook only for rejection
//         await sendLoanWebhook({
//           external_ref_no: lan,
//           utr: null,
//           disbursement_date: null,
//           reference_number: lan,
//           status: "REJECTED",
//           reject_reason: "Required KYC documents not uploaded within 5 minutes",
//         });

//         console.log(`📡 Rejection webhook sent for LAN ${lan}`);
//       } catch (lanErr) {
//         console.error(`❌ LAN ${lan} error:`, lanErr.message);
//       }
//     }
//   } catch (e) {
//     console.error("❌ Document validation cron failed:", e.message);
//   }
// });



// 4️⃣ NEW: Allocation bank_date update cron (every 2 minutes)
// 4️⃣ NEW: Allocation bank_date update cron (every 2 minutes)
cron.schedule("*/2 * * * *", async () => {
  console.log("🏦 Running Allocation bank_date update...");
  try {
    const sqlAllocation = `
      UPDATE allocation a
      JOIN repayments_upload ru 
        ON a.payment_id = ru.payment_id 
       AND a.lan = ru.lan
      SET a.bank_date_allocation = ru.bank_date
      WHERE ru.bank_date IS NOT NULL
    `;

    const sqlAllocationAdikosh = `
      UPDATE allocation_adikosh a
      JOIN repayments_upload_adikosh ru 
        ON a.payment_id = ru.payment_id 
       AND a.lan = ru.lan
      SET a.bank_date_allocation = ru.bank_date
      WHERE ru.bank_date IS NOT NULL
    `;

    /* 🔵 allocation_fintree_fsf → only LAN starting with 'GQFSF' */
    const sqlAllocationFintreeFSF = `
      UPDATE allocation_fintree_fsf a
      JOIN repayments_upload ru 
        ON a.payment_id = ru.payment_id 
       AND a.lan = ru.lan
      SET a.bank_date_allocation = ru.bank_date
      WHERE ru.bank_date IS NOT NULL
        AND ru.lan LIKE 'GQFSF%'
    `;

    /* 🟢 allocation_fintree → only LAN starting with 'GQNonFSF' */
    const sqlAllocationFintree = `
      UPDATE allocation_fintree a
      JOIN repayments_upload ru 
        ON a.payment_id = ru.payment_id 
       AND a.lan = ru.lan
      SET a.bank_date_allocation = ru.bank_date
      WHERE ru.bank_date IS NOT NULL
        AND ru.lan LIKE 'GQNonFSF%'
    `;

    await db.promise().query(sqlAllocation);
    await db.promise().query(sqlAllocationAdikosh);
    await db.promise().query(sqlAllocationFintreeFSF);
    await db.promise().query(sqlAllocationFintree);

    console.log("✅ allocation, adikosh, fintree_fsf, fintree bank_date_allocation updated");
  } catch (err) {
    console.error("❌ Allocation cron failed:", err.sqlMessage || err.message);
  }
});

// 5️⃣ WCTL CCOD Interest Accrual Cron

cron.schedule("*/2 * * * *", () => {
  runDailyInterestAccrual();
});

// startAadhaarCron();


////// SUPPLY CHAIN DEMAND CRON - every day at 00:05 
cron.schedule("5 0 * * *", async () => {
  // Runs daily at 00:05
  const today = new Date().toISOString().split("T")[0];
  console.log("🕒 Daily supply chain demand cron running for:", today);

  const [invoices] = await dbCron.promise().query(
    `SELECT
       partner_loan_id,
       lan,
       invoice_number,
       invoice_due_date,
       roi_percentage,
       penal_rate,
       disbursement_amount,
       disbursement_date
     FROM invoice_disbursements
     WHERE status = 'Active'`
  );

  for (const inv of invoices) {
    try {
      await generateDailySupplyChainDemandOneRow(dbCron.promise(), inv, today);
    } catch (e) {
      console.error(`❌ Demand insert failed for ${inv.invoice_number}:`, e.message);
    }
  }

  console.log("✅ Daily supply chain demand cron completed");
});


require('../server');
