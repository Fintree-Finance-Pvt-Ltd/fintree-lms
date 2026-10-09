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

  // Group by partner
  const partnerCounts = {};
  const caseDetails = [];
  let srNo = 1;

  for (const item of uniqueLanMap.values()) {
    const pName = item.partnerName || "Other Partners";
    partnerCounts[pName] = (partnerCounts[pName] || 0) + 1;

    caseDetails.push({
      srNo: srNo++,
      lan: item.lan,
      partnerName: pName,
      disbursementDate: item.disbursementDate,
      disbursementUtr: item.disbursementUtr,
    });
  }

  return {
    uniqueCount: uniqueLanMap.size,
    partnerCounts,
    caseDetails,
  };
}

/**
 * Canonical shared function to fetch daily disbursement case counts.
 * Reused by BOTH the Excel report flow and the Image report flow
 * to ensure 100% data consistency.
 *
 * @param {string} reportDate - YYYY-MM-DD
 * @returns {Promise<{
 *   reportDate: string,
 *   displayDate: string,
 *   fullDisplayDate: string,
 *   partners: Array<{ partnerName: string, disbursedCaseCount: number }>,
 *   partnerCounts: Record<string, number>,
 *   totalDisbursedCases: number,
 *   caseDetails: Array<object>
 * }>}
 */
