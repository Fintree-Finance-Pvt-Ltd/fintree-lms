// const express = require("express");
// const db = require("../config/db");
// const router = express.Router();

// /* -------------------- Helpers -------------------- */

// // Accepts 'YYYY-MM-DD' and returns { start, end }
// function dayRange(from, to) {
//   const start = from && from.trim() ? from.trim() : null;
//   // Add 1 day to "to" since end is exclusive
//   let end = null;
//   if (to && to.trim()) {
//     const dt = new Date(to.trim());
//     dt.setDate(dt.getDate() + 1);
//     end = dt.toISOString().slice(0, 10); // back to YYYY-MM-DD
//   }
//   return { start, end };
// }

// // Builds "AND field >= ? AND field < ?" with params, using start/end if present
// function buildDateRangeClause(field, start, end) {
//   const parts = [];
//   const params = [];
//   if (start) {
//     parts.push(`${field} >= ?`);
//     params.push(start);
//   }
//   if (end) {
//     parts.push(`${field} < ?`);
//     params.push(end);
//   }
//   return { clause: parts.length ? ` AND ${parts.join(" AND ")}` : "", params };
// }

// // Normalize product values coming from UI
// function normalizeProduct(p) {
//   if (!p || p === "ALL") return "ALL";
//   const s = String(p).toLowerCase().replace(/\s+/g, "").replace(/-/g, "");
//   if (s === "evloan" || s === "ev_loan") return "EV";
//   if (s === "blloan" || s === "bl_loan") return "BL";
//   if (s === "adikosh") return "Adikosh";
//   if (s === "gqnonfsf" || s === "gqnon-fsf") return "GQ Non-FSF";
//   if (s === "gqfsf" || s === "gq-fsf") return "GQ FSF";
//   return p;
// }

// // Support both space and underscore spellings in DB
// const EV_LABELS = ["EV Loan", "EV_loan"];
// const BL_LABELS = ["BL Loan", "BL_loan"];
// const ALL_LENDERS = [...EV_LABELS, ...BL_LABELS];

// /* -------------------- Routes -------------------- */

// /** Disbursal Trend */
// router.post("/disbursal-trend", async (req, res) => {
//   try {
//     const { product, from, to } = req.body || {};
//     const prod = normalizeProduct(product);
//     const { start, end } = dayRange(from, to);

//     const queries = [];
//     const params = [];

//     // loan_bookings (EV/BL from the same table)
//     if (prod === "ALL" || prod === "EV" || prod === "BL") {
//       const lenders =
//         prod === "EV" ? EV_LABELS : prod === "BL" ? BL_LABELS : ALL_LENDERS;
//       const placeholders = lenders.map(() => "?").join(",");
//       const { clause, params: dps } = buildDateRangeClause(
//         "agreement_date",
//         start,
//         end
//       );
//       queries.push(`
//         SELECT DATE_FORMAT(agreement_date, '%Y-%m-%d') AS month,
//                lender AS product,
//                SUM(loan_amount) AS total_disbursed
//         FROM loan_bookings
//         WHERE lender IN (${placeholders}) ${clause}
//         GROUP BY DATE_FORMAT(agreement_date, '%Y-%m-%d'), lender
//       `);
//       params.push(...lenders, ...dps);
//     }

//     // Adikosh
//     if (prod === "ALL" || prod === "Adikosh") {
//       const { clause, params: dps } = buildDateRangeClause(
//         "agreement_date",
//         start,
//         end
//       );
//       queries.push(`
//         SELECT DATE_FORMAT(agreement_date, '%Y-%m-%d') AS month,
//                'Adikosh' AS product,
//                SUM(loan_amount) AS total_disbursed
//         FROM loan_booking_adikosh
//         WHERE 1=1 ${clause}
//         GROUP BY DATE_FORMAT(agreement_date, '%Y-%m-%d')
//       `);
//       params.push(...dps);
//     }

//     // GQ Non-FSF
//     if (prod === "ALL" || prod === "GQ Non-FSF") {
//       const { clause, params: dps } = buildDateRangeClause(
//         "agreement_date",
//         start,
//         end
//       );
//       queries.push(`
//         SELECT DATE_FORMAT(agreement_date, '%Y-%m-%d') AS month,
//                'GQ Non-FSF' AS product,
//                SUM(loan_amount) AS total_disbursed
//         FROM loan_booking_gq_non_fsf
//         WHERE 1=1 ${clause}
//         GROUP BY DATE_FORMAT(agreement_date, '%Y-%m-%d')
//       `);
//       params.push(...dps);
//     }

//     const sql = queries.join(" UNION ALL ") + " ORDER BY month, product";
//     const [rows] = await db.promise().query(sql, params);
//     res.json(rows);
//   } catch (err) {
//     console.error("❌ Disbursal Trend Error:", err);
//     res.status(500).json({ error: "Disbursal trend fetch failed" });
//   }
// });

// /** Repayment Trend */
// router.post("/repayment-trend", async (req, res) => {
//   try {
//     const { product, from, to } = req.body || {};
//     const prod = normalizeProduct(product);
//     const { start, end } = dayRange(from, to);

//     const queries = [];
//     const params = [];

//     const dateR = buildDateRangeClause("r.payment_date", start, end);
//     const dateA = buildDateRangeClause("payment_date", start, end);

//     // EV/BL from repayments_upload joined to loan_bookings
//     if (prod === "ALL" || prod === "EV" || prod === "BL") {
//       const lenders =
//         prod === "EV" ? EV_LABELS : prod === "BL" ? BL_LABELS : ALL_LENDERS;
//       const placeholders = lenders.map(() => "?").join(",");
//       queries.push(`
//         SELECT DATE_FORMAT(r.payment_date, '%Y-%m-%d') AS month,
//                l.lender AS product,
//                SUM(r.transfer_amount) AS total_collected
//         FROM repayments_upload r
//         JOIN loan_bookings l ON l.lan = r.lan
//         WHERE r.payment_date IS NOT NULL
//           AND l.lender IN (${placeholders})
//           ${dateR.clause}
//         GROUP BY DATE_FORMAT(r.payment_date, '%Y-%m-%d'), l.lender
//       `);
//       params.push(...lenders, ...dateR.params);
//     }

//     // Adikosh
//     if (prod === "ALL" || prod === "Adikosh") {
//       queries.push(`
//         SELECT DATE_FORMAT(payment_date, '%Y-%m-%d') AS month,
//                'Adikosh' AS product,
//                SUM(transfer_amount) AS total_collected
//         FROM repayments_upload_adikosh
//         WHERE payment_date IS NOT NULL
//           ${dateA.clause}
//         GROUP BY DATE_FORMAT(payment_date, '%Y-%m-%d')
//       `);
//       params.push(...dateA.params);
//     }

//     // GQ Non-FSF
//     if (prod === "ALL" || prod === "GQ Non-FSF") {
//       queries.push(`
//         SELECT DATE_FORMAT(payment_date, '%Y-%m-%d') AS month,
//                'GQ Non-FSF' AS product,
//                SUM(transfer_amount) AS total_collected
//         FROM repayments_upload
//         WHERE payment_date IS NOT NULL
//           AND lan IN (SELECT lan FROM loan_booking_gq_non_fsf)
//           ${dateA.clause}
//         GROUP BY DATE_FORMAT(payment_date, '%Y-%m-%d')
//       `);
//       params.push(...dateA.params);
//     }

//     const sql = queries.join(" UNION ALL ") + " ORDER BY month, product";
//     const [rows] = await db.promise().query(sql, params);
//     res.json(rows);
//   } catch (err) {
//     console.error("❌ Repayment Trend Error:", err);
//     res.status(500).json({ error: "Repayment trend fetch failed" });
//   }
// });

// /** Collection vs Due */
// router.post("/collection-vs-due", async (req, res) => {
//   try {
//     const { product, from, to } = req.body || {};
//     const prod = normalizeProduct(product);
//     const { start, end } = dayRange(from, to);

//     const queries = [];
//     const params = [];

//     const dueR = buildDateRangeClause("due_date", start, end);
//     const payR = buildDateRangeClause("payment_date", start, end);

//     // DUE: EV (add BL dues table here if you have one)
//     if (prod === "ALL" || prod === "EV") {
//       queries.push(`
//         SELECT DATE_FORMAT(due_date, '%Y-%m-%d') AS month,
//                'EV Loan' AS product,
//                SUM(emi) AS total_due,
//                0 AS total_collected
//         FROM manual_rps_ev_loan
//         WHERE due_date < CURDATE() ${dueR.clause}
//         GROUP BY DATE_FORMAT(due_date, '%Y-%m-%d')
//       `);
//       params.push(...dueR.params);
//     }

//     // DUE: Adikosh
//     if (prod === "ALL" || prod === "Adikosh") {
//       queries.push(`
//         SELECT DATE_FORMAT(due_date, '%Y-%m-%d') AS month,
//                'Adikosh' AS product,
//                SUM(emi) AS total_due,
//                0 AS total_collected
//         FROM manual_rps_adikosh
//         WHERE due_date < CURDATE() ${dueR.clause}
//         GROUP BY DATE_FORMAT(due_date, '%Y-%m-%d')
//       `);
//       params.push(...dueR.params);
//     }

//     // DUE: GQ Non-FSF
//     if (prod === "ALL" || prod === "GQ Non-FSF") {
//       queries.push(`
//         SELECT DATE_FORMAT(due_date, '%Y-%m-%d') AS month,
//                'GQ Non-FSF' AS product,
//                SUM(emi) AS total_due,
//                0 AS total_collected
//         FROM manual_rps_gq_non_fsf
//         WHERE due_date < CURDATE() ${dueR.clause}
//         GROUP BY DATE_FORMAT(due_date, '%Y-%m-%d')
//       `);
//       params.push(...dueR.params);
//     }

//     // COLLECTED: EV/BL
//     if (prod === "ALL" || prod === "EV" || prod === "BL") {
//       const lenders =
//         prod === "EV" ? EV_LABELS : prod === "BL" ? BL_LABELS : ALL_LENDERS;
//       const placeholders = lenders.map(() => "?").join(",");
//       queries.push(`
//         SELECT DATE_FORMAT(r.payment_date, '%Y-%m-%d') AS month,
//                l.lender AS product,
//                0 AS total_due,
//                SUM(r.transfer_amount) AS total_collected
//         FROM repayments_upload r
//         JOIN loan_bookings l ON l.lan = r.lan
//         WHERE r.payment_date IS NOT NULL
//           AND r.payment_date < CURDATE()
//           AND l.lender IN (${placeholders})
//           ${buildDateRangeClause("r.payment_date", start, end).clause}
//         GROUP BY DATE_FORMAT(r.payment_date, '%Y-%m-%d'), l.lender
//       `);
//       params.push(
//         ...lenders,
//         ...buildDateRangeClause("r.payment_date", start, end).params
//       );
//     }

//     // COLLECTED: Adikosh
//     if (prod === "ALL" || prod === "Adikosh") {
//       queries.push(`
//         SELECT DATE_FORMAT(payment_date, '%Y-%m-%d') AS month,
//                'Adikosh' AS product,
//                0 AS total_due,
//                SUM(transfer_amount) AS total_collected
//         FROM repayments_upload_adikosh
//         WHERE payment_date IS NOT NULL
//           AND payment_date < CURDATE() ${payR.clause}
//         GROUP BY DATE_FORMAT(payment_date, '%Y-%m-%d')
//       `);
//       params.push(...payR.params);
//     }

//     // COLLECTED: GQ Non-FSF
//     if (prod === "ALL" || prod === "GQ Non-FSF") {
//       queries.push(`
//         SELECT DATE_FORMAT(payment_date, '%Y-%m-%d') AS month,
//                'GQ Non-FSF' AS product,
//                0 AS total_due,
//                SUM(transfer_amount) AS total_collected
//         FROM repayments_upload
//         WHERE payment_date IS NOT NULL
//           AND payment_date < CURDATE()
//           AND lan IN (SELECT lan FROM loan_booking_gq_non_fsf)
//           ${payR.clause}
//         GROUP BY DATE_FORMAT(payment_date, '%Y-%m-%d')
//       `);
//       params.push(...payR.params);
//     }

//     const sql = queries.join(" UNION ALL ") + " ORDER BY month, product";
//     const [rows] = await db.promise().query(sql, params);
//     res.json(rows);
//   } catch (err) {
//     console.error("❌ Collection vs Due Error:", err);
//     res.status(500).json({ error: "Collection vs Due fetch failed" });
//   }
// });

// /** Product Distribution */
// router.post("/product-distribution", async (req, res) => {
//   const { from, to } = req.body || {};
//   try {
//     const { start, end } = dayRange(from, to);

//     const wcLB = buildDateRangeClause("agreement_date", start, end);
//     const wcAK = buildDateRangeClause("agreement_date", start, end);
//     const wcGQ = buildDateRangeClause("agreement_date", start, end);

//     const sql = `
//       SELECT lender AS product, COUNT(*) AS value
//       FROM loan_bookings
//       WHERE 1=1 ${wcLB.clause}
//       GROUP BY lender

//       UNION ALL

//       SELECT 'Adikosh' AS product, COUNT(*) AS value
//       FROM loan_booking_adikosh
//       WHERE 1=1 ${wcAK.clause}

//       UNION ALL

//       SELECT 'GQ Non-FSF' AS product, COUNT(*) AS value
//       FROM loan_booking_gq_non_fsf
//       WHERE 1=1 ${wcGQ.clause}
//     `;

//     const params = [...wcLB.params, ...wcAK.params, ...wcGQ.params];
//     const [rows] = await db.promise().query(sql, params);

//     const productMap = {};
//     rows.forEach(({ product, value }) => {
//       productMap[product] = (productMap[product] || 0) + Number(value || 0);
//     });

//     res.json(
//       Object.entries(productMap).map(([product, value]) => ({ product, value }))
//     );
//   } catch (err) {
//     console.error("❌ Product Distribution Error:", err);
//     res.status(500).json({ error: "Internal Server Error" });
//   }
// });

// /** Metric Cards */
// router.post("/metric-cards", async (req, res) => {
//   try {
//     const { product, from, to } = req.body || {};
//     const prod = normalizeProduct(product);
//     const { start, end } = dayRange(from, to);

//     const disburseQueries = [];
//     const disburseParams = [];
//     const collectQueries = [];
//     const collectParams = [];
//     const pniQueries = [];  // for principal & interest collected
//     const pniParams = [];

//     const dcl = buildDateRangeClause("agreement_date", start, end);
//     const pclR = buildDateRangeClause("r.payment_date", start, end);
//     const pclA = buildDateRangeClause("payment_date", start, end);

//     /** ---------------- DISBURSED ---------------- */
//     if (prod === "ALL" || prod === "EV" || prod === "BL") {
//       const lenders = prod === "EV" ? EV_LABELS : prod === "BL" ? BL_LABELS : ALL_LENDERS;
//       const placeholders = lenders.map(() => "?").join(",");
//       disburseQueries.push(`
//         SELECT IFNULL(SUM(loan_amount), 0) AS amount
//         FROM loan_bookings
//         WHERE lender IN (${placeholders}) ${dcl.clause}
//       `);
//       disburseParams.push(...lenders, ...dcl.params);

//       collectQueries.push(`
//         SELECT IFNULL(SUM(r.transfer_amount), 0) AS amount
//         FROM repayments_upload r
//         JOIN loan_bookings l ON l.lan = r.lan
//         WHERE r.payment_date IS NOT NULL
//           AND l.lender IN (${placeholders})
//           ${pclR.clause}
//       `);
//       collectParams.push(...lenders, ...pclR.params);

//       // Principal + Interest Collected for EV/BL from manual_rps_ev_loan
//       pniQueries.push(`
//         SELECT IFNULL(SUM(rps.principal),0) AS principal,
//                IFNULL(SUM(rps.interest),0)  AS interest
//         FROM manual_rps_ev_loan rps
//         JOIN loan_bookings l ON l.lan = rps.lan
//         WHERE rps.payment_date IS NOT NULL
//           AND l.lender IN (${placeholders})
//           ${buildDateRangeClause("rps.payment_date", start, end).clause}
//       `);
//       pniParams.push(...lenders, ...buildDateRangeClause("rps.payment_date", start, end).params);
//     }

//     if (prod === "ALL" || prod === "Adikosh") {
//       disburseQueries.push(`
//         SELECT IFNULL(SUM(loan_amount), 0) AS amount
//         FROM loan_booking_adikosh
//         WHERE 1=1 ${dcl.clause}
//       `);
//       disburseParams.push(...dcl.params);

//       collectQueries.push(`
//         SELECT IFNULL(SUM(transfer_amount), 0) AS amount
//         FROM repayments_upload_adikosh
//         WHERE payment_date IS NOT NULL ${pclA.clause}
//       `);
//       collectParams.push(...pclA.params);

//       pniQueries.push(`
//         SELECT IFNULL(SUM(principal),0) AS principal,
//                IFNULL(SUM(interest),0)  AS interest
//         FROM manual_rps_adikosh
//         WHERE payment_date IS NOT NULL ${pclA.clause}
//       `);
//       pniParams.push(...pclA.params);
//     }

//     if (prod === "ALL" || prod === "GQ Non-FSF") {
//       disburseQueries.push(`
//         SELECT IFNULL(SUM(loan_amount), 0) AS amount
//         FROM loan_booking_gq_non_fsf
//         WHERE 1=1 ${dcl.clause}
//       `);
//       disburseParams.push(...dcl.params);

//       collectQueries.push(`
//         SELECT IFNULL(SUM(transfer_amount), 0) AS amount
//         FROM repayments_upload
//         WHERE payment_date IS NOT NULL
//           AND lan IN (SELECT lan FROM loan_booking_gq_non_fsf)
//           ${pclA.clause}
//       `);
//       collectParams.push(...pclA.params);

//       pniQueries.push(`
//         SELECT IFNULL(SUM(principal),0) AS principal,
//                IFNULL(SUM(interest),0)  AS interest
//         FROM manual_rps_gq_non_fsf
//         WHERE payment_date IS NOT NULL ${pclA.clause}
//       `);
//       pniParams.push(...pclA.params);
//     }

//     /** ---------------- POS (Outstanding) ---------------- */
//     const jsToday = new Date().toISOString().slice(0, 10);
//     const cutoff = end || jsToday;

//     const posQueries = [];
//     const posParams = [];

//     // EV/BL
//     if (prod === "ALL" || prod === "EV" || prod === "BL") {
//       const lenders = prod === "EV" ? EV_LABELS : prod === "BL" ? BL_LABELS : ALL_LENDERS;
//       const placeholders = lenders.map(() => "?").join(",");
//       const bookRange = buildDateRangeClause("l.agreement_date", start, end);

//       posQueries.push(`
//         SELECT
//           IFNULL(SUM(
//             CASE
//               WHEN rps.payment_date IS NULL THEN rps.principal
//               WHEN rps.payment_date >= ?     THEN rps.principal
//               ELSE 0
//             END
//           ), 0) AS principal_outstanding,
//           IFNULL(SUM(
//             CASE
//               WHEN rps.payment_date IS NULL THEN rps.interest
//               WHEN rps.payment_date >= ?     THEN rps.interest
//               ELSE 0
//             END
//           ), 0) AS interest_outstanding
//         FROM manual_rps_ev_loan rps
//         JOIN loan_bookings l ON l.lan = rps.lan
//         WHERE l.lender IN (${placeholders})
//           ${bookRange.clause}
//       `);
//       posParams.push(cutoff, cutoff, ...lenders, ...bookRange.params);
//     }

//     // Adikosh
//     if (prod === "ALL" || prod === "Adikosh") {
//       const bookRange = buildDateRangeClause("b.agreement_date", start, end);
//       posQueries.push(`
//         SELECT
//           IFNULL(SUM(
//             CASE
//               WHEN rps.payment_date IS NULL THEN rps.principal
//               WHEN rps.payment_date >= ?     THEN rps.principal
//               ELSE 0
//             END
//           ), 0) AS principal_outstanding,
//           IFNULL(SUM(
//             CASE
//               WHEN rps.payment_date IS NULL THEN rps.interest
//               WHEN rps.payment_date >= ?     THEN rps.interest
//               ELSE 0
//             END
//           ), 0) AS interest_outstanding
//         FROM manual_rps_adikosh rps
//         JOIN loan_booking_adikosh b ON b.lan = rps.lan
//         WHERE 1=1 ${bookRange.clause}
//       `);
//       posParams.push(cutoff, cutoff, ...bookRange.params);
//     }

//     // GQ Non-FSF
//     if (prod === "ALL" || prod === "GQ Non-FSF") {
//       const bookRange = buildDateRangeClause("b.agreement_date", start, end);
//       posQueries.push(`
//         SELECT
//           IFNULL(SUM(
//             CASE
//               WHEN rps.payment_date IS NULL THEN rps.principal
//               WHEN rps.payment_date >= ?     THEN rps.principal
//               ELSE 0
//             END
//           ), 0) AS principal_outstanding,
//           IFNULL(SUM(
//             CASE
//               WHEN rps.payment_date IS NULL THEN rps.interest
//               WHEN rps.payment_date >= ?     THEN rps.interest
//               ELSE 0
//             END
//           ), 0) AS interest_outstanding
//         FROM manual_rps_gq_non_fsf rps
//         JOIN loan_booking_gq_non_fsf b ON b.lan = rps.lan
//         WHERE 1=1 ${bookRange.clause}
//       `);
//       posParams.push(cutoff, cutoff, ...bookRange.params);
//     }

//     /** ---------------- Run all queries ---------------- */
//     const [[disbRows], [collRows], [posRows], [pniRows]] = await Promise.all([
//       db.promise().query(disburseQueries.join(" UNION ALL "), disburseParams),
//       db.promise().query(collectQueries.join(" UNION ALL "), collectParams),
//       db.promise().query(posQueries.join(" UNION ALL "), posParams),
//       db.promise().query(pniQueries.join(" UNION ALL "), pniParams),
//     ]);

//     const totalDisbursed = disbRows.reduce((s, r) => s + Number(r.amount || 0), 0);
//     const totalCollected = collRows.reduce((s, r) => s + Number(r.amount || 0), 0);

//     const totalPrincipal = pniRows.reduce((s, r) => s + Number(r.principal || 0), 0);
//     const totalInterest  = pniRows.reduce((s, r) => s + Number(r.interest  || 0), 0);

//     const collectionRate = totalDisbursed ? (totalCollected / totalDisbursed) * 100 : 0;

