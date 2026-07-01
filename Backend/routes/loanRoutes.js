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
  } else if (lan.startsWith("EV")) {
    table = "loan_booking_ev";
    posTable = "manual_rps_ev_loan";
  } else if (lan.startsWith("HEYEV")) {
    table = "loan_booking_hey_ev";
    posTable = "manual_rps_hey_ev";
  } else if (lan.startsWith("HEYBF")) {
    table = "loan_booking_hey_ev_battery";
    posTable = "manual_rps_hey_ev_battery";
  } else if (lan.startsWith("E10")) {
    table = "loan_booking_embifi";
    posTable = "manual_rps_embifi_loan";
  } else if (lan.startsWith("FINE")) {
    table = "loan_booking_emiclub";
    posTable = "manual_rps_emiclub";
  } else if (lan.startsWith("CARE")) {
    table = "loan_booking_carepay";
    posTable = "manual_rps_carepay";
  } else if (lan.startsWith("STRL")) {
    table = "loan_booking_sterlion";
    posTable = "manual_rps_sterlion";
  } else if (lan.startsWith("FINS")) {
    table = "loan_booking_finso";
    posTable = "manual_rps_finso_loan";
  } else if (lan.startsWith("WCTL")) {
    table = "loan_bookings_wctl";
    posTable = "manual_rps_wctl";
  } else if (lan.startsWith("CIRF")) {
    table = "loan_booking_circle_pe";
    posTable = "manual_rps_circlepe";
  }
  else if (lan.startsWith("CIRHUF")) {
    table = "loan_booking_circle_pe_houser";
    posTable = "manual_rps_circle_pe_houser";
  }
   else if (lan.startsWith("HEL")) {
    table = "loan_booking_helium";
    posTable = "manual_rps_helium";
  } else if (lan.startsWith("ZYPF")) {
    table = "loan_booking_zypay_customer";
    posTable = "manual_rps_zypay";
  } else if (lan.startsWith("DLR")) {
    table = "dealer_onboarding";
  } else if (lan.startsWith("CLY")) {
    table = "loan_booking_clayyo";
    posTable = "manual_rps_clayoo";
  } else if (lan.startsWith("LDF")) {
    table = "loan_booking_loan_digit";
    posTable = "manual_rps_loan_digit";
  } else if (lan.startsWith("MC")) {
    table = "loan_booking_motion_corp";
    posTable = "manual_rps_motioncorp";
  }else if (lan.startsWith("SF")) {
    table = "loan_booking_seven_fincorp";
    posTable = "manual_rps_seven_fincorp";
  }
  else if (lan.startsWith("SH")) {
    table = "loan_booking_srbh";
    posTable = "manual_rps_srbh";
  }else if (lan.startsWith("BUN")) {
    table = "loan_booking_bundela";
    posTable = "manual_rps_bundela";
  } else if (lan.startsWith("FCCOD")) {
    table = "loan_booking_wctl_cc_od";
  }
  else if (lan.startsWith("RML")) {
    table = "loan_booking_switch_my_loan";
    posTable = "manual_rps_switch_my_loan";
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
