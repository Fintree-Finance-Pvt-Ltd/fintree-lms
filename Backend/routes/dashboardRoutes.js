// const express = require("express");
// const db = require("../config/db");
// const router = express.Router();

// /* -------------------------- DISBURSAL TREND -------------------------- */
// router.post("/disbursal-trend", async (req, res) => {
//   try {
//     const { product: rawProduct, from, to } = req.body;

//     const product = rawProduct && rawProduct.trim();
//     const conditions = [];
//     const params = [];

//     // Only filter loan_bookings (EV/BL live there)
//     if (product && product !== "ALL" && product !== "Adikosh" && product !== "GQ Non-FSF") {
//       conditions.push("lender COLLATE utf8mb4_unicode_ci = ?");
//       params.push(product); // 'EV_loan' or 'BL_loan'
//     }

//     if (from) { conditions.push("DATE_FORMAT(agreement_date, '%Y-%m') >= ?"); params.push(from); }
//     if (to)   { conditions.push("DATE_FORMAT(agreement_date, '%Y-%m') <= ?"); params.push(to); }

//     const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
//     const queries = [];

//     // EV / BL
//     if (!product || product === "ALL" || product === "EV_loan" || product === "BL_loan") {
//       queries.push(`
//         SELECT DATE_FORMAT(agreement_date, '%Y-%m') AS month,
//                lender AS product,
//                SUM(loan_amount) AS total_disbursed
//         FROM loan_bookings
//         ${where}
//         GROUP BY DATE_FORMAT(agreement_date, '%Y-%m'), lender
//       `);
//     }

//     // Adikosh
//     if (!product || product === "ALL" || product === "Adikosh") {
//       const adikoshConds = [];
//       const adikoshParams = [];
//       if (from) { adikoshConds.push("DATE_FORMAT(agreement_date, '%Y-%m') >= ?"); adikoshParams.push(from); }
//       if (to)   { adikoshConds.push("DATE_FORMAT(agreement_date, '%Y-%m') <= ?"); adikoshParams.push(to); }

//       queries.push(`
//         SELECT DATE_FORMAT(agreement_date, '%Y-%m') AS month,
//                'Adikosh' AS product,
//                SUM(loan_amount) AS total_disbursed
//         FROM loan_booking_adikosh
//         ${adikoshConds.length ? `WHERE ${adikoshConds.join(" AND ")}` : ""}
//         GROUP BY DATE_FORMAT(agreement_date, '%Y-%m')
//       `);
//       params.push(...adikoshParams);
//     }

//     // GQ Non-FSF
//     if (!product || product === "ALL" || product === "GQ Non-FSF") {
//       const gqConds = [];
//       const gqParams = [];
//       if (from) { gqConds.push("DATE_FORMAT(agreement_date, '%Y-%m') >= ?"); gqParams.push(from); }
//       if (to)   { gqConds.push("DATE_FORMAT(agreement_date, '%Y-%m') <= ?"); gqParams.push(to); }

//       queries.push(`
//         SELECT DATE_FORMAT(agreement_date, '%Y-%m') AS month,
//                'GQ Non-FSF' AS product,
//                SUM(loan_amount) AS total_disbursed
//         FROM loan_booking_gq_non_fsf
//         ${gqConds.length ? `WHERE ${gqConds.join(" AND ")}` : ""}
//         GROUP BY DATE_FORMAT(agreement_date, '%Y-%m')
//       `);
//       params.push(...gqParams);
//     }

//     const finalQuery = queries.join(" UNION ALL ");
//     const [rows] = await db.promise().query(finalQuery, params);
//     res.json(rows);
//   } catch (err) {
//     console.error("❌ Disbursal Trend Error:", err);
//     res.status(500).json({ error: "Disbursal trend fetch failed" });
//   }
// });

// /* -------------------------- REPAYMENT TREND -------------------------- */
// router.post("/repayment-trend", async (req, res) => {
//   try {
//     const { product, from, to } = req.body;
//     const queries = [];
//     const allParams = [];

//     const getRepaymentConditionsAndParams = () => {
//       const currentConditions = ["payment_date IS NOT NULL"];
//       const currentParams = [];
//       if (from) { currentConditions.push("DATE_FORMAT(payment_date, '%Y-%m') >= ?"); currentParams.push(from); }
//       if (to)   { currentConditions.push("DATE_FORMAT(payment_date, '%Y-%m') <= ?"); currentParams.push(to); }
//       return { currentConditions, currentParams };
//     };

//     // EV / BL
//     if (!product || product === "ALL" || product === "EV_loan" || product === "BL_loan") {
//       const { currentConditions, currentParams } = getRepaymentConditionsAndParams();
//       const lenderFilter = (!product || product === "ALL")
//         ? "l.lender COLLATE utf8mb4_unicode_ci IN (?, ?)"
//         : "l.lender COLLATE utf8mb4_unicode_ci = ?";

//       queries.push(`
//         SELECT DATE_FORMAT(r.payment_date, '%Y-%m') AS month,
//                l.lender AS product,
//                SUM(r.transfer_amount) AS total_collected
//         FROM repayments_upload r
//         JOIN loan_bookings l
//           ON l.lan COLLATE utf8mb4_unicode_ci = r.lan COLLATE utf8mb4_unicode_ci
//         WHERE ${lenderFilter} AND ${currentConditions.join(" AND ")}
//         GROUP BY DATE_FORMAT(r.payment_date, '%Y-%m'), l.lender
//       `);

//       if (!product || product === "ALL") { allParams.push("EV_loan", "BL_loan"); }
//       else { allParams.push(product); }
//       allParams.push(...currentParams);
//     }

//     // Adikosh
//     if (!product || product === "ALL" || product === "Adikosh") {
//       const { currentConditions, currentParams } = getRepaymentConditionsAndParams();
//       queries.push(`
//         SELECT DATE_FORMAT(payment_date, '%Y-%m') AS month,
//                'Adikosh' AS product,
//                SUM(transfer_amount) AS total_collected
//         FROM repayments_upload_adikosh
//         WHERE ${currentConditions.join(" AND ")}
//         GROUP BY DATE_FORMAT(payment_date, '%Y-%m')
//       `);
//       allParams.push(...currentParams);
//     }

//     // GQ Non-FSF
//     if (!product || product === "ALL" || product === "GQ Non-FSF") {
//       const { currentConditions, currentParams } = getRepaymentConditionsAndParams();
//       queries.push(`
//         SELECT DATE_FORMAT(payment_date, '%Y-%m') AS month,
//                'GQ Non-FSF' AS product,
//                SUM(transfer_amount) AS total_collected
//         FROM repayments_upload
//         WHERE lan COLLATE utf8mb4_unicode_ci IN (
//                 SELECT lan COLLATE utf8mb4_unicode_ci FROM loan_booking_gq_non_fsf
//               )
//           AND ${currentConditions.join(" AND ")}
//         GROUP BY DATE_FORMAT(payment_date, '%Y-%m')
//       `);
//       allParams.push(...currentParams);
//     }

//     const finalQuery = queries.join(" UNION ALL ");
//     const [rows] = await db.promise().query(finalQuery, allParams);
//     res.json(rows);
//   } catch (err) {
//     console.error("❌ Repayment Trend Error:", err);
//     res.status(500).json({ error: "Repayment trend fetch failed" });
//   }
// });

// /* -------------------------- COLLECTION VS DUE -------------------------- */
// router.post("/collection-vs-due", async (req, res) => {
//   try {
//     const { product, from, to } = req.body;

//     const queries = [];
//     const allParams = [];

//     const getDueConditions = () => {
//       const conditions = ["due_date < CURDATE()"];
//       const params = [];
//       if (from) { conditions.push("DATE_FORMAT(due_date, '%Y-%m') >= ?"); params.push(from); }
//       if (to)   { conditions.push("DATE_FORMAT(due_date, '%Y-%m') <= ?"); params.push(to); }
//       return { conditions, params };
//     };

//     // Due amounts
//     if (!product || product === "ALL" || product === "EV_loan") {
//       const { conditions, params } = getDueConditions();
//       queries.push(`
//         SELECT DATE_FORMAT(due_date, '%Y-%m') AS month,
//                'EV_loan' AS product,
//                SUM(emi) AS total_due,
//                0 AS total_collected
//         FROM manual_rps_ev_loan
//         WHERE ${conditions.join(" AND ")}
//         GROUP BY DATE_FORMAT(due_date, '%Y-%m')
//       `);
//       allParams.push(...params);
//     }

