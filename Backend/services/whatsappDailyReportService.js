/**
 * whatsappDailyReportService.js
 *
 * Core service for generating and dispatching the daily WhatsApp partner-wise
 * DISBURSED CASE COUNT report.
 *
 * Features:
 *  - Strict actual disbursement date filtering (00:00:00 to 23:59:59 Asia/Kolkata).
 *  - Unique LAN deduplication (each LAN counted strictly ONCE).
 *  - Partner-wise grouping using canonical LMS mappings.
 *  - Grand total calculation matching unique LANs.
 *  - Professional two-sheet Excel generation (Summary + Disbursed Case Details).
 *  - WhatsApp Business Cloud API / Alots.io integration (Upload Media + Send 'countofcase' template).
 *  - Duplicate prevention tracking in database (report date + report type).
 *  - Manual resend and test mode support.
 *  - Redacted and safe logging (no credentials or access tokens exposed).
 */

"use strict";

const fs = require("fs");
const path = require("path");
const ExcelJS = require("exceljs");
const sharp = require("sharp");
const db = require("../config/db");
const {
  getWhatsAppConfig,
  formatWhatsAppNumber,
  maskPhoneNumber,
  uploadWhatsAppDocument,
  sendDocumentTemplateMessage,
  uploadWhatsAppImage,
  sendImageTemplateMessage,
  redactSecrets,
} = require("./whatsappService");

const REPORT_TYPE = "PARTNER_DISBURSEMENT_CASE_COUNT";
const IMAGE_REPORT_TYPE = "PARTNER_DISBURSEMENT_IMAGE";
const reportsDir = path.join(__dirname, "../reports");
if (!fs.existsSync(reportsDir)) {
  fs.mkdirSync(reportsDir, { recursive: true });
}

/**
 * Prefix-to-Partner canonical mapping table, derived from existing LMS logic
 * in DisbursalRoutes.js, loanBookingSummaryRoutes.js, dashboardService.js,
 * and partnerLimitRoutes.js.
 *
 * Specific/longer prefixes appear before general prefixes to prevent false matches.
 */
const PREFIX_PARTNER_RULES = [
  // Length >= 7
  { prefix: "WCTLFFPL", partner: "WCTL FFPL" },
  { prefix: "SAMPADA", partner: "Sampada" },
  // Length 6
  { prefix: "CIRHUF", partner: "CirclePe Houser" },
  { prefix: "CIRCLE", partner: "CirclePe" },
  // Length 5
  { prefix: "FINE2", partner: "EMI Club 2" },
  { prefix: "HEYBF", partner: "Hey EV Battery" },
  { prefix: "HEYEV", partner: "Hey EV" },
  { prefix: "GQFSF", partner: "GQ FSF" },
  { prefix: "GQNF", partner: "GQ Non-FSF" },
  // Length 4
  { prefix: "CARE", partner: "Carepay" },
  { prefix: "FINE", partner: "EMI Club" },
  { prefix: "EMIC", partner: "EMI Club" },
  { prefix: "FINS", partner: "Finso" },
  { prefix: "CIRF", partner: "CirclePe" },
  { prefix: "UBLF", partner: "Sterlion UBL" },
  { prefix: "WCTL", partner: "WCTL" },
  { prefix: "ZYPF", partner: "ZyPay" },
  { prefix: "ADKF", partner: "Adikosh" },
  // Length 3
  { prefix: "YAM", partner: "YA Money" },
  { prefix: "CCB", partner: "Claim Cure Buddy" },
  { prefix: "SEV", partner: "Seven Fincorp" },
  { prefix: "SFL", partner: "Seven Fincorp" },
  { prefix: "RML", partner: "Rapid Money" },
  { prefix: "QML", partner: "Quick Money" },
  { prefix: "SPL", partner: "Sampada" },
  { prefix: "MCL", partner: "Motion Corp" },
  { prefix: "MOT", partner: "Motion Corp" },
  { prefix: "LDF", partner: "Loan Digit" },
  { prefix: "BUN", partner: "Bundela" },
  { prefix: "ZEB", partner: "Zebrs" },
  { prefix: "ZBR", partner: "Zebrs" },
  { prefix: "HEL", partner: "Helium" },
  { prefix: "CLY", partner: "Clayoo" },
  { prefix: "HEY", partner: "Hey EV" },
  { prefix: "GQF", partner: "GQ FSF" },
  { prefix: "GQN", partner: "GQ Non-FSF" },
  { prefix: "E10", partner: "Embifi" },
  { prefix: "EMB", partner: "Embifi" },
  { prefix: "SBR", partner: "Sabgrow" },
  { prefix: "ADK", partner: "Adikosh" },
  { prefix: "ADP", partner: "Adikosh" },
  { prefix: "CIR", partner: "CirclePe" },
  { prefix: "FIN", partner: "Finso" },
  // Length 2
  { prefix: "SW", partner: "Saswat" },
  { prefix: "SH", partner: "SRBH" },
  { prefix: "EV", partner: "EV Loan" },
  { prefix: "BL", partner: "BL Loan" },
  { prefix: "E1", partner: "Embifi" },
];

/**
 * Mapping table from LAN prefixes to their underlying loan booking tables and amount columns.
 */
