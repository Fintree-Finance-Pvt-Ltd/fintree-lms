const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");
const db = require("../config/db");
const puppeteer = require("puppeteer");/* =========================================================
   LAN PREFIX ROUTING
========================================================= */


const PARTNER_ROUTES = [
  /*
   * Longer prefixes should remain before shorter prefixes.
   */

  {
    prefix: "HEYBF1",
    table: "loan_booking_hey_ev_battery",
    rpsTable: "manual_rps_hey_ev_battery",
  },

  {
    prefix: "CIRHUF",
    table: "loan_booking_circle_pe_houser",
    rpsTable: "manual_rps_circle_pe_houser",
  },

  {
    prefix: "HEYEV",
    table: "loan_booking_hey_ev",
    rpsTable: "manual_rps_hey_ev",
  },

  {
    prefix: "WCTL",
    table: "loan_bookings_wctl",
    rpsTable: "manual_rps_wctl",
  },

  {
    prefix: "FINE",
    table: "loan_booking_emiclub",
    rpsTable: "manual_rps_emiclub",
  },

  {
    prefix: "CARE",
    table: "loan_booking_carepay",
    rpsTable: "manual_rps_carepay",
  },

  {
    prefix: "STRL",
    table: "loan_booking_sterlion",
    rpsTable: "manual_rps_sterlion",
  },

  {
    prefix: "CLYO",
    table: "loan_booking_clayyo",
    rpsTable: "manual_rps_clayoo",
  },

  {
    prefix: "GQN",
    table: "loan_booking_gq_non_fsf",
    rpsTable: "manual_rps_gq_non_fsf",
  },

  {
    prefix: "GQF",
    table: "loan_booking_gq_fsf",
    rpsTable: "manual_rps_gq_fsf",
  },

  {
    prefix: "ADK",
    table: "loan_booking_adikosh",
    rpsTable: "manual_rps_adikosh",
  },

  {
    prefix: "HEL",
    table: "loan_booking_helium",
    rpsTable: "manual_rps_helium",
  },

  {
    prefix: "FINS",
    table: "loan_booking_finso",
    rpsTable: "manual_rps_finso_loan",
  },

  {
    prefix: "CIRF",
    table: "loan_booking_circle_pe",
    rpsTable: "manual_rps_circlepe",
  },

  {
    prefix: "MCL",
    table: "loan_booking_motion_corp",
    rpsTable: "manual_rps_motioncorp",
  },

  /*
   * Supports LANs beginning with MC where MCL is not used.
   */
  {
    prefix: "MC",
    table: "loan_booking_motion_corp",
    rpsTable: "manual_rps_motioncorp",
  },

  {
    prefix: "ZYPF",
    table: "loan_booking_zypay_customer",
    rpsTable: "manual_rps_zypay",
  },

  /*
   * Seven Fincorp LAN.
   * Confirm the booking-table name if it differs in your database.
   */
  {
    prefix: "SFL",
    table: "seven_fincorp_dealer_booking",
    rpsTable: "manual_rps_seven_fincorp",
  },

  {
    prefix: "SF",
    table: "seven_fincorp_dealer_booking",
    rpsTable: "manual_rps_seven_fincorp",
  },

  {
    prefix: "BUN",
    table: "loan_booking_bundela",
    rpsTable: "manual_rps_bundela",
  },

  {
    prefix: "LDF",
    table: "loan_booking_loan_digit",
    rpsTable: "manual_rps_loan_digit",
  },

  {
    prefix: "LDG",
    table: "loan_booking_loan_digit",
    rpsTable: "manual_rps_loan_digit",
  },

  {
    prefix: "LDD",
    table: "loan_booking_loan_digit",
    rpsTable: "manual_rps_loan_digit",
  },

  {
    prefix: "SML",
    table: "loan_booking_switch_my_loan",

    /*
     * No RPS table was included for SML in your mapping.
     * Add rpsTable here when its table is available.
     */
    rpsTable: null,
  },

  {
    prefix: "ZBR",
    table: "loan_booking_zebrs",

    /*
     * No RPS table was included for ZBR in your mapping.
     */
    rpsTable: null,
  },

  /*
   * Older Clayoo prefix.
   */
  {
    prefix: "CLY",
    table: "loan_booking_clayyo",
    rpsTable: "manual_rps_clayoo",
  },

  {
    prefix: "SH",
    table: "loan_booking_srbh",
    rpsTable: "manual_rps_srbh",
  },

  {
    prefix: "E10",
    table: "loan_booking_embifi",
    rpsTable: "manual_rps_embifi_loan",
  },

  {
    prefix: "E1",
    table: "loan_booking_embifi",
    rpsTable: "manual_rps_embifi_loan",
  },

  /*
   * Older Hey EV Battery prefix.
   */
  {
    prefix: "HEYBF",
    table: "loan_booking_hey_ev_battery",
    rpsTable: "manual_rps_hey_ev_battery",
  },

  /*
   * Older Hey EV prefix.
   */
  {
    prefix: "HEY",
    table: "loan_booking_hey_ev",
    rpsTable: "manual_rps_hey_ev",
  },

  {
    prefix: "EV",
    table: "loan_booking_ev",

    /*
     * EV was not included in the mapping you provided.
     * This is the table used elsewhere in your project.
     */
    rpsTable: "manual_rps_ev_loan",
  },

  {
    prefix: "BL",
    table: "loan_bookings",
    rpsTable: "manual_rps_bl_loan",
  },
];



/* =========================================================
   TEMPLATE FIELD COLUMN CANDIDATES
========================================================= */

/*
 * Different loan-booking tables can have different column names.
 *
 * The service checks the table structure and selects only the
 * first available column required for each template field.
 *
 * It does not use SELECT *.
 */

