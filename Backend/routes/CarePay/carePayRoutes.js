const express = require("express");
const db = require("../../config/db");
const verifyApiKey = require("../../middleware/apiKeyAuth");
const partnerLimitService = require("../../services/partnerLimitService");
const { getMonthYear } = require("../../utils/partnerHelpers");
const {
  CAREPAY_REQUIRED_FIELDS,
  CarepayLoanTypes,
} = require("../../utils/constant");
const { runBureau } = require("../../services/Bueraupullapiservice");
const createHospitalRoutes = require("./hospitalRoutes");
const createCarePayEsignRoutes = require("./esignRoutes");
const {
  evaluateCarePayLoginBre,
  buildBreSnapshot,
} = require("./carePayBreEngine");
const { approveAndInitiatePayout } = require("../../services/payout.service");
const { XMLParser } = require("fast-xml-parser");
const router = express.Router();
const loanBookingRouter = express.Router();
const {
  checkAndApproveCarePayLoan,
} = require("../documents");

const generateLoanIdentifiers = async (lender) => {
  lender = lender.trim(); // normalize input
  console.log("Generating loan identifiers for lender:", lender);
  let prefixPartnerLoan;
  let prefixLan;

  if (lender === "carepay") {
    prefixLan = "CARE";
  } else if (lender === "carepay-hospital") {
    prefixPartnerLoan = "CAREHOS";
    prefixLan = "CAREHOS";
  } else {
    throw new Error("Invalid lender type.");
  }

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
    partnerLoanId: String(prefixPartnerLoan) + newSequence,
    lan: String(prefixLan) + newSequence,
  };
};

function getMissingFields(data, requiredFields) {
  return requiredFields.filter((field) => {
    const value = data[field];
    return (
      value === undefined ||
      value === null ||
      (typeof value === "string" && value.trim() === "")
    );
  });
}

function nullableString(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed === "" ? null : trimmed;
}

function safeParseJson(value) {
  if (!value) return null;
  if (typeof value !== "string") return value;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function isCarePayPartner(req) {
  return (req.partner?.name || "").toLowerCase().trim() === "carepay";
}

loanBookingRouter.use(
  createHospitalRoutes({
    generateLoanIdentifiers,
    getMissingFields,
    nullableString,
    isCarePayPartner,
  }),
);

loanBookingRouter.use(createCarePayEsignRoutes());

async function fetchCarePayOpsCheckerLoan(lan) {
  const [[row]] = await db.promise().query(
    `SELECT lan, partner_loan_id, status
     FROM loan_booking_carepay
     WHERE lan = ?
     LIMIT 1`,
    [lan],
  );

  return row || null;
}

async function getCarePayOpsCheckerColumns() {
  const [rows] = await db.promise().query(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'loan_booking_carepay'
       AND COLUMN_NAME IN ('ops_checker_id', 'ops_checker_name')`,
  );

  return new Set(rows.map((row) => row.COLUMN_NAME));
}

async function updateCarePayOpsCheckerStatus({
  lan,
  status,
  opsCheckerId = null,
  opsCheckerName = null,
}) {
  const fields = ["status = ?"];
  const params = [status];
  const columns = await getCarePayOpsCheckerColumns();

  if (columns.has("ops_checker_id")) {
    fields.push("ops_checker_id = ?");
    params.push(opsCheckerId || null);
  }

  if (columns.has("ops_checker_name")) {
    fields.push("ops_checker_name = ?");
    params.push(opsCheckerName || null);
  }

  const [result] = await db.promise().query(
    `UPDATE loan_booking_carepay
     SET ${fields.join(", ")}
     WHERE lan = ?`,
    [...params, lan],
  );

  return result;
}

async function fetchCarePayOpsL2DisburseInitiateLoans(req, res) {
  try {
    const [rows] = await db.promise().query(
      `SELECT *
       FROM loan_booking_carepay
       WHERE LOWER(status) = 'disburse initiate'
       ORDER BY LAN DESC`,
    );

    return res.json({ data: rows });
  } catch (err) {
    console.error("CarePay ops L2 disburse-initiate loans fetch error:", err);

    return res.status(500).json({
      status: "FAILED",
      message: "Unable to fetch CarePay disburse initiated loans",
    });
  }
}

loanBookingRouter.get(
  "/v1/carepay-ops-l2-disburse-initiate-loans",
  fetchCarePayOpsL2DisburseInitiateLoans,
);

loanBookingRouter.get(
  "/v1/carepay-ops-maker-approved-loans",
  fetchCarePayOpsL2DisburseInitiateLoans,
);

loanBookingRouter.put("/v1/carepay-ops-l1-status/:lan", async (req, res) => {
  const { lan } = req.params;
  const { ops_checker_id, ops_checker_name, status } = req.body || {};
  const requestedStatus = String(status || "").trim();
  const normalizedStatus = requestedStatus.toLowerCase();

  if (!["disburse initiate", "rejected"].includes(normalizedStatus)) {
    return res.status(400).json({
      status: "FAILED",
      message: "Invalid CarePay Ops L1 status",
    });
  }

  try {
    const loan = await fetchCarePayOpsCheckerLoan(lan);

    if (!loan) {
      return res.status(404).json({
        status: "FAILED",
        message: "CarePay loan not found",
      });
    }

    if (String(loan.status || "").toLowerCase() !== "approved") {
      return res.status(409).json({
        status: "FAILED",
        message: "Only Approved CarePay loans can be handled by Ops L1",
      });
    }

    const finalStatus =
      normalizedStatus === "disburse initiate"
        ? "Disburse initiate"
        : "rejected";

    const result = await updateCarePayOpsCheckerStatus({
      lan,
      status: finalStatus,
      opsCheckerId: ops_checker_id,
      opsCheckerName: ops_checker_name,
    });

    if (result.affectedRows === 0) {
      return res.status(404).json({
        status: "FAILED",
        message: "CarePay loan not found",
      });
    }

    return res.json({
      status: "SUCCESS",
      lan,
      final_status: finalStatus,
      message:
        finalStatus === "Disburse initiate"
          ? "Loan moved to disburse initiate successfully"
          : "Loan rejected successfully",
    });
  } catch (err) {
    console.error("CarePay ops L1 status update error:", err);

    return res.status(500).json({
      status: "FAILED",
      message: err.message || "Failed to update CarePay Ops L1 status",
      error: err.sqlMessage || err.message,
    });
  }
});

loanBookingRouter.put(
  "/v1/carepay-ops-checker-approved-loan/:lan",
  async (req, res) => {
    const { lan } = req.params;
    const { ops_checker_id, ops_checker_name, status } = req.body || {};
    const requestedStatus = String(status || "").trim();

    try {
      const loan = await fetchCarePayOpsCheckerLoan(lan);

      if (!loan) {
        return res.status(404).json({
          status: "FAILED",
          message: "CarePay loan not found",
        });
      }

      if (String(loan.status || "").toLowerCase() !== "disburse initiate") {
        return res.status(409).json({
          status: "FAILED",
          message:
            "Only disburse initiated CarePay loans can be handled by Ops L2",
        });
      }

      if (requestedStatus === "OPS_REJECTED") {
        const result = await updateCarePayOpsCheckerStatus({
          lan,
          status: "OPS_REJECTED",
          opsCheckerId: ops_checker_id,
          opsCheckerName: ops_checker_name,
        });

        if (result.affectedRows === 0) {
          return res.status(404).json({
            status: "FAILED",
            message: "CarePay loan not found",
          });
        }

        return res.json({
          status: "SUCCESS",
          message: "Loan rejected by operations checker successfully",
        });
      }

      if (ops_checker_id || ops_checker_name) {
        const result = await updateCarePayOpsCheckerStatus({
          lan,
          status: "Disburse initiate",
          opsCheckerId: ops_checker_id,
          opsCheckerName: ops_checker_name,
        });

        if (result.affectedRows === 0) {
          return res.status(404).json({
            status: "FAILED",
            message: "CarePay loan not found",
          });
        }
      }
      const payoutResult = await approveAndInitiatePayout({
        lan,
        table: "loan_booking_carepay",
      });

      if (!payoutResult.success) {
        return res.status(400).json({
          status: "FAILED",
          message: payoutResult.message || "Payout initiation failed",
        });
      }

      const finalPayoutStatuses = new Set([
        "success",
        "completed",
        "processed",
      ]);
      const isPayoutFinal = finalPayoutStatuses.has(
        String(payoutResult.payout_status || "").toLowerCase(),
      );
      const finalStatus = isPayoutFinal ? "Disbursed" : "Disburse initiate";

      return res.json({
        status: "SUCCESS",
        final_status: finalStatus,
        payout_status: payoutResult.payout_status || null,
        message:
          "Loan approved by operations checker and payout initiated successfully",
      });
    } catch (err) {
      console.error("CarePay ops checker approve error:", err);

      return res.status(500).json({
        status: "FAILED",
        message: err.message || "Failed to approve loan by operations checker",
        error: err.sqlMessage || err.message,
      });
    }
  },
);

async function fetchCarePayCaseStatus({ lan, partnerLoanId }) {
  const whereClause = lan ? "lan = ?" : "partner_loan_id = ?";
  const value = lan || partnerLoanId;

  const [rows] = await db.promise().query(
    `SELECT
       lan,
       partner_loan_id,
       customer_name,
       status,
       request_amount,
       loan_amount
     FROM loan_booking_carepay
     WHERE ${whereClause}
     LIMIT 1`,
    [value],
  );

  return rows[0] || null;
}

function buildCarePayStatusResponse(row) {
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
    status: row.status,
    request_amount: row.request_amount,
    loan_amount: creditLimit,
    credit_limit: creditLimit,
    limit_available: creditLimit !== null,
  };
}

///////////// CARE PAY CASE STATUS FETCH BY LAN OR PARTNER LOAN ID (for excel upload) //////////
loanBookingRouter.get(
  "/v1/carepay-case-status",
  verifyApiKey,
  async (req, res) => {
    try {
      if (!isCarePayPartner(req)) {
        return res
          .status(403)
          .json({ message: "This route is only for CarePay partner." });
      }

      const lan = String(req.query.lan || "").trim();
      const partnerLoanId = String(req.query.partner_loan_id || "").trim();

      if (!lan && !partnerLoanId) {
        return res.status(400).json({
          message: "lan or partner_loan_id is required.",
        });
      }

      const row = await fetchCarePayCaseStatus({
        lan: lan || null,
        partnerLoanId: partnerLoanId || null,
      });

      if (!row) {
        return res.status(404).json({ message: "CarePay case not found." });
      }

      return res.status(200).json({
        message: "CarePay case status fetched successfully.",
        data: buildCarePayStatusResponse(row),
      });
    } catch (error) {
      console.error("CarePay case status fetch error:", error);

      return res.status(500).json({
        message: "Failed to fetch CarePay case status.",
        error: error.sqlMessage || error.message,
      });
    }
  },
);

/////////////   DISBURSEMNT UTR FATCH API FOR CAREPAY CASES  //////////

loanBookingRouter.get(
  "/v1/disbursement-data",
  verifyApiKey,
  async (req, res) => {
    try {
      const lan = String(req.query.lan || "").trim();

      if (!lan) {
        return res.status(400).json({
          message: "lan is required.",
        });
      }

      const [rows] = await db.promise().query(
        `
        SELECT
          lan,
          DATE_FORMAT(Disbursement_Date, '%Y-%m-%d') AS disbursement_date,
          COALESCE(utr, Disbursement_UTR) AS utr
        FROM ev_disbursement_utr
        WHERE lan = ?
        LIMIT 1
        `,
        [lan],
      );

      if (!rows.length) {
        return res.status(404).json({
          message: "Disbursement data not found.",
        });
      }

      return res.status(200).json({
        message: "Disbursement data fetched successfully.",
        data: rows[0],
      });
    } catch (error) {
      console.error("Disbursement data fetch error:", error);

      return res.status(500).json({
        message: "Failed to fetch disbursement data.",
        error: error.sqlMessage || error.message,
      });
    }
  },
);


router.get("/customer-details/:lan", async (req, res) => {
  const lan = String(req.params.lan || "").trim().toUpperCase();

  if (!lan || !lan.startsWith("CARE")) {
    return res.status(400).json({
      message: "Valid CarePay LAN is required",
    });
  }

  try {
    const [[loan]] = await db.promise().query(
      `SELECT *
       FROM loan_booking_carepay
       WHERE lan = ?
       LIMIT 1`,
      [lan],
    );

    if (!loan) {
      return res.status(404).json({
        message: "CarePay customer details not found",
      });
    }

    const [[hospital]] = await db.promise().query(
      `SELECT
         id,
         partner_loan_id,
         lan,
         hospital_legal_name,
         brand_name,
         hospital_type,
         registered_city,
         registered_district,
         registered_state,
         registered_pincode,
         hospital_email,
         hospital_phone,
         contact_person_name,
         contact_person_email,
         contact_person_phone,
         bank_name,
         account_holder_name,
         account_number,
         ifsc_code,
         status
       FROM carepay_hospital_booking
       WHERE lan = ?
       LIMIT 1`,
      [loan.hospital_lan],
    );

    const [esignDocuments] = await db.promise().query(
      `SELECT
         id,
         document_id,
         document_type,
         status,
         signer_identifier,
         signed_file_path,
         created_at,
         updated_at
       FROM esign_documents
       WHERE lan = ?
       ORDER BY COALESCE(updated_at, created_at) DESC, id DESC`,
      [lan],
    );

    const [bankVerifications] = await db.promise().query(
      `SELECT *
       FROM bank_verification
       WHERE lan = ?
       ORDER BY verified_at DESC
       LIMIT 1`,
      [lan],
    );

    const [kycRows] = await db.promise().query(
      `SELECT *
       FROM kyc_verification_status
       WHERE lan = ?`,
      [lan],
    );

    return res.json({
      data: {
        loan,
        hospital: hospital || null,
        bre: safeParseJson(loan.bre_snapshot),
        esign: {
          documents: esignDocuments,
          latest: esignDocuments[0] || null,
          latest_agreement:
            esignDocuments.find(
              (doc) => String(doc.document_type).toUpperCase() === "AGREEMENT",
            ) || null,
        },
        bank_verification: bankVerifications[0] || null,
        kyc: kycRows,
      },
    });
  } catch (error) {
    console.error("CarePay customer details fetch error:", error);

    return res.status(500).json({
      message: "Failed to fetch CarePay customer details",
      error: error.sqlMessage || error.message,
    });
  }
});

async function persistCarePayBureauResult(lan, data) {
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
         VALUES (?,?,?,?,NOW())`,
        [lan, data.pan_number, score, report],
      );
    }

    if (score !== null) {
      await db
        .promise()
        .execute(
          "UPDATE loan_booking_carepay SET cibil_score_fintree = ? WHERE lan = ?",
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
      console.error("CarePay KYC bureau status update failed:", kycErr.message);
    }

    return bureauResult;
  } catch (err) {
    console.error("CarePay bureau hard pull failed:", err.message);

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
        "CarePay failed bureau status update failed:",
        kycErr.message,
      );
    }

    return bureauResult;
  }
}