//     let principalOutstanding = posRows.reduce((s, r) => s + Number(r.principal_outstanding || 0), 0);
//     let interestOutstanding  = posRows.reduce((s, r) => s + Number(r.interest_outstanding  || 0), 0);

//     if (principalOutstanding < 0) principalOutstanding = 0;
//     if (interestOutstanding < 0) interestOutstanding = 0;

//     res.json({
//       totalDisbursed,
//       totalCollected,
//       collectionRate,
//       totalPrincipal,
//       totalInterest,
//       principalOutstanding,
//       interestOutstanding,
//       posOutstanding: principalOutstanding + interestOutstanding
//     });
//   } catch (err) {
//     console.error("❌ Metric Card Fetch Error:", err);
//     res.status(500).json({ error: "Failed to fetch metrics" });
//   }
// });

// /** -------------------- DPD Buckets (summary) -------------------- */
// /** body: { product }  -> uses normalizeProduct(product) */
// router.post("/dpd-buckets", async (req, res) => {
//   try {
//     const { product } = req.body || {};
//     const prod = normalizeProduct(product);

//     const unions = [];
//     const params = [];
//     const OUTSTANDING = `rps.status <> 'Paid' AND rps.due_date < CURDATE()`;

//     // EV/BL share the same RPS table -> manual_rps_ev_loan
//     if (prod === "ALL" || prod === "EV" || prod === "BL") {
//       const lenders =
//         prod === "EV" ? EV_LABELS : prod === "BL" ? BL_LABELS : ALL_LENDERS;
//       const placeholders = lenders.map(() => "?").join(",");
//       unions.push(`
//         SELECT
//           CASE
//             WHEN t.max_dpd BETWEEN 1 AND 30 THEN '0-30'
//             WHEN t.max_dpd BETWEEN 31 AND 60 THEN '30-60'
//             WHEN t.max_dpd BETWEEN 61 AND 90 THEN '60-90'
//           END AS bucket,
//           COUNT(*) AS loans,
//           SUM(t.overdue_emi) AS overdue_emi
//         FROM (
//           SELECT rps.lan,
//                  MAX(CASE WHEN ${OUTSTANDING} THEN IFNULL(rps.dpd, DATEDIFF(CURDATE(), rps.due_date)) ELSE 0 END) AS max_dpd,
//                  SUM(CASE WHEN ${OUTSTANDING} THEN IFNULL(rps.emi,0) ELSE 0 END) AS overdue_emi
//           FROM manual_rps_ev_loan rps
//           JOIN loan_bookings l ON l.lan = rps.lan
//           WHERE l.lender IN (${placeholders})
//           GROUP BY rps.lan
//         ) t
//         WHERE t.max_dpd BETWEEN 1 AND 90
//         GROUP BY bucket
//       `);
//       params.push(...lenders);
//     }

//     // Adikosh
//     if (prod === "ALL" || prod === "Adikosh") {
//       unions.push(`
//         SELECT
//           CASE
//             WHEN t.max_dpd BETWEEN 1 AND 30 THEN '0-30'
//             WHEN t.max_dpd BETWEEN 31 AND 60 THEN '30-60'
//             WHEN t.max_dpd BETWEEN 61 AND 90 THEN '60-90'
//           END AS bucket,
//           COUNT(*) AS loans,
//           SUM(t.overdue_emi) AS overdue_emi
//         FROM (
//           SELECT rps.lan,
//                  MAX(CASE WHEN ${OUTSTANDING} THEN IFNULL(rps.dpd, DATEDIFF(CURDATE(), rps.due_date)) ELSE 0 END) AS max_dpd,
//                  SUM(CASE WHEN ${OUTSTANDING} THEN IFNULL(rps.emi,0) ELSE 0 END) AS overdue_emi
//           FROM manual_rps_adikosh rps
//           JOIN loan_booking_adikosh b ON b.lan = rps.lan
//           GROUP BY rps.lan
//         ) t
//         WHERE t.max_dpd BETWEEN 1 AND 90
//         GROUP BY bucket
//       `);
//     }

//     // GQ Non-FSF
//     if (prod === "ALL" || prod === "GQ Non-FSF") {
//       unions.push(`
//         SELECT
//           CASE
//             WHEN t.max_dpd BETWEEN 1 AND 30 THEN '0-30'
//             WHEN t.max_dpd BETWEEN 31 AND 60 THEN '30-60'
//             WHEN t.max_dpd BETWEEN 61 AND 90 THEN '60-90'
//           END AS bucket,
//           COUNT(*) AS loans,
//           SUM(t.overdue_emi) AS overdue_emi
//         FROM (
//           SELECT rps.lan,
//                  MAX(CASE WHEN ${OUTSTANDING} THEN IFNULL(rps.dpd, DATEDIFF(CURDATE(), rps.due_date)) ELSE 0 END) AS max_dpd,
//                  SUM(CASE WHEN ${OUTSTANDING} THEN IFNULL(rps.emi,0) ELSE 0 END) AS overdue_emi
//           FROM manual_rps_gq_non_fsf rps
//           JOIN loan_booking_gq_non_fsf b ON b.lan = rps.lan
//           GROUP BY rps.lan
//         ) t
//         WHERE t.max_dpd BETWEEN 1 AND 90
//         GROUP BY bucket
//       `);
//     }

//     if (!unions.length) return res.json({ buckets: [], asOf: new Date().toISOString().slice(0,10) });

//     const sql = `
//       SELECT bucket, SUM(loans) AS loans, SUM(overdue_emi) AS overdue_emi
//       FROM (
//         ${unions.join(" UNION ALL ")}
//       ) x
//       GROUP BY bucket
//       ORDER BY FIELD(bucket, '0-30','30-60','60-90')
//     `;
//     const [rows] = await db.promise().query(sql, params);

//     // Normalize to always return 3 buckets
//     const map = { "0-30": { bucket:"0-30", loans:0, overdue_emi:0 },
//                   "30-60": { bucket:"30-60", loans:0, overdue_emi:0 },
//                   "60-90": { bucket:"60-90", loans:0, overdue_emi:0 } };
//     rows.forEach(r => map[r.bucket] = r);
//     res.json({ buckets: Object.values(map), asOf: new Date().toISOString().slice(0,10) });
//   } catch (err) {
//     console.error("❌ DPD Buckets Error:", err);
//     res.status(500).json({ error: "Failed to fetch DPD buckets" });
//   }
// });

// /** -------------------- DPD Loan List (by bucket) -------------------- */
// /** body: { product, bucket }  // bucket: '0-30' | '30-60' | '60-90' */
// router.post("/dpd-list", async (req, res) => {
//   try {
//     const { product, bucket } = req.body || {};
//     const prod = normalizeProduct(product);

//     const ranges = {
//       "0-30": [1, 30],
//       "30-60": [31, 60],
//       "60-90": [61, 90],
//     };
//     const range = ranges[bucket];
//     if (!range) return res.status(400).json({ error: "Invalid bucket" });
//     const [minDPD, maxDPD] = range;

//     const unions = [];
//     const params = [];
//     const OUTSTANDING = `rps.status <> 'Paid' AND rps.due_date < CURDATE()`;

//     // EV/BL
//     if (prod === "ALL" || prod === "EV" || prod === "BL") {
//       const lenders =
//         prod === "EV" ? EV_LABELS : prod === "BL" ? BL_LABELS : ALL_LENDERS;
//       const placeholders = lenders.map(() => "?").join(",");
//       unions.push(`
//         SELECT l.lender AS product, t.*
//         FROM (
//           SELECT rps.lan,
//                  MAX(CASE WHEN ${OUTSTANDING} THEN IFNULL(rps.dpd, DATEDIFF(CURDATE(), rps.due_date)) ELSE 0 END) AS max_dpd,
//                  SUM(CASE WHEN ${OUTSTANDING} THEN IFNULL(rps.emi,0) ELSE 0 END) AS overdue_emi,
//                  SUM(CASE WHEN ${OUTSTANDING} THEN IFNULL(rps.principal,0) ELSE 0 END) AS overdue_principal,
//                  SUM(CASE WHEN ${OUTSTANDING} THEN IFNULL(rps.interest,0) ELSE 0 END) AS overdue_interest,
//                  MAX(CASE WHEN ${OUTSTANDING} THEN rps.due_date ELSE NULL END) AS last_due_date
//           FROM manual_rps_ev_loan rps
//           JOIN loan_bookings l ON l.lan = rps.lan
//           WHERE l.lender IN (${placeholders})
//           GROUP BY rps.lan
//           HAVING max_dpd BETWEEN ? AND ?
//         ) t
//         JOIN loan_bookings l ON l.lan = t.lan
//       `);
//       params.push(...lenders, minDPD, maxDPD);
//     }

//     // Adikosh
//     if (prod === "ALL" || prod === "Adikosh") {
//       unions.push(`
//         SELECT 'Adikosh' AS product, t.*
//         FROM (
//           SELECT rps.lan,
//                  MAX(CASE WHEN ${OUTSTANDING} THEN IFNULL(rps.dpd, DATEDIFF(CURDATE(), rps.due_date)) ELSE 0 END) AS max_dpd,
//                  SUM(CASE WHEN ${OUTSTANDING} THEN IFNULL(rps.emi,0) ELSE 0 END) AS overdue_emi,
//                  SUM(CASE WHEN ${OUTSTANDING} THEN IFNULL(rps.principal,0) ELSE 0 END) AS overdue_principal,
//                  SUM(CASE WHEN ${OUTSTANDING} THEN IFNULL(rps.interest,0) ELSE 0 END) AS overdue_interest,
//                  MAX(CASE WHEN ${OUTSTANDING} THEN rps.due_date ELSE NULL END) AS last_due_date
//           FROM manual_rps_adikosh rps
//           JOIN loan_booking_adikosh b ON b.lan = rps.lan
//           GROUP BY rps.lan
//           HAVING max_dpd BETWEEN ? AND ?
//         ) t
//       `);
//       params.push(minDPD, maxDPD);
//     }

//     // GQ Non-FSF
//     if (prod === "ALL" || prod === "GQ Non-FSF") {
//       unions.push(`
//         SELECT 'GQ Non-FSF' AS product, t.*
//         FROM (
//           SELECT rps.lan,
//                  MAX(CASE WHEN ${OUTSTANDING} THEN IFNULL(rps.dpd, DATEDIFF(CURDATE(), rps.due_date)) ELSE 0 END) AS max_dpd,
//                  SUM(CASE WHEN ${OUTSTANDING} THEN IFNULL(rps.emi,0) ELSE 0 END) AS overdue_emi,
//                  SUM(CASE WHEN ${OUTSTANDING} THEN IFNULL(rps.principal,0) ELSE 0 END) AS overdue_principal,
//                  SUM(CASE WHEN ${OUTSTANDING} THEN IFNULL(rps.interest,0) ELSE 0 END) AS overdue_interest,
//                  MAX(CASE WHEN ${OUTSTANDING} THEN rps.due_date ELSE NULL END) AS last_due_date
//           FROM manual_rps_gq_non_fsf rps
//           JOIN loan_booking_gq_non_fsf b ON b.lan = rps.lan
//           GROUP BY rps.lan
//           HAVING max_dpd BETWEEN ? AND ?
//         ) t
//       `);
//       params.push(minDPD, maxDPD);
//     }

//     if (!unions.length) return res.json([]);

//     const sql = `
//       ${unions.join(" UNION ALL ")}
//       ORDER BY max_dpd DESC, last_due_date DESC
//     `;
//     const [rows] = await db.promise().query(sql, params);
//     res.json(rows);
//   } catch (err) {
//     console.error("❌ DPD List Error:", err);
//     res.status(500).json({ error: "Failed to fetch DPD list" });
//   }
// });

// module.exports = router;

// const express = require("express");
// const db = require("../config/db");
// const router = express.Router();

// /* -------------------- Helpers -------------------- */

// // Accepts 'YYYY-MM-DD' and returns { start, end }
// function dayRange(from, to) {
//   const start = from && from.trim() ? from.trim() : null;
//   // Add 1 day to "to" since end is exclusive
//   let end = null;
//   if (to && to.trim()) {
//     const dt = new Date(to.trim());
//     dt.setDate(dt.getDate() + 1);
//     end = dt.toISOString().slice(0, 10); // back to YYYY-MM-DD
//   }
//   return { start, end };
// }

// // Builds "AND field >= ? AND field < ?" with params, using start/end if present
// function buildDateRangeClause(field, start, end) {
//   const parts = [];
//   const params = [];
//   if (start) {
//     parts.push(`${field} >= ?`);
//     params.push(start);
//   }
//   if (end) {
//     parts.push(`${field} < ?`);
//     params.push(end);
//   }
//   return { clause: parts.length ? ` AND ${parts.join(" AND ")}` : "", params };
// }

// // Normalize product values coming from UI
// function normalizeProduct(p) {
//   if (!p || p === "ALL") return "ALL";
//   const s = String(p).toLowerCase().replace(/\s+/g, "").replace(/-/g, "");
//   if (s === "evloan" || s === "ev_loan") return "EV";
//   if (s === "blloan" || s === "bl_loan") return "BL";
//   if (s === "adikosh") return "Adikosh";
//   if (s === "gqnonfsf" || s === "gqnon-fsf") return "GQ Non-FSF";
//   if (s === "gqfsf" || s === "gq-fsf") return "GQ FSF";
//   return p;
// }

// /* -------------------- Routes -------------------- */

// /** Disbursal Trend */
// router.post("/disbursal-trend", async (req, res) => {
//   try {
//     const { product, from, to } = req.body || {};
//     const prod = normalizeProduct(product);
//     const { start, end } = dayRange(from, to);

//     const queries = [];
//     const params = [];

//     // BL disbursals (loan_bookings)
//     if (prod === "ALL" || prod === "BL") {
//       const dr = buildDateRangeClause("agreement_date", start, end);
//       queries.push(`
//         SELECT DATE_FORMAT(agreement_date, '%Y-%m-%d') AS month,
//                'BL Loan' AS product,
//                SUM(loan_amount) AS total_disbursed
//         FROM loan_bookings
//         WHERE 1=1 ${dr.clause}
//         GROUP BY DATE_FORMAT(agreement_date, '%Y-%m-%d')
//       `);
//       params.push(...dr.params);
//     }

//     // EV disbursals (loan_booking_ev)
//     if (prod === "ALL" || prod === "EV") {
//       const dr = buildDateRangeClause("agreement_date", start, end);
//       queries.push(`
//         SELECT DATE_FORMAT(agreement_date, '%Y-%m-%d') AS month,
//                'EV Loan' AS product,
//                SUM(loan_amount) AS total_disbursed
//         FROM loan_booking_ev
//         WHERE 1=1 ${dr.clause}
//         GROUP BY DATE_FORMAT(agreement_date, '%Y-%m-%d')
//       `);
//       params.push(...dr.params);
//     }

//     // Adikosh
//     if (prod === "ALL" || prod === "Adikosh") {
//       const dr = buildDateRangeClause("agreement_date", start, end);
//       queries.push(`
//         SELECT DATE_FORMAT(agreement_date, '%Y-%m-%d') AS month,
//                'Adikosh' AS product,
//                SUM(loan_amount) AS total_disbursed
//         FROM loan_booking_adikosh
//         WHERE 1=1 ${dr.clause}
//         GROUP BY DATE_FORMAT(agreement_date, '%Y-%m-%d')
//       `);
//       params.push(...dr.params);
//     }

//     // GQ Non-FSF
//     if (prod === "ALL" || prod === "GQ Non-FSF") {
//       const dr = buildDateRangeClause("agreement_date", start, end);
//       queries.push(`
//         SELECT DATE_FORMAT(agreement_date, '%Y-%m-%d') AS month,
//                'GQ Non-FSF' AS product,
//                SUM(loan_amount) AS total_disbursed
//         FROM loan_booking_gq_non_fsf
//         WHERE 1=1 ${dr.clause}
//         GROUP BY DATE_FORMAT(agreement_date, '%Y-%m-%d')
//       `);
//       params.push(...dr.params);
//     }

//     // GQ FSF
//     if (prod === "ALL" || prod === "GQ FSF") {
//       const dr = buildDateRangeClause("agreement_date", start, end);
//       queries.push(`
//         SELECT DATE_FORMAT(agreement_date, '%Y-%m-%d') AS month,
//                'GQ FSF' AS product,
//                SUM(loan_amount) AS total_disbursed
//         FROM loan_booking_gq_fsf
//         WHERE 1=1 ${dr.clause}
//         GROUP BY DATE_FORMAT(agreement_date, '%Y-%m-%d')
//       `);
//       params.push(...dr.params);
//     }

//     const sql = queries.join(" UNION ALL ") + " ORDER BY month, product";
//     const [rows] = await db.promise().query(sql, params);
//     res.json(rows);
//   } catch (err) {
//     console.error("❌ Disbursal Trend Error:", err);
//     res.status(500).json({ error: "Disbursal trend fetch failed" });
//   }
// });

// /** Repayment Trend */
// router.post("/repayment-trend", async (req, res) => {
//   try {
//     const { product, from, to } = req.body || {};
//     const prod = normalizeProduct(product);
//     const { start, end } = dayRange(from, to);

//     const queries = [];
//     const params = [];

//     const dateR = buildDateRangeClause("r.payment_date", start, end);
//     const dateA = buildDateRangeClause("payment_date", start, end);

//     // BL collections via repayments_upload joined to BL bookings
//     if (prod === "ALL" || prod === "BL") {
//       queries.push(`
//         SELECT DATE_FORMAT(r.payment_date, '%Y-%m-%d') AS month,
//                'BL Loan' AS product,
//                SUM(r.transfer_amount) AS total_collected
//         FROM repayments_upload r
//         JOIN loan_bookings b ON b.lan = r.lan
//         WHERE r.payment_date IS NOT NULL
//           ${dateR.clause}
//         GROUP BY DATE_FORMAT(r.payment_date, '%Y-%m-%d')
//       `);
//       params.push(...dateR.params);
//     }

//     // EV collections via repayments_upload joined to EV bookings
//     if (prod === "ALL" || prod === "EV") {
//       queries.push(`
//         SELECT DATE_FORMAT(r.payment_date, '%Y-%m-%d') AS month,
//                'EV Loan' AS product,
//                SUM(r.transfer_amount) AS total_collected
//         FROM repayments_upload r
//         JOIN loan_booking_ev e ON e.lan = r.lan
//         WHERE r.payment_date IS NOT NULL
//           ${dateR.clause}
//         GROUP BY DATE_FORMAT(r.payment_date, '%Y-%m-%d')
//       `);
//       params.push(...dateR.params);
//     }

//     // Adikosh
//     if (prod === "ALL" || prod === "Adikosh") {
//       queries.push(`
//         SELECT DATE_FORMAT(payment_date, '%Y-%m-%d') AS month,
//                'Adikosh' AS product,
//                SUM(transfer_amount) AS total_collected
//         FROM repayments_upload_adikosh
//         WHERE payment_date IS NOT NULL
//           ${dateA.clause}
//         GROUP BY DATE_FORMAT(payment_date, '%Y-%m-%d')
//       `);
//       params.push(...dateA.params);
//     }

//     // GQ Non-FSF
//     if (prod === "ALL" || prod === "GQ Non-FSF") {
//       queries.push(`
//         SELECT DATE_FORMAT(payment_date, '%Y-%m-%d') AS month,
//                'GQ Non-FSF' AS product,
//                SUM(transfer_amount) AS total_collected
//         FROM repayments_upload
//         WHERE payment_date IS NOT NULL
//           AND lan IN (SELECT lan FROM loan_booking_gq_non_fsf)
//           ${dateA.clause}
//         GROUP BY DATE_FORMAT(payment_date, '%Y-%m-%d')
//       `);
//       params.push(...dateA.params);
//     }

//     // GQ FSF
//     if (prod === "ALL" || prod === "GQ FSF") {
//       queries.push(`
//         SELECT DATE_FORMAT(payment_date, '%Y-%m-%d') AS month,
//                'GQ FSF' AS product,
//                SUM(transfer_amount) AS total_collected
//         FROM repayments_upload
//         WHERE payment_date IS NOT NULL
//           AND lan IN (SELECT lan FROM loan_booking_gq_fsf)
//           ${dateA.clause}
//         GROUP BY DATE_FORMAT(payment_date, '%Y-%m-%d')
//       `);
//       params.push(...dateA.params);
//     }

//     const sql = queries.join(" UNION ALL ") + " ORDER BY month, product";
//     const [rows] = await db.promise().query(sql, params);
//     res.json(rows);
//   } catch (err) {
//     console.error("❌ Repayment Trend Error:", err);
//     res.status(500).json({ error: "Repayment trend fetch failed" });
//   }
// });

// /** Collection vs Due */
// router.post("/collection-vs-due", async (req, res) => {
//   try {
//     const { product, from, to } = req.body || {};
//     const prod = normalizeProduct(product);
//     const { start, end } = dayRange(from, to);

//     const queries = [];
//     const params = [];

//     const dueR = buildDateRangeClause("due_date", start, end);
//     const payR = buildDateRangeClause("payment_date", start, end);

//     // DUE: EV
//     if (prod === "ALL" || prod === "EV") {
//       queries.push(`
//         SELECT DATE_FORMAT(due_date, '%Y-%m-%d') AS month,
//                'EV Loan' AS product,
//                SUM(emi) AS total_due,
//                0 AS total_collected
//         FROM manual_rps_ev_loan
//         WHERE due_date < CURDATE() ${dueR.clause}
//         GROUP BY DATE_FORMAT(due_date, '%Y-%m-%d')
//       `);
//       params.push(...dueR.params);
//     }

//     // DUE: BL
//     if (prod === "ALL" || prod === "BL") {
//       queries.push(`
//         SELECT DATE_FORMAT(due_date, '%Y-%m-%d') AS month,
//                'BL Loan' AS product,
//                SUM(emi) AS total_due,
//                0 AS total_collected
//         FROM manual_rps_bl_loan /* <-- BL RPS TABLE NAME */
//         WHERE due_date < CURDATE() ${dueR.clause}
//         GROUP BY DATE_FORMAT(due_date, '%Y-%m-%d')
//       `);
//       params.push(...dueR.params);
//     }

//     // DUE: Adikosh
//     if (prod === "ALL" || prod === "Adikosh") {
//       queries.push(`
//         SELECT DATE_FORMAT(due_date, '%Y-%m-%d') AS month,
//                'Adikosh' AS product,
//                SUM(emi) AS total_due,
//                0 AS total_collected
//         FROM manual_rps_adikosh
//         WHERE due_date < CURDATE() ${dueR.clause}
//         GROUP BY DATE_FORMAT(due_date, '%Y-%m-%d')
//       `);
//       params.push(...dueR.params);
//     }

