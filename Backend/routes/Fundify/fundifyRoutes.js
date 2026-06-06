const express = require("express");
const db = require("../../config/db");

const partnerLimitService = require("../../services/partnerLimitService");
const partnerFldgService = require("../../services/partnerFldgService");
const {
  runFundifyPanBureauValidations,
} = require("../../utils/fundifyValidationEngine");

const router = express.Router();

const generateLoanIdentifiers = async (lender) => {
  lender = lender.trim(); // normalize input
  console.log("Generating loan identifiers for lender:", lender);
  let prefixPartnerLoan;
  let prefixLan;

  prefixLan = "FUNDI1";
  prefixPartnerLoan = "FUNFIN1"

  console.log("prefixPartnerLoan:", prefixPartnerLoan);
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
    partnerLoanId: `${prefixPartnerLoan}${newSequence}`,
    lan: `${prefixLan}${newSequence}`,
  };
};

const PARTNER_NAME = "Fundify";
const PRODUCT_NAME = "Fundify Loan";
const LENDER_NAME = "Fundify";

/* ----------------------------- Helpers ----------------------------- */

function emptyToNull(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  return value;
}

function numberOrNull(value) {
  if (value === undefined || value === null || value === "") return null;

  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function dateOrNull(value) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return value;
}

function getMonthYear(date = new Date()) {
  return {
    month: date.getMonth() + 1,
    year: date.getFullYear(),
  };
}

function normalizeRole(role) {
  const normalizedRole = String(role || "").trim().toUpperCase();

  const allowedRoles = ["APPLICANT", "CO_APPLICANT", "GUARANTOR"];

  if (!allowedRoles.includes(normalizedRole)) {
    throw new Error("INVALID_APPLICANT_ROLE");
  }

  return normalizedRole;
}

