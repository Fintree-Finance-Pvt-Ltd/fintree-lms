// /**
//  * utils/exportConsumerBureauReport.js
//  * Standalone exporter for the Consumer Bureau Report (no template required).
//  * - Writes the exact 72 headers in the exact order (see HEADERS)
//  * - Groups rows by product (ProductOrder, ProductName) with a blank separator
//  * - Accepts rows where keys are either already the header texts OR internal keys
//  *   that you can map via HEADER_MAP (internalKey -> header text).
//  */
// const ExcelJS = require("exceljs");


// /** 72 headers — EXACT text required by your Excel spec */
// const HEADERS = [
//   "Consumer Name",
//   "Date of Birth",
//   "Gender",
//   "Income Tax ID Number",
//   "Passport Number",
//   "Passport Issue Date",
//   "Passport Expiry Date",
//   "Voter ID Number",
//   "Driving License Number",
//   "Driving License Issue Date",
//   "Driving License Expiry Date",
//   "Ration Card Number",
//   "Universal ID Number",
//   "Additional ID #1",
//   "Additional ID #2",
//   "Telephone No.Mobile",
//   "Telephone No.Residence",
//   "Telephone No.Office",
//   "Extension Office",
//   "Telephone No.Other ",
//   "Extension Other",
//   "Email ID 1",
//   "Email ID 2",

//   // Address 1
//   "Address Line 1",
//   "State Code 1",
//   "PIN Code 1",
//   "Address Category 1",
//   "Residence Code 1",

//   // Address 2
//   "Address Line 2",
//   "State Code 2",
//   "PIN Code 2",
//   "Address Category 2",
//   "Residence Code 2",

//   // Account / Member info
//   "Member Code",
//   "Member Short Name",
//   "Account Number",
//   "Account Type",
//   "Ownership Indicator",
//   "Date Opened/Disbursed",
//   "Date of Last Payment",
//   "Date Closed",
//   "Date Reported",
//   "High Credit/Sanctioned Amt",
//   "Current  Balance",           // note the double space after "Current"
//   "Amt Overdue",
//   "No of Days Past Due",

//   // Old account mapping
//   "Old Mbr Code",
//   "Old Mbr Short Name",
//   "Old Acc No",
//   "Old Acc Type",

//   // Status / Collateral / Limits
//   "Suit Filed / Wilful Default",
//   "Credit Facility Status",
//   "Asset Classification",
//   "Value of Collateral",
//   "Type of Collateral",
//   "Credit Limit",
//   "Cash Limit",

//   // Terms / Write-off / Behaviour / Income
//   "Rate of Interest",
//   "RepaymentTenure",
//   "EMI Amount",
//   "Written- off Amount (Total) ", // keep trailing space (as in your sheet)
//   "Written- off Principal Amount",
//   "Settlement Amt",
//   "Payment Frequency",
//   "Actual Payment Amt",
//   "Occupation Code",
//   "Income",
//   "Net/Gross Income Indicator",
//   "Monthly/Annual Income Indicator",
//   "CKYC",
//   "NREGA Card Number"
// ];

// /**
//  * Optional: if your stored procedure returns "internal" keys (e.g., consumer_name),
//  * map them to header texts here. If your SP already aliases to exact header strings,
//  * leave this object empty.
//  *
//  * Example:
//  *   consumer_name: "Consumer Name",
//  *   dob: "Date of Birth",
//  */
// const HEADER_MAP = {
//   // Identity
//   consumer_name: "Consumer Name",
//   date_of_birth: "Date of Birth",
//   gender: "Gender",
//   income_tax_id_number: "Income Tax ID Number",
//   passport_number: "Passport Number",
//   passport_issue_date: "Passport Issue Date",
//   passport_expiry_date: "Passport Expiry Date",
//   voter_id_number: "Voter ID Number",
//   driving_license_number: "Driving License Number",
//   driving_license_issue_date: "Driving License Issue Date",
//   driving_license_expiry_date: "Driving License Expiry Date",
//   ration_card_number: "Ration Card Number",
//   universal_id_number: "Universal ID Number",
//   additional_id_1: "Additional ID #1",
//   additional_id_2: "Additional ID #2",

//   // Contact
//   telephone_no_mobile: "Telephone No.Mobile",
//   telephone_no_residence: "Telephone No.Residence",
//   telephone_no_office: "Telephone No.Office",
//   extension_office: "Extension Office",
//   telephone_no_other: "Telephone No.Other ",            // note trailing space
//   extension_other: "Extension Other",
//   email_id_1: "Email ID 1",
//   email_id_2: "Email ID 2",