loanBookingRouter.post("/v1/carepay-lb", verifyApiKey, async (req, res) => {
  let conn;

  try {
    const data = req.body || {};
    const lenderType = String(req.partner?.name || "")
      .toLowerCase()
      .trim();

    if (!isCarePayPartner(req)) {
      return res.status(403).json({
        message: "This route is only for CarePay partner.",
      });
    }
    if (!data.loan_type) {
      return res.status(400).json({
        message: "Missing fields: loan_type",
      });
    }

    const normalizedLoanType = String(data.loan_type).toLowerCase().trim();

    const loanType = CarepayLoanTypes.find(
      (type) => type.toLowerCase() === normalizedLoanType,
    );

    if (!loanType) {
      return res.status(400).json({
        message: `Invalid loan_type. Allowed values are: ${CarepayLoanTypes.join(", ")}`,
      });
    }

    const missing = getMissingFields(data, CAREPAY_REQUIRED_FIELDS);

    if (missing.length) {
      return res.status(400).json({
        message: `Missing fields: ${missing.join(", ")}`,
      });
    }

    const rawRequestAmount =
      data.request_amount !== undefined &&
      data.request_amount !== null &&
      data.request_amount !== ""
        ? data.request_amount
        : data.loan_amount;

    if (
      rawRequestAmount === undefined ||
      rawRequestAmount === null ||
      rawRequestAmount === ""
    ) {
      return res
        .status(400)
        .json({ message: "Missing fields: request_amount" });
    }

    const requestAmount = Number(rawRequestAmount);

    if (!requestAmount || Number.isNaN(requestAmount) || requestAmount <= 0) {
      return res.status(400).json({ message: "Invalid request_amount" });
    }

    conn = await db.promise().getConnection();
    await conn.beginTransaction();

    const hospitalLan = String(data.hospital_lan || "").trim();
    const [hospitalRows] = await conn.query(
      `SELECT lan
       FROM carepay_hospital_booking
       WHERE lan = ?
         AND status IN ('APPROVED')
       LIMIT 1`,
      [hospitalLan],
    );

    if (!hospitalRows.length) {
      await conn.rollback();
      conn.release();
      conn = null;

      return res.status(404).json({
        status: "Failed",
        message: "Hospital not found or not approved for CarePay booking.",
      });
    }

    const [existing] = await conn.query(
      `SELECT lan, partner_loan_id, customer_name
       FROM loan_booking_carepay
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
       FROM loan_booking_carepay
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

    const partnerName = "CAREPAY";
    const today = new Date();
    const { month, year } = getMonthYear(today);

    const partner = await partnerLimitService.getOrCreatePartner(
      conn,
      partnerName,
    );

    // const limitCheck = await partnerLimitService.validatePartnerBookingLimit(
    //   conn,
    //   partner.partner_id,
    //   requestAmount,
    //   month,
    //   year,
    // );

    // if (!limitCheck.valid) {
    //   await conn.rollback();
    //   conn.release();
    //   conn = null;

    //   return res.status(403).json({
    //     message: "Monthly partner limit exceeded",
    //     remaining_limit: limitCheck.remaining,
    //     required: requestAmount,
    //   });
    // }

    const { lan } = await generateLoanIdentifiers(lenderType);
    const customer_name = `${data.first_name || ""} ${
      data.last_name || ""
    }`.trim();
    const agreement_date = data.login_date;
    const interest_rate = 0;
    const permanentAddress = data.permanent_address || data.current_address;
    const permanentVillageCity =
      data.permanent_village_city || data.current_village_city;
    const permanentDistrict = data.permanent_district || data.current_district;
    const permanentState = data.permanent_state || data.current_state;
    const permanentPincode = data.permanent_pincode || data.current_pincode;

    const fields = {
      lan,
      partner_loan_id: data.partner_loan_id,
      hospital_lan: hospitalLan,
      login_date: data.login_date,
      first_name: data.first_name,
      middle_name: nullableString(data.middle_name),
      last_name: data.last_name,
      customer_name,
      gender: data.gender,
      dob: data.dob,
      age: data.age || null,
      father_name: nullableString(data.father_name),
      mother_name: nullableString(data.mother_name),
      mobile_number: data.mobile_number,
      email_id: nullableString(data.email_id),
      pan_number: data.pan_number,
      aadhar_number: data.aadhar_number,
      current_address: data.current_address,
      current_village_city: data.current_village_city,
      current_district: data.current_district,
      current_state: data.current_state,
      current_pincode: data.current_pincode,
      permanent_address: permanentAddress,
      permanent_village_city: permanentVillageCity,
      permanent_district: permanentDistrict,
      permanent_state: permanentState,
      permanent_pincode: permanentPincode,
      request_amount: requestAmount,
      loan_amount: null,
      interest_rate:data.interest_rate || 0,
      processing_fee_percentage: data.processing_fee_percentage,
      subvention_percentage: data.subvention_percentage,
      subvention_amount: data.subvention_amount,
      loan_tenure: data.loan_tenure,
      emi_amount: data.emi_amount || null,
      cibil_score: data.cibil_score || null,
      product: data.loan_type,
      lender: "CAREPAY",
      // loan_type: data.loan_type,
      net_disbursement: data.net_disbursement || requestAmount,
      employment: data.employment,
      customer_type: data.customer_type,
      annual_income: data.annual_income,
      patient_name: nullableString(data.patient_name),
      insurance_company_name: nullableString(data.insurance_company_name),
      insurance_policy_holder_name: nullableString(
        data.insurance_policy_holder_name,
      ),
      insurance_policy_number: nullableString(data.insurance_policy_number),
      relation_with_policy_holder: nullableString(
        data.relation_with_policy_holder,
      ),
      status: "Login",
      agreement_date,
    };

    const columns = Object.keys(fields).join(", ");
    const placeholders = Object.keys(fields)
      .map(() => "?")
      .join(", ");
    const values = Object.values(fields);

    await conn.query(
      `INSERT INTO loan_booking_carepay (${columns}) VALUES (${placeholders})`,
      values,
    );

    // await partnerLimitService.updateBookedLimit(
    //   conn,
    //   limitCheck.limitId,
    //   loanAmount,
    //   lan,
    // );

    await conn.commit();
    conn.release();
    conn = null;

    const bureauResult = await persistCarePayBureauResult(lan, {
      ...data,
      loan_amount: requestAmount,
      request_amount: requestAmount,
    });

    return res.json({
      message: "CAREPAY loan saved successfully.",
      lan,
      hospital_lan: hospitalLan,
      cibilScore: bureauResult.score || "Not Found",
      bureauStatus: bureauResult.success ? "VERIFIED" : "FAILED",
    });
  } catch (error) {
    if (conn) {
      await conn.rollback();
      conn.release();
    }

    console.error("CarePay onboarding error:", error);
    res.status(error.statusCode || 500).json({
      message: "Upload failed. Please try again.",
      error: error.sqlMessage || error.message,
    });
  }
});

/// NEW CODE ADD SUB PFEE AND NET DIS. .......

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

  // Vendor passed both amount and percentage.
  // Validate that both are matching.
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

  // Vendor passed only percentage.
  // Calculate amount.
  if (percentage !== null) {
    return {
      percentage: round2(percentage),
      amount: round2((baseAmount * percentage) / 100),
    };
  }

  // Vendor passed only amount.
  // Calculate percentage.
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

loanBookingRouter.post("/v1/carepay-lb", verifyApiKey, async (req, res) => {
  let conn;

  try {
    const data = req.body || {};

    const lenderType = String(req.partner?.name || "")
      .toLowerCase()
      .trim();

    if (!isCarePayPartner(req)) {
      return res.status(403).json({
        message: "This route is only for CarePay partner.",
      });
    }

    if (!data.loan_type) {
      return res.status(400).json({
        message: "Missing fields: loan_type",
      });
    }

    const normalizedLoanType = String(data.loan_type).toLowerCase().trim();

    const loanType = CarepayLoanTypes.find(
      (type) => type.toLowerCase() === normalizedLoanType,
    );

    if (!loanType) {
      return res.status(400).json({
        message: `Invalid loan_type. Allowed values are: ${CarepayLoanTypes.join(", ")}`,
      });
    }

    /**
     * Do not validate these fields through CAREPAY_REQUIRED_FIELDS,
     * because vendor can send either amount or percentage.
     *
     * Example valid payloads:
     * 1. processing_fee + subvention_amount
     * 2. processing_fee_percentage + subvention_percentage
     */
    const OPTIONAL_CALCULATED_FIELDS = new Set([
      "processing_fee",
      "processing_fee_percentage",
      "subvention_amount",
      "subvention_percentage",
      "request_amount",
      "loan_amount",
    ]);

    const requiredFieldsForCarePay = CAREPAY_REQUIRED_FIELDS.filter(
      (field) => !OPTIONAL_CALCULATED_FIELDS.has(field),
    );

    const missing = getMissingFields(data, requiredFieldsForCarePay);

    if (missing.length) {
      return res.status(400).json({
        message: `Missing fields: ${missing.join(", ")}`,
      });
    }

    const rawRequestAmount = isProvided(data.request_amount)
      ? data.request_amount
      : data.loan_amount;

    if (!isProvided(rawRequestAmount)) {
      return res.status(400).json({
        message: "Missing fields: request_amount",
      });
    }

    const requestAmount = Number(rawRequestAmount);

    if (!Number.isFinite(requestAmount) || requestAmount <= 0) {
      return res.status(400).json({
        message: "Invalid request_amount",
      });
    }

    const hasSubventionPercentage = isProvided(data.subvention_percentage);
    const hasSubventionAmount = isProvided(data.subvention_amount);

    if (!hasSubventionPercentage && !hasSubventionAmount) {
      return res.status(400).json({
        status: "Failed",
        message: "Missing fields: subvention_percentage or subvention_amount",
      });
    }

    const hasProcessingFeePercentage = isProvided(
      data.processing_fee_percentage,
    );
    const hasProcessingFee = isProvided(data.processing_fee);

    if (!hasProcessingFeePercentage && !hasProcessingFee) {
      return res.status(400).json({
        status: "Failed",
        message: "Missing fields: processing_fee_percentage or processing_fee",
      });
    }

    let subvention;
    let processingFee;

    try {
      subvention = calculateAmountPercentagePair({
        baseAmount: requestAmount,
        amountValue: data.subvention_amount,
        percentageValue: data.subvention_percentage,
        amountField: "subvention_amount",
        percentageField: "subvention_percentage",
      });

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

    const netDisbursement = round2(requestAmount - subvention.amount);

    if (netDisbursement < 0) {
      return res.status(400).json({
        status: "Failed",
        message:
          "Invalid net_disbursement. Processing fee and subvention amount cannot exceed loan amount.",
      });
    }

    conn = await db.promise().getConnection();
    await conn.beginTransaction();

    const hospitalLan = String(data.hospital_lan || "").trim();

    const [hospitalRows] = await conn.query(
      `SELECT lan
       FROM carepay_hospital_booking
       WHERE lan = ?
         AND status IN ('APPROVED')
       LIMIT 1`,
      [hospitalLan],
    );

    if (!hospitalRows.length) {
      await conn.rollback();
      conn.release();
      conn = null;

      return res.status(404).json({
        status: "Failed",
        message: "Hospital not found or not approved for CarePay booking.",
      });
    }

    const [existing] = await conn.query(
      `SELECT lan, partner_loan_id, customer_name
       FROM loan_booking_carepay
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
       FROM loan_booking_carepay
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

    const partnerName = "CAREPAY";
    const today = new Date();
    const { month, year } = getMonthYear(today);

    const partner = await partnerLimitService.getOrCreatePartner(
      conn,
      partnerName,
    );

    const limitCheck = await partnerLimitService.validatePartnerBookingLimit(
      conn,
      partner.partner_id,
      requestAmount,
      month,
      year,
    );

    if (!limitCheck.valid) {
      await conn.rollback();
      conn.release();
      conn = null;

      return res.status(403).json({
        message: "Monthly partner limit exceeded",
        remaining_limit: limitCheck.remaining,
        required: requestAmount,
      });
    }

    const { lan } = await generateLoanIdentifiers(lenderType);
    let breDecision = evaluateCarePayLoginBre({
      data,
      requestAmount,
    });
    let breSnapshot = buildBreSnapshot({
      data,
      requestAmount,
      decision: breDecision,
    });

    const customer_name = `${data.first_name || ""} ${data.last_name || ""
      }`.trim();

    const agreement_date = data.login_date;

    const permanentAddress = data.permanent_address || data.current_address;
    const permanentVillageCity =
      data.permanent_village_city || data.current_village_city;
    const permanentDistrict = data.permanent_district || data.current_district;
    const permanentState = data.permanent_state || data.current_state;
    const permanentPincode = data.permanent_pincode || data.current_pincode;

    const fields = {
      lan,
      partner_loan_id: data.partner_loan_id,
      hospital_lan: hospitalLan,
      login_date: data.login_date,

      first_name: data.first_name,
      middle_name: nullableString(data.middle_name),
      last_name: data.last_name,
      customer_name,

      gender: data.gender,
      dob: data.dob,
      age: data.age || null,

      father_name: nullableString(data.father_name),
      mother_name: nullableString(data.mother_name),

      mobile_number: data.mobile_number,
      email_id: nullableString(data.email_id),

      pan_number: data.pan_number,
      aadhar_number: data.aadhar_number,

      current_address: data.current_address,
      current_village_city: data.current_village_city,
      current_district: data.current_district,
      current_state: data.current_state,
      current_pincode: data.current_pincode,

      permanent_address: permanentAddress,
      permanent_village_city: permanentVillageCity,
      permanent_district: permanentDistrict,
      permanent_state: permanentState,
      permanent_pincode: permanentPincode,

      request_amount: requestAmount,
      loan_amount: requestAmount,

      interest_rate: data.interest_rate || 0,

      processing_fee_percentage: processingFee.percentage,
      processing_fee: processingFee.amount,

      subvention_percentage: subvention.percentage,
      subvention_amount: subvention.amount,

      loan_tenure: data.loan_tenure,
      emi_amount: data.emi_amount || null,
      cibil_score: data.cibil_score || null,

      product: data.loan_type,
      lender: "CAREPAY",

      net_disbursement: netDisbursement,

      employment: data.employment,
      customer_type: data.customer_type,
      annual_income: data.annual_income,
      abb: isProvided(data.abb) ? Number(data.abb) : null,

      patient_name: nullableString(data.patient_name),
      insurance_company_name: nullableString(data.insurance_company_name),
      insurance_policy_holder_name: nullableString(
        data.insurance_policy_holder_name,
      ),
      insurance_policy_number: nullableString(data.insurance_policy_number),
      relation_with_policy_holder: nullableString(
        data.relation_with_policy_holder,
      ),

      status: breDecision.caseStatus,
      bre_snapshot: JSON.stringify(breSnapshot),
      agreement_date,
      bank_account_holder_name:
        nullableString(data.bank_account_holder_name) || "",
      bank_account_number: nullableString(data.bank_account_number) || "",
      bank_name: nullableString(data.bank_name) || "",
      bank_branch_name: nullableString(data.bank_branch_name) || "",
      bank_ifsc_code: nullableString(data.bank_ifsc_code) || "",
      bank_account_type: nullableString(data.bank_account_type) || "",
    };

    const columns = Object.keys(fields).join(", ");
    const placeholders = Object.keys(fields)
      .map(() => "?")
      .join(", ");
    const values = Object.values(fields);

    await conn.query(
      `INSERT INTO loan_booking_carepay (${columns}) VALUES (${placeholders})`,
      values,
    );

    await partnerLimitService.updateBookedLimit(
      conn,
      limitCheck.limitId,
      requestAmount,
      lan,
    );

    await conn.commit();
    conn.release();
    conn = null;

    let bureauResult = {
      success: false,
      score: breDecision.bureauScore,
    };

    if (breDecision.status === "BRE APPROVED") {
      bureauResult = await persistCarePayBureauResult(lan, {
        ...data,
        loan_amount: requestAmount,
        request_amount: requestAmount,

        processing_fee_percentage: processingFee.percentage,
        processing_fee: processingFee.amount,

        subvention_percentage: subvention.percentage,
        subvention_amount: subvention.amount,

        net_disbursement: netDisbursement,
      });
// ✅ DUMMY BUREAU FOR TESTING
// bureauResult = {
//   success: true,
//   score: 680,
//   response: {
//     provider: "DUMMY_BUREAU",
//     status: "SUCCESS",
//     score: 750,
//     enquiry_id: `DUMMY-${lan}-${Date.now()}`,
//   },
// };

console.log("✅ CAREPAY DUMMY BUREAU:", {
  lan,
  score: bureauResult.score,
  status: "VERIFIED",
});
      breDecision = evaluateCarePayLoginBre({
        data,
        requestAmount,
        bureauScore: bureauResult.score,
      });
      let breSnapshot = buildBreSnapshot({
        data,
        requestAmount,
        bureauScore: bureauResult.score,
        decision: breDecision,
        bureauResponse: bureauResult.response,
      });
      // always update snapshot (and status if it flipped to Rejected)
      await db.promise().query(
        `UPDATE loan_booking_carepay
     SET status = ?, bre_snapshot = ?
     WHERE lan = ?`,
        [breDecision.caseStatus, JSON.stringify(breSnapshot), lan],
      );

      if (breDecision.status === "BRE FAILED") {
        await db
          .promise()
          .query("UPDATE loan_booking_carepay SET status = ? WHERE lan = ?", [
            breDecision.caseStatus,
            lan,
          ]);
      }
    }

    const finalBureauScore = Number(bureauResult.score);

const abbRequiredForResponse =
  requestAmount > 300000 ||
  (finalBureauScore >= 1 && finalBureauScore <= 200) ||
  finalBureauScore === 680;

    return res.json({
      message:
        breDecision.status === "BRE FAILED"
          ? "CAREPAY loan rejected by BRE."
          : "CAREPAY loan saved successfully.",
      lan,
      hospital_lan: hospitalLan,
      status: breDecision.caseStatus,
      bre: {
        status: breDecision.status,
        reason: breDecision.reason,
        reasons: breDecision.reasons,
      },

      request_amount: requestAmount,
      loan_amount: requestAmount,

      processing_fee_percentage: processingFee.percentage,
      processing_fee: processingFee.amount,

      subvention_percentage: subvention.percentage,
      subvention_amount: subvention.amount,

      net_disbursement: netDisbursement,

      abbCheck: {
      applicable: abbRequiredForResponse,
      emi_amount: data.emi_amount || null,
      abb: data.abb || null,
       required_abb:
    abbRequiredForResponse && data.emi_amount
      ? Number(data.emi_amount) * 1.5
      : null,

      passed:
        requestAmount > 100000
          ? Number(data.abb) > Number(data.emi_amount) * 1.5
          : true,
  },
      cibilScore: bureauResult.score || "Not Found",
      bureauStatus: bureauResult.success ? "VERIFIED" : "FAILED",
    });
  } catch (error) {
    if (conn) {
      await conn.rollback();
      conn.release();
    }

    console.error("CarePay onboarding error:", error);

    return res.status(error.statusCode || 500).json({
      message: "Upload failed. Please try again.",
      error: error.sqlMessage || error.message,
    });
  }
});

///////

///// CAREPAY - SUBVENTION, PROCESSING FEE & NET DISBURSEMENT /////

// const isProvided = (value) =>
//   value !== undefined &&
//   value !== null &&
//   String(value).trim() !== "";

// const round2 = (value) =>
//   Math.round((Number(value) + Number.EPSILON) * 100) / 100;

// /**
//  * Parse a required non-negative numeric field.
//  */
// const parseRequiredNonNegativeNumber = (value, fieldName) => {
//   if (!isProvided(value)) {
//     throw new Error(`Missing fields: ${fieldName}`);
//   }

//   const num = Number(value);

//   if (!Number.isFinite(num) || num < 0) {
//     throw new Error(`Invalid ${fieldName}`);
//   }

//   return num;
// };

// /**
//  * Reverse-calculate percentage from amount.
//  *
//  * percentage = (amount / baseAmount) * 100
//  *
//  * For subvention:
//  * subvention_amount is already GST-inclusive,
//  * therefore the percentage calculated from it is
//  * also GST-inclusive.
//  */
// const calculatePercentageFromAmount = ({
//   baseAmount,
//   amountValue,
//   amountField,
// }) => {
//   const amount = parseRequiredNonNegativeNumber(
//     amountValue,
//     amountField,
//   );

//   return {
//     amount: round2(amount),
//     percentage: round2((amount / baseAmount) * 100),
//   };
// };

// loanBookingRouter.post(
//   "/v1/carepay-lb",
//   verifyApiKey,
//   async (req, res) => {
//     let conn;

//     try {
//       const data = req.body || {};

//       const lenderType = String(req.partner?.name || "")
//         .toLowerCase()
//         .trim();

//       /**
//        * ------------------------------------------------
//        * PARTNER VALIDATION
//        * ------------------------------------------------
//        */
//       if (!isCarePayPartner(req)) {
//         return res.status(403).json({
//           message: "This route is only for CarePay partner.",
//         });
//       }

//       /**
//        * ------------------------------------------------
//        * LOAN TYPE VALIDATION
//        * ------------------------------------------------
//        */
//       if (!data.loan_type) {
//         return res.status(400).json({
//           message: "Missing fields: loan_type",
//         });
//       }

//       const normalizedLoanType = String(data.loan_type)
//         .toLowerCase()
//         .trim();

//       const loanType = CarepayLoanTypes.find(
//         (type) =>
//           type.toLowerCase() === normalizedLoanType,
//       );

//       if (!loanType) {
//         return res.status(400).json({
//           message: `Invalid loan_type. Allowed values are: ${CarepayLoanTypes.join(
//             ", ",
//           )}`,
//         });
//       }

//       /**
//        * ------------------------------------------------
//        * REQUIRED FIELD VALIDATION
//        * ------------------------------------------------
//        *
//        * These fields are handled manually below.
//        *
//        * Vendor sends:
//        *
//        * request_amount
//        * subvention_amount
//        * processing_fee
//        * net_disbursement
//        *
//        * We calculate:
//        *
//        * subvention_percentage
//        * processing_fee_percentage
//        */
//       const OPTIONAL_CALCULATED_FIELDS = new Set([
//         "processing_fee",
//         "processing_fee_percentage",
//         "subvention_amount",
//         "subvention_percentage",
//         "net_disbursement",
//         "request_amount",
//         "loan_amount",
//       ]);

//       const requiredFieldsForCarePay =
//         CAREPAY_REQUIRED_FIELDS.filter(
//           (field) =>
//             !OPTIONAL_CALCULATED_FIELDS.has(field),
//         );

//       const missing = getMissingFields(
//         data,
//         requiredFieldsForCarePay,
//       );

//       if (missing.length) {
//         return res.status(400).json({
//           message: `Missing fields: ${missing.join(", ")}`,
//         });
//       }

//       /**
//        * ------------------------------------------------
//        * REQUEST AMOUNT
//        * ------------------------------------------------
//        *
//        * request_amount is preferred.
//        * loan_amount remains fallback for compatibility.
//        */
//       const rawRequestAmount = isProvided(
//         data.request_amount,
//       )
//         ? data.request_amount
//         : data.loan_amount;

//       if (!isProvided(rawRequestAmount)) {
//         return res.status(400).json({
//           status: "Failed",
//           message: "Missing fields: request_amount",
//         });
//       }

//       const requestAmount = Number(rawRequestAmount);

//       if (
//         !Number.isFinite(requestAmount) ||
//         requestAmount <= 0
//       ) {
//         return res.status(400).json({
//           status: "Failed",
//           message: "Invalid request_amount",
//         });
//       }

//       /**
//        * ------------------------------------------------
//        * SUBVENTION / PROCESSING FEE / NET DISBURSEMENT
//        * ------------------------------------------------
//        */
//       let subvention;
//       let processingFee;
//       let netDisbursement;

//       try {
//         /**
//          * SUBVENTION
//          *
//          * subvention_amount comes from payload.
//          *
//          * IMPORTANT:
//          * Amount is already GST-inclusive.
//          *
//          * Example:
//          *
//          * request_amount = 100000
//          * subvention_amount = 11800
//          *
//          * subvention_percentage:
//          *
//          * (11800 / 100000) * 100
//          * = 11.80%
//          *
//          * No division by 1.18 is required.
//          */
//         subvention = calculatePercentageFromAmount({
//           baseAmount: requestAmount,
//           amountValue: data.subvention_amount,
//           amountField: "subvention_amount",
//         });

//         /**
//          * PROCESSING FEE
//          *
//          * processing_fee comes from payload.
//          *
//          * processing_fee_percentage =
//          * (processing_fee / request_amount) * 100
//          */
//         processingFee =
//           calculatePercentageFromAmount({
//             baseAmount: requestAmount,
//             amountValue: data.processing_fee,
//             amountField: "processing_fee",
//           });

//         /**
//          * NET DISBURSEMENT
//          *
//          * net_disbursement also comes from payload.
//          */
//         netDisbursement =
//           parseRequiredNonNegativeNumber(
//             data.net_disbursement,
//             "net_disbursement",
//           );

//         netDisbursement = round2(netDisbursement);
//       } catch (calculationError) {
//         return res.status(400).json({
//           status: "Failed",
//           message: calculationError.message,
//         });
//       }

//       /**
//        * ------------------------------------------------
//        * AMOUNT VALIDATION
//        * ------------------------------------------------
//        */
//       if (subvention.amount > requestAmount) {
//         return res.status(400).json({
//           status: "Failed",
//           message:
//             "subvention_amount cannot exceed request_amount",
//         });
//       }

//       if (processingFee.amount > requestAmount) {
//         return res.status(400).json({
//           status: "Failed",
//           message:
//             "processing_fee cannot exceed request_amount",
//         });
//       }

//       /**
//        * ------------------------------------------------
//        * NET DISBURSEMENT VALIDATION
//        * ------------------------------------------------
//        *
//        * Current CarePay rule:
//        *
//        * Net Disbursement =
//        * Request Amount - Subvention Amount
//        *
//        * Processing Fee is NOT deducted here.
//        */
//       const expectedNetDisbursement = round2(
//         requestAmount - subvention.amount,
//       );

//       if (
//         Math.abs(
//           netDisbursement - expectedNetDisbursement,
//         ) > 0.01
//       ) {
//         return res.status(400).json({
//           status: "Failed",
//           message:
//             `Invalid net_disbursement. ` +
//             `Expected ${expectedNetDisbursement} ` +
//             `but received ${netDisbursement}`,
//         });
//       }

//       /**
//        * ------------------------------------------------
//        * DATABASE CONNECTION
//        * ------------------------------------------------
//        */
//       conn = await db.promise().getConnection();

//       await conn.beginTransaction();

//       /**
//        * ------------------------------------------------
//        * HOSPITAL VALIDATION
//        * ------------------------------------------------
//        */
//       const hospitalLan = String(
//         data.hospital_lan || "",
//       ).trim();

//       const [hospitalRows] = await conn.query(
//         `SELECT lan
//          FROM carepay_hospital_booking
//          WHERE lan = ?
//            AND status IN ('APPROVED')
//          LIMIT 1`,
//         [hospitalLan],
//       );

//       if (!hospitalRows.length) {
//         await conn.rollback();

//         conn.release();
//         conn = null;

//         return res.status(404).json({
//           status: "Failed",
//           message:
//             "Hospital not found or not approved for CarePay booking.",
//         });
//       }

//       /**
//        * ------------------------------------------------
//        * DUPLICATE PARTNER LOAN ID
//        * ------------------------------------------------
//        */
//       const [existing] = await conn.query(
//         `SELECT lan, partner_loan_id, customer_name
//          FROM loan_booking_carepay
//          WHERE partner_loan_id = ?`,
//         [data.partner_loan_id],
//       );

//       if (existing.length > 0) {
//         await conn.rollback();

//         conn.release();
//         conn = null;

//         return res.status(400).json({
//           status: "Failed",
//           message: "Duplicate Partner Loan ID",
//           existingLan: existing[0].lan,
//         });
//       }

//       /**
//        * ------------------------------------------------
//        * PAN ACTIVE LOAN CHECK
//        * ------------------------------------------------
//        */
//       const [panRecords] = await conn.query(
//         `SELECT status
//          FROM loan_booking_carepay
//          WHERE pan_number = ?`,
//         [data.pan_number],
//       );

//       const allowedStatuses = new Set([
//         "cancelled",
//         "foreclosed",
//         "fully paid",
//         "rejected",
//       ]);

//       const hasActiveLoan = panRecords.some(
//         (row) =>
//           !allowedStatuses.has(
//             String(row.status || "")
//               .trim()
//               .toLowerCase(),
//           ),
//       );

//       if (hasActiveLoan) {
//         await conn.rollback();

//         conn.release();
//         conn = null;

//         return res.status(400).json({
//           status: "Failed",
//           message:
//             "PAN already exists with an active loan. New loan not allowed.",
//         });
//       }

//       /**
//        * ------------------------------------------------
//        * PARTNER MONTHLY LIMIT
//        * ------------------------------------------------
//        */
//       const partnerName = "CAREPAY";

//       const today = new Date();

//       const { month, year } =
//         getMonthYear(today);

//       const partner =
//         await partnerLimitService.getOrCreatePartner(
//           conn,
//           partnerName,
//         );

//       const limitCheck =
//         await partnerLimitService.validatePartnerBookingLimit(
//           conn,
//           partner.partner_id,
//           requestAmount,
//           month,
//           year,
//         );

//       if (!limitCheck.valid) {
//         await conn.rollback();

//         conn.release();
//         conn = null;

//         return res.status(403).json({
//           message: "Monthly partner limit exceeded",
//           remaining_limit: limitCheck.remaining,
//           required: requestAmount,
//         });
//       }

//       /**
//        * ------------------------------------------------
//        * GENERATE LAN
//        * ------------------------------------------------
//        */
//       const { lan } =
//         await generateLoanIdentifiers(lenderType);

//       /**
//        * ------------------------------------------------
//        * INITIAL BRE
//        * ------------------------------------------------
//        */
//       let breDecision =
//         evaluateCarePayLoginBre({
//           data,
//           requestAmount,
//         });

//       let breSnapshot =
//         buildBreSnapshot({
//           data,
//           requestAmount,
//           decision: breDecision,
//         });

//       /**
//        * ------------------------------------------------
//        * CUSTOMER NAME
//        * ------------------------------------------------
//        */
//       const customer_name =
//         `${data.first_name || ""} ${
//           data.last_name || ""
//         }`.trim();

//       const agreement_date = data.login_date;

//       /**
//        * ------------------------------------------------
//        * PERMANENT ADDRESS FALLBACK
//        * ------------------------------------------------
//        */
//       const permanentAddress =
//         data.permanent_address ||
//         data.current_address;

//       const permanentVillageCity =
//         data.permanent_village_city ||
//         data.current_village_city;

//       const permanentDistrict =
//         data.permanent_district ||
//         data.current_district;

//       const permanentState =
//         data.permanent_state ||
//         data.current_state;

//       const permanentPincode =
//         data.permanent_pincode ||
//         data.current_pincode;

//       /**
//        * ------------------------------------------------
//        * DB FIELDS
//        * ------------------------------------------------
//        */
//       const fields = {
//         lan,

//         partner_loan_id:
//           data.partner_loan_id,

//         hospital_lan:
//           hospitalLan,

//         login_date:
//           data.login_date,

//         first_name:
//           data.first_name,

//         middle_name:
//           nullableString(data.middle_name),

//         last_name:
//           data.last_name,

//         customer_name,

//         gender:
//           data.gender,

//         dob:
//           data.dob,

//         age:
//           data.age || null,

//         father_name:
//           nullableString(data.father_name),

//         mother_name:
//           nullableString(data.mother_name),

//         mobile_number:
//           data.mobile_number,

//         email_id:
//           nullableString(data.email_id),

//         pan_number:
//           data.pan_number,

//         aadhar_number:
//           data.aadhar_number,

//         current_address:
//           data.current_address,

//         current_village_city:
//           data.current_village_city,

//         current_district:
//           data.current_district,

//         current_state:
//           data.current_state,

//         current_pincode:
//           data.current_pincode,

//         permanent_address:
//           permanentAddress,

//         permanent_village_city:
//           permanentVillageCity,

//         permanent_district:
//           permanentDistrict,

//         permanent_state:
//           permanentState,

//         permanent_pincode:
//           permanentPincode,

//         /**
//          * Loan Amount
//          */
//         request_amount:
//           requestAmount,

//         loan_amount:
//           requestAmount,

//         interest_rate:
//           data.interest_rate || 0,

//         /**
//          * Processing Fee
//          *
//          * Amount -> payload
//          * Percentage -> calculated
//          */
//         processing_fee_percentage:
//           processingFee.percentage,

//         processing_fee:
//           processingFee.amount,

//         /**
//          * Subvention
//          *
//          * Amount -> payload (GST inclusive)
//          * Percentage -> calculated (GST inclusive)
//          */
//         subvention_percentage:
//           subvention.percentage,

//         subvention_amount:
//           subvention.amount,

//         loan_tenure:
//           data.loan_tenure,

//         emi_amount:
//           data.emi_amount || null,

//         cibil_score:
//           data.cibil_score || null,

//         product:
//           data.loan_type,

//         lender:
//           "CAREPAY",

//         /**
//          * Comes from payload,
//          * already validated above.
//          */
//         net_disbursement:
//           netDisbursement,

//         employment:
//           data.employment,

//         customer_type:
//           data.customer_type,

//         annual_income:
//           data.annual_income,

//         abb:
//           isProvided(data.abb)
//             ? Number(data.abb)
//             : null,

//         patient_name:
//           nullableString(data.patient_name),

//         insurance_company_name:
//           nullableString(
//             data.insurance_company_name,
//           ),

//         insurance_policy_holder_name:
//           nullableString(
//             data.insurance_policy_holder_name,
//           ),

//         insurance_policy_number:
//           nullableString(
//             data.insurance_policy_number,
//           ),

//         relation_with_policy_holder:
//           nullableString(
//             data.relation_with_policy_holder,
//           ),

//         status:
//           breDecision.caseStatus,

//         bre_snapshot:
//           JSON.stringify(breSnapshot),

//         agreement_date,

//         bank_account_holder_name:
//           nullableString(
//             data.bank_account_holder_name,
//           ) || "",

//         bank_account_number:
//           nullableString(
//             data.bank_account_number,
//           ) || "",

//         bank_name:
//           nullableString(data.bank_name) || "",

//         bank_branch_name:
//           nullableString(
//             data.bank_branch_name,
//           ) || "",

//         bank_ifsc_code:
//           nullableString(
//             data.bank_ifsc_code,
//           ) || "",

//         bank_account_type:
//           nullableString(
//             data.bank_account_type,
//           ) || "",
//       };

//       /**
//        * ------------------------------------------------
//        * INSERT LOAN
//        * ------------------------------------------------
//        */
//       const columns =
//         Object.keys(fields).join(", ");

//       const placeholders =
//         Object.keys(fields)
//           .map(() => "?")
//           .join(", ");

//       const values =
//         Object.values(fields);

//       await conn.query(
//         `INSERT INTO loan_booking_carepay (${columns})
//          VALUES (${placeholders})`,
//         values,
//       );

//       /**
//        * ------------------------------------------------
//        * UPDATE PARTNER BOOKED LIMIT
//        * ------------------------------------------------
//        */
//       await partnerLimitService.updateBookedLimit(
//         conn,
//         limitCheck.limitId,
//         requestAmount,
//         lan,
//       );

//       /**
//        * ------------------------------------------------
//        * COMMIT TRANSACTION
//        * ------------------------------------------------
//        */
//       await conn.commit();

//       conn.release();
//       conn = null;

//       /**
//        * ------------------------------------------------
//        * BUREAU
//        * ------------------------------------------------
//        */
//       let bureauResult = {
//         success: false,
//         score: breDecision.bureauScore,
//       };

//       if (
//         breDecision.status === "BRE APPROVED"
//       ) {
//         bureauResult =
//           await persistCarePayBureauResult(
//             lan,
//             {
//               ...data,

//               loan_amount:
//                 requestAmount,

//               request_amount:
//                 requestAmount,

//               processing_fee_percentage:
//                 processingFee.percentage,

//               processing_fee:
//                 processingFee.amount,

//               subvention_percentage:
//                 subvention.percentage,

//               subvention_amount:
//                 subvention.amount,

//               net_disbursement:
//                 netDisbursement,
//             },
//           );

//         /**
//          * DUMMY BUREAU FOR TESTING
//          *
//          * Uncomment only for testing.
//          */

//         // bureauResult = {
//         //   success: true,
//         //   score: 680,
//         //   response: {
//         //     provider: "DUMMY_BUREAU",
//         //     status: "SUCCESS",
//         //     score: 680,
//         //     enquiry_id: `DUMMY-${lan}-${Date.now()}`,
//         //   },
//         // };

//         console.log(
//           "✅ CAREPAY BUREAU:",
//           {
//             lan,
//             score: bureauResult.score,
//             status:
//               bureauResult.success
//                 ? "VERIFIED"
//                 : "FAILED",
//           },
//         );

//         /**
//          * ------------------------------------------------
//          * RE-RUN BRE WITH BUREAU SCORE
//          * ------------------------------------------------
//          */
//         breDecision =
//           evaluateCarePayLoginBre({
//             data,
//             requestAmount,
//             bureauScore:
//               bureauResult.score,
//           });

//         breSnapshot =
//           buildBreSnapshot({
//             data,
//             requestAmount,
//             bureauScore:
//               bureauResult.score,
//             decision:
//               breDecision,
//             bureauResponse:
//               bureauResult.response,
//           });

//         /**
//          * ------------------------------------------------
//          * UPDATE FINAL BRE RESULT
//          * ------------------------------------------------
//          */
//         await db.promise().query(
//           `UPDATE loan_booking_carepay
//            SET status = ?,
//                bre_snapshot = ?
//            WHERE lan = ?`,
//           [
//             breDecision.caseStatus,
//             JSON.stringify(breSnapshot),
//             lan,
//           ],
//         );
//       }

//       /**
//        * ------------------------------------------------
//        * ABB CHECK
//        * ------------------------------------------------
//        */
//       const finalBureauScore = Number(
//         bureauResult.score,
//       );

//       const abbRequiredForResponse =
//         requestAmount > 300000 ||
//         (
//           finalBureauScore >= 1 &&
//           finalBureauScore <= 200
//         ) ||
//         finalBureauScore === 680;

//       /**
//        * ------------------------------------------------
//        * FINAL RESPONSE
//        * ------------------------------------------------
//        */
//       return res.json({
//         message:
//           breDecision.status === "BRE FAILED"
//             ? "CAREPAY loan rejected by BRE."
//             : "CAREPAY loan saved successfully.",

//         lan,

//         hospital_lan:
//           hospitalLan,

//         status:
//           breDecision.caseStatus,

//         bre: {
//           status:
//             breDecision.status,

//           reason:
//             breDecision.reason,

//           reasons:
//             breDecision.reasons,
//         },

//         /**
//          * Loan Amount
//          */
//         request_amount:
//           requestAmount,

//         loan_amount:
//           requestAmount,

//         /**
//          * Processing Fee
//          */
//         processing_fee_percentage:
//           processingFee.percentage,

//         processing_fee:
//           processingFee.amount,

//         /**
//          * Subvention
//          */
//         subvention_percentage:
//           subvention.percentage,

//         subvention_amount:
//           subvention.amount,

//         /**
//          * Net Disbursement
//          */
//         net_disbursement:
//           netDisbursement,

//         /**
//          * ABB
//          */
//         abbCheck: {
//           applicable:
//             abbRequiredForResponse,

//           emi_amount:
//             data.emi_amount || null,

//           abb:
//             isProvided(data.abb)
//               ? Number(data.abb)
//               : null,

//           required_abb:
//             abbRequiredForResponse &&
//             data.emi_amount
//               ? round2(
//                   Number(data.emi_amount) *
//                     1.5,
//                 )
//               : null,

//           passed:
//             requestAmount > 100000
//               ? Number(data.abb) >
//                 Number(data.emi_amount) *
//                   1.5
//               : true,
//         },

//         cibilScore:
//           isProvided(bureauResult.score)
//             ? bureauResult.score
//             : "Not Found",

//         bureauStatus:
//           bureauResult.success
//             ? "VERIFIED"
//             : "FAILED",
//       });
//     } catch (error) {
//       if (conn) {
//         await conn.rollback();

//         conn.release();
//         conn = null;
//       }

//       console.error(
//         "CarePay onboarding error:",
//         error,
//       );

//       return res
//         .status(
//           error.statusCode || 500,
//         )
//         .json({
//           message:
//             "Upload failed. Please try again.",

//           error:
//             error.sqlMessage ||
//             error.message,
//         });
//     }
//   },
// );




//BRE Trigger for CarePay loan booking
loanBookingRouter.post("/v1/carepay-bre/:lan", verifyApiKey, async (req, res) => {
  try {
    const lan = String(req.params.lan || "").trim();

    if (!lan) {
      return res.status(400).json({
        message: "LAN is required",
      });
    }

    // 1. Fetch CarePay loan
    const [loanRows] = await db.promise().query(
      `
        SELECT *
        FROM loan_booking_carepay
        WHERE lan = ?
        LIMIT 1
        `,
      [lan],
    );

    if (!loanRows.length) {
      return res.status(404).json({
        message: "CarePay loan not found",
        lan,
      });
    }

    const loan = loanRows[0];

    // 2. Bureau must already be VERIFIED
    const [kycRows] = await db.promise().query(
      `
  SELECT bureau_status, bureau_api_response
  FROM kyc_verification_status
  WHERE lan = ?
  LIMIT 1
  `,
      [lan],
    );

    if (!kycRows.length) {
      return res.status(400).json({
        message: "Bureau record not found",
        lan,
      });
    }

    const kyc = kycRows[0];

    if (
      String(kyc.bureau_status || "").trim().toUpperCase() !== "VERIFIED"
    ) {
      return res.status(400).json({
        message: "BRE cannot run until bureau is VERIFIED",
        lan,
        bureau_status: kyc.bureau_status,
      });
    }

    // 3. Get latest bureau report
    const [bureauRows] = await db.promise().query(
      `
  SELECT score, report_xml
  FROM loan_cibil_reports
  WHERE lan = ?
  ORDER BY created_at DESC, id DESC
  LIMIT 1
  `,
      [lan],
    );

    const bureauReport = bureauRows[0] || {};

    // Prefer latest bureau score
    const bureauScore =
      toFiniteNumber(bureauReport.score) ??
      toFiniteNumber(loan.cibil_score);

    if (bureauScore === null) {
      return res.status(400).json({
        message: "Bureau is VERIFIED but CIBIL score not found",
        lan,
      });
    }

    // 4. Get stored bureau response for snapshot / DPD extraction
    let bureauResponse = null;

    const parseBureauResponse = (value) => {
      if (!value) return null;

      if (typeof value === "object") {
        return value;
      }

      // First support old JSON values if any
      try {
        return JSON.parse(value);
      } catch { }

      // Experian XML
      try {
        const parser = new XMLParser({
          ignoreAttributes: false,
          attributeNamePrefix: "",
          trimValues: true,
        });

        return parser.parse(String(value));
      } catch {
        return null;
      }
    };

    bureauResponse =
      parseBureauResponse(bureauReport.report_xml) ||
      parseBureauResponse(kyc.bureau_api_response);

    // IMPORTANT:
    // DB me loan_type "product" column me save ho raha hai
    const data = {
      ...loan,

      loan_type: loan.product,

      cibil_score: bureauScore,
    };

    const requestAmount =
      toFiniteNumber(loan.request_amount) ??
      toFiniteNumber(loan.loan_amount);

    if (requestAmount === null) {
      return res.status(400).json({
        message: "Loan amount not found",
        lan,
      });
    }

    // 5. RUN BRE
    const breDecision = evaluateCarePayLoginBre({
      data,
      requestAmount,
      bureauScore,
    });

    // 6. Build BRE snapshot
    const breSnapshot = buildBreSnapshot({
      data,
      requestAmount,
      bureauScore,
      decision: breDecision,
      bureauResponse,
    });

    // 7. Update loan
    await db.promise().query(
      `
        UPDATE loan_booking_carepay
        SET
          status = ?,
          cibil_score = ?,
          bre_snapshot = ?
        WHERE lan = ?
        `,
      [
        breDecision.caseStatus,
        bureauScore,
        JSON.stringify(breSnapshot),
        lan,
      ],
    );

    return res.json({
      is_success: true,
      lan,

      bureau_status: "VERIFIED",
      cibil_score: bureauScore,

      status: breDecision.caseStatus,

      bre: {
        status: breDecision.status,
        reason: breDecision.reason,
        reasons: breDecision.reasons,
      },
    });
  } catch (error) {
    console.error("CarePay BRE Error:", error);

    return res.status(500).json({
      is_success: false,
      message: "Failed to run CarePay BRE",
      error: error.sqlMessage || error.message,
    });
  }
},
);

// router.post("/mandate/update-umrn", verifyApiKey, async (req, res) => {
//   try {
//     const {
//       lan,
//       amount,
//       umrn,
//       fatherName,
//       motherName,
//       bank_account_holder_name,
//       bank_account_number,
//       bank_name,
//       bank_branch_name,
//       bank_ifsc_code,
//       bank_account_type,
//     } = req.body || {};

//     const cleanLan = String(lan || "").trim().toUpperCase();
//     const cleanUmrn = String(umrn || "").trim();

//     if (
//       !cleanLan ||
//       amount == null ||
//       !cleanUmrn ||
//       !bank_account_holder_name ||
//       !bank_account_number ||
//       !bank_name ||
//       !bank_branch_name ||
//       !bank_ifsc_code ||
//       !bank_account_type
//     ) {
//       return res.status(400).json({
//         message:
//           "Missing required fields: lan, amount, umrn, bank_account_holder_name, bank_account_number, bank_name, bank_branch_name, bank_ifsc_code, bank_account_type",
//       });
//     }

//     // 1. Update CarePay table with the UMRN + bank details
//     const [result] = await db.promise().query(
//       `UPDATE loan_booking_carepay
//          SET mandate_amount = ?,
//              umrn = ?,
//              father_name = COALESCE(?, father_name),
//              mother_name = COALESCE(?, mother_name),
//              bank_account_holder_name = ?,
//              bank_account_number = ?,
//              bank_name = ?,
//              bank_branch_name = ?,
//              bank_ifsc_code = ?,
//              bank_account_type = ?
//        WHERE lan = ?`,
//       [
//         amount,
//         cleanUmrn,
//         fatherName ?? null,
//         motherName ?? null,
//         String(bank_account_holder_name).trim(),
//         String(bank_account_number).trim(),
//         String(bank_name).trim(),
//         String(bank_branch_name).trim(),
//         String(bank_ifsc_code).trim(),
//         String(bank_account_type).trim(),
//         cleanLan,
//       ],
//     );

//     if (result.affectedRows === 0) {
//       return res.status(404).json({
//         message: "No record found for given LAN",
//       });
//     }

//     // 2. Fetch UMRN from enach_mandates – only proceed if it exists (“correct”)
//     const [[mandate]] = await db.promise().query(
//       `SELECT lan, umrn, status
//        FROM loan_booking_carepay
//        WHERE umrn = ?
//        LIMIT 1`,
//       [cleanUmrn],
//     );

//     const mandateExists = Boolean(mandate);

//     if (!mandateExists) {
//       return res.status(200).json({
//         message: "Mandate updated in CarePay, but UMRN not found in eNACH table",
//         mandate_updated: false,
//         approved: false,
//       });
//     }

//     // 3. UMRN is correct → mark eNACH as SUCCESS
//     // await db.promise().query(
//     //   `UPDATE enach_mandates
//     //      SET status = 'SUCCESS'
//     //    WHERE umrn = ?`,
//     //   [cleanUmrn],
//     // );

//     // 4. Check e-sign status on CarePay loan
//     const [[loan]] = await db.promise().query(
//       `SELECT agreement_esign_status
//        FROM loan_booking_carepay
//        WHERE lan = ?
//        LIMIT 1`,
//       [cleanLan],
//     );

//     const isEsignDone =
//       String(loan?.agreement_esign_status || "")
//         .trim()
//         .toUpperCase() === "SIGNED";

//     const shouldApprove = mandateExists && isEsignDone;

//     // 5. Both UMRN correct + e-sign done → update CarePay status to Approved
//     if (shouldApprove) {
//       await db.promise().query(
//         `UPDATE loan_booking_carepay
//            SET status = 'Approved'
//          WHERE lan = ?`,
//         [cleanLan],
//       );
//     }

//     return res.status(200).json({
//       message: shouldApprove
//         ? "Mandate updated and loan approved successfully"
//         : "Mandate updated successfully (waiting for e-sign)",
//       mandate_updated: true,
//       approved: shouldApprove,
//     });
//   } catch (error) {
//     console.error("Error updating mandate UMRN:", error);
//     return res.status(500).json({
//       message: "Internal server error",
//     });
//   }
// });
////////////// UPDATED AMOUNT AND UMRN UPDATE WITH VERIFICATION CHECKS
loanBookingRouter.post(
  "/v1/loan/update-request-amount",
  verifyApiKey,
  async (req, res) => {
    let connection;

    try {
      const { lan, requestAmount } = req.body || {};

      const cleanLan = String(lan || "").trim().toUpperCase();
      const cleanRequestAmount = String(requestAmount ?? "").trim();

      if (!cleanLan) {
        return res.status(400).json({
          message: "LAN is required",
        });
      }

      if (!cleanRequestAmount) {
        return res.status(400).json({
          message: "Request amount is required",
        });
      }

      const validAmountPattern = /^\d{1,13}(\.\d{1,2})?$/;

      if (
        !validAmountPattern.test(cleanRequestAmount) ||
        Number(cleanRequestAmount) <= 0
      ) {
        return res.status(400).json({
          message:
            "Request amount must be a positive number with maximum 2 decimal places",
        });
      }

      connection = await db.promise().getConnection();
      await connection.beginTransaction();

      const [loanRows] = await connection.query(
        `SELECT
            id,
            request_amount,
            old_requestAmount,
            umrn,
            bank_account_holder_name,
            bank_account_number,
            bank_name,
            bank_branch_name,
            bank_ifsc_code,
            bank_account_type
         FROM loan_booking_carepay
         WHERE lan = ?
         LIMIT 1
         FOR UPDATE`,
        [cleanLan],
      );

      if (loanRows.length === 0) {
        await connection.rollback();

        return res.status(404).json({
          message: "No record found for given LAN",
          updated: false,
        });
      }

      const loan = loanRows[0];

      const hasValue = (value) =>
        value !== null &&
        value !== undefined &&
        String(value).trim() !== "";

      const protectedFields = {
        umrn: loan.umrn,
        bank_account_holder_name: loan.bank_account_holder_name,
        bank_account_number: loan.bank_account_number,
        bank_name: loan.bank_name,
        bank_branch_name: loan.bank_branch_name,
        bank_ifsc_code: loan.bank_ifsc_code,
        bank_account_type: loan.bank_account_type,
      };

      const populatedFields = Object.entries(protectedFields)
        .filter(([, value]) => hasValue(value))
        .map(([fieldName]) => fieldName);

      // Do not update when any UMRN/bank value is already present.
      if (populatedFields.length > 0) {
        await connection.rollback();

        return res.status(409).json({
          message:
            "Request amount cannot be updated because UMRN or bank details are already present",
          updated: false,
          populated_fields: populatedFields,
        });
      }

      const oldRequestAmount = loan.request_amount;

      const [updateResult] = await connection.query(
        `UPDATE loan_booking_carepay
         SET old_requestAmount = request_amount,
             request_amount = ?
         WHERE id = ?`,
        [cleanRequestAmount, loan.id],
      );

      if (updateResult.affectedRows !== 1) {
        throw new Error("Request amount update failed");
      }

      await connection.commit();

      return res.status(200).json({
        message: "Request amount updated successfully",
        updated: true,
        lan: cleanLan,
        old_request_amount: oldRequestAmount,
        request_amount: Number(cleanRequestAmount).toFixed(2),
      });
    } catch (error) {
      if (connection) {
        try {
          await connection.rollback();
        } catch (rollbackError) {
          console.error(
            "Request amount rollback failed:",
            rollbackError,
          );
        }
      }

      console.error("Error updating request amount:", error);

      return res.status(500).json({
        message: "Internal server error",
        updated: false,
      });
    } finally {
      connection?.release();
    }
  },
);


//// Sajag ///

router.post(
  "/mandate/update-umrn",
  verifyApiKey,
  async (req, res) => {
    try {
      const {
        lan,
        amount,
        umrn,
        fatherName,
        motherName,
        bank_account_holder_name,
        bank_account_number,
        bank_name,
        bank_branch_name,
        bank_ifsc_code,
        bank_account_type,
      } = req.body || {};

      const cleanLan = String(lan || "").trim().toUpperCase();
      const cleanUmrn = String(umrn || "").trim();

    if (!cleanLan) {
      return res.status(400).json({
        message: "LAN is required",
      });
    }

      const [[existingLoan]] =
        await db.promise().query(
          `SELECT
              lan,
              status
           FROM loan_booking_carepay
           WHERE lan = ?
           LIMIT 1`,
          [cleanLan],
        );

      if (!existingLoan) {
        return res.status(404).json({
          message: "No CarePay record found for given LAN",
        });
      }
      await db.promise().query(
        `UPDATE loan_booking_carepay
         SET mandate_amount =
               COALESCE(?, mandate_amount),

             umrn =
               COALESCE(
                 NULLIF(TRIM(?), ''),
                 umrn
               ),

             father_name =
               COALESCE(
                 NULLIF(TRIM(?), ''),
                 father_name
               ),

             mother_name =
               COALESCE(
                 NULLIF(TRIM(?), ''),
                 mother_name
               ),

             bank_account_holder_name =
               COALESCE(
                 NULLIF(TRIM(?), ''),
                 bank_account_holder_name
               ),

             bank_account_number =
               COALESCE(
                 NULLIF(TRIM(?), ''),
                 bank_account_number
               ),

             bank_name =
               COALESCE(
                 NULLIF(TRIM(?), ''),
                 bank_name
               ),

             bank_branch_name =
               COALESCE(
                 NULLIF(TRIM(?), ''),
                 bank_branch_name
               ),

             bank_ifsc_code =
               COALESCE(
                 NULLIF(TRIM(?), ''),
                 bank_ifsc_code
               ),

             bank_account_type =
               COALESCE(
                 NULLIF(TRIM(?), ''),
                 bank_account_type
               ),

             updated_at = NOW()
         WHERE lan = ?`,
        [
          amount ?? null,
          cleanUmrn || null,
          fatherName ?? null,
          motherName ?? null,
          bank_account_holder_name ?? null,
          bank_account_number ?? null,
          bank_name ?? null,
          bank_branch_name ?? null,
          bank_ifsc_code ?? null,
          bank_account_type ?? null,
          cleanLan,
        ],
      );

      const approvalResult =
        await checkAndApproveCarePayLoan(cleanLan);

      return res.status(200).json({
        message: approvalResult.approved
          ? "Mandate updated and loan approved successfully"
          : "Mandate updated, but loan approval is pending",

        mandate_updated: true,
        approved: approvalResult.approved,
        carepay_approval: approvalResult,
      });
    } catch (error) {
      console.error(
        "Error updating CarePay mandate UMRN:",
        {
          message: error.message,
          stack: error.stack,
        },
      );

    return res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
});

module.exports = router;
module.exports.loanBookingRouter = loanBookingRouter;
