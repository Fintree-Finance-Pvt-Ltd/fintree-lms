const axios = require("axios");
const cron = require("node-cron");
const basePool = require("../config/db");
const pool = basePool.promise();

const tz = "Asia/Kolkata";

const {
  ALOT_API_URL = "https://alotsolutions.in/api/mt/SendSMS",
  ALOT_USER,
  ALOT_PASSWORD,
  SENDER_ID,
  DLT_PEID,
  DLT_TEMPLATE_ID_DUE,
  DLT_TEMPLATE_ID_OVERDUE,
  ALOT_CHANNEL = "TRANS",
  ALOT_DCS_DEFAULT = "0",
  ALOT_FLASH = "0",
  ALOT_ROUTE = "5",
} = process.env;

// -------------------- helpers --------------------
function cleanMobile(m) {
  if (!m) return null;
  const d = String(m).replace(/\D/g, "");
  if (d.length === 10) return "91" + d; // India default
  if (d.length === 12 && d.startsWith("91")) return d;
  return d;
}
function isUnicode(text) {
  return /[^\x00-\x7F]/.test(text || "");
}

// -------------------- reusable SMS sender --------------------
async function sendSms({ mobile, message, dltTemplateId }) {
  const msisdn = cleanMobile(mobile);
  if (!msisdn) throw new Error("Invalid mobile number");

  const smsUrl = `${ALOT_API_URL}?user=${encodeURIComponent(
    ALOT_USER
  )}&password=${encodeURIComponent(
    ALOT_PASSWORD
  )}&senderid=${SENDER_ID}&channel=${ALOT_CHANNEL}&DCS=${
    isUnicode(message) ? "8" : ALOT_DCS_DEFAULT
  }&flashsms=${ALOT_FLASH}&number=${msisdn}&text=${encodeURIComponent(
    message
  )}&route=${ALOT_ROUTE}&DLTTemplateId=${dltTemplateId || ""}&PEID=${DLT_PEID}`;

  const res = await axios.get(smsUrl, { timeout: 20000 });
  const body =
    typeof res.data === "string" ? res.data : JSON.stringify(res.data);
  const ok = /success|^1701\b|^000\b/i.test(body);

  if (!ok) throw new Error(`ALOT send failed: ${body}`);
  return body.slice(0, 100); // provider response snippet / id
}

// -------------------- table discovery --------------------
const EXCLUDE = {
  rps: [
    "manual_rps_adikosh",
    "manual_rps_adikosh_fintree",
    "manual_rps_adikosh_partner",
    "manual_rps_adikosh_fintree_roi",
  ],
  booking: ["loan_booking_adikosh"],
};

const notIn = (arr) =>
  arr.length ? ` AND table_name NOT IN (${arr.map(() => "?").join(",")})` : "";

async function discoverTables() {
  const SCHEMA = process.env.DB_NAME;
  const likeRps = "manual_rps\\_%";
  const likeBooks = "loan_booking\\_%";

  const rpsSql = `
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = ? AND table_name LIKE ?${notIn(EXCLUDE.rps)}
  `;
  const rpsParams = [SCHEMA, likeRps, ...EXCLUDE.rps];

  const bookSql = `
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = ? AND (
      (table_name LIKE ?${notIn(EXCLUDE.booking)})
      OR table_name = 'loan_bookings'
    )
  `;
  const bookParams = [SCHEMA, likeBooks, ...EXCLUDE.booking];

  const [rpsRows] = await pool.query(rpsSql, rpsParams);
  const [bookRows] = await pool.query(bookSql, bookParams);

  return {
    rpsTables: rpsRows.map((r) => r.table_name),
    bookingTables: bookRows.map((r) => r.table_name),
  };
}

function buildUnions(rpsTables, bookingTables) {
  const CHARSET = "utf8mb4";
  const COLLATE = "utf8mb4_unicode_ci";
  const col = (expr) => `CONVERT(${expr} USING ${CHARSET}) COLLATE ${COLLATE}`;
  const lit = (s) =>
    `CAST('${s}' AS CHAR CHARACTER SET ${CHARSET}) COLLATE ${COLLATE}`;

  const rpsUnion = rpsTables
    .map(
      (t) => `
    SELECT ${lit(t)} AS src_table, ${col("LAN")} AS lan, due_date, ${col(
        "status"
      )} AS status, emi, payment_date
    FROM \`${t}\`
  `.trim()
    )
    .join(" UNION ALL ");

  const bookUnion = bookingTables
    .map(
      (t) => `
    SELECT ${lit(t)} AS src_table, ${col("lan")} AS lan, ${col(
        "customer_name"
      )} AS customer_name, ${col("mobile_number")} AS mobile_number
    FROM \`${t}\`
  `.trim()
    )
    .join(" UNION ALL ");

  return { rpsUnion, bookUnion };
}