//     if (!product || product === "ALL" || product === "Adikosh") {
//       const { conditions, params } = getDueConditions();
//       queries.push(`
//         SELECT DATE_FORMAT(due_date, '%Y-%m') AS month,
//                'Adikosh' AS product,
//                SUM(emi) AS total_due,
//                0 AS total_collected
//         FROM manual_rps_adikosh
//         WHERE ${conditions.join(" AND ")}
//         GROUP BY DATE_FORMAT(due_date, '%Y-%m')
//       `);
//       allParams.push(...params);
//     }

//     if (!product || product === "ALL" || product === "GQ Non-FSF") {
//       const { conditions, params } = getDueConditions();
//       queries.push(`
//         SELECT DATE_FORMAT(due_date, '%Y-%m') AS month,
//                'GQ Non-FSF' AS product,
//                SUM(emi) AS total_due,
//                0 AS total_collected
//         FROM manual_rps_gq_non_fsf
//         WHERE ${conditions.join(" AND ")}
//         GROUP BY DATE_FORMAT(due_date, '%Y-%m')
//       `);
//       allParams.push(...params);
//     }

//     // Collected amounts
//     const getPayConditions = () => {
//       const conditions = ["payment_date IS NOT NULL", "payment_date < CURDATE()"];
//       const params = [];
//       if (from) { conditions.push("DATE_FORMAT(payment_date, '%Y-%m') >= ?"); params.push(from); }
//       if (to)   { conditions.push("DATE_FORMAT(payment_date, '%Y-%m') <= ?"); params.push(to); }
//       return { conditions, params };
//     };

//     if (!product || product === "ALL" || product === "EV_loan" || product === "BL_loan") {
//       const { conditions, params } = getPayConditions();
//       const lenderFilter = (!product || product === "ALL")
//         ? "l.lender COLLATE utf8mb4_unicode_ci IN (?, ?)"
//         : "l.lender COLLATE utf8mb4_unicode_ci = ?";

//       queries.push(`
//         SELECT DATE_FORMAT(r.payment_date, '%Y-%m') AS month,
//                l.lender AS product,
//                0 AS total_due,
//                SUM(r.transfer_amount) AS total_collected
//         FROM repayments_upload r
//         JOIN loan_bookings l
//           ON l.lan COLLATE utf8mb4_unicode_ci = r.lan COLLATE utf8mb4_unicode_ci
//         WHERE ${lenderFilter} AND ${conditions.join(" AND ")}
//         GROUP BY DATE_FORMAT(r.payment_date, '%Y-%m'), l.lender
//       `);

//       if (!product || product === "ALL") { allParams.push("EV_loan", "BL_loan"); }
//       else { allParams.push(product); }
//       allParams.push(...params);
//     }

//     if (!product || product === "ALL" || product === "Adikosh") {
//       const { conditions, params } = getPayConditions();
//       queries.push(`
//         SELECT DATE_FORMAT(payment_date, '%Y-%m') AS month,
//                'Adikosh' AS product,
//                0 AS total_due,
//                SUM(transfer_amount) AS total_collected
//         FROM repayments_upload_adikosh
//         WHERE ${conditions.join(" AND ")}
//         GROUP BY DATE_FORMAT(payment_date, '%Y-%m')
//       `);
//       allParams.push(...params);
//     }

//     if (!product || product === "ALL" || product === "GQ Non-FSF") {
//       const { conditions, params } = getPayConditions();
//       queries.push(`
//         SELECT DATE_FORMAT(payment_date, '%Y-%m') AS month,
//                'GQ Non-FSF' AS product,
//                0 AS total_due,
//                SUM(transfer_amount) AS total_collected
//         FROM repayments_upload
//         WHERE lan COLLATE utf8mb4_unicode_ci IN (
//                 SELECT lan COLLATE utf8mb4_unicode_ci FROM loan_booking_gq_non_fsf
//               )
//           AND ${conditions.join(" AND ")}
//         GROUP BY DATE_FORMAT(payment_date, '%Y-%m')
//       `);
//       allParams.push(...params);
//     }

//     const finalQuery = queries.join(" UNION ALL ");
//     const [rows] = await db.promise().query(finalQuery, allParams);
//     res.json(rows);
//   } catch (err) {
//     console.error("❌ Collection vs Due Error:", err);
//     res.status(500).json({ error: "Collection vs Due fetch failed" });
//   }
// });

// /* -------------------------- PRODUCT DISTRIBUTION -------------------------- */
// router.post("/product-distribution", async (req, res) => {
//   const { from, to } = req.body;

//   try {
//     const conditions = [];
//     const params = [];

//     if (from) { conditions.push(`DATE_FORMAT(agreement_date, '%Y-%m') >= ?`); params.push(from); }
//     if (to)   { conditions.push(`DATE_FORMAT(agreement_date, '%Y-%m') <= ?`); params.push(to); }

//     const whereClause = conditions.length ? "WHERE " + conditions.join(" AND ") : "";

//     const query = `
//       SELECT lender AS product, COUNT(*) AS value
//       FROM loan_bookings ${whereClause}
//       GROUP BY lender
//       UNION ALL
//       SELECT 'Adikosh' AS product, COUNT(*) AS value
//       FROM loan_booking_adikosh ${whereClause}
//       UNION ALL
//       SELECT 'GQ Non-FSF' AS product, COUNT(*) AS value
//       FROM loan_booking_gq_non_fsf ${whereClause}
//     `;

//     const [rows] = await db.promise().query(query, [...params, ...params, ...params]);

//     const productMap = {};
//     rows.forEach(({ product, value }) => {
//       if (!productMap[product]) productMap[product] = 0;
//       productMap[product] += value;
//     });

//     const result = Object.entries(productMap).map(([product, value]) => ({ product, value }));
//     res.json(result);
//   } catch (err) {
//     console.error("❌ Product Distribution Error:", err);
//     res.status(500).json({ error: "Internal Server Error" });
//   }
// });

// router.post("/metric-cards", async (req, res) => {
//   const { product, from, to } = req.body;

//   const getDateFilter = (field, paramArray) => {
//     let clause = "";
//     if (from && from.trim()) { clause += ` AND DATE_FORMAT(${field}, '%Y-%m') >= ?`; paramArray.push(from); }
//     if (to && to.trim())     { clause += ` AND DATE_FORMAT(${field}, '%Y-%m') <= ?`; paramArray.push(to); }
//     return clause;
//   };

//   const disburseParams = [];
//   const collectParams  = [];
//   const disburseQueries = [];
//   const collectQueries  = [];

//   // --- Disbursed (EV/BL in loan_bookings) ---
//   if (!product || product === "ALL" || product === "EV_loan" || product === "BL_loan") {
//     let lenderFilter;
//     if (!product || product === "ALL") {
//       lenderFilter = "lender COLLATE utf8mb4_unicode_ci IN (?, ?)";
//       disburseParams.push("EV_loan", "BL_loan");
//     } else {
//       lenderFilter = "lender COLLATE utf8mb4_unicode_ci = ?";
//       disburseParams.push(product); // 'EV_loan' OR 'BL_loan'
//     }

//     disburseQueries.push(`
//       SELECT IFNULL(SUM(loan_amount), 0) AS amount
//       FROM loan_bookings
//       WHERE ${lenderFilter} ${getDateFilter("agreement_date", disburseParams)}
//     `);
//   }

//   if (!product || product === "ALL" || product === "Adikosh") {
//     disburseQueries.push(`
//       SELECT IFNULL(SUM(loan_amount), 0) AS amount
//       FROM loan_booking_adikosh
//       WHERE 1 ${getDateFilter("agreement_date", disburseParams)}
//     `);
//   }

//   if (!product || product === "ALL" || product === "GQ Non-FSF") {
//     disburseQueries.push(`
//       SELECT IFNULL(SUM(loan_amount), 0) AS amount
//       FROM loan_booking_gq_non_fsf
//       WHERE 1 ${getDateFilter("agreement_date", disburseParams)}
//     `);
//   }

//   // --- Collected ---
//   if (!product || product === "ALL" || product === "EV_loan" || product === "BL_loan") {
//     let lenderFilter;
//     if (!product || product === "ALL") {
//       lenderFilter = "l.lender COLLATE utf8mb4_unicode_ci IN (?, ?)";
//       collectParams.push("EV_loan", "BL_loan");
//     } else {
//       lenderFilter = "l.lender COLLATE utf8mb4_unicode_ci = ?";
//       collectParams.push(product);
//     }

//     collectQueries.push(`
//       SELECT IFNULL(SUM(r.transfer_amount), 0) AS amount
//       FROM repayments_upload r
//       JOIN loan_bookings l ON l.lan = r.lan
//       WHERE ${lenderFilter} AND r.payment_date IS NOT NULL ${getDateFilter("r.payment_date", collectParams)}
//     `);
//   }