const PARTNER_TABLE_CONFIGS = [
  { prefix: "WCTLFFPL", partner: "WCTL FFPL", table: "loan_booking_wctl_ffpl", loanCol: "loan_amount", disbCol: "loan_amount" },
  { prefix: "SAMPADA", partner: "Sampada", table: "loan_booking_sampada", loanCol: "loan_amount", disbCol: "disbursal_amount" },
  { prefix: "CIRHUF", partner: "CirclePe Houser", table: "loan_booking_circle_pe_houser", loanCol: "loan_amount", disbCol: "net_disbursement" },
  { prefix: "CIRCLE", partner: "CirclePe", table: "loan_booking_circle_pe", loanCol: "loan_amount", disbCol: "net_disbursement" },
  { prefix: "FINE2", partner: "EMI Club 2", table: "loan_booking_emiclub2", loanCol: "loan_amount", disbCol: "net_disbursement" },
  { prefix: "HEYBF", partner: "Hey EV Battery", table: "loan_booking_hey_ev_battery", loanCol: "loan_amount", disbCol: "disbursement_amount" },
  { prefix: "HEYEV", partner: "Hey EV", table: "loan_booking_hey_ev", loanCol: "loan_amount", disbCol: "disbursement_amount" },
  { prefix: "GQFSF", partner: "GQ FSF", table: "loan_booking_gq_fsf", loanCol: "loan_amount", disbCol: "disbursal_amount" },
  { prefix: "GQNF", partner: "GQ Non-FSF", table: "loan_booking_gq_non_fsf", loanCol: "loan_amount", disbCol: "disbursal_amount" },
  { prefix: "CARE", partner: "Carepay", table: "loan_booking_carepay", loanCol: "loan_amount", disbCol: "net_disbursement" },
  { prefix: "FINE", partner: "EMI Club", table: "loan_booking_emiclub", loanCol: "loan_amount", disbCol: "net_disbursement" },
  { prefix: "EMIC", partner: "EMI Club", table: "loan_booking_emiclub", loanCol: "loan_amount", disbCol: "net_disbursement" },
  { prefix: "FINS", partner: "Finso", table: "loan_booking_finso", loanCol: "loan_amount", disbCol: "disbursal_amount" },
  { prefix: "CIRF", partner: "CirclePe", table: "loan_booking_circle_pe", loanCol: "loan_amount", disbCol: "net_disbursement" },
  { prefix: "UBLF", partner: "Sterlion UBL", table: "loan_booking_sterlion_ubl", loanCol: "loan_amount", disbCol: "loan_amount" },
  { prefix: "WCTL", partner: "WCTL", table: "loan_bookings_wctl", loanCol: "loan_amount", disbCol: "loan_amount" },
  { prefix: "ADKF", partner: "Adikosh", table: "loan_booking_adikosh", loanCol: "loan_amount", disbCol: "net_disbursement" },
  { prefix: "YAM", partner: "YA Money", table: "loan_booking_ya_money", loanCol: "loan_amount", disbCol: "net_disbursement" },
  { prefix: "CCB", partner: "Claim Cure Buddy", table: "loan_booking_claim_cure_buddy", loanCol: "loan_amount", disbCol: "disbursal_amount" },
  { prefix: "SEV", partner: "Seven Fincorp", table: "loan_booking_seven_fincorp", loanCol: "loan_amount", disbCol: "disbursal_amount" },
  { prefix: "SFL", partner: "Seven Fincorp", table: "loan_booking_seven_fincorp", loanCol: "loan_amount", disbCol: "disbursal_amount" },
  { prefix: "RML", partner: "Rapid Money", table: "loan_booking_switch_my_loan", loanCol: "loan_amount", disbCol: "disbursal_amount" },
  { prefix: "QML", partner: "Quick Money", table: "loan_booking_quick_money", loanCol: "loan_amount", disbCol: "disbursal_amount" },
  { prefix: "SPL", partner: "Sampada", table: "loan_booking_sampada", loanCol: "loan_amount", disbCol: "disbursal_amount" },
  { prefix: "MCL", partner: "Motion Corp", table: "loan_booking_motion_corp", loanCol: "loan_amount", disbCol: "disbursal_amount" },
  { prefix: "MOT", partner: "Motion Corp", table: "loan_booking_motion_corp", loanCol: "loan_amount", disbCol: "disbursal_amount" },
  { prefix: "LDF", partner: "Loan Digit", table: "loan_booking_loan_digit", loanCol: "loan_amount", disbCol: "net_disbursement_amount" },
  { prefix: "BUN", partner: "Bundela", table: "loan_booking_bundela", loanCol: "loan_amount", disbCol: "disbursal_amount" },
  { prefix: "ZEB", partner: "Zebrs", table: "loan_booking_zebrs", loanCol: "loan_amount", disbCol: "disbursal_amount" },
  { prefix: "ZBR", partner: "Zebrs", table: "loan_booking_zebrs", loanCol: "loan_amount", disbCol: "disbursal_amount" },
  { prefix: "HEL", partner: "Helium", table: "loan_booking_helium", loanCol: "loan_amount", disbCol: "net_disbursement" },
  { prefix: "CLY", partner: "Clayoo", table: "loan_booking_clayyo", loanCol: "loan_amount", disbCol: "loan_amount" },
  { prefix: "HEY", partner: "Hey EV", table: "loan_booking_hey_ev", loanCol: "loan_amount", disbCol: "disbursement_amount" },
  { prefix: "GQF", partner: "GQ FSF", table: "loan_booking_gq_fsf", loanCol: "loan_amount", disbCol: "disbursal_amount" },
  { prefix: "GQN", partner: "GQ Non-FSF", table: "loan_booking_gq_non_fsf", loanCol: "loan_amount", disbCol: "disbursal_amount" },
  { prefix: "E10", partner: "Embifi", table: "loan_booking_embifi", loanCol: "approved_loan_amount", disbCol: "disbursal_amount" },
  { prefix: "EMB", partner: "Embifi", table: "loan_booking_embifi", loanCol: "approved_loan_amount", disbCol: "disbursal_amount" },
  { prefix: "SBR", partner: "Sabgrow", table: "loan_booking_sabgrow", loanCol: "loan_amount", disbCol: "loan_amount" },
  { prefix: "ADK", partner: "Adikosh", table: "loan_booking_adikosh", loanCol: "loan_amount", disbCol: "net_disbursement" },
  { prefix: "ADP", partner: "Adikosh", table: "loan_booking_adikosh", loanCol: "loan_amount", disbCol: "net_disbursement" },
  { prefix: "CIR", partner: "CirclePe", table: "loan_booking_circle_pe", loanCol: "loan_amount", disbCol: "net_disbursement" },
  { prefix: "FIN", partner: "Finso", table: "loan_booking_finso", loanCol: "loan_amount", disbCol: "disbursal_amount" },
  { prefix: "SW", partner: "Saswat", table: "loan_booking_saswat", loanCol: "loan_amount", disbCol: "net_disbursement" },
  { prefix: "SH", partner: "SRBH", table: "loan_booking_srbh", loanCol: "loan_amount", disbCol: "disbursal_amount" },
  { prefix: "EV", partner: "EV Loan", table: "loan_booking_ev", loanCol: "loan_amount", disbCol: "disbursal_amount" },
  { prefix: "E1", partner: "Embifi", table: "loan_booking_embifi", loanCol: "approved_loan_amount", disbCol: "disbursal_amount" },
];

/**
 * Bulk fetch loan_amount and disbursal_amount for all unique LANs across partner tables.
 *
 * @param {Map<string, object>} uniqueLanMap
 */
async function attachLoanAndDisbursalAmounts(uniqueLanMap) {
  if (!uniqueLanMap || uniqueLanMap.size === 0) return;

  const tableGroups = new Map();

  for (const [normKey, item] of uniqueLanMap.entries()) {
    let matchedConfig = null;
    for (const cfg of PARTNER_TABLE_CONFIGS) {
      if (normKey.startsWith(cfg.prefix.toUpperCase())) {
        matchedConfig = cfg;
        break;
      }
    }

    if (matchedConfig) {
      if (!tableGroups.has(matchedConfig)) {
        tableGroups.set(matchedConfig, []);
      }
      tableGroups.get(matchedConfig).push(item.lan);
    }
  }

  const queryPromises = Array.from(tableGroups.entries()).map(async ([cfg, lans]) => {
    const chunkSize = 500;
    for (let i = 0; i < lans.length; i += chunkSize) {
      const chunk = lans.slice(i, i + chunkSize);
      try {
        const [rows] = await db.promise().query(
          `SELECT lan, ${cfg.loanCol} AS loan_amount, ${cfg.disbCol} AS disbursal_amount FROM \`${cfg.table}\` WHERE lan IN (?)`,
          [chunk]
        );
        for (const row of rows) {
          const key = String(row.lan || "").trim().toUpperCase();
          if (uniqueLanMap.has(key)) {
            const entry = uniqueLanMap.get(key);
            entry.loanAmount = parseFloat(row.loan_amount || 0);
            entry.disbursalAmount = parseFloat(row.disbursal_amount || 0);
          }
        }
      } catch (err) {
        console.warn(`[WhatsAppDailyReport] Warning querying amounts from ${cfg.table}:`, err.message);
      }
    }
  });

  await Promise.all(queryPromises);
}

/**
 * Initialize whatsapp_report_logs table if it doesn't already exist.
 */
async function initializeReportLogsTable() {
  const query = `
    CREATE TABLE IF NOT EXISTS whatsapp_report_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      report_date DATE NOT NULL,
      report_type VARCHAR(100) NOT NULL,
      status VARCHAR(50) NOT NULL,
      partner_count INT DEFAULT 0,
      total_cases INT DEFAULT 0,
      recipient_masked VARCHAR(50),
      file_name VARCHAR(255),
      file_path VARCHAR(500),
      media_id VARCHAR(150),
      api_response TEXT,
      error_message TEXT,
      triggered_by VARCHAR(50) DEFAULT 'SCHEDULER',
      sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_report_lookup (report_date, report_type, status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `;
  try {
    await db.promise().query(query);
  } catch (err) {
    console.error("[WhatsAppDailyReport] Error initializing whatsapp_report_logs table:", err.message);
  }
}

/**
 * Resolve Partner Name from LAN using canonical rules and database fallback.
 *
 * @param {string} lan - Loan Account Number
 * @returns {string} Partner Name
 */
function resolvePartnerName(lan) {
  if (!lan) return "Unknown Partner";
  const cleanLan = String(lan).trim().toUpperCase();

  for (const rule of PREFIX_PARTNER_RULES) {
    if (cleanLan.startsWith(rule.prefix)) {
      return rule.partner;
    }
  }

  // Fallback for non-standard LAN formats: extract alphabetic prefix
  const match = cleanLan.match(/^[A-Z]+/);
  if (match) {
    return match[0];
  }

  return "Other Partners";
}

/**
 * Format a Date object or string to YYYY-MM-DD in Asia/Kolkata timezone.
 *
 * @param {Date|string} [d] - Date to format (defaults to current date)
 * @returns {string} YYYY-MM-DD
 */
function getKolkataDateString(d = new Date()) {
  const dateObj = d instanceof Date ? d : new Date(d);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(dateObj); // returns YYYY-MM-DD
}

/**
 * Format YYYY-MM-DD to DD-MM-YYYY for display in Excel and labels.
 *
 * @param {string} ymd - YYYY-MM-DD
 * @returns {string} DD-MM-YYYY
 */
function formatDisplayDate(ymd) {
  if (!ymd || typeof ymd !== "string") return "";
  const parts = ymd.split("-");
  if (parts.length === 3) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return ymd;
}

/**
 * Format YYYY-MM-DD to "09 October 2026" for WhatsApp template body parameter and image.
 *
 * @param {string} ymd - YYYY-MM-DD
 * @returns {string} e.g. "09 October 2026"
 */
