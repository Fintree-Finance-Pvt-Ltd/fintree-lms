// const express = require("express");
// const db = require("../config/db");
// const router = express.Router();

// router.get("/summary", async(req, res) => {
//   try {
//     const [rows] = await db.promise().query(`
//       -- EV + BL
//       SELECT lender AS product, 
//              COUNT(*) AS total_loans, 
//              SUM(loan_amount) AS total_disbursed,
//              (SELECT SUM(remaining_principal)
//               FROM manual_rps_ev_loan r
//               JOIN loan_bookings l2 ON l2.lan = r.LAN
//               WHERE l2.lender = l.lender
//              ) AS total_outstanding
//       FROM loan_bookings l
//       GROUP BY lender

//       UNION ALL

//       -- Adikosh
//       SELECT 'Adikosh', 
//              COUNT(*), 
//              SUM(loan_amount),
//              (SELECT SUM(remaining_principal)
//               FROM manual_rps_adikosh
//              ) AS total_outstanding
//       FROM loan_booking_adikosh

//       UNION ALL

//       -- GQ Non-FSF
//       SELECT 'GQ Non-FSF', 
//              COUNT(*), 
//              SUM(loan_amount),
//              (SELECT SUM(remaining_principal)
//               FROM manual_rps_gq_non_fsf
//              ) AS total_outstanding
//       FROM loan_booking_gq_non_fsf;
//     `);

//     res.json(rows);
//   } catch (error) {
//     console.error("❌ Error fetching dashboard data:", error);
//     res.status(500).json({ error: "Error fetching dashboard data" });
//   }
// });


// router.get("/disbursal-trend", async(req, res) => {
//     try {
//     const [rows] = await db.promise().query(`
//       SELECT 
//         DATE_FORMAT(agreement_date, '%Y-%m') AS month,
//         lender AS product,
//         SUM(disbursal_amount) AS total_disbursed
//       FROM loan_bookings
//       WHERE agreement_date IS NOT NULL
//       GROUP BY month, lender

//       UNION ALL

//       SELECT 
//         DATE_FORMAT(agreement_date, '%Y-%m') AS month,
//         'Adikosh' AS product,
//         SUM(loan_amount)
//       FROM loan_booking_adikosh
//       WHERE agreement_date IS NOT NULL
//       GROUP BY month

//       UNION ALL

//       SELECT 
//         DATE_FORMAT(agreement_date, '%Y-%m') AS month,
//         'GQ Non-FSF' AS product,
//         SUM(loan_amount)
//       FROM loan_booking_gq_non_fsf
//       WHERE agreement_date IS NOT NULL
//       GROUP BY month;
//     `);

//     res.json(rows);
//   } catch (error) {
//     console.error("❌ Error fetching disbursal trend:", error);
//     res.status(500).json({ error: "Error fetching disbursal trend" });
//   }
// });


// router.get("/repayment-trend", async (req, res) => {try {
//     const [rows] = await db.promise().query(`
//       -- EV and BL loans (from loan_bookings)
//       SELECT 
//         DATE_FORMAT(r.payment_date, '%Y-%m') AS month,
//         l.lender AS product,
//         SUM(r.transfer_amount) AS total_collected
//       FROM repayments_upload r
//       JOIN loan_bookings l ON l.lan = r.lan
//       WHERE r.payment_date IS NOT NULL
//         AND l.lender IN ('EV_loan', 'BL_loan')
//       GROUP BY month, l.lender

//       UNION ALL

//       -- GQ Non-FSF loans
//       SELECT 
//         DATE_FORMAT(r.payment_date, '%Y-%m') AS month,
//         'GQ Non-FSF' AS product,
//         SUM(r.transfer_amount) AS total_collected
//       FROM repayments_upload r
//       WHERE r.payment_date IS NOT NULL
//         AND r.lan IN (SELECT lan FROM loan_booking_gq_non_fsf)
//       GROUP BY month

//       UNION ALL

