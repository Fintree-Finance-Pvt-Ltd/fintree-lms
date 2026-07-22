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
const { evaluateCarePayLoginBre } = require("./carePayBreEngine");
const { approveAndInitiatePayout } = require("../../services/payout.service");

const router = express.Router();
const loanBookingRouter = express.Router();

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

loanBookingRouter.put("/v1/carepay-ops-checker-approved-loan/:lan", async (req, res) => {
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
        message: "Only disburse initiated CarePay loans can be handled by Ops L2",
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

    const finalPayoutStatuses = new Set(["success", "completed", "processed"]);
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
});

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
loanBookingRouter.get("/v1/carepay-case-status", verifyApiKey, async (req, res) => {
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

// loanBookingRouter.post("/v1/carepay-lb", verifyApiKey, async (req, res) => {
//   let conn;

//   try {
//     const data = req.body || {};
//     const lenderType = String(req.partner?.name || "")
//       .toLowerCase()
//       .trim();

//     if (!isCarePayPartner(req)) {
//       return res.status(403).json({
//         message: "This route is only for CarePay partner.",
//       });
//     }
//     if (!data.loan_type) {
//       return res.status(400).json({
//         message: "Missing fields: loan_type",
//       });
//     }

//     const normalizedLoanType = String(data.loan_type).toLowerCase().trim();

//     const loanType = CarepayLoanTypes.find(
//       (type) => type.toLowerCase() === normalizedLoanType,
//     );

//     if (!loanType) {
//       return res.status(400).json({
//         message: `Invalid loan_type. Allowed values are: ${CarepayLoanTypes.join(", ")}`,
//       });
//     }

//     const missing = getMissingFields(data, CAREPAY_REQUIRED_FIELDS);

//     if (missing.length) {
//       return res.status(400).json({
//         message: `Missing fields: ${missing.join(", ")}`,
//       });
//     }

//     const rawRequestAmount =
//       data.request_amount !== undefined &&
//       data.request_amount !== null &&
//       data.request_amount !== ""
//         ? data.request_amount
//         : data.loan_amount;

//     if (
//       rawRequestAmount === undefined ||
//       rawRequestAmount === null ||
//       rawRequestAmount === ""
//     ) {
//       return res
//         .status(400)
//         .json({ message: "Missing fields: request_amount" });
//     }

//     const requestAmount = Number(rawRequestAmount);

//     if (!requestAmount || Number.isNaN(requestAmount) || requestAmount <= 0) {
//       return res.status(400).json({ message: "Invalid request_amount" });
//     }

//     conn = await db.promise().getConnection();
//     await conn.beginTransaction();

//     const hospitalLan = String(data.hospital_lan || "").trim();
//     const [hospitalRows] = await conn.query(
//       `SELECT lan
//        FROM carepay_hospital_booking
//        WHERE lan = ?
//          AND status IN ('APPROVED')
//        LIMIT 1`,
//       [hospitalLan],
//     );

//     if (!hospitalRows.length) {
//       await conn.rollback();
//       conn.release();
//       conn = null;

//       return res.status(404).json({
//         status: "Failed",
//         message: "Hospital not found or not approved for CarePay booking.",
//       });
//     }

//     const [existing] = await conn.query(
//       `SELECT lan, partner_loan_id, customer_name
//        FROM loan_booking_carepay
//        WHERE partner_loan_id = ?`,
//       [data.partner_loan_id],
//     );

//     if (existing.length > 0) {
//       await conn.rollback();
//       conn.release();
//       conn = null;

//       return res.status(400).json({
//         status: "Failed",
//         message: "Duplicate Partner Loan ID",
//         existingLan: existing[0].lan,
//       });
//     }

//     const [panRecords] = await conn.query(
//       `SELECT status
//        FROM loan_booking_carepay
//        WHERE pan_number = ?`,
//       [data.pan_number],
//     );

//     const allowedStatuses = new Set([
//       "cancelled",
//       "foreclosed",
//       "fully paid",
//       "rejected",
//     ]);

//     if (
//       panRecords.some(
//         (row) =>
//           !allowedStatuses.has(
//             String(row.status || "")
//               .trim()
//               .toLowerCase(),
//           ),
//       )
//     ) {
//       await conn.rollback();
//       conn.release();
//       conn = null;

//       return res.status(400).json({
//         status: "Failed",
//         message:
//           "PAN already exists with an active loan. New loan not allowed.",
//       });
//     }

//     const partnerName = "CAREPAY";
//     const today = new Date();
//     const { month, year } = getMonthYear(today);

//     const partner = await partnerLimitService.getOrCreatePartner(
//       conn,
//       partnerName,
//     );

//     // const limitCheck = await partnerLimitService.validatePartnerBookingLimit(
//     //   conn,
//     //   partner.partner_id,
//     //   requestAmount,
//     //   month,
//     //   year,
//     // );

//     // if (!limitCheck.valid) {
//     //   await conn.rollback();
//     //   conn.release();
//     //   conn = null;

//     //   return res.status(403).json({
//     //     message: "Monthly partner limit exceeded",
//     //     remaining_limit: limitCheck.remaining,
//     //     required: requestAmount,
//     //   });
//     // }

//     const { lan } = await generateLoanIdentifiers(lenderType);
//     const customer_name = `${data.first_name || ""} ${
//       data.last_name || ""
//     }`.trim();
//     const agreement_date = data.login_date;
//     const interest_rate = 0;
//     const permanentAddress = data.permanent_address || data.current_address;
//     const permanentVillageCity =
//       data.permanent_village_city || data.current_village_city;
//     const permanentDistrict = data.permanent_district || data.current_district;
//     const permanentState = data.permanent_state || data.current_state;
//     const permanentPincode = data.permanent_pincode || data.current_pincode;

//     const fields = {
//       lan,
//       partner_loan_id: data.partner_loan_id,
//       hospital_lan: hospitalLan,
//       login_date: data.login_date,
//       first_name: data.first_name,
//       middle_name: nullableString(data.middle_name),
//       last_name: data.last_name,
//       customer_name,
//       gender: data.gender,
//       dob: data.dob,
//       age: data.age || null,
//       father_name: nullableString(data.father_name),
//       mother_name: nullableString(data.mother_name),
//       mobile_number: data.mobile_number,
//       email_id: nullableString(data.email_id),
//       pan_number: data.pan_number,
//       aadhar_number: data.aadhar_number,
//       current_address: data.current_address,
//       current_village_city: data.current_village_city,
//       current_district: data.current_district,
//       current_state: data.current_state,
//       current_pincode: data.current_pincode,
//       permanent_address: permanentAddress,
//       permanent_village_city: permanentVillageCity,
//       permanent_district: permanentDistrict,
//       permanent_state: permanentState,
//       permanent_pincode: permanentPincode,
//       request_amount: requestAmount,
//       loan_amount: null,
//       interest_rate:data.interest_rate || 0,
//       processing_fee_percentage: data.processing_fee_percentage,
//       subvention_percentage: data.subvention_percentage,
//       subvention_amount: data.subvention_amount,
//       loan_tenure: data.loan_tenure,
//       emi_amount: data.emi_amount || null,
//       cibil_score: data.cibil_score || null,
//       product: data.loan_type,
//       lender: "CAREPAY",
//       // loan_type: data.loan_type,
//       net_disbursement: data.net_disbursement || requestAmount,
//       employment: data.employment,
//       customer_type: data.customer_type,
//       annual_income: data.annual_income,
//       patient_name: nullableString(data.patient_name),
//       insurance_company_name: nullableString(data.insurance_company_name),
//       insurance_policy_holder_name: nullableString(
//         data.insurance_policy_holder_name,
//       ),
//       insurance_policy_number: nullableString(data.insurance_policy_number),
//       relation_with_policy_holder: nullableString(
//         data.relation_with_policy_holder,
//       ),
//       status: "Login",
//       agreement_date,
//     };

//     const columns = Object.keys(fields).join(", ");
//     const placeholders = Object.keys(fields)
//       .map(() => "?")
//       .join(", ");
//     const values = Object.values(fields);

//     await conn.query(
//       `INSERT INTO loan_booking_carepay (${columns}) VALUES (${placeholders})`,
//       values,
//     );

//     // await partnerLimitService.updateBookedLimit(
//     //   conn,
//     //   limitCheck.limitId,
//     //   loanAmount,
//     //   lan,
//     // );

//     await conn.commit();
//     conn.release();
//     conn = null;

//     const bureauResult = await persistCarePayBureauResult(lan, {
//       ...data,
//       loan_amount: requestAmount,
//       request_amount: requestAmount,
//     });

//     return res.json({
//       message: "CAREPAY loan saved successfully.",
//       lan,
//       hospital_lan: hospitalLan,
//       cibilScore: bureauResult.score || "Not Found",
//       bureauStatus: bureauResult.success ? "VERIFIED" : "FAILED",
//     });
//   } catch (error) {
//     if (conn) {
//       await conn.rollback();
//       conn.release();
//     }

//     console.error("CarePay onboarding error:", error);
//     res.status(error.statusCode || 500).json({
//       message: "Upload failed. Please try again.",
//       error: error.sqlMessage || error.message,
//     });
//   }
// });

///// NEW CODE ADD SUB PFEE AND NET DIS. .......

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

    const netDisbursement = round2(
      requestAmount  - subvention.amount,
    );

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

    const customer_name = `${data.first_name || ""} ${
      data.last_name || ""
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

      breDecision = evaluateCarePayLoginBre({
        data,
        requestAmount,
        bureauScore: bureauResult.score,
      });

      if (breDecision.status === "BRE FAILED") {
        await db
          .promise()
          .query("UPDATE loan_booking_carepay SET status = ? WHERE lan = ?", [
            breDecision.caseStatus,
            lan,
          ]);
      }
    }

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

router.post("/mandate/update-umrn", verifyApiKey, async (req, res) => {
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
            bank_account_type
        } = req.body || {};

        if (
            !lan ||
            amount == null ||
            !umrn ||
            !bank_account_holder_name ||
            !bank_account_number ||
            !bank_name ||
            !bank_branch_name ||
            !bank_ifsc_code ||
            !bank_account_type
        ) {
            return res.status(400).json({
                message: "Missing required fields: lan, amount, umrn, bank_account_holder_name, bank_account_number, bank_name, bank_branch_name, bank_ifsc_code, bank_account_type"
            });
        }

        const [result] = await db.promise().query(
            `UPDATE loan_booking_carepay
             SET mandate_amount = ?,
                 umrn = ?,
                 father_name = COALESCE(?, father_name),
                 mother_name = COALESCE(?, mother_name),
                 bank_account_holder_name = ?,
                 bank_account_number = ?,
                 bank_name = ?,
                 bank_branch_name = ?,
                 bank_ifsc_code = ?,
                 bank_account_type = ?
             WHERE lan = ?`,
            [
                amount,
                umrn,
                fatherName ?? null,
                motherName ?? null,
                String(bank_account_holder_name).trim(),
                String(bank_account_number).trim(),
                String(bank_name).trim(),
                String(bank_branch_name).trim(),
                String(bank_ifsc_code).trim(),
                String(bank_account_type).trim(),
                lan
            ]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                message: "No record found for given LAN"
            });
        }

        return res.status(200).json({
            message: "Mandate updated successfully"
        });
    } catch (error) {
        console.error("Error updating mandate UMRN:", error);

        return res.status(500).json({
            message: "Internal server error"
        });
    }
});

module.exports = router;
module.exports.loanBookingRouter = loanBookingRouter;