//   if (!product || product === "ALL" || product === "Adikosh") {
//     collectQueries.push(`
//       SELECT IFNULL(SUM(transfer_amount), 0) AS amount
//       FROM repayments_upload_adikosh
//       WHERE payment_date IS NOT NULL ${getDateFilter("payment_date", collectParams)}
//     `);
//   }

//   if (!product || product === "ALL" || product === "GQ Non-FSF") {
//     // Collate lan on both sides to the same collation to avoid cross-table mismatch
//     collectQueries.push(`
//       SELECT IFNULL(SUM(transfer_amount), 0) AS amount
//       FROM repayments_upload
//       WHERE payment_date IS NOT NULL
//         AND lan COLLATE utf8mb4_unicode_ci IN (
//           SELECT lan COLLATE utf8mb4_unicode_ci FROM loan_booking_gq_non_fsf
//         )
//         ${getDateFilter("payment_date", collectParams)}
//     `);
//   }

//   try {
//     const [disbursedQueryResponse, collectedQueryResponse] = await Promise.all([
//       db.promise().query(disburseQueries.join(" UNION ALL "), disburseParams),
//       db.promise().query(collectQueries.join(" UNION ALL "), collectParams),
//     ]);

//     const disbursedRows = disbursedQueryResponse[0];
//     const collectedRows = collectedQueryResponse[0];

//     const totalDisbursed = disbursedRows.reduce((s, r) => s + Number(r.amount || 0), 0);
//     const totalCollected = collectedRows.reduce((s, r) => s + Number(r.amount || 0), 0);
//     const collectionRate = totalDisbursed === 0 ? 0 : (totalCollected / totalDisbursed) * 100;

//     res.json({ totalDisbursed, totalCollected, collectionRate });
//   } catch (err) {
//     console.error("❌ Metric Card Fetch Error:", err);
//     res.status(500).json({ error: "Failed to fetch metrics" });
//   }
// });



// module.exports = router;



//////////////////////////////////////////working till 25-08-2025/////////////////////////////

// const express = require("express");
// const db = require("../config/db");
// const router = express.Router();

// /* -------------------------- DISBURSAL TREND -------------------------- */
// router.post("/disbursal-trend", async (req, res) => {
//   try {
//     const { product: rawProduct, from, to } = req.body;

//     const product = rawProduct && rawProduct.trim();
//     const conditions = [];
//     const params = [];

//     // Only filter loan_bookings (EV/BL live there)
//     if (product && product !== "ALL" && product !== "Adikosh" && product !== "GQ Non-FSF") {
//       conditions.push("lender COLLATE utf8mb4_unicode_ci = ?");
//       params.push(product); // 'EV_loan' or 'BL_loan'
//     }

//     if (from) { conditions.push("DATE_FORMAT(agreement_date, '%Y-%m') >= ?"); params.push(from); }
//     if (to)   { conditions.push("DATE_FORMAT(agreement_date, '%Y-%m') <= ?"); params.push(to); }

//     const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
//     const queries = [];

//     // EV / BL
//     if (!product || product === "ALL" || product === "EV_loan" || product === "BL_loan") {
//       queries.push(`
//         SELECT DATE_FORMAT(agreement_date, '%Y-%m') AS month,
//                lender AS product,
//                SUM(loan_amount) AS total_disbursed
//         FROM loan_bookings
//         ${where}
//         GROUP BY DATE_FORMAT(agreement_date, '%Y-%m'), lender
//       `);
//     }

//     // Adikosh
//     if (!product || product === "ALL" || product === "Adikosh") {
//       const adikoshConds = [];
//       const adikoshParams = [];
//       if (from) { adikoshConds.push("DATE_FORMAT(agreement_date, '%Y-%m') >= ?"); adikoshParams.push(from); }
//       if (to)   { adikoshConds.push("DATE_FORMAT(agreement_date, '%Y-%m') <= ?"); adikoshParams.push(to); }

//       queries.push(`
//         SELECT DATE_FORMAT(agreement_date, '%Y-%m') AS month,
//                'Adikosh' AS product,
//                SUM(loan_amount) AS total_disbursed
//         FROM loan_booking_adikosh
//         ${adikoshConds.length ? `WHERE ${adikoshConds.join(" AND ")}` : ""}
//         GROUP BY DATE_FORMAT(agreement_date, '%Y-%m')
//       `);
//       params.push(...adikoshParams);
//     }

//     // GQ Non-FSF
//     if (!product || product === "ALL" || product === "GQ Non-FSF") {
//       const gqConds = [];
//       const gqParams = [];
//       if (from) { gqConds.push("DATE_FORMAT(agreement_date, '%Y-%m') >= ?"); gqParams.push(from); }
//       if (to)   { gqConds.push("DATE_FORMAT(agreement_date, '%Y-%m') <= ?"); gqParams.push(to); }

//       queries.push(`
//         SELECT DATE_FORMAT(agreement_date, '%Y-%m') AS month,
//                'GQ Non-FSF' AS product,
//                SUM(loan_amount) AS total_disbursed
//         FROM loan_booking_gq_non_fsf
//         ${gqConds.length ? `WHERE ${gqConds.join(" AND ")}` : ""}
//         GROUP BY DATE_FORMAT(agreement_date, '%Y-%m')
//       `);
//       params.push(...gqParams);
//     }

//     const finalQuery = queries.join(" UNION ALL ");
//     const [rows] = await db.promise().query(finalQuery, params);
//     res.json(rows);
//   } catch (err) {
//     console.error("Disbursal Trend Error:", err);
//     res.status(500).json({ error: "Disbursal trend fetch failed" });
//   }
// });

/* -------------------------- REPAYMENT TREND -------------------------- */
// router.post("/repayment-trend", async (req, res) => {
//   try {
//     const { product, from, to } = req.body;
//     const queries = [];
//     const allParams = [];

//     const getRepaymentConditionsAndParams = () => {
//       const currentConditions = ["payment_date IS NOT NULL"];
//       const currentParams = [];
//       if (from) { currentConditions.push("DATE_FORMAT(payment_date, '%Y-%m') >= ?"); currentParams.push(from); }
//       if (to)   { currentConditions.push("DATE_FORMAT(payment_date, '%Y-%m') <= ?"); currentParams.push(to); }
//       return { currentConditions, currentParams };
//     };

//     // EV / BL
//     if (!product || product === "ALL" || product === "EV_loan" || product === "BL_loan") {
//       const { currentConditions, currentParams } = getRepaymentConditionsAndParams();
//       const lenderFilter = (!product || product === "ALL")
//         ? "l.lender COLLATE utf8mb4_unicode_ci IN (?, ?)"
//         : "l.lender COLLATE utf8mb4_unicode_ci = ?";

//       queries.push(`
//         SELECT DATE_FORMAT(r.payment_date, '%Y-%m') AS month,
//                l.lender COLLATE utf8mb4_unicode_ci AS product,
//                SUM(r.transfer_amount) AS total_collected
//         FROM repayments_upload r
//         JOIN loan_bookings l
//           ON l.lan COLLATE utf8mb4_unicode_ci = r.lan COLLATE utf8mb4_unicode_ci
//         WHERE ${lenderFilter} AND ${currentConditions.join(" AND ")}
//         GROUP BY DATE_FORMAT(r.payment_date, '%Y-%m'), l.lender
//       `);

//       if (!product || product === "ALL") { allParams.push("EV_loan", "BL_loan"); }
//       else { allParams.push(product); }
//       allParams.push(...currentParams);
//     }

//     // Adikosh
//     if (!product || product === "ALL" || product === "Adikosh") {
//       const { currentConditions, currentParams } = getRepaymentConditionsAndParams();
//       queries.push(`
//         SELECT DATE_FORMAT(payment_date, '%Y-%m') AS month,
//                'Adikosh' AS product,
//                SUM(transfer_amount) AS total_collected
//         FROM repayments_upload_adikosh
//         WHERE ${currentConditions.join(" AND ")}
//         GROUP BY DATE_FORMAT(payment_date, '%Y-%m')
//       `);
//       allParams.push(...currentParams);
//     }

