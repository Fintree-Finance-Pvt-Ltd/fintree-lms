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
  connectionLimit: 5,
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
