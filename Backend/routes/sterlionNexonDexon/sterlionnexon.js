const express = require("express");
const db = require("../../config/db");
const multer = require("multer");
const XLSX = require("xlsx");
const path = require("path");
const cron = require("node-cron");

const router = express.Router();

const SMD_PRODUCT_CONFIG = Object.freeze({
  STERLION: {
    productName: "Sterlion",
    lenderName: "Sterlion",
    lanPrefix: "STF",
  },

  MEXON: {
    productName: "Mexon",
    lenderName: "Mexon",
    lanPrefix: "MXF",
  },

  DEXON: {
    productName: "Dexon",
    lenderName: "Dexon",
    lanPrefix: "DXF",
  },
});

const EXPECTED_HEADERS = [
  "product",
  "loanLimit",
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

const MAX_MONEY_VALUE = 9999999999999.99;

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

class RowImportError extends Error {
  constructor(stage, message, details = {}) {
    super(message);

    this.name = "RowImportError";

    this.stage = stage;

    this.details = details;
  }
}

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
    throw new RowImportError(
      "validation",

      `${fieldName} is required.`,
    );
  }

  if (normalizedValue.length > maxLength) {
    throw new RowImportError(
      "validation",

      `${fieldName} cannot exceed ${maxLength} characters.`,
    );
  }

  return normalizedValue || null;
}

function normalizeIdentifier(
  value,
  fieldName,
  { allowSafeNumericConversion = false } = {},
) {
  if (isBlank(value)) {
    throw new RowImportError(
      "validation",

      `${fieldName} is required.`,
    );
  }

  if (typeof value === "number") {
    if (!allowSafeNumericConversion) {
      throw new RowImportError(
        "validation",

        `${fieldName} was stored as a Number in Excel. Its original digits or leading zeros may have been changed. Format the "${fieldName}" column as Text and upload the file again.`,

        {
          field: fieldName,

          required_excel_format: "Text",

          action: `Format the complete ${fieldName} Excel column as Text and upload again.`,
        },
      );
    }

    if (!Number.isFinite(value) || !Number.isSafeInteger(value) || value < 0) {
      throw new RowImportError(
        "validation",

        `${fieldName} could not be read safely from Excel. Format the "${fieldName}" column as Text and upload the file again.`,

        {
          field: fieldName,

          required_excel_format: "Text",

          action: `Format the complete ${fieldName} Excel column as Text and upload again.`,
        },
      );
    }

    return String(value);
  }

  let normalizedValue = String(value).trim();

  if (/^\d+\.0+$/.test(normalizedValue)) {
    normalizedValue = normalizedValue.replace(/\.0+$/, "");
  }

  if (/^[+-]?\d+(\.\d+)?e[+-]?\d+$/i.test(normalizedValue)) {
    throw new RowImportError(
      "validation",

      `${fieldName} is in scientific notation. The original value may have been changed by Excel. Format the "${fieldName}" column as Text and upload again.`,

      {
        field: fieldName,

        required_excel_format: "Text",

        action: `Format the complete ${fieldName} Excel column as Text and upload again.`,
      },
    );
  }

  return normalizedValue;
}

function parseNumber(
  value,
  fieldName,
  {
    allowZero = false,

    maximum = Number.MAX_SAFE_INTEGER,
  } = {},
) {
  if (isBlank(value)) {
    throw new RowImportError(
      "validation",

      `${fieldName} is required.`,
    );
  }

  const cleanedValue = String(value)
    .trim()
    .replace(/[₹,\s]/g, "")
    .replace(/%$/, "");

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

      `${fieldName} must be ${
        allowZero ? "zero or greater" : "greater than zero"
      }.`,
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
  const tenureMonths = parseNumber(
    value,

    "tenureMonths",

    {
      maximum: 360,
    },
  );

  if (!Number.isInteger(tenureMonths)) {
    throw new RowImportError(
      "validation",

      "tenureMonths must be a whole number.",
    );
  }

  return tenureMonths;
}

function formatSqlDate(year, month, day) {
  return [
    String(year).padStart(4, "0"),

    String(month).padStart(2, "0"),

    String(day).padStart(2, "0"),
  ].join("-");
}

function validateDateParts(year, month, day, fieldName) {
  const parsedDate = new Date(Date.UTC(year, month - 1, day));

  if (
    parsedDate.getUTCFullYear() !== year ||
    parsedDate.getUTCMonth() + 1 !== month ||
    parsedDate.getUTCDate() !== day
  ) {
    throw new RowImportError(
      "validation",

      `${fieldName} is not a valid date.`,
    );
  }

  return parsedDate;
}

function parseUploadDate(value, fieldName) {
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

        `${fieldName} contains an invalid Excel date.`,
      );
    }

    year = parsedExcelDate.y;

    month = parsedExcelDate.m;

    day = parsedExcelDate.d;
  } else {
    const dateValue = String(value ?? "").trim();

    if (!dateValue) {
      throw new RowImportError(
        "validation",

        `${fieldName} is required.`,
      );
    }

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

          `${fieldName} must be in YYYY-MM-DD or DD-MM-YYYY format.`,
        );
      }

      day = Number(dateMatch[1]);

      month = Number(dateMatch[2]);

      year = Number(dateMatch[3]);
    }
  }

  const parsedDate = validateDateParts(year, month, day, fieldName);

  return {
    parsedDate,

    sqlDate: formatSqlDate(year, month, day),
  };
}

function normalizeDateOfBirth(value) {
  const { parsedDate, sqlDate } = parseUploadDate(value, "dateOfBirth");

  const today = new Date();

  const todayUtc = new Date(
    Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()),
  );

  if (parsedDate >= todayUtc) {
    throw new RowImportError(
      "validation",

      "dateOfBirth must be a past date.",
    );
  }

  return sqlDate;
}

