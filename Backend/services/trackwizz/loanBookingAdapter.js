// /**
//  * Multi-partner adapter: any partner's loan-booking row → canonical lead
//  * object for payloadBuilder.
//  *
//  * DESIGN
//  * ------
//  * Everything downstream of this file (payloadBuilder → AS504 client →
//  * decisioning) is partner-agnostic. Adding a new partner = adding ONE
//  * entry to PARTNERS below. No other file changes.
//  *
//  * Each partner entry declares:
//  *   table        — the partner's loan-booking table (must be listed here,
//  *                  never taken from user input — table names cannot be
//  *                  SQL-parameterized, so the registry IS the whitelist)
//  *   columns      — partner column name → canonical field name
//  *   codeFields   — precedence list for sourceSystemCustomerCode
//  *
//  * All normalization (mobile/PAN/DOB/email/gender) is shared — partners
//  * differ in COLUMN NAMES, not in what a valid PAN looks like.
//  */
// const pool = require('../../config/db');

// /* ────────────────────────── shared normalizers ───────────────────────── */

// const GENDER_MAP = {
//   male: '01', m: '01',
//   female: '02', f: '02',
//   // transgender: '03', other: '03', t: '03',
// };

// function mapGender(value) {
//   if (!value) return '';
//   return GENDER_MAP[String(value).trim().toLowerCase()] || '';
// }

// function normalizeMobile(raw) {
//   if (!raw) return '';
//   const digits = String(raw).replace(/\D/g, '').slice(-10);
//   return /^[6-9]\d{9}$/.test(digits) ? digits : '';
// }

// function normalizePan(raw) {
//   if (!raw) return '';
//   const pan = String(raw).toUpperCase().trim();
//   return /^[A-Z]{5}\d{4}[A-Z]$/.test(pan) ? pan : '';
// }

// const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
// function toTwDate(value) {
//   if (!value) return '';
//   const d = value instanceof Date ? value : new Date(String(value));
//   if (Number.isNaN(d.getTime())) return '';
//   const dd = String(d.getDate()).padStart(2, '0');
//   return `${dd}-${MONTHS[d.getMonth()]}-${d.getFullYear()}`;
// }

// /* ─────────────────────────── partner registry ─────────────────────────── */
// /**
//  * Canonical field names every partner maps INTO:
//  *   name, fatherName, pan, mobile, email, dob, gender, createdAt
//  * plus codeFields for the customer code precedence.
//  *
//  * To onboard a new partner: copy a block, fix table + column names, done.
//  */
// const PARTNERS = {
//   switch_my_loan: {
//     table: 'loan_booking_switch_my_loan',
//     codeFields: ['lan','application_id', 'partner_loan_id'],
//     columns: {
//       lan:"lan",
//       name: 'customer_name',
//       fatherName: 'father_name',
//       pan: 'pan_number',
//       mobile: 'mobile',
//       email: 'email',
//       dob: 'dob',
//       gender: 'gender',
//       createdAt: 'created_at',
//       applicationRefNumber: 'application_id',
//     },
//   },

//   // ── template for the next partner ──
//   // partner_two: {
//   //   table: 'loan_booking_partner_two',
//   //   codeFields: ['app_ref_no', 'loan_no'],
//   //   columns: {
//   //     name: 'applicant_name',
//   //     fatherName: 'father_name',
//   //     pan: 'pan',
//   //     mobile: 'mobile_no',
//   //     email: 'email_id',
//   //     dob: 'date_of_birth',
//   //     gender: 'gender',
//   //     createdAt: 'created_on',
//   //     applicationRefNumber: 'app_ref_no',
//   //   },
//   // },
// };

// /* ─────────────────────────── generic mapping ──────────────────────────── */

// function getPartnerConfig(partnerKey) {
//   const cfg = PARTNERS[partnerKey];
//   if (!cfg) {
//     const err = new Error(
//       `Unknown partner "${partnerKey}". Registered: ${Object.keys(PARTNERS).join(', ')}`
//     );
//     err.code = 'UNKNOWN_PARTNER';
//     throw err;
//   }
//   return cfg;
// }

