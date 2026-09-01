const express = require("express");

const db = require("../../config/db");
const verifyApiKey = require("../../middleware/apiKeyAuth");

const router = express.Router();
const runQuickMoneyBRE =
  require("./quickMoneyBre");

  const { excelSerialDateToJS, queryDB } = require("../../utils/helpers");
  
  const { verifyBank } = require("../../services/enachService");
  const { approveAndInitiatePayout } = require("../../services/payout.service");
  const {
  extractPartnerName,
  getMonthYear,
  validatePartnerName,
} = require("../../utils/partnerHelpers");
const partnerLimitService = require("../../services/partnerLimitService");
const { allocateRepaymentByLAN } = require("../../utils/allocate");
const { POLICY } = require("../switchMyLoan/rapidMoneyPolicy");

const {
  evaluateQuickMoneyEligibility,
} = require("./quickMoneyEligibilityEvaluator");

  
const normalizeDate = (value) => {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString().split("T")[0];
};

const generateApplicationId = () => {
  const timestamp = Date.now();
  const random = Math.floor(1000 + Math.random() * 9000);

  return `QMAPP${timestamp}${random}`;
};

const generateLoanIdentifiers = async (connection, lender) => {
  const normalizedLender = lender.trim();

  let prefixLan;

  if (normalizedLender === "QUICKMONEY") {
    prefixLan = "QML10";
  } else {
    throw new Error("Invalid lender type.");
  }

  const [rows] = await connection.query(
    `
    SELECT last_sequence
    FROM loan_sequences
    WHERE lender_name = ?
    FOR UPDATE
    `,
    [normalizedLender],
  );

  let newSequence;

  if (rows.length > 0) {
    newSequence = rows[0].last_sequence + 1;

    await connection.query(
      `
      UPDATE loan_sequences
      SET last_sequence = ?
      WHERE lender_name = ?
      `,
      [newSequence, normalizedLender],
    );
  } else {
    newSequence = 11000;

    await connection.query(
      `
      INSERT INTO loan_sequences
      (lender_name, last_sequence)
      VALUES (?, ?)
      `,
      [normalizedLender, newSequence],
    );
  }

  return {
    lan: `${prefixLan}${newSequence}`,
  };
};

const normalizeQuickMoneyPayload = (data) => {
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

    aquisition_fees_txn_id:
      data.aquisition_fees_txn_id ?? null,

    industry_type: data.industry_type ?? null,
    monthly_income: data.monthly_income ?? null,

    address_line_1: data.address_line_1 ?? null,
    address_line_2: data.address_line_2 ?? null,
    address_pincode: data.address_pincode ?? null,
    address_city: data.address_city ?? null,
    address_state: data.address_state ?? null,

    is_current_address:
      data.is_current_address === undefined
        ? null
        : data.is_current_address,

    current_address_line_1:
      data.current_address_line_1 ?? null,

    current_address_line_2:
      data.current_address_line_2 ?? null,

    current_address_pincode:
      data.current_address_pincode ?? null,

    current_address_city:
      data.current_address_city ?? null,

    current_address_state:
      data.current_address_state ?? null,

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

    agreement_signature_type:
      data.agreement_signature_type ?? null,

    source: data.source ?? null,
    preferred_language: data.preferred_language ?? null,

    previous_loan_amount:
      data.previous_loan_amount ?? null,

    total_disbursed_applications:
      data.total_disbursed_applications ?? null,

    bank_ac_name:
      data.bank_account?.ac_name ?? null,

    bank_ac_number:
      data.bank_account?.ac_number ?? null,

    bank_ifsc_code:
      data.bank_account?.ifsc_code ?? null,

    bank_nach_umrn:
      data.bank_account?.nach_umrn ?? null,

    bank_upi_id:
      data.bank_account?.upi_id ?? null,

    kyc_json: data.kyc
      ? JSON.stringify(data.kyc)
      : null,

    bank_json: data.bank_account
      ? JSON.stringify(data.bank_account)
      : null,
  };
};


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

  const SHOULD_MOCK_CLEAR_BANK =
  ["test", "uat"].includes(DEPLOYMENT_ENV) &&
  BANK_MODE === "mock-clear";


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
          `SELECT lan FROM loan_booking_quick_money WHERE lan IN (?)`,
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

  function normalizeName(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}
function getBankNameParts(value) {
  const ignoredWords = new Set([
    "mr",
    "mrs",
    "ms",
    "miss",
    "master",
    "shri",
    "smt",
    "dr",
  ]);

  let name = String(value || "")
    .trim()
    .toLowerCase();

  /*
   * Remove relationship details.
   *
   * Example:
   * RAMBHAJAN SAINI S/O BADRI NARAYAN SAINI
   *
   * becomes:
   * RAMBHAJAN SAINI
   */
  name = name.replace(
    /\b(?:s\/o|d\/o|w\/o|c\/o|son\s+of|daughter\s+of|wife\s+of|care\s+of)\b.*$/i,
    "",
  );

  return name
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((part) => !ignoredWords.has(part));
}

function bankNameTokenMatches(a, b) {
    if (!a || !b) {
    return false;
  }

  // Exact match
  if (a === b) {
    return true;
  }

  /*
   * Initial matching
   *
   * S ↔ SANTOSH
   * C ↔ CHANDRANNA
   * A ↔ ADESH
   */

  if (
    a.length === 1 &&
    b.startsWith(a)
  ) {
    return true;
  }

  if (
    b.length === 1 &&
    a.startsWith(b)
  ) {
    return true;
  }

  return false;
}

function bankNameSequenceMatches(
  customerParts,
  bankParts,
  customerIndex = 0,
  bankIndex = 0,
) {
  if (
    customerIndex === customerParts.length &&
    bankIndex === bankParts.length
  ) {
    return true;
  }

  if (
    customerIndex >= customerParts.length ||
    bankIndex >= bankParts.length
  ) {
    return false;
  }

  /*
   * Allow maximum 3 words to be joined.
   *
   * Examples:
   *
   * VEENA + RAJ = VEENARAJ
   *
   * SHIVA + SHANKAR = SHIVASHANKAR
   *
   * MANOJ + KUMAR = MANOJKUMAR
   */

  const maxCustomerJoin = Math.min(
    3,
    customerParts.length - customerIndex,
  );

  const maxBankJoin = Math.min(
    3,
    bankParts.length - bankIndex,
  );

  for (
    let customerCount = 1;
    customerCount <= maxCustomerJoin;
    customerCount++
  ) {
    const customerJoined = customerParts
      .slice(
        customerIndex,
        customerIndex + customerCount,
      )
      .join("");

    for (
      let bankCount = 1;
      bankCount <= maxBankJoin;
      bankCount++
    ) {
      const bankJoined = bankParts
        .slice(
          bankIndex,
          bankIndex + bankCount,
        )
        .join("");

      let currentMatch = false;

      /*
       * For single words allow initials.
       */
      if (
        customerCount === 1 &&
        bankCount === 1
      ) {
        currentMatch =
          bankNameTokenMatches(
            customerJoined,
            bankJoined,
          );
      } else {
        /*
         * For joined words require exact equality.
         */
        currentMatch =
          customerJoined === bankJoined;
      }

      if (!currentMatch) {
        continue;
      }

      if (
        bankNameSequenceMatches(
          customerParts,
          bankParts,
          customerIndex + customerCount,
          bankIndex + bankCount,
        )
      ) {
        return true;
      }
    }
  }

  return false;
}

function omittedBankMiddleNameMatch(
  customerParts,
  bankParts,
) {
  if (
    customerParts.length < 2 ||
    bankParts.length < 2
  ) {
    return false;
  }

  /*
   * At least one side must contain
   * first + last only.
   */
  if (
    customerParts.length !== 2 &&
    bankParts.length !== 2
  ) {
    return false;
  }

  const customerFirst =
    customerParts[0];

  const customerLast =
    customerParts[
      customerParts.length - 1
    ];

  const bankFirst =
    bankParts[0];

  const bankLast =
    bankParts[
      bankParts.length - 1
    ];

  return (
    bankNameTokenMatches(
      customerFirst,
      bankFirst,
    ) &&
    bankNameTokenMatches(
      customerLast,
      bankLast,
    )
  );
}

function extraBankSurnameMatch(
  customerParts,
  bankParts,
) {
  if (
    customerParts.length < 2 ||
    bankParts.length < 2
  ) {
    return false;
  }

  /*
   * Allow only one additional bank name.
   */
  if (
    bankParts.length >
    customerParts.length + 1
  ) {
    return false;
  }

  /*
   * Remove final additional surname.
   *
   * RAMBHAJAN SAINI
   *
   * becomes:
   *
   * RAMBHAJAN
   */
  const bankWithoutLast =
    bankParts.slice(0, -1);

  return bankNameSequenceMatches(
    customerParts,
    bankWithoutLast,
  );
}


