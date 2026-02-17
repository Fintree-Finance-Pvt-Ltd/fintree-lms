

////////////////////////////////////////////////////////////

// Backend/routes/dashboardRoutes.js
const express = require("express");
const db = require("../config/db");
const router = express.Router();
const nodemailer = require("nodemailer");
const XLSX = require("xlsx");

/* ============================ Settings ============================ */

// Force a consistent collation at JOIN-time to avoid “illegal mix of collations”
const JOIN_COLLATE = "utf8mb4_unicode_ci";
const USE_COLLATE_IN_JOINS = true; // keep true until all tables share the same collation

// Helper to build equality on LAN with/without COLLATE
function eqLan(leftExpr, rightExpr) {
  return USE_COLLATE_IN_JOINS
    ? `${leftExpr} COLLATE ${JOIN_COLLATE} = ${rightExpr} COLLATE ${JOIN_COLLATE}`
    : `${leftExpr} = ${rightExpr}`;
}

/* ============================ Helpers ============================ */

// Accepts 'YYYY-MM-DD' (or empty) and returns { start, end } where end is exclusive
function dayRange(from, to) {
  const start = from && String(from).trim() ? String(from).trim() : null;
  let end = null;
  if (to && String(to).trim()) {
    const dt = new Date(String(to).trim());
    dt.setDate(dt.getDate() + 1);
    end = dt.toISOString().slice(0, 10);
  }
  return { start, end };
}

// Builds "AND field >= ? AND field < ?" with params, using start/end if present
function buildDateRangeClause(field, start, end) {
  const parts = [];
  const params = [];
  if (start) {
    parts.push(`${field} >= ?`);
    params.push(start);
  }
  if (end) {
    parts.push(`${field} < ?`);
    params.push(end);
  }
  return { clause: parts.length ? ` AND ${parts.join(" AND ")}` : "", params };
}


function normalizeProduct(p) {
  if (!p || p === "ALL") return "ALL";
  const s = String(p).toLowerCase().replace(/\s+/g, "").replace(/-/g, "");
  switch (s) {
    case "evloan":
    case "ev_loan":
      return "EV";
    case "blloan":
    case "bl_loan":
      return "BL";
    case "adikosh":
      return "Adikosh";
    case "gqnonfsf":
    case "gqnon-fsf":
      return "GQ Non-FSF";
    case "gqfsf":
    case "gq-fsf":
      return "GQ FSF";
    case "wctl":
      return "WCTL";
    case "embifi":
      return "Embifi";
    case "circlepe":
      return "Circle Pe";
    case "emiclub":
      return "EMICLUB";
    case "finso":
      return "Finso";
    case "heyev":
    case "hey_ev":
      return "Hey EV";
    default:
      return p;
  }
}


/* ============================ Routes ============================ */


/////////////   Sajag Add New ////////////////////////

router.post("/disbursal-trend", async (req, res) => {
  try {
    const { product, from, to } = req.body || {};
    const prod = normalizeProduct(product);
    const { start, end } = dayRange(from, to);

    const unions = [];
    const params = [];

    // Helper to add a query for each product
    const addUnion = (rpsTable, bookingTable, label) => {
      const dr = buildDateRangeClause("agreement_date", start, end);
      const sql = `
        SELECT 
          DATE_FORMAT(lb.agreement_date, '%Y-%m-%d') AS month,
          '${label}' AS product,
          SUM(mr.principal) AS total_disbursed
        FROM ${bookingTable} lb
        JOIN ${rpsTable} mr 
          ON lb.lan = mr.lan
        WHERE 1=1 ${dr.clause}
        GROUP BY DATE_FORMAT(lb.agreement_date, '%Y-%m-%d')
      `;
      unions.push(sql);
      params.push(...dr.params);
    };

    // 🔹 Map each product to its loan & manual_rps tables
    const productMap = {
      BL:        { rps: "manual_rps_bl_loan",       booking: "loan_bookings",           label: "BL Loan" },
      EV:        { rps: "manual_rps_ev_loan",       booking: "loan_booking_ev",         label: "EV Loan" },
      Adikosh:   { rps: "manual_rps_adikosh",       booking: "loan_booking_adikosh",    label: "Adikosh" },
      "GQ Non-FSF": { rps: "manual_rps_gq_non_fsf", booking: "loan_booking_gq_non_fsf", label: "GQ Non-FSF" },
      "GQ FSF":  { rps: "manual_rps_gq_fsf",        booking: "loan_booking_gq_fsf",     label: "GQ FSF" },
      Embifi:    { rps: "manual_rps_embifi_loan",   booking: "loan_booking_embifi",     label: "Embifi" },
      WCTL:      { rps: "manual_rps_wctl",          booking: "loan_bookings_wctl",      label: "WCTL" },
      EMICLUB:   { rps: "manual_rps_emiclub",       booking: "loan_booking_emiclub",    label: "EMICLUB" },
      Finso:     { rps: "manual_rps_finso_loan",    booking: "loan_booking_finso",      label: "Finso" },
      "Hey EV":  { rps: "manual_rps_hey_ev",        booking: "loan_booking_hey_ev",     label: "Hey EV" },
      "Circle Pe": { rps: "manual_rps_circlepe",    booking: "loan_booking_circle_pe",  label: "Circle Pe" },
    };

    // 🔹 Add relevant queries
    Object.entries(productMap).forEach(([key, { rps, booking, label }]) => {
      if (prod === "ALL" || prod === key) {
        addUnion(rps, booking, label);
      }
    });

    // 🔹 Combine and execute
    const sql = unions.join(" UNION ALL ") + " ORDER BY month, product";
    const [rows] = await db.promise().query(sql, params);

    res.json(rows);
  } catch (err) {
    console.error("❌ Disbursal Trend Error:", err);
    res.status(500).json({ error: "Disbursal trend fetch failed" });
  }
});
/////////////   Sajag Add New End////////////////////////

