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
  // 4 PM2 processes now share this one DB server (fintree-api x2, fintree-crons,
  // fintree-uat), each with its own pool — at the old connectionLimit: 20 that's
  // 80 possible connections before counting admin tools/scripts, and the server
  // caps at 151 (Max_used_connections has already peaked at 152, i.e. maxed out
  // at least once). 12 x 4 = 48 leaves real headroom. queueLimit: 0 used to mean
  // "wait forever, silently" once the pool was exhausted — a request with no free
  // connection and no connectTimeout just hung with nothing in the logs, which is
  // what looked like the app "stuck" with no error anywhere. Bounding queueLimit
  // and adding connectTimeout makes that failure fast and loud instead.
  connectionLimit: 12,
  queueLimit: 0,
  connectTimeout: 10000,
  idleTimeout: 60000,
  maxIdle: 6,
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
