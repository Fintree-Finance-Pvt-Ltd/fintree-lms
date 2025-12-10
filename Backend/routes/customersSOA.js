// const express = require("express");
// const router = express.Router();
// const db = require("../config/db");

// // Allowed tables (add more here if needed)
// const allowedTables = [
//   { prefix: "E1", table: "loan_booking_embifi" },
// //   { prefix: "BL", table: "loan_bookings" },
//   // add more: { prefix: "XX", table: "loan_booking_xx" }
// ];

// // ====== SEARCH ROUTE ======
// router.get("/search", async (req, res) => {
//   const { customer_name, mobile_number, lan } = req.query;

//   if (!customer_name && !mobile_number && !lan) {
//     return res.status(400).json({ message: "Please provide at least one search parameter" });
//   }

//   try {
//     let tablesToSearch = [];

//     // If LAN is entered, check if it matches any prefix
//     if (lan) {
//       const matched = allowedTables.find((t) => lan.startsWith(t.prefix));
//       if (matched) {
//         tablesToSearch = [matched.table];
//       } else {
//         // if no prefix match, search all tables
//         tablesToSearch = allowedTables.map((t) => t.table);
//       }
//     } else {
//       // if no LAN, search all allowed tables
//       tablesToSearch = allowedTables.map((t) => t.table);
//     }

//     let allResults = [];

//     // Build WHERE clause based on provided fields
//     const conditions = [];
//     const values = [];

//     if (lan) {
//       conditions.push("lan = ?");
//       values.push(lan);
//     }
//     if (mobile_number) {
//       conditions.push("mobile_number = ?");
//       values.push(mobile_number);
//     }
//     if (customer_name) {
//       conditions.push("customer_name LIKE ?");
//       values.push(`%${customer_name}%`);
//     }

//     const whereClause = conditions.join(" OR "); // search with OR logic

//     // Loop through each table and query it
//     for (const table of tablesToSearch) {
//       const query = `SELECT *, '${table}' AS source_table FROM ${table} WHERE ${whereClause}`;

//       const [rows] = await db.promise().query(query, values);
//       allResults = allResults.concat(rows);
//     }

//     res.json(allResults);
//   } catch (err) {
//     console.error("❌ Error searching customers:", err);
//     res.status(500).json({ message: "Server error" });
//   }
// });

// module.exports = router;


const express = require("express");
const router = express.Router();
const db = require("../config/db");

// Allowed tables
const allowedTables = [
  { prefix: "E1", table: "loan_booking_embifi" },
];

// ====== SEARCH ROUTE ======
router.get("/search", async (req, res) => {
  const { customer_name, mobile_number, lan, district, dealer_name } = req.query;

  // At least one search value must be provided
  if (!customer_name && !mobile_number && !lan && !district && !dealer_name) {
    return res.status(400).json({ message: "Please provide at least one search parameter" });
  }

  try {
    let tablesToSearch = [];

    if (lan) {
      const matched = allowedTables.find((t) => lan.startsWith(t.prefix));
      tablesToSearch = matched ? [matched.table] : allowedTables.map((t) => t.table);
    } else {
      tablesToSearch = allowedTables.map((t) => t.table);
    }

    let allResults = [];

    // Build WHERE clause (AND conditions)
    const conditions = [];
    const values = [];

    if (lan) {
      conditions.push("lan LIKE ?");
      values.push(`%${lan}%`);
    }

    if (mobile_number) {
      conditions.push("mobile_number LIKE ?");
      values.push(`%${mobile_number}%`);
    }

    if (customer_name) {
      conditions.push("customer_name LIKE ?");
      values.push(`%${customer_name}%`);
    }

    if (district) {
      conditions.push("district LIKE ?");
      values.push(`%${district}%`);
    }

    if (dealer_name) {
      conditions.push("dealer_name LIKE ?");
      values.push(`%${dealer_name}%`);
    }

    const whereClause = conditions.length > 0 ? conditions.join(" AND ") : "1=1";

    // Query each table
    for (const table of tablesToSearch) {
      const query = `
        SELECT *, '${table}' AS source_table 
        FROM ${table} 
        WHERE ${whereClause}
      `;

      const [rows] = await db.promise().query(query, values);
      allResults = allResults.concat(rows);
    }

    res.json(allResults);
  } catch (err) {
    console.error("❌ Error searching customers:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
