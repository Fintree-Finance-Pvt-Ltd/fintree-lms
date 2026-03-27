const express = require("express");
const db = require("../../config/db");
// const authenticateUser = require("../../middleware/verifyToken");
const { clayooRunAllValidations } = require("./clyooValidationEngine");
// const { autoApproveIfAllVerified } = require("../../services/heliumValidationEngine");
// const axios = require("axios");
// const path = require("path");
// const fs = require("fs");
// const verifyApiKey = require("../../middleware/apiKeyAuth");
const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");
const dayjs = require("dayjs");

const router = express.Router();

const generateLoanIdentifiers = async (lender) => {
  console.log("✅ Clayyo routes loaded");
  lender = lender.trim(); // normalize input

  let application_id;
  let prefixLan;

  if (lender === "CLAYYO") {
    prefixLan = "CLYO10";
    application_id = "CLY0001";
  }
else if (lender === "CLAYYO-HOSPITAL") {
    prefixLan = "CLYHOS10";
    application_id = "CLYHOS0001";
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
    application_id: `${application_id}${newSequence}`,
    lan: `${prefixLan}${newSequence}`,
  };
};

router.post("/hospitals/create", async (req, res) => {
  try {
    const data = req.body;

    // ✅ Required fields (based on your React form)
    const requiredFields = [
      "hospital_legal_name",
      "registered_address",
      "registered_city",
      "registered_district",
      "registered_state",
      "registered_pincode",
      "hospital_phone",
      "owner_name",
      "owner_phone"
    ];

    const missing = requiredFields.filter(
      (field) => !data[field] || String(data[field]).trim() === ""
    );

    if (missing.length) {
      return res.status(400).json({
        message: `Missing fields: ${missing.join(", ")}`
      });
    }

    // ✅ Generate IDs
    const { lan, application_id } = await generateLoanIdentifiers("CLAYYO-HOSPITAL");

    // ✅ Map fields
    const fields = {
      application_id,
      lan,

      hospital_legal_name: data.hospital_legal_name,
      brand_name: data.brand_name || null,
      branch_locations: data.branch_locations || null,

      hospital_registration_number:
        data.hospital_registration_number || null,

      year_of_establishment: data.year_of_establishment || null,
      hospital_type: data.hospital_type || null,
      bed_capacity: data.bed_capacity || null,

      key_specialties: data.key_specialties || null,
      major_procedures: data.major_procedures || null,
      departments: data.departments || null,

      registered_address: data.registered_address,
      registered_city: data.registered_city,
      registered_district: data.registered_district,
      registered_state: data.registered_state,
      registered_pincode: data.registered_pincode,

      avg_monthly_patient_footfall:
        data.avg_monthly_patient_footfall || null,
      avg_ticket_size: data.avg_ticket_size || null,

      hospital_email: data.hospital_email || null,
      hospital_phone: data.hospital_phone,

      owner_name: data.owner_name,
      owner_email: data.owner_email || null,
      owner_phone: data.owner_phone,

      status: "ACTIVE",
      created_at: new Date()
    };

    const columns = Object.keys(fields).join(", ");
    const placeholders = Object.keys(fields).map(() => "?").join(", ");
    const values = Object.values(fields);

    // ✅ Insert into hospital table
    await db.promise().query(
      `INSERT INTO clayyo_hospital_booking (${columns}) VALUES (${placeholders})`,
      values
    );

    res.json({
      message: "Hospital created successfully",
      lan,
      application_id
    });

  } catch (err) {
    console.error("Hospital creation error:", err);

    res.status(500).json({
      message: "Hospital creation failed",
      error: err.sqlMessage || err.message
    });
  }
});

router.get("/hospitals-list", async (req, res) => {
  try {
    const [rows] = await db.promise().query(`
      SELECT 
        id,
        hospital_legal_name,
        registered_city,
        registered_district
      FROM clayyo_hospital_booking
      WHERE status = 'APPROVED'
      ORDER BY hospital_legal_name ASC
    `);

    const formatted = rows.map((h) => ({
      id: h.id,

      // ✅ This is what will show in dropdown
      name: `${h.hospital_legal_name} (${h.registered_city}, ${h.registered_district})`,

      // optional raw fields if needed later
      hospital_legal_name: h.hospital_legal_name,
      city: h.registered_city,
      district: h.registered_district,
    }));

    res.json(formatted);

  } catch (err) {
    console.error("Hospital list error:", err);

    res.status(500).json({
      message: "Failed to fetch hospitals",
      error: err.message,
    });
  }
});

