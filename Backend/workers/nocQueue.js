const { Queue, Worker } = require("bullmq");
const { generateNoc } = require("../services/noc.service");

const connection = {
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: process.env.REDIS_PORT || 6379,
  maxRetriesPerRequest: null,
};

const nocQueue = new Queue("noc-queue", { 
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 10000 }
  }
});

let nocWorker;
if (process.env.RUN_CRONS === 'true') {
  nocWorker = new Worker(
    "noc-queue",
    async (job) => {
      const { lan } = job.data;
      console.log(`[NOC Worker] Processing NOC for LAN: ${lan}...`);
      
      try {
        const res = await generateNoc({ lan, baseUrl: process.env.BASE_URL });
        console.log(`[NOC Worker] Success for LAN: ${lan}`);
        return res;
      } catch (err) {
        console.error(`[NOC Worker] Failed for LAN: ${lan}:`, err.message);
        throw err;
      }
    },
    {
      connection,
      concurrency: 2, 
    }
  );

  nocWorker.on("completed", (job) => {
    console.log(`[NOC Worker] Job ${job.id} completed!`);
  });

  nocWorker.on("failed", (job, err) => {
    console.error(`[NOC Worker] Job ${job.id} failed with error: ${err.message}`);
  });
}

module.exports = { nocQueue };
