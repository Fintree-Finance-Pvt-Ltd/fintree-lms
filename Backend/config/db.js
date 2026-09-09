// lms-backend/config/db.js

const mysql = require("mysql2");

const useDbSsl =
  String(process.env.DB_SSL || "").toLowerCase() === "true";
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  waitForConnections: true,
  // Was 5 — too tight for this app's ~9 concurrent cron schedules plus normal
  // web traffic sharing one pool; overlapping jobs were starving each other
  // and queuing (queueLimit: 0 below queues indefinitely rather than failing
  // fast). DB server allows up to 151 connections (verified live), so 20
  // leaves ample headroom for other processes sharing the same DB server.
  connectionLimit: 20,
  queueLimit: 0,
ssl: useDbSsl
    ? {
        rejectUnauthorized: false,
      }
    : undefined,
});
pool.getConnection((err, connection) => {
  if (err) {
    console.error("Database connection failed:", err);
  } else {
    console.log("✅ Connected to MySQL");
    connection.release();
  }
});

module.exports = pool; 