router.get("/hospitals", async (req, res) => {
  try {
    const [rows] = await db.promise().query(`
      SELECT 
        id,
        lan,
        hospital_legal_name,
        brand_name,
        hospital_type,
        bed_capacity,
        registered_city,
        registered_district,
        registered_state,
        hospital_phone,
        owner_name,
        status,
        created_at
      FROM clayyo_hospital_booking
      ORDER BY created_at DESC
    `);

    res.json(rows);

  } catch (err) {
    console.error("Hospital fetch error:", err);

    res.status(500).json({
      message: "Failed to fetch hospitals",
      error: err.message,
    });
  }
});

router.get("/clayyo-hospital-booking-details/:lan", async (req, res) => {
  const { lan } = req.params;

  try {
    const [rows] = await db.promise().query(
      `
      SELECT
        id,
        application_id,
        lan,
        hospital_legal_name,
        brand_name,
        branch_locations,
        hospital_registration_number,
        year_of_establishment,
        hospital_type,
        bed_capacity,
        key_specialties,
        major_procedures,
        departments,
        registered_address,
        registered_city,
        registered_district,
        registered_state,
        registered_pincode,
        avg_monthly_patient_footfall,
        avg_ticket_size,
        hospital_email,
        hospital_phone,
        owner_name,
        owner_email,
        owner_phone,
        status,
        created_at
      FROM clayyo_hospital_booking
      WHERE lan = ?
      ORDER BY created_at DESC
      `,
      [lan]
    );

    // return single record (latest)
    res.json(rows[0] || null);

  } catch (err) {
    console.error("Hospital fetch error:", err);

    res.status(500).json({
      message: "Failed to fetch hospital details",
      error: err.message,
    });
  }
});
// hospitals-login-loans

router.get("/hospitals-login-loans", async (req, res) => {
  try {
    const [rows] = await db.promise().query(`
      SELECT 
        id,
        lan,
        hospital_legal_name,
        brand_name,
        hospital_type,
        bed_capacity,
        registered_city,
        registered_district,
        registered_state,
        hospital_phone,
        owner_name,
        status,
        created_at
      FROM clayyo_hospital_booking
      WHERE status = 'Active'
      ORDER BY created_at DESC
    `);

    res.json(rows);

  } catch (err) {
    console.error("Hospital fetch error:", err);

    res.status(500).json({
      message: "Failed to fetch hospitals",
      error: err.message,
    });
  }
});

