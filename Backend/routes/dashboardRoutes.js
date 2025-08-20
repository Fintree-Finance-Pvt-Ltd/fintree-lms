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
//       conditions.push("lender COLLATE utf8mb4_0900_ai_ci = ?");
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
//         ? "l.lender COLLATE utf8mb4_0900_ai_ci IN (?, ?)"
//         : "l.lender COLLATE utf8mb4_0900_ai_ci = ?";

//       queries.push(`
//         SELECT DATE_FORMAT(r.payment_date, '%Y-%m') AS month,
//                l.lender AS product,
//                SUM(r.transfer_amount) AS total_collected
//         FROM repayments_upload r
//         JOIN loan_bookings l
//           ON l.lan COLLATE utf8mb4_0900_ai_ci = r.lan COLLATE utf8mb4_0900_ai_ci
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
//         WHERE lan COLLATE utf8mb4_0900_ai_ci IN (
//                 SELECT lan COLLATE utf8mb4_0900_ai_ci FROM loan_booking_gq_non_fsf
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
//         ? "l.lender COLLATE utf8mb4_0900_ai_ci IN (?, ?)"
//         : "l.lender COLLATE utf8mb4_0900_ai_ci = ?";

//       queries.push(`
//         SELECT DATE_FORMAT(r.payment_date, '%Y-%m') AS month,
//                l.lender AS product,
//                0 AS total_due,
//                SUM(r.transfer_amount) AS total_collected
//         FROM repayments_upload r
//         JOIN loan_bookings l
//           ON l.lan COLLATE utf8mb4_0900_ai_ci = r.lan COLLATE utf8mb4_0900_ai_ci
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
//         WHERE lan COLLATE utf8mb4_0900_ai_ci IN (
//                 SELECT lan COLLATE utf8mb4_0900_ai_ci FROM loan_booking_gq_non_fsf
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
//       lenderFilter = "lender COLLATE utf8mb4_0900_ai_ci IN (?, ?)";
//       disburseParams.push("EV_loan", "BL_loan");
//     } else {
//       lenderFilter = "lender COLLATE utf8mb4_0900_ai_ci = ?";
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
//       lenderFilter = "l.lender COLLATE utf8mb4_0900_ai_ci IN (?, ?)";
//       collectParams.push("EV_loan", "BL_loan");
//     } else {
//       lenderFilter = "l.lender COLLATE utf8mb4_0900_ai_ci = ?";
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
//         AND lan COLLATE utf8mb4_0900_ai_ci IN (
//           SELECT lan COLLATE utf8mb4_0900_ai_ci FROM loan_booking_gq_non_fsf
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

const express = require("express");
const db = require("../config/db");
const router = express.Router();

