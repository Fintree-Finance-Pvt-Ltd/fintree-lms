const express = require("express");
const db = require("../../config/db");

const router = express.Router();

/**
 * Fetch all Sterlion UBL loans
 */
async function fetchSterlionUblAllLoans(req, res) {
  try {
    const [rows] = await db.promise().query(
      `SELECT
        id,
        partner_loan_id,
        lan,
        CONCAT_WS(' ', first_name, last_name) AS customer_name,
        first_name,
        last_name,
        mobile_number,
        email,
        product,
        loan_amount,
        tenure_months,
        interest_rate,
        processing_fee,
        emi_amount,
        upfront_interest_amount,
        net_repayable_amount,
        business_name,
        industry,
        bank_name,
        lender,
        status,
        created_at,
        updated_at
      FROM loan_booking_sterlion_ubl
      ORDER BY id DESC`,
    );

    return res.json({
      data: rows,
    });
  } catch (err) {
    console.error("Sterlion UBL all loans fetch error:", err);

    return res.status(500).json({
      status: "FAILED",
      message: "Unable to fetch Sterlion UBL all loans",
      error: err.sqlMessage || err.message,
    });
  }
}

router.get(
  "/v1/sterlion-ubl-all-loans",
  fetchSterlionUblAllLoans,
);


router.get("/customer-details/:lan", async (req, res) => {
  const lan = String(req.params.lan || "").trim().toUpperCase();

  try {
    const [rows] = await db.promise().query(
      `
      SELECT
        id,
        partner_loan_id,
        lan,
        product,

        loan_amount,
        tenure_months,
        interest_rate,
        processing_fee,
        emi_amount,
        upfront_interest_amount,
        net_repayable_amount,

        first_name,
        last_name,
        CONCAT_WS(' ', first_name, last_name) AS customer_name,

        aadhaar_number,
        pan_number,
        mobile_number,
        email,
        date_of_birth,

        business_name,
        industry,
        gst_number,
        udyam_number,

        account_holder_name,
        account_number,
        ifsc,
        bank_name,

        permanent_address,
        business_address,

        lender,
        status,
        created_at,
        updated_at

      FROM loan_booking_sterlion_ubl
      WHERE UPPER(TRIM(lan)) = ?
      LIMIT 1
      `,
      [lan]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Sterlion UBL loan not found",
      });
    }

    const [documents] = await db.promise().query(
      `
      SELECT
        id,
        file_name,
        original_name
      FROM loan_documents
      WHERE UPPER(TRIM(lan)) = ?
      `,
      [lan]
    );

    return res.json({
      success: true,
      loan: rows[0],
      documents,
    });
  } catch (error) {
    console.error("Sterlion UBL customer details error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch Sterlion UBL customer details",
      error: error.sqlMessage || error.message,
    });
  }
});


module.exports = router;