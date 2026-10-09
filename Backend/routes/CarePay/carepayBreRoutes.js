const express = require("express");
const router = express.Router();

const {
  autoApproveCarePayIfBureauVerified,
} = require("../CarePay/carePayBreEngine");
const { runBureau } = require("../../services/Bueraupullapiservice");
const db = require("../../config/db");

router.post("/carepay/:lan/rerun-bre", async (req, res) => {
  try {
    const lan = String(req.params.lan || "")
      .trim()
      .toUpperCase();

    if (!lan) {
      return res.status(400).json({
        success: false,
        message: "LAN is required",
      });
    }

    const result = await autoApproveCarePayIfBureauVerified(lan);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: "BRE could not be re-run",
        ...result,
      });
    }

    return res.status(200).json({
      success: true,
      message: "CarePay BRE re-run completed successfully",
      data: result,
    });
  } catch (error) {
    console.error("[CAREPAY-RERUN-BRE]", error);

    return res.status(500).json({
      success: false,
      message: "Failed to re-run CarePay BRE",
      error: error.message,
    });
  }
});

router.post("/carepay/:lan/force-bureau-and-bre", async (req, res) => {
  try {
    const lan = String(req.params.lan || "")
      .trim()
      .toUpperCase();

    if (!lan) {
      return res.status(400).json({
        success: false,
        message: "LAN is required",
      });
    }

    const [loanRows] = await db.promise().query(
      `SELECT * FROM loan_booking_carepay WHERE lan = ? LIMIT 1`,
      [lan]
    );

    if (!loanRows.length) {
      return res.status(404).json({ success: false, message: "Loan not found" });
    }

    const loan = loanRows[0];
    
    // Construct the data payload for runBureau
    const dataForBureau = {
      ...loan,
      request_amount: loan.request_amount || loan.loan_amount,
      loan_amount: loan.request_amount || loan.loan_amount,
    };

    let bureauResult = { success: false, score: null, response: null };
    try {
      bureauResult = await runBureau(dataForBureau);
      
      const score = bureauResult.score ?? null;
      const report = bureauResult.response ?? null;

      if (report) {
        await db.promise().query(
          `INSERT INTO loan_cibil_reports (lan, pan_number, score, report_xml, created_at)
           VALUES (?,?,?,?,NOW())`,
          [lan, loan.pan_number, score, report],
        );
      }

      if (score !== null) {
        await db.promise().execute(
          "UPDATE loan_booking_carepay SET cibil_score_fintree = ? WHERE lan = ?",
          [score, lan]
        );
      }

      await db.promise().query("INSERT IGNORE INTO kyc_verification_status (lan) VALUES (?)", [lan]);
      await db.promise().query(
        `UPDATE kyc_verification_status
         SET bureau_status = ?, bureau_api_response = ?
         WHERE lan = ?`,
        [bureauResult.success ? "VERIFIED" : "FAILED", report, lan]
      );
      
    } catch (err) {
      console.error("Forced Bureau failed:", err);
      await db.promise().query("INSERT IGNORE INTO kyc_verification_status (lan) VALUES (?)", [lan]);
      await db.promise().query(
        `UPDATE kyc_verification_status
         SET bureau_status = 'FAILED', bureau_api_response = ?
         WHERE lan = ?`,
        [err.message, lan]
      );
      return res.status(400).json({ success: false, message: "Bureau pull failed", error: err.message });
    }

    if (!bureauResult.success) {
      return res.status(400).json({ success: false, message: "Bureau pull returned false/failed", bureauResult });
    }

    // Now that bureau is successful, run the BRE
    const result = await autoApproveCarePayIfBureauVerified(lan);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: "BRE could not be re-run after bureau pull",
        ...result,
      });
    }

    return res.status(200).json({
      success: true,
      message: "CarePay Bureau pulled and BRE re-run successfully",
      bureauScore: bureauResult.score,
      breData: result,
    });
  } catch (error) {
    console.error("[CAREPAY-FORCE-BUREAU-BRE]", error);
    return res.status(500).json({
      success: false,
      message: "Failed to force CarePay Bureau and BRE",
      error: error.message,
    });
  }
});

module.exports = router;