//     // GQ Non-FSF
//     if (!product || product === "ALL" || product === "GQ Non-FSF") {
//       const { currentConditions, currentParams } = getRepaymentConditionsAndParams();
//       queries.push(`
//         SELECT DATE_FORMAT(payment_date, '%Y-%m') AS month,
//                'GQ Non-FSF' AS product,
//                SUM(transfer_amount) AS total_collected
//         FROM repayments_upload
//         WHERE lan COLLATE utf8mb4_unicode_ci IN (
//                 SELECT lan COLLATE utf8mb4_unicode_ci FROM loan_booking_gq_non_fsf
//               )
//           AND ${currentConditions.join(" AND ")}
//         GROUP BY DATE_FORMAT(payment_date, '%Y-%m')
//       `);
//       allParams.push(...currentParams);
//     }

//     const finalQuery = queries.join(" UNION ALL ");
//     const [rows] = await db.promise().query(finalQuery, allParams);
//     res.json(rows);
//   } catch (err) {
//     console.error("Repayment Trend Error:", err);
//     res.status(500).json({ error: "Repayment trend fetch failed" });
//   }
// });

// /* -------------------------- COLLECTION VS DUE -------------------------- */
// router.post("/collection-vs-due", async (req, res) => {
//   try {
//     const { product, from, to } = req.body;

//     const queries = [];
//     const allParams = [];

//     const getDueConditions = () => {
//       const conditions = ["due_date < CURDATE()"];
//       const params = [];
//       if (from) { conditions.push("DATE_FORMAT(due_date, '%Y-%m') >= ?"); params.push(from); }
//       if (to)   { conditions.push("DATE_FORMAT(due_date, '%Y-%m') <= ?"); params.push(to); }
//       return { conditions, params };
//     };

//     // Due amounts
//     if (!product || product === "ALL" || product === "EV_loan") {
//       const { conditions, params } = getDueConditions();
//       queries.push(`
//         SELECT DATE_FORMAT(due_date, '%Y-%m') AS month,
//                'EV_loan' AS product,
//                SUM(emi) AS total_due,
//                0 AS total_collected
//         FROM manual_rps_ev_loan
//         WHERE ${conditions.join(" AND ")}
//         GROUP BY DATE_FORMAT(due_date, '%Y-%m')
//       `);
//       allParams.push(...params);
//     }

//     if (!product || product === "ALL" || product === "Adikosh") {
//       const { conditions, params } = getDueConditions();
//       queries.push(`
//         SELECT DATE_FORMAT(due_date, '%Y-%m') AS month,
//                'Adikosh' AS product,
//                SUM(emi) AS total_due,
//                0 AS total_collected
//         FROM manual_rps_adikosh
//         WHERE ${conditions.join(" AND ")}
//         GROUP BY DATE_FORMAT(due_date, '%Y-%m')
//       `);
//       allParams.push(...params);
//     }

//     if (!product || product === "ALL" || product === "GQ Non-FSF") {
//       const { conditions, params } = getDueConditions();
//       queries.push(`
//         SELECT DATE_FORMAT(due_date, '%Y-%m') AS month,
//                'GQ Non-FSF' AS product,
//                SUM(emi) AS total_due,
//                0 AS total_collected
//         FROM manual_rps_gq_non_fsf
//         WHERE ${conditions.join(" AND ")}
//         GROUP BY DATE_FORMAT(due_date, '%Y-%m')
//       `);
//       allParams.push(...params);
//     }

//     // Collected amounts
//     const getPayConditions = () => {
//       const conditions = ["payment_date IS NOT NULL", "payment_date < CURDATE()"];
//       const params = [];
//       if (from) { conditions.push("DATE_FORMAT(payment_date, '%Y-%m') >= ?"); params.push(from); }
//       if (to)   { conditions.push("DATE_FORMAT(payment_date, '%Y-%m') <= ?"); params.push(to); }
//       return { conditions, params };
//     };

//     if (!product || product === "ALL" || product === "EV_loan" || product === "BL_loan") {
//       const { conditions, params } = getPayConditions();
//       const lenderFilter = (!product || product === "ALL")
//         ? "l.lender COLLATE utf8mb4_unicode_ci IN (?, ?)"
//         : "l.lender COLLATE utf8mb4_unicode_ci = ?";

//       queries.push(`
//         SELECT DATE_FORMAT(r.payment_date, '%Y-%m') AS month,
//                l.lender COLLATE utf8mb4_unicode_ci AS product,
//                0 AS total_due,
//                SUM(r.transfer_amount) AS total_collected
//         FROM repayments_upload r
//         JOIN loan_bookings l
//           ON l.lan COLLATE utf8mb4_unicode_ci = r.lan COLLATE utf8mb4_unicode_ci
//         WHERE ${lenderFilter} AND ${conditions.join(" AND ")}
//         GROUP BY DATE_FORMAT(r.payment_date, '%Y-%m'), l.lender
//       `);

//       if (!product || product === "ALL") { allParams.push("EV_loan", "BL_loan"); }
//       else { allParams.push(product); }
//       allParams.push(...params);
//     }

//     if (!product || product === "ALL" || product === "Adikosh") {
//       const { conditions, params } = getPayConditions();
//       queries.push(`
//         SELECT DATE_FORMAT(payment_date, '%Y-%m') AS month,
//                'Adikosh' AS product,
//                0 AS total_due,
//                SUM(transfer_amount) AS total_collected
//         FROM repayments_upload_adikosh
//         WHERE ${conditions.join(" AND ")}
//         GROUP BY DATE_FORMAT(payment_date, '%Y-%m')
//       `);
//       allParams.push(...params);
//     }

//     if (!product || product === "ALL" || product === "GQ Non-FSF") {
//       const { conditions, params } = getPayConditions();
//       queries.push(`
//         SELECT DATE_FORMAT(payment_date, '%Y-%m') AS month,
//                'GQ Non-FSF' AS product,
//                0 AS total_due,
//                SUM(transfer_amount) AS total_collected
//         FROM repayments_upload
//         WHERE lan COLLATE utf8mb4_unicode_ci IN (
//                 SELECT lan COLLATE utf8mb4_unicode_ci FROM loan_booking_gq_non_fsf
//               )
//           AND ${conditions.join(" AND ")}
//         GROUP BY DATE_FORMAT(payment_date, '%Y-%m')
//       `);
//       allParams.push(...params);
//     }

//     const finalQuery = queries.join(" UNION ALL ");
//     const [rows] = await db.promise().query(finalQuery, allParams);
//     res.json(rows);
//   } catch (err) {
//     console.error("Collection vs Due Error:", err);
//     res.status(500).json({ error: "Collection vs Due fetch failed" });
//   }
// });

// /* -------------------------- PRODUCT DISTRIBUTION -------------------------- */
// router.post("/product-distribution", async (req, res) => {
//   const { from, to } = req.body;

//   try {
//     const conditions = [];
//     const params = [];

//     if (from) { conditions.push(`DATE_FORMAT(agreement_date, '%Y-%m') >= ?`); params.push(from); }
//     if (to)   { conditions.push(`DATE_FORMAT(agreement_date, '%Y-%m') <= ?`); params.push(to); }

//     const whereClause = conditions.length ? "WHERE " + conditions.join(" AND ") : "";

//     const query = `
//       SELECT lender COLLATE utf8mb4_unicode_ci AS product, COUNT(*) AS value
//       FROM loan_bookings ${whereClause}
//       GROUP BY lender
//       UNION ALL
//       SELECT 'Adikosh' AS product, COUNT(*) AS value
//       FROM loan_booking_adikosh ${whereClause}
//       UNION ALL
//       SELECT 'GQ Non-FSF' AS product, COUNT(*) AS value
//       FROM loan_booking_gq_non_fsf ${whereClause}
//     `;

//     const [rows] = await db.promise().query(query, [...params, ...params, ...params]);

//     const productMap = {};
//     rows.forEach(({ product, value }) => {
//       if (!productMap[product]) productMap[product] = 0;
//       productMap[product] += value;
//     });

//     const result = Object.entries(productMap).map(([product, value]) => ({ product, value }));
//     res.json(result);
//   } catch (err) {
//     console.error("Product Distribution Error:", err);
//     res.status(500).json({ error: "Internal Server Error" });
//   }
// });

// router.post("/metric-cards", async (req, res) => {
//   const { product, from, to } = req.body;

//   const getDateFilter = (field, paramArray) => {
//     let clause = "";
//     if (from && from.trim()) { clause += ` AND DATE_FORMAT(${field}, '%Y-%m') >= ?`; paramArray.push(from); }
//     if (to && to.trim())     { clause += ` AND DATE_FORMAT(${field}, '%Y-%m') <= ?`; paramArray.push(to); }
//     return clause;
//   };

//   const disburseParams = [];
//   const collectParams  = [];
//   const disburseQueries = [];
//   const collectQueries  = [];