//   // Address 1
//   address_line_1: "Address Line 1",
//   state_code_1: "State Code 1",
//   pin_code_1: "PIN Code 1",
//   address_category_1: "Address Category 1",
//   residence_code_1: "Residence Code 1",

//   // Address 2
//   address_line_2: "Address Line 2",
//   state_code_2: "State Code 2",
//   pin_code_2: "PIN Code 2",
//   address_category_2: "Address Category 2",
//   residence_code_2: "Residence Code 2",

//   // Member / Account
//   member_code: "Member Code",
//   member_short_name: "Member Short Name",
//   account_number: "Account Number",
//   account_type: "Account Type",
//   ownership_indicator: "Ownership Indicator",
//   date_opened_disbursed: "Date Opened/Disbursed",
//   date_of_last_payment: "Date of Last Payment",
//   date_closed: "Date Closed",
//   date_reported: "Date Reported",
//   high_credit_sanctioned_amt: "High Credit/Sanctioned Amt",
//   current_balance: "Current  Balance",                   // note double space between Current and Balance
//   amount_overdue: "Amt Overdue",
//   no_of_days_past_due: "No of Days Past Due",

//   // Old account mapping
//   old_mbr_code: "Old Mbr Code",
//   old_mbr_short_name: "Old Mbr Short Name",
//   old_acc_no: "Old Acc No",
//   old_acc_type: "Old Acc Type",

//   // Status / Collateral / Limits
//   suit_filed_or_wilful_default: "Suit Filed / Wilful Default",
//   credit_facility_status: "Credit Facility Status",
//   asset_classification: "Asset Classification",
//   value_of_collateral: "Value of Collateral",
//   type_of_collateral: "Type of Collateral",
//   credit_limit: "Credit Limit",
//   cash_limit: "Cash Limit",

//   // Terms / Write-off / Behaviour / Income
//   rate_of_interest: "Rate of Interest",
//   repayment_tenure: "RepaymentTenure",
//   emi_amount: "EMI Amount",
//   written_off_amount_total: "Written- off Amount (Total) ", // keep trailing space
//   written_off_principal_amount: "Written- off Principal Amount",
//   settlement_amount: "Settlement Amt",
//   payment_frequency: "Payment Frequency",
//   actual_payment_amount: "Actual Payment Amt",
//   occupation_code: "Occupation Code",
//   income_amount: "Income",
//   net_gross_income_indicator: "Net/Gross Income Indicator",
//   monthly_annual_income_indicator: "Monthly/Annual Income Indicator",
//   ckyc: "CKYC",
//   nrega_card_number: "NREGA Card Number",

//   // (Helper fields, not exported; included here in case you pass them through)
//   // product_name: "ProductName",        // not part of HEADERS; used for grouping only
//   // product_order: "ProductOrder"       // not part of HEADERS; used for grouping only
// };


// function buildReverseMap(headerMap) {
//   const reverse = {};
//   for (const [dbKey, header] of Object.entries(headerMap)) {
//     reverse[header] = dbKey;
//   }
//   return reverse;
// }

// function autofitColumns(ws) {
//   ws.columns.forEach((col) => {
//     let maxLen = 10;
//     col.eachCell({ includeEmpty: true }, (cell) => {
//       const v =
//         cell.value == null
//           ? ""
//           : typeof cell.value === "object" && cell.value.text
//           ? cell.value.text
//           : String(cell.value);
//       maxLen = Math.max(maxLen, v.length + 2);
//     });
//     col.width = Math.min(maxLen, 60);
//   });
// }

// /**
//  * Export consolidated Consumer Bureau report.
//  *
//  * @param {Array<Object>} rows
//  *   Each row represents one loan as-of the requested endDate.
//  *   Expect two helper fields for grouping (NOT exported):
//  *     - ProductName  (e.g., "Adikosh", "GQ FSF", ...)
//  *     - ProductOrder (1,2,3,...)  // decides the product sequence
//  *   For the actual output columns:
//  *     - Either the row already has keys named EXACTLY as HEADERS
//  *     - Or you provide internal keys and map them via HEADER_MAP
//  *
//  * @param {string} filePath  Output .xlsx path
//  */
// async function exportConsumerBureauReport(rows, filePath) {
//   if (!Array.isArray(rows) || rows.length === 0) {
//     throw new Error("No rows to export");
//   }

//   const reverseMap = buildReverseMap(HEADER_MAP);

//   const wb = new ExcelJS.Workbook();
//   const ws = wb.addWorksheet("Data Submission Form");

//   // header row
//   ws.addRow(HEADERS);
//   ws.getRow(1).font = { bold: true };

