const express = require("express");
const db = require("../../config/db");
const { clayooRunAllValidations } = require("./clyooValidationEngine");
const partnerBookingWrapper = require("../../services/partnerBookingWrapper");
const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const nodemailer = require("nodemailer");


const router = express.Router();

const LOAN_STATUS = {
  LOGIN: "Login",
  BRE_APPROVED: "BRE APPROVED",
  BRE_REJECTED: "BRE FAILED",
  CREDIT_APPROVED: "CREDIT APPROVED",
  CREDIT_REJECTED: "REJECTED",
  LIMIT_REQUESTED: "LIMIT REQUESTED",
  OPS_APPROVED: "OPS APPROVED",
  DISBURSEMENT_INITIATED: "DISBURSEMENT INITIATED",
  DISBURSED: "DISBURSED",
};

let clayyoBankTrackerReadyPromise = null;

/*
 * Production may not have the update-tracking columns.
 * This tracker table provides the same one-time-update
 * protection without changing loan_booking_clayyo.
 */
const ensureClayyoBankTrackerTable =
  async () => {
    if (!clayyoBankTrackerReadyPromise) {
      clayyoBankTrackerReadyPromise =
        db
          .promise()
          .query(
            `
            CREATE TABLE IF NOT EXISTS
              clayyo_bank_details_update_tracker
            (
              id BIGINT NOT NULL AUTO_INCREMENT,
              lan VARCHAR(200) NOT NULL,
              updated_at DATETIME NOT NULL
                DEFAULT CURRENT_TIMESTAMP,

              PRIMARY KEY (id),
              UNIQUE KEY uk_clayyo_bank_tracker_lan
                (lan)
            )
            ENGINE = InnoDB
            DEFAULT CHARSET = utf8mb4
            COLLATE = utf8mb4_unicode_ci
            `,
          )
          .catch((error) => {
            /*
             * Reset so a later request can retry if
             * the first table creation attempt fails.
             */
            clayyoBankTrackerReadyPromise =
              null;

            throw error;
          });
    }

    await clayyoBankTrackerReadyPromise;
  };

/*
 * Check which update-tracking columns exist in the
 * current database. This allows the same code to run
 * against both UAT and production schemas.
 */
const getClayyoBankTrackingColumns =
  async () => {
    const [rows] =
      await db.promise().query(
        `
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME =
            'loan_booking_clayyo'
          AND COLUMN_NAME IN (
            'bank_details_updated_once',
            'bank_details_updated_at'
          )
        `,
      );

    const columns = new Set(
      rows.map(
        (row) =>
          row.COLUMN_NAME ||
          row.column_name,
      ),
    );

    return {
      hasUpdatedOnceColumn:
        columns.has(
          "bank_details_updated_once",
        ),

      hasUpdatedAtColumn:
        columns.has(
          "bank_details_updated_at",
        ),
    };
  };

const normalizeText = (value) => String(value || "").trim();
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const getClayyoLoanByLan = async (lan) => {
  const [[loan]] = await db.promise().query(
    `
    SELECT
      lan,
      email_id,
      bank_details_updated_once,
      applicant_email_updated_once,
      applicant_email_updated_at
    FROM loan_booking_clayyo
    WHERE lan = ?
    LIMIT 1
    `,
    [lan],
  );

  return loan || null;
};

