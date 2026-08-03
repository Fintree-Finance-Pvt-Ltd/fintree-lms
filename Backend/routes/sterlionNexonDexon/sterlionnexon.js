const multer = require("multer");
const XLSX = require("xlsx");
const path = require("path");

/*
|--------------------------------------------------------------------------
| Product configuration
|--------------------------------------------------------------------------
|
| partnerLoanPrefix values can be changed later if the partner requires a
| different partner-loan-ID format. LAN prefixes are exactly as requested.
|
*/

const SMD_PRODUCT_CONFIG = Object.freeze({
  STERLION: {
    productName: "Sterlion",
    lenderName: "Sterlion",
    lanPrefix: "STF",
    partnerLoanPrefix: "STFP",
  },
  MEXON: {
    productName: "Mexon",
    lenderName: "Mexon",
    lanPrefix: "MXF",
    partnerLoanPrefix: "MXFP",
  },
  DEXON: {
    productName: "Dexon",
    lenderName: "Dexon",
    lanPrefix: "DXF",
    partnerLoanPrefix: "DXFP",
  },
});

const EXPECTED_HEADERS = [
  "product",
  "loanAmount",
  "tenureMonths",
  "interestRate",
  "processingFee",
  "firstName",
  "lastName",
  "aadhaarNumber",
  "panNumber",
  "mobileNumber",
  "email",
  "businessName",
  "industry",
  "accountHolderName",
  "accountNumber",
  "ifsc",
  "bankName",
  "dateOfBirth",
  "permanentAddress",
  "businessAddress",
  "gstNumber",
  "udyamNumber",
];

/*
|--------------------------------------------------------------------------
| Required values
|--------------------------------------------------------------------------
|
| These headers must be present in Excel, but the following fields are
| allowed to contain blank values:
|
| processingFee -> defaults to 0
| email
| gstNumber
| udyamNumber
|
*/

const OPTIONAL_VALUE_FIELDS = [
  "processingFee",
  "email",
  "gstNumber",
  "udyamNumber",
];

const REQUIRED_VALUE_FIELDS = EXPECTED_HEADERS.filter(
  (field) => !OPTIONAL_VALUE_FIELDS.includes(field),
);

const MAX_UPLOAD_ROWS = 1000;

/*
|--------------------------------------------------------------------------
| Multer configuration
|--------------------------------------------------------------------------
*/

const sterlionMexonDexonUpload = multer({
  storage: multer.memoryStorage(),

  limits: {
    files: 1,
    fileSize: 5 * 1024 * 1024,
  },

  fileFilter: (req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();

    if (![".xlsx", ".xls"].includes(extension)) {
      return callback(
        new Error("Only .xlsx and .xls Excel files are supported."),
      );
    }

    return callback(null, true);
  },
});

/*
|--------------------------------------------------------------------------
| Custom row error
|--------------------------------------------------------------------------
*/

class RowImportError extends Error {
  constructor(stage, message, details = {}) {
    super(message);
    this.name = "RowImportError";
    this.stage = stage;
    this.details = details;
  }
}

/*
|--------------------------------------------------------------------------
| General helper functions
|--------------------------------------------------------------------------
*/

function isBlank(value) {
  return value === undefined || value === null || String(value).trim() === "";
}

function normalizeRowKeys(row) {
  const normalizedRow = {};

  Object.entries(row || {}).forEach(([key, value]) => {
    normalizedRow[String(key).trim()] = value;
  });

  return normalizedRow;
}