//   // --- Disbursed (EV/BL in loan_bookings) ---
//   if (!product || product === "ALL" || product === "EV_loan" || product === "BL_loan") {
//     let lenderFilter;
//     if (!product || product === "ALL") {
//       lenderFilter = "lender COLLATE utf8mb4_unicode_ci IN (?, ?)";
//       disburseParams.push("EV_loan", "BL_loan");
//     } else {
//       lenderFilter = "lender COLLATE utf8mb4_unicode_ci = ?";
//       disburseParams.push(product); // 'EV_loan' OR 'BL_loan'
//     }

//     disburseQueries.push(`
//       SELECT IFNULL(SUM(loan_amount), 0) AS amount
//       FROM loan_bookings
//       WHERE ${lenderFilter} ${getDateFilter("agreement_date", disburseParams)}
//     `);
//   }

//   if (!product || product === "ALL" || product === "Adikosh") {
//     disburseQueries.push(`
//       SELECT IFNULL(SUM(loan_amount), 0) AS amount
//       FROM loan_booking_adikosh
//       WHERE 1 ${getDateFilter("agreement_date", disburseParams)}
//     `);
//   }

//   if (!product || product === "ALL" || product === "GQ Non-FSF") {
//     disburseQueries.push(`
//       SELECT IFNULL(SUM(loan_amount), 0) AS amount
//       FROM loan_booking_gq_non_fsf
//       WHERE 1 ${getDateFilter("agreement_date", disburseParams)}
//     `);
//   }

//   // --- Collected ---
//   if (!product || product === "ALL" || product === "EV_loan" || product === "BL_loan") {
//     let lenderFilter;
//     if (!product || product === "ALL") {
//       lenderFilter = "l.lender COLLATE utf8mb4_unicode_ci IN (?, ?)";
//       collectParams.push("EV_loan", "BL_loan");
//     } else {
//       lenderFilter = "l.lender COLLATE utf8mb4_unicode_ci = ?";
//       collectParams.push(product);
//     }

//     collectQueries.push(`
//       SELECT IFNULL(SUM(r.transfer_amount), 0) AS amount
//       FROM repayments_upload r
//       JOIN loan_bookings l ON l.lan COLLATE utf8mb4_unicode_ci = r.lan COLLATE utf8mb4_unicode_ci
//       WHERE ${lenderFilter} AND r.payment_date IS NOT NULL ${getDateFilter("r.payment_date", collectParams)}
//     `);
//   }

//   if (!product || product === "ALL" || product === "Adikosh") {
//     collectQueries.push(`
//       SELECT IFNULL(SUM(transfer_amount), 0) AS amount
//       FROM repayments_upload_adikosh
//       WHERE payment_date IS NOT NULL ${getDateFilter("payment_date", collectParams)}
//     `);
//   }

//   if (!product || product === "ALL" || product === "GQ Non-FSF") {
//     collectQueries.push(`
//       SELECT IFNULL(SUM(transfer_amount), 0) AS amount
//       FROM repayments_upload
//       WHERE payment_date IS NOT NULL
//         AND lan COLLATE utf8mb4_unicode_ci IN (
//           SELECT lan COLLATE utf8mb4_unicode_ci FROM loan_booking_gq_non_fsf
//         )
//         ${getDateFilter("payment_date", collectParams)}
//     `);
//   }

//   try {
//     const [disbursedQueryResponse, collectedQueryResponse] = await Promise.all([
//       db.promise().query(disburseQueries.join(" UNION ALL "), disburseParams),
//       db.promise().query(collectQueries.join(" UNION ALL "), collectParams),
//     ]);

//     const disbursedRows = disbursedQueryResponse[0];
//     const collectedRows = collectedQueryResponse[0];

//     const totalDisbursed = disbursedRows.reduce((s, r) => s + Number(r.amount || 0), 0);
//     const totalCollected = collectedRows.reduce((s, r) => s + Number(r.amount || 0), 0);
//     const collectionRate = totalDisbursed === 0 ? 0 : (totalCollected / totalDisbursed) * 100;

//     res.json({ totalDisbursed, totalCollected, collectionRate });
//   } catch (err) {
//     console.error("Metric Card Fetch Error:", err);
//     res.status(500).json({ error: "Failed to fetch metrics" });
//   }
// });

// module.exports = router;




//////////////////////////////////////////working end till 25-08-2025/////////////////////////////

const express = require("express");
const db = require("../config/db");
const router = express.Router();

/* -------------------- Helpers -------------------- */

