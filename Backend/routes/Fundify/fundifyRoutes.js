const express = require("express");
const db = require("../../config/db");
const axios = require("axios");

const partnerLimitService = require("../../services/partnerLimitService");
const partnerFldgService = require("../../services/partnerFldgService");
const {
  runFundifyPanBureauValidations,
} = require("../../utils/fundifyValidationEngine");
const { initAadhaarKyc } = require("../../services/digitapaadharservice");

const router = express.Router();

const OTP_EXPIRY_SECONDS = 300; // 5 minutes

const generateLoanIdentifiers = async (lender) => {
  lender = lender.trim(); // normalize input
  console.log("Generating loan identifiers for lender:", lender);
  let prefixPartnerLoan;
  let prefixLan;

  prefixLan = "FUNDI1";
  prefixPartnerLoan = "FUNFIN1";

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
  const normalizedRole = String(role || "")
    .trim()
    .toUpperCase();

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
/*                           FETCH ALL FUNDIFY LOANS                          */
/* -------------------------------------------------------------------------- */

router.get("/all-loans", async (req, res) => {
  try {
    const { page = "1", pageSize = "25", search = "" } = req.query;

    const pg = Math.max(1, parseInt(page, 10) || 1);
    const limit = Math.max(1, parseInt(pageSize, 10) || 25);
    const offset = (pg - 1) * limit;

    let searchClause = "";
    const searchParams = [];

    if (search) {
      searchClause = ` AND (lan LIKE ? OR partner_loan_id LIKE ? OR business_name LIKE ? OR business_mobile LIKE ?)`;
      const likeStr = `%${search}%`;
      searchParams.push(likeStr, likeStr, likeStr, likeStr);
    }

    const countQuery = `SELECT COUNT(*) as total FROM loan_booking_fundify WHERE 1=1 ${searchClause}`;
    const [countResult] = await db.promise().query(countQuery, searchParams);
    const total = countResult[0].total;

    const dataQuery = `
      SELECT 
        lan, 
        partner_loan_id, 
        business_name AS customer_name, 
        business_mobile AS mobile_number, 
        loan_amount AS disbursement_amount, 
        status, 
        created_at AS disbursement_date
      FROM loan_booking_fundify 
      WHERE 1=1 ${searchClause}
      ORDER BY id DESC
      LIMIT ? OFFSET ?
    `;

    const [rows] = await db
      .promise()
      .query(dataQuery, [...searchParams, limit, offset]);

    res.json({
      rows,
      pagination: { total },
    });
  } catch (err) {
    console.error("Error fetching fundify all-loans:", err);
    res
      .status(500)
      .json({ message: "Failed to fetch all loans", error: err.message });
  }
});

/* -------------------------------------------------------------------------- */
/*                           UPDATE FUNDIFY LOAN STATUS                       */
/* -------------------------------------------------------------------------- */

router.put("/status/:lan", async (req, res) => {
  try {
    const { lan } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: "Status is required",
      });
    }

    const [result] = await db.promise().query(
      `UPDATE loan_booking_fundify 
       SET status = ?, updated_at = NOW() 
       WHERE lan = ?`,
      [status, lan],
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Loan not found",
      });
    }

    res.json({
      success: true,
      message: "Status updated successfully",
    });
  } catch (err) {
    console.error("Fundify status update error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to update loan status",
      error: err.message,
    });
  }
});

/* -------------------------------------------------------------------------- */
/*                           FETCH FUNDIFY LOAN                               */
/* -------------------------------------------------------------------------- */

