const cron = require("node-cron");
console.log(
  "🔥 QUICK MONEY WEBHOOK RETRY FILE LOADED"
);
const {
  retryFailedWebhooks,
} = require(
  "../routes/QuickMoney/quickMoneyWebhook"
);

let jobRunning = false;

/*
 * Run every 5 minutes.
 */
cron.schedule(
  "*/5 * * * *",
  async () => {

    if (jobRunning) {
      console.log(
        "[QUICK-MONEY-WEBHOOK-RETRY] Previous job still running"
      );

      return;
    }

    jobRunning = true;

    try {

      const result =
        await retryFailedWebhooks();

      if (result.processed > 0) {
        console.log(
          "[QUICK-MONEY-WEBHOOK-RETRY] Completed",
          result
        );
      }

    } catch (error) {

      console.error(
        "[QUICK-MONEY-WEBHOOK-RETRY] Error",
        {
          message: error.message,
          stack: error.stack,
        }
      );

    } finally {

      jobRunning = false;

    }
  },
  {
    timezone: "Asia/Kolkata",
  }
);

console.log(
  "[QUICK-MONEY-WEBHOOK-RETRY] Cron registered"
);