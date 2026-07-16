const cron = require("node-cron");

const {
  retryFailedWebhooks,
} = require(
  "../routes/switchMyLoan/switchMyLoanWebhook"
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
        "[RAPID-MONEY-WEBHOOK-RETRY] Previous job still running",
      );

      return;
    }

    jobRunning = true;

    try {
      const result =
        await retryFailedWebhooks();

      if (result.processed > 0) {
        console.log(
          "[RAPID-MONEY-WEBHOOK-RETRY] Completed",
          result,
        );
      }
    } catch (error) {
      console.error(
        "[RAPID-MONEY-WEBHOOK-RETRY] Error",
        {
          message: error.message,
          stack: error.stack,
        },
      );
    } finally {
      jobRunning = false;
    }
  },
  {
    timezone: "Asia/Kolkata",
  },
);

console.log(
  "[RAPID-MONEY-WEBHOOK-RETRY] Cron registered",
);