//       -- Adikosh loans
//       SELECT 
//         DATE_FORMAT(payment_date, '%Y-%m') AS month,
//         'Adikosh' AS product,
//         SUM(transfer_amount) AS total_collected
//       FROM repayments_upload_adikosh
//       WHERE payment_date IS NOT NULL
//       GROUP BY month;
//     `);

//     res.json(rows);
//   } catch (error) {
//     console.error("❌ Error fetching repayment trend:", error);
//     res.status(500).json({ error: "Error fetching repayment trend" });
//   }
// });

// router.get("/collection-vs-due", async (req, res) => {
//   try {
//     const [rows] = await db.promise().query(`
//       -- 1. Due: EV Loans
//       SELECT 
//         DATE_FORMAT(due_date, '%Y-%m') AS month,
//         'EV_loan' AS product,
//         SUM(emi) AS total_due,
//         0 AS total_collected
//       FROM manual_rps_ev_loan
//       WHERE due_date IS NOT NULL AND due_date < CURDATE()
//       GROUP BY month

//       UNION ALL

//       -- 2. Due: Adikosh
//       SELECT 
//         DATE_FORMAT(due_date, '%Y-%m') AS month,
//         'Adikosh' AS product,
//         SUM(emi) AS total_due,
//         0 AS total_collected
//       FROM manual_rps_adikosh
//       WHERE due_date IS NOT NULL AND due_date < CURDATE()
//       GROUP BY month

//       UNION ALL

//       -- 3. Due: GQ Non-FSF
//       SELECT 
//         DATE_FORMAT(due_date, '%Y-%m') AS month,
//         'GQ Non-FSF' AS product,
//         SUM(emi) AS total_due,
//         0 AS total_collected
//       FROM manual_rps_gq_non_fsf
//       WHERE due_date IS NOT NULL AND due_date < CURDATE()
//       GROUP BY month

//       UNION ALL

//       -- 4. Collected: EV + BL
//       SELECT 
//         DATE_FORMAT(r.payment_date, '%Y-%m') AS month,
//         l.lender AS product,
//         0 AS total_due,
//         SUM(r.transfer_amount) AS total_collected
//       FROM repayments_upload r
//       JOIN loan_bookings l ON l.lan = r.lan
//       WHERE r.payment_date IS NOT NULL AND r.payment_date < CURDATE()
//         AND l.lender IN ('EV_loan', 'BL_loan')
//       GROUP BY month, l.lender

//       UNION ALL

//       -- 5. Collected: Adikosh
//       SELECT 
//         DATE_FORMAT(payment_date, '%Y-%m') AS month,
//         'Adikosh' AS product,
//         0 AS total_due,
//         SUM(transfer_amount) AS total_collected
//       FROM repayments_upload_adikosh
//       WHERE payment_date IS NOT NULL AND payment_date < CURDATE()
//       GROUP BY month

//       UNION ALL

//       -- 6. Collected: GQ Non-FSF
//       SELECT 
//         DATE_FORMAT(payment_date, '%Y-%m') AS month,
//         'GQ Non-FSF' AS product,
//         0 AS total_due,
//         SUM(transfer_amount) AS total_collected
//       FROM repayments_upload
//       WHERE payment_date IS NOT NULL AND payment_date < CURDATE()
//         AND lan IN (SELECT lan FROM loan_booking_gq_non_fsf)
//       GROUP BY month;
//     `);

//     res.json(rows);
//   } catch (error) {
//     console.error("❌ Error fetching collection vs due:", error);
//     res.status(500).json({ error: "Error fetching collection vs due" });
//   }
// });


// module.exports = router;






const express = require("express");
const db = require("../config/db");
const router = express.Router();

