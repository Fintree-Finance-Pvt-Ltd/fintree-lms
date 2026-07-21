const fs = require("fs");
const path = require("path");
const db = require("../config/db");
const dayjs = require("dayjs");
const puppeteer = require("puppeteer");
const { getLoanContext } = require("../utils/lanHelper");
const Handlebars = require("handlebars");

/* ======================================================
   TEMPLATE LOADER
====================================================== */
function loadTemplate(filename) {
  const filePath = path.join(__dirname, "../templates", filename);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Template not found: ${filePath}`);
  }
  return fs.readFileSync(filePath, "utf-8");
}

/* ======================================================
   TEMPLATE FILL
====================================================== */
function fillTemplate(html, data) {
  return html.replace(/{{\s*(.*?)\s*}}/g, (_, key) => {
    return data[key] ?? "";
  });
}

/* ======================================================
   NUMBER TO WORDS
====================================================== */
function numberToWords(num) {
  if (!num || num === 0) return "Zero Rupees Only";

  const a = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven",
    "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen",
    "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"
  ];
  const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  const convert = (n) => {
    if (n < 20) return a[n];
    if (n < 100) return b[Math.floor(n / 10)] + (n % 10 ? " " + a[n % 10] : "");
    if (n < 1000) return a[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " + convert(n % 100) : "");
    if (n < 100000) return convert(Math.floor(n / 1000)) + " Thousand" + (n % 1000 ? " " + convert(n % 1000) : "");
    if (n < 10000000) return convert(Math.floor(n / 100000)) + " Lakh" + (n % 100000 ? " " + convert(n % 100000) : "");
    return convert(Math.floor(n / 10000000)) + " Crore";
  };

  return convert(Number(num));
}

function formatCcbDate(value) {
  if (!value) return "";

  const date = dayjs(value);

  return date.isValid() ? date.format("DD/MM/YYYY") : "";
}

function formatCcbAmount(value) {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return String(value);
  }

  return amount.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatCcbPercentage(value) {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  const percentage = Number(value);

  return Number.isFinite(percentage)
    ? percentage.toFixed(2)
    : String(value);
}

function ccbAmountInWords(value) {
  const amount = Number(value || 0);

  if (!Number.isFinite(amount) || amount <= 0) {
    return "";
  }

  return numberToWords(Math.round(amount));
}

function buildCcbAddress(parts = []) {
  return parts
    .map((value) => {
      return value === null || value === undefined
        ? ""
        : String(value).trim();
    })
    .filter(Boolean)
    .join(", ");
}

function parseTemplateDataJson(value) {
  if (!value) return {};

  if (typeof value === "object") {
    return value;
  }

  try {
    const parsed = JSON.parse(value);

    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (err) {
    console.error("Invalid CCB template_data_json:", err.message);
    return {};
  }
}

async function getClaimCureBuddyLoanData(lan) {
  const [bookingRows] = await db.promise().query(
    `
    SELECT *
    FROM loan_booking_claim_cure_buddy
    WHERE lan = ?
    `,
    [lan],
  );

  if (!bookingRows.length) {
    return null;
  }

  const [summaryRows] = await db.promise().query(
    `
    SELECT *
    FROM claim_cure_buddy_loan_summary
    WHERE lan = ?
    `,
    [lan],
  );

  if (!summaryRows.length) {
    return null;
  }

  const [coApplicantRows] = await db.promise().query(
    `
    SELECT
      party_no,
      customer_name,
      first_name,
      last_name,
      email,
      mobile_number,
      address_line_1,
      address_line_2,
      city,
      district,
      state,
      pincode
    FROM claim_cure_buddy_co_applicants
    WHERE lan = ?
    ORDER BY party_no ASC
    `,
    [lan],
  );

  const booking = bookingRows[0];
  const summary = summaryRows[0];
  const extra = parseTemplateDataJson(summary.template_data_json);

  const extraValue = (key, fallback = "") => {
    return extra[key] !== null && extra[key] !== undefined
      ? extra[key]
      : fallback;
  };

  const borrowerName =
    booking.customer_name ||
    [booking.first_name, booking.last_name].filter(Boolean).join(" ");

  const currentAddress = buildCcbAddress([
    booking.current_address_line_1,
    booking.current_address_line_2,
    booking.current_city,
    booking.current_district,
    booking.current_state,
    booking.current_pincode,
  ]);

  const permanentAddress = buildCcbAddress([
    booking.permanent_address_line_1,
    booking.permanent_address_line_2,
    booking.permanent_city,
    booking.permanent_district,
    booking.permanent_state,
    booking.permanent_pincode,
  ]);

  const borrowerAddress = currentAddress || permanentAddress;

  const coBorrowerNames =
    coApplicantRows
      .map((row) => {
        return (
          row.customer_name ||
          [row.first_name, row.last_name].filter(Boolean).join(" ")
        );
      })
      .filter(Boolean)
      .join(", ") || "NA";

  const coBorrowerAddresses =
    coApplicantRows
      .map((row) => {
        const address = buildCcbAddress([
          row.address_line_1,
          row.address_line_2,
          row.city,
          row.district,
          row.state,
          row.pincode,
        ]);

        return address ? `Co-applicant ${row.party_no}: ${address}` : "";
      })
      .filter(Boolean)
      .join("; ") || "NA";

  const loanAmount = Number(booking.loan_amount || 0);
  const processingFee = Number(booking.processing_fee || 0);
  const totalInterest = Number(summary.total_interest_amount || 0);

  const netDisbursedAmount = Number(
    booking.disbursal_amount || loanAmount - processingFee,
  );

  const totalRepaymentAmount = Number(
    summary.total_repayment_amount || loanAmount + totalInterest,
  );

  const installmentAmount = Number(
    summary.installment_amount || totalRepaymentAmount,
  );

  const calculatedProcessingFeePercentage =
    loanAmount > 0 ? (processingFee / loanAmount) * 100 : 0;

  const processingFeePercentage =
    summary.processing_fee_percentage ??
    calculatedProcessingFeePercentage;

  const totalFees = Number(
    summary.total_fees_and_charges || processingFee,
  );

  const agreementDate = formatCcbDate(
    summary.agreement_date || booking.login_date,
  );

  const repaymentDate = formatCcbDate(summary.repayment_date);

  return {
    AGREEMENT_REFERENCE:
      summary.agreement_reference || `AGR-${lan}`,

    AGREEMENT_DATE: agreementDate,
    AGREEMENT_PLACE: summary.agreement_place || "",

    APPLICATION_NUMBER: booking.application_id || "",
    LOAN_ACCOUNT_NUMBER: booking.lan || "",

    DOCUMENT_GENERATED_AT:
      `${dayjs().format("DD/MM/YYYY HH:mm:ss")} IST`,

    LSP_NAME: extraValue(
      "LSP_NAME",
      process.env.CCB_LSP_NAME || "ClaimCureBuddy India Private Limited",
    ),

    LSP_NAME_HI: extraValue(
      "LSP_NAME_HI",
      process.env.CCB_LSP_NAME_HI || "",
    ),

    LSP_PLATFORM_NAME: extraValue(
      "LSP_PLATFORM_NAME",
      process.env.CCB_PLATFORM_NAME || "ClaimCureBuddy",
    ),

    LSP_PLATFORM_NAME_HI: extraValue(
      "LSP_PLATFORM_NAME_HI",
      process.env.CCB_PLATFORM_NAME_HI || "",
    ),

    LSP_GRIEVANCE_OFFICER_NAME: extraValue(
      "LSP_GRIEVANCE_OFFICER_NAME",
      process.env.CCB_GRIEVANCE_OFFICER_NAME || "",
    ),

    LSP_GRIEVANCE_ADDRESS: extraValue(
      "LSP_GRIEVANCE_ADDRESS",
      process.env.CCB_GRIEVANCE_ADDRESS || "",
    ),

    LSP_GRIEVANCE_PHONE: extraValue(
      "LSP_GRIEVANCE_PHONE",
      process.env.CCB_GRIEVANCE_PHONE || "",
    ),

    LSP_GRIEVANCE_EMAIL: extraValue(
      "LSP_GRIEVANCE_EMAIL",
      process.env.CCB_GRIEVANCE_EMAIL || "",
    ),

    BORROWER_NAME: borrowerName,
    BORROWER_ADDRESS: borrowerAddress,

    CO_BORROWER_NAMES: coBorrowerNames,
    CO_BORROWER_ADDRESSES: coBorrowerAddresses,

    BORROWER_SIGNATURE_REFERENCE: extraValue(
      "BORROWER_SIGNATURE_REFERENCE",
      "Aadhaar eSign through Doqfy",
    ),

    LOAN_PRODUCT: extraValue(
      "LOAN_PRODUCT",
      booking.product || "ClaimCureBuddy",
    ),

    LOAN_PURPOSE: summary.loan_purpose || "Medical expenses",
    LOAN_PURPOSE_HI: summary.loan_purpose_hi || "",

    SANCTIONED_LOAN_AMOUNT: formatCcbAmount(loanAmount),

    SANCTIONED_LOAN_AMOUNT_IN_WORDS:
      ccbAmountInWords(loanAmount),

    SANCTIONED_LOAN_AMOUNT_IN_WORDS_HI:
      summary.sanctioned_amount_in_words_hi || "",

    NET_DISBURSED_AMOUNT:
      formatCcbAmount(netDisbursedAmount),

    NET_DISBURSED_AMOUNT_IN_WORDS:
      ccbAmountInWords(netDisbursedAmount),

    NET_DISBURSED_AMOUNT_IN_WORDS_HI:
      summary.net_disbursed_amount_in_words_hi || "",

    LOAN_TERM:
      summary.loan_term_display ||
      (booking.loan_tenure
        ? `${booking.loan_tenure} Days`
        : ""),

    INTEREST_RATE:
      formatCcbPercentage(booking.interest_rate),

    INTEREST_RATE_TYPE:
      extraValue("INTEREST_RATE_TYPE", "Fixed"),

    APR: formatCcbPercentage(summary.apr),

    TOTAL_INTEREST_AMOUNT:
      formatCcbAmount(totalInterest),

    TOTAL_REPAYMENT_AMOUNT:
      formatCcbAmount(totalRepaymentAmount),

    DISBURSAL_PERCENTAGE:
      extraValue("DISBURSAL_PERCENTAGE", "100% upfront"),

    DISBURSAL_CLAUSE_NUMBER:
      extraValue("DISBURSAL_CLAUSE_NUMBER", "6"),

    DISBURSAL_SCHEDULE_DESCRIPTION:
      extraValue(
        "DISBURSAL_SCHEDULE_DESCRIPTION",
        "100% upfront after completion of conditions precedent",
      ),

    DISBURSEMENT_DATE:
      formatCcbDate(summary.disbursement_date),

    DISBURSEMENT_REQUEST_DATE:
      formatCcbDate(summary.disbursement_request_date),

    DISBURSEMENT_MODE:
      summary.disbursement_mode || "",

    DISBURSEMENT_TRANSACTION_REFERENCE:
      summary.disbursement_transaction_reference || "",

    PAYEE_NAME:
      booking.customer_name_as_per_bank || borrowerName,

    BANK_NAME: booking.customer_bank_name || "",
    BANK_ACCOUNT_NUMBER: booking.customer_account_number || "",
    BANK_IFSC_CODE: booking.bank_ifsc_code || "",

    INSTALLMENT_TYPE: "Bullet repayment",
    NUMBER_OF_INSTALLMENTS: "1",

    INSTALLMENT_AMOUNT:
      formatCcbAmount(installmentAmount),

    REPAYMENT_START_DATE: repaymentDate,

    PRINCIPAL_INSTALLMENT_COUNT: "1",
    CAPITALISED_INTEREST_INSTALLMENT_COUNT: "0",

    INSTALLMENT_DUE_DATE_DESCRIPTION:
      repaymentDate ? `On or before ${repaymentDate}` : "",

    REPAYMENT_SCHEDULE: [
      {
        SERIAL_NUMBER: "1",
        REPAYMENT_DATE: repaymentDate,
        PRINCIPAL_AMOUNT: formatCcbAmount(loanAmount),
        INTEREST_AMOUNT: formatCcbAmount(totalInterest),
        TOTAL_INSTALLMENT: formatCcbAmount(installmentAmount),
      },
    ],

    PROCESSING_FEE_FREQUENCY: "One-time",

    PROCESSING_FEE_AMOUNT:
      formatCcbAmount(processingFee),

    PROCESSING_FEE_PERCENTAGE:
      formatCcbPercentage(processingFeePercentage),

    PROCESSING_FEE_THIRD_PARTY_FREQUENCY:
      extraValue("PROCESSING_FEE_THIRD_PARTY_FREQUENCY", "NA"),

    PROCESSING_FEE_THIRD_PARTY_AMOUNT:
      extraValue("PROCESSING_FEE_THIRD_PARTY_AMOUNT", "0.00"),

    INSURANCE_FEE_FREQUENCY:
      extraValue("INSURANCE_FEE_FREQUENCY", "NA"),

    INSURANCE_FEE_AMOUNT:
      formatCcbAmount(summary.insurance_fee_amount || 0),

    INSURANCE_THIRD_PARTY_FREQUENCY:
      extraValue("INSURANCE_THIRD_PARTY_FREQUENCY", "NA"),

    INSURANCE_THIRD_PARTY_AMOUNT:
      extraValue("INSURANCE_THIRD_PARTY_AMOUNT", "0.00"),

    STAMP_DUTY_FREQUENCY:
      extraValue("STAMP_DUTY_FREQUENCY", "One-time"),

    STAMP_DUTY_AMOUNT:
      formatCcbAmount(summary.stamp_duty_amount || 0),

    STAMP_DUTY_THIRD_PARTY_FREQUENCY:
      extraValue("STAMP_DUTY_THIRD_PARTY_FREQUENCY", "NA"),

    STAMP_DUTY_THIRD_PARTY_AMOUNT:
      extraValue("STAMP_DUTY_THIRD_PARTY_AMOUNT", "0.00"),

    TOTAL_FEES_AND_CHARGES:
      formatCcbAmount(totalFees),

    LENDER_CHARGES:
      formatCcbAmount(totalFees),

    THIRD_PARTY_CHARGES:
      formatCcbAmount(summary.third_party_charges || 0),

    PENAL_CHARGE: summary.penal_charge || "",
    OTHER_PENAL_CHARGE: summary.other_penal_charge || "",
    COOLING_OFF_PERIOD: summary.cooling_off_period || "",

    RECOVERY_AGENT_CLAUSE_NUMBER:
      extraValue("RECOVERY_AGENT_CLAUSE_NUMBER", "16"),

    GRIEVANCE_CLAUSE_NUMBER:
      extraValue("GRIEVANCE_CLAUSE_NUMBER", "15"),

    PROMISSORY_NOTE_DATE:
      extraValue("PROMISSORY_NOTE_DATE", agreementDate),

    WITNESS_NAME: extraValue("WITNESS_NAME"),
    WITNESS_ADDRESS: extraValue("WITNESS_ADDRESS"),

    WITNESS_SIGNATURE_REFERENCE:
      extraValue("WITNESS_SIGNATURE_REFERENCE"),

    ACCEPTANCE_DATE:
      extraValue("ACCEPTANCE_DATE", agreementDate),

    DIGITALLY_ACCEPTED_BY:
      extraValue("DIGITALLY_ACCEPTED_BY", borrowerName),

    ACCEPTANCE_MODE: extraValue("ACCEPTANCE_MODE", "OTP"),
    ACCEPTANCE_TIMESTAMP: extraValue("ACCEPTANCE_TIMESTAMP"),
    ACCEPTANCE_IP_ADDRESS: extraValue("ACCEPTANCE_IP_ADDRESS"),
    ACCEPTANCE_REFERENCE: extraValue("ACCEPTANCE_REFERENCE"),

    VERNACULAR_LANGUAGE: extraValue("VERNACULAR_LANGUAGE"),
    VERNACULAR_EMPLOYEE_NAME:
      extraValue("VERNACULAR_EMPLOYEE_NAME"),
    VERNACULAR_EMPLOYEE_ADDRESS:
      extraValue("VERNACULAR_EMPLOYEE_ADDRESS"),

    VERNACULAR_EMPLOYEE_SIGNATURE_REFERENCE:
      extraValue("VERNACULAR_EMPLOYEE_SIGNATURE_REFERENCE"),

    BRANCH_SIGNATURE_REFERENCE:
      extraValue("BRANCH_SIGNATURE_REFERENCE"),

    VERNACULAR_DECLARATION_DATE:
      extraValue("VERNACULAR_DECLARATION_DATE", agreementDate),

    END_USE_UNDERTAKING_DATE:
      extraValue("END_USE_UNDERTAKING_DATE", agreementDate),

    CONSENT_DATE:
      extraValue("CONSENT_DATE", agreementDate),
  };
}


async function getLoanData(lan) {
  const { summaryTable, rpsTable } = getLoanContext(lan);

  if (summaryTable === "claim_cure_buddy_loan_summary") {
  return getClaimCureBuddyLoanData(lan);
}

  let summaryRows = [];
  let rpsRows = [];

  let RPS_ROWS = "";
  let RPS_TABLE_ROWS = "";
  // ===============================
  // CLAYYO SUMMARY
  // ===============================
  if (summaryTable === "clayyo_loan_summary") {
    const [rows] = await db.promise().query(
      `
      SELECT
        LAN,
        CUST_NAME,
        PER_ADD,
        FINAL_LIMIT,
        CUST_PAN,
        CUST_AGE,
        HOSPITAL_NAME,
        CUST_BANK,
        CUST_ACC_NO,
        DATE_FORMAT(CUR_DATE,'%d-%m-%Y') AS CUR_DATE
      FROM clayyo_loan_summary
      WHERE LAN = ?
      `,
      [lan]
    );

    summaryRows = rows;

  } 
  // ===============================
  // MOTION CORP SUMMARY
  // ===============================
  else if (summaryTable === "motioncorp_loan_summary") {
    const [rows] = await db.promise().query(
      `
      SELECT *
      FROM motioncorp_loan_summary
      WHERE LAN = ?
      `,
      [lan]
    );

    summaryRows = rows;

    const [rps] = await db.promise().query(
      `
      SELECT
        emi_no,
        opening,
        principal,
        interest,
        emi,
        closing,
        remaining_emi,
        remaining_interest,
        remaining_principal
      FROM loan_rps_motioncorp
      WHERE TRIM(lan) = TRIM(?)
      ORDER BY emi_no ASC
      `,
      [lan]
    );

    rpsRows = rps;

    RPS_TABLE_ROWS = rpsRows
      .map((row) => `
        <tr>
          <td>${row.emi_no ?? ""}</td>
          <td>${Number(row.opening || 0).toFixed(2)}</td>
          <td>${Number(row.principal || 0).toFixed(2)}</td>
          <td>${Number(row.interest || 0).toFixed(2)}</td>
          <td>${Number(row.emi || 0).toFixed(2)}</td>
          <td>${Number(row.closing || 0).toFixed(2)}</td>
        </tr>
      `)
      .join("");

    // Keep this also for backward compatibility
    RPS_ROWS = RPS_TABLE_ROWS;
  }
  else {
    // ===============================
    // EXISTING CLIENTS (UNCHANGED)
    // ===============================
    const [rows] = await db.promise().query(
      `
      SELECT
        lan, C_N, cur_add, per_add,
        L_A, I_R, L_T,
        B_Na, A_no, ifsc,
        DATE_FORMAT(L_date,'%d-%m-%Y') AS L_date,
        E_S, I_S, P_S, T_E, L_P
      FROM ${summaryTable}
      WHERE lan = ?
      `,
      [lan]
    );

    summaryRows = rows;

    if (rpsTable) {
      const [rps] = await db.promise().query(
        `
        SELECT id, emi, interest, principal, opening, closing
        FROM ${rpsTable}
        WHERE lan = ?
        ORDER BY id ASC
        `,
        [lan]
      );
      rpsRows = rps;
    }
  }

  if (!summaryRows.length) return null;

  if (summaryTable !== "motioncorp_loan_summary") {
  RPS_ROWS = rpsRows
    .map((row, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${Number(row.opening || 0).toFixed(2)}</td>
        <td>${Number(row.principal || 0).toFixed(2)}</td>
        <td>${Number(row.interest || 0).toFixed(2)}</td>
        <td>${Number(row.emi || 0).toFixed(2)}</td>
        <td>${Number(row.closing || 0).toFixed(2)}</td>
      </tr>
    `)
    .join("");

  RPS_TABLE_ROWS = RPS_ROWS;
}

  const summary = summaryRows[0];

