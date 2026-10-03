const express = require("express");
const db = require("../../config/db");

const { claimBuddyRunAllValidations } = require("./claimBuddyValidationEngine");

const partnerBookingWrapper = require("../../services/partnerBookingWrapper");
const partnerLimitService = require("../../services/partnerLimitService");

const axios = require("axios");
const nodemailer = require("nodemailer");
const { approveAndInitiatePayout } = require("../../services/payout.service");

const { autoApproveClaimBuddyIfAllVerified } = require("./claimBuddyBreEngine");

const { generateRepaymentScheduleClaimBuddy } = require("../../utils/repaymentScheduleGenerator");


const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");

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

// ==========================================
// LAN GENERATOR
// ==========================================

const generateLoanIdentifiers = async () => {
  const lender = "CLAIM-BUDDY-HOSPITAL";

  const prefixLan = "CBF10";

  const applicationPrefix = "CBF0001";

  const [rows] = await db.promise().query(
    `
        SELECT last_sequence
        FROM loan_sequences
        WHERE lender_name=?
        FOR UPDATE
        `,
    [lender],
  );

  let newSequence;

  if (rows.length) {
    newSequence = rows[0].last_sequence + 1;

    await db.promise().query(
      `
        UPDATE loan_sequences
        SET last_sequence=?
        WHERE lender_name=?
        `,
      [newSequence, lender],
    );
  } else {
    newSequence = 11000;

    await db.promise().query(
      `
        INSERT INTO loan_sequences
        (
          lender_name,
          last_sequence
        )
        VALUES (?,?)
        `,
      [lender, newSequence],
    );
  }

  return {
    application_id: `${applicationPrefix}${newSequence}`,

    lan: `${prefixLan}${newSequence}`,
  };
};

// ==========================================
// CREATE HOSPITAL
// ==========================================

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

    const missing = requiredFields.filter((field) => !data[field]);

    if (missing.length) {
      return res.status(400).json({
        message: `Missing fields: ${missing.join(",")}`,
      });
    }

    const { lan, application_id } = await generateLoanIdentifiers();

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

    const columns = Object.keys(fields).join(",");

    const placeholders = Object.keys(fields)
      .map(() => "?")
      .join(",");

    await db.promise().query(
      `
INSERT INTO claim_buddy_hospital_booking
(${columns})
VALUES
(${placeholders})
`,

      Object.values(fields),
    );

    return res.json({
      success: true,

      message: "Claim Buddy Hospital Created",

      lan,

      application_id,
    });
  } catch (err) {
    console.log(err);

    res.status(500).json({
      success: false,

      message: "Hospital creation failed",

      error: err.message,
    });
  }
});

// ==========================================
// HOSPITAL LIST FOR DROPDOWN
// ==========================================

router.get("/hospitals-list", async (req, res) => {
  try {
    const [rows] = await db.promise().query(
      `
SELECT

id,

hospital_legal_name,

registered_city,

registered_district


FROM claim_buddy_hospital_booking


WHERE status='APPROVED'


ORDER BY hospital_legal_name ASC

`,
    );

    const formatted = rows.map((h) => ({
      id: h.id,

      name: `${h.hospital_legal_name} (${h.registered_city}, ${h.registered_district})`,

      hospital_legal_name: h.hospital_legal_name,

      city: h.registered_city,

      district: h.registered_district,
    }));

    res.json(formatted);
  } catch (err) {
    console.log("Hospital list error", err);

    res.status(500).json({
      message: "Failed to fetch hospitals",
    });
  }
});

// ==========================================
// ALL HOSPITALS
// ==========================================

router.get("/hospitals", async (req, res) => {
  try {
    const [rows] = await db.promise().query(
      `
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


FROM claim_buddy_hospital_booking


ORDER BY created_at DESC

`,
    );

    res.json(rows);
  } catch (err) {
    console.log(err);

    res.status(500).json({
      message: "Failed to fetch hospitals",
    });
  }
});

// ==========================================
// HOSPITAL LOGIN / CREDIT APPROVAL LIST
// ==========================================

router.get("/hospitals-login-loans", async (req, res) => {
  try {
    const [rows] = await db.promise().query(`
      SELECT
        id,
        lan,
        application_id,
        hospital_legal_name,
        brand_name,
        hospital_type,
        bed_capacity,
        registered_address,
        registered_city,
        registered_district,
        registered_state,
        registered_pincode,
        hospital_email,
        hospital_phone,
        owner_name,
        owner_email,
        owner_phone,
        status,
        created_at
      FROM claim_buddy_hospital_booking
      WHERE status = 'ACTIVE'
      ORDER BY created_at DESC
    `);

    res.json(rows);
  } catch (err) {
    console.log("Claim Buddy hospital login list error:", err);

    res.status(500).json({
      success: false,
      message: "Failed to fetch Claim Buddy hospitals",
      error: err.message,
    });
  }
});

// ==========================================
// HOSPITAL DETAILS BY LAN
// ==========================================

router.get("/hospital-details/:lan", async (req, res) => {
  const { lan } = req.params;

  try {
    const [rows] = await db.promise().query(
      `

SELECT

*

FROM claim_buddy_hospital_booking


WHERE lan=?


ORDER BY created_at DESC


`,

      [lan],
    );

    res.json(rows[0] || null);
  } catch (err) {
    console.log(err);

    res.status(500).json({
      message: "Failed to fetch hospital details",
    });
  }
});

// ==========================================
// UPDATE HOSPITAL STATUS
// ==========================================

router.patch("/hospitals/status/:lan", async (req, res) => {
  try {
    const { lan } = req.params;

    const { status } = req.body;

    const allowed = ["APPROVED", "REJECTED", "ACTIVE", "INACTIVE"];

    if (!allowed.includes(status)) {
      return res.status(400).json({
        message: "Invalid status",
      });
    }

    await db.promise().query(
      `

UPDATE claim_buddy_hospital_booking


SET status=?


WHERE lan=?

`,

      [status, lan],
    );

    res.json({
      success: true,

      message: "Hospital status updated",
    });
  } catch (err) {
    console.log(err);

    res.status(500).json({
      message: "Status update failed",
    });
  }
});

// ==========================================
// SEND OTP
// ==========================================

const OTP_EXPIRY_SECONDS = 300;

router.post("/send-otp", async (req, res) => {
  try {
    console.log("OTP BODY:", req.body);
    const { mobile } = req.body;

    if (!mobile) {
      return res.status(400).json({
        message: "Mobile required",
      });
    }

    const cleanedMobile = mobile.replace(/\D/g, "");

    const otp = Math.floor(100000 + Math.random() * 900000);

    const expiresAt = new Date(Date.now() + OTP_EXPIRY_SECONDS * 1000);

    // SMS API
    const smsParams = {
      user: process.env.ALOT_USER,

      password: process.env.ALOT_PASSWORD,

      senderid: process.env.SENDER_ID,

      channel: "TRANS",

      DCS: "0",

      flashsms: "0",

      number: cleanedMobile,

      text: `OTP for mobile number verification is ${otp}. Do not share this OTP with anyone. Thanks & Regards Fintree Finance Private Limited`,

      route: "5",

      DLTTemplateId: process.env.MOBILE_OTP_TEMPLATE_ID.trim(),

      PEID: process.env.DLT_PEID,
    };

    await axios.get(process.env.ALOT_API_URL, {
      params: smsParams,
    });

    // Save OTP in common table

    await db.promise().query(
      `
INSERT INTO otp_sessions

(

identifier,

identifier_type,

owner_type,

otp,

purpose,

status,

attempts,

expires_at,

created_at

)

VALUES

(?,?,?,?,?,?,?,?,NOW())

`,

      [
        cleanedMobile,

        "mobile",

        "CLAIM_BUDDY",

        otp,

        "LOGIN",

        "CREATED",

        0,

        expiresAt,
      ],
    );

    res.json({
      success: true,

      message: "OTP sent successfully",

      otp,
    });
  } catch (err) {
    console.log("OTP ERROR", err);

    res.status(500).json({
      message: "OTP send failed",
    });
  }
});

// ==========================================
// VERIFY OTP
// ==========================================

router.post("/verify-otp", async (req, res) => {
  try {
    const {
      mobile,

      otp,

      consentText,
    } = req.body;

    if (!mobile || !otp || !consentText) {
      return res.status(400).json({
        message: "Mobile OTP consent required",
      });
    }

    const cleanedMobile = mobile.replace(/\D/g, "");

    const [rows] = await db.promise().query(
      `

SELECT *

FROM otp_sessions


WHERE identifier=?

AND identifier_type='mobile'

AND owner_type='CLAIM_BUDDY'

AND otp=?

AND status='CREATED'


ORDER BY id DESC

LIMIT 1


`,

      [cleanedMobile, otp],
    );

    if (!rows.length) {
      return res.status(400).json({
        message: "Invalid OTP",
      });
    }

    const record = rows[0];

    const expiryTime = new Date(record.expires_at);
    const currentTime = new Date();

    console.log("Current:", currentTime);
    console.log("Expiry:", expiryTime);

    if (currentTime.getTime() > expiryTime.getTime()) {
      return res.status(400).json({
        message: "OTP expired",
      });
    }

    await db.promise().query(
      `

UPDATE otp_sessions

SET

status='VERIFIED',

attempts=attempts+1


WHERE id=?


`,

      [record.id],
    );

    res.json({
      success: true,

      message: "Mobile verified + consent saved",
    });
  } catch (err) {
    console.log("VERIFY OTP ERROR", err);

    res.status(500).json({
      message: "OTP verification failed",
    });
  }
});

