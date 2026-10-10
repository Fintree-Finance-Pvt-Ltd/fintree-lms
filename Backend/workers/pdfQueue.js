const { Queue, Worker } = require("bullmq");
const cron = require("node-cron");
const { generateForReport } = require("../jobs/cibilPdfService");
const db = require("../config/db");

const connection = {
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: process.env.REDIS_PORT || 6379,
  maxRetriesPerRequest: null, // Required by BullMQ to prevent crashing on disconnects
};

// Create a new queue for PDF generation
const pdfQueue = new Queue("pdf-generation", { 
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 }
  }
});

/**
 * Determines concurrency based on IST time:
 * - 2:30 AM to 8:00 AM IST => concurrency 2 (off-peak night mode)
 * - 8:00 AM to 2:30 AM IST => concurrency 1 (peak day mode)
 */
function getInitialConcurrency() {
  const istString = new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
  const istDate = new Date(istString);
  const minutes = istDate.getHours() * 60 + istDate.getMinutes();

  // 2:30 AM is 150 minutes, 8:00 AM is 480 minutes
  const isNightOffPeak = minutes >= 150 && minutes < 480;
  return isNightOffPeak ? 2 : 1;
}

// Set up the worker that will process jobs from this queue
let pdfWorker;
if (process.env.RUN_CRONS === 'true') {
  const initialConcurrency = getInitialConcurrency();
  console.log(
    `[PDF Worker] Starting with concurrency: ${initialConcurrency} (${
      initialConcurrency === 2 ? "Night Off-Peak Mode" : "Day Peak Safe Mode"
    })`
  );

  pdfWorker = new Worker(
    "pdf-generation",
    async (job) => {
      const { reportId } = job.data;
      console.log(`[PDF Worker] Processing PDF for reportId: ${reportId}...`);
      
      try {
        const res = await generateForReport(reportId);
        console.log(`[PDF Worker] Success for reportId: ${reportId}`);
        return res;
      } catch (err) {
        console.error(`[PDF Worker] Failed for reportId: ${reportId}:`, err.message);
        throw err;
      }
    },
    {
      connection,
      concurrency: initialConcurrency,
    }
  );

  pdfWorker.on("completed", (job) => {
    console.log(`[PDF Worker] Job ${job.id} completed!`);
  });

  pdfWorker.on("failed", (job, err) => {
    console.error(`[PDF Worker] Job ${job.id} failed with error: ${err.message}`);
  });

  // Switch to Concurrency 2 at 2:30 AM IST (off-peak hours)
  cron.schedule(
    "30 2 * * *",
    () => {
      if (pdfWorker) {
        pdfWorker.concurrency = 2;
        console.log(
          "⚡ [PDF Worker] Night off-peak mode enabled: Concurrency switched to 2 (2:30 AM - 8:00 AM IST)"
        );
      }
    },
    { timezone: "Asia/Kolkata" }
  );

  // Switch to Concurrency 1 at 8:00 AM IST (daytime user hours)
  cron.schedule(
    "0 8 * * *",
    () => {
      if (pdfWorker) {
        pdfWorker.concurrency = 1;
        console.log(
          "🛡️ [PDF Worker] Daytime safe mode enabled: Concurrency switched to 1 (8:00 AM - 2:30 AM IST)"
        );
      }
    },
    { timezone: "Asia/Kolkata" }
  );
}

module.exports = { pdfQueue };

