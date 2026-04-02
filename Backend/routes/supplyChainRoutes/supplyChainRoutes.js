const express = require("express");
const db = require("../../config/db");

const router = express.Router();


// GET CUSTOMER LIST API
router.get("/customers", async (req, res) => {
  const query = `
    SELECT
      scl.partner_loan_id,
      scl.applicant_name,
      scs.lan,
      scs.sanction_amount,
      scs.utilized_sanction_limit,
      scs.unutilization_sanction_limit,
      scs.interest_rate
    FROM supply_chain_loans scl
    LEFT JOIN supply_chain_sanctions scs
      ON scl.partner_loan_id = scs.partner_loan_id
    ORDER BY scl.created_at DESC
  `;

  db.query(query, (err, results) => {
    if (err) {
      console.error("Error fetching customers:", err);
      return res.status(500).json({ message: "Database error" });
    }

    res.json(results);
  });
});


//GET CUSTOMER DETAILS
router.get("/customers/:partner_loan_id", async (req, res) => {
  const { partner_loan_id } = req.params;

  const query = `
    SELECT
      scl.*,
      scs.lan,
      scs.sanction_amount,
      scs.utilized_sanction_limit,
      scs.unutilization_sanction_limit,
      scs.tenure_months,
      scs.interest_rate,
      scs.penal_rate
    FROM supply_chain_loans scl
    LEFT JOIN supply_chain_sanctions scs
      ON scl.partner_loan_id = scs.partner_loan_id
    WHERE scl.partner_loan_id = ?
  `;

  db.query(query, [partner_loan_id], (err, results) => {
    if (err) {
      console.error("Error fetching customer details:", err);
      return res.status(500).json({ message: "Database error" });
    }

    res.json(results[0]);
  });
});

//GET SUPPLIERS BY PARTNER LOAN ID

router.get("/customers/:partner_loan_id/suppliers", async (req, res) => {
  const { partner_loan_id } = req.params;

  const query = `
    SELECT
      supplier_name,
      mobile_number,
      bank_account_number,
      ifsc_code,
      bank_name,
      account_holder_name,
      status,
      created_at
    FROM supplier_onboarding
    WHERE partner_loan_id = ?
    ORDER BY created_at DESC
  `;

  db.query(query, [partner_loan_id], (err, results) => {
    if (err) {
      console.error("Error fetching suppliers:", err);
      return res.status(500).json({ message: "Database error" });
    }

    res.json(results);
  });
});

//GET INVOICES BY LAN
router.get("/customers/:lan/invoices", async (req, res) => {
  const { lan } = req.params;

  const query = `
    SELECT
      invoice_number,
      MIN(invoice_due_date) AS due_date,
      MAX(disbursement_date) AS disbursement_date,
      SUM(disbursement_amount) AS disbursement_amount,
      SUM(remaining_principal) AS remaining_principal,
      SUM(remaining_interest) AS remaining_interest,
      SUM(remaining_penal_interest) AS remaining_penal_interest,
      MAX(status) AS status
    FROM supply_chain_daily_demand
    WHERE lan = ?
    GROUP BY invoice_number
    ORDER BY disbursement_date DESC
  `;

  db.query(query, [lan], (err, results) => {
    if (err) {
      console.error("Error fetching invoices:", err);
      return res.status(500).json({ message: "Database error" });
    }

    res.json(results);
  });
});

//GET DAILY DEMAND PER INVOICE

router.get("/invoices/:invoice_number/daily-demand", async (req, res) => {
  const invoice_number = decodeURIComponent(req.params.invoice_number);

  const query = `
    SELECT
      daily_date,
      remaining_principal,
      remaining_interest,
      remaining_penal_interest,
      total_amount_demand,
      status
    FROM supply_chain_daily_demand
    WHERE invoice_number = ?
    ORDER BY daily_date ASC
  `;

  db.query(query, [invoice_number], (err, results) => {
    if (err) {
      console.error("Error fetching daily demand:", err);
      return res.status(500).json({ message: "Database error" });
    }

    res.json(results);
  });
});


//GET RPS SUMMARY (SINGLE ROW)

router.get("/invoices/:invoice_number/rps", async (req, res) => {
   const invoice_number = decodeURIComponent(req.params.invoice_number);

  const query = `
    SELECT
      collection_date,
      collection_utr,
      total_collected,
      allocated_principal,
      allocated_interest,
      allocated_penal_interest,
      excess_payment
    FROM supply_chain_allocation
    WHERE invoice_number = ?
    LIMIT 1
  `;

  db.query(query, [invoice_number], (err, results) => {
    if (err) {
      console.error("Error fetching RPS summary:", err);
      return res.status(500).json({ message: "Database error" });
    }

    res.json(results[0] || {});
  });
});

// CUSTOMER SUMMARY DASHBOARD API 

router.get("/customers/:lan/summary", async (req, res) => {
  const { lan } = req.params;

  const query = `
    SELECT
      COUNT(DISTINCT invoice_number) AS total_invoices,
      SUM(remaining_principal) AS remaining_principal,
      SUM(remaining_interest) AS remaining_interest,
      SUM(remaining_penal_interest) AS remaining_penal_interest
    FROM supply_chain_daily_demand
    WHERE lan = ?
  `;

  db.query(query, [lan], (err, results) => {
    if (err) {
      console.error("Error fetching summary:", err);
      return res.status(500).json({ message: "Database error" });
    }

    res.json(results[0]);
  });
});

// cusotmes lan rapyments routes

router.get("/customers/:lan/repayments", async (req, res) => {

  const { lan } = req.params;

  const query = `
    SELECT
      collection_date,
      collection_utr,
      collection_amount,
      created_at
    FROM supply_chain_repayments
    WHERE lan = ?
    ORDER BY collection_date DESC
  `;

  db.query(query, [lan], (err, results) => {

    if (err) {
      console.error("Error fetching repayments:", err);
      return res.status(500).json({ message: "Database error" });
    }

    res.json(results);

  });

});

//allcoation rotue 

router.get("/customers/:lan/allocation", async (req, res) => {

  const { lan } = req.params;

  const query = `
    SELECT
      invoice_number,
      collection_date,
      collection_utr,
      total_collected,
      allocated_principal,
      allocated_interest,
      allocated_penal_interest,
      excess_payment,
      created_at
    FROM supply_chain_allocation
    WHERE lan = ?
    ORDER BY collection_date DESC
  `;

  db.query(query, [lan], (err, results) => {

    if (err) {
      console.error("Error fetching allocation:", err);
      return res.status(500).json({ message: "Database error" });
    }

    res.json(results);

  });

});
module.exports = router;