const loanAmount =
  summary.L_A ||
  summary.LOAN_AMOUNT ||
  summary.FINAL_LIMIT ||
  0;

  return {
    ...summaryRows[0],
    RPS: rpsRows,
    RPS_ROWS,
    RPS_TABLE_ROWS,
    L_A_W: summaryRows[0].L_A ? numberToWords(summaryRows[0].L_A) : "",
    AMOUNT_IN_WORDS: loanAmount ? numberToWords(loanAmount) : "",
    CU_date: dayjs().format("DD-MM-YYYY")
  };
}
/* ======================================================
   WAIT FOR SUMMARY (CRITICAL FIX)
====================================================== */
async function waitForLoanSummary(lan, retries = 6, delay = 2000) {
  for (let i = 1; i <= retries; i++) {
    const data = await getLoanData(lan);
    if (data) return data;

    console.log(`⏳ Waiting for loan summary ${lan} (${i}/${retries})`);
    await new Promise((r) => setTimeout(r, delay));
  }
  return null;
}

/* ======================================================
   PDF GENERATOR
====================================================== */
async function generatePdfFromHtml(html, fileName, options = {}) {
  const outputDir = path.join(__dirname, "../uploads");
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const outputPath = path.join(outputDir, fileName);

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "networkidle0", timeout: 120000 });

  if (options.claimCureBuddy) {
  await page.waitForFunction(
    () => window.__AGREEMENT_READY__ === true,
    {
      timeout: 120000,
    },
  );
}

  await page.pdf({
    path: outputPath,
    format: "A4",
    printBackground: true,

     // Only the CCB template controls its own page size/margins
  preferCSSPageSize: options.claimCureBuddy === true,

  margin: options.claimCureBuddy
    ? {
        top: "0mm",
        bottom: "0mm",
        left: "0mm",
        right: "0mm",
      }
    : {
        // Existing product margins remain unchanged
        top: "20mm",
        bottom: "20mm",
        left: "15mm",
        right: "15mm",
      },
});



  //   margin: { top: "20mm", bottom: "20mm", left: "15mm", right: "15mm" },
  // });

  await browser.close();
  return fileName;
}

