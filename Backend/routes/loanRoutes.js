// const express = require("express");
// const db = require("../config/db");
// const router = express.Router();

// // ✅ Fetch Loan Details by LAN
// router.get("/loan-booking/:lan", (req, res) => {
//     const { lan } = req.params;
//     const query = "SELECT * FROM loan_bookings WHERE lan = ?";

//     db.query(query, [lan], (err, results) => {
//         if (err) {
//             console.error("Database Error:", err);
//             return res.status(500).json({ message: "Database error" });
//         }
//         if (results.length === 0) {
//             return res.status(404).json({ message: "Loan not found" });
//         }
//         res.json(results[0]);
//     });
// });

// module.exports = router;

const express = require("express");
const db = require("../config/db");
const router = express.Router();

// ✅ Fetch Loan Details by LAN
router.get("/loan-booking/:lan", (req, res) => {
    const { lan } = req.params;

  // Determine which table to use
  let table = "loan_bookings"; // Default
  let posTable = "manual_rps_bl_loan"; // Default

  if (lan.startsWith("GQN")) {
    table = "loan_booking_gq_non_fsf";
    posTable = "manual_rps_gq_non_fsf";
  } else if (lan.startsWith("ADK")) {
    table = "loan_booking_adikosh";
    posTable = "manual_rps_adikosh";
  } else if (lan.startsWith("GQF")) {
    table = "loan_booking_gq_fsf";
    posTable = "manual_rps_gq_fsf";
  }else if (lan.startsWith("EV")) {
    table = "loan_booking_ev";
    posTable = "manual_rps_ev_loan";
  }else if (lan.startsWith("HEYEV")) {
    table = "loan_booking_hey_ev";
    posTable = "manual_rps_hey_ev";
  }else if (lan.startsWith("E10")) {
    table = "loan_booking_embifi";
    posTable = "manual_rps_embifi_loan";
  }else if (lan.startsWith("FINE")) {
    table = "loan_booking_emiclub";
    posTable = "manual_rps_emiclub";
  }else if (lan.startsWith("FINS")) {
    table = "loan_booking_finso";
    posTable = "manual_rps_finso_loan";
  }else if (lan.startsWith("WCTL")) {
    table = "loan_bookings_wctl";
    posTable = "manual_rps_wctl";
  }

    const query = `SELECT * FROM ${table} WHERE lan = ?`;

    db.query(query, [lan], (err, results) => {
        if (err) {
            console.error("❌ Database Error:", err);
            return res.status(500).json({ message: "Database error" });
        }
        if (results.length === 0) {
            return res.status(404).json({ message: "Loan not found" });
        }
    // Now add the POS query
    const posQuery = `
      SELECT COALESCE(SUM(remaining_principal), 0) AS pos
      FROM ${posTable}
      WHERE \`LAN\` COLLATE utf8mb4_general_ci = ?
        AND status IN ('Due', 'Late')
        AND due_date <= CURDATE();
    `;

    db.query(posQuery, [lan], (posErr, posResult) => {
      if (posErr) {
        console.error("❌ POS Query Error:", posErr);
        return res.status(500).json({ message: "Database error fetching POS" });
      }

      const loanData = {
        ...results[0],
        pos_amount: posResult[0].pos || 0,
      };

      res.json(loanData);
    });
  });
});

module.exports = router;