const TEMPLATE_FIELD_COLUMNS = {
  customer_id: [
    "app_id",
    "customer_id",
    "application_id",
    "partner_loan_id",
    "id",
  ],

  borrower_name: [
    "customer_name",
    "borrower_name",
    "applicant_name",
    "full_name",
    "name_in_bank",
  ],

  borrower_address: [
    "current_address",
    "borrower_address",
    "complete_address",
    "address",
    "cur_add",
    "permanent_address",
    "per_add",
  ],

  borrower_city: [
    "current_village_city",
    "current_city",
    "city",
    "village_city",
  ],

  borrower_district: ["current_district", "district"],

  borrower_state: ["current_state", "state"],

  borrower_pincode: [
    "current_pincode",
    "current_pin_code",
    "pincode",
    "pin_code",
    "postal_code",
  ],

  mobile_number: [
    "mobile_number",
    "mobile",
    "registered_mobile",
    "contact_number",
    "phone_number",
  ],

  email_id: [
    "email_id",
    "email",
    "registered_email",
    "customer_email",
    "borrower_email",
  ],

  loan_product_name: [
    "product",
    "product_name",
    "loan_product",
    "loan_product_name",
  ],

  sanctioned_amount: [
    "loan_amount",
    "loan_amount_sanctioned",
    "sanctioned_amount",
    "sanction_amount",
    "approved_loan_amount",
    "approved_amount",
    "final_limit",
    "request_amount",
    "l_a",
  ],

  disbursed_amount: [
    "net_disbursement",
    "disbursed_amount",
    "disbursement_amount",
    "net_disbursed_amount",

    /*
     * Fallback columns when separate net-disbursement
     * value is not maintained.
     */
    "loan_amount",
    "loan_amount_sanctioned",
    "final_limit",
    "l_a",
  ],

  rate_of_interest: [
    "interest_rate",
    "interest_percent",
    "new_interest",
    "roi_apr",
    "roi",
    "irr",
    "i_r",
  ],

  loan_tenure: [
    "loan_tenure",
    "loan_tenure_months",
    "tenure",
    "tenure_months",
    "l_t",
  ],

  emi_amount: ["emi_amount", "monthly_emi", "monthly_emi_amount", "emi"],

  emi_due_date: [
    "emi_due_date",
    "first_emi_date",
    "emi_date",
    "emi_day",
    "salary_day",
    "repayment_start_date",
    "due_date",
  ],

  repayment_mode: [
    "repayment_mode",
    "payment_mode",
    "mandate_type",
    "repayment_method",
  ],
};

/* =========================================================
   GENERAL HELPERS
========================================================= */

function hasValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function safeString(value, fallback = "") {
  return hasValue(value) ? String(value).trim() : fallback;
}

function createServiceError(message, code, extra = {}) {
  const error = new Error(message);
  error.code = code;

  Object.assign(error, extra);

  return error;
}

function escapeSqlIdentifier(identifier) {
  const value = safeString(identifier);

  if (!/^[A-Za-z0-9_]+$/.test(value)) {
    throw createServiceError(
      `Invalid SQL identifier: ${identifier}`,
      "INVALID_SQL_IDENTIFIER",
    );
  }

  return `\`${value}\``;
}

/* =========================================================
   DATABASE HELPERS
========================================================= */

function getDbClient() {
  if (typeof db.promise === "function") {
    return db.promise();
  }

  return db;
}

async function executeQuery(sql, params = []) {
  const result = await getDbClient().query(sql, params);

  /*
   * mysql2 promise query returns:
   *
   * [rows, fields]
   */
  if (
    Array.isArray(result) &&
    result.length === 2 &&
    Array.isArray(result[0])
  ) {
    return result[0];
  }

  return result;
}

/* =========================================================
   LAN ROUTING
========================================================= */

function resolvePartnerByLan(lan) {
  const normalizedLan = safeString(lan).toUpperCase();

  if (!normalizedLan) {
    throw createServiceError("LAN is required.", "LAN_REQUIRED");
  }

  /*
   * Sort routes by prefix length.
   *
   * Example:
   * HEYBF1 will be checked before HEY.
   */
  const route = [...PARTNER_ROUTES]
    .sort((first, second) => second.prefix.length - first.prefix.length)
    .find(({ prefix }) => normalizedLan.startsWith(prefix));

  if (!route) {
    throw createServiceError(
      `Routing Failed: Unknown LAN prefix pattern for ${normalizedLan}.`,
      "UNKNOWN_LAN_PREFIX",
      {
        lan: normalizedLan,
      },
    );
  }

  return {
    lan: normalizedLan,
    prefix: route.prefix,
    table: route.table,
    rpsTable: route.rpsTable || null,
  };
}

/* =========================================================
   TABLE STRUCTURE HELPERS
========================================================= */

async function getTableColumns(tableName) {
  const rows = await executeQuery(
    `SHOW COLUMNS FROM ${escapeSqlIdentifier(tableName)}`,
  );

  return rows.map((row) => String(row.Field));
}

function findAvailableColumn(tableColumns, candidates) {
  const lowerCaseColumns = new Map(
    tableColumns.map((column) => [column.toLowerCase(), column]),
  );

  for (const candidate of candidates) {
    const availableColumn = lowerCaseColumns.get(candidate.toLowerCase());

    if (availableColumn) {
      return availableColumn;
    }
  }

  return null;
}

/* =========================================================
   BUILD SELECT QUERY FOR TEMPLATE FIELDS
========================================================= */