/** -------------------- Repayment Trend -------------------- */
router.post("/repayment-trend", async (req, res) => {
  try {
    const { product, from, to } = req.body || {};
    const prod = normalizeProduct(product);
    const { start, end } = dayRange(from, to);

    const queries = [];
    const params = [];

    const dateR = buildDateRangeClause("r.payment_date", start, end);
    const dateA = buildDateRangeClause("payment_date", start, end);

    if (prod === "ALL" || prod === "BL") {
      queries.push(`
        SELECT DATE_FORMAT(r.payment_date, '%Y-%m-%d') AS month,
               'BL Loan' AS product,
               SUM(r.transfer_amount) AS total_collected
        FROM repayments_upload r
        JOIN loan_bookings b 
          ON ${eqLan("b.lan", "r.lan")}
        WHERE r.payment_date IS NOT NULL
          ${dateR.clause}
        GROUP BY DATE_FORMAT(r.payment_date, '%Y-%m-%d')
      `);
      params.push(...dateR.params);
    }

    if (prod === "ALL" || prod === "EV") {
      queries.push(`
        SELECT DATE_FORMAT(r.payment_date, '%Y-%m-%d') AS month,
               'EV Loan' AS product,
               SUM(r.transfer_amount) AS total_collected
        FROM repayments_upload r
        JOIN loan_booking_ev e 
          ON ${eqLan("e.lan", "r.lan")}
        WHERE r.payment_date IS NOT NULL
          ${dateR.clause}
        GROUP BY DATE_FORMAT(r.payment_date, '%Y-%m-%d')
      `);
      params.push(...dateR.params);
    }

    if (prod === "ALL" || prod === "Adikosh") {
      queries.push(`
        SELECT DATE_FORMAT(payment_date, '%Y-%m-%d') AS month,
               'Adikosh' AS product,
               SUM(transfer_amount) AS total_collected
        FROM repayments_upload_adikosh
        WHERE payment_date IS NOT NULL
          ${dateA.clause}
        GROUP BY DATE_FORMAT(payment_date, '%Y-%m-%d')
      `);
      params.push(...dateA.params);
    }

    if (prod === "ALL" || prod === "GQ Non-FSF") {
      queries.push(`
        SELECT DATE_FORMAT(payment_date, '%Y-%m-%d') AS month,
               'GQ Non-FSF' AS product,
               SUM(transfer_amount) AS total_collected
        FROM repayments_upload
        WHERE payment_date IS NOT NULL
          AND lan ${USE_COLLATE_IN_JOINS ? `COLLATE ${JOIN_COLLATE}` : ""} IN (
            SELECT lan ${USE_COLLATE_IN_JOINS ? `COLLATE ${JOIN_COLLATE}` : ""
        } FROM loan_booking_gq_non_fsf
          )
          ${dateA.clause}
        GROUP BY DATE_FORMAT(payment_date, '%Y-%m-%d')
      `);
      params.push(...dateA.params);
    }

    if (prod === "ALL" || prod === "Embifi") {
      queries.push(`
        SELECT DATE_FORMAT(payment_date, '%Y-%m-%d') AS month,
               'Embifi' AS product,
               SUM(transfer_amount) AS total_collected
        FROM repayments_upload
        WHERE payment_date IS NOT NULL
          AND lan ${USE_COLLATE_IN_JOINS ? `COLLATE ${JOIN_COLLATE}` : ""} IN (
            SELECT lan ${USE_COLLATE_IN_JOINS ? `COLLATE ${JOIN_COLLATE}` : ""
        } FROM loan_booking_embifi
          )
          ${dateA.clause}
        GROUP BY DATE_FORMAT(payment_date, '%Y-%m-%d')
      `);
      params.push(...dateA.params);
    }

    if (prod === "ALL" || prod === "WCTL") {
      queries.push(`
        SELECT DATE_FORMAT(payment_date, '%Y-%m-%d') AS month,
               'WCTL' AS product,
               SUM(transfer_amount) AS total_collected
        FROM repayments_upload
        WHERE payment_date IS NOT NULL
          AND lan ${USE_COLLATE_IN_JOINS ? `COLLATE ${JOIN_COLLATE}` : ""} IN (
            SELECT lan ${USE_COLLATE_IN_JOINS ? `COLLATE ${JOIN_COLLATE}` : ""
        } FROM loan_bookings_wctl
          )
          ${dateA.clause}
        GROUP BY DATE_FORMAT(payment_date, '%Y-%m-%d')
      `);
      params.push(...dateA.params);
    }

    if (prod === "ALL" || prod === "EMICLUB") {
      queries.push(`
        SELECT DATE_FORMAT(payment_date, '%Y-%m-%d') AS month,
               'EMICLUB' AS product,
               SUM(transfer_amount) AS total_collected
        FROM repayments_upload
        WHERE payment_date IS NOT NULL
          AND lan ${USE_COLLATE_IN_JOINS ? `COLLATE ${JOIN_COLLATE}` : ""} IN (
            SELECT lan ${USE_COLLATE_IN_JOINS ? `COLLATE ${JOIN_COLLATE}` : ""
        } FROM loan_booking_emiclub
          )
          ${dateA.clause}
        GROUP BY DATE_FORMAT(payment_date, '%Y-%m-%d')
      `);
      params.push(...dateA.params);
    }

    if (prod === "ALL" || prod === "Circle Pe") {
      queries.push(`
        SELECT DATE_FORMAT(payment_date, '%Y-%m-%d') AS month,
               'Circle Pe' AS product,
               SUM(transfer_amount) AS total_collected
        FROM repayments_upload
        WHERE payment_date IS NOT NULL
          AND lan ${USE_COLLATE_IN_JOINS ? `COLLATE ${JOIN_COLLATE}` : ""} IN (
            SELECT lan ${USE_COLLATE_IN_JOINS ? `COLLATE ${JOIN_COLLATE}` : ""
        } FROM loan_booking_circle_pe
          )
          ${dateA.clause}
        GROUP BY DATE_FORMAT(payment_date, '%Y-%m-%d')
      `);
      params.push(...dateA.params);
    }
    if (prod === "ALL" || prod === "Finso") {
      queries.push(`
        SELECT DATE_FORMAT(payment_date, '%Y-%m-%d') AS month,
               'Finso' AS product,
               SUM(transfer_amount) AS total_collected
        FROM repayments_upload
        WHERE payment_date IS NOT NULL
          AND lan ${USE_COLLATE_IN_JOINS ? `COLLATE ${JOIN_COLLATE}` : ""} IN (
            SELECT lan ${USE_COLLATE_IN_JOINS ? `COLLATE ${JOIN_COLLATE}` : ""
        } FROM loan_booking_finso
          )
          ${dateA.clause}
        GROUP BY DATE_FORMAT(payment_date, '%Y-%m-%d')
      `);
      params.push(...dateA.params);
    }
    if (prod === "ALL" || prod === "Hey EV") {
      queries.push(`
        SELECT DATE_FORMAT(payment_date, '%Y-%m-%d') AS month,
               'Hey EV' AS product,
               SUM(transfer_amount) AS total_collected
        FROM repayments_upload
        WHERE payment_date IS NOT NULL
          AND lan ${USE_COLLATE_IN_JOINS ? `COLLATE ${JOIN_COLLATE}` : ""} IN (
            SELECT lan ${USE_COLLATE_IN_JOINS ? `COLLATE ${JOIN_COLLATE}` : ""
        } FROM loan_booking_hey_ev
          )
          ${dateA.clause}
        GROUP BY DATE_FORMAT(payment_date, '%Y-%m-%d')
      `);
      params.push(...dateA.params);
    }
    const sql = queries.join(" UNION ALL ") + " ORDER BY month, product";
    const [rows] = await db.promise().query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error("❌ Repayment Trend Error:", err);
    res.status(500).json({ error: "Repayment trend fetch failed" });
  }
});