function getProductConfig(product) {
  const normalizedProduct = String(product || "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();

  const productConfig = SMD_PRODUCT_CONFIG[normalizedProduct];

  if (!productConfig) {
    throw new RowImportError(
      "validation",
      `Invalid product "${product}". Allowed products are Sterlion, Mexon and Dexon.`,
    );
  }

  return productConfig;
}

function normalizeText(value, fieldName, maxLength, required = true) {
  const normalizedValue = String(value ?? "").trim();

  if (required && !normalizedValue) {
    throw new RowImportError("validation", `${fieldName} is required.`);
  }

  if (normalizedValue.length > maxLength) {
    throw new RowImportError(
      "validation",
      `${fieldName} cannot exceed ${maxLength} characters.`,
    );
  }

  return normalizedValue || null;
}

// function normalizeIdentifier(value, fieldName) {
//   if (isBlank(value)) {
//     throw new RowImportError("validation", `${fieldName} is required.`);
//   }

//   if (
//     typeof value === "number" &&
//     (!Number.isSafeInteger(value) || value < 0)
//   ) {
//     throw new RowImportError(
//       "validation",
//       `${fieldName} must be formatted as Text in Excel.`,
//     );
//   }

//   let normalizedValue = String(value).trim();

//   // Handles CSV/JSON values such as 1234567890.0
//   if (/^\d+\.0+$/.test(normalizedValue)) {
//     normalizedValue = normalizedValue.replace(/\.0+$/, "");
//   }

//   if (/e[+-]?\d+/i.test(normalizedValue)) {
//     throw new RowImportError(
//       "validation",
//       `${fieldName} is in scientific notation. Format the Excel column as Text.`,
//     );
//   }

//   return normalizedValue;
// }

function normalizeIdentifier(
  value,
  fieldName,
  {
    allowSafeNumericConversion = false,
  } = {},
) {
  if (isBlank(value)) {
    throw new RowImportError(
      "validation",
      `${fieldName} is required.`,
    );
  }

  /*
   * Excel has returned this cell as a numeric value.
   */
  if (typeof value === "number") {
    if (!allowSafeNumericConversion) {
      throw new RowImportError(
        "validation",
        `${fieldName} was stored as a Number in Excel. Its original digits or leading zeros may have been changed. Format the "${fieldName}" column as Text and upload the file again.`,
        {
          field: fieldName,
          required_excel_format: "Text",
          action:
            `Format the complete ${fieldName} Excel column as Text and upload again.`,
        },
      );
    }

    if (
      !Number.isFinite(value) ||
      !Number.isSafeInteger(value) ||
      value < 0
    ) {
      throw new RowImportError(
        "validation",
        `${fieldName} could not be read safely from Excel. Format the "${fieldName}" column as Text and upload the file again.`,
        {
          field: fieldName,
          required_excel_format: "Text",
          action:
            `Format the complete ${fieldName} Excel column as Text and upload again.`,
        },
      );
    }

    /*
     * Safe for Aadhaar and mobile because they are below Excel/JavaScript's
     * unsafe integer range and cannot validly begin with zero.
     */
    return String(value);
  }

  let normalizedValue = String(value).trim();

  /*
   * Handles string values such as 1234567890.0.
   */
  if (/^\d+\.0+$/.test(normalizedValue)) {
    normalizedValue = normalizedValue.replace(/\.0+$/, "");
  }

  /*
   * A scientific-notation string cannot be trusted because Excel may
   * already have rounded the original value.
   */
  if (
    /^[+-]?\d+(\.\d+)?e[+-]?\d+$/i.test(
      normalizedValue,
    )
  ) {
    throw new RowImportError(
      "validation",
      `${fieldName} is in scientific notation. The original value may have been changed by Excel. Format the "${fieldName}" column as Text and upload again.`,
      {
        field: fieldName,
        required_excel_format: "Text",
        action:
          `Format the complete ${fieldName} Excel column as Text and upload again.`,
      },
    );
  }

  return normalizedValue;
}

function parseNumber(
  value,
  fieldName,
  { allowZero = false, maximum = Number.MAX_SAFE_INTEGER } = {},
) {
  if (isBlank(value)) {
    throw new RowImportError("validation", `${fieldName} is required.`);
  }

  const cleanedValue = String(value).trim().replace(/,/g, "").replace(/%$/, "");

  const numericValue = Number(cleanedValue);

  if (!Number.isFinite(numericValue)) {
    throw new RowImportError(
      "validation",
      `${fieldName} must be a valid number.`,
    );
  }

  if (allowZero ? numericValue < 0 : numericValue <= 0) {
    throw new RowImportError(
      "validation",
      `${fieldName} must be ${allowZero ? "zero or greater" : "greater than zero"}.`,
    );
  }

  if (numericValue > maximum) {
    throw new RowImportError(
      "validation",
      `${fieldName} cannot exceed ${maximum}.`,
    );
  }

  return numericValue;
}

function parseTenure(value) {
  const tenureMonths = parseNumber(value, "tenureMonths", {
    maximum: 360,
  });

  if (!Number.isInteger(tenureMonths)) {
    throw new RowImportError(
      "validation",
      "tenureMonths must be a whole number.",
    );
  }

  return tenureMonths;
}

function normalizeDateOfBirth(value) {
  let year;
  let month;
  let day;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    year = value.getFullYear();
    month = value.getMonth() + 1;
    day = value.getDate();
  } else if (typeof value === "number") {
    const parsedExcelDate = XLSX.SSF.parse_date_code(value);

    if (!parsedExcelDate) {
      throw new RowImportError(
        "validation",
        "dateOfBirth contains an invalid Excel date.",
      );
    }

    year = parsedExcelDate.y;
    month = parsedExcelDate.m;
    day = parsedExcelDate.d;
  } else {
    const dateValue = String(value || "").trim();

    let dateMatch = dateValue.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);

    if (dateMatch) {
      year = Number(dateMatch[1]);
      month = Number(dateMatch[2]);
      day = Number(dateMatch[3]);
    } else {
      dateMatch = dateValue.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);

      if (!dateMatch) {
        throw new RowImportError(
          "validation",
          "dateOfBirth must be in YYYY-MM-DD or DD-MM-YYYY format.",
        );
      }

      day = Number(dateMatch[1]);
      month = Number(dateMatch[2]);
      year = Number(dateMatch[3]);
    }
  }

  const parsedDate = new Date(Date.UTC(year, month - 1, day));

  if (
    parsedDate.getUTCFullYear() !== year ||
    parsedDate.getUTCMonth() + 1 !== month ||
    parsedDate.getUTCDate() !== day
  ) {
    throw new RowImportError("validation", "dateOfBirth is not a valid date.");
  }

  const today = new Date();

  if (parsedDate >= today) {
    throw new RowImportError("validation", "dateOfBirth must be a past date.");
  }

  return [
    String(year).padStart(4, "0"),
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0"),
  ].join("-");
}

