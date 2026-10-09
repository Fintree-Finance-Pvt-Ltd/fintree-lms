


// backend/ecosystem.config.js
module.exports = {
  apps: [
    {
      name: "fintree-api",
      script: "server.js",
      cwd: "./",
      watch: false,
      ignore_watch: ["node_modules", "uploads", "logs"],
      instances: 2,
      exec_mode: "cluster",
      autorestart: true,
      kill_timeout: 15000,
      max_memory_restart: "2G",
      env: {
        NODE_ENV: "development",
        PORT: 5000,
        RUN_CRONS: "false"
      },
      env_production: {
        NODE_ENV: "production",
        PORT: 5000,
        RUN_CRONS: "false"
      }
    },
    {
      name: "fintree-crons",
      script: "server.js",
      cwd: "./",
      watch: false,
      ignore_watch: ["node_modules", "uploads", "logs"],
      instances: 1,
      autorestart: true,
      kill_timeout: 15000,
      max_memory_restart: "2G",
      env: {
        NODE_ENV: "development",
        PORT: 5009,
        RUN_CRONS: "true"
      },
      env_production: {
        NODE_ENV: "production",
        PORT: 5009,
        RUN_CRONS: "true"
      }
    }
  ]
};
  