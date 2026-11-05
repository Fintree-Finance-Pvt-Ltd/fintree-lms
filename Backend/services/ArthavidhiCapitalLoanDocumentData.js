const {fromArthavidhiBookingRecord}=require("./ArthavidhiCapitalAgreementStatus");
const dayjs = require("dayjs");
const {
  generateRepaymentScheduleArthavidhiCapital,
} = require("../utils/repaymentScheduleGenerator");

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

const formatDate = (value) => value && dayjs(value).isValid()
  ? dayjs(value).format("DD-MM-YYYY") : "";

const address = (loan, prefix) => [
  "address_line_1", "address_line_2", "village_city", "district", "state", "pincode",
].map((field) => loan[`${prefix}_${field}`]).filter(Boolean).join(", ");

// Build agreement and sanction data without persisting installments or changing
// the booked loan. The RPS generator must support { persist: false }.
async function getArthavidhiCapitalLoanDocumentData(db, lan) {
  const [[storedLoan]] = await db.query(
    `SELECT lb.*,
       (SELECT Disbursement_Date FROM ev_disbursement_utr
        WHERE LAN = lb.lan ORDER BY Disbursement_Date DESC LIMIT 1) AS utr_disbursement_date
     FROM loan_booking_arthavidhi lb WHERE lb.lan = ?`, [lan],
  );
  const loan=fromArthavidhiBookingRecord(storedLoan);
  if (!loan) return null;
  if (!["signing_pending","ops_initiate","approved","disburse_initiate","api approved","disbursed","fully paid"].includes(String(loan.status || "").toLowerCase())) {
    throw Object.assign(new Error("Save Arthavidhi final details before generating loan documents"), {status:409,code:"FINAL_TERMS_REQUIRED"});
  }
  if (!Number.isFinite(Number(loan.loan_amount)) || Number(loan.loan_amount) <= 0) {
    throw new Error("Arthavidhi Capital approved loan amount is required before generating documents");
  }
  if (typeof generateRepaymentScheduleArthavidhiCapital !== "function") {
    throw new Error("generateRepaymentScheduleArthavidhiCapital must be exported by utils/repaymentScheduleGenerator");
  }

  const todayParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const datePart = (name) => todayParts.find((part) => part.type === name).value;
  const today = `${datePart("year")}-${datePart("month")}-${datePart("day")}`;
  const agreementDate = loan.agreement_date || today;
  const schedule = await generateRepaymentScheduleArthavidhiCapital(
    null, loan.lan, loan.loan_amount, loan.interest_rate, loan.loan_tenure,
    loan.utr_disbursement_date || loan.disbursement_date || agreementDate, loan.product, loan.lender,
    { persist: false },
  );
  const rows = schedule?.rpsData;
  if (!Array.isArray(rows) || !rows.length) {
    throw new Error("Arthavidhi Capital repayment schedule is empty or invalid");
  }
  const totalInterest = rows.reduce((sum, row) => {
    const interest = Number(row.interest);
    if (row.interest === null || row.interest === undefined || row.interest === "" || !Number.isFinite(interest)) {
      throw new Error("Arthavidhi Capital repayment schedule contains invalid interest");
    }
    return sum + interest;
  }, 0);
  const processingFee = Number(loan.processing_fee || 0);
  const netDisbursal = Number(loan.disbursal_amount) > 0
    ? Number(loan.disbursal_amount) : Number(loan.loan_amount) - processingFee;
  const data = Object.fromEntries(Object.entries(loan).map(([key, value]) => [key.toUpperCase(), value]));
  Object.assign(data, {
    LAN: loan.lan,
    CUR_DATE: formatDate(agreementDate),
    CUSTOMER_NAME: loan.customer_name,
    DOB: formatDate(loan.borrower_dob || loan.dob),
    MOBILE_NUMBER: loan.mobile_number,
    EMAIL: loan.email,
    PAN_CARD: loan.pan_card,
    AADHAAR_NO: loan.aadhaar_no || loan.aadhaar_number || loan.aadhar_number,
    APPLICANT_DL: loan.driving_licence,
    PERMANENT_ADDRESS: address(loan, "permanent") || [loan.address_line_1,loan.address_line_2,loan.village,loan.district,loan.state,loan.pincode].filter(Boolean).join(", "),
    CURRENT_ADDRESS: address(loan, "current") || address(loan, "permanent") || [loan.address_line_1,loan.address_line_2,loan.village,loan.district,loan.state,loan.pincode].filter(Boolean).join(", "),
    BANK_NAME: loan.bank_name || loan.customer_bank_name,
    BANK_ACCOUNT_NUMBER: loan.account_number || loan.customer_account_number,
    BANK_IFSC_CODE: loan.ifsc || loan.bank_ifsc_code,
    BANK_ADDRESS: loan.bank_branch_address,
    LOAN_AMOUNT: Number(loan.loan_amount),
    TENURE: loan.loan_tenure,
    TENURE_UNIT: "months",
    REPAYMENT_FREQUENCY: "Monthly",
    NUMBER_OF_EMI: rows.length,
    ROI: loan.interest_rate,
    EMI_AMOUNT: schedule.emi,
    FIRST_DUE_DATE: formatDate(schedule.firstDueDate),
    AMOUNT_OF_EMI: schedule.emi,
    PROCESSING_FEE: processingFee,
    SUM_OF_PROCESSING_FEE: processingFee,
    SUM_OF_INTEREST: totalInterest,
    DISBURSAL_AMOUNT: netDisbursal,
    INSURANCE_CHARGES: loan.insurance_amount ?? loan.insurance_cost ?? 0,
    E_RIKSHAW_MODEL: loan.e_rikshaw_model,
    MANIFACTURING_YEAR: loan.manufacturing_year,
    SALE_INVOICE_NUMBER: loan.sales_invoice_number,
    SALE_INVOICE_DATE: formatDate(loan.sales_invoice_date),
    POLICY_ISSUED_DATE: formatDate(loan.policy_issued_date),
    STAMP_PAPER_NO: loan.stamp_paper_no,
    "CO_APPLICANT_NAME / GUARANTOR_NAME": [loan.co_applicant_name, loan.guarantor_name].filter(Boolean).join(" / "),
    ARTHAVIDHI_CAPITAL_LSP_LEGAL_NAME: loan.arthavidhi_capital_lsp_legal_name || process.env.ARTHAVIDHI_CAPITAL_LSP_LEGAL_NAME || "Arthavidhi Capital Private Limited",
    NODAL_NAME: loan.nodal_name || process.env.ARTHAVIDHI_CAPITAL_NODAL_NAME,
    NODAL_ADDRESS: loan.nodal_address || process.env.ARTHAVIDHI_CAPITAL_NODAL_ADDRESS,
    NODAL_CONTACT: loan.nodal_contact || process.env.ARTHAVIDHI_CAPITAL_NODAL_CONTACT,
    NODAL_EMAIL: loan.nodal_email || process.env.ARTHAVIDHI_CAPITAL_NODAL_EMAIL,
    // APR must come from the configured calculation, not the flat interest rate.
    APR_RATE: loan.apr_rate ?? loan.apr,
    CUST_FATHER_SPOUSE_NAME: loan.father_name,
    PERM_CITY: loan.permanent_village_city,
    PERM_DISTRICT: loan.permanent_district,
    PERM_PINCODE: loan.permanent_pincode,
    CURRENT_CITY: loan.current_village_city,
    CURRENT_DISTRICT: loan.current_district,
    CURRENT_PINCODE: loan.current_pincode,
  });
  for (const prefix of ["co_applicant", "guarantor"]) {
    data[`${prefix.toUpperCase()}_ADDRESS`] = address(loan, prefix);
    data[`${prefix.toUpperCase()}_DOB`] = formatDate(loan[`${prefix}_dob`]);
    data[`${prefix.toUpperCase()}_DL`] = loan[`${prefix}_driving_licence`];
    data[`${prefix.toUpperCase()}_AADHAAR_NO`] = loan[`${prefix}_aadhaar_no`] || loan[`${prefix}_aadhaar_number`] || loan[`${prefix}_aadhar`];
  }
  // Compatibility aliases used by the shared sanction-letter template.
  Object.assign(data, {
    lan: loan.lan, C_N: data.CUSTOMER_NAME, cur_add: data.CURRENT_ADDRESS,
    per_add: data.PERMANENT_ADDRESS, L_A: data.LOAN_AMOUNT, L_T: data.TENURE,
    I_R: data.ROI, I_S: data.SUM_OF_INTEREST, P_S: processingFee,
    B_Na: data.BANK_NAME, A_no: data.BANK_ACCOUNT_NUMBER, ifsc: data.BANK_IFSC_CODE,
    CU_date: data.CUR_DATE, ...rows[0],
    remaining_emi: rows[0].emi, remaining_interest: rows[0].interest,
    remaining_principal: rows[0].principal,
  });
  const escaped = Object.fromEntries(Object.entries(data).map(([key, value]) => [key, escapeHtml(value)]));
  escaped.RPS = rows;
  escaped.RPS_TABLE_ROWS = rows.map((row) => `<tr>${[
    row.emi_no, row.opening, row.principal, row.interest, row.emi, row.closing,
  ].map((value) => `<td>${escapeHtml(value)}</td>`).join("")}</tr>`).join("");
  escaped.RPS_ROWS = escaped.RPS_TABLE_ROWS;
  escaped.PROCESSING_FEE_PERCENTAGE = escapeHtml((processingFee * 100 / Number(loan.loan_amount)).toFixed(2));
  escaped.TOTAL_FEES_AND_CHARGES = escapeHtml((processingFee + Number(loan.insurance_amount || 0) + Number(loan.pre_emi_interest || 0)).toFixed(2));
  escaped.TOTAL_REPAYMENT_AMOUNT = escapeHtml((Number(loan.loan_amount) + totalInterest).toFixed(2));
  escaped.ARTHAVIDHI_REPAYMENT_ROWS = rows.map(row => `<tr>${[
    row.emi_no, formatDate(row.due_date), Number(row.principal).toFixed(2),
    Number(row.interest).toFixed(2), Number(row.emi).toFixed(2),
  ].map(value => `<td>${escapeHtml(value)}</td>`).join("")}</tr>`).join("");
  return escaped;
}

module.exports = { getArthavidhiCapitalLoanDocumentData };