async function insertRow(conn, tableName, payload) {
  const columns = Object.keys(payload);
  const values = Object.values(payload);

  const sql = `
    INSERT INTO ${tableName}
    (${columns.map((column) => `\`${column}\``).join(", ")})
    VALUES (${columns.map(() => "?").join(", ")})
  `;

  const [result] = await conn.query(sql, values);
  return result;
}

/* ------------------------ Build Loan Payload ------------------------ */

function buildFundifyLoanPayload({ loan, lan, partnerLoanId }) {
  return {
    partner_loan_id: partnerLoanId,
    lan,

    login_date: dateOrNull(loan.login_date),
    agreement_date: dateOrNull(loan.agreement_date),

    product: emptyToNull(loan.product) || PRODUCT_NAME,
    lender: emptyToNull(loan.lender) || LENDER_NAME,
    partner_name: emptyToNull(loan.partner_name) || PARTNER_NAME,

    status: emptyToNull(loan.status) || "Login",
    stage: emptyToNull(loan.stage) || "Login",

    loan_amount: numberOrNull(loan.loan_amount),
    approved_loan_amount: numberOrNull(loan.approved_loan_amount),
    disbursal_amount: numberOrNull(loan.disbursal_amount),
    net_disbursement: numberOrNull(loan.net_disbursement),

    interest_rate: numberOrNull(loan.interest_rate),
    loan_tenure: numberOrNull(loan.loan_tenure),
    emi_amount: numberOrNull(loan.emi_amount),

    processing_fee: numberOrNull(loan.processing_fee),
    processing_fee_percentage: numberOrNull(loan.processing_fee_percentage),
    insurance_amount: numberOrNull(loan.insurance_amount),
    other_charges: numberOrNull(loan.other_charges),

    repayment_frequency: emptyToNull(loan.repayment_frequency) || "Monthly",
    emi_day: numberOrNull(loan.emi_day),

    business_name: emptyToNull(loan.business_name),
    trade_name: emptyToNull(loan.trade_name),
    business_pan: emptyToNull(loan.business_pan),
    gstin: emptyToNull(loan.gstin),
    udyam_registration_no: emptyToNull(loan.udyam_registration_no),
    cin: emptyToNull(loan.cin),
    llpin: emptyToNull(loan.llpin),
    shop_establishment_no: emptyToNull(loan.shop_establishment_no),
    business_registration_no: emptyToNull(loan.business_registration_no),

    constitution_type: emptyToNull(loan.constitution_type),
    business_start_date: dateOrNull(loan.business_start_date),
    business_vintage_months: numberOrNull(loan.business_vintage_months),
    nature_of_business: emptyToNull(loan.nature_of_business),
    industry_type: emptyToNull(loan.industry_type),

    business_address: emptyToNull(loan.business_address),
    business_city: emptyToNull(loan.business_city),
    business_district: emptyToNull(loan.business_district),
    business_state: emptyToNull(loan.business_state),
    business_pincode: emptyToNull(loan.business_pincode),
    premises_ownership: emptyToNull(loan.premises_ownership),

    business_mobile: emptyToNull(loan.business_mobile),
    business_email: emptyToNull(loan.business_email),

    bank_name: emptyToNull(loan.bank_name),
    name_in_bank: emptyToNull(loan.name_in_bank),
    account_number: emptyToNull(loan.account_number),
    ifsc: emptyToNull(loan.ifsc),
    account_type: emptyToNull(loan.account_type),

    cibil_score: numberOrNull(loan.cibil_score),
    bureau_score: numberOrNull(loan.bureau_score),

    bre_status: emptyToNull(loan.bre_status) || "Pending",
    bre_reason: emptyToNull(loan.bre_reason),
    reject_reason: emptyToNull(loan.reject_reason),
    remarks: emptyToNull(loan.remarks),

    created_by: emptyToNull(loan.created_by),
    updated_by: emptyToNull(loan.updated_by),
  };
}

/* --------------------- Build Applicant Payload --------------------- */

function buildFundifyApplicantPayload({ applicant, lan, index }) {
  const role = normalizeRole(applicant.role);

  return {
    lan,
    role,

    party_no: numberOrNull(applicant.party_no) || index + 1,
    customer_id: emptyToNull(applicant.customer_id),
    relation_with_applicant: emptyToNull(applicant.relation_with_applicant),

    first_name: emptyToNull(applicant.first_name),
    middle_name: emptyToNull(applicant.middle_name),
    last_name: emptyToNull(applicant.last_name),
    full_name: emptyToNull(applicant.full_name),

    father_name: emptyToNull(applicant.father_name),
    mother_name: emptyToNull(applicant.mother_name),
    spouse_name: emptyToNull(applicant.spouse_name),

    dob: dateOrNull(applicant.dob),
    gender: emptyToNull(applicant.gender),
    marital_status: emptyToNull(applicant.marital_status),

    mobile: emptyToNull(applicant.mobile),
    alternate_mobile: emptyToNull(applicant.alternate_mobile),
    email: emptyToNull(applicant.email),

    pan: emptyToNull(applicant.pan),
    aadhaar_last4: emptyToNull(applicant.aadhaar_last4),
    aadhaar_ref_no: emptyToNull(applicant.aadhaar_ref_no),
    voter_id: emptyToNull(applicant.voter_id),
    driving_license_no: emptyToNull(applicant.driving_license_no),
    passport_no: emptyToNull(applicant.passport_no),
    ckyc_no: emptyToNull(applicant.ckyc_no),

    kyc_status: emptyToNull(applicant.kyc_status) || "Pending",
    kyc_verified_at: dateOrNull(applicant.kyc_verified_at),
    kyc_rejection_reason: emptyToNull(applicant.kyc_rejection_reason),

    current_address: emptyToNull(applicant.current_address),
    current_city: emptyToNull(applicant.current_city),
    current_district: emptyToNull(applicant.current_district),
    current_state: emptyToNull(applicant.current_state),
    current_pincode: emptyToNull(applicant.current_pincode),
    current_landmark: emptyToNull(applicant.current_landmark),
    residence_ownership: emptyToNull(applicant.residence_ownership),

    permanent_address: emptyToNull(applicant.permanent_address),
    permanent_city: emptyToNull(applicant.permanent_city),
    permanent_district: emptyToNull(applicant.permanent_district),
    permanent_state: emptyToNull(applicant.permanent_state),
    permanent_pincode: emptyToNull(applicant.permanent_pincode),

    same_as_current_address: applicant.same_as_current_address ? 1 : 0,

    occupation: emptyToNull(applicant.occupation),
    employer_name: emptyToNull(applicant.employer_name),
    monthly_income: numberOrNull(applicant.monthly_income),

    cibil_score: numberOrNull(applicant.cibil_score),
    bureau_score: numberOrNull(applicant.bureau_score),

    mobile_verified: applicant.mobile_verified ? 1 : 0,
    email_verified: applicant.email_verified ? 1 : 0,
    pan_verified: applicant.pan_verified ? 1 : 0,
    aadhaar_verified: applicant.aadhaar_verified ? 1 : 0,
  };
}

/* -------------------------------------------------------------------------- */
/*                           CREATE FUNDIFY LOAN                              */
/* -------------------------------------------------------------------------- */

router.post("/manual-entry", async (req, res) => {
  let conn;

  try {
    const { loan = {}, applicants = [] } = req.body;

    if (!loan.login_date) {
      return res.status(400).json({
        success: false,
        message: "login_date is required",
      });
    }

    const loginDate = new Date(loan.login_date);

    if (Number.isNaN(loginDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Invalid login_date",
      });
    }

    const loanAmount = Number(loan.loan_amount || 0);

    if (!loanAmount || loanAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Valid loan_amount is required",
      });
    }

    if (!Array.isArray(applicants) || applicants.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one applicant is required",
      });
    }

    const primaryApplicant = applicants.find(
      (applicant) =>
        String(applicant.role || "").trim().toUpperCase() === "APPLICANT"
    );

    if (!primaryApplicant) {
      return res.status(400).json({
        success: false,
        message: "One APPLICANT role is required",
      });
    }

    if (!primaryApplicant.full_name && !primaryApplicant.first_name) {
      return res.status(400).json({
        success: false,
        message: "Primary applicant name is required",
      });
    }

    conn = await db.promise().getConnection();
    await conn.beginTransaction();

    const partnerName = loan.partner_name || PARTNER_NAME;
    const { month, year } = getMonthYear(loginDate);

    /* ------------------------ Partner Limit Check ------------------------ */

    const partner = await partnerLimitService.getOrCreatePartner(
      conn,
      partnerName
    );

    const limitCheck = await partnerLimitService.validatePartnerBookingLimit(
      conn,
      partner.partner_id,
      loanAmount,
      month,
      year
    );

    if (!limitCheck.valid) {
      await conn.rollback();

      return res.status(403).json({
        success: false,
        stage: "limit-check",
        message: `Booking limit exceeded for ${partnerName}`,
        remaining_limit: limitCheck.remaining,
        required: loanAmount,
      });
    }

    /* ----------------------------- FLDG Check ----------------------------- */

    const [[partnerConfig]] = await conn.query(
      `
        SELECT fldg_percent, fldg_status
        FROM partner_master
        WHERE partner_id = ?
      `,
      [partner.partner_id]
    );

    if (!partnerConfig) {
      throw new Error("Partner configuration not found");
    }

    let requiredFldg = 0;

    if (partnerConfig.fldg_status === 1) {
      const percent = Number(partnerConfig.fldg_percent || 0);
      requiredFldg = Number(((loanAmount * percent) / 100).toFixed(2));
    }

    if (requiredFldg > 0) {
      const fldgCheck = await partnerFldgService.validateFldgAvailability(
        conn,
        partner.partner_id,
        requiredFldg
      );

      if (!fldgCheck.valid) {
        await conn.rollback();

        return res.status(403).json({
          success: false,
          stage: "fldg-check",
          message: `Insufficient FLDG balance for ${partnerName}`,
          available_fldg: fldgCheck.available,
          required_fldg: requiredFldg,
        });
      }
    }

    /* ------------------------ Duplicate PAN Check ------------------------ */

    if (primaryApplicant.pan) {
      const [existingApplicant] = await conn.query(
        `
          SELECT lan, full_name, pan
          FROM fundify_applicants
          WHERE role = 'APPLICANT'
            AND pan = ?
          LIMIT 1
        `,
        [primaryApplicant.pan]
      );

      // if (existingApplicant.length > 0) {
      //   await conn.rollback();

      //   return res.status(409).json({
      //     success: false,
      //     stage: "duplicate-check",
      //     message: `Applicant PAN already exists: ${primaryApplicant.pan}`,
      //     existing_lan: existingApplicant[0].lan,
      //   });
      // }
    }

    /* -------------------------- Generate LAN -------------------------- */

    const ids = await generateLoanIdentifiers("FUNDIFY");

    const lan = ids.lan;

    const partnerLoanId = ids.partnerLoanId;

    if (!lan) {
      throw new Error("LAN generation failed for Fundify");
    }

    /* --------------------------- Insert Loan --------------------------- */

    const loanPayload = buildFundifyLoanPayload({
      loan,
      lan,
      partnerLoanId,
    });

    await insertRow(conn, "loan_booking_fundify", loanPayload);

    /* ------------------------- Insert Applicants ------------------------- */

    for (let i = 0; i < applicants.length; i++) {
      const applicantPayload = buildFundifyApplicantPayload({
        applicant: applicants[i],
        lan,
        index: i,
      });

      await insertRow(conn, "fundify_applicants", applicantPayload);
    }

    /* ----------------------- Update Booked Limit ----------------------- */

    await partnerLimitService.updateBookedLimit(
      conn,
      limitCheck.limitId,
      loanAmount,
      lan
    );

    /* --------------------------- Reserve FLDG --------------------------- */

    if (requiredFldg > 0) {
      await partnerFldgService.reserveFldg(
        conn,
        partner.partner_id,
        lan,
        requiredFldg,
        `Fundify booking reservation | Amount: ${loanAmount}`
      );
    }

    await conn.commit();

    runFundifyPanBureauValidations(lan).catch((err) => {
  console.error("Fundify PAN + Bureau validation failed after booking:", err);
});

    return res.status(201).json({
      success: true,
      message: "Fundify loan created successfully",
      lan,
      partner_loan_id: partnerLoanId,
    });
  } catch (err) {
    if (conn) {
      try {
        await conn.rollback();
      } catch (_) {}
    }

    console.error("Fundify create error:", err);

    return res.status(500).json({
      success: false,
      message: "Failed to create Fundify loan",
      error: err.sqlMessage || err.message,
    });
  } finally {
    if (conn) conn.release();
  }
});

/* -------------------------------------------------------------------------- */
/*                            GET FUNDIFY BY LAN                              */
/* -------------------------------------------------------------------------- */

router.get("/fundify/:lan", async (req, res) => {
  try {
    const { lan } = req.params;

    const [[loan]] = await db.promise().query(
      `
        SELECT *
        FROM loan_booking_fundify
        WHERE lan = ?
      `,
      [lan]
    );

    if (!loan) {
      return res.status(404).json({
        success: false,
        message: "Fundify loan not found",
      });
    }

    const [applicants] = await db.promise().query(
      `
        SELECT *
        FROM fundify_applicants
        WHERE lan = ?
        ORDER BY FIELD(role, 'APPLICANT', 'CO_APPLICANT', 'GUARANTOR'),
                 party_no,
                 id
      `,
      [lan]
    );

    return res.json({
      success: true,
      loan,
      applicants,
    });
  } catch (err) {
    console.error("Fundify fetch error:", err);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch Fundify loan",
      error: err.sqlMessage || err.message,
    });
  }
});

/* -------------------------------------------------------------------------- */
/*                              LIST FUNDIFY LOANS                            */
/* -------------------------------------------------------------------------- */

router.get("/fundify", async (req, res) => {
  try {
    const { status, search, limit = 100, offset = 0 } = req.query;

    const params = [];
    let where = "WHERE 1 = 1";

    if (status) {
      where += " AND l.status = ?";
      params.push(status);
    }

    if (search) {
      where += `
        AND (
          l.lan LIKE ?
          OR l.partner_loan_id LIKE ?
          OR l.business_name LIKE ?
          OR p.full_name LIKE ?
          OR p.mobile LIKE ?
          OR p.pan LIKE ?
        )
      `;

      const searchValue = `%${search}%`;
      params.push(
        searchValue,
        searchValue,
        searchValue,
        searchValue,
        searchValue,
        searchValue
      );
    }

    params.push(Number(limit), Number(offset));

    const [rows] = await db.promise().query(
      `
        SELECT
          l.id,
          l.partner_loan_id,
          l.lan,
          l.login_date,
          l.product,
          l.lender,
          l.status,
          l.stage,
          l.loan_amount,
          l.interest_rate,
          l.loan_tenure,
          l.business_name,
          l.business_pan,
          l.gstin,

          p.full_name AS applicant_name,
          p.mobile AS applicant_mobile,
          p.pan AS applicant_pan

        FROM loan_booking_fundify l

        LEFT JOIN fundify_applicants p
          ON p.lan = l.lan
          AND p.role = 'APPLICANT'

        ${where}

        ORDER BY l.created_at DESC
        LIMIT ?
        OFFSET ?
      `,
      params
    );

    return res.json({
      success: true,
      rows,
    });
  } catch (err) {
    console.error("Fundify list error:", err);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch Fundify loans",
      error: err.sqlMessage || err.message,
    });
  }
});

module.exports = router;