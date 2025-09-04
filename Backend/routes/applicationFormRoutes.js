const express = require("express");
const db = require("../config/db");

const router = express.Router();

// ✅ Get Loan & Documents by LAN
router.get("/:lan", async (req, res) => {
  const { lan } = req.params;
  const lanPrefix = lan.slice(0, 3).toUpperCase();

  const tableMap = {
    "EV": "loan_booking_ev",
    "HC": "loan_bookings",
    "BL": "loan_bookings",
    "GQN": "loan_booking_gq_non_fsf",
    "GQF": "loan_booking_gq_fsf",
    "ADK": "loan_booking_adikosh",
    "ADP": "loan_booking_adikosh",  // if applicable
  };

  const table = tableMap[lanPrefix];

  if (!table) {
    return res.status(404).json({ message: "Invalid LAN prefix" });
  }

  try {
    const loanQuery = `SELECT * FROM ${table} WHERE lan = ?`;
    const docQuery = `SELECT id, file_name, original_name FROM loan_documents WHERE lan = ?`;

    const [loanRows, docRows] = await Promise.all([
      db.promise().query(loanQuery, [lan]),
      db.promise().query(docQuery, [lan])
    ]);

    const loanResults = loanRows[0];
    const docResults = docRows[0];

    if (!loanResults.length) {
      return res.status(404).json({ message: "Loan not found" });
    }

    return res.json({
      loan: loanResults[0],
      documents: docResults
    });
  } catch (err) {
    console.error("❌ Error fetching loan or documents:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

module.exports = router;