// /** Map a raw DB row to the canonical lead, using the partner's column map. */
// function mapRowToLead(row, partnerKey) {
//   const cfg = getPartnerConfig(partnerKey);
//   const col = (name) => (cfg.columns[name] ? row[cfg.columns[name]] : undefined);

//   // customerCode: first non-empty of the partner's precedence list,
//   // prefixed with the partner key so codes can never collide across
//   // partners in your logs / audit trail (and stay unique if you ever
//   // move to purpose 04, where sourceSystemCustomerCode becomes the
//   // stored identity key in TrackWizz).
//   const rawCode =
//     cfg.codeFields.map((f) => row[f]).find((v) => v != null && v !== '') ||
//     `LEAD${row.id}`;
//   const customerCode = `${partnerKey.toUpperCase()}-${rawCode}`;

//   const lead = {
//     partner: partnerKey,
//     leadId: row.id,
//     lan: col('lan') ? String(col('lan')).trim() : '',
//     customerCode,
//     applicationRefNumber: col('applicationRefNumber') || '',

//     fullName: col('name') ? String(col('name')).trim() : '',
//     fatherName: col('fatherName') ? String(col('fatherName')).trim() : '',
//     pan: normalizePan(col('pan')),
//     mobile: normalizeMobile(col('mobile')),
//     email: col('email') ? String(col('email')).trim().toLowerCase() : '',
//     dob: toTwDate(col('dob')),
//     gender: mapGender(col('gender')),
//     createdAt: col('createdAt'),
//   };

//   // Identity pre-flight (VS45 guard) — fail closed before spending an
//   // API call. Caller must route this to manual review, never auto-pass.
//   if (!lead.fullName && !lead.pan && !lead.mobile && !lead.email) {
//     const err = new Error(
//       `[${partnerKey}] lead ${lead.leadId}: no screenable identity field after normalization`
//     );
//     err.code = 'NO_IDENTITY_FIELD';
//     throw err;
//   }

//   return lead;
// }

// /** Fetch a booking row by id for a given partner and map it. */
// async function getLeadById(partnerKey, loanId) {
//   const cfg = getPartnerConfig(partnerKey);

//   // Table name comes from the registry (whitelist), id is parameterized.
//   const wanted = ['id', ...cfg.codeFields, ...Object.values(cfg.columns)];
//   const selectCols = [...new Set(wanted)].map((c) => `\`${c}\``).join(', ');

//   const [rows] = await pool.execute(
//     `SELECT ${selectCols} FROM \`${cfg.table}\` WHERE id = ?`,
//     [loanId]
//   );
//   if (!rows.length) {
//     const err = new Error(`[${partnerKey}] booking ${loanId} not found in ${cfg.table}`);
//     err.code = 'LEAD_NOT_FOUND';
//     throw err;
//   }
//   return mapRowToLead(rows[0], partnerKey);
// }

// /**
//  * Main business lookup using LAN.
//  */
// async function getLeadByLan(partnerKey, lan) {
//   const cfg = getPartnerConfig(partnerKey);
//   const normalizedLan = String(lan || '').trim();

//   if (!normalizedLan) {
//     const err = new Error('LAN is required');
//     err.code = 'INVALID_LAN';
//     throw err;
//   }

//   const selectCols = getSelectColumns(cfg);

//   const [rows] = await pool.execute(
//     `
//       SELECT ${selectCols}
//       FROM \`${cfg.table}\`
//       WHERE \`lan\` = ?
//       LIMIT 2
//     `,
//     [normalizedLan]
//   );

//   if (!rows.length) {
//     const err = new Error(
//       `[${partnerKey}] LAN "${normalizedLan}" not found in ${cfg.table}`
//     );