// Accepts 'YYYY-MM' and returns ['YYYY-MM-01', 'YYYY-(MM+1)-01'] (end exclusive)
function monthRange(from, to) {
  const nextMonth = (ym) => {
    const [y, m] = ym.split("-").map(Number);
    const ny = m === 12 ? y + 1 : y;
    const nm = m === 12 ? 1 : m + 1;
    return `${ny}-${String(nm).padStart(2, "0")}-01`;
  };
  const start = from && from.trim() ? `${from.trim()}-01` : null;
  const end = to && to.trim() ? nextMonth(to.trim()) : null;
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

// Normalize product values coming from UI
function normalizeProduct(p) {
  if (!p || p === "ALL") return "ALL";
  const s = String(p).toLowerCase().replace(/\s+/g, "").replace(/-/g, "");
  if (s === "evloan" || s === "ev_loan") return "EV";
  if (s === "blloan" || s === "bl_loan") return "BL";
  if (s === "adikosh") return "Adikosh";
  if (s === "gqnonfsf" || s === "gqnon-fsf") return "GQ Non-FSF";
  return p;
}

// Support both space and underscore spellings in DB
const EV_LABELS = ["EV Loan", "EV_loan"];
const BL_LABELS = ["BL Loan", "BL_loan"];
const ALL_LENDERS = [...EV_LABELS, ...BL_LABELS];

/* -------------------- Routes -------------------- */

/** Disbursal Trend */
router.post("/disbursal-trend", async (req, res) => {
  try {
    const { product, from, to } = req.body || {};
    const prod = normalizeProduct(product);
    const { start, end } = monthRange(from, to);

    const queries = [];
    const params = [];

    // loan_bookings (EV/BL from the same table)
    if (prod === "ALL" || prod === "EV" || prod === "BL") {
      const lenders =
        prod === "EV" ? EV_LABELS : prod === "BL" ? BL_LABELS : ALL_LENDERS;
      const placeholders = lenders.map(() => "?").join(",");
      const { clause, params: dps } = buildDateRangeClause(
        "agreement_date",
        start,
        end
      );
      queries.push(`
        SELECT DATE_FORMAT(agreement_date, '%Y-%m') AS month,
               lender AS product,
               SUM(loan_amount) AS total_disbursed
        FROM loan_bookings
        WHERE lender IN (${placeholders}) ${clause}
        GROUP BY DATE_FORMAT(agreement_date, '%Y-%m'), lender
      `);
      params.push(...lenders, ...dps);
    }

    // Adikosh
    if (prod === "ALL" || prod === "Adikosh") {
      const { clause, params: dps } = buildDateRangeClause(
        "agreement_date",
        start,
        end
      );
      queries.push(`
        SELECT DATE_FORMAT(agreement_date, '%Y-%m') AS month,
               'Adikosh' AS product,
               SUM(loan_amount) AS total_disbursed
        FROM loan_booking_adikosh
        WHERE 1=1 ${clause}
        GROUP BY DATE_FORMAT(agreement_date, '%Y-%m')
      `);
      params.push(...dps);
    }

    // GQ Non-FSF
    if (prod === "ALL" || prod === "GQ Non-FSF") {
      const { clause, params: dps } = buildDateRangeClause(
        "agreement_date",
        start,
        end
      );
      queries.push(`
        SELECT DATE_FORMAT(agreement_date, '%Y-%m') AS month,
               'GQ Non-FSF' AS product,
               SUM(loan_amount) AS total_disbursed
        FROM loan_booking_gq_non_fsf
        WHERE 1=1 ${clause}
        GROUP BY DATE_FORMAT(agreement_date, '%Y-%m')
      `);
      params.push(...dps);
    }

    const sql = queries.join(" UNION ALL ") + " ORDER BY month, product";
    const [rows] = await db.promise().query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error("❌ Disbursal Trend Error:", err);
    res.status(500).json({ error: "Disbursal trend fetch failed" });
  }
});

/** Repayment Trend */
router.post("/repayment-trend", async (req, res) => {
  try {
    const { product, from, to } = req.body || {};
    const prod = normalizeProduct(product);
    const { start, end } = monthRange(from, to);

    const queries = [];
    const params = [];

    const dateR = buildDateRangeClause("r.payment_date", start, end);
    const dateA = buildDateRangeClause("payment_date", start, end);

    // EV/BL from repayments_upload joined to loan_bookings
    if (prod === "ALL" || prod === "EV" || prod === "BL") {
      const lenders =
        prod === "EV" ? EV_LABELS : prod === "BL" ? BL_LABELS : ALL_LENDERS;
      const placeholders = lenders.map(() => "?").join(",");
      queries.push(`
        SELECT DATE_FORMAT(r.payment_date, '%Y-%m') AS month,
               l.lender AS product,
               SUM(r.transfer_amount) AS total_collected
        FROM repayments_upload r
        JOIN loan_bookings l ON l.lan = r.lan
        WHERE r.payment_date IS NOT NULL
          AND l.lender IN (${placeholders})
          ${dateR.clause}
        GROUP BY DATE_FORMAT(r.payment_date, '%Y-%m'), l.lender
      `);
      params.push(...lenders, ...dateR.params);
    }

    // Adikosh
    if (prod === "ALL" || prod === "Adikosh") {
      queries.push(`
        SELECT DATE_FORMAT(payment_date, '%Y-%m') AS month,
               'Adikosh' AS product,
               SUM(transfer_amount) AS total_collected
        FROM repayments_upload_adikosh
        WHERE payment_date IS NOT NULL
          ${dateA.clause}
        GROUP BY DATE_FORMAT(payment_date, '%Y-%m')
      `);
      params.push(...dateA.params);
    }

    // GQ Non-FSF
    if (prod === "ALL" || prod === "GQ Non-FSF") {
      queries.push(`
        SELECT DATE_FORMAT(payment_date, '%Y-%m') AS month,
               'GQ Non-FSF' AS product,
               SUM(transfer_amount) AS total_collected
        FROM repayments_upload
        WHERE payment_date IS NOT NULL
          AND lan IN (SELECT lan FROM loan_booking_gq_non_fsf)
          ${dateA.clause}
        GROUP BY DATE_FORMAT(payment_date, '%Y-%m')
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

/** Collection vs Due */
router.post("/collection-vs-due", async (req, res) => {
  try {
    const { product, from, to } = req.body || {};
    const prod = normalizeProduct(product);
    const { start, end } = monthRange(from, to);

    const queries = [];
    const params = [];

    const dueR = buildDateRangeClause("due_date", start, end);
    const payR = buildDateRangeClause("payment_date", start, end);

    // DUE: EV (add BL dues table here if you have one)
    if (prod === "ALL" || prod === "EV") {
      queries.push(`
        SELECT DATE_FORMAT(due_date, '%Y-%m') AS month,
               'EV Loan' AS product,
               SUM(emi) AS total_due,
               0 AS total_collected
        FROM manual_rps_ev_loan
        WHERE due_date < CURDATE() ${dueR.clause}
        GROUP BY DATE_FORMAT(due_date, '%Y-%m')
      `);
      params.push(...dueR.params);
    }

    // DUE: Adikosh
    if (prod === "ALL" || prod === "Adikosh") {
      queries.push(`
        SELECT DATE_FORMAT(due_date, '%Y-%m') AS month,
               'Adikosh' AS product,
               SUM(emi) AS total_due,
               0 AS total_collected
        FROM manual_rps_adikosh
        WHERE due_date < CURDATE() ${dueR.clause}
        GROUP BY DATE_FORMAT(due_date, '%Y-%m')
      `);
      params.push(...dueR.params);
    }

    // DUE: GQ Non-FSF
    if (prod === "ALL" || prod === "GQ Non-FSF") {
      queries.push(`
        SELECT DATE_FORMAT(due_date, '%Y-%m') AS month,
               'GQ Non-FSF' AS product,
               SUM(emi) AS total_due,
               0 AS total_collected
        FROM manual_rps_gq_non_fsf
        WHERE due_date < CURDATE() ${dueR.clause}
        GROUP BY DATE_FORMAT(due_date, '%Y-%m')
      `);
      params.push(...dueR.params);
    }

    // COLLECTED: EV/BL
    if (prod === "ALL" || prod === "EV" || prod === "BL") {
      const lenders =
        prod === "EV" ? EV_LABELS : prod === "BL" ? BL_LABELS : ALL_LENDERS;
      const placeholders = lenders.map(() => "?").join(",");
      queries.push(`
        SELECT DATE_FORMAT(r.payment_date, '%Y-%m') AS month,
               l.lender AS product,
               0 AS total_due,
               SUM(r.transfer_amount) AS total_collected
        FROM repayments_upload r
        JOIN loan_bookings l ON l.lan = r.lan
        WHERE r.payment_date IS NOT NULL
          AND r.payment_date < CURDATE()
          AND l.lender IN (${placeholders})
          ${buildDateRangeClause("r.payment_date", start, end).clause}
        GROUP BY DATE_FORMAT(r.payment_date, '%Y-%m'), l.lender
      `);
      params.push(
        ...lenders,
        ...buildDateRangeClause("r.payment_date", start, end).params
      );
    }

    // COLLECTED: Adikosh
    if (prod === "ALL" || prod === "Adikosh") {
      queries.push(`
        SELECT DATE_FORMAT(payment_date, '%Y-%m') AS month,
               'Adikosh' AS product,
               0 AS total_due,
               SUM(transfer_amount) AS total_collected
        FROM repayments_upload_adikosh
        WHERE payment_date IS NOT NULL
          AND payment_date < CURDATE() ${payR.clause}
        GROUP BY DATE_FORMAT(payment_date, '%Y-%m')
      `);
      params.push(...payR.params);
    }

    // COLLECTED: GQ Non-FSF
    if (prod === "ALL" || prod === "GQ Non-FSF") {
      queries.push(`
        SELECT DATE_FORMAT(payment_date, '%Y-%m') AS month,
               'GQ Non-FSF' AS product,
               0 AS total_due,
               SUM(transfer_amount) AS total_collected
        FROM repayments_upload
        WHERE payment_date IS NOT NULL
          AND payment_date < CURDATE()
          AND lan IN (SELECT lan FROM loan_booking_gq_non_fsf)
          ${payR.clause}
        GROUP BY DATE_FORMAT(payment_date, '%Y-%m')
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

/** Product Distribution */
router.post("/product-distribution", async (req, res) => {
  const { from, to } = req.body || {};
  try {
    const { start, end } = monthRange(from, to);

    const wcLB = buildDateRangeClause("agreement_date", start, end);
    const wcAK = buildDateRangeClause("agreement_date", start, end);
    const wcGQ = buildDateRangeClause("agreement_date", start, end);

    const sql = `
      SELECT lender AS product, COUNT(*) AS value
      FROM loan_bookings
      WHERE 1=1 ${wcLB.clause}
      GROUP BY lender

      UNION ALL

      SELECT 'Adikosh' AS product, COUNT(*) AS value
      FROM loan_booking_adikosh
      WHERE 1=1 ${wcAK.clause}

      UNION ALL

      SELECT 'GQ Non-FSF' AS product, COUNT(*) AS value
      FROM loan_booking_gq_non_fsf
      WHERE 1=1 ${wcGQ.clause}
    `;

    const params = [...wcLB.params, ...wcAK.params, ...wcGQ.params];
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

/** Metric Cards */
router.post("/metric-cards", async (req, res) => {
  try {
    const { product, from, to } = req.body || {};
    const prod = normalizeProduct(product);
    const { start, end } = monthRange(from, to);

    const disburseQueries = [];
    const disburseParams = [];
    const collectQueries = [];
    const collectParams = [];

    const dcl = buildDateRangeClause("agreement_date", start, end);
    const pclR = buildDateRangeClause("r.payment_date", start, end);
    const pclA = buildDateRangeClause("payment_date", start, end);

    // Disbursed: EV/BL from loan_bookings
    if (prod === "ALL" || prod === "EV" || prod === "BL") {
      const lenders =
        prod === "EV" ? EV_LABELS : prod === "BL" ? BL_LABELS : ALL_LENDERS;
      const placeholders = lenders.map(() => "?").join(",");
      disburseQueries.push(`
        SELECT IFNULL(SUM(loan_amount), 0) AS amount
        FROM loan_bookings
        WHERE lender IN (${placeholders}) ${dcl.clause}
      `);
      disburseParams.push(...lenders, ...dcl.params);
    }

    // Disbursed: Adikosh
    if (prod === "ALL" || prod === "Adikosh") {
      disburseQueries.push(`
        SELECT IFNULL(SUM(loan_amount), 0) AS amount
        FROM loan_booking_adikosh
        WHERE 1=1 ${dcl.clause}
      `);
      disburseParams.push(...dcl.params);
    }

    // Disbursed: GQ Non-FSF
    if (prod === "ALL" || prod === "GQ Non-FSF") {
      disburseQueries.push(`
        SELECT IFNULL(SUM(loan_amount), 0) AS amount
        FROM loan_booking_gq_non_fsf
        WHERE 1=1 ${dcl.clause}
      `);
      disburseParams.push(...dcl.params);
    }

    // Collected: EV/BL
    if (prod === "ALL" || prod === "EV" || prod === "BL") {
      const lenders =
        prod === "EV" ? EV_LABELS : prod === "BL" ? BL_LABELS : ALL_LENDERS;
      const placeholders = lenders.map(() => "?").join(",");
      collectQueries.push(`
        SELECT IFNULL(SUM(r.transfer_amount), 0) AS amount
        FROM repayments_upload r
        JOIN loan_bookings l ON l.lan = r.lan
        WHERE r.payment_date IS NOT NULL
          AND l.lender IN (${placeholders})
          ${pclR.clause}
      `);
      collectParams.push(...lenders, ...pclR.params);
    }

    // Collected: Adikosh
    if (prod === "ALL" || prod === "Adikosh") {
      collectQueries.push(`
        SELECT IFNULL(SUM(transfer_amount), 0) AS amount
        FROM repayments_upload_adikosh
        WHERE payment_date IS NOT NULL ${pclA.clause}
      `);
      collectParams.push(...pclA.params);
    }

    // Collected: GQ Non-FSF
    if (prod === "ALL" || prod === "GQ Non-FSF") {
      collectQueries.push(`
        SELECT IFNULL(SUM(transfer_amount), 0) AS amount
        FROM repayments_upload
        WHERE payment_date IS NOT NULL
          AND lan IN (SELECT lan FROM loan_booking_gq_non_fsf)
          ${pclA.clause}
      `);
      collectParams.push(...pclA.params);
    }

    const [[disbRows], [collRows]] = await Promise.all([
      db.promise().query(disburseQueries.join(" UNION ALL "), disburseParams),
      db.promise().query(collectQueries.join(" UNION ALL "), collectParams),
    ]);

    const totalDisbursed = disbRows.reduce((s, r) => s + Number(r.amount || 0), 0);
    const totalCollected = collRows.reduce((s, r) => s + Number(r.amount || 0), 0);
    const collectionRate = totalDisbursed ? (totalCollected / totalDisbursed) * 100 : 0;

    res.json({ totalDisbursed, totalCollected, collectionRate });
  } catch (err) {
    console.error("❌ Metric Card Fetch Error:", err);
    res.status(500).json({ error: "Failed to fetch metrics" });
  }
});

module.exports = router;



// const express = require("express");
// const db = require("../config/db");
// const router = express.Router();

// /* -------------------------- DISBURSAL TREND -------------------------- */
// router.post("/disbursal-trend", async (req, res) => {
//   try {
//     const { product: rawProduct, from, to } = req.body;

//     const product = rawProduct && rawProduct.trim();
//     const conditions = [];
//     const params = [];

//     // Only filter loan_bookings (EV/BL live there)
//     if (product && product !== "ALL" && product !== "Adikosh" && product !== "GQ Non-FSF") {
//       conditions.push("lender COLLATE utf8mb4_unicode_ci = ?");
//       params.push(product); // 'EV_loan' or 'BL_loan'
//     }

//     if (from) { conditions.push("DATE_FORMAT(agreement_date, '%Y-%m') >= ?"); params.push(from); }
//     if (to)   { conditions.push("DATE_FORMAT(agreement_date, '%Y-%m') <= ?"); params.push(to); }

//     const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
//     const queries = [];

//     // EV / BL
//     if (!product || product === "ALL" || product === "EV_loan" || product === "BL_loan") {
//       queries.push(`
//         SELECT DATE_FORMAT(agreement_date, '%Y-%m') AS month,
//                lender COLLATE utf8mb4_unicode_ci AS product,
//                SUM(loan_amount) AS total_disbursed
//         FROM loan_bookings
//         ${where}
//         GROUP BY DATE_FORMAT(agreement_date, '%Y-%m'), lender
//       `);
//     }

//     // Adikosh
//     if (!product || product === "ALL" || product === "Adikosh") {
//       const adikoshConds = [];
//       const adikoshParams = [];
//       if (from) { adikoshConds.push("DATE_FORMAT(agreement_date, '%Y-%m') >= ?"); adikoshParams.push(from); }
//       if (to)   { adikoshConds.push("DATE_FORMAT(agreement_date, '%Y-%m') <= ?"); adikoshParams.push(to); }

//       queries.push(`
//         SELECT DATE_FORMAT(agreement_date, '%Y-%m') AS month,
//                'Adikosh' AS product,
//                SUM(loan_amount) AS total_disbursed
//         FROM loan_booking_adikosh
//         ${adikoshConds.length ? `WHERE ${adikoshConds.join(" AND ")}` : ""}
//         GROUP BY DATE_FORMAT(agreement_date, '%Y-%m')
//       `);
//       params.push(...adikoshParams);
//     }

//     // GQ Non-FSF
//     if (!product || product === "ALL" || product === "GQ Non-FSF") {
//       const gqConds = [];
//       const gqParams = [];
//       if (from) { gqConds.push("DATE_FORMAT(agreement_date, '%Y-%m') >= ?"); gqParams.push(from); }
//       if (to)   { gqConds.push("DATE_FORMAT(agreement_date, '%Y-%m') <= ?"); gqParams.push(to); }

//       queries.push(`
//         SELECT DATE_FORMAT(agreement_date, '%Y-%m') AS month,
//                'GQ Non-FSF' AS product,
//                SUM(loan_amount) AS total_disbursed
//         FROM loan_booking_gq_non_fsf
//         ${gqConds.length ? `WHERE ${gqConds.join(" AND ")}` : ""}
//         GROUP BY DATE_FORMAT(agreement_date, '%Y-%m')
//       `);
//       params.push(...gqParams);
//     }

//     const finalQuery = queries.join(" UNION ALL ");
//     const [rows] = await db.promise().query(finalQuery, params);
//     res.json(rows);
//   } catch (err) {
//     console.error("❌ Disbursal Trend Error:", err);
//     res.status(500).json({ error: "Disbursal trend fetch failed" });
//   }
// });

// /* -------------------------- REPAYMENT TREND -------------------------- */
// router.post("/repayment-trend", async (req, res) => {
//   try {
//     const { product, from, to } = req.body;
//     const queries = [];
//     const allParams = [];

//     const getRepaymentConditionsAndParams = () => {
//       const currentConditions = ["payment_date IS NOT NULL"];
//       const currentParams = [];
//       if (from) { currentConditions.push("DATE_FORMAT(payment_date, '%Y-%m') >= ?"); currentParams.push(from); }
//       if (to)   { currentConditions.push("DATE_FORMAT(payment_date, '%Y-%m') <= ?"); currentParams.push(to); }
//       return { currentConditions, currentParams };
//     };

//     // EV / BL
//     if (!product || product === "ALL" || product === "EV_loan" || product === "BL_loan") {
//       const { currentConditions, currentParams } = getRepaymentConditionsAndParams();
//       const lenderFilter = (!product || product === "ALL")
//         ? "l.lender COLLATE utf8mb4_unicode_ci IN (?, ?)"
//         : "l.lender COLLATE utf8mb4_unicode_ci = ?";

//       queries.push(`
//         SELECT DATE_FORMAT(r.payment_date, '%Y-%m') AS month,
//                l.lender COLLATE utf8mb4_unicode_ci AS product,
//                SUM(r.transfer_amount) AS total_collected
//         FROM repayments_upload r
//         JOIN loan_bookings l
//           ON l.lan COLLATE utf8mb4_unicode_ci = r.lan COLLATE utf8mb4_unicode_ci
//         WHERE ${lenderFilter} AND ${currentConditions.join(" AND ")}
//         GROUP BY DATE_FORMAT(r.payment_date, '%Y-%m'), l.lender
//       `);

//       if (!product || product === "ALL") { allParams.push("EV_loan", "BL_loan"); }
//       else { allParams.push(product); }
//       allParams.push(...currentParams);
//     }

//     // Adikosh
//     if (!product || product === "ALL" || product === "Adikosh") {
//       const { currentConditions, currentParams } = getRepaymentConditionsAndParams();
//       queries.push(`
//         SELECT DATE_FORMAT(payment_date, '%Y-%m') AS month,
//                'Adikosh' AS product,
//                SUM(transfer_amount) AS total_collected
//         FROM repayments_upload_adikosh
//         WHERE ${currentConditions.join(" AND ")}
//         GROUP BY DATE_FORMAT(payment_date, '%Y-%m')
//       `);
//       allParams.push(...currentParams);
//     }

//     // GQ Non-FSF
//     if (!product || product === "ALL" || product === "GQ Non-FSF") {
//       const { currentConditions, currentParams } = getRepaymentConditionsAndParams();
//       queries.push(`
//         SELECT DATE_FORMAT(payment_date, '%Y-%m') AS month,
//                'GQ Non-FSF' AS product,
//                SUM(transfer_amount) AS total_collected
//         FROM repayments_upload
//         WHERE lan COLLATE utf8mb4_unicode_ci IN (
//                 SELECT lan COLLATE utf8mb4_unicode_ci FROM loan_booking_gq_non_fsf
//               )
//           AND ${currentConditions.join(" AND ")}
//         GROUP BY DATE_FORMAT(payment_date, '%Y-%m')
//       `);
//       allParams.push(...currentParams);
//     }

//     const finalQuery = queries.join(" UNION ALL ");
//     const [rows] = await db.promise().query(finalQuery, allParams);
//     res.json(rows);
//   } catch (err) {
//     console.error("❌ Repayment Trend Error:", err);
//     res.status(500).json({ error: "Repayment trend fetch failed" });
//   }
// });

// /* -------------------------- COLLECTION VS DUE -------------------------- */
// router.post("/collection-vs-due", async (req, res) => {
//   try {
//     const { product, from, to } = req.body;

//     const queries = [];
//     const allParams = [];

//     const getDueConditions = () => {
//       const conditions = ["due_date < CURDATE()"];
//       const params = [];
//       if (from) { conditions.push("DATE_FORMAT(due_date, '%Y-%m') >= ?"); params.push(from); }
//       if (to)   { conditions.push("DATE_FORMAT(due_date, '%Y-%m') <= ?"); params.push(to); }
//       return { conditions, params };
//     };

//     // Due amounts
//     if (!product || product === "ALL" || product === "EV_loan") {
//       const { conditions, params } = getDueConditions();
//       queries.push(`
//         SELECT DATE_FORMAT(due_date, '%Y-%m') AS month,
//                'EV_loan' AS product,
//                SUM(emi) AS total_due,
//                0 AS total_collected
//         FROM manual_rps_ev_loan
//         WHERE ${conditions.join(" AND ")}
//         GROUP BY DATE_FORMAT(due_date, '%Y-%m')
//       `);
//       allParams.push(...params);
//     }

//     if (!product || product === "ALL" || product === "Adikosh") {
//       const { conditions, params } = getDueConditions();
//       queries.push(`
//         SELECT DATE_FORMAT(due_date, '%Y-%m') AS month,
//                'Adikosh' AS product,
//                SUM(emi) AS total_due,
//                0 AS total_collected
//         FROM manual_rps_adikosh
//         WHERE ${conditions.join(" AND ")}
//         GROUP BY DATE_FORMAT(due_date, '%Y-%m')
//       `);
//       allParams.push(...params);
//     }

//     if (!product || product === "ALL" || product === "GQ Non-FSF") {
//       const { conditions, params } = getDueConditions();
//       queries.push(`
//         SELECT DATE_FORMAT(due_date, '%Y-%m') AS month,
//                'GQ Non-FSF' AS product,
//                SUM(emi) AS total_due,
//                0 AS total_collected
//         FROM manual_rps_gq_non_fsf
//         WHERE ${conditions.join(" AND ")}
//         GROUP BY DATE_FORMAT(due_date, '%Y-%m')
//       `);
//       allParams.push(...params);
//     }

//     // Collected amounts
//     const getPayConditions = () => {
//       const conditions = ["payment_date IS NOT NULL", "payment_date < CURDATE()"];
//       const params = [];
//       if (from) { conditions.push("DATE_FORMAT(payment_date, '%Y-%m') >= ?"); params.push(from); }
//       if (to)   { conditions.push("DATE_FORMAT(payment_date, '%Y-%m') <= ?"); params.push(to); }
//       return { conditions, params };
//     };

//     if (!product || product === "ALL" || product === "EV_loan" || product === "BL_loan") {
//       const { conditions, params } = getPayConditions();
//       const lenderFilter = (!product || product === "ALL")
//         ? "l.lender COLLATE utf8mb4_unicode_ci IN (?, ?)"
//         : "l.lender COLLATE utf8mb4_unicode_ci = ?";

//       queries.push(`
//         SELECT DATE_FORMAT(r.payment_date, '%Y-%m') AS month,
//                l.lender COLLATE utf8mb4_unicode_ci AS product,
//                0 AS total_due,
//                SUM(r.transfer_amount) AS total_collected
//         FROM repayments_upload r
//         JOIN loan_bookings l
//           ON l.lan COLLATE utf8mb4_unicode_ci = r.lan COLLATE utf8mb4_unicode_ci
//         WHERE ${lenderFilter} AND ${conditions.join(" AND ")}
//         GROUP BY DATE_FORMAT(r.payment_date, '%Y-%m'), l.lender
//       `);

//       if (!product || product === "ALL") { allParams.push("EV_loan", "BL_loan"); }
//       else { allParams.push(product); }
//       allParams.push(...params);
//     }

//     if (!product || product === "ALL" || product === "Adikosh") {
//       const { conditions, params } = getPayConditions();
//       queries.push(`
//         SELECT DATE_FORMAT(payment_date, '%Y-%m') AS month,
//                'Adikosh' AS product,
//                0 AS total_due,
//                SUM(transfer_amount) AS total_collected
//         FROM repayments_upload_adikosh
//         WHERE ${conditions.join(" AND ")}
//         GROUP BY DATE_FORMAT(payment_date, '%Y-%m')
//       `);
//       allParams.push(...params);
//     }

//     if (!product || product === "ALL" || product === "GQ Non-FSF") {
//       const { conditions, params } = getPayConditions();
//       queries.push(`
//         SELECT DATE_FORMAT(payment_date, '%Y-%m') AS month,
//                'GQ Non-FSF' AS product,
//                0 AS total_due,
//                SUM(transfer_amount) AS total_collected
//         FROM repayments_upload
//         WHERE lan COLLATE utf8mb4_unicode_ci IN (
//                 SELECT lan COLLATE utf8mb4_unicode_ci FROM loan_booking_gq_non_fsf
//               )
//           AND ${conditions.join(" AND ")}
//         GROUP BY DATE_FORMAT(payment_date, '%Y-%m')
//       `);
//       allParams.push(...params);
//     }

//     const finalQuery = queries.join(" UNION ALL ");
//     const [rows] = await db.promise().query(finalQuery, allParams);
//     res.json(rows);
//   } catch (err) {
//     console.error("❌ Collection vs Due Error:", err);
//     res.status(500).json({ error: "Collection vs Due fetch failed" });
//   }
// });

// /* -------------------------- PRODUCT DISTRIBUTION -------------------------- */
// router.post("/product-distribution", async (req, res) => {
//   const { from, to } = req.body;

//   try {
//     const conditions = [];
//     const params = [];

//     if (from) { conditions.push(`DATE_FORMAT(agreement_date, '%Y-%m') >= ?`); params.push(from); }
//     if (to)   { conditions.push(`DATE_FORMAT(agreement_date, '%Y-%m') <= ?`); params.push(to); }

//     const whereClause = conditions.length ? "WHERE " + conditions.join(" AND ") : "";

//     const query = `
//       SELECT lender COLLATE utf8mb4_unicode_ci AS product, COUNT(*) AS value
//       FROM loan_bookings ${whereClause}
//       GROUP BY lender
//       UNION ALL
//       SELECT 'Adikosh' AS product, COUNT(*) AS value
//       FROM loan_booking_adikosh ${whereClause}
//       UNION ALL
//       SELECT 'GQ Non-FSF' AS product, COUNT(*) AS value
//       FROM loan_booking_gq_non_fsf ${whereClause}
//     `;

//     const [rows] = await db.promise().query(query, [...params, ...params, ...params]);

//     const productMap = {};
//     rows.forEach(({ product, value }) => {
//       if (!productMap[product]) productMap[product] = 0;
//       productMap[product] += value;
//     });

//     const result = Object.entries(productMap).map(([product, value]) => ({ product, value }));
//     res.json(result);
//   } catch (err) {
//     console.error("❌ Product Distribution Error:", err);
//     res.status(500).json({ error: "Internal Server Error" });
//   }
// });

// module.exports = router;
