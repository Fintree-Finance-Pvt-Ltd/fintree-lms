const express = require("express");
const router = express.Router();
const db = require("../config/db");

// Allowed tables (add more here if needed)
const allowedTables = [
  { prefix: "E1", table: "loan_booking_embifi" },
//   { prefix: "BL", table: "loan_bookings" },
  // add more: { prefix: "XX", table: "loan_booking_xx" }
];

// ====== SEARCH ROUTE ======
router.get("/search", async (req, res) => {
  const { customer_name, mobile_number, lan } = req.query;

  if (!customer_name && !mobile_number && !lan) {
    return res.status(400).json({ message: "Please provide at least one search parameter" });
  }

  try {
    let tablesToSearch = [];

    // If LAN is entered, check if it matches any prefix
    if (lan) {
      const matched = allowedTables.find((t) => lan.startsWith(t.prefix));
      if (matched) {
        tablesToSearch = [matched.table];
      } else {
        // if no prefix match, search all tables
        tablesToSearch = allowedTables.map((t) => t.table);
      }
    } else {
      // if no LAN, search all allowed tables
      tablesToSearch = allowedTables.map((t) => t.table);
    }

    let allResults = [];

    // Build WHERE clause based on provided fields
    const conditions = [];
    const values = [];

    if (lan) {
      conditions.push("lan = ?");
      values.push(lan);
    }
    if (mobile_number) {
      conditions.push("mobile_number = ?");
      values.push(mobile_number);
    }
    if (customer_name) {
      conditions.push("customer_name LIKE ?");
      values.push(`%${customer_name}%`);
    }

    const whereClause = conditions.join(" OR "); // search with OR logic

    // Loop through each table and query it
    for (const table of tablesToSearch) {
      const query = `SELECT *, '${table}' AS source_table FROM ${table} WHERE ${whereClause}`;

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