// ==========================================
// CLAIM BUDDY MANUAL ENTRY
// ==========================================

router.post("/manual-entry", async (req, res) => {
  let conn;

  try {
    const data = req.body;

    console.log("Claim Buddy Payload:", data);

    const requiredFields = [
      "login_date",

      "first_name",

      "last_name",

      "hospital_id",

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

    const missing = requiredFields.filter((field) => !data[field]);

    if (missing.length) {
      return res.status(400).json({
        message: `Missing fields: ${missing.join(", ")}`,
      });
    }

    const loanAmount = Number(data.loan_amount || 0);

    conn = await db.promise().getConnection();

    await conn.beginTransaction();

    // ==================================
    // PARTNER VALIDATION
    // ==================================

    const validation = await partnerBookingWrapper.validateBookingOrThrow(
      conn,

      "CLAIM-BUDDY",

      loanAmount,
    );

    // ==================================
    // LAN GENERATION
    // ==================================

    const {
      lan,

      application_id,
    } = await generateLoanIdentifiers();

    // ==================================
    // CUSTOMER NAME
    // ==================================

    const customer_name = `${data.first_name} ${data.last_name}`.trim();

    // ==================================
    // FETCH HOSPITAL NAME
    // ==================================

    let hospitalName = data.hospital_name || null;

    if (!hospitalName && data.hospital_id) {
      const [hospitalRows] = await conn.query(
        `

SELECT

hospital_legal_name


FROM claim_buddy_hospital_booking


WHERE id=?


LIMIT 1

`,

        [data.hospital_id],
      );

      hospitalName = hospitalRows?.[0]?.hospital_legal_name || null;
    }

    // ==================================
    // LOAN DATA
    // ==================================

    const fields = {
      lan,

      app_id: application_id,

      first_name: data.first_name,

      last_name: data.last_name,

      customer_name,

      login_date: data.login_date,

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

      loan_amount: loanAmount,

      product: "CLAIM BUDDY",

      lender: "CLAIM-BUDDY",

      status: LOAN_STATUS.LOGIN,

      stage: "LOGIN",

      employment_type: data.employment_type,

      net_monthly_income: data.net_monthly_income,

      // Insurance / Hospital fields

      insurance_company_name: data.insurance_company_name || null,

      insurance_policy_holder_name: data.insurance_policy_holder_name || null,

      insurance_policy_number: data.insurance_policy_number || null,

      relation_with_policy_holder: data.relation_with_policy_holder || null,

      bank_name: data.bank_name || null,

      name_in_bank: data.name_in_bank || null,

      account_number: data.account_number || null,

      ifsc: data.ifsc || null,

      bank_branch: data.bank_branch || null,

      hospital_id: data.hospital_id,

      hospital_name: hospitalName,

      policy_type: data.policy_type || null,

      agreement_date: data.login_date || null,
    };

    const columns = Object.keys(fields).join(",");

    const placeholders = Object.keys(fields)
      .map(() => "?")
      .join(",");

    await conn.query(
      `

INSERT INTO loan_booking_claim_buddy

(

${columns}

)

VALUES

(

${placeholders}

)

`,

      Object.values(fields),
    );

    // ==================================
    // KYC ENTRY
    // ==================================

    await conn.query(
      `

INSERT IGNORE INTO

kyc_verification_status

(

lan

)

VALUES

(?)

`,

      [lan],
    );

    // ==================================
    // FINALIZE PARTNER BOOKING
    // ==================================

    await partnerBookingWrapper.finalizeBooking(
      conn,

      validation.partnerId,

      validation.limitId,

      lan,

      loanAmount,

      validation.requiredFldg,

      "CLAIM BUDDY booking reservation",
    );

    await conn.commit();

    conn.release();

    res.json({
      success: true,

      message: "Claim Buddy loan created successfully",

      lan,

      application_id,
    });

    // Async validation

    claimBuddyRunAllValidations(lan);
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
        message: `Insufficient FLDG balance`,

        available_fldg: err.meta.available,

        required_fldg: err.meta.required,
      });
    }

    console.log("Claim Buddy manual entry error:", err);

    res.status(500).json({
      message: "Claim Buddy loan creation failed",

      error: err.sqlMessage || err.message,
    });
  }
});

// ==========================================
// CREDIT SCREEN - APPROVE INITIATE LOANS
// ==========================================

router.get("/approve-initiate-loans", async (req, res) => {
  const { table = "loan_booking_claim_buddy", prefix = "CBF" } = req.query;

  const allowedTables = {
    loan_booking_claim_buddy: true,
  };

  if (!allowedTables[table]) {
    return res.status(400).json({
      message: "Invalid table name",
    });
  }

  const query = `
    SELECT
      lb.*,

      COALESCE(
        ch.hospital_legal_name,
        lb.hospital_name
      ) AS hospital_name

    FROM ?? lb

    LEFT JOIN claim_buddy_hospital_booking ch
      ON ch.id = lb.hospital_id

    WHERE lb.status IN (?, ?)
  AND lb.lan LIKE ?

    ORDER BY lb.created_at DESC
  `;

  const values = [table, "BRE APPROVED", "Credit Recheck", `${prefix}%`];

  db.query(query, values, (err, results) => {
    if (err) {
      console.error("Claim Buddy approve initiate error", err);

      return res.status(500).json({
        message: "Database error",
      });
    }

    res.json({
      rows: results,
    });
  });
});

// router.put("/approve-initiated-loans/:lan", async (req, res) => {
//   const { lan } = req.params;
//   const { status, table } = req.body;

//   const allowedTables = {
//     loan_booking_claim_buddy: true,
//   };

//   if (!allowedTables[table]) {
//     return res.status(400).json({
//       message: "Invalid table name",
//     });
//   }

//   const allowedStatuses = ["CREDIT APPROVED", "REJECTED", "Credit Recheck"];

//   if (!allowedStatuses.includes(status)) {
//     return res.status(400).json({
//       message: "Invalid status",
//     });
//   }

//   const query = `
//       UPDATE ??
//       SET status = ?
//       WHERE lan = ?
//     `;

//   db.query(query, [table, status, lan], (err, result) => {
//     if (err) {
//       console.error("Claim Buddy status update error:", err);

//       return res.status(500).json({
//         message: "Database error",
//       });
//     }

//     if (result.affectedRows === 0) {
//       return res.status(404).json({
//         message: "Loan not found",
//       });
//     }

//     res.json({
//       success: true,
//       message: "Claim Buddy loan status updated successfully",
//       lan,
//       status,
//     });
//   });
// });

// ==========================================
// CREDIT APPROVED LOANS
// ==========================================

router.get("/credit-approved-loans", async (req, res) => {
  try {
    const {
      table = "loan_booking_claim_buddy",

      prefix = "CBF",
    } = req.query;

    const allowedTables = {
      loan_booking_claim_buddy: true,
    };

    if (!allowedTables[table]) {
      return res.status(400).json({
        message: "Invalid table",
      });
    }

    const query = `

SELECT

lb.*,


COALESCE(

ch.hospital_legal_name,

lb.hospital_name

) AS hospital_name



FROM ??

lb



LEFT JOIN claim_buddy_hospital_booking ch

ON ch.id=lb.hospital_id



WHERE

lb.status IN (?,?,?)


AND lb.lan LIKE ?



ORDER BY

lb.login_date DESC,

lb.lan DESC


`;

    const values = [
      table,

      LOAN_STATUS.LIMIT_REQUESTED,

      LOAN_STATUS.CREDIT_APPROVED,

      LOAN_STATUS.OPS_APPROVED,

      `${prefix}%`,
    ];

    db.query(
      query,

      values,

      (err, results) => {
        if (err) {
          console.log(err);

          return res.status(500).json({
            message: "Database error",
          });
        }

        res.json(results);
      },
    );
  } catch (err) {
    console.log(err);

    res.status(500).json({
      message: "Failed",
    });
  }
});

// ==========================================
// SET LIMIT
// ==========================================

