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
    // res.json(results);
  });
});


//Get Lan from id for inovoice screen
router.get("/customers-lan/:partner_loan_id", async (req, res) => {
  const { partner_loan_id } = req.params;

  const query = `
    SELECT
      lan,
      lender,
      sanction_amount,
      utilized_sanction_limit,
      unutilization_sanction_limit,
      interest_rate,
      penal_rate
    FROM supply_chain_sanctions
    WHERE partner_loan_id = ?
    ORDER BY created_at DESC
  `;

  db.query(query, [partner_loan_id], (err, results) => {
    if (err) {
      console.error("Error fetching customer details:", err);
      return res.status(500).json({ message: "Database error" });
    }

    res.json(results);
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
      d.invoice_number,
      d.invoice_due_date AS due_date,
      d.disbursement_date,
      d.disbursement_amount,
      d.remaining_principal,
      d.remaining_interest,
      d.remaining_penal_interest,
      d.status
    FROM supply_chain_daily_demand d
    INNER JOIN (
      SELECT
        invoice_number,
        MAX(daily_date) AS latest_daily_date
      FROM supply_chain_daily_demand
      WHERE lan = ?
      GROUP BY invoice_number
    ) x
      ON d.invoice_number = x.invoice_number
     AND d.daily_date = x.latest_daily_date
    WHERE d.lan = ?
    ORDER BY d.disbursement_date DESC
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

router.get("/invoices/daily-demand", async (req, res) => {
  try {
    const invoice_number = decodeURIComponent(req.query.invoice_number);

    const { page = 1, pageSize = 25 } = req.query;

    const offset = (page - 1) * pageSize;

    const dataQuery = `
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
      LIMIT ? OFFSET ?
    `;

    const countQuery = `
      SELECT COUNT(*) AS total
      FROM supply_chain_daily_demand
      WHERE invoice_number = ?
    `;

    db.query(countQuery, [invoice_number], (err, countResult) => {
      if (err) {
        console.error("Count error:", err);
        return res.status(500).json({ message: "Database error" });
      }

      const total = countResult[0].total;

      db.query(
        dataQuery,
        [invoice_number, Number(pageSize), Number(offset)],
        (err, results) => {
          if (err) {
            console.error("Daily demand fetch error:", err);
            return res.status(500).json({ message: "Database error" });
          }

          res.json({
            rows: results,
            pagination: {
              total,
              page: Number(page),
              pageSize: Number(pageSize),
            },
          });
        }
      );
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});


//GET RPS SUMMARY (SINGLE ROW)

router.get("/invoices/rps", async (req, res) => {
  try {
    const invoice_number = decodeURIComponent(req.query.invoice_number);

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

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
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