/*
|--------------------------------------------------------------------------
| Normalize and validate one Excel row
|--------------------------------------------------------------------------
*/

function normalizeAndValidateRow(row) {
  const missingFields = REQUIRED_VALUE_FIELDS.filter((field) =>
    isBlank(row[field]),
  );

  if (missingFields.length > 0) {
    throw new RowImportError(
      "validation",
      `Missing required fields: ${missingFields.join(", ")}.`,
    );
  }

  const productConfig = getProductConfig(row.product);

  const loanAmount = parseNumber(row.loanAmount, "loanAmount", {
    maximum: 9999999999999.99,
  });

  const tenureMonths = parseTenure(row.tenureMonths);

  const interestRate = parseNumber(row.interestRate, "interestRate", {
    maximum: 100,
  });

  const processingFee = isBlank(row.processingFee)
    ? 0
    : parseNumber(row.processingFee, "processingFee", {
        allowZero: true,
        maximum: 9999999999999.99,
      });

  if (processingFee > loanAmount) {
    throw new RowImportError(
      "validation",
      "processingFee cannot be greater than loanAmount.",
    );
  }

  const aadhaarNumber = normalizeIdentifier(row.aadhaarNumber, "aadhaarNumber",{
    allowSafeNumericConversion: true,
  },);

  if (!/^[2-9][0-9]{11}$/.test(aadhaarNumber)) {
    throw new RowImportError(
      "validation",
      "aadhaarNumber must contain 12 valid digits.",
    );
  }

  const panNumber = normalizeIdentifier(
    row.panNumber,
    "panNumber",
  ).toUpperCase();

  if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(panNumber)) {
    throw new RowImportError("validation", "Invalid PAN number format.");
  }

  const mobileNumber = normalizeIdentifier(row.mobileNumber, "mobileNumber",{
    allowSafeNumericConversion: true,
  },);

  if (!/^[6-9][0-9]{9}$/.test(mobileNumber)) {
    throw new RowImportError(
      "validation",
      "mobileNumber must contain a valid 10-digit Indian mobile number.",
    );
  }

  const email = normalizeText(row.email, "email", 190, false)?.toLowerCase();

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new RowImportError("validation", "Invalid email address.");
  }

  const accountNumber = normalizeIdentifier(row.accountNumber, "accountNumber",{
    allowSafeNumericConversion: false,
  },);

  if (!/^[0-9]{8,20}$/.test(accountNumber)) {
    throw new RowImportError(
      "validation",
      "accountNumber must contain between 8 and 20 digits.",
    );
  }

  const ifsc = normalizeIdentifier(row.ifsc, "ifsc").toUpperCase();

  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) {
    throw new RowImportError("validation", "Invalid IFSC code format.");
  }

  const gstNumber = normalizeText(
    row.gstNumber,
    "gstNumber",
    15,
    false,
  )?.toUpperCase();

  if (
    gstNumber &&
    !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstNumber)
  ) {
    throw new RowImportError("validation", "Invalid GST number format.");
  }

  const udyamNumber = normalizeText(
    row.udyamNumber,
    "udyamNumber",
    25,
    false,
  )?.toUpperCase();

  if (udyamNumber && !/^UDYAM-[A-Z]{2}-[0-9]{2}-[0-9]{7}$/.test(udyamNumber)) {
    throw new RowImportError(
      "validation",
      "Invalid Udyam number format. Expected format: UDYAM-MH-12-1234567.",
    );
  }

  return {
    productConfig,

    data: {
      product: productConfig.productName,
      lender: productConfig.lenderName,
      loanAmount: Number(loanAmount.toFixed(2)),
      tenureMonths,
      interestRate: Number(interestRate.toFixed(4)),
      processingFee: Number(processingFee.toFixed(2)),

      firstName: normalizeText(row.firstName, "firstName", 100),

      lastName: normalizeText(row.lastName, "lastName", 100),

      aadhaarNumber,
      panNumber,
      mobileNumber,
      email,

      businessName: normalizeText(row.businessName, "businessName", 255),

      industry: normalizeText(row.industry, "industry", 150),

      accountHolderName: normalizeText(
        row.accountHolderName,
        "accountHolderName",
        255,
      ),

      accountNumber,
      ifsc,

      bankName: normalizeText(row.bankName, "bankName", 255),

      dateOfBirth: normalizeDateOfBirth(row.dateOfBirth),

      permanentAddress: normalizeText(
        row.permanentAddress,
        "permanentAddress",
        1000,
      ),

      businessAddress: normalizeText(
        row.businessAddress,
        "businessAddress",
        1000,
      ),

      gstNumber,
      udyamNumber,
    },
  };
}