router.put("/set-limit/:lan", async (req, res) => {
  try {
    const { lan } = req.params;

    const {
      inputLimit,

      limit_assigned_by,
    } = req.body;

    const [[loan]] = await db.promise().query(
      `

SELECT loan_amount

FROM loan_booking_claim_buddy

WHERE lan=?

`,

      [lan],
    );

    if (!loan) {
      return res.status(404).json({
        message: "Loan not found",
      });
    }

    const requestedAmount = Number(loan.loan_amount || 0);

    const assignedLimit = Number(inputLimit || 0);

    let newStatus;

    let newStage;

    let limitReworkRequired = 0;

    let limitReworkReason = null;

    if (assignedLimit > requestedAmount) {
      newStatus = "Credit Recheck";

      newStage = "CREDIT_REWORK";

      limitReworkRequired = 1;

      limitReworkReason = `Assigned limit ₹${assignedLimit} exceeds requested amount ₹${requestedAmount}`;
    } else {
      // newStatus = "OPS APPROVED";
      // newStage = "OPS_APPROVED";

      newStatus = "OPS MAKER APPROVED";
      newStage = "OPS_MAKER_APPROVED";
    }

    await db.promise().query(
      `
UPDATE loan_booking_claim_buddy
SET
final_limit=?,
status=?,
stage=?,
limit_assigned_at=NOW(),
limit_assigned_by=COALESCE(?,limit_assigned_by),
limit_rework_required=?,
limit_rework_reason=?
WHERE lan=?
`,

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

    res.json({
      success: true,

      message: "Limit assigned successfully",

      lan,

      requested_amount: requestedAmount,

      final_limit: assignedLimit,

      status: newStatus,

      stage: newStage,
    });
  } catch (err) {
    console.log(err);

    res.status(500).json({
      message: "Limit assignment failed",
    });
  }
});

// ==========================================
// CREDIT APPROVE / REJECT
// ==========================================

router.put("/approve-initiated-loans/:lan", async (req, res) => {
  const { lan } = req.params;

  const { status } = req.body;

  const conn = await db.promise().getConnection();

  try {
    await conn.beginTransaction();

    const [[loan]] = await conn.query(
      `

SELECT

lan,

status,

loan_amount

FROM loan_booking_claim_buddy

WHERE lan=?

FOR UPDATE


`,

      [lan],
    );

    if (!loan) {
      await conn.rollback();

      return res.status(404).json({
        message: "Loan not found",
      });
    }

    const loanAmount = Number(loan.loan_amount || 0);

    let validation = null;

    if (status === LOAN_STATUS.CREDIT_APPROVED) {
      validation = await partnerBookingWrapper.validateBookingOrThrow(
        conn,

        "CLAIM-BUDDY",

        loanAmount,
      );
    }

    let newStatus = status;

    let newStage;

    if (status === LOAN_STATUS.CREDIT_APPROVED) {
      newStage = "LIMIT_APPROVAL_PENDING";
    } else {
      newStage = "CREDIT_REJECTED";
    }

    await conn.query(
      `

UPDATE loan_booking_claim_buddy


SET

status=?,

stage=?


WHERE lan=?


`,

      [newStatus, newStage, lan],
    );

    if (status === LOAN_STATUS.CREDIT_APPROVED) {
      await partnerBookingWrapper.finalizeBooking(
        conn,

        validation.partnerId,

        validation.limitId,

        lan,

        loanAmount,

        validation.requiredFldg,

        "CLAIM BUDDY booking reservation",
      );
    }

    await conn.commit();

    res.json({
      success: true,

      lan,

      status: newStatus,

      stage: newStage,

      message: "Loan status updated",
    });
  } catch (err) {
    await conn.rollback();

    console.log(err);

    res.status(500).json({
      message: "Approval failed",

      error: err.message,
    });
  } finally {
    conn.release();
  }
});

// ==========================================
// OPS APPROVAL
// ==========================================

router.put("/ops-approve/:lan", async (req, res) => {
  try {
    const { lan } = req.params;

    const {
      approved_limit,

      pf_percent,

      ops_approved_by,
    } = req.body;

    const [result] = await db.promise().query(
      `

UPDATE loan_booking_claim_buddy


SET

approved_limit=?,

pf_percent=?,

status=?,

stage='OPS_APPROVED',

ops_approved_at=NOW(),

ops_approved_by=COALESCE(?,ops_approved_by)


WHERE lan=?


`,

      [
        approved_limit,

        pf_percent || "0.00",

        LOAN_STATUS.OPS_APPROVED,

        ops_approved_by || null,

        lan,
      ],
    );

    if (!result.affectedRows) {
      return res.status(404).json({
        message: "Loan not found",
      });
    }

    res.json({
      success: true,

      message: "OPS approved successfully",

      lan,
    });
  } catch (err) {
    console.log(err);

    res.status(500).json({
      message: "OPS approval failed",

      error: err.message,
    });
  }
});

// ==========================================
// UPDATE SUBVENTION
// ==========================================

router.put("/update-subvention/:lan", async (req, res) => {
  try {
    const { lan } = req.params;

    const { updated_subvention } = req.body;

    if (!updated_subvention) {
      return res.status(400).json({
        message: "Updated subvention required",
      });
    }

    await db.promise().query(
      `

UPDATE loan_booking_claim_buddy


SET

updated_subvention=?


WHERE lan=?


`,

      [updated_subvention, lan],
    );

    res.json({
      success: true,

      message: "Updated subvention saved successfully",
    });
  } catch (err) {
    console.log(err);

    res.status(500).json({
      message: "Failed to update subvention",
    });
  }
});

// ==========================================
// INITIATE DISBURSEMENT
// ==========================================

router.post("/initiate-disbursement/:lan", async (req, res) => {
  let conn;
  let transactionStarted = false;

  try {
    const { lan } = req.params;

    conn = await db.promise().getConnection();

    await conn.beginTransaction();
    transactionStarted = true;

    // ==================================================
    // FETCH LOAN
    // ==================================================

    const [[loan]] = await conn.query(
      `
        SELECT
          customer_name,
          hospital_name,
          approved_limit,
          final_limit,
          loan_amount,
          status,
          agreement_esign_status,
          enach_umrn
        FROM loan_booking_claim_buddy
        WHERE lan = ?
        FOR UPDATE
      `,
      [lan],
    );

    if (!loan) {
      await conn.rollback();
      transactionStarted = false;

      return res.status(404).json({
        status: "FAILED",
        message: "Loan not found",
      });
    }

    // ==================================================
    // CHECK AGREEMENT
    // ==================================================

    const agreementSigned =
      String(loan.agreement_esign_status || "")
        .trim()
        .toUpperCase() === "SIGNED";

    // ==================================================
    // CHECK NACH
    // ==================================================

    const nachCompleted = Boolean(String(loan.enach_umrn || "").trim());

    if (!agreementSigned || !nachCompleted) {
      await conn.rollback();
      transactionStarted = false;

      return res.status(400).json({
        status: "FAILED",
        code: "DISBURSEMENT_PREREQUISITES_INCOMPLETE",
        message: "Signed agreement and completed NACH required",
        agreement_signed: agreementSigned,
        nach_completed: nachCompleted,
      });
    }

    // ==================================================
    // CHECK AMOUNT
    // ==================================================

    const disbursementAmount = Number(
      loan.final_limit || loan.approved_limit || loan.loan_amount || 0,
    );

    if (disbursementAmount <= 0) {
      await conn.rollback();
      transactionStarted = false;

      return res.status(400).json({
        status: "FAILED",
        message: "Invalid disbursement amount",
      });
    }

    // ==================================================
    // PARTNER LIMIT CHECK
    // ==================================================

    const partner = await partnerLimitService.getOrCreatePartner(
      conn,
      "CLAIM-BUDDY",
    );

    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    const limitCheck =
      await partnerLimitService.validatePartnerDisbursementLimit(
        conn,
        partner.partner_id,
        disbursementAmount,
        month,
        year,
      );

    if (!limitCheck.valid) {
      await conn.rollback();
      transactionStarted = false;

      return res.status(403).json({
        status: "FAILED",
        message: limitCheck.message || "Disbursement limit exceeded",
        remaining_limit: limitCheck.remaining,
      });
    }

    // ==================================================
    // ONLY INITIATE
    // ==================================================

    await conn.query(
      `
        UPDATE loan_booking_claim_buddy
        SET
          status = 'DISBURSEMENT INITIATED',
          stage = 'DISBURSEMENT_INITIATED'
        WHERE lan = ?
      `,
      [lan],
    );

    await conn.commit();
    transactionStarted = false;

    // ==================================================
    // INITIATE PAYOUT
    // ==================================================

    const payoutResult = await approveAndInitiatePayout({
      lan,
      table: "loan_booking_claim_buddy",
    });

    if (!payoutResult.success) {
      return res.status(400).json({
        status: "FAILED",
        message: payoutResult.message || "Payout initiation failed",
        lan,
        current_status: "DISBURSEMENT INITIATED",
      });
    }

    // ==================================================
    // SUCCESS
    // WEBHOOK WILL CHANGE TO DISBURSED
    // ==================================================

    return res.json({
      status: "SUCCESS",
      message: "Disbursement initiated successfully",
      lan,
      disbursement_amount: disbursementAmount,
      current_status: "DISBURSEMENT INITIATED",
    });
  } catch (err) {
    if (transactionStarted && conn) {
      await conn.rollback();
    }

    console.error("❌ Claim Buddy initiate disbursement error:", err);

    return res.status(500).json({
      status: "FAILED",
      message: err.message || "Failed to initiate disbursement",
      error: err.sqlMessage || err.message,
    });
  } finally {
    if (conn) {
      conn.release();
    }
  }
});

// ==========================================
// FINAL DISBURSEMENT
// ==========================================

router.patch("/disburse/:lan", async (req, res) => {
  const conn = await db.promise().getConnection();

  try {
    const { lan } = req.params;

    await conn.beginTransaction();

    // 1. Get complete loan details required for Bullet RPS
    const [[loan]] = await conn.query(
      `
      SELECT
        lan,
        status,
        loan_amount,
        interest_rate,
        loan_tenure,
        final_limit,
        approved_limit,
        product,
        lender
      FROM loan_booking_claim_buddy
      WHERE lan = ?
      FOR UPDATE
      `,
      [lan],
    );

    if (!loan) {
      await conn.rollback();

      return res.status(404).json({
        success: false,
        message: "Loan not found",
      });
    }

    // 2. Validate current status
    if (loan.status !== "DISBURSEMENT INITIATED") {
      await conn.rollback();

      return res.status(400).json({
        success: false,
        message: "Loan is not in DISBURSEMENT INITIATED status",
        current_status: loan.status,
      });
    }

    // 3. Determine actual disbursed principal
    const disbursedAmount = Number(
      loan.final_limit || loan.approved_limit || loan.loan_amount || 0,
    );

    if (!Number.isFinite(disbursedAmount) || disbursedAmount <= 0) {
      await conn.rollback();

      return res.status(400).json({
        success: false,
        message: "Invalid disbursement amount",
        loan_amount: loan.loan_amount,
        final_limit: loan.final_limit,
        approved_limit: loan.approved_limit,
      });
    }

    // 4. Validate RPS inputs
    const interestRate = Number(loan.interest_rate || 0);
    const tenure = Number(loan.loan_tenure || 0);

    if (!Number.isFinite(interestRate)) {
      await conn.rollback();

      return res.status(400).json({
        success: false,
        message: "Invalid interest rate",
        interest_rate: loan.interest_rate,
      });
    }

    if (!Number.isInteger(tenure) || tenure <= 0) {
      await conn.rollback();

      return res.status(400).json({
        success: false,
        message: "Invalid loan tenure",
        loan_tenure: loan.loan_tenure,
      });
    }

    // 5. Use today's date as disbursement date
    const disbursementDate = new Date();

    // 6. Generate Claim Buddy BULLET RPS
    await generateRepaymentScheduleClaimBuddy(
      conn,
      lan,
      disbursedAmount,
      interestRate,
      tenure,
      disbursementDate,
      loan.product,
      loan.lender || "CLAIM-BUDDY",
    );

    // 7. Mark loan as DISBURSED
    await conn.query(
      `
      UPDATE loan_booking_claim_buddy
      SET
        status = 'DISBURSED',
        stage = 'DISBURSED',
        disbursed_at = NOW()
      WHERE lan = ?
      `,
      [lan],
    );

    // 8. Commit everything together
    await conn.commit();

    return res.json({
      success: true,
      message: "Loan disbursed successfully and Bullet RPS generated",
      lan,
      status: "DISBURSED",
      rps_generated: true,
      disbursed_amount: disbursedAmount,
      interest_rate: interestRate,
      tenure: tenure,
    });
  } catch (err) {
    await conn.rollback();

    console.error("Claim Buddy disbursement error:", err);

    return res.status(500).json({
      success: false,
      message: "Disbursement failed",
      error: err.message,
    });
  } finally {
    conn.release();
  }
});

// ==========================================
// APPROVED LOANS
// ==========================================

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



COALESCE(

ch.hospital_legal_name,

lb.hospital_name

)

AS hospital_name



FROM loan_booking_claim_buddy lb



LEFT JOIN claim_buddy_hospital_booking ch

ON ch.id = lb.hospital_id



WHERE lb.status IN (?,?,?)



ORDER BY

lb.login_date DESC,

lb.lan DESC


`,

      [
        LOAN_STATUS.LIMIT_REQUESTED,

        LOAN_STATUS.CREDIT_APPROVED,

        LOAN_STATUS.OPS_APPROVED,
      ],
    );

    res.json(rows);
  } catch (err) {
    console.log("Approved loan error", err);

    res.status(500).json({
      message: "Failed to fetch approved loans",

      error: err.message,
    });
  }
});

// ==========================================
// ALL LOANS
// ==========================================

router.get("/all-loans", async (req, res) => {
  try {
    const page = Number(req.query.page || 1);

    const pageSize = Number(req.query.pageSize || 1500);

    const offset = (page - 1) * pageSize;

    const [[count]] = await db.promise().query(
      `

SELECT COUNT(*) total

FROM loan_booking_claim_buddy


`,
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

lb.stage,


lb.hospital_id,

lb.disbursed_at,



lb.claim_buddy_bre_status,

lb.claim_buddy_bre_reason,

lb.claim_buddy_bre_checked_at,



kyc.aadhaar_status,



COALESCE(

ch.hospital_legal_name,

lb.hospital_name

)

AS hospital_name



FROM loan_booking_claim_buddy lb



LEFT JOIN claim_buddy_hospital_booking ch

ON ch.id=lb.hospital_id



LEFT JOIN kyc_verification_status kyc

ON kyc.lan=lb.lan



ORDER BY

lb.login_date DESC,

lb.lan DESC



LIMIT ?

OFFSET ?


`,

      [pageSize, offset],
    );

    res.json({
      pagination: {
        page,

        pageSize,

        total: count.total,
      },

      rows,
    });
  } catch (err) {
    console.log(err);

    res.status(500).json({
      message: "Database error",
    });
  }
});