/* ======================================================
   SANCTION PDF
====================================================== */
exports.generateSanctionLetterPdf = async (lan) => {
  const loanData = await waitForLoanSummary(lan);
  if (!loanData) throw new Error("Loan summary not available");

  const html = fillTemplate(loadTemplate("sanction_letter.html"), loanData);
  const pdfName = `SANCTION_${lan}.pdf`;

  await generatePdfFromHtml(html, pdfName);
  return pdfName;
};

/* ======================================================
   AGREEMENT PDF
====================================================== */
// exports.generateAgreementPdf = async (lan) => {
//   const loanData = await waitForLoanSummary(lan);
//   if (!loanData) throw new Error("Loan summary not available");

//   const { agreementTemplate } = getLoanContext(lan);

//   const html = fillTemplate(loadTemplate(agreementTemplate), loanData);
//   const pdfName = `AGREEMENT_${lan}.pdf`;

//   await generatePdfFromHtml(html, pdfName);
//   return { pdfName };
// };

exports.generateAgreementPdf = async (lan) => {

  const { type, summaryTable, agreementTemplate } = getLoanContext(lan);

  // ===============================================
  // CLAIM CURE BUDDY ONLY
  // ===============================================
  if (type === "CLAIM_CURE_BUDDY") {
    await db.promise().query(
    "CALL sp_create_claim_cure_buddy_loan_summary(?)",
    [lan],
  );
    const loanData = await waitForLoanSummary(lan);

    if (!loanData) {
      throw new Error(
        "ClaimCureBuddy booking or summary is not available",
      );
    }

    const templateHtml = loadTemplate(agreementTemplate);

    // Only CCB uses Handlebars because it has #each
    const html = Handlebars.compile(templateHtml)(loanData);

    const pdfName = `AGREEMENT_${lan}.pdf`;

    await generatePdfFromHtml(html, pdfName, {
      claimCureBuddy: true,
    });

    return { pdfName };
  }


  // ✅ ensure Clayyo summary exists before fetch
  if (summaryTable === "clayyo_loan_summary") {
    await db.promise().query(
      "CALL sp_generate_clayyo_summary(?)",
      [lan]
    );
  }

   // ===============================
  // MOTION CORP RPS + SUMMARY GENERATION
  // ===============================
  if (summaryTable === "motioncorp_loan_summary") {
    // First generate full RPS
    await db.promise().query(
      "CALL sp_generate_motioncorp_rps(?)",
      [lan]
    );

    // Then generate one-row summary
    await db.promise().query(
      "CALL sp_create_motioncorp_loan_summary(?)",
      [lan]
    );
  }

  const loanData = await waitForLoanSummary(lan);

  if (!loanData)
    throw new Error("Loan summary not available");

  const html = fillTemplate(
    loadTemplate(agreementTemplate),
    loanData
  );

  const pdfName = `AGREEMENT_${lan}.pdf`;

  await generatePdfFromHtml(html, pdfName);

  return { pdfName };
};