//     // DUE: GQ Non-FSF
//     if (prod === "ALL" || prod === "GQ Non-FSF") {
//       queries.push(`
//         SELECT DATE_FORMAT(due_date, '%Y-%m-%d') AS month,
//                'GQ Non-FSF' AS product,
//                SUM(emi) AS total_due,
//                0 AS total_collected
//         FROM manual_rps_gq_non_fsf
//         WHERE due_date < CURDATE() ${dueR.clause}
//         GROUP BY DATE_FORMAT(due_date, '%Y-%m-%d')
//       `);
//       params.push(...dueR.params);
//     }

//     // DUE: GQ FSF
//     if (prod === "ALL" || prod === "GQ FSF") {
//       queries.push(`
//         SELECT DATE_FORMAT(due_date, '%Y-%m-%d') AS month,
//                'GQ FSF' AS product,
//                SUM(emi) AS total_due,
//                0 AS total_collected
//         FROM manual_rps_gq_fsf
//         WHERE due_date < CURDATE() ${dueR.clause}
//         GROUP BY DATE_FORMAT(due_date, '%Y-%m-%d')
//       `);
//       params.push(...dueR.params);
//     }

//     // COLLECTED: BL
//     if (prod === "ALL" || prod === "BL") {
//       queries.push(`
//         SELECT DATE_FORMAT(r.payment_date, '%Y-%m-%d') AS month,
//                'BL Loan' AS product,
//                0 AS total_due,
//                SUM(r.transfer_amount) AS total_collected
//         FROM repayments_upload r
//         JOIN loan_bookings b ON b.lan = r.lan
//         WHERE r.payment_date IS NOT NULL
//           AND r.payment_date < CURDATE()
//           ${buildDateRangeClause("r.payment_date", start, end).clause}
//         GROUP BY DATE_FORMAT(r.payment_date, '%Y-%m-%d')
//       `);
//       params.push(...buildDateRangeClause("r.payment_date", start, end).params);
//     }

//     // COLLECTED: EV
//     if (prod === "ALL" || prod === "EV") {
//       queries.push(`
//         SELECT DATE_FORMAT(r.payment_date, '%Y-%m-%d') AS month,
//                'EV Loan' AS product,
//                0 AS total_due,
//                SUM(r.transfer_amount) AS total_collected
//         FROM repayments_upload r
//         JOIN loan_booking_ev e ON e.lan = r.lan
//         WHERE r.payment_date IS NOT NULL
//           AND r.payment_date < CURDATE()
//           ${buildDateRangeClause("r.payment_date", start, end).clause}
//         GROUP BY DATE_FORMAT(r.payment_date, '%Y-%m-%d')
//       `);
//       params.push(...buildDateRangeClause("r.payment_date", start, end).params);
//     }

//     // COLLECTED: Adikosh
//     if (prod === "ALL" || prod === "Adikosh") {
//       queries.push(`
//         SELECT DATE_FORMAT(payment_date, '%Y-%m-%d') AS month,
//                'Adikosh' AS product,
//                0 AS total_due,
//                SUM(transfer_amount) AS total_collected
//         FROM repayments_upload_adikosh
//         WHERE payment_date IS NOT NULL
//           AND payment_date < CURDATE() ${payR.clause}
//         GROUP BY DATE_FORMAT(payment_date, '%Y-%m-%d')
//       `);
//       params.push(...payR.params);
//     }

//     // COLLECTED: GQ Non-FSF
//     if (prod === "ALL" || prod === "GQ Non-FSF") {
//       queries.push(`
//         SELECT DATE_FORMAT(payment_date, '%Y-%m-%d') AS month,
//                'GQ Non-FSF' AS product,
//                0 AS total_due,
//                SUM(transfer_amount) AS total_collected
//         FROM repayments_upload
//         WHERE payment_date IS NOT NULL
//           AND payment_date < CURDATE()
//           AND lan IN (SELECT lan FROM loan_booking_gq_non_fsf)
//           ${payR.clause}
//         GROUP BY DATE_FORMAT(payment_date, '%Y-%m-%d')
//       `);
//       params.push(...payR.params);
//     }

//     // COLLECTED: GQ FSF
//     if (prod === "ALL" || prod === "GQ FSF") {
//       queries.push(`
//         SELECT DATE_FORMAT(payment_date, '%Y-%m-%d') AS month,
//                'GQ FSF' AS product,
//                0 AS total_due,
//                SUM(transfer_amount) AS total_collected
//         FROM repayments_upload
//         WHERE payment_date IS NOT NULL
//           AND payment_date < CURDATE()
//           AND lan IN (SELECT lan FROM loan_booking_gq_non_fsf)
//           ${payR.clause}
//         GROUP BY DATE_FORMAT(payment_date, '%Y-%m-%d')
//       `);
//       params.push(...payR.params);
//     }

//     const sql = queries.join(" UNION ALL ") + " ORDER BY month, product";
//     const [rows] = await db.promise().query(sql, params);
//     res.json(rows);
//   } catch (err) {
//     console.error("❌ Collection vs Due Error:", err);
//     res.status(500).json({ error: "Collection vs Due fetch failed" });
//   }
// });

// /** Product Distribution */
// router.post("/product-distribution", async (req, res) => {
//   const { from, to } = req.body || {};
//   try {
//     const { start, end } = dayRange(from, to);

//     const wcBL = buildDateRangeClause("agreement_date", start, end);
//     const wcEV = buildDateRangeClause("agreement_date", start, end);
//     const wcAK = buildDateRangeClause("agreement_date", start, end);
//     const wcGQ = buildDateRangeClause("agreement_date", start, end);

//     const sql = `
//       SELECT 'BL Loan' AS product, COUNT(*) AS value
//       FROM loan_bookings
//       WHERE 1=1 ${wcBL.clause}

//       UNION ALL

//       SELECT 'EV Loan' AS product, COUNT(*) AS value
//       FROM loan_booking_ev
//       WHERE 1=1 ${wcEV.clause}

//       UNION ALL

//       SELECT 'Adikosh' AS product, COUNT(*) AS value
//       FROM loan_booking_adikosh
//       WHERE 1=1 ${wcAK.clause}

//       UNION ALL

//       SELECT 'GQ Non-FSF' AS product, COUNT(*) AS value
//       FROM loan_booking_gq_non_fsf
//       WHERE 1=1 ${wcGQ.clause}

//       UNION ALL

//       SELECT 'GQ FSF' AS product, COUNT(*) AS value
//       FROM loan_booking_gq_fsf
//       WHERE 1=1 ${wcGQ.clause}
//     `;

//     const params = [...wcBL.params, ...wcEV.params, ...wcAK.params, ...wcGQ.params];
//     const [rows] = await db.promise().query(sql, params);

//     // Collapse to { product, value }
//     const productMap = {};
//     rows.forEach(({ product, value }) => {
//       productMap[product] = (productMap[product] || 0) + Number(value || 0);
//     });

//     res.json(
//       Object.entries(productMap).map(([product, value]) => ({ product, value }))
//     );
//   } catch (err) {
//     console.error("❌ Product Distribution Error:", err);
//     res.status(500).json({ error: "Internal Server Error" });
//   }
// });

// /** Metric Cards */
// router.post("/metric-cards", async (req, res) => {
//   try {
//     const { product, from, to } = req.body || {};
//     const prod = normalizeProduct(product);
//     const { start, end } = dayRange(from, to);

//     const disburseQueries = [];
//     const disburseParams = [];
//     const collectQueries = [];
//     const collectParams = [];
//     const pniQueries = [];  // for principal & interest collected
//     const pniParams = [];

//     const dclBL = buildDateRangeClause("agreement_date", start, end);
//     const dclEV = buildDateRangeClause("agreement_date", start, end);
//     const pclR = buildDateRangeClause("r.payment_date", start, end);
//     const pclA = buildDateRangeClause("payment_date", start, end);

//     /** ---------------- DISBURSED ---------------- */
//     if (prod === "ALL" || prod === "BL") {
//       disburseQueries.push(`
//         SELECT IFNULL(SUM(loan_amount), 0) AS amount
//         FROM loan_bookings
//         WHERE 1=1 ${dclBL.clause}
//       `);
//       disburseParams.push(...dclBL.params);
//     }
//     if (prod === "ALL" || prod === "EV") {
//       disburseQueries.push(`
//         SELECT IFNULL(SUM(loan_amount), 0) AS amount
//         FROM loan_booking_ev
//         WHERE 1=1 ${dclEV.clause}
//       `);
//       disburseParams.push(...dclEV.params);
//     }
//     if (prod === "ALL" || prod === "Adikosh") {
//       disburseQueries.push(`
//         SELECT IFNULL(SUM(loan_amount), 0) AS amount
//         FROM loan_booking_adikosh
//         WHERE 1=1 ${buildDateRangeClause("agreement_date", start, end).clause}
//       `);
//       disburseParams.push(...buildDateRangeClause("agreement_date", start, end).params);
//     }
//     if (prod === "ALL" || prod === "GQ Non-FSF") {
//       disburseQueries.push(`
//         SELECT IFNULL(SUM(loan_amount), 0) AS amount
//         FROM loan_booking_gq_non_fsf
//         WHERE 1=1 ${buildDateRangeClause("agreement_date", start, end).clause}
//       `);
//       disburseParams.push(...buildDateRangeClause("agreement_date", start, end).params);
//     }
//     if (prod === "ALL" || prod === "GQ FSF") {
//       disburseQueries.push(`
//         SELECT IFNULL(SUM(loan_amount), 0) AS amount
//         FROM loan_booking_gq_fsf
//         WHERE 1=1 ${buildDateRangeClause("agreement_date", start, end).clause}
//       `);
//       disburseParams.push(...buildDateRangeClause("agreement_date", start, end).params);
//     }

//     /** ---------------- COLLECTED ---------------- */
//     if (prod === "ALL" || prod === "BL") {
//       collectQueries.push(`
//         SELECT IFNULL(SUM(r.transfer_amount), 0) AS amount
//         FROM repayments_upload r
//         JOIN loan_bookings b ON b.lan = r.lan
//         WHERE r.payment_date IS NOT NULL
//           ${pclR.clause}
//       `);
//       collectParams.push(...pclR.params);
//     }
//     if (prod === "ALL" || prod === "EV") {
//       collectQueries.push(`
//         SELECT IFNULL(SUM(r.transfer_amount), 0) AS amount
//         FROM repayments_upload r
//         JOIN loan_booking_ev e ON e.lan = r.lan
//         WHERE r.payment_date IS NOT NULL
//           ${pclR.clause}
//       `);
//       collectParams.push(...pclR.params);
//     }
//     if (prod === "ALL" || prod === "Adikosh") {
//       collectQueries.push(`
//         SELECT IFNULL(SUM(transfer_amount), 0) AS amount
//         FROM repayments_upload_adikosh
//         WHERE payment_date IS NOT NULL ${pclA.clause}
//       `);
//       collectParams.push(...pclA.params);
//     }
//     if (prod === "ALL" || prod === "GQ Non-FSF") {
//       collectQueries.push(`
//         SELECT IFNULL(SUM(transfer_amount), 0) AS amount
//         FROM repayments_upload
//         WHERE payment_date IS NOT NULL
//           AND lan IN (SELECT lan FROM loan_booking_gq_non_fsf)
//           ${pclA.clause}
//       `);
//       collectParams.push(...pclA.params);
//     }
//     if (prod === "ALL" || prod === "GQ FSF") {
//       collectQueries.push(`
//         SELECT IFNULL(SUM(transfer_amount), 0) AS amount
//         FROM repayments_upload
//         WHERE payment_date IS NOT NULL
//           AND lan IN (SELECT lan FROM loan_booking_gq_fsf)
//           ${pclA.clause}
//       `);
//       collectParams.push(...pclA.params);
//     }
//     /** ---------------- P&I (collected) ---------------- */
//     if (prod === "ALL" || prod === "BL") {
//       pniQueries.push(`
//         SELECT IFNULL(SUM(principal),0) AS principal,
//                IFNULL(SUM(interest),0)  AS interest
//         FROM manual_rps_bl_loan /* <-- BL RPS TABLE NAME */
//         WHERE payment_date IS NOT NULL
//           ${buildDateRangeClause("payment_date", start, end).clause}
//       `);
//       pniParams.push(...buildDateRangeClause("payment_date", start, end).params);
//     }
//     if (prod === "ALL" || prod === "EV") {
//       pniQueries.push(`
//         SELECT IFNULL(SUM(principal),0) AS principal,
//                IFNULL(SUM(interest),0)  AS interest
//         FROM manual_rps_ev_loan
//         WHERE payment_date IS NOT NULL
//           ${buildDateRangeClause("payment_date", start, end).clause}
//       `);
//       pniParams.push(...buildDateRangeClause("payment_date", start, end).params);
//     }
//     if (prod === "ALL" || prod === "Adikosh") {
//       pniQueries.push(`
//         SELECT IFNULL(SUM(principal),0) AS principal,
//                IFNULL(SUM(interest),0)  AS interest
//         FROM manual_rps_adikosh
//         WHERE payment_date IS NOT NULL ${pclA.clause}
//       `);
//       pniParams.push(...pclA.params);
//     }
//     if (prod === "ALL" || prod === "GQ Non-FSF") {
//       pniQueries.push(`
//         SELECT IFNULL(SUM(principal),0) AS principal,
//                IFNULL(SUM(interest),0)  AS interest
//         FROM manual_rps_gq_non_fsf
//         WHERE payment_date IS NOT NULL ${pclA.clause}
//       `);
//       pniParams.push(...pclA.params);
//     }
//     if (prod === "ALL" || prod === "GQ FSF") {
//       pniQueries.push(`
//         SELECT IFNULL(SUM(principal),0) AS principal,
//                IFNULL(SUM(interest),0)  AS interest
//         FROM manual_rps_gq_fsf
//         WHERE payment_date IS NOT NULL ${pclA.clause}
//       `);
//       pniParams.push(...pclA.params);
//     }

//     /** ---------------- POS (Outstanding) ---------------- */
//     const jsToday = new Date().toISOString().slice(0, 10);
//     const cutoff = end || jsToday;

//     const posQueries = [];
//     const posParams = [];

//     // BL POS (join to bookings to apply book-range)
//     if (prod === "ALL" || prod === "BL") {
//       const bookRange = buildDateRangeClause("b.agreement_date", start, end);
//       posQueries.push(`
//         SELECT
//           IFNULL(SUM(
//             CASE
//               WHEN rps.payment_date IS NULL THEN rps.principal
//               WHEN rps.payment_date >= ?     THEN rps.principal
//               ELSE 0
//             END
//           ), 0) AS principal_outstanding,
//           IFNULL(SUM(
//             CASE
//               WHEN rps.payment_date IS NULL THEN rps.interest
//               WHEN rps.payment_date >= ?     THEN rps.interest
//               ELSE 0
//             END
//           ), 0) AS interest_outstanding
//         FROM manual_rps_bl_loan rps /* <-- BL RPS TABLE NAME */
//         JOIN loan_bookings b ON b.lan = rps.lan
//         WHERE 1=1 ${bookRange.clause}
//       `);
//       posParams.push(cutoff, cutoff, ...bookRange.params);
//     }

//     // EV POS
//     if (prod === "ALL" || prod === "EV") {
//       const bookRange = buildDateRangeClause("e.agreement_date", start, end);
//       posQueries.push(`
//         SELECT
//           IFNULL(SUM(
//             CASE
//               WHEN rps.payment_date IS NULL THEN rps.principal
//               WHEN rps.payment_date >= ?     THEN rps.principal
//               ELSE 0
//             END
//           ), 0) AS principal_outstanding,
//           IFNULL(SUM(
//             CASE
//               WHEN rps.payment_date IS NULL THEN rps.interest
//               WHEN rps.payment_date >= ?     THEN rps.interest
//               ELSE 0
//             END
//           ), 0) AS interest_outstanding
//         FROM manual_rps_ev_loan rps
//         JOIN loan_booking_ev e ON e.lan = rps.lan
//         WHERE 1=1 ${bookRange.clause}
//       `);
//       posParams.push(cutoff, cutoff, ...bookRange.params);
//     }

//     // Adikosh POS
//     if (prod === "ALL" || prod === "Adikosh") {
//       const bookRange = buildDateRangeClause("b.agreement_date", start, end);
//       posQueries.push(`
//         SELECT
//           IFNULL(SUM(
//             CASE
//               WHEN rps.payment_date IS NULL THEN rps.principal
//               WHEN rps.payment_date >= ?     THEN rps.principal
//               ELSE 0
//             END
//           ), 0) AS principal_outstanding,
//           IFNULL(SUM(
//             CASE
//               WHEN rps.payment_date IS NULL THEN rps.interest
//               WHEN rps.payment_date >= ?     THEN rps.interest
//               ELSE 0
//             END
//           ), 0) AS interest_outstanding
//         FROM manual_rps_adikosh rps
//         JOIN loan_booking_adikosh b ON b.lan = rps.lan
//         WHERE 1=1 ${bookRange.clause}
//       `);
//       posParams.push(cutoff, cutoff, ...bookRange.params);
//     }

//     // GQ Non-FSF POS
//     if (prod === "ALL" || prod === "GQ Non-FSF") {
//       const bookRange = buildDateRangeClause("b.agreement_date", start, end);
//       posQueries.push(`
//         SELECT
//           IFNULL(SUM(
//             CASE
//               WHEN rps.payment_date IS NULL THEN rps.principal
//               WHEN rps.payment_date >= ?     THEN rps.principal
//               ELSE 0
//             END
//           ), 0) AS principal_outstanding,
//           IFNULL(SUM(
//             CASE
//               WHEN rps.payment_date IS NULL THEN rps.interest
//               WHEN rps.payment_date >= ?     THEN rps.interest
//               ELSE 0
//             END
//           ), 0) AS interest_outstanding
//         FROM manual_rps_gq_non_fsf rps
//         JOIN loan_booking_gq_non_fsf b ON b.lan = rps.lan
//         WHERE 1=1 ${bookRange.clause}
//       `);
//       posParams.push(cutoff, cutoff, ...bookRange.params);
//     }
//     // GQ FSF POS
//     if (prod === "ALL" || prod === "GQ FSF") {
//       const bookRange = buildDateRangeClause("b.agreement_date", start, end);
//       posQueries.push(`
//         SELECT
//           IFNULL(SUM(
//             CASE
//               WHEN rps.payment_date IS NULL THEN rps.principal
//               WHEN rps.payment_date >= ?     THEN rps.principal
//               ELSE 0
//             END
//           ), 0) AS principal_outstanding,
//           IFNULL(SUM(
//             CASE
//               WHEN rps.payment_date IS NULL THEN rps.interest
//               WHEN rps.payment_date >= ?     THEN rps.interest
//               ELSE 0
//             END
//           ), 0) AS interest_outstanding
//         FROM manual_rps_gq_fsf rps
//         JOIN loan_booking_gq_fsf b ON b.lan = rps.lan
//         WHERE 1=1 ${bookRange.clause}
//       `);
//       posParams.push(cutoff, cutoff, ...bookRange.params);
//     }

//     /** ---------------- Run all queries ---------------- */
//     const [[disbRows], [collRows], [posRows], [pniRows]] = await Promise.all([
//       db.promise().query(disburseQueries.join(" UNION ALL "), disburseParams),
//       db.promise().query(collectQueries.join(" UNION ALL "), collectParams),
//       db.promise().query(posQueries.join(" UNION ALL "), posParams),
//       db.promise().query(pniQueries.join(" UNION ALL "), pniParams),
//     ]);

//     const totalDisbursed = disbRows.reduce((s, r) => s + Number(r.amount || 0), 0);
//     const totalCollected = collRows.reduce((s, r) => s + Number(r.amount || 0), 0);

//     const totalPrincipal = pniRows.reduce((s, r) => s + Number(r.principal || 0), 0);
//     const totalInterest  = pniRows.reduce((s, r) => s + Number(r.interest  || 0), 0);

//     const collectionRate = totalDisbursed ? (totalCollected / totalDisbursed) * 100 : 0;

//     let principalOutstanding = posRows.reduce((s, r) => s + Number(r.principal_outstanding || 0), 0);
//     let interestOutstanding  = posRows.reduce((s, r) => s + Number(r.interest_outstanding  || 0), 0);

//     if (principalOutstanding < 0) principalOutstanding = 0;
//     if (interestOutstanding < 0) interestOutstanding = 0;

//     res.json({
//       totalDisbursed,
//       totalCollected,
//       collectionRate,
//       totalPrincipal,
//       totalInterest,
//       principalOutstanding,
//       interestOutstanding,
//       posOutstanding: principalOutstanding + interestOutstanding
//     });
//   } catch (err) {
//     console.error("❌ Metric Card Fetch Error:", err);
//     res.status(500).json({ error: "Failed to fetch metrics" });
//   }
// });

// /** -------------------- DPD Buckets (summary) -------------------- */
// /** body: { product }  -> uses normalizeProduct(product) */
// router.post("/dpd-buckets", async (req, res) => {
//   try {
//     const { product } = req.body || {};
//     const prod = normalizeProduct(product);

//     const unions = [];
//     const params = [];
//     const OUTSTANDING = `rps.status <> 'Paid' AND rps.due_date < CURDATE()`;

//     // BL (manual_rps_bl_loan)
//     if (prod === "ALL" || prod === "BL") {
//       unions.push(`
//         SELECT
//           CASE
//             WHEN t.max_dpd BETWEEN 1 AND 30 THEN '0-30'
//             WHEN t.max_dpd BETWEEN 31 AND 60 THEN '30-60'
//             WHEN t.max_dpd BETWEEN 61 AND 90 THEN '60-90'
//           END AS bucket,
//           COUNT(*) AS loans,
//           SUM(t.overdue_emi) AS overdue_emi
//         FROM (
//           SELECT rps.lan,
//                  MAX(CASE WHEN ${OUTSTANDING} THEN IFNULL(rps.dpd, DATEDIFF(CURDATE(), rps.due_date)) ELSE 0 END) AS max_dpd,
//                  SUM(CASE WHEN ${OUTSTANDING} THEN IFNULL(rps.emi,0) ELSE 0 END) AS overdue_emi
//           FROM manual_rps_bl_loan rps /* <-- BL RPS TABLE NAME */
//           JOIN loan_bookings b ON b.lan = rps.lan
//           GROUP BY rps.lan
//         ) t
//         WHERE t.max_dpd BETWEEN 1 AND 90
//         GROUP BY bucket
//       `);
//     }

