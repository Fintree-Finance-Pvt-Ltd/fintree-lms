const express = require("express");
const router = express.Router();
const db = require("../config/db");

// ✅ Fetch Foreclosure Collection Summary by LAN
router.get("/fc/:lan", async (req, res) => {
  const lan = req.params.lan?.trim();

  if (!lan) {
    return res.status(400).json({ error: "LAN is required" });
  }

  try {
    console.log("🧮 Running foreclosure procedure for LAN:", lan);

    // Step 1: Call SP to populate temp_forecloser
    await db.promise().query("CALL sp_calculate_forecloser_collection(?)", [lan]);

    // Step 2: Fetch the results
    const [rows] = await db.promise().query("SELECT * FROM temp_forecloser WHERE lan = ?", [lan]);

    if (!rows.length) {
      return res.status(404).json({ message: "No foreclosure data found for this LAN" });
    }

    console.log("📦 Foreclosure result fetched:", rows.length, "records");
    res.json(rows);
  } catch (err) {
    console.error("❌ FC Procedure Error:", err);
    res.status(500).json({ error: "Failed to fetch foreclosure collection data" });
  }
});

// ✅ Insert Foreclosure Charges into loan_charges
router.post("/fc/collect", async (req, res) => {
  const payload = req.body;

  if (!Array.isArray(payload) || payload.length === 0) {
    return res.status(400).json({ error: "Empty or invalid payload" });
  }

  try {
    const now = new Date();
    const chargeDate = now.toISOString().split('T')[0]; // YYYY-MM-DD

    const values = payload.map(charge => [
      charge.lan?.trim(),
      chargeDate, // charge_date
      chargeDate, // due_date
      parseFloat(charge.amount) || 0,
      0, // paid_amount
      0, // waived_off
      'Unpaid',
      null, // payment_time
      charge.charge_type?.trim() || "Unknown",
      now // created_at
    ]);

    const insertQuery = `
      INSERT INTO loan_charges (
        lan, charge_date, due_date, amount, paid_amount, waived_off,
        paid_status, payment_time, charge_type, created_at
      ) VALUES ?
    `;

    await db.promise().query(insertQuery, [values]);

    console.log(`✅ ${values.length} foreclosure charges inserted successfully.`);
    res.status(200).json({ message: `${values.length} charges inserted successfully.` });

  } catch (error) {
    console.error("❌ Error inserting foreclosure charges:", error);
    res.status(500).json({ error: "Failed to insert foreclosure charges" });
  }
});

module.exports = router;
