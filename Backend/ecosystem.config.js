


// backend/ecosystem.config.js
module.exports = {
    apps: [
      {
        name: "fintree-lms",
        script: "server.js", // or your entry file name
        cwd: "./",          // Current working directory
        // Was `true` — this restarts the whole app on any file change under
        // cwd, which can cut off an in-flight cron job mid-transaction
        // (leaving DB state like idempotency records stuck at PROCESSING).
        // Only useful in local dev; must stay off in production.
        watch: false,
        ignore_watch: ["node_modules", "uploads", "logs"], // optional
        instances: 1,       // Can be set to 'max' for cluster mode
        autorestart: true,
        max_memory_restart: "1G",
        env: {
          NODE_ENV: "development",
          PORT: 5000
        },
        env_production: {
          NODE_ENV: "production",
          PORT: 5000
        }
      }
    ]
  };
  