async function getDailyDisbursementCaseCount(reportDate) {
  const queryResult = await fetchDisbursedCasesForDate(reportDate);
  const { uniqueCount, partnerCounts, caseDetails } = queryResult;

  const partners = Object.entries(partnerCounts)
    .map(([partnerName, disbursedCaseCount]) => ({
      partnerName,
      disbursedCaseCount,
    }))
    .sort((a, b) => {
      const diff = b.disbursedCaseCount - a.disbursedCaseCount;
      return diff !== 0 ? diff : a.partnerName.localeCompare(b.partnerName);
    });

  return {
    reportDate,
    displayDate: formatDisplayDate(reportDate),
    fullDisplayDate: formatDateToLong(reportDate),
    partners,
    partnerCounts,
    totalDisbursedCases: uniqueCount,
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
async function generateDisbursementExcel(reportDate, partnerCounts, caseDetails) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Fintree Finance Pvt Ltd";
  workbook.lastModifiedBy = "Fintree Automated WhatsApp Reporter";
  workbook.created = new Date();
  workbook.modified = new Date();

  const displayDate = formatDisplayDate(reportDate);
  const fileName = `Daily_Disbursement_Case_Count_${reportDate}.xlsx`;
  const filePath = path.join(reportsDir, fileName);

  const partners = Object.keys(partnerCounts).sort((a, b) => {
    // Sort descending by count, then alphabetically
    const diff = partnerCounts[b] - partnerCounts[a];
    return diff !== 0 ? diff : a.localeCompare(b);
  });

  const totalDisbursedCases = caseDetails.length;

  /* ================================================================
     SHEET 1: Summary Sheet
     ================================================================ */
  const summarySheet = workbook.addWorksheet("Partner-wise Summary", {
    views: [{ showGridLines: true }],
  });

  // Title Row (Row 1)
  summarySheet.mergeCells("A1:C1");
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
  summarySheet.mergeCells("A2:C2");
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
  headerRow.values = ["Sr. No.", "Partner Name", "Disbursed Case Count"];
  headerRow.height = 26;
  headerRow.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.alignment = { vertical: "middle", horizontal: "center" };

  for (let c = 1; c <= 3; c++) {
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
    emptyRow.values = ["-", "No cases disbursed on this date", 0];
    emptyRow.getCell(1).alignment = { horizontal: "center" };
    emptyRow.getCell(2).alignment = { horizontal: "left" };
    emptyRow.getCell(3).alignment = { horizontal: "right" };
    currentRow++;
  } else {
    partners.forEach((partner, idx) => {
      const dataRow = summarySheet.getRow(currentRow);
      dataRow.values = [idx + 1, partner, partnerCounts[partner]];
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

      currentRow++;
    });
  }

  // Total Row at the bottom
  const totalRow = summarySheet.getRow(currentRow);
  totalRow.height = 24;
  totalRow.values = ["", "Total Disbursed Cases", totalDisbursedCases];

  const totCellA = totalRow.getCell(1);
  totCellA.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDBEAFE" } };
  totCellA.border = { top: { style: "medium", color: { argb: "FF1E3A8A" } }, bottom: { style: "double", color: { argb: "FF1E3A8A" } } };

  const totCellB = totalRow.getCell(2);
  totCellB.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FF1E3A8A" } };
  totCellB.alignment = { horizontal: "left", vertical: "middle" };
  totCellB.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDBEAFE" } };
  totCellB.border = { top: { style: "medium", color: { argb: "FF1E3A8A" } }, bottom: { style: "double", color: { argb: "FF1E3A8A" } } };

  const totCellC = totalRow.getCell(3);
  totCellC.font = { name: "Calibri", size: 12, bold: true, color: { argb: "FF1E3A8A" } };
  totCellC.alignment = { horizontal: "right", vertical: "middle" };
  totCellC.numFmt = "#,##0";
  totCellC.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDBEAFE" } };
  totCellC.border = { top: { style: "medium", color: { argb: "FF1E3A8A" } }, bottom: { style: "double", color: { argb: "FF1E3A8A" } } };

  // Set Summary Column Widths
  summarySheet.getColumn(1).width = 12;
  summarySheet.getColumn(2).width = 30;
  summarySheet.getColumn(3).width = 24;

  /* ================================================================
     SHEET 2: Disbursed Case Details (Detail Sheet)
     ================================================================ */
  const detailSheet = workbook.addWorksheet("Disbursed Case Details", {
    views: [{ state: "frozen", ySplit: 2, showGridLines: true }],
  });

  // Title Banner
  detailSheet.mergeCells("A1:E1");
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
  ];
  detailHeaderRow.height = 24;
  detailHeaderRow.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
  detailHeaderRow.alignment = { vertical: "middle", horizontal: "center" };

  for (let c = 1; c <= 5; c++) {
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
    emptyDetailRow.values = ["-", "No cases disbursed", "-", displayDate, "N/A"];
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
      ];
      row.height = 19;

      const isEven = cd.srNo % 2 === 0;
      const bg = isEven ? "FFFFFFFF" : "FFF8FAFC";

      row.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
      row.getCell(2).alignment = { horizontal: "left", vertical: "middle" };
      row.getCell(3).alignment = { horizontal: "left", vertical: "middle" };
      row.getCell(4).alignment = { horizontal: "center", vertical: "middle" };
      row.getCell(5).alignment = { horizontal: "left", vertical: "middle" };

      for (let c = 1; c <= 5; c++) {
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
  detailSheet.getColumn(5).width = 32;

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
 * Generate a dynamic SVG string for the partner-wise disbursement case count report.
 *
 * Layout:
 *  - Fixed width: 1200px
 *  - Dynamically calculated height based on number of partner rows
 *  - Professional corporate gradient header
 *  - Proper table borders, alternating row fills, and highlighted total row
 *  - Strictly contains ONLY: Report Title, Report Date, Partner Name, Cases, Total Disbursed
 *  - Zero PII
 *
 * @param {object} reportData - Report data object from getDailyDisbursementCaseCount
 * @returns {string} Clean SVG markup string
 */
function buildDisbursementSvg(reportData) {
  const { reportDate, fullDisplayDate, partners = [], totalDisbursedCases = 0 } = reportData;

  const width = 1200;
  const cardPadding = 48;
  const cardW = width - cardPadding * 2; // 1104px
  const cardX = cardPadding;
  const cardY = cardPadding;

  const headerHeight = 150;
  const tableHeaderHeight = 54;
  const rowHeight = 50;
  const rowCount = Math.max(partners.length, 1);
  const tableRowsHeight = rowCount * rowHeight;
  const totalRowHeight = 64;
  const footerHeight = 56;

  const cardH = headerHeight + tableHeaderHeight + tableRowsHeight + totalRowHeight + footerHeight;
  const height = cardPadding * 2 + cardH;

  // Geometry
  const col1W = 120; // Sr. No.
  const col3W = 200; // Cases
  const col2W = cardW - col1W - col3W; // Partner Name (784px)

  const col1X = cardX;
  const col2X = cardX + col1W;
  const col3X = cardX + col1W + col2W;

  let currentY = cardY + headerHeight + tableHeaderHeight;

  // Build row SVG elements
  let rowsSvg = "";
  if (partners.length === 0) {
    rowsSvg += `
      <rect x="${cardX}" y="${currentY}" width="${cardW}" height="${rowHeight}" fill="#FFFFFF"/>
      <line x1="${cardX}" y1="${currentY + rowHeight}" x2="${cardX + cardW}" y2="${currentY + rowHeight}" stroke="#E2E8F0" stroke-width="1"/>
      <text x="${cardX + cardW / 2}" y="${currentY + rowHeight / 2 + 6}" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="18" font-style="italic" fill="#64748B">No cases disbursed on this date</text>
    `;
    currentY += rowHeight;
  } else {
    partners.forEach((item, index) => {
      const isEven = index % 2 === 0;
      const bg = isEven ? "#FFFFFF" : "#F8FAFC";
      const partnerName = escapeXml(item.partnerName);
      const caseCount = Number(item.disbursedCaseCount).toLocaleString("en-IN");
      const srNo = index + 1;

      rowsSvg += `
        <rect x="${cardX}" y="${currentY}" width="${cardW}" height="${rowHeight}" fill="${bg}"/>
        <line x1="${cardX}" y1="${currentY + rowHeight}" x2="${cardX + cardW}" y2="${currentY + rowHeight}" stroke="#E2E8F0" stroke-width="1"/>
        <text x="${col1X + col1W / 2}" y="${currentY + rowHeight / 2 + 6}" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="17" font-weight="500" fill="#64748B">${srNo}</text>
        <text x="${col2X + 24}" y="${currentY + rowHeight / 2 + 6}" text-anchor="start" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="18" font-weight="600" fill="#1E293B">${partnerName}</text>
        <text x="${col3X + col3W - 32}" y="${currentY + rowHeight / 2 + 6}" text-anchor="end" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="19" font-weight="700" fill="#0F172A">${caseCount}</text>
      `;
      currentY += rowHeight;
    });
  }

  const totalCasesStr = Number(totalDisbursedCases).toLocaleString("en-IN");
  const displayDateStr = escapeXml(fullDisplayDate || reportDate);

  const svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="headerGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1E3A8A"/>
      <stop offset="100%" stop-color="#2563EB"/>
    </linearGradient>
    <clipPath id="cardClip">
      <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="14" ry="14"/>
    </clipPath>
  </defs>

  <!-- Canvas Background -->
  <rect width="100%" height="100%" fill="#F8FAFC"/>

  <!-- Card Container with Rounded Corners -->
  <g clip-path="url(#cardClip)">
    <!-- Card Base -->
    <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" fill="#FFFFFF"/>

    <!-- Header Banner -->
    <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${headerHeight}" fill="url(#headerGrad)"/>
    <text x="${cardX + cardW / 2}" y="${cardY + 62}" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="30" font-weight="800" fill="#FFFFFF" letter-spacing="1">DAILY DISBURSEMENT CASE COUNT</text>
    <text x="${cardX + cardW / 2}" y="${cardY + 104}" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="20" font-weight="600" fill="#BFDBFE">${displayDateStr}</text>

    <!-- Table Header -->
    <rect x="${cardX}" y="${cardY + headerHeight}" width="${cardW}" height="${tableHeaderHeight}" fill="#0F172A"/>
    <text x="${col1X + col1W / 2}" y="${cardY + headerHeight + tableHeaderHeight / 2 + 6}" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="17" font-weight="700" fill="#FFFFFF">Sr. No.</text>
    <text x="${col2X + 24}" y="${cardY + headerHeight + tableHeaderHeight / 2 + 6}" text-anchor="start" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="17" font-weight="700" fill="#FFFFFF">Partner Name</text>
    <text x="${col3X + col3W - 32}" y="${cardY + headerHeight + tableHeaderHeight / 2 + 6}" text-anchor="end" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="17" font-weight="700" fill="#FFFFFF">Cases</text>

    <!-- Data Rows -->
    ${rowsSvg}

    <!-- Total Disbursed Row (Highlighted) -->
    <rect x="${cardX}" y="${currentY}" width="${cardW}" height="${totalRowHeight}" fill="#DBEAFE"/>
    <line x1="${cardX}" y1="${currentY}" x2="${cardX + cardW}" y2="${currentY}" stroke="#1E3A8A" stroke-width="2.5"/>
    <line x1="${cardX}" y1="${currentY + totalRowHeight}" x2="${cardX + cardW}" y2="${currentY + totalRowHeight}" stroke="#1E3A8A" stroke-width="2.5"/>
    <text x="${col2X + 24}" y="${currentY + totalRowHeight / 2 + 7}" text-anchor="start" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="20" font-weight="800" fill="#1E3A8A" letter-spacing="0.5">TOTAL DISBURSED</text>
    <text x="${col3X + col3W - 32}" y="${currentY + totalRowHeight / 2 + 8}" text-anchor="end" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="24" font-weight="800" fill="#1E3A8A">${totalCasesStr}</text>

    <!-- Footer Branding -->
    <text x="${cardX + cardW / 2}" y="${currentY + totalRowHeight + footerHeight / 2 + 5}" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="14" font-weight="500" fill="#94A3B8">Fintree Finance Pvt. Ltd. • Automated WhatsApp Report</text>
  </g>

  <!-- Card Border -->
  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="14" ry="14" fill="none" stroke="#CBD5E1" stroke-width="1.5"/>
</svg>`;

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
  const maskedAdminNumber = maskPhoneNumber(config.adminNumber);

  // 4. Handle Dry Run / Test Mode / Missing Credentials
  const isCredentialsMissing = !config.accessToken || !config.adminNumber;

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

  if (!config.adminNumber) {
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

  // 5. Upload Image to WhatsApp / Alots.io
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

  // 6. Send the approved IMAGE template with date parameter {{1}}
  let sendResult = null;
  try {
    sendResult = await sendImageTemplateMessage({
      recipientNumber: config.adminNumber,
      mediaId,
      templateName: config.imageTemplateName,
      dateText: fullDisplayDate,
    });
  } catch (sendError) {
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
      errorMessage: sendError.message,
      apiResponse: sendError.apiResponse,
      triggeredBy,
    });
    throw sendError;
  }

  // 7. Log success
  await logReportAttempt({
    reportDate,
    reportType: IMAGE_REPORT_TYPE,
    status: "SUCCESS",
    partnerCount,
    totalCases: totalDisbursedCases,
    recipientMasked: maskedAdminNumber,
    fileName,
    filePath,
    mediaId,
    apiResponse: sendResult.rawResponse,
    triggeredBy,
  });

  console.log(`[WhatsAppDailyReport] Successfully completed WhatsApp IMAGE report dispatch for ${reportDate}`);

  return {
    success: true,
    date: reportDate,
    reportType: IMAGE_REPORT_TYPE,
    partnerCount,
    totalDisbursedCases,
    image: fileName,
    whatsappMediaUploaded: true,
    whatsappMessageSent: true,
    mediaId,
    template: config.imageTemplateName,
    recipient: maskedAdminNumber,
    message: "Daily disbursement case count image sent successfully",
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
      partnerCounts,
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

  const maskedAdminNumber = maskPhoneNumber(config.adminNumber);

  // 5. Handle Dry Run / Test Mode / Missing Credentials
  const isCredentialsMissing = !config.accessToken || !config.adminNumber;

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

  if (!config.adminNumber) {
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

  // 6. Upload file (Image in document format) to WhatsApp
  let mediaId = null;
  let uploadResponse = null;
  try {
    const uploadResult = await uploadWhatsAppDocument(fileToSendPath, fileToSendName);
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

  // 7. Send the approved 'countofcase' template with attached image document
  let sendResult = null;
  try {
    sendResult = await sendDocumentTemplateMessage({
      recipientNumber: config.adminNumber,
      mediaId,
      filename: fileToSendName,
      templateName: config.templateName,
    });
  } catch (sendError) {
    await logReportAttempt({
      reportDate,
      status: "FAILED_TEMPLATE_SEND",
      partnerCount,
      totalCases: totalDisbursedCases,
      recipientMasked: maskedAdminNumber,
      fileName: fileToSendName,
      filePath: fileToSendPath,
      mediaId,
      errorMessage: sendError.message,
      apiResponse: sendError.apiResponse,
      triggeredBy,
    });
    throw sendError;
  }

  // 8. Log success
  await logReportAttempt({
    reportDate,
    status: "SUCCESS",
    partnerCount,
    totalCases: totalDisbursedCases,
    recipientMasked: maskedAdminNumber,
    fileName: fileToSendName,
    filePath: fileToSendPath,
    mediaId,
    apiResponse: sendResult.rawResponse,
    triggeredBy,
  });

  console.log(
    `[WhatsAppDailyReport] Successfully completed WhatsApp report dispatch for ${reportDate} (Sent: ${fileToSendName} in document format)`
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
    file: fileToSendName,
    excelFile: excelName,
    imageFile: imgRes.fileName,
    documentFormat: sendExcel ? "EXCEL" : "IMAGE_IN_DOCUMENT_FORMAT",
    mediaUploadStatus: "SUCCESS",
    mediaId,
    whatsappMessageStatus: "SUCCESS",
    message: "Daily partner-wise disbursement case count image sent in document format successfully",
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