/** -------------------- Collection vs Due -------------------- */
router.post("/collection-vs-due", async (req, res) => {
  try {
    const { product, from, to } = req.body || {};
    const prod = normalizeProduct(product);
    const { start, end } = dayRange(from, to);

    const queries = [];
    const params = [];

    const dueR = buildDateRangeClause("due_date", start, end);
    const payR = buildDateRangeClause("payment_date", start, end);

    // DUE
    if (prod === "ALL" || prod === "EV") {
      queries.push(`
        SELECT DATE_FORMAT(due_date, '%Y-%m-%d') AS month,
               'EV Loan' AS product,
               SUM(emi) AS total_due,
               0 AS total_collected
        FROM manual_rps_ev_loan
        WHERE due_date < CURDATE() ${dueR.clause}
        GROUP BY DATE_FORMAT(due_date, '%Y-%m-%d')
      `);
      params.push(...dueR.params);
    }
    if (prod === "ALL" || prod === "BL") {
      queries.push(`
        SELECT DATE_FORMAT(due_date, '%Y-%m-%d') AS month,
               'BL Loan' AS product,
               SUM(emi) AS total_due,
               0 AS total_collected
        FROM manual_rps_bl_loan
        WHERE due_date < CURDATE() ${dueR.clause}
        GROUP BY DATE_FORMAT(due_date, '%Y-%m-%d')
      `);
      params.push(...dueR.params);
    }
    if (prod === "ALL" || prod === "Adikosh") {
      queries.push(`
        SELECT DATE_FORMAT(due_date, '%Y-%m-%d') AS month,
               'Adhikosh' AS product,
               SUM(emi) AS total_due,
               0 AS total_collected
        FROM manual_rps_adikosh
        WHERE due_date < CURDATE() ${dueR.clause}
        GROUP BY DATE_FORMAT(due_date, '%Y-%m-%d')
      `);
      params.push(...dueR.params);
    }

    if (prod === "ALL" || prod === "Embifi") {
      queries.push(`
        SELECT DATE_FORMAT(due_date, '%Y-%m-%d') AS month,
               'Embifi' AS product,
               SUM(emi) AS total_due,
               0 AS total_collected
        FROM manual_rps_embifi_loan
        WHERE due_date < CURDATE() ${dueR.clause}
        GROUP BY DATE_FORMAT(due_date, '%Y-%m-%d')
      `);
      params.push(...dueR.params);
    }

    if (prod === "ALL" || prod === "WCTL") {
      queries.push(`
        SELECT DATE_FORMAT(due_date, '%Y-%m-%d') AS month,
               'WCTL' AS product,
               SUM(emi) AS total_due,
               0 AS total_collected
        FROM manual_rps_wctl
        WHERE due_date < CURDATE() ${dueR.clause}
        GROUP BY DATE_FORMAT(due_date, '%Y-%m-%d')
      `);
      params.push(...dueR.params);
    }

    if (prod === "ALL" || prod === "GQ Non-FSF") {
      queries.push(`
        SELECT DATE_FORMAT(due_date, '%Y-%m-%d') AS month,
               'GQ Non-FSF' AS product,
               SUM(emi) AS total_due,
               0 AS total_collected
        FROM manual_rps_gq_non_fsf
        WHERE due_date < CURDATE() ${dueR.clause}
        GROUP BY DATE_FORMAT(due_date, '%Y-%m-%d')
      `);
      params.push(...dueR.params);
    }
    if (prod === "ALL" || prod === "EMICLUB") {
      queries.push(`
        SELECT DATE_FORMAT(due_date, '%Y-%m-%d') AS month,
               'EMICLUB' AS product,
               SUM(emi) AS total_due,
               0 AS total_collected
        FROM manual_rps_emiclub
        WHERE due_date < CURDATE() ${dueR.clause}
        GROUP BY DATE_FORMAT(due_date, '%Y-%m-%d')
      `);
      params.push(...dueR.params);
    }

    if (prod === "ALL" || prod === "Finso") {
      queries.push(`
        SELECT DATE_FORMAT(due_date, '%Y-%m-%d') AS month,
               'Finso' AS product,
               SUM(emi) AS total_due,
               0 AS total_collected
        FROM manual_rps_finso_loan
        WHERE due_date < CURDATE() ${dueR.clause}
        GROUP BY DATE_FORMAT(due_date, '%Y-%m-%d')
      `);
      params.push(...dueR.params);
    }

    if (prod === "ALL" || prod === "Circle Pe") {
      queries.push(`
        SELECT DATE_FORMAT(due_date, '%Y-%m-%d') AS month,
               'Circle Pe' AS product,
               SUM(emi) AS total_due,
               0 AS total_collected
        FROM manual_rps_circlepe
        WHERE due_date < CURDATE() ${dueR.clause}
        GROUP BY DATE_FORMAT(due_date, '%Y-%m-%d')
      `);
      params.push(...dueR.params);
    }

    if (prod === "ALL" || prod === "Hey EV") {
      queries.push(`
        SELECT DATE_FORMAT(due_date, '%Y-%m-%d') AS month,
               'Hey EV' AS product,
               SUM(emi) AS total_due,
               0 AS total_collected
        FROM manual_rps_hey_ev
        WHERE due_date < CURDATE() ${dueR.clause}
        GROUP BY DATE_FORMAT(due_date, '%Y-%m-%d')
      `);
      params.push(...dueR.params);
    }

    if (prod === "ALL" || prod === "GQ FSF") {
      queries.push(`
        SELECT DATE_FORMAT(due_date, '%Y-%m-%d') AS month,
               'GQ FSF' AS product,
               SUM(emi) AS total_due,
               0 AS total_collected
        FROM manual_rps_gq_fsf
        WHERE due_date < CURDATE() ${dueR.clause}
        GROUP BY DATE_FORMAT(due_date, '%Y-%m-%d')
      `);
      params.push(...dueR.params);
    }

    // COLLECTED
    if (prod === "ALL" || prod === "BL") {
      queries.push(`
        SELECT DATE_FORMAT(r.payment_date, '%Y-%m-%d') AS month,
               'BL Loan' AS product,
               0 AS total_due,
               SUM(r.transfer_amount) AS total_collected
        FROM repayments_upload r
        JOIN loan_bookings b 
          ON ${eqLan("b.lan", "r.lan")}
        WHERE r.payment_date IS NOT NULL
          AND r.payment_date < CURDATE()
          ${buildDateRangeClause("r.payment_date", start, end).clause}
        GROUP BY DATE_FORMAT(r.payment_date, '%Y-%m-%d')
      `);
      params.push(...buildDateRangeClause("r.payment_date", start, end).params);
    }
    if (prod === "ALL" || prod === "EV") {
      queries.push(`
        SELECT DATE_FORMAT(r.payment_date, '%Y-%m-%d') AS month,
               'EV Loan' AS product,
               0 AS total_due,
               SUM(r.transfer_amount) AS total_collected
        FROM repayments_upload r
        JOIN loan_booking_ev e 
          ON ${eqLan("e.lan", "r.lan")}
        WHERE r.payment_date IS NOT NULL
          AND r.payment_date < CURDATE()
          ${buildDateRangeClause("r.payment_date", start, end).clause}
        GROUP BY DATE_FORMAT(r.payment_date, '%Y-%m-%d')
      `);
      params.push(...buildDateRangeClause("r.payment_date", start, end).params);
    }
    if (prod === "ALL" || prod === "Adikosh") {
      queries.push(`
        SELECT DATE_FORMAT(payment_date, '%Y-%m-%d') AS month,
               'Adikosh' AS product,
               0 AS total_due,
               SUM(transfer_amount) AS total_collected
        FROM repayments_upload_adikosh
        WHERE payment_date IS NOT NULL
          AND payment_date < CURDATE() ${payR.clause}
        GROUP BY DATE_FORMAT(payment_date, '%Y-%m-%d')
      `);
      params.push(...payR.params);
    }
    if (prod === "ALL" || prod === "GQ Non-FSF") {
      queries.push(`
        SELECT DATE_FORMAT(payment_date, '%Y-%m-%d') AS month,
               'GQ Non-FSF' AS product,
               0 AS total_due,
               SUM(transfer_amount) AS total_collected
        FROM repayments_upload
        WHERE payment_date IS NOT NULL
          AND payment_date < CURDATE()
          AND lan ${USE_COLLATE_IN_JOINS ? `COLLATE ${JOIN_COLLATE}` : ""} IN (
            SELECT lan ${USE_COLLATE_IN_JOINS ? `COLLATE ${JOIN_COLLATE}` : ""
        } FROM loan_booking_gq_non_fsf
          )
          ${payR.clause}
        GROUP BY DATE_FORMAT(payment_date, '%Y-%m-%d')
      `);
      params.push(...payR.params);
    }
    if (prod === "ALL" || prod === "GQ FSF") {
      queries.push(`
        SELECT DATE_FORMAT(payment_date, '%Y-%m-%d') AS month,
               'GQ FSF' AS product,
               0 AS total_due,
               SUM(transfer_amount) AS total_collected
        FROM repayments_upload
        WHERE payment_date IS NOT NULL
          AND payment_date < CURDATE()
          AND lan ${USE_COLLATE_IN_JOINS ? `COLLATE ${JOIN_COLLATE}` : ""} IN (
            SELECT lan ${USE_COLLATE_IN_JOINS ? `COLLATE ${JOIN_COLLATE}` : ""
        } FROM loan_booking_gq_fsf
          )
          ${payR.clause}
        GROUP BY DATE_FORMAT(payment_date, '%Y-%m-%d')
      `);
      params.push(...payR.params);
    }

    if (prod === "ALL" || prod === "WCTL") {
      queries.push(`
        SELECT DATE_FORMAT(payment_date, '%Y-%m-%d') AS month,
               'WCTL' AS product,
               0 AS total_due,
               SUM(transfer_amount) AS total_collected
        FROM repayments_upload
        WHERE payment_date IS NOT NULL
          AND payment_date < CURDATE()
          AND lan ${USE_COLLATE_IN_JOINS ? `COLLATE ${JOIN_COLLATE}` : ""} IN (
            SELECT lan ${USE_COLLATE_IN_JOINS ? `COLLATE ${JOIN_COLLATE}` : ""
        } FROM loan_bookings_wctl
          )
          ${payR.clause}
        GROUP BY DATE_FORMAT(payment_date, '%Y-%m-%d')
      `);
      params.push(...payR.params);
    }

    if (prod === "ALL" || prod === "EMICLUB") {
      queries.push(`
        SELECT DATE_FORMAT(payment_date, '%Y-%m-%d') AS month,
               'EMICLUB' AS product,
               0 AS total_due,
               SUM(transfer_amount) AS total_collected
        FROM repayments_upload
        WHERE payment_date IS NOT NULL
          AND payment_date < CURDATE()
          AND lan ${USE_COLLATE_IN_JOINS ? `COLLATE ${JOIN_COLLATE}` : ""} IN (
            SELECT lan ${USE_COLLATE_IN_JOINS ? `COLLATE ${JOIN_COLLATE}` : ""
        } FROM loan_booking_emiclub
          )
          ${payR.clause}
        GROUP BY DATE_FORMAT(payment_date, '%Y-%m-%d')
      `);
      params.push(...payR.params);
    }

    if (prod === "ALL" || prod === "Finso") {
      queries.push(`
        SELECT DATE_FORMAT(payment_date, '%Y-%m-%d') AS month,
               'Finso' AS product,
               0 AS total_due,
               SUM(transfer_amount) AS total_collected
        FROM repayments_upload
        WHERE payment_date IS NOT NULL
          AND payment_date < CURDATE()
          AND lan ${USE_COLLATE_IN_JOINS ? `COLLATE ${JOIN_COLLATE}` : ""} IN (
            SELECT lan ${USE_COLLATE_IN_JOINS ? `COLLATE ${JOIN_COLLATE}` : ""
        } FROM loan_booking_finso
          )
          ${payR.clause}
        GROUP BY DATE_FORMAT(payment_date, '%Y-%m-%d')
      `);
      params.push(...payR.params);
    }

    if (prod === "ALL" || prod === "Circle Pe") {
      queries.push(`
        SELECT DATE_FORMAT(payment_date, '%Y-%m-%d') AS month,
               'Circle Pe' AS product,
               0 AS total_due,
               SUM(transfer_amount) AS total_collected
        FROM repayments_upload
        WHERE payment_date IS NOT NULL
          AND payment_date < CURDATE()
          AND lan ${USE_COLLATE_IN_JOINS ? `COLLATE ${JOIN_COLLATE}` : ""} IN (
            SELECT lan ${USE_COLLATE_IN_JOINS ? `COLLATE ${JOIN_COLLATE}` : ""
        } FROM loan_booking_circle_pe
          )
          ${payR.clause}
        GROUP BY DATE_FORMAT(payment_date, '%Y-%m-%d')
      `);
      params.push(...payR.params);
    }

    if (prod === "ALL" || prod === "Hey EV") {
      queries.push(`
        SELECT DATE_FORMAT(payment_date, '%Y-%m-%d') AS month,
               'Hey EV' AS product,
               0 AS total_due,
               SUM(transfer_amount) AS total_collected
        FROM repayments_upload
        WHERE payment_date IS NOT NULL
          AND payment_date < CURDATE()
          AND lan ${USE_COLLATE_IN_JOINS ? `COLLATE ${JOIN_COLLATE}` : ""} IN (
            SELECT lan ${USE_COLLATE_IN_JOINS ? `COLLATE ${JOIN_COLLATE}` : ""
        } FROM loan_booking_hey_ev
          )
          ${payR.clause}
        GROUP BY DATE_FORMAT(payment_date, '%Y-%m-%d')
      `);
      params.push(...payR.params);
    }

    const sql = queries.join(" UNION ALL ") + " ORDER BY month, product";
    const [rows] = await db.promise().query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error("❌ Collection vs Due Error:", err);
    res.status(500).json({ error: "Collection vs Due fetch failed" });
  }
});

