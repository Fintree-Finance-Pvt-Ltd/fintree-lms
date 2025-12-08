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
    "manual_rps_gq_fsf_fintree"
  ];

  try {
    for (const table of tables) {
      await db.promise().query(`
        UPDATE ${table}
        SET
          status = CASE
            WHEN remaining_principal = 0 AND remaining_interest = 0 THEN 'Paid'
            WHEN (emi > 0 AND remaining_emi < 0) THEN 'Part Paid'
            WHEN due_date < CURDATE() AND remaining_principal > 0 THEN 'Late'
            WHEN due_date = CURDATE() AND remaining_principal > 0 THEN 'Due'
            WHEN due_date > CURDATE() THEN 'Not Set'
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


require('../server');