//   // group/sort by product
//   rows.sort((a, b) => {
//     const o = (a.ProductOrder || 999) - (b.ProductOrder || 999);
//     if (o !== 0) return o;
//     const an = String(a.ProductName || "");
//     const bn = String(b.ProductName || "");
//     return an.localeCompare(bn);
//   });

//   let lastProduct = null;

//   for (const row of rows) {
//     // insert a blank row when product changes (visual separation)
//     if (lastProduct !== null && row.ProductName !== lastProduct) {
//       ws.addRow(HEADERS.map(() => ""));
//     }
//     lastProduct = row.ProductName;

//     // write values strictly in HEADERS order
//     const out = HEADERS.map((h) => {
//       // prefer exact header key on the row
//       if (Object.prototype.hasOwnProperty.call(row, h)) return row[h];

//       // else look up internal key mapped to this header
//       const internalKey = reverseMap[h];
//       return internalKey ? (row[internalKey] ?? "") : "";
//     });

//     ws.addRow(out);
//   }

//   autofitColumns(ws);
//   await wb.xlsx.writeFile(filePath);
// }

// module.exports = exportConsumerBureauReport;





/**
 * utils/exportConsumerBureauReport.js
 * Clean version with DATE-ONLY formatting fix.
 */

const ExcelJS = require("exceljs");

/** 72 headers — EXACT text required by your Excel spec */
const HEADERS = [
  "Consumer Name", "Date of Birth", "Gender", "Income Tax ID Number",
  "Passport Number", "Passport Issue Date", "Passport Expiry Date",
  "Voter ID Number", "Driving License Number", "Driving License Issue Date",
  "Driving License Expiry Date", "Ration Card Number", "Universal ID Number",
  "Additional ID #1", "Additional ID #2", "Telephone No.Mobile",
  "Telephone No.Residence", "Telephone No.Office", "Extension Office",
  "Telephone No.Other ", "Extension Other", "Email ID 1", "Email ID 2",
  "Address Line 1", "State Code 1", "PIN Code 1", "Address Category 1",
  "Residence Code 1", "Address Line 2", "State Code 2", "PIN Code 2",
  "Address Category 2", "Residence Code 2", "Member Code", "Member Short Name",
  "Account Number", "Account Type", "Ownership Indicator",
  "Date Opened/Disbursed", "Date of Last Payment", "Date Closed",
  "Date Reported", "High Credit/Sanctioned Amt", "Current  Balance",
  "Amt Overdue", "No of Days Past Due", "Old Mbr Code", "Old Mbr Short Name",
  "Old Acc No", "Old Acc Type", "Suit Filed / Wilful Default",
  "Credit Facility Status", "Asset Classification", "Value of Collateral",
  "Type of Collateral", "Credit Limit", "Cash Limit", "Rate of Interest",
  "RepaymentTenure", "EMI Amount", "Written- off Amount (Total) ",
  "Written- off Principal Amount", "Settlement Amt", "Payment Frequency",
  "Actual Payment Amt", "Occupation Code", "Income",
  "Net/Gross Income Indicator", "Monthly/Annual Income Indicator",
  "CKYC", "NREGA Card Number"
];