const generateLoanIdentifiers = async (lender) => {
  console.log("✅ Clayyo routes loaded");
  lender = String(lender || "").trim();

  let application_id;
  let prefixLan;

  if (lender === "CLAYYO") {
    prefixLan = "CLYO10";
    application_id = "CLY0001";
  } else if (lender === "CLAYYO-HOSPITAL") {
    prefixLan = "CLYHOS10";
    application_id = "CLYHOS0001";
  } else {
    throw new Error(`Invalid lender type: ${lender}`);
  }

  console.log("prefixLan:", prefixLan);

  const [rows] = await db
    .promise()
    .query(
      "SELECT last_sequence FROM loan_sequences WHERE lender_name = ? FOR UPDATE",
      [lender],
    );

  let newSequence;

  if (rows.length > 0) {
    newSequence = rows[0].last_sequence + 1;
    await db
      .promise()
      .query(
        "UPDATE loan_sequences SET last_sequence = ? WHERE lender_name = ?",
        [newSequence, lender],
      );
  } else {
    newSequence = 11000;
    await db
      .promise()
      .query(
        "INSERT INTO loan_sequences (lender_name, last_sequence) VALUES (?, ?)",
        [lender, newSequence],
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

    const requiredFields = [
      "hospital_legal_name",
      "registered_address",
      "registered_city",
      "registered_district",
      "registered_state",
      "registered_pincode",
      "hospital_phone",
      "owner_name",
      "owner_phone",
      "ifsc_code",
      "bank_name",
      "branch_name",
      "account_holder_name",
      "account_number",
    ];

    const missing = requiredFields.filter(
      (field) => !data[field] || String(data[field]).trim() === "",
    );

    if (missing.length) {
      return res.status(400).json({
        message: `Missing fields: ${missing.join(", ")}`,
      });
    }

    const { lan, application_id } =
      await generateLoanIdentifiers("CLAYYO-HOSPITAL");

    const fields = {
      application_id,
      lan,

      hospital_legal_name: data.hospital_legal_name,
      brand_name: data.brand_name || null,
      branch_locations: data.branch_locations || null,

      hospital_registration_number: data.hospital_registration_number || null,

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

      avg_monthly_patient_footfall: data.avg_monthly_patient_footfall || null,
      avg_ticket_size: data.avg_ticket_size || null,

      hospital_email: data.hospital_email || null,
      hospital_phone: data.hospital_phone,

      owner_name: data.owner_name,
      owner_email: data.owner_email || null,
      owner_phone: data.owner_phone,
      ifsc_code: data.ifsc_code,
      bank_name: data.bank_name,
      branch_name: data.branch_name,
      account_holder_name: data.account_holder_name,
      account_number: data.account_number,

      status: "ACTIVE",
      created_at: new Date(),
    };

    const columns = Object.keys(fields).join(", ");
    const placeholders = Object.keys(fields)
      .map(() => "?")
      .join(", ");
    const values = Object.values(fields);

    await db
      .promise()
      .query(
        `INSERT INTO clayyo_hospital_booking (${columns}) VALUES (${placeholders})`,
        values,
      );

    res.json({
      message: "Hospital created successfully",
      lan,
      application_id,
    });
  } catch (err) {
    console.error("Hospital creation error:", err);

    res.status(500).json({
      message: "Hospital creation failed",
      error: err.sqlMessage || err.message,
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
      name: `${h.hospital_legal_name} (${h.registered_city}, ${h.registered_district})`,
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
        ifsc_code,
        bank_name,
        branch_name,
        account_holder_name,
        account_number,
        status,
        created_at
      FROM clayyo_hospital_booking
      WHERE lan = ?
      ORDER BY created_at DESC
      `,
      [lan],
    );

    res.json(rows[0] || null);
  } catch (err) {
    console.error("Hospital fetch error:", err);

    res.status(500).json({
      message: "Failed to fetch hospital details",
      error: err.message,
    });
  }
});

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
      WHERE status = 'ACTIVE'
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
      [status, lan],
    );

    res.json({ message: "Status updated successfully" });
  } catch (err) {
    console.error("Status update error:", err);
    res.status(500).json({ message: "Failed to update status" });
  }
});

const OTP_EXPIRY_SECONDS = 300;

router.post("/send-otp", async (req, res) => {
  try {
    console.log("Incoming body:", req.body);

    const { mobile } = req.body;

    if (!mobile)
      return res.status(400).json({
        message: "Mobile required",
      });

    const cleanedMobile = mobile.replace(/\D/g, "");

    const [existing] = await db.promise().query(
      `SELECT * FROM otp_sessions_clayyo
       WHERE mobile_number = ?
       ORDER BY id DESC
       LIMIT 1`,
      [cleanedMobile],
    );

    if (existing.length) {
      const lastSent = new Date(existing[0].last_sent_at);
      const diffSeconds = (Date.now() - lastSent.getTime()) / 1000;

      if (diffSeconds < 60) {
        return res.status(429).json({
          message: `Wait ${Math.ceil(60 - diffSeconds)} seconds before retry`,
        });
      }
    }

    const otp = Math.floor(100000 + Math.random() * 900000);
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_SECONDS * 1000);

    const smsParams = {
      user: process.env.ALOT_USER,
      password: process.env.ALOT_PASSWORD,
      senderid: process.env.SENDER_ID,
      channel: "TRANS",
      DCS: "0",
      flashsms: "0",
      number: cleanedMobile,
      text: `OTP for mobile number verification is ${otp}. Do not share this OTP with anyone. Thanks & Regards Fintree Finance Private Limited:`,
      route: "5",
      DLTTemplateId: process.env.MOBILE_OTP_TEMPLATE_ID.trim(),
      PEID: process.env.DLT_PEID,
    };

    console.log("Sending SMS with:", smsParams);

    await axios.get(process.env.ALOT_API_URL, { params: smsParams });

    await db.promise().query(
      `INSERT INTO otp_sessions_clayyo
       (mobile_number, otp, expires_at, last_sent_at, verified)
       VALUES (?, ?, ?, NOW(), 0)`,
      [cleanedMobile, otp, expiresAt],
    );

    return res.json({
      success: true,
      message: "OTP sent successfully",
      otp,
    });
  } catch (err) {
    console.error("SMS error:", err.message);

    res.status(500).json({
      message: "OTP send failed",
    });
  }
});

router.post("/verify-otp", async (req, res) => {
  try {
    const { mobile, otp, consentText } = req.body;

    if (!mobile || !otp || !consentText)
      return res.status(400).json({
        message: "Mobile, OTP and consentText required",
      });

    const cleanedMobile = mobile.replace(/\D/g, "");

    const [rows] = await db.promise().query(
      `SELECT * FROM otp_sessions_clayyo
       WHERE mobile_number=? AND otp=?
       ORDER BY id DESC
       LIMIT 1`,
      [cleanedMobile, otp],
    );

    if (!rows.length)
      return res.status(400).json({
        message: "OTP session not found",
      });

    const record = rows[0];

    if (new Date() > record.expires_at)
      return res.status(400).json({
        message: "OTP expired",
      });

    if (String(record.otp) !== String(otp))
      return res.status(400).json({
        message: "Invalid OTP",
      });

    const [result] = await db.promise().query(
      `UPDATE otp_sessions_clayyo
       SET verified=1,
           consent_given=1,
           consent_text=?,
           consent_at=NOW()
       WHERE id=?`,
      [consentText.trim(), record.id],
    );

    console.log("Rows updated:", result.affectedRows);
    res.json({
      success: true,
      message: "Mobile verified + consent saved",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "OTP verification failed",
    });
  }
});

router.post("/manual-entry", async (req, res) => {
  let conn;
  try {
    const data = req.body;

    console.log("Payload:", req.body);

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
      "net_monthly_income",
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
        message: `Missing fields: ${missing.join(", ")}`,
      });
    }

    const loanAmount = Number(data.loan_amount || 0);

    conn = await db.promise().getConnection();
    await conn.beginTransaction();

    const validation = await partnerBookingWrapper.validateBookingOrThrow(
      conn,
      "CLAYOO",
      loanAmount,
    );

    const { lan, application_id } = await generateLoanIdentifiers("CLAYYO");

    const customer_name = `${data.first_name} ${data.last_name}`.trim();

    let hospitalName = data.hospital_name || null;
    if (!hospitalName && data.hospital_id) {
      const [hospitalRows] = await conn.query(
        `SELECT hospital_legal_name
         FROM clayyo_hospital_booking
         WHERE id = ?
         LIMIT 1`,
        [data.hospital_id],
      );
      hospitalName = hospitalRows?.[0]?.hospital_legal_name || null;
    }

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
      status: LOAN_STATUS.LOGIN,
      stage: "LOGIN",

      employment_type: data.employment_type,
      net_monthly_income: data.net_monthly_income,

      insurance_company_name: data.insurance_company_name || null,
      insurance_policy_holder_name: data.insurance_policy_holder_name || null,
      insurance_policy_number: data.insurance_policy_number || null,
      relation_with_policy_holder: data.relation_with_policy_holder || null,

      bank_name: data.bank_name || null,
      name_in_bank: data.name_in_bank || null,
      account_number: data.account_number || null,
      ifsc: data.ifsc || null,
      hospital_id: data.hospital_id,
      hospital_name: hospitalName,
      policy_type: data.policy_type || null,
      agreement_date: data.login_date || null,
    };

    const columns = Object.keys(fields).join(", ");
    const placeholders = Object.keys(fields)
      .map(() => "?")
      .join(", ");
    const values = Object.values(fields);

    await conn.query(
      `INSERT INTO loan_booking_clayyo (${columns}) VALUES (${placeholders})`,
      values,
    );

    await conn.query("INSERT INTO kyc_verification_status (lan) VALUES (?)", [
      lan,
    ]);

    // await partnerBookingWrapper.finalizeBooking(
    //   conn,
    //   validation.partnerId,
    //   validation.limitId,
    //   lan,
    //   loanAmount,
    //   validation.requiredFldg,
    //   `CLAYOO booking reservation`,
    // );

    await conn.commit();
    conn.release();

    res.json({
      message: "Clayyo loan created successfully",
      lan,
      application_id,
    });

    clayooRunAllValidations(lan);
  } catch (err) {
    if (conn) {
      await conn.rollback();
      conn.release();
    }

    if (err.message === "LIMIT_EXCEEDED") {
      return res.status(403).json({
        message: `Limit exceeded for ${err.meta.partnerName}`,
        remaining_limit: err.meta.remaining,
        required: err.meta.required,
      });
    }

    if (err.message === "FLDG_INSUFFICIENT") {
      return res.status(403).json({
        message: `Insufficient FLDG balance for ${err.meta.partnerName}`,
        available_fldg: err.meta.available,
        required_fldg: err.meta.required,
      });
    }

    console.error("Clayyo manual entry error:", err);

    res.status(500).json({
      message: "Loan creation failed",
      error: err.sqlMessage || err.message,
    });
  }
});

// router.get("/login-loans", async (req, res) => {
//   try {
//     const [rows] = await db.promise().query(`
//       SELECT
//         lb.*,
//         COALESCE(ch.hospital_legal_name, lb.hospital_name) AS hospital_name
//       FROM loan_booking_clayyo lb
//       LEFT JOIN clayyo_hospital_booking ch
//         ON ch.id = lb.hospital_id
//       WHERE lb.status = 'Auto Bre Approved'
//       ORDER BY lb.created_at DESC, lb.lan DESC
//     `);
//     res.json(rows);
//   } catch (err) {
//     console.error("Error fetching login loans:", err);
//     res.status(500).json({ message: "Failed to fetch login loans" });
//   }
// });

router.get("/approve-initiate-loans", async (req, res) => {
  const { table = "loan_booking_clayyo", prefix = "CLY" } = req.query;

  const allowedTables = {
    loan_booking_clayyo: true,
  };
  if (!allowedTables[table]) {
    return res.status(400).json({ message: "Invalid table name" });
  }

  const query = `
    SELECT
      lb.*,
      COALESCE(ch.hospital_legal_name, lb.hospital_name) AS hospital_name
    FROM ?? lb
    LEFT JOIN clayyo_hospital_booking ch
      ON ch.id = lb.hospital_id
    WHERE lb.status IN (?, ?) AND lb.lan LIKE ?
    ORDER BY lb.created_at DESC, lb.lan DESC
  `;
  const values = [
    table,
    LOAN_STATUS.BRE_APPROVED,
    "Credit Recheck",
    `${prefix}%`,
  ];

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
    loan_booking_clayyo: true,
  };
  if (!allowedTables[table]) {
    return res.status(400).json({ message: "Invalid table name" });
  }

  const query = `
    SELECT
      lb.*,
      COALESCE(ch.hospital_legal_name, lb.hospital_name) AS hospital_name
    FROM ?? lb
    LEFT JOIN clayyo_hospital_booking ch
      ON ch.id = lb.hospital_id
    WHERE lb.status IN (?, ?, ?)
      AND lb.lan LIKE ?
    ORDER BY lb.login_date DESC, lb.lan DESC
  `;
  const values = [
    table,
    LOAN_STATUS.LIMIT_REQUESTED,
    LOAN_STATUS.CREDIT_APPROVED,
    LOAN_STATUS.OPS_APPROVED,
    `${prefix}%`,
  ];

  db.query(query, values, (err, results) => {
    if (err) {
      console.error("Error fetching credit-approved loans:", err);
      return res.status(500).json({ message: "Database error" });
    }
    res.json(results);
  });
});

// Clayyo Limit Route
// router.put("/set-limit/:lan", async (req, res) => {
//   try {
//     const { lan } = req.params;
//     const { limit, table, limit_assigned_by } = req.body;

//     const safeTable = table || "loan_booking_clayyo";

//     if (safeTable !== "loan_booking_clayyo") {
//       return res.status(400).json({ message: "Invalid table name" });
//     }

//     // 🔹 Fetch requested loan amount
//     const [[loan]] = await db.promise().query(
//       `SELECT loan_amount FROM ${safeTable} WHERE lan = ?`,
//       [lan]
//     );

//     if (!loan) {
//       return res.status(404).json({ message: "Loan not found" });
//     }

//     const requestedAmount = Number(loan.loan_amount || 0);
//     const assignedLimit = Number(limit || 0);

//     let newStatus;
//     let newStage;
//     let limitReworkRequired = 0;
//     let limitReworkReason = null;

//     // // 🔹 Condition logic
//     // if (requestedAmount < assignedLimit) {
//     //   newStatus = "Credit Recheck";
//     //   newStage = "CREDIT_REWORK";

//     //   limitReworkRequired = 1;
//     //   limitReworkReason =
//     //     `Requested amount ${requestedAmount} exceeds assigned limit ${assignedLimit}`;
//     // } else {
//     //   newStatus = LOAN_STATUS.LIMIT_REQUESTED;
//     //   newStage = "OPS_INITIATED";
//     // }

//      // 🔹 Condition logic
//     if (requestedAmount < assignedLimit) {
//       // When requestedAmount is less than assignedLimit, go directly to OPS APPROVED
//       newStatus = "OPS APPROVED";
//       newStage = "OPS_APPROVED";
//     } else {
//       // When requestedAmount >= assignedLimit, follow existing flow
//       newStatus = "Credit Recheck";
//       newStage = "CREDIT_REWORK";

//       limitReworkRequired = 1;
//       limitReworkReason =
//         `Requested amount ${requestedAmount} exceeds assigned limit ${assignedLimit}`;
//     }

//     const [result] = await db.promise().query(
//       `UPDATE ${safeTable}
//        SET final_limit = ?,
//            status = ?,
//            stage = ?,
//            limit_assigned_at = NOW(),
//            limit_assigned_by = COALESCE(?, limit_assigned_by),
//            limit_rework_required = ?,
//            limit_rework_reason = ?
//        WHERE lan = ?`,
//       [
//         assignedLimit,
//         newStatus,
//         newStage,
//         limit_assigned_by || null,
//         limitReworkRequired,
//         limitReworkReason,
//         lan,
//       ]
//     );

//     if (!result.affectedRows) {
//       return res.status(404).json({ message: "Loan not found" });
//     }

//     res.json({
//       message: "Limit assigned successfully",
//       lan,
//       requested_amount: requestedAmount,
//       final_limit: assignedLimit,
//       status: newStatus,
//       stage: newStage,
//       moved_to:
//         newStage === "CREDIT_REWORK" ? "Credit Screen" : "Ops Screen",
//     });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ message: "Failed to assign limit" });
//   }
// });

router.put("/set-limit/:lan", async (req, res) => {
  try {
    const { lan } = req.params;
    const { inputLimit, table, limit_assigned_by } = req.body;

    const safeTable = table || "loan_booking_clayyo";

    if (safeTable !== "loan_booking_clayyo") {
      return res.status(400).json({ message: "Invalid table name" });
    }

    const [[loan]] = await db
      .promise()
      .query(`SELECT loan_amount FROM ${safeTable} WHERE lan = ?`, [lan]);

    if (!loan) {
      return res.status(404).json({ message: "Loan not found" });
    }

    const requestedAmount = Number(loan.loan_amount || 0);
    const assignedLimit = Number(inputLimit || 0);

    console.log(`Requested Amount (loan_amount): ${requestedAmount}`);
    console.log(`Assigned Limit:                 ${assignedLimit}`);

    let newStatus;
    let newStage;
    let limitReworkRequired = 0;
    let limitReworkReason = null;

    // ✅ loan_amount > assignedLimit  →  OPS APPROVED
    // ✅ loan_amount <= assignedLimit →  Credit Recheck
    if (requestedAmount > assignedLimit) {
      console.log(
        "✅ Requested amount is greater than assigned limit → OPS APPROVED",
      );
      newStatus = "OPS APPROVED";
      newStage = "OPS_APPROVED";
    } else {
      console.log(
        "🔁 Assigned limit exceeds requested amount → Credit Recheck",
      );
      newStatus = "Credit Recheck"; // matches your frontend pill + query string exactly
      newStage = "CREDIT_REWORK";
      limitReworkRequired = 1;
      limitReworkReason = `Assigned limit ₹${assignedLimit} exceeds requested amount ₹${requestedAmount}`;
    }

    const [result] = await db.promise().query(
      `UPDATE ${safeTable}
       SET final_limit          = ?,
           status               = ?,
           stage                = ?,
           limit_assigned_at    = NOW(),
           limit_assigned_by    = COALESCE(?, limit_assigned_by),
           limit_rework_required = ?,
           limit_rework_reason  = ?
       WHERE lan = ?`,
      [
        assignedLimit,
        newStatus,
        newStage,
        limit_assigned_by || null,
        limitReworkRequired,
        limitReworkReason,
        lan,
      ],
    );

    if (!result.affectedRows) {
      return res.status(404).json({ message: "Loan not found" });
    }

    return res.json({
      message: "Limit assigned successfully",
      lan,
      requested_amount: requestedAmount,
      final_limit: assignedLimit,
      status: newStatus,
      stage: newStage,
      moved_to: newStage === "CREDIT_REWORK" ? "Credit Screen" : "Ops Screen",
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Failed to assign limit" });
  }
});

// initiate disbursement + send email
router.post("/initiate-disbursement/:lan", async (req, res) => {
  try {
    const { lan } = req.params;

    const [[loan]] = await db.promise().query(
      `
      SELECT customer_name, approved_limit , hospital_name , subvention_percent , updated_subvention ,final_limit
      FROM loan_booking_clayyo
      WHERE lan = ?
      `,
      [lan],
    );

    if (!loan) {
      return res.status(404).json({
        message: "Loan not found",
      });
    }

    await db.promise().query(
      `
      UPDATE loan_booking_clayyo
      SET status = ?,
          stage = 'DISBURSEMENT_INITIATED'
      WHERE lan = ?
      `,
      [LOAN_STATUS.DISBURSEMENT_INITIATED, lan],
    );

    // EMAIL SEND

    const transporter = nodemailer.createTransport({
      host: "smtp.office365.com",
      port: 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    await transporter.sendMail({
      from: process.env.SMTP_USER,
      to: process.env.OPS_DISBURSEMENT_MAIL.split(","),
      subject: `Disbursement Initiation Request ${lan}`,
      html: `
        <table style="width:100%; background:#f1f5f9; padding:30px; font-family:Arial, sans-serif;">
  <tr>
    <td align="center">
      <table style="max-width:620px; width:100%; background:#ffffff; border-radius:14px; padding:30px; box-shadow:0 6px 18px rgba(0,0,0,0.06);">


    <!-- HEADER -->
    <tr>
      <td style="border-bottom:3px solid #0ea5e9; padding-bottom:14px;">
        <h2 style="margin:0; color:#0f172a;">
          Disbursement Initiation Request
        </h2>

        <p style="margin:6px 0 0; font-size:14px; color:#64748b;">
          Action Required by OPS / Disbursement Team
        </p>
      </td>
    </tr>

    <!-- BODY -->
    <tr>
      <td style="padding-top:22px; font-size:15px; color:#1e293b;">

        <p style="margin:0 0 14px;">
          Dear Team,
        </p>

        <p style="margin:0 0 20px;">
          Please initiate the disbursement process for the following approved
          <strong>CLAYYO</strong> loan case:
        </p>

        <!-- DETAILS TABLE -->
        <table style="width:100%; border-collapse:collapse; font-size:14px;">

          <tr>
            <td style="padding:10px; font-weight:bold; color:#475569;">
              Customer Name
            </td>
            <td style="padding:10px;">
              ${loan.customer_name}
            </td>
          </tr>

          <tr style="background:#f8fafc;">
            <td style="padding:10px; font-weight:bold; color:#475569;">
              Hospital Name
            </td>
            <td style="padding:10px;">
              ${loan.hospital_name}
            </td>
          </tr>

          <tr>
            <td style="padding:10px; font-weight:bold; color:#475569;">
              Loan Account Number (LAN)
            </td>
            <td style="padding:10px;">
              ${lan}
            </td>
          </tr>

          <tr style="background:#f8fafc;">
            <td style="padding:10px; font-weight:bold; color:#475569;">
              Approved Limit
            </td>
            <td style="padding:10px; font-weight:800; color:#0284c7;">
              ₹${loan.final_limit || loan.approved_limit || 0}
            </td>
          </tr>

          <tr>
            <td style="padding:10px; font-weight:bold; color:#475569;">
              Subvention Percentage
            </td>
            <td style="padding:10px;">
              ${loan.updated_subvention || loan.subvention_percent || 0}% (Please confirm the final subvention percentage before disbursement)
            </td>
          </tr>

          <tr style="background:#f8fafc;">
            <td style="padding:10px; font-weight:bold; color:#475569;">
              Product
            </td>
            <td style="padding:10px;">
              CLAYYO
            </td>
          </tr>

        </table>

        <p style="margin-top:22px;">
          Kindly proceed with the required disbursement steps at the earliest.
        </p>

        <p style="margin-top:20px;">
          Regards,<br/>
          <strong>Fintree LMS</strong>
        </p>

      </td>
    </tr>

    <!-- FOOTER -->
    <tr>
      <td style="border-top:1px solid #e2e8f0; padding-top:14px; font-size:12px; color:#94a3b8;">
        This is an automated system-generated notification from Fintree LMS.
        Please do not reply to this email.
      </td>
    </tr>

  </table>
</td>


  </tr>
</table>

      `,
    });
    console.log(transporter);

    res.json({
      message: "Disbursement initiated and mail sent",
      lan,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      message: "Failed to initiate disbursement",
    });
  }
});

// final disbursement
router.patch("/disburse/:lan", async (req, res) => {
  try {
    const { lan } = req.params;

    const [[loan]] = await db.promise().query(
      `
      SELECT status
      FROM loan_booking_clayyo
      WHERE lan = ?
      `,
      [lan],
    );

    if (!loan) {
      return res.status(404).json({
        message: "Loan not found",
      });
    }

    if (loan.status !== LOAN_STATUS.DISBURSEMENT_INITIATED) {
      return res.status(400).json({
        message: "Disbursement not initiated yet",
      });
    }

    await db.promise().query(
      `
      UPDATE loan_booking_clayyo
      SET status = ?,
          stage = 'DISBURSED',
          disbursed_at = NOW()
      WHERE lan = ?
      `,
      [LOAN_STATUS.DISBURSED, lan],
    );

    res.json({
      message: "Loan disbursed successfully",
      lan,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      message: "Disbursement failed",
    });
  }
});

router.put("/update-subvention/:lan", async (req, res) => {
  const { lan } = req.params;
  const { updated_subvention } = req.body;

  try {
    if (!updated_subvention) {
      return res.status(400).json({ message: "Updated subvention required" });
    }

    await db.promise().query(
      `
      UPDATE loan_booking_clayyo
      SET updated_subvention = ?
      WHERE lan = ?
      `,
      [updated_subvention, lan],
    );

    res.json({
      success: true,
      message: "Updated subvention saved successfully",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: "Failed to update subvention",
    });
  }
});

router.put("/ops-approve/:lan", async (req, res) => {
  try {
    const { lan } = req.params;
    const { approved_limit, pf_percent, status, table, ops_approved_by } =
      req.body;

    const safeTable = table || "loan_booking_clayyo";
    if (safeTable !== "loan_booking_clayyo") {
      return res.status(400).json({ message: "Invalid table name" });
    }

    const finalStatus = status || LOAN_STATUS.OPS_APPROVED;

    const [result] = await db.promise().query(
      `UPDATE ${safeTable}
       SET approved_limit = ?,
           pf_percent = ?,
           status = ?,
           stage = 'OPS_APPROVED',
           ops_approved_at = NOW(),
           ops_approved_by = COALESCE(?, ops_approved_by)
       WHERE lan = ?`,
      [approved_limit, "0.00", finalStatus, ops_approved_by || null, lan],
    );

    if (!result.affectedRows) {
      return res.status(404).json({ message: "Loan not found" });
    }

    res.json({ message: "Ops approved successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Ops approval failed" });
  }
});

// Credit Screen Status Change Approve Reject
// router.put("/approve-initiated-loans/:lan", (req, res) => {
//   const lan = req.params.lan;
//   const { status, table } = req.body;

//   const allowedTables = {
//     loan_booking_clayyo: true,
//   };

//   if (!allowedTables[table]) {
//     return res.status(400).json({ message: "Invalid table name" });
//   }

//   if (
//     ![LOAN_STATUS.CREDIT_APPROVED, LOAN_STATUS.CREDIT_REJECTED].includes(status)
//   ) {
//     return res.status(400).json({ message: "Invalid status value" });
//   }

//   // const updateQuery = `UPDATE ?? SET status = ? WHERE lan = ?`;
//   const newStage =
//     status === LOAN_STATUS.CREDIT_APPROVED
//       ? "LIMIT_APPROVAL_PENDING"
//       : "CREDIT_REJECTED";

//   const updateQuery = `
// UPDATE ??
// SET status = ?, stage = ?
// WHERE lan = ?
// `;

//   db.query(updateQuery, [table, status, newStage, lan], async (err, result) => {
//     if (err) {
//       console.error("Error updating loan status:", err);
//       return res.status(500).json({ message: "Database error" });
//     }

//     if (result.affectedRows === 0) {
//       return res
//         .status(404)
//         .json({ message: "Loan not found with LAN " + lan });
//     }
//     return res.json({
//       success: true,
//       lan,
//       table,
//       status,
//       message: `Loan ${status} successfully`,
//     });
//   });
// });

router.put("/approve-initiated-loans/:lan", async (req, res) => {
  const lan = req.params.lan;
  const { status, table } = req.body;

  const allowedTables = {
    loan_booking_clayyo: true,
  };

  if (!allowedTables[table]) {
    return res.status(400).json({
      message: "Invalid table name",
    });
  }

  if (
    ![LOAN_STATUS.CREDIT_APPROVED, LOAN_STATUS.CREDIT_REJECTED].includes(status)
  ) {
    return res.status(400).json({
      message: "Invalid status value",
    });
  }

  const conn = await db.promise().getConnection();

  try {
    await conn.beginTransaction();

    // Lock loan row
    const [[loan]] = await conn.query(
      `
      SELECT
        lan,
        status,
        loan_amount
      FROM ??
      WHERE lan = ?
      FOR UPDATE
      `,
      [table, lan],
    );

    if (!loan) {
      await conn.rollback();

      return res.status(404).json({
        message: `Loan not found with LAN ${lan}`,
      });
    }

    // Prevent duplicate processing
    if (
      [LOAN_STATUS.CREDIT_APPROVED, LOAN_STATUS.CREDIT_REJECTED].includes(
        loan.status,
      )
    ) {
      await conn.rollback();

      return res.status(400).json({
        message: "Loan already processed",
      });
    }

    const loanAmount = Number(loan.loan_amount || 0);

    // Validate partner booking only for approval
    let validation = null;

    if (status === LOAN_STATUS.CREDIT_APPROVED) {
      validation = await partnerBookingWrapper.validateBookingOrThrow(
        conn,
        "CLAYOO",
        loanAmount,
      );
    }

    let newStatus = status;
    let newStage;

    // Recheck flow
    if (
      loan.status === "Credit Recheck" &&
      status === LOAN_STATUS.CREDIT_APPROVED
    ) {
      newStatus = "OPS APPROVED";
      newStage = "OPS_APPROVED";
    } else if (status === LOAN_STATUS.CREDIT_APPROVED) {
      newStage = "LIMIT_APPROVAL_PENDING";
    } else {
      newStage = "CREDIT_REJECTED";
    }

    // Update loan status
    await conn.query(
      `
      UPDATE ??
      SET
        status = ?,
        stage = ?
      WHERE lan = ?
      `,
      [table, newStatus, newStage, lan],
    );

    // Finalize booking only for approval
    if (status === LOAN_STATUS.CREDIT_APPROVED) {
      await partnerBookingWrapper.finalizeBooking(
        conn,
        validation.partnerId,
        validation.limitId,
        lan,
        loanAmount,
        validation.requiredFldg,
        `CLAYOO booking reservation`,
      );
    }

    await conn.commit();

    return res.json({
      success: true,
      lan,
      table,
      status: newStatus,
      stage: newStage,
      message: `Loan moved to ${newStatus}`,
    });
  } catch (err) {
    await conn.rollback();

    console.error("Error updating loan status:", err);

    if (err.message === "LIMIT_EXCEEDED") {
      return res.status(403).json({
        message: `Limit exceeded for ${err.meta.partnerName}`,
        remaining_limit: err.meta.remaining,
        required: err.meta.required,
      });
    }

    if (err.message === "FLDG_INSUFFICIENT") {
      return res.status(403).json({
        message: `Insufficient FLDG balance for ${err.meta.partnerName}`,
        available_fldg: err.meta.available,
        required_fldg: err.meta.required,
      });
    }

    return res.status(500).json({
      message: "Database error",
      error: err.sqlMessage || err.message,
    });
  } finally {
    conn.release();
  }
});

router.get("/approved-loans", async (req, res) => {
  try {
    const [rows] = await db.promise().query(
      `
      SELECT
        lb.lan,
        lb.customer_name,
        lb.app_id,
        lb.mobile_number,

        lb.loan_amount,
        lb.final_limit,
        lb.approved_limit,
        lb.pf_percent,
        lb.subvention_percent,

        lb.agreement_esign_status,
        lb.bank_status,

        lb.bank_name,
        lb.account_number,
        lb.ifsc,

        lb.status,
        lb.emi_amount,
        lb.loan_tenure,
        lb.login_date,
        lb.disbursed_at,

        COALESCE(ch.hospital_legal_name, lb.hospital_name) AS hospital_name

      FROM loan_booking_clayyo lb
      LEFT JOIN clayyo_hospital_booking ch
        ON ch.id = lb.hospital_id
      WHERE lb.status IN (?, ?, ?)
      ORDER BY lb.login_date DESC, lb.lan DESC
    `,
      [
        LOAN_STATUS.LIMIT_REQUESTED,
        LOAN_STATUS.CREDIT_APPROVED,
        LOAN_STATUS.OPS_APPROVED,
      ],
    );

    return res.json(rows);
  } catch (err) {
    console.error("❌ Error fetching approved loans:", err);

    return res.status(500).json({
      message: "Failed to fetch approved loans",
      error: err.sqlMessage || err.message,
    });
  }
});

router.get("/all-loans", async (req, res) => {
  try {
    const page = Number(req.query.page || 1);
    const pageSize = Number(req.query.pageSize || 1500);
    const offset = (page - 1) * pageSize;
    const search = String(req.query.search || "").trim();
    const prefix = String(req.query.prefix || "").trim();

    const conditions = [];
    const params = [];

    if (prefix) {
      conditions.push("lb.lan LIKE ?");
      params.push(`${prefix}%`);
    }

    if (search) {
      const value = `%${search}%`;

      conditions.push(`
    (
      lb.lan LIKE ?
      OR lb.app_id LIKE ?
      OR lb.customer_name LIKE ?
      OR lb.mobile_number LIKE ?
      OR lb.status LIKE ?
    )
  `);

      params.push(value, value, value, value, value);
    }

    const whereClause = conditions.length
      ? `WHERE ${conditions.join(" AND ")}`
      : "";
    const [[{ total }]] = await db.promise().query(
      `
  SELECT COUNT(*) AS total
  FROM loan_booking_clayyo lb
  ${whereClause}
  `,
      params,
    );

    const [rows] = await db.promise().query(
      `
      SELECT
        lb.id,
        lb.lan,
        lb.app_id,
        lb.login_date,
        lb.customer_name,
        lb.mobile_number,
        lb.loan_amount,
        lb.final_limit,
        lb.approved_limit,
        lb.status,
        lb.hospital_id,
        lb.disbursed_at,
        lb.stage,
        lb.limit_rework_required,
        lb.limit_rework_reason,
        lb.clayyo_bre_status,
        lb.clayyo_bre_reason,
        lb.clayyo_bre_checked_at,
      
        kyc.aadhaar_status,
        COALESCE(kyc.aadhaar_retry_count, 0) AS aadhaar_retry_count,
        COALESCE(ch.hospital_legal_name, lb.hospital_name) AS hospital_name
      FROM loan_booking_clayyo lb
      LEFT JOIN clayyo_hospital_booking ch
        ON ch.id = lb.hospital_id
      LEFT JOIN kyc_verification_status kyc
        ON kyc.lan = lb.lan
        ${whereClause}
      ORDER BY lb.login_date DESC, lb.lan DESC
      LIMIT ? OFFSET ?
      `,
      [...params, pageSize, offset],
    );

    res.json({
      pagination: {
        page,
        pageSize,
        total,
      },
      rows,
    });
  } catch (err) {
    console.error("Error fetching all loans:", err);
    res.status(500).json({ message: "Database error" });
  }
});

// router.get("/loan-info/:lan", async (req, res) => {
//   const { lan } = req.params;

//   try {
//     const [rows] = await db.promise().query(
//       `
//       SELECT
//         lb.lan,
//         lb.app_id,
//         lb.login_date,
//         lb.customer_name,
//         lb.gender,
//         lb.dob,
//         lb.mobile_number,
//         lb.email_id,
//         lb.pan_number,
//         lb.patient_name,

//         lb.current_address,
//         lb.current_village_city,
//         lb.current_district,
//         lb.current_state,
//         lb.current_pincode,

//         lb.permanent_address,
//         lb.permanent_village_city,
//         lb.permanent_district,
//         lb.permanent_state,
//         lb.permanent_pincode,

//         lb.employment_type,
//         lb.policy_type,
//         lb.net_monthly_income,

//         lb.loan_amount,
//         lb.interest_rate,
//         lb.loan_tenure,
//         lb.emi_amount,
//         lb.cibil_score,
//         lb.status,
//         lb.disbursed_at,

//         lb.bank_name,
//         lb.name_in_bank,
//         lb.account_number,
//         lb.ifsc,
//         lb.bank_branch,
//         lb.bank_status,
//         lb.enach_umrn,

//         lb.insurance_company_name,
//         lb.insurance_policy_holder_name,
//         lb.insurance_policy_number,
//         lb.relation_with_policy_holder,

//         lb.final_limit,
//         lb.approved_limit,
//         lb.pf_percent,
//         lb.subvention_percent,
//         lb.updated_subvention,
//         lb.limit_assigned_at,
//         lb.limit_assigned_by,
//         lb.stage,
//         lb.limit_rework_required,
//         lb.limit_rework_reason,
//         lb.ops_approved_at,
//         lb.ops_approved_by,

//         COALESCE(ch.hospital_legal_name, lb.hospital_name) AS hospital_legal_name,
//         lb.hospital_id,

//         lb.clayyo_bre_status,
//         lb.clayyo_bre_reason,
//         lb.clayyo_bre_checked_at,

//         lb.clayyo_bureau_score,
//         lb.clayyo_enquiries_30d,

//         lb.clayyo_dpd_3m_flag,
//         lb.clayyo_dpd_12m_count,
//         lb.clayyo_dpd_24m_60_flag,
//         lb.clayyo_dpd_36m_90_flag,

//         lb.clayyo_overdue_flag,
//         lb.clayyo_writtenoff_flag,
//         lb.clayyo_moratorium_flag,
//         lb.clayyo_restructured_flag,
//         lb.agreement_esign_status,
//         lb.bank_status,

//         k.pan_status      AS kyc_pan_status,
//         k.aadhaar_status  AS kyc_aadhaar_status,
//         k.bureau_status   AS kyc_bureau_status

//       FROM loan_booking_clayyo lb
//       LEFT JOIN kyc_verification_status k
//         ON k.lan = lb.lan
//       LEFT JOIN clayyo_hospital_booking ch
//         ON ch.id = lb.hospital_id
//       WHERE lb.lan = ?
//       `,
//       [lan],
//     );

//     if (!rows.length) {
//       return res.status(404).json({ message: "Loan not found" });
//     }

//     const row = rows[0];

//     const loan = {
//       lan: row.lan,
//       app_id: row.app_id,
//       login_date: row.login_date,
//       customer_name: row.customer_name,
//       gender: row.gender,
//       dob: row.dob,
//       mobile_number: row.mobile_number,
//       email_id: row.email_id,
//       pan_number: row.pan_number,
//       patient_name: row.patient_name,

//       current_address: row.current_address,
//       current_village_city: row.current_village_city,
//       current_district: row.current_district,
//       current_state: row.current_state,
//       current_pincode: row.current_pincode,

//       permanent_address: row.permanent_address,
//       permanent_village_city: row.permanent_village_city,
//       permanent_district: row.permanent_district,
//       permanent_state: row.permanent_state,
//       permanent_pincode: row.permanent_pincode,

//       employment_type: row.employment_type,
//       policy_type: row.policy_type,
//       net_monthly_income: row.net_monthly_income,

//       loan_amount: row.loan_amount,
//       interest_rate: row.interest_rate,
//       loan_tenure: row.loan_tenure,
//       emi_amount: row.emi_amount,
//       cibil_score: row.cibil_score,
//       status: row.status,
//       disbursed_at: row.disbursed_at,

//       bank_name: row.bank_name,
//       name_in_bank: row.name_in_bank,
//       account_number: row.account_number,
//       ifsc: row.ifsc,
//       bank_branch: row.bank_branch,

//       insurance_company_name: row.insurance_company_name,
//       insurance_policy_holder_name: row.insurance_policy_holder_name,
//       insurance_policy_number: row.insurance_policy_number,
//       relation_with_policy_holder: row.relation_with_policy_holder,

//       final_limit: row.final_limit,
//       approved_limit: row.approved_limit,
//       pf_percent: row.pf_percent,
//       subvention_percent: row.subvention_percent,
//       updated_subvention: row.updated_subvention,
//       limit_assigned_at: row.limit_assigned_at,
//       limit_assigned_by: row.limit_assigned_by,
//       ops_approved_at: row.ops_approved_at,
//       ops_approved_by: row.ops_approved_by,

//       hospital_name: row.hospital_legal_name,
//       hospital_id: row.hospital_id,

//       clayyo_bre_status: row.clayyo_bre_status,
//       clayyo_bre_reason: row.clayyo_bre_reason,
//       clayyo_bre_checked_at: row.clayyo_bre_checked_at,

//       clayyo_bureau_score: row.clayyo_bureau_score,
//       clayyo_enquiries_30d: row.clayyo_enquiries_30d,

//       clayyo_dpd_3m_flag: row.clayyo_dpd_3m_flag,
//       clayyo_dpd_12m_count: row.clayyo_dpd_12m_count,
//       clayyo_dpd_24m_60_flag: row.clayyo_dpd_24m_60_flag,
//       clayyo_dpd_36m_90_flag: row.clayyo_dpd_36m_90_flag,

//       clayyo_overdue_flag: row.clayyo_overdue_flag,
//       clayyo_writtenoff_flag: row.clayyo_writtenoff_flag,
//       clayyo_moratorium_flag: row.clayyo_moratorium_flag,
//       clayyo_restructured_flag: row.clayyo_restructured_flag,
//     };

//     const kyc = {
//       pan_status: row.kyc_pan_status || "PENDING",
//       aadhaar_status: row.kyc_aadhaar_status || "PENDING",
//       bureau_status: row.kyc_bureau_status || "PENDING",
//       agreement_esign_status: row.agreement_esign_status || "PENDING",
//       bank_status: row.bank_status || "PENDING",
//     };

//     return res.json({ loan, kyc });
//   } catch (err) {
//     console.error("❌ Error fetching Clayyo loan details:", err);
//     return res.status(500).json({
//       message: "Failed to fetch Clayyo loan details",
//       error: err.sqlMessage || err.message,
//     });
//   }
// });

//// Loan Aggreement PDF Generation Route

const safeParseJson = (value) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  let parsed = value;

  /*
   * Supports normal JSON and accidentally double-stringified JSON.
   */
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (typeof parsed !== "string") break;

    const normalized = parsed.trim();

    if (!normalized) return null;

    try {
      parsed = JSON.parse(normalized);
    } catch (error) {
      console.warn(
        "[Clayyo Agreement] Invalid raw_response JSON:",
        error.message,
      );

      return null;
    }
  }

  return parsed;
};

const normalizeAgreementUrl = (value) => {
  if (typeof value !== "string") return null;

  const url = value.trim();

  if (!url) return null;

  /*
   * Prevent invalid values from being sent to the frontend.
   */
  if (!/^https?:\/\//i.test(url)) {
    return null;
  }

  return url;
};

const findAgreementSignUrl = (value, depth = 0) => {
  if (!value || depth > 8) return null;

  if (Array.isArray(value)) {
    for (const item of value) {
      const foundUrl = findAgreementSignUrl(item, depth + 1);

      if (foundUrl) return foundUrl;
    }

    return null;
  }

  if (typeof value !== "object") {
    return null;
  }

  /*
   * Only check fields that may contain the borrower signing URL.
   */
  const allowedUrlKeys = [
    "sign_url",
    "signUrl",
    "signing_url",
    "signingUrl",
    "esign_url",
    "esignUrl",
  ];

  for (const key of allowedUrlKeys) {
    const foundUrl = normalizeAgreementUrl(value[key]);

    if (foundUrl) return foundUrl;
  }

  /*
   * Search nested payload/content/response objects safely.
   */
  for (const nestedValue of Object.values(value)) {
    const foundUrl = findAgreementSignUrl(
      nestedValue,
      depth + 1,
    );

    if (foundUrl) return foundUrl;
  }

  return null;
};

const cleanDoqfyAgreementUrl = (value) => {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  try {
    const parsedUrl = new URL(value.trim());

    const hostname = parsedUrl.hostname.toLowerCase();
    const pathname = parsedUrl.pathname.toLowerCase();

    /*
     * Accept only the Doqfy Aadhaar signing-page URL.
     * Do not return the nested eMudhra URL.
     */
    const isDoqfyUrl =
      hostname === "prod.doqfy.in" ||
      hostname.endsWith(".doqfy.in");

    const isAadhaarLink =
      pathname === "/aadhaarlink" ||
      pathname.endsWith("/aadhaarlink");

    if (!isDoqfyUrl || !isAadhaarLink) {
      return null;
    }

    /*
     * The stored signatory_id may accidentally contain encoded
     * JSON after the real ID:
     *
     * SEQFYB4WGHK%22%7D,%7B...
     *
     * URLSearchParams decodes that value, so retain only the
     * valid identifier at the beginning.
     */
    const rawEsignId =
      parsedUrl.searchParams.get("esign_id");

    const rawSignatoryId =
      parsedUrl.searchParams.get("signatory_id");

    const esignId =
      String(rawEsignId || "")
        .match(/^[A-Za-z0-9_-]+/)?.[0] || null;

    const signatoryId =
      String(rawSignatoryId || "")
        .match(/^[A-Za-z0-9_-]+/)?.[0] || null;

    if (!esignId || !signatoryId) {
      return null;
    }

    /*
     * Rebuild a clean URL containing only the required fields.
     */
    const cleanUrl = new URL(
      `${parsedUrl.protocol}//${parsedUrl.host}${parsedUrl.pathname}`,
    );

    cleanUrl.searchParams.set(
      "esign_id",
      esignId,
    );

    cleanUrl.searchParams.set(
      "signatory_id",
      signatoryId,
    );

    return cleanUrl.toString();
  } catch (error) {
    console.warn(
      "[Clayyo Agreement] Invalid Doqfy URL:",
      error.message,
    );

    return null;
  }
};

const findDoqfyAgreementUrl = (
  value,
  depth = 0,
) => {
  if (
    value === null ||
    value === undefined ||
    depth > 12
  ) {
    return null;
  }

  /*
   * The value itself may be the URL.
   */
  if (typeof value === "string") {
    return cleanDoqfyAgreementUrl(value);
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const result = findDoqfyAgreementUrl(
        item,
        depth + 1,
      );

      if (result) return result;
    }

    return null;
  }

  if (typeof value !== "object") {
    return null;
  }

  /*
   * Check likely URL fields first.
   */
  const prioritizedKeys = [
    "agreement_url",
    "aadhaar_link",
    "aadhaarLink",
    "redirect_url",
    "redirectUrl",
    "sign_url",
    "signUrl",
    "url",
    "link",
  ];

  for (const key of prioritizedKeys) {
    const result = findDoqfyAgreementUrl(
      value[key],
      depth + 1,
    );

    if (result) return result;
  }

  /*
   * Then safely search the remaining nested response.
   */
  for (const nestedValue of Object.values(value)) {
    const result = findDoqfyAgreementUrl(
      nestedValue,
      depth + 1,
    );

    if (result) return result;
  }

  return null;
};
const extractAgreementUrl = (rawResponse) => {
  const parsedResponse =
    safeParseJson(rawResponse);

  if (!parsedResponse) {
    return null;
  }

  /*
   * Returns only the Doqfy Aadhaar redirect link.
   * It will ignore the internal eMudhra URL.
   */
  return findDoqfyAgreementUrl(
    parsedResponse,
  );
};

// router.get("/loan-info/:lan", async (req, res) => {
//   const { lan } = req.params;

//   try {
//     const [rows] = await db.promise().query(
//       `
//       SELECT
//         lb.lan,
//         lb.app_id,
//         lb.login_date,
//         lb.customer_name,
//         lb.gender,
//         lb.dob,
//         lb.mobile_number,
//         lb.email_id,
//         lb.pan_number,
//         lb.patient_name,

//         lb.current_address,
//         lb.current_village_city,
//         lb.current_district,
//         lb.current_state,
//         lb.current_pincode,

//         lb.permanent_address,
//         lb.permanent_village_city,
//         lb.permanent_district,
//         lb.permanent_state,
//         lb.permanent_pincode,

//         lb.employment_type,
//         lb.policy_type,
//         lb.net_monthly_income,

//         lb.loan_amount,
//         lb.interest_rate,
//         lb.loan_tenure,
//         lb.emi_amount,
//         lb.cibil_score,
//         lb.status,
//         lb.disbursed_at,

//         lb.bank_name,
//         lb.name_in_bank,
//         lb.account_number,
//         lb.ifsc,
//         lb.bank_branch,
//         lb.bank_status,

//         lb.enach_umrn,
//         lb.enach_auth_url,

//         lb.bank_details_updated_once,
//         lb.bank_details_updated_at,

//         lb.applicant_email_updated_once,
//         lb.applicant_email_updated_at,

//         lb.insurance_cost,
//         lb.insurance_company_name,
//         lb.insurance_policy_holder_name,
//         lb.insurance_policy_number,
//         lb.insurance_policy_issued_date,
//         lb.insurance_period,
//         lb.insurance_details_submitted_once,
//         lb.insurance_details_submitted_at,
//         lb.relation_with_policy_holder,

//         lb.final_limit,
//         lb.approved_limit,
//         lb.pf_percent,
//         lb.subvention_percent,
//         lb.updated_subvention,
//         lb.limit_assigned_at,
//         lb.limit_assigned_by,
//         lb.stage,
//         lb.limit_rework_required,
//         lb.limit_rework_reason,
//         lb.ops_approved_at,
//         lb.ops_approved_by,

//         COALESCE(
//           ch.hospital_legal_name,
//           lb.hospital_name
//         ) AS hospital_legal_name,

//         lb.hospital_id,

//         lb.clayyo_bre_status,
//         lb.clayyo_bre_reason,
//         lb.clayyo_bre_checked_at,

//         lb.clayyo_bureau_score,
//         lb.clayyo_enquiries_30d,

//         lb.clayyo_dpd_3m_flag,
//         lb.clayyo_dpd_12m_count,
//         lb.clayyo_dpd_24m_60_flag,
//         lb.clayyo_dpd_36m_90_flag,

//         lb.clayyo_overdue_flag,
//         lb.clayyo_writtenoff_flag,
//         lb.clayyo_moratorium_flag,
//         lb.clayyo_restructured_flag,

//         lb.agreement_esign_status,

//         (
//   SELECT ed.raw_response
//   FROM esign_documents ed
//   WHERE ed.lan = lb.lan
//     AND ed.document_type = 'AGREEMENT'
//   ORDER BY ed.id DESC
//   LIMIT 1
// ) AS agreement_raw_response,

//         k.pan_status AS kyc_pan_status,
//         k.aadhaar_status AS kyc_aadhaar_status,
//         k.bureau_status AS kyc_bureau_status,
//         k.aadhaar_kyc_url AS borrower_aadhaar_url

//       FROM loan_booking_clayyo lb

//       LEFT JOIN kyc_verification_status k
//         ON k.lan = lb.lan

//       LEFT JOIN clayyo_hospital_booking ch
//         ON ch.id = lb.hospital_id

//       WHERE lb.lan = ?
//       LIMIT 1
//       `,
//       [lan],
//     );

//     if (!rows.length) {
//       return res.status(404).json({
//         success: false,
//         message: "Loan not found",
//       });
//     }

//     const row = rows[0];

//     /*
//      * Returns the signing URL or null.
//      * Missing/invalid raw_response will not crash this API.
//      */
//     const agreementUrl = extractAgreementUrl(
//       row.agreement_raw_response,
//     );

//     const loan = {
//       lan: row.lan,
//       app_id: row.app_id,
//       login_date: row.login_date,
//       customer_name: row.customer_name,
//       gender: row.gender,
//       dob: row.dob,
//       mobile_number: row.mobile_number,
//       email_id: row.email_id,
//       pan_number: row.pan_number,
//       patient_name: row.patient_name,

//       current_address: row.current_address,
//       current_village_city: row.current_village_city,
//       current_district: row.current_district,
//       current_state: row.current_state,
//       current_pincode: row.current_pincode,

//       permanent_address: row.permanent_address,
//       permanent_village_city: row.permanent_village_city,
//       permanent_district: row.permanent_district,
//       permanent_state: row.permanent_state,
//       permanent_pincode: row.permanent_pincode,

//       employment_type: row.employment_type,
//       policy_type: row.policy_type,
//       net_monthly_income: row.net_monthly_income,

//       loan_amount: row.loan_amount,
//       interest_rate: row.interest_rate,
//       loan_tenure: row.loan_tenure,
//       emi_amount: row.emi_amount,
//       cibil_score: row.cibil_score,
//       status: row.status,
//       stage: row.stage,
//       disbursed_at: row.disbursed_at,

//       bank_name: row.bank_name,
//       name_in_bank: row.name_in_bank,
//       account_number: row.account_number,
//       ifsc: row.ifsc,
//       bank_branch: row.bank_branch,

//       /*
//        * Guarantor and co-applicant URLs are currently
//        * not available in the Clayyo backend.
//        * Returning null makes the frontend display
//        * "Not Available" without breaking.
//        */
//       verification_links: {
//         borrower_aadhaar_url:
//           row.borrower_aadhaar_url || null,

//         agreement_url:
//           agreementUrl || null,
//       },

//       nach_details: {
//         auth_url:
//           row.enach_auth_url || null,

//         umrn:
//           row.enach_umrn || null,
//       },

//       update_status: {
//         bank_details_updated_once: Boolean(
//           Number(
//             row.bank_details_updated_once || 0,
//           ),
//         ),

//         bank_details_updated_at:
//           row.bank_details_updated_at || null,

//         applicant_email_updated_once: Boolean(
//           Number(
//             row.applicant_email_updated_once || 0,
//           ),
//         ),

//         applicant_email_updated_at:
//           row.applicant_email_updated_at || null,
//       },

//       /*
//        * Structure required by ClayyoUpdateData.jsx.
//        */
//       insurance_details: {
//         insurance_cost:
//           row.insurance_cost ?? "0.00",

//         insurance_provider:
//           row.insurance_company_name || null,

//         policy_number:
//           row.insurance_policy_number || null,

//         policy_issued_date:
//           row.insurance_policy_issued_date || null,

//         period_of_insurance:
//           row.insurance_period || null,

//         submitted: Boolean(
//           Number(
//             row.insurance_details_submitted_once || 0,
//           ),
//         ),

//         submitted_at:
//           row.insurance_details_submitted_at || null,
//       },

//       /*
//        * Existing insurance fields retained.
//        */
//       insurance_company_name:
//         row.insurance_company_name,

//       insurance_policy_holder_name:
//         row.insurance_policy_holder_name,

//       insurance_policy_number:
//         row.insurance_policy_number,

//       relation_with_policy_holder:
//         row.relation_with_policy_holder,

//       final_limit: row.final_limit,
//       approved_limit: row.approved_limit,
//       pf_percent: row.pf_percent,
//       subvention_percent: row.subvention_percent,
//       updated_subvention: row.updated_subvention,
//       limit_assigned_at: row.limit_assigned_at,
//       limit_assigned_by: row.limit_assigned_by,

//       limit_rework_required:
//         row.limit_rework_required,

//       limit_rework_reason:
//         row.limit_rework_reason,

//       ops_approved_at:
//         row.ops_approved_at,

//       ops_approved_by:
//         row.ops_approved_by,

//       hospital_name:
//         row.hospital_legal_name,

//       hospital_id:
//         row.hospital_id,

//       clayyo_bre_status:
//         row.clayyo_bre_status,

//       clayyo_bre_reason:
//         row.clayyo_bre_reason,

//       clayyo_bre_checked_at:
//         row.clayyo_bre_checked_at,

//       clayyo_bureau_score:
//         row.clayyo_bureau_score,

//       clayyo_enquiries_30d:
//         row.clayyo_enquiries_30d,

//       clayyo_dpd_3m_flag:
//         row.clayyo_dpd_3m_flag,

//       clayyo_dpd_12m_count:
//         row.clayyo_dpd_12m_count,

//       clayyo_dpd_24m_60_flag:
//         row.clayyo_dpd_24m_60_flag,

//       clayyo_dpd_36m_90_flag:
//         row.clayyo_dpd_36m_90_flag,

//       clayyo_overdue_flag:
//         row.clayyo_overdue_flag,

//       clayyo_writtenoff_flag:
//         row.clayyo_writtenoff_flag,

//       clayyo_moratorium_flag:
//         row.clayyo_moratorium_flag,

//       clayyo_restructured_flag:
//         row.clayyo_restructured_flag,
//     };

//     const kyc = {
//       pan_status:
//         row.kyc_pan_status || "PENDING",

//       aadhaar_status:
//         row.kyc_aadhaar_status || "PENDING",

//       bureau_status:
//         row.kyc_bureau_status || "PENDING",

//       agreement_esign_status:
//         row.agreement_esign_status || "PENDING",

//       bank_status:
//         row.bank_status || "PENDING",
//     };

//     return res.json({
//       success: true,
//       loan,
//       kyc,
//     });
//   } catch (err) {
//     console.error(
//       "❌ Error fetching Clayyo loan details:",
//       err,
//     );

//     return res.status(500).json({
//       success: false,
//       message:
//         "Failed to fetch Clayyo loan details",
//       error:
//         err.sqlMessage || err.message,
//     });
//   }
// });

router.get("/loan-info/:lan", async (req, res) => {
  const lan = normalizeText(req.params.lan).toUpperCase();

  if (!lan) {
    return res.status(400).json({
      success: false,
      message: "LAN is required",
    });
  }

  /*
   * Allows the same code to work when UAT and production
   * database schemas are not completely identical.
   */
  const runOptionalQuery = async (
    label,
    sql,
    params = [],
  ) => {
    try {
      const [rows] = await db
        .promise()
        .query(sql, params);

      return rows;
    } catch (error) {
      if (
        error.code === "ER_NO_SUCH_TABLE" ||
        error.code === "ER_BAD_FIELD_ERROR"
      ) {
        console.warn(
          `[Clayyo loan-info] Optional ${label} data unavailable:`,
          error.message,
        );

        return [];
      }

      throw error;
    }
  };

  try {
    /*
     * SELECT * is intentional.
     *
     * Missing optional columns in production will not
     * cause an Unknown column error.
     */
    const [loanRows] = await db.promise().query(
      `
      SELECT *
      FROM loan_booking_clayyo
      WHERE lan = ?
      LIMIT 1
      `,
      [lan],
    );

    if (!loanRows.length) {
      return res.status(404).json({
        success: false,
        message: "Loan not found",
      });
    }

    const row = loanRows[0];

    const [
      kycRows,
      agreementRows,
      nachRows,
      hospitalRows,
    ] = await Promise.all([
      runOptionalQuery(
        "KYC",
        `
        SELECT *
        FROM kyc_verification_status
        WHERE lan = ?
        LIMIT 1
        `,
        [lan],
      ),

      runOptionalQuery(
        "agreement",
        `
        SELECT raw_response
        FROM esign_documents
        WHERE lan = ?
          AND document_type = 'AGREEMENT'
        ORDER BY id DESC
        LIMIT 1
        `,
        [lan],
      ),

      /*
       * NACH authentication link still comes from
       * enach_mandates.auth_url.
       *
       * UMRN from this query is only a fallback because
       * loan_booking_clayyo.enach_umrn is preferred below.
       */
      runOptionalQuery(
        "NACH",
        `
        SELECT
          (
            SELECT em1.auth_url
            FROM enach_mandates em1
            WHERE em1.lan = ?
              AND em1.auth_url IS NOT NULL
              AND TRIM(em1.auth_url) <> ''
            ORDER BY em1.id DESC
            LIMIT 1
          ) AS auth_url,

          (
            SELECT em2.umrn
            FROM enach_mandates em2
            WHERE em2.lan = ?
              AND em2.umrn IS NOT NULL
              AND TRIM(em2.umrn) <> ''
            ORDER BY em2.id DESC
            LIMIT 1
          ) AS umrn,

          (
            SELECT em3.status
            FROM enach_mandates em3
            WHERE em3.lan = ?
            ORDER BY em3.id DESC
            LIMIT 1
          ) AS status,

          (
            SELECT em4.document_id
            FROM enach_mandates em4
            WHERE em4.lan = ?
            ORDER BY em4.id DESC
            LIMIT 1
          ) AS document_id
        `,
        [
          lan,
          lan,
          lan,
          lan,
        ],
      ),

      row.hospital_id
        ? runOptionalQuery(
          "hospital",
          `
            SELECT hospital_legal_name
            FROM clayyo_hospital_booking
            WHERE id = ?
            LIMIT 1
            `,
          [row.hospital_id],
        )
        : Promise.resolve([]),
    ]);

    const kycRow = kycRows[0] || {};
    const agreementRow = agreementRows[0] || {};
    const nachRow = nachRows[0] || {};
    const hospitalRow = hospitalRows[0] || {};

    /*
     * Agreement URL.
     */
    const agreementUrl = extractAgreementUrl(
      agreementRow.raw_response,
    );

    const hospitalName =
      hospitalRow.hospital_legal_name ||
      row.hospital_name ||
      null;

    /*
     * --------------------------------------------------
     * NACH values
     * --------------------------------------------------
     */

    /*
     * UMRN priority:
     *
     * 1. loan_booking_clayyo.enach_umrn
     * 2. enach_mandates.umrn
     */
    const loanTableUmrn = normalizeText(
      row.enach_umrn,
    );

    const mandateTableUmrn = normalizeText(
      nachRow.umrn,
    );

    const resolvedNachUmrn =
      loanTableUmrn ||
      mandateTableUmrn ||
      null;

    /*
     * Authentication URL priority:
     *
     * 1. enach_mandates.auth_url
     * 2. loan_booking_clayyo.enach_auth_url
     */
    const mandateAuthUrl = normalizeText(
      nachRow.auth_url,
    );

    const loanTableAuthUrl = normalizeText(
      row.enach_auth_url,
    );

    const resolvedNachAuthUrl =
      mandateAuthUrl ||
      loanTableAuthUrl ||
      null;

    /*
     * --------------------------------------------------
     * Insurance lock rules
     * --------------------------------------------------
     *
     * Disable Update Insurance button when:
     *
     * 1. insurance_cost is greater than zero, OR
     * 2. insurance_details_submitted_once is true.
     */

    const insuranceCostValue =
      row.insurance_cost;

    const parsedInsuranceCost = Number(
      insuranceCostValue,
    );

    const hasExistingInsuranceCost =
      insuranceCostValue !== undefined &&
      insuranceCostValue !== null &&
      String(insuranceCostValue).trim() !== "" &&
      Number.isFinite(parsedInsuranceCost) &&
      parsedInsuranceCost > 0;

    const insuranceAlreadySubmitted = Boolean(
      Number(
        row.insurance_details_submitted_once || 0,
      ),
    );

    const insuranceUpdateDisabled =
      hasExistingInsuranceCost ||
      insuranceAlreadySubmitted;

    console.log("[CLAYYO LOAN INFO]", {
      lan,

      agreementUrlFound:
        Boolean(agreementUrl),

      nachAuthUrlFound:
        Boolean(resolvedNachAuthUrl),

      nachUmrnFound:
        Boolean(resolvedNachUmrn),

      nachStatus:
        nachRow.status || null,

      nachDocumentId:
        nachRow.document_id || null,

      nachUmrnSource:
        loanTableUmrn
          ? "loan_booking_clayyo"
          : mandateTableUmrn
            ? "enach_mandates"
            : null,

      insuranceCost:
        row.insurance_cost ?? null,

      insuranceAlreadySubmitted,

      insuranceUpdateDisabled,
    });

    const loan = {
      lan:
        row.lan,

      app_id:
        row.app_id || null,

      login_date:
        row.login_date || null,

      customer_name:
        row.customer_name || null,

      gender:
        row.gender || null,

      dob:
        row.dob || null,

      mobile_number:
        row.mobile_number || null,

      email_id:
        row.email_id || null,

      pan_number:
        row.pan_number || null,

      patient_name:
        row.patient_name || null,

      current_address:
        row.current_address || null,

      current_village_city:
        row.current_village_city || null,

      current_district:
        row.current_district || null,

      current_state:
        row.current_state || null,

      current_pincode:
        row.current_pincode || null,

      permanent_address:
        row.permanent_address || null,

      permanent_village_city:
        row.permanent_village_city || null,

      permanent_district:
        row.permanent_district || null,

      permanent_state:
        row.permanent_state || null,

      permanent_pincode:
        row.permanent_pincode || null,

      employment_type:
        row.employment_type || null,

      policy_type:
        row.policy_type || null,

      net_monthly_income:
        row.net_monthly_income ?? null,

      loan_amount:
        row.loan_amount ?? null,

      interest_rate:
        row.interest_rate ?? null,

      loan_tenure:
        row.loan_tenure ?? null,

      emi_amount:
        row.emi_amount ?? null,

      cibil_score:
        row.cibil_score ?? null,

      status:
        row.status || null,

      stage:
        row.stage || null,

      disbursed_at:
        row.disbursed_at || null,

      bank_name:
        row.bank_name || null,

      name_in_bank:
        row.name_in_bank || null,

      account_number:
        row.account_number || null,

      ifsc:
        row.ifsc || null,

      bank_branch:
        row.bank_branch || null,

      verification_links: {
        borrower_aadhaar_url:
          kycRow.aadhaar_kyc_url || null,

        agreement_url:
          agreementUrl || null,
      },

      /*
       * NACH section returned to frontend.
       */
      nach_details: {
        auth_url:
          resolvedNachAuthUrl,

        /*
         * Primarily fetched from:
         * loan_booking_clayyo.enach_umrn
         */
        umrn:
          resolvedNachUmrn,

        /*
         * NACH is treated as completed when a UMRN exists.
         */
        completed:
          Boolean(resolvedNachUmrn),

        status:
          nachRow.status || null,

        document_id:
          nachRow.document_id || null,

        umrn_source:
          loanTableUmrn
            ? "loan_booking_clayyo"
            : mandateTableUmrn
              ? "enach_mandates"
              : null,
      },

      update_status: {
        bank_details_updated_once:
          Boolean(
            Number(
              row.bank_details_updated_once || 0,
            ),
          ),

        bank_details_updated_at:
          row.bank_details_updated_at || null,

        applicant_email_updated_once:
          Boolean(
            Number(
              row.applicant_email_updated_once || 0,
            ),
          ),

        applicant_email_updated_at:
          row.applicant_email_updated_at || null,
      },

      /*
       * Insurance details and frontend button controls.
       */
      insurance_details: {
        insurance_cost:
          row.insurance_cost ?? "0.00",

        insurance_provider:
          row.insurance_company_name || null,

        policy_number:
          row.insurance_policy_number || null,

        policy_issued_date:
          row.insurance_policy_issued_date || null,

        period_of_insurance:
          row.insurance_period || null,

        submitted:
          insuranceAlreadySubmitted,

        submitted_at:
          row.insurance_details_submitted_at || null,

        /*
         * True when insurance_cost > 0.
         */
        has_existing_cost:
          hasExistingInsuranceCost,

        /*
         * Use this field to disable the JSX button.
         */
        update_disabled:
          insuranceUpdateDisabled,

        can_update:
          !insuranceUpdateDisabled,

        lock_reason:
          insuranceUpdateDisabled
            ? insuranceAlreadySubmitted
              ? "Insurance details have already been submitted"
              : "Insurance cost already exists for this loan"
            : null,
      },

      insurance_company_name:
        row.insurance_company_name || null,

      insurance_policy_holder_name:
        row.insurance_policy_holder_name || null,

      insurance_policy_number:
        row.insurance_policy_number || null,

      relation_with_policy_holder:
        row.relation_with_policy_holder || null,

      final_limit:
        row.final_limit ?? null,

      approved_limit:
        row.approved_limit ?? null,

      pf_percent:
        row.pf_percent ?? null,

      subvention_percent:
        row.subvention_percent ?? null,

      updated_subvention:
        row.updated_subvention ?? null,

      limit_assigned_at:
        row.limit_assigned_at || null,

      limit_assigned_by:
        row.limit_assigned_by || null,

      limit_rework_required:
        row.limit_rework_required ?? null,

      limit_rework_reason:
        row.limit_rework_reason || null,

      ops_approved_at:
        row.ops_approved_at || null,

      ops_approved_by:
        row.ops_approved_by || null,

      hospital_name:
        hospitalName,

      hospital_id:
        row.hospital_id || null,

      clayyo_bre_status:
        row.clayyo_bre_status || null,

      clayyo_bre_reason:
        row.clayyo_bre_reason || null,

      clayyo_bre_checked_at:
        row.clayyo_bre_checked_at || null,

      clayyo_bureau_score:
        row.clayyo_bureau_score ?? null,

      clayyo_enquiries_30d:
        row.clayyo_enquiries_30d ?? null,

      clayyo_dpd_3m_flag:
        row.clayyo_dpd_3m_flag ?? null,

      clayyo_dpd_12m_count:
        row.clayyo_dpd_12m_count ?? null,

      clayyo_dpd_24m_60_flag:
        row.clayyo_dpd_24m_60_flag ?? null,

      clayyo_dpd_36m_90_flag:
        row.clayyo_dpd_36m_90_flag ?? null,

      clayyo_overdue_flag:
        row.clayyo_overdue_flag ?? null,

      clayyo_writtenoff_flag:
        row.clayyo_writtenoff_flag ?? null,

      clayyo_moratorium_flag:
        row.clayyo_moratorium_flag ?? null,

      clayyo_restructured_flag:
        row.clayyo_restructured_flag ?? null,
    };

    const kyc = {
      pan_status:
        kycRow.pan_status || "PENDING",

      aadhaar_status:
        kycRow.aadhaar_status || "PENDING",

      bureau_status:
        kycRow.bureau_status || "PENDING",

      agreement_esign_status:
        row.agreement_esign_status || "PENDING",

      bank_status:
        row.bank_status || "PENDING",
    };

    return res.status(200).json({
      success: true,
      loan,
      kyc,
    });
  } catch (err) {
    console.error(
      "❌ Error fetching Clayyo loan details:",
      err,
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to fetch Clayyo loan details",
      error:
        err.sqlMessage || err.message,
    });
  }
});

router.get("/:lan/pdf", async (req, res) => {
  const { lan } = req.params;

  try {
    const templatePath = path.join(
      __dirname,
      "../../templates/Clayyo_Agreement.html",
    );

    if (!fs.existsSync(templatePath)) {
      return res.status(500).json({
        message: "Clayyo agreement template not found",
      });
    }

    let html = fs.readFileSync(templatePath, "utf-8");

    const signaturePath = path.join(
      __dirname,
      "../../public/Picture1-removebg-preview.png",
    );

    console.log(signaturePath);

    const image = fs.readFileSync(signaturePath);

    const signature = `data:image/png;base64,${image.toString("base64")}`;

    html = html.replace("{{FINTREE_SIGNATURE}}", signature);

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
        HOSPITAL_NAME,
        CUST_ACC_NO
      FROM clayyo_loan_summary
      WHERE lan = ?
      `,
      [lan],
    );

    if (!rows.length) {
      return res.status(404).json({
        message: "Clayyo summary not found",
      });
    }

    const summary = rows[0];

    html = html.replace(/{{(.*?)}}/g, (_, key) => summary[key.trim()] ?? "");

    const browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox"],
    });

    const page = await browser.newPage();

    await page.setContent(html, {
      waitUntil: "networkidle0",
    });

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
    });

    await browser.close();

    res.setHeader("Content-Type", "application/pdf");

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="Clayyo_Agreement_${lan}.pdf"`,
    );

    res.send(pdfBuffer);
  } catch (err) {
    console.error("Clayyo agreement error:", err);

    res.status(500).json({
      message: "Agreement generation failed",
      error: err.message,
    });
  }
});

router.get("/bre-rejected-loans", async (req, res) => {
  const { table = "loan_booking_clayyo", prefix = "CLY" } = req.query;

  const allowedTables = {
    loan_booking_clayyo: true,
  };
  if (!allowedTables[table]) {
    return res.status(400).json({ message: "Invalid table name" });
  }

  const query = `
    SELECT
      lb.*,
      COALESCE(ch.hospital_legal_name, lb.hospital_name) AS hospital_name
    FROM ?? lb
    LEFT JOIN clayyo_hospital_booking ch
      ON ch.id = lb.hospital_id
    WHERE lb.status IN (?) AND lb.lan LIKE ?
    ORDER BY lb.created_at DESC, lb.lan DESC
  `;
  const values = [
    table,
    [
      "BRE APPROVED",
      "BRE FAILED",
      "CREDIT APPROVED",
      "DISBURSEMENT INITIATED",
      "Login",
      "OPS APPROVED",
      "REJECTED",
    ],
    `${prefix}%`,
  ];

  db.query(query, values, (err, results) => {
    if (err) {
      console.error("Error fetching BRE rejected loans:", err);
      return res.status(500).json({ message: "Database error" });
    }
    res.json(results);
  });
});

router.put("/approve-bre-loan/:lan", async (req, res) => {
  const { lan } = req.params; // ✅ extract lan from params
  const { table = "loan_booking_clayyo", status } = req.body;

  const allowedTables = {
    loan_booking_clayyo: true,
  };
  if (!allowedTables[table]) {
    return res.status(400).json({ message: "Invalid table name" });
  }

  if (!status) {
    return res.status(400).json({ message: "Status is required" });
  }

  // ✅ Derive stage based on status
  const stage = status === "BRE APPROVED" ? "CREDIT_INITIATED" : "REJECTED";

  const query = `
    UPDATE ??
    SET status = ?, stage = ?, updated_at = NOW()
    WHERE lan = ?
  `;
  const values = [table, status, stage, lan];

  db.query(query, values, (err, results) => {
    if (err) {
      console.error("Error approving BRE loan:", err);
      return res.status(500).json({ message: "Database error" });
    }

    if (results.affectedRows === 0) {
      return res.status(404).json({ message: "Loan not found" });
    }

    res.json({ message: "Loan approved successfully", lan });
  });
});

router.patch(
  "/bank-details/:lan",
  async (req, res) => {
    let connection;

    try {
      const lan = normalizeText(
        req.params.lan,
      );

      const bankName = normalizeText(
        req.body.bank_name,
      );

      const accountHolderName =
        normalizeText(
          req.body.name_in_bank,
        );

      const accountNumber =
        normalizeText(
          req.body.account_number,
        ).replace(/\s+/g, "");

      const ifsc = normalizeText(
        req.body.ifsc,
      ).toUpperCase();

      const bankBranch = normalizeText(
        req.body.bank_branch,
      );

      if (!lan) {
        return res.status(400).json({
          success: false,
          message: "LAN is required.",
        });
      }

      if (
        !bankName ||
        !accountHolderName ||
        !accountNumber ||
        !ifsc
      ) {
        return res.status(400).json({
          success: false,

          message:
            "Bank name, account holder name, account number and IFSC are required.",
        });
      }

      /*
       * Indian bank account numbers normally
       * contain between 6 and 30 digits.
       */
      if (
        !/^\d{6,30}$/.test(
          accountNumber,
        )
      ) {
        return res.status(400).json({
          success: false,

          message:
            "Please enter a valid bank account number.",
        });
      }

      /*
       * Indian IFSC:
       * 4 letters + 0 + 6 alphanumeric characters.
       */
      if (
        !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(
          ifsc,
        )
      ) {
        return res.status(400).json({
          success: false,

          message:
            "Please enter a valid IFSC code.",
        });
      }

      /*
       * Ensure the fallback tracker is available.
       * It is used when production does not have
       * bank_details_updated_once.
       */
      await ensureClayyoBankTrackerTable();

      const {
        hasUpdatedOnceColumn,
        hasUpdatedAtColumn,
      } =
        await getClayyoBankTrackingColumns();

      connection =
        await db
          .promise()
          .getConnection();

      await connection.beginTransaction();

      /*
       * Lock the loan row so simultaneous requests
       * cannot both update the same LAN.
       */
      const selectColumns = ["id"];

      if (hasUpdatedOnceColumn) {
        selectColumns.push(
          "bank_details_updated_once",
        );
      }

      const [loanRows] =
        await connection.query(
          `
          SELECT
            ${selectColumns.join(", ")}
          FROM loan_booking_clayyo
          WHERE lan = ?
          LIMIT 1
          FOR UPDATE
          `,
          [lan],
        );

      if (!loanRows.length) {
        await connection.rollback();

        return res.status(404).json({
          success: false,
          message:
            "Clayyo loan not found.",
        });
      }

      const loan = loanRows[0];

      /*
       * UAT check:
       * use the column when it exists.
       */
      if (
        hasUpdatedOnceColumn &&
        Number(
          loan.bank_details_updated_once ||
          0,
        ) === 1
      ) {
        await connection.rollback();

        return res.status(409).json({
          success: false,

          message:
            "Bank details have already been updated once.",
        });
      }

      /*
       * Common one-time tracker:
       *
       * INSERT IGNORE succeeds only for the first
       * update request for a LAN.
       */
      const [trackerResult] =
        await connection.query(
          `
          INSERT IGNORE INTO
            clayyo_bank_details_update_tracker
          (
            lan,
            updated_at
          )
          VALUES (?, NOW())
          `,
          [lan],
        );

      if (!trackerResult.affectedRows) {
        await connection.rollback();

        return res.status(409).json({
          success: false,

          message:
            "Bank details have already been updated once.",
        });
      }

      /*
       * Build the UPDATE according to the current
       * database schema.
       */
      const updateFields = [
        "bank_name = ?",
        "name_in_bank = ?",
        "account_number = ?",
        "ifsc = ?",
        "bank_branch = ?",
      ];

      const updateValues = [
        bankName,
        accountHolderName,
        accountNumber,
        ifsc,
        bankBranch || null,
      ];

      /*
       * UAT has this column, production may not.
       */
      if (hasUpdatedOnceColumn) {
        updateFields.push(
          "bank_details_updated_once = 1",
        );
      }

      /*
       * UAT has this column, production may not.
       */
      if (hasUpdatedAtColumn) {
        updateFields.push(
          "bank_details_updated_at = NOW()",
        );
      }

      updateValues.push(lan);

      const [updateResult] =
        await connection.query(
          `
          UPDATE loan_booking_clayyo
          SET
            ${updateFields.join(",\n")}
          WHERE lan = ?
          `,
          updateValues,
        );

      /*
       * Because the loan was already found and
       * locked, this mainly protects against an
       * unexpected deletion or database issue.
       */
      if (
        hasUpdatedOnceColumn &&
        !updateResult.affectedRows
      ) {
        await connection.rollback();

        return res.status(409).json({
          success: false,

          message:
            "Bank details could not be updated.",
        });
      }

      await connection.commit();

      return res.status(200).json({
        success: true,

        message:
          "Bank details updated successfully.",

        bank_details: {
          bank_name: bankName,

          name_in_bank:
            accountHolderName,

          account_number:
            accountNumber,

          ifsc,

          bank_branch:
            bankBranch || null,
        },

        update_status: {
          bank_details_updated_once:
            true,

          bank_details_updated_at:
            new Date().toISOString(),
        },
      });
    } catch (error) {
      if (connection) {
        try {
          await connection.rollback();
        } catch (rollbackError) {
          console.error(
            "Clayyo bank rollback error:",
            rollbackError,
          );
        }
      }

      console.error(
        "Clayyo bank details update error:",
        error,
      );

      return res.status(500).json({
        success: false,

        message:
          "Failed to update bank details.",

        error:
          error.sqlMessage ||
          error.message,
      });
    } finally {
      if (connection) {
        connection.release();
      }
    }
  },
);

// Applicant email can be updated only once.
router.patch("/applicant-email/:lan", async (req, res) => {
  try {
    const lan = normalizeText(req.params.lan);

    const email = normalizeText(
      req.body?.email,
    ).toLowerCase();

    if (!lan) {
      return res.status(400).json({
        success: false,
        message: "LAN is required.",
      });
    }

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Applicant email is required.",
      });
    }

    /*
     * email_id is VARCHAR(150) in loan_booking_clayyo.
     */
    if (
      email.length > 150 ||
      !EMAIL_REGEX.test(email)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Please enter a valid applicant email address.",
      });
    }

    /*
     * Atomic one-time update.
     *
     * The WHERE condition prevents two requests from
     * updating the email more than once.
     */
    const [result] = await db.promise().query(
      `
      UPDATE loan_booking_clayyo
      SET
        email_id = ?,
        applicant_email_updated_once = 1,
        applicant_email_updated_at = NOW()
      WHERE lan = ?
        AND COALESCE(
          applicant_email_updated_once,
          0
        ) = 0
      `,
      [email, lan],
    );

    /*
     * affectedRows = 0 can mean:
     * 1. The LAN does not exist.
     * 2. The applicant email was already updated once.
     */
    if (result.affectedRows === 0) {
      const [[existingLoan]] =
        await db.promise().query(
          `
          SELECT
            lan,
            email_id,
            applicant_email_updated_once,
            applicant_email_updated_at
          FROM loan_booking_clayyo
          WHERE lan = ?
          LIMIT 1
          `,
          [lan],
        );

      if (!existingLoan) {
        return res.status(404).json({
          success: false,
          message:
            "Clayyo loan not found.",
        });
      }

      if (
        Number(
          existingLoan.applicant_email_updated_once ||
          0,
        ) === 1
      ) {
        return res.status(409).json({
          success: false,

          message:
            "Applicant email has already been updated once.",

          lan: existingLoan.lan,

          email:
            existingLoan.email_id ||
            null,

          update_status: {
            applicant_email_updated_once:
              true,

            applicant_email_updated_at:
              existingLoan.applicant_email_updated_at ||
              null,
          },
        });
      }

      return res.status(409).json({
        success: false,
        message:
          "Applicant email could not be updated.",
      });
    }

    /*
     * Read the final database value so the frontend
     * receives the exact saved email and timestamp.
     */
    const [[updatedLoan]] =
      await db.promise().query(
        `
        SELECT
          lan,
          email_id,
          applicant_email_updated_once,
          applicant_email_updated_at
        FROM loan_booking_clayyo
        WHERE lan = ?
        LIMIT 1
        `,
        [lan],
      );

    return res.status(200).json({
      success: true,

      message:
        "Applicant email updated successfully.",

      lan:
        updatedLoan?.lan || lan,

      email:
        updatedLoan?.email_id ||
        email,

      update_status: {
        applicant_email_updated_once:
          Boolean(
            Number(
              updatedLoan?.applicant_email_updated_once ||
              0,
            ),
          ),

        applicant_email_updated_at:
          updatedLoan?.applicant_email_updated_at ||
          null,
      },
    });
  } catch (error) {
    console.error(
      "Clayyo applicant email update error:",
      error,
    );

    return res.status(500).json({
      success: false,

      message:
        "Failed to update applicant email.",

      error:
        error.sqlMessage ||
        error.message,
    });
  }
});