//     err.code = 'LEAD_NOT_FOUND';
//     err.lan = normalizedLan;
//     throw err;
//   }

//   if (rows.length > 1) {
//     const err = new Error(
//       `[${partnerKey}] multiple records found for LAN "${normalizedLan}"`
//     );

//     err.code = 'DUPLICATE_LAN';
//     err.lan = normalizedLan;
//     throw err;
//   }

//   return mapRowToLead(rows[0], partnerKey);
// }

// module.exports = {
//   getLeadByLan,
//   getLeadById,
//   mapRowToLead,
//   getPartnerConfig,
//   PARTNERS,
//   // exported for unit tests
//   mapGender,
//   normalizeMobile,
//   normalizePan,
//   toTwDate,
// };

/**
 * Multi-partner adapter:
 * Partner loan-booking row → canonical lead object.
 */
const pool = require("../../config/db").promise();

/* ───────────────────────── Shared normalizers ───────────────────────── */

const GENDER_MAP = {
  male: "01",
  m: "01",

  female: "02",
  f: "02",

  transgender: "03",
  trans: "03",
  t: "03",
};

function normalizeText(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function mapGender(value) {
  const normalized = normalizeText(value).toLowerCase();

  if (!normalized) {
    return "";
  }

  return GENDER_MAP[normalized] || "";
}

function normalizeMobile(raw) {
  if (!raw) {
    return "";
  }

  const digits = String(raw).replace(/\D/g, "").slice(-10);

  return /^[6-9]\d{9}$/.test(digits) ? digits : "";
}

function normalizePan(raw) {
  if (!raw) {
    return "";
  }

  const pan = String(raw).toUpperCase().trim();

  return /^[A-Z]{5}\d{4}[A-Z]$/.test(pan) ? pan : "";
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

// function toTwDate(value) {
//   if (!value) {
//     return "";
//   }

//   // Already formatted for TrackWizz.
//   const raw = String(value).trim();

//   if (
//     /^(0[1-9]|[12]\d|3[01])-(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-\d{4}$/.test(
//       raw,
//     )
//   ) {
//     return raw;
//   }

//   const date = value instanceof Date ? value : new Date(raw);

//   if (Number.isNaN(date.getTime())) {
//     return "";
//   }

//   const day = String(date.getDate()).padStart(2, "0");

//   return `${day}-${MONTHS[date.getMonth()]}-${date.getFullYear()}`;
// }

function toTwDate(value) {
  if (!value) return "";

  const raw = String(value).trim();

  // Already TrackWizz format
  if (
    /^(0[1-9]|[12]\d|3[01])-(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-\d{4}$/.test(
      raw,
    )
  ) {
    return raw;
  }

  // DD-MM-YYYY or DD/MM/YYYY (Indian format)
  const m = raw.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
  if (m) {
    const [, dd, mm, yyyy] = m;
    if (+mm >= 1 && +mm <= 12 && +dd >= 1 && +dd <= 31) {
      return `${dd}-${MONTHS[+mm - 1]}-${yyyy}`;
    }
    return "";
  }

  const date = value instanceof Date ? value : new Date(raw);
  if (Number.isNaN(date.getTime())) return "";

  const day = String(date.getDate()).padStart(2, "0");
  return `${day}-${MONTHS[date.getMonth()]}-${date.getFullYear()}`;
}

/* ───────────────────────── Partner registry ───────────────────────── */

/**
 * Mapping direction:
 *
 * canonical field name → partner database column name
 */
const PARTNERS = {
  switch_my_loan: {
    table: "loan_booking_switch_my_loan",
    primaryKey: "id",
    // Database columns, in customer-code priority order.
    codeFields: ["lan", "partner_loan_id"],

    columns: {
      lan: "lan",
      name: "customer_name",
      fatherName: "father_name",
      pan: "pan_number",
      mobile: "mobile",
      email: "email",
      dob: "dob",
      gender: "gender",
      createdAt: "created_at",
      applicationRefNumber: "partner_loan_id",
    },

    amlColumns: {
      status: "aml_status",
      score: "aml_score",
      totalMatches: "aml_total_matches",
      reason: "aml_reason",
      apiResponse: "aml_api_response",
      checkedAt: "aml_checked_at",
    },
  },

  clayyo: {
    table: "loan_booking_clayyo",
    primaryKey: "id",
    codeFields: ["lan", "app_id"], // adjust if clayyo has application_id etc.
    columns: {
      lan: "lan",
      name: "customer_name", // ← match your actual clayyo column names
      fatherName: "father_name",
      pan: "pan_number",
      mobile: "mobile_number",
      email: "email_id",
      dob: "dob",
      gender: "gender",
      createdAt: "created_at",
      applicationRefNumber: "app_id",
    },
    amlColumns: {
      status: "aml_status",
      score: "aml_score",
      totalMatches: "aml_total_matches",
      reason: "aml_reason",
      apiResponse: "aml_api_response",
      checkedAt: "aml_checked_at",
    },
  },

  loan_digit: {
  table: "loan_booking_loan_digit",
  primaryKey: "id",
  codeFields: ["lan", "partner_loan_id"], // adjust if loan_digit has application_id etc.
  columns: {
    lan: "lan",
    name: "customer_name",      // ← verify actual column names in loan_booking_loan_digit
    pan: "pan_number",
    mobile: "mobile_number",
    dob: "dob",
    gender: "gender",
    createdAt: "created_at",
    applicationRefNumber: "partner_loan_id",
  },
  amlColumns: {
    status: "aml_status",
    score: "aml_score",
    totalMatches: "aml_total_matches",
    reason: "aml_reason",
    apiResponse: "aml_api_response",
    checkedAt: "aml_checked_at",
  },
},

};

/* ───────────────────────── Configuration helpers ───────────────────────── */

function getPartnerConfig(partnerKey) {
  const cfg = PARTNERS[partnerKey];

  if (!cfg) {
    const err = new Error(
      `Unknown partner "${partnerKey}". Registered: ${
        Object.keys(PARTNERS).join(", ") || "none"
      }`,
    );

    err.code = "UNKNOWN_PARTNER";
    throw err;
  }

  return cfg;
}

/**
 * Identifiers cannot be SQL-parameterized.
 * They are still validated even though they come from the registry.
 */
function quoteIdentifier(identifier) {
  if (!/^[A-Za-z0-9_]+$/.test(identifier)) {
    const err = new Error(`Invalid SQL identifier "${identifier}"`);

    err.code = "INVALID_SQL_IDENTIFIER";
    throw err;
  }

  return `\`${identifier}\``;
}

/**
 * Return all columns needed for mapping a database row.
 */
function getSelectColumns(cfg) {
  const wanted = [
    cfg.primaryKey || "id",
    ...cfg.codeFields,
    ...Object.values(cfg.columns),
  ];

  return [...new Set(wanted)].map(quoteIdentifier).join(", ");
}

/* ───────────────────────── Generic mapping ───────────────────────── */

function mapRowToLead(row, partnerKey) {
  if (!row || typeof row !== "object") {
    const err = new Error(`[${partnerKey}] valid database row is required`);

    err.code = "INVALID_DB_ROW";
    throw err;
  }

  const cfg = getPartnerConfig(partnerKey);

  const col = (canonicalField) => {
    const databaseColumn = cfg.columns[canonicalField];

    return databaseColumn ? row[databaseColumn] : undefined;
  };

  const rawCode = cfg.codeFields
    .map((databaseColumn) => normalizeText(row[databaseColumn]))
    .find(Boolean);

  const fallbackCode = row.id ? `LEAD${row.id}` : "LEAD-UNKNOWN";

  const customerCode = `${partnerKey.toUpperCase()}-${rawCode || fallbackCode}`;

  const lead = {
    partner: partnerKey,

    // Internal database primary key.
    leadId: row.id,

    // Main business lookup key.
    lan: normalizeText(col("lan")),

    customerCode,

    applicationRefNumber: normalizeText(col("applicationRefNumber")),

    fullName: normalizeText(col("name")),

    fatherName: normalizeText(col("fatherName")),

    pan: normalizePan(col("pan")),

    mobile: normalizeMobile(col("mobile")),

    email: normalizeText(col("email")).toLowerCase(),

    dob: toTwDate(col("dob")),

    gender: mapGender(col("gender")),

    createdAt: col("createdAt") || null,
  };

  if (!lead.fullName && !lead.pan && !lead.mobile && !lead.email) {
    const err = new Error(
      `[${partnerKey}] lead ${lead.leadId}: ` +
        "no screenable identity field after normalization",
    );

    err.code = "NO_IDENTITY_FIELD";
    err.leadId = lead.leadId;
    err.lan = lead.lan;

    throw err;
  }

  return lead;
}

/* ───────────────────────── Database lookups ───────────────────────── */

/**
 * Internal lookup using the table's primary key.
 */
async function getLeadById(partnerKey, loanId) {
  const cfg = getPartnerConfig(partnerKey);
  const selectCols = getSelectColumns(cfg);
  const table = quoteIdentifier(cfg.table);

  if (
    loanId === null ||
    loanId === undefined ||
    !/^\d+$/.test(String(loanId))
  ) {
    const err = new Error(`[${partnerKey}] valid numeric loan ID is required`);

    err.code = "INVALID_LOAN_ID";
    throw err;
  }

  const [rows] = await pool.execute(
    `
      SELECT ${selectCols}
      FROM ${table}
      WHERE \`id\` = ?
      LIMIT 1
    `,
    [loanId],
  );

  if (!rows.length) {
    const err = new Error(
      `[${partnerKey}] booking ID "${loanId}" ` + `not found in ${cfg.table}`,
    );

    err.code = "LEAD_NOT_FOUND";
    err.loanId = loanId;

    throw err;
  }

  return mapRowToLead(rows[0], partnerKey);
}

/**
 * Main business lookup using LAN.
 */
async function getLeadByLan(partnerKey, lan) {
  const cfg = getPartnerConfig(partnerKey);
  const normalizedLan = normalizeText(lan);

  if (!normalizedLan) {
    const err = new Error("LAN is required");

    err.code = "INVALID_LAN";
    throw err;
  }

  const lanColumn = cfg.columns.lan;

  if (!lanColumn) {
    const err = new Error(`[${partnerKey}] LAN column is not configured`);

    err.code = "LAN_COLUMN_NOT_CONFIGURED";
    throw err;
  }

  const selectCols = getSelectColumns(cfg);
  const table = quoteIdentifier(cfg.table);
  const quotedLanColumn = quoteIdentifier(lanColumn);

  const [rows] = await pool.execute(
    `
      SELECT ${selectCols}
      FROM ${table}
      WHERE ${quotedLanColumn} = ?
      LIMIT 2
    `,
    [normalizedLan],
  );

  if (!rows.length) {
    const err = new Error(
      `[${partnerKey}] LAN "${normalizedLan}" ` + `not found in ${cfg.table}`,
    );

    err.code = "LEAD_NOT_FOUND";
    err.lan = normalizedLan;

    throw err;
  }

  if (rows.length > 1) {
    const err = new Error(
      `[${partnerKey}] multiple records found ` + `for LAN "${normalizedLan}"`,
    );

    err.code = "DUPLICATE_LAN";
    err.lan = normalizedLan;

    throw err;
  }

  return mapRowToLead(rows[0], partnerKey);
}

module.exports = {
  getLeadByLan,
  getLeadById,
  mapRowToLead,
  getPartnerConfig,
  getSelectColumns,
  PARTNERS,

  // Exported for unit tests.
  mapGender,
  normalizeMobile,
  normalizePan,
  normalizeText,
  toTwDate,
};