router.patch("/hospitals/status/:lan", async (req, res) => {
  try {
    const { lan } = req.params;
    const { status } = req.body;

    if (!["APPROVED", "REJECTED", "ACTIVE", "INACTIVE"].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    await db.promise().query(
      `UPDATE clayyo_hospital_booking 
       SET status = ? 
       WHERE lan = ?`,
      [status, lan]
    );

    res.json({ message: "Status updated successfully" });

  } catch (err) {
    console.error("Status update error:", err);
    res.status(500).json({ message: "Failed to update status" });
  }
});


router.post("/manual-entry", async (req, res) => {
  try {
    const data = req.body;

    console.log("Payload:", req.body);

    // ✅ Required fields (based on your React form)
    const requiredFields = [
      "login_date",
      "first_name",
      "hospital_id",
      "last_name",
      "gender",
      "policy_type",
      "dob",
      "mobile_number",
      "pan_number",
      "current_address",
      "current_village_city",
      "current_district",
      "current_state",
      "current_pincode",
      "loan_amount",
      "employment_type",
      "net_monthly_income"
    ];

    const missing = requiredFields.filter((field) => {
  const value = data[field];

  return (
    value === undefined ||
    value === null ||
    (typeof value === "string" && value.trim() === "")
  );
});

    if (missing.length) {
      return res.status(400).json({
        message: `Missing fields: ${missing.join(", ")}`
      });
    }

    // ✅ Generate LAN + Application ID
    const { lan, application_id } = await generateLoanIdentifiers("CLAYYO");

    // Auto customer name
    const customer_name = `${data.first_name} ${data.last_name}`;

    // Fields mapping
    const fields = {
      first_name: data.first_name,
      last_name: data.last_name,
      login_date: data.login_date,
      lan,
      app_id: application_id,
      customer_name,
      gender: data.gender,
      dob: data.dob,
      age: data.age || null,
      mobile_number: data.mobile_number,
      email_id: data.email_id || null,
      pan_number: data.pan_number,
      middle_name: data.middle_name || null,
father_name: data.father_name || null,
mother_name: data.mother_name || null,
patient_name: data.patient_name || null,
bank_branch: data.bank_branch || null,
subvention_percent: data.subvention_percent || null,

      current_address: data.current_address,
      current_village_city: data.current_village_city,
      current_district: data.current_district,
      current_state: data.current_state,
      current_pincode: data.current_pincode,

      permanent_address: data.permanent_address || null,
      permanent_village_city: data.permanent_village_city || null,
      permanent_district: data.permanent_district || null,
      permanent_state: data.permanent_state || null,
      permanent_pincode: data.permanent_pincode || null,

      loan_amount: data.loan_amount,

      product: "CLAYOO",
      lender: "CLAYOO",
      status: "Login",

      employment_type: data.employment_type,
      net_monthly_income: data.net_monthly_income,

       insurance_company_name: data.insurance_company_name || null,
      insurance_policy_holder_name:
        data.insurance_policy_holder_name || null,
      insurance_policy_number: data.insurance_policy_number || null,

      bank_name: data.bank_name || null,
      name_in_bank: data.name_in_bank || null,
      account_number: data.account_number || null,
      ifsc: data.ifsc || null,
      hospital_id: data.hospital_id,
      policy_type: data.policy_type || null,
    };

    const columns = Object.keys(fields).join(", ");
    const placeholders = Object.keys(fields).map(() => "?").join(", ");
    const values = Object.values(fields);

    await db.promise().query(
      `INSERT INTO loan_booking_clayyo (${columns}) VALUES (${placeholders})`,
      values
    );

    // ✅ create KYC row
    await db
      .promise()
      .query("INSERT INTO kyc_verification_status (lan) VALUES (?)", [lan]);

    res.json({
      message: "Clayyo loan created successfully",
      lan,
      application_id
    });

    // 🔥 Trigger async validations (non-blocking)
    clayooRunAllValidations(lan);

  } catch (err) {
    console.error("Clayyo manual entry error:", err);

    res.status(500).json({
      message: "Loan creation failed",
      error: err.sqlMessage || err.message
    });
  }
});

router.get("/approve-initiate-loans", async (req, res) => {
  const { table = "loan_booking_clayyo", prefix = "CLY" } = req.query;

  const allowedTables = {
    loan_booking_clayyo:true,
  };
  if (!allowedTables[table]) {
    return res.status(400).json({ message: "Invalid table name" });
  }

  const query = `SELECT * FROM ?? WHERE status = 'Approved' AND LAN LIKE ?`;
  const values = [table, `${prefix}%`];

   db.query(query, values, (err, results) => {
    if (err) {
      console.error("Error fetching login stage loans:", err);
      return res.status(500).json({ message: "Database error" });
    }
    res.json(results);
  });
});

router.get("/credit-approved-loans", async (req, res) => {
  const { table = "loan_booking_clayyo", prefix = "CLY" } = req.query;

  const allowedTables = {
    loan_booking_clayyo:true,
  };
  if (!allowedTables[table]) {
    return res.status(400).json({ message: "Invalid table name" });
  }

  const query = `SELECT * FROM ?? WHERE status in ('LIMIT_REQUESTED', 'CREDIT_APPROVED', 'OPS_APPROVED') AND LAN LIKE ?`;
  const values = [table, `${prefix}%`];

   db.query(query, values, (err, results) => {
    if (err) {
      console.error("Error fetching login stage loans:", err);
      return res.status(500).json({ message: "Database error" });
    }
    res.json(results);
  });
});

router.put("/set-limit/:lan", async (req, res) => {
  try {
    const { lan } = req.params;
    const { limit, status, table } = req.body;

    await db.promise().query(
      `UPDATE ${table}
       SET final_limit = ?, status = ?
       WHERE lan = ?`,
      [limit, status, lan]
    );

    res.json({ message: "Limit assigned successfully" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to assign limit" });
  }
});

router.put("/ops-approve/:lan", async (req, res) => {
  try {
    const { lan } = req.params;
    const { approved_limit, pf_percent, status, table } = req.body;

    await db.promise().query(
      `UPDATE ${table}
       SET approved_limit = ?, pf_percent = ?, status = ?
       WHERE lan = ?`,
      [approved_limit, pf_percent, status, lan]
    );

    res.json({ message: "Ops approved successfully" });
  } catch (err) {
    res.status(500).json({ message: "Ops approval failed" });
  }
});

router.put("/approve-initiated-loans/:lan", (req, res) => {
  const lan = req.params.lan;
  const { status, table } = req.body;

  const allowedTables = {
    loan_booking_clayyo: true,
  };

  if (!allowedTables[table]) {
    return res.status(400).json({ message: "Invalid table name" });
  }

  if (!["credit_approved", "rejected"].includes(status)) {
    return res.status(400).json({ message: "Invalid status value" });
  }

  const updateQuery = `UPDATE ?? SET status = ? WHERE lan = ?`;

  db.query(updateQuery, [table, status, lan], async (err, result) => {
    if (err) {
      console.error("Error updating loan status:", err);
      return res.status(500).json({ message: "Database error" });
    }

    if (result.affectedRows === 0) {
      return res
        .status(404)
        .json({ message: "Loan not found with LAN " + lan });
    }
    return res.json({
      success: true,
      lan,
      table,
      status,
      message:`Loan ${status} successfully`,
    });
  });
});

router.get("/approved-loans", async (req, res) => {
  try {
    const [rows] = await db.promise().query(`
      SELECT
        lan,
        customer_name,
        app_id,
        mobile_number,

        -- amounts
        loan_amount,
        final_limit,
        approved_limit,
        pf_percent,
        subvention_percent,

        -- agreement & bank
        agreement_esign_status,
        bank_status,

        -- bank details
        bank_name,
        account_number,
        ifsc,

        -- status
        status,

        -- optional useful fields
        emi_amount,
        loan_tenure,
        login_date

      FROM loan_booking_clayyo
      WHERE status IN ('LIMIT_REQUESTED', 'OPS_APPROVED')
      ORDER BY login_date DESC, lan DESC
    `);

    return res.json(rows);

  } catch (err) {
    console.error("❌ Error fetching approved loans:", err);

    return res.status(500).json({
      message: "Failed to fetch approved loans",
      error: err.sqlMessage || err.message,
    });
  }
});

router.get("/loan-info/:lan", async (req, res) => {
  const { lan } = req.params;

  try {
    const [rows] = await db.promise().query(
      `
      SELECT
        lb.lan,
        lb.app_id,
        lb.login_date,
        lb.customer_name,
        lb.gender,
        lb.dob,
        lb.mobile_number,
        lb.email_id,
        lb.pan_number,

        lb.current_address,
        lb.current_village_city,
        lb.current_district,
        lb.current_state,
        lb.current_pincode,

        lb.permanent_address,
        lb.permanent_village_city,
        lb.permanent_district,
        lb.permanent_state,
        lb.permanent_pincode,

        lb.employment_type,
        lb.policy_type,
        lb.net_monthly_income,

        lb.loan_amount,
        lb.interest_rate,
        lb.loan_tenure,
        lb.emi_amount,
        lb.cibil_score,
        lb.status,

        -- 🔥 Clayyo BRE fields
        lb.clayyo_bre_status,
        lb.clayyo_bre_reason,
        lb.clayyo_bre_checked_at,

        lb.clayyo_bureau_score,
        lb.clayyo_enquiries_30d,

        lb.clayyo_dpd_3m_flag,
        lb.clayyo_dpd_12m_count,
        lb.clayyo_dpd_24m_60_flag,
        lb.clayyo_dpd_36m_90_flag,

        lb.clayyo_overdue_flag,
        lb.clayyo_writtenoff_flag,
        lb.clayyo_moratorium_flag,
        lb.clayyo_restructured_flag,

        -- KYC
        k.pan_status      AS kyc_pan_status,
        k.aadhaar_status  AS kyc_aadhaar_status,
        k.bureau_status   AS kyc_bureau_status

      FROM loan_booking_clayyo lb
      LEFT JOIN kyc_verification_status k
        ON k.lan = lb.lan
      WHERE lb.lan = ?
      `,
      [lan]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Loan not found" });
    }

    const row = rows[0];

    // 🔹 Loan object (matches frontend)
    const loan = {
      lan: row.lan,
      app_id: row.app_id,
      login_date: row.login_date,
      customer_name: row.customer_name,
      gender: row.gender,
      dob: row.dob,
      mobile_number: row.mobile_number,
      email_id: row.email_id,
      pan_number: row.pan_number,

      current_address: row.current_address,
      current_village_city: row.current_village_city,
      current_district: row.current_district,
      current_state: row.current_state,
      current_pincode: row.current_pincode,

      permanent_address: row.permanent_address,
      permanent_village_city: row.permanent_village_city,
      permanent_district: row.permanent_district,
      permanent_state: row.permanent_state,
      permanent_pincode: row.permanent_pincode,

      employment_type: row.employment_type,
      policy_type: row.policy_type,
      net_monthly_income: row.net_monthly_income,

      loan_amount: row.loan_amount,
      interest_rate: row.interest_rate,
      loan_tenure: row.loan_tenure,
      emi_amount: row.emi_amount,
      cibil_score: row.cibil_score,
      status: row.status,

      // 🔥 Clayyo BRE
      clayyo_bre_status: row.clayyo_bre_status,
      clayyo_bre_reason: row.clayyo_bre_reason,
      clayyo_bre_checked_at: row.clayyo_bre_checked_at,

      clayyo_bureau_score: row.clayyo_bureau_score,
      clayyo_enquiries_30d: row.clayyo_enquiries_30d,

      clayyo_dpd_3m_flag: row.clayyo_dpd_3m_flag,
      clayyo_dpd_12m_count: row.clayyo_dpd_12m_count,
      clayyo_dpd_24m_60_flag: row.clayyo_dpd_24m_60_flag,
      clayyo_dpd_36m_90_flag: row.clayyo_dpd_36m_90_flag,

      clayyo_overdue_flag: row.clayyo_overdue_flag,
      clayyo_writtenoff_flag: row.clayyo_writtenoff_flag,
      clayyo_moratorium_flag: row.clayyo_moratorium_flag,
      clayyo_restructured_flag: row.clayyo_restructured_flag,
    };

    // 🔹 KYC object (same as Helium → reusable frontend)
    const kyc = {
      pan_status: row.kyc_pan_status || "PENDING",
      aadhaar_status: row.kyc_aadhaar_status || "PENDING",
      bureau_status: row.kyc_bureau_status || "PENDING",
    };

    return res.json({ loan, kyc });

  } catch (err) {
    console.error("❌ Error fetching Clayyo loan details:", err);
    return res.status(500).json({
      message: "Failed to fetch Clayyo loan details",
      error: err.sqlMessage || err.message,
    });
  }
});

router.get("/:lan/pdf", async (req, res) => {
  const { lan } = req.params;

  try {

    const templatePath = path.join(
      __dirname,
      "../../templates/Clayyo_Agreement.html"
    );

    if (!fs.existsSync(templatePath)) {
      return res.status(500).json({
        message: "Clayyo agreement template not found"
      });
    }

    let html = fs.readFileSync(templatePath, "utf-8");

    const [rows] = await db.promise().query(
      `
      SELECT
        FINAL_LIMIT,
        PER_ADD,
        CUST_NAME,
        CUST_PAN,
        CUST_AGE,
        CUR_DATE,
        LAN,
        CUST_BANK,
        CUST_ACC_NO
      FROM clayyo_loan_summary
      WHERE lan = ?
      `,
      [lan]
    );

    if (!rows.length) {
      return res.status(404).json({
        message: "Clayyo summary not found"
      });
    }

    const summary = rows[0];

    // Replace placeholders automatically
    html = html.replace(/{{(.*?)}}/g, (_, key) =>
      summary[key.trim()] ?? ""
    );

    const browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox"]
    });

    const page = await browser.newPage();

    await page.setContent(html, {
      waitUntil: "networkidle0"
    });

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true
    });

    await browser.close();

    res.setHeader("Content-Type", "application/pdf");

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="Clayyo_Agreement_${lan}.pdf"`
    );

    res.send(pdfBuffer);

  } catch (err) {

    console.error("Clayyo agreement error:", err);

    res.status(500).json({
      message: "Agreement generation failed",
      error: err.message
    });

  }
});


module.exports = router;