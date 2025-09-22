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
  if (start) { parts.push(`${field} >= ?`); params.push(start); }
  if (end)   { parts.push(`${field} < ?`);  params.push(end); }
  return { clause: parts.length ? ` AND ${parts.join(" AND ")}` : "", params };
}

// Normalize product values coming from UI
function normalizeProduct(p) {
  if (!p || p === "ALL") return "ALL";
  const s = String(p).toLowerCase().replace(/\s+/g, "").replace(/-/g, "");
  if (s === "evloan" || s === "ev_loan") return "EV";
  if (s === "blloan" || s === "bl_loan") return "BL";
  if (s === "adikosh") return "Adikosh";
  if (s === "gqnonfsf" || s === "gqnon-fsf") return "GQ Non-FSF";
  if (s === "gqfsf" || s === "gq-fsf") return "GQ FSF";
  return p;
}

/* ============================ Routes ============================ */

/** -------------------- Disbursal Trend -------------------- */
router.post("/disbursal-trend", async (req, res) => {
  try {
    const { product, from, to } = req.body || {};
    const prod = normalizeProduct(product);
    const { start, end } = dayRange(from, to);

    const queries = [];
    const params = [];

    const add = (table, label) => {
      const dr = buildDateRangeClause("agreement_date", start, end);
      queries.push(`
        SELECT DATE_FORMAT(agreement_date, '%Y-%m-%d') AS month,
               '${label}' AS product,
               SUM(loan_amount) AS total_disbursed
        FROM ${table}
        WHERE 1=1 ${dr.clause}
        GROUP BY DATE_FORMAT(agreement_date, '%Y-%m-%d')
      `);
      params.push(...dr.params);
    };

    if (prod === "ALL" || prod === "BL") add("loan_bookings", "BL Loan");
    if (prod === "ALL" || prod === "EV") add("loan_booking_ev", "EV Loan");
    if (prod === "ALL" || prod === "Adikosh") add("loan_booking_adikosh", "Adikosh");
    if (prod === "ALL" || prod === "GQ Non-FSF") add("loan_booking_gq_non_fsf", "GQ Non-FSF");
    if (prod === "ALL" || prod === "GQ FSF") add("loan_booking_gq_fsf", "GQ FSF");

    const sql = queries.join(" UNION ALL ") + " ORDER BY month, product";
    const [rows] = await db.promise().query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error("❌ Disbursal Trend Error:", err);
    res.status(500).json({ error: "Disbursal trend fetch failed" });
  }
});

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
            SELECT lan ${USE_COLLATE_IN_JOINS ? `COLLATE ${JOIN_COLLATE}` : ""} FROM loan_booking_gq_non_fsf
          )
          ${dateA.clause}
        GROUP BY DATE_FORMAT(payment_date, '%Y-%m-%d')
      `);
      params.push(...dateA.params);
    }

    if (prod === "ALL" || prod === "GQ FSF") {
      queries.push(`
        SELECT DATE_FORMAT(payment_date, '%Y-%m-%d') AS month,
               'GQ FSF' AS product,
               SUM(transfer_amount) AS total_collected
        FROM repayments_upload
        WHERE payment_date IS NOT NULL
          AND lan ${USE_COLLATE_IN_JOINS ? `COLLATE ${JOIN_COLLATE}` : ""} IN (
            SELECT lan ${USE_COLLATE_IN_JOINS ? `COLLATE ${JOIN_COLLATE}` : ""} FROM loan_booking_gq_fsf
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
            SELECT lan ${USE_COLLATE_IN_JOINS ? `COLLATE ${JOIN_COLLATE}` : ""} FROM loan_booking_gq_non_fsf
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
            SELECT lan ${USE_COLLATE_IN_JOINS ? `COLLATE ${JOIN_COLLATE}` : ""} FROM loan_booking_gq_fsf
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

      SELECT 'GQ FSF' AS product, COUNT(*) AS value
      FROM loan_booking_gq_fsf
      WHERE 1=1 ${wcGQFsf.clause}
    `;

    const params = [
      ...wcBL.params, ...wcEV.params, ...wcAK.params, ...wcGQNon.params, ...wcGQFsf.params,
    ];
    const [rows] = await db.promise().query(sql, params);

    const productMap = {};
    rows.forEach(({ product, value }) => {
      productMap[product] = (productMap[product] || 0) + Number(value || 0);
    });

    res.json(Object.entries(productMap).map(([product, value]) => ({ product, value })));
  } catch (err) {
    console.error("❌ Product Distribution Error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

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

    const dclBL = buildDateRangeClause("agreement_date", start, end);
    const dclEV = buildDateRangeClause("agreement_date", start, end);
    const pclR  = buildDateRangeClause("r.payment_date", start, end);
    const pclA  = buildDateRangeClause("payment_date", start, end);

    // DISBURSED
    if (prod === "ALL" || prod === "BL") {
      disburseQueries.push(`
        SELECT IFNULL(SUM(loan_amount), 0) AS amount
        FROM loan_bookings
        WHERE 1=1 ${dclBL.clause}
      `);
      disburseParams.push(...dclBL.params);
    }
    if (prod === "ALL" || prod === "EV") {
      disburseQueries.push(`
        SELECT IFNULL(SUM(loan_amount), 0) AS amount
        FROM loan_booking_ev
        WHERE 1=1 ${dclEV.clause}
      `);
      disburseParams.push(...dclEV.params);
    }
    if (prod === "ALL" || prod === "Adikosh") {
      const d = buildDateRangeClause("agreement_date", start, end);
      disburseQueries.push(`
        SELECT IFNULL(SUM(net_disbursement), 0) AS amount
        FROM loan_booking_adikosh
        WHERE 1=1 ${d.clause}
      `);
      disburseParams.push(...d.params);
    }
    if (prod === "ALL" || prod === "GQ Non-FSF") {
      const d = buildDateRangeClause("agreement_date", start, end);
      disburseQueries.push(`
        SELECT IFNULL(SUM(disbursal_amount), 0) AS amount
        FROM loan_booking_gq_non_fsf
        WHERE 1=1 ${d.clause}
      `);
      disburseParams.push(...d.params);
    }
    if (prod === "ALL" || prod === "GQ FSF") {
      const d = buildDateRangeClause("agreement_date", start, end);
      disburseQueries.push(`
        SELECT IFNULL(SUM(disbursal_amount), 0) AS amount
        FROM loan_booking_gq_fsf
        WHERE 1=1 ${d.clause}
      `);
      disburseParams.push(...d.params);
    }

    // TOTAL COLLECTED (P+I) IN RANGE
    if (prod === "ALL" || prod === "BL") {
      collectQueries.push(`
        SELECT IFNULL(SUM(r.transfer_amount), 0) AS amount
        FROM repayments_upload r
        JOIN loan_bookings b ON ${eqLan("b.lan", "r.lan")}
        WHERE r.payment_date IS NOT NULL
          ${pclR.clause}
      `);
      collectParams.push(...pclR.params);
    }
    if (prod === "ALL" || prod === "EV") {
      collectQueries.push(`
        SELECT IFNULL(SUM(r.transfer_amount), 0) AS amount
        FROM repayments_upload r
        JOIN loan_booking_ev e ON ${eqLan("e.lan", "r.lan")}
        WHERE r.payment_date IS NOT NULL
          ${pclR.clause}
      `);
      collectParams.push(...pclR.params);
    }
    if (prod === "ALL" || prod === "Adikosh") {
      collectQueries.push(`
        SELECT IFNULL(SUM(transfer_amount), 0) AS amount
        FROM repayments_upload_adikosh
        WHERE payment_date IS NOT NULL ${pclA.clause}
      `);
      collectParams.push(...pclA.params);
    }
    if (prod === "ALL" || prod === "GQ Non-FSF") {
      collectQueries.push(`
        SELECT IFNULL(SUM(transfer_amount), 0) AS amount
        FROM repayments_upload
        WHERE payment_date IS NOT NULL
          AND lan ${USE_COLLATE_IN_JOINS ? `COLLATE ${JOIN_COLLATE}` : ""} IN (
            SELECT lan ${USE_COLLATE_IN_JOINS ? `COLLATE ${JOIN_COLLATE}` : ""} FROM loan_booking_gq_non_fsf
          )
          ${pclA.clause}
      `);
      collectParams.push(...pclA.params);
    }
    if (prod === "ALL" || prod === "GQ FSF") {
      collectQueries.push(`
        SELECT IFNULL(SUM(transfer_amount), 0) AS amount
        FROM repayments_upload
        WHERE payment_date IS NOT NULL
          AND lan ${USE_COLLATE_IN_JOINS ? `COLLATE ${JOIN_COLLATE}` : ""} IN (
            SELECT lan ${USE_COLLATE_IN_JOINS ? `COLLATE ${JOIN_COLLATE}` : ""} FROM loan_booking_gq_fsf
          )
          ${pclA.clause}
      `);
      collectParams.push(...pclA.params);
    }

    // P&I collected IN RANGE (display only)
    // if (prod === "ALL" || prod === "BL") {
    //   const r = buildDateRangeClause("payment_date", start, end);
    //   pniRangeQueries.push(`
    //     SELECT IFNULL(SUM(principal),0) AS principal,
    //            IFNULL(SUM(interest),0)  AS interest
    //     FROM manual_rps_bl_loan
    //     WHERE payment_date IS NOT NULL ${r.clause}
    //   `);
    //   pniRangeParams.push(...r.params);
    // }
    // if (prod === "ALL" || prod === "EV") {
    //   const r = buildDateRangeClause("payment_date", start, end);
    //   pniRangeQueries.push(`
    //     SELECT IFNULL(SUM(principal),0) AS principal,
    //            IFNULL(SUM(interest),0)  AS interest
    //     FROM manual_rps_ev_loan
    //     WHERE payment_date IS NOT NULL ${r.clause}
    //   `);
    //   pniRangeParams.push(...r.params);
    // }
    // if (prod === "ALL" || prod === "Adikosh") {
    //   pniRangeQueries.push(`
    //     SELECT IFNULL(SUM(principal),0) AS principal,
    //            IFNULL(SUM(interest),0)  AS interest
    //     FROM manual_rps_adikosh
    //     WHERE payment_date IS NOT NULL ${pclA.clause}
    //   `);
    //   pniRangeParams.push(...pclA.params);
    // }
    // if (prod === "ALL" || prod === "GQ Non-FSF") {
    //   pniRangeQueries.push(`
    //     SELECT IFNULL(SUM(principal),0) AS principal,
    //            IFNULL(SUM(interest),0)  AS interest
    //     FROM manual_rps_gq_non_fsf
    //     WHERE payment_date IS NOT NULL ${pclA.clause}
    //   `);
    //   pniRangeParams.push(...pclA.params);
    // }
    // if (prod === "ALL" || prod === "GQ FSF") {
    //   pniRangeQueries.push(`
    //     SELECT IFNULL(SUM(principal),0) AS principal,
    //            IFNULL(SUM(interest),0)  AS interest
    //     FROM manual_rps_gq_fsf
    //     WHERE payment_date IS NOT NULL ${pclA.clause}
    //   `);
    //   pniRangeParams.push(...pclA.params);
    // }

    // P&I collected IN RANGE (display only)
if (prod === "ALL" || prod === "BL") {
  const r = buildDateRangeClause("bank_date_allocation", start, end);
  pniRangeQueries.push(`
    SELECT 
      IFNULL(SUM(CASE WHEN charge_type = 'Principal' THEN allocated_amount ELSE 0 END), 0) AS principal,
      IFNULL(SUM(CASE WHEN charge_type = 'Interest'  THEN allocated_amount ELSE 0 END), 0) AS interest
    FROM allocation
    WHERE allocation_date IS NOT NULL ${r.clause}
      AND lan LIKE 'BL%'
  `);
  pniRangeParams.push(...r.params);
}

if (prod === "ALL" || prod === "EV") {
  const r = buildDateRangeClause("bank_date_allocation", start, end);
  pniRangeQueries.push(`
    SELECT 
      IFNULL(SUM(CASE WHEN charge_type = 'Principal' THEN allocated_amount ELSE 0 END), 0) AS principal,
      IFNULL(SUM(CASE WHEN charge_type = 'Interest'  THEN allocated_amount ELSE 0 END), 0) AS interest
    FROM allocation
    WHERE allocation_date IS NOT NULL ${r.clause}
      AND lan LIKE 'EV%'
  `);
  pniRangeParams.push(...r.params);
}

if (prod === "ALL" || prod === "Adikosh") {
  const r = buildDateRangeClause("bank_date_allocation", start, end);
  pniRangeQueries.push(`
    SELECT 
      IFNULL(SUM(CASE WHEN charge_type = 'Principal' THEN allocated_amount ELSE 0 END), 0) AS principal,
      IFNULL(SUM(CASE WHEN charge_type = 'Interest'  THEN allocated_amount ELSE 0 END), 0) AS interest
    FROM allocation
    WHERE allocation_date IS NOT NULL ${r.clause}
      AND lan LIKE 'Adikosh%'
  `);
  pniRangeParams.push(...r.params);
}

if (prod === "ALL" || prod === "GQ Non-FSF") {
  const r = buildDateRangeClause("bank_date_allocation", start, end);
  pniRangeQueries.push(`
    SELECT 
      IFNULL(SUM(CASE WHEN charge_type = 'Principal' THEN allocated_amount ELSE 0 END), 0) AS principal,
      IFNULL(SUM(CASE WHEN charge_type = 'Interest'  THEN allocated_amount ELSE 0 END), 0) AS interest
    FROM allocation
    WHERE allocation_date IS NOT NULL ${r.clause}
      AND lan LIKE '%GQN%'
  `);
  pniRangeParams.push(...r.params);
}

if (prod === "ALL" || prod === "GQ FSF") {
  const r = buildDateRangeClause("bank_date_allocation", start, end);
  pniRangeQueries.push(`
    SELECT 
      IFNULL(SUM(CASE WHEN charge_type = 'Principal' THEN allocated_amount ELSE 0 END), 0) AS principal,
      IFNULL(SUM(CASE WHEN charge_type = 'Interest'  THEN allocated_amount ELSE 0 END), 0) AS interest
    FROM allocation
    WHERE allocation_date IS NOT NULL ${r.clause}
      AND lan LIKE '%GQF%'
  `);
  pniRangeParams.push(...r.params);
}




    // POS cutoff
    const jsToday = new Date().toISOString().slice(0, 10);
    const cutoff = end || jsToday;

    // principal-to-date (<= cutoff) restricted to cohort
    if (prod === "ALL" || prod === "BL") {
      const br = buildDateRangeClause("b.agreement_date", start, end);
      pToDateQueries.push(`
        SELECT IFNULL(SUM(rps.principal),0) AS principal
        FROM manual_rps_bl_loan rps
        JOIN loan_bookings b ON ${eqLan("b.lan", "rps.lan")}
        WHERE rps.payment_date IS NOT NULL
          AND rps.payment_date < ?
          ${br.clause}
      `);
      pToDateParams.push(cutoff, ...br.params);
    }
    if (prod === "ALL" || prod === "EV") {
      const br = buildDateRangeClause("e.agreement_date", start, end);
      pToDateQueries.push(`
        SELECT IFNULL(SUM(rps.principal),0) AS principal
        FROM manual_rps_ev_loan rps
        JOIN loan_booking_ev e ON ${eqLan("e.lan", "rps.lan")}
        WHERE rps.payment_date IS NOT NULL
          AND rps.payment_date < ?
          ${br.clause}
      `);
      pToDateParams.push(cutoff, ...br.params);
    }
    if (prod === "ALL" || prod === "Adikosh") {
      const br = buildDateRangeClause("b.agreement_date", start, end);
      pToDateQueries.push(`
        SELECT IFNULL(SUM(rps.principal),0) AS principal
        FROM manual_rps_adikosh rps
        JOIN loan_booking_adikosh b ON ${eqLan("b.lan", "rps.lan")}
        WHERE rps.payment_date IS NOT NULL
          AND rps.payment_date < ?
          ${br.clause}
      `);
      pToDateParams.push(cutoff, ...br.params);
    }
    if (prod === "ALL" || prod === "GQ Non-FSF") {
      const br = buildDateRangeClause("b.agreement_date", start, end);
      pToDateQueries.push(`
        SELECT IFNULL(SUM(rps.principal),0) AS principal
        FROM manual_rps_gq_non_fsf rps
        JOIN loan_booking_gq_non_fsf b ON ${eqLan("b.lan", "rps.lan")}
        WHERE rps.payment_date IS NOT NULL
          AND rps.payment_date < ?
          ${br.clause}
      `);
      pToDateParams.push(cutoff, ...br.params);
    }
    if (prod === "ALL" || prod === "GQ FSF") {
      const br = buildDateRangeClause("b.agreement_date", start, end);
      pToDateQueries.push(`
        SELECT IFNULL(SUM(rps.principal),0) AS principal
        FROM manual_rps_gq_fsf rps
        JOIN loan_booking_gq_fsf b ON ${eqLan("b.lan", "rps.lan")}
        WHERE rps.payment_date IS NOT NULL
          AND rps.payment_date < ?
          ${br.clause}
      `);
      pToDateParams.push(cutoff, ...br.params);
    }

    const [
      [disbRows],
      [collRows],
      [pniRangeRows],
      [pToDateRows],
    ] = await Promise.all([
      db.promise().query(disburseQueries.join(" UNION ALL "), disburseParams),
      db.promise().query(collectQueries.join(" UNION ALL "), collectParams),
      db.promise().query(pniRangeQueries.join(" UNION ALL "), pniRangeParams),
      db.promise().query(pToDateQueries.join(" UNION ALL "), pToDateParams),
    ]);

    const totalDisbursed  = disbRows.reduce((s, r) => s + Number(r.amount || 0), 0);
    const totalCollected  = collRows.reduce((s, r) => s + Number(r.amount || 0), 0);
    const totalPrincipal  = pniRangeRows.reduce((s, r) => s + Number(r.principal || 0), 0);
    const totalInterest   = pniRangeRows.reduce((s, r) => s + Number(r.interest || 0), 0);
    const principalToDate = pToDateRows.reduce((s, r) => s + Number(r.principal || 0), 0);

    const principalOutstanding = Math.max(totalDisbursed - principalToDate, 0);
    const collectionRate = totalDisbursed ? (totalCollected / totalDisbursed) * 100 : 0;

    res.json({
      totalDisbursed,
      totalCollected,
      collectionRate,
      totalPrincipal,
      totalInterest,
      principalOutstanding,
      interestOutstanding: 0,
      posOutstanding: principalOutstanding,
    });
  } catch (err) {
    console.error("❌ Metric Card Fetch Error:", err);
    res.status(500).json({ error: "Failed to fetch metrics" });
  }
});