function formatDateToLong(ymd) {
  if (!ymd || typeof ymd !== "string") return "";
  const parts = ymd.split("-");
  if (parts.length === 3) {
    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];
    const mIndex = parseInt(parts[1], 10) - 1;
    const monthName = monthNames[mIndex] || parts[1];
    return `${parts[2]} ${monthName} ${parts[0]}`;
  }
  return ymd;
}

/**
 * Format numerical amounts with en-IN comma separation (e.g. 21,81,773).
 */
function formatAmount(val) {
  if (val == null || val === "" || isNaN(val)) return "0";
  const num = Math.round(Number(val) * 100) / 100;
  return num.toLocaleString("en-IN", {
    maximumFractionDigits: 2,
    minimumFractionDigits: Number.isInteger(num) ? 0 : 2,
  });
}

/**
 * Check if the report has already been successfully sent for a given date and report type.
 *
 * @param {string} reportDate - YYYY-MM-DD
 * @param {string} [reportType] - Defaults to PARTNER_DISBURSEMENT_CASE_COUNT
 * @returns {Promise<boolean>}
 */
async function hasReportBeenSent(reportDate, reportType = REPORT_TYPE) {
  await initializeReportLogsTable();
  try {
    const [rows] = await db.promise().query(
      `
      SELECT id, sent_at, file_name, recipient_masked
      FROM whatsapp_report_logs
      WHERE report_date = ?
        AND report_type = ?
        AND status = 'SUCCESS'
      ORDER BY id DESC
      LIMIT 1
      `,
      [reportDate, reportType]
    );
    return rows.length > 0;
  } catch (err) {
    console.error("[WhatsAppDailyReport] Error checking previous report logs:", err.message);
    return false;
  }
}

/**
 * Log a report execution attempt to the database.
 */
async function logReportAttempt({
  reportDate,
  reportType = REPORT_TYPE,
  status,
  partnerCount = 0,
  totalCases = 0,
  recipientMasked = "",
  fileName = "",
  filePath = "",
  mediaId = "",
  apiResponse = null,
  errorMessage = null,
  triggeredBy = "SCHEDULER",
}) {
  await initializeReportLogsTable();
  try {
    const respStr = apiResponse ? JSON.stringify(redactSecrets(apiResponse)).slice(0, 4000) : null;
    const errStr = errorMessage ? String(redactSecrets(errorMessage)).slice(0, 2000) : null;

    await db.promise().query(
      `
      INSERT INTO whatsapp_report_logs (
        report_date, report_type, status, partner_count, total_cases,
        recipient_masked, file_name, file_path, media_id, api_response,
        error_message, triggered_by, sent_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
      `,
      [
        reportDate,
        reportType,
        status,
        partnerCount,
        totalCases,
        recipientMasked,
        fileName,
        filePath,
        mediaId,
        respStr,
        errStr,
        triggeredBy,
      ]
    );
  } catch (err) {
    console.error("[WhatsAppDailyReport] Failed to write report log:", err.message);
  }
}

/**
 * Query the database for actual disbursed cases on a specific date.
 * Reuses ev_disbursement_utr and partner-specific disbursement sources.
 * Deduplicates by unique LAN so a LAN is NEVER double-counted.
 *
 * @param {string} reportDate - YYYY-MM-DD
 * @returns {Promise<{
 *   uniqueCount: number,
 *   partnerCounts: Record<string, number>,
 *   caseDetails: Array<{ srNo: number, lan: string, partnerName: string, disbursementDate: string, disbursementUtr: string }>
 * }>}
 */
async function fetchDisbursedCasesForDate(reportDate) {
  // Validate date format YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) {
    throw new Error(`Invalid report date format: ${reportDate}. Expected YYYY-MM-DD.`);
  }

  const startOfDay = `${reportDate} 00:00:00`;
  const endOfDay = `${reportDate} 23:59:59`;

  // Map to hold unique LANs: Map<normalizedLan, CaseObject>
  const uniqueLanMap = new Map();

  // 1. Primary disbursement source: ev_disbursement_utr
  // Used by all standard products (Carepay, CirclePe, YA Money, Seven Fincorp, Claim Cure Buddy,
  // Rapid Money, Quick Money, EV, EMICLUB, Finso, etc.)
  try {
    const [utrRows] = await db.promise().query(
      `
      SELECT
        TRIM(LAN) AS lan,
        DATE_FORMAT(MIN(Disbursement_Date), '%Y-%m-%d') AS disbursement_date,
        MAX(COALESCE(NULLIF(TRIM(Disbursement_UTR), ''), NULLIF(TRIM(utr), ''), '')) AS disbursement_utr
      FROM ev_disbursement_utr
      WHERE (
        DATE(Disbursement_Date) = ?
        OR (Disbursement_Date >= ? AND Disbursement_Date <= ?)
      )
      GROUP BY TRIM(LAN)
      `,
      [reportDate, startOfDay, endOfDay]
    );

    for (const row of utrRows) {
      const cleanLan = String(row.lan || "").trim();
      if (!cleanLan) continue;
      const normKey = cleanLan.toUpperCase();

      if (!uniqueLanMap.has(normKey)) {
        uniqueLanMap.set(normKey, {
          lan: cleanLan,
          disbursementDate: row.disbursement_date || reportDate,
          disbursementUtr: row.disbursement_utr || "N/A",
          partnerName: resolvePartnerName(cleanLan),
        });
      }
    }
  } catch (err) {
    console.error("[WhatsAppDailyReport] Error querying ev_disbursement_utr:", err.message);
    throw new Error(`Failed to query disbursement records: ${err.message}`);
  }

  // 2. Adikosh disbursement source: loan_booking_adikosh (uses agreement_date as disbursement date)
  try {
    const [adkRows] = await db.promise().query(
      `
      SELECT
        TRIM(lan) AS lan,
        DATE_FORMAT(agreement_date, '%Y-%m-%d') AS disbursement_date,
        COALESCE(NULLIF(TRIM(partner_loan_id), ''), 'N/A') AS disbursement_utr
      FROM loan_booking_adikosh
      WHERE LOWER(status) = 'disbursed'
        AND (
          DATE(agreement_date) = ?
          OR (agreement_date >= ? AND agreement_date <= ?)
        )
      GROUP BY TRIM(lan)
      `,
      [reportDate, startOfDay, endOfDay]
    );

    for (const row of adkRows) {
      const cleanLan = String(row.lan || "").trim();
      if (!cleanLan) continue;
      const normKey = cleanLan.toUpperCase();

      // Only add if not already in uniqueLanMap (deduplication)
      if (!uniqueLanMap.has(normKey)) {
        uniqueLanMap.set(normKey, {
          lan: cleanLan,
          disbursementDate: row.disbursement_date || reportDate,
          disbursementUtr: row.disbursement_utr || "N/A",
          partnerName: "Adikosh",
        });
      }
    }
  } catch (adkErr) {
    // If loan_booking_adikosh table doesn't exist or errors, log and continue
    console.warn("[WhatsAppDailyReport] Notice: Adikosh booking check completed:", adkErr.message);
  }

  // 3. Query and attach loan_amount and disbursal_amount for all unique LANs across partner tables
  try {
    await attachLoanAndDisbursalAmounts(uniqueLanMap);
  } catch (amountErr) {
    console.warn("[WhatsAppDailyReport] Warning attaching amounts:", amountErr.message);
  }

  // Group by partner and accumulate amounts
  const partnerCounts = {};
  const partnerDisbursalTotals = {};
  const partnerLoanTotals = {};
  const caseDetails = [];
  let srNo = 1;

  for (const item of uniqueLanMap.values()) {
    const pName = item.partnerName || "Other Partners";
    partnerCounts[pName] = (partnerCounts[pName] || 0) + 1;
    partnerDisbursalTotals[pName] = (partnerDisbursalTotals[pName] || 0) + (Number(item.disbursalAmount) || 0);
    partnerLoanTotals[pName] = (partnerLoanTotals[pName] || 0) + (Number(item.loanAmount) || 0);

    caseDetails.push({
      srNo: srNo++,
      lan: item.lan,
      partnerName: pName,
      disbursementDate: item.disbursementDate,
      disbursementUtr: item.disbursementUtr,
      disbursalAmount: Number(item.disbursalAmount) || 0,
      loanAmount: Number(item.loanAmount) || 0,
    });
  }

  return {
    uniqueCount: uniqueLanMap.size,
    partnerCounts,
    partnerDisbursalTotals,
    partnerLoanTotals,
    caseDetails,
  };
}

