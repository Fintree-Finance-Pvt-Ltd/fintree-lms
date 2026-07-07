const express = require("express");
const db = require("../../config/db");
const verifyApiKey = require("../../middleware/apiKeyAuth");
const { STERLION_REQUIRED_FIELDS } = require("../../utils/constant");
const { runBureau } = require("../../services/Bueraupullapiservice");
const { runSterlionBre } = require("../../utils/sterlionBRE");

const router = express.Router();

const getMissingFields = (data, requiredFields) =>
  requiredFields.filter((field) => {
    const value = data[field];
    return (
      value === undefined ||
      value === null ||
      (typeof value === "string" && value.trim() === "")
    );
  });

const nullableString = (value) => {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed === "" ? null : trimmed;
};

const isSterlionPartner = (req) =>
  (req.partner?.name || "").toLowerCase().trim() === "sterlion";

const isProvided = (value) =>
  value !== undefined && value !== null && String(value).trim() !== "";

const round2 = (value) =>
  Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const parseNonNegativeNumber = (value, fieldName) => {
  if (!isProvided(value)) return null;

  const num = Number(value);

  if (!Number.isFinite(num) || num < 0) {
    throw new Error(`Invalid ${fieldName}`);
  }

  return num;
};

const calculateAmountPercentagePair = ({
  baseAmount,
  amountValue,
  percentageValue,
  amountField,
  percentageField,
}) => {
  const amount = parseNonNegativeNumber(amountValue, amountField);
  const percentage = parseNonNegativeNumber(percentageValue, percentageField);

  if (amount !== null && percentage !== null) {
    const expectedAmount = round2((baseAmount * percentage) / 100);
    const givenAmount = round2(amount);

    if (Math.abs(expectedAmount - givenAmount) > 0.01) {
      throw new Error(
        `${amountField} does not match ${percentageField}. Expected ${expectedAmount}`,
      );
    }

    return {
      amount: givenAmount,
      percentage: round2(percentage),
    };
  }

  if (percentage !== null) {
    return {
      percentage: round2(percentage),
      amount: round2((baseAmount * percentage) / 100),
    };
  }

  if (amount !== null) {
    return {
      amount: round2(amount),
      percentage: round2((amount / baseAmount) * 100),
    };
  }

  return {
    amount: 0,
    percentage: 0,
  };
};