//     // EV (manual_rps_ev_loan)
//     if (prod === "ALL" || prod === "EV") {
//       unions.push(`
//         SELECT
//           CASE
//             WHEN t.max_dpd BETWEEN 1 AND 30 THEN '0-30'
//             WHEN t.max_dpd BETWEEN 31 AND 60 THEN '30-60'
//             WHEN t.max_dpd BETWEEN 61 AND 90 THEN '60-90'
//           END AS bucket,
//           COUNT(*) AS loans,
//           SUM(t.overdue_emi) AS overdue_emi
//         FROM (
//           SELECT rps.lan,
//                  MAX(CASE WHEN ${OUTSTANDING} THEN IFNULL(rps.dpd, DATEDIFF(CURDATE(), rps.due_date)) ELSE 0 END) AS max_dpd,
//                  SUM(CASE WHEN ${OUTSTANDING} THEN IFNULL(rps.emi,0) ELSE 0 END) AS overdue_emi
//           FROM manual_rps_ev_loan rps
//           JOIN loan_booking_ev e ON e.lan = rps.lan
//           GROUP BY rps.lan
//         ) t
//         WHERE t.max_dpd BETWEEN 1 AND 90
//         GROUP BY bucket
//       `);
//     }

//     // Adikosh
//     if (prod === "ALL" || prod === "Adikosh") {
//       unions.push(`
//         SELECT
//           CASE
//             WHEN t.max_dpd BETWEEN 1 AND 30 THEN '0-30'
//             WHEN t.max_dpd BETWEEN 31 AND 60 THEN '30-60'
//             WHEN t.max_dpd BETWEEN 61 AND 90 THEN '60-90'
//           END AS bucket,
//           COUNT(*) AS loans,
//           SUM(t.overdue_emi) AS overdue_emi
//         FROM (
//           SELECT rps.lan,
//                  MAX(CASE WHEN ${OUTSTANDING} THEN IFNULL(rps.dpd, DATEDIFF(CURDATE(), rps.due_date)) ELSE 0 END) AS max_dpd,
//                  SUM(CASE WHEN ${OUTSTANDING} THEN IFNULL(rps.emi,0) ELSE 0 END) AS overdue_emi
//           FROM manual_rps_adikosh rps
//           JOIN loan_booking_adikosh b ON b.lan = rps.lan
//           GROUP BY rps.lan
//         ) t
//         WHERE t.max_dpd BETWEEN 1 AND 90
//         GROUP BY bucket
//       `);
//     }

//     // GQ Non-FSF
//     if (prod === "ALL" || prod === "GQ Non-FSF") {
//       unions.push(`
//         SELECT
//           CASE
//             WHEN t.max_dpd BETWEEN 1 AND 30 THEN '0-30'
//             WHEN t.max_dpd BETWEEN 31 AND 60 THEN '30-60'
//             WHEN t.max_dpd BETWEEN 61 AND 90 THEN '60-90'
//           END AS bucket,
//           COUNT(*) AS loans,
//           SUM(t.overdue_emi) AS overdue_emi
//         FROM (
//           SELECT rps.lan,
//                  MAX(CASE WHEN ${OUTSTANDING} THEN IFNULL(rps.dpd, DATEDIFF(CURDATE(), rps.due_date)) ELSE 0 END) AS max_dpd,
//                  SUM(CASE WHEN ${OUTSTANDING} THEN IFNULL(rps.emi,0) ELSE 0 END) AS overdue_emi
//           FROM manual_rps_gq_non_fsf rps
//           JOIN loan_booking_gq_non_fsf b ON b.lan = rps.lan
//           GROUP BY rps.lan
//         ) t
//         WHERE t.max_dpd BETWEEN 1 AND 90
//         GROUP BY bucket
//       `);
//     }

//     // GQ FSF
//     if (prod === "ALL" || prod === "GQ FSF") {
//       unions.push(`
//         SELECT
//           CASE
//             WHEN t.max_dpd BETWEEN 1 AND 30 THEN '0-30'
//             WHEN t.max_dpd BETWEEN 31 AND 60 THEN '30-60'
//             WHEN t.max_dpd BETWEEN 61 AND 90 THEN '60-90'
//           END AS bucket,
//           COUNT(*) AS loans,
//           SUM(t.overdue_emi) AS overdue_emi
//         FROM (
//           SELECT rps.lan,
//                  MAX(CASE WHEN ${OUTSTANDING} THEN IFNULL(rps.dpd, DATEDIFF(CURDATE(), rps.due_date)) ELSE 0 END) AS max_dpd,
//                  SUM(CASE WHEN ${OUTSTANDING} THEN IFNULL(rps.emi,0) ELSE 0 END) AS overdue_emi
//           FROM manual_rps_gq_fsf rps
//           JOIN loan_booking_gq_fsf b ON b.lan = rps.lan
//           GROUP BY rps.lan
//         ) t
//         WHERE t.max_dpd BETWEEN 1 AND 90
//         GROUP BY bucket
//       `);
//     }

//     if (!unions.length)
//       return res.json({ buckets: [], asOf: new Date().toISOString().slice(0, 10) });

//     const sql = `
//       SELECT bucket, SUM(loans) AS loans, SUM(overdue_emi) AS overdue_emi
//       FROM (
//         ${unions.join(" UNION ALL ")}
//       ) x
//       GROUP BY bucket
//       ORDER BY FIELD(bucket, '0-30','30-60','60-90')
//     `;
//     const [rows] = await db.promise().query(sql, params);

//     // Normalize to always return 3 buckets
//     const map = {
//       "0-30": { bucket: "0-30", loans: 0, overdue_emi: 0 },
//       "30-60": { bucket: "30-60", loans: 0, overdue_emi: 0 },
//       "60-90": { bucket: "60-90", loans: 0, overdue_emi: 0 },
//     };
//     rows.forEach((r) => (map[r.bucket] = r));
//     res.json({ buckets: Object.values(map), asOf: new Date().toISOString().slice(0, 10) });
//   } catch (err) {
//     console.error("❌ DPD Buckets Error:", err);
//     res.status(500).json({ error: "Failed to fetch DPD buckets" });
//   }
// });

// /** -------------------- DPD Loan List (by bucket) -------------------- */
// /** body: { product, bucket }  // bucket: '0-30' | '30-60' | '60-90' */
// router.post("/dpd-list", async (req, res) => {
//   try {
//     const { product, bucket } = req.body || {};
//     const prod = normalizeProduct(product);

//     const ranges = {
//       "0-30": [1, 30],
//       "30-60": [31, 60],
//       "60-90": [61, 90],
//     };
//     const range = ranges[bucket];
//     if (!range) return res.status(400).json({ error: "Invalid bucket" });
//     const [minDPD, maxDPD] = range;

//     const unions = [];
//     const params = [];
//     const OUTSTANDING = `rps.status <> 'Paid' AND rps.due_date < CURDATE()`;

//     // BL
//     if (prod === "ALL" || prod === "BL") {
//       unions.push(`
//         SELECT 'BL Loan' AS product, t.*
//         FROM (
//           SELECT rps.lan,
//                  MAX(CASE WHEN ${OUTSTANDING} THEN IFNULL(rps.dpd, DATEDIFF(CURDATE(), rps.due_date)) ELSE 0 END) AS max_dpd,
//                  SUM(CASE WHEN ${OUTSTANDING} THEN IFNULL(rps.emi,0) ELSE 0 END) AS overdue_emi,
//                  SUM(CASE WHEN ${OUTSTANDING} THEN IFNULL(rps.principal,0) ELSE 0 END) AS overdue_principal,
//                  SUM(CASE WHEN ${OUTSTANDING} THEN IFNULL(rps.interest,0) ELSE 0 END) AS overdue_interest,
//                  MAX(CASE WHEN ${OUTSTANDING} THEN rps.due_date ELSE NULL END) AS last_due_date
//           FROM manual_rps_bl_loan rps /* <-- BL RPS TABLE NAME */
//           JOIN loan_bookings b ON b.lan = rps.lan
//           GROUP BY rps.lan
//           HAVING max_dpd BETWEEN ? AND ?
//         ) t
//       `);
//       params.push(minDPD, maxDPD);
//     }

//     // EV
//     if (prod === "ALL" || prod === "EV") {
//       unions.push(`
//         SELECT 'EV Loan' AS product, t.*
//         FROM (
//           SELECT rps.lan,
//                  MAX(CASE WHEN ${OUTSTANDING} THEN IFNULL(rps.dpd, DATEDIFF(CURDATE(), rps.due_date)) ELSE 0 END) AS max_dpd,
//                  SUM(CASE WHEN ${OUTSTANDING} THEN IFNULL(rps.emi,0) ELSE 0 END) AS overdue_emi,
//                  SUM(CASE WHEN ${OUTSTANDING} THEN IFNULL(rps.principal,0) ELSE 0 END) AS overdue_principal,
//                  SUM(CASE WHEN ${OUTSTANDING} THEN IFNULL(rps.interest,0) ELSE 0 END) AS overdue_interest,
//                  MAX(CASE WHEN ${OUTSTANDING} THEN rps.due_date ELSE NULL END) AS last_due_date
//           FROM manual_rps_ev_loan rps
//           JOIN loan_booking_ev e ON e.lan = rps.lan
//           GROUP BY rps.lan
//           HAVING max_dpd BETWEEN ? AND ?
//         ) t
//       `);
//       params.push(minDPD, maxDPD);
//     }

//     // Adikosh
//     if (prod === "ALL" || prod === "Adikosh") {
//       unions.push(`
//         SELECT 'Adikosh' AS product, t.*
//         FROM (
//           SELECT rps.lan,
//                  MAX(CASE WHEN ${OUTSTANDING} THEN IFNULL(rps.dpd, DATEDIFF(CURDATE(), rps.due_date)) ELSE 0 END) AS max_dpd,
//                  SUM(CASE WHEN ${OUTSTANDING} THEN IFNULL(rps.emi,0) ELSE 0 END) AS overdue_emi,
//                  SUM(CASE WHEN ${OUTSTANDING} THEN IFNULL(rps.principal,0) ELSE 0 END) AS overdue_principal,
//                  SUM(CASE WHEN ${OUTSTANDING} THEN IFNULL(rps.interest,0) ELSE 0 END) AS overdue_interest,
//                  MAX(CASE WHEN ${OUTSTANDING} THEN rps.due_date ELSE NULL END) AS last_due_date
//           FROM manual_rps_adikosh rps
//           JOIN loan_booking_adikosh b ON b.lan = rps.lan
//           GROUP BY rps.lan
//           HAVING max_dpd BETWEEN ? AND ?
//         ) t
//       `);
//       params.push(minDPD, maxDPD);
//     }

//     // GQ Non-FSF
//     if (prod === "ALL" || prod === "GQ Non-FSF") {
//       unions.push(`
//         SELECT 'GQ Non-FSF' AS product, t.*
//         FROM (
//           SELECT rps.lan,
//                  MAX(CASE WHEN ${OUTSTANDING} THEN IFNULL(rps.dpd, DATEDIFF(CURDATE(), rps.due_date)) ELSE 0 END) AS max_dpd,
//                  SUM(CASE WHEN ${OUTSTANDING} THEN IFNULL(rps.emi,0) ELSE 0 END) AS overdue_emi,
//                  SUM(CASE WHEN ${OUTSTANDING} THEN IFNULL(rps.principal,0) ELSE 0 END) AS overdue_principal,
//                  SUM(CASE WHEN ${OUTSTANDING} THEN IFNULL(rps.interest,0) ELSE 0 END) AS overdue_interest,
//                  MAX(CASE WHEN ${OUTSTANDING} THEN rps.due_date ELSE NULL END) AS last_due_date
//           FROM manual_rps_gq_non_fsf rps
//           JOIN loan_booking_gq_non_fsf b ON b.lan = rps.lan
//           GROUP BY rps.lan
//           HAVING max_dpd BETWEEN ? AND ?
//         ) t
//       `);
//       params.push(minDPD, maxDPD);
//     }

//      // GQ FSF
//     if (prod === "ALL" || prod === "GQ FSF") {
//       unions.push(`
//         SELECT 'GQ FSF' AS product, t.*
//         FROM (
//           SELECT rps.lan,
//                  MAX(CASE WHEN ${OUTSTANDING} THEN IFNULL(rps.dpd, DATEDIFF(CURDATE(), rps.due_date)) ELSE 0 END) AS max_dpd,
//                  SUM(CASE WHEN ${OUTSTANDING} THEN IFNULL(rps.emi,0) ELSE 0 END) AS overdue_emi,
//                  SUM(CASE WHEN ${OUTSTANDING} THEN IFNULL(rps.principal,0) ELSE 0 END) AS overdue_principal,
//                  SUM(CASE WHEN ${OUTSTANDING} THEN IFNULL(rps.interest,0) ELSE 0 END) AS overdue_interest,
//                  MAX(CASE WHEN ${OUTSTANDING} THEN rps.due_date ELSE NULL END) AS last_due_date
//           FROM manual_rps_gq_fsf rps
//           JOIN loan_booking_gq_fsf b ON b.lan = rps.lan
//           GROUP BY rps.lan
//           HAVING max_dpd BETWEEN ? AND ?
//         ) t
//       `);
//       params.push(minDPD, maxDPD);
//     }

//     if (!unions.length) return res.json([]);

//     const sql = `
//       ${unions.join(" UNION ALL ")}
//       ORDER BY max_dpd DESC, last_due_date DESC
//     `;
//     const [rows] = await db.promise().query(sql, params);
//     res.json(rows);
//   } catch (err) {
//     console.error("❌ DPD List Error:", err);
//     res.status(500).json({ error: "Failed to fetch DPD list" });
//   }
// });

// module.exports = router;

// const express = require("express");
// const db = require("../config/db");
// const router = express.Router();
// const nodemailer = require("nodemailer");
// const XLSX = require("xlsx");

// /* -------------------- Settings -------------------- */

// // Use a single collation for all string equality/IN checks on text keys like `lan`.
// const JOIN_COLLATE = "utf8mb4_unicode_ci";

// const POS_PRINCIPAL_EXPR = `
//   IFNULL(SUM(
//     CASE
//       WHEN rps.payment_date IS NULL OR rps.payment_date >= ? THEN
//         CASE
//           WHEN rps.remaining_principal IS NOT NULL AND rps.remaining_principal <> 0
//             THEN rps.remaining_principal
//           ELSE rps.principal
//         END
//       ELSE 0
//     END
//   ), 0)
// `;

// /* -------------------- Helpers -------------------- */

// // Accepts 'YYYY-MM-DD' and returns { start, end }
// function dayRange(from, to) {
//   const start = from && from.trim() ? from.trim() : null;
//   // Add 1 day to "to" since end is exclusive
//   let end = null;
//   if (to && to.trim()) {
//     const dt = new Date(to.trim());
//     dt.setDate(dt.getDate() + 1);
//     end = dt.toISOString().slice(0, 10); // back to YYYY-MM-DD
//   }
//   return { start, end };
// }

// // Builds "AND field >= ? AND field < ?" with params, using start/end if present
// function buildDateRangeClause(field, start, end) {
//   const parts = [];
//   const params = [];
//   if (start) {
//     parts.push(`${field} >= ?`);
//     params.push(start);
//   }
//   if (end) {
//     parts.push(`${field} < ?`);
//     params.push(end);
//   }
//   return { clause: parts.length ? ` AND ${parts.join(" AND ")}` : "", params };
// }

// // Normalize product values coming from UI
// function normalizeProduct(p) {
//   if (!p || p === "ALL") return "ALL";
//   const s = String(p).toLowerCase().replace(/\s+/g, "").replace(/-/g, "");
//   if (s === "evloan" || s === "ev_loan") return "EV";
//   if (s === "blloan" || s === "bl_loan") return "BL";
//   if (s === "adikosh") return "Adikosh";
//   if (s === "gqnonfsf" || s === "gqnon-fsf") return "GQ Non-FSF";
//   if (s === "gqfsf" || s === "gq-fsf") return "GQ FSF";
//   return p;
// }

// /* -------------------- Routes -------------------- */

// /** Disbursal Trend */
// router.post("/disbursal-trend", async (req, res) => {
//   try {
//     const { product, from, to } = req.body || {};
//     const prod = normalizeProduct(product);
//     const { start, end } = dayRange(from, to);

//     const queries = [];
//     const params = [];

//     // BL disbursals (loan_bookings)
//     if (prod === "ALL" || prod === "BL") {
//       const dr = buildDateRangeClause("agreement_date", start, end);
//       queries.push(`
//         SELECT DATE_FORMAT(agreement_date, '%Y-%m-%d') AS month,
//                'BL Loan' AS product,
//                SUM(loan_amount) AS total_disbursed
//         FROM loan_bookings
//         WHERE 1=1 ${dr.clause}
//         GROUP BY DATE_FORMAT(agreement_date, '%Y-%m-%d')
//       `);
//       params.push(...dr.params);
//     }

//     // EV disbursals (loan_booking_ev)
//     if (prod === "ALL" || prod === "EV") {
//       const dr = buildDateRangeClause("agreement_date", start, end);
//       queries.push(`
//         SELECT DATE_FORMAT(agreement_date, '%Y-%m-%d') AS month,
//                'EV Loan' AS product,
//                SUM(loan_amount) AS total_disbursed
//         FROM loan_booking_ev
//         WHERE 1=1 ${dr.clause}
//         GROUP BY DATE_FORMAT(agreement_date, '%Y-%m-%d')
//       `);
//       params.push(...dr.params);
//     }

//     // Adikosh
//     if (prod === "ALL" || prod === "Adikosh") {
//       const dr = buildDateRangeClause("agreement_date", start, end);
//       queries.push(`
//         SELECT DATE_FORMAT(agreement_date, '%Y-%m-%d') AS month,
//                'Adikosh' AS product,
//                SUM(loan_amount) AS total_disbursed
//         FROM loan_booking_adikosh
//         WHERE 1=1 ${dr.clause}
//         GROUP BY DATE_FORMAT(agreement_date, '%Y-%m-%d')
//       `);
//       params.push(...dr.params);
//     }

//     // GQ Non-FSF
//     if (prod === "ALL" || prod === "GQ Non-FSF") {
//       const dr = buildDateRangeClause("agreement_date", start, end);
//       queries.push(`
//         SELECT DATE_FORMAT(agreement_date, '%Y-%m-%d') AS month,
//                'GQ Non-FSF' AS product,
//                SUM(loan_amount) AS total_disbursed
//         FROM loan_booking_gq_non_fsf
//         WHERE 1=1 ${dr.clause}
//         GROUP BY DATE_FORMAT(agreement_date, '%Y-%m-%d')
//       `);
//       params.push(...dr.params);
//     }

//     // GQ FSF
//     if (prod === "ALL" || prod === "GQ FSF") {
//       const dr = buildDateRangeClause("agreement_date", start, end);
//       queries.push(`
//         SELECT DATE_FORMAT(agreement_date, '%Y-%m-%d') AS month,
//                'GQ FSF' AS product,
//                SUM(loan_amount) AS total_disbursed
//         FROM loan_booking_gq_fsf
//         WHERE 1=1 ${dr.clause}
//         GROUP BY DATE_FORMAT(agreement_date, '%Y-%m-%d')
//       `);
//       params.push(...dr.params);
//     }

//     const sql = queries.join(" UNION ALL ") + " ORDER BY month, product";
//     const [rows] = await db.promise().query(sql, params);
//     res.json(rows);
//   } catch (err) {
//     console.error("❌ Disbursal Trend Error:", err);
//     res.status(500).json({ error: "Disbursal trend fetch failed" });
//   }
// });

// /** Repayment Trend */
// router.post("/repayment-trend", async (req, res) => {
//   try {
//     const { product, from, to } = req.body || {};
//     const prod = normalizeProduct(product);
//     const { start, end } = dayRange(from, to);

//     const queries = [];
//     const params = [];

//     const dateR = buildDateRangeClause("r.payment_date", start, end);
//     const dateA = buildDateRangeClause("payment_date", start, end);

//     // BL collections via repayments_upload joined to BL bookings
//     if (prod === "ALL" || prod === "BL") {
//       queries.push(`
//         SELECT DATE_FORMAT(r.payment_date, '%Y-%m-%d') AS month,
//                'BL Loan' AS product,
//                SUM(r.transfer_amount) AS total_collected
//         FROM repayments_upload r
//         JOIN loan_bookings b
//           ON b.lan COLLATE ${JOIN_COLLATE} = r.lan COLLATE ${JOIN_COLLATE}
//         WHERE r.payment_date IS NOT NULL
//           ${dateR.clause}
//         GROUP BY DATE_FORMAT(r.payment_date, '%Y-%m-%d')
//       `);
//       params.push(...dateR.params);
//     }

//     // EV collections via repayments_upload joined to EV bookings
//     if (prod === "ALL" || prod === "EV") {
//       queries.push(`
//         SELECT DATE_FORMAT(r.payment_date, '%Y-%m-%d') AS month,
//                'EV Loan' AS product,
//                SUM(r.transfer_amount) AS total_collected
//         FROM repayments_upload r
//         JOIN loan_booking_ev e
//           ON e.lan COLLATE ${JOIN_COLLATE} = r.lan COLLATE ${JOIN_COLLATE}
//         WHERE r.payment_date IS NOT NULL
//           ${dateR.clause}
//         GROUP BY DATE_FORMAT(r.payment_date, '%Y-%m-%d')
//       `);
//       params.push(...dateR.params);
//     }

//     // Adikosh
//     if (prod === "ALL" || prod === "Adikosh") {
//       queries.push(`
//         SELECT DATE_FORMAT(payment_date, '%Y-%m-%d') AS month,
//                'Adikosh' AS product,
//                SUM(transfer_amount) AS total_collected
//         FROM repayments_upload_adikosh
//         WHERE payment_date IS NOT NULL
//           ${dateA.clause}
//         GROUP BY DATE_FORMAT(payment_date, '%Y-%m-%d')
//       `);
//       params.push(...dateA.params);
//     }

