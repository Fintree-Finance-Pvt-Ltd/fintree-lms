const express = require("express");
const db = require("../../config/db");
const verifyApiKey = require("../../middleware/apiKeyAuth");

const router = express.Router();

/**
 * Generate LAN
 */

const generateLoanDigitLan = async (lender) => {
  lender = lender.trim();

  const prefixLan = "LDF10";

  const [rows] = await db
    .promise()
    .query(
      "SELECT last_sequence FROM loan_sequences WHERE lender_name = ? FOR UPDATE",
      [lender]
    );

  let newSequence;

  if (rows.length > 0) {
    newSequence = rows[0].last_sequence + 1;

    await db.promise().query(
      "UPDATE loan_sequences SET last_sequence = ? WHERE lender_name = ?",
      [newSequence, lender]
    );
  } else {
    newSequence = 11000;

    await db.promise().query(
      "INSERT INTO loan_sequences (lender_name, last_sequence) VALUES (?, ?)",
      [lender, newSequence]
    );
  }

  return `${prefixLan}${newSequence}`;
};


/**
 * Upload Loan Digit Loan
 */
router.post("/add-loan-digit", verifyApiKey, async (req, res) => {
  try {

    const requiredFields = [
      "partner_loan_id",
      "first_name",
      "last_name",
      "mobile_number",
      "pan_number",
      "dob",
      "age",
      "gender",
      "current_address",
      "current_village_city",
      "current_district",
      "current_state",
      "current_pincode",
      "permanent_address",
      "permanent_state",
      "permanent_pincode",
      "employment",
      "cibil_score",
      "mode_of_salary",
      "monthly_salary",
      "current_emi",
      "marital_status",
      "residential_status",
      "occupied_since",
      "years_in_current_city",
      "company_name",
      "company_address",
      "years_in_current_job",
      "total_work_experience",
      "bank_name",
      "name_in_bank",
      "account_number",
      "ifsc",
      "account_type",
      "loan_amount",
      "processing_fee",
      "interest_rate",
      "loan_tenure",
      "pre_emi",
      "net_disbursement_amount"
    ];

    // Validate required fields
    for (let field of requiredFields) {
      if (!req.body[field]) {
        return res.status(400).json({
          message: `❌ Missing required field: ${field}`,
        });
      }
    }

    
    const {
      partner_loan_id,
      first_name,
      middle_name,
      last_name,
      mobile_number,
      pan_number,
      dob,
      age,
      gender,
      current_address,
      current_village_city,
      current_district,
      current_state,
      current_pincode,
      permanent_address,
      permanent_village_city,
      permanent_district,
      permanent_state,
      permanent_pincode,
      employment,
      mode_of_salary,
      monthly_salary,
      current_emi,
      marital_status,
      residential_status,
      occupied_since,
      years_in_current_city,
      cibil_score,
      company_name,
      company_address,
      years_in_current_job,
      total_work_experience,
      bank_name,
      name_in_bank,
      account_number,
      ifsc,
      account_type,
      loan_amount,
      processing_fee,
      interest_rate,
      loan_tenure,
      pre_emi,
      net_disbursement_amount
    } = req.body;


     /*
     ===============================
     PAN FORMAT VALIDATION
     ===============================
    */
    const normalizedPan = pan_number.toUpperCase().trim();

    const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;

    if (!panRegex.test(normalizedPan)) {
      return res.status(400).json({
        status: "Failed",
        message: "Invalid PAN format"
      });
    }


    /*
     ===============================
     PAN DUPLICATION CHECK
     ===============================
    */

    console.log("🔍 Checking PAN duplication:", normalizedPan);

    const [panRecords] = await db.promise().query(
      `
      SELECT pan_status
      FROM loan_booking_loan_digit
      WHERE UPPER(pan_number) = ?
      `,
      [normalizedPan]
    );

    const allowedStatuses = [
      "Cancelled",
      "Foreclosed",
      "Fully Paid",
      "Rejected"
    ];

    if (panRecords.length > 0) {

      const hasActiveLoan = panRecords.some(
        row => !allowedStatuses.includes(row.pan_status?.trim())
      );

      if (hasActiveLoan) {
        console.error("❌ Active case exists for PAN:", normalizedPan);

        return res.status(400).json({
          status: "Failed",
          message:
            "PAN already exists with an active loan. New loan not allowed."
        });
      }

      console.log(
        "✅ PAN exists but previous loans are closed. Proceeding."
      );
    }

    const lender = "LOAN-DIGIT";
    const product = "Loan Digit";
    const loan_type = "Monthly";
    const status = "Login";

    // Generate LAN
    const lan = await generateLoanDigitLan(lender);

    const customer_name =
      `${first_name} ${middle_name || ""} ${last_name}`.trim();


    await db.promise().query(
      `
      INSERT INTO loan_booking_loan_digit (
        lan,
        partner_loan_id,

        first_name,
        middle_name,
        last_name,
        customer_name,
        mobile_number,
        pan_number,
        dob,
        age,
        gender,

        current_address,
        current_village_city,
        current_district,
        current_state,
        current_pincode,

        permanent_address,
        permanent_village_city,
        permanent_district,
        permanent_state,
        permanent_pincode,

        employment,
        mode_of_salary,
        monthly_salary,
        current_emi,
        marital_status,
        residential_status,
        cibil_score,

        occupied_since,
        years_in_current_city,

        company_name,
        company_address,
        years_in_current_job,
        total_work_experience,

        bank_name,
        name_in_bank,
        account_number,
        ifsc,
        account_type,

        loan_amount,
        processing_fee,
        interest_rate,
        loan_tenure,
        pre_emi,
        net_disbursement_amount,

        lender,
        product,
        loan_type,
        status
      )
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `,
      [
        lan,
        partner_loan_id,

        first_name,
        middle_name,
        last_name,
        customer_name,
        mobile_number,
        pan_number,
        dob,
        age,
        gender,

        current_address,
        current_village_city,
        current_district,
        current_state,
        current_pincode,

        permanent_address,
        permanent_village_city,
        permanent_district,
        permanent_state,
        permanent_pincode,

        employment,
        mode_of_salary,
        monthly_salary,
        current_emi,
        marital_status,
        residential_status,
        cibil_score,

        occupied_since,
        years_in_current_city,

        company_name,
        company_address,
        years_in_current_job,
        total_work_experience,

        bank_name,
        name_in_bank,
        account_number,
        ifsc,
        account_type,

        loan_amount,
        processing_fee,
        interest_rate,
        loan_tenure,
        pre_emi,
        net_disbursement_amount,

        lender,
        product,
        loan_type,
        status
      ]
    );


    return res.json({
      message: "✅ Loan Digit loan saved successfully.",
      lan,
      cibilScore: cibil_score
    });

  } catch (error) {

    console.error("❌ Unhandled Error:", error);

    res.status(500).json({
      message: "Upload failed. Please try again.",
      error: error.sqlMessage || error.message
    });
  }
});


module.exports = router;