// ==========================================
// LOAN INFORMATION
// ==========================================

router.get("/loan-info/:lan", async (req, res) => {
  try {
    const lan = String(req.params.lan || "")
      .trim()
      .toUpperCase();

    if (!lan) {
      return res.status(400).json({
        success: false,
        message: "LAN is required",
      });
    }

    // ==========================================
    // MAIN LOAN DETAILS
    // ==========================================

    const [loanRows] = await db.promise().query(
      `
        SELECT
          lb.*,

          COALESCE(
            ch.hospital_legal_name,
            lb.hospital_name
          ) AS resolved_hospital_name

        FROM loan_booking_claim_buddy lb

        LEFT JOIN claim_buddy_hospital_booking ch
          ON ch.id = lb.hospital_id

        WHERE lb.lan = ?

        LIMIT 1
        `,
      [lan],
    );

    if (!loanRows.length) {
      return res.status(404).json({
        success: false,
        message: "Claim Buddy loan not found",
      });
    }

    const row = loanRows[0];

    // ==========================================
    // KYC DETAILS
    // ==========================================

    const [kycRows] = await db.promise().query(
      `
        SELECT *
        FROM kyc_verification_status
        WHERE lan = ?
        ORDER BY updated_at DESC
        LIMIT 1
        `,
      [lan],
    );

    const kycRow = kycRows[0] || {};

    // ==========================================
    // AGREEMENT DETAILS
    // ==========================================

    let agreementUrl = null;

    try {
      const [agreementRows] = await db.promise().query(
        `
          SELECT raw_response
          FROM esign_documents
          WHERE lan = ?
            AND document_type = 'AGREEMENT'
          ORDER BY id DESC
          LIMIT 1
          `,
        [lan],
      );

      if (agreementRows.length && agreementRows[0].raw_response) {
        const raw = agreementRows[0].raw_response;

        let parsed = raw;

        if (typeof raw === "string") {
          try {
            parsed = JSON.parse(raw);
          } catch {
            parsed = raw;
          }
        }

        if (typeof parsed === "object") {
          agreementUrl =
            parsed?.url ||
            parsed?.signing_url ||
            parsed?.signingUrl ||
            parsed?.document_url ||
            parsed?.documentUrl ||
            parsed?.data?.url ||
            parsed?.data?.signing_url ||
            parsed?.response?.signing_url ||
            null;
        } else if (typeof parsed === "string" && /^https?:\/\//i.test(parsed)) {
          agreementUrl = parsed;
        }
      }
    } catch (agreementError) {
      console.warn(
        "Claim Buddy agreement data unavailable:",
        agreementError.message,
      );
    }

    // ==========================================
    // NACH DETAILS
    // ==========================================

    let nachRow = {};

    try {
      const [nachRows] = await db.promise().query(
        `
          SELECT
            auth_url,
            umrn,
            status,
            document_id
          FROM enach_mandates
          WHERE lan = ?
          ORDER BY id DESC
          LIMIT 1
          `,
        [lan],
      );

      nachRow = nachRows[0] || {};
    } catch (nachError) {
      console.warn("Claim Buddy NACH data unavailable:", nachError.message);
    }

    const loanTableUmrn = String(row.enach_umrn || "").trim();

    const mandateTableUmrn = String(nachRow.umrn || "").trim();

    const resolvedNachUmrn = loanTableUmrn || mandateTableUmrn || null;

    const loanTableAuthUrl = String(row.enach_auth_url || "").trim();

    const mandateAuthUrl = String(nachRow.auth_url || "").trim();

    const resolvedNachAuthUrl = mandateAuthUrl || loanTableAuthUrl || null;

    // ==========================================
    // INSURANCE CONTROL
    // ==========================================

    const insuranceCostValue = row.insurance_cost;

    const parsedInsuranceCost = Number(insuranceCostValue);

    const hasExistingInsuranceCost =
      insuranceCostValue !== undefined &&
      insuranceCostValue !== null &&
      String(insuranceCostValue).trim() !== "" &&
      Number.isFinite(parsedInsuranceCost) &&
      parsedInsuranceCost > 0;

    const insuranceAlreadySubmitted = Boolean(
      Number(row.insurance_details_submitted_once || 0),
    );

    const insuranceUpdateDisabled =
      hasExistingInsuranceCost || insuranceAlreadySubmitted;

    // ==========================================
    // FINAL LOAN RESPONSE
    // ==========================================

    const loan = {
      lan: row.lan,

      app_id: row.app_id || row.application_id || null,

      partner_loan_id: row.partner_loan_id || null,

      login_date: row.login_date || null,

      customer_name: row.customer_name || null,

      first_name: row.first_name || null,

      middle_name: row.middle_name || null,

      last_name: row.last_name || null,

      gender: row.gender || null,

      dob: row.dob || row.date_of_birth || null,

      mobile_number: row.mobile_number || null,

      email_id: row.email_id || row.email || null,

      pan_number: row.pan_number || row.pan_card || null,

      patient_name: row.patient_name || null,

      father_name: row.father_name || null,

      mother_name: row.mother_name || null,

      // ======================================
      // ADDRESS
      // ======================================

      current_address: row.current_address || null,

      current_village_city:
        row.current_village_city || row.current_city || null,

      current_district: row.current_district || null,

      current_state: row.current_state || null,

      current_pincode: row.current_pincode || null,

      permanent_address: row.permanent_address || null,

      permanent_village_city:
        row.permanent_village_city || row.permanent_city || null,

      permanent_district: row.permanent_district || null,

      permanent_state: row.permanent_state || null,

      permanent_pincode: row.permanent_pincode || null,

      // ======================================
      // LOAN
      // ======================================

      employment_type: row.employment_type || null,

      policy_type: row.policy_type || null,

      net_monthly_income: row.net_monthly_income ?? null,

      loan_amount: row.loan_amount ?? null,

      interest_rate: row.interest_rate ?? null,

      loan_tenure: row.loan_tenure ?? null,

      emi_amount: row.emi_amount ?? null,

      cibil_score: row.cibil_score ?? null,

      status: row.status || null,

      stage: row.stage || null,

      disbursed_at: row.disbursed_at || null,

      // ======================================
      // BANK
      // ======================================

      bank_name: row.bank_name || null,

      name_in_bank: row.name_in_bank || null,

      account_number: row.account_number || null,

      ifsc: row.ifsc || null,

      bank_branch: row.bank_branch || null,

      bank_status: row.bank_status || null,

      // ======================================
      // HOSPITAL
      // ======================================

      hospital_name: row.resolved_hospital_name || row.hospital_name || null,

      hospital_legal_name:
        row.resolved_hospital_name || row.hospital_name || null,

      hospital_id: row.hospital_id || null,

      // ======================================
      // LIMIT / OPS
      // ======================================

      final_limit: row.final_limit ?? null,

      approved_limit: row.approved_limit ?? null,

      pf_percent: row.pf_percent ?? null,

      subvention_percent: row.subvention_percent ?? null,

      updated_subvention: row.updated_subvention ?? null,

      limit_assigned_at: row.limit_assigned_at || null,

      limit_assigned_by: row.limit_assigned_by || null,

      limit_rework_required: row.limit_rework_required ?? null,

      limit_rework_reason: row.limit_rework_reason || null,

      ops_approved_at: row.ops_approved_at || null,

      ops_approved_by: row.ops_approved_by || null,

      // ======================================
      // AGREEMENT / KYC
      // ======================================

      agreement_esign_status: row.agreement_esign_status || "PENDING",

      verification_links: {
        borrower_aadhaar_url: kycRow.aadhaar_kyc_url || null,

        agreement_url: agreementUrl,
      },

      // ======================================
      // NACH
      // ======================================

      enach_umrn: resolvedNachUmrn,

      enach_auth_url: resolvedNachAuthUrl,

      nach_details: {
        auth_url: resolvedNachAuthUrl,

        umrn: resolvedNachUmrn,

        completed: Boolean(resolvedNachUmrn),

        status: nachRow.status || null,

        document_id: nachRow.document_id || null,
      },

      // ======================================
      // UPDATE CONTROL
      // ======================================

      bank_details_updated_once: Number(row.bank_details_updated_once || 0),

      bank_details_updated_at: row.bank_details_updated_at || null,

      applicant_email_updated_once: Number(
        row.applicant_email_updated_once || 0,
      ),

      applicant_email_updated_at: row.applicant_email_updated_at || null,

      update_status: {
        bank_details_updated_once: Boolean(
          Number(row.bank_details_updated_once || 0),
        ),

        bank_details_updated_at: row.bank_details_updated_at || null,

        applicant_email_updated_once: Boolean(
          Number(row.applicant_email_updated_once || 0),
        ),

        applicant_email_updated_at: row.applicant_email_updated_at || null,
      },

      // ======================================
      // INSURANCE
      // ======================================

      insurance_company_name: row.insurance_company_name || null,

      insurance_policy_holder_name: row.insurance_policy_holder_name || null,

      insurance_policy_number: row.insurance_policy_number || null,

      relation_with_policy_holder: row.relation_with_policy_holder || null,

      insurance_details: {
        insurance_cost: row.insurance_cost ?? "0.00",

        insurance_card_company: row.insurance_company_name || null,

        insurance_provider: row.insurance_company_name || null,

        policy_number: row.insurance_policy_number || null,

        policy_holder_name: row.insurance_policy_holder_name || null,

        patient_name: row.patient_name || null,

        father_name: row.father_name || null,

        mother_name: row.mother_name || null,

        policy_issued_date: row.insurance_policy_issued_date || null,

        period_of_insurance: row.insurance_period || null,

        submitted: insuranceAlreadySubmitted,

        submitted_at: row.insurance_details_submitted_at || null,

        has_existing_cost: hasExistingInsuranceCost,

        update_disabled: insuranceUpdateDisabled,

        can_update: !insuranceUpdateDisabled,

        lock_reason: insuranceUpdateDisabled
          ? insuranceAlreadySubmitted
            ? "Insurance details have already been submitted"
            : "Insurance cost already exists for this loan"
          : null,
      },

      // ======================================
      // CLAIM BUDDY BRE
      // ======================================

      claim_buddy_bre_status:
        row.claim_buddy_bre_status || row.bre_status || null,

      claim_buddy_bre_reason:
        row.claim_buddy_bre_reason || row.bre_reason || null,

      claim_buddy_bre_checked_at:
        row.claim_buddy_bre_checked_at || row.bre_checked_at || null,

      claim_buddy_bureau_score:
        row.claim_buddy_bureau_score ??
        row.bureau_score ??
        row.cibil_score ??
        null,

      claim_buddy_enquiries_30d:
        row.claim_buddy_enquiries_30d ?? row.enquiries_30d ?? null,

      claim_buddy_dpd_3m_flag:
        row.claim_buddy_dpd_3m_flag ?? row.dpd_3m_flag ?? null,

      claim_buddy_dpd_12m_count:
        row.claim_buddy_dpd_12m_count ?? row.dpd_12m_count ?? null,

      claim_buddy_dpd_24m_60_flag:
        row.claim_buddy_dpd_24m_60_flag ?? row.dpd_24m_60_flag ?? null,

      claim_buddy_dpd_36m_90_flag:
        row.claim_buddy_dpd_36m_90_flag ?? row.dpd_36m_90_flag ?? null,

      claim_buddy_overdue_flag:
        row.claim_buddy_overdue_flag ?? row.overdue_flag ?? null,

      claim_buddy_writtenoff_flag:
        row.claim_buddy_writtenoff_flag ?? row.writtenoff_flag ?? null,

      claim_buddy_moratorium_flag:
        row.claim_buddy_moratorium_flag ?? row.moratorium_flag ?? null,

      claim_buddy_restructured_flag:
        row.claim_buddy_restructured_flag ?? row.restructured_flag ?? null,
    };

    // ==========================================
    // KYC RESPONSE
    // ==========================================

    const kyc = {
      pan_status: kycRow.pan_status || "PENDING",

      aadhaar_status: kycRow.aadhaar_status || "PENDING",

      bureau_status: kycRow.bureau_status || "PENDING",

      aml_status: kycRow.aml_status || "PENDING",

      agreement_esign_status: row.agreement_esign_status || "PENDING",

      bank_status: row.bank_status || "PENDING",
    };

    return res.status(200).json({
      success: true,
      loan,
      kyc,
    });
  } catch (err) {
    console.error("❌ Claim Buddy loan details error:", err);

    return res.status(500).json({
      success: false,

      message: "Failed to fetch Claim Buddy loan details",

      error: err.sqlMessage || err.message,
    });
  }
});

