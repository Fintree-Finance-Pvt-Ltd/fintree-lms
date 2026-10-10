const { Queue, Worker } = require("bullmq");
const { sendWelcomeLetterAfterUtrUpload } = require("../services/welcomeLetterService");

const connection = {
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: process.env.REDIS_PORT || 6379,
  maxRetriesPerRequest: null,
};

const welcomeLetterQueue = new Queue("welcome-letter-queue", { 
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 10000 }
  }
});

const welcomeLetterWorker = new Worker(
  "welcome-letter-queue",
  async (job) => {
    const { lan, utrNumber } = job.data;
    console.log(`[WelcomeLetter Worker] Processing for LAN: ${lan}...`);
    
    try {
      const res = await sendWelcomeLetterAfterUtrUpload({ lan, utrNumber });
      console.log(`[WelcomeLetter Worker] Success for LAN: ${lan}`);
      return res;
    } catch (err) {
      console.error(`[WelcomeLetter Worker] Failed for LAN: ${lan}:`, err.message);
      throw err;
    }
  },
  {
    connection,
    concurrency: 2, 
  }
);

welcomeLetterWorker.on("completed", (job) => {
  console.log(`[WelcomeLetter Worker] Job ${job.id} completed!`);
});

welcomeLetterWorker.on("failed", (job, err) => {
  console.error(`[WelcomeLetter Worker] Job ${job.id} failed with error: ${err.message}`);
});

module.exports = { welcomeLetterQueue };