router.post("/disbursal-trend", async (req, res) => {
//   const db = req.app.get("db");
  try {
    const { product, from, to } = req.body;
    let conditions = [];
    let params = [];

    if (product && product !== "ALL") {
      if (product !== "Adikosh" && product !== "GQ Non-FSF") {
        conditions.push("lender = ?");
        params.push(product);
      }
    }

    if (from) {
      conditions.push("DATE_FORMAT(agreement_date, '%Y-%m') >= ?");
      params.push(from);
    }
    if (to) {
      conditions.push("DATE_FORMAT(agreement_date, '%Y-%m') <= ?");
      params.push(to);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const queries = [];

    if (!product || product === "ALL" || product === "EV_loan" || product === "BL_loan") {
      queries.push(`
        SELECT DATE_FORMAT(agreement_date, '%Y-%m') AS month, lender AS product, SUM(loan_amount) AS total_disbursed
        FROM loan_bookings
        ${where}
        GROUP BY DATE_FORMAT(agreement_date, '%Y-%m'), lender
      `);
    }

    if (!product || product === "ALL" || product === "Adikosh") {
      queries.push(`
        SELECT DATE_FORMAT(agreement_date, '%Y-%m') AS month, 'Adikosh' AS product, SUM(loan_amount) AS total_disbursed
        FROM loan_booking_adikosh
        ${from || to ? `WHERE ${[from ? "DATE_FORMAT(agreement_date, '%Y-%m') >= ?" : null, to ? "DATE_FORMAT(agreement_date, '%Y-%m') <= ?" : null].filter(Boolean).join(" AND ")}` : ""}
        GROUP BY DATE_FORMAT(agreement_date, '%Y-%m')
      `);
      if (from) params.push(from);
      if (to) params.push(to);
    }

    if (!product || product === "ALL" || product === "GQ Non-FSF") {
      queries.push(`
        SELECT DATE_FORMAT(agreement_date, '%Y-%m') AS month, 'GQ Non-FSF' AS product, SUM(loan_amount) AS total_disbursed
        FROM loan_booking_gq_non_fsf
        ${from || to ? `WHERE ${[from ? "DATE_FORMAT(agreement_date, '%Y-%m') >= ?" : null, to ? "DATE_FORMAT(agreement_date, '%Y-%m') <= ?" : null].filter(Boolean).join(" AND ")}` : ""}
        GROUP BY DATE_FORMAT(agreement_date, '%Y-%m')
      `);
      if (from) params.push(from);
      if (to) params.push(to);
    }

    const finalQuery = queries.join(" UNION ALL ");
    const [rows] = await db.promise().query(finalQuery, params);
    res.json(rows);
  } catch (err) {
    console.error("❌ Disbursal Trend Error:", err);
    res.status(500).json({ error: "Disbursal trend fetch failed" });
  }
});

// router.post("/repayment-trend", async (req, res) => {
// //   const db = req.app.get("db");
//   try {
//     const { product, from, to } = req.body;
//     const conditions = [];
//     const params = [];

//     if (from) {
//       conditions.push("DATE_FORMAT(payment_date, '%Y-%m') >= ?");
//       params.push(from);
//     }
//     if (to) {
//       conditions.push("DATE_FORMAT(payment_date, '%Y-%m') <= ?");
//       params.push(to);
//     }

//     const queries = [];

//     if (!product || product === "ALL" || product === "EV_loan" || product === "BL_loan") {
//       queries.push(`
//         SELECT DATE_FORMAT(r.payment_date, '%Y-%m') AS month, l.lender AS product, SUM(r.transfer_amount) AS total_collected
//         FROM repayments_upload r
//         JOIN loan_bookings l ON l.lan = r.lan
//         WHERE r.payment_date IS NOT NULL AND l.lender IN ('EV_loan', 'BL_loan')
//         ${conditions.length ? `AND ${conditions.join(" AND ")}` : ""}
//         GROUP BY DATE_FORMAT(r.payment_date, '%Y-%m'), l.lender
//       `);
//     }

//     if (!product || product === "ALL" || product === "Adikosh") {
//       queries.push(`
//         SELECT DATE_FORMAT(payment_date, '%Y-%m') AS month, 'Adikosh' AS product, SUM(transfer_amount) AS total_collected
//         FROM repayments_upload_adikosh
//         WHERE payment_date IS NOT NULL
//         ${conditions.length ? `AND ${conditions.join(" AND ")}` : ""}
//         GROUP BY DATE_FORMAT(payment_date, '%Y-%m')
//       `);
//     }

//     if (!product || product === "ALL" || product === "GQ Non-FSF") {
//       queries.push(`
//         SELECT DATE_FORMAT(payment_date, '%Y-%m') AS month, 'GQ Non-FSF' AS product, SUM(transfer_amount) AS total_collected
//         FROM repayments_upload
//         WHERE payment_date IS NOT NULL AND lan IN (SELECT lan FROM loan_booking_gq_non_fsf)
//         ${conditions.length ? `AND ${conditions.join(" AND ")}` : ""}
//         GROUP BY DATE_FORMAT(payment_date, '%Y-%m')
//       `);
//     }

//     const finalQuery = queries.join(" UNION ALL ");
//     const [rows] = await db.promise().query(finalQuery, params);
//     res.json(rows);
//   } catch (err) {
//     console.error("❌ Repayment Trend Error:", err);
//     res.status(500).json({ error: "Repayment trend fetch failed" });
//   }
// });

// working code
// router.post("/collection-vs-due", async (req, res) => {
// //   const db = req.app.get("db");
//   try {
//     const { product, from, to } = req.body;
//     const dueConditions = ["due_date < CURDATE()"];
//     const dueParams = [];

//     if (from) {
//       dueConditions.push("DATE_FORMAT(due_date, '%Y-%m') >= ?");
//       dueParams.push(from);
//     }
//     if (to) {
//       dueConditions.push("DATE_FORMAT(due_date, '%Y-%m') <= ?");
//       dueParams.push(to);
//     }

//     const queries = [];

//     if (!product || product === "ALL" || product === "EV_loan") {
//       queries.push(`
//         SELECT DATE_FORMAT(due_date, '%Y-%m') AS month, 'EV_loan' AS product, SUM(emi) AS total_due, 0 AS total_collected
//         FROM manual_rps_ev_loan
//         WHERE ${dueConditions.join(" AND ")}
//         GROUP BY DATE_FORMAT(due_date, '%Y-%m')
//       `);
//     }

//     if (!product || product === "ALL" || product === "Adikosh") {
//       queries.push(`
//         SELECT DATE_FORMAT(due_date, '%Y-%m') AS month, 'Adikosh' AS product, SUM(emi) AS total_due, 0 AS total_collected
//         FROM manual_rps_adikosh
//         WHERE ${dueConditions.join(" AND ")}
//         GROUP BY DATE_FORMAT(due_date, '%Y-%m')
//       `);
//     }

//     if (!product || product === "ALL" || product === "GQ Non-FSF") {
//       queries.push(`
//         SELECT DATE_FORMAT(due_date, '%Y-%m') AS month, 'GQ Non-FSF' AS product, SUM(emi) AS total_due, 0 AS total_collected
//         FROM manual_rps_gq_non_fsf
//         WHERE ${dueConditions.join(" AND ")}
//         GROUP BY DATE_FORMAT(due_date, '%Y-%m')
//       `);
//     }

//     const payConditions = ["payment_date < CURDATE()"];
//     const payParams = [];

//     if (from) {
//       payConditions.push("DATE_FORMAT(payment_date, '%Y-%m') >= ?");
//       payParams.push(from);
//     }
//     if (to) {
//       payConditions.push("DATE_FORMAT(payment_date, '%Y-%m') <= ?");
//       payParams.push(to);
//     }

//     if (!product || product === "ALL" || product === "EV_loan" || product === "BL_loan") {
//       queries.push(`
//         SELECT DATE_FORMAT(r.payment_date, '%Y-%m') AS month, l.lender AS product, 0 AS total_due, SUM(r.transfer_amount) AS total_collected
//         FROM repayments_upload r
//         JOIN loan_bookings l ON l.lan = r.lan
//         WHERE r.payment_date IS NOT NULL AND l.lender IN ('EV_loan', 'BL_loan') AND ${payConditions.join(" AND ")}
//         GROUP BY DATE_FORMAT(r.payment_date, '%Y-%m'), l.lender
//       `);
//     }

//     if (!product || product === "ALL" || product === "Adikosh") {
//       queries.push(`
//         SELECT DATE_FORMAT(payment_date, '%Y-%m') AS month, 'Adikosh' AS product, 0 AS total_due, SUM(transfer_amount) AS total_collected
//         FROM repayments_upload_adikosh
//         WHERE payment_date IS NOT NULL AND ${payConditions.join(" AND ")}
//         GROUP BY DATE_FORMAT(payment_date, '%Y-%m')
//       `);
//     }

//     if (!product || product === "ALL" || product === "GQ Non-FSF") {
//       queries.push(`
//         SELECT DATE_FORMAT(payment_date, '%Y-%m') AS month, 'GQ Non-FSF' AS product, 0 AS total_due, SUM(transfer_amount) AS total_collected
//         FROM repayments_upload
//         WHERE payment_date IS NOT NULL AND lan IN (SELECT lan FROM loan_booking_gq_non_fsf) AND ${payConditions.join(" AND ")}
//         GROUP BY DATE_FORMAT(payment_date, '%Y-%m')
//       `);
//     }

//     const finalQuery = queries.join(" UNION ALL ");
//     const [rows] = await db.promise().query(finalQuery, [...dueParams, ...payParams]);
//     res.json(rows);
//   } catch (err) {
//     console.error("❌ Collection vs Due Error:", err);
//     res.status(500).json({ error: "Collection vs Due fetch failed" });
//   }
// });


router.post("/repayment-trend", async (req, res) => {
  // const db = req.app.get("db"); // Assuming db is passed or accessible
  try {
    const { product, from, to } = req.body;
    const queries = [];
    let allParams = []; // This will hold all parameters in the correct order

    // Helper function to build conditions and collect params for each subquery
    const getRepaymentConditionsAndParams = () => {
      const currentConditions = ["payment_date IS NOT NULL"];
      const currentParams = [];
      if (from) {
        currentConditions.push("DATE_FORMAT(payment_date, '%Y-%m') >= ?");
        currentParams.push(from);
      }
      if (to) {
        currentConditions.push("DATE_FORMAT(payment_date, '%Y-%m') <= ?");
        currentParams.push(to);
      }
      return { currentConditions, currentParams };
    };

    if (!product || product === "ALL" || product === "EV_loan" || product === "BL_loan") {
      const { currentConditions, currentParams } = getRepaymentConditionsAndParams();
      queries.push(`
        SELECT DATE_FORMAT(r.payment_date, '%Y-%m') AS month, l.lender AS product, SUM(r.transfer_amount) AS total_collected
        FROM repayments_upload r
        JOIN loan_bookings l ON l.lan = r.lan
        WHERE r.payment_date IS NOT NULL AND l.lender IN ('EV_loan', 'BL_loan')
        ${currentConditions.length > 0 ? `AND ${currentConditions.join(" AND ")}` : ""}
        GROUP BY DATE_FORMAT(r.payment_date, '%Y-%m'), l.lender
      `);
      allParams.push(...currentParams);
    }

    if (!product || product === "ALL" || product === "Adikosh") {
      const { currentConditions, currentParams } = getRepaymentConditionsAndParams();
      queries.push(`
        SELECT DATE_FORMAT(payment_date, '%Y-%m') AS month, 'Adikosh' AS product, SUM(transfer_amount) AS total_collected
        FROM repayments_upload_adikosh
        WHERE payment_date IS NOT NULL
        ${currentConditions.length > 0 ? `AND ${currentConditions.join(" AND ")}` : ""}
        GROUP BY DATE_FORMAT(payment_date, '%Y-%m')
      `);
      allParams.push(...currentParams);
    }

    if (!product || product === "ALL" || product === "GQ Non-FSF") {
      const { currentConditions, currentParams } = getRepaymentConditionsAndParams();
      queries.push(`
        SELECT DATE_FORMAT(payment_date, '%Y-%m') AS month, 'GQ Non-FSF' AS product, SUM(transfer_amount) AS total_collected
        FROM repayments_upload
        WHERE payment_date IS NOT NULL AND lan IN (SELECT lan FROM loan_booking_gq_non_fsf)
        ${currentConditions.length > 0 ? `AND ${currentConditions.join(" AND ")}` : ""}
        GROUP BY DATE_FORMAT(payment_date, '%Y-%m')
      `);
      allParams.push(...currentParams);
    }

    const finalQuery = queries.join(" UNION ALL ");
    const [rows] = await db.promise().query(finalQuery, allParams); // Pass allParams here
    res.json(rows);
  } catch (err) {
    console.error("❌ Repayment Trend Error:", err);
    res.status(500).json({ error: "Repayment trend fetch failed" });
  }
});

router.post("/collection-vs-due", async (req, res) => {
//   const db = req.app.get("db"); // Assuming db is passed or accessible
  try {
    const { product, from, to } = req.body;

    const queries = [];
    let allParams = []; // This will hold all parameters in the correct order

    // --- Due Amount Queries ---
    const getDueConditions = () => {
      const conditions = ["due_date < CURDATE()"];
      const params = [];
      if (from) {
        conditions.push("DATE_FORMAT(due_date, '%Y-%m') >= ?");
        params.push(from);
      }
      if (to) {
        conditions.push("DATE_FORMAT(due_date, '%Y-%m') <= ?");
        params.push(to);
      }
      return { conditions, params };
    };

    if (!product || product === "ALL" || product === "EV_loan") {
      const { conditions, params } = getDueConditions();
      queries.push(`
        SELECT DATE_FORMAT(due_date, '%Y-%m') AS month, 'EV_loan' AS product, SUM(emi) AS total_due, 0 AS total_collected
        FROM manual_rps_ev_loan
        WHERE ${conditions.join(" AND ")}
        GROUP BY DATE_FORMAT(due_date, '%Y-%m')
      `);
      allParams.push(...params);
    }

    if (!product || product === "ALL" || product === "Adikosh") {
      const { conditions, params } = getDueConditions();
      queries.push(`
        SELECT DATE_FORMAT(due_date, '%Y-%m') AS month, 'Adikosh' AS product, SUM(emi) AS total_due, 0 AS total_collected
        FROM manual_rps_adikosh
        WHERE ${conditions.join(" AND ")}
        GROUP BY DATE_FORMAT(due_date, '%Y-%m')
      `);
      allParams.push(...params);
    }

    if (!product || product === "ALL" || product === "GQ Non-FSF") {
      const { conditions, params } = getDueConditions();
      queries.push(`
        SELECT DATE_FORMAT(due_date, '%Y-%m') AS month, 'GQ Non-FSF' AS product, SUM(emi) AS total_due, 0 AS total_collected
        FROM manual_rps_gq_non_fsf
        WHERE ${conditions.join(" AND ")}
        GROUP BY DATE_FORMAT(due_date, '%Y-%m')
      `);
      allParams.push(...params);
    }

    // --- Collected Amount Queries ---
    const getPayConditions = () => {
      const conditions = ["payment_date IS NOT NULL", "payment_date < CURDATE()"];
      const params = [];
      if (from) {
        conditions.push("DATE_FORMAT(payment_date, '%Y-%m') >= ?");
        params.push(from);
      }
      if (to) {
        conditions.push("DATE_FORMAT(payment_date, '%Y-%m') <= ?");
        params.push(to);
      }
      return { conditions, params };
    };

    if (!product || product === "ALL" || product === "EV_loan" || product === "BL_loan") {
      const { conditions, params } = getPayConditions();
      queries.push(`
        SELECT DATE_FORMAT(r.payment_date, '%Y-%m') AS month, l.lender AS product, 0 AS total_due, SUM(r.transfer_amount) AS total_collected
        FROM repayments_upload r
        JOIN loan_bookings l ON l.lan = r.lan
        WHERE l.lender IN ('EV_loan', 'BL_loan') AND ${conditions.join(" AND ")}
        GROUP BY DATE_FORMAT(r.payment_date, '%Y-%m'), l.lender
      `);
      allParams.push(...params);
    }

    if (!product || product === "ALL" || product === "Adikosh") {
      const { conditions, params } = getPayConditions();
      queries.push(`
        SELECT DATE_FORMAT(payment_date, '%Y-%m') AS month, 'Adikosh' AS product, 0 AS total_due, SUM(transfer_amount) AS total_collected
        FROM repayments_upload_adikosh
        WHERE ${conditions.join(" AND ")}
        GROUP BY DATE_FORMAT(payment_date, '%Y-%m')
      `);
      allParams.push(...params);
    }

    if (!product || product === "ALL" || product === "GQ Non-FSF") {
      const { conditions, params } = getPayConditions();
      queries.push(`
        SELECT DATE_FORMAT(payment_date, '%Y-%m') AS month, 'GQ Non-FSF' AS product, 0 AS total_due, SUM(transfer_amount) AS total_collected
        FROM repayments_upload
        WHERE lan IN (SELECT lan FROM loan_booking_gq_non_fsf) AND ${conditions.join(" AND ")}
        GROUP BY DATE_FORMAT(payment_date, '%Y-%m')
      `);
      allParams.push(...params);
    }

    const finalQuery = queries.join(" UNION ALL ");
    const [rows] = await db.promise().query(finalQuery, allParams); // Pass allParams here
    res.json(rows);
  } catch (err) {
    console.error("❌ Collection vs Due Error:", err);
    res.status(500).json({ error: "Collection vs Due fetch failed" });
  }
});

router.post("/product-distribution", async (req, res) => {
  const { from, to } = req.body;

  try {
    const conditions = [];
    const params = [];

    if (from) {
      conditions.push(`DATE_FORMAT(agreement_date, '%Y-%m') >= ?`);
      params.push(from);
    }

    if (to) {
      conditions.push(`DATE_FORMAT(agreement_date, '%Y-%m') <= ?`);
      params.push(to);
    }

    const whereClause = conditions.length ? "WHERE " + conditions.join(" AND ") : "";

    const query = `
      SELECT lender AS product, COUNT(*) AS value FROM loan_bookings ${whereClause} GROUP BY lender
      UNION ALL
      SELECT 'Adikosh' AS product, COUNT(*) AS value FROM loan_booking_adikosh ${whereClause.replace(/agreement_date/g, "agreement_date")}
      UNION ALL
      SELECT 'GQ Non-FSF' AS product, COUNT(*) AS value FROM loan_booking_gq_non_fsf ${whereClause}
    `;

    const [rows] = await db.promise().query(query, [...params, ...params, ...params]);

    // Aggregate same product names (since UNION ALL keeps duplicates)
    const productMap = {};
    rows.forEach(({ product, value }) => {
      if (!productMap[product]) productMap[product] = 0;
      productMap[product] += value;
    });

    const result = Object.entries(productMap).map(([product, value]) => ({ product, value }));

    res.json(result);
  } catch (err) {
    console.error("❌ Product Distribution Error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/metric-cards", async (req, res) => {
  const { product, from, to } = req.body;
  console.log("Received filters:", req.body);

  // Function that builds the WHERE clause and pushes parameters
  const getDateFilter = (field, paramArray) => {
  let clause = "";
  if (from && from.trim()) {
    clause += ` AND DATE_FORMAT(${field}, '%Y-%m') >= ?`;
    paramArray.push(from);
  }
  if (to && to.trim()) {
    clause += ` AND DATE_FORMAT(${field}, '%Y-%m') <= ?`;
    paramArray.push(to);
  }
  return clause;
};


  const disburseParams = [];
  const collectParams = [];
  const disburseQueries = [];
  const collectQueries = [];

  // Disbursed Queries
  if (product === "ALL" || product === "EV_loan" || product === "BL_loan") {
    disburseQueries.push(`
  SELECT IFNULL(SUM(loan_amount), 0) AS amount
  FROM loan_bookings
  WHERE lender IN ('EV Loan', 'BL Loan') ${getDateFilter("agreement_date", disburseParams)}
`);

  }

  if (product === "ALL" || product === "Adikosh") {
    disburseQueries.push(`
      SELECT IFNULL(SUM(loan_amount), 0) AS amount
      FROM loan_booking_adikosh
      WHERE 1 ${getDateFilter("agreement_date", disburseParams)}
    `);
  }

  if (product === "ALL" || product === "GQ Non-FSF") {
    disburseQueries.push(`
      SELECT IFNULL(SUM(loan_amount), 0) AS amount
      FROM loan_booking_gq_non_fsf
      WHERE 1 ${getDateFilter("agreement_date", disburseParams)}
    `);
  }

  // Collection Queries
  if (product === "ALL" || product === "EV_loan" || product === "BL_loan") {
    collectQueries.push(`
      SELECT IFNULL(SUM(transfer_amount), 0) AS amount
      FROM repayments_upload r
      JOIN loan_bookings l ON l.lan = r.lan
      WHERE l.lender IN ('EV Loan', 'BL Loan') AND r.payment_date IS NOT NULL ${getDateFilter("r.payment_date", collectParams)}
    `);
  }

  if (product === "ALL" || product === "Adikosh") {
    collectQueries.push(`
  SELECT IFNULL(SUM(transfer_amount), 0) AS amount
  FROM repayments_upload_adikosh
  WHERE payment_date IS NOT NULL ${getDateFilter("payment_date", collectParams)}`);
  }

  if (product === "ALL" || product === "GQ Non-FSF") {
    collectQueries.push(`
      SELECT IFNULL(SUM(transfer_amount), 0) AS amount
      FROM repayments_upload
      WHERE lan IN (SELECT lan FROM loan_booking_gq_non_fsf)
      AND payment_date IS NOT NULL ${getDateFilter("payment_date", collectParams)}
    `);
  }

console.log("Generated Disburse Queries:", disburseQueries);
  console.log("Final Disburse Params:", disburseParams);
  console.log("Generated Collect Queries:", collectQueries);
  console.log("Final Collect Params:", collectParams);

  try {
    // Correct and explicit destructuring
    const [disbursedQueryResponse, collectedQueryResponse] = await Promise.all([
      db.promise().query(disburseQueries.join(" UNION ALL "), disburseParams),
      db.promise().query(collectQueries.join(" UNION ALL "), collectParams),
    ]);

    // Now, access the actual rows array from each response
    const disbursedRows = disbursedQueryResponse[0]; // This is the array of { amount: '...' } objects
    const collectedRows = collectedQueryResponse[0]; // This is the array of { amount: '...' } objects

    // *** ADD THESE CONSOLE LOGS TO SEE THE ACTUAL ARRAYS PASSED TO REDUCE ***
    console.log("Rows for Disbursed (for reduce):", disbursedRows);
    console.log("Rows for Collected (for reduce):", collectedRows);

    const totalDisbursed = disbursedRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const totalCollected = collectedRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const collectionRate = totalDisbursed === 0 ? 0 : (totalCollected / totalDisbursed) * 100;

    console.log("Calculated Total Disbursed:", totalDisbursed);
    console.log("Calculated Total Collected:", totalCollected);
    console.log("Calculated Collection Rate:", collectionRate);

    res.json({
      totalDisbursed,
      totalCollected,
      collectionRate,
    });
  } catch (err) {
    console.error("❌ Metric Card Fetch Error:", err);
    res.status(500).json({ error: "Failed to fetch metrics" });
  }
});




module.exports = router;