router.get("/fundify-manual-entry/:lan", async (req, res) => {
  try {
    const { lan } = req.params;

    const [loanRows] = await db
      .promise()
      .query("SELECT * FROM loan_booking_fundify WHERE lan = ?", [lan]);

    if (loanRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Loan not found",
      });
    }

    const [applicantRows] = await db
      .promise()
      .query("SELECT * FROM fundify_applicants WHERE lan = ?", [lan]);

    res.json({
      success: true,
      data: {
        loan: loanRows[0],
        applicants: applicantRows,
      },
    });
  } catch (err) {
    console.error("Error fetching fundify loan:", err);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: err.message,
    });
  }
});

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
        String(applicant.role || "")
          .trim()
          .toUpperCase() === "APPLICANT",
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

    const isUpdate = !!loan.lan;
    let lan = isUpdate ? loan.lan : null;
    let partnerLoanId = isUpdate ? loan.partner_loan_id : null;
    let limitCheck = null;
    let partner = null;
    let requiredFldg = 0;

    if (!isUpdate) {
      /* ------------------------ Partner Limit Check ------------------------ */

      partner = await partnerLimitService.getOrCreatePartner(conn, partnerName);

      limitCheck = await partnerLimitService.validatePartnerBookingLimit(
        conn,
        partner.partner_id,
        loanAmount,
        month,
        year,
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
        [partner.partner_id],
      );

      if (!partnerConfig) {
        throw new Error("Partner configuration not found");
      }

      if (partnerConfig.fldg_status === 1) {
        const percent = Number(partnerConfig.fldg_percent || 0);
        requiredFldg = Number(((loanAmount * percent) / 100).toFixed(2));
      }

      if (requiredFldg > 0) {
        const fldgCheck = await partnerFldgService.validateFldgAvailability(
          conn,
          partner.partner_id,
          requiredFldg,
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
          [primaryApplicant.pan],
        );
      }

      /* -------------------------- Generate LAN -------------------------- */

      const ids = await generateLoanIdentifiers("FUNDIFY");

      lan = ids.lan;
      partnerLoanId = ids.partnerLoanId;

      if (!lan) {
        throw new Error("LAN generation failed for Fundify");
      }
    }

    /* --------------------------- Save/Update Loan --------------------------- */

    const loanPayload = buildFundifyLoanPayload({
      loan,
      lan,
      partnerLoanId,
    });

    if (isUpdate) {
      // Create an update query
      const columns = Object.keys(loanPayload).filter(
        (key) => key !== "lan" && key !== "partner_loan_id",
      );
      const values = columns.map((key) => loanPayload[key]);

      const setClause = columns.map((col) => `\`${col}\` = ?`).join(", ");
      const updateQuery = `UPDATE loan_booking_fundify SET ${setClause} WHERE lan = ?`;

      await conn.query(updateQuery, [...values, lan]);
    } else {
      await insertRow(conn, "loan_booking_fundify", loanPayload);
    }

    /* ------------------------- Update Applicants ------------------------- */

    if (isUpdate) {
      await conn.query("DELETE FROM fundify_applicants WHERE lan = ?", [lan]);
    }

    for (let i = 0; i < applicants.length; i++) {
      const applicantPayload = buildFundifyApplicantPayload({
        applicant: applicants[i],
        lan,
        index: i,
      });

      await insertRow(conn, "fundify_applicants", applicantPayload);
    }

    if (!isUpdate) {
      /* ----------------------- Update Booked Limit ----------------------- */

      await partnerLimitService.updateBookedLimit(
        conn,
        limitCheck.limitId,
        loanAmount,
        lan,
      );

      /* --------------------------- Reserve FLDG --------------------------- */

      if (requiredFldg > 0) {
        await partnerFldgService.reserveFldg(
          conn,
          partner.partner_id,
          lan,
          requiredFldg,
          `Fundify booking reservation | Amount: ${loanAmount}`,
        );
      }
    }

    await conn.commit();

    runFundifyPanBureauValidations(lan).catch((err) => {
      console.error(
        "Fundify PAN + Bureau validation failed after booking:",
        err,
      );
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
      [lan],
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
      [lan],
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
        searchValue,
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
      params,
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

router.post("/gst/verify", async (req, res) => {
  try {
    const { gstNumber } = req.body;

    const cleanGst = String(gstNumber || "")
      .trim()
      .toUpperCase();

    if (!cleanGst) {
      return res.status(400).json({
        success: false,
        message: "GST number is required",
      });
    }

    if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(cleanGst)) {
      return res.status(400).json({
        success: false,
        message: "Invalid GSTIN format",
      });
    }

    const gstUrl =
      process.env.GST_VERIFY_URL || "https://sandbox.fintreelms.com/gst/verify";

    const gstApiKey = process.env.GST_VERIFY_API_KEY;

    if (!gstApiKey) {
      return res.status(500).json({
        success: false,
        message: "GST API key is not configured",
      });
    }

    const gstRes = await axios.post(
      gstUrl,
      {
        gstNumber: cleanGst,
      },
      {
        headers: {
          accept: "*/*",
          "X-API-Key": gstApiKey,
          "Content-Type": "application/json",
        },
        timeout: 30000,
      },
    );

    const data = gstRes.data?.data || {};
    const result = data.result || {};

    if (!gstRes.data?.success || !result.gstin) {
      return res.status(400).json({
        success: false,
        message:
          result.response_message ||
          gstRes.data?.message ||
          "GST verification failed",
        raw: gstRes.data,
      });
    }

    /* ── If a LAN was provided, persist GST status in kyc_verification_status ── */
    const { lan: gstLan } = req.body;
    if (gstLan) {
      try {
        const rawResponse = JSON.stringify(result);
        await db.promise().query(
          `INSERT INTO kyc_verification_status (lan, applicant_type, gst_number, gst_status, gst_raw_response)
           VALUES (?, 'BUSINESS', ?, 'VERIFIED', ?)
           ON DUPLICATE KEY UPDATE
             gst_number = VALUES(gst_number),
             gst_status = 'VERIFIED',
             gst_raw_response = VALUES(gst_raw_response)`,
          [gstLan, result.gstin || req.body.gstNumber, rawResponse],
        );
      } catch (kycErr) {
        console.warn(
          "kyc_verification_status GST upsert failed (non-fatal):",
          kycErr.message,
        );
      }
    }

    return res.json({
      success: true,
      message: "GST verified successfully",
      data: {
        gstin: result.gstin || cleanGst,
        legal_name: result.legal_name || "",
        trade_name: result.trade_name || "",
        business_constitution: result.business_constitution || "",
        business_nature: Array.isArray(result.business_nature)
          ? result.business_nature.join(", ")
          : result.business_nature || "",
        industry_type: Array.isArray(result.business_details)
          ? result.business_details
              .map((item) => item.sdes)
              .filter(Boolean)
              .join(", ")
          : "",
        registration_date: result.register_date || "",
        status: result.current_registration_status || "",
        taxpayer_type: result.tax_payer_type || "",
        aggregate_turn_over: result.aggregate_turn_over || "",
        aggregate_turn_over_year: result.aggregate_turn_over_year || "",
        email:
          result.contact?.email || result.primary_business_address?.email || "",
        mobile:
          result.contact?.mobile_no ||
          result.primary_business_address?.mobile_no ||
          "",
        address:
          result.primary_business_address?.detailed_address ||
          result.primary_business_address?.registered_address ||
          "",
        raw: result,
      },
    });
  } catch (err) {
    console.error("Fundify GST verify error:", err.response?.data || err);

    return res.status(500).json({
      success: false,
      message:
        err.response?.data?.message ||
        err.response?.data?.error ||
        err.message ||
        "GST verification failed",
    });
  }
});

/* -------------------------------------------------------------------------- */
/*          PROGRESSIVE SAVE — SECTION 0: SAVE BUSINESS DETAILS + CREATE LAN */
/* -------------------------------------------------------------------------- */

router.post("/save-business", async (req, res) => {
  const conn = await db.promise().getConnection();
  try {
    const { loan, loginDate, gstVerified, gstRawResponse } = req.body;

    await conn.beginTransaction();

    const { lan, partnerLoanId } = await generateLoanIdentifiers("Fundify");

    // Create loan_booking_fundify row with business details
    const rawResponse = gstRawResponse ? JSON.stringify(gstRawResponse) : null;
    await conn.query(
      `INSERT INTO loan_booking_fundify
       (lan, partner_loan_id, login_date, status, stage, lender, product, partner_name, bre_status,
        business_name, trade_name, business_pan, gstin, udyam_registration_no, cin, llpin,
        shop_establishment_no, business_registration_no, constitution_type, business_start_date,
        business_vintage_months, nature_of_business, industry_type, business_address, business_city,
        business_district, business_state, business_pincode, premises_ownership, business_mobile,
        business_email, gst_raw_response)
       VALUES (?, ?, ?, 'Login', 'Login', 'Fundify', 'Fundify Loan', 'Fundify', 'Pending',
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        lan,
        partnerLoanId,
        loginDate ||
          (loan && loan.login_date) ||
          new Date().toISOString().split("T")[0],
        emptyToNull(loan?.business_name),
        emptyToNull(loan?.trade_name),
        emptyToNull(loan?.business_pan),
        emptyToNull(loan?.gstin),
        emptyToNull(loan?.udyam_registration_no),
        emptyToNull(loan?.cin),
        emptyToNull(loan?.llpin),
        emptyToNull(loan?.shop_establishment_no),
        emptyToNull(loan?.business_registration_no),
        emptyToNull(loan?.constitution_type),
        dateOrNull(loan?.business_start_date),
        numberOrNull(loan?.business_vintage_months),
        emptyToNull(loan?.nature_of_business),
        emptyToNull(loan?.industry_type),
        emptyToNull(loan?.business_address),
        emptyToNull(loan?.business_city),
        emptyToNull(loan?.business_district),
        emptyToNull(loan?.business_state),
        emptyToNull(loan?.business_pincode),
        emptyToNull(loan?.premises_ownership),
        emptyToNull(loan?.business_mobile),
        emptyToNull(loan?.business_email),
        rawResponse,
      ],
    );

    /* ── Persist GST verification in kyc_verification_status now that LAN exists ── */
    if (gstVerified && loan?.gstin) {
      try {
        const rawResponse = gstRawResponse
          ? JSON.stringify(gstRawResponse)
          : null;
        await conn.query(
          `INSERT INTO kyc_verification_status (lan, applicant_type, gst_number, gst_status, gst_raw_response)
           VALUES (?, 'BUSINESS', ?, 'VERIFIED', ?)
           ON DUPLICATE KEY UPDATE
             gst_number = VALUES(gst_number),
             gst_status = 'VERIFIED',
             gst_raw_response = VALUES(gst_raw_response)`,
          [lan, loan.gstin, rawResponse],
        );
        console.log(`✅ GST verification status stored for LAN: ${lan}`);
      } catch (kycErr) {
        console.warn(
          "kyc_verification_status GST upsert failed (non-fatal):",
          kycErr.message,
        );
      }
    }

    await conn.commit();
    res.json({
      success: true,
      lan,
      partnerLoanId,
      message: "Business details saved successfully",
    });
  } catch (err) {
    await conn.rollback();
    console.error("save-business error:", err);
    res
      .status(500)
      .json({
        success: false,
        message: err.message || "Failed to save business details",
      });
  } finally {
    conn.release();
  }
});

/* -------------------------------------------------------------------------- */
/*          PROGRESSIVE SAVE — SECTION 1: SAVE APPLICANT (LAN exists)        */
/* -------------------------------------------------------------------------- */

router.post("/save-applicant", async (req, res) => {
  const conn = await db.promise().getConnection();
  try {
    const { applicant, lan, loginDate } = req.body;

    if (!lan) {
      return res
        .status(400)
        .json({
          success: false,
          message: "LAN required. Save business details first.",
        });
    }

    await conn.beginTransaction();

    // Upsert primary applicant (INSERT or UPDATE if already saved once)
    const appPayload = buildFundifyApplicantPayload({
      applicant,
      lan,
      index: 0,
    });
    const columns = Object.keys(appPayload);
    const values = Object.values(appPayload);
    const insertSql = `INSERT INTO fundify_applicants (${columns.map((c) => `\`${c}\``).join(", ")}) VALUES (${columns.map(() => "?").join(", ")})
      ON DUPLICATE KEY UPDATE ${columns
        .filter((c) => c !== "lan" && c !== "applicant_type")
        .map((c) => `\`${c}\` = VALUES(\`${c}\`)`)
        .join(", ")}`;
    await conn.query(insertSql, values);

    await conn.commit();
    res.json({ success: true, lan, message: "Applicant saved successfully" });
  } catch (err) {
    await conn.rollback();
    console.error("save-applicant error:", err);
    res
      .status(500)
      .json({
        success: false,
        message: err.message || "Failed to save applicant",
      });
  } finally {
    conn.release();
  }
});

/* -------------------------------------------------------------------------- */
/*           PROGRESSIVE SAVE — SECTIONS 1-3: UPDATE SPECIFIC FIELDS         */
/* -------------------------------------------------------------------------- */

router.post("/update-section", async (req, res) => {
  try {
    const { lan, section, data } = req.body;
    if (!lan)
      return res.status(400).json({ success: false, message: "LAN required" });

    let updateFields = {};

    if (section === "business") {
      updateFields = {
        business_name: emptyToNull(data.business_name),
        trade_name: emptyToNull(data.trade_name),
        business_pan: emptyToNull(data.business_pan),
        gstin: emptyToNull(data.gstin),
        udyam_registration_no: emptyToNull(data.udyam_registration_no),
        cin: emptyToNull(data.cin),
        llpin: emptyToNull(data.llpin),
        shop_establishment_no: emptyToNull(data.shop_establishment_no),
        business_registration_no: emptyToNull(data.business_registration_no),
        constitution_type: emptyToNull(data.constitution_type),
        business_start_date: dateOrNull(data.business_start_date),
        business_vintage_months: numberOrNull(data.business_vintage_months),
        nature_of_business: emptyToNull(data.nature_of_business),
        industry_type: emptyToNull(data.industry_type),
        business_address: emptyToNull(data.business_address),
        business_city: emptyToNull(data.business_city),
        business_district: emptyToNull(data.business_district),
        business_state: emptyToNull(data.business_state),
        business_pincode: emptyToNull(data.business_pincode),
        premises_ownership: emptyToNull(data.premises_ownership),
        business_mobile: emptyToNull(data.business_mobile),
        business_email: emptyToNull(data.business_email),
      };
    } else if (section === "loan") {
      updateFields = {
        loan_amount: numberOrNull(data.loan_amount),
        disbursal_amount: numberOrNull(data.disbursal_amount),
        interest_rate: numberOrNull(data.interest_rate),
        loan_tenure: numberOrNull(data.loan_tenure),
        processing_fee: numberOrNull(data.processing_fee),
        processing_fee_percentage: numberOrNull(data.processing_fee_percentage),
        insurance_amount: numberOrNull(data.insurance_amount),
        other_charges: numberOrNull(data.other_charges),
      };
    } else if (section === "bank") {
      updateFields = {
        bank_name: emptyToNull(data.bank_name),
        name_in_bank: emptyToNull(data.name_in_bank),
        account_number: emptyToNull(data.account_number),
        ifsc: emptyToNull(data.ifsc),
        account_type: emptyToNull(data.account_type),
      };
    } else {
      return res
        .status(400)
        .json({ success: false, message: "Invalid section" });
    }

    const setClause = Object.keys(updateFields)
      .map((k) => `\`${k}\` = ?`)
      .join(", ");
    const vals = [...Object.values(updateFields), lan];

    await db
      .promise()
      .query(
        `UPDATE loan_booking_fundify SET ${setClause}, updated_at = NOW() WHERE lan = ?`,
        vals,
      );

    res.json({ success: true, message: `${section} section saved` });
  } catch (err) {
    console.error("update-section error:", err);
    res
      .status(500)
      .json({
        success: false,
        message: err.message || "Failed to update section",
      });
  }
});

/* -------------------------------------------------------------------------- */
/*         PROGRESSIVE SAVE — SECTIONS 4-5: UPSERT CO-APPLICANT/GUARANTOR   */
/* -------------------------------------------------------------------------- */

router.post("/save-party", async (req, res) => {
  try {
    const { lan, applicant } = req.body;
    if (!lan)
      return res.status(400).json({ success: false, message: "LAN required" });

    const role = normalizeRole(applicant.role);
    const partyNo = applicant.party_no || 1;

    const [existing] = await db
      .promise()
      .query(
        `SELECT id FROM fundify_applicants WHERE lan = ? AND role = ? AND party_no = ? LIMIT 1`,
        [lan, role, partyNo],
      );

    const payload = buildFundifyApplicantPayload({
      applicant,
      lan,
      index: partyNo - 1,
    });

    if (existing.length > 0) {
      const { lan: _l, role: _r, party_no: _p, ...updatePayload } = payload;
      const setClause = Object.keys(updatePayload)
        .map((k) => `\`${k}\` = ?`)
        .join(", ");
      const vals = [...Object.values(updatePayload), lan, role, partyNo];
      await db
        .promise()
        .query(
          `UPDATE fundify_applicants SET ${setClause} WHERE lan = ? AND role = ? AND party_no = ?`,
          vals,
        );
    } else {
      const columns = Object.keys(payload);
      const vals = Object.values(payload);
      const sql = `INSERT INTO fundify_applicants (${columns.map((c) => `\`${c}\``).join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`;
      await db.promise().query(sql, vals);
    }

    res.json({ success: true, message: `${role} party saved` });
  } catch (err) {
    console.error("save-party error:", err);
    res
      .status(500)
      .json({ success: false, message: err.message || "Failed to save party" });
  }
});

/* -------------------------------------------------------------------------- */
/*                         FINAL SUBMIT — MARK LOAN COMPLETE                  */
/* -------------------------------------------------------------------------- */

router.post("/final-submit", async (req, res) => {
  let conn;
  try {
    const { lan } = req.body;
    if (!lan)
      return res.status(400).json({ success: false, message: "LAN required" });

    conn = await db.promise().getConnection();
    await conn.beginTransaction();

    /* ── Fetch the loan row ── */
    const [[loanRow]] = await conn.query(
      `SELECT loan_amount, partner_name, login_date FROM loan_booking_fundify WHERE lan = ?`,
      [lan],
    );

    if (!loanRow) {
      await conn.rollback();
      return res
        .status(404)
        .json({ success: false, message: "Loan not found for LAN: " + lan });
    }

    /* ── Check if limit was already reserved for this LAN (resume case) ── */
    const [[auditRow]] = await conn.query(
      `SELECT id FROM partner_limit_audit WHERE booking_lan = ? LIMIT 1`,
      [lan],
    );
    const alreadyBooked = !!auditRow;

    if (!alreadyBooked) {
      const loanAmount = Number(loanRow.loan_amount || 0);
      const partnerName = loanRow.partner_name || PARTNER_NAME;
      const loginDate = new Date(loanRow.login_date || Date.now());
      const { month, year } = getMonthYear(loginDate);

      /* ── Partner Limit Check ── */
      const partner = await partnerLimitService.getOrCreatePartner(
        conn,
        partnerName,
      );

      const limitCheck = await partnerLimitService.validatePartnerBookingLimit(
        conn,
        partner.partner_id,
        loanAmount,
        month,
        year,
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

      /* ── FLDG Check ── */
      const [[partnerConfig]] = await conn.query(
        `SELECT fldg_percent, fldg_status FROM partner_master WHERE partner_id = ?`,
        [partner.partner_id],
      );

      if (!partnerConfig) throw new Error("Partner configuration not found");

      let requiredFldg = 0;
      if (partnerConfig.fldg_status === 1) {
        const percent = Number(partnerConfig.fldg_percent || 0);
        requiredFldg = Number(((loanAmount * percent) / 100).toFixed(2));
      }

      if (requiredFldg > 0) {
        const fldgCheck = await partnerFldgService.validateFldgAvailability(
          conn,
          partner.partner_id,
          requiredFldg,
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

      /* ── Update Booked Limit ── */
      await partnerLimitService.updateBookedLimit(
        conn,
        limitCheck.limitId,
        loanAmount,
        lan,
      );

      /* ── Reserve FLDG ── */
      if (requiredFldg > 0) {
        await partnerFldgService.reserveFldg(
          conn,
          partner.partner_id,
          lan,
          requiredFldg,
          `Fundify booking reservation | Amount: ${loanAmount}`,
        );
      }
    } else {
      console.log(
        `ℹ️ Fundify final-submit: LAN ${lan} already has limit reserved — skipping limit/FLDG checks (resume flow)`,
      );
    }

    /* ── Mark loan as Login ── */
    const [result] = await conn.query(
      `UPDATE loan_booking_fundify SET status = 'Login', stage = 'Login', updated_at = NOW() WHERE lan = ?`,
      [lan],
    );

    if (result.affectedRows === 0) {
      await conn.rollback();
      return res
        .status(404)
        .json({ success: false, message: "Loan not found for LAN: " + lan });
    }

    await conn.commit();

    /* ── Fire BRE (PAN + Bureau validation) async — does NOT block response ── */
    runFundifyPanBureauValidations(lan).catch((err) => {
      console.error(
        "Fundify BRE (PAN + Bureau) failed after final-submit for LAN:",
        lan,
        err,
      );
    });

    res.json({
      success: true,
      lan,
      message: "Fundify loan submitted successfully",
    });
  } catch (err) {
    if (conn) {
      try {
        await conn.rollback();
      } catch (_) {}
    }
    console.error("final-submit error:", err);
    res
      .status(500)
      .json({
        success: false,
        message: err.message || "Failed to submit loan",
      });
  } finally {
    if (conn) conn.release();
  }
});

/* -------------------------------------------------------------------------- */
/*                        SEND OTP (MOBILE VERIFICATION)                      */
/* -------------------------------------------------------------------------- */

router.post("/send-otp", async (req, res) => {
  try {
    const { mobile, applicantType } = req.body;

    if (!mobile)
      return res
        .status(400)
        .json({ success: false, message: "Mobile required" });
    if (!applicantType)
      return res
        .status(400)
        .json({ success: false, message: "Applicant type required" });

    const cleanedMobile = String(mobile).replace(/\D/g, "");

    // Check if OTP was sent within last 60 seconds
    const [existing] = await db
      .promise()
      .query(
        `SELECT * FROM otp_consent_model WHERE mobile_number = ? AND applicant_type = ? ORDER BY id DESC LIMIT 1`,
        [cleanedMobile, applicantType],
      );

    if (existing.length) {
      const diffSeconds =
        (Date.now() - new Date(existing[0].last_sent_at).getTime()) / 1000;
      if (diffSeconds < 60) {
        return res
          .status(429)
          .json({
            success: false,
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
      DLTTemplateId: process.env.MOBILE_OTP_TEMPLATE_ID,
      PEID: process.env.DLT_PEID,
    };

    await axios.get(process.env.ALOT_API_URL, { params: smsParams });

    await db
      .promise()
      .query(
        `INSERT INTO otp_consent_model (mobile_number, applicant_type, otp, expires_at, last_sent_at, verified) VALUES (?, ?, ?, ?, NOW(), 0)`,
        [cleanedMobile, applicantType, otp, expiresAt],
      );

    return res.json({ success: true, message: "OTP sent successfully" });
  } catch (err) {
    console.error("Fundify send-otp error:", err.message);
    return res.status(500).json({ success: false, message: "OTP send failed" });
  }
});

/* -------------------------------------------------------------------------- */
/*                        VERIFY OTP (MOBILE VERIFICATION)                    */
/* -------------------------------------------------------------------------- */

router.post("/verify-otp", async (req, res) => {
  try {
    const { mobile, otp, consentText, applicantType } = req.body;

    // Clean mobile the same way send-otp does — digits only
    const cleanedMobile = String(mobile || "").replace(/\D/g, "");

    console.log("verify-otp →", { cleanedMobile, applicantType, otp });

    const [rows] = await db
      .promise()
      .query(
        `SELECT * FROM otp_consent_model WHERE mobile_number = ? AND applicant_type = ? AND verified = 0 ORDER BY id DESC LIMIT 1`,
        [cleanedMobile, applicantType],
      );

    if (!rows.length)
      return res
        .status(400)
        .json({ success: false, message: "OTP not found. Please resend OTP." });

    const session = rows[0];

    console.log("DB OTP:", session.otp, "| Entered OTP:", otp);

    if (String(session.otp).trim() !== String(otp).trim()) {
      return res.status(400).json({ success: false, message: "Invalid OTP" });
    }

    if (new Date() > new Date(session.expires_at)) {
      return res.status(400).json({ success: false, message: "OTP expired" });
    }

    await db
      .promise()
      .query(
        `UPDATE otp_consent_model SET verified = 1, consent_given = 1, consent_text = ?, consent_at = NOW() WHERE id = ?`,
        [consentText, session.id],
      );

    return res.json({ success: true, message: "OTP verified successfully" });
  } catch (err) {
    console.error("Fundify verify-otp error:", err.message);
    return res
      .status(500)
      .json({ success: false, message: "OTP verification failed" });
  }
});

/* ============================================================ */
/*                  AADHAAR KYC ROUTES                          */
/* ============================================================ */

/**
 * POST /fundify/init-aadhaar
 * Initiates Aadhaar e-KYC for a given applicant type on a Fundify LAN.
 * Reads applicant details from fundify_applicants, creates a kyc_verification_status
 * row, calls the Helium/Digilocker KYC API, and stores the returned URL + IDs.
 */
router.post("/init-aadhaar", async (req, res) => {
  try {
    const { lan, applicantType } = req.body;

    if (!lan)
      return res.status(400).json({ success: false, message: "LAN required" });
    if (!["BORROWER", "CO_APPLICANT", "GUARANTOR"].includes(applicantType))
      return res
        .status(400)
        .json({ success: false, message: "Invalid applicant type" });

    /* ── Fetch applicant from fundify_applicants ── */
    const [[applicantRow]] = await db.promise().query(
      `SELECT full_name, first_name, last_name, mobile, email, applicant_type
       FROM fundify_applicants
       WHERE lan = ? AND applicant_type = ?
       LIMIT 1`,
      [lan, applicantType],
    );

    if (!applicantRow)
      return res
        .status(404)
        .json({
          success: false,
          message: `${applicantType} not found for LAN ${lan}`,
        });

    const name =
      applicantRow.full_name ||
      `${applicantRow.first_name || ""} ${applicantRow.last_name || ""}`.trim();
    const mobile = applicantRow.mobile;
    const email = applicantRow.email || "";

    if (!mobile || !name)
      return res
        .status(400)
        .json({
          success: false,
          message: `${applicantType} mobile/name not saved`,
        });

    /* ── Upsert kyc_verification_status row ── */
    await db.promise().query(
      `INSERT IGNORE INTO kyc_verification_status (lan, applicant_type, applicant_name, mobile_number)
       VALUES (?, ?, ?, ?)`,
      [lan, applicantType, name, mobile],
    );
    await db.promise().query(
      `UPDATE kyc_verification_status SET aadhaar_status = 'INITIATED'
       WHERE lan = ? AND applicant_type = ?`,
      [lan, applicantType],
    );

    /* ── Call Aadhaar KYC API ── */
    const aadhaarInit = await initAadhaarKyc(lan, mobile, email, name);

    if (!aadhaarInit.success) {
      await db.promise().query(
        `UPDATE kyc_verification_status SET aadhaar_status = 'FAILED'
         WHERE lan = ? AND applicant_type = ?`,
        [lan, applicantType],
      );
      return res
        .status(400)
        .json({ success: false, message: "Aadhaar init failed" });
    }

    /* ── Store transaction details ── */
    await db.promise().query(
      `UPDATE kyc_verification_status
       SET aadhaar_transaction_id = ?, aadhaar_kyc_url = ?, aadhaar_unique_id = ?
       WHERE lan = ? AND applicant_type = ?`,
      [
        aadhaarInit.unifiedTransactionId,
        aadhaarInit.kycUrl,
        aadhaarInit.uniqueId,
        lan,
        applicantType,
      ],
    );

    return res.json({
      success: true,
      message: "Aadhaar initiated",
      kycUrl: aadhaarInit.kycUrl,
      transactionId: aadhaarInit.unifiedTransactionId,
      uniqueId: aadhaarInit.uniqueId,
    });
  } catch (err) {
    console.error("Fundify init-aadhaar error:", err);
    return res
      .status(500)
      .json({
        success: false,
        message: "Aadhaar init failed",
        error: err.message,
      });
  }
});

/**
 * GET /fundify/aadhaar-address/:lan/:applicantType
 * Returns the Aadhaar-verified address for an applicant once status = VERIFIED.
 */
router.get("/aadhaar-address/:lan/:applicantType", async (req, res) => {
  try {
    const { lan, applicantType } = req.params;

    if (!lan)
      return res.status(400).json({ success: false, message: "LAN required" });
    if (!["BORROWER", "CO_APPLICANT", "GUARANTOR"].includes(applicantType))
      return res
        .status(400)
        .json({ success: false, message: "Invalid applicant type" });

    const [[row]] = await db.promise().query(
      `SELECT aadhaar_status, aadhaar_name, aadhaar_dob, aadhaar_masked_number, aadhaar_address
       FROM kyc_verification_status
       WHERE lan = ? AND applicant_type = ?
       LIMIT 1`,
      [lan, applicantType],
    );

    if (!row)
      return res
        .status(404)
        .json({ success: false, message: "Aadhaar KYC record not found" });

    if (row.aadhaar_status !== "VERIFIED")
      return res.json({
        success: false,
        status: row.aadhaar_status,
        message: "Aadhaar is not verified yet",
      });

    if (!row.aadhaar_address)
      return res.json({
        success: false,
        status: row.aadhaar_status,
        message: "Aadhaar address not available",
      });

    return res.json({
      success: true,
      status: row.aadhaar_status,
      aadhaarName: row.aadhaar_name,
      aadhaarDob: row.aadhaar_dob,
      aadhaarMaskedNumber: row.aadhaar_masked_number,
      aadhaarAddress: row.aadhaar_address,
    });
  } catch (err) {
    console.error("Fundify aadhaar-address error:", err);
    return res
      .status(500)
      .json({
        success: false,
        message: "Failed to fetch Aadhaar address",
        error: err.message,
      });
  }
});

module.exports = router;