/*
|--------------------------------------------------------------------------
| Concurrency-safe LAN and partner loan ID generator
|--------------------------------------------------------------------------
|
| IMPORTANT:
| This uses the same transaction connection as the loan insert.
| loan_sequences.lender_name must have a UNIQUE index.
|
*/

async function generateSterlionMexonDexonIdentifiers(conn, productConfig) {
  /*
   * Seed with 10999 so the first generated sequence becomes 11000.
   * ON DUPLICATE KEY prevents two simultaneous uploads from creating
   * separate sequence records.
   */

  await conn.query(
    `
      INSERT INTO loan_sequences (
        lender_name,
        last_sequence
      )
      VALUES (?, 10999)
      ON DUPLICATE KEY UPDATE
        last_sequence = last_sequence
    `,
    [productConfig.lenderName],
  );

  const [sequenceRows] = await conn.query(
    `
      SELECT last_sequence
      FROM loan_sequences
      WHERE lender_name = ?
      FOR UPDATE
    `,
    [productConfig.lenderName],
  );

  if (sequenceRows.length === 0) {
    throw new RowImportError(
      "lan_generation",
      `Loan sequence was not found for ${productConfig.productName}.`,
    );
  }

  const currentSequence = Number(sequenceRows[0].last_sequence);

  if (!Number.isSafeInteger(currentSequence) || currentSequence < 0) {
    throw new RowImportError(
      "lan_generation",
      `Invalid loan sequence configured for ${productConfig.productName}.`,
    );
  }

  const newSequence = currentSequence + 1;

  await conn.query(
    `
      UPDATE loan_sequences
      SET last_sequence = ?
      WHERE lender_name = ?
    `,
    [newSequence, productConfig.lenderName],
  );

  return {
    sequence: newSequence,

    partnerLoanId: `${productConfig.partnerLoanPrefix}${newSequence}`,

    lan: `${productConfig.lanPrefix}${newSequence}`,
  };
}

/*
|--------------------------------------------------------------------------
| Excel or JSON input extraction
|--------------------------------------------------------------------------
|
| Supported request types:
|
| 1. multipart/form-data:
|    file: Excel file
|
| 2. application/json:
|    { "rows": [...] }
|
| 3. application/json:
|    [...]
|
| 4. Single-row JSON object for manual testing.
|
*/