//     // GQ Non-FSF
//     if (prod === "ALL" || prod === "GQ Non-FSF") {
//       queries.push(`
//         SELECT DATE_FORMAT(payment_date, '%Y-%m-%d') AS month,
//                'GQ Non-FSF' AS product,
//                SUM(transfer_amount) AS total_collected
//         FROM repayments_upload
//         WHERE payment_date IS NOT NULL
//           AND lan COLLATE ${JOIN_COLLATE} IN (
//             SELECT lan COLLATE ${JOIN_COLLATE} FROM loan_booking_gq_non_fsf
//           )
//           ${dateA.clause}
//         GROUP BY DATE_FORMAT(payment_date, '%Y-%m-%d')
//       `);
//       params.push(...dateA.params);
//     }

//     // GQ FSF
//     if (prod === "ALL" || prod === "GQ FSF") {
//       queries.push(`
//         SELECT DATE_FORMAT(payment_date, '%Y-%m-%d') AS month,
//                'GQ FSF' AS product,
//                SUM(transfer_amount) AS total_collected
//         FROM repayments_upload
//         WHERE payment_date IS NOT NULL
//           AND lan COLLATE ${JOIN_COLLATE} IN (
//             SELECT lan COLLATE ${JOIN_COLLATE} FROM loan_booking_gq_fsf
//           )
//           ${dateA.clause}
//         GROUP BY DATE_FORMAT(payment_date, '%Y-%m-%d')
//       `);
//       params.push(...dateA.params);
//     }

//     const sql = queries.join(" UNION ALL ") + " ORDER BY month, product";
//     const [rows] = await db.promise().query(sql, params);
//     res.json(rows);
//   } catch (err) {
//     console.error("❌ Repayment Trend Error:", err);
//     res.status(500).json({ error: "Repayment trend fetch failed" });
//   }
// });

// /** Collection vs Due */
// router.post("/collection-vs-due", async (req, res) => {
//   try {
//     const { product, from, to } = req.body || {};
//     const prod = normalizeProduct(product);
//     const { start, end } = dayRange(from, to);

//     const queries = [];
//     const params = [];

//     const dueR = buildDateRangeClause("due_date", start, end);
//     const payR = buildDateRangeClause("payment_date", start, end);

//     // DUE: EV
//     if (prod === "ALL" || prod === "EV") {
//       queries.push(`
//         SELECT DATE_FORMAT(due_date, '%Y-%m-%d') AS month,
//                'EV Loan' AS product,
//                SUM(emi) AS total_due,
//                0 AS total_collected
//         FROM manual_rps_ev_loan
//         WHERE due_date < CURDATE() ${dueR.clause}
//         GROUP BY DATE_FORMAT(due_date, '%Y-%m-%d')
//       `);
//       params.push(...dueR.params);
//     }

//     // DUE: BL
//     if (prod === "ALL" || prod === "BL") {
//       queries.push(`
//         SELECT DATE_FORMAT(due_date, '%Y-%m-%d') AS month,
//                'BL Loan' AS product,
//                SUM(emi) AS total_due,
//                0 AS total_collected
//         FROM manual_rps_bl_loan
//         WHERE due_date < CURDATE() ${dueR.clause}
//         GROUP BY DATE_FORMAT(due_date, '%Y-%m-%d')
//       `);
//       params.push(...dueR.params);
//     }

//     // DUE: Adikosh
//     if (prod === "ALL" || prod === "Adikosh") {
//       queries.push(`
//         SELECT DATE_FORMAT(due_date, '%Y-%m-%d') AS month,
//                'Adikosh' AS product,
//                SUM(emi) AS total_due,
//                0 AS total_collected
//         FROM manual_rps_adikosh
//         WHERE due_date < CURDATE() ${dueR.clause}
//         GROUP BY DATE_FORMAT(due_date, '%Y-%m-%d')
//       `);
//       params.push(...dueR.params);
//     }

//     // DUE: GQ Non-FSF
//     if (prod === "ALL" || prod === "GQ Non-FSF") {
//       queries.push(`
//         SELECT DATE_FORMAT(due_date, '%Y-%m-%d') AS month,
//                'GQ Non-FSF' AS product,
//                SUM(emi) AS total_due,
//                0 AS total_collected
//         FROM manual_rps_gq_non_fsf
//         WHERE due_date < CURDATE() ${dueR.clause}
//         GROUP BY DATE_FORMAT(due_date, '%Y-%m-%d')
//       `);
//       params.push(...dueR.params);
//     }

//     // DUE: GQ FSF
//     if (prod === "ALL" || prod === "GQ FSF") {
//       queries.push(`
//         SELECT DATE_FORMAT(due_date, '%Y-%m-%d') AS month,
//                'GQ FSF' AS product,
//                SUM(emi) AS total_due,
//                0 AS total_collected
//         FROM manual_rps_gq_fsf
//         WHERE due_date < CURDATE() ${dueR.clause}
//         GROUP BY DATE_FORMAT(due_date, '%Y-%m-%d')
//       `);
//       params.push(...dueR.params);
//     }

//     // COLLECTED: BL
//     if (prod === "ALL" || prod === "BL") {
//       queries.push(`
//         SELECT DATE_FORMAT(r.payment_date, '%Y-%m-%d') AS month,
//                'BL Loan' AS product,
//                0 AS total_due,
//                SUM(r.transfer_amount) AS total_collected
//         FROM repayments_upload r
//         JOIN loan_bookings b
//           ON b.lan COLLATE ${JOIN_COLLATE} = r.lan COLLATE ${JOIN_COLLATE}
//         WHERE r.payment_date IS NOT NULL
//           AND r.payment_date < CURDATE()
//           ${buildDateRangeClause("r.payment_date", start, end).clause}
//         GROUP BY DATE_FORMAT(r.payment_date, '%Y-%m-%d')
//       `);
//       params.push(...buildDateRangeClause("r.payment_date", start, end).params);
//     }

//     // COLLECTED: EV
//     if (prod === "ALL" || prod === "EV") {
//       queries.push(`
//         SELECT DATE_FORMAT(r.payment_date, '%Y-%m-%d') AS month,
//                'EV Loan' AS product,
//                0 AS total_due,
//                SUM(r.transfer_amount) AS total_collected
//         FROM repayments_upload r
//         JOIN loan_booking_ev e
//           ON e.lan COLLATE ${JOIN_COLLATE} = r.lan COLLATE ${JOIN_COLLATE}
//         WHERE r.payment_date IS NOT NULL
//           AND r.payment_date < CURDATE()
//           ${buildDateRangeClause("r.payment_date", start, end).clause}
//         GROUP BY DATE_FORMAT(r.payment_date, '%Y-%m-%d')
//       `);
//       params.push(...buildDateRangeClause("r.payment_date", start, end).params);
//     }

//     // COLLECTED: Adikosh
//     if (prod === "ALL" || prod === "Adikosh") {
//       queries.push(`
//         SELECT DATE_FORMAT(payment_date, '%Y-%m-%d') AS month,
//                'Adikosh' AS product,
//                0 AS total_due,
//                SUM(transfer_amount) AS total_collected
//         FROM repayments_upload_adikosh
//         WHERE payment_date IS NOT NULL
//           AND payment_date < CURDATE() ${payR.clause}
//         GROUP BY DATE_FORMAT(payment_date, '%Y-%m-%d')
//       `);
//       params.push(...payR.params);
//     }

//     // COLLECTED: GQ Non-FSF
//     if (prod === "ALL" || prod === "GQ Non-FSF") {
//       queries.push(`
//         SELECT DATE_FORMAT(payment_date, '%Y-%m-%d') AS month,
//                'GQ Non-FSF' AS product,
//                0 AS total_due,
//                SUM(transfer_amount) AS total_collected
//         FROM repayments_upload
//         WHERE payment_date IS NOT NULL
//           AND payment_date < CURDATE()
//           AND lan COLLATE ${JOIN_COLLATE} IN (
//             SELECT lan COLLATE ${JOIN_COLLATE} FROM loan_booking_gq_non_fsf
//           )
//           ${payR.clause}
//         GROUP BY DATE_FORMAT(payment_date, '%Y-%m-%d')
//       `);
//       params.push(...payR.params);
//     }

//     // COLLECTED: GQ FSF
//     if (prod === "ALL" || prod === "GQ FSF") {
//       queries.push(`
//         SELECT DATE_FORMAT(payment_date, '%Y-%m-%d') AS month,
//                'GQ FSF' AS product,
//                0 AS total_due,
//                SUM(transfer_amount) AS total_collected
//         FROM repayments_upload
//         WHERE payment_date IS NOT NULL
//           AND payment_date < CURDATE()
//           AND lan COLLATE ${JOIN_COLLATE} IN (
//             SELECT lan COLLATE ${JOIN_COLLATE} FROM loan_booking_gq_fsf
//           )
//           ${payR.clause}
//         GROUP BY DATE_FORMAT(payment_date, '%Y-%m-%d')
//       `);
//       params.push(...payR.params);
//     }

//     const sql = queries.join(" UNION ALL ") + " ORDER BY month, product";
//     const [rows] = await db.promise().query(sql, params);
//     res.json(rows);
//   } catch (err) {
//     console.error("❌ Collection vs Due Error:", err);
//     res.status(500).json({ error: "Collection vs Due fetch failed" });
//   }
// });

// /** Product Distribution */
// router.post("/product-distribution", async (req, res) => {
//   const { from, to } = req.body || {};
//   try {
//     const { start, end } = dayRange(from, to);

//     const wcBL = buildDateRangeClause("agreement_date", start, end);
//     const wcEV = buildDateRangeClause("agreement_date", start, end);
//     const wcAK = buildDateRangeClause("agreement_date", start, end);
//     const wcGQNon = buildDateRangeClause("agreement_date", start, end);
//     const wcGQFsf = buildDateRangeClause("agreement_date", start, end);

//     const sql = `
//       SELECT 'BL Loan' AS product, COUNT(*) AS value
//       FROM loan_bookings
//       WHERE 1=1 ${wcBL.clause}

//       UNION ALL

//       SELECT 'EV Loan' AS product, COUNT(*) AS value
//       FROM loan_booking_ev
//       WHERE 1=1 ${wcEV.clause}

//       UNION ALL

//       SELECT 'Adikosh' AS product, COUNT(*) AS value
//       FROM loan_booking_adikosh
//       WHERE 1=1 ${wcAK.clause}

//       UNION ALL

//       SELECT 'GQ Non-FSF' AS product, COUNT(*) AS value
//       FROM loan_booking_gq_non_fsf
//       WHERE 1=1 ${wcGQNon.clause}

//       UNION ALL

//       SELECT 'GQ FSF' AS product, COUNT(*) AS value
//       FROM loan_booking_gq_fsf
//       WHERE 1=1 ${wcGQFsf.clause}
//     `;

//     const params = [
//       ...wcBL.params,
//       ...wcEV.params,
//       ...wcAK.params,
//       ...wcGQNon.params,
//       ...wcGQFsf.params,
//     ];
//     const [rows] = await db.promise().query(sql, params);

//     // Collapse to { product, value }
//     const productMap = {};
//     rows.forEach(({ product, value }) => {
//       productMap[product] = (productMap[product] || 0) + Number(value || 0);
//     });

//     res.json(
//       Object.entries(productMap).map(([product, value]) => ({ product, value }))
//     );
//   } catch (err) {
//     console.error("❌ Product Distribution Error:", err);
//     res.status(500).json({ error: "Internal Server Error" });
//   }
// });

// /** Metric Cards — principal-only POS = Disbursed (cohort) - PrincipalCollectedToDate */
// router.post("/metric-cards", async (req, res) => {
//   try {
//     const { product, from, to } = req.body || {};
//     const prod = normalizeProduct(product);
//     const { start, end } = dayRange(from, to);

//     // Use a single collation on LAN joins to avoid “illegal mix of collations”
//     const JOIN_COLLATE = "utf8mb4_unicode_ci";

//     const disburseQueries = [];
//     const disburseParams = [];
//     const collectQueries = [];
//     const collectParams = [];
//     const pniRangeQueries = []; // principal & interest collected IN RANGE (for the two cards)
//     const pniRangeParams = [];

//     // POS needs “principal collected to date (as of cutoff)”
//     const pToDateQueries = [];
//     const pToDateParams = [];

//     const dclBL = buildDateRangeClause("agreement_date", start, end);
//     const dclEV = buildDateRangeClause("agreement_date", start, end);
//     const pclR  = buildDateRangeClause("r.payment_date", start, end);
//     const pclA  = buildDateRangeClause("payment_date", start, end);

//     /** ---------------- DISBURSED (cohort by agreement_date) ---------------- */
//     if (prod === "ALL" || prod === "BL") {
//       disburseQueries.push(`
//         SELECT IFNULL(SUM(loan_amount), 0) AS amount
//         FROM loan_bookings
//         WHERE 1=1 ${dclBL.clause}
//       `);
//       disburseParams.push(...dclBL.params);
//     }
//     if (prod === "ALL" || prod === "EV") {
//       disburseQueries.push(`
//         SELECT IFNULL(SUM(loan_amount), 0) AS amount
//         FROM loan_booking_ev
//         WHERE 1=1 ${dclEV.clause}
//       `);
//       disburseParams.push(...dclEV.params);
//     }
//     if (prod === "ALL" || prod === "Adikosh") {
//       const d = buildDateRangeClause("agreement_date", start, end);
//       disburseQueries.push(`
//         SELECT IFNULL(SUM(net_disbursement), 0) AS amount
//         FROM loan_booking_adikosh
//         WHERE 1=1 ${d.clause}
//       `);
//       disburseParams.push(...d.params);
//     }
//     if (prod === "ALL" || prod === "GQ Non-FSF") {
//       const d = buildDateRangeClause("agreement_date", start, end);
//       disburseQueries.push(`
//         SELECT IFNULL(SUM(disbursal_amount), 0) AS amount
//         FROM loan_booking_gq_non_fsf
//         WHERE 1=1 ${d.clause}
//       `);
//       disburseParams.push(...d.params);
//     }
//     if (prod === "ALL" || prod === "GQ FSF") {
//       const d = buildDateRangeClause("agreement_date", start, end);
//       disburseQueries.push(`
//         SELECT IFNULL(SUM(disbursal_amount), 0) AS amount
//         FROM loan_booking_gq_fsf
//         WHERE 1=1 ${d.clause}
//       `);
//       disburseParams.push(...d.params);
//     }

//     /** ---------------- TOTAL COLLECTED (money-in = P+I) IN RANGE ---------------- */
//     if (prod === "ALL" || prod === "BL") {
//       collectQueries.push(`
//         SELECT IFNULL(SUM(r.transfer_amount), 0) AS amount
//         FROM repayments_upload r
//         JOIN loan_bookings b
//           ON b.lan COLLATE ${JOIN_COLLATE} = r.lan COLLATE ${JOIN_COLLATE}
//         WHERE r.payment_date IS NOT NULL
//           ${pclR.clause}
//       `);
//       collectParams.push(...pclR.params);
//     }
//     if (prod === "ALL" || prod === "EV") {
//       collectQueries.push(`
//         SELECT IFNULL(SUM(r.transfer_amount), 0) AS amount
//         FROM repayments_upload r
//         JOIN loan_booking_ev e
//           ON e.lan COLLATE ${JOIN_COLLATE} = r.lan COLLATE ${JOIN_COLLATE}
//         WHERE r.payment_date IS NOT NULL
//           ${pclR.clause}
//       `);
//       collectParams.push(...pclR.params);
//     }
//     if (prod === "ALL" || prod === "Adikosh") {
//       collectQueries.push(`
//         SELECT IFNULL(SUM(transfer_amount), 0) AS amount
//         FROM repayments_upload_adikosh
//         WHERE payment_date IS NOT NULL ${pclA.clause}
//       `);
//       collectParams.push(...pclA.params);
//     }
//     if (prod === "ALL" || prod === "GQ Non-FSF") {
//       collectQueries.push(`
//         SELECT IFNULL(SUM(transfer_amount), 0) AS amount
//         FROM repayments_upload
//         WHERE payment_date IS NOT NULL
//           AND lan COLLATE ${JOIN_COLLATE} IN (
//             SELECT lan COLLATE ${JOIN_COLLATE} FROM loan_booking_gq_non_fsf
//           )
//           ${pclA.clause}
//       `);
//       collectParams.push(...pclA.params);
//     }
//     if (prod === "ALL" || prod === "GQ FSF") {
//       collectQueries.push(`
//         SELECT IFNULL(SUM(transfer_amount), 0) AS amount
//         FROM repayments_upload
//         WHERE payment_date IS NOT NULL
//           AND lan COLLATE ${JOIN_COLLATE} IN (
//             SELECT lan COLLATE ${JOIN_COLLATE} FROM loan_booking_gq_fsf
//           )
//           ${pclA.clause}
//       `);
//       collectParams.push(...pclA.params);
//     }

//     /** ---------------- P&I COLLECTED IN RANGE (for display cards) ---------------- */
//     if (prod === "ALL" || prod === "BL") {
//       const r = buildDateRangeClause("payment_date", start, end);
//       pniRangeQueries.push(`
//         SELECT IFNULL(SUM(principal),0) AS principal,
//                IFNULL(SUM(interest),0)  AS interest
//         FROM manual_rps_bl_loan
//         WHERE payment_date IS NOT NULL ${r.clause}
//       `);
//       pniRangeParams.push(...r.params);
//     }
//     if (prod === "ALL" || prod === "EV") {
//       const r = buildDateRangeClause("payment_date", start, end);
//       pniRangeQueries.push(`
//         SELECT IFNULL(SUM(principal),0) AS principal,
//                IFNULL(SUM(interest),0)  AS interest
//         FROM manual_rps_ev_loan
//         WHERE payment_date IS NOT NULL ${r.clause}
//       `);
//       pniRangeParams.push(...r.params);
//     }
//     if (prod === "ALL" || prod === "Adikosh") {
//       pniRangeQueries.push(`
//         SELECT IFNULL(SUM(principal),0) AS principal,
//                IFNULL(SUM(interest),0)  AS interest
//         FROM manual_rps_adikosh
//         WHERE payment_date IS NOT NULL ${pclA.clause}
//       `);
//       pniRangeParams.push(...pclA.params);
//     }
//     if (prod === "ALL" || prod === "GQ Non-FSF") {
//       pniRangeQueries.push(`
//         SELECT IFNULL(SUM(principal),0) AS principal,
//                IFNULL(SUM(interest),0)  AS interest
//         FROM manual_rps_gq_non_fsf
//         WHERE payment_date IS NOT NULL ${pclA.clause}
//       `);
//       pniRangeParams.push(...pclA.params);
//     }
//     if (prod === "ALL" || prod === "GQ FSF") {
//       pniRangeQueries.push(`
//         SELECT IFNULL(SUM(principal),0) AS principal,
//                IFNULL(SUM(interest),0)  AS interest
//         FROM manual_rps_gq_fsf
//         WHERE payment_date IS NOT NULL ${pclA.clause}
//       `);
//       pniRangeParams.push(...pclA.params);
//     }

//     /** ---------------- POS (Principal Outstanding) ----------------
//      *  Banking logic: POS = Disbursed (cohort) - PrincipalCollectedToDate (as of cutoff)
//      *  cutoff = end || today
//      */
//     const jsToday = new Date().toISOString().slice(0, 10);
//     const cutoff = end || jsToday;

//     // Build principal-to-date (<= cutoff) queries, restricted to the same cohort
//     if (prod === "ALL" || prod === "BL") {
//       const br = buildDateRangeClause("b.agreement_date", start, end);
//       pToDateQueries.push(`
//         SELECT IFNULL(SUM(rps.principal),0) AS principal
//         FROM manual_rps_bl_loan rps
//         JOIN loan_bookings b
//           ON b.lan COLLATE ${JOIN_COLLATE} = rps.lan COLLATE ${JOIN_COLLATE}
//         WHERE rps.payment_date IS NOT NULL
//           AND rps.payment_date < ?
//           ${br.clause}
//       `);
//       pToDateParams.push(cutoff, ...br.params);
//     }
//     if (prod === "ALL" || prod === "EV") {
//       const br = buildDateRangeClause("e.agreement_date", start, end);
//       pToDateQueries.push(`
//         SELECT IFNULL(SUM(rps.principal),0) AS principal
//         FROM manual_rps_ev_loan rps
//         JOIN loan_booking_ev e
//           ON e.lan COLLATE ${JOIN_COLLATE} = rps.lan COLLATE ${JOIN_COLLATE}
//         WHERE rps.payment_date IS NOT NULL
//           AND rps.payment_date < ?
//           ${br.clause}
//       `);
//       pToDateParams.push(cutoff, ...br.params);
//     }
//     if (prod === "ALL" || prod === "Adikosh") {
//       const br = buildDateRangeClause("b.agreement_date", start, end);
//       pToDateQueries.push(`
//         SELECT IFNULL(SUM(rps.principal),0) AS principal
//         FROM manual_rps_adikosh rps
//         JOIN loan_booking_adikosh b
//           ON b.lan COLLATE ${JOIN_COLLATE} = rps.lan COLLATE ${JOIN_COLLATE}
//         WHERE rps.payment_date IS NOT NULL
//           AND rps.payment_date < ?
//           ${br.clause}
//       `);
//       pToDateParams.push(cutoff, ...br.params);
//     }
//     if (prod === "ALL" || prod === "GQ Non-FSF") {
//       const br = buildDateRangeClause("b.agreement_date", start, end);
//       pToDateQueries.push(`
//         SELECT IFNULL(SUM(rps.principal),0) AS principal
//         FROM manual_rps_gq_non_fsf rps
//         JOIN loan_booking_gq_non_fsf b
//           ON b.lan COLLATE ${JOIN_COLLATE} = rps.lan COLLATE ${JOIN_COLLATE}
//         WHERE rps.payment_date IS NOT NULL
//           AND rps.payment_date < ?
//           ${br.clause}
//       `);
//       pToDateParams.push(cutoff, ...br.params);
//     }
//     if (prod === "ALL" || prod === "GQ FSF") {
//       const br = buildDateRangeClause("b.agreement_date", start, end);
//       pToDateQueries.push(`
//         SELECT IFNULL(SUM(rps.principal),0) AS principal
//         FROM manual_rps_gq_fsf rps
//         JOIN loan_booking_gq_fsf b
//           ON b.lan COLLATE ${JOIN_COLLATE} = rps.lan COLLATE ${JOIN_COLLATE}
//         WHERE rps.payment_date IS NOT NULL
//           AND rps.payment_date < ?
//           ${br.clause}
//       `);
//       pToDateParams.push(cutoff, ...br.params);
//     }