// -------------------- queue DUE + OVERDUE --------------------
async function queueToday() {
  const { rpsTables, bookingTables } = await discoverTables();
  if (!rpsTables.length || !bookingTables.length) {
    console.warn("No RPS/booking tables found; skipping queue.");
    return { due: 0, overdue: 0 };
  }
  const { rpsUnion, bookUnion } = buildUnions(rpsTables, bookingTables);

  // DUE: send T-4 through T
  const sqlDue = `
    INSERT INTO sms_outbox 
      (sms_type, lan, due_date, mobile, customer_name, message, amount_paise, dlt_header, dlt_template_id, status)
    SELECT 'DUE', r.lan, r.due_date, b.mobile_number, b.customer_name,
      CONCAT('Dear ', COALESCE(b.customer_name,'Customer'),
        ', your EMI of Rs.', ROUND(r.emi),
        ' for Loan A/c ', r.lan,
        ' is due on ', DATE_FORMAT(r.due_date, '%d %b %Y'),
        '. Kindly ensure payment on or before the due date to avoid late charges.'
      ),
      ROUND(r.emi * 100), ?, ?, 'QUEUED'
    FROM (${rpsUnion}) r
    JOIN (${bookUnion}) b ON b.lan = r.lan
    LEFT JOIN sms_outbox o 
      ON o.sms_type='DUE' AND o.lan=r.lan AND o.due_date=r.due_date AND DATE(o.created_at)=CURDATE()
    WHERE r.due_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 4 DAY)
      AND (r.status IS NULL OR r.status <> 'Paid')
      AND o.id IS NULL
  `;

  // OVERDUE: send only T+2 and T+4
  const sqlOverdue = `
    INSERT INTO sms_outbox 
      (sms_type, lan, due_date, mobile, customer_name, message, amount_paise, dlt_header, dlt_template_id, status)
    SELECT 'OVERDUE', r.lan, r.due_date, b.mobile_number, b.customer_name,
      CONCAT('Payment of Rs. ', ROUND(r.emi),
        ' for Loan A/c ', r.lan,
        ', due on ', DATE_FORMAT(r.due_date, '%d %b %Y'),
        ', is still pending. Please clear dues at the earliest'
      ),
      ROUND(r.emi * 100), ?, ?, 'QUEUED'
    FROM (${rpsUnion}) r
    JOIN (${bookUnion}) b ON b.lan = r.lan
    LEFT JOIN sms_outbox o 
      ON o.sms_type='OVERDUE' AND o.lan=r.lan AND o.due_date=r.due_date AND DATE(o.created_at)=CURDATE()
    WHERE DATEDIFF(CURDATE(), r.due_date) IN (2,4)
      AND (r.status IS NULL OR r.status <> 'Paid')
      AND (r.payment_date IS NULL OR DATE(r.payment_date) > DATE(r.due_date))
      AND o.id IS NULL
  `;

  const [r1] = await pool.query(sqlDue, [SENDER_ID, DLT_TEMPLATE_ID_DUE]);
  const [r2] = await pool.query(sqlOverdue, [SENDER_ID, DLT_TEMPLATE_ID_OVERDUE]);

  return { due: r1.affectedRows || 0, overdue: r2.affectedRows || 0 };
}

// -------------------- process queue --------------------
async function sendQueued(limit = 200) {
  const [rows] = await pool.query(
    `SELECT id, mobile, message, dlt_template_id FROM sms_outbox WHERE status='QUEUED' ORDER BY id ASC LIMIT ?`,
    [limit]
  );

  for (const r of rows) {
    try {
      const providerId = await sendSms({
        mobile: r.mobile,
        message: r.message,
        dltTemplateId: r.dlt_template_id,
      });
      await pool.query(
        `UPDATE sms_outbox SET status='SENT', provider_msg_id=?, sent_at=NOW(), error_text=NULL WHERE id=?`,
        [providerId, r.id]
      );
    } catch (e) {
      await pool.query(
        `UPDATE sms_outbox SET status='FAILED', error_text=? WHERE id=?`,
        [String(e).slice(0, 490), r.id]
      );
    }
  }

  return rows.length;
}

// -------------------- public API --------------------
async function runOnce() {
  const q = await queueToday();
  const sent = await sendQueued(300);
  console.log("📨 SMS | queued:", q, "| sent:", sent);
}

function initScheduler() {
  // Run every day at 12:30 PM IST
  cron.schedule("30 12 * * *", () => runOnce(), { timezone: tz });

  // Send queued SMS every 10 minutes
  cron.schedule(
    "*/10 * * * *",
    () => sendQueued(300).then((n) => n && console.log("🚚 sent batch:", n)),
    { timezone: tz }
  );

  console.log("⏰ SMS scheduler active (IST).");
}

module.exports = { initScheduler, runOnce, sendSms };
