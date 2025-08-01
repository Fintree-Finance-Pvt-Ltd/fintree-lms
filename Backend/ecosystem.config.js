


// backend/ecosystem.config.js
module.exports = {
    apps: [
      {
        name: "fintree-lms",
        script: "server.js", // or your entry file name
        cwd: "./",          // Current working directory
        watch: true,        // Restart on file change (disable in prod)
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
  