//     /** ---------------- Run all queries ---------------- */
//     const [
//       [disbRows],
//       [collRows],
//       [pniRangeRows],
//       [pToDateRows],
//     ] = await Promise.all([
//       db.promise().query(disburseQueries.join(" UNION ALL "), disburseParams),
//       db.promise().query(collectQueries.join(" UNION ALL "), collectParams),
//       db.promise().query(pniRangeQueries.join(" UNION ALL "), pniRangeParams),
//       db.promise().query(pToDateQueries.join(" UNION ALL "), pToDateParams),
//     ]);

//     const totalDisbursed   = disbRows.reduce((s, r) => s + Number(r.amount    || 0), 0);
//     const totalCollected   = collRows.reduce((s, r) => s + Number(r.amount    || 0), 0); // P+I in range
//     const totalPrincipal   = pniRangeRows.reduce((s, r) => s + Number(r.principal|| 0), 0); // IN RANGE
//     const totalInterest    = pniRangeRows.reduce((s, r) => s + Number(r.interest || 0), 0); // IN RANGE
//     const principalToDate  = pToDateRows.reduce((s, r) => s + Number(r.principal|| 0), 0);  // <= cutoff

//     // Banking definition of POS:
//     let principalOutstanding = Math.max(totalDisbursed - principalToDate, 0);

//     const collectionRate = totalDisbursed ? (totalCollected / totalDisbursed) * 100 : 0;

//     res.json({
//       totalDisbursed,
//       totalCollected,           // money-in (P+I) IN RANGE
//       collectionRate,
//       totalPrincipal,           // principal collected IN RANGE (display only)
//       totalInterest,            // interest collected IN RANGE (display only)
//       principalOutstanding,     // principal left (as of cutoff)
//       interestOutstanding: 0,   // POS is principal-only
//       posOutstanding: principalOutstanding,
//     });
//   } catch (err) {
//     console.error("❌ Metric Card Fetch Error:", err);
//     res.status(500).json({ error: "Failed to fetch metrics" });
//   }
// });

// /** -------------------- DPD Buckets -------------------- */
// router.post("/dpd-buckets", async (req, res) => {
//   try {
//     const { product } = req.body || {};
//     const prod = normalizeProduct(product);

//     const unions = [];
//     const params = [];
//     const OUTSTANDING = `rps.status <> 'Paid' AND rps.due_date < CURDATE()`;
//     const BUCKET_ORDER = `'0','0-30','30-60','60-90','90+'`;

//     // BL
//     if (prod === "ALL" || prod === "BL") {
//       unions.push(`
//         SELECT
//           CASE
//             WHEN t.max_dpd = 0 THEN '0'
//             WHEN t.max_dpd BETWEEN 1 AND 30 THEN '0-30'
//             WHEN t.max_dpd BETWEEN 31 AND 60 THEN '30-60'
//             WHEN t.max_dpd BETWEEN 61 AND 90 THEN '60-90'
//             ELSE '90+'
//           END AS bucket,
//           COUNT(*) AS loans,
//           SUM(CASE WHEN t.max_dpd = 0 THEN 0 ELSE t.overdue_emi END) AS overdue_emi
//         FROM (
//           SELECT rps.lan,
//                  MAX(CASE WHEN ${OUTSTANDING}
//                           THEN IFNULL(rps.dpd, DATEDIFF(CURDATE(), rps.due_date))
//                           ELSE 0 END) AS max_dpd,
//                  SUM(CASE WHEN ${OUTSTANDING} THEN IFNULL(rps.emi,0) ELSE 0 END) AS overdue_emi
//           FROM manual_rps_bl_loan rps
//           JOIN loan_bookings b
//             ON b.lan COLLATE ${JOIN_COLLATE} = rps.lan COLLATE ${JOIN_COLLATE}
//           GROUP BY rps.lan
//         ) t
//         GROUP BY bucket
//       `);
//     }

//     // EV
//     if (prod === "ALL" || prod === "EV") {
//       unions.push(`
//         SELECT
//           CASE
//             WHEN t.max_dpd = 0 THEN '0'
//             WHEN t.max_dpd BETWEEN 1 AND 30 THEN '0-30'
//             WHEN t.max_dpd BETWEEN 31 AND 60 THEN '30-60'
//             WHEN t.max_dpd BETWEEN 61 AND 90 THEN '60-90'
//             ELSE '90+'
//           END AS bucket,
//           COUNT(*) AS loans,
//           SUM(CASE WHEN t.max_dpd = 0 THEN 0 ELSE t.overdue_emi END) AS overdue_emi
//         FROM (
//           SELECT rps.lan,
//                  MAX(CASE WHEN ${OUTSTANDING}
//                           THEN IFNULL(rps.dpd, DATEDIFF(CURDATE(), rps.due_date))
//                           ELSE 0 END) AS max_dpd,
//                  SUM(CASE WHEN ${OUTSTANDING} THEN IFNULL(rps.emi,0) ELSE 0 END) AS overdue_emi
//           FROM manual_rps_ev_loan rps
//           JOIN loan_booking_ev e
//             ON e.lan COLLATE ${JOIN_COLLATE} = rps.lan COLLATE ${JOIN_COLLATE}
//           GROUP BY rps.lan
//         ) t
//         GROUP BY bucket
//       `);
//     }

//     // Adikosh
//     if (prod === "ALL" || prod === "Adikosh") {
//       unions.push(`
//         SELECT
//           CASE
//             WHEN t.max_dpd = 0 THEN '0'
//             WHEN t.max_dpd BETWEEN 1 AND 30 THEN '0-30'
//             WHEN t.max_dpd BETWEEN 31 AND 60 THEN '30-60'
//             WHEN t.max_dpd BETWEEN 61 AND 90 THEN '60-90'
//             ELSE '90+'
//           END AS bucket,
//           COUNT(*) AS loans,
//           SUM(CASE WHEN t.max_dpd = 0 THEN 0 ELSE t.overdue_emi END) AS overdue_emi
//         FROM (
//           SELECT rps.lan,
//                  MAX(CASE WHEN ${OUTSTANDING}
//                           THEN IFNULL(rps.dpd, DATEDIFF(CURDATE(), rps.due_date))
//                           ELSE 0 END) AS max_dpd,
//                  SUM(CASE WHEN ${OUTSTANDING} THEN IFNULL(rps.emi,0) ELSE 0 END) AS overdue_emi
//           FROM manual_rps_adikosh rps
//           JOIN loan_booking_adikosh b
//             ON b.lan COLLATE ${JOIN_COLLATE} = rps.lan COLLATE ${JOIN_COLLATE}
//           GROUP BY rps.lan
//         ) t
//         GROUP BY bucket
//       `);
//     }

//     // GQ Non-FSF
//     if (prod === "ALL" || prod === "GQ Non-FSF") {
//       unions.push(`
//         SELECT
//           CASE
//             WHEN t.max_dpd = 0 THEN '0'
//             WHEN t.max_dpd BETWEEN 1 AND 30 THEN '0-30'
//             WHEN t.max_dpd BETWEEN 31 AND 60 THEN '30-60'
//             WHEN t.max_dpd BETWEEN 61 AND 90 THEN '60-90'
//             ELSE '90+'
//           END AS bucket,
//           COUNT(*) AS loans,
//           SUM(CASE WHEN t.max_dpd = 0 THEN 0 ELSE t.overdue_emi END) AS overdue_emi
//         FROM (
//           SELECT rps.lan,
//                  MAX(CASE WHEN ${OUTSTANDING}
//                           THEN IFNULL(rps.dpd, DATEDIFF(CURDATE(), rps.due_date))
//                           ELSE 0 END) AS max_dpd,
//                  SUM(CASE WHEN ${OUTSTANDING} THEN IFNULL(rps.emi,0) ELSE 0 END) AS overdue_emi
//           FROM manual_rps_gq_non_fsf rps
//           JOIN loan_booking_gq_non_fsf b
//             ON b.lan COLLATE ${JOIN_COLLATE} = rps.lan COLLATE ${JOIN_COLLATE}
//           GROUP BY rps.lan
//         ) t
//         GROUP BY bucket
//       `);
//     }

//     // GQ FSF
//     if (prod === "ALL" || prod === "GQ FSF") {
//       unions.push(`
//         SELECT
//           CASE
//             WHEN t.max_dpd = 0 THEN '0'
//             WHEN t.max_dpd BETWEEN 1 AND 30 THEN '0-30'
//             WHEN t.max_dpd BETWEEN 31 AND 60 THEN '30-60'
//             WHEN t.max_dpd BETWEEN 61 AND 90 THEN '60-90'
//             ELSE '90+'
//           END AS bucket,
//           COUNT(*) AS loans,
//           SUM(CASE WHEN t.max_dpd = 0 THEN 0 ELSE t.overdue_emi END) AS overdue_emi
//         FROM (
//           SELECT rps.lan,
//                  MAX(CASE WHEN ${OUTSTANDING}
//                           THEN IFNULL(rps.dpd, DATEDIFF(CURDATE(), rps.due_date))
//                           ELSE 0 END) AS max_dpd,
//                  SUM(CASE WHEN ${OUTSTANDING} THEN IFNULL(rps.emi,0) ELSE 0 END) AS overdue_emi
//           FROM manual_rps_gq_fsf rps
//           JOIN loan_booking_gq_fsf b
//             ON b.lan COLLATE ${JOIN_COLLATE} = rps.lan COLLATE ${JOIN_COLLATE}
//           GROUP BY rps.lan
//         ) t
//         GROUP BY bucket
//       `);
//     }

//     if (!unions.length)
//       return res.json({ buckets: [], asOf: new Date().toISOString().slice(0, 10) });

//     const sql = `
//       SELECT bucket, SUM(loans) AS loans, SUM(overdue_emi) AS overdue_emi
//       FROM (
//         ${unions.join(" UNION ALL ")}
//       ) x
//       GROUP BY bucket
//       ORDER BY FIELD(bucket, ${BUCKET_ORDER})
//     `;
//     const [rows] = await db.promise().query(sql, params);

//     const map = {
//       "0":     { bucket: "0",     loans: 0, overdue_emi: 0 },
//       "0-30":  { bucket: "0-30",  loans: 0, overdue_emi: 0 },
//       "30-60": { bucket: "30-60", loans: 0, overdue_emi: 0 },
//       "60-90": { bucket: "60-90", loans: 0, overdue_emi: 0 },
//       "90+":   { bucket: "90+",   loans: 0, overdue_emi: 0 },
//     };
//     rows.forEach((r) => (map[r.bucket] = r));

//     res.json({
//       buckets: [map["0"], map["0-30"], map["30-60"], map["60-90"], map["90+"]],
//       asOf: new Date().toISOString().slice(0, 10),
//     });
//   } catch (err) {
//     console.error("❌ DPD Buckets Error:", err);
//     res.status(500).json({ error: "Failed to fetch DPD buckets" });
//   }
// });

// router.post("/dpd-list", async (req, res) => {
//   try {
//     const {
//       product,
//       bucket,
//       page: pageRaw,
//       pageSize: pageSizeRaw,
//       sortBy: sortByRaw,
//       sortDir: sortDirRaw
//     } = req.body || {};
//     const prod = normalizeProduct(product);

//     // pagination
//     const page = Math.max(1, parseInt(pageRaw || 1, 10));
//     const pageSize = Math.min(200, Math.max(1, parseInt(pageSizeRaw || 25, 10)));
//     const offset = (page - 1) * pageSize;

//     // bucket -> HAVING
//     const ranges = { "0-30": [1, 30], "30-60": [31, 60], "60-90": [61, 90] };
//     let havingClause = "";
//     let havingParams = [];
//     if (bucket === "0") {
//       havingClause = "HAVING max_dpd = 0";
//     } else if (bucket === "90+") {
//       havingClause = "HAVING max_dpd >= ?";
//       havingParams = [91];
//     } else if (ranges[bucket]) {
//       const [minDPD, maxDPD] = ranges[bucket];
//       havingClause = "HAVING max_dpd BETWEEN ? AND ?";
//       havingParams = [minDPD, maxDPD];
//     } else {
//       return res.status(400).json({ error: "Invalid bucket" });
//     }

//     // overdue rows = due_date in past and not paid
//     const OUTSTANDING = `rps.status <> 'Paid' AND rps.due_date < CURDATE()`;

//     // POS (Principal Outstanding) = sum of principal for installments not yet paid as of today
//     const POS_EXPR = `
//       SUM(
//         CASE
//           WHEN rps.payment_date IS NULL OR rps.payment_date >= CURDATE()
//           THEN IFNULL(rps.principal, 0)
//           ELSE 0
//         END
//       ) AS pos_principal
//     `;

//     const DISB_JOIN = `
//   LEFT JOIN (
//     SELECT lan, MIN(Disbursement_Date) AS disb_date
//     FROM ev_disbursement_utr
//     GROUP BY lan
//   ) d
//     ON d.lan COLLATE ${JOIN_COLLATE} = rps.lan COLLATE ${JOIN_COLLATE}
// `;
//     const unions = [];
//     const baseParams = [];

//     // BL
//     if (prod === "ALL" || prod === "BL") {
//       unions.push(`
//         SELECT 'UB Loan' AS product, t.*
//         FROM (
//           SELECT
//             rps.lan,
//             MAX(CASE WHEN ${OUTSTANDING}
//                      THEN IFNULL(rps.dpd, DATEDIFF(CURDATE(), rps.due_date))
//                      ELSE 0 END) AS max_dpd,
//             SUM(CASE WHEN ${OUTSTANDING} THEN IFNULL(rps.emi,0)       ELSE 0 END) AS overdue_emi,
//             SUM(CASE WHEN ${OUTSTANDING} THEN IFNULL(rps.principal,0) ELSE 0 END) AS overdue_principal,
//             SUM(CASE WHEN ${OUTSTANDING} THEN IFNULL(rps.interest,0)  ELSE 0 END) AS overdue_interest,
//             MAX(CASE WHEN ${OUTSTANDING} THEN rps.due_date ELSE NULL END) AS last_due_date,
//             ${POS_EXPR},
//             MIN(d.disb_date)                          AS disbursement_date,
//         DATEDIFF(CURDATE(), MIN(d.disb_date))     AS ageing_days
//           FROM manual_rps_bl_loan rps
//           JOIN loan_bookings b
//             ON b.lan COLLATE ${JOIN_COLLATE} = rps.lan COLLATE ${JOIN_COLLATE}
//             ${DISB_JOIN}
//           GROUP BY rps.lan
//           ${havingClause}
//         ) t
//       `);
//       baseParams.push(...havingParams);
//     }

//     // EV
//     if (prod === "ALL" || prod === "EV") {
//       unions.push(`
//         SELECT 'Malhotra EV' AS product, t.*
//         FROM (
//           SELECT
//             rps.lan,
//             MAX(CASE WHEN ${OUTSTANDING}
//                      THEN IFNULL(rps.dpd, DATEDIFF(CURDATE(), rps.due_date))
//                      ELSE 0 END) AS max_dpd,
//             SUM(CASE WHEN ${OUTSTANDING} THEN IFNULL(rps.emi,0)       ELSE 0 END) AS overdue_emi,
//             SUM(CASE WHEN ${OUTSTANDING} THEN IFNULL(rps.principal,0) ELSE 0 END) AS overdue_principal,
//             SUM(CASE WHEN ${OUTSTANDING} THEN IFNULL(rps.interest,0)  ELSE 0 END) AS overdue_interest,
//             MAX(CASE WHEN ${OUTSTANDING} THEN rps.due_date ELSE NULL END) AS last_due_date,
//             ${POS_EXPR},
//             MIN(d.disb_date)                          AS disbursement_date,
//         DATEDIFF(CURDATE(), MIN(d.disb_date))     AS ageing_days
//           FROM manual_rps_ev_loan rps
//           JOIN loan_booking_ev e
//             ON e.lan COLLATE ${JOIN_COLLATE} = rps.lan COLLATE ${JOIN_COLLATE}
//             ${DISB_JOIN}
//           GROUP BY rps.lan
//           ${havingClause}
//         ) t
//       `);
//       baseParams.push(...havingParams);
//     }

//     // Adikosh
//     if (prod === "ALL" || prod === "Adikosh") {
//       unions.push(`
//         SELECT 'Adikosh' AS product, t.*
//         FROM (
//           SELECT
//             rps.lan,
//             MAX(CASE WHEN ${OUTSTANDING}
//                      THEN IFNULL(rps.dpd, DATEDIFF(CURDATE(), rps.due_date))
//                      ELSE 0 END) AS max_dpd,
//             SUM(CASE WHEN ${OUTSTANDING} THEN IFNULL(rps.emi,0)       ELSE 0 END) AS overdue_emi,
//             SUM(CASE WHEN ${OUTSTANDING} THEN IFNULL(rps.principal,0) ELSE 0 END) AS overdue_principal,
//             SUM(CASE WHEN ${OUTSTANDING} THEN IFNULL(rps.interest,0)  ELSE 0 END) AS overdue_interest,
//             MAX(CASE WHEN ${OUTSTANDING} THEN rps.due_date ELSE NULL END) AS last_due_date,
//             ${POS_EXPR},
//             MIN(d.disb_date)                          AS disbursement_date,
//         DATEDIFF(CURDATE(), MIN(d.disb_date))     AS ageing_days
//           FROM manual_rps_adikosh rps
//           JOIN loan_booking_adikosh b
//             ON b.lan COLLATE ${JOIN_COLLATE} = rps.lan COLLATE ${JOIN_COLLATE}
//             ${DISB_JOIN}
//           GROUP BY rps.lan
//           ${havingClause}
//         ) t
//       `);
//       baseParams.push(...havingParams);
//     }

//     // GQ Non-FSF
//     if (prod === "ALL" || prod === "GQ Non-FSF") {
//       unions.push(`
//         SELECT 'GQ Non-FSF' AS product, t.*
//         FROM (
//           SELECT
//             rps.lan,
//             MAX(CASE WHEN ${OUTSTANDING}
//                      THEN IFNULL(rps.dpd, DATEDIFF(CURDATE(), rps.due_date))
//                      ELSE 0 END) AS max_dpd,
//             SUM(CASE WHEN ${OUTSTANDING} THEN IFNULL(rps.emi,0)       ELSE 0 END) AS overdue_emi,
//             SUM(CASE WHEN ${OUTSTANDING} THEN IFNULL(rps.principal,0) ELSE 0 END) AS overdue_principal,
//             SUM(CASE WHEN ${OUTSTANDING} THEN IFNULL(rps.interest,0)  ELSE 0 END) AS overdue_interest,
//             MAX(CASE WHEN ${OUTSTANDING} THEN rps.due_date ELSE NULL END) AS last_due_date,
//             ${POS_EXPR},
//             MIN(d.disb_date)                          AS disbursement_date,
//         DATEDIFF(CURDATE(), MIN(d.disb_date))     AS ageing_days
//           FROM manual_rps_gq_non_fsf rps
//           JOIN loan_booking_gq_non_fsf b
//             ON b.lan COLLATE ${JOIN_COLLATE} = rps.lan COLLATE ${JOIN_COLLATE}
//             ${DISB_JOIN}
//           GROUP BY rps.lan
//           ${havingClause}
//         ) t
//       `);
//       baseParams.push(...havingParams);
//     }

//     // GQ FSF
//     if (prod === "ALL" || prod === "GQ FSF") {
//       unions.push(`
//         SELECT 'GQ FSF' AS product, t.*
//         FROM (
//           SELECT
//             rps.lan,
//             MAX(CASE WHEN ${OUTSTANDING}
//                      THEN IFNULL(rps.dpd, DATEDIFF(CURDATE(), rps.due_date))
//                      ELSE 0 END) AS max_dpd,
//             SUM(CASE WHEN ${OUTSTANDING} THEN IFNULL(rps.emi,0)       ELSE 0 END) AS overdue_emi,
//             SUM(CASE WHEN ${OUTSTANDING} THEN IFNULL(rps.principal,0) ELSE 0 END) AS overdue_principal,
//             SUM(CASE WHEN ${OUTSTANDING} THEN IFNULL(rps.interest,0)  ELSE 0 END) AS overdue_interest,
//             MAX(CASE WHEN ${OUTSTANDING} THEN rps.due_date ELSE NULL END) AS last_due_date,
//             ${POS_EXPR},
//             MIN(d.disb_date)                          AS disbursement_date,
//         DATEDIFF(CURDATE(), MIN(d.disb_date))     AS ageing_days
//           FROM manual_rps_gq_fsf rps
//           JOIN loan_booking_gq_fsf b
//             ON b.lan COLLATE ${JOIN_COLLATE} = rps.lan COLLATE ${JOIN_COLLATE}
//             ${DISB_JOIN}
//           GROUP BY rps.lan
//           ${havingClause}
//         ) t
//       `);
//       baseParams.push(...havingParams);
//     }

//     if (!unions.length)
//       return res.json({ rows: [], pagination: { page, pageSize, total: 0 } });

//     const baseUnionSql = unions.join(" UNION ALL ");

//     // ✅ Sorting whitelist
//     const SORT_MAP = {
//       pos: "pos_principal",
//       emi: "overdue_emi",
//       dpd: "max_dpd",
//       due: "last_due_date",
//       ageing: "ageing_days"
//     };
//     const sortKey = (typeof sortByRaw === "string" ? sortByRaw.toLowerCase() : "dpd");
//     const sortCol = SORT_MAP[sortKey] || SORT_MAP.dpd;
//     const sortDir = (String(sortDirRaw || "desc").toLowerCase() === "asc") ? "ASC" : "DESC";

//     // Stable tie-breakers
//     const tie = [];
//     if (sortCol !== "max_dpd") tie.push("max_dpd DESC");
//     if (sortCol !== "last_due_date") tie.push("last_due_date DESC");
//     tie.push("lan ASC");

//     const orderClause = ` ORDER BY ${sortCol} ${sortDir}${tie.length ? ", " + tie.join(", ") : ""} `;

//     // total count
//     const countSql = `SELECT COUNT(*) AS total FROM (${baseUnionSql}) q`;
//     const [[countRow]] = await db.promise().query(countSql, baseParams);
//     const total = Number(countRow?.total || 0);

//     // page rows
//     const dataSql = `SELECT * FROM (${baseUnionSql}) q ${orderClause} LIMIT ? OFFSET ?`;
//     const dataParams = [...baseParams, pageSize, offset];
//     const [rows] = await db.promise().query(dataSql, dataParams);