/**
 * Canonical shared function to fetch daily disbursement case counts and amounts.
 * Reused by BOTH the Excel report flow and the Image report flow
 * to ensure 100% data consistency.
 *
 * @param {string} reportDate - YYYY-MM-DD
 * @returns {Promise<{
 *   reportDate: string,
 *   displayDate: string,
 *   fullDisplayDate: string,
 *   partners: Array<{ partnerName: string, disbursedCaseCount: number, totalDisbursalAmount: number, totalLoanAmount: number }>,
 *   partnerCounts: Record<string, number>,
 *   totalDisbursedCases: number,
 *   totalDisbursalAmount: number,
 *   totalLoanAmount: number,
 *   caseDetails: Array<object>
 * }>}
 */
async function getDailyDisbursementCaseCount(reportDate) {
  const queryResult = await fetchDisbursedCasesForDate(reportDate);
  const { uniqueCount, partnerCounts, partnerDisbursalTotals, partnerLoanTotals, caseDetails } = queryResult;

  const partners = Object.entries(partnerCounts)
    .map(([partnerName, disbursedCaseCount]) => ({
      partnerName,
      disbursedCaseCount,
      totalDisbursalAmount: Math.round((partnerDisbursalTotals?.[partnerName] || 0) * 100) / 100,
      totalLoanAmount: Math.round((partnerLoanTotals?.[partnerName] || 0) * 100) / 100,
    }))
    .sort((a, b) => {
      const diff = b.disbursedCaseCount - a.disbursedCaseCount;
      return diff !== 0 ? diff : a.partnerName.localeCompare(b.partnerName);
    });

  const totalDisbursalAmount = partners.reduce((sum, p) => sum + (p.totalDisbursalAmount || 0), 0);
  const totalLoanAmount = partners.reduce((sum, p) => sum + (p.totalLoanAmount || 0), 0);

  return {
    reportDate,
    displayDate: formatDisplayDate(reportDate),
    fullDisplayDate: formatDateToLong(reportDate),
    partners,
    partnerCounts,
    totalDisbursedCases: uniqueCount,
    totalDisbursalAmount: Math.round(totalDisbursalAmount * 100) / 100,
    totalLoanAmount: Math.round(totalLoanAmount * 100) / 100,
    caseDetails,
  };
}


/**
 * Generate a beautifully formatted Excel workbook with:
 *  - Sheet 1: Partner-wise Summary (Sr. No., Partner Name, Disbursed Case Count, Total)
 *  - Sheet 2: Disbursed Case Details (Sr. No., LAN, Partner Name, Disbursement Date, Disbursement UTR)
 *
 * @param {string} reportDate - YYYY-MM-DD
 * @param {Record<string, number>} partnerCounts - Partner to count map
 * @param {Array<object>} caseDetails - List of unique case details
 * @returns {Promise<{ filePath: string, fileName: string }>}
 */
async function generateDisbursementExcel(reportDate, partnerData, caseDetails) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Fintree Finance Pvt Ltd";
  workbook.lastModifiedBy = "Fintree Automated WhatsApp Reporter";
  workbook.created = new Date();
  workbook.modified = new Date();

  const displayDate = formatDisplayDate(reportDate);
  const fileName = `Daily_Disbursement_Case_Count_${reportDate}.xlsx`;
  const filePath = path.join(reportsDir, fileName);

  const partners = Array.isArray(partnerData)
    ? partnerData
    : Object.entries(partnerData).map(([partnerName, count]) => ({
        partnerName,
        disbursedCaseCount: count,
        totalDisbursalAmount: 0,
        totalLoanAmount: 0,
      }));

  const totalDisbursedCases = caseDetails.length;
  const totalDisbursal = partners.reduce((s, p) => s + (p.totalDisbursalAmount || 0), 0);
  const totalLoan = partners.reduce((s, p) => s + (p.totalLoanAmount || 0), 0);

  /* ================================================================
     SHEET 1: Summary Sheet
     ================================================================ */
  const summarySheet = workbook.addWorksheet("Partner-wise Summary", {
    views: [{ showGridLines: true }],
  });

  // Title Row (Row 1)
  summarySheet.mergeCells("A1:E1");
  const titleCell = summarySheet.getCell("A1");
  titleCell.value = "Daily Partner-wise Disbursement Case Count Report";
  titleCell.font = { name: "Calibri", size: 14, bold: true, color: { argb: "FFFFFFFF" } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  titleCell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1E3A8A" }, // Navy Blue
  };
  summarySheet.getRow(1).height = 30;

  // Report Date Row (Row 2)
  summarySheet.mergeCells("A2:E2");
  const dateCell = summarySheet.getCell("A2");
  dateCell.value = `Report Date: ${displayDate}`;
  dateCell.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FF1E293B" } };
  dateCell.alignment = { horizontal: "center", vertical: "middle" };
  dateCell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE2E8F0" }, // Light Slate
  };
  summarySheet.getRow(2).height = 20;

  // Blank spacing row (Row 3)
  summarySheet.getRow(3).height = 10;

  // Table Headers (Row 4)
  const headerRow = summarySheet.getRow(4);
  headerRow.values = [
    "Sr. No.",
    "Partner Name",
    "Disbursed Case Count",
    "Total Disbursal Amount",
    "Total Loan Amount",
  ];
  headerRow.height = 26;
  headerRow.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.alignment = { vertical: "middle", horizontal: "center" };

  for (let c = 1; c <= 5; c++) {
    const cell = headerRow.getCell(c);
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF2563EB" }, // Royal Blue
    };
    cell.border = {
      top: { style: "thin", color: { argb: "FFCBD5E1" } },
      bottom: { style: "medium", color: { argb: "FF0F172A" } },
      left: { style: "thin", color: { argb: "FFCBD5E1" } },
      right: { style: "thin", color: { argb: "FFCBD5E1" } },
    };
  }

  // Summary Data Rows
  let currentRow = 5;
  if (partners.length === 0) {
    const emptyRow = summarySheet.getRow(currentRow);
    emptyRow.values = ["-", "No cases disbursed on this date", 0, 0, 0];
    emptyRow.getCell(1).alignment = { horizontal: "center" };
    emptyRow.getCell(2).alignment = { horizontal: "left" };
    emptyRow.getCell(3).alignment = { horizontal: "right" };
    emptyRow.getCell(4).alignment = { horizontal: "right" };
    emptyRow.getCell(5).alignment = { horizontal: "right" };
    currentRow++;
  } else {
    partners.forEach((p, idx) => {
      const dataRow = summarySheet.getRow(currentRow);
      dataRow.values = [
        idx + 1,
        p.partnerName,
        p.disbursedCaseCount,
        p.totalDisbursalAmount || 0,
        p.totalLoanAmount || 0,
      ];
      dataRow.height = 20;

      const isEven = idx % 2 === 0;
      const bgColor = isEven ? "FFFFFFFF" : "FFF8FAFC";

      // Cell A: Sr. No.
      const cellA = dataRow.getCell(1);
      cellA.alignment = { horizontal: "center", vertical: "middle" };
      cellA.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgColor } };
      cellA.border = { bottom: { style: "thin", color: { argb: "FFE2E8F0" } }, left: { style: "thin", color: { argb: "FFE2E8F0" } }, right: { style: "thin", color: { argb: "FFE2E8F0" } } };

      // Cell B: Partner Name
      const cellB = dataRow.getCell(2);
      cellB.alignment = { horizontal: "left", vertical: "middle" };
      cellB.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgColor } };
      cellB.border = { bottom: { style: "thin", color: { argb: "FFE2E8F0" } }, left: { style: "thin", color: { argb: "FFE2E8F0" } }, right: { style: "thin", color: { argb: "FFE2E8F0" } } };

      // Cell C: Case Count
      const cellC = dataRow.getCell(3);
      cellC.alignment = { horizontal: "right", vertical: "middle" };
      cellC.numFmt = "#,##0";
      cellC.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgColor } };
      cellC.border = { bottom: { style: "thin", color: { argb: "FFE2E8F0" } }, left: { style: "thin", color: { argb: "FFE2E8F0" } }, right: { style: "thin", color: { argb: "FFE2E8F0" } } };

      // Cell D: Total Disbursal Amount
      const cellD = dataRow.getCell(4);
      cellD.alignment = { horizontal: "right", vertical: "middle" };
      cellD.numFmt = "#,##0.00";
      cellD.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgColor } };
      cellD.border = { bottom: { style: "thin", color: { argb: "FFE2E8F0" } }, left: { style: "thin", color: { argb: "FFE2E8F0" } }, right: { style: "thin", color: { argb: "FFE2E8F0" } } };

      // Cell E: Total Loan Amount
      const cellE = dataRow.getCell(5);
      cellE.alignment = { horizontal: "right", vertical: "middle" };
      cellE.numFmt = "#,##0.00";
      cellE.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgColor } };
      cellE.border = { bottom: { style: "thin", color: { argb: "FFE2E8F0" } }, left: { style: "thin", color: { argb: "FFE2E8F0" } }, right: { style: "thin", color: { argb: "FFE2E8F0" } } };

      currentRow++;
    });
  }

  // Total Row at the bottom
  const totalRow = summarySheet.getRow(currentRow);
  totalRow.height = 24;
  totalRow.values = [
    "",
    "Total",
    totalDisbursedCases,
    totalDisbursal,
    totalLoan,
  ];

  for (let c = 1; c <= 5; c++) {
    const cell = totalRow.getCell(c);
    cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FF1E3A8A" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDBEAFE" } };
    cell.border = { top: { style: "medium", color: { argb: "FF1E3A8A" } }, bottom: { style: "double", color: { argb: "FF1E3A8A" } } };
    if (c >= 3) {
      cell.alignment = { horizontal: "right", vertical: "middle" };
      cell.numFmt = c === 3 ? "#,##0" : "#,##0.00";
    }
  }

  // Set Summary Column Widths
  summarySheet.getColumn(1).width = 12;
  summarySheet.getColumn(2).width = 30;
  summarySheet.getColumn(3).width = 22;
  summarySheet.getColumn(4).width = 25;
  summarySheet.getColumn(5).width = 25;

  /* ================================================================
     SHEET 2: Disbursed Case Details (Detail Sheet)
     ================================================================ */
  const detailSheet = workbook.addWorksheet("Disbursed Case Details", {
    views: [{ state: "frozen", ySplit: 2, showGridLines: true }],
  });

  // Title Banner
  detailSheet.mergeCells("A1:G1");
  const detailTitle = detailSheet.getCell("A1");
  detailTitle.value = `Disbursed Case Details (${displayDate}) - Total: ${totalDisbursedCases} Cases`;
  detailTitle.font = { name: "Calibri", size: 12, bold: true, color: { argb: "FFFFFFFF" } };
  detailTitle.alignment = { horizontal: "center", vertical: "middle" };
  detailTitle.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A8A" } };
  detailSheet.getRow(1).height = 26;

  // Header Row (Row 2)
  const detailHeaderRow = detailSheet.getRow(2);
  detailHeaderRow.values = [
    "Sr. No.",
    "LAN",
    "Partner Name",
    "Disbursement Date",
    "Disbursement UTR",
    "Total Disbursal Amount",
    "Total Loan Amount",
  ];
  detailHeaderRow.height = 24;
  detailHeaderRow.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
  detailHeaderRow.alignment = { vertical: "middle", horizontal: "center" };

  for (let c = 1; c <= 7; c++) {
    const cell = detailHeaderRow.getCell(c);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };
    cell.border = {
      bottom: { style: "medium", color: { argb: "FF0F172A" } },
      left: { style: "thin", color: { argb: "FFCBD5E1" } },
      right: { style: "thin", color: { argb: "FFCBD5E1" } },
    };
  }

  // Detail Data Rows
  let dRowIdx = 3;
  if (caseDetails.length === 0) {
    const emptyDetailRow = detailSheet.getRow(dRowIdx);
    emptyDetailRow.values = ["-", "No cases disbursed", "-", displayDate, "N/A", 0, 0];
    emptyDetailRow.alignment = { horizontal: "center" };
  } else {
    caseDetails.forEach((cd) => {
      const row = detailSheet.getRow(dRowIdx);
      row.values = [
        cd.srNo,
        cd.lan,
        cd.partnerName,
        formatDisplayDate(cd.disbursementDate),
        cd.disbursementUtr || "N/A",
        cd.disbursalAmount || 0,
        cd.loanAmount || 0,
      ];
      row.height = 19;

      const isEven = cd.srNo % 2 === 0;
      const bg = isEven ? "FFFFFFFF" : "FFF8FAFC";

      row.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
      row.getCell(2).alignment = { horizontal: "left", vertical: "middle" };
      row.getCell(3).alignment = { horizontal: "left", vertical: "middle" };
      row.getCell(4).alignment = { horizontal: "center", vertical: "middle" };
      row.getCell(5).alignment = { horizontal: "left", vertical: "middle" };
      row.getCell(6).alignment = { horizontal: "right", vertical: "middle" };
      row.getCell(6).numFmt = "#,##0.00";
      row.getCell(7).alignment = { horizontal: "right", vertical: "middle" };
      row.getCell(7).numFmt = "#,##0.00";

      for (let c = 1; c <= 7; c++) {
        const cell = row.getCell(c);
        cell.font = { name: "Calibri", size: 10 };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
        cell.border = {
          bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
          left: { style: "thin", color: { argb: "FFE2E8F0" } },
          right: { style: "thin", color: { argb: "FFE2E8F0" } },
        };
      }

      dRowIdx++;
    });
  }

  // Set Detail Column Widths
  detailSheet.getColumn(1).width = 10;
  detailSheet.getColumn(2).width = 22;
  detailSheet.getColumn(3).width = 25;
  detailSheet.getColumn(4).width = 18;
  detailSheet.getColumn(5).width = 30;
  detailSheet.getColumn(6).width = 24;
  detailSheet.getColumn(7).width = 24;

  // Write file to disk
  await workbook.xlsx.writeFile(filePath);
  console.log(`[WhatsAppDailyReport] Excel generated successfully: ${filePath}`);

  return { filePath, fileName };
}