//insurance lan
router.patch(
  "/insurance/:lan",
  async (req, res) => {
    try {
      const lan = normalizeText(
        req.params.lan,
      );

      const insuranceCardCompany =
        normalizeText(
          req.body.insurance_card_company,
        );

      const policyNumber =
        normalizeText(
          req.body.policy_number,
        );

      const policyHolderName =
        normalizeText(
          req.body.policy_holder_name,
        );

      const patientName =
        normalizeText(
          req.body.patient_name,
        );

      const fatherName =
        normalizeText(
          req.body.father_name,
        );

      const motherName =
        normalizeText(
          req.body.mother_name,
        );

      if (!lan) {
        return res.status(400).json({
          success: false,
          message: "LAN is required.",
        });
      }

      const requiredFields = [
        {
          value: insuranceCardCompany,
          label:
            "Insurance card / company",
        },
        {
          value: policyNumber,
          label: "Policy number",
        },
        {
          value: policyHolderName,
          label: "Policy holder name",
        },
        {
          value: patientName,
          label: "Patient name",
        },
        {
          value: fatherName,
          label: "Father's name",
        },
        {
          value: motherName,
          label: "Mother's name",
        },
      ];

      const missingField =
        requiredFields.find(
          ({ value }) => !value,
        );

      if (missingField) {
        return res.status(400).json({
          success: false,
          message: `${missingField.label} is required.`,
        });
      }

      const lengthValidations = [
        {
          value: insuranceCardCompany,
          label:
            "Insurance card / company",
          maxLength: 255,
        },
        {
          value: policyNumber,
          label: "Policy number",
          maxLength: 255,
        },
        {
          value: policyHolderName,
          label: "Policy holder name",
          maxLength: 255,
        },
        {
          value: patientName,
          label: "Patient name",
          maxLength: 255,
        },
        {
          value: fatherName,
          label: "Father's name",
          maxLength: 255,
        },
        {
          value: motherName,
          label: "Mother's name",
          maxLength: 255,
        },
      ];

      const invalidLength =
        lengthValidations.find(
          ({ value, maxLength }) =>
            value.length > maxLength,
        );

      if (invalidLength) {
        return res.status(400).json({
          success: false,
          message:
            `${invalidLength.label} must not exceed ` +
            `${invalidLength.maxLength} characters.`,
        });
      }

      /*
       * Atomic one-time submission:
       * the update succeeds only when insurance
       * details have not already been submitted.
       */
      const [result] =
        await db.promise().query(
          `
          UPDATE loan_booking_clayyo
          SET
            insurance_company_name = ?,
            insurance_policy_number = ?,
            insurance_policy_holder_name = ?,
            patient_name = ?,
            father_name = ?,
            mother_name = ?,
            insurance_details_submitted_once = 1,
            insurance_details_submitted_at = NOW()
          WHERE lan = ?
            AND COALESCE(
              insurance_details_submitted_once,
              0
            ) = 0
          `,
          [
            insuranceCardCompany,
            policyNumber,
            policyHolderName,
            patientName,
            fatherName,
            motherName,
            lan,
          ],
        );

      if (!result.affectedRows) {
        const loan =
          await getClayyoLoanByLan(lan);

        if (!loan) {
          return res.status(404).json({
            success: false,
            message:
              "Clayyo loan not found.",
          });
        }

        if (
          Number(
            loan
              .insurance_details_submitted_once ||
            0,
          ) === 1
        ) {
          return res.status(409).json({
            success: false,
            message:
              "Insurance details have already been submitted.",
          });
        }

        return res.status(409).json({
          success: false,
          message:
            "Insurance details could not be submitted.",
        });
      }

      const [[updatedInsurance]] =
        await db.promise().query(
          `
          SELECT
            insurance_company_name
              AS insurance_card_company,

            insurance_policy_number
              AS policy_number,

            insurance_policy_holder_name
              AS policy_holder_name,

            patient_name,
            father_name,
            mother_name,

            insurance_details_submitted_once,
            insurance_details_submitted_at
          FROM loan_booking_clayyo
          WHERE lan = ?
          LIMIT 1
          `,
          [lan],
        );

      const insuranceDetails = {
        insurance_card_company:
          updatedInsurance
            ?.insurance_card_company ||
          insuranceCardCompany,

        policy_number:
          updatedInsurance
            ?.policy_number ||
          policyNumber,

        policy_holder_name:
          updatedInsurance
            ?.policy_holder_name ||
          policyHolderName,

        patient_name:
          updatedInsurance
            ?.patient_name ||
          patientName,

        father_name:
          updatedInsurance
            ?.father_name ||
          fatherName,

        mother_name:
          updatedInsurance
            ?.mother_name ||
          motherName,

        submitted: true,

        update_disabled: true,

        submitted_at:
          updatedInsurance
            ?.insurance_details_submitted_at ||
          null,
      };

      return res.status(200).json({
        success: true,

        message:
          "Insurance details submitted successfully.",

        insurance: insuranceDetails,

        insurance_details:
          insuranceDetails,
      });
    } catch (error) {
      console.error(
        "Clayyo insurance update error:",
        error,
      );

      return res.status(500).json({
        success: false,

        message:
          "Failed to submit insurance details.",

        error:
          error.sqlMessage ||
          error.message,
      });
    }
  },
);

module.exports = router;