function extractUploadData(req) {
  if (req.file) {
    const workbook = XLSX.read(req.file.buffer, {
      type: "buffer",
      cellDates: true,
    });

    const firstSheetName = workbook.SheetNames[0];

    if (!firstSheetName) {
      throw new RowImportError(
        "file",
        "The uploaded Excel file does not contain a worksheet.",
      );
    }

    const worksheet = workbook.Sheets[firstSheetName];

    const matrix = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: "",
      raw: true,
      blankrows: false,
    });

    if (matrix.length === 0) {
      throw new RowImportError("file", "The uploaded Excel file is empty.");
    }

    const headers = matrix[0].map((header) => String(header ?? "").trim());

    const rows = XLSX.utils
      .sheet_to_json(worksheet, {
        defval: "",
        raw: true,
        blankrows: false,
      })
      .map(normalizeRowKeys);

    return {
      headers,
      rows,
      source: req.file.originalname,
    };
  }

  let payload = req.body?.rows ?? req.body;

  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload);
    } catch {
      throw new RowImportError("file", "rows must contain a valid JSON array.");
    }
  }

  if (
    payload &&
    !Array.isArray(payload) &&
    typeof payload === "object" &&
    payload.product
  ) {
    payload = [payload];
  }

  if (!Array.isArray(payload)) {
    throw new RowImportError(
      "file",
      "Upload an Excel file or provide a rows array.",
    );
  }

  const rows = payload.map(normalizeRowKeys);

  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];

  return {
    headers,
    rows,
    source: "JSON upload",
  };
}

/*
|--------------------------------------------------------------------------
| Insert one row
|--------------------------------------------------------------------------
*/

const INSERT_COLUMNS = [
  "partner_loan_id",
  "lan",
  "product",
  "lender",
  "loan_amount",
  "tenure_months",
  "interest_rate",
  "processing_fee",
  "first_name",
  "last_name",
  "aadhaar_number",
  "pan_number",
  "mobile_number",
  "email",
  "business_name",
  "industry",
  "account_holder_name",
  "account_number",
  "ifsc",
  "bank_name",
  "date_of_birth",
  "permanent_address",
  "business_address",
  "gst_number",
  "udyam_number",
  "status",
];

const INSERT_LOAN_QUERY = `
  INSERT INTO loan_booking_sterlion_nexon_dexon (
    ${INSERT_COLUMNS.join(", ")}
  )
  VALUES (
    ${INSERT_COLUMNS.map(() => "?").join(", ")}
  )
`;

