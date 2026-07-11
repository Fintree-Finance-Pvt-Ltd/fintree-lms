const express = require("express");
const db = require("../../config/db");
const verifyApiKey = require("../../middleware/apiKeyAuth");
const crypto = require("crypto");
const runBRE = require("./runBre");
const { POLICY } = require("./rapidMoneyPolicy");
const { allocateRepaymentByLAN } = require("../../utils/allocate");
const { excelSerialDateToJS, queryDB } = require("../../utils/helpers");
const {
  sendRejectionWebhook,
  sendDisbursementWebhook,
} = require("./switchMyLoanWebhook");
const { approveAndInitiatePayout } = require("../../services/payout.service");
const { verifyBank } = require("../../services/enachService");
const {
  evaluateRapidMoneyEligibility,
} = require("./rapidMoneyEligibilityEvaluator");
const router = express.Router();

const DEPLOYMENT_ENV = String(
  process.env.DEPLOYMENT_ENV || "production",
)
  .trim()
  .toLowerCase();

const BANK_MODE = String(
  process.env.BANK_MODE || "live",
)
  .trim()
  .toLowerCase();

/*
 * Bank verification bypass is allowed only in test/UAT.
 *
 * Even when BANK_MODE=mock-clear is accidentally configured
 * in production, the bypass will remain disabled.
 */
const SHOULD_MOCK_CLEAR_BANK =
  ["test", "uat"].includes(DEPLOYMENT_ENV) &&
  BANK_MODE === "mock-clear";

console.log("SML bank verification configuration:", {
  deploymentEnvironment: DEPLOYMENT_ENV,
  bankMode: BANK_MODE,
  mockClearEnabled: SHOULD_MOCK_CLEAR_BANK,
});

const parsePartnerDate = (dateStr) => {
  if (!dateStr) return null;

  const months = {
    jan: "01",
    feb: "02",
    mar: "03",
    apr: "04",
    may: "05",
    jun: "06",
    jul: "07",
    aug: "08",
    sep: "09",
    oct: "10",
    nov: "11",
    dec: "12",
  };

  const parts = String(dateStr).split("-");
  if (parts.length !== 3) {
    throw new Error("Invalid date format. Expected DD-MMM-YYYY");
  }

  const [day, mon, year] = parts;
  const month = months[String(mon).toLowerCase()];

  if (!month) {
    throw new Error("Invalid month in date");
  }

  return `${year}-${month}-${String(day).padStart(2, "0")}`;
};
const parseApiDate = (value) => {
  if (!value) return null;

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }

    if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) {
      return trimmed.slice(0, 10);
    }

    if (/^\d{2}-[A-Za-z]{3}-\d{4}$/.test(trimmed)) {
      return parsePartnerDate(trimmed);
    }

    if (/^\d{2}-\d{2}-\d{4}$/.test(trimmed)) {
      const [d, m, y] = trimmed.split("-");
      return `${y}-${m}-${d}`;
    }

    if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
      const [d, m, y] = trimmed.split("/");
      return `${y}-${m}-${d}`;
    }
  }

  return null;
};

const toClientError = (err) => {
  if (!err) return { message: "Unknown error" };
  const { message, code, errno, sqlState, sqlMessage } = err;
  return { message: sqlMessage || message || "Error", code, errno, sqlState };
};