function bankNamesMatch(
  customerName,
  accountName,
) {
  const customerParts =
    getBankNameParts(customerName);

  const bankParts =
    getBankNameParts(accountName);

  if (
    !customerParts.length ||
    !bankParts.length
  ) {
    return false;
  }

  /*
   * ==================================================
   * 1. NORMAL ORDER
   * ==================================================
   *
   * SAJAG SANTOSH JAIN
   * SAJAG S JAIN
   *
   * VEENARAJ C
   * VEENA RAJ C
   *
   * SHIVASHANKAR CHANDRANNA
   * SHIVA SHANKAR C
   */

  if (
    bankNameSequenceMatches(
      customerParts,
      bankParts,
    )
  ) {
    return true;
  }

  /*
   * ==================================================
   * 2. REVERSED BANK NAME
   * ==================================================
   *
   * ADESH KUMAR
   * KUMAR A
   *
   * reverse:
   *
   * A KUMAR
   */

  if (
    bankNameSequenceMatches(
      customerParts,
      [...bankParts].reverse(),
    )
  ) {
    return true;
  }

  /*
   * ==================================================
   * 3. MIDDLE NAME OMITTED
   * ==================================================
   */

  if (
    omittedBankMiddleNameMatch(
      customerParts,
      bankParts,
    )
  ) {
    return true;
  }

  /*
   * ==================================================
   * 4. EXTRA BANK SURNAME
   * ==================================================
   *
   * RAM BHAJAN
   * RAMBHAJAN SAINI
   */

  if (
    extraBankSurnameMatch(
      customerParts,
      bankParts,
    )
  ) {
    return true;
  }

  /*
   * ==================================================
   * 5. COMPOUND NAME
   * ==================================================
   *
   * SAJANAAYYAPPANASARI
   * A SAJANA
   */

  if (
    compoundBankNameInitialMatch(
      customerParts,
      bankParts,
    )
  ) {
    return true;
  }

  return false;
}

