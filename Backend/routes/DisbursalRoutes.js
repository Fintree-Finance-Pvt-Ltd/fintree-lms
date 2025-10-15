const express = require("express");
const db = require("../config/db");
const router = express.Router();

// ✅ Fetch Disbursal Details by LAN
router.get("/:lan", async (req, res) => {
  const lan = req.params.lan?.trim().toUpperCase();
  if (!lan) {
    return res
      .status(400)
      .json({ error: "LAN is required and cannot be empty" });
  }

  // Step 2: Determine table and columns
  let tableName = "loan_bookings";
  let loanAmountCol = "lb.loan_amount";
  let loanAmountExpr = "lb.loan_amount";
  let interestRateCol = "lb.interest_rate";
  let tenureCol = "lb.loan_tenure";
  let processingFeeCol = "COALESCE(lb.processing_fee, 0) AS processing_fee";
  let subventionCol = "0";
  let retentionCol = "0";
  let partnerLoanIdCol = "lb.partner_loan_id";
  let netDisbursementExpr = `(${loanAmountExpr} - ${subventionCol})`;

  if (lan.startsWith("EV")) {
    tableName = "loan_booking_ev";
    loanAmountCol = "lb.loan_amount";
    loanAmountExpr = "lb.loan_amount";
    interestRateCol = "lb.interest_rate";
    tenureCol = "lb.loan_tenure";
    processingFeeCol = "COALESCE(lb.processing_fee, 0) AS processing_fee";
    subventionCol = "0";
    retentionCol = "0";
    partnerLoanIdCol = "lb.partner_loan_id";
    netDisbursementExpr = `(${loanAmountExpr} - ${subventionCol})`;
  }

  if (lan.startsWith("HEYEV")) {
    tableName = "loan_booking_hey_ev";
    loanAmountCol = "lb.loan_amount";
    loanAmountExpr = "lb.loan_amount";
    interestRateCol = "lb.interest_rate";
    tenureCol = "lb.loan_tenure";
    processingFeeCol = "COALESCE(lb.processing_fee, 0) AS processing_fee";
    subventionCol = "0";
    retentionCol = "0";
    partnerLoanIdCol = "lb.partner_loan_id";
    netDisbursementExpr = `(${loanAmountExpr} - ${subventionCol})`;
  }

  if (lan.startsWith("FINE")) {
    tableName = "loan_booking_emiclub";
    loanAmountCol = "lb.loan_amount";
    loanAmountExpr = "lb.loan_amount";
    interestRateCol = "lb.interest_rate";
    tenureCol = "lb.loan_tenure";
    processingFeeCol = "COALESCE(lb.processing_fee, 0) AS processing_fee";
    subventionCol = "0";
    retentionCol = "0";
    partnerLoanIdCol = "lb.partner_loan_id";
    netDisbursementExpr = `(${loanAmountExpr} - ${subventionCol})`;
  } 

  else if (lan.startsWith("FINS")) {
    tableName = "loan_booking_finso";
    loanAmountCol = "lb.loan_amount";
    loanAmountExpr = "lb.loan_amount";
    interestRateCol = "lb.interest_rate";
    tenureCol = "lb.loan_tenure";
    processingFeeCol = "COALESCE(lb.processing_fee, 0) AS processing_fee";
    subventionCol = "0";
    retentionCol = "0";
    partnerLoanIdCol = "lb.partner_loan_id";
    netDisbursementExpr = `(${loanAmountExpr} - ${subventionCol})`;
  }

  if (lan.startsWith("E10")) {
    tableName = "loan_booking_embifi";
    loanAmountCol = "lb.disbursal_amount as loan_amount";
    loanAmountExpr = "lb.disbursal_amount as loan_amount";
    interestRateCol = "lb.interest_rate";
    tenureCol = "lb.loan_tenure_months AS loan_tenure";
    processingFeeCol = "lb.processing_fee";
    subventionCol = "0";
    retentionCol = "0";
    partnerLoanIdCol = "null AS partner_loan_id";
    netDisbursementExpr = "lb.disbursal_amount";
  } 
  if (lan.startsWith("GQN")) {
    tableName = "loan_booking_gq_non_fsf";
    loanAmountCol = "lb.loan_amount_sanctioned AS loan_amount";
    loanAmountExpr = "lb.loan_amount_sanctioned";
    interestRateCol = "lb.interest_percent AS interest_rate";
    tenureCol = "lb.loan_tenure_months AS loan_tenure";
    processingFeeCol = "lb.processing_fee";
    subventionCol = "COALESCE(lb.subvention_amount, 0)";
    partnerLoanIdCol = "lb.partner_loan_id";
    netDisbursementExpr = `(${loanAmountExpr} - ${subventionCol})`;
  } else if (lan.startsWith("WCTL")) {
    tableName = "loan_bookings_wctl";
    posTable = "manual_rps_wctl";
    loanAmountCol = "lb.loan_amount";
    loanAmountExpr = "lb.loan_amount";
    interestRateCol = "lb.interest_rate";
    tenureCol = "lb.loan_tenure";
    processingFeeCol = "lb.processing_fee";
    partnerLoanIdCol = "lb.partner_loan_id";
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
    partnerLoanIdCol = "lb.partner_loan_id";
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
    partnerLoanIdCol = "lb.partner_loan_id";
    netDisbursementExpr = `(${loanAmountExpr} - ${subventionCol} - ${retentionCol})`;
  }

  console.log(`📦 Using table: ${tableName} for LAN: ${lan}`);

  const query = `
    SELECT 
      ${loanAmountCol},
      ${partnerLoanIdCol},
      ${processingFeeCol},
      ${interestRateCol} ,
      ${tenureCol},
      COALESCE(lb.agreement_date, '0000-00-00') AS agreement_date,
      COALESCE(NULLIF(ed.Disbursement_UTR, ''), 'Missing UTR') AS disbursement_utr,
      COALESCE(ed.disbursement_date, '0000-00-00') AS disbursement_date,
      ${netDisbursementExpr} AS net_disbursement
    FROM ${tableName} lb
    LEFT JOIN ev_disbursement_utr ed 
      ON lb.lan COLLATE utf8mb4_unicode_ci = ed.lan COLLATE utf8mb4_unicode_ci
    WHERE lb.lan = ?;
  `;

  console.log("📄 SQL Query Prepared.");

  // Step 4: Execute Query
  db.query(query, [lan], (err, result) => {
    if (err) {
      console.error("❌ Database query error:", err);
      return res.status(500).json({ error: "Database query failed" });
    }

    console.log("✅ Query executed successfully.");

    if (result.length === 0) {
      console.warn(`⚠️ No disbursal details found for LAN: ${lan}`);
      return res
        .status(404)
        .json({ error: `No disbursal details found for LAN: ${lan}` });
    }

    console.log("📦 Disbursal details fetched:", result[0]);
    res.json(result[0]);
  });
});

module.exports = router;
