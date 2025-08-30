// const cron = require("node-cron");
// const db = require("../config/db");

// // Run every day at 12:05 AM server time
// cron.schedule("*/2 * * * *", async () => {
//   console.log("⏰ Running DPD update (every 2 min)...");

//   try {
//     // Call the same procedures your MySQL event was calling
//     //await db.promise().query("CALL increment_aldun_dpd_daily()");
//     await db.promise().query("CALL sp_update_loan_status_dpd()");

//     console.log("✅ Daily DPD update completed successfully");
//   } catch (err) {
//     console.error("❌ Cron job failed:", err.sqlMessage || err.message);
//   }
// });

const cron = require("node-cron");
const db = require("../config/db");

// Run every day at 12:05 AM server time
cron.schedule("*/2 * * * *", async () => {
  console.log("⏰ Running DPD update (every 2 min)...");

  try {
    // CASE 1: Not Set
    await db.promise().query(`
      UPDATE manual_rps_gq_non_fsf
      SET status = 'Not Set', dpd = 0
      WHERE due_date > CURDATE()
    `);

    // CASE 2: Due
    await db.promise().query(`
      UPDATE manual_rps_gq_non_fsf
      SET status = 'Due', dpd = 0
      WHERE due_date = CURDATE() AND remaining_principal > 0
    `);

    // CASE 3: Paid
    await db.promise().query(`
      UPDATE manual_rps_gq_non_fsf
      SET status = 'Paid', dpd = 0
      WHERE due_date <= CURDATE() AND remaining_principal = 0
    `);

    // CASE 4: Part Paid
    await db.promise().query(`
      UPDATE manual_rps_gq_non_fsf
      SET status = 'Part Paid',
          dpd = CASE WHEN DATEDIFF(CURDATE(), due_date) < 0 THEN 0 ELSE DATEDIFF(CURDATE(), due_date) END
      WHERE remaining_principal > 0
        AND (remaining_interest < interest  OR remaining_principal < principal)
    `);

    // CASE 5: Late
    await db.promise().query(`
      UPDATE manual_rps_gq_non_fsf
      SET status = 'Late', dpd = DATEDIFF(CURDATE(), due_date)
      WHERE due_date < CURDATE()
        AND remaining_principal > 0
        AND remaining_interest > 0
    `);

    console.log("✅ Daily DPD update for manual_rps_gq_non_fsf completed successfully");
  } catch (err) {
    console.error("❌ Cron job failed:", err.sqlMessage || err.message);
  }
});