const express = require("express");
const db = require("../../config/db");
const verifyApiKey = require("../../middleware/apiKeyAuth");

const router = express.Router();

const generateLoanIdentifiers = async (lender) => {
  lender = lender.trim(); // normalize input

  let prefixLan;

  if (lender === "SWITCH-MY-LOAN") {
    prefixLan = "SML10";
  }
  else {
    return res.status(400).json({ message: "Invalid lender type." }); // ✅ handled in route
  }

  console.log("prefixLan:", prefixLan);

  const [rows] = await db
    .promise()
    .query(
      "SELECT last_sequence FROM loan_sequences WHERE lender_name = ? FOR UPDATE",
      [lender]
    );

  let newSequence;

  if (rows.length > 0) {
    newSequence = rows[0].last_sequence + 1;
    await db
      .promise()
      .query(
        "UPDATE loan_sequences SET last_sequence = ? WHERE lender_name = ?",
        [newSequence, lender]
      );
  } else {
    newSequence = 11000;
    await db
      .promise()
      .query(
        "INSERT INTO loan_sequences (lender_name, last_sequence) VALUES (?, ?)",
        [lender, newSequence]
      );
  }

  return {
    lan: `${prefixLan}${newSequence}`,
  };
};

router.post("/v1/create", verifyApiKey, async (req, res) => {
  try {
    const data = req.body;

    if (!data.partner_loan_id)
      return res.status(400).json({ message: "partner_loan_id required" });

    if (!data.lenderType || data.lenderType !== "SWITCH-MY-LOAN")
      return res.status(400).json({ message: "Invalid lenderType" });

    // duplicate check
    const [existing] = await db.promise().query(
      `SELECT lan FROM loan_booking_switch_my_loan
       WHERE partner_loan_id = ?`,
      [data.partner_loan_id]
    );

    if (existing.length)
      return res.json({
        message: "Case already exists",
        lan: existing[0].lan,
      });

    // generate LAN
    const { lan } = await generateLoanIdentifiers("SWITCH-MY-LOAN");

    const insertSql = `
      INSERT INTO loan_booking_switch_my_loan (
        lan,
        partner_loan_id,
        full_name,
        pan_number,
        father_name,
        dob,
        gender,
        mobile,
        email,
        pincode,
        state,
        city,
        district,
        status
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `;

    await db.promise().query(insertSql, [
      lan,
      data.partner_loan_id,
      data.full_name,
      data.pan_number,
      data.father_name,
      data.dob,
      data.gender,
      data.mobile,
      data.email,
      data.pincode,
      data.state,
      data.city,
      data.district,
      "STEP_1_COMPLETED",
    ]);

    res.json({
      message: "Loan case created",
      lan,
    });
  } catch (err) {
    res.status(500).json({
      message: "Creation failed",
      error: err.message,
    });
  }
});

router.put("/v1/employment", async (req, res) => {
  try {
    const data = req.body;

    if (!data.lan)
      return res.status(400).json({ message: "lan required" });

    const sql = `
      UPDATE loan_booking_switch_my_loan
      SET
        residence_status=?,
        employment_type=?,
        company_type=?,
        company_name=?,
        designation=?,
        salary_range=?,
        salary_mode=?,
        nature_of_business=?,
        industry_type=?,
        monthly_income=?,
        status='DETAILS_UPDATED'
      WHERE lan=?
    `;

    await db.promise().query(sql, [
      data.residence_status,
      data.employment_type,
      data.company_type,
      data.company_name,
      data.designation,
      data.salary_range,
      data.salary_mode,
      data.nature_of_business,
      data.industry_type,
      data.monthly_income,
      data.lan,
    ]);

    res.json({ message: "Employment details updated" });
  } catch (err) {
    res.status(500).json({
      message: "Update failed",
      error: err.message,
    });
  }
});

router.put("/v1/address", async (req, res) => {
  try {
    const data = req.body;

    if (!data.lan)
      return res.status(400).json({ message: "lan required" });

    const sql = `
      UPDATE loan_booking_switch_my_loan
      SET
        address_line_1=?,
        address_line_2=?,
        address_pincode=?,
        address_city=?,
        address_state=?,
        is_current_address=?,
        current_address_line_1=?,
        current_address_line_2=?,
        current_address_pincode=?,
        current_address_city=?,
        current_address_state=?,
        status='APPLICATION_COMPLETED'
      WHERE lan=?
    `;

    await db.promise().query(sql, [
      data.address_line_1,
      data.address_line_2,
      data.address_pincode,
      data.address_city,
      data.address_state,
      data.is_current_address,
      data.current_address_line_1,
      data.current_address_line_2,
      data.current_address_pincode,
      data.current_address_city,
      data.current_address_state,
      data.lan,
    ]);

    res.json({
      message: "Address + KYC completed successfully",
    });
  } catch (err) {
    res.status(500).json({
      message: "Address update failed",
      error: err.message,
    });
  }
});

router.put("/v1/update-details", verifyApiKey, async (req, res) => {
  try {
    const data = req.body;

    if (!data.partner_loan_id)
      return res.status(400).json({ message: "partner_loan_id is required" });

    const sql = `
      UPDATE loan_booking_switch_my_loan
      SET
        residence_status = ?,
        employment_type = ?,

        company_type = ?,
        company_name = ?,
        designation = ?,
        salary_range = ?,
        salary_mode = ?,

        nature_of_business = ?,
        industry_type = ?,
        monthly_income = ?,

        address_line_1 = ?,
        address_line_2 = ?,
        address_pincode = ?,
        address_city = ?,
        address_state = ?,

        is_current_address = ?,

        current_address_line_1 = ?,
        current_address_line_2 = ?,
        current_address_pincode = ?,
        current_address_city = ?,
        current_address_state = ?,

        status = 'APPLICATION_COMPLETED'
      WHERE partner_loan_id = ?
    `;

    const values = [
      data.residence_status,
      data.employment_type,

      data.company_type || null,
      data.company_name || null,
      data.designation || null,
      data.salary_range || null,
      data.salary_mode || null,

      data.nature_of_business || null,
      data.industry_type || null,
      data.monthly_income || null,

      data.address_line_1,
      data.address_line_2,
      data.address_pincode,
      data.address_city,
      data.address_state,

      data.is_current_address,

      data.current_address_line_1 || null,
      data.current_address_line_2 || null,
      data.current_address_pincode || null,
      data.current_address_city || null,
      data.current_address_state || null,

      data.partner_loan_id,
    ];

    await db.promise().query(sql, values);

    res.json({
      message: "Step 2 + Step 3 details updated successfully",
      lan: data.lan
    });

  } catch (error) {
    console.error("Update details error:", error);

    res.status(500).json({
      message: "Failed to update loan details",
      error: error.message
    });
  }
});

module.exports = router;