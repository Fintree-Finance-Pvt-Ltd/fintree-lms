const express = require("express");
const db = require("../config/db");
const router = express.Router();

// ✅ Fetch Disbursal Details by LAN
router.get("/:lan", async (req, res) => {
  const lan = req.params.lan?.trim().toUpperCase();
  if (!lan) {
    return res.status(400).json({ error: "LAN is required and cannot be empty" });
  }

  let tableName = "loan_bookings";
  let loanAmountCol = "lb.loan_amount";
  let loanAmountExpr = "lb.loan_amount";
  let interestRateCol = "lb.interest_rate";
  let tenureCol = "lb.loan_tenure";
  let processingFeeCol = "COALESCE(lb.processing_fee, 0) AS processing_fee";
  let subventionCol = "0";
  let retentionCol = "0";
  let netDisbursementExpr = `(${loanAmountExpr} - ${subventionCol})`;

  if (lan.startsWith("GQN")) {
    tableName = "loan_booking_gq_non_fsf";
    loanAmountCol = "lb.loan_amount_sanctioned AS loan_amount";
    loanAmountExpr = "lb.loan_amount_sanctioned";
    interestRateCol = "lb.interest_percent AS interest_rate";
    tenureCol = "lb.loan_tenure_months AS loan_tenure";
    processingFeeCol = "lb.processing_fee";
    subventionCol = "COALESCE(lb.subvention_amount, 0)";
    netDisbursementExpr = `(${loanAmountExpr} - ${subventionCol})`;
}
  else if (lan.startsWith("WCTL")) {
    tableName = "loan_bookings_wctl";
    posTable = "manual_rps_wctl";
    loanAmountCol = "lb.loan_amount";
    loanAmountExpr = "lb.loan_amount";
    interestRateCol = "lb.interest_rate";
    tenureCol = "lb.loan_tenure";
    processingFeeCol = "lb.processing_fee";
    subventionCol = "0";
    netDisbursementExpr = `(${loanAmountExpr})`;
  } else if (lan.startsWith("ADK")) {
    tableName = "loan_booking_adikosh";
    loanAmountCol = "lb.loan_amount";
    loanAmountExpr = "lb.loan_amount";
    interestRateCol = "lb.interest_rate";
    tenureCol = "lb.loan_tenure";
    processingFeeCol = "lb.processing_fee";
    subventionCol = "0";
    netDisbursementExpr = "lb.net_disbursement";
  } else if (lan.startsWith("GQF")) {
    tableName = "loan_booking_gq_fsf";
    loanAmountCol = "lb.loan_amount_sanctioned AS loan_amount";
    loanAmountExpr = "lb.loan_amount_sanctioned";
    interestRateCol = "lb.interest_percent AS interest_rate";
    tenureCol = "lb.loan_tenure_months AS loan_tenure";
    processingFeeCol = "lb.processing_fee";
    subventionCol = "COALESCE(lb.subvention_amount, 0)";
    retentionCol = "COALESCE(lb.retention_amount, 0)";
    netDisbursementExpr = `(${loanAmountExpr} - ${subventionCol} - ${retentionCol})`;
  }
  else {
    return res.status(400).json({ error: "Invalid LAN prefix. Supported prefixes: GQN, WCTL, ADK, GQF" });
  }

  const query = `
    SELECT 
      ${loanAmountCol},
      lb.partner_loan_id,
      ${processingFeeCol},
      ${interestRateCol},
      ${tenureCol},
      COALESCE(lb.agreement_date, '0000-00-00') AS agreement_date,
      COALESCE(NULLIF(ed.Disbursement_UTR, ''), 'Missing UTR') AS disbursement_utr,
      COALESCE(ed.Disbursement_Date, '0000-00-00') AS disbursement_date,
      ${netDisbursementExpr} AS net_disbursement,
    FROM ${tableName} lb
    LEFT JOIN ev_disbursement_utr ed 
      ON lb.lan COLLATE utf8mb4_unicode_ci = ed.lan COLLATE utf8mb4_unicode_ci
    WHERE lb.lan = ?;
  `;

  try {
    const [result] = await db.promise().query(query, [lan]);
    if (!result.length) {
      return res.status(404).json({ error: `No disbursal details found for LAN: ${lan}` });
    }
    res.json(result[0]);
  } catch (err) {
    console.error("❌ DB Query Error:", err);
    res.status(500).json({ error: "Internal server error while fetching disbursal details." });
  }
});

module.exports = router;
