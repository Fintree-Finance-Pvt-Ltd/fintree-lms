// utils/interestEngine.js
const db = require( "../config/db");

 const runDailyInterestAccrual = async () => {
  console.log("\n🔁  Running Daily Interest Accrual Engine…");

  try {
    const [loans] = await db.promise().query(`
      SELECT 
        lan,
        outstanding_principal,
        annual_interest_rate,
        accrued_interest,
        last_interest_calculation_date
      FROM wctl_ccod_loan_accounts
      WHERE status = 'Active'
    `);

    const today = new Date();  // today (server date)

    for (const loan of loans) {
      const {
        lan,
        outstanding_principal,
        annual_interest_rate,
        accrued_interest,
        last_interest_calculation_date
      } = loan;

      const principal = Number(outstanding_principal);
      const rate = Number(annual_interest_rate);
      let accrued = Number(accrued_interest);

      if (principal <= 0) {
        console.log(`➡ LAN ${lan}: No outstanding principal, skipping.`);
        continue;
      }

      if (!last_interest_calculation_date) {
        console.log(`➡ LAN ${lan}: No interest start date yet, skipping.`);
        continue;
      }

      let lastDate = new Date(last_interest_calculation_date);
      // Start from next day after last calculation
      lastDate.setDate(lastDate.getDate() + 1);

      if (lastDate > today) {
        console.log(`➡ LAN ${lan}: Already up to date, skipping.`);
        continue;
      }

      // Get last cumulative interest from ledger (for lifetime total)
      const [lastLedgerRows] = await db.promise().query(
        `SELECT total_interest + 0 AS total_interest
         FROM wctl_ccod_interest_ledger
         WHERE lan = ?
         ORDER BY interest_date DESC, id DESC
         LIMIT 1`,
        [lan]
      );
      let cumulativeTotal =
        lastLedgerRows.length > 0
          ? Number(lastLedgerRows[0].total_interest)
          : 0;

      // Loop through all missing days
      while (lastDate <= today) {
        const interestDate = new Date(lastDate);
        const dateStr = interestDate.toISOString().split("T")[0];

        const dailyInterest = principal * (rate / 36500);
        cumulativeTotal += dailyInterest;
        accrued += dailyInterest;

        await db.promise().query(
          `INSERT INTO wctl_ccod_interest_ledger
             (lan, interest_date, outstanding_principal, annual_interest_rate,
              daily_interest, days_count, total_interest)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            lan,
            dateStr,
            principal,
            rate,
            dailyInterest.toFixed(2),
            1,
            cumulativeTotal.toFixed(2),
          ]
        );

        console.log(
          `✔ LAN ${lan}: ${dateStr} daily ₹${dailyInterest.toFixed(
            2
          )}, cumulative ₹${cumulativeTotal.toFixed(2)}`
        );

        // next day
        lastDate.setDate(lastDate.getDate() + 1);
      }

      // Update master table accrued_interest and last_interest_calculation_date
      await db.promise().query(
        `UPDATE wctl_ccod_loan_accounts
         SET accrued_interest = ?,
             last_interest_calculation_date = CURDATE()
         WHERE lan = ?`,
        [accrued, lan]
      );
    }

    console.log("✅ Daily Interest Accrual Completed.\n");
  } catch (err) {
    console.error("❌ Daily Interest Cron Error:", err);
  }
};


module.exports = { runDailyInterestAccrual };