/* -------------------------- DISBURSAL TREND -------------------------- */
router.post("/disbursal-trend", async (req, res) => {
  try {
    const { product: rawProduct, from, to } = req.body;

    const product = rawProduct && rawProduct.trim();
    const conditions = [];
    const params = [];

    // Only filter loan_bookings (EV/BL live there)
    if (product && product !== "ALL" && product !== "Adikosh" && product !== "GQ Non-FSF") {
      conditions.push("lender COLLATE utf8mb4_0900_ai_ci = ?");
      params.push(product); // 'EV_loan' or 'BL_loan'
    }

    if (from) { conditions.push("DATE_FORMAT(agreement_date, '%Y-%m') >= ?"); params.push(from); }
    if (to)   { conditions.push("DATE_FORMAT(agreement_date, '%Y-%m') <= ?"); params.push(to); }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const queries = [];

    // EV / BL
    if (!product || product === "ALL" || product === "EV_loan" || product === "BL_loan") {
      queries.push(`
        SELECT DATE_FORMAT(agreement_date, '%Y-%m') AS month,
               lender AS product,
               SUM(loan_amount) AS total_disbursed
        FROM loan_bookings
        ${where}
        GROUP BY DATE_FORMAT(agreement_date, '%Y-%m'), lender
      `);
    }

    // Adikosh
    if (!product || product === "ALL" || product === "Adikosh") {
      const adikoshConds = [];
      const adikoshParams = [];
      if (from) { adikoshConds.push("DATE_FORMAT(agreement_date, '%Y-%m') >= ?"); adikoshParams.push(from); }
      if (to)   { adikoshConds.push("DATE_FORMAT(agreement_date, '%Y-%m') <= ?"); adikoshParams.push(to); }

      queries.push(`
        SELECT DATE_FORMAT(agreement_date, '%Y-%m') AS month,
               'Adikosh' AS product,
               SUM(loan_amount) AS total_disbursed
        FROM loan_booking_adikosh
        ${adikoshConds.length ? `WHERE ${adikoshConds.join(" AND ")}` : ""}
        GROUP BY DATE_FORMAT(agreement_date, '%Y-%m')
      `);
      params.push(...adikoshParams);
    }

    // GQ Non-FSF
    if (!product || product === "ALL" || product === "GQ Non-FSF") {
      const gqConds = [];
      const gqParams = [];
      if (from) { gqConds.push("DATE_FORMAT(agreement_date, '%Y-%m') >= ?"); gqParams.push(from); }
      if (to)   { gqConds.push("DATE_FORMAT(agreement_date, '%Y-%m') <= ?"); gqParams.push(to); }

      queries.push(`
        SELECT DATE_FORMAT(agreement_date, '%Y-%m') AS month,
               'GQ Non-FSF' AS product,
               SUM(loan_amount) AS total_disbursed
        FROM loan_booking_gq_non_fsf
        ${gqConds.length ? `WHERE ${gqConds.join(" AND ")}` : ""}
        GROUP BY DATE_FORMAT(agreement_date, '%Y-%m')
      `);
      params.push(...gqParams);
    }

    const finalQuery = queries.join(" UNION ALL ");
    const [rows] = await db.promise().query(finalQuery, params);
    res.json(rows);
  } catch (err) {
    console.error("Disbursal Trend Error:", err);
    res.status(500).json({ error: "Disbursal trend fetch failed" });
  }
});

/* -------------------------- REPAYMENT TREND -------------------------- */
router.post("/repayment-trend", async (req, res) => {
  try {
    const { product, from, to } = req.body;
    const queries = [];
    const allParams = [];

    const getRepaymentConditionsAndParams = () => {
      const currentConditions = ["payment_date IS NOT NULL"];
      const currentParams = [];
      if (from) { currentConditions.push("DATE_FORMAT(payment_date, '%Y-%m') >= ?"); currentParams.push(from); }
      if (to)   { currentConditions.push("DATE_FORMAT(payment_date, '%Y-%m') <= ?"); currentParams.push(to); }
      return { currentConditions, currentParams };
    };

    // EV / BL
    if (!product || product === "ALL" || product === "EV_loan" || product === "BL_loan") {
      const { currentConditions, currentParams } = getRepaymentConditionsAndParams();
      const lenderFilter = (!product || product === "ALL")
        ? "l.lender COLLATE utf8mb4_0900_ai_ci IN (?, ?)"
        : "l.lender COLLATE utf8mb4_0900_ai_ci = ?";

      queries.push(`
        SELECT DATE_FORMAT(r.payment_date, '%Y-%m') AS month,
               l.lender COLLATE utf8mb4_0900_ai_ci AS product,
               SUM(r.transfer_amount) AS total_collected
        FROM repayments_upload r
        JOIN loan_bookings l
          ON l.lan COLLATE utf8mb4_0900_ai_ci = r.lan COLLATE utf8mb4_0900_ai_ci
        WHERE ${lenderFilter} AND ${currentConditions.join(" AND ")}
        GROUP BY DATE_FORMAT(r.payment_date, '%Y-%m'), l.lender
      `);

      if (!product || product === "ALL") { allParams.push("EV_loan", "BL_loan"); }
      else { allParams.push(product); }
      allParams.push(...currentParams);
    }

    // Adikosh
    if (!product || product === "ALL" || product === "Adikosh") {
      const { currentConditions, currentParams } = getRepaymentConditionsAndParams();
      queries.push(`
        SELECT DATE_FORMAT(payment_date, '%Y-%m') AS month,
               'Adikosh' AS product,
               SUM(transfer_amount) AS total_collected
        FROM repayments_upload_adikosh
        WHERE ${currentConditions.join(" AND ")}
        GROUP BY DATE_FORMAT(payment_date, '%Y-%m')
      `);
      allParams.push(...currentParams);
    }

    // GQ Non-FSF
    if (!product || product === "ALL" || product === "GQ Non-FSF") {
      const { currentConditions, currentParams } = getRepaymentConditionsAndParams();
      queries.push(`
        SELECT DATE_FORMAT(payment_date, '%Y-%m') AS month,
               'GQ Non-FSF' AS product,
               SUM(transfer_amount) AS total_collected
        FROM repayments_upload
        WHERE lan COLLATE utf8mb4_0900_ai_ci IN (
                SELECT lan COLLATE utf8mb4_0900_ai_ci FROM loan_booking_gq_non_fsf
              )
          AND ${currentConditions.join(" AND ")}
        GROUP BY DATE_FORMAT(payment_date, '%Y-%m')
      `);
      allParams.push(...currentParams);
    }

    const finalQuery = queries.join(" UNION ALL ");
    const [rows] = await db.promise().query(finalQuery, allParams);
    res.json(rows);
  } catch (err) {
    console.error("Repayment Trend Error:", err);
    res.status(500).json({ error: "Repayment trend fetch failed" });
  }
});

