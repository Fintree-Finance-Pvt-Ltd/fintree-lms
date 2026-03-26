const express = require("express");
const db = require("../../config/db");

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
router.post("/upload-loan-digit", async (req, res) => {
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

    const lender = "LOAN-DIGIT";
    const product = "Loan Digit";
    const loan_type = "Monthly";
    const status = "Login";

    // Generate LAN
    const lan = await generateLoanDigitLan(lender);

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