function normalizeDisbursementDate(value) {
  return parseUploadDate(value, "disbursementDate").sqlDate;
}

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

  const loanLimit = parseNumber(
    row.loanLimit,

    "loanLimit",

    {
      maximum: MAX_MONEY_VALUE,
    },
  );

  const tenureMonths = parseTenure(row.tenureMonths);

  const interestRate = parseNumber(
    row.interestRate,

    "interestRate",

    {
      maximum: 100,
    },
  );

  const processingFee = isBlank(row.processingFee)
    ? 0
    : parseNumber(
        row.processingFee,

        "processingFee",

        {
          allowZero: true,

          maximum: MAX_MONEY_VALUE,
        },
      );

  if (processingFee > loanLimit) {
    throw new RowImportError(
      "validation",

      "processingFee cannot be greater than loanLimit.",
    );
  }

  const aadhaarNumber = normalizeIdentifier(
    row.aadhaarNumber,

    "aadhaarNumber",

    {
      allowSafeNumericConversion: true,
    },
  );

  // if (!/^[2-9][0-9]{11}$/.test(aadhaarNumber)) {
  //   throw new RowImportError(
  //     "validation",

  //     "aadhaarNumber must contain 12 valid digits.",
  //   );
  // }

  const panNumber = normalizeIdentifier(
    row.panNumber,

    "panNumber",
  ).toUpperCase();

  if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(panNumber)) {
    throw new RowImportError(
      "validation",

      "Invalid PAN number format.",
    );
  }

  const mobileNumber = normalizeIdentifier(
    row.mobileNumber,

    "mobileNumber",

    {
      allowSafeNumericConversion: true,
    },
  );

  if (!/^[6-9][0-9]{9}$/.test(mobileNumber)) {
    throw new RowImportError(
      "validation",

      "mobileNumber must contain a valid 10-digit Indian mobile number.",
    );
  }

  const email = normalizeText(
    row.email,

    "email",

    190,

    false,
  )?.toLowerCase();

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new RowImportError(
      "validation",

      "Invalid email address.",
    );
  }

  const accountNumber = normalizeIdentifier(
    row.accountNumber,

    "accountNumber",

    {
      allowSafeNumericConversion: false,
    },
  );

  if (!/^[0-9]{8,20}$/.test(accountNumber)) {
    throw new RowImportError(
      "validation",

      "accountNumber must contain between 8 and 20 digits.",
    );
  }

  const ifsc = normalizeIdentifier(row.ifsc, "ifsc").toUpperCase();

  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) {
    throw new RowImportError(
      "validation",

      "Invalid IFSC code format.",
    );
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
    throw new RowImportError(
      "validation",

      "Invalid GST number format.",
    );
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

      loanLimit: Number(loanLimit.toFixed(2)),

      tenureMonths,

      interestRate: Number(interestRate.toFixed(4)),

      processingFee: Number(processingFee.toFixed(2)),

      firstName: normalizeText(row.firstName, "firstName", 100),

      lastName: normalizeText(row.lastName, "lastName", 100),

      aadhaarNumber,

      panNumber,

      mobileNumber,

      email,

      businessName: normalizeText(
        row.businessName,

        "businessName",

        255,
      ),

      industry: normalizeText(
        row.industry,

        "industry",

        150,
      ),

      accountHolderName: normalizeText(
        row.accountHolderName,

        "accountHolderName",

        255,
      ),

      accountNumber,

      ifsc,

      bankName: normalizeText(
        row.bankName,

        "bankName",

        255,
      ),

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

async function generateSterlionMexonDexonLan(conn, productConfig) {
  await conn.query(
    `
      INSERT INTO loan_sequences (
        lender_name,
        last_sequence
      )
      VALUES (?, 10999)
      ON DUPLICATE KEY UPDATE
        last_sequence =
          last_sequence
    `,
    [productConfig.lenderName],
  );

  const [sequenceRows] = await conn.query(
    `
        SELECT
          last_sequence
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
      SET
        last_sequence = ?
      WHERE lender_name = ?
    `,
    [newSequence, productConfig.lenderName],
  );

  return `${productConfig.lanPrefix}` + `${newSequence}`;
}

function extractUploadData(req) {
  if (req.file) {
    const workbook = XLSX.read(
      req.file.buffer,

      {
        type: "buffer",

        cellDates: true,
      },
    );

    const firstSheetName = workbook.SheetNames[0];

    if (!firstSheetName) {
      throw new RowImportError(
        "file",

        "The uploaded Excel file does not contain a worksheet.",
      );
    }

    const worksheet = workbook.Sheets[firstSheetName];

    const matrix = XLSX.utils.sheet_to_json(
      worksheet,

      {
        header: 1,

        defval: "",

        raw: true,

        blankrows: false,
      },
    );

    if (matrix.length === 0) {
      throw new RowImportError(
        "file",

        "The uploaded Excel file is empty.",
      );
    }

    const headers = matrix[0].map((header) => String(header ?? "").trim());

    const rows = XLSX.utils
      .sheet_to_json(
        worksheet,

        {
          defval: "",

          raw: true,

          blankrows: false,
        },
      )
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
      throw new RowImportError(
        "file",

        "rows must contain valid JSON.",
      );
    }
  }

  if (payload && !Array.isArray(payload) && typeof payload === "object") {
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

function getSmdContractualDays(tenureMonths) {
  const months = Number(tenureMonths);

  if (!Number.isInteger(months) || months <= 0) {
    throw new RowImportError(
      "loan_configuration",
      "Tenure months must be a positive whole number.",
    );
  }

  /*
   * 360-day basis:
   * 12 months = 360 days
   * 1 month = 30 days
   *
   * Example:
   * 3 months = 90 days
   */
  return months * (SMD_DAY_COUNT_BASIS / 12);
}

const INSERT_COLUMNS = [
  "lan",
  "product",
  "lender",
  "loan_limit",
  "utilized_amount",
  "unutilized_amount",
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
  INSERT INTO loan_booking_sterlion_mexon_dexon (
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

    const [duplicateRows] = await conn.query(
      `
          SELECT
            id,
            lan
          FROM loan_booking_sterlion_mexon_dexon
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

    const lan = await generateSterlionMexonDexonLan(conn, productConfig);

    const insertValues = [
      lan,

      normalizedData.product,

      normalizedData.lender,

      normalizedData.loanLimit,

      0,

      normalizedData.loanLimit,

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

    const [insertResult] = await conn.query(
      INSERT_LOAN_QUERY,

      insertValues,
    );

    await conn.commit();

    return {
      id: insertResult.insertId,

      lan,

      product: normalizedData.product,

      loanLimit: normalizedData.loanLimit,

      utilizedAmount: 0,

      unutilizedAmount: normalizedData.loanLimit,
    };
  } catch (error) {
    if (conn) {
      try {
        await conn.rollback();
      } catch (rollbackError) {
        console.error(
          "Sterlion/Mexon/Dexon loan rollback failed:",

          rollbackError,
        );
      }
    }

    throw error;
  } finally {
    if (conn) {
      conn.release();
    }
  }
}

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

router.post(
  "/upload/sterlion-mexon-dexon",

  (req, res) => {
    sterlionMexonDexonUpload.single("file")(
      req,
      res,

      async (uploadError) => {
        if (uploadError) {
          return res.status(400).json({
            success: false,

            message: uploadError.message,
          });
        }

        try {
          const {
            headers,

            rows: extractedRows,

            source,
          } = extractUploadData(req);

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

          const excelDuplicateKeys = new Set();

          for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
            const rawRow = rows[rowIndex];

            const excelRowNumber = rowIndex + 2;

            let displayProduct = rawRow.product || null;

            try {
              const {
                data: normalizedData,

                productConfig,
              } = normalizeAndValidateRow(rawRow);

              displayProduct = productConfig.productName;

              const excelDuplicateKey =
                `${normalizedData.product}:` + `${normalizedData.panNumber}`;

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

                databaseId: insertedLoan.id,

                loan_limit: insertedLoan.loanLimit,

                utilized_amount: insertedLoan.utilizedAmount,

                unutilized_amount: insertedLoan.unutilizedAmount,
              });

              console.log(
                `Sterlion/Mexon/Dexon row inserted | Row: ${excelRowNumber} | Product: ${insertedLoan.product} | LAN: ${insertedLoan.lan}`,
              );
            } catch (rowError) {
              console.error(
                "Sterlion/Mexon/Dexon row failed:",

                {
                  row: excelRowNumber,

                  product: displayProduct,

                  code: rowError?.code || null,

                  stage: rowError?.stage || null,

                  message: rowError?.message,
                },
              );

              rowErrors.push(
                buildPublicRowError(
                  rowError,

                  excelRowNumber,

                  displayProduct,
                ),
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
          console.error(
            "Sterlion/Mexon/Dexon upload failed:",

            error,
          );

          if (error instanceof RowImportError) {
            return res.status(400).json({
              success: false,

              message: error.message,

              stage: error.stage,

              ...error.details,
            });
          }

          return res.status(500).json({
            success: false,

            message: "Sterlion, Mexon and Dexon Excel upload failed.",
          });
        }
      },
    );
  },
);

router.get(
  "/all-loans",

  async (req, res) => {
    try {
      const [rows] = await db.promise().query(
        `
              SELECT *
              FROM loan_booking_sterlion_mexon_dexon
              ORDER BY id DESC
            `,
      );

      return res.status(200).json({
        success: true,

        message: "Loan booking details fetched successfully.",

        total_records: rows.length,

        data: rows,
      });
    } catch (error) {
      console.error(
        "Failed to fetch Sterlion/Mexon/Dexon loan details:",

        error,
      );

      return res.status(500).json({
        success: false,

        message: "Failed to fetch loan booking details.",
      });
    }
  },
);

const BUSINESS_TIME_ZONE = "Asia/Kolkata";
const SMD_DAY_COUNT_BASIS = 360;
const MAX_SMD_CATCH_UP_DAYS_PER_INVOICE = 4000;

const INVOICE_HEADER_DEFINITIONS = [
  {
    key: "lan",
    label: "LAN",
    aliases: ["LAN", "lan"],
  },
  {
    key: "invoiceNumber",
    label: "Invoice Number",
    aliases: [
      "Invoice Number",
      "Invoice No",
      "invoiceNumber",
      "invoice_number",
    ],
  },
  {
    key: "invoiceAmount",
    label: "Invoice Amount",
    aliases: ["Invoice Amount", "invoiceAmount", "invoice_amount"],
  },
  {
    key: "disbursementAmount",
    label: "Disbursement Amount",
    aliases: [
      "Disbursement Amount",
      "Disbursment Amount",
      "disbursementAmount",
      "disbursmentAmount",
      "disbursement_amount",
    ],
  },
  {
    key: "disbursementDate",
    label: "Disbursement Date",
    aliases: [
      "Disbursement Date",
      "Disbursment Date",
      "disbursementDate",
      "disbursmentDate",
      "disbursement_date",
    ],
  },
  {
    key: "disbursementUtr",
    label: "Disbursement UTR",
    aliases: [
      "Disbursement UTR",
      "Disbursment UTR",
      "disbursementUtr",
      "disbursmentUtr",
      "disbursement_utr",
    ],
  },
];

const COLLECTION_HEADER_DEFINITIONS = [
  {
    key: "lan",
    label: "LAN",
    aliases: ["LAN", "lan"],
  },
  {
    key: "collectionUtr",
    label: "Collection UTR",
    aliases: ["Collection UTR", "collectionUtr", "collection_utr", "UTR"],
  },
  {
    key: "collectionDate",
    label: "Collection Date",
    aliases: ["Collection Date", "collectionDate", "collection_date"],
  },
  {
    key: "collectionAmount",
    label: "Collection Amount",
    aliases: ["Collection Amount", "collectionAmount", "collection_amount"],
  },
];

function normalizeHeaderName(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function mapUploadRows(headers, extractedRows, definitions) {
  const availableHeaders = new Map();

  for (const header of headers) {
    availableHeaders.set(normalizeHeaderName(header), header);
  }

  const resolvedHeaders = {};
  const missingHeaders = [];

  for (const definition of definitions) {
    const matchedAlias = definition.aliases.find((alias) =>
      availableHeaders.has(normalizeHeaderName(alias)),
    );

    if (!matchedAlias) {
      missingHeaders.push(definition.label);

      continue;
    }

    resolvedHeaders[definition.key] = availableHeaders.get(
      normalizeHeaderName(matchedAlias),
    );
  }

  if (missingHeaders.length > 0) {
    return {
      rows: [],
      missingHeaders,
    };
  }

  return {
    rows: extractedRows.map((rawRow) => {
      const mappedRow = {};

      for (const definition of definitions) {
        mappedRow[definition.key] = rawRow[resolvedHeaders[definition.key]];
      }

      return mappedRow;
    }),

    missingHeaders: [],
  };
}

function getTodaySqlDate() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIME_ZONE,

    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return `${values.year}-` + `${values.month}-` + `${values.day}`;
}

function databaseDateToSqlDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return [
      value.getFullYear(),

      String(value.getMonth() + 1).padStart(2, "0"),

      String(value.getDate()).padStart(2, "0"),
    ].join("-");
  }

  const match = String(value ?? "").match(/\d{4}-\d{2}-\d{2}/);

  if (!match) {
    throw new RowImportError(
      "date",
      "Database returned an invalid date value.",
    );
  }

  return match[0];
}

function sqlDateToUtcDate(sqlDate) {
  const [year, month, day] = String(sqlDate).split("-").map(Number);

  return new Date(Date.UTC(year, month - 1, day));
}

function utcDateToSqlDate(value) {
  return [
    value.getUTCFullYear(),

    String(value.getUTCMonth() + 1).padStart(2, "0"),

    String(value.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function addDaysSqlDate(sqlDate, days) {
  const date = sqlDateToUtcDate(sqlDate);

  date.setUTCDate(date.getUTCDate() + Number(days));

  return utcDateToSqlDate(date);
}

function addMonthsSqlDate(sqlDate, months) {
  const source = sqlDateToUtcDate(sqlDate);

  const sourceDay = source.getUTCDate();

  const targetFirstDay = new Date(
    Date.UTC(
      source.getUTCFullYear(),

      source.getUTCMonth() + Number(months),

      1,
    ),
  );

  const lastDayOfTargetMonth = new Date(
    Date.UTC(
      targetFirstDay.getUTCFullYear(),

      targetFirstDay.getUTCMonth() + 1,

      0,
    ),
  ).getUTCDate();

  targetFirstDay.setUTCDate(Math.min(sourceDay, lastDayOfTargetMonth));

  return utcDateToSqlDate(targetFirstDay);
}

function diffSqlDates(laterDate, earlierDate) {
  return Math.floor(
    (sqlDateToUtcDate(laterDate).getTime() -
      sqlDateToUtcDate(earlierDate).getTime()) /
      86400000,
  );
}

function laterSqlDate(firstDate, secondDate) {
  return firstDate >= secondDate ? firstDate : secondDate;
}

function normalizeUploadDate(value, fieldName, { allowFuture = false } = {}) {
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

        `${fieldName} contains an invalid Excel date.`,
      );
    }

    year = parsedExcelDate.y;

    month = parsedExcelDate.m;

    day = parsedExcelDate.d;
  } else {
    const dateValue = String(value ?? "").trim();

    if (!dateValue) {
      throw new RowImportError(
        "validation",

        `${fieldName} is required.`,
      );
    }

    let match = dateValue.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);

    if (match) {
      year = Number(match[1]);

      month = Number(match[2]);

      day = Number(match[3]);
    } else {
      match = dateValue.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);

      if (!match) {
        throw new RowImportError(
          "validation",

          `${fieldName} must be YYYY-MM-DD or DD-MM-YYYY.`,
        );
      }

      day = Number(match[1]);

      month = Number(match[2]);

      year = Number(match[3]);
    }
  }

  const parsedDate = new Date(Date.UTC(year, month - 1, day));

  if (
    parsedDate.getUTCFullYear() !== year ||
    parsedDate.getUTCMonth() + 1 !== month ||
    parsedDate.getUTCDate() !== day
  ) {
    throw new RowImportError(
      "validation",

      `${fieldName} is not a valid date.`,
    );
  }

  const sqlDate = utcDateToSqlDate(parsedDate);

  if (!allowFuture && sqlDate > getTodaySqlDate()) {
    throw new RowImportError(
      "validation",

      `${fieldName} cannot be a future date.`,
    );
  }

  return sqlDate;
}

function roundMoney(value) {
  return Number(
    (Math.round((Number(value) + Number.EPSILON) * 100) / 100).toFixed(2),
  );
}

function roundSix(value) {
  return Number(
    (Math.round((Number(value) + Number.EPSILON) * 1000000) / 1000000).toFixed(
      6,
    ),
  );
}

function amountToCents(value) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    throw new RowImportError("calculation", "Invalid monetary value.");
  }

  return Math.round(numericValue * 100);
}

function centsToAmount(value) {
  return Number((Number(value) / 100).toFixed(2));
}

function formatIndianAmount(value) {
  return Number(value).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function normalizeInvoiceRow(row) {
  const lan = normalizeText(row.lan, "lan", 100).toUpperCase();

  const invoiceNumber = normalizeIdentifier(
    row.invoiceNumber,
    "invoiceNumber",
  ).toUpperCase();

  const disbursementUtr = normalizeIdentifier(
    row.disbursementUtr,
    "disbursementUtr",
  ).toUpperCase();

  if (invoiceNumber.length > 100) {
    throw new RowImportError(
      "validation",
      "invoiceNumber cannot exceed 100 characters.",
    );
  }

  if (disbursementUtr.length > 100) {
    throw new RowImportError(
      "validation",
      "disbursementUtr cannot exceed 100 characters.",
    );
  }

  const invoiceAmount = parseNumber(row.invoiceAmount, "invoiceAmount", {
    maximum: MAX_MONEY_VALUE,
  });

  const disbursementAmount = parseNumber(
    row.disbursementAmount,
    "disbursementAmount",
    {
      maximum: MAX_MONEY_VALUE,
    },
  );

  if (disbursementAmount > invoiceAmount) {
    throw new RowImportError(
      "validation",
      "disbursementAmount cannot be greater than invoiceAmount.",
    );
  }

  return {
    lan,

    invoiceNumber,

    invoiceAmount: Number(invoiceAmount.toFixed(2)),

    disbursementAmount: Number(disbursementAmount.toFixed(2)),

    disbursementDate: normalizeUploadDate(
      row.disbursementDate,
      "disbursementDate",
    ),

    disbursementUtr,
  };
}

function normalizeCollectionRow(row) {
  const lan = normalizeText(row.lan, "lan", 100).toUpperCase();

  const collectionUtr = normalizeIdentifier(
    row.collectionUtr,
    "collectionUtr",
  ).toUpperCase();

  if (collectionUtr.length > 100) {
    throw new RowImportError(
      "validation",

      "collectionUtr cannot exceed 100 characters.",
    );
  }

  const collectionAmount = parseNumber(
    row.collectionAmount,

    "collectionAmount",

    {
      maximum: 9999999999999.99,
    },
  );

  return {
    lan,

    collectionUtr,

    collectionDate: normalizeUploadDate(
      row.collectionDate,

      "collectionDate",
    ),

    collectionAmount: roundMoney(collectionAmount),
  };
}

function buildPublicSmdRowError(error, rowNumber, lan) {
  if (error instanceof RowImportError) {
    return {
      row: rowNumber,
      lan: lan || null,
      stage: error.stage,
      reason: error.message,
      ...error.details,
    };
  }

  if (error?.code === "ER_DUP_ENTRY") {
    return {
      row: rowNumber,
      lan: lan || null,
      stage: "duplicate",

      reason:
        error.sqlMessage ||
        error.message ||
        "The invoice, disbursement UTR, or collection UTR already exists.",

      database_code: error.code,

      sql_state: error.sqlState || null,
    };
  }

  return {
    row: rowNumber,
    lan: lan || null,
    stage: "database",

    reason:
      error?.sqlMessage ||
      error?.message ||
      "The row could not be processed due to a database error.",

    database_code: error?.code || null,

    sql_state: error?.sqlState || null,
  };
}

async function recalculateLoanUtilization(conn, loanBookingId) {
  const [loanRows] = await conn.query(
    `
      SELECT
        id,
        lan,
        loan_limit
      FROM loan_booking_sterlion_mexon_dexon
      WHERE id = ?
      LIMIT 1
      FOR UPDATE
    `,
    [loanBookingId],
  );

  if (loanRows.length === 0) {
    throw new RowImportError("loan_lookup", "Loan booking was not found.");
  }

  const loan = loanRows[0];

  const loanLimitCents = amountToCents(loan.loan_limit);

  if (!Number.isSafeInteger(loanLimitCents) || loanLimitCents <= 0) {
    throw new RowImportError(
      "loan_limit",
      `Loan Limit is invalid for LAN ${loan.lan}.`,
    );
  }

  const [disbursementRows] = await conn.query(
    `
      SELECT
        COALESCE(
          SUM(disbursement_amount),
          0.00
        ) AS total_disbursement
      FROM loan_invoices_sterlion_mexon_dexon
      WHERE loan_booking_id = ?
        AND status <> 'CANCELLED'
    `,
    [loanBookingId],
  );

  const [allocationRows] = await conn.query(
    `
      SELECT
        COALESCE(
          SUM(a.allocated_amount),
          0.00
        ) AS total_principal_allocated
      FROM loan_collection_allocations_sterlion_mexon_dexon a
      INNER JOIN loan_invoices_sterlion_mexon_dexon i
        ON i.id = a.invoice_id
      WHERE i.loan_booking_id = ?
        AND i.status <> 'CANCELLED'
        AND a.allocation_component = 'PRINCIPAL'
    `,
    [loanBookingId],
  );

  const totalDisbursementCents = amountToCents(
    disbursementRows[0].total_disbursement,
  );

  const totalPrincipalAllocatedCents = amountToCents(
    allocationRows[0].total_principal_allocated,
  );

  if (totalPrincipalAllocatedCents > totalDisbursementCents) {
    throw new RowImportError(
      "calculation",
      `Principal collection allocation exceeds total disbursement for LAN ${loan.lan}.`,
      {
        total_disbursement: centsToAmount(totalDisbursementCents),

        total_principal_allocated: centsToAmount(totalPrincipalAllocatedCents),
      },
    );
  }

  /*
   * Required calculation:
   *
   * Utilized =
   * Total Disbursement
   * - Total Principal Allocated
   */
  const utilizedCents = totalDisbursementCents - totalPrincipalAllocatedCents;

  // Historical imports may already be above the sanctioned limit. Keep the
  // true utilization visible while preventing the available limit from going
  // negative. New invoice uploads remain blocked by the pre-insert limit check.
  const unutilizedCents = Math.max(loanLimitCents - utilizedCents, 0);

  if (utilizedCents < 0 || unutilizedCents < 0) {
    throw new RowImportError(
      "loan_limit",
      `Utilization is outside the Loan Limit for LAN ${loan.lan}.`,
      {
        loan_limit: centsToAmount(loanLimitCents),

        total_disbursement: centsToAmount(totalDisbursementCents),

        total_principal_allocated: centsToAmount(totalPrincipalAllocatedCents),

        utilized_amount: centsToAmount(utilizedCents),

        unutilized_amount: centsToAmount(unutilizedCents),
      },
    );
  }

  await conn.query(
    `
      UPDATE loan_booking_sterlion_mexon_dexon
      SET
        utilized_amount = ?,
        unutilized_amount = ?
      WHERE id = ?
    `,
    [
      centsToAmount(utilizedCents),

      centsToAmount(unutilizedCents),

      loanBookingId,
    ],
  );

  return {
    loanLimit: centsToAmount(loanLimitCents),

    totalDisbursementAmount: centsToAmount(totalDisbursementCents),

    totalPrincipalAllocated: centsToAmount(totalPrincipalAllocatedCents),

    utilizedAmount: centsToAmount(utilizedCents),

    unutilizedAmount: centsToAmount(unutilizedCents),
  };
}

async function reconcileSterlionMexonDexonUtilizationByLan(lan) {
  let conn;

  try {
    conn = await db.promise().getConnection();
    await conn.beginTransaction();

    const [loanRows] = await conn.query(
      `SELECT id
       FROM loan_booking_sterlion_mexon_dexon
       WHERE lan = ?
       LIMIT 1
       FOR UPDATE`,
      [lan],
    );

    if (loanRows.length > 0) {
      await recalculateLoanUtilization(conn, loanRows[0].id);
    }

    await conn.commit();
  } catch (error) {
    if (conn) {
      await conn.rollback();
    }
    throw error;
  } finally {
    if (conn) {
      conn.release();
    }
  }
}

// async function calculateOpeningCarryPoolExact(
//   conn,
//   loanBookingId,
//   disbursementDate,
//   currentInvoiceId = null,
// ) {
//   let priorInvoiceCondition;
//   let priorInvoiceParams;

//   if (currentInvoiceId) {
//     priorInvoiceCondition = `
//       (
//         i.disbursement_date < ?
//         OR (
//           i.disbursement_date = ?
//           AND i.id < ?
//         )
//       )
//     `;

//     priorInvoiceParams = [disbursementDate, disbursementDate, currentInvoiceId];
//   } else {
//     priorInvoiceCondition = `i.disbursement_date <= ?`;

//     priorInvoiceParams = [disbursementDate];
//   }

//   const [reserveRows] = await conn.query(
//     `
//         SELECT
//           COALESCE(
//             SUM(
//               i.contractual_upfront_interest
//             ),
//             0.00
//           ) AS contractual_interest,

//           COALESCE(
//             SUM(
//               i.carry_forward_applied
//             ),
//             0.00
//           ) AS carry_already_applied
//         FROM loan_invoices_sterlion_mexon_dexon i
//         WHERE i.loan_booking_id = ?
//           AND i.status <> 'CANCELLED'
//           AND ${priorInvoiceCondition}
//       `,
//     [loanBookingId, ...priorInvoiceParams],
//   );

//   const [accrualRows] = await conn.query(
//     `
//         SELECT
//           COALESCE(
//             SUM(
//               d.daily_interest_exact
//             ),
//             0.000000
//           ) AS exact_interest_accrued
//         FROM loan_invoice_daily_accruals_sterlion_mexon_dexon d
//         INNER JOIN loan_invoices_sterlion_mexon_dexon i
//           ON i.id = d.invoice_id
//         WHERE i.loan_booking_id = ?
//           AND i.status <> 'CANCELLED'
//           AND ${priorInvoiceCondition}
//           AND d.accrual_date < ?
//       `,
//     [loanBookingId, ...priorInvoiceParams, disbursementDate],
//   );

//   return roundSix(
//     Math.max(
//       Number(reserveRows[0].contractual_interest || 0) -
//         Number(reserveRows[0].carry_already_applied || 0) -
//         Number(accrualRows[0].exact_interest_accrued || 0),

//       0,
//     ),
//   );
// }

// async function rebuildInvoiceDailyAccruals(conn, invoiceId) {
//   const [invoiceRows] = await conn.query(
//     `
//         SELECT
//           id,
//           loan_booking_id,
//           lan,
//           invoice_number,
//           disbursement_amount,
//           annual_interest_rate,
//           day_count_basis,
//           disbursement_date,
//           maturity_date,
//           contractual_upfront_interest
//         FROM loan_invoices_sterlion_mexon_dexon
//         WHERE id = ?
//         LIMIT 1
//         FOR UPDATE
//       `,
//     [invoiceId],
//   );

//   if (invoiceRows.length === 0) {
//     throw new RowImportError(
//       "invoice_lookup",

//       "Invoice was not found.",
//     );
//   }

//   const invoice = invoiceRows[0];

//   const disbursementDate = databaseDateToSqlDate(invoice.disbursement_date);

//   const maturityDate = databaseDateToSqlDate(invoice.maturity_date);

//   const today = getTodaySqlDate();

//   const endDate = laterSqlDate(maturityDate, today);

//   const totalDays = diffSqlDates(endDate, disbursementDate);

//   if (totalDays > MAX_DAILY_ROWS_PER_INVOICE) {
//     throw new RowImportError(
//       "daily_accrual",

//       `Daily schedule exceeds ${MAX_DAILY_ROWS_PER_INVOICE} rows for invoice ${invoice.invoice_number}.`,
//     );
//   }

//   const [allocationRows] = await conn.query(
//     `
//         SELECT
//           allocation_date,

//           COALESCE(
//             SUM(allocated_amount),
//             0.00
//           ) AS allocated_amount
//         FROM loan_collection_allocations_sterlion_mexon_dexon
//         WHERE invoice_id = ?
//           AND allocation_component =
//             'PRINCIPAL'
//         GROUP BY allocation_date
//         ORDER BY allocation_date ASC
//       `,
//     [invoiceId],
//   );

//   const allocationByDate = new Map();

//   for (const allocation of allocationRows) {
//     const allocationDate = databaseDateToSqlDate(allocation.allocation_date);

//     allocationByDate.set(
//       allocationDate,

//       amountToCents(allocation.allocated_amount),
//     );
//   }

//   await conn.query(
//     `
//       DELETE FROM loan_invoice_daily_accruals_sterlion_mexon_dexon
//       WHERE invoice_id = ?
//     `,
//     [invoiceId],
//   );

//   let openingPrincipalCents = amountToCents(invoice.disbursement_amount);

//   for (const [allocationDate, allocationCents] of allocationByDate.entries()) {
//     if (allocationDate <= disbursementDate) {
//       openingPrincipalCents = Math.max(
//         openingPrincipalCents - allocationCents,

//         0,
//       );
//     }
//   }

//   let currentDate = addDaysSqlDate(disbursementDate, 1);

//   let dayNumber = 1;

//   let cumulativeExact = 0;
//   let cumulativePosted = 0;

//   let actualExact = 0;
//   let actualPosted = 0;

//   const insertRows = [];

//   while (currentDate <= endDate) {
//     const allocatedTodayCents = allocationByDate.get(currentDate) || 0;

//     const openingPrincipal = centsToAmount(openingPrincipalCents);

//     const dailyInterestExact = roundSix(
//       (openingPrincipal * (Number(invoice.annual_interest_rate) / 100)) /
//         Number(invoice.day_count_basis),
//     );

//     const dailyInterestPosted = roundMoney(dailyInterestExact);

//     const closingPrincipalCents = Math.max(
//       openingPrincipalCents - allocatedTodayCents,

//       0,
//     );

//     const closingPrincipal = centsToAmount(closingPrincipalCents);

//     cumulativeExact = roundSix(cumulativeExact + dailyInterestExact);

//     cumulativePosted = roundMoney(cumulativePosted + dailyInterestPosted);

//     if (currentDate <= today) {
//       actualExact = cumulativeExact;

//       actualPosted = cumulativePosted;
//     }

//     const dpd =
//       closingPrincipalCents > 0 && currentDate > maturityDate
//         ? diffSqlDates(currentDate, maturityDate)
//         : 0;

//     let status;

//     if (closingPrincipalCents === 0) {
//       status = "PAID";
//     } else if (currentDate > today) {
//       status = "SCHEDULED";
//     } else if (dpd > 0) {
//       status = "OVERDUE";
//     } else {
//       status = "ACTIVE";
//     }

//     insertRows.push([
//       invoiceId,

//       invoice.lan,

//       invoice.invoice_number,

//       currentDate,

//       dayNumber,

//       openingPrincipal,

//       Number(invoice.annual_interest_rate),

//       Number(invoice.day_count_basis),

//       1,

//       dailyInterestExact,

//       dailyInterestPosted,

//       centsToAmount(allocatedTodayCents),

//       closingPrincipal,

//       cumulativeExact,

//       cumulativePosted,

//       roundMoney(cumulativePosted - roundMoney(cumulativeExact)),

//       maturityDate,

//       dpd,

//       status,

//       roundSix(
//         Math.max(
//           Number(invoice.contractual_upfront_interest) - cumulativeExact,

//           0,
//         ),
//       ),
//     ]);

//     openingPrincipalCents = closingPrincipalCents;

//     currentDate = addDaysSqlDate(currentDate, 1);

//     dayNumber += 1;
//   }

//   for (
//     let startIndex = 0;
//     startIndex < insertRows.length;
//     startIndex += DAILY_INSERT_BATCH_SIZE
//   ) {
//     const batch = insertRows.slice(
//       startIndex,

//       startIndex + DAILY_INSERT_BATCH_SIZE,
//     );

//     await conn.query(
//       `
//         INSERT INTO loan_invoice_daily_accruals_sterlion_mexon_dexon (
//           invoice_id,
//           lan,
//           invoice_number,
//           accrual_date,
//           day_number,
//           opening_principal,
//           annual_interest_rate,
//           day_count_basis,
//           actual_days,
//           daily_interest_exact,
//           daily_interest_posted,
//           principal_allocated_today,
//           closing_principal,
//           cumulative_interest_exact,
//           cumulative_interest_posted,
//           rounding_difference,
//           maturity_date,
//           dpd,
//           status,
//           upfront_interest_remaining_exact
//         )
//         VALUES ?
//       `,
//       [batch],
//     );
//   }

//   const [allocatedRows] = await conn.query(
//     `
//         SELECT
//           COALESCE(
//             SUM(allocated_amount),
//             0.00
//           ) AS principal_allocated
//         FROM loan_collection_allocations_sterlion_mexon_dexon
//         WHERE invoice_id = ?
//           AND allocation_component =
//             'PRINCIPAL'
//       `,
//     [invoiceId],
//   );

//   const principalAllocatedCents = amountToCents(
//     allocatedRows[0].principal_allocated,
//   );

//   const grossPrincipalCents = amountToCents(invoice.disbursement_amount);

//   const outstandingCents = Math.max(
//     grossPrincipalCents - principalAllocatedCents,

//     0,
//   );

//   const currentDpd =
//     outstandingCents > 0 && today > maturityDate
//       ? diffSqlDates(today, maturityDate)
//       : 0;

//   const currentStatus =
//     outstandingCents === 0 ? "PAID" : currentDpd > 0 ? "OVERDUE" : "ACTIVE";

//   await conn.query(
//     `
//       UPDATE loan_invoices_sterlion_mexon_dexon
//       SET
//         principal_allocated = ?,
//         outstanding_principal = ?,
//         exact_interest_accrued = ?,
//         posted_interest_accrued = ?,
//         current_dpd = ?,
//         status = ?
//       WHERE id = ?
//     `,
//     [
//       centsToAmount(principalAllocatedCents),

//       centsToAmount(outstandingCents),

//       actualExact,

//       actualPosted,

//       currentDpd,

//       currentStatus,

//       invoiceId,
//     ],
//   );

//   return {
//     principalAllocated: centsToAmount(principalAllocatedCents),

//     outstandingPrincipal: centsToAmount(outstandingCents),

//     exactInterestAccrued: actualExact,

//     postedInterestAccrued: actualPosted,

//     currentDpd,

//     status: currentStatus,
//   };
// }

// async function calculateOpeningCarryPoolExact(
//   conn,
//   loanBookingId,
//   disbursementDate,
//   currentInvoiceId = null,
// ) {
//   /*
//    * ============================================================
//    * BUSINESS RULE
//    * ============================================================
//    *
//    * Carry is NOT:
//    *
//    *   Contractual Interest - Accrued Interest
//    *
//    * Carry is generated ONLY when principal is actually repaid
//    * before maturity.
//    *
//    * For every principal allocation:
//    *
//    * Carry Generated =
//    *   Principal Repaid
//    *   × Annual Rate
//    *   × Remaining Contractual Days
//    *   / Day Count Basis
//    *
//    * Example:
//    *
//    * Principal       = 8,00,000
//    * Rate            = 36%
//    * Tenure          = 90 days
//    * Paid on Day     = 15
//    * Remaining Days  = 75
//    *
//    * Carry =
//    * 8,00,000 × 36% × 75 / 360
//    * = 60,000
//    *
//    * ============================================================
//    */

//   /*
//    * Find all principal repayments that happened on or before
//    * this new invoice's disbursement date.
//    */
//   const [allocationRows] = await conn.query(
//     `
//       SELECT
//         a.id AS allocation_id,
//         a.allocated_amount,
//         a.allocation_date,

//         i.id AS invoice_id,
//         i.invoice_number,
//         i.disbursement_date,
//         i.maturity_date,
//         i.annual_interest_rate,
//         i.day_count_basis

//       FROM loan_collection_allocations_sterlion_mexon_dexon a

//       INNER JOIN loan_invoices_sterlion_mexon_dexon i
//         ON i.id = a.invoice_id

//       INNER JOIN loan_collections_sterlion_mexon_dexon c
//         ON c.id = a.collection_id

//       WHERE a.loan_booking_id = ?
//         AND a.allocation_component = 'PRINCIPAL'
//         AND i.status <> 'CANCELLED'
//         AND c.status <> 'REVERSED'
//         AND a.allocation_date <= ?

//       ORDER BY
//         a.allocation_date ASC,
//         a.id ASC
//     `,
//     [loanBookingId, disbursementDate],
//   );

//   let totalCarryGeneratedExact = 0;

//   for (const allocation of allocationRows) {
//     const allocatedAmount = Number(allocation.allocated_amount || 0);

//     if (allocatedAmount <= 0) {
//       continue;
//     }

//     const allocationDate = databaseDateToSqlDate(allocation.allocation_date);

//     const maturityDate = databaseDateToSqlDate(allocation.maturity_date);

//     /*
//      * If customer pays on day 15 of a 90-day facility:
//      *
//      * maturity - allocation date = 75 days.
//      *
//      * Day 15 interest has already been earned.
//      * Carry starts from Day 16.
//      */
//     const remainingDays = Math.max(
//       diffSqlDates(maturityDate, allocationDate),
//       0,
//     );

//     /*
//      * Payment on or after maturity:
//      * no unused future interest.
//      */
//     if (remainingDays <= 0) {
//       continue;
//     }

//     const annualInterestRate = Number(allocation.annual_interest_rate || 0);

//     const dayCountBasis = Number(
//       allocation.day_count_basis || SMD_DAY_COUNT_BASIS,
//     );

//     if (
//       !Number.isFinite(annualInterestRate) ||
//       annualInterestRate < 0 ||
//       !Number.isFinite(dayCountBasis) ||
//       dayCountBasis <= 0
//     ) {
//       throw new RowImportError(
//         "calculation",
//         `Invalid interest configuration for invoice ${allocation.invoice_number}.`,
//       );
//     }

//     const carryGeneratedExact =
//       allocatedAmount *
//       (annualInterestRate / 100) *
//       (remainingDays / dayCountBasis);

//     totalCarryGeneratedExact = roundSix(
//       totalCarryGeneratedExact + carryGeneratedExact,
//     );
//   }

//   /*
//    * ============================================================
//    * Find carry already consumed by PREVIOUS invoices.
//    * ============================================================
//    */

//   let priorInvoiceCondition;
//   let priorInvoiceParams;

//   if (currentInvoiceId) {
//     /*
//      * Recalculation mode.
//      *
//      * Only invoices before the current invoice may have
//      * consumed the carry.
//      */
//     priorInvoiceCondition = `
//       (
//         i.disbursement_date < ?
//         OR (
//           i.disbursement_date = ?
//           AND i.id < ?
//         )
//       )
//     `;

//     priorInvoiceParams = [disbursementDate, disbursementDate, currentInvoiceId];
//   } else {
//     /*
//      * New invoice mode.
//      *
//      * All already-existing invoices up to this date are prior.
//      */
//     priorInvoiceCondition = `
//       i.disbursement_date <= ?
//     `;

//     priorInvoiceParams = [disbursementDate];
//   }

//   const [usedCarryRows] = await conn.query(
//     `
//       SELECT
//         COALESCE(
//           SUM(i.carry_forward_applied),
//           0.00
//         ) AS carry_already_applied

//       FROM loan_invoices_sterlion_mexon_dexon i

//       WHERE i.loan_booking_id = ?
//         AND i.status <> 'CANCELLED'
//         AND ${priorInvoiceCondition}
//     `,
//     [loanBookingId, ...priorInvoiceParams],
//   );

//   const totalCarryAlreadyApplied = Number(
//     usedCarryRows[0]?.carry_already_applied || 0,
//   );

//   /*
//    * Available Carry =
//    *
//    * Total refund generated by early principal repayments
//    * -
//    * Carry already consumed by previous invoices
//    */
//   const availableCarryExact = roundSix(
//     Math.max(totalCarryGeneratedExact - totalCarryAlreadyApplied, 0),
//   );

//   return availableCarryExact;
// }

async function calculateOpeningCarryPoolExact(
  conn,
  loanBookingId,
  currentInvoiceDate,
  currentInvoiceId = null,
) {
  /*
   * ============================================================
   * CARRY FORWARD BUSINESS RULE
   * ============================================================
   *
   * Carry is generated ONLY when principal is actually repaid.
   *
   * Carry generated =
   *
   * Principal Repaid
   * × Annual Interest Rate
   * × Remaining Contractual Days
   * / Day Count Basis
   *
   * Example:
   *
   * Principal       = 8,00,000
   * Rate            = 36%
   * Contract days   = 90
   * Collection day  = 15
   * Remaining days  = 75
   *
   * Carry =
   * 8,00,000 × 36% × 75 / 360
   * = 60,000
   *
   * IMPORTANT:
   *
   * Only collections that happened ON OR BEFORE the current
   * invoice date can create carry for that invoice.
   *
   * Therefore:
   *
   * Invoice 2 date = 13-Aug
   * Collection     = 18-Aug
   *
   * Collection cannot affect Invoice 2.
   *
   * Invoice 3 date = 23-Aug
   *
   * Collection CAN affect Invoice 3.
   * ============================================================
   */

  const [allocationRows] = await conn.query(
    `
      SELECT
        a.id AS allocation_id,
        a.allocated_amount,
        a.allocation_date,

        i.id AS source_invoice_id,
        i.invoice_number,
        i.disbursement_date,
        i.tenure_months,
        i.annual_interest_rate,
        i.day_count_basis

      FROM loan_collection_allocations_sterlion_mexon_dexon a

      INNER JOIN loan_invoices_sterlion_mexon_dexon i
        ON i.id = a.invoice_id

      INNER JOIN loan_collections_sterlion_mexon_dexon c
        ON c.id = a.collection_id

      WHERE a.loan_booking_id = ?

        AND a.allocation_component = 'PRINCIPAL'

        AND i.status <> 'CANCELLED'

        AND c.status <> 'REVERSED'

        /*
         * CRITICAL CONDITION:
         *
         * A future collection must NEVER affect
         * an earlier invoice.
         */
        AND a.allocation_date <= ?

      ORDER BY
        a.allocation_date ASC,
        a.id ASC
    `,
    [loanBookingId, currentInvoiceDate],
  );

  let totalCarryGeneratedExact = 0;

  const processedAllocationIds = new Set();

  for (const allocation of allocationRows) {
    if (processedAllocationIds.has(allocation.allocation_id)) {
      continue;
    }

    processedAllocationIds.add(allocation.allocation_id);

    const originalDisbursementDate = databaseDateToSqlDate(
      allocation.disbursement_date,
    );

    const allocationDate = databaseDateToSqlDate(allocation.allocation_date);

    const tenureMonths = Number(allocation.tenure_months);

    const contractualDays = getSmdContractualDays(tenureMonths);

    /*
     * Example:
     *
     * Disbursement = 03-Aug
     * Collection   = 18-Aug
     *
     * Used days = 15
     */
    let usedDays = diffSqlDates(allocationDate, originalDisbursementDate);

    /*
     * Protect against invalid/backdated values.
     */
    usedDays = Math.max(Math.min(usedDays, contractualDays), 0);

    /*
     * Example:
     *
     * Contractual = 90
     * Used        = 15
     *
     * Remaining = 75
     */
    const remainingDays = Math.max(contractualDays - usedDays, 0);

    /*
     * Payment at/after end of tenure:
     * there is no unused future interest.
     */
    if (remainingDays <= 0) {
      continue;
    }

    const annualInterestRate = Number(allocation.annual_interest_rate || 0);

    const dayCountBasis = Number(
      allocation.day_count_basis || SMD_DAY_COUNT_BASIS,
    );

    if (
      !Number.isFinite(annualInterestRate) ||
      annualInterestRate <= 0 ||
      !Number.isFinite(dayCountBasis) ||
      dayCountBasis <= 0
    ) {
      throw new RowImportError(
        "calculation",
        `Invalid interest configuration for invoice ${allocation.invoice_number}.`,
      );
    }

    const [existingCarryRows] = await conn.query(
      `
SELECT carry_generated_amount

FROM loan_collection_allocations_sterlion_mexon_dexon

WHERE id = ?

LIMIT 1
`,
      [allocation.allocation_id],
    );

    const alreadyGeneratedCarry = Number(
      existingCarryRows[0]?.carry_generated_amount || 0,
    );

    if (alreadyGeneratedCarry > 0) {
      totalCarryGeneratedExact = roundSix(
        totalCarryGeneratedExact + alreadyGeneratedCarry,
      );

      continue;
    }

    await conn.query(
      `
UPDATE loan_collection_allocations_sterlion_mexon_dexon

SET carry_generated_amount = ?

WHERE id = ?

`,
      [carryGeneratedExact, allocation.allocation_id],
    );

    /*
     * Unused future interest released by this
     * principal repayment.
     */
    const carryGeneratedExact = roundSix(
      principalRepaid *
        (annualInterestRate / 100) *
        (remainingDays / dayCountBasis),
    );

    totalCarryGeneratedExact = roundSix(
      totalCarryGeneratedExact + carryGeneratedExact,
    );
  }

  /*
   * ============================================================
   * Calculate carry already consumed by invoices BEFORE
   * the current invoice.
   * ============================================================
   */

  let previousInvoiceCondition;
  let previousInvoiceParams;

  if (currentInvoiceId !== null) {
    /*
     * Used when rebuilding the complete invoice chain.
     *
     * Only invoices chronologically BEFORE this invoice
     * can have consumed carry.
     */
    previousInvoiceCondition = `
      (
        i.disbursement_date < ?

        OR (
          i.disbursement_date = ?
          AND i.id < ?
        )
      )
    `;

    previousInvoiceParams = [
      currentInvoiceDate,
      currentInvoiceDate,
      currentInvoiceId,
    ];
  } else {
    /*
     * Used while creating a NEW invoice.
     *
     * The current invoice does not exist yet,
     * therefore all existing invoices on/before
     * this date are previous invoices.
     */
    previousInvoiceCondition = `
      i.disbursement_date <= ?
    `;

    previousInvoiceParams = [currentInvoiceDate];
  }

  const [consumedRows] = await conn.query(
    `
      SELECT
        COALESCE(
          SUM(i.carry_forward_applied),
          0.00
        ) AS total_carry_consumed

      FROM loan_invoices_sterlion_mexon_dexon i

      WHERE i.loan_booking_id = ?

        AND i.status <> 'CANCELLED'

        AND ${previousInvoiceCondition}
    `,
    [loanBookingId, ...previousInvoiceParams],
  );

  const totalCarryConsumed = Number(consumedRows[0]?.total_carry_consumed || 0);

  /*
   * ============================================================
   * Available Carry
   * ============================================================
   *
   * Generated carry
   * -
   * Carry already consumed
   */
  const availableCarryExact = roundSix(
    Math.max(totalCarryGeneratedExact - totalCarryConsumed, 0),
  );

  return availableCarryExact;
}

async function refreshInvoiceAccrualSummary(conn, invoiceId) {
  const [invoiceRows] = await conn.query(
    `
      SELECT
        id,
        disbursement_amount,
        maturity_date
      FROM loan_invoices_sterlion_mexon_dexon
      WHERE id = ?
      LIMIT 1
      FOR UPDATE
    `,
    [invoiceId],
  );

  if (invoiceRows.length === 0) {
    throw new RowImportError("invoice_lookup", "Invoice was not found.");
  }

  const invoice = invoiceRows[0];

  const today = getTodaySqlDate();

  const maturityDate = databaseDateToSqlDate(invoice.maturity_date);

  const [allocatedRows] = await conn.query(
    `
        SELECT
          COALESCE(
            SUM(allocated_amount),
            0.00
          ) AS principal_allocated
        FROM loan_collection_allocations_sterlion_mexon_dexon
        WHERE invoice_id = ?
          AND allocation_component = 'PRINCIPAL'
      `,
    [invoiceId],
  );

  const [latestAccrualRows] = await conn.query(
    `
        SELECT
          cumulative_interest_exact,
          cumulative_interest_posted
        FROM loan_invoice_daily_accruals_sterlion_mexon_dexon
        WHERE invoice_id = ?
          AND accrual_date <= ?
        ORDER BY accrual_date DESC
        LIMIT 1
      `,
    [invoiceId, today],
  );

  const principalAllocatedCents = amountToCents(
    allocatedRows[0].principal_allocated,
  );

  const grossPrincipalCents = amountToCents(invoice.disbursement_amount);

  const outstandingCents = Math.max(
    grossPrincipalCents - principalAllocatedCents,
    0,
  );

  const exactInterestAccrued =
    latestAccrualRows.length > 0
      ? roundSix(latestAccrualRows[0].cumulative_interest_exact)
      : 0;

  const postedInterestAccrued =
    latestAccrualRows.length > 0
      ? roundMoney(latestAccrualRows[0].cumulative_interest_posted)
      : 0;

  const currentDpd =
    outstandingCents > 0 && today > maturityDate
      ? diffSqlDates(today, maturityDate)
      : 0;

  const currentStatus =
    outstandingCents === 0 ? "PAID" : currentDpd > 0 ? "OVERDUE" : "ACTIVE";

  await conn.query(
    `
      UPDATE loan_invoices_sterlion_mexon_dexon
      SET
        principal_allocated = ?,
        outstanding_principal = ?,
        exact_interest_accrued = ?,
        posted_interest_accrued = ?,
        current_dpd = ?,
        status = ?
      WHERE id = ?
    `,
    [
      centsToAmount(principalAllocatedCents),

      centsToAmount(outstandingCents),

      exactInterestAccrued,

      postedInterestAccrued,

      currentDpd,

      currentStatus,

      invoiceId,
    ],
  );

  return {
    principalAllocated: centsToAmount(principalAllocatedCents),

    outstandingPrincipal: centsToAmount(outstandingCents),

    exactInterestAccrued,

    postedInterestAccrued,

    currentDpd,

    status: currentStatus,
  };
}

async function recalculateExistingInvoiceDailyAccruals(conn, invoiceId) {
  const [invoiceRows] = await conn.query(
    `
        SELECT
          id,
          lan,
          invoice_number,
          disbursement_amount,
          annual_interest_rate,
          day_count_basis,
          disbursement_date,
          maturity_date,
          contractual_upfront_interest
        FROM loan_invoices_sterlion_mexon_dexon
        WHERE id = ?
        LIMIT 1
        FOR UPDATE
      `,
    [invoiceId],
  );

  if (invoiceRows.length === 0) {
    throw new RowImportError("invoice_lookup", "Invoice was not found.");
  }

  const invoice = invoiceRows[0];

  const disbursementDate = databaseDateToSqlDate(invoice.disbursement_date);

  const maturityDate = databaseDateToSqlDate(invoice.maturity_date);

  const today = getTodaySqlDate();

  const [allocationRows] = await conn.query(
    `
        SELECT
          allocation_date,

          COALESCE(
            SUM(allocated_amount),
            0.00
          ) AS allocated_amount

        FROM loan_collection_allocations_sterlion_mexon_dexon

        WHERE invoice_id = ?
          AND allocation_component = 'PRINCIPAL'

        GROUP BY allocation_date

        ORDER BY allocation_date ASC
      `,
    [invoiceId],
  );

  const allocationByDate = new Map();

  for (const allocation of allocationRows) {
    allocationByDate.set(
      databaseDateToSqlDate(allocation.allocation_date),

      amountToCents(allocation.allocated_amount),
    );
  }

  const [existingRows] = await conn.query(
    `
        SELECT
          id,
          accrual_date
        FROM loan_invoice_daily_accruals_sterlion_mexon_dexon
        WHERE invoice_id = ?
        ORDER BY accrual_date ASC
        FOR UPDATE
      `,
    [invoiceId],
  );

  let openingPrincipalCents = amountToCents(invoice.disbursement_amount);

  for (const [allocationDate, allocationCents] of allocationByDate.entries()) {
    if (allocationDate <= disbursementDate) {
      openingPrincipalCents = Math.max(
        openingPrincipalCents - allocationCents,
        0,
      );
    }
  }

  let cumulativeExact = 0;

  let cumulativePosted = 0;

  for (const existingRow of existingRows) {
    const currentDate = databaseDateToSqlDate(existingRow.accrual_date);

    const allocatedTodayCents = allocationByDate.get(currentDate) || 0;

    const openingPrincipal = centsToAmount(openingPrincipalCents);

    /*
     * Existing interest calculation
     * remains unchanged.
     */
    const dailyInterestExact = roundSix(
      (openingPrincipal * (Number(invoice.annual_interest_rate) / 100)) /
        Number(invoice.day_count_basis),
    );

    const dailyInterestPosted = roundMoney(dailyInterestExact);

    const closingPrincipalCents = Math.max(
      openingPrincipalCents - allocatedTodayCents,
      0,
    );

    const closingPrincipal = centsToAmount(closingPrincipalCents);

    cumulativeExact = roundSix(cumulativeExact + dailyInterestExact);

    cumulativePosted = roundMoney(cumulativePosted + dailyInterestPosted);

    const dpd =
      closingPrincipalCents > 0 && currentDate > maturityDate
        ? diffSqlDates(currentDate, maturityDate)
        : 0;

    const status =
      closingPrincipalCents === 0
        ? "PAID"
        : currentDate > today
          ? "SCHEDULED"
          : dpd > 0
            ? "OVERDUE"
            : "ACTIVE";

    await conn.query(
      `
        UPDATE loan_invoice_daily_accruals_sterlion_mexon_dexon
        SET
          opening_principal = ?,
          annual_interest_rate = ?,
          day_count_basis = ?,
          actual_days = 1,
          daily_interest_exact = ?,
          daily_interest_posted = ?,
          principal_allocated_today = ?,
          closing_principal = ?,
          cumulative_interest_exact = ?,
          cumulative_interest_posted = ?,
          rounding_difference = ?,
          maturity_date = ?,
          dpd = ?,
          status = ?,
          upfront_interest_remaining_exact = ?
        WHERE id = ?
      `,
      [
        openingPrincipal,

        Number(invoice.annual_interest_rate),

        Number(invoice.day_count_basis),

        dailyInterestExact,

        dailyInterestPosted,

        centsToAmount(allocatedTodayCents),

        closingPrincipal,

        cumulativeExact,

        cumulativePosted,

        roundMoney(cumulativePosted - roundMoney(cumulativeExact)),

        maturityDate,

        dpd,

        status,

        roundSix(
          Math.max(
            Number(invoice.contractual_upfront_interest) - cumulativeExact,
            0,
          ),
        ),

        existingRow.id,
      ],
    );

    openingPrincipalCents = closingPrincipalCents;
  }

  return refreshInvoiceAccrualSummary(conn, invoiceId);
}

async function insertInvoiceDailyAccrualForDate(conn, invoiceId, accrualDate) {
  const [invoiceRows] = await conn.query(
    `
        SELECT
          id,
          loan_booking_id,
          lan,
          invoice_number,
          disbursement_amount,
          annual_interest_rate,
          day_count_basis,
          disbursement_date,
          maturity_date,
          contractual_upfront_interest,
          outstanding_principal,
          status
        FROM loan_invoices_sterlion_mexon_dexon
        WHERE id = ?
        LIMIT 1
        FOR UPDATE
      `,
    [invoiceId],
  );

  if (invoiceRows.length === 0) {
    throw new RowImportError("invoice_lookup", "Invoice was not found.");
  }

  const invoice = invoiceRows[0];

  const disbursementDate = databaseDateToSqlDate(invoice.disbursement_date);

  const maturityDate = databaseDateToSqlDate(invoice.maturity_date);

  /*
   * First row starts on the next day
   * after disbursement.
   */
  if (
    invoice.status === "CANCELLED" ||
    Number(invoice.outstanding_principal) <= 0 ||
    accrualDate <= disbursementDate
  ) {
    return {
      inserted: false,

      reason: "Invoice is not eligible for this accrual date.",

      loanBookingId: invoice.loan_booking_id,
    };
  }

  /*
   * Idempotency check.
   */
  const [existingRows] = await conn.query(
    `
        SELECT id
        FROM loan_invoice_daily_accruals_sterlion_mexon_dexon
        WHERE invoice_id = ?
          AND accrual_date = ?
        LIMIT 1
      `,
    [invoiceId, accrualDate],
  );

  if (existingRows.length > 0) {
    return {
      inserted: false,

      reason: "Daily accrual row already exists.",

      loanBookingId: invoice.loan_booking_id,
    };
  }

  const expectedPreviousDate = addDaysSqlDate(accrualDate, -1);

  const [previousRows] = await conn.query(
    `
        SELECT
          accrual_date,
          closing_principal,
          cumulative_interest_exact,
          cumulative_interest_posted
        FROM loan_invoice_daily_accruals_sterlion_mexon_dexon
        WHERE invoice_id = ?
          AND accrual_date < ?
        ORDER BY accrual_date DESC
        LIMIT 1
        FOR UPDATE
      `,
    [invoiceId, accrualDate],
  );

  let openingPrincipalCents;

  let cumulativeExactBefore = 0;

  let cumulativePostedBefore = 0;

  if (previousRows.length > 0) {
    const previousDate = databaseDateToSqlDate(previousRows[0].accrual_date);

    if (previousDate !== expectedPreviousDate) {
      throw new RowImportError(
        "daily_accrual_gap",

        `The previous daily accrual row is missing for invoice ${invoice.invoice_number}. Expected date: ${expectedPreviousDate}.`,
      );
    }

    openingPrincipalCents = amountToCents(previousRows[0].closing_principal);

    cumulativeExactBefore = Number(
      previousRows[0].cumulative_interest_exact || 0,
    );

    cumulativePostedBefore = Number(
      previousRows[0].cumulative_interest_posted || 0,
    );
  } else {
    const firstAccrualDate = addDaysSqlDate(disbursementDate, 1);

    if (accrualDate !== firstAccrualDate) {
      throw new RowImportError(
        "daily_accrual_gap",

        `The first daily accrual row is missing for invoice ${invoice.invoice_number}. Expected date: ${firstAccrualDate}.`,
      );
    }

    openingPrincipalCents = amountToCents(invoice.disbursement_amount);

    /*
     * A collection allocated on the
     * disbursement date reduces the
     * first day's opening principal.
     */
    const [sameDayAllocationRows] = await conn.query(
      `
        SELECT
          COALESCE(
            SUM(allocated_amount),
            0.00
          ) AS allocated_amount
        FROM loan_collection_allocations_sterlion_mexon_dexon
        WHERE invoice_id = ?
          AND allocation_component = 'PRINCIPAL'
          AND allocation_date <= ?
      `,
      [invoiceId, disbursementDate],
    );

    openingPrincipalCents = Math.max(
      openingPrincipalCents -
        amountToCents(sameDayAllocationRows[0].allocated_amount),
      0,
    );
  }

  const [todayAllocationRows] = await conn.query(
    `
        SELECT
          COALESCE(
            SUM(allocated_amount),
            0.00
          ) AS allocated_amount
        FROM loan_collection_allocations_sterlion_mexon_dexon
        WHERE invoice_id = ?
          AND allocation_component = 'PRINCIPAL'
          AND allocation_date = ?
      `,
    [invoiceId, accrualDate],
  );

  const allocatedTodayCents = amountToCents(
    todayAllocationRows[0].allocated_amount,
  );

  const openingPrincipal = centsToAmount(openingPrincipalCents);

  /*
   * Same daily interest calculation.
   */
  const dailyInterestExact = roundSix(
    (openingPrincipal * (Number(invoice.annual_interest_rate) / 100)) /
      Number(invoice.day_count_basis),
  );

  const dailyInterestPosted = roundMoney(dailyInterestExact);

  const closingPrincipalCents = Math.max(
    openingPrincipalCents - allocatedTodayCents,
    0,
  );

  const closingPrincipal = centsToAmount(closingPrincipalCents);

  const cumulativeExact = roundSix(cumulativeExactBefore + dailyInterestExact);

  const cumulativePosted = roundMoney(
    cumulativePostedBefore + dailyInterestPosted,
  );

  const dpd =
    closingPrincipalCents > 0 && accrualDate > maturityDate
      ? diffSqlDates(accrualDate, maturityDate)
      : 0;

  const status =
    closingPrincipalCents === 0 ? "PAID" : dpd > 0 ? "OVERDUE" : "ACTIVE";

  const dayNumber = diffSqlDates(accrualDate, disbursementDate);

  const [insertResult] = await conn.query(
    `
        INSERT INTO loan_invoice_daily_accruals_sterlion_mexon_dexon (
          invoice_id,
          lan,
          invoice_number,
          accrual_date,
          day_number,
          opening_principal,
          annual_interest_rate,
          day_count_basis,
          actual_days,
          daily_interest_exact,
          daily_interest_posted,
          principal_allocated_today,
          closing_principal,
          cumulative_interest_exact,
          cumulative_interest_posted,
          rounding_difference,
          maturity_date,
          dpd,
          status,
          upfront_interest_remaining_exact
        )
        VALUES (
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          1,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?
        )
      `,
    [
      invoiceId,

      invoice.lan,

      invoice.invoice_number,

      accrualDate,

      dayNumber,

      openingPrincipal,

      Number(invoice.annual_interest_rate),

      Number(invoice.day_count_basis),

      dailyInterestExact,

      dailyInterestPosted,

      centsToAmount(allocatedTodayCents),

      closingPrincipal,

      cumulativeExact,

      cumulativePosted,

      roundMoney(cumulativePosted - roundMoney(cumulativeExact)),

      maturityDate,

      dpd,

      status,

      roundSix(
        Math.max(
          Number(invoice.contractual_upfront_interest) - cumulativeExact,
          0,
        ),
      ),
    ],
  );

  await refreshInvoiceAccrualSummary(conn, invoiceId);

  return {
    inserted: true,

    accrualId: insertResult.insertId,

    loanBookingId: invoice.loan_booking_id,

    invoiceId,

    lan: invoice.lan,

    invoiceNumber: invoice.invoice_number,

    accrualDate,

    dayNumber,

    openingPrincipal,

    dailyInterestExact,

    dailyInterestPosted,

    principalAllocatedToday: centsToAmount(allocatedTodayCents),

    closingPrincipal,

    cumulativeInterestExact: cumulativeExact,

    cumulativeInterestPosted: cumulativePosted,

    dpd,

    status,
  };
}

// async function recalculateInvoiceCarryForwardChain(conn, loanBookingId) {
//   const [invoiceRows] = await conn.query(
//     `
//         SELECT
//           id,
//           disbursement_date,
//           contractual_upfront_interest,
//           disbursement_amount
//         FROM loan_invoices_sterlion_mexon_dexon
//         WHERE loan_booking_id = ?
//           AND status <> 'CANCELLED'
//         ORDER BY
//           disbursement_date ASC,
//           id ASC
//         FOR UPDATE
//       `,
//     [loanBookingId],
//   );

//   for (const invoice of invoiceRows) {
//     const disbursementDate = databaseDateToSqlDate(invoice.disbursement_date);

//     const openingCarryPoolExact = await calculateOpeningCarryPoolExact(
//       conn,

//       loanBookingId,

//       disbursementDate,

//       invoice.id,
//     );

//     const contractualCents = amountToCents(
//       invoice.contractual_upfront_interest,
//     );

//     const carryAppliedCents = Math.min(
//       contractualCents,

//       amountToCents(openingCarryPoolExact),
//     );

//     const newUpfrontCents = contractualCents - carryAppliedCents;

//     const disbursementCents = amountToCents(invoice.disbursement_amount);

//     if (newUpfrontCents > disbursementCents) {
//       throw new RowImportError(
//         "upfront_interest",

//         "New upfront interest cannot exceed the disbursement amount.",
//       );
//     }

//     await conn.query(
//       `
//         UPDATE loan_invoices_sterlion_mexon_dexon
//         SET
//           opening_carry_forward_pool = ?,
//           carry_forward_applied = ?,
//           new_upfront_interest_charged = ?,
//           net_disbursement_amount = ?
//         WHERE id = ?
//       `,
//       [
//         openingCarryPoolExact,

//         centsToAmount(carryAppliedCents),

//         centsToAmount(newUpfrontCents),

//         centsToAmount(disbursementCents - newUpfrontCents),

//         invoice.id,
//       ],
//     );
//   }
// }

async function recalculateInvoiceCarryForwardChain(conn, loanBookingId) {
  /*
   * Always rebuild chronologically.
   *
   * Invoice 1
   * → Invoice 2
   * → Invoice 3
   * → Invoice 4
   */
  const [invoiceRows] = await conn.query(
    `
      SELECT
        id,
        invoice_number,
        disbursement_date,
        contractual_upfront_interest,
        disbursement_amount

      FROM loan_invoices_sterlion_mexon_dexon

      WHERE loan_booking_id = ?
        AND status <> 'CANCELLED'

      ORDER BY
        disbursement_date ASC,
        id ASC

      FOR UPDATE
    `,
    [loanBookingId],
  );

  for (const invoice of invoiceRows) {
    const invoiceDate = databaseDateToSqlDate(invoice.disbursement_date);

    /*
     * Carry available AS OF this invoice's date.
     *
     * Future collections are excluded inside
     * calculateOpeningCarryPoolExact().
     */
    const openingCarryPoolExact = await calculateOpeningCarryPoolExactV2(
      conn,
      loanBookingId,
      invoiceDate,
      invoice.id,
    );

    const contractualInterestCents = amountToCents(
      invoice.contractual_upfront_interest,
    );

    /*
     * Never apply more carry than the invoice's
     * contractual upfront interest.
     */
    const carryAppliedCents = Math.min(
      contractualInterestCents,
      amountToCents(openingCarryPoolExact),
    );

    /*
     * Fresh interest customer must actually pay.
     */
    const newUpfrontInterestCents =
      contractualInterestCents - carryAppliedCents;

    const grossDisbursementCents = amountToCents(invoice.disbursement_amount);

    if (newUpfrontInterestCents > grossDisbursementCents) {
      throw new RowImportError(
        "upfront_interest",
        `Adjusted upfront interest exceeds disbursement amount for invoice ${invoice.invoice_number}.`,
      );
    }

    /*
     * Net Disbursement =
     *
     * Gross Disbursement
     * -
     * Adjusted/Fresh Upfront Interest
     */
    const netDisbursementCents =
      grossDisbursementCents - newUpfrontInterestCents;

    await conn.query(
      `
        UPDATE loan_invoices_sterlion_mexon_dexon

        SET
          opening_carry_forward_pool = ?,
          carry_forward_applied = ?,
          new_upfront_interest_charged = ?,
          net_disbursement_amount = ?

        WHERE id = ?
      `,
      [
        roundMoney(openingCarryPoolExact),

        centsToAmount(carryAppliedCents),

        centsToAmount(newUpfrontInterestCents),

        centsToAmount(netDisbursementCents),

        invoice.id,
      ],
    );
  }
}

async function insertSterlionMexonDexonInvoice(invoiceData) {
  let conn;

  try {
    conn = await db.promise().getConnection();

    await conn.beginTransaction();

    const [loanRows] = await conn.query(
      `
    SELECT
      id,
      lan,
      product,
      lender,
      loan_limit,
      interest_rate,
      tenure_months
    FROM loan_booking_sterlion_mexon_dexon
    WHERE lan = ?
    LIMIT 1
    FOR UPDATE
  `,
      [invoiceData.lan],
    );

    if (loanRows.length === 0) {
      throw new RowImportError(
        "loan_lookup",

        `No Sterlion, Mexon or Dexon loan was found for LAN ${invoiceData.lan}.`,
      );
    }

    const loan = loanRows[0];

    /*
     * Interest rate and tenure must always come
     * from the parent loan-booking table.
     */
    const annualInterestRate = Number(loan.interest_rate);

    const tenureMonths = Number(loan.tenure_months);

    if (
      !Number.isFinite(annualInterestRate) ||
      annualInterestRate <= 0 ||
      annualInterestRate > 100
    ) {
      throw new RowImportError(
        "loan_configuration",
        `A valid interest rate is not configured for LAN ${invoiceData.lan}.`,
        {
          lan: invoiceData.lan,
          interest_rate: loan.interest_rate,
        },
      );
    }

    if (
      !Number.isInteger(tenureMonths) ||
      tenureMonths <= 0 ||
      tenureMonths > 360
    ) {
      throw new RowImportError(
        "loan_configuration",
        `A valid tenure is not configured for LAN ${invoiceData.lan}.`,
        {
          lan: invoiceData.lan,
          tenure_months: loan.tenure_months,
        },
      );
    }

    const loanLimitCents = amountToCents(loan.loan_limit);

    if (!Number.isSafeInteger(loanLimitCents) || loanLimitCents <= 0) {
      throw new RowImportError(
        "loan_limit",
        `Loan Limit is invalid for LAN ${invoiceData.lan}.`,
      );
    }

    const [latestInvoiceRows] = await conn.query(
      `
          SELECT
            disbursement_date
          FROM loan_invoices_sterlion_mexon_dexon
          WHERE loan_booking_id = ?
            AND status <> 'CANCELLED'
          ORDER BY
            disbursement_date DESC,
            id DESC
          LIMIT 1
        `,
      [loan.id],
    );

    if (
      latestInvoiceRows.length > 0 &&
      invoiceData.disbursementDate <
        databaseDateToSqlDate(latestInvoiceRows[0].disbursement_date)
    ) {
      throw new RowImportError(
        "sequence",

        "Invoices must be uploaded in chronological disbursement-date order for each LAN.",
      );
    }

    const [duplicateRows] = await conn.query(
      `
    SELECT
      id,
      invoice_number,
      disbursement_utr
    FROM loan_invoices_sterlion_mexon_dexon
    WHERE
      (
        lan = ?
        AND invoice_number = ?
      )
      OR disbursement_utr = ?
    LIMIT 1
  `,
      [invoiceData.lan, invoiceData.invoiceNumber, invoiceData.disbursementUtr],
    );

    if (duplicateRows.length > 0) {
      throw new RowImportError(
        "duplicate",

        `Invoice Number or Disbursement UTR already exists for LAN ${invoiceData.lan}.`,
      );
    }

    const [outstandingRows] = await conn.query(
      `
          SELECT
            COALESCE(
              SUM(
                outstanding_principal
              ),
              0.00
            ) AS utilized_amount
          FROM loan_invoices_sterlion_mexon_dexon
          WHERE loan_booking_id = ?
            AND status <> 'CANCELLED'
        `,
      [loan.id],
    );

    const currentUtilizedCents = amountToCents(
      outstandingRows[0].utilized_amount,
    );

    const disbursementCents = amountToCents(invoiceData.disbursementAmount);

    const requestedUtilizedCents = currentUtilizedCents + disbursementCents;

    if (requestedUtilizedCents > loanLimitCents) {
      throw new RowImportError(
        "loan_limit",

        `Disbursement Amount ₹${formatIndianAmount(
          invoiceData.disbursementAmount,
        )} exceeds the available loan limit.`,

        {
          loan_limit: centsToAmount(loanLimitCents),

          currently_utilized: centsToAmount(currentUtilizedCents),

          available_amount: centsToAmount(
            Math.max(
              loanLimitCents - currentUtilizedCents,

              0,
            ),
          ),

          requested_disbursement: invoiceData.disbursementAmount,
        },
      );
    }

    // const maturityDate = addMonthsSqlDate(
    //   invoiceData.disbursementDate,

    //   tenureMonths,
    // );

    // const contractualUpfrontInterest = roundMoney(
    //   invoiceData.disbursementAmount *
    //     (annualInterestRate / 100) *
    //     (tenureMonths / 12),
    // );

    const contractualDays = getSmdContractualDays(tenureMonths);

    /*
     * IMPORTANT:
     * 3 months means exactly 90 contractual days,
     * not 3 calendar months.
     */
    const maturityDate = addDaysSqlDate(
      invoiceData.disbursementDate,
      contractualDays,
    );

    const contractualUpfrontInterest = roundMoney(
      invoiceData.disbursementAmount *
        (annualInterestRate / 100) *
        (contractualDays / SMD_DAY_COUNT_BASIS),
    );

    const openingCarryPoolExact = await calculateOpeningCarryPoolExactV2(
      conn,

      loan.id,

      invoiceData.disbursementDate,
    );

    const contractualCents = amountToCents(contractualUpfrontInterest);

    const carryAppliedCents = Math.min(
      contractualCents,

      amountToCents(openingCarryPoolExact),
    );

    const newUpfrontCents = contractualCents - carryAppliedCents;

    if (newUpfrontCents > disbursementCents) {
      throw new RowImportError(
        "upfront_interest",

        "Calculated new upfront interest exceeds the disbursement amount.",
      );
    }
    const netDisbursementCents = disbursementCents - newUpfrontCents;

    const [insertResult] = await conn.query(
      `
    INSERT INTO loan_invoices_sterlion_mexon_dexon (
      loan_booking_id,
      lan,
      invoice_number,
      invoice_amount,
      disbursement_amount,
      annual_interest_rate,
      tenure_months,
      day_count_basis,
      disbursement_date,
      disbursement_utr,
      maturity_date,
      contractual_upfront_interest,
      opening_carry_forward_pool,
      carry_forward_applied,
      new_upfront_interest_charged,
      net_disbursement_amount,
      principal_allocated,
      outstanding_principal,
      exact_interest_accrued,
      posted_interest_accrued,
      current_dpd,
      status
    )
    VALUES (
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      0.00,
      ?,
      0.000000,
      0.00,
      0,
      'ACTIVE'
    )
  `,
      [
        loan.id,

        invoiceData.lan,

        invoiceData.invoiceNumber,

        invoiceData.invoiceAmount,

        invoiceData.disbursementAmount,

        /*
         * Taken from loan booking.
         */
        annualInterestRate,

        /*
         * Taken from loan booking.
         */
        tenureMonths,

        SMD_DAY_COUNT_BASIS,

        invoiceData.disbursementDate,

        invoiceData.disbursementUtr,

        maturityDate,

        contractualUpfrontInterest,

        openingCarryPoolExact,

        centsToAmount(carryAppliedCents),

        centsToAmount(newUpfrontCents),

        centsToAmount(netDisbursementCents),

        invoiceData.disbursementAmount,
      ],
    );

    const invoiceId = insertResult.insertId;

    await recalculateInvoiceCarryForwardChainV2(conn, loan.id);

    const utilization = await recalculateLoanUtilization(conn, loan.id);

    const [createdRows] = await conn.query(
      `
          SELECT *
          FROM loan_invoices_sterlion_mexon_dexon
          WHERE id = ?
          LIMIT 1
        `,
      [invoiceId],
    );

    await conn.commit();

    const created = createdRows[0];

    return {
      invoiceId,

      lan: created.lan,

      product: loan.product,

      invoiceNumber: created.invoice_number,

      invoiceAmount: Number(created.invoice_amount),

      disbursementAmount: Number(created.disbursement_amount),

      disbursementDate: databaseDateToSqlDate(created.disbursement_date),

      disbursementUtr: created.disbursement_utr,

      annualInterestRate: Number(created.annual_interest_rate),

      tenureMonths: Number(created.tenure_months),

      maturityDate: databaseDateToSqlDate(created.maturity_date),

      contractualUpfrontInterest: Number(created.contractual_upfront_interest),

      openingCarryForwardPool: Number(created.opening_carry_forward_pool),

      carryForwardApplied: Number(created.carry_forward_applied),

      newUpfrontInterestCharged: Number(created.new_upfront_interest_charged),

      netDisbursementAmount: Number(created.net_disbursement_amount),

      outstandingPrincipal: Number(created.outstanding_principal),

      ...utilization,
    };
  } catch (error) {
    if (conn) {
      try {
        await conn.rollback();
      } catch (rollbackError) {
        console.error(
          "SMD invoice rollback failed:",

          rollbackError,
        );
      }
    }

    throw error;
  } finally {
    if (conn) {
      conn.release();
    }
  }
}

async function ensureInvoiceAccrualsThroughDate(conn, invoiceId, targetDate) {
  const [invoiceRows] = await conn.query(
    `
      SELECT
        id,
        loan_booking_id,
        lan,
        invoice_number,
        disbursement_date,
        outstanding_principal,
        status
      FROM loan_invoices_sterlion_mexon_dexon
      WHERE id = ?
      LIMIT 1
      FOR UPDATE
    `,
    [invoiceId],
  );

  if (invoiceRows.length === 0) {
    throw new RowImportError("invoice_lookup", "Invoice was not found.");
  }

  const invoice = invoiceRows[0];

  const disbursementDate = databaseDateToSqlDate(invoice.disbursement_date);

  /*
   * Collection on disbursement date:
   * zero interest days.
   */
  if (targetDate <= disbursementDate) {
    return;
  }

  const catchUpWindow = await getSmdAccrualCatchUpWindow(
    conn,
    invoice,
    targetDate,
  );

  if (!catchUpWindow.nextAccrualDate || catchUpWindow.missingDays === 0) {
    return;
  }

  let currentDate = catchUpWindow.nextAccrualDate;

  while (currentDate <= targetDate) {
    const result = await insertInvoiceDailyAccrualForDate(
      conn,
      invoice.id,
      currentDate,
    );

    if (!result.inserted) {
      throw new RowImportError(
        "daily_accrual",
        `Unable to create accrual for invoice ${invoice.invoice_number} on ${currentDate}: ${result.reason}`,
      );
    }

    currentDate = addDaysSqlDate(currentDate, 1);
  }
}

async function insertAndAllocateSterlionMexonDexonCollection(collectionData) {
  let conn;

  try {
    conn = await db.promise().getConnection();

    await conn.beginTransaction();

    const [loanRows] = await conn.query(
      `
          SELECT
            id,
            lan,
            product,
            loan_limit
          FROM loan_booking_sterlion_mexon_dexon
          WHERE lan = ?
          LIMIT 1
          FOR UPDATE
        `,
      [collectionData.lan],
    );

    if (loanRows.length === 0) {
      throw new RowImportError(
        "loan_lookup",

        `No Sterlion, Mexon or Dexon loan was found for LAN ${collectionData.lan}.`,
      );
    }

    const loan = loanRows[0];

    const [latestCollectionRows] = await conn.query(
      `
          SELECT
            collection_date
          FROM loan_collections_sterlion_mexon_dexon
          WHERE loan_booking_id = ?
            AND status <> 'REVERSED'
          ORDER BY
            collection_date DESC,
            id DESC
          LIMIT 1
        `,
      [loan.id],
    );

    if (
      latestCollectionRows.length > 0 &&
      collectionData.collectionDate <
        databaseDateToSqlDate(latestCollectionRows[0].collection_date)
    ) {
      throw new RowImportError(
        "sequence",

        "Collections must be uploaded in chronological collection-date order for each LAN.",
      );
    }

    const [duplicateRows] = await conn.query(
      `
          SELECT id
          FROM loan_collections_sterlion_mexon_dexon
          WHERE collection_utr = ?
          LIMIT 1
        `,
      [collectionData.collectionUtr],
    );

    if (duplicateRows.length > 0) {
      throw new RowImportError(
        "duplicate",

        `Collection UTR ${collectionData.collectionUtr} already exists.`,
      );
    }

    const [collectionResult] = await conn.query(
      `
          INSERT INTO loan_collections_sterlion_mexon_dexon (
            loan_booking_id,
            lan,
            collection_utr,
            collection_date,
            collection_amount,
            allocated_amount,
            unallocated_amount,
            status
          )
          VALUES (
            ?,
            ?,
            ?,
            ?,
            ?,
            0.00,
            ?,
            'PENDING'
          )
        `,
      [
        loan.id,

        collectionData.lan,

        collectionData.collectionUtr,

        collectionData.collectionDate,

        collectionData.collectionAmount,

        collectionData.collectionAmount,
      ],
    );

    const collectionId = collectionResult.insertId;

    let collectionRemainingCents = amountToCents(
      collectionData.collectionAmount,
    );

    let fifoPosition = 0;

    const allocationResults = [];

    const affectedInvoiceIds = new Set();

    const [invoiceRows] = await conn.query(
      `
          SELECT
            id,
            invoice_number,
            disbursement_date,
            maturity_date,
            outstanding_principal
          FROM loan_invoices_sterlion_mexon_dexon
          WHERE loan_booking_id = ?
            AND status <> 'CANCELLED'
            AND disbursement_date <= ?
            AND outstanding_principal > 0
          ORDER BY
            disbursement_date ASC,
            id ASC
          FOR UPDATE
        `,
      [loan.id, collectionData.collectionDate],
    );

    for (const invoice of invoiceRows) {
      if (collectionRemainingCents <= 0) {
        break;
      }

      /*
       * IMPORTANT:
       *
       * Create all earned-interest days THROUGH the
       * collection date before reducing principal.
       *
       * After allocation we recalculate these rows again
       * so the collection-date row gets the correct
       * closing principal.
       */
      await ensureInvoiceAccrualsThroughDate(
        conn,
        invoice.id,
        collectionData.collectionDate,
      );

      fifoPosition += 1;

      const invoiceOutstandingBeforeCents = amountToCents(
        invoice.outstanding_principal,
      );

      const collectionRemainingBeforeCents = collectionRemainingCents;

      const allocatedCents = Math.min(
        invoiceOutstandingBeforeCents,

        collectionRemainingBeforeCents,
      );

      if (allocatedCents <= 0) {
        continue;
      }

      const invoiceOutstandingAfterCents =
        invoiceOutstandingBeforeCents - allocatedCents;

      collectionRemainingCents -= allocatedCents;

      const disbursementDate = databaseDateToSqlDate(invoice.disbursement_date);

      const maturityDate = databaseDateToSqlDate(invoice.maturity_date);

      const principalAllocationDay = diffSqlDates(
        collectionData.collectionDate,

        disbursementDate,
      );

      const dpdAtAllocation = Math.max(
        diffSqlDates(
          collectionData.collectionDate,

          maturityDate,
        ),

        0,
      );

      await conn.query(
        `
          INSERT INTO loan_collection_allocations_sterlion_mexon_dexon (
            collection_id,
            invoice_id,
            loan_booking_id,
            lan,
            invoice_number,
            fifo_position,
            allocation_date,
            allocation_utr,
            allocation_component,
            allocated_amount,
            invoice_outstanding_before,
            invoice_outstanding_after,
            collection_remaining_before,
            collection_remaining_after,
            principal_allocation_day,
            dpd_at_allocation
          )
          VALUES (
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            'PRINCIPAL',
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?
          )
        `,
        [
          collectionId,

          invoice.id,

          loan.id,

          collectionData.lan,

          invoice.invoice_number,

          fifoPosition,

          collectionData.collectionDate,

          collectionData.collectionUtr,

          centsToAmount(allocatedCents),

          centsToAmount(invoiceOutstandingBeforeCents),

          centsToAmount(invoiceOutstandingAfterCents),

          centsToAmount(collectionRemainingBeforeCents),

          centsToAmount(collectionRemainingCents),

          principalAllocationDay,

          dpdAtAllocation,
        ],
      );

      await conn.query(
        `
          UPDATE loan_invoices_sterlion_mexon_dexon
          SET
            principal_allocated =
              principal_allocated + ?,

            outstanding_principal = ?,

            current_dpd = ?,

            status = ?
          WHERE id = ?
        `,
        [
          centsToAmount(allocatedCents),

          centsToAmount(invoiceOutstandingAfterCents),

          invoiceOutstandingAfterCents === 0 ? 0 : dpdAtAllocation,

          invoiceOutstandingAfterCents === 0
            ? "PAID"
            : dpdAtAllocation > 0
              ? "OVERDUE"
              : "ACTIVE",

          invoice.id,
        ],
      );

      affectedInvoiceIds.add(invoice.id);

      allocationResults.push({
        invoiceId: invoice.id,

        invoiceNumber: invoice.invoice_number,

        fifoPosition,

        allocatedAmount: centsToAmount(allocatedCents),

        invoiceOutstandingBefore: centsToAmount(invoiceOutstandingBeforeCents),

        invoiceOutstandingAfter: centsToAmount(invoiceOutstandingAfterCents),

        collectionRemainingBefore: centsToAmount(
          collectionRemainingBeforeCents,
        ),

        collectionRemainingAfter: centsToAmount(collectionRemainingCents),

        principalAllocationDay,

        dpdAtAllocation,
      });
    }

    const collectionAmountCents = amountToCents(
      collectionData.collectionAmount,
    );

    const allocatedAmountCents =
      collectionAmountCents - collectionRemainingCents;

    const collectionStatus =
      collectionRemainingCents === 0
        ? "FULLY_ALLOCATED"
        : allocatedAmountCents === 0
          ? "NOT_ALLOCATED"
          : "PARTIALLY_ALLOCATED";

    await conn.query(
      `
        UPDATE loan_collections_sterlion_mexon_dexon
        SET
          allocated_amount = ?,
          unallocated_amount = ?,
          status = ?
        WHERE id = ?
      `,
      [
        centsToAmount(allocatedAmountCents),

        centsToAmount(collectionRemainingCents),

        collectionStatus,

        collectionId,
      ],
    );

    for (const invoiceId of affectedInvoiceIds) {
      await recalculateExistingInvoiceDailyAccruals(conn, invoiceId);
    }

    await recalculateInvoiceCarryForwardChainV2(conn, loan.id);

    const utilization = await recalculateLoanUtilization(conn, loan.id);

    await conn.commit();

    return {
      collectionId,

      lan: collectionData.lan,

      product: loan.product,

      collectionUtr: collectionData.collectionUtr,

      collectionDate: collectionData.collectionDate,

      collectionAmount: collectionData.collectionAmount,

      allocatedAmount: centsToAmount(allocatedAmountCents),

      unallocatedAmount: centsToAmount(collectionRemainingCents),

      allocationStatus: collectionStatus,

      allocations: allocationResults,

      ...utilization,
    };
  } catch (error) {
    if (conn) {
      try {
        await conn.rollback();
      } catch (rollbackError) {
        console.error(
          "SMD collection rollback failed:",

          rollbackError,
        );
      }
    }

    throw error;
  } finally {
    if (conn) {
      conn.release();
    }
  }
}

async function getSmdAccrualCatchUpWindow(conn, invoice, targetAccrualDate) {
  const disbursementDate = databaseDateToSqlDate(invoice.disbursement_date);

  const firstAccrualDate = addDaysSqlDate(disbursementDate, 1);

  if (firstAccrualDate > targetAccrualDate) {
    return {
      nextAccrualDate: null,
      missingDays: 0,
    };
  }

  const [accrualRows] = await conn.query(
    `
      SELECT
        COUNT(*) AS total_rows,
        COUNT(DISTINCT accrual_date) AS distinct_days,
        MAX(accrual_date) AS last_accrual_date
      FROM loan_invoice_daily_accruals_sterlion_mexon_dexon
      WHERE invoice_id = ?
        AND accrual_date <= ?
    `,
    [invoice.id, targetAccrualDate],
  );

  const totalRows = Number(accrualRows[0]?.total_rows || 0);

  const distinctDays = Number(accrualRows[0]?.distinct_days || 0);

  const lastAccrualValue = accrualRows[0]?.last_accrual_date || null;

  /*
   * Detect duplicate dates before inserting anything.
   */
  if (totalRows !== distinctDays) {
    throw new RowImportError(
      "daily_accrual_duplicate",
      `Invoice ${invoice.invoice_number} contains duplicate daily accrual dates.`,
    );
  }

  let nextAccrualDate = firstAccrualDate;

  if (lastAccrualValue) {
    const lastAccrualDate = databaseDateToSqlDate(lastAccrualValue);

    const expectedExistingDays = diffSqlDates(
      lastAccrualDate,
      disbursementDate,
    );

    /*
     * Example:
     * Disbursement: 10 August
     * Last accrual: 13 August
     * Expected existing rows: 3
     */
    if (distinctDays !== expectedExistingDays) {
      throw new RowImportError(
        "daily_accrual_gap",
        `Invoice ${invoice.invoice_number} has a missing daily accrual date. Expected ${expectedExistingDays} continuous rows but found ${distinctDays}.`,
      );
    }

    nextAccrualDate = addDaysSqlDate(lastAccrualDate, 1);
  }

  if (nextAccrualDate > targetAccrualDate) {
    return {
      nextAccrualDate: null,
      missingDays: 0,
    };
  }

  const missingDays = diffSqlDates(targetAccrualDate, nextAccrualDate) + 1;

  if (missingDays > MAX_SMD_CATCH_UP_DAYS_PER_INVOICE) {
    throw new RowImportError(
      "daily_accrual_backlog",
      `Invoice ${invoice.invoice_number} has ${missingDays} missing accrual days. The allowed limit is ${MAX_SMD_CATCH_UP_DAYS_PER_INVOICE}.`,
    );
  }

  return {
    nextAccrualDate,
    missingDays,
  };
}

let smdDailyAccrualCronStarted = false;

async function runSterlionMexonDexonDailyAccrualJob() {
  let conn;
  let lockAcquired = false;
  let lockName = null;

  const targetAccrualDate = getTodaySqlDate();

  try {
    conn = await db.promise().getConnection();

    /*
     * MySQL named locks are server-wide.
     * Including the database name prevents
     * UAT and production from blocking each other.
     */
    const [databaseRows] = await conn.query(
      `SELECT DATABASE() AS database_name`,
    );

    const databaseName = String(databaseRows[0]?.database_name || "").trim();

    if (!databaseName) {
      throw new Error("Unable to identify the current database.");
    }

    lockName = `smd_daily_accrual_${databaseName}`.slice(0, 64);

    const [lockRows] = await conn.query(`SELECT GET_LOCK(?, 0) AS acquired`, [
      lockName,
    ]);

    lockAcquired = Number(lockRows[0]?.acquired) === 1;

    if (!lockAcquired) {
      console.log(
        `SMD daily accrual cron skipped because another process owns the lock | Database: ${databaseName} | Date: ${targetAccrualDate}`,
      );

      return;
    }

    const [invoiceRows] = await conn.query(
      `
        SELECT
          id,
          loan_booking_id,
          lan,
          invoice_number,
          disbursement_date
        FROM loan_invoices_sterlion_mexon_dexon
        WHERE status <> 'CANCELLED'
          AND outstanding_principal > 0
          AND disbursement_date < ?
          ORDER BY id ASC                   
      `,
      [targetAccrualDate],
    );

    let processedInvoices = 0;
    let upToDateInvoices = 0;
    let insertedRows = 0;
    let failedInvoices = 0;

    for (const invoice of invoiceRows) {
      let processingDate = null;

      try {
        await conn.beginTransaction();

        const catchUpWindow = await getSmdAccrualCatchUpWindow(
          conn,
          invoice,
          targetAccrualDate,
        );

        if (!catchUpWindow.nextAccrualDate || catchUpWindow.missingDays === 0) {
          upToDateInvoices += 1;

          await conn.commit();

          continue;
        }

        let currentAccrualDate = catchUpWindow.nextAccrualDate;

        let invoiceInsertedRows = 0;

        while (currentAccrualDate <= targetAccrualDate) {
          processingDate = currentAccrualDate;

          const result = await insertInvoiceDailyAccrualForDate(
            conn,
            invoice.id,
            currentAccrualDate,
          );

          if (!result.inserted) {
            throw new RowImportError(
              "daily_accrual_catch_up",
              `Unable to insert accrual for invoice ${invoice.invoice_number} on ${currentAccrualDate}: ${result.reason}`,
            );
          }

          invoiceInsertedRows += 1;

          currentAccrualDate = addDaysSqlDate(currentAccrualDate, 1);
        }

        if (invoiceInsertedRows > 0) {
          await recalculateInvoiceCarryForwardChainV2(
            conn,
            invoice.loan_booking_id,
          );
        }

        await conn.commit();

        insertedRows += invoiceInsertedRows;
        processedInvoices += 1;

        console.log(
          `SMD invoice accrual completed | LAN: ${invoice.lan} | Invoice: ${invoice.invoice_number} | Inserted: ${invoiceInsertedRows}`,
        );
      } catch (invoiceError) {
        failedInvoices += 1;

        try {
          await conn.rollback();
        } catch (rollbackError) {
          console.error("SMD daily accrual rollback failed:", rollbackError);
        }

        console.error("SMD daily accrual invoice failed:", {
          invoiceId: invoice.id,
          lan: invoice.lan,
          invoiceNumber: invoice.invoice_number,
          processingDate,
          targetAccrualDate,
          stage: invoiceError?.stage || null,
          code: invoiceError?.code || null,
          message: invoiceError?.message || null,
        });
      }
    }

    console.log(
      `SMD daily accrual cron completed | Database: ${databaseName} | Target: ${targetAccrualDate} | Processed invoices: ${processedInvoices} | Up-to-date invoices: ${upToDateInvoices} | Inserted rows: ${insertedRows} | Failed invoices: ${failedInvoices}`,
    );
  } catch (error) {
    console.error("SMD daily accrual cron failed:", error);
  } finally {
    if (conn && lockAcquired && lockName) {
      try {
        await conn.query(`SELECT RELEASE_LOCK(?)`, [lockName]);
      } catch (releaseError) {
        console.error("SMD daily accrual lock release failed:", releaseError);
      }
    }

    if (conn) {
      conn.release();
    }
  }
}

function startSterlionMexonDexonDailyAccrualCron() {
  if (smdDailyAccrualCronStarted) {
    return;
  }

  smdDailyAccrualCronStarted = true;

  /*
   * Executes every day at exactly
   * 12:05 AM Asia/Kolkata.
   */
  cron.schedule(
    "5 0 * * *",
    async () => {
      console.log(
        "SMD daily accrual cron started:",
        new Date().toLocaleString("en-IN", {
          timeZone: BUSINESS_TIME_ZONE,
        }),
      );

      await runSterlionMexonDexonDailyAccrualJob();
    },
    {
      name: "smd-daily-accrual-0005-ist",
      timezone: BUSINESS_TIME_ZONE,
      noOverlap: true,
    },
  );

  console.log("SMD daily accrual cron scheduled for 12:05 AM Asia/Kolkata.");
}

router.post(
  "/upload/sterlion-mexon-dexon-invoices",

  (req, res) => {
    sterlionMexonDexonUpload.single("file")(
      req,
      res,

      async (uploadError) => {
        if (uploadError) {
          return res.status(400).json({
            success: false,

            message: uploadError.message,
          });
        }

        try {
          const {
            headers,

            rows: extractedRows,

            source,
          } = extractUploadData(req);

          const {
            rows: mappedRows,

            missingHeaders,
          } = mapUploadRows(
            headers,

            extractedRows,

            INVOICE_HEADER_DEFINITIONS,
          );

          if (missingHeaders.length > 0) {
            return res.status(400).json({
              success: false,

              message: "Invoice Excel headers are invalid.",

              missing_headers: missingHeaders,

              expected_headers: INVOICE_HEADER_DEFINITIONS.map(
                (header) => header.label,
              ),
            });
          }

          const rows = mappedRows.filter((row) =>
            Object.values(row).some((value) => !isBlank(value)),
          );

          if (rows.length === 0) {
            return res.status(400).json({
              success: false,

              message: "No invoice rows were found in the uploaded file.",
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

          const invoiceKeys = new Set();

          const disbursementUtrs = new Set();

          for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
            const rawRow = rows[rowIndex];

            const excelRowNumber = rowIndex + 2;

            let displayLan = rawRow.lan || null;

            try {
              const invoiceData = normalizeInvoiceRow(rawRow);

              displayLan = invoiceData.lan;

              const invoiceKey =
                `${invoiceData.lan}:` + `${invoiceData.invoiceNumber}`;

              if (invoiceKeys.has(invoiceKey)) {
                throw new RowImportError(
                  "duplicate",

                  `Duplicate Invoice Number found in the uploaded file for LAN ${invoiceData.lan}.`,
                );
              }

              if (disbursementUtrs.has(invoiceData.disbursementUtr)) {
                throw new RowImportError(
                  "duplicate",

                  `Duplicate Disbursement UTR found in the uploaded file: ${invoiceData.disbursementUtr}.`,
                );
              }

              invoiceKeys.add(invoiceKey);

              disbursementUtrs.add(invoiceData.disbursementUtr);

              const inserted =
                await insertSterlionMexonDexonInvoice(invoiceData);

              successRows.push({
                row: excelRowNumber,

                invoice_id: inserted.invoiceId,

                lan: inserted.lan,

                product: inserted.product,

                invoice_number: inserted.invoiceNumber,

                invoice_amount: inserted.invoiceAmount,

                disbursement_amount: inserted.disbursementAmount,

                annual_interest_rate: inserted.annualInterestRate,

                tenure_months: inserted.tenureMonths,

                day_count_basis: SMD_DAY_COUNT_BASIS,

                disbursement_date: inserted.disbursementDate,

                disbursement_utr: inserted.disbursementUtr,

                maturity_date: inserted.maturityDate,

                contractual_upfront_interest:
                  inserted.contractualUpfrontInterest,

                opening_carry_forward_pool: inserted.openingCarryForwardPool,

                carry_forward_applied: inserted.carryForwardApplied,

                new_upfront_interest_charged:
                  inserted.newUpfrontInterestCharged,

                net_disbursement_amount: inserted.netDisbursementAmount,

                outstanding_principal: inserted.outstandingPrincipal,

                total_disbursement_amount: inserted.totalDisbursementAmount,

                total_principal_allocated: inserted.totalPrincipalAllocated,

                loan_limit: inserted.loanLimit,

                utilized_amount: inserted.utilizedAmount,

                unutilized_amount: inserted.unutilizedAmount,
              });
            } catch (rowError) {
              console.error("SMD invoice row failed:", {
                row: excelRowNumber,

                lan: displayLan,

                name: rowError?.name || null,

                code: rowError?.code || null,

                errno: rowError?.errno || null,

                sqlState: rowError?.sqlState || null,

                sqlMessage: rowError?.sqlMessage || null,

                stage: rowError?.stage || null,

                message: rowError?.message || null,
              });

              rowErrors.push(
                buildPublicSmdRowError(
                  rowError,

                  excelRowNumber,

                  displayLan,
                ),
              );
            }
          }

          const insertedRows = successRows.length;

          const failedRows = rowErrors.length;

          const partialSuccess = insertedRows > 0 && failedRows > 0;

          return res.status(insertedRows === 0 ? 422 : 200).json({
            success: insertedRows > 0,

            partial_success: partialSuccess,

            message:
              insertedRows === 0
                ? "No invoice rows were inserted."
                : partialSuccess
                  ? "Invoice upload completed with some row errors."
                  : "Invoice upload completed successfully.",

            source,

            total_rows: rows.length,

            inserted_rows: insertedRows,

            failed_rows: failedRows,

            success_rows: successRows,

            row_errors: rowErrors,
          });
        } catch (error) {
          console.error(
            "SMD invoice upload failed:",

            error,
          );

          return res.status(error instanceof RowImportError ? 400 : 500).json({
            success: false,

            message:
              error instanceof RowImportError
                ? error.message
                : "Sterlion, Mexon and Dexon invoice upload failed.",

            ...(error instanceof RowImportError
              ? {
                  stage: error.stage,

                  ...error.details,
                }
              : {}),
          });
        }
      },
    );
  },
);

router.post(
  "/upload/sterlion-mexon-dexon-collections",

  (req, res) => {
    sterlionMexonDexonUpload.single("file")(
      req,
      res,

      async (uploadError) => {
        if (uploadError) {
          return res.status(400).json({
            success: false,

            message: uploadError.message,
          });
        }

        try {
          const {
            headers,

            rows: extractedRows,

            source,
          } = extractUploadData(req);

          const {
            rows: mappedRows,

            missingHeaders,
          } = mapUploadRows(
            headers,

            extractedRows,

            COLLECTION_HEADER_DEFINITIONS,
          );

          if (missingHeaders.length > 0) {
            return res.status(400).json({
              success: false,

              message: "Collection Excel headers are invalid.",

              missing_headers: missingHeaders,

              expected_headers: COLLECTION_HEADER_DEFINITIONS.map(
                (header) => header.label,
              ),
            });
          }

          const rows = mappedRows.filter((row) =>
            Object.values(row).some((value) => !isBlank(value)),
          );

          if (rows.length === 0) {
            return res.status(400).json({
              success: false,

              message: "No collection rows were found in the uploaded file.",
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

          const collectionUtrs = new Set();

          for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
            const rawRow = rows[rowIndex];

            const excelRowNumber = rowIndex + 2;

            let displayLan = rawRow.lan || null;

            try {
              const collectionData = normalizeCollectionRow(rawRow);

              displayLan = collectionData.lan;

              if (collectionUtrs.has(collectionData.collectionUtr)) {
                throw new RowImportError(
                  "duplicate",

                  `Duplicate Collection UTR found in the uploaded file: ${collectionData.collectionUtr}.`,
                );
              }

              collectionUtrs.add(collectionData.collectionUtr);

              const inserted =
                await insertAndAllocateSterlionMexonDexonCollection(
                  collectionData,
                );

              successRows.push({
                row: excelRowNumber,

                collection_id: inserted.collectionId,

                lan: inserted.lan,

                product: inserted.product,

                collection_utr: inserted.collectionUtr,

                collection_date: inserted.collectionDate,

                collection_amount: inserted.collectionAmount,

                allocated_amount: inserted.allocatedAmount,

                unallocated_amount: inserted.unallocatedAmount,

                allocation_status: inserted.allocationStatus,

                allocations: inserted.allocations,

                total_disbursement_amount: inserted.totalDisbursementAmount,

                total_principal_allocated: inserted.totalPrincipalAllocated,

                loan_limit: inserted.loanLimit,

                utilized_amount: inserted.utilizedAmount,

                unutilized_amount: inserted.unutilizedAmount,
              });
            } catch (rowError) {
              console.error(
                "SMD collection row failed:",

                {
                  row: excelRowNumber,

                  lan: displayLan,

                  code: rowError?.code || null,

                  stage: rowError?.stage || null,

                  message: rowError?.message,
                },
              );

              rowErrors.push(
                buildPublicSmdRowError(
                  rowError,

                  excelRowNumber,

                  displayLan,
                ),
              );
            }
          }

          const insertedRows = successRows.length;

          const failedRows = rowErrors.length;

          const partialSuccess = insertedRows > 0 && failedRows > 0;

          return res.status(insertedRows === 0 ? 422 : 200).json({
            success: insertedRows > 0,

            partial_success: partialSuccess,

            message:
              insertedRows === 0
                ? "No collection rows were inserted."
                : partialSuccess
                  ? "Collection upload completed with some row errors."
                  : "Collection upload and FIFO allocation completed successfully.",

            source,

            total_rows: rows.length,

            inserted_rows: insertedRows,

            failed_rows: failedRows,

            success_rows: successRows,

            row_errors: rowErrors,
          });
        } catch (error) {
          console.error(
            "SMD collection upload failed:",

            error,
          );

          return res.status(error instanceof RowImportError ? 400 : 500).json({
            success: false,

            message:
              error instanceof RowImportError
                ? error.message
                : "Sterlion, Mexon and Dexon collection upload failed.",

            ...(error instanceof RowImportError
              ? {
                  stage: error.stage,

                  ...error.details,
                }
              : {}),
          });
        }
      },
    );
  },
);

router.get(
  "/sterlion-mexon-dexon/:lan/invoices",

  async (req, res) => {
    try {
      const lan = String(req.params.lan ?? "")
        .trim()
        .toUpperCase();

      if (!lan) {
        return res.status(400).json({
          success: false,

          message: "LAN is required.",
        });
      }

      // Self-heal stored limit figures before returning this page. Utilized is
      // active invoice principal; principal collections restore availability.
      await reconcileSterlionMexonDexonUtilizationByLan(lan);

      const [loanRows] = await db.promise().query(
        `
              SELECT
                id,
                lan,
                product,
                lender,

                CONCAT_WS(
                  ' ',
                  first_name,
                  last_name
                ) AS customer_name,

                loan_limit,
                utilized_amount,
                unutilized_amount,
                status,
                created_at,
                updated_at
              FROM loan_booking_sterlion_mexon_dexon
              WHERE lan = ?
              LIMIT 1
            `,
        [lan],
      );

      if (loanRows.length === 0) {
        return res.status(404).json({
          success: false,

          message: `Loan not found for LAN ${lan}.`,
        });
      }

      const loan = loanRows[0];

      const [invoiceRows] = await db.promise().query(
        `
              SELECT *
              FROM loan_invoices_sterlion_mexon_dexon
              WHERE loan_booking_id = ?
              ORDER BY
                disbursement_date ASC,
                id ASC
            `,
        [loan.id],
      );

      const [collectionRows] = await db.promise().query(
        `
              SELECT *
              FROM loan_collections_sterlion_mexon_dexon
              WHERE loan_booking_id = ?
              ORDER BY
                collection_date ASC,
                id ASC
            `,
        [loan.id],
      );

      const [allocationRows] = await db.promise().query(
        `
              SELECT *
              FROM loan_collection_allocations_sterlion_mexon_dexon
              WHERE loan_booking_id = ?
              ORDER BY
                allocation_date ASC,
                collection_id ASC,
                fifo_position ASC
            `,
        [loan.id],
      );

      return res.status(200).json({
        success: true,

        loan: {
          ...loan,

          loan_limit: Number(loan.loan_limit || 0),

          utilized_amount: Number(loan.utilized_amount || 0),

          unutilized_amount: Number(loan.unutilized_amount || 0),
        },

        invoices: invoiceRows.map((invoice) => ({
          ...invoice,

          invoice_amount: Number(invoice.invoice_amount || 0),

          disbursement_amount: Number(invoice.disbursement_amount || 0),

          contractual_upfront_interest: Number(
            invoice.contractual_upfront_interest || 0,
          ),

          opening_carry_forward_pool: Number(
            invoice.opening_carry_forward_pool || 0,
          ),

          carry_forward_applied: Number(invoice.carry_forward_applied || 0),

          new_upfront_interest_charged: Number(
            invoice.new_upfront_interest_charged || 0,
          ),

          net_disbursement_amount: Number(invoice.net_disbursement_amount || 0),

          principal_allocated: Number(invoice.principal_allocated || 0),

          outstanding_principal: Number(invoice.outstanding_principal || 0),

          exact_interest_accrued: Number(invoice.exact_interest_accrued || 0),

          posted_interest_accrued: Number(invoice.posted_interest_accrued || 0),
        })),

        collections: collectionRows.map((collection) => ({
          ...collection,

          collection_amount: Number(collection.collection_amount || 0),

          allocated_amount: Number(collection.allocated_amount || 0),

          unallocated_amount: Number(collection.unallocated_amount || 0),
        })),

        allocations: allocationRows.map((allocation) => ({
          ...allocation,

          allocated_amount: Number(allocation.allocated_amount || 0),

          invoice_outstanding_before: Number(
            allocation.invoice_outstanding_before || 0,
          ),

          invoice_outstanding_after: Number(
            allocation.invoice_outstanding_after || 0,
          ),

          collection_remaining_before: Number(
            allocation.collection_remaining_before || 0,
          ),

          collection_remaining_after: Number(
            allocation.collection_remaining_after || 0,
          ),
        })),
      });
    } catch (error) {
      console.error(
        "Get SMD invoice details failed:",

        error,
      );

      return res.status(500).json({
        success: false,

        message: "Unable to fetch SMD invoice and collection details.",
      });
    }
  },
);

router.get(
  "/sterlion-mexon-dexon/:lan/daily-accruals",

  async (req, res) => {
    try {
      const lan = String(req.params.lan ?? "")
        .trim()
        .toUpperCase();

      const invoiceNumber = String(req.query.invoiceNumber ?? "")
        .trim()
        .toUpperCase();

      if (!lan) {
        return res.status(400).json({
          success: false,

          message: "LAN is required.",
        });
      }

      const params = [lan];

      let invoiceFilter = "";

      if (invoiceNumber) {
        invoiceFilter = "AND d.invoice_number = ?";

        params.push(invoiceNumber);
      }

      const [rows] = await db.promise().query(
        `
              SELECT d.*
              FROM loan_invoice_daily_accruals_sterlion_mexon_dexon d
              WHERE d.lan = ?
                ${invoiceFilter}
              ORDER BY
                d.invoice_number ASC,
                d.accrual_date ASC
            `,
        params,
      );

      return res.status(200).json({
        success: true,

        lan,

        invoice_number: invoiceNumber || null,

        total_records: rows.length,

        data: rows.map((row) => ({
          ...row,

          opening_principal: Number(row.opening_principal || 0),

          daily_interest_exact: Number(row.daily_interest_exact || 0),

          daily_interest_posted: Number(row.daily_interest_posted || 0),

          principal_allocated_today: Number(row.principal_allocated_today || 0),

          closing_principal: Number(row.closing_principal || 0),

          cumulative_interest_exact: Number(row.cumulative_interest_exact || 0),

          cumulative_interest_posted: Number(
            row.cumulative_interest_posted || 0,
          ),

          upfront_interest_remaining_exact: Number(
            row.upfront_interest_remaining_exact || 0,
          ),
        })),
      });
    } catch (error) {
      console.error(
        "Get SMD daily accruals failed:",

        error,
      );

      return res.status(500).json({
        success: false,

        message: "Unable to fetch SMD daily accrual details.",
      });
    }
  },
);

if (
  process.env.NODE_ENV !== "test" &&
  process.env.DISABLE_SMD_DAILY_ACCRUAL_CRON !== "true"
) {
  startSterlionMexonDexonDailyAccrualCron();
}

/* ==================== CARRY FORWARD V2 ==================== */

function computeAllocationCarryExact(allocation) {
  const principalRepaid = Number(allocation.allocated_amount || 0);

  if (!Number.isFinite(principalRepaid) || principalRepaid <= 0) {
    return 0;
  }

  const originalDisbursementDate = databaseDateToSqlDate(
    allocation.disbursement_date,
  );

  const allocationDate = databaseDateToSqlDate(allocation.allocation_date);

  const contractualDays = getSmdContractualDays(
    Number(allocation.tenure_months),
  );

  const usedDays = Math.max(
    Math.min(
      diffSqlDates(allocationDate, originalDisbursementDate),
      contractualDays,
    ),
    0,
  );

  const remainingDays = Math.max(contractualDays - usedDays, 0);

  if (remainingDays <= 0) {
    return 0;
  }

  const annualInterestRate = Number(allocation.annual_interest_rate || 0);

  const dayCountBasis = Number(
    allocation.day_count_basis || SMD_DAY_COUNT_BASIS,
  );

  if (
    !Number.isFinite(annualInterestRate) ||
    annualInterestRate <= 0 ||
    !Number.isFinite(dayCountBasis) ||
    dayCountBasis <= 0
  ) {
    throw new RowImportError(
      "calculation",
      `Invalid interest configuration for invoice ${allocation.invoice_number}.`,
    );
  }

  return roundSix(
    principalRepaid *
      (annualInterestRate / 100) *
      (remainingDays / dayCountBasis),
  );
}

const CARRY_ALLOCATION_SELECT = `
  SELECT
    a.id                    AS allocation_id,
    a.allocated_amount,
    a.allocation_date,
    a.carry_generated_amount,

    i.id                    AS source_invoice_id,
    i.invoice_number,
    i.disbursement_date,
    i.tenure_months,
    i.annual_interest_rate,
    i.day_count_basis

  FROM loan_collection_allocations_sterlion_mexon_dexon a

  INNER JOIN loan_invoices_sterlion_mexon_dexon i
    ON i.id = a.invoice_id

  INNER JOIN loan_collections_sterlion_mexon_dexon c
    ON c.id = a.collection_id

  WHERE a.loan_booking_id = ?
    AND a.allocation_component = 'PRINCIPAL'
    AND i.status <> 'CANCELLED'
    AND c.status <> 'REVERSED'
`;

async function calculateOpeningCarryPoolExactV2(
  conn,
  loanBookingId,
  currentInvoiceDate,
  currentInvoiceId = null,
) {
  const [allocationRows] = await conn.query(
    `
      ${CARRY_ALLOCATION_SELECT}
        AND a.allocation_date <= ?
      ORDER BY
        a.allocation_date ASC,
        a.id ASC
    `,
    [loanBookingId, currentInvoiceDate],
  );

  let totalCarryGenerated = 0;

  for (const allocation of allocationRows) {
    totalCarryGenerated += computeAllocationCarryExact(allocation);
  }

  totalCarryGenerated = roundSix(totalCarryGenerated);

  let previousInvoiceCondition;
  let previousInvoiceParams;

  if (currentInvoiceId !== null) {
    previousInvoiceCondition = `
      (
        i.disbursement_date < ?
        OR (
          i.disbursement_date = ?
          AND i.id < ?
        )
      )
    `;

    previousInvoiceParams = [
      currentInvoiceDate,
      currentInvoiceDate,
      currentInvoiceId,
    ];
  } else {
    previousInvoiceCondition = `i.disbursement_date <= ?`;

    previousInvoiceParams = [currentInvoiceDate];
  }

  const [consumedRows] = await conn.query(
    `
      SELECT
        COALESCE(SUM(i.carry_forward_applied), 0.00) AS total_carry_consumed
      FROM loan_invoices_sterlion_mexon_dexon i
      WHERE i.loan_booking_id = ?
        AND i.status <> 'CANCELLED'
        AND ${previousInvoiceCondition}
    `,
    [loanBookingId, ...previousInvoiceParams],
  );

  const totalCarryConsumed = Number(consumedRows[0]?.total_carry_consumed || 0);

  return roundSix(Math.max(totalCarryGenerated - totalCarryConsumed, 0));
}

async function syncAllocationCarryAudit(conn, loanBookingId) {
  const [allocationRows] = await conn.query(
    `${CARRY_ALLOCATION_SELECT} ORDER BY a.id ASC`,
    [loanBookingId],
  );

  const changed = [];

  for (const allocation of allocationRows) {
    const carryExact = computeAllocationCarryExact(allocation);

    const storedExact = roundSix(allocation.carry_generated_amount || 0);

    if (carryExact !== storedExact) {
      changed.push([allocation.allocation_id, carryExact]);
    }
  }

  if (changed.length === 0) {
    return 0;
  }

  const caseClause = changed.map(() => `WHEN ? THEN ?`).join(" ");

  const caseParams = changed.flat();

  const idPlaceholders = changed.map(() => "?").join(", ");

  const idParams = changed.map(([allocationId]) => allocationId);

  await conn.query(
    `
      UPDATE loan_collection_allocations_sterlion_mexon_dexon
      SET carry_generated_amount = CASE id ${caseClause} END
      WHERE id IN (${idPlaceholders})
    `,
    [...caseParams, ...idParams],
  );

  return changed.length;
}

async function recalculateInvoiceCarryForwardChainV2(conn, loanBookingId) {
  await syncAllocationCarryAudit(conn, loanBookingId);

  const [invoiceRows] = await conn.query(
    `
      SELECT
        id,
        invoice_number,
        disbursement_date,
        contractual_upfront_interest,
        disbursement_amount
      FROM loan_invoices_sterlion_mexon_dexon
      WHERE loan_booking_id = ?
        AND status <> 'CANCELLED'
      ORDER BY
        disbursement_date ASC,
        id ASC
      FOR UPDATE
    `,
    [loanBookingId],
  );

  for (const invoice of invoiceRows) {
    const invoiceDate = databaseDateToSqlDate(invoice.disbursement_date);

    const openingCarryPoolExact = await calculateOpeningCarryPoolExactV2(
      conn,
      loanBookingId,
      invoiceDate,
      invoice.id,
    );

    const openingCarryPoolCents = amountToCents(
      roundMoney(openingCarryPoolExact),
    );

    const contractualInterestCents = amountToCents(
      invoice.contractual_upfront_interest,
    );

    const carryAppliedCents = Math.min(
      contractualInterestCents,
      openingCarryPoolCents,
    );

    const newUpfrontInterestCents =
      contractualInterestCents - carryAppliedCents;

    const grossDisbursementCents = amountToCents(invoice.disbursement_amount);

    if (newUpfrontInterestCents > grossDisbursementCents) {
      throw new RowImportError(
        "upfront_interest",
        `Adjusted upfront interest exceeds disbursement amount for invoice ${invoice.invoice_number}.`,
      );
    }

    const netDisbursementCents =
      grossDisbursementCents - newUpfrontInterestCents;

    await conn.query(
      `
        UPDATE loan_invoices_sterlion_mexon_dexon
        SET
          opening_carry_forward_pool = ?,
          carry_forward_applied = ?,
          new_upfront_interest_charged = ?,
          net_disbursement_amount = ?
        WHERE id = ?
      `,
      [
        centsToAmount(openingCarryPoolCents),
        centsToAmount(carryAppliedCents),
        centsToAmount(newUpfrontInterestCents),
        centsToAmount(netDisbursementCents),
        invoice.id,
      ],
    );
  }
}

/* ================== END CARRY FORWARD V2 ================== */


module.exports = router;