//     res.json({ rows, pagination: { page, pageSize, total } });
//   } catch (err) {
//     console.error("❌ DPD List Error:", err);
//     res.status(500).json({ error: "Failed to fetch DPD list" });
//   }
// });

// router.post("/dpd-export-email", async (req, res) => {
//   try {
//     const { userId: userIdFromBody, product, bucket, page, rows } = req.body || {};
//     // Prefer id from auth; fallback to body
//     const userId = req.user?.id || userIdFromBody;
//     if (!userId) return res.status(400).json({ error: "Missing userId" });

//     if (!Array.isArray(rows) || rows.length === 0) {
//       return res.status(400).json({ error: "No rows to export" });
//     }

//     // 1) fetch recipient email from users table
//     const [[u]] = await db.promise().query(
//       "SELECT email, name FROM users WHERE id = ? LIMIT 1",
//       [userId]
//     );
//     if (!u?.email) return res.status(404).json({ error: "User email not found" });

//     // 2) build workbook (same columns as table)
//     const columns = [
//       { key: "lan", header: "LAN" },
//       { key: "customer_name", header: "Customer Name" },
//       { key: "product", header: "Product" },
//       { key: "max_dpd", header: "Max DPD" },
//       { key: "overdue_emi", header: "Overdue EMI" },
//       { key: "overdue_principal", header: "Overdue Principal" },
//       { key: "overdue_interest", header: "Overdue Interest" },
//       { key: "pos_principal", header: "POS (Principal)" },
//     ];

//     const header = columns.map(c => c.header);
//     const dataRows = rows.map(r => ([
//       r.lan ?? "",
//       r.customer_name ?? "",
//       r.product ?? "",
//       Number(r.max_dpd ?? 0),
//       Number(r.overdue_emi ?? 0),
//       Number(r.overdue_principal ?? 0),
//       Number(r.overdue_interest ?? 0),
//       Number(r.pos_principal ?? 0)
//     ]));

//     const ws = XLSX.utils.aoa_to_sheet([header, ...dataRows]);
//     // number + date formats
//     for (let r = 1; r <= dataRows.length; r++) {
//       for (const c of [3,4,5,6]) {
//         const addr = XLSX.utils.encode_cell({ r, c });
//         if (ws[addr]) { ws[addr].t = "n"; ws[addr].z = "#,##0"; }
//       }
//       const daddr = XLSX.utils.encode_cell({ r, c: 8 });
//       if (ws[daddr] && dataRows[r-1][8] instanceof Date) { ws[daddr].t = "d"; ws[daddr].z = "yyyy-mm-dd"; }
//     }
//     ws["!cols"] = header.map((h, i) => ({
//       wch: Math.min(40, Math.max(12, String(h).length + 2, ...dataRows.map(row => (row[i] ? String(row[i]).length + 2 : 0))))
//     }));

//     const wb = XLSX.utils.book_new();
//     XLSX.utils.book_append_sheet(wb, ws, "Visible Rows");

//     const safeProduct = String(product || "ALL").replace(/[^\w-]+/g, "_");
//     const safeBucket = String(bucket || "").replace(/[^\w-]+/g, "_");
//     const filename = `DPD_${safeProduct}_${safeBucket}_page_${page || 1}.xlsx`;

//     const buf = XLSX.write(wb, { bookType: "xlsx", type: "buffer" });

//     // 3) send email
//     const transporter = nodemailer.createTransport({
//       host: process.env.SMTP_HOST,
//       port: Number(process.env.SMTP_PORT || 587),
//       secure: String(process.env.SMTP_SECURE) === "true",
//       auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
//     });

//     await transporter.sendMail({
//       from: process.env.FROM_EMAIL || "no-reply@yourdomain.com",
//       to: u.email,
//       subject: `DPD report — ${product} ${bucket} (page ${page || 1})`,
//       text: `Hi ${u.name || ""},\n\nAttached is your DPD report (${filename}).`,
//       html: `<p>Hi ${u.name || ""},</p><p>Attached is your DPD report:</p><p><b>${filename}</b></p>`,
//       attachments: [{ filename, content: buf, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }]
//     });

//     res.json({ ok: true, sentTo: u.email });
//   } catch (err) {
//     console.error("❌ dpd-export-email error:", err);
//     res.status(500).json({ error: "Failed to email report" });
//   }
// });

// module.exports = router;

////////////////////////////////////////////////////////////

// Backend/routes/dashboardRoutes.js
const express = require("express");
const db = require("../config/db");
const router = express.Router();
const nodemailer = require("nodemailer");
const XLSX = require("xlsx");
// Redis cache setup
const redis = require("redis");
const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";
const REDIS_TTL = Number(process.env.REDIS_CACHE_TTL) || 60; // seconds
const CACHE_NAMESPACE = process.env.CACHE_NAMESPACE || "default";
let redisClient;
(async () => {
  try {
    redisClient = redis.createClient({ url: REDIS_URL });
    redisClient.on("error", (e) => console.error("Redis Client Error", e));
    await redisClient.connect();
    console.log("Redis connected");
  } catch (e) {
    console.error("Redis connection failed:", e);
  }
})();

// Simple cache middleware: key = dashboard|METHOD|baseUrl|path|body-or-query
function cacheMiddleware(ttl = REDIS_TTL) {
  return async (req, res, next) => {
    if (!redisClient) return next();
    const keyParts = [CACHE_NAMESPACE, "dashboard", req.method, req.baseUrl || "", req.path || ""];
    if (req.method === "GET") keyParts.push(JSON.stringify(req.query || {}));
    else keyParts.push(JSON.stringify(req.body || {}));
    const key = keyParts.join("|");
    try {
      const cached = await redisClient.get(key);
      if (cached) {
        res.setHeader("X-Cache", "HIT");
        return res.json(JSON.parse(cached));
      }

      const origJson = res.json.bind(res);
      let sent = false;
      res.json = (body) => {
        if (!sent) {
          try {
            // set asynchronously, don't await to avoid delaying response
            redisClient.setEx(key, ttl, JSON.stringify(body)).catch((e) => console.error("Redis setEx error", e));
          } catch (e) {
            console.error("Redis setEx sync error", e);
          }
          res.setHeader("X-Cache", "MISS");
          sent = true;
        }
        return origJson(body);
      };
    } catch (e) {
      console.error("Redis cache middleware error", e);
    }
    next();
  };
}

// Enable caching for all routes in this router (adjust TTL via REDIS_CACHE_TTL)
router.use(cacheMiddleware());

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

/** -------------------- Disbursal Trend -------------------- */
// router.post("/disbursal-trend", async (req, res) => {
//   try {
//     const { product, from, to } = req.body || {};
//     const prod = normalizeProduct(product);
//     const { start, end } = dayRange(from, to);

//     const queries = [];
//     const params = [];

//     const add = (table, label) => {
//       const dr = buildDateRangeClause("agreement_date", start, end);
//       queries.push(`
//         SELECT 
//     DATE_FORMAT(lb.agreement_date, '%Y-%m-%d') AS month,
//     '${label}' AS product,
//     SUM(mr.principal) AS total_disbursed
// FROM ${table} lb
// JOIN manual_rps mr 
//     ON lb.loan_id = mr.loan_id   -- 🔁 adjust join key as per your schema
// WHERE 1=1 ${dr.clause}
// GROUP BY DATE_FORMAT(lb.agreement_date, '%Y-%m-%d')
//  `);
//       params.push(...dr.params);
//     };

//     if (prod === "ALL" || prod === "BL") add("loan_bookings", "BL Loan");
//     if (prod === "ALL" || prod === "EV") add("loan_booking_ev", "EV Loan");
//     if (prod === "ALL" || prod === "Adikosh")
//       add("loan_booking_adikosh", "Adikosh");
//     if (prod === "ALL" || prod === "GQ Non-FSF")
//       add("loan_booking_gq_non_fsf", "GQ Non-FSF");
//     if (prod === "ALL" || prod === "GQ FSF")
//       add("loan_booking_gq_fsf", "GQ FSF");
//     if (prod === "ALL" || prod === "Embifi")
//       add("loan_booking_embifi", "Embifi");
//     if (prod === "ALL" || prod === "EMICLUB")
//       add("loan_booking_emiclub", "EMICLUB");
//     if (prod === "ALL" || prod === "WCTL")
//       add("loan_bookings_wctl", "WCTL");
//     if (prod === "ALL" || prod === "Finso")
//       add("loan_booking_finso", "Finso");
//     if (prod === "ALL" || prod === "circlepe")
//       add("loan_booking_circle_pe", "Circlepe");
//     if (prod === "ALL" || prod === "Hey EV")
//       add("loan_booking_hey_ev", "Hey EV");

//     const sql = queries.join(" UNION ALL ") + " ORDER BY month, product";
//     const [rows] = await db.promise().query(sql, params);
//     res.json(rows);
//   } catch (err) {
//     console.error("❌ Disbursal Trend Error:", err);
//     res.status(500).json({ error: "Disbursal trend fetch failed" });
//   }
// });

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
// router.post("/metric-cards", async (req, res) => {
//   try {
//     const { product, from, to } = req.body || {};
//     const prod = normalizeProduct(product);
//     const { start, end } = dayRange(from, to); // ← use this `end` below; don't redeclare

//     const disburseQueries = [];
//     const disburseParams = [];
//     const collectQueries = [];
//     const collectParams = [];
//     const pniRangeQueries = [];
//     const pniRangeParams = [];
//     const pToDateQueries = [];
//     const pToDateParams = [];

//     const dclBL = buildDateRangeClause("agreement_date", start, end);
//     const dclEV = buildDateRangeClause("agreement_date", start, end);
//     const pclR = buildDateRangeClause("r.payment_date", start, end);
//     const pclA = buildDateRangeClause("payment_date", start, end);
//     const dclEmbifi = buildDateRangeClause("agreement_date", start, end);
//     const dclWCTL = buildDateRangeClause("agreement_date", start, end);

//     // DISBURSED
//     if (prod === "ALL" || prod === "BL") {
//       disburseQueries.push(`
//         SELECT IFNULL(SUM(loan_amount), 0) AS amount
//         FROM loan_bookings
//         WHERE 1=1 ${dclBL.clause} and status = 'Disbursed'
//       `);
//       disburseParams.push(...dclBL.params);
//     }
//     if (prod === "ALL" || prod === "EV") {
//       disburseQueries.push(`
//         SELECT IFNULL(SUM(loan_amount), 0) AS amount
//         FROM loan_booking_ev
//         WHERE 1=1 ${dclEV.clause} and status = 'Disbursed'
//       `);
//       disburseParams.push(...dclEV.params);
//     }
//     if (prod === "ALL" || prod === "Embifi") {
//       disburseQueries.push(`
//         SELECT IFNULL(SUM(approved_loan_amount), 0) AS amount
//         FROM loan_booking_embifi
//         WHERE 1=1 ${dclEmbifi.clause} and status = 'Disbursed'
//       `);
//       disburseParams.push(...dclEmbifi.params);
//     }
//     if (prod === "ALL" || prod === "WCTL") {
//       disburseQueries.push(`
//         SELECT IFNULL(SUM(loan_amount), 0) AS amount
//         FROM loan_bookings_wctl
//         WHERE 1=1 ${dclWCTL.clause} and status = 'Disbursed'
//       `);
//       disburseParams.push(...dclWCTL.params);
//     }
//     if (prod === "ALL" || prod === "Adikosh") {
//       const d = buildDateRangeClause("agreement_date", start, end);
//       disburseQueries.push(`
//         SELECT IFNULL(SUM(net_disbursement), 0) AS amount
//         FROM loan_booking_adikosh
//         WHERE 1=1 ${d.clause} and status = 'Disbursed'
//       `);
//       disburseParams.push(...d.params);
//     }
//     if (prod === "ALL" || prod === "GQ Non-FSF") {
//       const d = buildDateRangeClause("agreement_date", start, end);
//       disburseQueries.push(`
//         SELECT IFNULL(SUM(disbursal_amount), 0) AS amount
//         FROM loan_booking_gq_non_fsf
//         WHERE 1=1 ${d.clause} and status = 'Disbursed'
//       `);
//       disburseParams.push(...d.params);
//     }
//     if (prod === "ALL" || prod === "GQ FSF") {
//       const d = buildDateRangeClause("agreement_date", start, end);
//       disburseQueries.push(`
//         SELECT IFNULL(SUM(disbursal_amount), 0) AS amount
//         FROM loan_booking_gq_fsf
//         WHERE 1=1 ${d.clause} and status = 'Disbursed'
//       `);
//       disburseParams.push(...d.params);
//     }
//     if (prod === "ALL" || prod === "EMICLUB") {
//       const d = buildDateRangeClause("agreement_date", start, end);
//       disburseQueries.push(`
//         SELECT IFNULL(SUM(loan_amount), 0) AS amount
//         FROM loan_booking_emiclub
//         WHERE 1=1 ${d.clause} and status = 'Disbursed'
//       `);
//       disburseParams.push(...d.params);
//     }
//     if (prod === "ALL" || prod === "Finso") {
//       const d = buildDateRangeClause("agreement_date", start, end);
//       disburseQueries.push(`
//         SELECT IFNULL(SUM(disbursal_amount), 0) AS amount
//         FROM loan_booking_finso
//         WHERE 1=1 ${d.clause} and status = 'Disbursed'
//       `);
//       disburseParams.push(...d.params);
//     }
//     if (prod === "ALL" || prod === "Hey EV") {
//       const d = buildDateRangeClause("agreement_date", start, end);
//       disburseQueries.push(`
//         SELECT IFNULL(SUM(loan_amount), 0) AS amount
//         FROM loan_booking_hey_ev
//         WHERE 1=1 ${d.clause} and status = 'Disbursed'
//       `);
//       disburseParams.push(...d.params);
//     }
//     if (prod === "ALL" || prod === "Circle Pe") {
//       const d = buildDateRangeClause("agreement_date", start, end);
//       disburseQueries.push(`
//         SELECT IFNULL(SUM(loan_amount), 0) AS amount
//         FROM loan_booking_circle_pe
//         WHERE 1=1 ${d.clause} and status = 'Disbursed'
//       `);
//       disburseParams.push(...d.params);
//     }

//     // TOTAL COLLECTED (P+I) IN RANGE
//     if (prod === "ALL" || prod === "BL") {
//       collectQueries.push(`
//         SELECT IFNULL(SUM(r.transfer_amount), 0) AS amount
//         FROM repayments_upload r
//         JOIN loan_bookings b ON ${eqLan("b.lan", "r.lan")}
//         WHERE r.payment_date IS NOT NULL
//           ${pclR.clause}
//       `);
//       collectParams.push(...pclR.params);
//     }
//     if (prod === "ALL" || prod === "EV") {
//       collectQueries.push(`
//         SELECT IFNULL(SUM(r.transfer_amount), 0) AS amount
//         FROM repayments_upload r
//         JOIN loan_booking_ev e ON ${eqLan("e.lan", "r.lan")}
//         WHERE r.payment_date IS NOT NULL
//           ${pclR.clause}
//       `);
//       collectParams.push(...pclR.params);
//     }
//     if (prod === "ALL" || prod === "Embifi") {
//       collectQueries.push(`
//         SELECT IFNULL(SUM(r.transfer_amount), 0) AS amount
//         FROM repayments_upload r
//         JOIN loan_booking_embifi e ON ${eqLan("e.lan", "r.lan")}
//         WHERE r.payment_date IS NOT NULL
//           ${pclR.clause}
//       `);
//       collectParams.push(...pclR.params);
//     }

//     if (prod === "ALL" || prod === "WCTL") {
//       collectQueries.push(`
//         SELECT IFNULL(SUM(r.transfer_amount), 0) AS amount
//         FROM repayments_upload r
//         JOIN loan_bookings_wctl w ON ${eqLan("w.lan", "r.lan")}
//         WHERE r.payment_date IS NOT NULL
//           ${pclR.clause}
//       `);
//       collectParams.push(...pclR.params);
//     }

//     if (prod === "ALL" || prod === "Adikosh") {
//       collectQueries.push(`
//         SELECT IFNULL(SUM(transfer_amount), 0) AS amount
//         FROM repayments_upload_adikosh
//         WHERE payment_date IS NOT NULL ${pclA.clause}
//       `);
//       collectParams.push(...pclA.params);
//     }
//     if (prod === "ALL" || prod === "GQ Non-FSF") {
//       collectQueries.push(`
//         SELECT IFNULL(SUM(transfer_amount), 0) AS amount
//         FROM repayments_upload
//         WHERE payment_date IS NOT NULL
//           AND lan ${USE_COLLATE_IN_JOINS ? `COLLATE ${JOIN_COLLATE}` : ""} IN (
//             SELECT lan ${USE_COLLATE_IN_JOINS ? `COLLATE ${JOIN_COLLATE}` : ""
//         } FROM loan_booking_gq_non_fsf
//           )
//           ${pclA.clause}
//       `);
//       collectParams.push(...pclA.params);
//     }
//     if (prod === "ALL" || prod === "GQ FSF") {
//       collectQueries.push(`
//         SELECT IFNULL(SUM(transfer_amount), 0) AS amount
//         FROM repayments_upload
//         WHERE payment_date IS NOT NULL
//           AND lan ${USE_COLLATE_IN_JOINS ? `COLLATE ${JOIN_COLLATE}` : ""} IN (
//             SELECT lan ${USE_COLLATE_IN_JOINS ? `COLLATE ${JOIN_COLLATE}` : ""
//         } FROM loan_booking_gq_fsf
//           )
//           ${pclA.clause}
//       `);
//       collectParams.push(...pclA.params);
//     }

//     if (prod === "ALL" || prod === "EMICLUB") {
//       collectQueries.push(`
//         SELECT IFNULL(SUM(transfer_amount), 0) AS amount
//         FROM repayments_upload
//         WHERE payment_date IS NOT NULL
//           AND lan ${USE_COLLATE_IN_JOINS ? `COLLATE ${JOIN_COLLATE}` : ""} IN (
//             SELECT lan ${USE_COLLATE_IN_JOINS ? `COLLATE ${JOIN_COLLATE}` : ""
//         } FROM loan_booking_emiclub
//           )
//           ${pclA.clause}
//       `);
//       collectParams.push(...pclA.params);
//     }
//     if (prod === "ALL" || prod === "Circle Pe") {
//       collectQueries.push(`
//         SELECT IFNULL(SUM(transfer_amount), 0) AS amount
//         FROM repayments_upload
//         WHERE payment_date IS NOT NULL
//           AND lan ${USE_COLLATE_IN_JOINS ? `COLLATE ${JOIN_COLLATE}` : ""} IN (
//             SELECT lan ${USE_COLLATE_IN_JOINS ? `COLLATE ${JOIN_COLLATE}` : ""
//         } FROM loan_booking_circle_pe
//           )
//           ${pclA.clause}
//       `);
//       collectParams.push(...pclA.params);
//     }
//     if (prod === "ALL" || prod === "Finso") {
//       collectQueries.push(`
//         SELECT IFNULL(SUM(transfer_amount), 0) AS amount
//         FROM repayments_upload
//         WHERE payment_date IS NOT NULL
//           AND lan ${USE_COLLATE_IN_JOINS ? `COLLATE ${JOIN_COLLATE}` : ""} IN (
//             SELECT lan ${USE_COLLATE_IN_JOINS ? `COLLATE ${JOIN_COLLATE}` : ""
//         } FROM loan_booking_finso
//           )
//           ${pclA.clause}
//       `);
//       collectParams.push(...pclA.params);
//     }
//     if (prod === "ALL" || prod === "Hey EV") {
//       collectQueries.push(`
//         SELECT IFNULL(SUM(transfer_amount), 0) AS amount
//         FROM repayments_upload
//         WHERE payment_date IS NOT NULL
//           AND lan ${USE_COLLATE_IN_JOINS ? `COLLATE ${JOIN_COLLATE}` : ""} IN (
//             SELECT lan ${USE_COLLATE_IN_JOINS ? `COLLATE ${JOIN_COLLATE}` : ""
//         } FROM loan_booking_hey_ev
//           )
//           ${pclA.clause}
//       `);
//       collectParams.push(...pclA.params);
//     }
// /////////// Principal and Interest 
//     if (prod === "ALL" || prod === "BL") {
//       const r = buildDateRangeClause("bank_date_allocation", start, end);
//       pniRangeQueries.push(`
//     SELECT 
//       IFNULL(SUM(CASE WHEN charge_type = 'Principal' THEN allocated_amount ELSE 0 END), 0) AS principal,
//       IFNULL(SUM(CASE WHEN charge_type = 'Interest'  THEN allocated_amount ELSE 0 END), 0) AS interest
//     FROM allocation
//     WHERE allocation_date IS NOT NULL ${r.clause}
//       AND lan LIKE 'BL%'
//   `);
//       pniRangeParams.push(...r.params);
//     }

//     if (prod === "ALL" || prod === "EV") {
//       const r = buildDateRangeClause("bank_date_allocation", start, end);
//       pniRangeQueries.push(`
//     SELECT 
//       IFNULL(SUM(CASE WHEN charge_type = 'Principal' THEN allocated_amount ELSE 0 END), 0) AS principal,
//       IFNULL(SUM(CASE WHEN charge_type = 'Interest'  THEN allocated_amount ELSE 0 END), 0) AS interest
//     FROM allocation
//     WHERE allocation_date IS NOT NULL ${r.clause}
//       AND lan LIKE 'EV%'
//   `);
//       pniRangeParams.push(...r.params);
//     }

//     if (prod === "ALL" || prod === "Embifi") {
//       const r = buildDateRangeClause("bank_date_allocation", start, end);
//       pniRangeQueries.push(`
//     SELECT 
//       IFNULL(SUM(CASE WHEN charge_type = 'Principal' THEN allocated_amount ELSE 0 END), 0) AS principal,
//       IFNULL(SUM(CASE WHEN charge_type = 'Interest'  THEN allocated_amount ELSE 0 END), 0) AS interest
//     FROM allocation
//     WHERE allocation_date IS NOT NULL ${r.clause}
//       AND lan LIKE 'E1%'
//   `);
//       pniRangeParams.push(...r.params);
//     }

//     if (prod === "ALL" || prod === "WCTL") {
//       const r = buildDateRangeClause("bank_date_allocation", start, end);
//       pniRangeQueries.push(`
//     SELECT 
//       IFNULL(SUM(CASE WHEN charge_type = 'Principal' THEN allocated_amount ELSE 0 END), 0) AS principal,
//       IFNULL(SUM(CASE WHEN charge_type = 'Interest'  THEN allocated_amount ELSE 0 END), 0) AS interest
//     FROM allocation
//     WHERE allocation_date IS NOT NULL ${r.clause}
//       AND lan LIKE 'WCTL%'
//   `);
//       pniRangeParams.push(...r.params);
//     }