function normalizeName(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

async function verifySmlBankInBackground({
  partnerLoanId,
  applicationId,
  lan,
  accountName,
  accountNumber,
  ifsc,
}) {
  try {
    console.log("Starting SML bank verification:", {
      partnerLoanId,
      applicationId,
      lan,
    });

    const result = await verifyBank({
      lan,
      account_no: accountNumber,
      ifsc,
      name: accountName,
      bank_name: null,
      account_type: "savings",
    });

    const responseStatus = String(
      result?.status ||
        result?.data?.status ||
        result?.verification_status ||
        result?.data?.verification_status ||
        "",
    ).toUpperCase();

    const isVerified =
      result?.success === true ||
      result?.verified === true ||
      result?.data?.success === true ||
      result?.data?.verified === true ||
      ["SUCCESS", "VERIFIED", "VALID"].includes(
        responseStatus,
      );

    const failureMessage = isVerified
      ? null
      : String(
          result?.message ||
            result?.data?.message ||
            result?.error ||
            "BANK_VERIFICATION_FAILED",
        ).slice(0, 500);

    const [updateResult] = await db.promise().query(
      `UPDATE loan_booking_switch_my_loan
       SET bank_verification_status = ?,
           bank_is_verified = ?,
           bank_verification_response = ?,
           bank_verification_error = ?,
           bank_verified_at = ?,
           status = CASE
             WHEN ? = 1 THEN status
             ELSE 'REJECTED'
           END,
           updated_at = NOW()
       WHERE partner_loan_id = ?
         AND bank_ac_number = ?
         AND bank_ifsc_code = ?
         AND bank_ac_name = ?
         AND bank_verification_status = 'PENDING'`,
      [
        isVerified ? "VERIFIED" : "FAILED",
        isVerified ? 1 : 0,
        JSON.stringify(result || {}),
        failureMessage,
        isVerified ? new Date() : null,
        isVerified ? 1 : 0,
        partnerLoanId,
        accountNumber,
        ifsc,
        accountName,
      ],
    );

    if (!updateResult.affectedRows) {
      console.warn(
        "Bank verification result not saved because stored details did not match:",
        {
          partnerLoanId,
          accountName,
          accountNumber,
          ifsc,
        },
      );

      return;
    }

    if (!isVerified) {
      console.log(
        "Loan rejected due to bank verification failure:",
        {
          partnerLoanId,
          applicationId,
          lan,
          failureMessage,
        },
      );

      if (!applicationId) {
        console.error(
          "Rejection webhook not sent because applicationId is missing:",
          {
            partnerLoanId,
            lan,
          },
        );

        return;
      }

      setImmediate(() => {
        sendRejectionWebhook(applicationId).catch(
          (webhookError) => {
            console.error(
              "SML bank verification rejection webhook failed:",
              webhookError.message,
            );
          },
        );
      });

      return;
    }

    console.log("SML bank verification completed:", {
      partnerLoanId,
      applicationId,
      lan,
      status: "VERIFIED",
    });
  } catch (error) {
    console.error("SML bank verification failed:", {
      partnerLoanId,
      applicationId,
      lan,
      statusCode: error.response?.status || null,
      message: error.message,
    });

    try {
      const failureResponse =
        error.response?.data || {
          message:
            error.message ||
            "BANK_VERIFICATION_FAILED",
          statusCode:
            error.response?.status || null,
        };

      const failureMessage = String(
        error.response?.data?.message ||
          error.message ||
          "BANK_VERIFICATION_FAILED",
      ).slice(0, 500);

      const [failureUpdate] =
        await db.promise().query(
          `UPDATE loan_booking_switch_my_loan
           SET bank_verification_status = 'FAILED',
               bank_is_verified = 0,
               bank_verification_response = ?,
               bank_verification_error = ?,
               bank_verified_at = NULL,
               status = 'REJECTED',
               updated_at = NOW()
           WHERE partner_loan_id = ?
             AND bank_ac_number = ?
             AND bank_ifsc_code = ?
             AND bank_ac_name = ?
             AND bank_verification_status = 'PENDING'`,
          [
            JSON.stringify(failureResponse),
            failureMessage,
            partnerLoanId,
            accountNumber,
            ifsc,
            accountName,
          ],
        );

      if (!failureUpdate.affectedRows) {
        console.warn(
          "Bank verification exception was not saved because stored details did not match:",
          {
            partnerLoanId,
            accountName,
            accountNumber,
            ifsc,
          },
        );

        return;
      }

      console.log(
        "Loan rejected due to bank verification exception:",
        {
          partnerLoanId,
          applicationId,
          lan,
          failureMessage,
        },
      );

      if (!applicationId) {
        console.error(
          "Rejection webhook not sent because applicationId is missing:",
          {
            partnerLoanId,
            lan,
          },
        );

        return;
      }

      setImmediate(() => {
        sendRejectionWebhook(applicationId).catch(
          (webhookError) => {
            console.error(
              "SML bank verification rejection webhook failed:",
              webhookError.message,
            );
          },
        );
      });
    } catch (dbError) {
      console.error(
        "Could not save bank verification failure:",
        {
          partnerLoanId,
          message: dbError.message,
        },
      );
    }
  }
}

function bankNamesMatch(customerName, accountName) {
  const getParts = (value) =>
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(Boolean);

  const customerParts = getParts(customerName);
  const accountParts = getParts(accountName);

  if (!customerParts.length || !accountParts.length) {
    return false;
  }

  // Exact match after removing formatting.
  if (customerParts.join("") === accountParts.join("")) {
    return true;
  }

  // Single-name customers require exact equality.
  if (customerParts.length === 1 || accountParts.length === 1) {
    return customerParts[0] === accountParts[0];
  }

  // Allow middle-name differences.
  return (
    customerParts[0] === accountParts[0] &&
    customerParts[customerParts.length - 1] ===
      accountParts[accountParts.length - 1]
  );
}

async function processRows(sheetData) {
  const successRows = [];
  const rowErrors = [];
  const missingLANs = [];
  const duplicateUTRs = [];

  try {
    if (!sheetData.length) {
      return {
        success: false,
        message: "Empty or invalid data",
      };
    }

    /**
     * Normalize headers (Excel + JSON compatibility)
     */
    sheetData = sheetData.map((row) => ({
      LAN: row.LAN || row.lan,
      UTR: row.UTR || row.utr,

      "Payment Date": row["Payment Date"] || row.payment_date,

      "Bank Date":
        row["Bank Date"] ||
        row.bank_date ||
        row["Payment Date"] ||
        row.payment_date,

      "Payment Id": row["Payment Id"] || row.payment_id,

      "Payment Mode": row["Payment Mode"] || row.payment_mode,

      "Transfer Amount": row["Transfer Amount"] || row.transfer_amount,

      __row: row.__row,
    }));

    /**
     * Validate required columns
     */
    const required = [
      "LAN",
      "UTR",
      "Payment Date",
      "Payment Id",
      "Payment Mode",
      "Transfer Amount",
    ];

    const missingHeaders = required.filter((h) => !(h in sheetData[0]));

    if (missingHeaders.length) {
      return {
        success: false,
        message: "Missing required column(s)",
        details: { missing_headers: missingHeaders },
      };
    }

    /**
     * Fetch valid LANs
     */
    const uniqueLANs = [
      ...new Set(sheetData.map((r) => r["LAN"]).filter(Boolean)),
    ];

    let validLANs = new Set();

    if (uniqueLANs.length) {
      const results = await Promise.all([
        queryDB(
          `SELECT lan FROM loan_booking_switch_my_loan WHERE lan IN (?)`,
          [uniqueLANs],
        ),
      ]);

      validLANs = new Set(results.flat().map((r) => r.lan));
    }

    console.log("Valid LANs:", Array.from(validLANs));
    console.log("sheetdat in processrows", sheetData);

    /**
     * Process each row
     */
    for (const row of sheetData) {
      const rowNumber = row.__row || 1;

      const lan = row["LAN"];
      const utr = row["UTR"];

      const bank_date =
        typeof row["Bank Date"] === "string"
          ? row["Bank Date"]
          : excelSerialDateToJS(row["Bank Date"]);

      const payment_date =
        typeof row["Payment Date"] === "string"
          ? row["Payment Date"]
          : excelSerialDateToJS(row["Payment Date"]);

      const payment_id = row["Payment Id"];
      const payment_mode = row["Payment Mode"];
      const transfer_amount = row["Transfer Amount"];

      /**
       * Validation
       */
      // if (
      //   !lan ||
      //   !utr ||
      //   !payment_date ||
      //   !payment_id ||
      //   !payment_mode ||
      //   !transfer_amount
      // ) {
      //   rowErrors.push({
      //     row: rowNumber,
      //     lan,
      //     utr,
      //     bank_date,
      //     payment_date,
      //     payment_id,
      //     payment_mode,
      //     transfer_amount,
      //     stage: "validation",
      //     reason: "Missing required fields",
      //   });

      //   continue;
      // }

      /**
       * LAN existence check
       */
      if (!validLANs.has(lan)) {
        if (!missingLANs.includes(lan)) {
          missingLANs.push(lan);
        }

        rowErrors.push({
          row: rowNumber,
          lan,
          utr,
          stage: "validation",
          reason: "LAN not found",
        });

        continue;
      }

      /**
       * Select upload table
       */
      let table = "repayments_upload";

      /**
       * Duplicate UTR check
       */
      const [dup] = await queryDB(
        `SELECT COUNT(*) AS cnt FROM ${table} WHERE utr = ?`,
        [utr],
      );

      if (dup.cnt > 0) {
        if (!duplicateUTRs.includes(utr)) {
          duplicateUTRs.push(utr);
        }

        rowErrors.push({
          row: rowNumber,
          lan,
          utr,
          stage: "pre-insert",
          reason: "Duplicate UTR",
        });

        continue;
      }

      /**
       * Penal charge SP
       */
      await queryDB(`CALL sp_generate_penal_charge(?)`, [lan]);

      /**
       * Insert repayment
       */
      await queryDB(
        `INSERT INTO ${table}
        (lan, bank_date, utr, payment_date, payment_id, payment_mode, transfer_amount)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          lan,
          bank_date,
          utr,
          payment_date,
          payment_id,
          payment_mode,
          transfer_amount,
        ],
      );

      /**
       * Allocation
       */
      await allocateRepaymentByLAN(lan, {
        lan,
        bank_date,
        utr,
        payment_date,
        payment_id,
        payment_mode,
        transfer_amount,
      });

      successRows.push(rowNumber);
    }

    return {
      success: true,
      total_rows: sheetData.length,
      inserted_rows: successRows.length,
      failed_rows: rowErrors.length,
      success_rows: successRows,
      row_errors: rowErrors,
      missing_lans: missingLANs,
      duplicate_utrs: duplicateUTRs,
    };
  } catch (err) {
    console.error("Processor error:", err);

    return {
      success: false,
      message: "Processing failed",
      error: toClientError(err),
    };
  }
}

const generateApplicationId = () => {
  return crypto.randomUUID();
};

const generateConsentId = () => {
  return crypto.randomUUID();
};

const normalizeDate = (date) => {
  if (!date) return null;

  const apiFormat = parseApiDate(date);
  if (apiFormat) return apiFormat;

  const partnerFormat = parsePartnerDate(date);
  if (partnerFormat) return partnerFormat;

  throw new Error("Invalid date format. Use YYYY-MM-DD or DD-MMM-YYYY");
};

const generateLoanIdentifiers = async (connection, lender) => {
  const normalizedLender = lender.trim();

  let prefixLan;

  if (normalizedLender === "RAPID-MONEY") {
    prefixLan = "RML10";
  } else {
    throw new Error("Invalid lender type.");
  }

  const [rows] = await connection.query(
    "SELECT last_sequence FROM loan_sequences WHERE lender_name = ? FOR UPDATE",
    [normalizedLender],
  );

  let newSequence;

  if (rows.length > 0) {
    newSequence = rows[0].last_sequence + 1;
    await connection.query(
      "UPDATE loan_sequences SET last_sequence = ? WHERE lender_name = ?",
      [newSequence, normalizedLender],
    );
  } else {
    newSequence = 11000;
    await connection.query(
      "INSERT INTO loan_sequences (lender_name, last_sequence) VALUES (?, ?)",
      [normalizedLender, newSequence],
    );
  }

  return {
    lan: `${prefixLan}${newSequence}`,
  };
};

const NUMERIC_FIELDS = new Set([
  "loan_amount",
  "tenure",
  "interest_rate",
  "processing_fee",
  "previous_loan_amount",
  "total_disbursed_applications",
]);

const IDENTITY_CRITICAL_FIELDS = [
  "full_name",
  "pan_number",
  "dob",
  "mobile",
  "address_line_1",
  "address_line_2",
  "address_pincode",
  "address_city",
  "address_state",
  "current_address_line_1",
  "current_address_line_2",
  "current_address_pincode",
  "current_address_city",
  "current_address_state",
];

const BLOCKED_UPDATE_STATUSES = [
  "REJECTED",
  "BRE_APPROVED",
  "DISBURSE_INITIATED",
  "DISBURSED",
  "CLOSED",
  "CANCELLED",
];

function validateNumericPayload(data) {
  const invalid = [];
  for (const field of NUMERIC_FIELDS) {
    if (
      data[field] !== undefined &&
      data[field] !== null &&
      data[field] !== "" &&
      !Number.isFinite(Number(data[field]))
    ) {
      invalid.push(field);
    }
  }
  return invalid;
}

function hasIdentityCriticalChange(data) {
  return IDENTITY_CRITICAL_FIELDS.some((field) =>
    Object.prototype.hasOwnProperty.call(data, field),
  );
}
const normalizeCreateUpdatePayload = (data) => {
  return {
    full_name: data.full_name ?? null,
    pan_number: data.pan_number ?? null,
    father_name: data.father_name ?? null,
    dob: data.dob
  ? normalizeDate(data.dob)
  : null,
    gender: data.gender ?? null,
    mobile: data.mobile ?? null,
    email: data.email ?? null,
    pincode: data.pincode ?? null,
    state: data.state ?? null,
    city: data.city ?? null,
    district: data.district ?? null,

    residence_status: data.residence_type ?? null,
    employment_type: data.employment_type ?? null,
    company_type: data.company_type ?? null,
    company_name: data.company_name ?? null,
    designation: data.designation ?? null,
    salary_range: data.salary_range ?? null,
    salary_mode: data.salary_mode ?? null,
    nature_of_business: data.nature_of_business ?? null,
    aquisition_fees_txn_id: data.aquisition_fees_txn_id ?? null,
    industry_type: data.industry_type ?? null,
    monthly_income: data.monthly_income ?? null,

    address_line_1: data.address_line_1 ?? null,
    address_line_2: data.address_line_2 ?? null,
    address_pincode: data.address_pincode ?? null,
    address_city: data.address_city ?? null,
    address_state: data.address_state ?? null,
    is_current_address:
      data.is_current_address === undefined ? null : data.is_current_address,
    current_address_line_1: data.current_address_line_1 ?? null,
    current_address_line_2: data.current_address_line_2 ?? null,
    current_address_pincode: data.current_address_pincode ?? null,
    current_address_city: data.current_address_city ?? null,
    current_address_state: data.current_address_state ?? null,

    loan_amount: data.loan_amount ?? null,
    tenure: data.tenure ?? null,
    loan_type: data.loan_type ?? null,
    monthly_emi: data.monthly_emi ?? null,
    interest_rate: data.interest_rate ?? null,
    processing_fee: data.processing_fee ?? null,
    repayment_count: data.repayment_count ?? null,
    payment_frequency: data.payment_frequency ?? null,
    loan_application_date: data.loan_application_date
      ? normalizeDate(data.loan_application_date)
      : null,
    agreement_date: data.agreement_date
      ? normalizeDate(data.agreement_date)
      : null,
    repayment_date: data.repayment_date
      ? normalizeDate(data.repayment_date)
      : null,
    agreement_signature_type: data.agreement_signature_type ?? null,
    source: data.source ?? null,
    preferred_language: data.preferred_language ?? null,
    previous_loan_amount: data.previous_loan_amount ?? null,
    total_disbursed_applications: data.total_disbursed_applications ?? null,

    bank_ac_name: data.bank_account?.ac_name ?? null,
    bank_ac_number: data.bank_account?.ac_number ?? null,
    bank_ifsc_code: data.bank_account?.ifsc_code ?? null,
    bank_nach_umrn: data.bank_account?.nach_umrn ?? null,
    bank_upi_id: data.bank_account?.upi_id ?? null,

    kyc_json: data.kyc ? JSON.stringify(data.kyc) : null,
    bank_json: data.bank_account ? JSON.stringify(data.bank_account) : null,
  };
};

// 1) ASSESSMENT FEE API
// router.post("/v1/loan/assessment-fee", verifyApiKey, async (req, res) => {
//   let connection;
//   let transactionStarted = false;

//   try {
//     connection = await db.promise().getConnection();

//     const { partner_loan_id, amount, payment_date, payment_id } = req.body;

//     if (!partner_loan_id) {
//       return res.status(400).json({
//         is_success: false,
//         error: {
//           message: "partner_loan_id is required",
//           code: "request_validation_error",
//         },
//       });
//     }

//     if (amount === undefined || amount === null || Number(amount) <= 0) {
//       return res.status(400).json({
//         is_success: false,
//         error: {
//           message: "amount must be greater than 0",
//           code: "request_validation_error",
//         },
//       });
//     }

//     if (!payment_date) {
//       return res.status(400).json({
//         is_success: false,
//         error: {
//           message: "payment_date is required",
//           code: "request_validation_error",
//         },
//       });
//     }

//     if (!payment_id) {
//       return res.status(400).json({
//         is_success: false,
//         error: {
//           message: "payment_id is required",
//           code: "request_validation_error",
//         },
//       });
//     }

//     const formattedPaymentDate = parsePartnerDate(payment_date);

//     await connection.beginTransaction();
//     transactionStarted = true;

//     const [existingPayment] = await connection.query(
//       `SELECT id FROM switch_my_loan_assessment_fee WHERE payment_id = ? LIMIT 1`,
//       [payment_id]
//     );

//     if (existingPayment.length > 0) {
//       await connection.rollback();
//       transactionStarted = false;

//       return res.status(409).json({
//         is_success: false,
//         error: {
//           message: "payment_id already exists",
//           code: "duplicate_payment_id",
//         },
//       });
//     }

//     const [existingCase] = await connection.query(
//       `SELECT id, application_id, partner_loan_id, lan
//        FROM loan_booking_switch_my_loan
//        WHERE partner_loan_id = ?
//        LIMIT 1`,
//       [partner_loan_id]
//     );

//     let applicationId;
//     let lan = null;

//     if (existingCase.length > 0) {
//       applicationId = existingCase[0].application_id;
//       lan = existingCase[0].lan || null;

//       if (!applicationId) {
//         applicationId = generateApplicationId();

//         await connection.query(
//           `UPDATE loan_booking_switch_my_loan
//            SET application_id = ?
//            WHERE partner_loan_id = ?`,
//           [applicationId, partner_loan_id]
//         );
//       }
//     } else {
//       applicationId = generateApplicationId();

//       await connection.query(
//         `INSERT INTO loan_booking_switch_my_loan (
//           lan,
//           application_id,
//           partner_loan_id,
//           assessment_fee_amount,
//           assessment_fee_payment_date,
//           assessment_fee_payment_id,
//           assessment_fee_status,
//           status
//         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
//         [
//           null,
//           applicationId,
//           partner_loan_id,
//           amount,
//           formattedPaymentDate,
//           payment_id,
//           "RECEIVED",
//           "ASSESSMENT_FEE_RECEIVED",
//         ]
//       );
//     }

//     await connection.query(
//       `INSERT INTO switch_my_loan_assessment_fee (
//         application_id,
//         partner_loan_id,
//         lan,
//         amount,
//         payment_date,
//         payment_id,
//         api_status
//       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
//       [
//         applicationId,
//         partner_loan_id,
//         lan,
//         amount,
//         formattedPaymentDate,
//         payment_id,
//         "RECEIVED",
//       ]
//     );

//     await connection.query(
//       `UPDATE loan_booking_switch_my_loan
//        SET
//          assessment_fee_amount = ?,
//          assessment_fee_payment_date = ?,
//          assessment_fee_payment_id = ?,
//          assessment_fee_status = ?,
//          status = ?
//        WHERE partner_loan_id = ?`,
//       [
//         amount,
//         formattedPaymentDate,
//         payment_id,
//         "RECEIVED",
//         "ASSESSMENT_FEE_RECEIVED",
//         partner_loan_id,
//       ]
//     );

//     await connection.commit();
//     transactionStarted = false;

//     return res.json({
//       is_success: true,
//       data: {
//         status: "assessment fee details submitted successfully",
//         application_id: applicationId,
//       },
//     });
//   } catch (err) {
//     if (connection && transactionStarted) {
//       await connection.rollback();
//     }

//     console.error("Assessment fee API error:", err);

//     return res.status(500).json({
//       is_success: false,
//       error: {
//         message: err.message || "Failed to submit assessment fee details",
//         code: "server_error",
//       },
//     });
//   } finally {
//     if (connection) connection.release();
//   }
// });

router.post("/v1/loan/assessment-fee", verifyApiKey, async (req, res) => {
  let connection;
  let transactionStarted = false;
  try {
    connection = await db.promise().getConnection();
    const { partner_loan_id, amount, payment_date, payment_id } = req.body;
    if (
      !partner_loan_id ||
      amount === undefined ||
      !payment_date ||
      !payment_id
    ) {
      return res.status(400).json({
        is_success: false,
        error: {
          message:
            "partner_loan_id, amount, payment_date and payment_id are required",
          code: "request_validation_error",
        },
      });
    }
    if (Number(amount) !== POLICY.ASSESSMENT_FEE) {
      return res.status(400).json({
        is_success: false,
        error: {
          message: "Assessment fee amount must be 199",
          code: "assessment_fee_amount_invalid",
        },
      });
    }
    const formattedPaymentDate =
      parseApiDate(payment_date) || parsePartnerDate(payment_date);
    await connection.beginTransaction();
    transactionStarted = true;

    const [duplicate] = await connection.query(
      "SELECT id FROM switch_my_loan_assessment_fee WHERE payment_id = ? LIMIT 1",
      [payment_id],
    );
    if (duplicate.length) {
      await connection.rollback();
      transactionStarted = false;
      return res
        .status(409)
        .json({
          is_success: false,
          error: {
            message: "payment_id already exists",
            code: "duplicate_payment_id",
          },
        });
    }

    const [cases] = await connection.query(
      "SELECT id, application_id, lan FROM loan_booking_switch_my_loan WHERE partner_loan_id = ? LIMIT 1",
      [partner_loan_id],
    );
    let applicationId = cases[0]?.application_id || generateApplicationId();
    const lan = cases[0]?.lan || null;
    if (!cases.length) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(404).json({
        is_success: false,
        error: {
          message: "Loan case not found for partner_loan_id",
          code: "loan_not_found",
        },
      });
    }

    await connection.query(
      `UPDATE loan_booking_switch_my_loan
       SET application_id = ?, assessment_fee_amount = ?, assessment_fee_payment_date = ?, assessment_fee_payment_id = ?,
           aquisition_fees_txn_id = ?, assessment_fee_status = ?, updated_at = NOW()
       WHERE partner_loan_id = ?`,
      [
        applicationId,
        Number(amount),
        formattedPaymentDate,
        payment_id,
        payment_id,
        "RECEIVED",
        partner_loan_id,
      ],
    );

    await connection.query(
      `INSERT INTO switch_my_loan_assessment_fee (application_id, partner_loan_id, lan, amount, payment_date, payment_id, api_status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        applicationId,
        partner_loan_id,
        lan,
        Number(amount),
        formattedPaymentDate,
        payment_id,
        "RECEIVED",
      ],
    );
    await connection.commit();
    transactionStarted = false;
    return res.json({
      is_success: true,
      data: {
        status: "assessment fee details submitted successfully",
        application_id: applicationId,
      },
    });
  } catch (err) {
    if (connection && transactionStarted) await connection.rollback();
    console.error("Assessment fee API error:", { message: err.message });
    return res
      .status(500)
      .json({
        is_success: false,
        error: {
          message: err.message || "Failed to submit assessment fee details",
          code: "server_error",
        },
      });
  } finally {
    if (connection) connection.release();
  }
});
// 2) CREATE / SUBMIT LOAN APPLICATION
router.post("/v1/create", verifyApiKey, async (req, res) => {
  let connection;
  let transactionStarted = false;

  try {
    connection = await db.promise().getConnection();

    const data = req.body;

    if (!data.partner_loan_id) {
      return res.status(400).json({
        is_success: false,
        error: {
          message: "partner_loan_id required",
          code: "request_validation_error",
        },
      });
    }

    if (!data.lenderType || data.lenderType !== "RAPID-MONEY") {
      return res.status(400).json({
        is_success: false,
        error: {
          message: "Invalid lenderType.",
          code: "request_validation_error",
        },
      });
    }

    const payload = normalizeCreateUpdatePayload(data);

    await connection.beginTransaction();
    transactionStarted = true;

    // // 🔍 Check if assessment-fee entry exists
    const [existing] = await connection.query(
      `SELECT id, lan, application_id, status
  FROM loan_booking_switch_my_loan
  WHERE partner_loan_id = ?
  LIMIT 1
  `,
      [data.partner_loan_id],
    );

    if (existing.length) {
      await connection.rollback();
      transactionStarted = false;

      return res.status(409).json({
        is_success: false,
        error: {
          message: "Loan case already exists",
          code: "duplicate_loan_case",
        },
      });
    }

    const applicationId = generateApplicationId();

    const generated = await generateLoanIdentifiers(connection, "RAPID-MONEY");

    const lan = generated.lan;

    await connection.query(
      `
  INSERT INTO loan_booking_switch_my_loan
  (
    lan,
    partner_loan_id,
    application_id,
    customer_name,
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
    residence_status,
    employment_type,
    company_type,
    company_name,
    designation,
    salary_range,
    salary_mode,
    nature_of_business,
    aquisition_fees_txn_id,
    industry_type,
    monthly_income,
    address_line_1,
    address_line_2,
    address_pincode,
    address_city,
    address_state,
    is_current_address,
    current_address_line_1,
    current_address_line_2,
    current_address_pincode,
    current_address_city,
    current_address_state,
    loan_amount,
    tenure,
    loan_type,
    monthly_emi,
    interest_rate,
    processing_fee,
    repayment_count,
    payment_frequency,
    loan_application_date,
    agreement_date,
    repayment_date,
    agreement_signature_type,
    source,
    preferred_language,
    previous_loan_amount,
    total_disbursed_applications,
    bank_ac_name,
    bank_ac_number,
    bank_ifsc_code,
    bank_nach_umrn,
    bank_upi_id,
    kyc_json,
    bank_json,
    status,
    created_at,
    updated_at
  )
  VALUES
  (
    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
    NOW(), NOW()
  )
  `,
      [
        lan,
        data.partner_loan_id,
        applicationId,
        payload.full_name,
        payload.pan_number,
        payload.father_name,
        payload.dob,
        payload.gender,
        payload.mobile,
        payload.email,
        payload.pincode,
        payload.state,
        payload.city,
        payload.district,
        payload.residence_status,
        payload.employment_type,
        payload.company_type,
        payload.company_name,
        payload.designation,
        payload.salary_range,
        payload.salary_mode,
        payload.nature_of_business,
        payload.aquisition_fees_txn_id,
        payload.industry_type,
        payload.monthly_income,
        payload.address_line_1,
        payload.address_line_2,
        payload.address_pincode,
        payload.address_city,
        payload.address_state,
        payload.is_current_address,
        payload.current_address_line_1,
        payload.current_address_line_2,
        payload.current_address_pincode,
        payload.current_address_city,
        payload.current_address_state,
        payload.loan_amount,
        payload.tenure,
        payload.loan_type,
        payload.monthly_emi,
        payload.interest_rate,
        payload.processing_fee,
        payload.repayment_count,
        payload.payment_frequency,
        payload.loan_application_date,
        payload.agreement_date,
        payload.repayment_date,
        payload.agreement_signature_type,
        payload.source,
        payload.preferred_language,
        payload.previous_loan_amount,
        payload.total_disbursed_applications,
        payload.bank_ac_name,
        payload.bank_ac_number,
        payload.bank_ifsc_code,
        payload.bank_nach_umrn,
        payload.bank_upi_id,
        payload.kyc_json,
        payload.bank_json,
        "STEP_1_COMPLETED",
      ],
    );

    await connection.commit();
    transactionStarted = false;

    return res.json({
      is_success: true,
      data: {
        status: "loan case created successfully",
        lan,
        application_id: applicationId,
      },
    });
  } catch (err) {
    if (connection && transactionStarted) {
      await connection.rollback();
    }

    console.error("Create loan error:", err);

    return res.status(500).json({
      is_success: false,
      error: {
        message: "Internal server error",
        code: "internal_server_error",
      },
    });
  } finally {
    if (connection) connection.release();
  }
});

router.put("/v1/update-details", verifyApiKey, async (req, res) => {
  let connection;
  let transactionStarted = false;

  let bankVerificationJob = null;
  let shouldSendRejectionWebhook = false;
  let forcedStatus = null;

  try {
    connection = await db.promise().getConnection();

    const data = req.body || {};

    if (!data.partner_loan_id) {
      return res.status(400).json({
        is_success: false,
        error: {
          message: "partner_loan_id is required",
          code: "request_validation_error",
        },
      });
    }

    await connection.beginTransaction();
    transactionStarted = true;

    const [existing] = await connection.query(
      `SELECT *
       FROM loan_booking_switch_my_loan
       WHERE partner_loan_id = ?
       LIMIT 1
       FOR UPDATE`,
      [data.partner_loan_id],
    );

    if (!existing.length) {
      await connection.rollback();
      transactionStarted = false;

      return res.status(404).json({
        is_success: false,
        error: {
          message: "Loan case not found",
          code: "loan_not_found",
        },
      });
    }

    const row = existing[0];

    const BLOCKED_UPDATE_STATUSES = [
      "APPROVED",
      "BRE_APPROVED",
      "DISBURSE_INITIATED",
      "DISBURSED",
      "REJECTED",
      "REJECTED_BY_PARTNER",
      "CANCELLED",
      "CLOSED",
      "Fully Paid",
    ];

    if (BLOCKED_UPDATE_STATUSES.includes(row.status)) {
      await connection.rollback();
      transactionStarted = false;

      return res.status(400).json({
        is_success: false,
        error: {
          message:
            `Loan details cannot be updated when status is '${row.status}'`,
          code: "loan_update_not_allowed",
        },
      });
    }

    let lan = row.lan;
    let applicationId = row.application_id;

    const preUpdateFields = [];
    const preUpdateValues = [];

    if (!applicationId) {
      applicationId = generateApplicationId();
      preUpdateFields.push("application_id = ?");
      preUpdateValues.push(applicationId);
    }

    if (!lan) {
      const generated = await generateLoanIdentifiers(
        connection,
        "RAPID-MONEY",
      );

      lan = generated.lan;
      preUpdateFields.push("lan = ?");
      preUpdateValues.push(lan);
    }

    if (preUpdateFields.length > 0) {
      preUpdateValues.push(data.partner_loan_id);

      await connection.query(
        `UPDATE loan_booking_switch_my_loan
         SET ${preUpdateFields.join(", ")}
         WHERE partner_loan_id = ?`,
        preUpdateValues,
      );
    }

    const updateFields = [];
    const updateValues = [];

    const addField = (column, value) => {
      if (value !== undefined) {
        updateFields.push(`${column} = ?`);
        updateValues.push(value);
      }
    };

    // Basic customer details
    addField("customer_name", data.full_name);
    addField("pan_number", data.pan_number);
    addField("father_name", data.father_name);
    addField(
      "dob",
      data.dob
        ? normalizeDate(data.dob)
        : undefined,
    );
    addField("gender", data.gender);
    addField("mobile", data.mobile);
    addField("email", data.email);

    addField("pincode", data.pincode);
    addField("state", data.state);
    addField("city", data.city);
    addField("district", data.district);

    addField("residence_status", data.residence_type);
    addField("employment_type", data.employment_type);
    addField("company_type", data.company_type);
    addField("company_name", data.company_name);
    addField("designation", data.designation);
    addField("salary_range", data.salary_range);
    addField("salary_mode", data.salary_mode);

    addField("nature_of_business", data.nature_of_business);
    addField("industry_type", data.industry_type);
    addField("monthly_income", data.monthly_income);

    addField("address_line_1", data.address_line_1);
    addField("address_line_2", data.address_line_2);
    addField("address_pincode", data.address_pincode);
    addField("address_city", data.address_city);
    addField("address_state", data.address_state);

    addField("is_current_address", data.is_current_address);

    addField(
      "current_address_line_1",
      data.current_address_line_1,
    );
    addField(
      "current_address_line_2",
      data.current_address_line_2,
    );
    addField(
      "current_address_pincode",
      data.current_address_pincode,
    );
    addField(
      "current_address_city",
      data.current_address_city,
    );
    addField(
      "current_address_state",
      data.current_address_state,
    );

    addField("loan_amount", data.loan_amount);
    addField("tenure", data.tenure);
    addField("loan_type", data.loan_type);
    addField("monthly_emi", data.monthly_emi);
    addField("interest_rate", data.interest_rate);
    addField("processing_fee", data.processing_fee);
    addField(
      "aquisition_fees_txn_id",
      data.aquisition_fees_txn_id,
    );

    addField("repayment_count", data.repayment_count);
    addField("payment_frequency", data.payment_frequency);

    addField(
      "loan_application_date",
      data.loan_application_date
        ? normalizeDate(data.loan_application_date)
        : undefined,
    );

    addField(
      "agreement_date",
      data.agreement_date
        ? normalizeDate(data.agreement_date)
        : undefined,
    );

    addField(
      "repayment_date",
      data.repayment_date
        ? normalizeDate(data.repayment_date)
        : undefined,
    );

    addField(
      "agreement_signature_type",
      data.agreement_signature_type,
    );

    addField("source", data.source);
    addField("preferred_language", data.preferred_language);
    addField("previous_loan_amount", data.previous_loan_amount);
    addField(
      "total_disbursed_applications",
      data.total_disbursed_applications,
    );

    /*
     * Bank account handling
     */
    /*
 * Bank account handling
 *
 * Supports partial updates across multiple API calls.
 */
const hasBankAccountUpdate =
  Object.prototype.hasOwnProperty.call(
    data,
    "bank_account",
  );

const hasCustomerNameUpdate =
  Object.prototype.hasOwnProperty.call(
    data,
    "full_name",
  );

if (
  hasBankAccountUpdate ||
  hasCustomerNameUpdate
) {
  let bank = {};

  if (hasBankAccountUpdate) {
    if (
      !data.bank_account ||
      typeof data.bank_account !== "object" ||
      Array.isArray(data.bank_account)
    ) {
      await connection.rollback();
      transactionStarted = false;

      return res.status(400).json({
        is_success: false,
        error: {
          message:
            "bank_account must be an object",
          code:
            "request_validation_error",
        },
      });
    }

    bank = data.bank_account;

    if (Object.keys(bank).length === 0) {
      await connection.rollback();
      transactionStarted = false;

      return res.status(400).json({
        is_success: false,
        error: {
          message:
            "bank_account cannot be empty",
          code:
            "request_validation_error",
        },
      });
    }
  }

  const hasBankField = (field) =>
    Object.prototype.hasOwnProperty.call(
      bank,
      field,
    );

  /*
   * Use the new value when supplied.
   * Otherwise retain the existing database value.
   */
  const accountName =
    hasBankField("ac_name")
      ? String(bank.ac_name || "").trim()
      : String(
          row.bank_ac_name || "",
        ).trim();

  const accountNumber =
    hasBankField("ac_number")
      ? String(bank.ac_number || "").trim()
      : String(
          row.bank_ac_number || "",
        ).trim();

  const ifsc =
    hasBankField("ifsc_code")
      ? String(bank.ifsc_code || "")
          .trim()
          .toUpperCase()
      : String(
          row.bank_ifsc_code || "",
        )
          .trim()
          .toUpperCase();

  const customerName = String(
    hasCustomerNameUpdate
      ? data.full_name || ""
      : row.customer_name || "",
  ).trim();

  const coreBankFieldProvided =
    hasBankField("ac_name") ||
    hasBankField("ac_number") ||
    hasBankField("ifsc_code");

  const hasCompleteBankDetails =
    Boolean(
      accountName &&
        accountNumber &&
        ifsc,
    );

  /*
   * Update only the bank columns that
   * were actually included in this request.
   */
  if (hasBankField("ac_name")) {
    addField(
      "bank_ac_name",
      accountName,
    );
  }

  if (hasBankField("bank_name")) {
    addField(
      "bank_name",
      bank.bank_name,
    );
  }

  if (hasBankField("ac_number")) {
    addField(
      "bank_ac_number",
      accountNumber,
    );
  }

  if (hasBankField("ifsc_code")) {
    addField(
      "bank_ifsc_code",
      ifsc,
    );
  }

  if (hasBankField("nach_umrn")) {
    addField(
      "bank_nach_umrn",
      bank.nach_umrn,
    );
  }

  if (hasBankField("upi_id")) {
    addField(
      "bank_upi_id",
      bank.upi_id,
    );
  }

  /*
   * Merge the latest partial bank object
   * into the previously stored bank_json.
   */
  if (hasBankAccountUpdate) {
    let existingBankJson = {};

    try {
      existingBankJson =
        typeof row.bank_json === "string"
          ? JSON.parse(
              row.bank_json || "{}",
            )
          : row.bank_json || {};
    } catch (jsonError) {
      console.warn(
        "Existing bank_json could not be parsed",
        {
          partnerLoanId:
            data.partner_loan_id,
          message:
            jsonError.message,
        },
      );

      existingBankJson = {};
    }

    const mergedBankJson = {
      ...existingBankJson,
      ...bank,
    };

    /*
     * Store normalized core values.
     */
    if (hasBankField("ac_name")) {
      mergedBankJson.ac_name =
        accountName;
    }

    if (hasBankField("ac_number")) {
      mergedBankJson.ac_number =
        accountNumber;
    }

    if (hasBankField("ifsc_code")) {
      mergedBankJson.ifsc_code =
        ifsc;
    }

    addField(
      "bank_json",
      JSON.stringify(
        mergedBankJson,
      ),
    );
  }

  /*
   * A core bank field was supplied, but the
   * effective bank details are still incomplete.
   *
   * Save the partial details and wait for the
   * remaining fields in a later API call.
   */
  if (
    coreBankFieldProvided &&
    !hasCompleteBankDetails
  ) {
    addField(
      "bank_verification_status",
      "NOT_STARTED",
    );

    addField(
      "bank_is_verified",
      0,
    );

    addField(
      "bank_verification_response",
      null,
    );

    addField(
      "bank_verification_error",
      "INCOMPLETE_BANK_DETAILS",
    );

    addField(
      "bank_verified_at",
      null,
    );

    bankVerificationJob = null;
  }

  /*
   * Evaluate verification when:
   * - A core bank field was supplied, or
   * - Customer name was updated while complete
   *   bank details already exist.
   */
  const shouldEvaluateBank =
    hasCompleteBankDetails &&
    (
      coreBankFieldProvided ||
      hasCustomerNameUpdate
    );

  if (shouldEvaluateBank) {
    /*
     * Bank details can arrive before the customer name.
     * Save them and wait for a later name update.
     */
    if (!customerName) {
      addField(
        "bank_verification_status",
        "NOT_STARTED",
      );

      addField(
        "bank_is_verified",
        0,
      );

      addField(
        "bank_verification_response",
        null,
      );

      addField(
        "bank_verification_error",
        "CUSTOMER_NAME_REQUIRED",
      );

      addField(
        "bank_verified_at",
        null,
      );

      bankVerificationJob = null;
    } else if (
      SHOULD_MOCK_CLEAR_BANK
    ) {
      /*
       * UAT/test mock-clear:
       * skip name check and external bank API.
       */
      console.warn(
        "SML bank verification mock-clear enabled",
        {
          partnerLoanId:
            data.partner_loan_id,
          applicationId,
          lan,
          deploymentEnvironment:
            DEPLOYMENT_ENV,
          bankMode: BANK_MODE,
        },
      );

      addField(
        "bank_verification_status",
        "VERIFIED",
      );

      addField(
        "bank_is_verified",
        1,
      );

      addField(
        "bank_verification_response",
        JSON.stringify({
          success: true,
          verified: true,
          status: "VERIFIED",
          mode: "mock-clear",
          deployment_environment:
            DEPLOYMENT_ENV,
          name_check_bypassed: true,
          bank_api_bypassed: true,
          message:
            "Bank verification mock-cleared for test/UAT",
          verified_at:
            new Date().toISOString(),
        }),
      );

      addField(
        "bank_verification_error",
        null,
      );

      addField(
        "bank_verified_at",
        new Date(),
      );

      bankVerificationJob = null;
      forcedStatus = null;
      shouldSendRejectionWebhook =
        false;
    } else {
      /*
       * Normal live flow.
       */
      const isNameMatched =
        bankNamesMatch(
          customerName,
          accountName,
        );

      if (!isNameMatched) {
        addField(
          "bank_verification_status",
          "NAME_MISMATCH",
        );

        addField(
          "bank_is_verified",
          0,
        );

        addField(
          "bank_verification_response",
          JSON.stringify({
            reason:
              "Customer name and bank account name do not match",
            customer_name:
              customerName,
            bank_account_name:
              accountName,
          }),
        );

        addField(
          "bank_verification_error",
          "BANK_NAME_MISMATCH",
        );

        addField(
          "bank_verified_at",
          null,
        );

        bankVerificationJob = null;
        forcedStatus = "REJECTED";
        shouldSendRejectionWebhook =
          true;
      } else {
        const sameBankDetails =
          String(
            row.bank_ac_name || "",
          ).trim() === accountName &&
          String(
            row.bank_ac_number || "",
          ).trim() ===
            accountNumber &&
          String(
            row.bank_ifsc_code || "",
          )
            .trim()
            .toUpperCase() ===
            ifsc;

        const sameCustomerName =
          normalizeName(
            row.customer_name,
          ) ===
          normalizeName(
            customerName,
          );

        const verificationAlreadyHandled =
          sameBankDetails &&
          sameCustomerName &&
          [
            "PENDING",
            "VERIFIED",
          ].includes(
            row.bank_verification_status,
          );

        if (
          !verificationAlreadyHandled
        ) {
          addField(
            "bank_verification_status",
            "PENDING",
          );

          addField(
            "bank_is_verified",
            0,
          );

          addField(
            "bank_verification_response",
            null,
          );

          addField(
            "bank_verification_error",
            null,
          );

          addField(
            "bank_verified_at",
            null,
          );

          bankVerificationJob = {
            partnerLoanId:
              data.partner_loan_id,
            applicationId,
            lan,
            accountName,
            accountNumber,
            ifsc,
          };
        }
      }
    }
  }
}

    if (data.kyc !== undefined) {
      addField(
        "kyc_json",
        JSON.stringify(data.kyc),
      );
    }

    if (updateFields.length === 0) {
      await connection.rollback();
      transactionStarted = false;

      return res.status(400).json({
        is_success: false,
        error: {
          message: "No fields provided for update",
          code: "request_validation_error",
        },
      });
    }

    /*
     * Set the final status only once.
     */
    if (forcedStatus) {
      addField("status", forcedStatus);
    } else {
      const effectiveLoanAmount =
        data.loan_amount !== undefined
          ? data.loan_amount
          : row.loan_amount;

      const effectiveTenure =
        data.tenure !== undefined
          ? data.tenure
          : row.tenure;

      const normalStatus =
        effectiveLoanAmount && effectiveTenure
          ? "APPLICATION_COMPLETED"
          : "DETAILS_UPDATED";

      addField("status", normalStatus);
    }

    updateFields.push("updated_at = NOW()");
    updateValues.push(data.partner_loan_id);

    await connection.query(
      `UPDATE loan_booking_switch_my_loan
       SET ${updateFields.join(", ")}
       WHERE partner_loan_id = ?`,
      updateValues,
    );

    await connection.commit();
    transactionStarted = false;

    /*
     * Name mismatch:
     * - All details have already been saved.
     * - Loan has been marked REJECTED.
     * - Partner still receives the normal HTTP 200 response.
     */
    if (shouldSendRejectionWebhook) {
      setImmediate(() => {
        sendRejectionWebhook(applicationId).catch(
          (error) => {
            console.error(
              "SML name-mismatch rejection webhook failed:",
              error.message,
            );
          },
        );
      });
    }

    /*
     * Normal bank verification runs after the data is committed.
     * The partner receives the normal response immediately.
     */
    if (bankVerificationJob) {
      setImmediate(() => {
        verifySmlBankInBackground(
          bankVerificationJob,
        ).catch((error) => {
          console.error(
            "Unhandled SML bank verification error:",
            error,
          );
        });
      });
    }

    return res.json({
      is_success: true,
      data: {
        status: "loan details updated successfully",
        lan,
        application_id: applicationId,
      },
    });
  } catch (error) {
    if (connection && transactionStarted) {
      await connection.rollback();
    }

    console.error("Update details error:", error);

    return res.status(500).json({
      is_success: false,
      error: {
        message: "Internal server error",
        code: "internal_server_error",
      },
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

router.post(
  "/v1/loan/:application_id/consent",
  verifyApiKey,
  async (req, res) => {
    let connection;

    try {
      connection = await db.promise().getConnection();

      const { application_id } = req.params;

      const { consent_id, timestamp, consent, ip_address } = req.body;

      /* --------------------------------------------------- */
      /* VALIDATION */
      /* --------------------------------------------------- */

      if (!application_id) {
        return res.status(400).json({
          is_success: false,
          error: {
            message: "application_id is required",
            code: "request_validation_error",
          },
        });
      }

      if (!consent_id) {
        return res.status(400).json({
          is_success: false,
          error: {
            message: "consent_id is required",
            code: "request_validation_error",
          },
        });
      }

      if (!timestamp) {
        return res.status(400).json({
          is_success: false,
          error: {
            message: "timestamp is required",
            code: "request_validation_error",
          },
        });
      }

      if (!consent) {
        return res.status(400).json({
          is_success: false,
          error: {
            message: "consent is required",
            code: "request_validation_error",
          },
        });
      }

      /* --------------------------------------------------- */
      /* CHECK APPLICATION */
      /* --------------------------------------------------- */

      const [loanRows] = await connection.query(
        `
        SELECT id, lan
        FROM loan_booking_switch_my_loan
        WHERE application_id = ?
        LIMIT 1
        `,
        [application_id],
      );

      if (!loanRows.length) {
        return res.status(404).json({
          is_success: false,
          error: {
            message: "Application not found",
            code: "application_not_found",
          },
        });
      }

      /* --------------------------------------------------- */
      /* GENERATE CONSENT ID */
      /* --------------------------------------------------- */

      const loanConsentId = crypto.randomUUID();

      /* --------------------------------------------------- */
      /* SAVE CONSENT */
      /* --------------------------------------------------- */

      await connection.query(
        `
  UPDATE loan_booking_switch_my_loan
  SET
    assessment_fee_consent_id = ?,
    assessment_fee_consent = ?,
    assessment_fee_consent_timestamp = ?,
    assessment_fee_consent_ip = ?,
    loan_consent_id = ?,
    consent_version = ?
  WHERE application_id = ?
  `,
        [
          consent_id,
          consent,
          timestamp,
          ip_address || null,
          loanConsentId,
          null,
          application_id,
        ],
      );

      /* --------------------------------------------------- */
      /* RESPONSE */
      /* --------------------------------------------------- */

      return res.json({
        is_success: true,
        data: {
          loan_consent_id: loanConsentId,
          consent_version: null,
        },
      });
    } catch (err) {
      console.error("Consent API Error:", err);

      return res.status(500).json({
        is_success: false,
        error: toClientError(err),
      });
    } finally {
      if (connection) {
        connection.release();
      }
    }
  },
);

///        4)      approve api

function buildPartnerBreResponse(breResult = {}) {
  const decision = String(breResult?.decision || "").toUpperCase();

  if (decision === "REJECTED") {
    return {
      CREDIT_LIMIT_CHECK_RPM: {
        derived_values: {
          LIMIT_ASSIGNMENT_IS_NEW_CUSTOMER_RPM: 0,
          LIMIT_ASSIGNMENT_IS_REPEAT_CUSTOMER_RPM: 0,
        },
      },
    };
  }

  const creditLimit = Number(breResult?.creditLimit || 0);
  const newCustomer = breResult?.newCustomer === true;

  return {
    CREDIT_LIMIT_CHECK_RPM: {
      derived_values: {
        LIMIT_ASSIGNMENT_IS_NEW_CUSTOMER_RPM: newCustomer ? creditLimit : 0,
        LIMIT_ASSIGNMENT_IS_REPEAT_CUSTOMER_RPM: newCustomer ? 0 : creditLimit,
      },
    },
  };
}

// 4) APPROVE API
router.post(
  "/v1/loan/:application_id/approve",
  verifyApiKey,
  async (req, res) => {
    let connection;
    let transactionStarted = false;

    try {
      connection = await db.promise().getConnection();

      const { application_id } = req.params;
      const { onboarding_completed } = req.body;

      if (!application_id) {
        return res.status(400).json({
          is_success: false,
          error: {
            message: "application_id is required",
            code: "request_validation_error",
          },
        });
      }

      if (typeof onboarding_completed !== "boolean") {
        return res.status(400).json({
          is_success: false,
          error: {
            message: "onboarding_completed must be boolean",
            code: "request_validation_error",
          },
        });
      }

      const [existing] = await connection.query(
        `SELECT *
         FROM loan_booking_switch_my_loan
         WHERE application_id = ?
         LIMIT 1`,
        [application_id],
      );

      if (!existing.length) {
        return res.status(404).json({
          is_success: false,
          error: {
            message: "Loan application not found",
            code: "not_found",
          },
        });
      }

      const loan = existing[0];

      if (!loan.partner_loan_id) {
        return res.status(400).json({
          is_success: false,
          error: {
            message: "partner_loan_id missing for application",
            code: "request_validation_error",
          },
        });
      }

      const blockedStatuses = [
        "REJECTED",
        "CANCELLED",
        "DISBURSED",
        "CLOSED",
        "Fully Paid",
        "DISBURSE_INITIATED",
      ];

      if (blockedStatuses.includes(loan.status)) {
        return res.status(400).json({
          is_success: false,
          error: {
            message: "Application not eligible for approval",
            code: "request_validation_error",
          },
        });
      }

      const breEngineResult = await runBRE(loan);

      if (
        breEngineResult.decision === "TECHNICAL_FAILURE" ||
        breEngineResult.decision === "PENDING"
      ) {
        return res.status(503).json({
          is_success: false,
          error: {
            message: "Approval failed",
            code: "server_error",
          },
        });
      }

      if (
        breEngineResult.decision !== "APPROVED" &&
        breEngineResult.decision !== "REJECTED"
      ) {
        return res.status(500).json({
          is_success: false,
          error: {
            message: "Approval failed",
            code: "server_error",
          },
        });
      }

      if (breEngineResult.decision === "REJECTED") {
  const breResponse = buildPartnerBreResponse(breEngineResult);

  console.log("[SML] Triggering rejection webhook", {
    application_id,
    reason: breEngineResult.reason,
    amlScore: breEngineResult.aml?.score ?? null,
  });

  // await sendRejectionWebhook(application_id);

  await connection.query(
    `UPDATE loan_booking_switch_my_loan
     SET status = ?,
         sml_bre_status = ?,
         sml_bre_reason = ?,
         sml_credit_limit = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE application_id = ?`,
    [
      "REJECTED",
      "REJECTED",
      breEngineResult.reason || "BRE_REJECT",
      breEngineResult.creditLimit ?? null,
      application_id,
    ],
  );

  return res.json({
    is_success: true,
    data: {
      status: "Rejected",
      bre_response: breResponse,
    },
  });
}

      const approvedDisbursalAmount =
  Number(
    breEngineResult
      .approvedLoanAmount,
  );

if (
  !Number.isFinite(
    approvedDisbursalAmount,
  ) ||
  approvedDisbursalAmount <= 0
) {
  return res.status(500).json({
    is_success: false,
    error: {
      message:
        "Approved disbursal amount is missing or invalid",
      code:
        "approved_disbursal_amount_invalid",
    },
  });
}

      const breResponse = buildPartnerBreResponse(breEngineResult);

      if (onboarding_completed === false) {
        return res.json({
          is_success: true,
          data: {
            status: "Approved",
            bre_response: breResponse,
          },
        });
      }

      await connection.beginTransaction();
      transactionStarted = true;

      await connection.query(
        `UPDATE loan_booking_switch_my_loan
         SET
           status = ?,
           sml_bre_status = ?,
           sml_bre_reason = ?,
           sml_credit_limit = ?,
           disbursal_amount = ?,
           updated_at = CURRENT_TIMESTAMP
         WHERE application_id = ?`,
        [
          "BRE_APPROVED",
          "APPROVED",
          "BRE_CLEARED",
          breEngineResult.creditLimit || null,
          approvedDisbursalAmount,
          application_id,
        ],
      );

      await connection.commit();
      transactionStarted = false;

      return res.json({
        is_success: true,
        data: {
          status: "Approved",
          bre_response: breResponse,
        },
      });
    } catch (err) {
      if (connection && transactionStarted) {
        await connection.rollback();
      }

      console.error("Approve API error:", err);

      return res.status(500).json({
        is_success: false,
        error: {
          message: err.message || "Approval failed",
          code: "server_error",
        },
      });
    } finally {
      if (connection) connection.release();
    }
  },
);

////////////////trigger fund

// router.post(
//   "/v1/loan/:application_id/disburse",
//   verifyApiKey,
//   async (req, res) => {
//     let connection;

//     try {
//       connection = await db.promise().getConnection();

//       const { application_id } = req.params;
//       const { trigger_fund } = req.body;

//       return res.status(400).json({
//   is_success: false,
//   error: {
//     message: "application_id required",
//     code: "request_validation_error",
//   },
// });

//       if (trigger_fund !== true) {
//         return res.status(400).json({
//   is_success: false,
//   error: {
//     message: "trigger_fund must be true",
//     code: "request_validation_error",
//   },
// });
//       }

//       const [[loan]] = await connection.query(
//         `
//         SELECT
//           application_id,
//           lan,
//           status,
//           loan_amount,
//           processing_fee
//         FROM loan_booking_switch_my_loan
//         WHERE application_id = ?
//         LIMIT 1
//         `,
//         [application_id],
//       );

//       if (!loan) {
//         return res.status(404).json({
//           is_success: false,
//           error: {
//             message: "Loan case not found",
//             code: "loan_not_found",
//           },
//         });
//       }

//       if (loan.status !== "APPROVED") {
//         return res.status(400).json({
//           is_success: false,
//           error: {
//             message: "Loan not eligible for disbursement",
//             code: "loan_not_eligible_for_disbursement",
//           },
//         });
//       }

//       if (!loan.lan) {
//         return res.status(400).json({
//           is_success: false,
//           error: {
//             message: "LAN missing for this loan case",
//             code: "lan_missing",
//           },
//         });
//       }

//       const disbursalAmount =
//         Number(loan.loan_amount || 0);

//       /**
//        * Mark as initiated before payout call.
//        * This prevents repeated API hits from starting duplicate payouts.
//        */
//       await connection.query(
//         `
//         UPDATE loan_booking_switch_my_loan
//         SET
//           status = 'DISBURSE_INITIATED',
//           updated_at = NOW()
//         WHERE application_id = ?
//         `,
//         [application_id],
//       );

//       /**
//        * Fire-and-forget.
//        * API response will not wait for Easebuzz.
//        */
//       approveAndInitiatePayout({
//         lan: loan.lan,
//         table: "loan_booking_switch_my_loan",
//       }).catch((payoutErr) => {
//         console.error("Payout initiation failed for LAN:", loan.lan, payoutErr);
//       });

//       return res.json({
//         is_success: true,
//         data: {
//           status: "Disbursal Initiated",
//           amount: disbursalAmount.toFixed(2),
//           transaction_time: null,
//           transaction_id: null,
//         },
//       });
//     } catch (err) {
//       console.error("Disburse error:", err);

//       return res.status(500).json({
//         is_success: false,
//         error: {
//           message: "Disbursement failed",
//           code: "disbursement_failed",
//         },
//       });
//     } finally {
//       if (connection) connection.release();
//     }
//   },
// );

router.post(
  "/v1/loan/:application_id/disburse",
  verifyApiKey,
  async (req, res) => {
    let connection;
    let transactionStarted = false;

    try {
      connection = await db.promise().getConnection();

      const { application_id } = req.params;
      const { trigger_fund } = req.body;

      if (!application_id) {
        return res.status(400).json({
          is_success: false,
          error: {
            message: "application_id required",
            code: "request_validation_error",
          },
        });
      }

      if (trigger_fund !== true) {
        return res.status(400).json({
          is_success: false,
          error: {
            message: "trigger_fund must be true",
            code: "request_validation_error",
          },
        });
      }

      await connection.beginTransaction();
      transactionStarted = true;

      const [[loan]] = await connection.query(
        `
        SELECT
          application_id,
          lan,
          status,
          loan_amount,
          disbursal_amount,
          sml_credit_limit,
          processing_fee
        FROM loan_booking_switch_my_loan
        WHERE application_id = ?
        LIMIT 1
        FOR UPDATE
        `,
        [application_id],
      );

      if (!loan) {
        await connection.rollback();
        transactionStarted = false;

        return res.status(404).json({
          is_success: false,
          error: {
            message: "Loan case not found",
            code: "loan_not_found",
          },
        });
      }

      if (loan.status !== "BRE_APPROVED") {
        await connection.rollback();
        transactionStarted = false;

        return res.status(400).json({
          is_success: false,
          error: {
            message: "Loan not eligible for disbursement",
            code: "request_validation_error",
          },
        });
      }

      if (!loan.lan) {
        await connection.rollback();
        transactionStarted = false;

        return res.status(400).json({
          is_success: false,
          error: {
            message: "LAN missing for this loan case",
            code: "lan_not_generated",
          },
        });
      }

      const [[existingTransfer]] = await connection.query(
        `
        SELECT id, payout_status
        FROM quick_transfers
        WHERE lan = ?
        LIMIT 1
        `,
        [loan.lan],
      );

      if (existingTransfer) {
        await connection.rollback();
        transactionStarted = false;

        return res.status(409).json({
          is_success: false,
          error: {
            message: "Payout already initiated for this loan",
            code: "duplicate_payout_request",
          },
        });
      }

      const disbursalAmount =
  Number(
    loan.disbursal_amount ?? 0,
  );

const approvedCreditLimit =
  Number(
    loan.sml_credit_limit ?? 0,
  );

      if (!Number.isFinite(disbursalAmount) || disbursalAmount <= 0) {
        await connection.rollback();
        transactionStarted = false;
        return res.status(400).json({
          is_success: false,
          error: {
            message: "Approved net disbursal amount is missing or invalid",
            code: "invalid_disbursal_amount",
          },
        });
      }
      if (
  !Number.isFinite(
    approvedCreditLimit,
  ) ||
  approvedCreditLimit <= 0
) {
  await connection.rollback();
  transactionStarted = false;

  return res.status(400).json({
    is_success: false,
    error: {
      message:
        "Approved credit limit is missing or invalid",
      code:
        "invalid_credit_limit",
    },
  });
}

if (
  disbursalAmount >
  approvedCreditLimit
) {
  await connection.rollback();
  transactionStarted = false;

  return res.status(400).json({
    is_success: false,
    error: {
      message:
        "Disbursal amount exceeds approved credit limit",
      code:
        "disbursal_exceeds_credit_limit",
    },
  });
}

      await connection.query(
        `
        UPDATE loan_booking_switch_my_loan
        SET
          status = 'DISBURSE_INITIATED',
          updated_at = NOW()
        WHERE application_id = ?
        `,
        [application_id],
      );

      await connection.commit();
      transactionStarted = false;

      approveAndInitiatePayout({
        lan: loan.lan,
        table: "loan_booking_switch_my_loan",
      }).catch((payoutErr) => {
        console.error("Payout initiation failed for LAN:", loan.lan, payoutErr);
      });

      return res.json({
        is_success: true,
        data: {
          status: "Disbursal Initiated",
          amount: disbursalAmount.toFixed(2),
          transaction_time: null,
          transaction_id: null,
        },
      });
    } catch (err) {
      if (connection && transactionStarted) {
        await connection.rollback();
      }

      console.error("Disburse error:", err);

      return res.status(500).json({
        is_success: false,
        error: {
          message: "Internal server error",
          code: "internal_server_error",
        },
      });
    } finally {
      if (connection) connection.release();
    }
  },
);

///////////////////// Partner-Initiated Rejection
router.post(
  "/v1/loan/:application_id/reject-by-partner",
  verifyApiKey,
  async (req, res) => {
    try {
      const { application_id } = req.params;

      if (!application_id) {
        return res.status(400).json({
          is_success: false,
          error: {
            message: "application_id is required",
            code: "request_validation_error",
          },
        });
      }

      const [existing] = await db.promise().query(
        `SELECT application_id, status
         FROM loan_booking_switch_my_loan
         WHERE application_id = ?
         LIMIT 1`,
        [application_id],
      );

      if (!existing.length) {
        return res.status(404).json({
          is_success: false,
          error: {
            message: "Loan application not found",
            code: "not_found",
          },
        });
      }

      const loan = existing[0];

      if (
        [
          "DISBURSED",
          "DISBURSE_INITIATED",
          "Disbursed",
          "CANCELLED",
          "CLOSED",
          "Fully Paid",
          "REJECTED_BY_PARTNER",
        ].includes(loan.status)
      ) {
        return res.status(400).json({
          is_success: false,
          error: {
            message: `Cannot reject a loan with status '${loan.status}'`,
            code: "request_validation_error",
          },
        });
      }

      await db.promise().query(
        `UPDATE loan_booking_switch_my_loan
         SET status = 'REJECTED_BY_PARTNER', updated_at = NOW()
         WHERE application_id = ?`,
        [application_id],
      );

      return res.json({
        is_success: true,
        data: {
          success: true,
        },
      });
    } catch (err) {
      console.error("Reject-by-partner error:", err);

      return res.status(500).json({
        is_success: false,
        error: {
          message: "Internal server error",
          code: "internal_server_error",
        },
      });
    }
  },
);

///////////////////// 6) Repayment API
router.post(
  "/v1/loan/:application_id/repayment",
  verifyApiKey,
  async (req, res) => {
    try {
      const { application_id } = req.params;
      const { amount, payment_date, payment_id, payment_mode, utr } =
        req.body || {};

      if (!req.body || Object.keys(req.body).length === 0) {
        console.error("Repayment API error: empty request body", {
          application_id,
          headers: req.headers,
        });

        return res.status(400).json({
          is_success: false,
          error: {
            message: "Request body is empty or invalid JSON",
            code: "request_validation_error",
          },
        });
      }

      const missingFields = [];
      if (!application_id) missingFields.push("application_id");
      if (!amount) missingFields.push("amount");
      if (!payment_date) missingFields.push("payment_date");
      if (!payment_id) missingFields.push("payment_id");

      if (missingFields.length) {
        console.error("Repayment API validation failure", {
          application_id,
          missingFields,
          body: req.body,
        });

        return res.status(400).json({
          is_success: false,
          error: {
            message: `Missing required fields: ${missingFields.join(", ")}`,
            code: "request_validation_error",
          },
        });
      }

      const [loan] = await db.promise().query(
        `SELECT lan
         FROM loan_booking_switch_my_loan
         WHERE application_id = ?
         LIMIT 1`,
        [application_id],
      );

      if (!loan.length) {
        return res.status(404).json({
          is_success: false,
          error: {
            message: "Loan case not found",
            code: "loan_not_found",
          },
        });
      }

      const lan = loan[0].lan;

      if (!lan) {
        return res.status(400).json({
          is_success: false,
          error: {
            message: "LAN not generated yet",
            code: "lan_not_generated",
          },
        });
      }

      const paymentDate = parseApiDate(payment_date);

      if (!paymentDate) {
        return res.status(400).json({
          is_success: false,
          error: {
            message: "Invalid payment_date format",
            code: "request_validation_error",
          },
        });
      }

      const sheetData = [
        {
          LAN: lan,
          UTR: utr || payment_id,
          "Payment Date": paymentDate,
          "Bank Date": paymentDate,
          "Payment Id": payment_id,
          "Payment Mode": payment_mode || "API",
          "Transfer Amount": amount,
          __row: 1,
        },
      ];

      console.log("Repayment sheet data:", sheetData);
      const result = await processRows(sheetData);
      console.log("Repayment processor result:", result);

      /* ==============================
         HANDLE FAILURE
      ============================== */

      if (!result.success) {
        return res.status(400).json({
          is_success: false,
          error: {
            message:
              result.error?.message ||
              result.message ||
              "Repayment processing failed",
            code: result.error?.code || "request_validation_error",
            details: result.error?.details || result.details,
          },
        });
      }

      if (result.failed_rows > 0) {
        const firstError = result.row_errors?.[0];

        return res.status(400).json({
          is_success: false,
          error: {
            message: firstError?.reason || "Repayment processing failed",
            code: "request_validation_error",
          },
        });
      }

      /* ==============================
         SUCCESS RESPONSE
      ============================== */

      return res.json({
        is_success: true,
        data: {
          status: "repayment submitted successfully",
        },
      });
    } catch (err) {
      console.error("Repayment API error:", err);

      return res.status(500).json({
        is_success: false,
        error: {
          message: "Internal server error",
          code: "internal_server_error",
        },
      });
    }
  },
);

///////////////////// 7) Loan charges api
router.post(
  "/v1/loan/:application_id/repayment-charges",
  verifyApiKey,
  async (req, res) => {
    try {
      const { application_id } = req.params;
      const { type, amount, due_date, remarks } = req.body;

      if (!application_id) {
        return res.status(400).json({
          is_success: false,
          error: {
            message: "application_id required",
            code: "request_validation_error",
          },
        });
      }

      if (!type || !amount || !due_date) {
        return res.status(400).json({
          is_success: false,
          error: {
            message: "type, amount, due_date required",
            code: "request_validation_error",
          },
        });
      }

      if (Number(amount) <= 0) {
        return res.status(400).json({
          is_success: false,
          error: {
            message: "amount must be greater than zero",
            code: "request_validation_error",
          },
        });
      }

      const [loan] = await db.promise().query(
        `SELECT lan
         FROM loan_booking_switch_my_loan
         WHERE application_id = ?
         LIMIT 1`,
        [application_id],
      );

      if (!loan.length) {
        return res.status(404).json({
          is_success: false,
          error: {
            message: "Loan case not found",
            code: "loan_not_found",
          },
        });
      }

      const lan = loan[0].lan;

      if (!lan) {
        return res.status(400).json({
          is_success: false,
          error: {
            message: "LAN not generated yet",
            code: "lan_not_generated",
          },
        });
      }

      const parsedDate = parseApiDate(due_date);

      if (!parsedDate) {
        return res.status(400).json({
          is_success: false,
          error: {
            message: "Invalid due_date",
            code: "request_validation_error",
          },
        });
      }

      await db.promise().query(
        `INSERT INTO loan_charges
        (lan, charge_date, due_date, amount, charge_type, remarks)
        VALUES (?, CURDATE(), ?, ?, ?, ?)`,
        [lan, parsedDate, amount, type, remarks || null],
      );

      return res.json({
        is_success: true,
        data: {
          status: "charge added successfully",
        },
      });
    } catch (err) {
      console.error("Charge insert error:", err);

      return res.status(500).json({
        is_success: false,
        error: {
          message: "Internal server error",
          code: "internal_server_error",
        },
      });
    }
  },
);

///////////////////// 8 ) extra chrges waiver api
router.post("/v1/loan/extra_charge_waiver", verifyApiKey, async (req, res) => {
  try {
    const rows = req.body.data;

    if (!Array.isArray(rows) || !rows.length) {
      return res.status(400).json({
        is_success: false,
        error: {
          message: "Invalid payload",
          code: "request_validation_error",
        },
      });
    }

    for (const row of rows) {
      const { partner_loan_id, charge_type, waiver_amount } = row;

      if (!partner_loan_id || !charge_type || !waiver_amount) {
        return res.status(400).json({
          is_success: false,
          error: {
            message: "partner_loan_id, charge_type, waiver_amount required",
            code: "request_validation_error",
          },
        });
      }

      if (Number(waiver_amount) <= 0) {
        return res.status(400).json({
          is_success: false,
          error: {
            message: "waiver_amount must be greater than zero",
            code: "request_validation_error",
          },
        });
      }

      const [loan] = await db.promise().query(
        `SELECT lan
           FROM loan_booking_switch_my_loan
           WHERE partner_loan_id = ?
           LIMIT 1`,
        [partner_loan_id],
      );

      if (!loan.length) {
        return res.status(404).json({
          is_success: false,
          error: {
            message: `Loan not found for ${partner_loan_id}`,
            code: "loan_not_found",
          },
        });
      }

      const lan = loan[0].lan;

      if (!lan) {
        return res.status(400).json({
          is_success: false,
          error: {
            message: "LAN not generated yet",
            code: "lan_not_generated",
          },
        });
      }

      const [charge] = await db.promise().query(
        `SELECT id, amount, waived_amount
           FROM loan_charges
           WHERE lan = ?
           AND charge_type = ?
           AND paid_status = 'Unpaid'
           ORDER BY due_date ASC
           LIMIT 1`,
        [lan, charge_type],
      );

      if (!charge.length) {
        return res.status(404).json({
          is_success: false,
          error: {
            message: "Charge not found or already settled",
            code: "charge_not_found",
          },
        });
      }

      const chargeRow = charge[0];

      const outstanding =
        Number(chargeRow.amount || 0) -
        Number(chargeRow.paid_amount || 0) -
        Number(chargeRow.waived_amount || 0) -
        Number(chargeRow.waived_off || 0);

      if (Number(waiver_amount) > outstanding) {
        return res.status(400).json({
          is_success: false,
          error: {
            message: "Waiver amount exceeds outstanding charge amount",
            code: "request_validation_error",
          },
        });
      }

      const newWaivedAmount =
        Number(chargeRow.waived_amount || 0) + Number(waiver_amount);

      const updatedOutstanding = outstanding - Number(waiver_amount);

      let newStatus = "Partially Waived";

      if (updatedOutstanding <= 0) {
        newStatus = "Waived";
      }

      await db.promise().query(
        `UPDATE loan_charges
           SET waived_amount = ?,
               waived_off = ?,
               paid_status = ?
           WHERE id = ?`,
        [newWaivedAmount, waiver_amount, newStatus, chargeRow.id],
      );
    }

    return res.json({
      is_success: true,
      data: {
        status: "charge waiver applied successfully",
      },
    });
  } catch (err) {
    console.error("Waiver error:", err);

    return res.status(500).json({
      is_success: false,
      error: {
        message: "Internal server error",
        code: "internal_server_error",
      },
    });
  }
});

// router.post("/v1/loan/:application_id/extra_charge_waiver", verifyApiKey, async (req, res) => {
//     try {
//       const { application_id } = req.params;

//       const {
//         charge_type,
//         waiver_amount,
//       } = req.body;

//       /* ==============================
//          VALIDATION
//       ============================== */

//       if (!application_id) {
//         return res.status(400).json({
//           is_success: false,
//           error: {
//             message:
//               "application_id required",
//             code:
//               "request_validation_error",
//           },
//         });
//       }

//       if (
//         !charge_type ||
//         waiver_amount === undefined ||
//         waiver_amount === null
//       ) {
//         return res.status(400).json({
//           is_success: false,
//           error: {
//             message:
//               "charge_type, waiver_amount required",
//             code:
//               "request_validation_error",
//           },
//         });
//       }

//       if (
//         Number(waiver_amount) <= 0
//       ) {
//         return res.status(400).json({
//           is_success: false,
//           error: {
//             message:
//               "waiver_amount must be greater than zero",
//             code:
//               "request_validation_error",
//           },
//         });
//       }

//       /* ==============================
//          FETCH LOAN
//       ============================== */

//       const [loan] = await db.promise().query(
//         `
//         SELECT lan
//         FROM loan_booking_switch_my_loan
//         WHERE application_id = ?
//         LIMIT 1
//         `,
//         [application_id]
//       );

//       if (!loan.length) {
//         return res.status(404).json({
//           is_success: false,
//           error: {
//             message:
//               "Loan case not found",
//             code: "loan_not_found",
//           },
//         });
//       }

//       const lan = loan[0].lan;

//       if (!lan) {
//         return res.status(400).json({
//           is_success: false,
//           error: {
//             message:
//               "LAN not generated yet",
//             code:
//               "lan_not_generated",
//           },
//         });
//       }

//       /* ==============================
//          FETCH CHARGE
//       ============================== */

//       const [charge] = await db.promise().query(
//         `
//         SELECT
//           id,
//           amount,
//           paid_amount,
//           waived_amount,
//           waived_off
//         FROM loan_charges
//         WHERE lan = ?
//         AND charge_type = ?
//         AND paid_status IN (
//           'Unpaid',
//           'Partially Paid',
//           'Partially Waived'
//         )
//         ORDER BY due_date ASC
//         LIMIT 1
//         `,
//         [lan, charge_type]
//       );

//       if (!charge.length) {
//         return res.status(404).json({
//           is_success: false,
//           error: {
//             message:
//               "Charge not found or already settled",
//             code:
//               "charge_not_found",
//           },
//         });
//       }

//       const chargeRow = charge[0];

//       /* ==============================
//          OUTSTANDING CALCULATION
//       ============================== */

//       const outstanding =
//         Number(chargeRow.amount || 0)
//         - Number(chargeRow.paid_amount || 0)
//         - Number(chargeRow.waived_amount || 0)
//         - Number(chargeRow.waived_off || 0);

//       if (
//         Number(waiver_amount) >
//         outstanding
//       ) {
//         return res.status(400).json({
//           is_success: false,
//           error: {
//             message:
//               "Waiver amount exceeds outstanding charge amount",
//             code:
//               "request_validation_error",
//           },
//         });
//       }

//       /* ==============================
//          WAIVER UPDATE
//       ============================== */

//       const newWaivedAmount =
//         Number(
//           chargeRow.waived_amount || 0
//         ) + Number(waiver_amount);

//       const updatedOutstanding =
//         outstanding -
//         Number(waiver_amount);

//       let newStatus =
//         "Partially Waived";

//       if (updatedOutstanding <= 0) {
//         newStatus = "Waived";
//       }

//       await db.promise().query(
//         `
//         UPDATE loan_charges
//         SET
//           waived_amount = ?,
//           waived_off = ?,
//           paid_status = ?
//         WHERE id = ?
//         `,
//         [
//           newWaivedAmount,
//           waiver_amount,
//           newStatus,
//           chargeRow.id,
//         ]
//       );

//       console.log(
//         "💠 Charge waiver applied",
//         {
//           lan,
//           charge_type,
//           waiver_amount,
//         }
//       );

//       /* ==============================
//          SUCCESS RESPONSE
//       ============================== */

//       return res.json({
//         is_success: true,
//         data: {
//           status:
//             "charge waiver applied successfully",
//         },
//       });
//     } catch (err) {
//       console.error(
//         "Waiver error:",
//         err
//       );

//       return res.status(500).json({
//         is_success: false,
//         error: {
//           message:
//             "Internal server error",
//           code:
//             "internal_server_error",
//         },
//       });
//     }
//   }
// );

router.get(
  "/v1/loan/:application_id/customer-details",
  verifyApiKey,
  async (req, res) => {
    let connection;
    try {
      connection = await db.promise().getConnection();
      const { application_id } = req.params;

      const [existing] = await connection.query(
        `SELECT * FROM loan_booking_switch_my_loan WHERE application_id = ? LIMIT 1`,
        [application_id],
      );

      if (!existing.length) {
        return res.status(404).json({
          is_success: false,
          error: {
            message: "Loan application not found",
            code: "not_found",
          },
        });
      }

      const loan = existing[0];

      return res.json({
        is_success: true,
        data: {
          partner_loan_id: loan.partner_loan_id,
          application_id: loan.application_id,
          lan: loan.lan,
          status: loan.status,

          full_name: loan.customer_name,
          pan_number: loan.pan_number,
          father_name: loan.father_name,
          dob: loan.borrower_dob || loan.dob,
          gender: loan.gender,
          mobile: loan.mobile,
          email: loan.email,
          pincode: loan.pincode,
          state: loan.state,
          city: loan.city,
          district: loan.district,

          residence_status: loan.residence_status,
          employment_type: loan.employment_type,
          company_type: loan.company_type,
          company_name: loan.company_name,
          designation: loan.designation,
          salary_range: loan.salary_range,
          salary_mode: loan.salary_mode,
          nature_of_business: loan.nature_of_business,
          industry_type: loan.industry_type,
          monthly_income: loan.monthly_income,

          address_line_1: loan.address_line_1,
          address_line_2: loan.address_line_2,
          address_pincode: loan.address_pincode,
          address_city: loan.address_city,
          address_state: loan.address_state,
          is_current_address: loan.is_current_address,
          current_address_line_1: loan.current_address_line_1,
          current_address_line_2: loan.current_address_line_2,
          current_address_pincode: loan.current_address_pincode,
          current_address_city: loan.current_address_city,
          current_address_state: loan.current_address_state,

          loan_amount: loan.loan_amount,
          tenure: loan.tenure,
          loan_type: loan.loan_type,
          monthly_emi: loan.emi_amount || loan.monthly_emi,
          interest_rate: loan.interest_rate,
          processing_fee: loan.processing_fee,
          repayment_count: loan.repayment_count,
          payment_frequency: loan.payment_frequency,

          loan_application_date: loan.loan_application_date,
          agreement_date: loan.agreement_date,
          repayment_date: loan.repayment_date,
          agreement_signature_type: loan.agreement_signature_type,
          source: loan.source,
          preferred_language: loan.preferred_language,
          previous_loan_amount: loan.previous_loan_amount,
          total_disbursed_applications: loan.total_disbursed_applications,

          bank_account: {
            ac_name: loan.bank_ac_name,
            ac_number: loan.bank_ac_number,
            ifsc_code: loan.bank_ifsc_code,
            nach_umrn: loan.bank_nach_umrn,
            upi_id: loan.bank_upi_id,
          },

          kyc: loan.kyc_json ? JSON.parse(loan.kyc_json) : null,
        },
      });
    } catch (error) {
      console.error("Fetch partner details error:", error);
      return res.status(500).json({
        is_success: false,
        error: {
          message: "Failed to fetch details",
          code: "server_error",
        },
      });
    } finally {
      if (connection) connection.release();
    }
  },
);

router.post("/v1/bre/test-eligibility", async (req, res) => {
  try {
    /* * Keep the testing endpoint disabled unless * explicitly enabled through environment. */ if (
      String(
        process.env.ENABLE_RAPID_MONEY_BRE_TEST_API || "",
      ).toLowerCase() !== "true"
    ) {
      return res
        .status(404)
        .json({
          is_success: false,
          error: {
            message: "BRE testing API is disabled",
            code: "bre_testing_api_disabled",
          },
        });
    }
    const result = evaluateRapidMoneyEligibility(req.body);
    if (result.decision === "VALIDATION_ERROR") {
      return res
        .status(400)
        .json({
          is_success: false,
          data: result,
          error: {
            message: "Invalid BRE test payload",
            code: "bre_test_validation_error",
            details: result.validationErrors,
          },
        });
    }
    return res.status(200).json({ is_success: true, data: result });
  } catch (error) {
    console.error("[RapidMoney BRE Test] failed", {
      message: error.message,
      stack: error.stack,
    });
    return res
      .status(500)
      .json({
        is_success: false,
        error: {
          message: error.message || "BRE test execution failed",
          code: "bre_test_execution_failed",
        },
      });
  }
});

module.exports = router;