async function verifyQuickMoneyBankAndStoreResult({
  partnerLoanId,
  applicationId,
  lan,
  accountName,
  accountNumber,
  ifsc,
}) {
  try {
    console.log("Starting QuickMoney bank verification:", {
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
      `
      UPDATE loan_booking_quick_money
      SET
        bank_verification_status = ?,
        bank_is_verified = ?,
        bank_verification_response = ?,
        bank_verification_error = ?,
        bank_verified_at = ?,
        updated_at = NOW()
      WHERE partner_loan_id = ?
        AND bank_ac_number = ?
        AND bank_ifsc_code = ?
        AND bank_ac_name = ?
        AND bank_verification_status = 'PENDING'
      `,
      [
        isVerified ? "VERIFIED" : "FAILED",
        isVerified ? 1 : 0,
        JSON.stringify(result || {}),
        failureMessage,
        isVerified ? new Date() : null,
        partnerLoanId,
        accountNumber,
        ifsc,
        accountName,
      ],
    );

    if (!updateResult.affectedRows) {
      console.warn(
        "QuickMoney bank verification result not saved because stored details did not match:",
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
        "QuickMoney bank verification failed; will be evaluated at approval:",
        {
          partnerLoanId,
          applicationId,
          lan,
          failureMessage,
        },
      );

      return;
    }

    console.log(
      "QuickMoney bank verification completed:",
      {
        partnerLoanId,
        applicationId,
        lan,
        status: "VERIFIED",
      },
    );
  } catch (error) {
    console.error(
      "QuickMoney bank verification failed:",
      {
        partnerLoanId,
        applicationId,
        lan,
        statusCode:
          error.response?.status || null,
        message: error.message,
      },
    );

    try {
      const failureResponse =
        error.response?.data || {
          message:
            error.message ||
            "BANK_VERIFICATION_FAILED",

          statusCode:
            error.response?.status ||
            null,
        };

      const failureMessage = String(
        error.response?.data?.message ||
          error.message ||
          "BANK_VERIFICATION_FAILED",
      ).slice(0, 500);

      const [failureUpdate] =
        await db.promise().query(
          `
          UPDATE loan_booking_quick_money
          SET
            bank_verification_status = 'FAILED',
            bank_is_verified = 0,
            bank_verification_response = ?,
            bank_verification_error = ?,
            bank_verified_at = NULL,
            updated_at = NOW()
          WHERE partner_loan_id = ?
            AND bank_ac_number = ?
            AND bank_ifsc_code = ?
            AND bank_ac_name = ?
            AND bank_verification_status = 'PENDING'
          `,
          [
            JSON.stringify(
              failureResponse,
            ),
            failureMessage,
            partnerLoanId,
            accountNumber,
            ifsc,
            accountName,
          ],
        );

      if (
        !failureUpdate.affectedRows
      ) {
        console.warn(
          "QuickMoney bank verification exception was not saved because stored details did not match:",
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
        "QuickMoney bank verification failure saved:",
        {
          partnerLoanId,
          applicationId,
          lan,
          failureMessage,
        },
      );
    } catch (dbError) {
      console.error(
        "Could not save QuickMoney bank verification failure:",
        {
          partnerLoanId,
          message:
            dbError.message,
        },
      );
    }
  }
}

const generateConsentId = () => {
  return crypto.randomUUID();
};


function buildQuickMoneyBreResponse(breResult = {}) {
  const decision = String(
    breResult?.decision || "",
  ).toUpperCase();

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

  const creditLimit = Number(
    breResult?.creditLimit || 0,
  );

  const newCustomer =
    breResult?.newCustomer === true;

  return {
    CREDIT_LIMIT_CHECK_RPM: {
      derived_values: {
        LIMIT_ASSIGNMENT_IS_NEW_CUSTOMER_RPM:
          newCustomer
            ? creditLimit
            : 0,

        LIMIT_ASSIGNMENT_IS_REPEAT_CUSTOMER_RPM:
          newCustomer
            ? 0
            : creditLimit,
      },
    },
  };
}


router.post("/v1/create", verifyApiKey, async (req, res) => {
  let connection;
  let transactionStarted = false;

  try {
    connection = await db.promise().getConnection();

    const data = req.body || {};

    if (!data.partner_loan_id) {
      return res.status(400).json({
        is_success: false,
        error: {
          message: "partner_loan_id required",
          code: "request_validation_error",
        },
      });
    }

    if (!data.lenderType || data.lenderType !== "QUICKMONEY") {
      return res.status(400).json({
        is_success: false,
        error: {
          message: "Invalid lenderType.",
          code: "request_validation_error",
        },
      });
    }

    const payload = normalizeQuickMoneyPayload(data);

    await connection.beginTransaction();
    transactionStarted = true;

    const [existing] = await connection.query(
      `
      SELECT
        id,
        lan,
        application_id,
        status
      FROM loan_booking_quick_money
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

const generated = await generateLoanIdentifiers(
  connection,
  "QUICKMONEY",
);

const lan = generated.lan;
    await connection.query(
      `
      INSERT INTO loan_booking_quick_money
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

    return res.status(200).json({
      is_success: true,
      data: {
        status: "loan case created successfully",
        lan,
        application_id: applicationId,
      },
    });
  } catch (err) {
    if (connection && transactionStarted) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error(
          "QuickMoney rollback error:",
          rollbackError,
        );
      }
    }

    console.error("QuickMoney create loan error:", err);

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

async function verifyQuickMoneyBankAndStoreResult({
  partnerLoanId,
  applicationId,
  lan,
  accountName,
  accountNumber,
  ifsc,
}) {
  try {
    console.log("Starting QuickMoney bank verification:", {
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

    // =====================================================
    // SAVE BANK VERIFICATION RESULT
    // =====================================================

    const [updateResult] = await db.promise().query(
      `
      UPDATE loan_booking_quick_money
      SET
        bank_verification_status = ?,
        bank_is_verified = ?,
        bank_verification_response = ?,
        bank_verification_error = ?,
        bank_verified_at = ?,
        updated_at = NOW()
      WHERE partner_loan_id = ?
        AND bank_ac_number = ?
        AND bank_ifsc_code = ?
        AND bank_ac_name = ?
        AND bank_verification_status = 'PENDING'
      `,
      [
        isVerified ? "VERIFIED" : "FAILED",
        isVerified ? 1 : 0,
        JSON.stringify(result || {}),
        failureMessage,
        isVerified ? new Date() : null,
        partnerLoanId,
        accountNumber,
        ifsc,
        accountName,
      ],
    );

    // =====================================================
    // STORED DETAILS CHANGED
    // =====================================================

    if (!updateResult.affectedRows) {
      console.warn(
        "QuickMoney bank verification result not saved because stored details did not match:",
        {
          partnerLoanId,
          accountName,
          accountNumber,
          ifsc,
        },
      );

      return;
    }

    // =====================================================
    // VERIFICATION FAILED
    // =====================================================

    if (!isVerified) {
      console.log(
        "QuickMoney bank verification failed; will be evaluated at approval:",
        {
          partnerLoanId,
          applicationId,
          lan,
          failureMessage,
        },
      );

      return;
    }

    // =====================================================
    // SUCCESS
    // =====================================================

    console.log(
      "QuickMoney bank verification completed:",
      {
        partnerLoanId,
        applicationId,
        lan,
        status: "VERIFIED",
      },
    );
  } catch (error) {
    console.error(
      "QuickMoney bank verification failed:",
      {
        partnerLoanId,
        applicationId,
        lan,
        statusCode:
          error.response?.status || null,
        message:
          error.message,
      },
    );

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

      // ===================================================
      // SAVE FAILURE
      // ===================================================

      const [failureUpdate] =
        await db.promise().query(
          `
          UPDATE loan_booking_quick_money
          SET
            bank_verification_status = 'FAILED',
            bank_is_verified = 0,
            bank_verification_response = ?,
            bank_verification_error = ?,
            bank_verified_at = NULL,
            updated_at = NOW()
          WHERE partner_loan_id = ?
            AND bank_ac_number = ?
            AND bank_ifsc_code = ?
            AND bank_ac_name = ?
            AND bank_verification_status = 'PENDING'
          `,
          [
            JSON.stringify(
              failureResponse,
            ),
            failureMessage,
            partnerLoanId,
            accountNumber,
            ifsc,
            accountName,
          ],
        );

      if (
        !failureUpdate.affectedRows
      ) {
        console.warn(
          "QuickMoney bank verification exception was not saved because stored details did not match:",
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
        "QuickMoney bank verification failure saved:",
        {
          partnerLoanId,
          applicationId,
          lan,
          failureMessage,
        },
      );
    } catch (dbError) {
      console.error(
        "Could not save QuickMoney bank verification failure:",
        {
          partnerLoanId,
          message:
            dbError.message,
        },
      );
    }
  }
}

router.put("/v1/update-details", verifyApiKey, async (req, res) => {
  let connection;
  let transactionStarted = false;

  /*
   * External bank verification will run after DB commit.
   */
  let bankVerificationJob = null;

  /*
   * Used so bank name mismatch cannot later be overwritten
   * by APPLICATION_COMPLETED.
   */
  let bankNameMismatchDetected = false;

  try {
    connection = await db.promise().getConnection();

    const data = req.body || {};

    // ======================================================
    // REQUIRED FIELD
    // ======================================================

    if (!data.partner_loan_id) {
      return res.status(400).json({
        is_success: false,
        error: {
          message: "partner_loan_id is required",
          code: "request_validation_error",
        },
      });
    }

    // ======================================================
    // START TRANSACTION
    // ======================================================

    await connection.beginTransaction();
    transactionStarted = true;

    // ======================================================
    // FETCH CURRENT QUICK MONEY LOAN
    // ======================================================

    const [existing] = await connection.query(
      `
      SELECT *
      FROM loan_booking_quick_money
      WHERE partner_loan_id = ?
      LIMIT 1
      FOR UPDATE
      `,
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

    // ======================================================
    // BLOCKED STATUS
    // ======================================================

    const BLOCKED_UPDATE_STATUSES = [
      "APPROVED",
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
          message: `Loan details cannot be updated when status is '${row.status}'`,
          code: "loan_update_not_allowed",
        },
      });
    }

    // ======================================================
    // ENSURE APPLICATION ID + LAN
    // ======================================================

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
        "QUICKMONEY",
      );

      lan = generated.lan;

      preUpdateFields.push("lan = ?");
      preUpdateValues.push(lan);
    }

    if (preUpdateFields.length > 0) {
      preUpdateValues.push(data.partner_loan_id);

      await connection.query(
        `
        UPDATE loan_booking_quick_money
        SET ${preUpdateFields.join(", ")}
        WHERE partner_loan_id = ?
        `,
        preUpdateValues,
      );
    }

    // ======================================================
    // DYNAMIC UPDATE BUILDER
    // ======================================================

    const updateFields = [];
    const updateValues = [];

    const addField = (column, value) => {
      if (value !== undefined) {
        updateFields.push(`${column} = ?`);
        updateValues.push(value);
      }
    };

    // ======================================================
    // CUSTOMER DETAILS
    // ======================================================

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

    addField(
      "residence_status",
      data.residence_type,
    );

    addField(
      "employment_type",
      data.employment_type,
    );

    addField(
      "company_type",
      data.company_type,
    );

    addField(
      "company_name",
      data.company_name,
    );

    addField(
      "designation",
      data.designation,
    );

    addField(
      "salary_range",
      data.salary_range,
    );

    addField(
      "salary_mode",
      data.salary_mode,
    );

    addField(
      "nature_of_business",
      data.nature_of_business,
    );

    addField(
      "industry_type",
      data.industry_type,
    );

    addField(
      "monthly_income",
      data.monthly_income,
    );

    // ======================================================
    // ADDRESS
    // ======================================================

    addField(
      "address_line_1",
      data.address_line_1,
    );

    addField(
      "address_line_2",
      data.address_line_2,
    );

    addField(
      "address_pincode",
      data.address_pincode,
    );

    addField(
      "address_city",
      data.address_city,
    );

    addField(
      "address_state",
      data.address_state,
    );

    addField(
      "is_current_address",
      data.is_current_address,
    );

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

    // ======================================================
    // LOAN DETAILS
    // ======================================================

    addField(
      "loan_amount",
      data.loan_amount,
    );

    addField(
      "tenure",
      data.tenure,
    );

    addField(
      "loan_type",
      data.loan_type,
    );

    addField(
      "monthly_emi",
      data.monthly_emi,
    );

    addField(
      "interest_rate",
      data.interest_rate,
    );

    addField(
      "processing_fee",
      data.processing_fee,
    );

    addField(
      "aquisition_fees_txn_id",
      data.aquisition_fees_txn_id,
    );

    addField(
      "repayment_count",
      data.repayment_count,
    );

    addField(
      "payment_frequency",
      data.payment_frequency,
    );

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

    addField(
      "source",
      data.source,
    );

    addField(
      "preferred_language",
      data.preferred_language,
    );

    addField(
      "previous_loan_amount",
      data.previous_loan_amount,
    );

    addField(
      "total_disbursed_applications",
      data.total_disbursed_applications,
    );

    // ======================================================
    // BANK ACCOUNT
    // ======================================================

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

      // ====================================================
      // VALIDATE BANK OBJECT
      // ====================================================

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

        if (
          Object.keys(bank).length === 0
        ) {
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

      // ====================================================
      // EFFECTIVE BANK VALUES
      // ====================================================

      const accountName =
        hasBankField("ac_name")
          ? String(bank.ac_name || "").trim()
          : String(row.bank_ac_name || "").trim();

      const accountNumber =
        hasBankField("ac_number")
          ? String(bank.ac_number || "").trim()
          : String(row.bank_ac_number || "").trim();

      const ifsc =
        hasBankField("ifsc_code")
          ? String(bank.ifsc_code || "")
              .trim()
              .toUpperCase()
          : String(row.bank_ifsc_code || "")
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

      const hasCompleteBankDetails = Boolean(
        accountName &&
        accountNumber &&
        ifsc,
      );

      // ====================================================
      // UPDATE PROVIDED BANK FIELDS
      // ====================================================

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

      // ====================================================
      // MERGE BANK JSON
      // ====================================================

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
            "Existing QuickMoney bank_json could not be parsed",
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
          JSON.stringify(mergedBankJson),
        );
      }

      // ====================================================
      // INCOMPLETE BANK DETAILS
      // ====================================================

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

      // ====================================================
      // SHOULD VERIFY BANK
      // ====================================================

      const shouldEvaluateBank =
        hasCompleteBankDetails &&
        (
          coreBankFieldProvided ||
          hasCustomerNameUpdate
        );

      if (shouldEvaluateBank) {
        // ==================================================
        // CUSTOMER NAME REQUIRED
        // ==================================================

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
        } else {
          // ==================================================
          // NAME MATCH
          // ==================================================

          const isNameMatched =
            bankNamesMatch(
              customerName,
              accountName,
            );

          console.log(
            "QuickMoney bank account name validation:",
            {
              partnerLoanId:
                data.partner_loan_id,
              applicationId,
              lan,
              customerName,
              accountName,
              matched:
                isNameMatched,
            },
          );

          // ==================================================
          // NAME MISMATCH
          // ==================================================

          if (!isNameMatched) {
            bankNameMismatchDetected = true;

            const nameMismatchReason =
              `BANK_ACCOUNT_NAME_MISMATCH: ` +
              `Customer name "${customerName}" does not match ` +
              `bank account holder name "${accountName}"`;

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
                success: false,
                verified: false,

                reason:
                  "BANK_ACCOUNT_NAME_MISMATCH",

                message:
                  nameMismatchReason,

                customer_name:
                  customerName,

                bank_account_name:
                  accountName,

                customer_normalized:
                  getBankNameParts(
                    customerName,
                  ).join(" "),

                bank_name_normalized:
                  getBankNameParts(
                    accountName,
                  ).join(" "),
              }),
            );

            addField(
              "bank_verification_error",
              "BANK_ACCOUNT_NAME_MISMATCH",
            );

            addField(
              "bank_verified_at",
              null,
            );

            bankVerificationJob = null;

            console.log(
              "QuickMoney loan marked for rejection due to bank name mismatch:",
              {
                partnerLoanId:
                  data.partner_loan_id,
                applicationId,
                lan,
                customerName,
                accountName,
              },
            );
          }

          // ==================================================
          // UAT MOCK CLEAR
          // ==================================================

          else if (
            SHOULD_MOCK_CLEAR_BANK
          ) {
            console.warn(
              "QuickMoney bank verification mock-clear enabled",
              {
                partnerLoanId:
                  data.partner_loan_id,
                applicationId,
                lan,
                deploymentEnvironment:
                  DEPLOYMENT_ENV,
                bankMode:
                  BANK_MODE,
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
                status:
                  "VERIFIED",
                mode:
                  "mock-clear",

                deployment_environment:
                  DEPLOYMENT_ENV,

                name_check_bypassed:
                  false,

                name_check_passed:
                  true,

                bank_api_bypassed:
                  true,

                customer_name:
                  customerName,

                bank_account_name:
                  accountName,

                message:
                  "Bank name matched and bank verification mock-cleared for test/UAT",

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
          }

          // ==================================================
          // LIVE BANK VERIFICATION
          // ==================================================

          else {
            const sameBankDetails =
              String(
                row.bank_ac_name || "",
              ).trim() ===
                accountName &&

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
              String(
                row.bank_verification_status ||
                  "",
              )
                .trim()
                .toUpperCase() ===
                "VERIFIED" &&
              Number(
                row.bank_is_verified,
              ) === 1;

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

    // ======================================================
    // KYC JSON
    // ======================================================

    if (data.kyc !== undefined) {
      addField(
        "kyc_json",
        JSON.stringify(data.kyc),
      );
    }

    // ======================================================
    // NO UPDATE FIELDS
    // ======================================================

    if (updateFields.length === 0) {
      await connection.rollback();
      transactionStarted = false;

      return res.status(400).json({
        is_success: false,
        error: {
          message:
            "No fields provided for update",
          code:
            "request_validation_error",
        },
      });
    }

    // ======================================================
    // FINAL STATUS
    // ======================================================

    const effectiveLoanAmount =
      data.loan_amount !== undefined
        ? data.loan_amount
        : row.loan_amount;

    const effectiveTenure =
      data.tenure !== undefined
        ? data.tenure
        : row.tenure;

    const normalStatus =
      effectiveLoanAmount &&
      effectiveTenure
        ? "APPLICATION_COMPLETED"
        : "DETAILS_UPDATED";

    // ======================================================
    // BANK NAME MISMATCH OVERRIDES STATUS
    // ======================================================

    if (bankNameMismatchDetected) {
      addField(
        "status",
        "REJECTED",
      );

      addField(
        "qm_bre_status",
        "REJECTED",
      );

      addField(
        "qm_bre_reason",
        "BANK_ACCOUNT_NAME_MISMATCH",
      );
    } else if (
      String(
        row.status || "",
      ).toUpperCase() !==
      "BRE_APPROVED"
    ) {
      addField(
        "status",
        normalStatus,
      );
    }

    // ======================================================
    // UPDATE DATABASE
    // ======================================================

    updateFields.push(
      "updated_at = NOW()",
    );

    updateValues.push(
      data.partner_loan_id,
    );

    await connection.query(
      `
      UPDATE loan_booking_quick_money
      SET ${updateFields.join(", ")}
      WHERE partner_loan_id = ?
      `,
      updateValues,
    );

    // ======================================================
    // COMMIT
    // ======================================================

    await connection.commit();
    transactionStarted = false;

    connection.release();
    connection = null;

    // ======================================================
    // EXTERNAL BANK VERIFICATION
    // ======================================================

    if (bankVerificationJob) {
      try {
        await verifyQuickMoneyBankAndStoreResult(
          bankVerificationJob,
        );
      } catch (verificationError) {
        console.error(
          "Unexpected QuickMoney bank verification error after details were saved:",
          {
            partnerLoanId:
              data.partner_loan_id,
            message:
              verificationError.message,
          },
        );

        /*
         * Main transaction has already committed,
         * therefore do not throw here.
         */
      }
    }

    // ======================================================
    // RESPONSE
    // ======================================================

    return res.json({
      is_success: true,

      data: {
        status:
          bankNameMismatchDetected
            ? "Rejected"
            : "loan details updated successfully",

        ...(bankNameMismatchDetected
          ? {
              reason:
                "BANK_ACCOUNT_NAME_MISMATCH",
            }
          : {}),

        lan,

        application_id:
          applicationId,
      },
    });
  } catch (error) {
    if (
      connection &&
      transactionStarted
    ) {
      await connection.rollback();
    }

    console.error(
      "QuickMoney update details error:",
      error,
    );

    return res.status(500).json({
      is_success: false,
      error: {
        message:
          "Internal server error",
        code:
          "internal_server_error",
      },
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

const net = require("net");

router.post("/v1/loan/:application_id/consent",
  verifyApiKey,
  async (req, res) => {
    let connection;
    let transactionStarted = false;

    try {
      const { application_id } = req.params;
      const consentPayload = req.body;

      // ======================================================
      // VALIDATE APPLICATION ID
      // ======================================================

      if (!application_id) {
        return res.status(400).json({
          is_success: false,
          error: {
            message: "application_id is required",
            code: "request_validation_error",
          },
        });
      }

      // ======================================================
      // PAYLOAD MUST BE ARRAY
      // ======================================================

      if (!Array.isArray(consentPayload)) {
        return res.status(400).json({
          is_success: false,
          error: {
            message: "Consent payload must be an array",
            code: "request_validation_error",
          },
        });
      }

      if (consentPayload.length === 0) {
        return res.status(400).json({
          is_success: false,
          error: {
            message: "At least one consent is required",
            code: "request_validation_error",
          },
        });
      }

      const normalizedConsents = [];

      // ======================================================
      // VALIDATE EACH CONSENT
      // ======================================================

      for (
        let index = 0;
        index < consentPayload.length;
        index += 1
      ) {
        const item = consentPayload[index];

        if (
          !item ||
          typeof item !== "object" ||
          Array.isArray(item)
        ) {
          return res.status(400).json({
            is_success: false,
            error: {
              message:
                `Consent at index ${index} must be an object`,
              code: "request_validation_error",
            },
          });
        }

        const consentId = String(
          item.consent_id || "",
        ).trim();

        const consentValue = String(
          item.consent || "",
        )
          .trim()
          .toUpperCase();

        const timestampValue = String(
          item.timestamp || "",
        ).trim();

        const ipAddress = String(
          item.ip_address || "",
        ).trim();

        const consentVersion =
          item.consent_version === undefined ||
          item.consent_version === null ||
          String(item.consent_version).trim() === ""
            ? null
            : String(
                item.consent_version,
              ).trim();

        // ====================================================
        // CONSENT ID
        // ====================================================

        if (!consentId) {
          return res.status(400).json({
            is_success: false,
            error: {
              message:
                `consent_id is required at index ${index}`,
              code: "request_validation_error",
            },
          });
        }

        // ====================================================
        // CONSENT VALUE
        // ====================================================

        if (!["Y", "N"].includes(consentValue)) {
          return res.status(400).json({
            is_success: false,
            error: {
              message:
                `consent must be Y or N at index ${index}`,
              code: "request_validation_error",
            },
          });
        }

        // ====================================================
        // TIMESTAMP
        // ====================================================

        if (!timestampValue) {
          return res.status(400).json({
            is_success: false,
            error: {
              message:
                `timestamp is required at index ${index}`,
              code: "request_validation_error",
            },
          });
        }

        const parsedTimestamp =
          new Date(timestampValue);

        if (
          Number.isNaN(
            parsedTimestamp.getTime(),
          )
        ) {
          return res.status(400).json({
            is_success: false,
            error: {
              message:
                `Invalid timestamp at index ${index}`,
              code: "request_validation_error",
            },
          });
        }

        // ====================================================
        // IP ADDRESS
        // ====================================================

        if (!ipAddress) {
          return res.status(400).json({
            is_success: false,
            error: {
              message:
                `ip_address is required at index ${index}`,
              code: "request_validation_error",
            },
          });
        }

        if (net.isIP(ipAddress) === 0) {
          return res.status(400).json({
            is_success: false,
            error: {
              message:
                `Invalid ip_address at index ${index}`,
              code: "request_validation_error",
            },
          });
        }

        // ====================================================
        // FORMAT TIMESTAMP FOR MYSQL DATETIME(3)
        // ====================================================

        const databaseTimestamp =
          parsedTimestamp
            .toISOString()
            .slice(0, 23)
            .replace("T", " ");

        normalizedConsents.push({
          consent_id: consentId,
          consent: consentValue,
          consent_timestamp:
            databaseTimestamp,
          consent_version:
            consentVersion,
          ip_address:
            ipAddress,
        });
      }

      // ======================================================
      // DB CONNECTION
      // ======================================================

      connection =
        await db.promise().getConnection();

      await connection.beginTransaction();
      transactionStarted = true;

      // ======================================================
      // FIND QUICK MONEY LOAN
      // ======================================================

      const [loanRows] =
        await connection.query(
          `
          SELECT
            id,
            application_id,
            partner_loan_id,
            lan
          FROM loan_booking_quick_money
          WHERE application_id = ?
          LIMIT 1
          FOR UPDATE
          `,
          [application_id],
        );

      if (!loanRows.length) {
        await connection.rollback();
        transactionStarted = false;

        return res.status(404).json({
          is_success: false,
          error: {
            message: "Application not found",
            code: "application_not_found",
          },
        });
      }

      const loan = loanRows[0];

      // ======================================================
      // CREATE CONSENT BATCH ID
      // ======================================================

      const consentBatchId =
        generateConsentId();

      const savedConsents = [];

      // ======================================================
      // INSERT CONSENTS
      // ======================================================

      for (
        const consentItem of normalizedConsents
      ) {
        const consentRecordId =
          generateConsentId();

        await connection.query(
          `
          INSERT INTO quick_money_consents
          (
            consent_record_id,
            consent_batch_id,
            loan_booking_id,
            application_id,
            partner_loan_id,
            lan,
            consent_id,
            consent,
            consent_timestamp,
            consent_version,
            ip_address
          )
          VALUES
          (
            ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?
          )
          `,
          [
            consentRecordId,
            consentBatchId,
            loan.id,
            loan.application_id,
            loan.partner_loan_id || null,
            loan.lan || null,
            consentItem.consent_id,
            consentItem.consent,
            consentItem.consent_timestamp,
            consentItem.consent_version,
            consentItem.ip_address,
          ],
        );

        savedConsents.push({
          loan_consent_id:
            consentRecordId,

          consent_version:
            consentItem.consent_version,
        });
      }

      // ======================================================
      // COMMIT
      // ======================================================

      await connection.commit();
      transactionStarted = false;

      return res.status(200).json({
        is_success: true,
        data: savedConsents,
      });
    } catch (err) {
      if (
        connection &&
        transactionStarted
      ) {
        await connection.rollback();
        transactionStarted = false;
      }

      console.error(
        "Quick Money Consent API Error:",
        {
          message: err.message,
          code: err.code,
          sqlMessage: err.sqlMessage,
          applicationId:
            req.params.application_id,
        },
      );

      // ======================================================
      // DUPLICATE CONSENT
      // ======================================================

      if (err.code === "ER_DUP_ENTRY") {
        return res.status(409).json({
          is_success: false,
          error: {
            message:
              "One or more consents already exist",
            code:
              "duplicate_consent",
          },
        });
      }

      return res.status(500).json({
        is_success: false,
        error: {
          message:
            err.sqlMessage ||
            err.message ||
            "Failed to save consents",
          code: "server_error",
        },
      });
    } finally {
      if (connection) {
        connection.release();
      }
    }
  },
);

router.post("/v1/loan/:application_id/approve",
  verifyApiKey,
  async (req, res) => {
    let connection;
    let transactionStarted = false;

    try {
      connection =
        await db.promise().getConnection();

      const { application_id } =
        req.params;

      const {
        onboarding_completed,
      } = req.body || {};

      // ======================================================
      // APPLICATION ID VALIDATION
      // ======================================================

      if (!application_id) {
        return res.status(400).json({
          is_success: false,
          error: {
            message:
              "application_id is required",
            code:
              "request_validation_error",
          },
        });
      }

      // ======================================================
      // ONBOARDING VALIDATION
      // ======================================================

      if (
        typeof onboarding_completed !==
        "boolean"
      ) {
        return res.status(400).json({
          is_success: false,
          error: {
            message:
              "onboarding_completed must be boolean",
            code:
              "request_validation_error",
          },
        });
      }

      // ======================================================
      // FIND QUICK MONEY LOAN
      // ======================================================

      const [existing] =
        await connection.query(
          `
          SELECT *
          FROM loan_booking_quick_money
          WHERE application_id = ?
          LIMIT 1
          `,
          [application_id],
        );

      if (!existing.length) {
        return res.status(404).json({
          is_success: false,
          error: {
            message:
              "Loan application not found",
            code:
              "not_found",
          },
        });
      }

      const loan = existing[0];

      // ======================================================
      // PARTNER LOAN ID REQUIRED
      // ======================================================

      if (!loan.partner_loan_id) {
        return res.status(400).json({
          is_success: false,
          error: {
            message:
              "partner_loan_id missing for application",
            code:
              "request_validation_error",
          },
        });
      }

      // ======================================================
      // BLOCKED STATUSES
      // ======================================================

      const blockedStatuses = [
        "REJECTED",
        "CANCELLED",
        "DISBURSED",
        "CLOSED",
        "Fully Paid",
        "DISBURSE_INITIATED",
      ];

      if (
        blockedStatuses.includes(
          loan.status,
        )
      ) {
        return res.status(400).json({
          is_success: false,
          error: {
            message:
              "Application not eligible for approval",
            code:
              "request_validation_error",
          },
        });
      }

      // ======================================================
      // BANK VERIFICATION
      // ======================================================

      const hasCompleteBankDetails =
        Boolean(
          String(
            loan.bank_ac_name || "",
          ).trim() &&
            String(
              loan.bank_ac_number || "",
            ).trim() &&
            String(
              loan.bank_ifsc_code || "",
            ).trim(),
        );

      if (hasCompleteBankDetails) {
        const bankVerificationStatus =
          String(
            loan.bank_verification_status ||
              "",
          )
            .trim()
            .toUpperCase();

        // ====================================================
        // BANK VERIFICATION FAILED / NAME MISMATCH
        // ====================================================

        if (
          [
            "FAILED",
            "NAME_MISMATCH",
          ].includes(
            bankVerificationStatus,
          )
        ) {
          await connection.query(
            `
            UPDATE loan_booking_quick_money
            SET
              status = ?,
              qm_bre_status = ?,
              qm_bre_reason = ?,
              updated_at = CURRENT_TIMESTAMP
            WHERE application_id = ?
            `,
            [
              "REJECTED",
              "REJECTED",
              loan.bank_verification_error ||
                "BANK_VERIFICATION_FAILED",
              application_id,
            ],
          );

          const breResponse =
            buildQuickMoneyBreResponse({
              decision: "REJECTED",
            });

          return res.json({
            is_success: true,
            data: {
              status: "Rejected",
              bre_response:
                breResponse,
            },
          });
        }

        // ====================================================
        // BANK VERIFICATION STILL PENDING
        // ====================================================

        if (
          bankVerificationStatus !==
            "VERIFIED" ||
          Number(
            loan.bank_is_verified,
          ) !== 1
        ) {
          return res.status(400).json({
            is_success: false,
            error: {
              message:
                "Bank verification is not completed",
              code:
                "request_validation_error",
            },
          });
        }
      }

      // ======================================================
      // RUN BRE
      // ======================================================

      const breEngineResult =
        await runQuickMoneyBRE(loan);

      console.log(
        "[QUICKMONEY] BRE Result:",
        {
          application_id,
          lan: loan.lan,
          decision:
            breEngineResult?.decision,
          reason:
            breEngineResult?.reason,
          creditLimit:
            breEngineResult?.creditLimit,
          approvedLoanAmount:
            breEngineResult
              ?.approvedLoanAmount,
        },
      );

      // ======================================================
      // TECHNICAL FAILURE / PENDING
      // ======================================================

      if (
        breEngineResult.decision ===
          "TECHNICAL_FAILURE" ||
        breEngineResult.decision ===
          "PENDING"
      ) {
        return res.status(503).json({
          is_success: false,
          error: {
            message:
              "Approval failed",
            code:
              "server_error",
          },
        });
      }

      // ======================================================
      // INVALID BRE RESULT
      // ======================================================

      if (
        breEngineResult.decision !==
          "APPROVED" &&
        breEngineResult.decision !==
          "REJECTED"
      ) {
        return res.status(500).json({
          is_success: false,
          error: {
            message:
              "Approval failed",
            code:
              "server_error",
          },
        });
      }

      // ======================================================
      // BRE REJECTED
      // ======================================================

      if (
        breEngineResult.decision ===
        "REJECTED"
      ) {
        const breResponse =
          buildQuickMoneyBreResponse(
            breEngineResult,
          );

        console.log(
          "[QUICKMONEY] BRE rejected",
          {
            application_id,
            reason:
              breEngineResult.reason,
            amlScore:
              breEngineResult.aml
                ?.score ?? null,
          },
        );

        await connection.query(
          `
          UPDATE loan_booking_quick_money
          SET
            status = ?,
            qm_bre_status = ?,
            qm_bre_reason = ?,
            qm_credit_limit = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE application_id = ?
          `,
          [
            "REJECTED",
            "REJECTED",

            breEngineResult.reason ||
              "BRE_REJECT",

            breEngineResult
              .creditLimit ?? null,

            application_id,
          ],
        );

        return res.json({
          is_success: true,
          data: {
            status: "Rejected",
            bre_response:
              breResponse,
          },
        });
      }

      // ======================================================
      // APPROVED DISBURSAL AMOUNT
      // ======================================================

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

      const breResponse =
        buildQuickMoneyBreResponse(
          breEngineResult,
        );

      // ======================================================
      // ONBOARDING NOT COMPLETED
      // ======================================================

      if (
        onboarding_completed === false
      ) {
        return res.json({
          is_success: true,
          data: {
            status: "Approved",
            bre_response:
              breResponse,
          },
        });
      }

      // ======================================================
      // SAVE BRE APPROVAL
      // ======================================================

      await connection.beginTransaction();

      transactionStarted = true;

      await connection.query(
        `
        UPDATE loan_booking_quick_money
        SET
          status = ?,
          qm_bre_status = ?,
          qm_bre_reason = ?,
          qm_credit_limit = ?,
          disbursal_amount = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE application_id = ?
        `,
        [
          "BRE_APPROVED",
          "APPROVED",
          "BRE_CLEARED",

          breEngineResult.creditLimit ??
            null,

          approvedDisbursalAmount,

          application_id,
        ],
      );

      await connection.commit();

      transactionStarted = false;

      // ======================================================
      // RESPONSE
      // ======================================================

      return res.json({
        is_success: true,
        data: {
          status: "Approved",
          bre_response:
            breResponse,
        },
      });
    } catch (err) {
      if (
        connection &&
        transactionStarted
      ) {
        await connection.rollback();
      }

      console.error(
        "QuickMoney Approve API error:",
        {
          message:
            err.message,
          code:
            err.code,
          sqlMessage:
            err.sqlMessage,
          stack:
            err.stack,
        },
      );

      return res.status(500).json({
        is_success: false,
        error: {
          message:
            err.message ||
            "Approval failed",
          code:
            "server_error",
        },
      });
    } finally {
      if (connection) {
        connection.release();
      }
    }
  },
);

router.post("/v1/loan/:application_id/disburse",
  verifyApiKey,
  async (req, res) => {
    const { application_id } = req.params;
    const { trigger_fund } = req.body || {};

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

    let connection;
    let transactionStarted = false;

    const rollback = async () => {
      if (
        connection &&
        transactionStarted
      ) {
        await connection.rollback();
        transactionStarted = false;
      }
    };

    try {
      connection =
        await db
          .promise()
          .getConnection();

      await connection.beginTransaction();

      transactionStarted = true;

      /*
       * ======================================================
       * LOCK QUICKMONEY LOAN
       * ======================================================
       */

      const [[loan]] =
        await connection.query(
          `
          SELECT
            application_id,
            lan,
            status,
            loan_amount,
            disbursal_amount,
            qm_credit_limit,
            processing_fee
          FROM loan_booking_quick_money
          WHERE application_id = ?
          LIMIT 1
          FOR UPDATE
          `,
          [application_id],
        );

      /*
       * ======================================================
       * LOAN NOT FOUND
       * ======================================================
       */

      if (!loan) {
        await rollback();

        return res.status(404).json({
          is_success: false,
          error: {
            message:
              "QuickMoney loan case not found",
            code: "loan_not_found",
          },
        });
      }

      /*
       * ======================================================
       * ONLY BRE APPROVED LOANS CAN DISBURSE
       * ======================================================
       */

      if (
        loan.status !==
        "BRE_APPROVED"
      ) {
        await rollback();

        return res.status(400).json({
          is_success: false,
          error: {
            message:
              "Loan not eligible for disbursement",
            code:
              "request_validation_error",
          },
        });
      }

      /*
       * ======================================================
       * LAN REQUIRED
       * ======================================================
       */

      if (!loan.lan) {
        await rollback();

        return res.status(400).json({
          is_success: false,
          error: {
            message:
              "LAN missing for this loan case",
            code:
              "lan_not_generated",
          },
        });
      }

      /*
       * ======================================================
       * DUPLICATE PAYOUT CHECK
       * ======================================================
       */

      const [[existingTransfer]] =
        await connection.query(
          `
          SELECT
            id,
            payout_status
          FROM quick_transfers
          WHERE lan = ?
          LIMIT 1
          `,
          [loan.lan],
        );

      if (existingTransfer) {
        await rollback();

        return res.status(409).json({
          is_success: false,
          error: {
            message:
              "Payout already initiated for this loan",
            code:
              "duplicate_payout_request",
          },
        });
      }

      /*
       * ======================================================
       * APPROVED AMOUNTS
       * ======================================================
       */

      const disbursalAmount =
        Number(
          loan.disbursal_amount ??
            0,
        );

      const approvedCreditLimit =
        Number(
          loan.qm_credit_limit ??
            0,
        );

      /*
       * NET DISBURSAL VALIDATION
       */

      if (
        !Number.isFinite(
          disbursalAmount,
        ) ||
        disbursalAmount <= 0
      ) {
        await rollback();

        return res.status(400).json({
          is_success: false,
          error: {
            message:
              "Approved net disbursal amount is missing or invalid",
            code:
              "invalid_disbursal_amount",
          },
        });
      }

      /*
       * CREDIT LIMIT VALIDATION
       */

      if (
        !Number.isFinite(
          approvedCreditLimit,
        ) ||
        approvedCreditLimit <= 0
      ) {
        await rollback();

        return res.status(400).json({
          is_success: false,
          error: {
            message:
              "Approved QuickMoney credit limit is missing or invalid",
            code:
              "invalid_credit_limit",
          },
        });
      }

      /*
       * NET DISBURSAL MUST NEVER EXCEED CREDIT LIMIT
       */

      if (
        disbursalAmount >
        approvedCreditLimit
      ) {
        await rollback();

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

      /*
       * ======================================================
       * QUICK MONEY PARTNER LIMIT
       * ======================================================
       */

      const partnerName =
        "QUICK MONEY";

      const today =
        new Date();

      const {
        month,
        year,
      } = getMonthYear(
        today,
      );

      /*
       * GET / CREATE PARTNER
       */

      const partner =
        await partnerLimitService
          .getOrCreatePartner(
            connection,
            partnerName,
          );

      /*
       * PARTNER MUST BE ACTIVE
       */

      if (
        partner.status !==
        "active"
      ) {
        await rollback();

        return res.status(400).json({
          is_success: false,
          error: {
            message:
              "Quick Money partner is inactive",
            code:
              "partner_inactive",
          },
        });
      }

      /*
       * ======================================================
       * VALIDATE MONTHLY DISBURSEMENT LIMIT
       * ======================================================
       */

      const limitValidation =
        await partnerLimitService
          .validatePartnerDisbursementLimit(
            connection,
            partner.partner_id,
            disbursalAmount,
            month,
            year,
          );

      if (
        !limitValidation.valid
      ) {
        await rollback();

        return res.status(409).json({
          is_success: false,
          error: {
            message:
              "Quick Money disbursement limit exceeded",

            code:
              "partner_disbursement_limit_exceeded",

            details: {
              assigned_limit:
                limitValidation.assigned,

              used_limit:
                limitValidation.used,

              remaining_limit:
                limitValidation
                  .disbursementRemaining,

              required_amount:
                disbursalAmount,
            },
          },
        });
      }

      /*
       * ======================================================
       * UPDATE PARTNER USED LIMIT
       * ======================================================
       *
       * LAN prevents same loan being counted twice.
       */

      const limitUpdate =
        await partnerLimitService
          .updateDisbursedLimit(
            connection,
            limitValidation.limitId,
            disbursalAmount,
            loan.lan,
          );

      /*
       * ======================================================
       * CHANGE LOAN STATUS
       * ======================================================
       */

      const [loanUpdate] =
        await connection.query(
          `
          UPDATE loan_booking_quick_money
          SET
            status =
              'DISBURSE_INITIATED',

            updated_at =
              NOW()

          WHERE application_id = ?
            AND status =
              'BRE_APPROVED'
          `,
          [application_id],
        );

      if (
        loanUpdate.affectedRows !==
        1
      ) {
        throw new Error(
          "LOAN_STATUS_UPDATE_FAILED",
        );
      }

      /*
       * ======================================================
       * COMMIT DATABASE CHANGES
       * ======================================================
       */

      await connection.commit();

      transactionStarted =
        false;

      /*
       * ======================================================
       * START ACTUAL PAYOUT
       * ======================================================
       *
       * This runs after DB commit.
       */

      approveAndInitiatePayout({
        lan: loan.lan,

        table:
          "loan_booking_quick_money",
      }).catch(
        (payoutErr) => {
          console.error(
            "[QUICKMONEY] Payout initiation failed:",
            {
              lan:
                loan.lan,

              message:
                payoutErr.message,

              stack:
                payoutErr.stack,
            },
          );
        },
      );

      /*
       * ======================================================
       * SUCCESS RESPONSE
       * ======================================================
       */

      return res.json({
        is_success: true,

        data: {
          status:
            "Disbursal Initiated",

          amount:
            disbursalAmount.toFixed(
              2,
            ),

          transaction_time:
            null,

          transaction_id:
            null,

          partner:
            partnerName,

          partner_limit_updated:
            !limitUpdate.skipped,
        },
      });
    } catch (err) {
      /*
       * ======================================================
       * ROLLBACK
       * ======================================================
       */

      try {
        await rollback();
      } catch (
        rollbackErr
      ) {
        console.error(
          "[QUICKMONEY] Disbursement rollback error:",
          rollbackErr,
        );
      }

      console.error(
        "[QUICKMONEY] Disburse error:",
        {
          message:
            err.message,

          code:
            err.code,

          stack:
            err.stack,
        },
      );

      /*
       * ======================================================
       * PARTNER MONTHLY LIMIT NOT CONFIGURED
       * ======================================================
       */

      if (
        err.message ===
        "No limit record for partner/month/year"
      ) {
        return res.status(409).json({
          is_success: false,
          error: {
            message:
              "Quick Money monthly limit is not configured for the current month",

            code:
              "partner_limit_not_configured",
          },
        });
      }

      /*
       * ======================================================
       * LIMIT EXCEEDED
       * ======================================================
       */

      if (
        err.message ===
        "DISBURSEMENT_LIMIT_EXCEEDED"
      ) {
        return res.status(409).json({
          is_success: false,
          error: {
            message:
              "Quick Money disbursement limit exceeded",

            code:
              "partner_disbursement_limit_exceeded",

            details:
              err.meta ||
              undefined,
          },
        });
      }

      /*
       * ======================================================
       * INVALID AMOUNT
       * ======================================================
       */

      if (
        err.message ===
        "INVALID_DISBURSEMENT_AMOUNT"
      ) {
        return res.status(400).json({
          is_success: false,
          error: {
            message:
              "Invalid disbursement amount",

            code:
              "invalid_disbursal_amount",
          },
        });
      }

      /*
       * ======================================================
       * LOAN STATUS RACE CONDITION
       * ======================================================
       */

      if (
        err.message ===
        "LOAN_STATUS_UPDATE_FAILED"
      ) {
        return res.status(409).json({
          is_success: false,
          error: {
            message:
              "Loan status changed before disbursement",

            code:
              "loan_status_update_failed",
          },
        });
      }

      /*
       * ======================================================
       * UNKNOWN ERROR
       * ======================================================
       */

      return res.status(500).json({
        is_success: false,

        error: {
          message:
            "Internal server error",

          code:
            "internal_server_error",
        },
      });
    } finally {
      if (connection) {
        connection.release();
      }
    }
  },
);

///////////////////// Quick Money - Partner-Initiated Rejection

router.post(  "/v1/loan/:application_id/reject-by-partner",
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
         FROM loan_booking_quick_money
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
        `UPDATE loan_booking_quick_money
         SET
           status = 'REJECTED_BY_PARTNER',
           updated_at = NOW()
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
      console.error(
        "Quick Money Reject-by-partner error:",
        err,
      );

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

///////////////////// Quick Money - Repayment API

router.post(
  "/v1/loan/:application_id/repayment",
  verifyApiKey,
  async (req, res) => {
    try {
      const { application_id } = req.params;

      const {
        amount,
        payment_date,
        payment_id,
        payment_mode,
        utr,
      } = req.body || {};

      /* ==============================
         VALIDATE REQUEST BODY
      ============================== */

      if (
        !req.body ||
        Object.keys(req.body).length === 0
      ) {
        console.error(
          "Quick Money Repayment API error: empty request body",
          {
            application_id,
            headers: req.headers,
          },
        );

        return res.status(400).json({
          is_success: false,
          error: {
            message:
              "Request body is empty or invalid JSON",
            code: "request_validation_error",
          },
        });
      }

      /* ==============================
         VALIDATE REQUIRED FIELDS
      ============================== */

      const missingFields = [];

      if (!application_id) {
        missingFields.push("application_id");
      }

      if (!amount) {
        missingFields.push("amount");
      }

      if (!payment_date) {
        missingFields.push("payment_date");
      }

      if (!payment_id) {
        missingFields.push("payment_id");
      }

      if (missingFields.length) {
        console.error(
          "Quick Money Repayment API validation failure",
          {
            application_id,
            missingFields,
            body: req.body,
          },
        );

        return res.status(400).json({
          is_success: false,
          error: {
            message: `Missing required fields: ${missingFields.join(
              ", ",
            )}`,
            code: "request_validation_error",
          },
        });
      }

      /* ==============================
         FIND QUICK MONEY LOAN
      ============================== */

      const [loan] = await db.promise().query(
        `SELECT lan
         FROM loan_booking_quick_money
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

      /* ==============================
         PARSE PAYMENT DATE
      ============================== */

      const paymentDate =
        parseApiDate(payment_date);

      if (!paymentDate) {
        return res.status(400).json({
          is_success: false,
          error: {
            message:
              "Invalid payment_date format",
            code: "request_validation_error",
          },
        });
      }

      /* ==============================
         PREPARE REPAYMENT DATA
      ============================== */

      const sheetData = [
        {
          LAN: lan,

          UTR:
            utr || payment_id,

          "Payment Date":
            paymentDate,

          "Bank Date":
            paymentDate,

          "Payment Id":
            payment_id,

          "Payment Mode":
            payment_mode || "API",

          "Transfer Amount":
            amount,

          __row: 1,
        },
      ];

      console.log(
        "Quick Money repayment sheet data:",
        sheetData,
      );

      /* ==============================
         PROCESS REPAYMENT
      ============================== */

      const result =
        await processRows(sheetData);

      console.log(
        "Quick Money repayment processor result:",
        result,
      );

      /* ==============================
         HANDLE PROCESSING FAILURE
      ============================== */

      if (!result.success) {
        return res.status(400).json({
          is_success: false,
          error: {
            message:
              result.error?.message ||
              result.message ||
              "Repayment processing failed",

            code:
              result.error?.code ||
              "request_validation_error",

            details:
              result.error?.details ||
              result.details,
          },
        });
      }

      /* ==============================
         HANDLE FAILED ROWS
      ============================== */

      if (result.failed_rows > 0) {
        const firstError =
          result.row_errors?.[0];

        return res.status(400).json({
          is_success: false,
          error: {
            message:
              firstError?.reason ||
              "Repayment processing failed",

            code:
              "request_validation_error",
          },
        });
      }

      /* ==============================
         SUCCESS
      ============================== */

      return res.json({
        is_success: true,
        data: {
          status:
            "repayment submitted successfully",
        },
      });
    } catch (err) {
      console.error(
        "Quick Money Repayment API error:",
        err,
      );

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

///////////////////// 7) Quick Money - Loan Charges API

router.post( "/v1/loan/:application_id/repayment-charges",
  verifyApiKey,
  async (req, res) => {
    try {
      const { application_id } = req.params;
      const {
        type,
        amount,
        due_date,
        remarks,
      } = req.body;

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
            message:
              "type, amount, due_date required",
            code: "request_validation_error",
          },
        });
      }

      if (Number(amount) <= 0) {
        return res.status(400).json({
          is_success: false,
          error: {
            message:
              "amount must be greater than zero",
            code: "request_validation_error",
          },
        });
      }

      /* ==============================
         FIND QUICK MONEY LOAN
      ============================== */

      const [loan] =
        await db.promise().query(
          `SELECT lan
           FROM loan_booking_quick_money
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

      /* ==============================
         VALIDATE DUE DATE
      ============================== */

      const parsedDate =
        parseApiDate(due_date);

      if (!parsedDate) {
        return res.status(400).json({
          is_success: false,
          error: {
            message: "Invalid due_date",
            code: "request_validation_error",
          },
        });
      }

      /* ==============================
         INSERT CHARGE
      ============================== */

      await db.promise().query(
        `INSERT INTO loan_charges
        (
          lan,
          charge_date,
          due_date,
          amount,
          charge_type,
          remarks
        )
        VALUES
        (?, CURDATE(), ?, ?, ?, ?)`,
        [
          lan,
          parsedDate,
          amount,
          type,
          remarks || null,
        ],
      );

      return res.json({
        is_success: true,
        data: {
          status:
            "charge added successfully",
        },
      });
    } catch (err) {
      console.error(
        "Quick Money Charge insert error:",
        err,
      );

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

///////////////////// 8) Quick Money - Extra Charge Waiver API

router.post( "/v1/loan/extra_charge_waiver",
  verifyApiKey,
  async (req, res) => {
    try {
      const rows = req.body.data;

      if (
        !Array.isArray(rows) ||
        !rows.length
      ) {
        return res.status(400).json({
          is_success: false,
          error: {
            message: "Invalid payload",
            code: "request_validation_error",
          },
        });
      }

      for (const row of rows) {
        const {
          partner_loan_id,
          charge_type,
          waiver_amount,
        } = row;

        /* ==============================
           VALIDATE INPUT
        ============================== */

        if (
          !partner_loan_id ||
          !charge_type ||
          !waiver_amount
        ) {
          return res.status(400).json({
            is_success: false,
            error: {
              message:
                "partner_loan_id, charge_type, waiver_amount required",
              code:
                "request_validation_error",
            },
          });
        }

        if (Number(waiver_amount) <= 0) {
          return res.status(400).json({
            is_success: false,
            error: {
              message:
                "waiver_amount must be greater than zero",
              code:
                "request_validation_error",
            },
          });
        }

        /* ==============================
           FIND QUICK MONEY LOAN
        ============================== */

        const [loan] =
          await db.promise().query(
            `SELECT lan
             FROM loan_booking_quick_money
             WHERE partner_loan_id = ?
             LIMIT 1`,
            [partner_loan_id],
          );

        if (!loan.length) {
          return res.status(404).json({
            is_success: false,
            error: {
              message:
                `Loan not found for ${partner_loan_id}`,
              code: "loan_not_found",
            },
          });
        }

        const lan = loan[0].lan;

        if (!lan) {
          return res.status(400).json({
            is_success: false,
            error: {
              message:
                "LAN not generated yet",
              code: "lan_not_generated",
            },
          });
        }

        /* ==============================
           FIND UNPAID CHARGE
        ============================== */

        const [charge] =
          await db.promise().query(
            `SELECT
               id,
               amount,
               paid_amount,
               waived_amount,
               waived_off
             FROM loan_charges
             WHERE lan = ?
               AND charge_type = ?
               AND paid_status = 'Unpaid'
             ORDER BY due_date ASC
             LIMIT 1`,
            [
              lan,
              charge_type,
            ],
          );

        if (!charge.length) {
          return res.status(404).json({
            is_success: false,
            error: {
              message:
                "Charge not found or already settled",
              code: "charge_not_found",
            },
          });
        }

        const chargeRow =
          charge[0];

        /* ==============================
           CALCULATE OUTSTANDING
        ============================== */

        const outstanding =
          Number(
            chargeRow.amount || 0,
          ) -
          Number(
            chargeRow.paid_amount || 0,
          ) -
          Number(
            chargeRow.waived_amount || 0,
          ) -
          Number(
            chargeRow.waived_off || 0,
          );

        if (
          Number(waiver_amount) >
          outstanding
        ) {
          return res.status(400).json({
            is_success: false,
            error: {
              message:
                "Waiver amount exceeds outstanding charge amount",
              code:
                "request_validation_error",
            },
          });
        }

        /* ==============================
           UPDATE WAIVER
        ============================== */

        const newWaivedAmount =
          Number(
            chargeRow.waived_amount || 0,
          ) +
          Number(waiver_amount);

        const updatedOutstanding =
          outstanding -
          Number(waiver_amount);

        let newStatus =
          "Partially Waived";

        if (updatedOutstanding <= 0) {
          newStatus = "Waived";
        }

        await db.promise().query(
          `UPDATE loan_charges
           SET
             waived_amount = ?,
             waived_off = ?,
             paid_status = ?
           WHERE id = ?`,
          [
            newWaivedAmount,
            waiver_amount,
            newStatus,
            chargeRow.id,
          ],
        );
      }

      return res.json({
        is_success: true,
        data: {
          status:
            "charge waiver applied successfully",
        },
      });
    } catch (err) {
      console.error(
        "Quick Money Waiver error:",
        err,
      );

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



router.get( "/v1/loan/:application_id/customer-details",
  verifyApiKey,
  async (req, res) => {
    let connection;
    try {
      connection = await db.promise().getConnection();
      const { application_id } = req.params;

      const [existing] = await connection.query(
        `SELECT * FROM loan_booking_quick_money WHERE application_id = ? LIMIT 1`,
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


router.post( "/v1/bre/test-eligibility",
  async (req, res) => {

    try {

      if (
        String(
          process.env.ENABLE_QUICK_MONEY_BRE_TEST_API || ""
        ).toLowerCase() !== "true"
      ) {

        return res.status(404).json({
          is_success:false,
          error:{
            message:
              "BRE testing API is disabled",
            code:
              "bre_testing_api_disabled",
          },
        });
      }


      const result =
        evaluateQuickMoneyEligibility(
          req.body
        );


      if (
        result.decision ===
        "VALIDATION_ERROR"
      ) {

        return res.status(400).json({
          is_success:false,
          data:result,
          error:{
            message:
              "Invalid BRE test payload",
            code:
              "bre_test_validation_error",
            details:
              result.validationErrors,
          },
        });

      }


      return res.status(200).json({
        is_success:true,
        data:result,
      });


    } catch(error){

      console.error(
        "[QuickMoney BRE Test] failed",
        {
          message:error.message,
          stack:error.stack,
        }
      );


      return res.status(500).json({
        is_success:false,
        error:{
          message:
            error.message ||
            "BRE test execution failed",
          code:
            "bre_test_execution_failed",
        },
      });

    }

  }
);

// router.post("/test-webhook-receiver", (req, res) => {
//   console.log("\n========== QUICK MONEY WEBHOOK RECEIVED ==========");
//   console.log("Headers:", req.headers);
//   console.log(
//     "Body:",
//     JSON.stringify(req.body, null, 2)
//   );
//   console.log("=================================================\n");

//   return res.status(200).json({
//     success: true,
//     message: "Quick Money webhook received successfully",
//   });
// });

module.exports = router;