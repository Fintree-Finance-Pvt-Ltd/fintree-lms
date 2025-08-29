const cron = require("node-cron");
const db = require("../config/db");

// Run every day at 12:05 AM server time
cron.schedule("*/2 * * * *", async () => {
  console.log("⏰ Running DPD update (every 2 min)...");

  try {
    // Call the same procedures your MySQL event was calling
    await db.promise().query("CALL increment_aldun_dpd_daily()");
    await db.promise().query("CALL update_loan_status_dpd_event()");

    console.log("✅ Daily DPD update completed successfully");
  } catch (err) {
    console.error("❌ Cron job failed:", err.sqlMessage || err.message);
  }
});