async function insertSterlionMexonDexonLoan(normalizedData, productConfig) {
  let conn;

  try {
    conn = await db.promise().getConnection();
    await conn.beginTransaction();

    /*
     * Duplicate is checked per product.
     *
     * Same PAN:
     * Sterlion + Mexon = allowed
     * Sterlion + Sterlion = blocked
     *
     * The database UNIQUE(product, pan_number) index remains the
     * final protection against concurrent duplicate uploads.
     */

    const [duplicateRows] = await conn.query(
      `
        SELECT id, lan
        FROM loan_booking_sterlion_nexon_dexon
        WHERE product = ?
          AND pan_number = ?
        LIMIT 1
      `,
      [normalizedData.product, normalizedData.panNumber],
    );

    if (duplicateRows.length > 0) {
      throw new RowImportError(
        "duplicate",
        `PAN already exists for ${normalizedData.product}. Existing LAN: ${duplicateRows[0].lan}.`,
      );
    }

    const partnerName = productConfig.lenderName;

    const currentDate = new Date();
    const { month, year } = getMonthYear(currentDate);

    /*
     * Get the correct product/lender partner.
     */

    const partner = await partnerLimitService.getOrCreatePartner(
      conn,
      partnerName,
    );

    /*
     * Validate monthly booking limit for the specific product.
     */

    const limitCheck = await partnerLimitService.validatePartnerBookingLimit(
      conn,
      partner.partner_id,
      normalizedData.loanAmount,
      month,
      year,
    );

    if (!limitCheck.valid) {
      throw new RowImportError(
        "partner_limit",
        `Monthly booking limit exceeded for ${partnerName}.`,
        {
          remainingLimit: limitCheck.remaining,
          requiredAmount: normalizedData.loanAmount,
          month,
          year,
        },
      );
    }

    /*
     * Get the product-specific FLDG configuration.
     */

    const [partnerConfigRows] = await conn.query(
      `
        SELECT fldg_percent, fldg_status
        FROM partner_master
        WHERE partner_id = ?
        LIMIT 1
      `,
      [partner.partner_id],
    );

    const partnerConfig = partnerConfigRows[0];

    if (!partnerConfig) {
      throw new RowImportError(
        "partner_configuration",
        `Partner configuration was not found for ${partnerName}.`,
      );
    }

    let requiredFldg = 0;

    if (Number(partnerConfig.fldg_status) === 1) {
      const fldgPercent = Number(partnerConfig.fldg_percent || 0);

      if (
        !Number.isFinite(fldgPercent) ||
        fldgPercent < 0 ||
        fldgPercent > 100
      ) {
        throw new RowImportError(
          "partner_configuration",
          `Invalid FLDG percentage configured for ${partnerName}.`,
        );
      }

      requiredFldg = Number(
        ((normalizedData.loanAmount * fldgPercent) / 100).toFixed(2),
      );
    }

    /*
     * Validate FLDG balance before generating the LAN.
     */

    if (requiredFldg > 0) {
      const fldgCheck = await partnerFldgService.validateFldgAvailability(
        conn,
        partner.partner_id,
        requiredFldg,
      );

      if (!fldgCheck.valid) {
        throw new RowImportError(
          "fldg",
          `Insufficient FLDG balance for ${partnerName}.`,
          {
            availableFldg: fldgCheck.available,
            requiredFldg,
          },
        );
      }
    }

    /*
     * Generate the correct LAN using the locked sequence row.
     */

    const { partnerLoanId, lan } = await generateSterlionMexonDexonIdentifiers(
      conn,
      productConfig,
    );

    const insertValues = [
      partnerLoanId,
      lan,
      normalizedData.product,
      normalizedData.lender,
      normalizedData.loanAmount,
      normalizedData.tenureMonths,
      normalizedData.interestRate,
      normalizedData.processingFee,
      normalizedData.firstName,
      normalizedData.lastName,
      normalizedData.aadhaarNumber,
      normalizedData.panNumber,
      normalizedData.mobileNumber,
      normalizedData.email,
      normalizedData.businessName,
      normalizedData.industry,
      normalizedData.accountHolderName,
      normalizedData.accountNumber,
      normalizedData.ifsc,
      normalizedData.bankName,
      normalizedData.dateOfBirth,
      normalizedData.permanentAddress,
      normalizedData.businessAddress,
      normalizedData.gstNumber,
      normalizedData.udyamNumber,
      "Login",
    ];

    const [insertResult] = await conn.query(INSERT_LOAN_QUERY, insertValues);

    /*
     * Update the correct product's used booking limit.
     */

    await partnerLimitService.updateBookedLimit(
      conn,
      limitCheck.limitId,
      normalizedData.loanAmount,
      lan,
    );

    /*
     * Reserve FLDG for the correct product.
     */

    if (requiredFldg > 0) {
      await partnerFldgService.reserveFldg(
        conn,
        partner.partner_id,
        lan,
        requiredFldg,
        `${partnerName} booking reservation | Amount: ${normalizedData.loanAmount}`,
      );
    }

    await conn.commit();

    return {
      id: insertResult.insertId,
      partnerLoanId,
      lan,
      product: normalizedData.product,
    };
  } catch (error) {
    if (conn) {
      try {
        await conn.rollback();
      } catch (rollbackError) {
        console.error("Sterlion/Mexon/Dexon rollback failed:", rollbackError);
      }
    }

    throw error;
  } finally {
    if (conn) {
      conn.release();
    }
  }
}

/*
|--------------------------------------------------------------------------
| Convert internal errors into safe row-level errors
|--------------------------------------------------------------------------
*/

function buildPublicRowError(error, excelRowNumber, product) {
  if (error instanceof RowImportError) {
    return {
      row: excelRowNumber,
      product: product || null,
      stage: error.stage,
      reason: error.message,
      ...error.details,
    };
  }

  if (error?.code === "ER_DUP_ENTRY") {
    return {
      row: excelRowNumber,
      product: product || null,
      stage: "duplicate",
      reason: "A duplicate PAN or LAN already exists in the database.",
    };
  }

  return {
    row: excelRowNumber,
    product: product || null,
    stage: "database",
    reason: "The row could not be inserted due to a database error.",
  };
}