/* -------------------------- COLLECTION VS DUE -------------------------- */
router.post("/collection-vs-due", async (req, res) => {
  try {
    const { product, from, to } = req.body;

    const queries = [];
    const allParams = [];

    const getDueConditions = () => {
      const conditions = ["due_date < CURDATE()"];
      const params = [];
      if (from) { conditions.push("DATE_FORMAT(due_date, '%Y-%m') >= ?"); params.push(from); }
      if (to)   { conditions.push("DATE_FORMAT(due_date, '%Y-%m') <= ?"); params.push(to); }
      return { conditions, params };
    };

    // Due amounts
    if (!product || product === "ALL" || product === "EV_loan") {
      const { conditions, params } = getDueConditions();
      queries.push(`
        SELECT DATE_FORMAT(due_date, '%Y-%m') AS month,
               'EV_loan' AS product,
               SUM(emi) AS total_due,
               0 AS total_collected
        FROM manual_rps_ev_loan
        WHERE ${conditions.join(" AND ")}
        GROUP BY DATE_FORMAT(due_date, '%Y-%m')
      `);
      allParams.push(...params);
    }

    if (!product || product === "ALL" || product === "Adikosh") {
      const { conditions, params } = getDueConditions();
      queries.push(`
        SELECT DATE_FORMAT(due_date, '%Y-%m') AS month,
               'Adikosh' AS product,
               SUM(emi) AS total_due,
               0 AS total_collected
        FROM manual_rps_adikosh
        WHERE ${conditions.join(" AND ")}
        GROUP BY DATE_FORMAT(due_date, '%Y-%m')
      `);
      allParams.push(...params);
    }

    if (!product || product === "ALL" || product === "GQ Non-FSF") {
      const { conditions, params } = getDueConditions();
      queries.push(`
        SELECT DATE_FORMAT(due_date, '%Y-%m') AS month,
               'GQ Non-FSF' AS product,
               SUM(emi) AS total_due,
               0 AS total_collected
        FROM manual_rps_gq_non_fsf
        WHERE ${conditions.join(" AND ")}
        GROUP BY DATE_FORMAT(due_date, '%Y-%m')
      `);
      allParams.push(...params);
    }

    // Collected amounts
    const getPayConditions = () => {
      const conditions = ["payment_date IS NOT NULL", "payment_date < CURDATE()"];
      const params = [];
      if (from) { conditions.push("DATE_FORMAT(payment_date, '%Y-%m') >= ?"); params.push(from); }
      if (to)   { conditions.push("DATE_FORMAT(payment_date, '%Y-%m') <= ?"); params.push(to); }
      return { conditions, params };
    };

    if (!product || product === "ALL" || product === "EV_loan" || product === "BL_loan") {
      const { conditions, params } = getPayConditions();
      const lenderFilter = (!product || product === "ALL")
        ? "l.lender COLLATE utf8mb4_0900_ai_ci IN (?, ?)"
        : "l.lender COLLATE utf8mb4_0900_ai_ci = ?";

      queries.push(`
        SELECT DATE_FORMAT(r.payment_date, '%Y-%m') AS month,
               l.lender COLLATE utf8mb4_0900_ai_ci AS product,
               0 AS total_due,
               SUM(r.transfer_amount) AS total_collected
        FROM repayments_upload r
        JOIN loan_bookings l
          ON l.lan COLLATE utf8mb4_0900_ai_ci = r.lan COLLATE utf8mb4_0900_ai_ci
        WHERE ${lenderFilter} AND ${conditions.join(" AND ")}
        GROUP BY DATE_FORMAT(r.payment_date, '%Y-%m'), l.lender
      `);

      if (!product || product === "ALL") { allParams.push("EV_loan", "BL_loan"); }
      else { allParams.push(product); }
      allParams.push(...params);
    }

    if (!product || product === "ALL" || product === "Adikosh") {
      const { conditions, params } = getPayConditions();
      queries.push(`
        SELECT DATE_FORMAT(payment_date, '%Y-%m') AS month,
               'Adikosh' AS product,
               0 AS total_due,
               SUM(transfer_amount) AS total_collected
        FROM repayments_upload_adikosh
        WHERE ${conditions.join(" AND ")}
        GROUP BY DATE_FORMAT(payment_date, '%Y-%m')
      `);
      allParams.push(...params);
    }

    if (!product || product === "ALL" || product === "GQ Non-FSF") {
      const { conditions, params } = getPayConditions();
      queries.push(`
        SELECT DATE_FORMAT(payment_date, '%Y-%m') AS month,
               'GQ Non-FSF' AS product,
               0 AS total_due,
               SUM(transfer_amount) AS total_collected
        FROM repayments_upload
        WHERE lan COLLATE utf8mb4_0900_ai_ci IN (
                SELECT lan COLLATE utf8mb4_0900_ai_ci FROM loan_booking_gq_non_fsf
              )
          AND ${conditions.join(" AND ")}
        GROUP BY DATE_FORMAT(payment_date, '%Y-%m')
      `);
      allParams.push(...params);
    }

    const finalQuery = queries.join(" UNION ALL ");
    const [rows] = await db.promise().query(finalQuery, allParams);
    res.json(rows);
  } catch (err) {
    console.error("Collection vs Due Error:", err);
    res.status(500).json({ error: "Collection vs Due fetch failed" });
  }
});