/** header mapping if SP returns internal keys */
const HEADER_MAP = {
  consumer_name: "Consumer Name",
  date_of_birth: "Date of Birth",
  gender: "Gender",
  income_tax_id_number: "Income Tax ID Number",
  passport_number: "Passport Number",
  passport_issue_date: "Passport Issue Date",
  passport_expiry_date: "Passport Expiry Date",
  voter_id_number: "Voter ID Number",
  driving_license_number: "Driving License Number",
  driving_license_issue_date: "Driving License Issue Date",
  driving_license_expiry_date: "Driving License Expiry Date",
  ration_card_number: "Ration Card Number",
  universal_id_number: "Universal ID Number",
  additional_id_1: "Additional ID #1",
  additional_id_2: "Additional ID #2",
  telephone_no_mobile: "Telephone No.Mobile",
  telephone_no_residence: "Telephone No.Residence",
  telephone_no_office: "Telephone No.Office",
  extension_office: "Extension Office",
  telephone_no_other: "Telephone No.Other ",
  extension_other: "Extension Other",
  email_id_1: "Email ID 1",
  email_id_2: "Email ID 2",
  address_line_1: "Address Line 1",
  state_code_1: "State Code 1",
  pin_code_1: "PIN Code 1",
  address_category_1: "Address Category 1",
  residence_code_1: "Residence Code 1",
  address_line_2: "Address Line 2",
  state_code_2: "State Code 2",
  pin_code_2: "PIN Code 2",
  address_category_2: "Address Category 2",
  residence_code_2: "Residence Code 2",
  member_code: "Member Code",
  member_short_name: "Member Short Name",
  account_number: "Account Number",
  account_type: "Account Type",
  ownership_indicator: "Ownership Indicator",
  date_opened_disbursed: "Date Opened/Disbursed",
  date_of_last_payment: "Date of Last Payment",
  date_closed: "Date Closed",
  date_reported: "Date Reported",
  high_credit_sanctioned_amt: "High Credit/Sanctioned Amt",
  current_balance: "Current  Balance",
  amount_overdue: "Amt Overdue",
  no_of_days_past_due: "No of Days Past Due",
  old_mbr_code: "Old Mbr Code",
  old_mbr_short_name: "Old Mbr Short Name",
  old_acc_no: "Old Acc No",
  old_acc_type: "Old Acc Type",
  suit_filed_or_wilful_default: "Suit Filed / Wilful Default",
  credit_facility_status: "Credit Facility Status",
  asset_classification: "Asset Classification",
  value_of_collateral: "Value of Collateral",
  type_of_collateral: "Type of Collateral",
  credit_limit: "Credit Limit",
  cash_limit: "Cash Limit",
  rate_of_interest: "Rate of Interest",
  repayment_tenure: "RepaymentTenure",
  emi_amount: "EMI Amount",
  written_off_amount_total: "Written- off Amount (Total) ",
  written_off_principal_amount: "Written- off Principal Amount",
  settlement_amount: "Settlement Amt",
  payment_frequency: "Payment Frequency",
  actual_payment_amount: "Actual Payment Amt",
  occupation_code: "Occupation Code",
  income_amount: "Income",
  net_gross_income_indicator: "Net/Gross Income Indicator",
  monthly_annual_income_indicator: "Monthly/Annual Income Indicator",
  ckyc: "CKYC",
  nrega_card_number: "NREGA Card Number"
};

/* ---------- helpers ---------- */
function buildReverseMap(map) {
  const r = {};
  for (const [k, v] of Object.entries(map)) r[v] = k;
  return r;
}

function autofitColumns(ws) {
  ws.columns.forEach((col) => {
    let maxLen = 10;
    col.eachCell({ includeEmpty: true }, (cell) => {
      const v =
        cell.value == null
          ? ""
          : typeof cell.value === "object" && cell.value.text
          ? cell.value.text
          : String(cell.value);
      maxLen = Math.max(maxLen, v.length + 2);
    });
    col.width = Math.min(maxLen, 60);
  });
}

/* === NEW: format date-only fields === */
function formatDateOnly(value) {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d)) return value; // already string or invalid
  return d.toISOString().slice(0, 10); // yyyy-mm-dd
}

const DATE_HEADERS = new Set([
  "Date of Birth", "Passport Issue Date", "Passport Expiry Date",
  "Driving License Issue Date", "Driving License Expiry Date",
  "Date Opened/Disbursed", "Date of Last Payment", "Date Closed", "Date Reported"
]);

/**
 * Export consolidated Consumer Bureau report (DATE-ONLY safe)
 */
async function exportConsumerBureauReport(rows, filePath) {
  if (!Array.isArray(rows) || rows.length === 0)
    throw new Error("No rows to export");

  const reverseMap = buildReverseMap(HEADER_MAP);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Data Submission Form");

  // header
  ws.addRow(HEADERS);
  ws.getRow(1).font = { bold: true };

  // sort & group by product
  rows.sort((a, b) => {
    const o = (a.ProductOrder || 999) - (b.ProductOrder || 999);
    if (o !== 0) return o;
    return String(a.ProductName || "").localeCompare(String(b.ProductName || ""));
  });

  let lastProduct = null;

  for (const row of rows) {
    if (lastProduct !== null && row.ProductName !== lastProduct)
      ws.addRow(HEADERS.map(() => "")); // blank separator
    lastProduct = row.ProductName;

    // ensure strict header order and date formatting
    const out = HEADERS.map((h) => {
      let val;
      if (Object.prototype.hasOwnProperty.call(row, h)) {
        val = row[h];
      } else {
        const internalKey = reverseMap[h];
        val = internalKey ? row[internalKey] ?? "" : "";
      }
      if (DATE_HEADERS.has(h) && val) val = formatDateOnly(val);
      return val;
    });

    ws.addRow(out);
  }

  autofitColumns(ws);
  await wb.xlsx.writeFile(filePath);
}

module.exports = exportConsumerBureauReport;