/*
|--------------------------------------------------------------------------
| Route
|--------------------------------------------------------------------------
*/

router.post("/upload/sterlion-mexon-dexon", (req, res) => {
  sterlionMexonDexonUpload.single("file")(req, res, async (uploadError) => {
    if (uploadError) {
      return res.status(400).json({
        success: false,
        message: uploadError.message,
      });
    }

    try {
      const { headers, rows: extractedRows, source } = extractUploadData(req);

      const missingHeaders = EXPECTED_HEADERS.filter(
        (header) => !headers.includes(header),
      );

      if (missingHeaders.length > 0) {
        return res.status(400).json({
          success: false,
          message: "Excel headers are invalid.",
          missing_headers: missingHeaders,
          expected_headers: EXPECTED_HEADERS,
        });
      }

      /*
       * Remove completely blank rows.
       */

      const rows = extractedRows.filter((row) =>
        EXPECTED_HEADERS.some((header) => !isBlank(row[header])),
      );

      if (rows.length === 0) {
        return res.status(400).json({
          success: false,
          message: "No application rows were found in the uploaded file.",
        });
      }

      if (rows.length > MAX_UPLOAD_ROWS) {
        return res.status(400).json({
          success: false,
          message: `Maximum ${MAX_UPLOAD_ROWS} rows are allowed per upload.`,
        });
      }

      const successRows = [];
      const rowErrors = [];

      /*
       * Detect duplicate product + PAN combinations within the file.
       */

      const excelDuplicateKeys = new Set();

      /*
       * Process sequentially.
       *
       * Do not replace with an uncontrolled Promise.all because each row
       * updates LAN sequences, monthly limits and FLDG balances.
       */

      for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
        const rawRow = rows[rowIndex];
        const excelRowNumber = rowIndex + 2;

        let displayProduct = rawRow.product || null;

        try {
          const { data: normalizedData, productConfig } =
            normalizeAndValidateRow(rawRow);

          displayProduct = productConfig.productName;

          const excelDuplicateKey = `${normalizedData.product}:${normalizedData.panNumber}`;

          if (excelDuplicateKeys.has(excelDuplicateKey)) {
            throw new RowImportError(
              "duplicate",
              `Duplicate PAN found in the Excel file for ${normalizedData.product}.`,
            );
          }

          excelDuplicateKeys.add(excelDuplicateKey);

          const insertedLoan = await insertSterlionMexonDexonLoan(
            normalizedData,
            productConfig,
          );

          successRows.push({
            row: excelRowNumber,
            product: insertedLoan.product,
            lan: insertedLoan.lan,
            partnerLoanId: insertedLoan.partnerLoanId,
            databaseId: insertedLoan.id,
          });

          console.log(
            `Sterlion/Mexon/Dexon row inserted | Row: ${excelRowNumber} | Product: ${insertedLoan.product} | LAN: ${insertedLoan.lan}`,
          );
        } catch (rowError) {
          console.error("Sterlion/Mexon/Dexon row failed:", {
            row: excelRowNumber,
            product: displayProduct,
            code: rowError?.code || null,
            message: rowError?.message,
          });

          rowErrors.push(
            buildPublicRowError(rowError, excelRowNumber, displayProduct),
          );
        }
      }

      const insertedRows = successRows.length;
      const failedRows = rowErrors.length;
      const hasPartialSuccess = insertedRows > 0 && failedRows > 0;

      const responseStatus = insertedRows === 0 ? 422 : 200;

      return res.status(responseStatus).json({
        success: insertedRows > 0,
        partial_success: hasPartialSuccess,

        message:
          insertedRows === 0
            ? "No Sterlion, Mexon or Dexon loans were inserted."
            : hasPartialSuccess
              ? "Excel upload completed with some row errors."
              : "Excel upload completed successfully.",

        source,
        total_rows: rows.length,
        inserted_rows: insertedRows,
        failed_rows: failedRows,
        success_rows: successRows,
        row_errors: rowErrors,
      });
    } catch (error) {
      console.error("Sterlion/Mexon/Dexon upload failed:", error);

      if (error instanceof RowImportError) {
        return res.status(400).json({
          success: false,
          message: error.message,
          stage: error.stage,
        });
      }

      return res.status(500).json({
        success: false,
        message: "Sterlion, Mexon and Dexon Excel upload failed.",
      });
    }
  });
});