// PDF

router.get("/:lan/pdf", async (req, res) => {
  const { lan } = req.params;

  try {
    const templatePath = path.join(
      __dirname,
      "../../templates/ClaimBuddyAgreement.html",
    );

    if (!fs.existsSync(templatePath)) {
      return res.status(500).json({
        message: "Claim Buddy agreement template not found",
      });
    }

    let html = fs.readFileSync(templatePath, "utf-8");

    const signaturePath = path.join(
      __dirname,
      "../../public/Picture1-removebg-preview.png",
    );

    console.log("Claim Buddy signature path:", signaturePath);

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
        FROM claim_buddy_loan_summary
        WHERE lan = ?
        LIMIT 1
        `,
      [lan],
    );

    if (!rows.length) {
      return res.status(404).json({
        message: "Claim Buddy summary not found",
      });
    }

    const summary = rows[0];

    html = html.replace(/{{(.*?)}}/g, (_, key) => summary[key.trim()] ?? "");

    const browser = await puppeteer.launch({
      headless: "new",

      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    try {
      const page = await browser.newPage();

      await page.setContent(html, {
        waitUntil: "networkidle0",
      });

      const pdfBuffer = await page.pdf({
        format: "A4",
        printBackground: true,
      });

      res.setHeader("Content-Type", "application/pdf");

      res.setHeader(
        "Content-Disposition",
        `attachment; filename="ClaimBuddy_Agreement_${lan}.pdf"`,
      );

      return res.send(pdfBuffer);
    } finally {
      await browser.close();
    }
  } catch (err) {
    console.error("Claim Buddy agreement error:", err);

    return res.status(500).json({
      message: "Agreement generation failed",

      error: err.message,
    });
  }
});

// GET LOAN DETAILS BY LAN

router.get("/loan/:lan", async (req, res) => {
  try {
    const { lan } = req.params;

    const [rows] = await db.promise().query(
      `
      SELECT *
      FROM loan_booking_claim_buddy
      WHERE lan=?
      `,
      [lan],
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Loan not found",
      });
    }

    res.json({
      success: true,
      loan: rows[0],
    });
  } catch (err) {
    console.log("Claim Buddy loan detail error:", err);

    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

router.post("/run-validation/:lan", async (req, res) => {
  try {
    await claimBuddyRunAllValidations(req.params.lan);

    res.json({
      success: true,
      message: "Validation completed",
      lan: req.params.lan,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

router.post("/run-validation/:lan", async (req, res) => {
  try {
    await claimBuddyRunAllValidations(req.params.lan);

    res.json({
      success: true,
      message: "Validation completed",
      lan: req.params.lan,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// ======================================================
// CLAIM BUDDY BRE ONLY - UAT / TESTING
// Does NOT re-run PAN / Aadhaar / Bureau
// ======================================================

router.post("/run-bre/:lan", async (req, res) => {
  try {
    await autoApproveClaimBuddyIfAllVerified(req.params.lan);

    res.json({
      success: true,
      message: "Claim Buddy BRE completed",
      lan: req.params.lan,
    });
  } catch (err) {
    console.error("Claim Buddy BRE error:", err);

    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// ============================================================
// CLAIM BUDDY - UPDATE DATA HELPERS
// ============================================================

const normalizeText = (value) => String(value ?? "").trim();

const getClaimBuddyLoanByLan = async (lan) => {
  const [rows] = await db.promise().query(
    `
    SELECT *
    FROM loan_booking_claim_buddy
    WHERE lan = ?
    LIMIT 1
    `,
    [lan],
  );

  return rows[0] || null;
};

// ============================================================
// CLAIM BUDDY BANK UPDATE TRACKER
// ============================================================

const ensureClaimBuddyBankTrackerTable = async () => {
  await db.promise().query(`
      CREATE TABLE IF NOT EXISTS
      claim_buddy_bank_details_update_tracker
      (
        id BIGINT UNSIGNED
          NOT NULL AUTO_INCREMENT,

        lan VARCHAR(100)
          NOT NULL,

        updated_at DATETIME
          NOT NULL DEFAULT CURRENT_TIMESTAMP,

        PRIMARY KEY (id),

        UNIQUE KEY uq_claim_buddy_bank_update_lan (lan)
      )
      ENGINE=InnoDB
      DEFAULT CHARSET=utf8mb4
      COLLATE=utf8mb4_unicode_ci
    `);
};

const getClaimBuddyBankTrackingColumns = async () => {
  const [updatedOnceColumns] = await db.promise().query(
    `
      SHOW COLUMNS
      FROM loan_booking_claim_buddy
      LIKE 'bank_details_updated_once'
      `,
  );

  const [updatedAtColumns] = await db.promise().query(
    `
      SHOW COLUMNS
      FROM loan_booking_claim_buddy
      LIKE 'bank_details_updated_at'
      `,
  );

  return {
    hasUpdatedOnceColumn: updatedOnceColumns.length > 0,

    hasUpdatedAtColumn: updatedAtColumns.length > 0,
  };
};

// ============================================================
// 1. UPDATE BANK DETAILS - ONE TIME
// PATCH /api/claim-buddy/bank-details/:lan
// ============================================================

router.patch("/bank-details/:lan", async (req, res) => {
  let connection;

  try {
    const lan = normalizeText(req.params.lan).toUpperCase();

    const bankName = normalizeText(req.body.bank_name);

    const accountHolderName = normalizeText(
      req.body.name_in_bank || req.body.account_holder_name,
    );

    const accountNumber = normalizeText(req.body.account_number).replace(
      /\s+/g,
      "",
    );

    const ifsc = normalizeText(req.body.ifsc).toUpperCase();

    const bankBranch = normalizeText(
      req.body.bank_branch || req.body.branch_name,
    );

    if (!lan) {
      return res.status(400).json({
        success: false,
        message: "LAN is required.",
      });
    }

    if (!bankName || !accountHolderName || !accountNumber || !ifsc) {
      return res.status(400).json({
        success: false,

        message:
          "Bank name, account holder name, account number and IFSC are required.",
      });
    }

    // Bank account validation
    if (!/^\d{6,30}$/.test(accountNumber)) {
      return res.status(400).json({
        success: false,

        message: "Please enter a valid bank account number.",
      });
    }

    // IFSC validation
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) {
      return res.status(400).json({
        success: false,

        message: "Please enter a valid IFSC code.",
      });
    }

    await ensureClaimBuddyBankTrackerTable();

    const { hasUpdatedOnceColumn, hasUpdatedAtColumn } =
      await getClaimBuddyBankTrackingColumns();

    connection = await db.promise().getConnection();

    await connection.beginTransaction();

    const selectColumns = ["id"];

    if (hasUpdatedOnceColumn) {
      selectColumns.push("bank_details_updated_once");
    }

    const [loanRows] = await connection.query(
      `
          SELECT
            ${selectColumns.join(", ")}
          FROM loan_booking_claim_buddy
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

        message: "Claim Buddy loan not found.",
      });
    }

    const loan = loanRows[0];

    // One-time check using loan column
    if (
      hasUpdatedOnceColumn &&
      Number(loan.bank_details_updated_once || 0) === 1
    ) {
      await connection.rollback();

      return res.status(409).json({
        success: false,

        message: "Bank details have already been updated once.",
      });
    }

    // One-time check using tracker table
    const [trackerResult] = await connection.query(
      `
          INSERT IGNORE INTO
          claim_buddy_bank_details_update_tracker
          (
            lan,
            updated_at
          )
          VALUES
          (
            ?,
            NOW()
          )
          `,
      [lan],
    );

    if (!trackerResult.affectedRows) {
      await connection.rollback();

      return res.status(409).json({
        success: false,

        message: "Bank details have already been updated once.",
      });
    }

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

    if (hasUpdatedOnceColumn) {
      updateFields.push("bank_details_updated_once = 1");
    }

    if (hasUpdatedAtColumn) {
      updateFields.push("bank_details_updated_at = NOW()");
    }

    updateValues.push(lan);

    const [updateResult] = await connection.query(
      `
          UPDATE loan_booking_claim_buddy
          SET
            ${updateFields.join(",\n")}
          WHERE lan = ?
          `,
      updateValues,
    );

    if (!updateResult.affectedRows && !updateResult.changedRows) {
      console.log(
        "Claim Buddy bank update matched row but values may be unchanged:",
        lan,
      );
    }

    await connection.commit();

    return res.status(200).json({
      success: true,

      message: "Bank details updated successfully.",

      bank_details: {
        bank_name: bankName,

        name_in_bank: accountHolderName,

        account_number: accountNumber,

        ifsc,

        bank_branch: bankBranch || null,
      },

      update_status: {
        bank_details_updated_once: true,

        bank_details_updated_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error("Claim Buddy bank rollback error:", rollbackError);
      }
    }

    console.error("Claim Buddy bank details update error:", error);

    return res.status(500).json({
      success: false,

      message: "Failed to update bank details.",

      error: error.sqlMessage || error.message,
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// ============================================================
// 2. UPDATE APPLICANT EMAIL - ONE TIME
// PATCH /api/claim-buddy/applicant-email/:lan
// ============================================================

router.patch("/applicant-email/:lan", async (req, res) => {
  const lan = normalizeText(req.params.lan).toUpperCase();

  const email = normalizeText(req.body.email).toLowerCase();

  try {
    if (!lan) {
      return res.status(400).json({
        success: false,
        message: "LAN is required",
      });
    }

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        success: false,

        message: "Please enter a valid email address",
      });
    }

    /*
     * Check whether the tracking column exists.
     */
    const [updatedOnceColumns] = await db.promise().query(
      `
          SHOW COLUMNS
          FROM loan_booking_claim_buddy
          LIKE 'applicant_email_updated_once'
          `,
    );

    const [updatedAtColumns] = await db.promise().query(
      `
          SHOW COLUMNS
          FROM loan_booking_claim_buddy
          LIKE 'applicant_email_updated_at'
          `,
    );

    const hasUpdatedOnceColumn = updatedOnceColumns.length > 0;

    const hasUpdatedAtColumn = updatedAtColumns.length > 0;

    /*
     * If your columns exist, enforce
     * one-time update through them.
     */
    let selectQuery = `
        SELECT
          email_id
      `;

    if (hasUpdatedOnceColumn) {
      selectQuery += `,
          applicant_email_updated_once
        `;
    }

    selectQuery += `
        FROM loan_booking_claim_buddy
        WHERE lan = ?
        LIMIT 1
      `;

    const [loanRows] = await db.promise().query(selectQuery, [lan]);

    if (!loanRows.length) {
      return res.status(404).json({
        success: false,

        message: "Claim Buddy loan not found",
      });
    }

    const loan = loanRows[0];

    if (
      hasUpdatedOnceColumn &&
      Number(loan.applicant_email_updated_once || 0) === 1
    ) {
      return res.status(409).json({
        success: false,

        message: "Applicant email can be updated only once",

        already_updated: true,
      });
    }

    const updateFields = ["email_id = ?"];

    const updateValues = [email];

    if (hasUpdatedOnceColumn) {
      updateFields.push("applicant_email_updated_once = 1");
    }

    if (hasUpdatedAtColumn) {
      updateFields.push("applicant_email_updated_at = NOW()");
    }

    updateValues.push(lan);

    await db.promise().query(
      `
          UPDATE loan_booking_claim_buddy
          SET
            ${updateFields.join(",\n")}
          WHERE lan = ?
          `,
      updateValues,
    );

    return res.json({
      success: true,

      message: "Applicant email updated successfully",

      email,

      update_status: {
        applicant_email_updated_once: true,

        applicant_email_updated_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Claim Buddy EMAIL UPDATE ERROR:", error);

    return res.status(500).json({
      success: false,

      message: "Internal server error",

      error: error.sqlMessage || error.message,
    });
  }
});

// ============================================================
// 3. UPDATE INSURANCE DETAILS - ONE TIME
// PATCH /api/claim-buddy/insurance/:lan
// ============================================================

router.patch("/insurance/:lan", async (req, res) => {
  try {
    console.log("========== CLAIM BUDDY INSURANCE ==========");
    console.log("CONTENT TYPE:", req.headers["content-type"]);
    console.log("CONTENT LENGTH:", req.headers["content-length"]);
    console.log("BODY:", req.body);
    console.log("BODY TYPE:", typeof req.body);
    console.log("==========================================");

    const { lan } = req.params;

    console.log("CLAIM BUDDY INSURANCE BODY:", req.body);

    const {
      insurance_cost,
      insurance_company_provider,
      insurance_policy_number,
      policy_issued_date,
      period_of_insurance,
    } = req.body || {};

    const cost = Number(insurance_cost);

    const provider = normalizeText(insurance_company_provider);

    const policyNumber = normalizeText(insurance_policy_number);

    const issuedDate = normalizeText(policy_issued_date);

    const period = normalizeText(period_of_insurance);

    if (!Number.isFinite(cost) || cost < 0) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid insurance cost.",
      });
    }

    if (!provider) {
      return res.status(400).json({
        success: false,
        message: "Insurance provider is required.",
      });
    }

    if (!policyNumber) {
      return res.status(400).json({
        success: false,
        message: "Insurance policy number is required.",
      });
    }

    if (!issuedDate) {
      return res.status(400).json({
        success: false,
        message: "Policy issued date is required.",
      });
    }

    if (!period) {
      return res.status(400).json({
        success: false,
        message: "Period of insurance is required.",
      });
    }

    const [result] = await db.promise().query(
      `
        UPDATE loan_booking_claim_buddy
        SET
          insurance_cost = ?,
          insurance_company_name = ?,
          insurance_policy_number = ?,
          insurance_policy_issued_date = ?,
          insurance_period = ?,
          insurance_details_submitted_once = 1,
          insurance_details_submitted_at = NOW()
        WHERE lan = ?
          AND COALESCE(
            insurance_details_submitted_once,
            0
          ) = 0
        `,
      [cost, provider, policyNumber, issuedDate, period, lan],
    );

    if (!result.affectedRows) {
      const [[loan]] = await db.promise().query(
        `
          SELECT
            lan,
            insurance_details_submitted_once,
            insurance_details_submitted_at
          FROM loan_booking_claim_buddy
          WHERE lan = ?
          LIMIT 1
          `,
        [lan],
      );

      if (!loan) {
        return res.status(404).json({
          success: false,
          message: "Claim Buddy loan not found.",
        });
      }

      if (Number(loan.insurance_details_submitted_once || 0) === 1) {
        return res.status(409).json({
          success: false,
          message: "Insurance details have already been submitted.",
        });
      }

      return res.status(409).json({
        success: false,
        message: "Insurance details could not be submitted.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Insurance details submitted successfully.",

      insurance_details: {
        insurance_cost: cost,

        insurance_company_provider: provider,

        insurance_policy_number: policyNumber,

        policy_issued_date: issuedDate,

        period_of_insurance: period,

        submitted: true,
      },
    });
  } catch (error) {
    console.error("Claim Buddy insurance update error:", error);

    return res.status(500).json({
      success: false,

      message: "Failed to submit insurance details.",

      error: error.sqlMessage || error.message,
    });
  }
});

// ============================================================
// CLAIM BUDDY - BRE REJECTED / APPROVAL SCREEN
// ============================================================

// GET
// /api/claim-buddy/bre-rejected-loans
router.get("/bre-rejected-loans", async (req, res) => {
  const { table = "loan_booking_claim_buddy", prefix = "CBF" } = req.query;

  const allowedTables = {
    loan_booking_claim_buddy: true,
  };

  if (!allowedTables[table]) {
    return res.status(400).json({
      message: "Invalid table name",
    });
  }

  const query = `
      SELECT
        lb.*,

        COALESCE(
          ch.hospital_legal_name,
          lb.hospital_name
        ) AS hospital_name

      FROM ?? lb

      LEFT JOIN claim_buddy_hospital_booking ch
        ON ch.id = lb.hospital_id

      WHERE lb.status IN (?)
        AND lb.lan LIKE ?

      ORDER BY
        lb.created_at DESC,
        lb.lan DESC
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
      console.error("Error fetching Claim Buddy BRE rejected loans:", err);

      return res.status(500).json({
        message: "Database error",
      });
    }

    return res.json(results);
  });
});

// ============================================================
// CLAIM BUDDY - APPROVE / REJECT BRE LOAN
// ============================================================

// PUT
// /api/claim-buddy/approve-bre-loan/:lan
router.put("/approve-bre-loan/:lan", async (req, res) => {
  const { lan } = req.params;

  const { table = "loan_booking_claim_buddy", status } = req.body;

  const allowedTables = {
    loan_booking_claim_buddy: true,
  };

  if (!allowedTables[table]) {
    return res.status(400).json({
      message: "Invalid table name",
    });
  }

  if (!status) {
    return res.status(400).json({
      message: "Status is required",
    });
  }

  const stage = status === "BRE APPROVED" ? "CREDIT_INITIATED" : "REJECTED";

  const query = `
      UPDATE ??
      SET
        status = ?,
        stage = ?,
        updated_at = NOW()
      WHERE lan = ?
    `;

  const values = [table, status, stage, lan];

  db.query(query, values, (err, results) => {
    if (err) {
      console.error("Error updating Claim Buddy BRE loan:", err);

      return res.status(500).json({
        message: "Database error",
      });
    }

    if (results.affectedRows === 0) {
      return res.status(404).json({
        message: "Loan not found",
      });
    }

    return res.json({
      message:
        status === "BRE APPROVED"
          ? "Loan approved successfully"
          : "Loan rejected successfully",

      lan,
      status,
      stage,
    });
  });
});

const getMonthYear = (date = new Date()) => {
  const d = new Date(date);

  return {
    month: d.getMonth() + 1,
    year: d.getFullYear(),
  };
};

// ======================================================
// CLAIM BUDDY OPS MAKER APPROVED LOANS
// ======================================================

router.get("/ops-maker-approved-loans", async (req, res) => {
  try {
    const [rows] = await db.promise().query(`
      SELECT
        lb.*
      FROM loan_booking_claim_buddy lb
      WHERE lb.status = 'OPS MAKER APPROVED'
        AND lb.lan LIKE 'CBF%'
      ORDER BY lb.created_at DESC
    `);

    return res.json({
      status: "SUCCESS",
      data: rows,
    });
  } catch (err) {
    console.error("❌ Claim Buddy OPS Checker loans fetch error:", err);

    return res.status(500).json({
      status: "FAILED",
      message: "Unable to fetch OPS checker loans",
      error: err.message,
    });
  }
});

// ======================================================
// CLAIM BUDDY OPS CHECKER APPROVE / REJECT
// ======================================================

router.put("/ops-checker-approved-loan/:lan", async (req, res) => {
  const { lan } = req.params;

  const { ops_checker_id, ops_checker_name, status } = req.body;

  let conn;

  try {
    // ==================================================
    // VALIDATE CHECKER ACTION
    // ==================================================

    if (!["OPS_CHECKER_APPROVED", "OPS_REJECTED"].includes(status)) {
      return res.status(400).json({
        status: "FAILED",
        message: "Invalid OPS checker status",
      });
    }

    // ==================================================
    // DB CONNECTION
    // ==================================================

    conn = await db.promise().getConnection();

    await conn.beginTransaction();

    // ==================================================
    // FETCH LOAN
    // ==================================================

    const [loanRows] = await conn.query(
      `
        SELECT
          lan,
          status,
          final_limit,
          approved_limit,
          loan_amount
        FROM loan_booking_claim_buddy
        WHERE lan = ?
        FOR UPDATE
      `,
      [lan],
    );

    if (!loanRows.length) {
      await conn.rollback();

      return res.status(404).json({
        status: "FAILED",
        message: "Loan not found",
      });
    }

    const loan = loanRows[0];

    // ==================================================
    // ONLY OPS APPROVED CASES CAN COME TO CHECKER
    // ==================================================

    if (loan.status !== "OPS MAKER APPROVED") {
      await conn.rollback();

      return res.status(400).json({
        status: "FAILED",
        message: `Loan is not available for OPS checker. Current status: ${loan.status}`,
      });
    }

    // ==================================================
    // CHECKER REJECT
    // ==================================================

    if (status === "OPS_REJECTED") {
      await conn.query(
        `
          UPDATE loan_booking_claim_buddy
          SET
            status = 'OPS_REJECTED',
            ops_checker_id = ?,
            ops_checker_name = ?,
            ops_approved_by = ?,
            ops_approved_at = NOW()
          WHERE lan = ?
        `,
        [
          ops_checker_id || null,
          ops_checker_name || null,
          ops_checker_name || null,
          lan,
        ],
      );

      await conn.commit();

      return res.json({
        status: "SUCCESS",
        message: "Loan rejected by OPS checker successfully",
        lan,
        final_status: "OPS_REJECTED",
      });
    }

    // ==================================================
    // CHECK DISBURSEMENT AMOUNT
    // ==================================================

    const disbursalAmount = Number(
      loan.final_limit || loan.approved_limit || loan.loan_amount || 0,
    );

    if (disbursalAmount <= 0) {
      await conn.rollback();

      return res.status(400).json({
        status: "FAILED",
        message: "Invalid disbursement amount",
      });
    }

    // ==================================================
    // PARTNER LIMIT VALIDATION
    // ==================================================

    const partner = await partnerLimitService.getOrCreatePartner(
      conn,
      "CLAIM-BUDDY",
    );

    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    const limitValidation =
      await partnerLimitService.validatePartnerDisbursementLimit(
        conn,
        partner.partner_id,
        disbursalAmount,
        month,
        year,
      );

    if (!limitValidation.valid) {
      await conn.rollback();

      return res.status(400).json({
        status: "FAILED",
        message: limitValidation.message || "Disbursement limit exceeded",
        remaining_limit: limitValidation.remaining,
      });
    }

    // ==================================================
    // CHECKER APPROVED
    // IMPORTANT:
    // DO NOT SET DISBURSED HERE
    // ==================================================

    await conn.query(
      `
        UPDATE loan_booking_claim_buddy
        SET
          status = 'DISBURSEMENT INITIATED',
          stage = 'DISBURSEMENT_INITIATED',
          ops_checker_id = ?,
          ops_checker_name = ?,
          ops_approved_by = ?,
          ops_approved_at = NOW()
        WHERE lan = ?
      `,
      [
        ops_checker_id || null,
        ops_checker_name || null,
        ops_checker_name || null,
        lan,
      ],
    );

    // ==================================================
    // UPDATE PARTNER DISBURSED LIMIT
    // ==================================================

    await partnerLimitService.updateDisbursedLimit(
      conn,
      limitValidation.limitId,
      disbursalAmount,
      lan,
    );

    // ==================================================
    // COMMIT BEFORE PAYOUT
    // ==================================================

    await conn.commit();

    // ==================================================
    // INITIATE PAYOUT
    // ==================================================

    const payoutResult = await approveAndInitiatePayout({
      lan,
      table: "loan_booking_claim_buddy",
    });

    if (!payoutResult.success) {
      console.error(
        `❌ Claim Buddy payout initiation failed for ${lan}:`,
        payoutResult.message,
      );

      return res.status(400).json({
        status: "FAILED",
        message: payoutResult.message || "Payout initiation failed",
        lan,
        current_status: "DISBURSEMENT INITIATED",
      });
    }

    // ==================================================
    // SUCCESS
    // PAYMENT IS NOW IN PROCESS
    // WEBHOOK WILL FINALIZE DISBURSED
    // ==================================================

    return res.json({
      status: "SUCCESS",
      message: "OPS checker approved. Payout initiated successfully.",
      lan,
      disbursal_amount: disbursalAmount,
      current_status: "DISBURSEMENT INITIATED",
    });
  } catch (err) {
    if (conn) {
      await conn.rollback();
    }

    console.error("❌ Claim Buddy OPS checker error:", err);

    return res.status(500).json({
      status: "FAILED",
      message: err.message || "Failed to process OPS checker action",
      error: err.sqlMessage || err.message,
    });
  } finally {
    if (conn) {
      conn.release();
    }
  }
});


//testing
// router.post("/generate-rps/:lan", async (req, res) => {
//   const conn = await db.promise().getConnection();

//   try {
//     const { lan } = req.params;

//     await conn.beginTransaction();

//     const [[loan]] = await conn.query(
//       `
//       SELECT
//         lan,
//         loan_amount,
//         interest_rate,
//         loan_tenure,
//         final_limit,
//         disbursed_at
//       FROM loan_booking_claim_buddy
//       WHERE lan = ?
//       `,
//       [lan],
//     );

//     if (!loan) {
//       await conn.rollback();

//       return res.status(404).json({
//         success: false,
//         message: "Loan not found",
//       });
//     }

//     const loanAmount = Number(
//       loan.final_limit ||
//       loan.loan_amount ||
//       0
//     );

//     await generateRepaymentScheduleClaimBuddy(
//       conn,
//       loan.lan,
//       loanAmount,
//       loan.interest_rate,
//       loan.loan_tenure,
//       loan.disbursed_at,
//     );

//     await conn.commit();

//     return res.json({
//       success: true,
//       message: "Claim Buddy RPS generated successfully",
//       lan,
//     });

//   } catch (err) {
//     await conn.rollback();

//     console.error("Claim Buddy RPS test error:", err);

//     return res.status(500).json({
//       success: false,
//       message: err.message,
//     });

//   } finally {
//     conn.release();
//   }
// });

// ==========================================
// EXPORT ROUTER
// ==========================================

module.exports = router;