function buildTemplateFieldSelect(tableColumns) {
  const selectedColumns = [];
  const fieldMapping = {};

  for (const [templateField, candidates] of Object.entries(
    TEMPLATE_FIELD_COLUMNS,
  )) {
    const column = findAvailableColumn(tableColumns, candidates);

    fieldMapping[templateField] = column || null;

    if (column) {
      selectedColumns.push(
        `${escapeSqlIdentifier(column)} AS ${escapeSqlIdentifier(
          templateField,
        )}`,
      );
    } else {
      selectedColumns.push(`NULL AS ${escapeSqlIdentifier(templateField)}`);
    }
  }

  return {
    selectedColumns,
    fieldMapping,
  };
}

/* =========================================================
   FETCH ONLY REQUIRED LOAN DATA
========================================================= */

async function getRequiredLoanData(route) {
  const tableColumns = await getTableColumns(route.table);

  const lanColumn = findAvailableColumn(tableColumns, [
    "lan",
    "loan_account_number",
    "loan_account_no",
    "loan_number",
  ]);

  if (!lanColumn) {
    throw createServiceError(
      `LAN column was not found in ${route.table}.`,
      "LAN_COLUMN_NOT_FOUND",
      {
        table: route.table,
      },
    );
  }

  const { selectedColumns, fieldMapping } =
    buildTemplateFieldSelect(tableColumns);

  console.log("[WELCOME_LETTER_FIELD_MAPPING]", {
    lan: route.lan,
    table: route.table,
    fieldMapping,
  });

  const rows = await executeQuery(
    `
      SELECT
        ${selectedColumns.join(",\n        ")}
      FROM ${escapeSqlIdentifier(route.table)}
      WHERE ${escapeSqlIdentifier(lanColumn)} = ?
      LIMIT 1
    `,
    [route.lan],
  );

  if (!rows.length) {
    throw createServiceError(
      `Loan record not found for LAN ${route.lan} in ${route.table}.`,
      "LOAN_RECORD_NOT_FOUND",
      {
        lan: route.lan,
        table: route.table,
      },
    );
  }

  return rows[0];
}
async function getFirstEmiDueDate(route) {
  if (!route.rpsTable) {
    console.warn("[WELCOME_LETTER_RPS_TABLE_NOT_CONFIGURED]", {
      lan: route.lan,
      partnerTable: route.table,
    });
    return null;
  }
  try {
    console.log("[WELCOME_LETTER_EMI_DATE_FETCH_START]", {
      lan: route.lan,
      rpsTable: route.rpsTable,
    });
    const rpsColumns = await getTableColumns(route.rpsTable);
    const lanColumn = findAvailableColumn(rpsColumns, [
      "lan",
      "loan_account_number",
      "loan_account_no",
    ]);
    const dueDateColumn = findAvailableColumn(rpsColumns, [
      "due_date",
      "emi_due_date",
      "payment_date",
      "pay_date",
      "paydate",
      "installment_date",
      "repayment_date",
    ]);
    if (!lanColumn) {
      console.warn("[WELCOME_LETTER_RPS_LAN_COLUMN_MISSING]", {
        lan: route.lan,
        rpsTable: route.rpsTable,
      });
      return null;
    }
    if (!dueDateColumn) {
      console.warn("[WELCOME_LETTER_RPS_DUE_DATE_COLUMN_MISSING]", {
        lan: route.lan,
        rpsTable: route.rpsTable,
        availableColumns: rpsColumns,
      });
      return null;
    }
    const rows = await executeQuery(
      ` SELECT ${escapeSqlIdentifier(dueDateColumn)} AS emi_due_date FROM ${escapeSqlIdentifier(route.rpsTable)} WHERE ${escapeSqlIdentifier(lanColumn)} = ? AND ${escapeSqlIdentifier(dueDateColumn)} IS NOT NULL ORDER BY ${escapeSqlIdentifier(dueDateColumn)} ASC LIMIT 1 `,
      [route.lan],
    );
    const firstEmiDueDate = rows.length > 0 ? rows[0].emi_due_date : null;
    console.log("[WELCOME_LETTER_EMI_DATE_FETCHED]", {
      lan: route.lan,
      rpsTable: route.rpsTable,
      dueDateColumn,
      firstEmiDueDate,
    });
    return firstEmiDueDate;
  } catch (error) {
    console.error("[WELCOME_LETTER_EMI_DATE_FETCH_FAILED]", {
      lan: route.lan,
      rpsTable: route.rpsTable,
      error: error.message,
    });
    return null;
  }
}

/* =========================================================
   VALUE FORMATTING
========================================================= */

function formatDate(value) {
  if (!hasValue(value)) {
    return "";
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(value);
  }

  const rawValue = String(value).trim();

  /*
   * MySQL date:
   * YYYY-MM-DD
   */
  const mysqlDateMatch = rawValue.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (mysqlDateMatch) {
    const [, year, month, day] = mysqlDateMatch;

    return `${day}/${month}/${year}`;
  }

  const parsedDate = new Date(rawValue);

  if (Number.isNaN(parsedDate.getTime())) {
    return rawValue;
  }

  return formatDate(parsedDate);
}

function parseNumericValue(value, fieldName) {
  if (!hasValue(value)) {
    return null;
  }

  const normalizedValue = String(value)
    .replace(/,/g, "")
    .replace(/[^\d.-]/g, "");

  const numericValue = Number(normalizedValue);

  if (!Number.isFinite(numericValue)) {
    throw createServiceError(
      `Invalid ${fieldName}: ${value}`,
      "INVALID_NUMERIC_VALUE",
      {
        fieldName,
        value,
      },
    );
  }

  return numericValue;
}

function formatCurrency(value, fieldName) {
  const numericValue = parseNumericValue(value, fieldName);

  if (numericValue === null) {
    return "";
  }

  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numericValue);
}

