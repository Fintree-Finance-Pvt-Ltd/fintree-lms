const express = require("express");
const db = require("../config/db");
const router = express.Router();

// ✅ Get Charges & Cashflow Data for a Specific LAN
router.get("/charges-cashflow/:lan", async (req, res) => {
  const lan = req.params.lan?.trim().toUpperCase();

  if (!lan) {
    return res.status(400).json({ message: "LAN is required" });
  }

  try {
    const tableName = lan.startsWith("ADK") ? "repayments_upload_adikosh" : "repayments_upload";

    // Optional: whitelist allowed tables for safety
    const allowedTables = ["repayments_upload", "repayments_upload_adikosh"];
    if (!allowedTables.includes(tableName)) {
      return res.status(400).json({ message: "Unsupported LAN prefix" });
    }

    const query = `
      SELECT 
        lan, 
        bank_date, 
        utr, 
        payment_date, 
        payment_id, 
        payment_mode, 
        transfer_amount, 
        created_at 
      FROM ${tableName}
      WHERE lan = ?
      ORDER BY created_at ASC;
    `;

    const [results] = await db.promise().query(query, [lan]);

    if (!results.length) {
      return res.status(404).json({ message: "No charges or cashflow data found" });
    }

    res.json(results);
  } catch (error) {
    console.error("❌ Error fetching charges cashflow:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

module.exports = router;
