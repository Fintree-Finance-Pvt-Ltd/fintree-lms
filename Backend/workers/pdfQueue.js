const { Queue, Worker } = require("bullmq");
const cron = require("node-cron");
const { generateForReport } = require("../jobs/cibilPdfService");
const db = require("../config/db");

const connection = {
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: process.env.REDIS_PORT || 6379,
  maxRetriesPerRequest: null, // Required by BullMQ to prevent crashing on disconnects
};

// Configurable concurrency with sensible defaults for 8 GB RAM / 2-core VPS
const DAY_CONCURRENCY = Number(process.env.PDF_CONCURRENCY_DAY || process.env.PDF_WORKER_CONCURRENCY || 4);
const NIGHT_CONCURRENCY = Number(process.env.PDF_CONCURRENCY_NIGHT || process.env.PDF_WORKER_CONCURRENCY || 6);

// Create a new queue for PDF generation
const pdfQueue = new Queue("pdf-generation", { 
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 500 },
  }
});

/**
 * Determines concurrency based on IST time:
 * - 2:30 AM to 8:00 AM IST => concurrency 6 (off-peak night mode)
 * - 8:00 AM to 2:30 AM IST => concurrency 4 (daytime mode)
 */
function getInitialConcurrency() {
  const istString = new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
  const istDate = new Date(istString);
  const minutes = istDate.getHours() * 60 + istDate.getMinutes();

  // 2:30 AM is 150 minutes, 8:00 AM is 480 minutes
  const isNightOffPeak = minutes >= 150 && minutes < 480;
  return isNightOffPeak ? NIGHT_CONCURRENCY : DAY_CONCURRENCY;
}

// Set up the worker that will process jobs from this queue
let pdfWorker;
if (process.env.RUN_CRONS === 'true') {
  const initialConcurrency = getInitialConcurrency();
  console.log(
    `[PDF Worker] Starting with concurrency: ${initialConcurrency} (${
      initialConcurrency === NIGHT_CONCURRENCY ? `Night Off-Peak Mode (${NIGHT_CONCURRENCY})` : `Day Mode (${DAY_CONCURRENCY})`
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

  // Switch to Night off-peak concurrency at 2:30 AM IST
  cron.schedule(
    "30 2 * * *",
    () => {
      if (pdfWorker) {
        pdfWorker.concurrency = NIGHT_CONCURRENCY;
        console.log(
          `⚡ [PDF Worker] Night off-peak mode enabled: Concurrency switched to ${NIGHT_CONCURRENCY} (2:30 AM - 8:00 AM IST)`
        );
      }
    },
    { timezone: "Asia/Kolkata" }
  );

  // Switch to Daytime concurrency at 8:00 AM IST
  cron.schedule(
    "0 8 * * *",
    () => {
      if (pdfWorker) {
        pdfWorker.concurrency = DAY_CONCURRENCY;
        console.log(
          `🛡️ [PDF Worker] Daytime mode enabled: Concurrency switched to ${DAY_CONCURRENCY} (8:00 AM - 2:30 AM IST)`
        );
      }
    },
    { timezone: "Asia/Kolkata" }
  );
}

module.exports = { pdfQueue };