/** -------------------- DPD Buckets -------------------- */
router.post("/dpd-buckets", async (req, res) => {
  try {
    const { product } = req.body || {};
    const prod = normalizeProduct(product);

    const unions = [];
    const OUTSTANDING = `rps.status <> 'Paid' AND rps.due_date < CURDATE()`;
    const BUCKET_ORDER = `'0','0-30','30-60','60-90','90+'`;

    const branch = (rpsTable, bookTable) => `
      SELECT
        CASE
          WHEN t.max_dpd = 0 THEN '0'
          WHEN t.max_dpd BETWEEN 1 AND 30 THEN '0-30'
          WHEN t.max_dpd BETWEEN 31 AND 60 THEN '30-60'
          WHEN t.max_dpd BETWEEN 61 AND 90 THEN '60-90'
          ELSE '90+'
        END AS bucket,
        COUNT(*) AS loans,
        SUM(CASE WHEN t.max_dpd = 0 THEN 0 ELSE t.overdue_emi END) AS overdue_emi
      FROM (
        SELECT rps.lan,
               MAX(CASE WHEN ${OUTSTANDING}
                        THEN IFNULL(rps.dpd, DATEDIFF(CURDATE(), rps.due_date))
                        ELSE 0 END) AS max_dpd,
               SUM(CASE WHEN ${OUTSTANDING} THEN IFNULL(rps.emi,0) ELSE 0 END) AS overdue_emi
        FROM ${rpsTable} rps
        JOIN ${bookTable} b
          ON ${eqLan("b.lan", "rps.lan")}
        GROUP BY rps.lan
      ) t
      GROUP BY bucket
    `;

    if (prod === "ALL" || prod === "BL") unions.push(branch("manual_rps_bl_loan", "loan_bookings"));
    if (prod === "ALL" || prod === "EV") unions.push(branch("manual_rps_ev_loan", "loan_booking_ev"));
    if (prod === "ALL" || prod === "Adikosh") unions.push(branch("manual_rps_adikosh", "loan_booking_adikosh"));
    if (prod === "ALL" || prod === "GQ Non-FSF") unions.push(branch("manual_rps_gq_non_fsf", "loan_booking_gq_non_fsf"));
    if (prod === "ALL" || prod === "GQ FSF") unions.push(branch("manual_rps_gq_fsf", "loan_booking_gq_fsf"));

    if (!unions.length)
      return res.json({ buckets: [], asOf: new Date().toISOString().slice(0, 10) });

    const sql = `
      SELECT bucket, SUM(loans) AS loans, SUM(overdue_emi) AS overdue_emi
      FROM ( ${unions.join(" UNION ALL ")} ) x
      GROUP BY bucket
      ORDER BY FIELD(bucket, ${BUCKET_ORDER})
    `;
    const [rows] = await db.promise().query(sql);

    const map = {
      "0":     { bucket: "0",     loans: 0, overdue_emi: 0 },
      "0-30":  { bucket: "0-30",  loans: 0, overdue_emi: 0 },
      "30-60": { bucket: "30-60", loans: 0, overdue_emi: 0 },
      "60-90": { bucket: "60-90", loans: 0, overdue_emi: 0 },
      "90+":   { bucket: "90+",   loans: 0, overdue_emi: 0 },
    };
    rows.forEach((r) => (map[r.bucket] = r));

    res.json({
      buckets: [map["0"], map["0-30"], map["30-60"], map["60-90"], map["90+"]],
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
      sortDir: sortDirRaw
    } = req.body || {};

    // --- config ---
    const JOIN_COLLATE = "utf8mb4_unicode_ci";
    const OUT_COLLATE  = "utf8mb4_unicode_ci";

    // normalize product
    const normalizeProduct = (p) => {
      if (!p || p === "ALL") return "ALL";
      const s = String(p).toLowerCase().replace(/\s+/g, "").replace(/-/g, "");
      if (s === "evloan" || s === "ev_loan") return "EV";
      if (s === "blloan" || s === "bl_loan") return "BL";
      if (s === "adikosh") return "Adikosh";
      if (s === "gqnonfsf" || s === "gqnon-fsf") return "GQ Non-FSF";
      if (s === "gqfsf" || s === "gq-fsf") return "GQ FSF";
      return p;
    };

    const prod = normalizeProduct(product);

    // pagination
    const page     = Math.max(1, parseInt(pageRaw || 1, 10));
    const pageSize = Math.min(200, Math.max(1, parseInt(pageSizeRaw || 25, 10)));
    const offset   = (page - 1) * pageSize;

    // --- Bucket -> inline HAVING (no placeholders to avoid param bleeding in UNION) ---
    const ranges = { "0-30": [1, 30], "30-60": [31, 60], "60-90": [61, 90] };
    let havingStr = "";
    if (bucket === "0") {
      havingStr = "HAVING max_dpd = 0";
    } else if (bucket === "90+") {
      havingStr = "HAVING max_dpd >= 91";
    } else if (ranges[bucket]) {
      const [minDPD, maxDPD] = ranges[bucket];
      havingStr = `HAVING max_dpd BETWEEN ${Number(minDPD)} AND ${Number(maxDPD)}`;
    } else {
      return res.status(400).json({ error: "Invalid bucket" });
    }
    const isZero = bucket === "0";

    // helper: fixed “out” (SELECT) collations
    const outProduct = (label) =>
      `CAST('${label}' AS CHAR CHARACTER SET utf8mb4) COLLATE ${OUT_COLLATE}`;

    const outLan = (expr) =>
      // if any source columns are not utf8mb4, use CONVERT(... USING utf8mb4) first:
      `CAST(${expr} AS CHAR) COLLATE ${OUT_COLLATE}`;

    const outName = (expr) =>
      `CAST(${expr} AS CHAR) COLLATE ${OUT_COLLATE}`;

    // Build one product branch. We:
    // - GROUP BY rps.lan
    // - output lan as MAX(rps.lan) collated (value is identical per group)
    // - output customer_name as MAX(b.customer_name) collated
    const branch = ({ label, rpsTable, bookTable }) => `
      SELECT ${outProduct(label)} AS product, q.*
      FROM (
        SELECT
          /* normalized outputs */
          ${outLan("MAX(rps.lan)")}            AS lan,
          ${outName("MAX(b.customer_name)")}   AS customer_name,

          ${isZero
            ? `MAX(CASE WHEN rps.status <> 'Paid' AND rps.due_date < CURDATE()
                        THEN IFNULL(rps.dpd, DATEDIFF(CURDATE(), rps.due_date))
                        ELSE 0 END)`
            : `MAX(IFNULL(rps.dpd, DATEDIFF(CURDATE(), rps.due_date)))`
          } AS max_dpd,

          ${isZero
            ? `SUM(CASE WHEN rps.status <> 'Paid' AND rps.due_date < CURDATE() THEN IFNULL(rps.emi,0)       ELSE 0 END)`
            : `SUM(IFNULL(rps.emi,0))`
          } AS overdue_emi,

          ${isZero
            ? `SUM(CASE WHEN rps.status <> 'Paid' AND rps.due_date < CURDATE() THEN IFNULL(rps.principal,0) ELSE 0 END)`
            : `SUM(IFNULL(rps.principal,0))`
          } AS overdue_principal,

          ${isZero
            ? `SUM(CASE WHEN rps.status <> 'Paid' AND rps.due_date < CURDATE() THEN IFNULL(rps.interest,0)  ELSE 0 END)`
            : `SUM(IFNULL(rps.interest,0))`
          } AS overdue_interest,

          ${isZero
            ? `MAX(CASE WHEN rps.status <> 'Paid' AND rps.due_date < CURDATE() THEN rps.due_date ELSE NULL END)`
            : `MAX(rps.due_date)`
          } AS last_due_date,

          /* POS via fast correlated subquery (index: (payment_date, lan)) */
          (SELECT SUM(IFNULL(p.principal,0))
             FROM ${rpsTable} p
            WHERE p.lan COLLATE ${JOIN_COLLATE} = rps.lan COLLATE ${JOIN_COLLATE}
              AND (p.payment_date IS NULL OR p.payment_date >= CURDATE())
          ) AS pos_principal,

          d.disb_date AS disbursement_date,
          DATEDIFF(CURDATE(), d.disb_date) AS ageing_days

        FROM ${rpsTable} rps
        JOIN ${bookTable} b
          ON b.lan COLLATE ${JOIN_COLLATE} = rps.lan COLLATE ${JOIN_COLLATE}
        LEFT JOIN d
          ON d.lan COLLATE ${JOIN_COLLATE} = rps.lan COLLATE ${JOIN_COLLATE}
        ${isZero ? "" : `WHERE rps.status <> 'Paid' AND rps.due_date < CURDATE()`}
        GROUP BY rps.lan
        ${havingStr}
      ) q
    `;

    const branches = [];
    if (prod === "ALL" || prod === "EV")
      branches.push(branch({ label: "Malhotra EV", rpsTable: "manual_rps_ev_loan",      bookTable: "loan_booking_ev" }));
    if (prod === "ALL" || prod === "BL")
      branches.push(branch({ label: "UB Loan",      rpsTable: "manual_rps_bl_loan",      bookTable: "loan_bookings" }));
    if (prod === "ALL" || prod === "Adikosh")
      branches.push(branch({ label: "Adikosh",      rpsTable: "manual_rps_adikosh",      bookTable: "loan_booking_adikosh" }));
    if (prod === "ALL" || prod === "GQ Non-FSF")
      branches.push(branch({ label: "GQ Non-FSF",   rpsTable: "manual_rps_gq_non_fsf",   bookTable: "loan_booking_gq_non_fsf" }));
    if (prod === "ALL" || prod === "GQ FSF")
      branches.push(branch({ label: "GQ FSF",       rpsTable: "manual_rps_gq_fsf",       bookTable: "loan_booking_gq_fsf" }));

    if (!branches.length) {
      return res.json({ rows: [], pagination: { page, pageSize, total: 0 } });
    }

    // Sorting (whitelist)
    const SORT_MAP = {
      pos: "pos_principal",
      emi: "overdue_emi",
      dpd: "max_dpd",
      due: "last_due_date",
      ageing: "ageing_days",
      // you can also expose 'name'/'lan' if required later
    };
    const sortKey = (typeof sortByRaw === "string" ? sortByRaw.toLowerCase() : "dpd");
    const sortCol = SORT_MAP[sortKey] || SORT_MAP.dpd;
    const sortDir = (String(sortDirRaw || "desc").toLowerCase() === "asc") ? "ASC" : "DESC";

    // stable tie-breakers
    const ties = [];
    if (sortCol !== "max_dpd")       ties.push("max_dpd DESC");
    if (sortCol !== "last_due_date") ties.push("last_due_date DESC");
    ties.push("lan ASC");
    const orderClause = `ORDER BY ${sortCol} ${sortDir}${ties.length ? ", " + ties.join(", ") : ""}`;

    // One pass with CTE for disbursement min-date (visible to all branches)
    const sql = `
      WITH d AS (
        SELECT lan, MIN(Disbursement_Date) AS disb_date
        FROM ev_disbursement_utr
        GROUP BY lan
      )
      SELECT *
      FROM (
        SELECT q.*, COUNT(*) OVER() AS total_rows
        FROM (
          ${branches.join(" UNION ALL ")}
        ) q
      ) z
      ${orderClause}
      LIMIT ? OFFSET ?
    `;

    const [pageRows] = await db.promise().query(sql, [pageSize, offset]);
    const total = pageRows.length ? Number(pageRows[0].total_rows) : 0;
    const rows  = pageRows.map(({ total_rows, ...r }) => r);

    res.json({ rows, pagination: { page, pageSize, total } });
  } catch (err) {
    console.error("❌ DPD List Error:", err);
    res.status(500).json({ error: "Failed to fetch DPD list" });
  }
});


/** -------------------- Export current DPD page via email -------------------- */
router.post("/dpd-export-email", async (req, res) => {
  try {
    const { userId: userIdFromBody, product, bucket, page, rows } = req.body || {};
    const userId = req.user?.id || userIdFromBody;
    if (!userId) return res.status(400).json({ error: "Missing userId" });

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: "No rows to export" });
    }

    // recipient
    const [[u]] = await db.promise().query(
      "SELECT email, name FROM users WHERE id = ? LIMIT 1",
      [userId]
    );
    if (!u?.email) return res.status(404).json({ error: "User email not found" });

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

    const header = columns.map(c => c.header);
    const dataRows = rows.map(r => ([
      r.lan ?? "",
      r.customer_name ?? "",
      r.product ?? "",
      Number(r.max_dpd ?? 0),
      Number(r.overdue_emi ?? 0),
      Number(r.overdue_principal ?? 0),
      Number(r.overdue_interest ?? 0),
      Number(r.pos_principal ?? 0)
    ]));

    const ws = XLSX.utils.aoa_to_sheet([header, ...dataRows]);
    for (let r = 1; r <= dataRows.length; r++) {
      for (const c of [3,4,5,6]) {
        const addr = XLSX.utils.encode_cell({ r, c });
        if (ws[addr]) { ws[addr].t = "n"; ws[addr].z = "#,##0"; }
      }
    }
    ws["!cols"] = header.map((h, i) => ({
      wch: Math.min(40, Math.max(12,
        String(h).length + 2,
        ...dataRows.map(row => (row[i] ? String(row[i]).length + 2 : 0))
      ))
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
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });

    await transporter.sendMail({
      from: process.env.FROM_EMAIL || "no-reply@yourdomain.com",
      to: u.email,
      subject: `DPD report — ${product} ${bucket} (page ${page || 1})`,
      text: `Hi ${u.name || ""},\n\nAttached is your DPD report (${filename}).`,
      html: `<p>Hi ${u.name || ""},</p><p>Attached is your DPD report:</p><p><b>${filename}</b></p>`,
      attachments: [{ filename, content: buf, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }]
    });

    res.json({ ok: true, sentTo: u.email });
  } catch (err) {
    console.error("❌ dpd-export-email error:", err);
    res.status(500).json({ error: "Failed to email report" });
  }
});

module.exports = router;
