const { Queue, Worker } = require("bullmq");
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

// Set up the worker that will process jobs from this queue
let pdfWorker;
if (process.env.RUN_CRONS === 'true') {
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
      concurrency: 5, // Maximum 5 PDFs generated at the exact same time
    }
  );

  pdfWorker.on("completed", (job) => {
    console.log(`[PDF Worker] Job ${job.id} completed!`);
  });

  pdfWorker.on("failed", (job, err) => {
    console.error(`[PDF Worker] Job ${job.id} failed with error: ${err.message}`);
  });
}

module.exports = { pdfQueue };