//     if (prod === "ALL" || prod === "Adikosh") {
//       const r = buildDateRangeClause("bank_date_allocation", start, end);
//       pniRangeQueries.push(`
//     SELECT 
//       IFNULL(SUM(CASE WHEN charge_type = 'Principal' THEN allocated_amount ELSE 0 END), 0) AS principal,
//       IFNULL(SUM(CASE WHEN charge_type = 'Interest'  THEN allocated_amount ELSE 0 END), 0) AS interest
//     FROM allocation_adikosh
//     WHERE allocation_date IS NOT NULL ${r.clause}
//       AND lan LIKE 'ADK%'
//   `);
//       pniRangeParams.push(...r.params);
//     }

//     if (prod === "ALL" || prod === "GQ Non-FSF") {
//       const r = buildDateRangeClause("bank_date_allocation", start, end);
//       pniRangeQueries.push(`
//     SELECT 
//       IFNULL(SUM(CASE WHEN charge_type = 'Principal' THEN allocated_amount ELSE 0 END), 0) AS principal,
//       IFNULL(SUM(CASE WHEN charge_type = 'Interest'  THEN allocated_amount ELSE 0 END), 0) AS interest
//     FROM allocation
//     WHERE allocation_date IS NOT NULL ${r.clause}
//       AND lan LIKE '%GQN%'
//   `);
//       pniRangeParams.push(...r.params);
//     }

//     if (prod === "ALL" || prod === "GQ FSF") {
//       const r = buildDateRangeClause("bank_date_allocation", start, end);
//       pniRangeQueries.push(`
//     SELECT 
//       IFNULL(SUM(CASE WHEN charge_type = 'Principal' THEN allocated_amount ELSE 0 END), 0) AS principal,
//       IFNULL(SUM(CASE WHEN charge_type = 'Interest'  THEN allocated_amount ELSE 0 END), 0) AS interest
//     FROM allocation
//     WHERE allocation_date IS NOT NULL ${r.clause}
//       AND lan LIKE '%GQF%'
//   `);
//       pniRangeParams.push(...r.params);
//     }

//     if (prod === "ALL" || prod === "EMICLUB") {
//       const r = buildDateRangeClause("bank_date_allocation", start, end);
//       pniRangeQueries.push(`
//     SELECT 
//       IFNULL(SUM(CASE WHEN charge_type = 'Principal' THEN allocated_amount ELSE 0 END), 0) AS principal,
//       IFNULL(SUM(CASE WHEN charge_type = 'Interest'  THEN allocated_amount ELSE 0 END), 0) AS interest
//     FROM allocation
//     WHERE allocation_date IS NOT NULL ${r.clause}
//       AND lan LIKE '%FINE%'
//   `);
//       pniRangeParams.push(...r.params);
//     }

//     if (prod === "ALL" || prod === "Finso") {
//       const r = buildDateRangeClause("bank_date_allocation", start, end);
//       pniRangeQueries.push(`
//     SELECT 
//       IFNULL(SUM(CASE WHEN charge_type = 'Principal' THEN allocated_amount ELSE 0 END), 0) AS principal,
//       IFNULL(SUM(CASE WHEN charge_type = 'Interest'  THEN allocated_amount ELSE 0 END), 0) AS interest
//     FROM allocation
//     WHERE allocation_date IS NOT NULL ${r.clause}
//       AND lan LIKE '%FINS%'
//   `);
//       pniRangeParams.push(...r.params);
//     }

//     if (prod === "ALL" || prod === "Circle Pe") {
//       const r = buildDateRangeClause("bank_date_allocation", start, end);
//       pniRangeQueries.push(`
//     SELECT 
//       IFNULL(SUM(CASE WHEN charge_type = 'Principal' THEN allocated_amount ELSE 0 END), 0) AS principal,
//       IFNULL(SUM(CASE WHEN charge_type = 'Interest'  THEN allocated_amount ELSE 0 END), 0) AS interest
//     FROM allocation
//     WHERE allocation_date IS NOT NULL ${r.clause}
//       AND lan LIKE '%CIR%'
//   `);
//       pniRangeParams.push(...r.params);
//     }

//     if (prod === "ALL" || prod === "Hey EV") {
//       const r = buildDateRangeClause("bank_date_allocation", start, end);
//       pniRangeQueries.push(`
//     SELECT 
//       IFNULL(SUM(CASE WHEN charge_type = 'Principal' THEN allocated_amount ELSE 0 END), 0) AS principal,
//       IFNULL(SUM(CASE WHEN charge_type = 'Interest'  THEN allocated_amount ELSE 0 END), 0) AS interest
//     FROM allocation
//     WHERE allocation_date IS NOT NULL ${r.clause}
//       AND lan LIKE '%HEY%'
//   `);
//       pniRangeParams.push(...r.params);
//     }

//     // POS cutoff
//     const jsToday = new Date().toISOString().slice(0, 10);
//     const cutoff = end || jsToday;

//     // principal-to-date (<= cutoff) restricted to cohort
//     if (prod === "ALL" || prod === "BL") {
//       const br = buildDateRangeClause("b.agreement_date", start, end);
//       pToDateQueries.push(`
//         SELECT IFNULL(SUM(rps.principal),0) AS principal
//         FROM manual_rps_bl_loan rps
//         JOIN loan_bookings b ON ${eqLan("b.lan", "rps.lan")}
//         WHERE rps.payment_date IS NOT NULL
//           AND rps.payment_date < ?
//           ${br.clause}
//       `);
//       pToDateParams.push(cutoff, ...br.params);
//     }
//     if (prod === "ALL" || prod === "EV") {
//       const br = buildDateRangeClause("e.agreement_date", start, end);
//       pToDateQueries.push(`
//         SELECT IFNULL(SUM(rps.principal),0) AS principal
//         FROM manual_rps_ev_loan rps
//         JOIN loan_booking_ev e ON ${eqLan("e.lan", "rps.lan")}
//         WHERE rps.payment_date IS NOT NULL
//           AND rps.payment_date < ?
//           ${br.clause}
//       `);
//       pToDateParams.push(cutoff, ...br.params);
//     }
//     if (prod === "ALL" || prod === "Embifi") {
//       const br = buildDateRangeClause("e.agreement_date", start, end);
//       pToDateQueries.push(`
//         SELECT IFNULL(SUM(rps.principal),0) AS principal
//         FROM manual_rps_embifi_loan rps
//         JOIN loan_booking_embifi e ON ${eqLan("e.lan", "rps.lan")}
//         WHERE rps.payment_date IS NOT NULL
//           AND rps.payment_date < ?
//           ${br.clause}
//       `);
//       pToDateParams.push(cutoff, ...br.params);
//     }

//     if (prod === "ALL" || prod === "WCTL") {
//       const br = buildDateRangeClause("b.agreement_date", start, end);
//       pToDateQueries.push(`
//         SELECT IFNULL(SUM(rps.principal),0) AS principal
//         FROM manual_rps_wctl rps
//         JOIN loan_bookings_wctl b ON ${eqLan("b.lan", "rps.lan")}
//         WHERE rps.payment_date IS NOT NULL
//           AND rps.payment_date < ?
//           ${br.clause}
//       `);
//       pToDateParams.push(cutoff, ...br.params);
//     }

//     if (prod === "ALL" || prod === "Adikosh") {
//       const br = buildDateRangeClause("b.agreement_date", start, end);
//       pToDateQueries.push(`
//         SELECT IFNULL(SUM(rps.principal),0) AS principal
//         FROM manual_rps_adikosh rps
//         JOIN loan_booking_adikosh b ON ${eqLan("b.lan", "rps.lan")}
//         WHERE rps.payment_date IS NOT NULL
//           AND rps.payment_date < ?
//           ${br.clause}
//       `);
//       pToDateParams.push(cutoff, ...br.params);
//     }
//     if (prod === "ALL" || prod === "GQ Non-FSF") {
//       const br = buildDateRangeClause("b.agreement_date", start, end);
//       pToDateQueries.push(`
//         SELECT IFNULL(SUM(rps.principal),0) AS principal
//         FROM manual_rps_gq_non_fsf rps
//         JOIN loan_booking_gq_non_fsf b ON ${eqLan("b.lan", "rps.lan")}
//         WHERE rps.payment_date IS NOT NULL
//           AND rps.payment_date < ?
//           ${br.clause}
//       `);
//       pToDateParams.push(cutoff, ...br.params);
//     }
//     if (prod === "ALL" || prod === "GQ FSF") {
//       const br = buildDateRangeClause("b.agreement_date", start, end);
//       pToDateQueries.push(`
//         SELECT IFNULL(SUM(rps.principal),0) AS principal
//         FROM manual_rps_gq_fsf rps
//         JOIN loan_booking_gq_fsf b ON ${eqLan("b.lan", "rps.lan")}
//         WHERE rps.payment_date IS NOT NULL
//           AND rps.payment_date < ?
//           ${br.clause}
//       `);
//       pToDateParams.push(cutoff, ...br.params);
//     }
//     if (prod === "ALL" || prod === "EMICLUB") {
//       const br = buildDateRangeClause("b.agreement_date", start, end);
//       pToDateQueries.push(`
//         SELECT IFNULL(SUM(rps.principal),0) AS principal
//         FROM manual_rps_emiclub rps
//         JOIN loan_booking_emiclub b ON ${eqLan("b.lan", "rps.lan")}
//         WHERE rps.payment_date IS NOT NULL
//           AND rps.payment_date < ?
//           ${br.clause}
//       `);
//       pToDateParams.push(cutoff, ...br.params);
//     }
//     if (prod === "ALL" || prod === "Finso") {
//       const br = buildDateRangeClause("b.agreement_date", start, end);
//       pToDateQueries.push(`
//         SELECT IFNULL(SUM(rps.principal),0) AS principal
//         FROM manual_rps_finso_loan rps
//         JOIN loan_booking_finso b ON ${eqLan("b.lan", "rps.lan")}
//         WHERE rps.payment_date IS NOT NULL
//           AND rps.payment_date < ?
//           ${br.clause}
//       `);
//       pToDateParams.push(cutoff, ...br.params);
//     }
//     if (prod === "ALL" || prod === "Hey EV") {
//       const br = buildDateRangeClause("b.agreement_date", start, end);
//       pToDateQueries.push(`
//         SELECT IFNULL(SUM(rps.principal),0) AS principal
//         FROM manual_rps_hey_ev rps
//         JOIN loan_booking_hey_ev b ON ${eqLan("b.lan", "rps.lan")}
//         WHERE rps.payment_date IS NOT NULL
//           AND rps.payment_date < ?
//           ${br.clause}
//       `);
//       pToDateParams.push(cutoff, ...br.params);
//     }
//     if (prod === "ALL" || prod === "Circle Pe") {
//       const br = buildDateRangeClause("b.agreement_date", start, end);
//       pToDateQueries.push(`
//         SELECT IFNULL(SUM(rps.principal),0) AS principal
//         FROM manual_rps_circlepe rps
//         JOIN loan_booking_circle_pe b ON ${eqLan("b.lan", "rps.lan")}
//         WHERE rps.payment_date IS NOT NULL
//           AND rps.payment_date < ?
//           ${br.clause}
//       `);
//       pToDateParams.push(cutoff, ...br.params);
//     }

//     const [[disbRows], [collRows], [pniRangeRows], [pToDateRows]] =
//       await Promise.all([
//         db.promise().query(disburseQueries.join(" UNION ALL "), disburseParams),
//         db.promise().query(collectQueries.join(" UNION ALL "), collectParams),
//         db.promise().query(pniRangeQueries.join(" UNION ALL "), pniRangeParams),
//         db.promise().query(pToDateQueries.join(" UNION ALL "), pToDateParams),
//       ]);

//     const totalDisbursed = disbRows.reduce(
//       (s, r) => s + Number(r.amount || 0),
//       0
//     );
//     const totalCollected = collRows.reduce(
//       (s, r) => s + Number(r.amount || 0),
//       0
//     );
//     const totalPrincipal = pniRangeRows.reduce(
//       (s, r) => s + Number(r.principal || 0),
//       0
//     );
//     const totalInterest = pniRangeRows.reduce(
//       (s, r) => s + Number(r.interest || 0),
//       0
//     );
//     const principalToDate = pToDateRows.reduce(
//       (s, r) => s + Number(r.principal || 0),
//       0
//     );

//     const principalOutstanding = Math.max(totalDisbursed - principalToDate, 0);
//     const collectionRate = totalDisbursed
//       ? (totalCollected / totalDisbursed) * 100
//       : 0;

//     res.json({
//       totalDisbursed,
//       totalCollected,
//       collectionRate,
//       totalPrincipal,
//       totalInterest,
//       principalOutstanding,
//       interestOutstanding: 0,
//       posOutstanding: principalOutstanding,
//     });
//   } catch (err) {
//     console.error("❌ Metric Card Fetch Error:", err);
//     res.status(500).json({ error: "Failed to fetch metrics" });
//   }
// });
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
// router.post("/dpd-list", async (req, res) => {
//   try {
//     const {
//       product,
//       bucket,
//       page: pageRaw,
//       pageSize: pageSizeRaw,
//       sortBy: sortByRaw,
//       sortDir: sortDirRaw
//     } = req.body || {};

//     const JOIN_COLLATE = "utf8mb4_unicode_ci";

//     // normalize product
//     const normalizeProduct = (p) => {
//       if (!p || p === "ALL") return "ALL";
//       const s = String(p).toLowerCase().replace(/\s+/g, "").replace(/-/g, "");
//       if (s === "evloan" || s === "ev_loan") return "EV";
//       if (s === "blloan" || s === "bl_loan") return "BL";
//       if (s === "adikosh") return "Adikosh";
//       if (s === "gqnonfsf" || s === "gqnon-fsf") return "GQ Non-FSF";
//       if (s === "gqfsf" || s === "gq-fsf") return "GQ FSF";
//       if (s === "embifi") return "Embifi";
//       return p;
//     };
//     const prod = normalizeProduct(product);

//     // pagination
//     const page     = Math.max(1, parseInt(pageRaw || 1, 10));
//     const pageSize = Math.min(200, Math.max(1, parseInt(pageSizeRaw || 25, 10)));
//     const offset   = (page - 1) * pageSize;

//     // --- Bucket filter ---
//     const ranges = { "0-30": [1, 30], "30-60": [31, 60], "60-90": [61, 90] };
//     let havingStr = "";
//     let isClosed = false;

//     if (bucket === "0") {
//       havingStr = "HAVING max_dpd = 0";
//     } else if (bucket === "90+") {
//       havingStr = "HAVING max_dpd >= 91";
//     } else if (ranges[bucket]) {
//       const [minDPD, maxDPD] = ranges[bucket];
//       havingStr = `HAVING max_dpd BETWEEN ${minDPD} AND ${maxDPD}`;
//     } else if (bucket === "closed") {
//   isClosed = true;
// } else {
//       return res.status(400).json({ error: "Invalid bucket" });
//     }
//     const isZero = bucket === "0";

//     // helper: check if column exists
//     const tableHasColumn = async (tableName, columnName) => {
//       const [rows] = await db.promise().query(
//         `SHOW COLUMNS FROM \`${tableName}\` LIKE ?`,
//         [columnName]
//       );
//       return rows.length > 0;
//     };

//     const branches = [];

//     const addBranchIfNeeded = async ({ label, key, rpsTable, bookTable }) => {
//       if (!(prod === "ALL" || prod === key)) return;

//       // check schema dynamically
//       const hasDealerName  = await tableHasColumn(bookTable, "dealer_name");
//       const hasBeneficiary = await tableHasColumn(bookTable, "beneficiary_name");
//       const hasDistrict    = await tableHasColumn(bookTable, "district");
//       const hasCity        = await tableHasColumn(bookTable, "current_address_city");

//       // dealerExpr
//       let dealerExpr;
//       if (hasDealerName && hasBeneficiary) {
//         dealerExpr = "COALESCE(MAX(b.dealer_name), MAX(b.beneficiary_name))";
//       } else if (hasDealerName) {
//         dealerExpr = "MAX(b.dealer_name)";
//       } else if (hasBeneficiary) {
//         dealerExpr = "MAX(b.beneficiary_name)";
//       } else {
//         dealerExpr = "'-'";
//       }

//       // districtExpr
//       let districtExpr;
//       if (hasDistrict && hasCity) {
//         districtExpr = "COALESCE(MAX(b.district), MAX(b.current_address_city))";
//       } else if (hasDistrict) {
//         districtExpr = "MAX(b.district)";
//       } else if (hasCity) {
//         districtExpr = "MAX(b.current_address_city)";
//       } else {
//         districtExpr = "'-'";
//       }

//       // build branch query
//       branches.push(`
//         SELECT '${label}' AS product,
//                rps.lan,
//                MAX(b.customer_name) AS customer_name,
//                ${dealerExpr} AS dealer_name,
//                ${districtExpr} AS district,
//                MAX(b.status) AS status,
//                CASE
//                  WHEN LOWER(b.status) = 'disbursed' THEN 'Active'
//                  WHEN LOWER(b.status) IN ('fully paid','settled & closed','closed','completed','settled','closed & reopen') THEN 'Closed'
//                  ELSE 'Unknown'
//                END AS loan_status,
//                ${isZero
//                  ? `MAX(CASE WHEN rps.status <> 'Paid' AND rps.due_date < CURDATE()
//                              THEN IFNULL(rps.dpd, DATEDIFF(CURDATE(), rps.due_date)) ELSE 0 END)`
//                  : `MAX(IFNULL(rps.dpd, DATEDIFF(CURDATE(), rps.due_date)))`
//                } AS max_dpd,
//                ${isZero
//                  ? `SUM(CASE WHEN rps.status <> 'Paid' AND rps.due_date < CURDATE() THEN IFNULL(rps.emi,0) ELSE 0 END)`
//                  : `SUM(IFNULL(rps.emi,0))`
//                } AS overdue_emi,
//                ${isZero
//                  ? `SUM(CASE WHEN rps.status <> 'Paid' AND rps.due_date < CURDATE() THEN IFNULL(rps.principal,0) ELSE 0 END)`
//                  : `SUM(IFNULL(rps.principal,0))`
//                } AS overdue_principal,
//                ${isZero
//                  ? `SUM(CASE WHEN rps.status <> 'Paid' AND rps.due_date < CURDATE() THEN IFNULL(rps.interest,0) ELSE 0 END)`
//                  : `SUM(IFNULL(rps.interest,0))`
//                } AS overdue_interest,
//                ${isZero
//                  ? `MAX(CASE WHEN rps.status <> 'Paid' AND rps.due_date < CURDATE() THEN rps.due_date END)`
//                  : `MAX(rps.due_date)`
//                } AS last_due_date,
//                SUM(IFNULL(rps.principal,0)) AS pos_principal
//         FROM ${rpsTable} rps
//         JOIN ${bookTable} b ON b.lan COLLATE ${JOIN_COLLATE} = rps.lan COLLATE ${JOIN_COLLATE}
//         ${isClosed
//   ? "WHERE LOWER(b.status) IN ('closed','fully paid','completed','settled','paid','settled & closed','closed & reopen')"
//   : "WHERE LOWER(b.status) = 'disbursed'"
// }

//         GROUP BY rps.lan
//         ${havingStr}
//       `);
//     };

//     // add branches for each product
//     await addBranchIfNeeded({ label: "BL",         key: "BL",        rpsTable: "manual_rps_bl_loan",    bookTable: "loan_bookings" });
//     await addBranchIfNeeded({ label: "EV",         key: "EV",        rpsTable: "manual_rps_ev_loan",    bookTable: "loan_booking_ev" });
//     await addBranchIfNeeded({ label: "Adikosh",    key: "Adikosh",   rpsTable: "manual_rps_adikosh",    bookTable: "loan_booking_adikosh" });
//     await addBranchIfNeeded({ label: "GQ Non-FSF", key: "GQ Non-FSF",rpsTable: "manual_rps_gq_non_fsf", bookTable: "loan_booking_gq_non_fsf" });
//     await addBranchIfNeeded({ label: "GQ FSF",     key: "GQ FSF",    rpsTable: "manual_rps_gq_fsf",     bookTable: "loan_booking_gq_fsf" });
//     await addBranchIfNeeded({ label: "Embifi",     key: "Embifi",    rpsTable: "manual_rps_embifi_loan",bookTable: "loan_booking_embifi" });

//     if (!branches.length) {
//       return res.json({ rows: [], pagination: { page, pageSize, total: 0 } });
//     }

//     // Sorting
//     const SORT_MAP = {
//       pos: "pos_principal",
//       emi: "overdue_emi",
//       dpd: "max_dpd",
//       due: "last_due_date",
//       ageing: "ageing_days",
//       customer: "customer_name",
//   dealer: "dealer_name",
//   district: "district"
//     };

//     const sortKey = (typeof sortByRaw === "string" ? sortByRaw.toLowerCase() : "dpd");
//     const sortCol = SORT_MAP[sortKey] || SORT_MAP.dpd;
//     const sortDir = (String(sortDirRaw || "desc").toLowerCase() === "asc") ? "ASC" : "DESC";

//     const orderClause = `ORDER BY ${sortCol} ${sortDir}, lan ASC`;

// // Final SQL
// const sql = `
//   WITH d AS (
//     SELECT lan, MIN(Disbursement_Date) AS disb_date
//     FROM ev_disbursement_utr
//     GROUP BY lan
//   ),
//   base AS (
//     ${branches.join(" UNION ALL ")}
//   )
//   SELECT base.*, d.disb_date, DATEDIFF(CURDATE(), d.disb_date) AS ageing_days,
//          COUNT(*) OVER() AS total_rows
//   FROM base
//   LEFT JOIN d ON d.lan = base.lan
//   ${orderClause}
//   LIMIT ? OFFSET ?
// `;

//     const [pageRows] = await db.promise().query(sql, [pageSize, offset]);
//     const total = pageRows.length ? Number(pageRows[0].total_rows) : 0;
//     const rows  = pageRows.map(({ total_rows, ...r }) => r);

//     res.json({ rows, pagination: { page, pageSize, total } });
//   } catch (err) {
//     console.error("❌ DPD List Error:", err);
//     res.status(500).json({ error: "Failed to fetch DPD list" });
//   }
// });

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