function formatRate(value) {
  const numericValue = parseNumericValue(value, "rate of interest");

  if (numericValue === null) {
    return "";
  }

  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  }).format(numericValue);
}

function formatTenure(value) {
  if (!hasValue(value)) {
    return "";
  }

  const tenure = String(value).trim();

  if (/^\d+(\.0+)?$/.test(tenure)) {
    return `${Number(tenure)} Months`;
  }

  return tenure;
}

function getOrdinalDay(day) {
  const number = Number(day);
  const lastTwoDigits = number % 100;

  if (lastTwoDigits >= 11 && lastTwoDigits <= 13) {
    return `${number}th`;
  }

  if (number % 10 === 1) {
    return `${number}st`;
  }

  if (number % 10 === 2) {
    return `${number}nd`;
  }

  if (number % 10 === 3) {
    return `${number}rd`;
  }

  return `${number}th`;
}

function formatEmiDueDate(value) {
  if (!hasValue(value)) {
    return "";
  }

  const rawValue = String(value).trim();

  /*
   * When only EMI day is stored,
   * for example 5, 10 or 15.
   */
  if (/^(0?[1-9]|[12]\d|3[01])$/.test(rawValue)) {
    return `${getOrdinalDay(Number(rawValue))} of every month`;
  }

  return formatDate(value);
}

function buildBorrowerAddress(loanRecord) {
  const parts = [
    loanRecord.borrower_address,
    loanRecord.borrower_city,
    loanRecord.borrower_district,
    loanRecord.borrower_state,
    loanRecord.borrower_pincode,
  ];

  return parts
    .filter(hasValue)
    .map((value) => String(value).trim())
    .filter(
      (value, index, values) =>
        values.findIndex(
          (item) => item.toLowerCase() === value.toLowerCase(),
        ) === index,
    )
    .join(", ");
}