/** -------------------- Product Distribution -------------------- */
router.post("/product-distribution", async (req, res) => {
  const { from, to } = req.body || {};
  try {
    const { start, end } = dayRange(from, to);

    const wcBL = buildDateRangeClause("agreement_date", start, end);
    const wcEV = buildDateRangeClause("agreement_date", start, end);
    const wcAK = buildDateRangeClause("agreement_date", start, end);
    const wcGQNon = buildDateRangeClause("agreement_date", start, end);
    const wcGQFsf = buildDateRangeClause("agreement_date", start, end);
    const wcEmbifi = buildDateRangeClause("agreement_date", start, end);
    const wcEMICLUB = buildDateRangeClause("agreement_date", start, end);
    const wcFinso = buildDateRangeClause("agreement_date", start, end);
    const wcHeyev = buildDateRangeClause("agreement_date", start, end);
    const wcCirclepe = buildDateRangeClause("agreement_date", start, end);
    const wcWCTL = buildDateRangeClause("agreement_date", start, end);

    const sql = `
      SELECT 'BL Loan' AS product, COUNT(*) AS value
      FROM loan_bookings
      WHERE 1=1 ${wcBL.clause}

      UNION ALL

      SELECT 'EV Loan' AS product, COUNT(*) AS value
      FROM loan_booking_ev
      WHERE 1=1 ${wcEV.clause}

      UNION ALL

      SELECT 'Adikosh' AS product, COUNT(*) AS value
      FROM loan_booking_adikosh
      WHERE 1=1 ${wcAK.clause}

      UNION ALL

      SELECT 'GQ Non-FSF' AS product, COUNT(*) AS value
      FROM loan_booking_gq_non_fsf
      WHERE 1=1 ${wcGQNon.clause}

      UNION ALL

      SELECT 'Embifi' AS product, COUNT(*) AS value
      FROM loan_booking_embifi
      WHERE 1=1 ${wcEmbifi.clause}

      UNION ALL

      SELECT 'WCTL' AS product, COUNT(*) AS value
      FROM loan_bookings_wctl
      WHERE 1=1 ${wcWCTL.clause}

      UNION ALL

      SELECT 'GQ FSF' AS product, COUNT(*) AS value
      FROM loan_booking_gq_fsf
      WHERE 1=1 ${wcGQFsf.clause}

       UNION ALL

      SELECT 'EMICLUB' AS product, COUNT(*) AS value
      FROM loan_booking_emiclub
      WHERE 1=1 ${wcEMICLUB.clause}

       UNION ALL

      SELECT 'Finso' AS product, COUNT(*) AS value
      FROM loan_booking_finso
      WHERE 1=1 ${wcFinso.clause}

       UNION ALL

      SELECT 'Circle Pe' AS product, COUNT(*) AS value
      FROM loan_booking_circle_pe
      WHERE 1=1 ${wcCirclepe.clause}

       UNION ALL

      SELECT 'Hey EV' AS product, COUNT(*) AS value
      FROM loan_booking_hey_ev
      WHERE 1=1 ${wcHeyev.clause}
    `;

    const params = [
      ...wcBL.params,
      ...wcEV.params,
      ...wcAK.params,
      ...wcGQNon.params,
      ...wcGQFsf.params,
      ...wcEmbifi.params,
      ...wcWCTL.params,
      ...wcEMICLUB.params,
      ...wcCirclepe.params,
      ...wcFinso.params,
      ...wcHeyev.params,
    ];
    const [rows] = await db.promise().query(sql, params);

    const productMap = {};
    rows.forEach(({ product, value }) => {
      productMap[product] = (productMap[product] || 0) + Number(value || 0);
    });

    res.json(
      Object.entries(productMap).map(([product, value]) => ({ product, value }))
    );
  } catch (err) {
    console.error("❌ Product Distribution Error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

/** -------------------- Metric Cards -------------------- */

////////////////////////////////////////////////
/** -------------------- Metric Cards -------------------- */
router.post("/metric-cards", async (req, res) => {
  try {
    const { product, from, to } = req.body || {};
    const prod = normalizeProduct(product);
    const { start, end } = dayRange(from, to); // ← use this `end` below; don't redeclare

    const disburseQueries = [];
    const disburseParams = [];
    const collectQueries = [];
    const collectParams = [];
    const pniRangeQueries = [];
    const pniRangeParams = [];
    const pToDateQueries = [];
    const pToDateParams = [];

    const pclR = buildDateRangeClause("r.payment_date", start, end);
    const pclA = buildDateRangeClause("payment_date", start, end);
    const jsToday = new Date().toISOString().slice(0, 10);
    const cutoff = end || jsToday;

    const USE_COLLATE_IN_JOINS = true;
    const JOIN_COLLATE = "utf8mb4_general_ci";

    /** 🔹 Centralized Product Map */
    const productMap = {
      BL: {
        disbTable: "loan_bookings", disbField: "loan_amount",
        collType: "join", collBooking: "loan_bookings",
        allocTable: "allocation", allocLike: "BL%",
        rpsTable: "manual_rps_bl_loan",
      },
      EV: {
        disbTable: "loan_booking_ev", disbField: "loan_amount",
        collType: "join", collBooking: "loan_booking_ev",
        allocTable: "allocation", allocLike: "EV%",
        rpsTable: "manual_rps_ev_loan",
      },
      Adikosh: {
        disbTable: "loan_booking_adikosh", disbField: "net_disbursement",
        collType: "direct", collBooking: "repayments_upload_adikosh",
        allocTable: "allocation_adikosh", allocLike: "ADK%",
        rpsTable: "manual_rps_adikosh",
      },
      "GQ Non-FSF": {
        disbTable: "loan_booking_gq_non_fsf", disbField: "disbursal_amount",
        collType: "subquery",
        allocTable: "allocation", allocLike: "%GQN%",
        rpsTable: "manual_rps_gq_non_fsf",
      },
      "GQ FSF": {
        disbTable: "loan_booking_gq_fsf", disbField: "disbursal_amount",
        collType: "subquery",
        allocTable: "allocation", allocLike: "%GQF%",
        rpsTable: "manual_rps_gq_fsf",
      },
      Embifi: {
        disbTable: "loan_booking_embifi", disbField: "approved_loan_amount",
        collType: "join", collBooking: "loan_booking_embifi",
        allocTable: "allocation", allocLike: "E1%",
        rpsTable: "manual_rps_embifi_loan",
      },
      WCTL: {
        disbTable: "loan_bookings_wctl", disbField: "loan_amount",
        collType: "join", collBooking: "loan_bookings_wctl",
        allocTable: "allocation", allocLike: "WCTL%",
        rpsTable: "manual_rps_wctl",
      },
      EMICLUB: {
        disbTable: "loan_booking_emiclub", disbField: "loan_amount",
        collType: "subquery",
        allocTable: "allocation", allocLike: "%FINE%",
        rpsTable: "manual_rps_emiclub",
      },
      Finso: {
        disbTable: "loan_booking_finso", disbField: "disbursal_amount",
        collType: "subquery",
        allocTable: "allocation", allocLike: "%FINS%",
        rpsTable: "manual_rps_finso_loan",
      },
      "Hey EV": {
        disbTable: "loan_booking_hey_ev", disbField: "loan_amount",
        collType: "subquery",
        allocTable: "allocation", allocLike: "%HEY%",
        rpsTable: "manual_rps_hey_ev",
      },
      "Circle Pe": {
        disbTable: "loan_booking_circle_pe", disbField: "loan_amount",
        collType: "subquery",
        allocTable: "allocation", allocLike: "%CIR%",
        rpsTable: "manual_rps_circlepe",
      },
    };

    /** 🔹 Helper Functions */
    const addDisburseQuery = (table, field) => {
      const dcl = buildDateRangeClause("agreement_date", start, end);
      disburseQueries.push(`
        SELECT IFNULL(SUM(${field}), 0) AS amount
        FROM ${table} where status
 in ('Disbursed',
'Cancelled',
'Fully Paid',
'Foreclosed',
'Settled')

        ${dcl.clause}
      `);
      disburseParams.push(...dcl.params);
    };

    const addCollectQuery = ({ collType, collBooking, disbTable }) => {
      if (collType === "join") {
        collectQueries.push(`
          SELECT IFNULL(SUM(r.transfer_amount), 0) AS amount
          FROM repayments_upload r
          JOIN ${collBooking} b ON ${eqLan("b.lan", "r.lan")}
          WHERE r.payment_date IS NOT NULL ${pclR.clause}
        `);
        collectParams.push(...pclR.params);
      } else if (collType === "direct") {
        collectQueries.push(`
          SELECT IFNULL(SUM(transfer_amount), 0) AS amount
          FROM ${collBooking}
          WHERE payment_date IS NOT NULL ${pclA.clause}
        `);
        collectParams.push(...pclA.params);
      } else if (collType === "subquery") {
        collectQueries.push(`
          SELECT IFNULL(SUM(transfer_amount), 0) AS amount
          FROM repayments_upload
          WHERE payment_date IS NOT NULL
            AND lan ${USE_COLLATE_IN_JOINS ? `COLLATE ${JOIN_COLLATE}` : ""} IN (
              SELECT lan ${USE_COLLATE_IN_JOINS ? `COLLATE ${JOIN_COLLATE}` : ""} 
              FROM ${disbTable}
            )
            ${pclA.clause}
        `);
        collectParams.push(...pclA.params);
      }
    };

    const addPniRangeQuery = (allocTable, likeClause) => {
      const r = buildDateRangeClause("bank_date_allocation", start, end);
      pniRangeQueries.push(`
        SELECT 
          IFNULL(SUM(CASE WHEN charge_type='Principal' THEN allocated_amount ELSE 0 END),0) AS principal,
          IFNULL(SUM(CASE WHEN charge_type='Interest' THEN allocated_amount ELSE 0 END),0) AS interest
        FROM ${allocTable}
        WHERE allocation_date IS NOT NULL ${r.clause}
          AND lan LIKE '${likeClause}'
      `);
      pniRangeParams.push(...r.params);
    };

    // ✅ POS / Principal Outstanding from DB (remaining_principal)
    const addPToDateQuery = (rpsTable, bookingTable) => {
      const br = buildDateRangeClause("b.agreement_date", start, end);
      pToDateQueries.push(`
        SELECT IFNULL(SUM(rps.remaining_principal),0) AS principal
        FROM ${rpsTable} rps
        JOIN ${bookingTable} b ON ${eqLan("b.lan", "rps.lan")}
        WHERE 1=1 ${br.clause}
      `);
      pToDateParams.push(...br.params);
    };

    /** 🔹 Build all queries dynamically */
    for (const [key, cfg] of Object.entries(productMap)) {
      if (prod === "ALL" || prod === key) {
        addDisburseQuery(cfg.disbTable, cfg.disbField);
        addCollectQuery(cfg);
        addPniRangeQuery(cfg.allocTable, cfg.allocLike);
        addPToDateQuery(cfg.rpsTable, cfg.disbTable);
      }
    }

    /** 🔹 Execute in parallel */
    const [[disbRows], [collRows], [pniRangeRows], [pToDateRows]] =
      await Promise.all([
        db.promise().query(disburseQueries.join(" UNION ALL "), disburseParams),
        db.promise().query(collectQueries.join(" UNION ALL "), collectParams),
        db.promise().query(pniRangeQueries.join(" UNION ALL "), pniRangeParams),
        db.promise().query(pToDateQueries.join(" UNION ALL "), pToDateParams),
      ]);

    /** 🔹 Aggregate results */
    const totalDisbursed = disbRows.reduce((s, r) => s + Number(r.amount || 0), 0);
    const totalCollected = collRows.reduce((s, r) => s + Number(r.amount || 0), 0);
    const totalPrincipal = pniRangeRows.reduce((s, r) => s + Number(r.principal || 0), 0);
    const totalInterest = pniRangeRows.reduce((s, r) => s + Number(r.interest || 0), 0);
    const posOutstanding = pToDateRows.reduce((s, r) => s + Number(r.principal || 0), 0); // ✅ POS from SQL

    /** 🔹 Derived Metrics */
    const collectionRate = totalDisbursed
      ? (totalCollected / totalDisbursed) * 100
      : 0;

    /** 🔹 Final JSON Response */
    res.json({
      totalDisbursed,
      totalCollected,
      collectionRate,
      totalPrincipal,
      totalInterest,
      principalOutstanding: posOutstanding, // renamed for clarity
      interestOutstanding: 0,
      posOutstanding, // ✅ pulled directly from DB (remaining_principal)
    });

  } catch (err) {
    console.error("❌ Metric Card Fetch Error:", err);
    res.status(500).json({ error: "Failed to fetch metrics" });
  }
});
///////////////////////////////////////////////
// -------------------- DPD BUCKETS --------------------
router.post("/dpd-buckets", async (req, res) => {
  try {
    const { product } = req.body || {};

    const normalizeProduct = (p) => {
      if (!p || p === "ALL") return "ALL";
      const s = String(p).toLowerCase().replace(/\s+/g, "").replace(/-/g, "");
      switch (s) {
        case "evloan":
        case "ev_loan":
          return "EV";
        case "blloan":
        case "bl_loan":
          return "BL";
        case "adikosh":
          return "Adikosh";
        case "gqnonfsf":
        case "gqnon-fsf":
          return "GQ Non-FSF";
        case "gqfsf":
        case "gq-fsf":
          return "GQ FSF";
        case "embifi":
          return "Embifi";
        case "wctl":
          return "WCTL";
        case "circlepe":
          return "Circle Pe";
        case "emiclub":
          return "EMICLUB";
        case "finso":
          return "Finso";
        case "heyev":
        case "hey_ev":
          return "Hey EV";
        default:
          return p;
      }
    }


    const prod = normalizeProduct(product);
    const BUCKET_ORDER = `'ALL','active','0','0-30','30-60','60-90','90+','closed'`;

    // --- Branch per product ---
    const branch = (rpsTable, bookTable) => `
  SELECT
    CASE
      WHEN t.max_dpd = 0 THEN '0'
      WHEN t.max_dpd BETWEEN 1 AND 30 THEN '0-30'
      WHEN t.max_dpd BETWEEN 31 AND 60 THEN '30-60'
      WHEN t.max_dpd BETWEEN 61 AND 90 THEN '60-90'
      ELSE '90+'
    END AS bucket,
    COUNT(DISTINCT t.lan) AS loans,
    SUM(t.overdue_emi) AS overdue_emi
  FROM (
    SELECT rps.lan,
           MAX(CASE WHEN rps.status <> 'Paid' AND rps.due_date < CURDATE()
                    THEN IFNULL(rps.dpd, DATEDIFF(CURDATE(), rps.due_date))
                    ELSE 0 END) AS max_dpd,
           SUM(CASE WHEN rps.status <> 'Paid' AND rps.due_date < CURDATE() THEN IFNULL(rps.emi,0) ELSE 0 END) AS overdue_emi
    FROM ${rpsTable} rps
    JOIN ${bookTable} b ON b.lan = rps.lan
    WHERE LOWER(b.status) = 'disbursed'
    GROUP BY rps.lan
  ) t
  GROUP BY bucket
`;

    const branchAll = (rpsTable, bookTable) => `
  SELECT
    'ALL' AS bucket,
    COUNT(DISTINCT t.lan) AS loans,
    SUM(t.overdue_emi) AS overdue_emi
  FROM (
    SELECT rps.lan,
           MAX(CASE WHEN rps.status <> 'Paid' AND rps.due_date < CURDATE()
                    THEN IFNULL(rps.dpd, DATEDIFF(CURDATE(), rps.due_date))
                    ELSE 0 END) AS max_dpd,
           SUM(CASE WHEN rps.status <> 'Paid' AND rps.due_date < CURDATE() THEN IFNULL(rps.emi,0) ELSE 0 END) AS overdue_emi
    FROM ${rpsTable} rps
    JOIN ${bookTable} b ON b.lan = rps.lan
    WHERE LOWER(b.status) = 'disbursed'
    GROUP BY rps.lan
  ) t
`;

    // ✅ NEW BUCKET: Active Loans
    const branchActive = (rpsTable, bookTable) => `
  SELECT
    'active' AS bucket,
    COUNT(DISTINCT t.lan) AS loans,
    SUM(t.overdue_emi) AS overdue_emi
  FROM (
    SELECT rps.lan,
           SUM(
             CASE 
               WHEN rps.status <> 'Paid' AND rps.due_date < CURDATE() 
               THEN IFNULL(rps.emi, 0) 
               ELSE 0 
             END
           ) AS overdue_emi
    FROM ${rpsTable} rps
    JOIN ${bookTable} b ON b.lan = rps.lan
    WHERE LOWER(b.status) = 'disbursed'
    GROUP BY rps.lan
  ) t
`;



    const branchClosed = (rpsTable, bookTable) => `
  SELECT
    'closed' AS bucket,
    COUNT(DISTINCT b.lan) AS loans,
    0 AS overdue_emi
  FROM ${bookTable} b
  WHERE LOWER(b.status) NOT IN ('disbursed', 'login', 'disburse initiate','rejected','approved')`;

    const unions = [];
    if (prod === "ALL" || prod === "BL") {
      unions.push(branch("manual_rps_bl_loan", "loan_bookings"));
      unions.push(branchAll("manual_rps_bl_loan", "loan_bookings"));
      unions.push(branchClosed("manual_rps_bl_loan", "loan_bookings"));
      unions.push(branchActive("manual_rps_bl_loan", "loan_bookings"));
    }
    if (prod === "ALL" || prod === "EV") {
      unions.push(branch("manual_rps_ev_loan", "loan_booking_ev"));
      unions.push(branchAll("manual_rps_ev_loan", "loan_booking_ev"));
      unions.push(branchClosed("manual_rps_ev_loan", "loan_booking_ev"));
      unions.push(branchActive("manual_rps_ev_loan", "loan_booking_ev"));
    }
    if (prod === "ALL" || prod === "Adikosh") {
      unions.push(branch("manual_rps_adikosh", "loan_booking_adikosh"));
      unions.push(branchAll("manual_rps_adikosh", "loan_booking_adikosh"));
      unions.push(branchClosed("manual_rps_adikosh", "loan_booking_adikosh"));
      unions.push(branchActive("manual_rps_adikosh", "loan_booking_adikosh"));
    }
    if (prod === "ALL" || prod === "GQ Non-FSF") {
      unions.push(branch("manual_rps_gq_non_fsf", "loan_booking_gq_non_fsf"));
      unions.push(
        branchAll("manual_rps_gq_non_fsf", "loan_booking_gq_non_fsf")
      );
      unions.push(
        branchClosed("manual_rps_gq_non_fsf", "loan_booking_gq_non_fsf")
      );
      unions.push(branchActive("manual_rps_gq_non_fsf", "loan_booking_gq_non_fsf"));
    }
    if (prod === "ALL" || prod === "GQ FSF") {
      unions.push(branch("manual_rps_gq_fsf", "loan_booking_gq_fsf"));
      unions.push(branchAll("manual_rps_gq_fsf", "loan_booking_gq_fsf"));
      unions.push(branchClosed("manual_rps_gq_fsf", "loan_booking_gq_fsf"));
      unions.push(branchActive("manual_rps_gq_fsf", "loan_booking_gq_fsf"));
    }
    if (prod === "ALL" || prod === "Embifi") {
      unions.push(branch("manual_rps_embifi_loan", "loan_booking_embifi"));
      unions.push(branchAll("manual_rps_embifi_loan", "loan_booking_embifi"));
      unions.push(
        branchClosed("manual_rps_embifi_loan", "loan_booking_embifi")
      );
      unions.push(branchActive("manual_rps_embifi_loan", "loan_booking_embifi"));
    }

    if (prod === "ALL" || prod === "WCTL") {
      unions.push(branch("manual_rps_wctl", "loan_bookings_wctl"));
      unions.push(branchAll("manual_rps_wctl", "loan_bookings_wctl"));
      unions.push(branchClosed("manual_rps_wctl", "loan_bookings_wctl"));
      unions.push(branchActive("manual_rps_wctl", "loan_bookings_wctl"));
    }

    if (prod === "ALL" || prod === "EMICLUB") {
      unions.push(branch("manual_rps_emiclub", "loan_booking_emiclub"));
      unions.push(branchAll("manual_rps_emiclub", "loan_booking_emiclub"));
      unions.push(branchClosed("manual_rps_emiclub", "loan_booking_emiclub"));
      unions.push(branchActive("manual_rps_emiclub", "loan_booking_emiclub"));
    }
    if (prod === "ALL" || prod === "Finso") {
      unions.push(branch("manual_rps_finso_loan", "loan_booking_finso"));
      unions.push(branchAll("manual_rps_finso_loan", "loan_booking_finso"));
      unions.push(branchClosed("manual_rps_finso_loan", "loan_booking_finso"));
      unions.push(branchActive("manual_rps_finso_loan", "loan_booking_finso"));
    }
    if (prod === "ALL" || prod === "Hey EV") {
      unions.push(branch("manual_rps_hey_ev", "loan_booking_hey_ev"));
      unions.push(branchAll("manual_rps_hey_ev", "loan_booking_hey_ev"));
      unions.push(branchClosed("manual_rps_hey_ev", "loan_booking_hey_ev"));
      unions.push(branchActive("manual_rps_hey_ev", "loan_booking_hey_ev"));
    }
    if (prod === "ALL" || prod === "Circle Pe") {
      unions.push(branch("manual_rps_circlepe", "loan_booking_circle_pe"));
      unions.push(branchAll("manual_rps_circlepe", "loan_booking_circle_pe"));
      unions.push(branchClosed("manual_rps_circlepe", "loan_booking_circle_pe"));
      unions.push(branchActive("manual_rps_circlepe", "loan_booking_circle_pe"));
    }

    if (!unions.length) {
      return res.json({
        buckets: [],
        asOf: new Date().toISOString().slice(0, 10),
      });
    }

    const sql = `
      SELECT bucket,
             SUM(loans) AS loans,
             SUM(overdue_emi) AS overdue_emi
      FROM ( ${unions.join(" UNION ALL ")} ) x
      GROUP BY bucket
      ORDER BY FIELD(bucket, ${BUCKET_ORDER})
    `;

    const [rows] = await db.promise().query(sql);

    // ensure all buckets exist
    const map = {
      ALL: { bucket: "ALL", loans: 0, overdue_emi: 0 },
      active: { bucket: "active", loans: 0, overdue_emi: 0 },
      0: { bucket: "0", loans: 0, overdue_emi: 0 },
      "0-30": { bucket: "0-30", loans: 0, overdue_emi: 0 },
      "30-60": { bucket: "30-60", loans: 0, overdue_emi: 0 },
      "60-90": { bucket: "60-90", loans: 0, overdue_emi: 0 },
      "90+": { bucket: "90+", loans: 0, overdue_emi: 0 },
      closed: { bucket: "closed", loans: 0, overdue_emi: 0 },
    };

    rows.forEach((r) => {
      map[r.bucket] = {
        bucket: r.bucket,
        loans: Number(r.loans || 0),
        overdue_emi: Number(r.overdue_emi || 0),
        active_loans: Number(r.active_loans || 0),
        closed_loans: Number(r.closed_loans || 0),
      };
    });

    res.json({
      buckets: [
        map["ALL"],
        map["active"],
        map["0"],
        map["0-30"],
        map["30-60"],
        map["60-90"],
        map["90+"],
        map["closed"],
      ],
      asOf: new Date().toISOString().slice(0, 10),
    });
  } catch (err) {
    console.error("❌ DPD Buckets Error:", err);
    res.status(500).json({ error: "Failed to fetch DPD buckets" });
  }
});

/** -------------------- DPD List (with disbursal + ageing, fast) -------------------- */
router.post("/dpd-list", async (req, res) => {
  try {
    const {
      product,
      bucket,
      page: pageRaw,
      pageSize: pageSizeRaw,
      sortBy: sortByRaw,
      sortDir: sortDirRaw,
    } = req.body || {};

    const JOIN_COLLATE = "utf8mb4_unicode_ci";

    // normalize product
    const normalizeProduct = (p) => {
      if (!p || p === "ALL") return "ALL";
      const s = String(p).toLowerCase().replace(/\s+/g, "").replace(/-/g, "");
      switch (s) {
        case "evloan":
        case "ev_loan":
          return "EV";
        case "blloan":
        case "bl_loan":
          return "BL";
        case "adikosh":
          return "Adikosh";
        case "gqnonfsf":
        case "gqnon-fsf":
          return "GQ Non-FSF";
        case "gqfsf":
        case "gq-fsf":
          return "GQ FSF";
        case "embifi":
          return "Embifi";
        case "wctl":
          return "WCTL";
        case "circlepe":
          return "Circle Pe";
        case "emiclub":
          return "EMICLUB";
        case "finso":
          return "Finso";
        case "heyev":
        case "hey_ev":
          return "Hey EV";
        default:
          return p;
      }
    }
    const prod = normalizeProduct(product);

    // pagination
    const page = Math.max(1, parseInt(pageRaw || 1, 10));
    const pageSize = Math.min(
      1000,
      Math.max(1, parseInt(pageSizeRaw || 25, 10))
    );
    const offset = (page - 1) * pageSize;

    // --- Bucket filter ---
    const ranges = { "0-30": [1, 30], "30-60": [31, 60], "60-90": [61, 90] };
    let havingStr = "";
    let isClosed = false;
    let isActive = false;

    if (bucket === "0") {
      havingStr = "HAVING max_dpd = 0";
    } else if (bucket === "90+") {
      havingStr = "HAVING max_dpd >= 91";
    } else if (ranges[bucket]) {
      const [minDPD, maxDPD] = ranges[bucket];
      havingStr = `HAVING max_dpd BETWEEN ${minDPD} AND ${maxDPD}`;
    } else if (bucket === "closed") {
      isClosed = true;
    } else if (bucket === "active") {
      isActive = true;
    } else {
      return res.status(400).json({ error: "Invalid bucket" });
    }

    // helper: check if column exists
    const tableHasColumn = async (tableName, columnName) => {
      const [rows] = await db
        .promise()
        .query(`SHOW COLUMNS FROM \`${tableName}\` LIKE ?`, [columnName]);
      return rows.length > 0;
    };

    const branches = [];

    const addBranchIfNeeded = async ({ label, key, rpsTable, bookTable }) => {
      if (!(prod === "ALL" || prod === key)) return;

      // check schema dynamically
      const hasDealerName = await tableHasColumn(bookTable, "dealer_name");
      const hasBeneficiary = await tableHasColumn(
        bookTable,
        "beneficiary_name"
      );
      const hasDistrict = await tableHasColumn(bookTable, "district");
      const hasCity = await tableHasColumn(bookTable, "current_address_city");

      // dealerExpr
      // ✅ Dealer expression logic (prefer trade_name if it exists)
      const hasTradeName = await tableHasColumn(bookTable, "trade_name");

      let dealerExpr;
      if (hasTradeName) {
        // if the table has trade_name, always use it — ignore dealer_name
        dealerExpr = "MAX(b.trade_name)";
      } else if (hasDealerName) {
        dealerExpr = "MAX(b.dealer_name)";
      } else if (hasBeneficiary) {
        dealerExpr = "MAX(b.beneficiary_name)";
      } else {
        dealerExpr = "'-'";
      }


      // districtExpr
      let districtExpr;
      if (hasDistrict && hasCity) {
        districtExpr = "COALESCE(MAX(b.district), MAX(b.current_address_city))";
      } else if (hasDistrict) {
        districtExpr = "MAX(b.district)";
      } else if (hasCity) {
        districtExpr = "MAX(b.current_address_city)";
      } else {
        districtExpr = "'-'";
      }

      // build branch query
      branches.push(`
        SELECT '${label}' AS product,
               rps.lan,
               MAX(b.customer_name) AS customer_name,
               ${dealerExpr} AS dealer_name,
               ${districtExpr} AS district,
               MAX(b.status) AS status, 
               CASE
                 WHEN LOWER(b.status) = 'disbursed' THEN 'Active'
                 WHEN LOWER(b.status) IN ('fully paid','settled & closed','closed','completed','settled','closed & reopen') THEN 'Closed'
                 ELSE 'Unknown'
               END AS loan_status,
               MAX(IFNULL(rps.dpd, DATEDIFF(CURDATE(), rps.due_date))) AS max_dpd,

               -- ✅ Correct overdue EMI logic
               SUM(CASE 
                     WHEN rps.status <> 'Paid' AND rps.due_date < CURDATE() 
                     THEN IFNULL(rps.emi, 0) 
                     ELSE 0 
                   END) AS overdue_emi,

               SUM(CASE 
                     WHEN rps.status <> 'Paid' AND rps.due_date < CURDATE() 
                     THEN IFNULL(rps.principal, 0) 
                     ELSE 0 
                   END) AS overdue_principal,

               SUM(CASE 
                     WHEN rps.status <> 'Paid' AND rps.due_date < CURDATE() 
                     THEN IFNULL(rps.interest, 0) 
                     ELSE 0 
                   END) AS overdue_interest,

               MAX(CASE 
                     WHEN rps.status <> 'Paid' AND rps.due_date < CURDATE() 
                     THEN rps.due_date 
                   END) AS last_due_date,

               SUM(IFNULL(rps.remaining_principal, 0)) AS pos_principal
        FROM ${rpsTable} rps
        JOIN ${bookTable} b 
          ON b.lan COLLATE ${JOIN_COLLATE} = rps.lan COLLATE ${JOIN_COLLATE}
        ${isClosed
          ? "WHERE LOWER(b.status) NOT IN ('disbursed', 'login', 'disburse initiate')"
          : isActive
            ? "WHERE LOWER(b.status) = 'disbursed'"
            : "WHERE LOWER(b.status) = 'disbursed'"
        }

        GROUP BY rps.lan
        ${!isActive ? havingStr : ""}
      `);
    };

    // add branches for each product
    await addBranchIfNeeded({
      label: "BL",
      key: "BL",
      rpsTable: "manual_rps_bl_loan",
      bookTable: "loan_bookings",
    });
    await addBranchIfNeeded({
      label: "EV",
      key: "EV",
      rpsTable: "manual_rps_ev_loan",
      bookTable: "loan_booking_ev",
    });
    await addBranchIfNeeded({
      label: "Adikosh",
      key: "Adikosh",
      rpsTable: "manual_rps_adikosh",
      bookTable: "loan_booking_adikosh",
    });
    await addBranchIfNeeded({
      label: "GQ Non-FSF",
      key: "GQ Non-FSF",
      rpsTable: "manual_rps_gq_non_fsf",
      bookTable: "loan_booking_gq_non_fsf",
    });
    await addBranchIfNeeded({
      label: "GQ FSF",
      key: "GQ FSF",
      rpsTable: "manual_rps_gq_fsf",
      bookTable: "loan_booking_gq_fsf",
    });
    await addBranchIfNeeded({
      label: "Embifi",
      key: "Embifi",
      rpsTable: "manual_rps_embifi_loan",
      bookTable: "loan_booking_embifi",
    });
    await addBranchIfNeeded({
      label: "WCTL",
      key: "WCTL",
      rpsTable: "manual_rps_wctl",
      bookTable: "loan_bookings_wctl",
    });
    await addBranchIfNeeded({
      label: "EMICLUB",
      key: "EMICLUB",
      rpsTable: "manual_rps_emiclub",
      bookTable: "loan_booking_emiclub",
    });
    await addBranchIfNeeded({
      label: "Finso",
      key: "Finso",
      rpsTable: "manual_rps_finso_loan",
      bookTable: "loan_booking_finso",
    });
    await addBranchIfNeeded({
      label: "Hey EV",
      key: "Hey EV",
      rpsTable: "manual_rps_hey_ev",
      bookTable: "loan_booking_hey_ev",
    });
    await addBranchIfNeeded({
      label: "Circle Pe",
      key: "Circle Pe",
      rpsTable: "manual_rps_circlepe",
      bookTable: "loan_booking_circle_pe",
    });

    if (!branches.length) {
      return res.json({ rows: [], pagination: { page, pageSize, total: 0 } });
    }

    // Sorting
    const SORT_MAP = {
      pos: "pos_principal",
      emi: "overdue_emi",
      dpd: "max_dpd",
      due: "last_due_date",
      ageing: "ageing_days",
      customer: "customer_name",
      dealer: "dealer_name",
      district: "district",
    };

    const sortKey =
      typeof sortByRaw === "string" ? sortByRaw.toLowerCase() : "dpd";
    const sortCol = SORT_MAP[sortKey] || SORT_MAP.dpd;
    const sortDir =
      String(sortDirRaw || "desc").toLowerCase() === "asc" ? "ASC" : "DESC";

    const orderClause = `ORDER BY ${sortCol} ${sortDir}, lan ASC`;

    // Final SQL
    const sql = `
      WITH d AS (
        SELECT lan, MIN(Disbursement_Date) AS disbursement_date
        FROM ev_disbursement_utr
        GROUP BY lan
      ),
      base AS (
        ${branches.join(" UNION ALL ")}
      )
      SELECT base.*, d.disbursement_date, DATEDIFF(CURDATE(), d.disbursement_date) AS ageing_days,
             COUNT(*) OVER() AS total_rows
      FROM base
      LEFT JOIN d ON d.lan = base.lan
      ${orderClause}
      LIMIT ? OFFSET ?
    `;

    const [pageRows] = await db.promise().query(sql, [pageSize, offset]);
    const total = pageRows.length ? Number(pageRows[0].total_rows) : 0;
    const rows = pageRows.map(({ total_rows, ...r }) => r);

    res.json({ rows, pagination: { page, pageSize, total } });
  } catch (err) {
    console.error("❌ DPD List Error:", err);
    res.status(500).json({ error: "Failed to fetch DPD list" });
  }
});

/** -------------------- Export current DPD page via email -------------------- */
router.post("/dpd-export-email", async (req, res) => {
  try {
    const {
      userId: userIdFromBody,
      product,
      bucket,
      page,
      rows,
    } = req.body || {};
    const userId = req.user?.id || userIdFromBody;
    if (!userId) return res.status(400).json({ error: "Missing userId" });

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: "No rows to export" });
    }

    // recipient
    const [[u]] = await db
      .promise()
      .query("SELECT email, name FROM users WHERE id = ? LIMIT 1", [userId]);
    if (!u?.email)
      return res.status(404).json({ error: "User email not found" });

    // workbook
    const columns = [
      { key: "lan", header: "LAN" },
      { key: "customer_name", header: "Customer Name" }, // will be blank if FE didn't send
      { key: "product", header: "Product" },
      { key: "max_dpd", header: "Max DPD" },
      { key: "overdue_emi", header: "Overdue EMI" },
      { key: "overdue_principal", header: "Overdue Principal" },
      { key: "overdue_interest", header: "Overdue Interest" },
      { key: "pos_principal", header: "POS (Principal)" },
    ];

    const header = columns.map((c) => c.header);
    const dataRows = rows.map((r) => [
      r.lan ?? "",
      r.customer_name ?? "",
      r.product ?? "",
      Number(r.max_dpd ?? 0),
      Number(r.overdue_emi ?? 0),
      Number(r.overdue_principal ?? 0),
      Number(r.overdue_interest ?? 0),
      Number(r.pos_principal ?? 0),
    ]);

    const ws = XLSX.utils.aoa_to_sheet([header, ...dataRows]);
    for (let r = 1; r <= dataRows.length; r++) {
      for (const c of [3, 4, 5, 6]) {
        const addr = XLSX.utils.encode_cell({ r, c });
        if (ws[addr]) {
          ws[addr].t = "n";
          ws[addr].z = "#,##0";
        }
      }
    }
    ws["!cols"] = header.map((h, i) => ({
      wch: Math.min(
        40,
        Math.max(
          12,
          String(h).length + 2,
          ...dataRows.map((row) => (row[i] ? String(row[i]).length + 2 : 0))
        )
      ),
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Visible Rows");

    const safeProduct = String(product || "ALL").replace(/[^\w-]+/g, "_");
    const safeBucket = String(bucket || "").replace(/[^\w-]+/g, "_");
    const filename = `DPD_${safeProduct}_${safeBucket}_page_${page || 1}.xlsx`;

    const buf = XLSX.write(wb, { bookType: "xlsx", type: "buffer" });

    // send
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_SECURE) === "true",
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });

    await transporter.sendMail({
      from: process.env.FROM_EMAIL || "no-reply@yourdomain.com",
      to: u.email,
      subject: `DPD report — ${product} ${bucket} (page ${page || 1})`,
      text: `Hi ${u.name || ""},\n\nAttached is your DPD report (${filename}).`,
      html: `<p>Hi ${u.name || ""
        },</p><p>Attached is your DPD report:</p><p><b>${filename}</b></p>`,
      attachments: [
        {
          filename,
          content: buf,
          contentType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
      ],
    });

    res.json({ ok: true, sentTo: u.email });
  } catch (err) {
    console.error("❌ dpd-export-email error:", err);
    res.status(500).json({ error: "Failed to email report" });
  }
});

module.exports = router;
