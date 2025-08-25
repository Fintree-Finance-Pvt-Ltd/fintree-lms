const express = require("express");
const db = require("../config/db");

const router = express.Router();

// ✅ Fetch allocations by LAN with lender inference
router.get("/allocations/:lan", async (req, res) => {
  const lan = req.params.lan?.trim().toUpperCase();

  if (!lan) {
    return res.status(400).json({ error: "LAN is required" });
  }

  try {

    // ✅ Infer allocation table based on prefix
    let allocationTable = "";
    if (lan.startsWith("ADKF")) {
      allocationTable = "allocation_adikosh_fintree";
    } else if (lan.startsWith("ADKP")) {
      allocationTable = "allocation_adikosh_partner";
    } else if (lan.startsWith("ADK-")) {
      allocationTable = "allocation_adikosh";
    } else {
      allocationTable = "allocation";
    }

    // ✅ Validate known allocation tables only
    const validTables = [
      "allocation",
      "allocation_adikosh",
      "allocation_adikosh_fintree",
      "allocation_adikosh_partner"
    ];
    if (!validTables.includes(allocationTable)) {
      console.warn(`❌ Unknown allocation table for LAN prefix: ${lan}`);
      return res.status(400).json({ error: "Invalid LAN prefix" });
    }

    const query = `
      SELECT 
        id, due_date, allocation_date, allocated_amount, charge_type, created_at, payment_id 
      FROM ${allocationTable}
      WHERE lan = ? 
      ORDER BY allocation_date ASC;
    `;

    const [rows] = await db.promise().query(query, [lan]);

    if (!rows.length) {
      console.warn(`⚠️ No allocation records found for LAN: ${lan}.`);
      return res.json({ message: "No allocation records found", allocations: [] });
    }

    res.json({ allocations: rows });

  } catch (error) {
    console.error("❌ Error fetching allocations:", error);
    res.status(500).json({ error: "Error fetching allocation data" });
  }
});

module.exports = router;