/**
 * Escape XML special characters for safe SVG text nodes.
 *
 * @param {string} str - Raw string
 * @returns {string} XML-safe string
 */
function escapeXml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Generate a dynamic, compact, Excel-style SVG string for the partner-wise
 * disbursement case count report.
 *
 * Style:
 *  - Tightly cropped around the table with zero unnecessary margins
 *  - Clean white background with thin black Excel cell borders
 *  - Bold column headers at top with authentic Excel filter dropdown icon buttons
 *  - Bold data rows directly below headers (aligned numbers & dates)
 *  - Bold total row with Excel light green (#92D050) highlight for numerical totals
 *  - Dynamically calculates height based on row count (no fixed large height)
 *  - Zero decorative graphics, no large title banner, no footer
 *
 * @param {object} reportData - Report data object from getDailyDisbursementCaseCount
 * @returns {string} Clean SVG markup string
 */
function buildDisbursementSvg(reportData) {
  const { reportDate, displayDate, partners = [], totalDisbursedCases = 0 } = reportData;
  const formattedDate = displayDate || formatDisplayDate(reportDate) || reportDate;

  // Always display the 5-column layout with Total_disbursal_amount and Total_Loan_Amount
  const columns = [
    { key: "date", label: "disbursement_date", width: 180, align: "right" },
    { key: "lender", label: "lender_name", width: 230, align: "left" },
    { key: "loans", label: "total_loans", width: 140, align: "right" },
    { key: "disbursal_amt", label: "Total_disbursal_amount", width: 250, align: "right" },
    { key: "loan_amt", label: "Total_Loan_Amount", width: 240, align: "right" },
  ];

  const tableWidth = columns.reduce((acc, col) => acc + col.width, 0);
  const headerHeight = 36;
  const rowHeight = 34;
  const totalRowHeight = 36;
  const rowCount = Math.max(partners.length, 1);
  const tableHeight = headerHeight + rowCount * rowHeight + totalRowHeight;

  const imageWidth = tableWidth;
  const imageHeight = tableHeight;

  let svg = "";
  svg += `<svg width="${imageWidth}" height="${imageHeight}" viewBox="0 0 ${imageWidth} ${imageHeight}" xmlns="http://www.w3.org/2000/svg">\n`;
  svg += `  <defs>\n`;
  svg += `    <style>\n`;
  svg += `      .tbl-text { font-family: Calibri, Aptos, Arial, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, sans-serif; font-size: 16px; fill: #000000; font-weight: 700; }\n`;
  svg += `    </style>\n`;
  svg += `  </defs>\n`;

  // Canvas White Background
  svg += `  <rect width="100%" height="100%" fill="#FFFFFF"/>\n`;

  // Total row green highlight (#92D050) for numerical column(s) (col index >= 2)
  const totalY = headerHeight + rowCount * rowHeight;
  let runningX = 0;
  columns.forEach((col, idx) => {
    if (idx >= 2) {
      svg += `  <rect x="${runningX}" y="${totalY}" width="${col.width}" height="${totalRowHeight}" fill="#92D050"/>\n`;
    }
    runningX += col.width;
  });

  // 1. Column Headers
  let colX = 0;
  columns.forEach((col) => {
    const textX = colX + 10;
    const textY = headerHeight / 2;
    svg += `  <text x="${textX}" y="${textY}" class="tbl-text" text-anchor="start" dominant-baseline="central">${escapeXml(col.label)}</text>\n`;

    // Excel filter dropdown icon button
    const btnSize = 16;
    const btnX = colX + col.width - btnSize - 6;
    const btnY = (headerHeight - btnSize) / 2;
    svg += `  <rect x="${btnX}" y="${btnY}" width="${btnSize}" height="${btnSize}" fill="#EAEAEA" stroke="#7A7A7A" stroke-width="1" rx="1"/>\n`;
    svg += `  <polygon points="${btnX + 4},${btnY + 6} ${btnX + btnSize - 4},${btnY + 6} ${btnX + btnSize / 2},${btnY + btnSize - 5}" fill="#000000"/>\n`;

    colX += col.width;
  });

  // 2. Data Rows
  let curY = headerHeight;
  if (partners.length === 0) {
    svg += `  <text x="${imageWidth / 2}" y="${curY + rowHeight / 2}" class="tbl-text" text-anchor="middle" dominant-baseline="central" fill="#555555">No cases disbursed on this date</text>\n`;
    curY += rowHeight;
  } else {
    partners.forEach((p) => {
      let rX = 0;
      columns.forEach((col) => {
        let val = "";
        let anchor = "start";
        let textX = 0;

        if (col.key === "date") {
          val = formattedDate;
        } else if (col.key === "lender") {
          val = p.partnerName;
        } else if (col.key === "loans") {
          val = String(p.disbursedCaseCount != null ? p.disbursedCaseCount : (p.totalLoans != null ? p.totalLoans : 0));
        } else if (col.key === "disbursal_amt") {
          const amt = p.totalDisbursalAmount != null ? p.totalDisbursalAmount : (p.disbursalAmount != null ? p.disbursalAmount : p.total_disbursal_amount);
          val = amt != null ? formatAmount(amt) : "0";
        } else if (col.key === "loan_amt") {
          const amt = p.totalLoanAmount != null ? p.totalLoanAmount : (p.loanAmount != null ? p.loanAmount : p.total_loan_amount);
          val = amt != null ? formatAmount(amt) : "0";
        }

        if (col.align === "left") {
          anchor = "start";
          textX = rX + 12;
        } else if (col.align === "right") {
          anchor = "end";
          textX = rX + col.width - 12;
        } else {
          anchor = "middle";
          textX = rX + col.width / 2;
        }
        const textY = curY + rowHeight / 2;
        svg += `  <text x="${textX}" y="${textY}" class="tbl-text" text-anchor="${anchor}" dominant-baseline="central">${escapeXml(val)}</text>\n`;
        rX += col.width;
      });
      curY += rowHeight;
    });
  }

  // 3. Total Row
  let totX = 0;
  const grandTotalCases = totalDisbursedCases || partners.reduce((s, p) => s + Number(p.disbursedCaseCount || p.totalLoans || 0), 0);
  columns.forEach((col, idx) => {
    let val = "";
    let anchor = "start";
    let textX = 0;

    if (idx === 0) {
      val = "";
    } else if (idx === 1) {
      val = "Total Amount";
      anchor = "start";
    } else if (col.key === "loans") {
      val = String(grandTotalCases);
      anchor = "end";
    } else if (col.key === "disbursal_amt") {
      const tot = partners.reduce((s, p) => {
        const amt = p.totalDisbursalAmount != null ? p.totalDisbursalAmount : (p.disbursalAmount != null ? p.disbursalAmount : p.total_disbursal_amount);
        return s + Number(amt || 0);
      }, 0);
      val = formatAmount(tot);
      anchor = "end";
    } else if (col.key === "loan_amt") {
      const tot = partners.reduce((s, p) => {
        const amt = p.totalLoanAmount != null ? p.totalLoanAmount : (p.loanAmount != null ? p.loanAmount : p.total_loan_amount);
        return s + Number(amt || 0);
      }, 0);
      val = formatAmount(tot);
      anchor = "end";
    }

    if (val) {
      if (anchor === "start") {
        textX = totX + 12;
      } else if (anchor === "end") {
        textX = totX + col.width - 12;
      } else {
        textX = totX + col.width / 2;
      }
      const textY = curY + totalRowHeight / 2;
      svg += `  <text x="${textX}" y="${textY}" class="tbl-text" text-anchor="${anchor}" dominant-baseline="central">${escapeXml(val)}</text>\n`;
    }
    totX += col.width;
  });

  // Borders & Grid lines
  // Outer border
  svg += `  <rect x="0.5" y="0.5" width="${imageWidth - 1}" height="${imageHeight - 1}" fill="none" stroke="#000000" stroke-width="1"/>\n`;

  // Horizontal row dividers
  let lineY = headerHeight;
  for (let i = 0; i < rowCount; i++) {
    svg += `  <line x1="0" y1="${lineY}" x2="${imageWidth}" y2="${lineY}" stroke="#000000" stroke-width="1"/>\n`;
    lineY += rowHeight;
  }
  // Line above total row
  svg += `  <line x1="0" y1="${lineY}" x2="${imageWidth}" y2="${lineY}" stroke="#000000" stroke-width="1"/>\n`;

  // Vertical column dividers
  let lineX = 0;
  for (let i = 0; i < columns.length - 1; i++) {
    lineX += columns[i].width;
    svg += `  <line x1="${lineX}" y1="0" x2="${lineX}" y2="${imageHeight}" stroke="#000000" stroke-width="1"/>\n`;
  }

  svg += `</svg>`;
  return svg;
}

/**
 * Generate a clean, professional PNG image table of the daily partner-wise
 * disbursement case count report using sharp + SVG.
 *
 * @param {object} reportData - Output from getDailyDisbursementCaseCount
 * @returns {Promise<{ filePath: string, fileName: string, buffer: Buffer }>}
 */
async function generateDisbursementImage(reportData) {
  const { reportDate } = reportData;
  const fileName = `Daily_Disbursement_Case_Count_${reportDate}.png`;
  const filePath = path.join(reportsDir, fileName);

  const svg = buildDisbursementSvg(reportData);
  const svgBuffer = Buffer.from(svg, "utf8");

  const buffer = await sharp(svgBuffer)
    .png()
    .toBuffer();

  fs.writeFileSync(filePath, buffer);
  console.log(`[WhatsAppDailyReport] PNG generated successfully via sharp + SVG: ${filePath} (${buffer.length} bytes)`);

  return { filePath, fileName, buffer };
}

/**
 * Generate and dispatch the daily partner-wise disbursement case count IMAGE report
 * via WhatsApp Business Cloud API / Alots.io.
 *
 * @param {object} options
 * @param {string} [options.date] - Target report date YYYY-MM-DD
 * @param {boolean} [options.forceResend] - Bypass duplicate check
 * @param {boolean} [options.dryRun] - Generate image but skip WhatsApp dispatch
 * @param {boolean} [options.testMode] - Return verbose test diagnostics
 * @param {string} [options.triggeredBy] - Trigger source
 * @returns {Promise<object>} Status result
 */
async function generateAndSendDailyImageReport({
  date = null,
  forceResend = false,
  dryRun = false,
  testMode = false,
  triggeredBy = "SCHEDULER",
} = {}) {
  const config = getWhatsAppConfig();
  const reportDate = date ? String(date).trim() : getKolkataDateString();

  console.log(
    `[WhatsAppDailyReport] Initiating IMAGE report for date: ${reportDate} (triggeredBy: ${triggeredBy}, forceResend: ${forceResend}, dryRun: ${dryRun})`
  );

  // 1. Duplicate prevention check
  if (!forceResend && !dryRun && !testMode) {
    const alreadySent = await hasReportBeenSent(reportDate, IMAGE_REPORT_TYPE);
    if (alreadySent) {
      console.log(
        `[WhatsAppDailyReport] Image report for ${reportDate} has already been sent successfully. Skipping to prevent duplicate.`
      );
      return {
        success: false,
        alreadySent: true,
        date: reportDate,
        reportType: IMAGE_REPORT_TYPE,
        message: `Daily disbursement case count image for ${reportDate} was already sent successfully. To resend manually, provide force: true or resend: true.`,
      };
    }
  }

  // 2. Fetch data via canonical shared function
  const reportData = await getDailyDisbursementCaseCount(reportDate);
  const { totalDisbursedCases, partners, fullDisplayDate } = reportData;
  const partnerCount = partners.length;

  console.log(
    `[WhatsAppDailyReport] Found ${totalDisbursedCases} unique disbursed cases across ${partnerCount} partners on ${reportDate} for image`
  );

  // 3. Generate PNG image
  const { filePath, fileName } = await generateDisbursementImage(reportData);
  const adminNumbers = (config.adminNumbers && config.adminNumbers.length > 0)
    ? config.adminNumbers
    : (config.adminNumber ? [config.adminNumber] : []);
  const maskedAdminNumber = adminNumbers.map(maskPhoneNumber).join(", ");

  // 4. Handle Dry Run / Test Mode / Missing Credentials
  const isCredentialsMissing = !config.accessToken || adminNumbers.length === 0;

  if (dryRun || (testMode && isCredentialsMissing)) {
    const notice = isCredentialsMissing
      ? "WHATSAPP_ACCESS_TOKEN or WHATSAPP_ADMIN_NUMBER is not set; WhatsApp sending skipped."
      : "Dry run / test mode enabled; WhatsApp sending skipped.";

    console.log(`[WhatsAppDailyReport] ${notice}`);

    return {
      success: true,
      testMode: true,
      dryRun: Boolean(dryRun),
      date: reportDate,
      reportType: IMAGE_REPORT_TYPE,
      partnerCount,
      totalDisbursedCases,
      image: fileName,
      filePath,
      whatsappMediaUploaded: false,
      whatsappMessageSent: false,
      totalRecipients: adminNumbers.length,
      template: config.imageTemplateName,
      recipient: maskedAdminNumber,
      message: `Daily disbursement case count image generated successfully for ${reportDate}. (${notice})`,
    };
  }

  // Validate credentials if live dispatch
  if (!config.accessToken) {
    const errorMsg = "WHATSAPP_ACCESS_TOKEN is missing in environment variables.";
    await logReportAttempt({
      reportDate,
      reportType: IMAGE_REPORT_TYPE,
      status: "FAILED",
      partnerCount,
      totalCases: totalDisbursedCases,
      recipientMasked: maskedAdminNumber,
      fileName,
      filePath,
      errorMessage: errorMsg,
      triggeredBy,
    });
    throw new Error(errorMsg);
  }

  if (adminNumbers.length === 0) {
    const errorMsg = "WHATSAPP_ADMIN_NUMBER is missing in environment variables.";
    await logReportAttempt({
      reportDate,
      reportType: IMAGE_REPORT_TYPE,
      status: "FAILED",
      partnerCount,
      totalCases: totalDisbursedCases,
      recipientMasked: maskedAdminNumber,
      fileName,
      filePath,
      errorMessage: errorMsg,
      triggeredBy,
    });
    throw new Error(errorMsg);
  }

  // 5. Upload Image to WhatsApp / Alots.io (upload once for all recipients)
  let mediaId = null;
  let uploadResponse = null;
  try {
    const uploadResult = await uploadWhatsAppImage(filePath, fileName);
    mediaId = uploadResult.mediaId;
    uploadResponse = uploadResult.rawResponse;
  } catch (uploadError) {
    await logReportAttempt({
      reportDate,
      reportType: IMAGE_REPORT_TYPE,
      status: "FAILED_MEDIA_UPLOAD",
      partnerCount,
      totalCases: totalDisbursedCases,
      recipientMasked: maskedAdminNumber,
      fileName,
      filePath,
      errorMessage: uploadError.message,
      apiResponse: uploadError.apiResponse,
      triggeredBy,
    });
    throw uploadError;
  }

  // 6. Send the approved IMAGE template to ALL configured admin numbers
  const sendResults = [];
  const sendErrors = [];

  for (const targetNumber of adminNumbers) {
    try {
      const sendRes = await sendImageTemplateMessage({
        recipientNumber: targetNumber,
        mediaId,
        templateName: config.imageTemplateName,
        dateText: fullDisplayDate,
      });
      sendResults.push({
        recipient: targetNumber,
        recipientMasked: maskPhoneNumber(targetNumber),
        messageId: sendRes.messageId,
      });
      console.log(`[WhatsAppDailyReport] IMAGE report successfully dispatched to ${maskPhoneNumber(targetNumber)}`);
    } catch (sendError) {
      console.error(`[WhatsAppDailyReport] Error dispatching image to ${maskPhoneNumber(targetNumber)}:`, sendError.message);
      sendErrors.push({
        recipient: targetNumber,
        recipientMasked: maskPhoneNumber(targetNumber),
        error: sendError.message,
      });
    }
  }

  // If ALL recipients failed, log failure and throw
  if (sendResults.length === 0 && sendErrors.length > 0) {
    await logReportAttempt({
      reportDate,
      reportType: IMAGE_REPORT_TYPE,
      status: "FAILED_TEMPLATE_SEND",
      partnerCount,
      totalCases: totalDisbursedCases,
      recipientMasked: maskedAdminNumber,
      fileName,
      filePath,
      mediaId,
      errorMessage: sendErrors.map((e) => `${e.recipientMasked}: ${e.error}`).join(" | "),
      triggeredBy,
    });
    throw new Error(`Failed to send WhatsApp image template to any recipient: ${sendErrors.map((e) => e.error).join(", ")}`);
  }

  // 7. Log success (or partial success if some recipients succeeded)
  const isPartial = sendErrors.length > 0;
  await logReportAttempt({
    reportDate,
    reportType: IMAGE_REPORT_TYPE,
    status: isPartial ? "PARTIAL_SUCCESS" : "SUCCESS",
    partnerCount,
    totalCases: totalDisbursedCases,
    recipientMasked: maskedAdminNumber,
    fileName,
    filePath,
    mediaId,
    apiResponse: { sent: sendResults, failed: sendErrors },
    triggeredBy,
  });

  console.log(`[WhatsAppDailyReport] Successfully completed WhatsApp IMAGE report dispatch for ${reportDate} (${sendResults.length}/${adminNumbers.length} delivered)`);

  return {
    success: true,
    date: reportDate,
    reportType: IMAGE_REPORT_TYPE,
    partnerCount,
    totalDisbursedCases,
    image: fileName,
    whatsappMediaUploaded: true,
    whatsappMessageSent: true,
    recipientsSent: sendResults.length,
    totalRecipients: adminNumbers.length,
    mediaId,
    template: config.imageTemplateName,
    recipient: maskedAdminNumber,
    recipients: sendResults,
    failedRecipients: sendErrors,
    message: `Daily disbursement case count image sent successfully to ${sendResults.length}/${adminNumbers.length} recipient(s)`,
  };
}

/**
 * Main function: generate the daily partner-wise disbursement case count report.
 * By default, generates the professional IMAGE report and dispatches it in DOCUMENT
 * format using the approved 'countofcase' template (no Excel sent over WhatsApp).
 *
 * @param {object} options
 * @param {string} [options.date] - Target report date YYYY-MM-DD (defaults to today in Asia/Kolkata)
 * @param {boolean} [options.forceResend] - Bypass duplicate check if true
 * @param {boolean} [options.dryRun] - If true, generate files but skip WhatsApp API calls
 * @param {boolean} [options.testMode] - Return verbose test diagnostic details
 * @param {boolean} [options.sendExcel] - If explicitly true, send Excel file instead of Image
 * @param {string} [options.triggeredBy] - 'SCHEDULER' or 'MANUAL_API'
 * @returns {Promise<object>} Status result
 */
async function generateAndSendDailyReport({
  date = null,
  forceResend = false,
  dryRun = false,
  testMode = false,
  sendExcel = false,
  triggeredBy = "SCHEDULER",
} = {}) {
  const config = getWhatsAppConfig();
  const reportDate = date ? String(date).trim() : getKolkataDateString();

  console.log(
    `[WhatsAppDailyReport] Initiating daily report for date: ${reportDate} (triggeredBy: ${triggeredBy}, forceResend: ${forceResend}, dryRun: ${dryRun}, sendExcel: ${sendExcel})`
  );

  // 1. Check duplicate prevention
  if (!forceResend && !dryRun && !testMode) {
    const alreadySent = await hasReportBeenSent(reportDate, REPORT_TYPE);
    if (alreadySent) {
      console.log(
        `[WhatsAppDailyReport] Report for ${reportDate} has already been sent successfully. Skipping to prevent duplicate.`
      );
      return {
        success: false,
        alreadySent: true,
        date: reportDate,
        reportType: REPORT_TYPE,
        message: `Daily disbursement case count report for ${reportDate} was already sent successfully. To resend manually, provide force: true or resend: true.`,
      };
    }
  }

  // 2. Query actual disbursed cases from database (unique LANs only) via canonical function
  const reportData = await getDailyDisbursementCaseCount(reportDate);
  const { totalDisbursedCases, partnerCounts, caseDetails } = reportData;
  const partnerCount = Object.keys(partnerCounts).length;

  console.log(
    `[WhatsAppDailyReport] Found ${totalDisbursedCases} unique disbursed cases across ${partnerCount} partners on ${reportDate}`
  );

  // 3. Maintain Excel file on disk for audit/download records
  let excelPath = null;
  let excelName = null;
  try {
    const excelRes = await generateDisbursementExcel(
      reportDate,
      reportData.partners,
      caseDetails
    );
    excelPath = excelRes.filePath;
    excelName = excelRes.fileName;
  } catch (exErr) {
    console.warn("[WhatsAppDailyReport] Notice: Excel archival generation:", exErr.message);
  }

  // 4. Generate the clean, professional PNG table image
  const imgRes = await generateDisbursementImage(reportData);

  // Default: Send image in document format. Only send Excel if explicitly requested.
  const fileToSendPath = sendExcel && excelPath ? excelPath : imgRes.filePath;
  const fileToSendName = sendExcel && excelName ? excelName : imgRes.fileName;

  const adminNumbers = (config.adminNumbers && config.adminNumbers.length > 0)
    ? config.adminNumbers
    : (config.adminNumber ? [config.adminNumber] : []);
  const maskedAdminNumber = adminNumbers.map(maskPhoneNumber).join(", ");

  // 5. Handle Dry Run / Test Mode / Missing Credentials
  const isCredentialsMissing = !config.accessToken || adminNumbers.length === 0;

  if (dryRun || (testMode && isCredentialsMissing)) {
    const notice = isCredentialsMissing
      ? "WHATSAPP_ACCESS_TOKEN or WHATSAPP_ADMIN_NUMBER is not set; WhatsApp sending skipped."
      : "Dry run / test mode enabled; WhatsApp sending skipped.";

    console.log(`[WhatsAppDailyReport] ${notice}`);

    return {
      success: true,
      testMode: true,
      dryRun: Boolean(dryRun),
      date: reportDate,
      reportType: REPORT_TYPE,
      partnerCount,
      totalDisbursedCases,
      partnerCounts,
      template: config.templateName,
      recipient: maskedAdminNumber,
      totalRecipients: adminNumbers.length,
      file: fileToSendName,
      excelFile: excelName,
      imageFile: imgRes.fileName,
      documentFormat: sendExcel ? "EXCEL" : "IMAGE_IN_DOCUMENT_FORMAT",
      mediaUploadStatus: "SKIPPED",
      whatsappMessageStatus: "SKIPPED",
      message: `Report generated successfully for ${reportDate}. (${notice})`,
    };
  }

  // Validate credentials if not in dry-run
  if (!config.accessToken) {
    const errorMsg = "WHATSAPP_ACCESS_TOKEN is missing in environment variables.";
    await logReportAttempt({
      reportDate,
      status: "FAILED",
      partnerCount,
      totalCases: totalDisbursedCases,
      recipientMasked: maskedAdminNumber,
      fileName: fileToSendName,
      filePath: fileToSendPath,
      errorMessage: errorMsg,
      triggeredBy,
    });
    throw new Error(errorMsg);
  }

  if (adminNumbers.length === 0) {
    const errorMsg = "WHATSAPP_ADMIN_NUMBER is missing in environment variables.";
    await logReportAttempt({
      reportDate,
      status: "FAILED",
      partnerCount,
      totalCases: totalDisbursedCases,
      recipientMasked: maskedAdminNumber,
      fileName: fileToSendName,
      filePath: fileToSendPath,
      errorMessage: errorMsg,
      triggeredBy,
    });
    throw new Error(errorMsg);
  }

  // 6. Upload file (Image) to WhatsApp once for all recipients
  let mediaId = null;
  let uploadResponse = null;
  try {
    const uploadResult = await uploadWhatsAppImage(fileToSendPath, fileToSendName);
    mediaId = uploadResult.mediaId;
    uploadResponse = uploadResult.rawResponse;
  } catch (uploadError) {
    await logReportAttempt({
      reportDate,
      status: "FAILED_MEDIA_UPLOAD",
      partnerCount,
      totalCases: totalDisbursedCases,
      recipientMasked: maskedAdminNumber,
      fileName: fileToSendName,
      filePath: fileToSendPath,
      errorMessage: uploadError.message,
      apiResponse: uploadError.apiResponse,
      triggeredBy,
    });
    throw uploadError;
  }

  // 7. Send the approved 'casecount' template to ALL configured admin numbers
  const sendResults = [];
  const sendErrors = [];

  for (const targetNumber of adminNumbers) {
    try {
      const sendRes = await sendImageTemplateMessage({
        recipientNumber: targetNumber,
        mediaId,
        templateName: config.templateName || "casecount",
        languageCode: config.templateLang || "en",
        callbackData: `casecount_${reportDate}`,
      });
      sendResults.push({
        recipient: targetNumber,
        recipientMasked: maskPhoneNumber(targetNumber),
        messageId: sendRes.messageId,
      });
      console.log(`[WhatsAppDailyReport] Case count report image successfully dispatched to ${maskPhoneNumber(targetNumber)}`);
    } catch (sendError) {
      console.error(`[WhatsAppDailyReport] Failed dispatching image to ${maskPhoneNumber(targetNumber)}:`, sendError.message);
      sendErrors.push({
        recipient: targetNumber,
        recipientMasked: maskPhoneNumber(targetNumber),
        error: sendError.message,
      });
    }
  }

  // If ALL recipients failed, log failure and throw
  if (sendResults.length === 0 && sendErrors.length > 0) {
    await logReportAttempt({
      reportDate,
      status: "FAILED_TEMPLATE_SEND",
      partnerCount,
      totalCases: totalDisbursedCases,
      recipientMasked: maskedAdminNumber,
      fileName: fileToSendName,
      filePath: fileToSendPath,
      mediaId,
      errorMessage: sendErrors.map((e) => `${e.recipientMasked}: ${e.error}`).join(" | "),
      triggeredBy,
    });
    throw new Error(`Failed to send WhatsApp report to any recipient: ${sendErrors.map((e) => e.error).join(", ")}`);
  }

  // 8. Log success (or partial success if some recipients succeeded)
  const isPartial = sendErrors.length > 0;
  await logReportAttempt({
    reportDate,
    status: isPartial ? "PARTIAL_SUCCESS" : "SUCCESS",
    partnerCount,
    totalCases: totalDisbursedCases,
    recipientMasked: maskedAdminNumber,
    fileName: fileToSendName,
    filePath: fileToSendPath,
    mediaId,
    apiResponse: { sent: sendResults, failed: sendErrors },
    triggeredBy,
  });

  console.log(
    `[WhatsAppDailyReport] Successfully completed WhatsApp report dispatch for ${reportDate} (${sendResults.length}/${adminNumbers.length} delivered)`
  );

  return {
    success: true,
    date: reportDate,
    reportType: REPORT_TYPE,
    partnerCount,
    totalDisbursedCases,
    partnerCounts,
    template: config.templateName,
    recipient: maskedAdminNumber,
    recipientsSent: sendResults.length,
    totalRecipients: adminNumbers.length,
    recipients: sendResults,
    failedRecipients: sendErrors,
    file: fileToSendName,
    excelFile: excelName,
    imageFile: imgRes.fileName,
    documentFormat: sendExcel ? "EXCEL" : "IMAGE_IN_DOCUMENT_FORMAT",
    mediaUploadStatus: "SUCCESS",
    mediaId,
    whatsappMessageStatus: "SUCCESS",
    message: `Report sent successfully to ${sendResults.length}/${adminNumbers.length} recipient(s) for ${reportDate}`,
  };
}

module.exports = {
  REPORT_TYPE,
  IMAGE_REPORT_TYPE,
  initializeReportLogsTable,
  resolvePartnerName,
  getKolkataDateString,
  formatDisplayDate,
  formatDateToLong,
  hasReportBeenSent,
  fetchDisbursedCasesForDate,
  getDailyDisbursementCaseCount,
  generateDisbursementExcel,
  generateDisbursementImage,
  generateAndSendDailyReport,
  generateAndSendDailyImageReport,
};