const generateSterlionLoanIdentifiers = async () => {
  const lender = "sterlion";
  const prefixPartnerLoan = "STRL";
  const prefixLan = "STRL";

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

const fetchSterlionCaseStatus = async ({ lan, partnerLoanId }) => {
  const whereClause = lan ? "lan = ?" : "partner_loan_id = ?";
  const value = lan || partnerLoanId;

  const [rows] = await db.promise().query(
    `SELECT
       lan,
       partner_loan_id,
       customer_name,
       business_name,
       status,
       stage,
       request_amount,
       loan_amount,
       sterlion_bre_status,
       sterlion_bre_reason,
       cibil_score_fintree,
       estimated_emi,
       foir_percentage
     FROM loan_booking_sterlion
     WHERE ${whereClause}
     LIMIT 1`,
    [value],
  );

  return rows[0] || null;
};

const buildSterlionStatusResponse = (row) => {
  const parsedCreditLimit = Number(row.loan_amount);
  const creditLimit =
    row.loan_amount === null ||
    row.loan_amount === undefined ||
    row.loan_amount === "" ||
    !Number.isFinite(parsedCreditLimit)
      ? null
      : parsedCreditLimit;

  return {
    lan: row.lan,
    partner_loan_id: row.partner_loan_id,
    customer_name: row.customer_name,
    business_name: row.business_name,
    status: row.status,
    stage: row.stage,
    request_amount: row.request_amount,
    loan_amount: creditLimit,
    credit_limit: creditLimit,
    limit_available: creditLimit !== null,
    bre_status: row.sterlion_bre_status,
    bre_reason: row.sterlion_bre_reason,
    cibil_score: row.cibil_score_fintree,
    estimated_emi: row.estimated_emi,
    foir_percentage: row.foir_percentage,
  };
};

const persistSterlionBureauAndBre = async (lan, data) => {
  let bureauResult = {
    success: false,
    score: null,
    response: null,
  };

  try {
    bureauResult = await runBureau(data);
    const score = bureauResult.score ?? null;
    const report = bureauResult.response ?? null;

    if (report) {
      await db.promise().query(
        `INSERT INTO loan_cibil_reports (lan, pan_number, score, report_xml, created_at)
         VALUES (?, ?, ?, ?, NOW())`,
        [lan, data.pan_number, score, report],
      );
    }

    if (score !== null) {
      await db
        .promise()
        .execute(
          "UPDATE loan_booking_sterlion SET cibil_score_fintree = ? WHERE lan = ?",
          [score, lan],
        );
    }

    try {
      await db
        .promise()
        .query("INSERT IGNORE INTO kyc_verification_status (lan) VALUES (?)", [
          lan,
        ]);

      await db.promise().query(
        `UPDATE kyc_verification_status
         SET bureau_status = ?, bureau_api_response = ?
         WHERE lan = ?`,
        [bureauResult.success ? "VERIFIED" : "FAILED", report, lan],
      );
    } catch (kycErr) {
      console.error(
        "Sterlion KYC bureau status update failed:",
        kycErr.message,
      );
    }
  } catch (err) {
    console.error("Sterlion bureau hard pull failed:", err.message);

    try {
      await db
        .promise()
        .query("INSERT IGNORE INTO kyc_verification_status (lan) VALUES (?)", [
          lan,
        ]);
      await db.promise().query(
        `UPDATE kyc_verification_status
         SET bureau_status = 'FAILED', bureau_api_response = ?
         WHERE lan = ?`,
        [err.message, lan],
      );
    } catch (kycErr) {
      console.error(
        "Sterlion failed bureau status update failed:",
        kycErr.message,
      );
    }
  }

  let breResult = null;

  try {
    breResult = await runSterlionBre(lan, bureauResult.score ?? null);
  } catch (breErr) {
    console.error("Sterlion BRE failed:", breErr.message);
  }

  return {
    bureauResult,
    breResult,
  };
};

router.get("/v1/sterlion-case-status", verifyApiKey, async (req, res) => {
  try {
    if (!isSterlionPartner(req)) {
      return res
        .status(403)
        .json({ message: "This route is only for Sterlion partner." });
    }

    const lan = String(req.query.lan || "").trim();
    const partnerLoanId = String(req.query.partner_loan_id || "").trim();

    if (!lan && !partnerLoanId) {
      return res.status(400).json({
        message: "lan or partner_loan_id is required.",
      });
    }

    const row = await fetchSterlionCaseStatus({
      lan: lan || null,
      partnerLoanId: partnerLoanId || null,
    });

    if (!row) {
      return res.status(404).json({ message: "Sterlion case not found." });
    }

    return res.status(200).json({
      message: "Sterlion case status fetched successfully.",
      data: buildSterlionStatusResponse(row),
    });
  } catch (error) {
    console.error("Sterlion case status fetch error:", error);

    return res.status(500).json({
      message: "Failed to fetch Sterlion case status.",
      error: error.sqlMessage || error.message,
    });
  }
});

router.post("/v1/sterlion-lb", verifyApiKey, async (req, res) => {
  let conn;

  try {
    const data = req.body || {};

    if (!isSterlionPartner(req)) {
      return res.status(403).json({
        message: "This route is only for Sterlion partner.",
      });
    }

    const missing = getMissingFields(data, STERLION_REQUIRED_FIELDS);
    const currentVillageCity = nullableString(
      data.current_village_city || data.current_city,
    );
    const businessCity = nullableString(
      data.business_city || data.business_village_city,
    );

    if (!currentVillageCity) {
      missing.push("current_city");
    }

    if (!businessCity) {
      missing.push("business_city");
    }

    if (missing.length) {
      return res.status(400).json({
        message: `Missing fields: ${missing.join(", ")}`,
      });
    }

    const rawRequestAmount = isProvided(data.request_amount)
      ? data.request_amount
      : data.loan_amount;
    const requestAmount = Number(rawRequestAmount);

    if (!Number.isFinite(requestAmount) || requestAmount <= 0) {
      return res.status(400).json({
        message: "Invalid request_amount",
      });
    }

    const loanTenure = Number(data.loan_tenure);
    if (!Number.isInteger(loanTenure) || loanTenure <= 0) {
      return res.status(400).json({
        message: "Invalid loan_tenure",
      });
    }

    const annualIncome = Number(data.annual_income);
    if (!Number.isFinite(annualIncome) || annualIncome <= 0) {
      return res.status(400).json({
        message: "Invalid annual_income",
      });
    }

    const businessVintageMonths = Number(data.business_vintage_months);
    if (!Number.isFinite(businessVintageMonths) || businessVintageMonths < 0) {
      return res.status(400).json({
        message: "Invalid business_vintage_months",
      });
    }

    const monthlyIncome = isProvided(data.monthly_income)
      ? Number(data.monthly_income)
      : round2(annualIncome / 12);

    if (!Number.isFinite(monthlyIncome) || monthlyIncome <= 0) {
      return res.status(400).json({
        message: "Invalid monthly_income",
      });
    }

    const monthlyObligation = isProvided(data.monthly_obligation)
      ? Number(data.monthly_obligation)
      : 0;

    if (!Number.isFinite(monthlyObligation) || monthlyObligation < 0) {
      return res.status(400).json({
        message: "Invalid monthly_obligation",
      });
    }

    const interestRate = isProvided(data.interest_rate)
      ? Number(data.interest_rate)
      : 24;

    if (!Number.isFinite(interestRate) || interestRate < 0) {
      return res.status(400).json({
        message: "Invalid interest_rate",
      });
    }

    const businessTurnover = isProvided(data.business_turnover)
      ? Number(data.business_turnover)
      : null;

    if (
      businessTurnover !== null &&
      (!Number.isFinite(businessTurnover) || businessTurnover < 0)
    ) {
      return res.status(400).json({
        message: "Invalid business_turnover",
      });
    }

    let processingFee;

    try {
      processingFee = calculateAmountPercentagePair({
        baseAmount: requestAmount,
        amountValue: data.processing_fee,
        percentageValue: data.processing_fee_percentage,
        amountField: "processing_fee",
        percentageField: "processing_fee_percentage",
      });
    } catch (calculationError) {
      return res.status(400).json({
        status: "Failed",
        message: calculationError.message,
      });
    }

    const netDisbursement = round2(requestAmount - processingFee.amount);

    if (netDisbursement < 0) {
      return res.status(400).json({
        status: "Failed",
        message:
          "Invalid net_disbursement. Processing fee cannot exceed request amount.",
      });
    }

    conn = await db.promise().getConnection();
    await conn.beginTransaction();

    const [existing] = await conn.query(
      `SELECT lan, partner_loan_id, customer_name
       FROM loan_booking_sterlion
       WHERE partner_loan_id = ?`,
      [data.partner_loan_id],
    );

    if (existing.length > 0) {
      await conn.rollback();
      conn.release();
      conn = null;

      return res.status(400).json({
        status: "Failed",
        message: "Duplicate Partner Loan ID",
        existingLan: existing[0].lan,
      });
    }

    const [panRecords] = await conn.query(
      `SELECT status
       FROM loan_booking_sterlion
       WHERE pan_number = ?`,
      [data.pan_number],
    );

    const allowedStatuses = new Set([
      "cancelled",
      "foreclosed",
      "fully paid",
      "rejected",
    ]);

    if (
      panRecords.some(
        (row) =>
          !allowedStatuses.has(
            String(row.status || "")
              .trim()
              .toLowerCase(),
          ),
      )
    ) {
      await conn.rollback();
      conn.release();
      conn = null;

      return res.status(400).json({
        status: "Failed",
        message:
          "PAN already exists with an active loan. New loan not allowed.",
      });
    }

    const { lan } = await generateSterlionLoanIdentifiers();
    const customer_name = `${data.first_name || ""} ${data.middle_name || ""} ${
      data.last_name || ""
    }`
      .replace(/\s+/g, " ")
      .trim();
    const product = nullableString(data.loan_type) || "Unsecured Business Loan";
    const agreement_date = data.login_date;

    const fields = {
      lan,
      partner_loan_id: data.partner_loan_id,
      login_date: data.login_date,

      first_name: data.first_name,
      middle_name: nullableString(data.middle_name),
      last_name: data.last_name,
      customer_name,

      gender: nullableString(data.gender),
      dob: data.dob,
      age: data.age || null,
      father_name: nullableString(data.father_name),
      mother_name: nullableString(data.mother_name),

      mobile_number: data.mobile_number,
      alternate_mobile_number: nullableString(data.alternate_mobile_number),
      email_id: nullableString(data.email_id),

      pan_number: data.pan_number,
      aadhar_number: nullableString(data.aadhar_number),

      current_address: data.current_address,
      current_village_city: currentVillageCity,
      current_district: nullableString(data.current_district),
      current_state: data.current_state,
      current_pincode: data.current_pincode,

      permanent_address: data.permanent_address || data.current_address,
      permanent_village_city: data.permanent_village_city || currentVillageCity,
      permanent_district:
        data.permanent_district || nullableString(data.current_district),
      permanent_state: data.permanent_state || data.current_state,
      permanent_pincode: data.permanent_pincode || data.current_pincode,

      business_name: data.business_name,
      trade_name: nullableString(data.trade_name),
      business_type: data.business_type,
      business_vintage_months: businessVintageMonths,
      business_address: data.business_address,
      business_city: businessCity,
      business_district: nullableString(data.business_district),
      business_state: data.business_state,
      business_pincode: data.business_pincode,
      gst_number: nullableString(data.gst_number),
      udyam_registration_no: nullableString(data.udyam_registration_no),
      cin: nullableString(data.cin),

      request_amount: requestAmount,
      loan_amount: null,
      interest_rate: interestRate,
      processing_fee_percentage: processingFee.percentage,
      processing_fee: processingFee.amount,
      loan_tenure: loanTenure,
      emi_amount: null,
      estimated_emi: null,

      annual_income: annualIncome,
      monthly_income: monthlyIncome,
      monthly_obligation: monthlyObligation,
      business_turnover: businessTurnover,
      foir_percentage: null,

      bank_name: nullableString(data.bank_name),
      branch_name: nullableString(data.branch_name),
      ifsc_code: nullableString(data.ifsc_code),
      account_holder_name: nullableString(data.account_holder_name),
      account_number: nullableString(data.account_number),

      product,
      lender: "STERLION",
      net_disbursement: netDisbursement,

      sterlion_bre_status: "Pending",
      sterlion_bre_reason: null,
      sterlion_bre_checked_at: null,

      status: "Login",
      stage: "Lead Received",
      agreement_date,
    };

    const columns = Object.keys(fields).join(", ");
    const placeholders = Object.keys(fields)
      .map(() => "?")
      .join(", ");
    const values = Object.values(fields);

    await conn.query(
      `INSERT INTO loan_booking_sterlion (${columns}) VALUES (${placeholders})`,
      values,
    );

    await conn.commit();
    conn.release();
    conn = null;

    const { bureauResult, breResult } = await persistSterlionBureauAndBre(lan, {
      ...data,
      current_village_city: currentVillageCity,
      current_state: data.current_state,
      current_pincode: data.current_pincode,
      loan_amount: requestAmount,
      request_amount: requestAmount,
      loan_tenure: loanTenure,
      annual_income: annualIncome,
      monthly_income: monthlyIncome,
      monthly_obligation: monthlyObligation,
      business_vintage_months: businessVintageMonths,
      processing_fee_percentage: processingFee.percentage,
      processing_fee: processingFee.amount,
      net_disbursement: netDisbursement,
    });

    return res.status(201).json({
      message: "STERLION loan lead saved successfully.",
      lan,
      partner_loan_id: data.partner_loan_id,
      request_amount: requestAmount,
      loan_amount: null,
      processing_fee_percentage: processingFee.percentage,
      processing_fee: processingFee.amount,
      net_disbursement: netDisbursement,
      cibilScore: bureauResult.score || "Not Found",
      bureauStatus: bureauResult.success ? "VERIFIED" : "FAILED",
      breStatus: breResult?.breStatus || "Pending",
      breReason: breResult?.reasonText || null,
      stage: breResult?.stage || "BRE Pending",
    });
  } catch (error) {
    if (conn) {
      await conn.rollback();
      conn.release();
    }

    console.error("Sterlion onboarding error:", error);

    return res.status(error.statusCode || 500).json({
      message: "Upload failed. Please try again.",
      error: error.sqlMessage || error.message,
    });
  }
});

module.exports = router;