/* -------------------------- PRODUCT DISTRIBUTION -------------------------- */
router.post("/product-distribution", async (req, res) => {
  const { from, to } = req.body;

  try {
    const conditions = [];
    const params = [];

    if (from) { conditions.push(`DATE_FORMAT(agreement_date, '%Y-%m') >= ?`); params.push(from); }
    if (to)   { conditions.push(`DATE_FORMAT(agreement_date, '%Y-%m') <= ?`); params.push(to); }

    const whereClause = conditions.length ? "WHERE " + conditions.join(" AND ") : "";

    const query = `
      SELECT lender COLLATE utf8mb4_0900_ai_ci AS product, COUNT(*) AS value
      FROM loan_bookings ${whereClause}
      GROUP BY lender
      UNION ALL
      SELECT 'Adikosh' AS product, COUNT(*) AS value
      FROM loan_booking_adikosh ${whereClause}
      UNION ALL
      SELECT 'GQ Non-FSF' AS product, COUNT(*) AS value
      FROM loan_booking_gq_non_fsf ${whereClause}
    `;

    const [rows] = await db.promise().query(query, [...params, ...params, ...params]);

    const productMap = {};
    rows.forEach(({ product, value }) => {
      if (!productMap[product]) productMap[product] = 0;
      productMap[product] += value;
    });

    const result = Object.entries(productMap).map(([product, value]) => ({ product, value }));
    res.json(result);
  } catch (err) {
    console.error("Product Distribution Error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/metric-cards", async (req, res) => {
  const { product, from, to } = req.body;

  const getDateFilter = (field, paramArray) => {
    let clause = "";
    if (from && from.trim()) { clause += ` AND DATE_FORMAT(${field}, '%Y-%m') >= ?`; paramArray.push(from); }
    if (to && to.trim())     { clause += ` AND DATE_FORMAT(${field}, '%Y-%m') <= ?`; paramArray.push(to); }
    return clause;
  };

  const disburseParams = [];
  const collectParams  = [];
  const disburseQueries = [];
  const collectQueries  = [];

  // --- Disbursed (EV/BL in loan_bookings) ---
  if (!product || product === "ALL" || product === "EV_loan" || product === "BL_loan") {
    let lenderFilter;
    if (!product || product === "ALL") {
      lenderFilter = "lender COLLATE utf8mb4_0900_ai_ci IN (?, ?)";
      disburseParams.push("EV_loan", "BL_loan");
    } else {
      lenderFilter = "lender COLLATE utf8mb4_0900_ai_ci = ?";
      disburseParams.push(product); // 'EV_loan' OR 'BL_loan'
    }

    disburseQueries.push(`
      SELECT IFNULL(SUM(loan_amount), 0) AS amount
      FROM loan_bookings
      WHERE ${lenderFilter} ${getDateFilter("agreement_date", disburseParams)}
    `);
  }

  if (!product || product === "ALL" || product === "Adikosh") {
    disburseQueries.push(`
      SELECT IFNULL(SUM(loan_amount), 0) AS amount
      FROM loan_booking_adikosh
      WHERE 1 ${getDateFilter("agreement_date", disburseParams)}
    `);
  }

  if (!product || product === "ALL" || product === "GQ Non-FSF") {
    disburseQueries.push(`
      SELECT IFNULL(SUM(loan_amount), 0) AS amount
      FROM loan_booking_gq_non_fsf
      WHERE 1 ${getDateFilter("agreement_date", disburseParams)}
    `);
  }

  // --- Collected ---
  if (!product || product === "ALL" || product === "EV_loan" || product === "BL_loan") {
    let lenderFilter;
    if (!product || product === "ALL") {
      lenderFilter = "l.lender COLLATE utf8mb4_0900_ai_ci IN (?, ?)";
      collectParams.push("EV_loan", "BL_loan");
    } else {
      lenderFilter = "l.lender COLLATE utf8mb4_0900_ai_ci = ?";
      collectParams.push(product);
    }

    collectQueries.push(`
      SELECT IFNULL(SUM(r.transfer_amount), 0) AS amount
      FROM repayments_upload r
      JOIN loan_bookings l ON l.lan COLLATE utf8mb4_0900_ai_ci = r.lan COLLATE utf8mb4_0900_ai_ci
      WHERE ${lenderFilter} AND r.payment_date IS NOT NULL ${getDateFilter("r.payment_date", collectParams)}
    `);
  }

  if (!product || product === "ALL" || product === "Adikosh") {
    collectQueries.push(`
      SELECT IFNULL(SUM(transfer_amount), 0) AS amount
      FROM repayments_upload_adikosh
      WHERE payment_date IS NOT NULL ${getDateFilter("payment_date", collectParams)}
    `);
  }

  if (!product || product === "ALL" || product === "GQ Non-FSF") {
    collectQueries.push(`
      SELECT IFNULL(SUM(transfer_amount), 0) AS amount
      FROM repayments_upload
      WHERE payment_date IS NOT NULL
        AND lan COLLATE utf8mb4_0900_ai_ci IN (
          SELECT lan COLLATE utf8mb4_0900_ai_ci FROM loan_booking_gq_non_fsf
        )
        ${getDateFilter("payment_date", collectParams)}
    `);
  }

  try {
    const [disbursedQueryResponse, collectedQueryResponse] = await Promise.all([
      db.promise().query(disburseQueries.join(" UNION ALL "), disburseParams),
      db.promise().query(collectQueries.join(" UNION ALL "), collectParams),
    ]);

    const disbursedRows = disbursedQueryResponse[0];
    const collectedRows = collectedQueryResponse[0];

    const totalDisbursed = disbursedRows.reduce((s, r) => s + Number(r.amount || 0), 0);
    const totalCollected = collectedRows.reduce((s, r) => s + Number(r.amount || 0), 0);
    const collectionRate = totalDisbursed === 0 ? 0 : (totalCollected / totalDisbursed) * 100;

    res.json({ totalDisbursed, totalCollected, collectionRate });
  } catch (err) {
    console.error("Metric Card Fetch Error:", err);
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