function generateReferenceNumber(lan) {
  const dateParts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(new Date());

  const day = dateParts.find((part) => part.type === "day")?.value;

  const month = dateParts.find((part) => part.type === "month")?.value;

  const year = dateParts.find((part) => part.type === "year")?.value;

  return `FFPL/WELCOME/${lan}/` + `${year}${month}${day}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAddress(value) {
  return escapeHtml(value).replace(/\r?\n/g, "<br>");
}

function maskEmail(email) {
  const emailValue = safeString(email);
  const [name, domain] = emailValue.split("@");

  if (!name || !domain) {
    return "MISSING_OR_INVALID";
  }

  return `${name.slice(0, 2)}***@${domain}`;
}

/* =========================================================
   PREPARE TEMPLATE VARIABLES
========================================================= */

function prepareTemplateData(loanRecord, route) {
  return {
    DATE: formatDate(new Date()),

    CUSTOMER_ID: safeString(loanRecord.customer_id),

    LOAN_ACCOUNT_NUMBER: route.lan,

    LETTER_REF_NO: generateReferenceNumber(route.lan),

    BORROWER_NAME: safeString(loanRecord.borrower_name),

    BORROWER_ADDRESS: buildBorrowerAddress(loanRecord),

    MOBILE_NUMBER: safeString(loanRecord.mobile_number),

    EMAIL_ID: safeString(loanRecord.email_id),

    LOAN_PRODUCT_NAME: safeString(loanRecord.loan_product_name),

    SANCTIONED_AMOUNT: hasValue(loanRecord.sanctioned_amount)
      ? formatCurrency(loanRecord.sanctioned_amount, "sanctioned amount")
      : "",

    DISBURSED_AMOUNT: hasValue(loanRecord.disbursed_amount)
      ? formatCurrency(loanRecord.disbursed_amount, "disbursed amount")
      : "",

    RATE_OF_INTEREST: hasValue(loanRecord.rate_of_interest)
      ? formatRate(loanRecord.rate_of_interest)
      : "",

    LOAN_TENURE: hasValue(loanRecord.loan_tenure)
      ? formatTenure(loanRecord.loan_tenure)
      : "",

    EMI_AMOUNT: hasValue(loanRecord.emi_amount)
      ? formatCurrency(loanRecord.emi_amount, "EMI amount")
      : "",

    EMI_DUE_DATE: hasValue(loanRecord.emi_due_date)
      ? formatEmiDueDate(loanRecord.emi_due_date)
      : "",

    REPAYMENT_MODE: safeString(
      loanRecord.repayment_mode,
      process.env.DEFAULT_REPAYMENT_MODE || "NACH",
    ),

    SUPPORT_EMAIL: safeString(process.env.CUSTOMER_SUPPORT_EMAIL),

    SUPPORT_NUMBER: safeString(process.env.CUSTOMER_SUPPORT_NUMBER),

    OFFICE_ADDRESS: safeString(process.env.CORPORATE_OFFICE_ADDRESS),

    WORKING_HOURS: safeString(process.env.CUSTOMER_SUPPORT_WORKING_HOURS),

    AUTHORIZED_SIGNATORY_NAME: safeString(
      process.env.AUTHORIZED_SIGNATORY_NAME,
    ),

    DESIGNATION: safeString(
      process.env.AUTHORIZED_SIGNATORY_DESIGNATION,
      "Authorized Signatory",
    ),
  };
}

/* =========================================================
   VALIDATION
========================================================= */

function validateCustomerEmail(email, lan) {
  const normalizedEmail = safeString(email);

  if (!normalizedEmail) {
    throw createServiceError(
      `Customer email ID not found for LAN ${lan}.`,
      "CUSTOMER_EMAIL_NOT_FOUND",
    );
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailPattern.test(normalizedEmail)) {
    throw createServiceError(
      `Invalid customer email ID for LAN ${lan}.`,
      "INVALID_CUSTOMER_EMAIL",
    );
  }
}
const REQUIRED_WELCOME_LETTER_FIELDS = [
  "DATE",
  "CUSTOMER_ID",
  "LOAN_ACCOUNT_NUMBER",
  "LETTER_REF_NO",
  "BORROWER_NAME",
  "BORROWER_ADDRESS",
  "MOBILE_NUMBER",
  "EMAIL_ID",
  "LOAN_PRODUCT_NAME",
  "SANCTIONED_AMOUNT",
  "DISBURSED_AMOUNT",
  "RATE_OF_INTEREST",
  "LOAN_TENURE",
  "EMI_AMOUNT",
  "EMI_DUE_DATE",
  "REPAYMENT_MODE",
];

function validateTemplateData(templateData, lan) {
  const missingRequiredFields = REQUIRED_WELCOME_LETTER_FIELDS.filter(
    (fieldName) => !hasValue(templateData[fieldName]),
  );
  if (!missingRequiredFields.length) {
    console.log("[WELCOME_LETTER_REQUIRED_FIELDS_VALID]", { lan });
    return templateData;
  }
  console.warn("[WELCOME_LETTER_MISSING_REQUIRED_FIELDS]", {
    lan,
    missingFields: missingRequiredFields,
  });
  const strictMode =
    String(process.env.STRICT_WELCOME_LETTER_FIELDS || "true").toLowerCase() ===
    "true";
  if (strictMode) {
    throw createServiceError(
      `Welcome letter data is incomplete for LAN ${lan}. Missing: ${missingRequiredFields.join(", ")}`,
      "WELCOME_LETTER_DATA_INCOMPLETE",
      { missingFields: missingRequiredFields },
    );
  }
  for (const fieldName of missingRequiredFields) {
    templateData[fieldName] = "N/A";
  }
  return templateData;
}

/* =========================================================
   HTML TEMPLATE COMPILATION
========================================================= */

function replaceAll(html, placeholder, value) {
  return html.split(placeholder).join(value);
}

function compileWelcomeLetterHtml(templateHtml, templateData, useInlineLogo) {
  let completedHtml = templateHtml;

  for (const [variableName, rawValue] of Object.entries(templateData)) {
    const placeholder = `{{${variableName}}}`;

    const formattedValue =
      variableName === "BORROWER_ADDRESS" || variableName === "OFFICE_ADDRESS"
        ? escapeAddress(rawValue)
        : escapeHtml(rawValue);

    completedHtml = replaceAll(completedHtml, placeholder, formattedValue);
  }

  /*
   * Email clients cannot access this local path:
   *
   * /Backend/public/fintree-logo.png
   *
   * Therefore, replace it with the inline
   * email attachment Content-ID.
   */
  if (useInlineLogo) {
    completedHtml = completedHtml.replace(
      /src=(["'])\/Backend\/public\/fintree-logo\.png\1/i,
      'src="cid:fintree-logo"',
    );
  }

  /*
   * Remove the template's temporary blue
   * placeholder styling after values are filled.
   */
  completedHtml = completedHtml.replace(
    /class=(["'])([^"']*\bplaceholder\b[^"']*)\1/gi,
    (completeMatch, quote, classNames) => {
      const remainingClasses = classNames
        .split(/\s+/)
        .filter((className) => className && className !== "placeholder")
        .join(" ");

      if (!remainingClasses) {
        return "";
      }

      return `class=${quote}` + `${remainingClasses}${quote}`;
    },
  );

  /*
   * Stop email dispatch if any {{VARIABLE}}
   * remains unresolved.
   */
  const unresolvedVariables = Array.from(
    new Set(completedHtml.match(/{{\s*[A-Z0-9_]+\s*}}/g) || []),
  );

  if (unresolvedVariables.length) {
    throw createServiceError(
      `Unresolved HTML template variables: ${unresolvedVariables.join(", ")}`,
      "UNRESOLVED_TEMPLATE_VARIABLES",
      {
        unresolvedVariables,
      },
    );
  }

  return completedHtml;
}

/* =========================================================
   PDF GENERATION
========================================================= */

function getImageMimeType(filePath) {
  const extension = path.extname(filePath).toLowerCase();

  switch (extension) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";

    case ".webp":
      return "image/webp";

    case ".svg":
      return "image/svg+xml";

    case ".png":
    default:
      return "image/png";
  }
}

async function embedLogoForPdf(completedHtml, logoPath, logoExists) {
  if (!logoExists) {
    console.warn("[WELCOME_LETTER_PDF_LOGO_NOT_FOUND]", {
      logoPath,
    });

    /*
     * Remove the broken image when logo is missing.
     */
    return completedHtml.replace(/<img[^>]*class=(["'])logo-img\1[^>]*>/i, "");
  }

  const logoBuffer = await fs.promises.readFile(logoPath);

  const mimeType = getImageMimeType(logoPath);

  const logoDataUri =
    `data:${mimeType};base64,` + logoBuffer.toString("base64");

  let pdfHtml = completedHtml;

  /*
   * Replace the original local template path.
   */
  pdfHtml = pdfHtml.replace(
    /src=(["'])\/Backend\/public\/fintree-logo\.png\1/i,
    `src="${logoDataUri}"`,
  );

  /*
   * Also handle HTML already prepared with email CID.
   */
  pdfHtml = pdfHtml.replace(
    /src=(["'])cid:fintree-logo\1/i,
    `src="${logoDataUri}"`,
  );

  return pdfHtml;
}

async function generateWelcomeLetterPdf({
  completedHtml,
  logoPath,
  logoExists,
  lan,
}) {
  const startedAt = Date.now();
  let browser = null;

  console.log("[WELCOME_LETTER_PDF_GENERATION_START]", {
    lan,
    format: "A4",
    pdfEngine: "puppeteer",
  });

  try {
    const pdfHtml = await embedLogoForPdf(
      completedHtml,
      logoPath,
      logoExists,
    );

    browser = await puppeteer.launch({
      headless: true,

      // Required on many Ubuntu/VPS environments.
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
      ],
    });

    const page = await browser.newPage();

    await page.setContent(pdfHtml, {
      waitUntil: ["load", "domcontentloaded", "networkidle0"],
      timeout: 60000,
    });

    // Ensure background colours and images appear in the PDF.
    await page.emulateMediaType("screen");

    const pdfBuffer = await page.pdf({
      format: "A4",
      landscape: false,
      printBackground: true,
      preferCSSPageSize: false,

      displayHeaderFooter: true,
      headerTemplate: "<div></div>",

      footerTemplate: `
        <div
          style="
            width: 100%;
            padding-right: 15mm;
            text-align: right;
            font-family: Arial, Helvetica, sans-serif;
            font-size: 8px;
            color: #94a3b8;
          "
        >
          Page
          <span class="pageNumber"></span>
          of
          <span class="totalPages"></span>
        </div>
      `,

      margin: {
        top: "15mm",
        right: "15mm",
        bottom: "15mm",
        left: "15mm",
      },
    });

    if (
      String(process.env.DEBUG_WELCOME_PDF || "false").toLowerCase() ===
      "true"
    ) {
      const debugDirectory = path.join(
        __dirname,
        "../uploads/welcome-letter-debug",
      );

      await fs.promises.mkdir(debugDirectory, {
        recursive: true,
      });

      const debugHtmlPath = path.join(
        debugDirectory,
        `${lan}_welcome_letter.html`,
      );

      await fs.promises.writeFile(
        debugHtmlPath,
        pdfHtml,
        "utf8",
      );

      console.log("[WELCOME_LETTER_DEBUG_HTML_SAVED]", {
        lan,
        debugHtmlPath,
      });
    }

    const finalPdfBuffer = Buffer.from(pdfBuffer);

    if (
      !Buffer.isBuffer(finalPdfBuffer) ||
      finalPdfBuffer.length === 0
    ) {
      throw createServiceError(
        `PDF generation returned an empty buffer for LAN ${lan}.`,
        "EMPTY_PDF_BUFFER",
      );
    }

    console.log("[WELCOME_LETTER_PDF_GENERATION_SUCCESS]", {
      lan,
      pdfSizeBytes: finalPdfBuffer.length,
      executionTimeMs: Date.now() - startedAt,
    });

    return finalPdfBuffer;
  } catch (error) {
    console.error("[WELCOME_LETTER_PDF_GENERATION_FAILED]", {
      lan,
      errorCode: error.code || "PDF_GENERATION_FAILED",
      errorMessage: error.message,
      executionTimeMs: Date.now() - startedAt,
    });

    throw error;
  } finally {
    if (browser) {
      await browser.close().catch((closeError) => {
        console.error("[WELCOME_LETTER_BROWSER_CLOSE_FAILED]", {
          lan,
          errorMessage: closeError.message,
        });
      });
    }
  }
}
/* =========================================================
   TEMPLATE AND LOGO
========================================================= */

async function loadWelcomeTemplate() {
  const templatePath =
    process.env.WELCOME_LETTER_TEMPLATE_PATH ||
    path.join(__dirname, "../templates/fintree_welcome_letter.html");

  console.log("[WELCOME_LETTER_TEMPLATE_LOADING]", {
    templatePath,
  });

  const templateHtml = await fs.promises.readFile(templatePath, "utf8");

  const logoPath =
    process.env.WELCOME_LETTER_LOGO_PATH ||
    path.join(__dirname, "../public/fintree-logo.png");

  const logoExists = fs.existsSync(logoPath);

  console.log("[WELCOME_LETTER_TEMPLATE_LOADED]", {
    templatePath,
    logoExists,
  });

  return {
    templateHtml,
    logoPath,
    logoExists,
  };
}

/* =========================================================
   SMTP CONFIGURATION
========================================================= */

let transporter;

function getTransporter() {
  if (transporter) {
    return transporter;
  }

  const host = safeString(process.env.SMTP_HOST);

  const port = Number(process.env.SMTP_PORT || 587);

  const user = safeString(process.env.SMTP_USER);

  const password = safeString(process.env.SMTP_PASS);

  const secure =
    String(process.env.SMTP_SECURE || "false").toLowerCase() === "true" ||
    port === 465;

  const missingConfiguration = [];

  if (!host) {
    missingConfiguration.push("SMTP_HOST");
  }

  if (!user) {
    missingConfiguration.push("SMTP_USER");
  }

  if (!password) {
    missingConfiguration.push("SMTP_PASS");
  }

  if (missingConfiguration.length) {
    throw createServiceError(
      `SMTP configuration missing: ${missingConfiguration.join(", ")}`,
      "SMTP_CONFIGURATION_MISSING",
    );
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure,

    pool: true,

    auth: {
      user,
      pass: password,
    },
  });

  return transporter;
}

/* =========================================================
   FETCH CUSTOMER LOAN AGREEMENT
========================================================= */

async function getLoanAgreementDocument(lan) {
  console.log("[LOAN_AGREEMENT_FETCH_START]", {
    lan,
  });

  const rows = await executeQuery(
  `
    SELECT
      id,
      lan,
      doc_name,
      file_name,
      original_name,
      source_url,
      doc_password,
      uploaded_at
    FROM loan_documents
    WHERE TRIM(UPPER(lan)) = TRIM(UPPER(?))
      AND (
        LOWER(TRIM(COALESCE(doc_name, '')))
          LIKE '%agreement%'

        OR LOWER(TRIM(COALESCE(original_name, '')))
          LIKE '%agreement%'

        OR LOWER(TRIM(COALESCE(file_name, '')))
          LIKE '%agreement%'
      )
    ORDER BY uploaded_at DESC, id DESC
    LIMIT 1
  `,
  [lan],
);

  if (!rows.length) {
    throw createServiceError(
      `Loan agreement not found for LAN ${lan}.`,
      "LOAN_AGREEMENT_NOT_FOUND",
      {
        lan,
      },
    );
  }

  const agreementRecord = rows[0];

  const storedFileName = safeString(agreementRecord.file_name);

  if (!storedFileName) {
    throw createServiceError(
      `Loan agreement file_name is missing for LAN ${lan}.`,
      "LOAN_AGREEMENT_FILE_NAME_MISSING",
      {
        lan,
        documentId: agreementRecord.id,
      },
    );
  }

  const backendRoot = path.resolve(__dirname, "..");

  const uploadsDirectory = path.resolve(backendRoot, "uploads");

  /*
   * Normally file_name contains only the generated
   * filename, for example:
   *
   * 1751181000000_loan_agreement.pdf
   */
  const possibleFilePaths = [
    path.resolve(uploadsDirectory, path.basename(storedFileName)),

    /*
     * Also support values such as:
     * uploads/1751181000000_loan_agreement.pdf
     */
    path.resolve(backendRoot, storedFileName),

    /*
     * Support absolute paths if an older record
     * already stores the complete path.
     */
    path.isAbsolute(storedFileName) ? path.resolve(storedFileName) : null,
  ].filter(Boolean);

  let agreementFilePath = null;

  for (const candidatePath of possibleFilePaths) {
    try {
      const fileStat = await fs.promises.stat(candidatePath);

      if (fileStat.isFile()) {
        agreementFilePath = candidatePath;

        break;
      }
    } catch (_) {
      // Continue checking the next path.
    }
  }

  if (!agreementFilePath) {
    console.error("[LOAN_AGREEMENT_LOCAL_FILE_NOT_FOUND]", {
      lan,
      documentId: agreementRecord.id,
      storedFileName,
      checkedPaths: possibleFilePaths,
    });

    throw createServiceError(
      `Loan agreement file does not exist for LAN ${lan}. Stored file_name: ${storedFileName}`,
      "LOAN_AGREEMENT_LOCAL_FILE_NOT_FOUND",
      {
        lan,
        documentId: agreementRecord.id,
        storedFileName,
      },
    );
  }

  const agreementBuffer = await fs.promises.readFile(agreementFilePath);

  if (!Buffer.isBuffer(agreementBuffer) || agreementBuffer.length === 0) {
    throw createServiceError(
      `Loan agreement file is empty for LAN ${lan}.`,
      "LOAN_AGREEMENT_FILE_EMPTY",
      {
        lan,
        documentId: agreementRecord.id,
      },
    );
  }

  /*
   * Confirm that the stored file is a PDF.
   */
  const pdfSignature = agreementBuffer.subarray(0, 4).toString("utf8");

  if (pdfSignature !== "%PDF") {
    throw createServiceError(
      `Loan agreement is not a valid PDF for LAN ${lan}.`,
      "INVALID_LOAN_AGREEMENT_PDF",
      {
        lan,
        documentId: agreementRecord.id,
        storedFileName,
      },
    );
  }

  const originalFileName = safeString(
    agreementRecord.original_name,
    "loan_agreement.pdf",
  );

  const attachmentFileName =
    path.extname(originalFileName).toLowerCase() === ".pdf"
      ? path.basename(originalFileName)
      : "loan_agreement.pdf";

  console.log("[LOAN_AGREEMENT_FETCH_SUCCESS]", {
    lan,
    documentId: agreementRecord.id,
    docName: agreementRecord.doc_name,
    originalName: agreementRecord.original_name,
    attachmentFileName,
    agreementFilePath,
    fileSizeBytes: agreementBuffer.length,
    passwordProtected: hasValue(agreementRecord.doc_password),
  });

  return {
    documentId: agreementRecord.id,

    buffer: agreementBuffer,

    attachmentFileName,

    originalName: agreementRecord.original_name,

    localFilePath: agreementFilePath,

    docPassword: agreementRecord.doc_password || null,

    fileSizeBytes: agreementBuffer.length,
  };
}

/* =========================================================
   MAIN SERVICE METHOD
========================================================= */

async function sendWelcomeLetterAfterUtrUpload({ lan, utrNumber }) {
  const startedAt = Date.now();

  const normalizedLan = safeString(lan).toUpperCase();

  const normalizedUtrNumber = safeString(utrNumber);

  console.log("[WELCOME_LETTER_START]", {
    lan: normalizedLan,
    utrNumber: normalizedUtrNumber,
  });

  try {
    if (!normalizedLan) {
      throw createServiceError("LAN is required.", "LAN_REQUIRED");
    }

    if (!normalizedUtrNumber) {
      throw createServiceError("UTR number is required.", "UTR_REQUIRED");
    }

    /*
     * Step 1:
     * Resolve partner table from LAN.
     */
    const route = resolvePartnerByLan(normalizedLan);

    console.log("[WELCOME_LETTER_ROUTE_RESOLVED]", route);

    /*
     * Step 2:
     * Fetch only fields required by template.
     */
    const [loanRecord, firstEmiDueDate] = await Promise.all([
      getRequiredLoanData(route),
      getFirstEmiDueDate(route),
    ]);

    if (hasValue(firstEmiDueDate)) {
      loanRecord.emi_due_date = firstEmiDueDate;
    }

    console.log("[WELCOME_LETTER_FINAL_EMI_DATE]", {
      lan: route.lan,
      rpsTable: route.rpsTable,
      emiDueDate: loanRecord.emi_due_date || null,
    });

    /*
     * Step 3:
     * Validate email fetched from loan table.
     */
    validateCustomerEmail(loanRecord.email_id, route.lan);

    console.log("[WELCOME_LETTER_LOAN_DATA_FETCHED]", {
      lan: route.lan,
      table: route.table,

      borrowerNameFound: hasValue(loanRecord.borrower_name),

      recipient: maskEmail(loanRecord.email_id),
    });

    /*
     * Step 4:
     * Prepare exact {{VARIABLES}} used
     * in the HTML template.
     */
    let templateData = prepareTemplateData(loanRecord, route);

    templateData = validateTemplateData(templateData, route.lan);

    const { templateHtml, logoPath, logoExists } = await loadWelcomeTemplate();

    const completedHtml = compileWelcomeLetterHtml(
      templateHtml,
      templateData,
      false,
    );

    console.log("[WELCOME_LETTER_TEMPLATE_COMPILED]", {
      lan: route.lan,
    });

    const pdfBuffer = await generateWelcomeLetterPdf({
      completedHtml,
      logoPath,
      logoExists,
      lan: route.lan,
    });

    const loanAgreement = await getLoanAgreementDocument(route.lan);

    console.log("[WELCOME_LETTER_ATTACHMENTS_READY]", {
      lan: route.lan,
      welcomeLetterSizeBytes: pdfBuffer.length,
      agreementFileName: loanAgreement.attachmentFileName,
      agreementSizeBytes: loanAgreement.fileSizeBytes,
    });

    /*
     * Step 7:
     * Send the HTML email.
     */
    const subject = `Welcome to Fintree Finance Private Limited - LAN: ${route.lan}`;

    console.log("[WELCOME_LETTER_EMAIL_SENDING]", {
      lan: route.lan,

      recipient: maskEmail(loanRecord.email_id),

      subject,
    });

    const pdfFileName = `Fintree_Welcome_Letter_${route.lan}.pdf`;
    console.log("[WELCOME_LETTER_EMAIL_SENDING]", {
      lan: route.lan,
      recipient: maskEmail(loanRecord.email_id),
      subject,
      attachment: pdfFileName,
      pdfSizeBytes: pdfBuffer.length,
    });
    const mailResult = await getTransporter().sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: safeString(loanRecord.email_id),
      subject,
      html: `
  <div
    style="
      font-family: Arial, Helvetica, sans-serif;
      color: #1e293b;
      line-height: 1.6;
    "
  >
    <p>
      Dear ${escapeHtml(
        templateData.BORROWER_NAME,
      )},
    </p>

    <p>
      Welcome to Fintree Finance Private Limited.
    </p>

    <p>
      Please find the following documents attached
      for Loan Account Number
      <strong>${escapeHtml(
        route.lan,
      )}</strong>:
    </p>

    <ol>
      <li>Welcome Letter</li>
      <li>Loan Agreement</li>
    </ol>

    <p>
      Kindly retain these documents for your records.
    </p>

    <p>
      Warm Regards,<br>
      <strong>
        Fintree Finance Private Limited
      </strong>
    </p>
  </div>
`,
      attachments: [
        /*
         * Generated welcome letter.
         */
        {
          filename: `Fintree_Welcome_Letter_${route.lan}.pdf`,

          content: pdfBuffer,

          contentType: "application/pdf",

          contentDisposition: "attachment",
        },

        /*
         * Existing loan agreement fetched from
         * loan_documents and Backend/uploads.
         */
        {
          filename: loanAgreement.attachmentFileName,

          content: loanAgreement.buffer,

          contentType: "application/pdf",

          contentDisposition: "attachment",
        },
      ],

      headers: {
        "X-Fintree-LAN": route.lan,
        "X-Fintree-UTR": normalizedUtrNumber,
        "X-Fintree-Partner-Table": route.table,
      },
    });

   const response = {
  success: true,

  message:
    "Welcome letter and loan agreement sent successfully.",

  timestamp:
    new Date().toISOString(),

  lan:
    route.lan,

  utrNumber:
    normalizedUtrNumber,

  recipient:
    safeString(
      loanRecord.email_id,
    ),

  partnerPrefix:
    route.prefix,

  partnerTable:
    route.table,

  emailMessageId:
    mailResult.messageId,

  attachments: {
    welcomeLetter: {
      fileName:
        pdfFileName,
      sizeBytes:
        pdfBuffer.length,
    },

    loanAgreement: {
      documentId:
        loanAgreement.documentId,
      fileName:
        loanAgreement.attachmentFileName,
      sizeBytes:
        loanAgreement.fileSizeBytes,
      passwordProtected:
        hasValue(
          loanAgreement.docPassword,
        ),
    },
  },

  accepted:
    mailResult.accepted || [],

  rejected:
    mailResult.rejected || [],

  executionTimeMs:
    Date.now() - startedAt,
};

    console.log("[WELCOME_LETTER_SUCCESS]", {
      ...response,

      recipient: maskEmail(response.recipient),
    });

    return response;
  } catch (error) {
    console.error("[WELCOME_LETTER_FAILED]", {
      timestamp: new Date().toISOString(),

      lan: normalizedLan,

      utrNumber: normalizedUtrNumber,

      errorCode: error.code || "WELCOME_LETTER_FAILED",

      errorMessage: error.message,

      executionTimeMs: Date.now() - startedAt,
    });

    throw error;
  }
}

module.exports = {
  sendWelcomeLetterAfterUtrUpload,

  /*
   * Exports useful for testing.
   */
  resolvePartnerByLan,
  getRequiredLoanData,
  prepareTemplateData,
  compileWelcomeLetterHtml,
};
