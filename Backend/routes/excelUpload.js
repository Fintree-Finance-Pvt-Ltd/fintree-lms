const express = require("express");
const multer = require("multer");
const xlsx = require("xlsx");
const db = require("../config/db");
const dotenv = require("dotenv");
const { parseStringPromise } = require("xml2js");
const axios = require("axios");
const he = require("he");
const authenticateUser = require("../middleware/verifyToken");
const { XMLParser } = require("fast-xml-parser");
// const verifyApiKey = require("../middleware/authMiddleware");
const verifyApiKey = require("../middleware/apiKeyAuth");
const { approveAndInitiatePayout } = require("../services/payout.service");
const { sendLoanStatusMail } = require("../jobs/mailer");
const { generateDailySupplyChainDemand } = require("../services/demandService"); // moved from Supply chain controller for better modularity
const {
  generateDemandFromInvoiceDisbursement,
} = require("../services/demandService"); // moved from Supply chain controller for better modularity
const {
  allocateSupplyChainRepayment,
} = require("../services/supplyChainAllocation.service");
const partnerLimitService = require("../services/partnerLimitService");
const partnerFldgService = require("../services/partnerFldgService");
const {
  extractPartnerName,
  getMonthYear,
  validatePartnerName,
} = require("../utils/partnerHelpers");
const {
  CAREPAY_HOSPITAL_REQUIRED_FIELDS,
  CAREPAY_REQUIRED_FIELDS,
  STERLION_REQUIRED_FIELDS,
  CarepayLoanTypes,
} = require("../utils/constant");
const { runBureau } = require("../services/Bueraupullapiservice");
const { autoRunFinsoBreIfReady } = require("../utils/fincrestBRE");
const { runSterlionBre } = require("../utils/sterlionBRE");

// const { pullCIBILReport }=  require("../jobs/experianService");

dotenv.config();

const router = express.Router();

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const generateLoanIdentifiers = async (lender) => {
  lender = lender.trim(); // normalize input
  console.log("Generating loan identifiers for lender:", lender);
  let prefixPartnerLoan;
  let prefixLan;

  if (lender === "EV Loan") {
    prefixPartnerLoan = "MANEV1";
    prefixLan = "EV1";
  } else if (lender === "HEY EV Loan") {
    prefixPartnerLoan = "HEYEV1";
    prefixLan = "HEYEV1";
  } else if (lender === "HeyEV Battery") {
    prefixPartnerLoan = "HEYB1";
    prefixLan = "HEYBF1";
  } else if (lender === "HC") {
    prefixPartnerLoan = "HCIN1";
    prefixLan = "HCF1";
  } else if (lender === "BL Loan") {
    prefixPartnerLoan = "BLIN1";
    prefixLan = "BL1";
  } else if (lender === "WCTL") {
    prefixPartnerLoan = "WCTL1";
    prefixLan = "WCTL1";
  } else if (lender === "GQ FSF") {
    prefixPartnerLoan = "GQFSF1";
    prefixLan = "GQFSF1";
  } else if (lender === "GQ Non-FSF") {
    prefixPartnerLoan = "GQNonFSF1";
    prefixLan = "GQNonFSF1";
  } else if (lender === "Adikosh") {
    prefixPartnerLoan = "ADK1";
    prefixLan = "ADKF1";
  } else if (lender === "circlepe") {
    prefixPartnerLoan = "FCIR1";
    prefixLan = "CIRF1";
  } else if (lender === "circle pe houser") {
    prefixPartnerLoan = "CIRHUF1";
    prefixLan = "CIRHUF1";
  } else if (lender === "emiclub") {
    //prefixPartnerLosan = "FINE1";
    prefixLan = "FINE1";
  } else if (lender === "carepay") {
    prefixLan = "CARE";
  } else if (lender === "sterlion") {
    prefixPartnerLoan = "STRL";
    prefixLan = "STRL";
  } else if (lender === "carepay-hospital") {
    prefixPartnerLoan = "CAREHOS";
    prefixLan = "CAREHOS";
  } else if (lender === "WCTL_CC_OD") {
    prefixLan = "FCCOD1";
  } else if (lender === "Finso") {
    prefixPartnerLoan = "FINS1";
    prefixLan = "FINS1";
  } else if (lender === "Term Loan") {
    // ✅ Added for loan_booking_term_loan
    prefixPartnerLoan = "TLFFPL1";
    prefixLan = "TLF1";
  } else {
    return res.status(400).json({ message: "Invalid lender type." }); // ✅ handled in route
  }

  console.log("prefixPartnerLoan:", prefixPartnerLoan);
  console.log("prefixLan:", prefixLan);

  const [rows] = await db
    .promise()
    .query(
      "SELECT last_sequence FROM loan_sequences WHERE lender_name = ? FOR UPDATE",
      [lender],
    );

  let newSequence;

  if (rows.length > 0) {
    newSequence = rows[0].last_sequence + 1;
    await db
      .promise()
      .query(
        "UPDATE loan_sequences SET last_sequence = ? WHERE lender_name = ?",
        [newSequence, lender],
      );
  } else {
    newSequence = 11000;
    await db
      .promise()
      .query(
        "INSERT INTO loan_sequences (lender_name, last_sequence) VALUES (?, ?)",
        [lender, newSequence],
      );
  }

  return {
    partnerLoanId: `${prefixPartnerLoan}${newSequence}`,
    lan: `${prefixLan}${newSequence}`,
  };
};

const excelDateToJSDate = (value) => {
  if (!value) return null;

  // Case 1: Excel serial number (e.g., 44645)
  if (!isNaN(value)) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30)); // Excel base date
    const correctDate = new Date(excelEpoch.getTime() + value * 86400000);
    return correctDate.toISOString().split("T")[0]; // YYYY-MM-DD
  }

  // Case 2: Text format "DD-MMM-YY" like "10-Mar-24"
  if (typeof value === "string" && value.match(/^\d{2}-[A-Za-z]{3}-\d{2}$/)) {
    const [day, monthAbbr, yearShort] = value.split("-");
    const monthNames = {
      Jan: 0,
      Feb: 1,
      Mar: 2,
      Apr: 3,
      May: 4,
      Jun: 5,
      Jul: 6,
      Aug: 7,
      Sep: 8,
      Oct: 9,
      Nov: 10,
      Dec: 11,
    };
    const month = monthNames[monthAbbr];
    if (month === undefined) return null;
    const year = parseInt("20" + yearShort, 10);
    return new Date(Date.UTC(parseInt(year), month, parseInt(day)))
      .toISOString()
      .split("T")[0];
  }

  // ✅ Case 3: "DD-MM-YYYY" (your format)
  if (typeof value === "string" && value.match(/^\d{2}-\d{2}-\d{4}$/)) {
    const [day, month, year] = value.split("-");
    return new Date(`${year}-${month}-${day}`).toISOString().split("T")[0];
  }

  return null;
};
//////////////////// ADIKOSH HELPER FUNCTIONS ///////////////////////
// ---------- helpers ----------
const str = (v) =>
  v === undefined || v === null || v === "" ? null : String(v).trim();

const int = (v) => {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? parseInt(n, 10) : null;
};

const dec = (v) => {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(String(v).replace(/[, ]/g, ""));
  return Number.isFinite(n) ? n : null;
};

// date in 'YYYY-MM-DD' or JS Date; store as 'YYYY-MM-DD'
const dmy = (v) => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};

const pickIncome = (arr, idx) => (Array.isArray(arr) ? dec(arr[idx]) : null);
//////////////////////////// SAVE REMARKS //////////////////////

router.post("/save-remarks", async (req, res) => {
  const { lan, remarks, collection_assigner } = req.body;

  if (!lan) {
    return res.status(400).json({ error: "LAN is required" });
  }

  try {
    const [loan] = await db
      .promise()
      .query("SELECT * FROM loan_booking_embifi WHERE lan = ?", [lan]);

    if (loan.length === 0) {
      return res.status(404).json({ error: "LAN not found" });
    }

    await db.promise().query(
      `UPDATE loan_booking_embifi 
       SET 
         collection_remarks = ?, 
         collection_assigner = ?, 
         updated_at = NOW() 
       WHERE lan = ?`,
      [remarks || null, collection_assigner || null, lan],
    );

    return res.json({ message: "Remarks & Assigner saved successfully" });
  } catch (err) {
    console.error("Save remarks error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

////////////////////// NEW CODE FOR DATA CROOS CHECK AND INSERTION //////////////////////
router.post("/upload", upload.single("file"), async (req, res) => {
  if (!req.file)
    return res
      .status(400)
      .json({ message: "No file uploaded. Please select a valid file." });

  if (!req.body.lenderType)
    return res.status(400).json({ message: "Lender type is required." });

  try {
    const lenderType = req.body.lenderType.trim();
    if (lenderType !== "EV Loan") {
      return res.status(400).json({
        message: "Invalid upload lender type. Only EV Loan is supported.",
      });
    }

    // Read Excel
    const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheetData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

    if (!sheetData || sheetData.length === 0) {
      return res
        .status(400)
        .json({ message: "Uploaded Excel file is empty or invalid." });
    }

    // ✅ ALL required fields (as per DB insert — 54 columns)
    const requiredFields = [
      "LOGIN DATE",
      "Customer Name",
      "Borrower DOB",
      "Father Name",
      "Address Line 1",
      "Address Line 2",
      "Village",
      "District",
      "State",
      "Pincode",
      "Mobile Number",
      "Loan Amount",
      " Interest Rate ",
      "Tenure",
      "GURANTOR",
      "GURANTOR DOB",
      "GURANTOR ADHAR",
      "GURANTOR PAN",
      "DEALER NAME",
      "Name in Bank",
      "Bank name",
      "Account Number",
      "IFSC",
      "Aadhar Number",
      "Pan Card",
      "Product",
      "lender",
      "Agreement Date",
      "CIBIL Score",
      "GURANTOR CIBIL Score",
      "Relationship with Borrower",
      "Battery Name",
      "Battery Type",
      "Battery Serial no 1",
      "E-Rikshaw model",
      "Chassis no",
      "Customer Name as per bank",
      "Customer Bank name",
      "Customer Account Number",
      "Bank IFSC Code",
    ];

    const success_rows = [];
    const row_errors = [];

    for (let i = 0; i < sheetData.length; i++) {
      const row = sheetData[i];
      const R = i + 2;

      try {
        // ✅ Check if *any required field* is missing
        const missingFields = requiredFields.filter(
          (field) => !row[field] || String(row[field]).trim() === "",
        );

        if (missingFields.length > 0) {
          row_errors.push({
            row: R,
            stage: "validation",
            reason: `Missing required fields: ${missingFields.join(", ")}`,
          });
          continue;
        }

        const rowLender = (row["lender"] || "").trim();
        const panCard = row["Pan Card"];
        const aadharNumber = row["Aadhar Number"];
        const interestRate = row[" Interest Rate "];

        if (rowLender !== "EV Loan") {
          row_errors.push({
            row: R,
            stage: "validation",
            reason: "Invalid lender type in row. Only EV Loan is supported.",
          });
          continue;
        }

        if (isNaN(interestRate) || interestRate <= 0) {
          row_errors.push({
            row: R,
            stage: "validation",
            reason: "Valid numeric Interest Rate is required.",
          });
          continue;
        }

        // Duplicate check
        const [existingRecords] = await db
          .promise()
          .query(`SELECT lan FROM loan_booking_ev WHERE pan_card = ?`, [
            panCard || null,
          ]);

        if (existingRecords.length > 0) {
          row_errors.push({
            row: R,
            stage: "dup-check",
            reason: `Customer already exists. Duplicate found for Pan Card: ${panCard}`,
          });
          continue;
        }

        // Generate IDs
        const { partnerLoanId, lan } =
          await generateLoanIdentifiers(lenderType);

        // ✅ Insert into DB
        const query = `
          INSERT INTO loan_booking_ev (
            partner_loan_id, lan, login_date, customer_name, borrower_dob, father_name,
            address_line_1, address_line_2, village, district, state, pincode,
            mobile_number, email, loan_amount, interest_rate, loan_tenure, emi_amount,
            guarantor_name, guarantor_dob, guarantor_aadhar, guarantor_pan, dealer_name,
            name_in_bank, bank_name, account_number, ifsc, aadhar_number, pan_card,
            product, lender, agreement_date, status, disbursal_amount, processing_fee,
            cibil_score, guarantor_cibil_score, relationship_with_borrower, co_applicant,
            co_applicant_dob, co_applicant_aadhar, co_applicant_pan, co_applicant_cibil_score,
            apr, battery_name, battery_type, battery_serial_no_1, battery_serial_no_2,
            e_rikshaw_model, chassis_no, customer_name_as_per_bank, customer_bank_name,
            customer_account_number, bank_ifsc_code
          ) VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
          )
        `;

        await db
          .promise()
          .query(query, [
            partnerLoanId,
            lan,
            row["LOGIN DATE"] ? excelDateToJSDate(row["LOGIN DATE"]) : null,
            row["Customer Name"],
            row["Borrower DOB"] ? excelDateToJSDate(row["Borrower DOB"]) : null,
            row["Father Name"],
            row["Address Line 1"],
            row["Address Line 2"],
            row["Village"],
            row["District"],
            row["State"],
            row["Pincode"],
            row["Mobile Number"],
            row["Email"],
            row["Loan Amount"],
            row[" Interest Rate "],
            row["Tenure"],
            row["EMI Amount"],
            row["GURANTOR"],
            row["GURANTOR DOB"] ? excelDateToJSDate(row["GURANTOR DOB"]) : null,
            row["GURANTOR ADHAR"],
            row["GURANTOR PAN"],
            row["DEALER NAME"],
            row["Name in Bank"],
            row["Bank name"],
            row["Account Number"],
            row["IFSC"],
            row["Aadhar Number"],
            row["Pan Card"],
            row["Product"],
            row["lender"] || "EV Loan",
            row["Agreement Date"]
              ? excelDateToJSDate(row["Agreement Date"])
              : null,
            row["status"] || "Login",
            row["Disbursal Amount"],
            row["Processing Fee"] || 0.0,
            row["CIBIL Score"],
            row["GURANTOR CIBIL Score"],
            row["Relationship with Borrower"],
            row["Co-Applicant"],
            row["Co-Applicant DOB"]
              ? excelDateToJSDate(row["Co-Applicant DOB"])
              : null,
            row["Co-Applicant AADHAR"],
            row["Co-Applicant PAN"],
            row["Co-Applicant CIBIL Score"],
            row["APR"],
            row["Battery Name"],
            row["Battery Type"],
            row["Battery Serial no 1"],
            row["Battery Serial no 2"],
            row["E-Rikshaw model"],
            row["Chassis no"],
            row["Customer Name as per bank"],
            row["Customer Bank name"],
            row["Customer Account Number"],
            row["Bank IFSC Code"],
          ]);

        success_rows.push({ row: R, lan, partnerLoanId, interestRate });
        console.log(`✅ Inserted row ${R} | PAN: ${panCard} | LAN: ${lan}`);
      } catch (err) {
        row_errors.push({
          row: R,
          stage: "insert",
          reason: err.sqlMessage || err.message,
        });
        console.error(`❌ Row ${R} failed:`, err);
      }
    }

    return res.json({
      message: "File processed.",
      total_rows: sheetData.length,
      inserted_rows: success_rows.length,
      failed_rows: row_errors.length,
      success_rows,
      row_errors,
    });
  } catch (error) {
    console.error("❌ Error in Upload Process:", error);
    return res.status(500).json({
      message: "Upload failed. Please try again.",
      error: error.sqlMessage || error.message,
    });
  }
});

router.post("/upload/ev-manual", async (req, res) => {
  let conn;

  try {
    const data = req.body;

    // Basic lender validation
    if (!data.lenderType || data.lenderType.trim() !== "EV Loan") {
      return res
        .status(400)
        .json({ message: "Invalid lender type. Only EV Loan is supported." });
    }

    // ✅ Required fields same as Excel upload
    const requiredFields = [
      "LOGIN_DATE",
      "Customer_Name",
      "Borrower_DOB",
      "Father_Name",
      "Mobile_Number",
      "Address_Line_1",
      "Village",
      "District",
      "State",
      "Pincode",
      "Loan_Amount",
      "Interest_Rate",
      "Tenure",
      "dealer_name",
      "GURANTOR",
      "GURANTOR_DOB",
      "GURANTOR_ADHAR",
      "GURANTOR_PAN",
      "name_in_bank",
      "bank_name",
      "account_number",
      "ifsc",
      "gst_no",
      "Aadhar_Number",
      "Pan_Card",
      "CIBIL_Score",
      "GURANTOR_CIBIL_Score",
      "Relationship_with_Borrower",
      "Battery_Name",
      "Battery_Type",
      "Battery_Serial_no_1",
      "E_Rikshaw_model",
      "Chassis_no",
      "customer_name_as_per_bank",
      "customer_bank_name",
      "customer_account_number",
      "bank_ifsc_code",
    ];

    const missingFields = requiredFields.filter(
      (f) => !data[f] || String(data[f]).trim() === "",
    );
    if (missingFields.length > 0) {
      return res.status(400).json({
        message: `Missing required fields: ${missingFields.join(", ")}`,
      });
    }

    // Validate numeric Interest Rate
    const interestRate = Number(data.Interest_Rate);
    if (isNaN(interestRate) || interestRate <= 0) {
      return res
        .status(400)
        .json({ message: "Valid numeric Interest Rate is required." });
    }

    // Check duplicate PAN
    const [dup] = await db
      .promise()
      .query(`SELECT lan FROM loan_booking_ev WHERE pan_card = ?`, [
        data.Pan_Card || null,
      ]);
    if (dup.length > 0) {
      return res.status(409).json({
        message: `Duplicate entry found for PAN: ${data.Pan_Card}`,
      });
    }

    // Generate IDs
    // const { partnerLoanId, lan } = await generateLoanIdentifiers(data.lender);

    conn = await db.promise().getConnection();
    await conn.beginTransaction();

    const partnerName = "EV Loan";

    // Extract month/year from login date
    const today = new Date();
    const { month, year } = getMonthYear(today);

    const loanAmount = parseFloat(data.Loan_Amount || 0);

    if (loanAmount <= 0) {
      throw new Error("Invalid loan amount");
    }

    // Get or create partner
    const partner = await partnerLimitService.getOrCreatePartner(
      conn,
      partnerName,
    );

    // Validate monthly limit
    const limitCheck = await partnerLimitService.validatePartnerBookingLimit(
      conn,
      partner.partner_id,
      loanAmount,
      month,
      year,
    );

    if (!limitCheck.valid) {
      await conn.rollback();
      conn.release();

      return res.status(403).json({
        message: `Limit exceeded for ${partnerName}`,
        remaining_limit: limitCheck.remaining,
        required: loanAmount,
      });
    }

    // Fetch FLDG percent
    const [[partnerConfig]] = await conn.query(
      `SELECT fldg_percent, fldg_status FROM partner_master WHERE partner_id = ?`,
      [partner.partner_id],
    );

    if (!partnerConfig) {
      throw new Error("Partner configuration not found");
    }

    let requiredFldg = 0;

    if (partnerConfig?.fldg_status === 1) {
      const fldgPercent = Number(partnerConfig?.fldg_percent || 0);

      requiredFldg = Number(((loanAmount * fldgPercent) / 100).toFixed(2));
    }

    // Validate FLDG availability
    if (requiredFldg > 0) {
      const fldgCheck = await partnerFldgService.validateFldgAvailability(
        conn,
        partner.partner_id,
        requiredFldg,
      );

      if (!fldgCheck.valid) {
        await conn.rollback();
        conn.release();

        return res.status(403).json({
          message: `Insufficient FLDG balance for ${partnerName}`,
          available_fldg: fldgCheck.available,
          required_fldg: requiredFldg,
        });
      }
    }

    // Generate IDs AFTER limit validation passes
    const { partnerLoanId, lan } = await generateLoanIdentifiers(data.lender);

    // ✅ Insert into DB
    const query = `
      INSERT INTO loan_booking_ev (
        partner_loan_id, lan, login_date, customer_name, borrower_dob, father_name,
        address_line_1, address_line_2, village, district, state, pincode,
        mobile_number, email, loan_amount, interest_rate, loan_tenure, emi_amount,
        guarantor_name, guarantor_dob, guarantor_aadhar, guarantor_pan, trade_name, dealer_name, gst_no, dealer_contact, dealer_address,
        name_in_bank, bank_name, account_number, ifsc, aadhar_number, pan_card,
        product, lender, agreement_date, status, disbursal_amount, processing_fee,
        cibil_score, guarantor_cibil_score, relationship_with_borrower, co_applicant,
        co_applicant_dob, co_applicant_aadhar, co_applicant_pan, co_applicant_cibil_score,
        apr, battery_name, battery_type, battery_serial_no_1, battery_serial_no_2,
        e_rikshaw_model, chassis_no, customer_name_as_per_bank, customer_bank_name,
        customer_account_number, bank_ifsc_code
      )
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, ?,?,?,?,?,?)
    `;

    await conn.query(query, [
      partnerLoanId,
      lan,
      data.LOGIN_DATE || null,
      data.Customer_Name,
      data.Borrower_DOB || null,
      data.Father_Name,
      data.Address_Line_1,
      data.Address_Line_2,
      data.Village,
      data.District,
      data.State,
      data.Pincode,
      data.Mobile_Number,
      data.Email,
      data.Loan_Amount,
      data.Interest_Rate,
      data.Tenure,
      data.EMI_Amount,
      data.GURANTOR,
      data.GURANTOR_DOB || null,
      data.GURANTOR_ADHAR,
      data.GURANTOR_PAN,
      data.trade_name,
      data.dealer_name,
      data.gst_no,
      data.dealer_contact,
      data.dealer_address,
      data.name_in_bank,
      data.bank_name,
      data.account_number,
      data.ifsc,
      data.Aadhar_Number,
      data.Pan_Card,
      data.Product,
      data.lender,
      data.LOGIN_DATE || null,
      data.status || "Login",
      data.Loan_Amount || null,
      data.Processing_Fee || 0.0,
      data.CIBIL_Score,
      data.GURANTOR_CIBIL_Score,
      data.Relationship_with_Borrower,
      data.Co_Applicant,
      data.Co_Applicant_DOB || null,
      data.Co_Applicant_AADHAR,
      data.Co_Applicant_PAN,
      data.Co_Applicant_CIBIL_Score,
      data.APR,
      data.Battery_Name,
      data.Battery_Type,
      data.Battery_Serial_no_1,
      data.Battery_Serial_no_2,
      data.E_Rikshaw_model,
      data.Chassis_no,
      data.customer_name_as_per_bank,
      data.customer_bank_name,
      data.customer_account_number,
      data.bank_ifsc_code,
    ]);

    console.log(
      `✅ Manual EV Loan inserted | LAN: ${lan} | PAN: ${data.Pan_Card}`,
    );

    // Update partner used limit + audit
    await partnerLimitService.updateBookedLimit(
      conn,
      limitCheck.limitId,
      loanAmount,
      lan,
    );

    // Reserve FLDG after successful booking
    if (requiredFldg > 0) {
      await partnerFldgService.reserveFldg(
        conn,
        partner.partner_id,
        lan,
        requiredFldg,
        `EV Loan booking reservation | Amount: ${loanAmount}`,
      );
    }

    await conn.commit();
    conn.release();

    return res.json({
      message: "EV Loan manually inserted successfully.",
      lan,
      partnerLoanId,
    });
  } catch (err) {
    if (conn) {
      await conn.rollback();
      conn.release();
    }

    console.error("❌ Manual entry failed:", err);

    return res.status(500).json({
      message: "Manual entry failed.",
      error: err.sqlMessage || err.message,
    });
  }
});

///////////// TERM LOAN //////////////
// ===============================
// TERM LOAN EXCEL UPLOAD CODE
// ===============================

// Required existing imports in your route file:
// const express = require("express");
// const router = express.Router();
// const xlsx = require("xlsx");
// const multer = require("multer");
// const db = require("../config/db");
// const upload = multer({ storage: multer.memoryStorage() });
// const { generateLoanIdentifiers } = require("../utils/generateLoanIdentifiers");

const TERM_LOAN_TABLE = "loan_booking_term_loan";

// These headers are based on your Term Loan Excel sheet
const termLoanExpectedHeaders = [
  "login_date",
  "customer_name",
  "mobile_number",
  "alternate_mobile",
  "email",
  "business_type",
  "business_category",
  "gst_number",
  "business_address_line1",
  "business_address_line2",
  "business_pincode",
  "business_city",
  "business_state",
  "business_vintage_years",
  "current_date",
  "borrower_dob",
  "father_name",
  "address_line_1",
  "address_line_2",
  "village",
  "district",
  "state",
  "pincode",
  "loan_amount",
  "interest_rate",
  "loan_tenure",
  "emi_amount",
  "guarantor_name",
  "guarantor_dob",
  "guarantor_aadhar",
  "guarantor_pan",
  "name_in_bank",
  "bank_name",
  "account_number",
  "ifsc",
  "aadhar_number",
  "pan_card",
  "product",
  "lender",
  "agreement_date",
  "disbursal_amount",
  "processing_fee",
  "cibil_score",
  "guarantor_cibil_score",
  "relationship_with_borrower",
  "co_applicant",
  "co_applicant_dob",
  "co_applicant_aadhar",
  "co_applicant_pan",
  "co_applicant_cibil_score",
  "apr",
  "battery_name",
  "risk_category",
  "bucket",
];

// DB insert columns
const termLoanInsertColumns = [
  "partner_loan_id",
  "lan",
  ...termLoanExpectedHeaders,
  "status",
];

// Required fields for validation
const termLoanRequiredFields = [
  "login_date",
  "customer_name",
  "mobile_number",
  "business_type",
  "business_category",
  "gst_number",
  "business_address_line1",
  "business_pincode",
  "business_city",
  "business_state",
  "borrower_dob",
  "father_name",
  "address_line_1",
  "district",
  "state",
  "pincode",
  "loan_amount",
  "interest_rate",
  "loan_tenure",
  "name_in_bank",
  "bank_name",
  "account_number",
  "ifsc",
  "aadhar_number",
  "pan_card",
  "product",
  "lender",
];

const termLoanDateFields = new Set([
  "login_date",
  "current_date",
  "borrower_dob",
  "guarantor_dob",
  "agreement_date",
  "co_applicant_dob",
]);

const isBlankTermLoanValue = (value) => {
  return value === undefined || value === null || String(value).trim() === "";
};

const cleanTermLoanValue = (value) => {
  if (value === undefined || value === null) return null;

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  }

  return value;
};

const toSqlDateTermLoan = (value) => {
  if (isBlankTermLoanValue(value)) return null;

  if (value instanceof Date && !isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "number") {
    // Excel serial date to YYYY-MM-DD
    const utcDays = Math.floor(value - 25569);
    const utcValue = utcDays * 86400;
    return new Date(utcValue * 1000).toISOString().slice(0, 10);
  }

  return String(value).trim();
};

// =====================================================
// BULK TERM LOAN EXCEL UPLOAD
// URL: POST /upload/term-loan
// Body: form-data
// file: Excel file
// lenderType: Term Loan
// =====================================================

router.post("/upload/term-loan", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      message: "No file uploaded. Please select a valid Excel file.",
    });
  }

  if (!req.body.lenderType) {
    return res.status(400).json({
      message: "Lender type is required.",
    });
  }

  try {
    const lenderType = String(req.body.lenderType).trim();

    if (lenderType !== "Term Loan") {
      return res.status(400).json({
        message: "Invalid upload lender type. Only Term Loan is supported.",
      });
    }

    const workbook = xlsx.read(req.file.buffer, {
      type: "buffer",
      cellDates: true,
    });

    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    const headerRows = xlsx.utils.sheet_to_json(sheet, {
      header: 1,
      defval: "",
      raw: true,
    });

    const uploadedHeaders = (headerRows[0] || []).map((h) => String(h).trim());

    const missingHeaders = termLoanExpectedHeaders.filter(
      (header) => !uploadedHeaders.includes(header),
    );

    if (missingHeaders.length > 0) {
      return res.status(400).json({
        message: "Excel column mismatch. Missing required headers.",
        missing_headers: missingHeaders,
        expected_headers: termLoanExpectedHeaders,
        uploaded_headers: uploadedHeaders,
      });
    }

    const sheetData = xlsx.utils.sheet_to_json(sheet, {
      defval: "",
      raw: true,
    });

    if (!sheetData || sheetData.length === 0) {
      return res.status(400).json({
        message: "Uploaded Excel file is empty or invalid.",
      });
    }

    const success_rows = [];
    const row_errors = [];

    for (let i = 0; i < sheetData.length; i++) {
      const row = sheetData[i];
      const excelRowNumber = i + 2;

      try {
        const missingFields = termLoanRequiredFields.filter((field) =>
          isBlankTermLoanValue(row[field]),
        );

        if (missingFields.length > 0) {
          row_errors.push({
            row: excelRowNumber,
            stage: "validation",
            reason: `Missing required fields: ${missingFields.join(", ")}`,
          });
          continue;
        }

        const rowLender = String(row.lender || "").trim();
        const panCard = String(row.pan_card || "")
          .trim()
          .toUpperCase();
        const loanAmount = Number(row.loan_amount);
        const interestRate = Number(row.interest_rate);

        if (rowLender !== "Term Loan") {
          row_errors.push({
            row: excelRowNumber,
            stage: "validation",
            reason: "Invalid lender value in Excel row. Expected: Term Loan.",
          });
          continue;
        }

        if (isNaN(loanAmount) || loanAmount <= 0) {
          row_errors.push({
            row: excelRowNumber,
            stage: "validation",
            reason: "Valid numeric loan_amount is required.",
          });
          continue;
        }

        if (isNaN(interestRate) || interestRate <= 0) {
          row_errors.push({
            row: excelRowNumber,
            stage: "validation",
            reason: "Valid numeric interest_rate is required.",
          });
          continue;
        }

        // Duplicate PAN check
        const [existingRecords] = await db
          .promise()
          .query(`SELECT lan FROM ${TERM_LOAN_TABLE} WHERE pan_card = ?`, [
            panCard || null,
          ]);

        if (existingRecords.length > 0) {
          row_errors.push({
            row: excelRowNumber,
            stage: "dup-check",
            reason: `Customer already exists. Duplicate found for pan_card: ${panCard}`,
          });
          continue;
        }

        // Generate partnerLoanId and LAN
        const { partnerLoanId, lan } =
          await generateLoanIdentifiers(lenderType);

        const values = termLoanInsertColumns.map((col) => {
          if (col === "partner_loan_id") return partnerLoanId;
          if (col === "lan") return lan;
          if (col === "status") return "Login";
          if (col === "pan_card") return panCard;

          if (termLoanDateFields.has(col)) {
            return toSqlDateTermLoan(row[col]);
          }

          return cleanTermLoanValue(row[col]);
        });

        const query = `
          INSERT INTO ${TERM_LOAN_TABLE}
          (${termLoanInsertColumns.map((col) => `\`${col}\``).join(", ")})
          VALUES (${termLoanInsertColumns.map(() => "?").join(", ")})
        `;

        await db.promise().query(query, values);

        success_rows.push({
          row: excelRowNumber,
          lan,
          partnerLoanId,
          pan_card: panCard,
          loan_amount: loanAmount,
          interest_rate: interestRate,
        });

        console.log(
          `✅ Term Loan inserted row ${excelRowNumber} | PAN: ${panCard} | LAN: ${lan}`,
        );
      } catch (err) {
        row_errors.push({
          row: excelRowNumber,
          stage: "insert",
          reason: err.sqlMessage || err.message,
        });

        console.error(`❌ Term Loan row ${excelRowNumber} failed:`, err);
      }
    }

    return res.json({
      message: "Term Loan file processed.",
      total_rows: sheetData.length,
      inserted_rows: success_rows.length,
      failed_rows: row_errors.length,
      success_rows,
      row_errors,
    });
  } catch (error) {
    console.error("❌ Error in Term Loan upload process:", error);

    return res.status(500).json({
      message: "Term Loan upload failed. Please try again.",
      error: error.sqlMessage || error.message,
    });
  }
});

// =====================================================
// MANUAL TERM LOAN ENTRY
// URL: POST /upload/term-loan-manual
// Body: JSON
// lenderType: Term Loan
// =====================================================

router.post("/upload/term-loan-manual", async (req, res) => {
  try {
    const data = req.body;

    if (!data.lenderType || String(data.lenderType).trim() !== "Term Loan") {
      return res.status(400).json({
        message: "Invalid lender type. Only Term Loan is supported.",
      });
    }

    const missingFields = termLoanRequiredFields.filter((field) =>
      isBlankTermLoanValue(data[field]),
    );

    if (missingFields.length > 0) {
      return res.status(400).json({
        message: `Missing required fields: ${missingFields.join(", ")}`,
      });
    }

    const panCard = String(data.pan_card || "")
      .trim()
      .toUpperCase();
    const loanAmount = Number(data.loan_amount);
    const interestRate = Number(data.interest_rate);

    if (isNaN(loanAmount) || loanAmount <= 0) {
      return res.status(400).json({
        message: "Valid numeric loan_amount is required.",
      });
    }

    if (isNaN(interestRate) || interestRate <= 0) {
      return res.status(400).json({
        message: "Valid numeric interest_rate is required.",
      });
    }

    if (String(data.lender || "").trim() !== "Term Loan") {
      return res.status(400).json({
        message: "Invalid lender value. Expected: Term Loan.",
      });
    }

    const [duplicate] = await db
      .promise()
      .query(`SELECT lan FROM ${TERM_LOAN_TABLE} WHERE pan_card = ?`, [
        panCard || null,
      ]);

    if (duplicate.length > 0) {
      return res.status(409).json({
        message: `Duplicate entry found for PAN: ${panCard}`,
      });
    }

    const { partnerLoanId, lan } = await generateLoanIdentifiers("Term Loan");

    const values = termLoanInsertColumns.map((col) => {
      if (col === "partner_loan_id") return partnerLoanId;
      if (col === "lan") return lan;
      if (col === "status") return data.status || "Login";
      if (col === "pan_card") return panCard;

      if (termLoanDateFields.has(col)) {
        return toSqlDateTermLoan(data[col]);
      }

      return cleanTermLoanValue(data[col]);
    });

    const query = `
      INSERT INTO ${TERM_LOAN_TABLE}
      (${termLoanInsertColumns.map((col) => `\`${col}\``).join(", ")})
      VALUES (${termLoanInsertColumns.map(() => "?").join(", ")})
    `;

    await db.promise().query(query, values);

    console.log(`✅ Manual Term Loan inserted | LAN: ${lan} | PAN: ${panCard}`);

    return res.json({
      message: "Term Loan manually inserted successfully.",
      lan,
      partnerLoanId,
    });
  } catch (err) {
    console.error("❌ Manual Term Loan entry failed:", err);

    return res.status(500).json({
      message: "Manual Term Loan entry failed.",
      error: err.sqlMessage || err.message,
    });
  }
});

/////////////////////////// NEW CODE FOR HEY EV LOAN DATA CROOS CHECK AND INSERTION //////////////////////

router.post("/hey-ev-upload", upload.single("file"), async (req, res) => {
  if (!req.file)
    return res
      .status(400)
      .json({ message: "No file uploaded. Please select a valid file." });

  if (!req.body.lenderType)
    return res.status(400).json({ message: "Lender type is required." });

  try {
    const lenderType = req.body.lenderType.trim();
    if (lenderType !== "HEY EV Loan") {
      return res.status(400).json({
        message: "Invalid upload lender type. Only HEY EV Loan is supported.",
      });
    }

    // Read Excel
    const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheetData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

    if (!sheetData || sheetData.length === 0) {
      return res
        .status(400)
        .json({ message: "Uploaded Excel file is empty or invalid." });
    }

    // ✅ ALL required fields (as per DB insert — 54 columns)
    const requiredFields = [
      "LOGIN DATE",
      "Customer Name",
      "Borrower DOB",
      "Father Name",
      "Address Line 1",
      "Address Line 2",
      "Village",
      "District",
      "State",
      "Pincode",
      "Mobile Number",
      "Loan Amount",
      " Interest Rate ",
      "Tenure",
      "FLDG",
      "PROCESS FEE",
      "GURANTOR",
      "GURANTOR DOB",
      "GURANTOR ADHAR",
      "GURANTOR PAN",
      "DEALER NAME",
      "Name in Bank",
      "Bank name",
      "Account Number",
      "IFSC",
      "Aadhar Number",
      "Pan Card",
      "Product",
      "lender",
      "Agreement Date",
      "CIBIL Score",
      "Relationship with Borrower",
      "Battery Name",
      "Battery Type",
      "Battery Serial no 1",
      "E-Rikshaw model",
      "Chassis no",
      "Customer Name as per bank",
      "Customer Bank name",
      "Customer Account Number",
      "Bank IFSC Code",
    ];

    const success_rows = [];
    const row_errors = [];

    for (let i = 0; i < sheetData.length; i++) {
      const row = sheetData[i];
      const R = i + 2;
      let conn;

      try {
        // ✅ Check if *any required field* is missing
        const missingFields = requiredFields.filter(
          (field) => !row[field] || String(row[field]).trim() === "",
        );

        if (missingFields.length > 0) {
          row_errors.push({
            row: R,
            stage: "validation",
            reason: `Missing required fields: ${missingFields.join(", ")}`,
          });
          continue;
        }

        const rowLender = (row["lender"] || "").trim();
        const panCard = row["Pan Card"];
        const aadharNumber = row["Aadhar Number"];
        const interestRate = row[" Interest Rate "];

        if (rowLender !== "HEY EV Loan") {
          row_errors.push({
            row: R,
            stage: "validation",
            reason:
              "Invalid lender type in row. Only HEY EV Loan is supported.",
          });
          continue;
        }

        if (isNaN(interestRate) || interestRate <= 0) {
          row_errors.push({
            row: R,
            stage: "validation",
            reason: "Valid numeric Interest Rate is required.",
          });
          continue;
        }

        // Duplicate check
        const [existingRecords] = await db
          .promise()
          .query(`SELECT lan FROM loan_booking_hey_ev WHERE pan_card = ?`, [
            panCard || null,
          ]);

        if (existingRecords.length > 0) {
          row_errors.push({
            row: R,
            stage: "dup-check",
            reason: `Customer already exists. Duplicate found for Pan Card: ${panCard}`,
          });
          continue;
        }

        // Generate IDs
        // const { partnerLoanId, lan } = await generateLoanIdentifiers(
        //   lenderType
        // );

        conn = await db.promise().getConnection();
        await conn.beginTransaction();

        const partnerName = "Hey EV Loan";

        const loginDate = excelDateToJSDate(row["LOGIN DATE"]);
        const today = new Date();
        const { month, year } = getMonthYear(today);

        const loanAmount = Number(row["Loan Amount"]) || 0;

        if (loanAmount <= 0) {
          throw new Error("Invalid loan amount");
        }

        const partner = await partnerLimitService.getOrCreatePartner(
          conn,
          partnerName,
        );

        const limitCheck =
          await partnerLimitService.validatePartnerBookingLimit(
            conn,
            partner.partner_id,
            loanAmount,
            month,
            year,
          );

        if (!limitCheck.valid) {
          await conn.rollback();
          conn.release();

          row_errors.push({
            row: R,
            stage: "limit-check",
            reason: `Limit exceeded. Remaining: ${limitCheck.remaining}, Required: ${loanAmount}`,
          });

          continue;
        }

        // Fetch partner FLDG percent
        const [[partnerConfig]] = await conn.query(
          `SELECT fldg_percent, fldg_status FROM partner_master WHERE partner_id = ?`,
          [partner.partner_id],
        );

        if (!partnerConfig) {
          throw new Error("Partner configuration not found");
        }

        let requiredFldg = 0;

        if (partnerConfig?.fldg_status === 1) {
          const fldgPercentage = Number(partnerConfig?.fldg_percent || 0);

          requiredFldg = Number(
            ((loanAmount * fldgPercentage) / 100).toFixed(2),
          );
        }

        // Validate FLDG availability
        if (requiredFldg > 0) {
          const fldgCheck = await partnerFldgService.validateFldgAvailability(
            conn,
            partner.partner_id,
            requiredFldg,
          );

          if (!fldgCheck.valid) {
            await conn.rollback();
            conn.release();

            row_errors.push({
              row: R,
              stage: "fldg-check",
              reason: `Insufficient FLDG. Available: ${fldgCheck.available}, Required: ${requiredFldg}`,
            });

            continue;
          }
        }

        const { partnerLoanId, lan } =
          await generateLoanIdentifiers(lenderType);

        const loanAmt = Number(row["Loan Amount"]) || 0;
        const fldgPercent = Number(row["FLDG"]) || 0; // e.g., 5 = 5%
        const processPercent = Number(row["PROCESS FEE"]) || 0; // e.g., 2 = 2%

        // Convert percentages to amounts
        const fldgValue = loanAmt * (fldgPercent / 100);
        const processFeeValue = loanAmt * (processPercent / 100);

        // GST on process fee
        const gstValue = processFeeValue * 0.18;

        // Final disbursement amount
        const disbursementAmount =
          loanAmt - (fldgValue + processFeeValue + gstValue);

        // ✅ Insert into DB
        const query = `
          INSERT INTO loan_booking_hey_ev (
            partner_loan_id, lan, login_date, customer_name, borrower_dob, father_name,
            address_line_1, address_line_2, village, district, state, pincode,
            mobile_number, email, loan_amount, interest_rate, loan_tenure,fldg,process_fee,emi_amount,
            guarantor_name, guarantor_dob, guarantor_aadhar, guarantor_pan, dealer_name,
            name_in_bank, bank_name, account_number, ifsc, aadhar_number, pan_card,
            product, lender, agreement_date, status, disbursement_amount, processing_fee,
            cibil_score, guarantor_cibil_score, relationship_with_borrower, co_applicant,
            co_applicant_dob, co_applicant_aadhar, co_applicant_pan, co_applicant_cibil_score,
            apr, battery_name, battery_type, battery_serial_no_1, battery_serial_no_2,
            e_rikshaw_model, chassis_no, customer_name_as_per_bank, customer_bank_name,
            customer_account_number, bank_ifsc_code
          ) VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,?,?
          )
        `;

        await conn.query(query, [
          partnerLoanId,
          lan,
          row["LOGIN DATE"] ? excelDateToJSDate(row["LOGIN DATE"]) : null,
          row["Customer Name"],
          row["Borrower DOB"] ? excelDateToJSDate(row["Borrower DOB"]) : null,
          row["Father Name"],
          row["Address Line 1"],
          row["Address Line 2"],
          row["Village"],
          row["District"],
          row["State"],
          row["Pincode"],
          row["Mobile Number"],
          row["Email"],
          row["Loan Amount"],
          row[" Interest Rate "],
          row["Tenure"],
          row["FLDG"],
          row["PROCESS FEE"],
          row["EMI Amount"],
          row["GURANTOR"],
          row["GURANTOR DOB"] ? excelDateToJSDate(row["GURANTOR DOB"]) : null,
          row["GURANTOR ADHAR"],
          row["GURANTOR PAN"],
          row["DEALER NAME"],
          row["Name in Bank"],
          row["Bank name"],
          row["Account Number"],
          row["IFSC"],
          row["Aadhar Number"],
          row["Pan Card"],
          row["Product"],
          row["lender"] || "EV Loan",
          row["Agreement Date"]
            ? excelDateToJSDate(row["Agreement Date"])
            : null,
          row["status"] || "Login",
          disbursementAmount,
          row["Processing Fee"] || 0.0,
          row["CIBIL Score"],
          row["GURANTOR CIBIL Score"],
          row["Relationship with Borrower"],
          row["Co-Applicant"],
          row["Co-Applicant DOB"]
            ? excelDateToJSDate(row["Co-Applicant DOB"])
            : null,
          row["Co-Applicant AADHAR"],
          row["Co-Applicant PAN"],
          row["Co-Applicant CIBIL Score"],
          row["APR"],
          row["Battery Name"],
          row["Battery Type"],
          row["Battery Serial no 1"],
          row["Battery Serial no 2"],
          row["E-Rikshaw model"],
          row["Chassis no"],
          row["Customer Name as per bank"],
          row["Customer Bank name"],
          row["Customer Account Number"],
          row["Bank IFSC Code"],
        ]);

        await partnerLimitService.updateBookedLimit(
          conn,
          limitCheck.limitId,
          loanAmount,
          lan,
        );

        // Reserve FLDG after successful booking
        if (requiredFldg > 0) {
          await partnerFldgService.reserveFldg(
            conn,
            partner.partner_id,
            lan,
            requiredFldg,
            `HEY EV Loan reservation | Amount: ${loanAmount}`,
          );
        }

        await conn.commit();
        conn.release();

        success_rows.push({ row: R, lan, partnerLoanId, interestRate });
        console.log(`✅ Inserted row ${R} | PAN: ${panCard} | LAN: ${lan}`);
      } catch (err) {
        if (conn) {
          await conn.rollback();
          conn.release();
        }
        row_errors.push({
          row: R,
          stage: "insert",
          reason: err.sqlMessage || err.message,
        });
        console.error(`❌ Row ${R} failed:`, err);
      }
    }

    return res.json({
      message: "File processed.",
      total_rows: sheetData.length,
      inserted_rows: success_rows.length,
      failed_rows: row_errors.length,
      success_rows,
      row_errors,
    });
  } catch (error) {
    console.error("❌ Error in Upload Process:", error);
    return res.status(500).json({
      message: "Upload failed. Please try again.",
      error: error.sqlMessage || error.message,
    });
  }
});

router.post(
  "/hey-ev-battery-upload",
  upload.single("file"),
  async (req, res) => {
    console.log("Inside battery upload route");
    if (!req.file)
      return res.status(400).json({ message: "No file uploaded." });

    if (!req.body.lenderType)
      return res.status(400).json({ message: "Lender type is required." });

    try {
      const lenderType = req.body.lenderType.trim();
      if (lenderType !== "HeyEV Battery") {
        return res.status(400).json({
          message: "Invalid lender type. Only HeyEV Battery allowed.",
        });
      }

      const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
      const sheet = workbook.SheetNames[0];
      const sheetData = xlsx.utils.sheet_to_json(workbook.Sheets[sheet]);

      if (!sheetData.length)
        return res.status(400).json({ message: "Empty Excel file." });

      const requiredFields = [
        "LOGIN DATE",
        "Customer Name",
        "Borrower DOB",
        "Father Name",
        "Address Line 1",
        "Address Line 2",
        "Village",
        "District",
        "State",
        "Pincode",
        "Mobile Number",
        "Invoice Amount",
        "LTV",
        "Loan Amount",
        " Interest Rate ",
        "Tenure",
        "FLDG",
        "Process Fee",
        "DEALER NAME",
        "Name in Bank",
        "Bank name",
        "Account Number",
        "IFSC",
        "Borrower Aadhar Number",
        "Borrower Pan Card",
        "Product",
        "lender",
        "Agreement Date",
        "CIBIL Score",
        "APR",
        "Customer Name as per bank",
        "Customer Bank name",
        "Customer Account Number",
        "Bank IFSC Code",
        "Battery Name",
        "Battery Type",
        "Battery Serial no 1",
        "Charger Serial no",
        "E-Rikshaw model",
        "Chassis no",
        "E-Rickshaw No.",
      ];

      const success_rows = [];
      const row_errors = [];

      for (let i = 0; i < sheetData.length; i++) {
        const row = sheetData[i];
        const R = i + 2;
        let conn;

        try {
          // Validate required fields
          const missing = requiredFields.filter(
            (field) => !row[field] || String(row[field]).trim() === "",
          );

          if (missing.length) {
            row_errors.push({
              row: R,
              reason: `Missing: ${missing.join(", ")}`,
            });
            continue;
          }

          // Validate lender
          if (String(row["lender"]).trim() !== "HeyEV Battery") {
            row_errors.push({
              row: R,
              reason: "Invalid lender value in row.",
            });
            continue;
          }

          // Validate interest
          const interestRate = Number(row[" Interest Rate "]);
          if (isNaN(interestRate) || interestRate <= 0) {
            row_errors.push({
              row: R,
              reason: "Invalid interest rate.",
            });
            continue;
          }

          const pan = row["Borrower Pan Card"].trim();

          // Duplicate check
          const [exists] = await db
            .promise()
            .query(
              "SELECT lan FROM loan_booking_hey_ev_battery WHERE borrower_pan_card = ?",
              [pan],
            );

          if (exists.length) {
            row_errors.push({
              row: R,
              reason: `Duplicate PAN: ${pan}`,
            });
            continue;
          }

          // Generate IDs
          conn = await db.promise().getConnection();
          await conn.beginTransaction();

          const partnerName = "HeyEV Battery";

          const loginDate = excelDateToJSDate(row["LOGIN DATE"]);
          const loanAmount = Number(row["Loan Amount"]) || 0;
          const today = new Date();
          const { month, year } = getMonthYear(today);

          const partner = await partnerLimitService.getOrCreatePartner(
            conn,
            partnerName,
          );

          const limitCheck =
            await partnerLimitService.validatePartnerBookingLimit(
              conn,
              partner.partner_id,
              loanAmount,
              month,
              year,
            );

          if (!limitCheck.valid) {
            await conn.rollback();
            conn.release();

            row_errors.push({
              row: R,
              reason: `Limit exceeded. Remaining ${limitCheck.remaining}, Required ${loanAmount}`,
            });

            continue;
          }

          // Fetch partner FLDG percent
          const [[partnerConfig]] = await conn.query(
            `SELECT fldg_percent, fldg_status FROM partner_master WHERE partner_id = ?`,
            [partner.partner_id],
          );

          if (!partnerConfig) {
            throw new Error("Partner configuration not found");
          }

          let requiredFldg = 0;

          if (partnerConfig?.fldg_status === 1) {
            const fldgPercentage = Number(partnerConfig?.fldg_percent || 0);

            requiredFldg = Number(
              ((loanAmount * fldgPercentage) / 100).toFixed(2),
            );
          }

          // Validate FLDG availability
          if (requiredFldg > 0) {
            const fldgCheck = await partnerFldgService.validateFldgAvailability(
              conn,
              partner.partner_id,
              requiredFldg,
            );

            if (!fldgCheck.valid) {
              await conn.rollback();
              conn.release();

              row_errors.push({
                row: R,
                stage: "fldg-check",
                reason: `Insufficient FLDG. Available: ${fldgCheck.available}, Required: ${requiredFldg}`,
              });

              continue;
            }
          }

          const { partnerLoanId, lan } =
            await generateLoanIdentifiers(lenderType);

          // -------------------------------
          // Auto Calculations
          // -------------------------------

          const invoiceAmount = Number(row["Invoice Amount"]) || 0;

          // LTV may contain %, remove it
          const ltvRaw = String(row["LTV"]).replace("%", "");
          const ltvPercent = Number(ltvRaw) || 0;

          const eligibleLoanAmount = invoiceAmount * (ltvPercent / 100);

          // Fees
          const fldgPercent = Number(row["FLDG"]) || 0;
          const processPercent = Number(row["Process Fee"]) || 0;

          const fldgValue = loanAmount * (fldgPercent / 100);
          const processFeeValue = loanAmount * (processPercent / 100);
          const gstValue = processFeeValue * 0.18;

          const disbursementAmount =
            loanAmount - (fldgValue + processFeeValue + gstValue);

          // -------------------------------
          // INSERT QUERY — EXACT MATCH TO DB STRUCTURE
          // -------------------------------

          const q = `
            INSERT INTO loan_booking_hey_ev_battery (
              partner_loan_id, lan, login_date, customer_name, borrower_dob,
              father_name, address_line_1, address_line_2, village, district,
              state, pincode, mobile_number, invoice_amount, ltv,
              eligible_loan_amount, loan_amount, interest_rate, tenure,
              dealer_name, name_in_bank, bank_name, account_number, ifsc,
              borrower_aadhar_number, borrower_pan_card, product, lender,
              agreement_date, cibil_score, apr, customer_name_as_per_bank,
              customer_bank_name, customer_account_number, bank_ifsc_code,
              battery_name, battery_type, battery_serial_no_1, charger_serial_no,
              e_rikshaw_model, chassis_no, ckyc_no, e_rickshaw_no,
              fldg, process_fee, gst, disbursement_amount, status
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
          `;

          await conn.query(q, [
            partnerLoanId,
            lan,
            excelDateToJSDate(row["LOGIN DATE"]),
            row["Customer Name"],
            excelDateToJSDate(row["Borrower DOB"]),
            row["Father Name"],
            row["Address Line 1"],
            row["Address Line 2"],
            row["Village"],
            row["District"],
            row["State"],
            row["Pincode"],
            row["Mobile Number"],
            invoiceAmount,
            ltvPercent,
            eligibleLoanAmount,
            loanAmount,
            interestRate,
            row["Tenure"],
            row["DEALER NAME"],
            row["Name in Bank"],
            row["Bank name"],
            row["Account Number"],
            row["IFSC"],
            row["Borrower Aadhar Number"],
            pan,
            row["Product"],
            row["lender"],
            excelDateToJSDate(row["Agreement Date"]),
            row["CIBIL Score"],
            row["APR"],
            row["Customer Name as per bank"],
            row["Customer Bank name"],
            row["Customer Account Number"],
            row["Bank IFSC Code"],
            row["Battery Name"],
            row["Battery Type"],
            row["Battery Serial no 1"],
            row["Charger Serial no"],
            row["E-Rikshaw model"],
            row["Chassis no"],
            row["CKYC NO"] || null,
            row["E-Rickshaw No."],
            fldgValue,
            processFeeValue,
            gstValue,
            disbursementAmount,
            "Login",
          ]);

          await partnerLimitService.updateBookedLimit(
            conn,
            limitCheck.limitId,
            loanAmount,
            lan,
          );

          if (requiredFldg > 0) {
            await partnerFldgService.reserveFldg(
              conn,
              partner.partner_id,
              lan,
              requiredFldg,
              `HEY EV Battery Loan reservation | Amount: ${loanAmount}`,
            );
          }

          await conn.commit();
          conn.release();

          success_rows.push({ row: R, lan, partnerLoanId });
        } catch (err) {
          if (conn) {
            await conn.rollback();
            conn.release();
          }

          row_errors.push({
            row: R,
            reason: err.message,
          });
        }
      }

      return res.json({
        message: "HeyEV Battery file processed.",
        total_rows: sheetData.length,
        inserted_rows: success_rows.length,
        failed_rows: row_errors.length,
        success_rows,
        row_errors,
      });
    } catch (error) {
      console.error("❌ Error in HeyEV Battery Upload Process:", error);
      return res.status(500).json({
        message: "Battery upload failed. Please try again.",
        error: error.sqlMessage || error.message,
      });
    }
  },
);

const toClientError = (err) => {
  if (!err) return { message: "Unknown error" };
  // MySQL errors often have sqlMessage/sqlState/errno/code
  const { message, code, errno, sqlState, sqlMessage } = err;
  return {
    message: sqlMessage || message || "Error",
    code: code || null,
    errno: errno || null,
    sqlState: sqlState || null,
  };
};

router.get("/login-loans", (req, res) => {
  const { table = "loan_booking_ev", prefix = "EV" } = req.query;

  const allowedTables = {
    loan_bookings: true,
    loan_booking_ev: true,
    loan_booking_hey_ev: true,
    loan_booking_adikosh: true,
    loan_booking_gq_non_fsf: true,
    loan_booking_gq_fsf: true,
    loan_bookings_wctl: true,
    loan_booking_emiclub: true,
    loan_booking_carepay: true,
    loan_booking_sterlion: true,
    loan_booking_zypay_customer: true,
    loan_booking_finso: true,
    loan_booking_circle_pe_houser: true,
    loan_booking_motion_corp: true,
    loan_booking_clayyo: true,
    loan_booking_switch_my_loan: true,
    loan_booking_circle_pe: true,
    loan_booking_loan_digit: true,
    loan_booking_hey_ev_battery: true,
    loan_booking_seven_fincorp: true,
    loan_booking_bundela: true,
    loan_booking_fundify: true,
    dealer_onboarding: true,
    loan_booking_srbh: true,
  };

  if (!allowedTables[table]) {
    return res.status(400).json({ message: "Invalid table name" });
  }

  let query;

  if (table === "loan_booking_clayyo") {
    // ✅ Only Clayyo needs hospital join
    query = `
      SELECT
        lb.*,
        ch.hospital_legal_name
      FROM ?? lb
      LEFT JOIN clayyo_hospital_booking ch
        ON ch.id = lb.hospital_id
      WHERE lb.status = 'Login'
        AND lb.LAN LIKE ?
    `;
  } else if (table === "loan_booking_finso") {
    query = `
      SELECT *
      FROM ??
      WHERE status in ('Login', 'Credit Initiated')
        AND LAN LIKE ?
    `;
  } else {
    // ✅ Other lenders unchanged
    query = `
      SELECT *
      FROM ??
      WHERE status = 'Login'
        AND LAN LIKE ?
    `;
  }

  const values = [table, `${prefix}%`];

  db.query(query, values, (err, results) => {
    if (err) {
      console.error("Error fetching login stage loans:", err);
      return res.status(500).json({ message: "Database error" });
    }

    res.json(results);
  });
});

router.post("/update-umrn", (req, res) => {
  const { lan, umrn, table = "loan_booking_helium" } = req.body;

  const allowedTables = {
    loan_booking_helium: true,
    loan_booking_ev: true,
    loan_booking_hey_ev: true,
    loan_booking_adikosh: true,
    loan_booking_gq_non_fsf: true,
    loan_booking_gq_fsf: true,
    loan_bookings_wctl: true,
    loan_booking_emiclub: true,
    loan_booking_carepay: true,
    loan_booking_sterlion: true,
    loan_booking_zypay_customer: true,
    loan_booking_finso: true,
    loan_booking_clayyo: true,
    loan_booking_circle_pe: true,
    loan_booking_motion_corp: true,
    loan_booking_loan_digit: true,
    loan_booking_hey_ev_battery: true,
    loan_booking_seven_fincorp: true,
    loan_booking_bundela: true,
  };

  if (!allowedTables[table]) {
    return res.status(400).json({
      success: false,
      message: "Invalid table selected",
    });
  }

  if (!lan || !umrn) {
    return res.status(400).json({
      success: false,
      message: "LAN and UMRN are required",
    });
  }

  console.log("console values", lan, umrn, table);

  const checkQuery = `SELECT lan FROM ?? WHERE lan = ?`;
  console.log("console query", checkQuery);

  db.query(checkQuery, [table, lan], (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).json({
        success: false,
        message: "Database error",
      });
    }

    if (result.length === 0) {
      return res.status(404).json({
        success: false,
        message: "LAN not found",
      });
    }

    const updateQuery = `
      UPDATE ??
      SET enach_umrn = ?,
      bank_status = 'MANDATE_CREATED'
      WHERE lan = ?
    `;

    db.query(updateQuery, [table, umrn, lan], (err, updateResult) => {
      if (err) {
        console.error(err);
        return res.status(500).json({
          success: false,
          message: "Failed to update UMRN",
        });
      }

      return res.json({
        success: true,
        message: "UMRN updated successfully",
      });
    });
  });
});

router.get("/approve-initiate-loans", async (req, res) => {
  const {
    table = "loan_booking_ev",
    prefix = "EV",
    page = "1",
    pageSize = "25",
    search = "",
    sortBy = "LAN",
    sortDir = "desc",
  } = req.query;

  const allowedTables = {
    loan_bookings: true,
    loan_booking_ev: true,
    loan_booking_hey_ev: true,
    loan_booking_adikosh: true,
    loan_booking_gq_non_fsf: true,
    loan_booking_motion_corp: true,
    loan_booking_gq_fsf: true,
    loan_bookings_wctl: true,
    loan_booking_emiclub: true,
    loan_booking_carepay: true,
    loan_booking_sterlion: true,
    loan_booking_zypay_customer: true,
    loan_booking_finso: true,
    loan_booking_circle_pe: true,
    loan_booking_circle_pe_houser: true,
    loan_booking_hey_ev_battery: true,
    loan_booking_loan_digit: true,
    loan_booking_seven_fincorp: true,
    loan_booking_bundela: true,
    loan_booking_srbh: true,
  };
  if (!allowedTables[table])
    return res.status(400).json({ message: "Invalid table name" });

  const pg = Math.max(1, parseInt(page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 25));
  const offset = (pg - 1) * limit;
  const safeSortDir = sortDir.toLowerCase() === "asc" ? "ASC" : "DESC";
  // Only allow whitelisted sort columns to prevent SQL injection
  const allowedSort = [
    "LAN",
    "partner_loan_id",
    "customer_name",
    "mobile_number",
    "agreement_date",
    "loan_amount",
  ];
  const sortCol = allowedSort.includes(sortBy) ? sortBy : "LAN";

  try {
    const likeVal = `${prefix}%`;
    const searchClause = search
      ? ` AND (lb.LAN LIKE ? OR lb.customer_name LIKE ? OR lb.partner_loan_id LIKE ?)`
      : "";
    const searchParams = search
      ? [`%${search}%`, `%${search}%`, `%${search}%`]
      : [];

    const countSql = `SELECT COUNT(*) AS total FROM ?? lb WHERE lb.status = 'Disburse initiate' AND lb.LAN LIKE ?${searchClause}`;
    const dataSql = `SELECT lb.* FROM ?? lb WHERE lb.status = 'Disburse initiate' AND lb.LAN LIKE ?${searchClause} ORDER BY lb.${sortCol} ${safeSortDir} LIMIT ? OFFSET ?`;

    const [[countRows], [rows]] = await Promise.all([
      db.promise().query(countSql, [table, likeVal, ...searchParams]),
      db
        .promise()
        .query(dataSql, [table, likeVal, ...searchParams, limit, offset]),
    ]);

    res.json({
      rows,
      pagination: {
        page: pg,
        pageSize: limit,
        total: Number(countRows[0]?.total || 0),
      },
    });
  } catch (err) {
    console.error("Error fetching approve-initiate loans:", err);
    res.status(500).json({ message: "Database error" });
  }
});

router.get("/all-loans", async (req, res) => {
  const {
    table = "loan_bookings",
    prefix = "BL",
    page = "1",
    pageSize = "1000",
    search = "",
    sortBy = "LAN",
    sortDir = "desc",
  } = req.query;

  const allowedTables = {
    loan_bookings: true,
    loan_booking_ev: true,
    loan_booking_adikosh: true,
    loan_booking_gq_non_fsf: true,
    loan_booking_gq_fsf: true,
    loan_bookings_wctl: true,
    loan_booking_hey_ev: true,
    loan_booking_emiclub: true,
    loan_booking_carepay: true,
    loan_booking_sterlion: true,
    loan_booking_zypay_customer: true,
    loan_booking_embifi: true,
    loan_booking_finso: true,
    loan_booking_motion_corp: true,
    loan_booking_bundela: true,
    loan_booking_seven_fincorp: true,
    loan_booking_clayyo: true,
    loan_booking_circle_pe: true,
    loan_booking_circle_pe_houser: true,
    loan_booking_carepay: true,
    loan_booking_sterlion: true,
    loan_booking_hey_ev_battery: true,
    loan_booking_switch_my_loan: true,
    loan_booking_loan_digit: true,
    dealer_onboarding: true,
    loan_booking_srbh: true,
  };

  if (!allowedTables[table]) {
    return res.status(400).json({ message: "Invalid table name" });
  }

  const pg = Math.max(1, parseInt(page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 25));
  const offset = (pg - 1) * limit;
  const safeSortDir = sortDir.toLowerCase() === "asc" ? "ASC" : "DESC";

  const allowedSort = [
    "LAN",
    "partner_loan_id",
    "customer_name",
    "mobile_number",
    "agreement_date",
    "loan_amount",
    "status",
  ];
  const sortCol = allowedSort.includes(sortBy) ? sortBy : "LAN";

  try {
    const likeVal = `${prefix}%`;

    const isGqTable =
      table === "loan_booking_gq_non_fsf" || table === "loan_booking_gq_fsf";

    const searchClause = search
      ? isGqTable
        ? ` AND (
            lb.LAN LIKE ?
            OR lb.customer_name LIKE ?
            OR lb.partner_loan_id LIKE ?
            OR lb.app_id LIKE ?
          )`
        : ` AND (
            lb.LAN LIKE ?
            OR lb.customer_name LIKE ?
            OR lb.partner_loan_id LIKE ?
          )`
      : "";

    const searchParams = search
      ? isGqTable
        ? [`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`]
        : [`%${search}%`, `%${search}%`, `%${search}%`]
      : [];

    const countSql = `
      SELECT COUNT(*) AS total
      FROM ?? lb
      WHERE lb.LAN LIKE ?${searchClause}
    `;

    const dataSql = `
      SELECT
        lb.*,
        DATE_FORMAT(
          CONVERT_TZ(edu.disbursement_date, '+00:00', '+05:30'),
          '%Y-%m-%d %H:%i:%s'
        ) AS disbursement_date
      FROM ?? AS lb
      LEFT JOIN ev_disbursement_utr AS edu ON edu.LAN = lb.LAN
      WHERE lb.LAN LIKE ?${searchClause}
      ORDER BY lb.${sortCol} ${safeSortDir}
      LIMIT ? OFFSET ?
    `;

    const [[countRows], [rows]] = await Promise.all([
      db.promise().query(countSql, [table, likeVal, ...searchParams]),
      db
        .promise()
        .query(dataSql, [table, likeVal, ...searchParams, limit, offset]),
    ]);

    res.json({
      rows,
      pagination: {
        page: pg,
        pageSize: limit,
        total: Number(countRows[0]?.total || 0),
      },
    });
  } catch (err) {
    console.error("Error fetching all loans:", err);
    res.status(500).json({ message: "Database error" });
  }
});

router.get("/approved-loans", async (req, res) => {
  const {
    table = "loan_booking_ev",
    prefix = "EV",
    page = "1",
    pageSize = "25",
    search = "",
    sortBy = "LAN",
    sortDir = "desc",
  } = req.query;

  const allowedTables = {
    loan_bookings: true,
    loan_booking_ev: true,
    loan_booking_hey_ev: true,
    loan_booking_adikosh: true,
    loan_booking_gq_non_fsf: true,
    loan_booking_gq_fsf: true,
    loan_bookings_wctl: true,
    loan_booking_emiclub: true,
    loan_booking_carepay: true,
    loan_booking_sterlion: true,
    loan_booking_zypay_customer: true,
    loan_booking_embifi: true,
    loan_booking_finso: true,
    loan_booking_motion_corp: true,
    loan_booking_circle_pe_houser: true,
    loan_booking_circle_pe: true,
    loan_booking_hey_ev_battery: true,
    loan_booking_switch_my_loan: true,
    loan_booking_loan_digit: true,
    loan_booking_seven_fincorp: true,
    loan_booking_bundela: true,
    dealer_onboarding: true,
    loan_booking_srbh: true,
  };
  if (!allowedTables[table])
    return res.status(400).json({ message: "Invalid table name" });

  const pg = Math.max(1, parseInt(page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 25));
  const offset = (pg - 1) * limit;
  const safeSortDir = sortDir.toLowerCase() === "asc" ? "ASC" : "DESC";
  const allowedSort = [
    "LAN",
    "partner_loan_id",
    "customer_name",
    "mobile_number",
    "agreement_date",
    "loan_amount",
  ];
  const sortCol = allowedSort.includes(sortBy) ? sortBy : "LAN";

  try {
    const likeVal = `${prefix}%`;
    const searchClause = search
      ? ` AND (lb.LAN LIKE ? OR lb.customer_name LIKE ? OR lb.partner_loan_id LIKE ?)`
      : "";
    const searchParams = search
      ? [`%${search}%`, `%${search}%`, `%${search}%`]
      : [];

    const countSql = `SELECT COUNT(*) AS total FROM ?? lb WHERE lb.status = 'Approved' AND lb.LAN LIKE ?${searchClause}`;
    const dataSql = `SELECT lb.* FROM ?? lb WHERE lb.status = 'Approved' AND lb.LAN LIKE ?${searchClause} ORDER BY lb.${sortCol} ${safeSortDir} LIMIT ? OFFSET ?`;

    const [[countRows], [rows]] = await Promise.all([
      db.promise().query(countSql, [table, likeVal, ...searchParams]),
      db
        .promise()
        .query(dataSql, [table, likeVal, ...searchParams, limit, offset]),
    ]);

    res.json({
      rows,
      pagination: {
        page: pg,
        pageSize: limit,
        total: Number(countRows[0]?.total || 0),
      },
    });
  } catch (err) {
    console.error("Error fetching approved loans:", err);
    res.status(500).json({ message: "Database error" });
  }
});

router.get("/disbursed-loans", async (req, res) => {
  const {
    table = "loan_booking_ev",
    prefix = "EV",
    page = "1",
    pageSize = "25",
    search = "",
    sortBy = "LAN",
    sortDir = "desc",
  } = req.query;

  const allowedTables = {
    loan_bookings: true,
    loan_booking_adikosh: true,
    loan_booking_gq_non_fsf: true,
    loan_booking_gq_fsf: true,
    loan_booking_emiclub: true,
    loan_booking_carepay: true,
    loan_booking_sterlion: true,
    loan_booking_zypay_customer: true,
    loan_bookings_wctl: true,
    loan_booking_ev: true,
    loan_booking_hey_ev: true,
    loan_booking_embifi: true,
    loan_booking_motion_corp: true,
    loan_booking_finso: true,
    loan_booking_circle_pe: true,
    loan_booking_circle_pe_houser: true,
    loan_booking_hey_ev_battery: true,
    loan_booking_loan_digit: true,
    loan_booking_seven_fincorp: true,
    loan_booking_bundela: true,
    loan_booking_srbh: true,
  };
  if (!allowedTables[table])
    return res.status(400).json({ message: "Invalid table name" });

  const pg = Math.max(1, parseInt(page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 25));
  const offset = (pg - 1) * limit;
  const safeSortDir = sortDir.toLowerCase() === "asc" ? "ASC" : "DESC";
  const allowedSort = [
    "LAN",
    "partner_loan_id",
    "customer_name",
    "mobile_number",
    "agreement_date",
    "loan_amount",
  ];
  const sortCol = allowedSort.includes(sortBy) ? sortBy : "LAN";

  try {
    const likeVal = `${prefix}%`;
    const searchClause = search
      ? ` AND (lb.LAN LIKE ? OR lb.customer_name LIKE ? OR lb.partner_loan_id LIKE ?)`
      : "";
    const searchParams = search
      ? [`%${search}%`, `%${search}%`, `%${search}%`]
      : [];

    const countSql = `SELECT COUNT(*) AS total FROM ?? lb WHERE lb.status = 'Disbursed' AND lb.LAN LIKE ?${searchClause}`;
    const dataSql = `
      SELECT lb.*, DATE_FORMAT(CONVERT_TZ(edu.disbursement_date, '+00:00', '+05:30'), '%Y-%m-%d %H:%i:%s') AS disbursement_date
      FROM ?? AS lb
      LEFT JOIN ev_disbursement_utr AS edu ON edu.LAN = lb.LAN
      WHERE lb.status = 'Disbursed' AND lb.LAN LIKE ?${searchClause}
      ORDER BY lb.${sortCol} ${safeSortDir}
      LIMIT ? OFFSET ?
    `;

    const [[countRows], [rows]] = await Promise.all([
      db.promise().query(countSql, [table, likeVal, ...searchParams]),
      db
        .promise()
        .query(dataSql, [table, likeVal, ...searchParams, limit, offset]),
    ]);

    res.json({
      rows,
      pagination: {
        page: pg,
        pageSize: limit,
        total: Number(countRows[0]?.total || 0),
      },
    });
  } catch (err) {
    console.error("Error fetching disbursed loans:", err);
    res.status(500).json({ message: "Database error" });
  }
});

router.put("/login-loans/:lan", (req, res) => {
  const lan = req.params.lan;
  const { status, table, loan_amount = null } = req.body;

  const allowedTables = {
    loan_bookings: true,
    loan_booking_adikosh: true,
    loan_booking_gq_non_fsf: true,
    loan_booking_motion_corp: true,
    loan_booking_bundela: true,
    loan_booking_seven_fincorp: true,
    loan_booking_gq_fsf: true,
    loan_bookings_wctl: true,
    loan_booking_ev: true,
    loan_booking_hey_ev: true,
    loan_booking_emiclub: true,
    loan_booking_carepay: true,
    loan_booking_sterlion: true,
    loan_booking_zypay_customer: true,
    loan_booking_finso: true,
    loan_booking_circle_pe: true,
    loan_boooking_circle_pe_houser: true,
    loan_booking_hey_ev_battery: true,
    loan_booking_loan_digit: true,
    loan_booking_switch_my_loan: true,
    dealer_onboarding: true,
    loan_booking_fundify: true,
    loan_booking_srbh: true,
  };

  if (!allowedTables[table]) {
    return res.status(400).json({ message: "Invalid table name" });
  }

  if (!["Disburse initiate", "rejected", "Approved"].includes(status)) {
    return res.status(400).json({ message: "Invalid status value" });
  }

  const fields = ["status = ?"];
  const params = [status];

  if (
    ["loan_booking_carepay", "loan_booking_sterlion"].includes(table) &&
    status === "Disburse initiate"
  ) {
    const creditLimit = Number(loan_amount);

    if (!creditLimit || Number.isNaN(creditLimit) || creditLimit <= 0) {
      return res.status(400).json({
        message: "Valid credit team limit is required",
      });
    }

    fields.push("loan_amount = ?");
    params.push(creditLimit);
  }

  const query = `UPDATE ?? SET ${fields.join(", ")} WHERE lan = ?`;
  const values = [table, ...params, lan];

  db.query(query, values, async (err, result) => {
    if (err) {
      console.error("Error updating loan status:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    if (result.affectedRows === 0) {
      return res
        .status(404)
        .json({ message: `Loan not found with LAN ${lan}` });
    }

    // ✅ Fetch loan details for email + webhook
    db.query(
      `SELECT customer_name, loan_amount, partner_loan_id FROM ?? WHERE lan = ?`,
      [table, lan],
      async (fetchErr, rows) => {
        if (fetchErr) {
          console.error("Error fetching loan details:", fetchErr);
        } else if (rows.length > 0) {
          const {
            loan_amount: loanAmount,
            customer_name: customerName,
            batch_id: batchId,
            partner_loan_id: partnerLoanId,
          } = rows[0];

          // ✅ EMAIL — for ADK loans only
          if (lan.startsWith("ADK")) {
            try {
              await sendLoanStatusMail({
                to: [
                  "abhishek@getkosh.com",
                  "ravikumar@nfcpl.in",
                  "vineet.ranjan@getkosh.com",
                  "rajeev@nfcpl.in",
                  "sanika.gurav@fintreefinance.com",
                ],
                customerName,
                batchId,
                loanAmount,
                status,
              });
              console.log(`Email sent for ${lan} (${status})`);
            } catch (mailErr) {
              console.error("Error sending email:", mailErr);
            }
          }

          console.log(
            lan,
            "lan",
            status,
            "status",
            partnerLoanId,
            "partner loan id",
            customerName,
            "customer name",
          );

          // ✅ WEBHOOK — for FINS loans only
          if (lan.startsWith("FINS")) {
            const webhookUrl = process.env.FINS_DISBINITIATE_WEBHOOK_URL;
            const payload = {
              lan,
              status,
              partner_loan_id: partnerLoanId,
              customer_name: customerName,
            };

            const username = process.env.FINSO_WEBHOOK_USERNAME;
            const password = process.env.FINSO_WEBHOOK_PASSWORD;

            try {
              await axios.post(webhookUrl, payload, {
                // auth: {
                //   username,
                //   password,
                // },
                headers: {
                  "Content-Type": "application/json",
                },
              });
              console.log(`✅ Webhook sent for ${lan} (${status})`);
            } catch (webhookErr) {
              console.error("❌ Error sending webhook:", webhookErr.message);
            }
          }
        }
      },
    );

    res.json({
      message: `Loan with LAN ${lan} updated to ${status} in ${table}`,
    });
  });
});

// router.put("/login-loans/:lan", async (req, res) => {
//   try {
//     const lan = req.params.lan;
//     const { status, table } = req.body;

//     const allowedTables = {
//     loan_bookings: true,
//     loan_booking_adikosh: true,
//     loan_booking_gq_non_fsf: true,
//     loan_booking_gq_fsf: true,
//     loan_bookings_wctl: true,
//     loan_booking_ev: true,
//     loan_booking_hey_ev:true,
//     loan_booking_emiclub: true,
//     loan_booking_finso: true,
//     loan_booking_circle_pe: true,
//   };

//     if (!allowedTables[table]) return res.status(400).json({ message: "Invalid table name" });
//     if (!["Disburse initiate", "rejected"].includes(status)) return res.status(400).json({ message: "Invalid status value" });

//     const result = await db.query(`UPDATE ?? SET status = ? WHERE lan = ?`, [table, status, lan]);
//     if (result.affectedRows === 0) return res.status(404).json({ message: `Loan not found with LAN ${lan}` });

//     const [loan] = await db.query(`SELECT customer_name, loan_amount, batch_id, partner_loan_id FROM ?? WHERE lan = ?`, [table, lan]);
//     if (!loan) return res.json({ message: `Loan updated, but no details found for ${lan}` });

//     const { customer_name, loan_amount, batch_id, partner_loan_id } = loan;
//     const tasks = [];

//     if (lan.startsWith("ADK")) {
//       tasks.push(sendLoanStatusMail({
//         to: [
//           "abhishek@getkosh.com",
//           "ravikumar@nfcpl.in",
//           "vineet.ranjan@getkosh.com",
//           "rajeev@nfcpl.in",
//           "sanika.gurav@fintreefinance.com",
//         ],
//         customerName: customer_name,
//         batchId: batch_id,
//         loanAmount: loan_amount,
//         status,
//       }));
//     }

//     if (lan.startsWith("FINS")) {
//       const webhookUrl = "https://n8nautomation.dsacrm.com/webhook/d8b42123-feea-4b3c-9df6-330899116e10";
//       tasks.push(axios.post(webhookUrl, {
//         lan,
//         status,
//         partner_loan_id,
//         customer_name,
//       }));
//     }

//     // Run webhook and email in parallel, don’t block response for too long
//     Promise.allSettled(tasks).then(results => {
//       results.forEach(r => {
//         if (r.status === "rejected") console.error("Background task failed:", r.reason);
//       });
//     });

//     res.json({ message: `Loan with LAN ${lan} updated to ${status} in ${table}` });
//   } catch (err) {
//     console.error("Error:", err);
//     res.status(500).json({ message: "Internal Server Error", error: err.message });
//   }
// });

// router.put("/approve-initiated-loans/:lan", (req, res) => {
//   const lan = req.params.lan;
//   const { status, table } = req.body;

//   const allowedTables = {
//     loan_bookings: true,
//     loan_booking_adikosh: true,
//     loan_booking_gq_non_fsf: true,
//     loan_booking_gq_fsf: true,
//     loan_booking_emiclub: true, // 🔥 payout table
//     loan_bookings_wctl: true,
//     loan_booking_ev: true,
//     loan_booking_hey_ev: true,
//     loan_booking_motion_corp: true,
//     loan_booking_finso: true,
//     loan_booking_circle_pe: true,
//     loan_booking_hey_ev_battery: true,
//     loan_booking_zypay_customer: true,
//     loan_booking_loan_digit: true,
//   };

//   if (!allowedTables[table]) {
//     return res.status(400).json({ message: "Invalid table name" });
//   }

//   if (!["approved", "rejected"].includes(status)) {
//     return res.status(400).json({ message: "Invalid status value" });
//   }

//   const updateQuery = `UPDATE ?? SET status = ? WHERE lan = ?`;

//   db.query(updateQuery, [table, status, lan], async (err, result) => {
//     if (err) {
//       console.error("Error updating loan status:", err);
//       return res.status(500).json({ message: "Database error" });
//     }

//     if (result.affectedRows === 0) {
//       return res
//         .status(404)
//         .json({ message: "Loan not found with LAN " + lan });
//     }

//     /* ======================================================
//        🔥 PAYOUT TRIGGER (ONLY EMICLUB + APPROVED) EMICLUB API DISBURSED
//     ====================================================== */
//     // let payoutTriggered = false;

//     // if (table === "loan_booking_emiclub" && status === "approved") {
//     //   payoutTriggered = true;
//     //   try {
//     //     // 🔁 fire-and-forget (do not block response)
// approveAndInitiatePayout({ lan, table }).catch((payoutErr) => {
//     //       console.error(
//     //         "Payout initiation failed for LAN:",
//     //         lan,
//     //         payoutErr
//     //       );
//     //     });
//     //   } catch (err) {
//     //     console.error("Error loading payout service:", err);
//     //   }
//     // }

//     /* ======================================================
//        📧 OPTIONAL EMAIL LOGIC (kept async, non-blocking)
//     ====================================================== */
//     /*
//     if (lan.startsWith("ADK")) {
//       db.query(
//         `SELECT customer_name, loan_amount, batch_id FROM ?? WHERE lan = ?`,
//         [table, lan],
//         async (fetchErr, rows) => {
//           if (!fetchErr && rows.length > 0) {
//             const { customer_name, loan_amount, batch_id } = rows[0];
//             try {
//               await sendLoanStatusMail({
//                 to: [...],
//                 customerName: customer_name,
//                 batchId: batch_id,
//                 loanAmount: loan_amount,
//                 status,
//               });
//             } catch (mailErr) {
//               console.error("Email error:", mailErr);
//             }
//           }
//         }
//       );
//     }
//     */

//     /* ======================================================
//        ✅ SINGLE RESPONSE (ONLY ONCE)
//     ====================================================== */
//     return res.json({
//       success: true,
//       lan,
//       table,
//       status,
//       // payoutTriggered,
//       message: `Loan ${status} successfully`,
//     });
//   });
// });

router.put("/approve-initiated-loans/:lan", (req, res) => {
  const lan = req.params.lan;

  const { status, stage = null, table, loan_amount = null } = req.body;

  const allowedTables = {
    loan_bookings: true,
    loan_booking_adikosh: true,
    loan_booking_gq_non_fsf: true,
    loan_booking_gq_fsf: true,
    loan_booking_emiclub: true,
    loan_booking_carepay: true,
    loan_booking_sterlion: true,
    loan_bookings_wctl: true,
    loan_booking_ev: true,
    loan_booking_hey_ev: true,
    loan_booking_motion_corp: true,
    loan_booking_finso: true,
    loan_booking_circle_pe: true,
    loan_booking_circle_pe_houser: true,
    loan_booking_hey_ev_battery: true,
    loan_booking_zypay_customer: true,
    loan_booking_loan_digit: true,
    loan_booking_seven_fincorp: true,
    loan_booking_bundela: true,
    loan_booking_srbh: true,
  };

  if (!allowedTables[table]) {
    return res.status(400).json({
      message: "Invalid table name",
    });
  }

  if (!status || typeof status !== "string") {
    return res.status(400).json({
      message: "Status is required",
    });
  }

  const fields = ["status = ?"];
  const params = [status];

  if (stage) {
    fields.push("stage = ?");
    params.push(stage);
  }

  const loanBookingTables = [
    "loan_booking_motion_corp",
    "loan_booking_seven_fincorp",
    "loan_booking_bundela",
    "loan_booking_srbh",
  ];

  if (loanBookingTables.includes(table) && loan_amount !== null) {
    const approvedLoanAmount = Number(loan_amount);
    // rest of your logic

    if (Number.isNaN(approvedLoanAmount) || approvedLoanAmount <= 0) {
      return res.status(400).json({
        message: "Valid approved loan amount is required",
      });
    }

    fields.push("loan_amount = ?");
    params.push(approvedLoanAmount);
  }

  const updateQuery = `
    UPDATE ??
    SET ${fields.join(", ")}
    WHERE lan = ?
  `;

  const queryParams = [table, ...params, lan];

  db.query(updateQuery, queryParams, async (err, result) => {
    if (err) {
      console.error("Error updating loan status:", err);

      return res.status(500).json({
        message: "Database error",
        error: err.sqlMessage || err.message,
      });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({
        message: "Loan not found with LAN " + lan,
      });
    }

    const loanBookingTables = [
      "loan_booking_motion_corp",
      "loan_booking_seven_fincorp",
      "loan_booking_bundela",
      "loan_booking_srbh",
    ];
    return res.json({
      success: true,
      lan,
      table,
      status,
      stage,
      loan_amount: loanBookingTables.includes(table) ? loan_amount : undefined,
      message: "Loan updated successfully",
    });
  });
});

router.post("/hc-upload", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: "No file uploaded" });
  if (!req.body.lenderType)
    return res.status(400).json({ message: "Lender type is required." });

  try {
    const lenderType = req.body.lenderType; // ✅ Ensure this is received

    // ✅ Read Excel File Correctly
    const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheetData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]); // ✅ Ensure sheetData is defined

    if (!sheetData || sheetData.length === 0) {
      return res
        .status(400)
        .json({ message: "Uploaded Excel file is empty or invalid." });
    }

    // ✅ Generate new loan identifiers
    const { partnerLoanId, lan } = await generateLoanIdentifiers(lenderType);

    // ✅ Insert Each Row into MySQL
    for (const row of sheetData) {
      // ✅ Generate new loan identifiers
      const { partnerLoanId, lan } = await generateLoanIdentifiers(lenderType);

      const query = `
      INSERT INTO loan_bookings (
        partner_loan_id, lan, login_date, customer_name, borrower_dob, father_name,
        address_line_1, address_line_2, village, district, state, pincode,
        mobile_number, email, occupation, relationship_with_borrower, cibil_score,
        guarantor_co_cibil_score, loan_amount, loan_tenure, interest_rate, emi_amount,
        guarantor_aadhar, guarantor_pan, dealer_name, name_in_bank, bank_name,
        account_number, ifsc, aadhar_number, pan_card, product, lender,
        agreement_date, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

      await db.promise().query(query, [
        partnerLoanId,
        lan,
        row["LOGIN DATE"] ? excelDateToJSDate(row["LOGIN DATE"]) : null,
        row["Customer Name"],
        row["Borrower DOB"] ? excelDateToJSDate(row["Borrower DOB"]) : null,
        row["Father Name"],
        row["Address Line 1"],
        row["Address Line 2"],
        row["Village"],
        row["District"],
        row["State"],
        row["Pincode"],
        row["Mobile Number"],
        row["Email"],
        row["Occupation"],
        row["Relationship with Borrower"],
        row["CIBIL Score"],
        row["GURANTOR/Co-Applicant CIBIL Score"], // ✅ New field
        row["Loan Amount"],
        row["Tenure"],
        row["Interest Rate"],
        row["EMI Amount"],
        row["GURANTOR/Co-Applicant ADHAR"],
        row["GURANTOR/Co-Applicant PAN"],
        row["DEALER NAME"],
        row["Name in Bank"],
        row["Bank name"],
        row["Account Number"],
        row["IFSC"],
        row["Aadhar Number"],
        row["Pan Card"],
        row["Product"],
        lenderType,
        row["Agreement Date"] ? excelDateToJSDate(row["LOGIN DATE"]) : null,
        "Approved",
      ]);
    }

    res.json({
      message: "File uploaded and data saved successfully",
      partnerLoanId,
      lan,
    });
  } catch (error) {
    console.error("Error processing file:", error);
    res.status(500).json({ message: "Error processing file" });
  }
});
//////////////////////////// EMBIFI START //////////////////////////////////////////////////////
// parse date robustly: Excel serial, 'YYYY-MM-DD', 'DD-MMM-YYYY'
const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const cleaned = v.replace(/,/g, "").trim();
    const parsed = parseFloat(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const parseDate = (v) => {
  if (!v) return null;
  // 1) use your helper if it can parse
  try {
    const d = excelDateToJSDate(v);
    if (d) return d; // already YYYY-MM-DD string
  } catch (_) {}

  // 2) ISO or date-like strings
  if (typeof v === "string") {
    // 'YYYY-MM-DD'
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;

    // 'DD-MMM-YYYY' e.g., '12-Aug-1984'
    const m = v.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
    if (m) {
      const [, dd, mmm, yyyy] = m;
      const months = {
        Jan: 0,
        Feb: 1,
        Mar: 2,
        Apr: 3,
        May: 4,
        Jun: 5,
        Jul: 6,
        Aug: 7,
        Sep: 8,
        Oct: 9,
        Nov: 10,
        Dec: 11,
      };
      const mm = months[mmm];
      if (mm !== undefined) {
        const dt = new Date(Date.UTC(Number(yyyy), mm, Number(dd)));
        return dt.toISOString().split("T")[0];
      }
    }
  }
};
//////date above //////
// router.post("/upload-embifi", upload.single("file"), async (req, res) => {
//   if (!req.file) return res.status(400).json({ message: "No file uploaded." });

//   try {
//     const wb = xlsx.read(req.file.buffer, { type: "buffer" });
//     const ws = wb.Sheets[wb.SheetNames[0]];
//     const rows = xlsx.utils
//       .sheet_to_json(ws)
//       .map((r, i) => ({ __row: i + 2, ...r }));

//     if (!rows.length)
//       return res.status(400).json({ message: "Empty or invalid Excel." });

//     const success = [],
//       failed = [];

//     for (const row of rows) {
//       const R = row.__row;

//       // === map your exact headers ===
//       const lan = (row["LAN"] || "").toString().trim();
//       const applicant_name = row["Applicant Name"] || null;
//       const applicant_dob = parseDate(row["Applicant DOB"]);
//       const applicant_age_years = num(row["Applicant Age"]);
//       const applicant_father_name = row["Applicant Father Name"] || null;
//       const pan_number = (row["PAN Number"] || "").toString().trim() || null;
//       const applicant_aadhaar_no =
//         (row["Applicant Aadhaar Number"] || "").toString().trim() || null;
//       const mobile_number =
//         (row["Mobile Number"] || "").toString().trim() || null;

//       const coapplicant_name = row["CO-Applicant Name"] || null;
//       const coapplicant_pan_no =
//         (row["CO-Applicant Pan No"] || "").toString().trim() || null;
//       const coapplicant_aadhaar_no =
//         (row["CO-Applicant Aadhar No"] || "").toString().trim() || null;
//       const coapplicant_dob = parseDate(row["CO-Applicant DOB"]);
//       const coapplicant_mobile_no =
//         (row["CO-Applicant Mobile No"] || "").toString().trim() || null;

//       const approved_loan_amount = num(row["Approved Loan Amount"]);
//       const processing_fees_with_tax = num(row["Processing Fees With Tax"]);
//       const processing_fees = num(row["Processing Fess"]); // note: “Fess” in sheet
//       const processing_fees_tax = num(row["Processing Fees Tax"]);
//       const subvention = num(row["Subvention"]);
//       const disbursal_amount = num(row["Disbursal Amount"]);

//       const loan_tenure_months = num(row["Loan Tenure"]);
//       const emi_amount = num(row["EMI Amount"]);
//       const interest_rate_percent = num(row["Intrest Rate"]); // note: “Intrest” in sheet

//       const status = row["Loan Status"] || null;
//       const product = row["Product"] || "Monthly Loan";
//       const lender = row["Lender"] || "Embifi";
//       const loan_admin_status = row["Loan Admin Status"] || null;

//       const first_emi_date = parseDate(row["First EMI Date"]);
//       const last_emi_date = parseDate(row["Last EMI Date"]);
//       const disbursement_date = parseDate(row["Disbursement Date"]);
//       const disbursement_utr = row["Disbursement UTR"] || null;

//       const applicant_address = row["Applicant Address"] || null;
//       const applicant_state = row["Applicant State"] || null;
//       const applicant_city = row["Applicant City"] || null;
//       const applicant_pin_code =
//         (row["Applicant Pin Code"] || "").toString().trim() || null;

//       const coapplicant_address = row["CO-Applicant Address"] || null;
//       const coapplicant_state =
//         row["CO-Applicant state"] || row["CO-Applicant State"] || null;
//       const coapplicant_pin_code =
//         (row["CO-Applicant Pin Code"] || "").toString().trim() || null;

//       const bureau_score = num(row["Bureau Score"]);
//       const monthly_income = num(row["Monthly Income"]);
//       const account_no = (row["Account No."] || "").toString().trim() || null;
//       const ifsc_code = (row["IFSC Code"] || "").toString().trim() || null;

//       const gps_device_cost = num(row["GPS Device Cost"]);
//       const gst_on_gps_device = num(row["GST on GPS device"]);
//       const total_gps_device_cost = num(row["Total GPS Device Cost"]);
//       const new_interest = num(row["New Interest"]);

//       // basic validation
//       if (
//         !lan ||
//         !applicant_name ||
//         !approved_loan_amount ||
//         !loan_tenure_months ||
//         !interest_rate_percent
//       ) {
//         failed.push({ row: R, reason: "Missing LAN/name/amount/tenure/rate" });
//         continue;
//       }

//       // Check duplicate PAN/Aadhaar in Embifi table
//       const [dups] = await db
//         .promise()
//         .query(`SELECT id FROM loan_booking_embifi WHERE pan_number = ? `, [
//           pan_number,
//         ]);
//       if (dups.length) {
//         failed.push({ row: R, reason: "Duplicate PAN" });
//         continue;
//       }

//       // get or generate partner_loan_id (your sheet has no column for it)
//       // let partner_loan_id = null;
//       // try {
//       //   const ids = await generateLoanIdentifiers("Embifi");
//       //   partner_loan_id = ids.partnerLoanId;
//       // } catch {
//       //   // minimal fallback if you don’t have the helper yet
//       //   partner_loan_id = `EMB-${Date.now()}-${Math.floor(Math.random()*1000)}`;
//       // }

//       // Insert into loan_booking_embifi
//       const sql = `
//         INSERT INTO loan_booking_embifi (
//            lan,
//           customer_name, applicant_dob, applicant_age_years, applicant_father_name,
//           pan_number, applicant_aadhaar_no, mobile_number,
//           coapplicant_name, coapplicant_pan_no, coapplicant_aadhaar_no, coapplicant_dob, coapplicant_mobile_no,
//           approved_loan_amount, processing_fees_with_tax, processing_fee, processing_fees_tax, subvention, disbursal_amount,
//           loan_tenure_months, emi_amount, interest_rate,
//           status, product, lender, loan_admin_status,
//           first_emi_date, last_emi_date, disbursement_date, disbursement_utr,
//           applicant_address, applicant_state, applicant_city, applicant_pin_code,
//           coapplicant_address, coapplicant_state, coapplicant_pin_code,
//           bureau_score, monthly_income, account_no, ifsc_code,
//           gps_device_cost, gst_on_gps_device, total_gps_device_cost,new_interest
//         ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
//       `;

//       await db
//         .promise()
//         .query(sql, [
//           lan,
//           applicant_name,
//           applicant_dob,
//           applicant_age_years,
//           applicant_father_name,
//           pan_number,
//           applicant_aadhaar_no,
//           mobile_number,
//           coapplicant_name,
//           coapplicant_pan_no,
//           coapplicant_aadhaar_no,
//           coapplicant_dob,
//           coapplicant_mobile_no,
//           approved_loan_amount,
//           processing_fees_with_tax,
//           processing_fees,
//           processing_fees_tax,
//           subvention,
//           disbursal_amount,
//           loan_tenure_months,
//           emi_amount,
//           interest_rate_percent,
//           status,
//           product,
//           lender,
//           loan_admin_status,
//           first_emi_date,
//           last_emi_date,
//           disbursement_date,
//           disbursement_utr,
//           applicant_address,
//           applicant_state,
//           applicant_city,
//           applicant_pin_code,
//           coapplicant_address,
//           coapplicant_state,
//           coapplicant_pin_code,
//           bureau_score,
//           monthly_income,
//           account_no,
//           ifsc_code,
//           gps_device_cost,
//           gst_on_gps_device,
//           total_gps_device_cost,
//           new_interest,
//         ]);

//       success.push(R);
//     }

//     return res.json({
//       message: "✅ Embifi file Save Successfully",
//       total_rows: rows.length,
//       inserted_rows: success.length,
//       failed_rows: failed.length,
//       success_rows: success,
//       failed_details: failed,
//     });
//   } catch (err) {
//     console.error("❌ Embifi Upload Error:", err);
//     return res
//       .status(500)
//       .json({
//         message: "Upload failed.",
//         error: err.sqlMessage || err.message,
//       });
//   }
// });

router.post("/upload-embifi", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: "No file uploaded." });

  // collections
  const success_rows = [];
  const row_errors = []; // {row, stage, reason}

  try {
    const wb = xlsx.read(req.file.buffer, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = xlsx.utils
      .sheet_to_json(ws)
      .map((r, i) => ({ __row: i + 2, ...r }));

    if (!rows.length) {
      return res.status(400).json({ message: "Empty or invalid Excel." });
    }

    for (const row of rows) {
      const R = row.__row;

      // === map your exact headers (unchanged) ===
      const lan = (row["LAN"] || "").toString().trim();
      const applicant_name = row["Applicant Name"] || null;
      const applicant_dob = parseDate(row["Applicant DOB"]);
      const applicant_age_years = num(row["Applicant Age"]);
      const applicant_father_name = row["Applicant Father Name"] || null;
      const pan_number = (row["PAN Number"] || "").toString().trim() || null;
      const applicant_aadhaar_no =
        (row["Applicant Aadhaar Number"] || "").toString().trim() || null;
      const mobile_number =
        (row["Mobile Number"] || "").toString().trim() || null;

      const coapplicant_name = row["CO-Applicant Name"] || null;
      const coapplicant_pan_no =
        (row["CO-Applicant Pan No"] || "").toString().trim() || null;
      const coapplicant_aadhaar_no =
        (row["CO-Applicant Aadhar No"] || "").toString().trim() || null;
      const coapplicant_dob = parseDate(row["CO-Applicant DOB"]);
      const coapplicant_mobile_no =
        (row["CO-Applicant Mobile No"] || "").toString().trim() || null;

      const approved_loan_amount = num(row["Approved Loan Amount"]);
      const processing_fees_with_tax = num(row["Processing Fees With Tax"]);
      const processing_fees = num(row["Processing Fess"]); // sheet uses "Fess"
      const processing_fees_tax = num(row["Processing Fees Tax"]);
      const subvention = num(row["Subvention"]);
      const disbursal_amount = num(row["Disbursal Amount"]);

      const loan_tenure_months = num(row["Loan Tenure"]);
      const emi_amount = num(row["EMI Amount"]);
      const interest_rate_percent = num(row["Intrest Rate"]); // sheet uses "Intrest"

      const status = row["Loan Status"] || null;
      const product = row["Product"] || "Monthly Loan";
      const lender = row["Lender"] || "Embifi";
      const loan_admin_status = row["Loan Admin Status"] || null;

      const first_emi_date = parseDate(row["First EMI Date"]);
      const last_emi_date = parseDate(row["Last EMI Date"]);
      const disbursement_date = parseDate(row["Disbursement Date"]);
      const disbursement_utr = row["Disbursement UTR"] || null;

      const applicant_address = row["Applicant Address"] || null;
      const applicant_state = row["Applicant State"] || null;
      const applicant_city = row["Applicant City"] || null;
      const applicant_pin_code =
        (row["Applicant Pin Code"] || "").toString().trim() || null;

      const coapplicant_address = row["CO-Applicant Address"] || null;
      const coapplicant_state =
        row["CO-Applicant state"] || row["CO-Applicant State"] || null;
      const coapplicant_pin_code =
        (row["CO-Applicant Pin Code"] || "").toString().trim() || null;

      const bureau_score = num(row["Bureau Score"]);
      const monthly_income = num(row["Monthly Income"]);
      const account_no = (row["Account No."] || "").toString().trim() || null;
      const ifsc_code = (row["IFSC Code"] || "").toString().trim() || null;

      const gps_device_cost = num(row["GPS Device Cost"]);
      const gst_on_gps_device = num(row["GST on GPS device"]);
      const total_gps_device_cost = num(row["Total GPS Device Cost"]);
      const new_interest = num(row["New Interest"]);

      // 1) basic validation
      if (
        !lan ||
        !applicant_name ||
        !approved_loan_amount ||
        !loan_tenure_months ||
        !interest_rate_percent
      ) {
        row_errors.push({
          row: R,
          stage: "validation",
          reason: "Missing LAN/name/amount/tenure/rate",
        });
        continue;
      }

      // 2) duplicate PAN/Aadhaar check
      try {
        const [dups] = await db
          .promise()
          .query(`SELECT id FROM loan_booking_embifi WHERE pan_number = ?`, [
            pan_number,
          ]);
        if (dups.length) {
          row_errors.push({
            row: R,
            stage: "dup-check",
            reason: "Duplicate PAN",
          });
          continue;
        }
      } catch (err) {
        row_errors.push({
          row: R,
          stage: "dup-check",
          reason: toClientError(err).message,
        });
        continue;
      }

      // 3) insert row
      try {
        const sql = `
          INSERT INTO loan_booking_embifi (
            lan,
            customer_name, applicant_dob, applicant_age_years, applicant_father_name,
            pan_number, applicant_aadhaar_no, mobile_number,
            coapplicant_name, coapplicant_pan_no, coapplicant_aadhaar_no, coapplicant_dob, coapplicant_mobile_no,
            approved_loan_amount, processing_fees_with_tax, processing_fee, processing_fees_tax, subvention, disbursal_amount,
            loan_tenure_months, emi_amount, interest_rate,
            status, product, lender, loan_admin_status,
            first_emi_date, last_emi_date, disbursement_date, disbursement_utr,
            applicant_address, applicant_state, applicant_pin_code,
            coapplicant_address, coapplicant_state, coapplicant_pin_code,
            bureau_score, monthly_income, account_no, ifsc_code,
            gps_device_cost, gst_on_gps_device, total_gps_device_cost, new_interest
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        `;

        await db
          .promise()
          .query(sql, [
            lan,
            applicant_name,
            applicant_dob,
            applicant_age_years,
            applicant_father_name,
            pan_number,
            applicant_aadhaar_no,
            mobile_number,
            coapplicant_name,
            coapplicant_pan_no,
            coapplicant_aadhaar_no,
            coapplicant_dob,
            coapplicant_mobile_no,
            approved_loan_amount,
            processing_fees_with_tax,
            processing_fees,
            processing_fees_tax,
            subvention,
            disbursal_amount,
            loan_tenure_months,
            emi_amount,
            interest_rate_percent,
            status,
            product,
            lender,
            loan_admin_status,
            first_emi_date,
            last_emi_date,
            disbursement_date,
            disbursement_utr,
            applicant_address,
            applicant_state,
            applicant_pin_code,
            coapplicant_address,
            coapplicant_state,
            coapplicant_pin_code,
            bureau_score,
            monthly_income,
            account_no,
            ifsc_code,
            gps_device_cost,
            gst_on_gps_device,
            total_gps_device_cost,
            new_interest,
          ]);

        success_rows.push(R);
      } catch (err) {
        row_errors.push({
          row: R,
          stage: "insert",
          reason: toClientError(err).message,
        });
        continue;
      }
    }

    return res.json({
      message: "Embifi file processed.",
      total_rows: rows.length,
      inserted_rows: success_rows.length,
      failed_rows: row_errors.length,
      success_rows: success_rows,
      row_errors: row_errors, // 👈 frontend can render stage + reason per row
    });
  } catch (err) {
    console.error("❌ Embifi Upload Error:", err);
    return res.status(500).json({
      message: "Upload failed.",
      error: toClientError(err),
      inserted_rows: success_rows.length,
      failed_rows: row_errors.length,
      row_errors: row_errors,
    });
  }
});

////////////////// BL Loan........./////////////////////////////////
router.post("/bl-upload", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: "No file uploaded" });

  if (!req.body.lenderType)
    return res.status(400).json({ message: "Lender type is required." });

  try {
    const lenderType = req.body.lenderType.trim();

    if (lenderType !== "BL Loan") {
      return res.status(400).json({
        message: "Invalid lender type. Only BL Loan supported.",
      });
    }

    const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheetData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

    if (!sheetData.length) {
      return res.status(400).json({
        message: "Uploaded Excel file is empty or invalid.",
      });
    }

    const success_rows = [];
    const row_errors = [];

    for (let i = 0; i < sheetData.length; i++) {
      const row = sheetData[i];
      const R = i + 2;
      let conn;

      try {
        const pan = row["Pan Card"];

        if (!pan) {
          row_errors.push({
            row: R,
            reason: "Missing PAN",
          });
          continue;
        }

        const [dup] = await db
          .promise()
          .query(`SELECT lan FROM loan_bookings WHERE pan_card = ?`, [pan]);

        if (dup.length) {
          row_errors.push({
            row: R,
            reason: `Duplicate PAN: ${pan}`,
          });
          continue;
        }

        const loanAmount = Number(row["Loan Amount"]) || 0;

        if (loanAmount <= 0) {
          row_errors.push({
            row: R,
            reason: "Invalid loan amount",
          });
          continue;
        }

        conn = await db.promise().getConnection();
        await conn.beginTransaction();

        const partnerName = "BL Loan";

        const loginDate = excelDateToJSDate(row["LOGIN DATE"]);
        const today = new Date();
        const { month, year } = getMonthYear(today);

        const partner = await partnerLimitService.getOrCreatePartner(
          conn,
          partnerName,
        );

        const limitCheck =
          await partnerLimitService.validatePartnerBookingLimit(
            conn,
            partner.partner_id,
            loanAmount,
            month,
            year,
          );

        if (!limitCheck.valid) {
          await conn.rollback();
          conn.release();

          row_errors.push({
            row: R,
            reason: `Limit exceeded. Remaining ${limitCheck.remaining}, Required ${loanAmount}`,
          });

          continue;
        }

        // Fetch partner FLDG percent
        const [[partnerConfig]] = await conn.query(
          `SELECT fldg_percent, fldg_status FROM partner_master WHERE partner_id = ?`,
          [partner.partner_id],
        );

        if (!partnerConfig) {
          throw new Error("Partner configuration not found");
        }

        let requiredFldg = 0;

        if (partnerConfig?.fldg_status === 1) {
          const fldgPercent = Number(partnerConfig?.fldg_percent || 0);

          requiredFldg = Number(((loanAmount * fldgPercent) / 100).toFixed(2));
        }

        // Validate FLDG availability
        if (requiredFldg > 0) {
          const fldgCheck = await partnerFldgService.validateFldgAvailability(
            conn,
            partner.partner_id,
            requiredFldg,
          );

          if (!fldgCheck.valid) {
            await conn.rollback();
            conn.release();

            row_errors.push({
              row: R,
              stage: "fldg-check",
              reason: `Insufficient FLDG. Available: ${fldgCheck.available}, Required: ${requiredFldg}`,
            });

            continue;
          }
        }

        const { partnerLoanId, lan } =
          await generateLoanIdentifiers(lenderType);

        const query = `
          INSERT INTO loan_bookings (
            partner_loan_id, lan, login_date, customer_name, borrower_dob,
            father_name, address_line_1, address_line_2, village, district,
            state, pincode, mobile_number, email, occupation,
            relationship_with_borrower, cibil_score,
            guarantor_co_cibil_score, loan_amount, loan_tenure,
            interest_rate, emi_amount, guarantor_aadhar,
            guarantor_pan, dealer_name, name_in_bank,
            bank_name, account_number, ifsc,
            aadhar_number, pan_card, product, lender,
            agreement_date, status,
            loan_account_no, speridian_loan_account_no
          )
          VALUES (${new Array(37).fill("?").join(",")})
        `;

        await conn.query(query, [
          partnerLoanId,
          lan,
          loginDate,
          row["Customer Name"],
          excelDateToJSDate(row["BORROWER DOB"]),
          row["Father Name"],
          row["Address Line 1"],
          row["Address Line 2"],
          row["Village"],
          row["District"],
          row["State"],
          row["Pincode"],
          row["Mobile Number"],
          row["Email"],
          row["Occupation"],
          row["Relationship with Borrower"],
          row["CIBIL Score"],
          row["GURANTOR/Co-Applicant CIBIL Score"],
          loanAmount,
          row["Tenure"],
          row["Interest Rate"],
          row["EMI Amount"],
          row["GURANTOR/Co-Applicant ADHAR"],
          row["GURANTOR/Co-Applicant PAN"],
          row["DEALER NAME"],
          row["Name in Bank"],
          row["Bank name"],
          row["Account Number"],
          row["IFSC"],
          row["Aadhar Number"],
          pan,
          row["Product"],
          lenderType,
          excelDateToJSDate(row["Agreement Date"]),
          "Approved",
          row["Loan Account No"],
          row["Speridian loan account no"],
        ]);

        await partnerLimitService.updateBookedLimit(
          conn,
          limitCheck.limitId,
          loanAmount,
          lan,
        );

        if (requiredFldg > 0) {
          await partnerFldgService.reserveFldg(
            conn,
            partner.partner_id,
            lan,
            requiredFldg,
            `BL Loan reservation | Amount: ${loanAmount}`,
          );
        }

        await conn.commit();
        conn.release();

        success_rows.push({ row: R, lan, partnerLoanId });
      } catch (err) {
        if (conn) {
          await conn.rollback();
          conn.release();
        }

        row_errors.push({
          row: R,
          reason: err.sqlMessage || err.message,
        });

        console.error(`Row ${R} failed:`, err);
      }
    }

    return res.json({
      message: "BL upload processed.",
      total_rows: sheetData.length,
      inserted_rows: success_rows.length,
      failed_rows: row_errors.length,
      success_rows,
      row_errors,
    });
  } catch (error) {
    console.error("BL upload error:", error);

    return res.status(500).json({
      message: "Error processing file",
      error: error.sqlMessage || error.message,
    });
  }
});

router.post("/gq-fsf-upload", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: "No file uploaded." });
  if (!req.body.lenderType)
    return res.status(400).json({ message: "Lender type is required." });

  const lenderType = req.body.lenderType;

  // collections we’ll return to the frontend
  const success_rows = []; // e.g., [2, 3, 7]
  const row_errors = []; // e.g., [{row, stage, reason}]
  const skippedDueToCIBIL = []; // you already had this

  try {
    const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const rawSheet = workbook.Sheets[sheetName];
    const rawData = xlsx.utils.sheet_to_json(rawSheet, {
      defval: "",
      header: 1,
    });

    // Normalize headers
    const rawHeaders = rawData[0];
    const normalizedHeaders = {};
    rawHeaders.forEach((header, i) => {
      const norm = header
        ?.toString()
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim()
        .replace(/[^a-z0-9]/g, "");
      if (norm) normalizedHeaders[i] = header;
    });

    // Build row objects using original header names
    const sheetData = rawData.slice(1).map((row, rIndex) => {
      const formatted = { __row: rIndex + 2 }; // Excel row number (assuming header row = 1)
      Object.entries(normalizedHeaders).forEach(([idx, original]) => {
        formatted[original] = row[idx] ?? "";
      });
      return formatted;
    });

    if (sheetData.length === 0) {
      return res
        .status(400)
        .json({ message: "Uploaded Excel file is empty or invalid." });
    }

    // util to number-parse your currency/ints
    const parse = (v) =>
      typeof v === "number"
        ? v
        : parseFloat((v ?? "").toString().replace(/[^0-9.]/g, "")) || 0;

    for (const row of sheetData) {
      const R = row.__row;
      let conn;

      try {
        const panCard = row["PAN Number"];
        const aadharNumber = row["Aadhaar Number"];
        const appId = row["APPLICATION ID"];
        const rawCibil = row["Credit Score"] || row["CIBIL Score"];
        const cibilScore = parseInt(rawCibil);

        // CIBIL validation (your existing rules)
        if (isNaN(cibilScore)) {
          skippedDueToCIBIL.push({
            ...row,
            reason: "Missing or invalid CIBIL Score",
          });
          continue;
        }

        if (!(cibilScore >= 500 || cibilScore === -1)) {
          skippedDueToCIBIL.push({ ...row, reason: "Low CIBIL Score" });
          continue;
        }

        // OPTIONAL: duplicate check (PAN/Aadhaar). Uncomment if you want this.

        try {
          const [existing] = await db
            .promise()
            .query(`SELECT * FROM loan_booking_gq_fsf WHERE app_id = ?`, [
              appId,
            ]);
          if (existing.length > 0) {
            row_errors.push({
              row: R,
              stage: "dup-check",
              reason: `Duplicate AppId (${appId || ""})`,
            });
            continue;
          }
        } catch (dupErr) {
          row_errors.push({
            row: R,
            stage: "dup-check",
            reason: toClientError(dupErr).message,
          });
          continue;
        }

        // Generate IDs
        conn = await db.promise().getConnection();
        await conn.beginTransaction();

        const partnerName = "GQ FSF";

        const loginDate = row["Agreement Date (DD-MMM-YYYY)"]
          ? excelDateToJSDate(row["Agreement Date (DD-MMM-YYYY)"])
          : excelDateToJSDate(row["Loan Application Date"]);

        const today = new Date();

        const { month, year } = getMonthYear(today);

        const loanAmount = parse(row["Loan Amount Sanctioned"]);

        const partner = await partnerLimitService.getOrCreatePartner(
          conn,
          partnerName,
        );

        const limitCheck =
          await partnerLimitService.validatePartnerBookingLimit(
            conn,
            partner.partner_id,
            loanAmount,
            month,
            year,
          );

        if (!limitCheck.valid) {
          await conn.rollback();
          conn.release();

          row_errors.push({
            row: R,
            stage: "limit-check",
            reason: `Limit exceeded. Remaining ${limitCheck.remaining}, Required ${loanAmount}`,
          });

          continue;
        }

        // Fetch partner FLDG percent
        const [[partnerConfig]] = await conn.query(
          `SELECT fldg_percent, fldg_status FROM partner_master WHERE partner_id = ?`,
          [partner.partner_id],
        );

        if (!partnerConfig) {
          throw new Error("Partner configuration not found");
        }

        let requiredFldg = 0;

        if (partnerConfig?.fldg_status === 1) {
          const fldgPercent = Number(partnerConfig?.fldg_percent || 0);

          requiredFldg = Number(((loanAmount * fldgPercent) / 100).toFixed(2));
        }

        // Validate FLDG availability
        if (requiredFldg > 0) {
          const fldgCheck = await partnerFldgService.validateFldgAvailability(
            conn,
            partner.partner_id,
            requiredFldg,
          );

          if (!fldgCheck.valid) {
            await conn.rollback();
            conn.release();

            row_errors.push({
              row: R,
              stage: "fldg-check",
              reason: `Insufficient FLDG. Available: ${fldgCheck.available}, Required: ${requiredFldg}`,
            });

            continue;
          }
        }

        const { partnerLoanId, lan } =
          await generateLoanIdentifiers(lenderType);

        // Insert
        try {
          await conn.query(
            `INSERT INTO loan_booking_gq_fsf (
                partner_loan_id, lan, app_id, product, customer_type, residence_type, loan_type, disbursal_type,
                institute_account_number, beneficiary_name, ifsc_code, bank_name, aadhaar_number,
                agreement_signature_type, loan_application_date, emi_day, company_name, fathers_name,
                ckyc_no, customer_name, student_name, date_of_birth, gender, current_address_line1,
                current_address_line2, current_address_line3, current_address_landmark, current_address_pincode,
                current_address_city, current_address_state, proof_of_current_address, permanent_address_line1,
                permanent_address_line2, permanent_address_line3, permanent_address_landmark, permanent_address_pincode,
                permanent_address_city, permanent_address_state, office_address_line1, office_address_line2,
                office_address_line3, office_address_landmark, office_address_pincode, office_address_city,
                office_address_state, pan_number, employment_status, annual_income, credit_score, mobile_number,
                email_id, institute, loan_amount_sanctioned, loan_tenure_months, monthly_emi,
                interest_percent, monthly_interest_amount, no_of_advance_emis, processing_fee, processing_fee_tax,
                advance_emi_total, subvention_amount, disbursal_amount, retention_percentage, retention_amount, actual_disbursement, to_be_recovered,
                agreement_date, interest_rate_irr, flat_rate, nach_umrn, income_source,
                status, monthly_income, age, lender, loan_amount, interest_rate, loan_tenure
              ) VALUES (${new Array(79).fill("?").join(",")})`,
            [
              partnerLoanId,
              lan,
              row["APPLICATION ID"],
              row["Product"],
              row["Customer Type"],
              row["Residence Type"],
              row["Loan Type"],
              row["Disbursal Type"],
              row["Institute Account Number"],
              row["Beneficiary Name"],
              row["IFSC Code"],
              row["Bank Name"],
              aadharNumber,
              row["Agreement Signature Type"],
              row["Loan Application Date"]
                ? excelDateToJSDate(row["Loan Application Date"])
                : null,
              parse(row["Emi Day"]),
              row["Company Name"],
              row["Fathers Name"],
              row["CKYC No"],
              row["Customer Name"],
              row["Student Name"],
              row["Date Of Birth"]
                ? excelDateToJSDate(row["Date Of Birth"])
                : null,
              row["Gender"],
              row["Current Address Line 1"],
              row["Current Address Line 2"],
              row["Current Address Line 3"],
              row["Current Address Landmark"],
              row["Current Address Pincode"],
              row["Current Address City"],
              row["Current Address State"],
              row["Proof of Current Address"],
              row["Permanent Address Line 1"],
              row["Permanent Address Line 2"],
              row["Permanent Address Line 3"],
              row["Permanent Address Landmark"],
              row["Permanent Address Pincode"],
              row["Permanent Address City"],
              row["Permanent Address State"],
              row["Office Address Line 1"],
              row["Office Address Line 2"],
              row["Office Address Line 3"],
              row["Office Address Landmark"],
              row["Office Address Pincode"],
              row["Office Address City"],
              row["Office Address State"],
              panCard,
              row["Employment Status"],
              parse(row["Annual Income"]),
              cibilScore,
              row["Mobile Number"],
              row["Email ID"],
              row["Institute"],
              parse(row["Loan Amount Sanctioned"]),
              parse(row["Loan Tenure (Months)"]),
              parse(row["Monthly EMI"]),
              parse(row["Interest %"]),
              parse(row["Monthly Interest Amount"]),
              parse(row["No. Of Advance EMIs"]),
              parse(row["Processing Fee"]),
              parse(row["Processing Fee Tax"]),
              parse(row["Advance EMI (Total)"]),
              parse(row["Subvention Amount"]),
              parse(row["Disbursal Amount"]),
              parse(row["Retention Percentage"]),
              parse(row["Retention Amount"]),
              parse(row["Actual Disbursement"]),
              parse(row["To be Recovered"]),
              row["Agreement Date (DD-MMM-YYYY)"]
                ? excelDateToJSDate(row["Agreement Date (DD-MMM-YYYY)"])
                : null,
              parse(row["Interest Rate (IRR %)"]),
              parse(row["Flat Rate (%)"]),
              row["Nach UMRN"],
              row["Income Source"],
              "Login",
              parse(row["Monthly Income"]),
              parse(row["Age"]),
              lenderType,
              parse(row["Loan Amount Sanctioned"]),
              parse(row["Interest %"]),
              parse(row["Loan Tenure (Months)"]),
            ],
          );

          await partnerLimitService.updateBookedLimit(
            conn,
            limitCheck.limitId,
            loanAmount,
            lan,
          );

          if (requiredFldg > 0) {
            await partnerFldgService.reserveFldg(
              conn,
              partner.partner_id,
              lan,
              requiredFldg,
              `GQ FSF Loan reservation | Amount: ${loanAmount}`,
            );
          }

          await conn.commit();
          conn.release();

          success_rows.push(R);
        } catch (insErr) {
          if (conn) {
            await conn.rollback();
            conn.release();
          }
          row_errors.push({
            row: R,
            stage: "insert",
            reason: toClientError(insErr).message,
          });
          continue;
        }
      } catch (loopErr) {
        // This catches any unexpected error per row so one bad row doesn’t kill the rest
        row_errors.push({
          row: R,
          stage: "unknown",
          reason: toClientError(loopErr).message,
        });
        continue;
      }
    }

    // Final response (200 OK even if some rows failed — the UI will show details)
    return res.status(200).json({
      message: "File processed.",
      total_rows: sheetData.length,
      inserted_rows: success_rows.length,
      failed_rows: row_errors.length,
      success_rows,
      row_errors,
      skippedDueToCIBIL,
      totalSkipped: skippedDueToCIBIL.length,
    });
  } catch (error) {
    console.error("❌ Upload Error:", error);
    // Top-level failure (bad file, parsing, etc.). We still return what we collected so far.
    return res.status(500).json({
      message: "Upload failed",
      error: toClientError(error),
      inserted_rows: success_rows.length,
      failed_rows: row_errors.length,
      success_rows,
      row_errors,
      skippedDueToCIBIL,
      totalSkipped: skippedDueToCIBIL.length,
    });
  }
});

router.post(
  "/upload-invoice-disbursements",
  upload.single("file"),
  async (req, res) => {
    if (!req.file)
      return res.status(400).json({
        message: "No file uploaded",
      });

    const success_rows = [];
    const row_errors = [];

    try {
      const workbook = xlsx.read(req.file.buffer, {
        type: "buffer",
      });

      const sheetName = workbook.SheetNames[0];
      const rawSheet = workbook.Sheets[sheetName];

      const rawData = xlsx.utils.sheet_to_json(rawSheet, {
        defval: "",
        header: 1,
      });

      const headers = rawData[0];

      const sheetData = rawData.slice(1).map((row, index) => {
        const formatted = { __row: index + 2 };

        headers.forEach((h, i) => {
          formatted[h] = row[i];
        });

        return formatted;
      });

      if (!sheetData.length) {
        return res.status(400).json({
          message: "Excel file empty",
        });
      }

      const parseNumber = (v) =>
        typeof v === "number"
          ? v
          : parseFloat((v || "").toString().replace(/[^0-9.]/g, "")) || 0;

      for (const row of sheetData) {
        const R = row.__row;
        let conn;

        try {
          const {
            partner_loan_id,
            lan,
            invoice_number,
            supplier_name,
            disbursement_utr,
          } = row;

          if (!partner_loan_id || !invoice_number) {
            row_errors.push({
              row: R,
              stage: "validation",
              reason: "partner_loan_id or invoice_number missing",
            });
            continue;
          }

          conn = await db.promise().getConnection();
          await conn.beginTransaction();

          // Duplicate check (already exists)
          const [existing] = await conn.query(
            `
            SELECT id
            FROM invoice_disbursements
            WHERE partner_loan_id = ?
            AND invoice_number = ?
          `,
            [partner_loan_id, invoice_number],
          );

          if (existing.length > 0) {
            await conn.rollback();
            conn.release();

            row_errors.push({
              row: R,
              stage: "duplicate",
              reason: "Invoice already exists for this partner_loan_id",
            });

            continue;
          }

          const [utrExists] = await conn.query(
            `SELECT id FROM invoice_disbursements WHERE disbursement_utr = ?`,
            [disbursement_utr],
          );

          if (utrExists.length) {
            await conn.rollback();
            conn.release();

            row_errors.push({
              row: R,
              stage: "duplicate-utr",
              reason: "Duplicate disbursement UTR",
            });

            continue;
          }

          // Insert row
          await conn.query(
            `
            INSERT INTO invoice_disbursements (
              partner_loan_id,
              lan,
              invoice_number,
              invoice_date,
              invoice_amount,
              remaining_invoice_amount,
              tenure_days,
              supplier_name,
              bank_account_number,
              ifsc_code,
              bank_name,
              account_holder_name,
              disbursement_amount,
              remaining_disbursement_amount,
              disbursement_date,
              invoice_due_date,
              disbursement_utr,
              roi_percentage,
              penal_rate,
              total_roi_amount,
              emi_amount,
              status,
              roi_penal_rate
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
            [
              partner_loan_id,
              lan,
              invoice_number,
              excelDateToJSDate(row.invoice_date) || null,
              parseNumber(row.invoice_amount),
              parseNumber(row.remaining_invoice_amount),
              parseNumber(row.tenure_days || 90),
              supplier_name,
              row.bank_account_number,
              row.ifsc_code,
              row.bank_name,
              row.account_holder_name,
              parseNumber(row.disbursement_amount),
              parseNumber(row.disbursement_amount),
              excelDateToJSDate(row.disbursement_date) || null,
              excelDateToJSDate(row.invoice_due_date) || null,
              disbursement_utr,
              parseNumber(row.roi_percentage),
              parseNumber(row.penal_rate),
              parseNumber(row.total_roi_amount),
              parseNumber(row.emi_amount),
              "Active",
              parseNumber(row.roi_penal_rate),
            ],
          );

          await conn.commit();
          conn.release();
          conn = null;

          // ✅ Generate due demand after successful Excel invoice upload
          setImmediate(async () => {
            try {
              await generateDemandFromInvoiceDisbursement(invoice_number, lan);

              console.log(
                `Demand generated successfully for invoice ${invoice_number}, LAN ${lan}`,
              );
            } catch (e) {
              console.error(
                `Demand generation failed for invoice ${invoice_number}, LAN ${lan}:`,
                e,
              );
            }
          });

          success_rows.push({
            row: R,
            invoice_number,
            lan,
            demand_generation: "queued",
          });
        } catch (err) {
          if (conn) {
            await conn.rollback();
            conn.release();
          }

          row_errors.push({
            row: R,
            stage: "insert",
            reason: err.message,
          });
        }
      }

      return res.status(200).json({
        message: "Invoice upload completed",
        total_rows: sheetData.length,
        inserted_rows: success_rows.length,
        failed_rows: row_errors.length,
        success_rows,
        row_errors,
      });
    } catch (error) {
      console.error("Upload failed:", error);

      return res.status(500).json({
        message: "Upload failed",
        error: error.message,
      });
    }
  },
);

router.get("/gq-fsf-disbursed", (req, res) => {
  const query =
    "SELECT * FROM loan_booking_gq_fsf WHERE status = 'Disbursed' and LAN Like 'GQF%'";

  db.query(query, (err, results) => {
    if (err) {
      console.error("Error fetching disbursed loans:", err);
      return res.status(500).json({ message: "Database error" });
    }

    if (results.length === 0) {
      return res.status(404).json({ message: "No disbursed loans found" });
    }

    res.json(results);
  });
});

// ✅ JSON Upload Route
router.post("/v1/adikosh-lb", verifyApiKey, async (req, res) => {
  let conn;
  try {
    if (
      !req.partner ||
      (req.partner.name || "").toLowerCase().trim() !== "adikosh"
    ) {
      return res
        .status(403)
        .json({ message: "This route is only for Adikosh partner." });
    }
    const data = req.body; // Direct JSON
    console.log("Incoming lenderType:", req.body.lenderType);
    console.log("Received JSON:", data);

    if (!data.lenderType) {
      return res.status(400).json({ message: "Lender type is required." });
    }

    const lenderType = data.lenderType.trim();

    // ✅ Restrict lender
    if (lenderType.toLowerCase() !== "adikosh") {
      return res.status(400).json({
        message: `Invalid lenderType: ${lenderType}. Only 'Adikosh' loans can be inserted.`,
      });
    }

    // ✅ Required fields (all except middleName)
    const requiredFields = [
      "loginDate",
      "batchId",
      "firstName",
      "gender",
      "dob",
      "fatherName",
      "mobileNumber",
      "emailId",
      "panNumber",
      "aadharNumber",
      "currentAddress",
      "currentVillageCity",
      "currentDistrict",
      "currentState",
      "currentPincode",
      "permanentAddress",
      "permanentState",
      "permanentPincode",
      "loanAmount",
      "interestRate",
      "tenure",
      "emiAmount",
      "salaryDay",
      "cibilScore",
      "product",
      "lenderType",
      "bankName",
      "nameInBank",
      "accountNumber",
      "ifsc",
      "sanctionDate",
      "preEmi",
      "processingFee",
      "netDisbursement",
    ];

    for (const field of requiredFields) {
      if (!data[field] && data[field] !== 0) {
        console.error(`❌ Missing field: ${field}`);
        return res.status(400).json({ message: `${field} is required.` });
      }
    }

    // ��� Check duplicates
    const [existingRecords] = await db
      .promise()
      .query(
        `SELECT lan FROM loan_booking_adikosh WHERE pan_number = ? OR aadhar_number = ?`,
        [data.panCard, data.aadharNumber],
      );

    if (existingRecords.length > 0) {
      return res.json({
        message: `Customer already exists for Pan: ${data.panNumber} or Aadhar: ${data.aadharNumber}`,
      });
    }

    // ��� Generate Loan IDs
    conn = await db.promise().getConnection();
    await conn.beginTransaction();

    const partnerName = "Adikosh";

    const agreement_date = excelDateToJSDate(data.sanctionDate);
    const loanAmount = Number(data.loan_amount);

    const today = new Date();
    const { month, year } = getMonthYear(today);

    const partner = await partnerLimitService.getOrCreatePartner(
      conn,
      partnerName,
    );

    const limitCheck = await partnerLimitService.validatePartnerBookingLimit(
      conn,
      partner.partner_id,
      loanAmount,
      month,
      year,
    );

    if (!limitCheck.valid) {
      await conn.rollback();
      conn.release();

      return res.status(403).json({
        message: "Monthly limit exceeded",
        remaining_limit: limitCheck.remaining,
        required: loanAmount,
      });
    }

    // Fetch partner FLDG percent
    const [[partnerConfig]] = await conn.query(
      `SELECT fldg_percent, fldg_status FROM partner_master WHERE partner_id = ?`,
      [partner.partner_id],
    );

    if (!partnerConfig) {
      throw new Error("Partner configuration not found");
    }

    let requiredFldg = 0;

    if (partnerConfig?.fldg_status === 1) {
      const fldgPercent = Number(partnerConfig?.fldg_percent || 0);

      requiredFldg = Number(((loanAmount * fldgPercent) / 100).toFixed(2));
    }

    // Validate FLDG availability
    if (requiredFldg > 0) {
      const fldgCheck = await partnerFldgService.validateFldgAvailability(
        conn,
        partner.partner_id,
        requiredFldg,
      );

      if (!fldgCheck.valid) {
        await conn.rollback();
        conn.release();

        return res.status(403).json({
          message: `Insufficient FLDG. Available: ${fldgCheck.available}, Required: ${requiredFldg}`,
        });
      }
    }

    const { partnerLoanId, lan } = await generateLoanIdentifiers(lenderType);

    const customerName = `${data.firstName || ""} ${
      data.lastName || ""
    }`.trim();
    // const agreement_date = excelDateToJSDate(data.sanctionDate);
    // ��� Insert into DB
    await conn.query(
      `INSERT INTO loan_booking_adikosh (
    lan, partner_loan_id, login_date, batch_id,
    first_name, middle_name, last_name, gender, dob,
    father_name, mother_name, mobile_number, email_id,
    pan_number, aadhar_number,
    current_address, current_village_city, current_district, current_state, current_pincode,
    permanent_address, permanent_village_city, permanent_district, permanent_state, permanent_pincode,
    loan_amount, interest_rate, loan_tenure, emi_amount, salary_day,
    cibil_score, product, lender,
    bank_name, name_in_bank, account_number, ifsc,
    sanction_date, pre_emi, processing_fee, net_disbursement, status, customer_name,agreement_date
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        lan, // 1
        partnerLoanId, // 2
        data.loginDate, // 3  'YYYY-MM-DD' or null
        data.batchId, // 4  REQUIRED (NOT NULL)
        data.firstName, // 5
        data.middleName, // 6
        data.lastName, // 7
        data.gender, // 8  'Male'|'Female'
        data.dob, // 9  'YYYY-MM-DD'
        data.fatherName, // 10
        data.motherName, // 11
        data.mobileNumber, // 12
        data.emailId, // 13
        data.panNumber, // 14
        data.aadharNumber, // 15
        data.currentAddress, // 16
        data.currentVillageCity, // 17
        data.currentDistrict, // 18
        data.currentState, // 19
        data.currentPincode, // 20
        data.permanentAddress, // 21
        data.permanentVillageCity, // 22
        data.permanentDistrict, // 23
        data.permanentState, // 24
        data.permanentPincode, // 25
        data.loanAmount, // 26
        data.interestRate, // 27
        data.tenure, // 28
        data.emiAmount, // 29
        data.salaryDay, // 30
        data.cibilScore, // 31
        data.product, // 32
        data.lenderType, // 33
        data.bankName, // 34
        data.nameInBank, // 35
        data.accountNumber, // 36
        data.ifsc, // 37
        data.sanctionDate, // 38
        data.preEmi, // 39
        data.processingFee, // 40
        data.netDisbursement, // 41
        data.status || "Login",
        customerName, // 42  <-- previously missing
        data.sanctionDate, // 43  <-- previously missing
      ],
    );

    await partnerLimitService.updateBookedLimit(
      conn,
      limitCheck.limitId,
      loanAmount,
      lan,
    );

    if (requiredFldg > 0) {
      await partnerFldgService.reserveFldg(
        conn,
        partner.partner_id,
        lan,
        requiredFldg,
        `Adikosh Loan reservation | Amount: ${loanAmount}`,
      );
    }

    await conn.commit();
    conn.release();

    res.json({
      message: "Adikosh loan saved successfully.",
      partnerLoanId,
      lan,
    });
  } catch (error) {
    if (conn) {
      await conn.rollback();
      conn.release();
    }
    console.error("❌ Error in JSON Upload:", error);
    res.status(500).json({
      message: "Upload failed. Please try again.",
      error: error.sqlMessage || error.message,
    });
  }
});

///// FINCREST //////

router.post("/v1/finso-lb", verifyApiKey, async (req, res) => {
  // Column list kept in ONE place to avoid mismatches
  const COLS = [
    "lan",
    "partner_loan_id",
    "login_date",
    "first_name",
    "middle_name",
    "last_name",
    "gender",
    "borrower_dob",
    "father_name",
    "mother_name",
    "mobile_number",
    "email",
    "pan_card",
    "aadhar_number",
    "address_line_1",
    "address_line_2",
    "village",
    "district",
    "state",
    "pincode",
    "business_village",
    "business_district",
    "business_state",
    "business_pincode",
    "loan_amount",
    "net_disbursement",
    "interest_rate",
    "loan_tenure",
    "cibil_score",
    "product",
    "FINCREST",
    "business_name",
    "company_type",
    "business_vintage",
    "industry",
    "annual_turnover",
    "abb_value",
    "net_profit",
    "loanemi_obligations",
    "bounce_count_6m",
    "employment_type",
    "pre_emi",
    "processing_fee",
    "disbursal_amount",
    "emi_amount",
    "apr",
    "agreement_date",
    "udyam_registration",
    "property_type",
    "aa_bank_name",
    "aa_branch_name",
    "aa_account_type",
    "aa_name_in_bank",
    "aa_account_number",
    "aa_ifsc",
    "bank_name",
    "name_in_bank",
    "account_number",
    "ifsc",
    "customer_name",
  ];
  const PLACEHOLDERS = `(${COLS.map(() => "?").join(",")})`;
  const INSERT_SQL = `INSERT INTO loan_booking_finso (${COLS.join(
    ", ",
  )}) VALUES ${PLACEHOLDERS}`;

  const success_rows = [];
  const row_errors = [];
  const skippedDueToCIBIL = [];

  try {
    if (
      !req.partner ||
      (req.partner.name || "").toLowerCase().trim() !== "fincrest"
    ) {
      return res
        .status(403)
        .json({ message: "This route is only for FINCREST partner." });
    }
    // ✅ Extract lender from header (case-insensitive)
    const lenderTypeRaw = req.headers["x-lender"] ?? req.headers["lender"];
    const lenderType = lenderTypeRaw?.toString().trim();

    if (!lenderType) {
      return res
        .status(400)
        .json({ message: "Lender header is required (x-lender: FINCREST)." });
    }
    if (lenderType.toLowerCase() !== "fincrest") {
      return res.status(400).json({
        message: `Invalid lender: ${lenderType}. Only 'FINCREST' loans can be inserted.`,
      });
    }

    // Normalize payload to an array
    let records = req.body;
    if (!Array.isArray(records)) records = [records];

    // Required fields for validation
    const requiredFields = [
      "login_date",
      "first_name",
      "last_name",
      "gender",
      "dob",
      "father_name",
      "mobile_number",
      "email",
      "pan_card",
      "aadhar_number",
      "address_line_1",
      "village",
      "district",
      "state",
      "pincode",
      "loan_amount",
      "interest_rate",
      "loan_tenure",
      "cibil_score",
      "product",
    ];

    const results = [];

    for (const raw of records) {
      let conn;

      try {
        // ✅ Normalize aliases just in case upstream uses different keys
        const data = {
          ...raw,
          account_number:
            raw.account_number ?? raw.account_no ?? raw.acc_no ?? null,
          dob: raw.dob ?? raw.borrower_dob ?? null,
          ifsc: raw.ifsc ?? raw.bank_ifsc ?? null,
          processing_fee: raw.processing_fee ?? 0.0,
        };

        // ✅ Required fields validation
        const missingField = requiredFields.find(
          (f) => data[f] === undefined || data[f] === null || data[f] === "",
        );
        if (missingField) {
          results.push({ error: `${missingField} is required.`, data });
          continue;
        }
        const customerName = `${data.first_name || ""} ${
          data.last_name || ""
        }`.trim();

        // ✅ Duplicate check on PAN or Aadhar
        const [existing] = await db
          .promise()
          .query(
            `SELECT lan FROM loan_booking_finso WHERE pan_card = ? LIMIT 1`,
            [data.pan_card],
          );
        if (existing.length > 0) {
          results.push({
            message: `Customer already exists for Pan: ${data.pan_card}`,
            data,
          });
          continue;
        }

        // --- Generate loan code ---

        conn = await db.promise().getConnection();
        await conn.beginTransaction();

        const partnerName = "Finso";
        const loanAmount = Number(data.loan_amount);

        const processingFeeCalc = loanAmount * 0.05;
        const gstCalc = processingFeeCalc * 0.18;
        const totalDeduction = processingFeeCalc + gstCalc;
        const netDisbursement = loanAmount - totalDeduction;

        const today = new Date();
        const { month, year } = getMonthYear(today);

        const partner = await partnerLimitService.getOrCreatePartner(
          conn,
          partnerName,
        );

        const limitCheck =
          await partnerLimitService.validatePartnerBookingLimit(
            conn,
            partner.partner_id,
            loanAmount,
            month,
            year,
          );

        if (!limitCheck.valid) {
          await conn.rollback();
          conn.release();

          results.push({
            error: "Monthly limit exceeded",
            remaining_limit: limitCheck.remaining,
            required: loanAmount,
          });

          continue;
        }

        // Fetch partner FLDG percent
        const [[partnerConfig]] = await conn.query(
          `SELECT fldg_percent, fldg_status FROM partner_master WHERE partner_id = ?`,
          [partner.partner_id],
        );

        if (!partnerConfig) {
          throw new Error("Partner configuration not found");
        }

        let requiredFldg = 0;

        if (partnerConfig?.fldg_status === 1) {
          const fldgPercent = Number(partnerConfig?.fldg_percent || 0);

          requiredFldg = Number(((loanAmount * fldgPercent) / 100).toFixed(2));
        }

        // Validate FLDG availability
        if (requiredFldg > 0) {
          const fldgCheck = await partnerFldgService.validateFldgAvailability(
            conn,
            partner.partner_id,
            requiredFldg,
          );

          if (!fldgCheck.valid) {
            await conn.rollback();
            conn.release();

            row_errors.push({
              row: data.partner_loan_id,
              stage: "fldg-check",
              reason: `Insufficient FLDG. Available: ${fldgCheck.available}, Required: ${requiredFldg}`,
            });
            continue;
          }
        }

        const { lan } = await generateLoanIdentifiers(lenderType);

        const agreementDate = data.login_date;
        // ✅ Build values in the exact same order as COLS
        const values = [
          // lan / ids / dates
          lan,
          data.partner_loan_id,
          data.login_date,

          data.first_name,
          data.middle_name ?? null,
          data.last_name,
          data.gender,
          data.dob,
          data.father_name,
          data.mother_name ?? null,
          data.mobile_number,
          data.email,
          // KYC
          data.pan_card,
          data.aadhar_number,
          // addresses
          data.address_line_1,
          data.address_line_2 ?? null,
          data.village,
          data.district,
          data.state,
          data.pincode,
          // business address
          data.business_village ?? null,
          data.business_district ?? null,
          data.business_state ?? null,
          data.business_pincode ?? null,
          // loan
          data.loan_amount,
          netDisbursement,
          data.interest_rate,
          data.loan_tenure,
          data.cibil_score ?? null,
          data.product,
          lenderType,
          data.business_name ?? null,
          data.company_type ?? null,
          data.business_vintage ?? null,
          data.industry ?? null,
          data.annual_turnover ?? null,
          data.abb_value ?? null,
          data.net_profit ?? null,
          data.loanemi_obligations ?? null,
          data.total_bounces ?? null,
          data.employment_type ?? null,
          data.pre_emi ?? null,
          totalDeduction,
          data.disbursal_amount,
          data.emi_amount ?? null,
          data.apr ?? null,
          agreementDate,
          data.udyam_registration ?? null,
          data.property_type ?? null,
          // AA bank (aggregator) details
          data.aa_bank_name ?? null,
          data.aa_branch_name ?? null,
          data.aa_account_type ?? null,
          data.aa_name_in_bank ?? null,
          data.aa_account_number ?? null,
          data.aa_ifsc ?? null,
          // disbursal bank
          data.bank_name,
          data.name_in_bank,
          data.account_number,
          data.ifsc,
          customerName,
        ];

        // ✅ Defensive assertion (prevents the classic “count mismatch”)
        if (values.length !== COLS.length) {
          throw new Error(
            `INSERT loan_booking_finso: values=${values.length} != columns=${COLS.length}`,
          );
        }

        // ✅ Insert record
        await conn.query(INSERT_SQL, values);

        await partnerLimitService.updateBookedLimit(
          conn,
          limitCheck.limitId,
          loanAmount,
          lan,
        );

        if (requiredFldg > 0) {
          await partnerFldgService.reserveFldg(
            conn,
            partner.partner_id,
            lan,
            requiredFldg,
            `FINCREST Loan reservation | Amount: ${loanAmount}`,
          );
        }

        await conn.commit();
        conn.release();
        //////////////////////////////////////////
        //        🔍 BEURO SCORE START          //
        //////////////////////////////////////////

        console.log("📌 Starting Experian CIBIL for FINSO LAN:", lan);

        const dobFormatted = data.dob.replace(/-/g, "");
        console.log("dob", dobFormatted);

        const stateCodes = {
          "JAMMU and KASHMIR": "01",
          "HIMACHAL PRADESH": "02",
          PUNJAB: "03",
          CHANDIGARH: "04",
          UTTRANCHAL: "05",
          HARAYANA: "06",
          DELHI: "07",
          RAJASTHAN: "08",
          "UTTAR PRADESH": "09",
          BIHAR: "10",
          SIKKIM: "11",
          "ARUNACHAL PRADESH": "12",
          NAGALAND: "13",
          MANIPUR: "14",
          MIZORAM: "15",
          TRIPURA: "16",
          MEGHALAYA: "17",
          ASSAM: "18",
          "WEST BENGAL": "19",
          JHARKHAND: "20",
          ORRISA: "21",
          CHHATTISGARH: "22",
          "MADHYA PRADESH": "23",
          GUJRAT: "24",
          "DAMAN and DIU": "25",
          "DADARA and NAGAR HAVELI": "26",
          MAHARASHTRA: "27",
          "ANDHRA PRADESH": "28",
          KARNATAKA: "29",
          GOA: "30",
          LAKSHADWEEP: "31",
          KERALA: "32",
          "TAMIL NADU": "33",
          PONDICHERRY: "34",
          "ANDAMAN and NICOBAR ISLANDS": "35",
          TELANGANA: "36",
        };

        const stateCode = stateCodes[(data.state || "").toUpperCase()] ?? "27";

        const firstName = (data.first_name || "").toUpperCase();
        const lastName = (data.last_name || "").toUpperCase();
        const genderCode = data.gender === "Female" ? 2 : 1;

        const soapBody = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:urn="urn:cbv2">
   <soapenv:Header/>
   <soapenv:Body>
      <urn:process>
         <urn:in>
            <INProfileRequest>
    <Identification>
       <XMLUser>${process.env.EXPERIAN_USER}</XMLUser>
<XMLPassword>${process.env.EXPERIAN_PASSWORD}</XMLPassword>
    </Identification>
    <Application>
        <FTReferenceNumber></FTReferenceNumber>
        <CustomerReferenceID></CustomerReferenceID>
        <EnquiryReason>05</EnquiryReason> 
        <FinancePurpose>99</FinancePurpose>
        <AmountFinanced>${data.loan_amount}</AmountFinanced>
        <DurationOfAgreement>${data.loan_tenure}</DurationOfAgreement>
        <ScoreFlag>1</ScoreFlag>
        <PSVFlag></PSVFlag>
    </Application>
    <Applicant>
        <Surname>${lastName}</Surname>
        <FirstName>${firstName}</FirstName>
        <MiddleName1></MiddleName1>
        <MiddleName2></MiddleName2>
        <MiddleName3></MiddleName3>
        <GenderCode>${genderCode}</GenderCode>
        <IncomeTaxPAN>${data.pan_card}</IncomeTaxPAN>
        <PANIssueDate></PANIssueDate>
        <PANExpirationDate></PANExpirationDate>
        <PassportNumber></PassportNumber>
        <PassportIssueDate></PassportIssueDate>
        <PassportExpirationDate></PassportExpirationDate>
        <VoterIdentityCard></VoterIdentityCard>
        <VoterIDIssueDate></VoterIDIssueDate>
        <VoterIDExpirationDate></VoterIDExpirationDate>
        <DriverLicenseNumber></DriverLicenseNumber>
        <DriverLicenseIssueDate></DriverLicenseIssueDate>
        <DriverLicenseExpirationDate></DriverLicenseExpirationDate>
        <RationCardNumber></RationCardNumber>
        <RationCardIssueDate></RationCardIssueDate>
        <RationCardExpirationDate></RationCardExpirationDate>
        <UniversalIDNumber></UniversalIDNumber>
        <UniversalIDIssueDate></UniversalIDIssueDate>
        <UniversalIDExpirationDate></UniversalIDExpirationDate>
        <DateOfBirth>${dobFormatted}</DateOfBirth>
        <STDPhoneNumber></STDPhoneNumber>
        <PhoneNumber>${data.mobile_number}</PhoneNumber>
        <TelephoneExtension></TelephoneExtension>
        <TelephoneType></TelephoneType>
        <MobilePhone></MobilePhone>
        <EMailId></EMailId>
    </Applicant>
    <Details>
        <Income></Income>
        <MaritalStatus></MaritalStatus>
        <EmployStatus></EmployStatus>
        <TimeWithEmploy></TimeWithEmploy>
        <NumberOfMajorCreditCardHeld></NumberOfMajorCreditCardHeld>
    </Details>
    <Address>
        <FlatNoPlotNoHouseNo>${data.address_line_1}</FlatNoPlotNoHouseNo>
        <BldgNoSocietyName></BldgNoSocietyName>
        <RoadNoNameAreaLocality></RoadNoNameAreaLocality>
        <City>${data.village}</City>
        <Landmark></Landmark>
      <State>${stateCode}</State>
        <PinCode>${data.pincode}</PinCode>
    </Address>
    <AdditionalAddressFlag>
        <Flag>N</Flag>
    </AdditionalAddressFlag>
    <AdditionalAddress>
        <FlatNoPlotNoHouseNo></FlatNoPlotNoHouseNo>
        <BldgNoSocietyName></BldgNoSocietyName>
        <RoadNoNameAreaLocality></RoadNoNameAreaLocality>
        <City></City>
        <Landmark></Landmark>
        <State></State>
        <PinCode></PinCode>
    </AdditionalAddress>
</INProfileRequest>
</urn:in>
      </urn:process>
   </soapenv:Body>
</soapenv:Envelope>`;

        console.log("📨 Sending SOAP request (FINCREST)...");

        let score = null;
        let parsedXmlToStore = null;

        try {
          const response = await axios.post(
            process.env.EXPERIAN_URL,
            soapBody,
            {
              headers: {
                "Content-Type": "text/xml; charset=utf-8",
                SOAPAction: "urn:cbv2/process",
                Accept: "text/xml",
              },
              timeout: 30000,
              validateStatus: () => true,
            },
          );

          console.log("📥 Experian Status:", response.status);
          console.log("📥 Raw Response:", response.data?.substring(0, 1000));

          const parser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: "",
            trimValues: true,
            processEntities: {
              enabled: true,
              maxTotalExpansions: 500000,
              maxExpandedLength: 50_000_000,
              maxEntityCount: 500000,
              maxEntitySize: 500000,
            },
          });
          const soapParsed = parser.parse(response.data);

          const encodedInnerXml =
            soapParsed["SOAP-ENV:Envelope"]?.["SOAP-ENV:Body"]?.[
              "ns2:processResponse"
            ]?.["ns2:out"];

          if (encodedInnerXml) {
            const decodedInnerXml = he.decode(encodedInnerXml);
            parsedXmlToStore = decodedInnerXml;

            const innerParsed = parser.parse(decodedInnerXml);

            const scoreStr =
              innerParsed?.INProfileResponse?.SCORE?.BureauScore ?? null;

            score = scoreStr ? Number(scoreStr) : null;

            console.log("🎯 FINCREST CIBIL SCORE =", score);
          }

          await db.promise().query(
            `INSERT INTO loan_cibil_reports (lan, pan_number, score, report_xml, created_at)
             VALUES (?,?,?,?, NOW())`,
            [lan, data.pan_card, score, parsedXmlToStore],
          );

          await db
            .promise()
            .execute(
              `UPDATE loan_booking_finso SET cibil_score_fintree = ? WHERE lan = ?`,
              [score, lan],
            );

          // ── Upsert KYC row so BRE can gate on bureau_status ──────────────
          try {
            await db.promise().query(
              `INSERT INTO kyc_verification_status (lan, applicant_type, party_no, pan_number, bureau_status)
               VALUES (?, 'BORROWER', 1, ?, ?)
               ON DUPLICATE KEY UPDATE
                 bureau_status = VALUES(bureau_status),
                 pan_number    = VALUES(pan_number)`,
              [lan, data.pan_card, score != null ? "VERIFIED" : "FAILED"],
            );
          } catch (kycErr) {
            console.error(
              "⚠️ KYC row upsert failed for FINCREST BRE:",
              kycErr.message,
            );
          }
          // ─────────────────────────────────────────────────────────────────

          console.log("✅ CIBIL saved for FINCREST LAN:", lan);
        } catch (err) {
          console.error("⚠️ CIBIL Pull Failed:", err.message);
          console.error("➡️ Status:", err.response?.status);
          console.error("➡️ Raw:", err.response?.data);
        }

        // ── Fire Finso BRE engine after bureau (async, non-blocking) ─────────
        autoRunFinsoBreIfReady(lan).catch((breErr) => {
          console.error(
            `❌ FINCREST BRE Engine failed for LAN ${lan}:`,
            breErr,
          );
        });
        // ─────────────────────────────────────────────────────────────────────

        //////////////////////////////////////////
        //        🔍 BEURO SCORE END            //
        //////////////////////////////////////////

        results.push({
          message: "FINCREST loan saved successfully.",
          partner_loan_id: data.partner_loan_id,
          lan,
        });
      } catch (e) {
        if (conn) {
          await conn.rollback();
          conn.release();
        }
        // Granular DB errors
        if (e?.code === "ER_DUP_ENTRY") {
          results.push({
            error: "Duplicate partner_loan_id / unique key violation.",
            details: e.message,
          });
        } else if (e?.code === "ER_WRONG_VALUE_COUNT_ON_ROW") {
          results.push({
            error:
              "Column/value count mismatch (defensive check should prevent this).",
            details: e.message,
          });
        } else {
          results.push({ error: e.sqlMessage || e.message || "Unknown error" });
        }
      }
    }

    return res.json({
      message: "FINCREST upload completed.",
      results,
      row_errors,
    });
  } catch (error) {
    console.error("❌ Error in FINCREST JSON Upload:", {
      code: error.code,
      errno: error.errno,
      sqlState: error.sqlState,
      message: error.sqlMessage || error.message,
    });
    return res.status(500).json({
      message: "Upload failed. Please try again.",
      error: error.sqlMessage || error.message,
    });
  }
});

router.get("/v1/finso-lan-status/:lan", verifyApiKey, async (req, res) => {
  try {
    if (
      !req.partner ||
      (req.partner.name || "").toLowerCase().trim() !== "finso"
    ) {
      return res.status(403).json({
        message: "This route is only for FINCREST partner.",
      });
    }

    const { lan } = req.params;

    const [rows] = await db.promise().query(
      `SELECT lan, status
       FROM loan_booking_finso
       WHERE lan = ?
       LIMIT 1`,
      [lan],
    );

    if (rows.length === 0) {
      return res.status(404).json({
        message: "LAN not found.",
      });
    }

    return res.status(200).json({
      message: "LAN status fetched successfully.",
      data: {
        lan: rows[0].lan,
        status: rows[0].status,
      },
    });
  } catch (error) {
    console.error("❌ Error fetching LAN status:", error);

    return res.status(500).json({
      message: "Failed to fetch LAN status. Please try again.",
      error: error.sqlMessage || error.message,
    });
  }
});

// ✅ GET Finso Customer Details by LAN (For Frontend details screen)
router.get("/v1/finso-customer-details/:lan", async (req, res) => {
  try {
    const { lan } = req.params;

    const [rows] = await db
      .promise()
      .query(`SELECT * FROM loan_booking_finso WHERE lan = ? LIMIT 1`, [lan]);

    if (rows.length === 0) {
      return res.status(404).json({
        is_success: false,
        error: { message: "LAN not found.", code: "not_found" },
      });
    }

    return res.status(200).json({
      is_success: true,
      message: "Customer details fetched successfully.",
      data: rows[0],
    });
  } catch (error) {
    console.error("❌ Error fetching FINCREST customer details:", error);
    return res.status(500).json({
      is_success: false,
      error: { message: "Failed to fetch details", details: error.message },
    });
  }
});

// ✅ Fetch Ops Maker Approved Finso Loans (for Ops Checker screen)
router.get("/v1/finso-ops-maker-approved-loans", async (req, res) => {
  try {
    const query = `
      SELECT * FROM loan_booking_finso 
      WHERE status = 'approved'
      ORDER BY LAN DESC
    `;
    const [rows] = await db.promise().query(query);
    return res.json({ data: rows });
  } catch (err) {
    console.error("❌ Error fetching ops maker approved FINCREST loans:", err);
    return res.status(500).json({
      status: "FAILED",
      message: "Unable to fetch ops maker approved loans",
    });
  }
});

// ✅ Ops Checker Approve & Pay for Finso
router.put("/v1/finso-ops-checker-approved-loan/:lan", async (req, res) => {
  const { lan } = req.params;
  const { ops_checker_id, ops_checker_name, status } = req.body;
  try {
    if (status === "OPS_REJECTED") {
      await db.promise().query(
        `UPDATE loan_booking_finso 
         SET status = 'OPS_REJECTED', ops_checker_id = ?, ops_checker_name = ?
         WHERE lan = ?`,
        [ops_checker_id || null, ops_checker_name || null, lan],
      );
      return res.json({
        status: "SUCCESS",
        message: "Loan rejected by operations checker successfully",
      });
    }

    if (ops_checker_id) {
      await db.promise().query(
        `UPDATE loan_booking_finso 
         SET ops_checker_id = ?, ops_checker_name = ?
         WHERE lan = ?`,
        [ops_checker_id, ops_checker_name, lan],
      );
    }

    const payoutResult = await approveAndInitiatePayout({
      lan,
      table: "loan_booking_finso",
    });

    if (!payoutResult.success) {
      return res.status(400).json({
        status: "FAILED",
        message: payoutResult.message || "Payout initiation failed",
      });
    }

    return res.json({
      status: "SUCCESS",
      message:
        "Loan approved by operations checker and payout initiated successfully",
    });
  } catch (err) {
    console.error(
      "❌ Error approving FINCREST loan by operations checker:",
      err,
    );
    return res.status(500).json({
      status: "FAILED",
      message: err.message || "Failed to approve loan by operations checker",
      error: err.sqlMessage || err.message,
    });
  }
});

// ✅ Update Finso Bank Details by LAN
router.post("/v1/finso-bank-details", verifyApiKey, async (req, res) => {
  try {
    if (
      !req.partner ||
      (req.partner.name || "").toLowerCase().trim() !== "finso"
    ) {
      return res
        .status(403)
        .json({ message: "This route is only for FINCREST partner." });
    }

    const lenderTypeRaw = req.headers["x-lender"] ?? req.headers["lender"];
    const lenderType = lenderTypeRaw?.toString().trim();

    if (!lenderType) {
      return res
        .status(400)
        .json({ message: "Lender header is required (x-lender: Finso)." });
    }
    if (lenderType.toLowerCase() !== "finso") {
      return res.status(400).json({
        message: `Invalid lender: ${lenderType}. Only 'FINCREST' loans can be inserted.`,
      });
    }

    // Normalize input
    let records = req.body;
    if (!Array.isArray(records)) records = [records];

    const requiredFields = [
      "lan",
      "e_mandate_no",
      "mandate_id",
      "bank_name",
      "account_number",
      "ifsc",
    ];

    const results = [];

    for (const raw of records) {
      const data = {
        ...raw,
        account_number:
          raw.account_number ?? raw.account_no ?? raw.acc_no ?? null,
        ifsc: raw.ifsc ?? raw.bank_ifsc ?? null,
      };

      const missingField = requiredFields.find(
        (f) => data[f] === undefined || data[f] === null || data[f] === "",
      );
      if (missingField) {
        results.push({ error: `${missingField} is required.`, data });
        continue;
      }

      // ✅ Update existing record where LAN matches
      const [existing] = await db
        .promise()
        .query(`SELECT lan FROM loan_booking_finso WHERE lan = ? LIMIT 1`, [
          data.lan,
        ]);

      if (existing.length === 0) {
        results.push({
          message: `Customer not found for lan: ${data.lan}`,
          data,
        });
        continue;
      }

      const UPDATE_SQL = `
        UPDATE loan_booking_finso
        SET 
          e_mandate_no = ?,
          mandate_id = ?,
          bank_name = ?,
          account_number = ?,
          ifsc = ?
        WHERE lan = ?
      `;

      const values = [
        data.e_mandate_no,
        data.mandate_id,
        data.bank_name,
        data.account_number,
        data.ifsc,
        data.lan,
      ];

      await db.promise().query(UPDATE_SQL, values);

      results.push({
        message: "FINCREST loan bank details updated successfully.",
        lan: data.lan,
      });
    }

    return res.json({
      message: "FINCREST bank details processed successfully.",
      results,
    });
  } catch (error) {
    console.error("❌ Error in FINCREST JSON Upload:", error);
    return res.status(500).json({
      message: "Upload failed. Please try again.",
      error: error.sqlMessage || error.message,
    });
  }
});

router.post("/v1/emiclub-lb", verifyApiKey, async (req, res) => {
  let conn;
  try {
    console.log(
      "================= 📦 NEW EMICLUB REQUEST START =================",
    );
    if (
      !req.partner ||
      (req.partner.name || "").toLowerCase().trim() !== "emiclub"
    ) {
      //console.error("❌ Partner validation failed!");
      return res
        .status(403)
        .json({ message: "This route is only for Emiclub partner." });
    }

    // --- Body logging ---
    const data = req.body;
    //console.log("📥 Received JSON payload:", JSON.stringify(data, null, 2));

    // --- Lender type validation ---
    const lenderType = data.lenderType?.trim()?.toLowerCase();
    //console.log("🏦 Lender type received:", lenderType);
    if (!lenderType || lenderType !== "emiclub") {
      console.error("❌ Invalid lenderType provided:", lenderType);
      return res.status(400).json({
        message: "Invalid lenderType. Only 'EMICLUB' loans are accepted.",
      });
    }

    // --- Required field check ---
    const requiredFields = [
      "login_date",
      "partner_loan_id",
      "first_name",
      "last_name",
      "gender",
      "dob",
      "mobile_number",
      "email_id",
      "pan_number",
      "aadhar_number",
      "current_address",
      "current_village_city",
      "current_district",
      "current_state",
      "current_pincode",
      "permanent_address",
      "permanent_state",
      "permanent_pincode",
      "loan_amount",
      "roi_apr",
      "loan_tenure",
      "bank_name",
      "name_in_bank",
      "account_number",
      "ifsc",
      "account_type",
      "type_of_account",
      "employment",
      "annual_income",
      "dealer_name",
      "risk_category",
      "customer_type",
    ];

    for (const field of requiredFields) {
      if (!data[field] && data[field] !== 0) {
        console.error(`❌ Missing field detected: ${field}`);
        return res.status(400).json({ message: `${field} is required.` });
      }
    }
    //    console.log("✅ All required fields present.");

    // --- Duplicate TECH LOAN ID check ---
    // --- Duplicate TECH LOAN ID check ---
    console.log("🔍 Checking existing TECH LOAN ID:", data.partner_loan_id);
    const [existing] = await db.promise().query(
      `SELECT lan, partner_loan_id, customer_name 
     FROM loan_booking_emiclub 
     WHERE partner_loan_id = ?`,
      [data.partner_loan_id],
    );

    if (existing.length > 0) {
      return res.status(400).json({
        status: "Failed",
        message: "Duplicate Partner Loan ID",
        existingLan: existing[0].lan,
      });
    }

    /* =====================================================
       🔴 START CHANGE: PAN + STATUS DUPLICATE CHECK
       ===================================================== */

    console.log("🔍 Checking PAN duplication:", data.pan_number);

    const [panRecords] = await db.promise().query(
      `SELECT status 
   FROM loan_booking_emiclub 
   WHERE pan_number = ?`,
      [data.pan_number],
    );

    // Allowed statuses for re-insert
    const allowedStatuses = [
      "Cancelled",
      "Foreclosed",
      "Fully Paid",
      "Rejected",
    ];

    if (panRecords.length > 0) {
      const hasActiveCase = panRecords.some(
        (row) => !allowedStatuses.includes(row.status),
      );

      if (hasActiveCase) {
        console.error("❌ Active case exists for PAN:", data.pan_number);
        return res.status(400).json({
          status: "Failed",
          message:
            "PAN already exists with an active loan. New loan not allowed.",
        });
      }

      console.log(
        "✅ PAN exists but all cases are closed. Proceeding with insert.",
      );
    }

    const loanAmount = Number(data.loan_amount);

    if (!loanAmount || loanAmount <= 0) {
      return res.status(400).json({
        message: "Invalid loan_amount",
      });
    }

    // --- Generate loan code ---
    //console.log("⚙️ Generating LAN for lender:", lenderType);
    conn = await db.promise().getConnection();
    await conn.beginTransaction();

    const partnerName = "EMICLUB";

    if (!data.login_date) {
      return res.status(400).json({
        message: "login_date is required for limit validation",
      });
    }
    const today = new Date();
    const { month, year } = getMonthYear(today);

    const partner = await partnerLimitService.getOrCreatePartner(
      conn,
      partnerName,
    );

    const limitCheck = await partnerLimitService.validatePartnerBookingLimit(
      conn,
      partner.partner_id,
      loanAmount,
      month,
      year,
    );

    if (!limitCheck.valid) {
      await conn.rollback();
      conn.release();

      return res.status(403).json({
        message: "Monthly partner limit exceeded",
        remaining_limit: limitCheck.remaining,
        required: loanAmount,
      });
    }

    // Fetch partner FLDG percent
    const [[partnerConfig]] = await conn.query(
      `SELECT fldg_percent, fldg_status FROM partner_master WHERE partner_id = ?`,
      [partner.partner_id],
    );

    if (!partnerConfig) {
      throw new Error("Partner configuration not found");
    }

    let requiredFldg = 0;

    if (partnerConfig?.fldg_status === 1) {
      const fldgPercent = Number(partnerConfig?.fldg_percent || 0);

      requiredFldg = Number(((loanAmount * fldgPercent) / 100).toFixed(2));
    }

    // Validate FLDG availability
    if (requiredFldg > 0) {
      const fldgCheck = await partnerFldgService.validateFldgAvailability(
        conn,
        partner.partner_id,
        requiredFldg,
      );

      if (!fldgCheck.valid) {
        await conn.rollback();
        conn.release();

        return res.status(403).json({
          message: `Insufficient FLDG. Available: ${fldgCheck.available}, Required: ${requiredFldg}`,
        });
      }
    }

    const { lan } = await generateLoanIdentifiers(lenderType);
    console.log("✅ Generated LAN:", lan);

    const customer_name = `${data.first_name || ""} ${
      data.last_name || ""
    }`.trim();
    const agreement_date = data.login_date;

    // --- Determine interest rate ---
    const interest_rate = data.roi_apr / 12;
    //    console.log("📈 Using interest rate:", interest_rate);

    // --- Insert into DB ---
    //  console.log("💾 Inserting customer record into loan_booking_emiclub...");
    await conn.query(
      `INSERT INTO loan_booking_emiclub (
        lan, partner_loan_id, login_date, first_name, middle_name, last_name, gender, dob,
        father_name, mother_name, mobile_number, email_id,
        pan_number, aadhar_number, current_address, current_village_city, current_district, current_state, current_pincode,
        permanent_address, permanent_village_city, permanent_district, permanent_state, permanent_pincode,
        loan_amount, interest_rate, roi_apr, loan_tenure, emi_amount, cibil_score,
        product, lender, bank_name, name_in_bank, account_number, ifsc,
        account_type, type_of_account, net_disbursement, employment, risk_category, customer_type,
        annual_income, dealer_name, dealer_mobile, dealer_address, dealer_city,
        status, customer_name, agreement_date
      )
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        lan,
        data.partner_loan_id,
        data.login_date,
        data.first_name,
        data.middle_name || null,
        data.last_name,
        data.gender,
        data.dob,
        data.father_name,
        data.mother_name,
        data.mobile_number,
        data.email_id,
        data.pan_number,
        data.aadhar_number,
        data.current_address,
        data.current_village_city,
        data.current_district,
        data.current_state,
        data.current_pincode,
        data.permanent_address,
        data.permanent_village_city || data.current_village_city,
        data.permanent_district || data.current_district,
        data.permanent_state,
        data.permanent_pincode,
        data.loan_amount,
        interest_rate,
        data.roi_apr,
        data.loan_tenure,
        data.emi_amount,
        data.cibil_score,
        "Monthly Loan",
        "EMICLUB",
        data.bank_name,
        data.name_in_bank,
        data.account_number,
        data.ifsc,
        data.account_type,
        data.type_of_account,
        data.net_disbursement || data.loan_amount,
        data.employment,
        null,
        data.customer_type,
        data.annual_income,
        data.dealer_name,
        data.dealer_mobile,
        data.dealer_address,
        data.dealer_city,
        "Login",
        customer_name,
        agreement_date,
      ],
    );

    await partnerLimitService.updateBookedLimit(
      conn,
      limitCheck.limitId,
      loanAmount,
      lan,
    );

    if (requiredFldg > 0) {
      await partnerFldgService.reserveFldg(
        conn,
        partner.partner_id,
        lan,
        requiredFldg,
        `EMICLUB reservation | Amount: ${loanAmount}`,
      );
    }

    await conn.commit();
    conn.release();

    ////  BEURO SCORE  CODE START/////
    console.log("✅ Customer record inserted successfully.");
    // --- Build SOAP XML ---
    console.log("🧩 Building SOAP request body for Experian...");
    const dobFormatted = data.dob.replace(/-/g, "");
    console.log(
      data.first_name,
      data.last_name,
      data.pan_number,
      data.mobile_number,
      data.current_address,
      data.current_village_city,
      data.current_state,
      data.current_pincode,
    );
    console.log("🔧 Formatted DOB for SOAP:", dobFormatted);

    const stateCodes = {
      "JAMMU and KASHMIR": "01",
      "HIMACHAL PRADESH": "02",
      PUNJAB: "03",
      CHANDIGARH: "04",
      UTTRANCHAL: "05",
      HARAYANA: "06",
      DELHI: "07",
      RAJASTHAN: "08",
      "UTTAR PRADESH": "09",
      BIHAR: "10",
      SIKKIM: "11",
      "ARUNACHAL PRADESH": "12",
      NAGALAND: "13",
      MANIPUR: "14",
      MIZORAM: "15",
      TRIPURA: "16",
      MEGHALAYA: "17",
      ASSAM: "18",
      "WEST BENGAL": "19",
      JHARKHAND: "20",
      ORRISA: "21",
      CHHATTISGARH: "22",
      "MADHYA PRADESH": "23",
      GUJRAT: "24",
      "DAMAN and DIU": "25",
      "DADARA and NAGAR HAVELI": "26",
      MAHARASHTRA: "27",
      "ANDHRA PRADESH": "28",
      KARNATAKA: "29",
      GOA: "30",
      LAKSHADWEEP: "31",
      KERALA: "32",
      "TAMIL NADU": "33",
      PONDICHERRY: "34",
      "ANDAMAN and NICOBAR ISLANDS": "35",
      TELANGANA: "36",
    };

    const state = data.current_state ?? "MAHARASHTRA"; // default to Maharashtra
    const state_code = stateCodes[state.toUpperCase()] ?? null;

    const firstName = data.first_name.toUpperCase();
    const lastName = data.last_name.toUpperCase();
    const gender_code = (data.gender ?? "Male") === "Female" ? 2 : 1;
    const soapBody = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:urn="urn:cbv2">
   <soapenv:Header/>
   <soapenv:Body>
      <urn:process>
         <urn:in>
            <INProfileRequest>
    <Identification>
       <XMLUser>${process.env.EXPERIAN_USER}</XMLUser>
<XMLPassword>${process.env.EXPERIAN_PASSWORD}</XMLPassword>
    </Identification>
    <Application>
        <FTReferenceNumber></FTReferenceNumber>
        <CustomerReferenceID></CustomerReferenceID>
        <EnquiryReason>06</EnquiryReason> 
        <FinancePurpose>99</FinancePurpose>
        <AmountFinanced>${data.loan_amount}</AmountFinanced>
        <DurationOfAgreement>${data.loan_tenure}</DurationOfAgreement>
        <ScoreFlag>1</ScoreFlag>
        <PSVFlag></PSVFlag>
    </Application>
    <Applicant>
        <Surname>${lastName}</Surname>
        <FirstName>${firstName}</FirstName>
        <MiddleName1></MiddleName1>
        <MiddleName2></MiddleName2>
        <MiddleName3></MiddleName3>
        <GenderCode>${gender_code}</GenderCode>
        <IncomeTaxPAN>${data.pan_number}</IncomeTaxPAN>
        <PANIssueDate></PANIssueDate>
        <PANExpirationDate></PANExpirationDate>
        <PassportNumber></PassportNumber>
        <PassportIssueDate></PassportIssueDate>
        <PassportExpirationDate></PassportExpirationDate>
        <VoterIdentityCard></VoterIdentityCard>
        <VoterIDIssueDate></VoterIDIssueDate>
        <VoterIDExpirationDate></VoterIDExpirationDate>
        <DriverLicenseNumber></DriverLicenseNumber>
        <DriverLicenseIssueDate></DriverLicenseIssueDate>
        <DriverLicenseExpirationDate></DriverLicenseExpirationDate>
        <RationCardNumber></RationCardNumber>
        <RationCardIssueDate></RationCardIssueDate>
        <RationCardExpirationDate></RationCardExpirationDate>
        <UniversalIDNumber></UniversalIDNumber>
        <UniversalIDIssueDate></UniversalIDIssueDate>
        <UniversalIDExpirationDate></UniversalIDExpirationDate>
        <DateOfBirth>${dobFormatted}</DateOfBirth>
        <STDPhoneNumber></STDPhoneNumber>
        <PhoneNumber>${data.mobile_number}</PhoneNumber>
        <TelephoneExtension></TelephoneExtension>
        <TelephoneType></TelephoneType>
        <MobilePhone></MobilePhone>
        <EMailId></EMailId>
    </Applicant>
    <Details>
        <Income></Income>
        <MaritalStatus></MaritalStatus>
        <EmployStatus></EmployStatus>
        <TimeWithEmploy></TimeWithEmploy>
        <NumberOfMajorCreditCardHeld></NumberOfMajorCreditCardHeld>
    </Details>
    <Address>
        <FlatNoPlotNoHouseNo>${data.current_address}</FlatNoPlotNoHouseNo>
        <BldgNoSocietyName></BldgNoSocietyName>
        <RoadNoNameAreaLocality></RoadNoNameAreaLocality>
        <City>${data.current_village_city}</City>
        <Landmark></Landmark>
      <State>${state_code}</State>
        <PinCode>${data.current_pincode}</PinCode>
    </Address>
    <AdditionalAddressFlag>
        <Flag>N</Flag>
    </AdditionalAddressFlag>
    <AdditionalAddress>
        <FlatNoPlotNoHouseNo></FlatNoPlotNoHouseNo>
        <BldgNoSocietyName></BldgNoSocietyName>
        <RoadNoNameAreaLocality></RoadNoNameAreaLocality>
        <City></City>
        <Landmark></Landmark>
        <State></State>
        <PinCode></PinCode>
    </AdditionalAddress>
</INProfileRequest>
</urn:in>
      </urn:process>
   </soapenv:Body>
</soapenv:Envelope>`;

    // --- Send SOAP request ---
    console.log("🌐 Sending SOAP request to Experian...");
    let score = null;
    let parsedXmlToStore = null;

    try {
      const response = await axios.post(process.env.EXPERIAN_URL, soapBody, {
        headers: {
          "Content-Type": "text/xml; charset=utf-8",
          SOAPAction: "urn:cbv2/process",
          Accept: "text/xml",
        },
        timeout: 30000,
        validateStatus: () => true,
      });

      console.log("📥 Experian HTTP Status:", response.status);
      console.log(
        "📥 Experian Raw Response (first 1000 chars):",
        response.data?.substring(0, 7000),
      );

      if (response.status !== 200)
        throw new Error(`Experian returned HTTP ${response.status}`);
      //////////////////// new addd.//////////
      // --- Parse SOAP XML ---
      const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: "",
        trimValues: true,

        // Keep entity processing enabled, but raise limits for valid large bureau XML.
        processEntities: {
          enabled: true,
          maxTotalExpansions: 200000,
          maxExpandedLength: 20_000_000,
          maxEntityCount: 200000,
          maxEntitySize: 200000,
        },
      });
      const soapParsed = parser.parse(response.data);
      const encodedInnerXml =
        soapParsed["SOAP-ENV:Envelope"]?.["SOAP-ENV:Body"]?.[
          "ns2:processResponse"
        ]?.["ns2:out"];

      if (!encodedInnerXml)
        throw new Error("Missing ns2:out field in Experian response");

      // Decode and parse the inner XML
      const decodedInnerXml = he.decode(encodedInnerXml);
      parsedXmlToStore = decodedInnerXml;
      const innerParsed = parser.parse(decodedInnerXml);

      // Extract score and message
      const scoreStr =
        innerParsed?.INProfileResponse?.SCORE?.BureauScore ?? null;
      //const userMsg = innerParsed?.INProfileResponse?.UserMessage?.UserMessageText ?? "";
      console.log(scoreStr, "score str");

      if (scoreStr) {
        score = Number(scoreStr);
      } else {
        score = null;
      }

      ///////////////////// end  ////////////////
      console.log("✅ Parsed CIBIL Score:", score);
      // console.log(
      //   "🧾 Normalized INProfileResponse (first 500 chars):",
      //   parsedXmlToStore?.substring(0, 7000)
      // );

      await db.promise().query(
        `INSERT INTO loan_cibil_reports (lan, pan_number, score, report_xml, created_at)
         VALUES (?,?,?,?,NOW())`,
        [lan, data.pan_number, score, parsedXmlToStore], // store parsed/pretty INProfileResponse XML
      );

      await db
        .promise()
        .execute(
          "UPDATE loan_booking_emiclub SET cibil_score = ? WHERE lan = ?",
          [score, lan],
        );

      console.log("✅ CIBIL report (parsed XML) saved successfully.");
    } catch (err) {
      console.error("⚠️ CIBIL Pull Failed:", err.message);
      console.error("➡️ Response status:", err.response?.status);
      console.error("➡️ Response data:", err.response?.data);
      console.error("➡️ Request URL:", process.env.EXPERIAN_URL);
      console.error("➡️ SOAP Body Preview:", soapBody.substring(0, 300));
    }
    console.log("✅ Completed EMI Club flow. LAN:", lan, "CIBIL Score:", score);
    console.log("================= 📦 EMICLUB REQUEST END =================\n");

    /////////////////// beauro code end ////////////
    return res.json({
      message: "✅ EMICLUB loan saved successfully.",
      lan,
      cibilScore: score || "Not Found",
    });
  } catch (error) {
    if (conn) {
      await conn.rollback();
      conn.release();
    }
    console.error("❌ Unhandled Error in EMICLUB Upload:", error);
    res.status(500).json({
      message: "Upload failed. Please try again.",
      error: error.sqlMessage || error.message,
    });
  }
});

function getMissingFields(data, requiredFields) {
  return requiredFields.filter((field) => {
    const value = data[field];
    return (
      value === undefined ||
      value === null ||
      (typeof value === "string" && value.trim() === "")
    );
  });
}

function nullableString(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed === "" ? null : trimmed;
}

function isCarePayPartner(req) {
  return (req.partner?.name || "").toLowerCase().trim() === "carepay";
}

function isSterlionPartner(req) {
  return (req.partner?.name || "").toLowerCase().trim() === "sterlion";
}

router.post("/v1/carepay-hospitals/create", verifyApiKey, async (req, res) => {
  try {
    const partner = req.partner.name || {};
    if (partner.toLowerCase().trim() !== "carepay") {
      return res
        .status(403)
        .json({ message: "This route is only for CarePay partner." });
    }
    const data = req.body || {};
    const missing = getMissingFields(data, CAREPAY_HOSPITAL_REQUIRED_FIELDS);

    if (missing.length) {
      return res.status(400).json({
        message: `Missing fields: ${missing.join(", ")}`,
      });
    }

    const partnerLoanId = nullableString(data.partner_loan_id);
    const { lan } = await generateLoanIdentifiers("carepay-hospital");

    const fields = {
      partner_loan_id: partnerLoanId,
      lan,
      hospital_legal_name: data.hospital_legal_name,
      brand_name: nullableString(data.brand_name),
      branch_locations: nullableString(data.branch_locations),
      hospital_registration_number: nullableString(
        data.hospital_registration_number,
      ),
      year_of_establishment: nullableString(data.year_of_establishment),
      hospital_type: nullableString(data.hospital_type),
      bed_capacity: nullableString(data.bed_capacity),
      key_specialties: nullableString(data.key_specialties),
      major_procedures: nullableString(data.major_procedures),
      departments: nullableString(data.departments),
      registered_address: data.registered_address,
      registered_city: data.registered_city,
      registered_district: data.registered_district,
      registered_state: data.registered_state,
      registered_pincode: data.registered_pincode,
      hospital_email: nullableString(data.hospital_email),
      hospital_phone: data.hospital_phone,
      contact_person_name: data.contact_person_name,
      contact_person_email: nullableString(data.contact_person_email),
      contact_person_phone: data.contact_person_phone,
      ifsc_code: data.ifsc_code,
      bank_name: data.bank_name,
      branch_name: data.branch_name,
      account_holder_name: data.account_holder_name,
      account_number: data.account_number,
      status: "PENDING",
      created_at: new Date(),
    };

    const columns = Object.keys(fields).join(", ");
    const placeholders = Object.keys(fields)
      .map(() => "?")
      .join(", ");
    const values = Object.values(fields);

    await db
      .promise()
      .query(
        `INSERT INTO carepay_hospital_booking (${columns}) VALUES (${placeholders})`,
        values,
      );

    return res.json({
      message: "CarePay hospital created successfully",
      lan,
      partner_loan_id: partnerLoanId,
    });
  } catch (err) {
    console.error("CarePay hospital creation error:", err);

    return res.status(500).json({
      message: "CarePay hospital creation failed",
      error: err.sqlMessage || err.message,
    });
  }
});

////////// CARE PAY HOSPITAL LIST FOR CAREPAY PARTNER (for excel upload) //////////
router.get("/v1/carepay-hospitals-list", verifyApiKey, async (req, res) => {
  try {
    if (!isCarePayPartner(req)) {
      return res
        .status(403)
        .json({ message: "This route is only for CarePay partner." });
    }

    const [rows] = await db.promise().query(`
      SELECT
        id,
        partner_loan_id,
        lan,
        hospital_legal_name,
        registered_city,
        registered_district,
        registered_state,
        bank_name,
        account_holder_name,
        account_number,
        ifsc_code
      FROM carepay_hospital_booking
      WHERE status IN ('ACTIVE', 'APPROVED')
      ORDER BY hospital_legal_name ASC
    `);

    return res.json(
      rows.map((hospital) => ({
        id: hospital.id,
        partner_loan_id: hospital.partner_loan_id,
        lan: hospital.lan,
        name: `${hospital.hospital_legal_name} (${hospital.registered_city}, ${hospital.registered_district})`,
        hospital_legal_name: hospital.hospital_legal_name,
        city: hospital.registered_city,
        district: hospital.registered_district,
        state: hospital.registered_state,
        bank_name: hospital.bank_name,
        account_holder_name: hospital.account_holder_name,
        account_number: hospital.account_number,
        ifsc_code: hospital.ifsc_code,
      })),
    );
  } catch (err) {
    console.error("CarePay hospital list error:", err);

    return res.status(500).json({
      message: "Failed to fetch CarePay hospitals",
      error: err.message,
    });
  }
});

router.get("/carepay-hospitals", async (req, res) => {
  try {
    const [rows] = await db.promise().query(`
      SELECT
        id,
        partner_loan_id,
        lan,
        hospital_legal_name,
        brand_name,
        hospital_type,
        bed_capacity,
        registered_city,
        registered_district,
        registered_state,
        hospital_phone,
        contact_person_name,
        bank_name,
        account_holder_name,
        account_number,
        ifsc_code,
        CASE WHEN status = 'ACTIVE' THEN 'APPROVED' ELSE status END AS status,
        created_at
      FROM carepay_hospital_booking
      WHERE status IN ('PENDING', 'APPROVED', 'ACTIVE')
      ORDER BY created_at DESC
    `);

    return res.json(rows);
  } catch (err) {
    console.error("CarePay hospital fetch error:", err);

    return res.status(500).json({
      message: "Failed to fetch CarePay hospitals",
      error: err.message,
    });
  }
});

////////////////// CARE PAY HOSPITAL PENDING CASES FOR ADMIN APPROVAL //////////
router.get("/carepay-hospitals-login-loans", async (req, res) => {
  try {
    const [rows] = await db.promise().query(`
      SELECT
        id,
        partner_loan_id,
        lan,
        hospital_legal_name,
        brand_name,
        hospital_type,
        bed_capacity,
        registered_city,
        registered_district,
        registered_state,
        hospital_phone,
        contact_person_name,
        bank_name,
        account_holder_name,
        account_number,
        ifsc_code,
        status,
        created_at
      FROM carepay_hospital_booking
      WHERE status = 'PENDING'
      ORDER BY created_at DESC
    `);

    return res.json(rows);
  } catch (err) {
    console.error("CarePay hospital pending fetch error:", err);

    return res.status(500).json({
      message: "Failed to fetch pending CarePay hospitals",
      error: err.message,
    });
  }
});

////////////// CARE PAY HOSPITAL DETAILS BY LAN (for admin view and excel upload) //////////
router.get("/carepay-hospital-booking-details/:lan", async (req, res) => {
  const { lan } = req.params;

  try {
    const [rows] = await db.promise().query(
      `
      SELECT
        id,
        partner_loan_id,
        lan,
        hospital_legal_name,
        brand_name,
        branch_locations,
        hospital_registration_number,
        year_of_establishment,
        hospital_type,
        bed_capacity,
        key_specialties,
        major_procedures,
        departments,
        registered_address,
        registered_city,
        registered_district,
        registered_state,
        registered_pincode,
        hospital_email,
        hospital_phone,
        contact_person_name,
        contact_person_email,
        contact_person_phone,
        ifsc_code,
        bank_name,
        branch_name,
        account_holder_name,
        account_number,
        CASE WHEN status = 'ACTIVE' THEN 'APPROVED' ELSE status END AS status,
        created_at
      FROM carepay_hospital_booking
      WHERE lan = ?
      LIMIT 1
      `,
      [lan],
    );

    return res.json(rows[0] || null);
  } catch (err) {
    console.error("CarePay hospital details fetch error:", err);

    return res.status(500).json({
      message: "Failed to fetch CarePay hospital details",
      error: err.message,
    });
  }
});

//////////////// CARE PAY HOSPITAL STATUS UPDATE BY LAN (for admin approval and excel upload) //////////
router.patch("/carepay-hospitals/status/:lan", async (req, res) => {
  try {
    const { lan } = req.params;
    const status = String(req.body?.status || "")
      .toUpperCase()
      .trim();

    if (!["PENDING", "APPROVED"].includes(status)) {
      return res.status(400).json({
        message: "Invalid status. Allowed values are PENDING and APPROVED.",
      });
    }

    const [result] = await db
      .promise()
      .query(`UPDATE carepay_hospital_booking SET status = ? WHERE lan = ?`, [
        status,
        lan,
      ]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: `Hospital not found: ${lan}` });
    }

    return res.json({ message: "Status updated successfully", status });
  } catch (err) {
    console.error("CarePay hospital status update error:", err);

    return res.status(500).json({
      message: "Failed to update CarePay hospital status",
      error: err.message,
    });
  }
});

async function fetchCarePayCaseStatus({ lan, partnerLoanId }) {
  const whereClause = lan ? "lan = ?" : "partner_loan_id = ?";
  const value = lan || partnerLoanId;

  const [rows] = await db.promise().query(
    `SELECT
       lan,
       partner_loan_id,
       customer_name,
       status,
       request_amount,
       loan_amount
     FROM loan_booking_carepay
     WHERE ${whereClause}
     LIMIT 1`,
    [value],
  );

  return rows[0] || null;
}

function buildCarePayStatusResponse(row) {
  const parsedCreditLimit = Number(row.loan_amount);
  const creditLimit =
    row.loan_amount === null ||
    row.loan_amount === undefined ||
    row.loan_amount === "" ||
    !Number.isFinite(parsedCreditLimit)
      ? null
      : parsedCreditLimit;

  return {
    lan: row.lan,
    partner_loan_id: row.partner_loan_id,
    customer_name: row.customer_name,
    status: row.status,
    request_amount: row.request_amount,
    loan_amount: creditLimit,
    credit_limit: creditLimit,
    limit_available: creditLimit !== null,
  };
}

///////////// CARE PAY CASE STATUS FETCH BY LAN OR PARTNER LOAN ID (for excel upload) //////////
router.get("/v1/carepay-case-status", verifyApiKey, async (req, res) => {
  try {
    if (!isCarePayPartner(req)) {
      return res
        .status(403)
        .json({ message: "This route is only for CarePay partner." });
    }

    const lan = String(req.query.lan || "").trim();
    const partnerLoanId = String(req.query.partner_loan_id || "").trim();

    if (!lan && !partnerLoanId) {
      return res.status(400).json({
        message: "lan or partner_loan_id is required.",
      });
    }

    const row = await fetchCarePayCaseStatus({
      lan: lan || null,
      partnerLoanId: partnerLoanId || null,
    });

    if (!row) {
      return res.status(404).json({ message: "CarePay case not found." });
    }

    return res.status(200).json({
      message: "CarePay case status fetched successfully.",
      data: buildCarePayStatusResponse(row),
    });
  } catch (error) {
    console.error("CarePay case status fetch error:", error);

    return res.status(500).json({
      message: "Failed to fetch CarePay case status.",
      error: error.sqlMessage || error.message,
    });
  }
});

async function persistCarePayBureauResult(lan, data) {
  let bureauResult = {
    success: false,
    score: null,
    response: null,
  };

  try {
    bureauResult = await runBureau(data);
    const score = bureauResult.score ?? null;
    const report = bureauResult.response ?? null;

    if (report) {
      await db.promise().query(
        `INSERT INTO loan_cibil_reports (lan, pan_number, score, report_xml, created_at)
         VALUES (?,?,?,?,NOW())`,
        [lan, data.pan_number, score, report],
      );
    }

    if (score !== null) {
      await db
        .promise()
        .execute(
          "UPDATE loan_booking_carepay SET cibil_score_fintree = ? WHERE lan = ?",
          [score, lan],
        );
    }

    try {
      await db
        .promise()
        .query("INSERT IGNORE INTO kyc_verification_status (lan) VALUES (?)", [
          lan,
        ]);
      await db.promise().query(
        `UPDATE kyc_verification_status
         SET bureau_status = ?, bureau_api_response = ?
         WHERE lan = ?`,
        [bureauResult.success ? "VERIFIED" : "FAILED", report, lan],
      );
    } catch (kycErr) {
      console.error("CarePay KYC bureau status update failed:", kycErr.message);
    }

    return bureauResult;
  } catch (err) {
    console.error("CarePay bureau hard pull failed:", err.message);

    try {
      await db
        .promise()
        .query("INSERT IGNORE INTO kyc_verification_status (lan) VALUES (?)", [
          lan,
        ]);
      await db.promise().query(
        `UPDATE kyc_verification_status
         SET bureau_status = 'FAILED', bureau_api_response = ?
         WHERE lan = ?`,
        [err.message, lan],
      );
    } catch (kycErr) {
      console.error(
        "CarePay failed bureau status update failed:",
        kycErr.message,
      );
    }

    return bureauResult;
  }
}

// router.post("/v1/carepay-lb", verifyApiKey, async (req, res) => {
//   let conn;

//   try {
//     const data = req.body || {};
//     const lenderType = String(req.partner?.name || "")
//       .toLowerCase()
//       .trim();

//     if (!isCarePayPartner(req)) {
//       return res.status(403).json({
//         message: "This route is only for CarePay partner.",
//       });
//     }
//     if (!data.loan_type) {
//       return res.status(400).json({
//         message: "Missing fields: loan_type",
//       });
//     }

//     const normalizedLoanType = String(data.loan_type).toLowerCase().trim();

//     const loanType = CarepayLoanTypes.find(
//       (type) => type.toLowerCase() === normalizedLoanType,
//     );

//     if (!loanType) {
//       return res.status(400).json({
//         message: `Invalid loan_type. Allowed values are: ${CarepayLoanTypes.join(", ")}`,
//       });
//     }

//     const missing = getMissingFields(data, CAREPAY_REQUIRED_FIELDS);

//     if (missing.length) {
//       return res.status(400).json({
//         message: `Missing fields: ${missing.join(", ")}`,
//       });
//     }

//     const rawRequestAmount =
//       data.request_amount !== undefined &&
//       data.request_amount !== null &&
//       data.request_amount !== ""
//         ? data.request_amount
//         : data.loan_amount;

//     if (
//       rawRequestAmount === undefined ||
//       rawRequestAmount === null ||
//       rawRequestAmount === ""
//     ) {
//       return res
//         .status(400)
//         .json({ message: "Missing fields: request_amount" });
//     }

//     const requestAmount = Number(rawRequestAmount);

//     if (!requestAmount || Number.isNaN(requestAmount) || requestAmount <= 0) {
//       return res.status(400).json({ message: "Invalid request_amount" });
//     }

//     conn = await db.promise().getConnection();
//     await conn.beginTransaction();

//     const hospitalLan = String(data.hospital_lan || "").trim();
//     const [hospitalRows] = await conn.query(
//       `SELECT lan
//        FROM carepay_hospital_booking
//        WHERE lan = ?
//          AND status IN ('APPROVED')
//        LIMIT 1`,
//       [hospitalLan],
//     );

//     if (!hospitalRows.length) {
//       await conn.rollback();
//       conn.release();
//       conn = null;

//       return res.status(404).json({
//         status: "Failed",
//         message: "Hospital not found or not approved for CarePay booking.",
//       });
//     }

//     const [existing] = await conn.query(
//       `SELECT lan, partner_loan_id, customer_name
//        FROM loan_booking_carepay
//        WHERE partner_loan_id = ?`,
//       [data.partner_loan_id],
//     );

//     if (existing.length > 0) {
//       await conn.rollback();
//       conn.release();
//       conn = null;

//       return res.status(400).json({
//         status: "Failed",
//         message: "Duplicate Partner Loan ID",
//         existingLan: existing[0].lan,
//       });
//     }

//     const [panRecords] = await conn.query(
//       `SELECT status
//        FROM loan_booking_carepay
//        WHERE pan_number = ?`,
//       [data.pan_number],
//     );

//     const allowedStatuses = new Set([
//       "cancelled",
//       "foreclosed",
//       "fully paid",
//       "rejected",
//     ]);

//     if (
//       panRecords.some(
//         (row) =>
//           !allowedStatuses.has(
//             String(row.status || "")
//               .trim()
//               .toLowerCase(),
//           ),
//       )
//     ) {
//       await conn.rollback();
//       conn.release();
//       conn = null;

//       return res.status(400).json({
//         status: "Failed",
//         message:
//           "PAN already exists with an active loan. New loan not allowed.",
//       });
//     }

//     const partnerName = "CAREPAY";
//     const today = new Date();
//     const { month, year } = getMonthYear(today);

//     const partner = await partnerLimitService.getOrCreatePartner(
//       conn,
//       partnerName,
//     );

//     // const limitCheck = await partnerLimitService.validatePartnerBookingLimit(
//     //   conn,
//     //   partner.partner_id,
//     //   requestAmount,
//     //   month,
//     //   year,
//     // );

//     // if (!limitCheck.valid) {
//     //   await conn.rollback();
//     //   conn.release();
//     //   conn = null;

//     //   return res.status(403).json({
//     //     message: "Monthly partner limit exceeded",
//     //     remaining_limit: limitCheck.remaining,
//     //     required: requestAmount,
//     //   });
//     // }

//     const { lan } = await generateLoanIdentifiers(lenderType);
//     const customer_name = `${data.first_name || ""} ${
//       data.last_name || ""
//     }`.trim();
//     const agreement_date = data.login_date;
//     const interest_rate = 0;
//     const permanentAddress = data.permanent_address || data.current_address;
//     const permanentVillageCity =
//       data.permanent_village_city || data.current_village_city;
//     const permanentDistrict = data.permanent_district || data.current_district;
//     const permanentState = data.permanent_state || data.current_state;
//     const permanentPincode = data.permanent_pincode || data.current_pincode;

//     const fields = {
//       lan,
//       partner_loan_id: data.partner_loan_id,
//       hospital_lan: hospitalLan,
//       login_date: data.login_date,
//       first_name: data.first_name,
//       middle_name: nullableString(data.middle_name),
//       last_name: data.last_name,
//       customer_name,
//       gender: data.gender,
//       dob: data.dob,
//       age: data.age || null,
//       father_name: nullableString(data.father_name),
//       mother_name: nullableString(data.mother_name),
//       mobile_number: data.mobile_number,
//       email_id: nullableString(data.email_id),
//       pan_number: data.pan_number,
//       aadhar_number: data.aadhar_number,
//       current_address: data.current_address,
//       current_village_city: data.current_village_city,
//       current_district: data.current_district,
//       current_state: data.current_state,
//       current_pincode: data.current_pincode,
//       permanent_address: permanentAddress,
//       permanent_village_city: permanentVillageCity,
//       permanent_district: permanentDistrict,
//       permanent_state: permanentState,
//       permanent_pincode: permanentPincode,
//       request_amount: requestAmount,
//       loan_amount: null,
//       interest_rate:data.interest_rate || 0,
//       processing_fee_percentage: data.processing_fee_percentage,
//       subvention_percentage: data.subvention_percentage,
//       subvention_amount: data.subvention_amount,
//       loan_tenure: data.loan_tenure,
//       emi_amount: data.emi_amount || null,
//       cibil_score: data.cibil_score || null,
//       product: data.loan_type,
//       lender: "CAREPAY",
//       // loan_type: data.loan_type,
//       net_disbursement: data.net_disbursement || requestAmount,
//       employment: data.employment,
//       customer_type: data.customer_type,
//       annual_income: data.annual_income,
//       patient_name: nullableString(data.patient_name),
//       insurance_company_name: nullableString(data.insurance_company_name),
//       insurance_policy_holder_name: nullableString(
//         data.insurance_policy_holder_name,
//       ),
//       insurance_policy_number: nullableString(data.insurance_policy_number),
//       relation_with_policy_holder: nullableString(
//         data.relation_with_policy_holder,
//       ),
//       status: "Login",
//       agreement_date,
//     };

//     const columns = Object.keys(fields).join(", ");
//     const placeholders = Object.keys(fields)
//       .map(() => "?")
//       .join(", ");
//     const values = Object.values(fields);

//     await conn.query(
//       `INSERT INTO loan_booking_carepay (${columns}) VALUES (${placeholders})`,
//       values,
//     );

//     // await partnerLimitService.updateBookedLimit(
//     //   conn,
//     //   limitCheck.limitId,
//     //   loanAmount,
//     //   lan,
//     // );

//     await conn.commit();
//     conn.release();
//     conn = null;

//     const bureauResult = await persistCarePayBureauResult(lan, {
//       ...data,
//       loan_amount: requestAmount,
//       request_amount: requestAmount,
//     });

//     return res.json({
//       message: "CAREPAY loan saved successfully.",
//       lan,
//       hospital_lan: hospitalLan,
//       cibilScore: bureauResult.score || "Not Found",
//       bureauStatus: bureauResult.success ? "VERIFIED" : "FAILED",
//     });
//   } catch (error) {
//     if (conn) {
//       await conn.rollback();
//       conn.release();
//     }

//     console.error("CarePay onboarding error:", error);
//     res.status(error.statusCode || 500).json({
//       message: "Upload failed. Please try again.",
//       error: error.sqlMessage || error.message,
//     });
//   }
// });

///// NEW CODE ADD SUB PFEE AND NET DIS. .......

const isProvided = (value) =>
  value !== undefined && value !== null && String(value).trim() !== "";

const round2 = (value) =>
  Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const parseNonNegativeNumber = (value, fieldName) => {
  if (!isProvided(value)) return null;

  const num = Number(value);

  if (!Number.isFinite(num) || num < 0) {
    throw new Error(`Invalid ${fieldName}`);
  }

  return num;
};

const calculateAmountPercentagePair = ({
  baseAmount,
  amountValue,
  percentageValue,
  amountField,
  percentageField,
}) => {
  const amount = parseNonNegativeNumber(amountValue, amountField);
  const percentage = parseNonNegativeNumber(percentageValue, percentageField);

  // Vendor passed both amount and percentage.
  // Validate that both are matching.
  if (amount !== null && percentage !== null) {
    const expectedAmount = round2((baseAmount * percentage) / 100);
    const givenAmount = round2(amount);

    if (Math.abs(expectedAmount - givenAmount) > 0.01) {
      throw new Error(
        `${amountField} does not match ${percentageField}. Expected ${expectedAmount}`,
      );
    }

    return {
      amount: givenAmount,
      percentage: round2(percentage),
    };
  }

  // Vendor passed only percentage.
  // Calculate amount.
  if (percentage !== null) {
    return {
      percentage: round2(percentage),
      amount: round2((baseAmount * percentage) / 100),
    };
  }

  // Vendor passed only amount.
  // Calculate percentage.
  if (amount !== null) {
    return {
      amount: round2(amount),
      percentage: round2((amount / baseAmount) * 100),
    };
  }

  return {
    amount: 0,
    percentage: 0,
  };
};

router.post("/v1/carepay-lb", verifyApiKey, async (req, res) => {
  let conn;

  try {
    const data = req.body || {};

    const lenderType = String(req.partner?.name || "")
      .toLowerCase()
      .trim();

    if (!isCarePayPartner(req)) {
      return res.status(403).json({
        message: "This route is only for CarePay partner.",
      });
    }

    if (!data.loan_type) {
      return res.status(400).json({
        message: "Missing fields: loan_type",
      });
    }

    const normalizedLoanType = String(data.loan_type).toLowerCase().trim();

    const loanType = CarepayLoanTypes.find(
      (type) => type.toLowerCase() === normalizedLoanType,
    );

    if (!loanType) {
      return res.status(400).json({
        message: `Invalid loan_type. Allowed values are: ${CarepayLoanTypes.join(", ")}`,
      });
    }

    /**
     * Do not validate these fields through CAREPAY_REQUIRED_FIELDS,
     * because vendor can send either amount or percentage.
     *
     * Example valid payloads:
     * 1. processing_fee + subvention_amount
     * 2. processing_fee_percentage + subvention_percentage
     */
    const OPTIONAL_CALCULATED_FIELDS = new Set([
      "processing_fee",
      "processing_fee_percentage",
      "subvention_amount",
      "subvention_percentage",
      "request_amount",
      "loan_amount",
    ]);

    const requiredFieldsForCarePay = CAREPAY_REQUIRED_FIELDS.filter(
      (field) => !OPTIONAL_CALCULATED_FIELDS.has(field),
    );

    const missing = getMissingFields(data, requiredFieldsForCarePay);

    if (missing.length) {
      return res.status(400).json({
        message: `Missing fields: ${missing.join(", ")}`,
      });
    }

    const rawRequestAmount = isProvided(data.request_amount)
      ? data.request_amount
      : data.loan_amount;

    if (!isProvided(rawRequestAmount)) {
      return res.status(400).json({
        message: "Missing fields: request_amount",
      });
    }

    const requestAmount = Number(rawRequestAmount);

    if (!Number.isFinite(requestAmount) || requestAmount <= 0) {
      return res.status(400).json({
        message: "Invalid request_amount",
      });
    }

    const hasSubventionPercentage = isProvided(data.subvention_percentage);
    const hasSubventionAmount = isProvided(data.subvention_amount);

    if (!hasSubventionPercentage && !hasSubventionAmount) {
      return res.status(400).json({
        status: "Failed",
        message: "Missing fields: subvention_percentage or subvention_amount",
      });
    }

    const hasProcessingFeePercentage = isProvided(
      data.processing_fee_percentage,
    );
    const hasProcessingFee = isProvided(data.processing_fee);

    if (!hasProcessingFeePercentage && !hasProcessingFee) {
      return res.status(400).json({
        status: "Failed",
        message: "Missing fields: processing_fee_percentage or processing_fee",
      });
    }

    let subvention;
    let processingFee;

    try {
      subvention = calculateAmountPercentagePair({
        baseAmount: requestAmount,
        amountValue: data.subvention_amount,
        percentageValue: data.subvention_percentage,
        amountField: "subvention_amount",
        percentageField: "subvention_percentage",
      });

      processingFee = calculateAmountPercentagePair({
        baseAmount: requestAmount,
        amountValue: data.processing_fee,
        percentageValue: data.processing_fee_percentage,
        amountField: "processing_fee",
        percentageField: "processing_fee_percentage",
      });
    } catch (calculationError) {
      return res.status(400).json({
        status: "Failed",
        message: calculationError.message,
      });
    }

    const netDisbursement = round2(
      requestAmount - processingFee.amount - subvention.amount,
    );

    if (netDisbursement < 0) {
      return res.status(400).json({
        status: "Failed",
        message:
          "Invalid net_disbursement. Processing fee and subvention amount cannot exceed loan amount.",
      });
    }

    conn = await db.promise().getConnection();
    await conn.beginTransaction();

    const hospitalLan = String(data.hospital_lan || "").trim();

    const [hospitalRows] = await conn.query(
      `SELECT lan
       FROM carepay_hospital_booking
       WHERE lan = ?
         AND status IN ('APPROVED')
       LIMIT 1`,
      [hospitalLan],
    );

    if (!hospitalRows.length) {
      await conn.rollback();
      conn.release();
      conn = null;

      return res.status(404).json({
        status: "Failed",
        message: "Hospital not found or not approved for CarePay booking.",
      });
    }

    const [existing] = await conn.query(
      `SELECT lan, partner_loan_id, customer_name
       FROM loan_booking_carepay
       WHERE partner_loan_id = ?`,
      [data.partner_loan_id],
    );

    if (existing.length > 0) {
      await conn.rollback();
      conn.release();
      conn = null;

      return res.status(400).json({
        status: "Failed",
        message: "Duplicate Partner Loan ID",
        existingLan: existing[0].lan,
      });
    }

    const [panRecords] = await conn.query(
      `SELECT status
       FROM loan_booking_carepay
       WHERE pan_number = ?`,
      [data.pan_number],
    );

    const allowedStatuses = new Set([
      "cancelled",
      "foreclosed",
      "fully paid",
      "rejected",
    ]);

    if (
      panRecords.some(
        (row) =>
          !allowedStatuses.has(
            String(row.status || "")
              .trim()
              .toLowerCase(),
          ),
      )
    ) {
      await conn.rollback();
      conn.release();
      conn = null;

      return res.status(400).json({
        status: "Failed",
        message:
          "PAN already exists with an active loan. New loan not allowed.",
      });
    }

    const partnerName = "CAREPAY";
    const today = new Date();
    const { month, year } = getMonthYear(today);

    const partner = await partnerLimitService.getOrCreatePartner(
      conn,
      partnerName,
    );

    // const limitCheck = await partnerLimitService.validatePartnerBookingLimit(
    //   conn,
    //   partner.partner_id,
    //   requestAmount,
    //   month,
    //   year,
    // );

    // if (!limitCheck.valid) {
    //   await conn.rollback();
    //   conn.release();
    //   conn = null;

    //   return res.status(403).json({
    //     message: "Monthly partner limit exceeded",
    //     remaining_limit: limitCheck.remaining,
    //     required: requestAmount,
    //   });
    // }

    const { lan } = await generateLoanIdentifiers(lenderType);

    const customer_name = `${data.first_name || ""} ${
      data.last_name || ""
    }`.trim();

    const agreement_date = data.login_date;

    const permanentAddress = data.permanent_address || data.current_address;
    const permanentVillageCity =
      data.permanent_village_city || data.current_village_city;
    const permanentDistrict = data.permanent_district || data.current_district;
    const permanentState = data.permanent_state || data.current_state;
    const permanentPincode = data.permanent_pincode || data.current_pincode;

    const fields = {
      lan,
      partner_loan_id: data.partner_loan_id,
      hospital_lan: hospitalLan,
      login_date: data.login_date,

      first_name: data.first_name,
      middle_name: nullableString(data.middle_name),
      last_name: data.last_name,
      customer_name,

      gender: data.gender,
      dob: data.dob,
      age: data.age || null,

      father_name: nullableString(data.father_name),
      mother_name: nullableString(data.mother_name),

      mobile_number: data.mobile_number,
      email_id: nullableString(data.email_id),

      pan_number: data.pan_number,
      aadhar_number: data.aadhar_number,

      current_address: data.current_address,
      current_village_city: data.current_village_city,
      current_district: data.current_district,
      current_state: data.current_state,
      current_pincode: data.current_pincode,

      permanent_address: permanentAddress,
      permanent_village_city: permanentVillageCity,
      permanent_district: permanentDistrict,
      permanent_state: permanentState,
      permanent_pincode: permanentPincode,

      request_amount: requestAmount,
      loan_amount: requestAmount,

      interest_rate: data.interest_rate || 0,

      processing_fee_percentage: processingFee.percentage,
      processing_fee: processingFee.amount,

      subvention_percentage: subvention.percentage,
      subvention_amount: subvention.amount,

      loan_tenure: data.loan_tenure,
      emi_amount: data.emi_amount || null,
      cibil_score: data.cibil_score || null,

      product: data.loan_type,
      lender: "CAREPAY",

      net_disbursement: netDisbursement,

      employment: data.employment,
      customer_type: data.customer_type,
      annual_income: data.annual_income,

      patient_name: nullableString(data.patient_name),
      insurance_company_name: nullableString(data.insurance_company_name),
      insurance_policy_holder_name: nullableString(
        data.insurance_policy_holder_name,
      ),
      insurance_policy_number: nullableString(data.insurance_policy_number),
      relation_with_policy_holder: nullableString(
        data.relation_with_policy_holder,
      ),

      status: "Login",
      agreement_date,
    };

    const columns = Object.keys(fields).join(", ");
    const placeholders = Object.keys(fields)
      .map(() => "?")
      .join(", ");
    const values = Object.values(fields);

    await conn.query(
      `INSERT INTO loan_booking_carepay (${columns}) VALUES (${placeholders})`,
      values,
    );

    // await partnerLimitService.updateBookedLimit(
    //   conn,
    //   limitCheck.limitId,
    //   requestAmount,
    //   lan,
    // );

    await conn.commit();
    conn.release();
    conn = null;

    const bureauResult = await persistCarePayBureauResult(lan, {
      ...data,
      loan_amount: requestAmount,
      request_amount: requestAmount,

      processing_fee_percentage: processingFee.percentage,
      processing_fee: processingFee.amount,

      subvention_percentage: subvention.percentage,
      subvention_amount: subvention.amount,

      net_disbursement: netDisbursement,
    });

    return res.json({
      message: "CAREPAY loan saved successfully.",
      lan,
      hospital_lan: hospitalLan,

      request_amount: requestAmount,
      loan_amount: requestAmount,

      processing_fee_percentage: processingFee.percentage,
      processing_fee: processingFee.amount,

      subvention_percentage: subvention.percentage,
      subvention_amount: subvention.amount,

      net_disbursement: netDisbursement,

      cibilScore: bureauResult.score || "Not Found",
      bureauStatus: bureauResult.success ? "VERIFIED" : "FAILED",
    });
  } catch (error) {
    if (conn) {
      await conn.rollback();
      conn.release();
    }

    console.error("CarePay onboarding error:", error);

    return res.status(error.statusCode || 500).json({
      message: "Upload failed. Please try again.",
      error: error.sqlMessage || error.message,
    });
  }
});

async function fetchSterlionCaseStatus({ lan, partnerLoanId }) {
  const whereClause = lan ? "lan = ?" : "partner_loan_id = ?";
  const value = lan || partnerLoanId;

  const [rows] = await db.promise().query(
    `SELECT
       lan,
       partner_loan_id,
       customer_name,
       business_name,
       status,
       stage,
       request_amount,
       loan_amount,
       sterlion_bre_status,
       sterlion_bre_reason,
       cibil_score_fintree,
       estimated_emi,
       foir_percentage
     FROM loan_booking_sterlion
     WHERE ${whereClause}
     LIMIT 1`,
    [value],
  );

  return rows[0] || null;
}

function buildSterlionStatusResponse(row) {
  const parsedCreditLimit = Number(row.loan_amount);
  const creditLimit =
    row.loan_amount === null ||
    row.loan_amount === undefined ||
    row.loan_amount === "" ||
    !Number.isFinite(parsedCreditLimit)
      ? null
      : parsedCreditLimit;

  return {
    lan: row.lan,
    partner_loan_id: row.partner_loan_id,
    customer_name: row.customer_name,
    business_name: row.business_name,
    status: row.status,
    stage: row.stage,
    request_amount: row.request_amount,
    loan_amount: creditLimit,
    credit_limit: creditLimit,
    limit_available: creditLimit !== null,
    bre_status: row.sterlion_bre_status,
    bre_reason: row.sterlion_bre_reason,
    cibil_score: row.cibil_score_fintree,
    estimated_emi: row.estimated_emi,
    foir_percentage: row.foir_percentage,
  };
}

async function persistSterlionBureauAndBre(lan, data) {
  let bureauResult = {
    success: false,
    score: null,
    response: null,
  };

  try {
    bureauResult = await runBureau(data);
    const score = bureauResult.score ?? null;
    const report = bureauResult.response ?? null;

    if (report) {
      await db.promise().query(
        `INSERT INTO loan_cibil_reports (lan, pan_number, score, report_xml, created_at)
         VALUES (?, ?, ?, ?, NOW())`,
        [lan, data.pan_number, score, report],
      );
    }

    if (score !== null) {
      await db
        .promise()
        .execute(
          "UPDATE loan_booking_sterlion SET cibil_score_fintree = ? WHERE lan = ?",
          [score, lan],
        );
    }

    try {
      await db
        .promise()
        .query("INSERT IGNORE INTO kyc_verification_status (lan) VALUES (?)", [
          lan,
        ]);

      await db.promise().query(
        `UPDATE kyc_verification_status
         SET bureau_status = ?, bureau_api_response = ?
         WHERE lan = ?`,
        [bureauResult.success ? "VERIFIED" : "FAILED", report, lan],
      );
    } catch (kycErr) {
      console.error(
        "Sterlion KYC bureau status update failed:",
        kycErr.message,
      );
    }
  } catch (err) {
    console.error("Sterlion bureau hard pull failed:", err.message);

    try {
      await db
        .promise()
        .query("INSERT IGNORE INTO kyc_verification_status (lan) VALUES (?)", [
          lan,
        ]);
      await db.promise().query(
        `UPDATE kyc_verification_status
         SET bureau_status = 'FAILED', bureau_api_response = ?
         WHERE lan = ?`,
        [err.message, lan],
      );
    } catch (kycErr) {
      console.error(
        "Sterlion failed bureau status update failed:",
        kycErr.message,
      );
    }
  }

  let breResult = null;

  try {
    breResult = await runSterlionBre(lan, bureauResult.score ?? null);
  } catch (breErr) {
    console.error("Sterlion BRE failed:", breErr.message);
  }

  return {
    bureauResult,
    breResult,
  };
}

router.get("/v1/sterlion-case-status", verifyApiKey, async (req, res) => {
  try {
    if (!isSterlionPartner(req)) {
      return res
        .status(403)
        .json({ message: "This route is only for Sterlion partner." });
    }

    const lan = String(req.query.lan || "").trim();
    const partnerLoanId = String(req.query.partner_loan_id || "").trim();

    if (!lan && !partnerLoanId) {
      return res.status(400).json({
        message: "lan or partner_loan_id is required.",
      });
    }

    const row = await fetchSterlionCaseStatus({
      lan: lan || null,
      partnerLoanId: partnerLoanId || null,
    });

    if (!row) {
      return res.status(404).json({ message: "Sterlion case not found." });
    }

    return res.status(200).json({
      message: "Sterlion case status fetched successfully.",
      data: buildSterlionStatusResponse(row),
    });
  } catch (error) {
    console.error("Sterlion case status fetch error:", error);

    return res.status(500).json({
      message: "Failed to fetch Sterlion case status.",
      error: error.sqlMessage || error.message,
    });
  }
});

router.post("/v1/sterlion-lb", verifyApiKey, async (req, res) => {
  let conn;

  try {
    const data = req.body || {};
    const lenderType = String(req.partner?.name || "")
      .toLowerCase()
      .trim();

    if (!isSterlionPartner(req)) {
      return res.status(403).json({
        message: "This route is only for Sterlion partner.",
      });
    }

    const missing = getMissingFields(data, STERLION_REQUIRED_FIELDS);
    const currentVillageCity = nullableString(
      data.current_village_city || data.current_city,
    );
    const businessCity = nullableString(
      data.business_city || data.business_village_city,
    );

    if (!currentVillageCity) {
      missing.push("current_city");
    }

    if (!businessCity) {
      missing.push("business_city");
    }

    if (missing.length) {
      return res.status(400).json({
        message: `Missing fields: ${missing.join(", ")}`,
      });
    }

    const rawRequestAmount = isProvided(data.request_amount)
      ? data.request_amount
      : data.loan_amount;
    const requestAmount = Number(rawRequestAmount);

    if (!Number.isFinite(requestAmount) || requestAmount <= 0) {
      return res.status(400).json({
        message: "Invalid request_amount",
      });
    }

    const loanTenure = Number(data.loan_tenure);
    if (!Number.isInteger(loanTenure) || loanTenure <= 0) {
      return res.status(400).json({
        message: "Invalid loan_tenure",
      });
    }

    const annualIncome = Number(data.annual_income);
    if (!Number.isFinite(annualIncome) || annualIncome <= 0) {
      return res.status(400).json({
        message: "Invalid annual_income",
      });
    }

    const businessVintageMonths = Number(data.business_vintage_months);
    if (!Number.isFinite(businessVintageMonths) || businessVintageMonths < 0) {
      return res.status(400).json({
        message: "Invalid business_vintage_months",
      });
    }

    const monthlyIncome = isProvided(data.monthly_income)
      ? Number(data.monthly_income)
      : round2(annualIncome / 12);

    if (!Number.isFinite(monthlyIncome) || monthlyIncome <= 0) {
      return res.status(400).json({
        message: "Invalid monthly_income",
      });
    }

    const monthlyObligation = isProvided(data.monthly_obligation)
      ? Number(data.monthly_obligation)
      : 0;

    if (!Number.isFinite(monthlyObligation) || monthlyObligation < 0) {
      return res.status(400).json({
        message: "Invalid monthly_obligation",
      });
    }

    const interestRate = isProvided(data.interest_rate)
      ? Number(data.interest_rate)
      : 24;

    if (!Number.isFinite(interestRate) || interestRate < 0) {
      return res.status(400).json({
        message: "Invalid interest_rate",
      });
    }

    const businessTurnover = isProvided(data.business_turnover)
      ? Number(data.business_turnover)
      : null;

    if (
      businessTurnover !== null &&
      (!Number.isFinite(businessTurnover) || businessTurnover < 0)
    ) {
      return res.status(400).json({
        message: "Invalid business_turnover",
      });
    }

    let processingFee;

    try {
      processingFee = calculateAmountPercentagePair({
        baseAmount: requestAmount,
        amountValue: data.processing_fee,
        percentageValue: data.processing_fee_percentage,
        amountField: "processing_fee",
        percentageField: "processing_fee_percentage",
      });
    } catch (calculationError) {
      return res.status(400).json({
        status: "Failed",
        message: calculationError.message,
      });
    }

    const netDisbursement = round2(requestAmount - processingFee.amount);

    if (netDisbursement < 0) {
      return res.status(400).json({
        status: "Failed",
        message:
          "Invalid net_disbursement. Processing fee cannot exceed request amount.",
      });
    }

    conn = await db.promise().getConnection();
    await conn.beginTransaction();

    const [existing] = await conn.query(
      `SELECT lan, partner_loan_id, customer_name
       FROM loan_booking_sterlion
       WHERE partner_loan_id = ?`,
      [data.partner_loan_id],
    );

    if (existing.length > 0) {
      await conn.rollback();
      conn.release();
      conn = null;

      return res.status(400).json({
        status: "Failed",
        message: "Duplicate Partner Loan ID",
        existingLan: existing[0].lan,
      });
    }

    const [panRecords] = await conn.query(
      `SELECT status
       FROM loan_booking_sterlion
       WHERE pan_number = ?`,
      [data.pan_number],
    );

    const allowedStatuses = new Set([
      "cancelled",
      "foreclosed",
      "fully paid",
      "rejected",
    ]);

    if (
      panRecords.some(
        (row) =>
          !allowedStatuses.has(
            String(row.status || "")
              .trim()
              .toLowerCase(),
          ),
      )
    ) {
      await conn.rollback();
      conn.release();
      conn = null;

      return res.status(400).json({
        status: "Failed",
        message:
          "PAN already exists with an active loan. New loan not allowed.",
      });
    }

    const { lan } = await generateLoanIdentifiers(lenderType);
    const customer_name = `${data.first_name || ""} ${data.middle_name || ""} ${
      data.last_name || ""
    }`
      .replace(/\s+/g, " ")
      .trim();
    const product = nullableString(data.loan_type) || "Unsecured Business Loan";
    const agreement_date = data.login_date;

    const fields = {
      lan,
      partner_loan_id: data.partner_loan_id,
      login_date: data.login_date,

      first_name: data.first_name,
      middle_name: nullableString(data.middle_name),
      last_name: data.last_name,
      customer_name,

      gender: nullableString(data.gender),
      dob: data.dob,
      age: data.age || null,
      father_name: nullableString(data.father_name),
      mother_name: nullableString(data.mother_name),

      mobile_number: data.mobile_number,
      alternate_mobile_number: nullableString(data.alternate_mobile_number),
      email_id: nullableString(data.email_id),

      pan_number: data.pan_number,
      aadhar_number: nullableString(data.aadhar_number),

      current_address: data.current_address,
      current_village_city: currentVillageCity,
      current_district: nullableString(data.current_district),
      current_state: data.current_state,
      current_pincode: data.current_pincode,

      permanent_address: data.permanent_address || data.current_address,
      permanent_village_city: data.permanent_village_city || currentVillageCity,
      permanent_district:
        data.permanent_district || nullableString(data.current_district),
      permanent_state: data.permanent_state || data.current_state,
      permanent_pincode: data.permanent_pincode || data.current_pincode,

      business_name: data.business_name,
      trade_name: nullableString(data.trade_name),
      business_type: data.business_type,
      business_vintage_months: businessVintageMonths,
      business_address: data.business_address,
      business_city: businessCity,
      business_district: nullableString(data.business_district),
      business_state: data.business_state,
      business_pincode: data.business_pincode,
      gst_number: nullableString(data.gst_number),
      udyam_registration_no: nullableString(data.udyam_registration_no),
      cin: nullableString(data.cin),

      request_amount: requestAmount,
      loan_amount: null,
      interest_rate: interestRate,
      processing_fee_percentage: processingFee.percentage,
      processing_fee: processingFee.amount,
      loan_tenure: loanTenure,
      emi_amount: null,
      estimated_emi: null,

      annual_income: annualIncome,
      monthly_income: monthlyIncome,
      monthly_obligation: monthlyObligation,
      business_turnover: businessTurnover,
      foir_percentage: null,

      bank_name: nullableString(data.bank_name),
      branch_name: nullableString(data.branch_name),
      ifsc_code: nullableString(data.ifsc_code),
      account_holder_name: nullableString(data.account_holder_name),
      account_number: nullableString(data.account_number),

      product,
      lender: "STERLION",
      net_disbursement: netDisbursement,

      sterlion_bre_status: "Pending",
      sterlion_bre_reason: null,
      sterlion_bre_checked_at: null,

      status: "Login",
      stage: "Lead Received",
      agreement_date,
    };

    const columns = Object.keys(fields).join(", ");
    const placeholders = Object.keys(fields)
      .map(() => "?")
      .join(", ");
    const values = Object.values(fields);

    await conn.query(
      `INSERT INTO loan_booking_sterlion (${columns}) VALUES (${placeholders})`,
      values,
    );

    await conn.commit();
    conn.release();
    conn = null;

    const { bureauResult, breResult } = await persistSterlionBureauAndBre(lan, {
      ...data,
      current_village_city: currentVillageCity,
      current_state: data.current_state,
      current_pincode: data.current_pincode,
      loan_amount: requestAmount,
      request_amount: requestAmount,
      loan_tenure: loanTenure,
      annual_income: annualIncome,
      monthly_income: monthlyIncome,
      monthly_obligation: monthlyObligation,
      business_vintage_months: businessVintageMonths,
      processing_fee_percentage: processingFee.percentage,
      processing_fee: processingFee.amount,
      net_disbursement: netDisbursement,
    });

    return res.status(201).json({
      message: "STERLION loan lead saved successfully.",
      lan,
      partner_loan_id: data.partner_loan_id,
      request_amount: requestAmount,
      loan_amount: null,
      processing_fee_percentage: processingFee.percentage,
      processing_fee: processingFee.amount,
      net_disbursement: netDisbursement,
      cibilScore: bureauResult.score || "Not Found",
      bureauStatus: bureauResult.success ? "VERIFIED" : "FAILED",
      breStatus: breResult?.breStatus || "Pending",
      breReason: breResult?.reasonText || null,
      stage: breResult?.stage || "BRE Pending",
    });
  } catch (error) {
    if (conn) {
      await conn.rollback();
      conn.release();
    }

    console.error("Sterlion onboarding error:", error);

    return res.status(error.statusCode || 500).json({
      message: "Upload failed. Please try again.",
      error: error.sqlMessage || error.message,
    });
  }
});

//////////////////emiclub missed cibil cases temporary route////////////////

router.post("/v1/emiclub-cibil-retry", async (req, res) => {
  console.log(
    "================= ♻️ EMICLUB CIBIL RETRY START =================",
  );
  const limit = req.body.limit || 10; // default 10 at a time
  try {
    const [rows] = await db.promise().query(
      `SELECT * FROM loan_booking_loan_digit WHERE fintree_cibil_score IS NULL ORDER BY lan DESC LIMIT ?`,
      // `SELECT * FROM loan_booking_clayyo WHERE cibil_score IS NULL ORDER BY lan DESC LIMIT ?`,
      [limit],
    );

    if (!rows.length) {
      return res.json({
        message: "✅ No pending records with NULL CIBIL found.",
      });
    }

    console.log(`🔍 Found ${rows.length} pending cases.`);

    const stateCodes = {
      "JAMMU and KASHMIR": "01",
      "HIMACHAL PRADESH": "02",
      PUNJAB: "03",
      CHANDIGARH: "04",
      UTTRANCHAL: "05",
      HARAYANA: "06",
      DELHI: "07",
      RAJASTHAN: "08",
      "UTTAR PRADESH": "09",
      BIHAR: "10",
      SIKKIM: "11",
      "ARUNACHAL PRADESH": "12",
      NAGALAND: "13",
      MANIPUR: "14",
      MIZORAM: "15",
      TRIPURA: "16",
      MEGHALAYA: "17",
      ASSAM: "18",
      "WEST BENGAL": "19",
      JHARKHAND: "20",
      ORRISA: "21",
      CHHATTISGARH: "22",
      "MADHYA PRADESH": "23",
      GUJRAT: "24",
      "DAMAN and DIU": "25",
      "DADARA and NAGAR HAVELI": "26",
      MAHARASHTRA: "27",
      "ANDHRA PRADESH": "28",
      KARNATAKA: "29",
      GOA: "30",
      LAKSHADWEEP: "31",
      KERALA: "32",
      "TAMIL NADU": "33",
      PONDICHERRY: "34",
      "ANDAMAN and NICOBAR ISLANDS": "35",
      TELANGANA: "36",
    };

    const results = [];

    for (const row of rows) {
      const {
        lan,
        first_name,
        last_name,
        gender,
        dob,
        pan_number,
        loan_amount,
        loan_tenure,
        mobile_number,
        current_address,
        current_village_city,
        current_state,
        current_pincode,
        monthly_salary,
      } = row;

      console.log(`\n🚀 Processing LAN: ${lan} (PAN: ${pan_number})`);

      const state = current_state || "MAHARASHTRA";
      console.log("state", state);
      const state_code = stateCodes[state.toUpperCase()] ?? null;
      console.log("state code", state_code);
      const gender_code = (gender ?? "Male").toLowerCase() === "female" ? 2 : 1;
      // --- Normalize and validate DOB ---
      let dobFormatted = null;
      if (dob) {
        if (dob instanceof Date) {
          // Convert Date object to YYYYMMDD
          const yyyy = dob.getFullYear();
          const mm = String(dob.getMonth() + 1).padStart(2, "0");
          const dd = String(dob.getDate()).padStart(2, "0");
          dobFormatted = `${yyyy}${mm}${dd}`;
        } else if (typeof dob === "string") {
          // Clean string and remove hyphens
          dobFormatted = dob.replace(/[^0-9]/g, "");
        } else {
          console.warn(`⚠️ Invalid DOB format for LAN ${lan}:`, dob);
        }
      }

      if (!dobFormatted || dobFormatted.length !== 8) {
        console.warn(`⚠️ Skipping LAN ${lan}: Invalid or missing DOB.`);
        results.push({
          lan,
          pan_number,
          status: "skipped",
          reason: "Invalid or missing DOB",
        });
        continue; // move to next case
      }

      //       const soapBody = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:urn="urn:cbv2">
      //    <soapenv:Header/>
      //    <soapenv:Body>
      //       <urn:process>
      //          <urn:in>
      //             <INProfileRequest>
      //               <Identification>
      //                 <XMLUser>${process.env.EXPERIAN_USER}</XMLUser>
      //                 <XMLPassword>${process.env.EXPERIAN_PASSWORD}</XMLPassword>
      //               </Identification>
      //               <Application>
      //                 <FTReferenceNumber>${String(lan).replace(/\D/g, '').slice(-6)}</FTReferenceNumber>
      //                 <EnquiryReason>13</EnquiryReason>
      //                 <FinancePurpose>99</FinancePurpose>
      //                 <AmountFinanced>${loan_amount}</AmountFinanced>
      //                 <DurationOfAgreement>${loan_tenure}</DurationOfAgreement>
      //                 <ScoreFlag>3</ScoreFlag>
      //                 <PSVFlag>0</PSVFlag>
      //               </Application>
      //               <Applicant>
      //                 <Surname>${(last_name || "").toUpperCase()}</Surname>
      //                 <FirstName>${(first_name || "").toUpperCase()}</FirstName>
      //                 <GenderCode>${gender_code}</GenderCode>
      //                 <IncomeTaxPAN>${pan_number}</IncomeTaxPAN>
      //                 <DateOfBirth>${dobFormatted}</DateOfBirth>
      //                 <PhoneNumber>${mobile_number}</PhoneNumber>
      //               </Applicant>
      //               <Address>
      //                 <FlatNoPlotNoHouseNo>${current_address}</FlatNoPlotNoHouseNo>
      //                 <City>${current_village_city}</City>
      //                 <State>${state_code}</State>
      //                 <PinCode>${current_pincode}</PinCode>
      //               </Address>
      //             </INProfileRequest>
      //          </urn:in>
      //       </urn:process>
      //    </soapenv:Body>
      // </soapenv:Envelope>`;

      const soapBody = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:urn="urn:cbv2">
<soapenv:Header/>
<soapenv:Body>
  <urn:process>
    <urn:in>
      <INProfileRequest>
        <Identification>
          <XMLUser>${process.env.EXPERIAN_USER}</XMLUser>
          <XMLPassword>${process.env.EXPERIAN_PASSWORD}</XMLPassword>
        </Identification>
        <Application>
          <FTReferenceNumber>${String(lan).replace(/\D/g, "").slice(-6)}</FTReferenceNumber>
          <CustomerReferenceID/>
          <EnquiryReason>13</EnquiryReason>
          <FinancePurpose>99</FinancePurpose>
          <AmountFinanced>${loan_amount}</AmountFinanced>
          <DurationOfAgreement>${loan_tenure}</DurationOfAgreement>
          <ScoreFlag>3</ScoreFlag>
          <PSVFlag>0</PSVFlag>
        </Application>
        <Applicant>
          <Surname>${(last_name || "").toUpperCase()}</Surname>
          <FirstName>${(first_name || "").toUpperCase()}</FirstName>
          <MiddleName1>${middle_name ? middle_name.toUpperCase() : ""}</MiddleName1>
          <MiddleName2/>
          <MiddleName3/>
          <GenderCode>${gender_code}</GenderCode>
          <IncomeTaxPAN>${pan_number}</IncomeTaxPAN>
          <PANIssueDate/>
          <PANExpirationDate/>
          <PassportNumber/>
          <PassportIssueDate/>
          <PassportExpirationDate/>
          <VoterIdentityCard/>
          <VoterIDIssueDate/>
          <VoterIDExpirationDate/>
          <DriverLicenseNumber/>
          <DriverLicenseIssueDate/>
          <DriverLicenseExpirationDate/>
          <RationCardNumber/>
          <RationCardIssueDate/>
          <RationCardExpirationDate/>
          <UniversalIDNumber/>
          <UniversalIDIssueDate/>
          <UniversalIDExpirationDate/>
          <DateOfBirth>${dobFormatted}</DateOfBirth>
          <STDPhoneNumber/>
          <PhoneNumber/>
          <TelephoneExtension/>
          <TelephoneType/>
          <MobilePhone>${mobile_number}</MobilePhone>
          <EMailId/>
        </Applicant>
        <Details>
          <Income>${monthly_salary}</Income>
          <MaritalStatus/>
          <EmployStatus/>
          <TimeWithEmploy/>
          <NumberOfMajorCreditCardHeld/>
        </Details>
        <Address>
          <FlatNoPlotNoHouseNo>${current_address}</FlatNoPlotNoHouseNo>
          <BldgNoSocietyName/>
          <RoadNoNameAreaLocality/>
          <City>${current_village_city}</City>
          <Landmark/>
          <State>${state_code}</State>
          <PinCode>${current_pincode}</PinCode>
        </Address>
        <AdditionalAddressFlag>
          <Flag>N</Flag>
        </AdditionalAddressFlag>
        <AdditionalAddress>
          <FlatNoPlotNoHouseNo/>
          <BldgNoSocietyName/>
          <RoadNoNameAreaLocality/>
          <City/>
          <Landmark/>
          <State/>
          <PinCode/>
        </AdditionalAddress>
      </INProfileRequest>
    </urn:in>
  </urn:process>
</soapenv:Body>
</soapenv:Envelope>`;

      try {
        const response = await axios.post(process.env.EXPERIAN_URL, soapBody, {
          headers: {
            "Content-Type": "text/xml; charset=utf-8",
            SOAPAction: "urn:cbv2/process",
          },
          timeout: 30000,
          validateStatus: () => true,
        });

        if (response.status !== 200) {
          throw new Error(`HTTP ${response.status}`);
        }

        const parser = new XMLParser({
          ignoreAttributes: false,
          attributeNamePrefix: "",
          trimValues: true,

          // Keep entity processing enabled, but raise limits for valid large bureau XML.
          processEntities: {
            enabled: true,
            maxTotalExpansions: 500000,
            maxExpandedLength: 20_000_000,
            maxEntityCount: 200000,
            maxEntitySize: 200000,
          },
        });
        const parsed = parser.parse(response.data);
        const encodedInnerXml =
          parsed["SOAP-ENV:Envelope"]?.["SOAP-ENV:Body"]?.[
            "ns2:processResponse"
          ]?.["ns2:out"];

        if (!encodedInnerXml) throw new Error("Missing ns2:out in response");

        const decoded = he.decode(encodedInnerXml);
        const innerParsed = parser.parse(decoded);
        const scoreStr =
          innerParsed?.INProfileResponse?.SCORE?.BureauScore ?? null;
        const score = scoreStr ? Number(scoreStr) : null;

        await db.promise().query(
          `INSERT INTO loan_cibil_reports (lan, pan_number, score, report_xml, created_at)
             VALUES (?,?,?,?,NOW())`,
          [lan, pan_number, score, decoded],
        );

        await db.promise().query(
          `INSERT INTO kyc_verification_status (lan, bureau_status, bureau_api_response)
   VALUES (?, 'VERIFIED', ?)
   ON DUPLICATE KEY UPDATE bureau_status='VERIFIED', bureau_api_response=VALUES(bureau_api_response)`,
          [lan, decoded],
        );

        await db.promise().execute(
          `UPDATE loan_booking_loan_digit SET fintree_cibil_score = ? WHERE lan = ?`,
          // `UPDATE loan_booking_clayyo SET cibil_score = ? WHERE lan = ?`,
          [score, lan],
        );

        console.log(`✅ CIBIL fetched for ${lan} → Score: ${score}`);
        results.push({ lan, pan_number, score, status: "success" });
      } catch (err) {
        console.error(`⚠️ Error for ${lan}:`, err.message);
        results.push({ lan, pan_number, error: err.message, status: "failed" });
      }
    }

    console.log(
      "================= ♻️ EMICLUB CIBIL RETRY END =================",
    );
    return res.json({
      message: "Retry process completed.",
      processed: results.length,
      results,
    });
  } catch (err) {
    console.error("❌ Fatal error in retry route:", err.message);
    res.status(500).json({
      message: "CIBIL retry failed.",
      error: err.message,
    });
  }
});

///   Loan Booking Loan Digit  Pratik ////

router.post("/v1/loan-digit", async (req, res) => {
  try {
    const data = req.body;

    // ✅ Partner validation
    // if (req.partner.name !== "loan digit") {
    //   return res.status(403).json({
    //     status: "Failed",
    //     message: "Unauthorized partner",
    //   });
    // }

    // ✅ Required fields
    const requiredFields = [
      "login_date",
      "partner_loan_id",
      "first_name",
      "last_name",
      "mobile_number",
      "pan_number",
      "dob",
      "gender",
      "current_address",
      "current_village_city",
      "current_district",
      "current_state",
      "current_pincode",
      "permanent_address",
      "permanent_state",
      "permanent_pincode",
      "employment",
      "mode_of_salary",
      "monthly_salary",
      "current_emi",
      "marital_status",
      "residential_status",
      "company_name",
      "company_address",
      "loan_amount",
      "loan_tenure",
    ];

    for (const field of requiredFields) {
      if (
        data[field] === undefined ||
        data[field] === null ||
        data[field] === ""
      ) {
        return res.status(400).json({
          status: "Failed",
          message: `${field} is required`,
        });
      }
    }

    // ✅ Duplicate check (partner loan id)
    const [existing] = await db
      .promise()
      .query(
        `SELECT lan FROM loan_booking_loan_digit WHERE partner_loan_id = ?`,
        [data.partner_loan_id],
      );

    if (existing.length > 0) {
      return res.status(400).json({
        status: "Failed",
        message: "Duplicate partner_loan_id",
        lan: existing[0].lan,
      });
    }

    // ✅ PAN duplicate check
    const [panRecords] = await db
      .promise()
      .query(
        `SELECT status FROM loan_booking_loan_digit WHERE pan_number = ?`,
        [data.pan_number],
      );

    const allowedStatuses = ["cancelled", "rejected", "foreclosed"];

    const hasActiveLoan = panRecords.some(
      (r) => !allowedStatuses.includes((r.status || "").toLowerCase()),
    );

    if (hasActiveLoan) {
      return res.status(400).json({
        status: "Failed",
        message: "Active loan already exists for this PAN",
      });
    }

    // ✅ Generate LAN
    const { lan } = await generateLoanIdentifiers("loan_digit");

    const customer_name = `${data.first_name} ${data.last_name}`;

    // ✅ Insert (SAFE METHOD)
    const payload = {
      lan,
      partner_loan_id: data.partner_loan_id,
      login_date: data.login_date,

      first_name: data.first_name,
      middle_name: data.middle_name || null,
      last_name: data.last_name,
      customer_name,

      mobile_number: data.mobile_number,
      pan_number: data.pan_number,
      dob: data.dob,
      gender: data.gender,

      current_address: data.current_address,
      current_village_city: data.current_village_city,
      current_district: data.current_district,
      current_state: data.current_state,
      current_pincode: data.current_pincode,

      permanent_address: data.permanent_address,
      permanent_state: data.permanent_state,
      permanent_pincode: data.permanent_pincode,

      employment: data.employment,
      mode_of_salary: data.mode_of_salary,
      monthly_salary: data.monthly_salary,
      current_emi: data.current_emi,
      marital_status: data.marital_status,
      residential_status: data.residential_status,

      company_name: data.company_name,
      company_address: data.company_address,

      loan_amount: data.loan_amount,
      loan_tenure: data.loan_tenure,

      lender: "Loan Digit",
      product: "Bullet Loan",
      loan_type: "Insurance Loan",
      status: "Login",
      agreement_date: data.login_date,
    };

    await db
      .promise()
      .query(`INSERT INTO loan_booking_loan_digit SET ?`, payload);

    // ✅ Response (FAST)
    return res.status(200).json({
      status: "Success",
      message: "Loan saved successfully",
      lan,
    });
  } catch (error) {
    console.error("API Error:", error);
    return res.status(500).json({
      status: "Failed",
      message: "Internal server error",
    });
  }
});

////////////////////////////////////////////////////////////////////////////
///////////////////////    SUPPLY CHAIN  NEW /////////////////

//////////////// Supply Chain New Customer & Sanction Start //////////////////////

router.post("/v1/supply-chain", verifyApiKey, async (req, res) => {
  try {
    console.log("📦 SUPPLY CHAIN LOAN REQUEST START");

    if (
      !req.partner ||
      (req.partner.name || "").toLowerCase().trim() !== "supplychain"
    ) {
      return res.status(403).json({
        message: "This route is only for Supply Chain partner",
      });
    }

    const data = req.body;

    /* ---------- Validate ---------- */
    const requiredFields = [
      "partner_loan_id",
      "applicant.name",
      "applicant.pan",
      "applicant.aadhaar",
      "applicant.mobile",
      "applicant.address",
      "company.name",
      "company.pan",
      "company.gst",
      "company.address",
      "sanctions",
    ];

    for (const field of requiredFields) {
      const value = field.split(".").reduce((o, i) => o?.[i], data);
      if (value === undefined || value === null || value === "") {
        return res.status(400).json({ message: `${field} is required` });
      }
    }

    if (!Array.isArray(data.sanctions) || data.sanctions.length === 0) {
      return res.status(400).json({
        message: "At least one lender sanction is required",
      });
    }

    /* ---------- Insert MASTER (once) ---------- */
    const [existing] = await db
      .promise()
      .query(`SELECT id FROM supply_chain_loans WHERE partner_loan_id = ?`, [
        data.partner_loan_id,
      ]);

    if (existing.length === 0) {
      await db.promise().query(
        `INSERT INTO supply_chain_loans (
          partner_loan_id,
          applicant_name, applicant_pan, applicant_aadhaar, applicant_mobile, applicant_address,
          co_applicant_name, co_applicant_pan, co_applicant_aadhaar, co_applicant_mobile, co_applicant_address,
          company_name, company_pan, gst_number, company_address,
          status
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          data.partner_loan_id,

          data.applicant.name,
          data.applicant.pan,
          data.applicant.aadhaar,
          data.applicant.mobile,
          data.applicant.address,

          data.co_applicant?.name || null,
          data.co_applicant?.pan || null,
          data.co_applicant?.aadhaar || null,
          data.co_applicant?.mobile || null,
          data.co_applicant?.address || null,

          data.company.name,
          data.company.pan,
          data.company.gst,
          data.company.address,

          "Login",
        ],
      );
    }

    /* ---------- Insert SANCTIONS ---------- */
    const created = [];

    for (const s of data.sanctions) {
      const sanctionFields = [
        "lan",
        "lender",
        "sanction_amount",
        "tenure_months",
        "interest_rate",
        "penal_rate",
        "processing_fee",
      ];

      for (const f of sanctionFields) {
        if (s[f] === undefined || s[f] === null || s[f] === "") {
          return res.status(400).json({
            message: `Missing ${f} for lender ${s.lender}`,
          });
        }
      }

      await db.promise().query(
        `INSERT INTO supply_chain_sanctions (
          partner_loan_id, lan, lender,
          sanction_amount, tenure_months,
          interest_rate, penal_rate, processing_fee
        ) VALUES (?,?,?,?,?,?,?,?)`,
        [
          data.partner_loan_id,
          s.lan,
          s.lender,
          s.sanction_amount,
          s.tenure_months,
          s.interest_rate,
          s.penal_rate,
          s.processing_fee,
        ],
      );

      created.push({
        lender: s.lender,
        lan: s.lan,
      });
    }

    return res.json({
      message: "Supply Chain loan saved successfully",
      partner_loan_id: data.partner_loan_id,
      sanctions: created,
    });
  } catch (error) {
    console.error("❌ SUPPLY CHAIN ERROR:", error);
    return res.status(500).json({
      message: "Failed to create supply chain loan",
      error: error.message,
    });
  }
});

///////////////////////// SUPPLY CHAIN NEW Customer & Sanction END //////////////////////

///////////////////////// SUPPLY CHAIN NEW Supplier On board Start //////////////////////

router.post("/v1/supplier-onboarding", verifyApiKey, async (req, res) => {
  try {
    console.log("📦 SUPPLIER ONBOARDING REQUEST START");

    /* ---------- Partner Validation ---------- */
    if (
      !req.partner ||
      (req.partner.name || "").toLowerCase().trim() !== "supplychain"
    ) {
      return res.status(403).json({
        message: "This route is only for Supply Chain partner",
      });
    }

    const data = req.body;

    /* ---------- Basic Validation ---------- */
    if (!data.partner_loan_id) {
      return res.status(400).json({
        message: "partner_loan_id is required",
      });
    }

    if (!Array.isArray(data.suppliers) || data.suppliers.length === 0) {
      return res.status(400).json({
        message: "At least one supplier is required",
      });
    }

    /* ---------- 🔒 CHECK: Partner Loan Must Exist ---------- */
    const [loanExists] = await db.promise().query(
      `SELECT id 
       FROM supply_chain_loans 
       WHERE partner_loan_id = ?`,
      [data.partner_loan_id],
    );

    if (loanExists.length === 0) {
      return res.status(400).json({
        message: "Invalid partner_loan_id. Supply Chain loan does not exist.",
      });
    }

    /* ---------- Insert Suppliers ---------- */
    const insertedSuppliers = [];

    for (const s of data.suppliers) {
      const requiredFields = [
        "supplier_name",
        "mobile_number",
        "bank_account_number",
        "ifsc_code",
        "bank_name",
        "account_holder_name",
      ];

      for (const f of requiredFields) {
        if (!s[f]) {
          return res.status(400).json({
            message: `Missing ${f} for supplier ${s.supplier_name || ""}`,
          });
        }
      }

      await db.promise().query(
        `INSERT INTO supplier_onboarding (
          partner_loan_id,
          supplier_name,
          mobile_number,
          bank_account_number,
          ifsc_code,
          bank_name,
          account_holder_name,
          status
        ) VALUES (?,?,?,?,?,?,?,?)`,
        [
          data.partner_loan_id,
          s.supplier_name,
          s.mobile_number,
          s.bank_account_number,
          s.ifsc_code,
          s.bank_name,
          s.account_holder_name,
          "Active",
        ],
      );

      insertedSuppliers.push({
        supplier_name: s.supplier_name,
        bank_account_number: s.bank_account_number,
      });
    }

    return res.json({
      message: "Suppliers onboarded successfully",
      partner_loan_id: data.partner_loan_id,
      suppliers: insertedSuppliers,
    });
  } catch (error) {
    console.error("❌ SUPPLIER ONBOARDING ERROR:", error);
    return res.status(500).json({
      message: "Failed to onboard suppliers",
      error: error.message,
    });
  }
});

///////////////////////// SUPPLY CHAIN NEW Supplier On Board END //////////////////////

///////////////////////// SUPPLY CHAIN Invoice Upload & Disbursement Start //////////////////////

// SUpply Chain Disbursment UTR ///

router.post("/v1/invoice-disbursement/validate", async (req, res) => {
  const payload = req.body;

  if (!Array.isArray(payload) || payload.length === 0) {
    return res.status(400).json({
      message: "Request body must be a non-empty array",
    });
  }

  const results = [];

  const formatDate = (d) => d.toISOString().split("T")[0];

  for (const data of payload) {
    let conn;

    try {
      /* =====================================================
         STEP 1: BASIC STRUCTURE CHECK
      ===================================================== */
      if (!data || typeof data !== "object") {
        results.push({
          invoice_number: null,
          status: "failed",
          message: "Invalid invoice payload",
        });
        continue;
      }

      /* =====================================================
         STEP 2: TENURE CHECK (FIXED = 90 DAYS)
      ===================================================== */
      const tenureDays = Number(data.tenure_days);

      /* =====================================================
         STEP 3: INVOICE DUE DATE CHECK
      ===================================================== */
      const disbDate = new Date(data.disbursement_date);

      if (isNaN(disbDate.getTime())) {
        results.push({
          invoice_number: data.invoice_number || null,
          status: "failed",
          message: "Invalid disbursement_date",
        });
        continue;
      }

      const expectedDueDate = new Date(disbDate);
      expectedDueDate.setDate(expectedDueDate.getDate() + 90);

      if (data.invoice_due_date !== formatDate(expectedDueDate)) {
        results.push({
          invoice_number: data.invoice_number || null,
          status: "failed",
          message: "Invoice due date mismatch",
          expected: formatDate(expectedDueDate),
          received: data.invoice_due_date,
        });
        continue;
      }

      /* =====================================================
         STEP 4: FETCH SANCTION (NO ROI VALIDATION)
      ===================================================== */
      const [sanctionRows] = await db.promise().query(
        `SELECT sanction_amount, utilized_sanction_limit
         FROM supply_chain_sanctions
         WHERE partner_loan_id = ?
           AND lan = ?`,
        [data.partner_loan_id, data.lan],
      );

      if (sanctionRows.length === 0) {
        results.push({
          invoice_number: data.invoice_number || null,
          status: "failed",
          message: "Sanction not found for given partner_loan_id and LAN",
        });
        continue;
      }

      /* =====================================================
         STEP 5: LOAN MASTER CHECK
      ===================================================== */
      const [loanRows] = await db.promise().query(
        `SELECT id
         FROM supply_chain_loans
         WHERE partner_loan_id = ?
           AND status = 'Login'`,
        [data.partner_loan_id],
      );

      if (loanRows.length === 0) {
        results.push({
          invoice_number: data.invoice_number || null,
          status: "failed",
          message: "Loan not found or not in Login status",
        });
        continue;
      }

      /* =====================================================
         STEP 6: BASIC NUMERIC VALIDATION
      ===================================================== */
      const invoiceAmount = Number(data.invoice_amount);
      const disbursementAmount = Number(data.disbursement_amount);

      if ([invoiceAmount, disbursementAmount].some(Number.isNaN)) {
        results.push({
          invoice_number: data.invoice_number || null,
          status: "failed",
          message: "Invalid numeric input",
        });
        continue;
      }

      if (disbursementAmount > invoiceAmount) {
        results.push({
          invoice_number: data.invoice_number || null,
          status: "failed",
          message: "Disbursement amount cannot be greater than invoice amount",
        });
        continue;
      }

      const remainingInvoiceAmount = invoiceAmount - disbursementAmount;

      /* =====================================================
         STEP 7: INSERT + SANCTION UPDATE
      ===================================================== */
      conn = await db.promise().getConnection();
      await conn.beginTransaction();

      const [existingInvoice] = await conn.query(
        `SELECT id
         FROM invoice_disbursements
         WHERE invoice_number = ?`,
        [data.invoice_number],
      );

      if (existingInvoice.length > 0) {
        throw new Error("Invoice already exists");
      }

      const [sanctionData] = await conn.query(
        `SELECT sanction_amount, utilized_sanction_limit
         FROM supply_chain_sanctions
         WHERE partner_loan_id = ?
           AND lan = ?
         FOR UPDATE`,
        [data.partner_loan_id, data.lan],
      );

      if (sanctionData.length === 0) {
        throw new Error("Sanction record not found");
      }

      const sanctionLimit = Number(sanctionData[0].sanction_amount);
      const utilized = Number(sanctionData[0].utilized_sanction_limit);

      if ([sanctionLimit, utilized].some(Number.isNaN)) {
        throw new Error("Invalid sanction numeric data");
      }

      const newUtilized = utilized + disbursementAmount;

      const newUnutilized = sanctionLimit - newUtilized;

      if (newUtilized > sanctionLimit) {
        throw new Error("Sanction limit exceeded");
      }

      console.log("[Invoice Insert] ▶ Preparing insert payload");

      console.log("[Invoice Insert] partner_loan_id:", data);
      console.log("[Invoice Insert] lan:", data.lan);
      console.log("[Invoice Insert] invoice_number:", data.invoice_number);
      console.log("[Invoice Insert] invoice_amount:", invoiceAmount);
      console.log("[Invoice Insert] disbursement_amount:", disbursementAmount);
      console.log("[Invoice Insert] roi_percentage:", data.roi_percentage);
      console.log("[Invoice Insert] roi_penal_rate:", data.roi_penal_rate);
      console.log("[Invoice Insert] service_Fee:", data.service_Fee);
      console.log("[Invoice Insert] penal_rate:", data.penal_rate);

      await conn.query(
        `INSERT INTO invoice_disbursements (
          partner_loan_id,
          lan,
          invoice_number,
          invoice_date,
          invoice_amount,
          remaining_invoice_amount,
          tenure_days,
          supplier_name,
          bank_account_number,
          ifsc_code,
          bank_name,
          account_holder_name,
          disbursement_amount,
          remaining_disbursement_amount,
          disbursement_date,
          invoice_due_date,
          disbursement_utr,
          roi_percentage,
          roi_penal_rate,
          service_charges,  
          penal_rate,
          total_roi_amount,
          emi_amount
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          data.partner_loan_id,
          data.lan,
          data.invoice_number,
          data.invoice_date,
          invoiceAmount,
          remainingInvoiceAmount,
          tenureDays,
          data.supplier_name,
          data.supplier_bank_details.bank_account_number,
          data.supplier_bank_details.ifsc_code,
          data.supplier_bank_details.bank_name,
          data.supplier_bank_details.account_holder_name,
          disbursementAmount,
          disbursementAmount,
          data.disbursement_date,
          data.invoice_due_date,
          data.disbursement_utr,
          data.roi_percentage,
          data.roi_percentage, // 👈 updated here
          data.service_fee || 0, // ✅ inserted value here
          data.penal_charges || 0,
          data.total_roi_amount,
          data.emi_amount,
        ],
      );

      await conn.query(
        `UPDATE supply_chain_sanctions
         SET utilized_sanction_limit = ?,
             unutilization_sanction_limit = ?
         WHERE partner_loan_id = ?
           AND lan = ?`,
        [newUtilized, newUnutilized, data.partner_loan_id, data.lan],
      );

      await conn.commit();
      conn.release();
      conn = null;

      setImmediate(async () => {
        try {
          await generateDemandFromInvoiceDisbursement(
            data.invoice_number,
            data.lan,
          );
        } catch (e) {
          console.error(
            `Demand generation failed for ${data.invoice_number}, LAN ${data.lan}:`,
            e,
          );
        }
      });

      results.push({
        invoice_number: data.invoice_number,
        status: "success",
        message: "Invoice validated, saved, and sanction updated successfully",
      });
    } catch (err) {
      if (conn) {
        await conn.rollback();
        conn.release();
        conn = null;
      }

      results.push({
        invoice_number: data?.invoice_number || null,
        status: "failed",
        message: err.message || "Validation failed",
      });
    }
  }

  return res.json({
    message: "Bulk invoice validation completed",
    total: payload.length,
    success_count: results.filter((x) => x.status === "success").length,
    failed_count: results.filter((x) => x.status === "failed").length,
    results,
  });
});

///////////////////////// SUPPLY CHAIN Invoice Upload & Disbursement END //////////////////////

//////////////////////// Supply chain Collection Upload API START ////////////////////////

router.post("/v1/supplychain/repayment-upload", async (req, res) => {
  try {
    console.log("💰 SUPPLY CHAIN REPAYMENT UPLOAD START");

    /* ---------- Partner Validation ---------- */
    // if (
    //   !req.partner ||
    //   (req.partner.name || "").toLowerCase().trim() !== "supplychain"
    // ) {
    //   return res.status(403).json({
    //     message: "This route is only for Supply Chain partner",
    //   });
    // }

    const data = req.body;

    /* ---------- Basic Validation ---------- */
    if (!Array.isArray(data.repayments) || data.repayments.length === 0) {
      return res.status(400).json({
        message: "At least one repayment record is required",
      });
    }

    const insertedRepayments = [];

    for (const r of data.repayments) {
      const requiredFields = [
        "lan",
        "collection_date",
        "collection_utr",
        "collection_amount",
      ];

      for (const f of requiredFields) {
        if (!r[f]) {
          return res.status(400).json({
            message: `Missing ${f} for LAN ${r.lan || ""}`,
          });
        }
      }

      /* ---------- 🔒 CHECK: LAN Must Exist ---------- */
      const [lanExists] = await db.promise().query(
        `SELECT id 
           FROM supply_chain_sanctions 
           WHERE lan = ?`,
        [r.lan],
      );

      if (lanExists.length === 0) {
        return res.status(400).json({
          message: `Invalid LAN ${r.lan}. Loan does not exist.`,
        });
      }

      /* ---------- Insert Repayment ---------- */
      await db.promise().query(
        `
          INSERT INTO supply_chain_repayments (
            lan,
            collection_date,
            collection_utr,
            collection_amount
          ) VALUES (?,?,?,?)
          `,
        [r.lan, r.collection_date, r.collection_utr, r.collection_amount],
      );

      /* ---------- 🔥 ALLOCATION CALL ---------- */
      await allocateSupplyChainRepayment(db, {
        lan: r.lan,
        collection_date: r.collection_date,
        collection_utr: r.collection_utr,
        collection_amount: r.collection_amount,
      });

      insertedRepayments.push({
        lan: r.lan,
        collection_utr: r.collection_utr,
        collection_amount: r.collection_amount,
      });
    }

    return res.json({
      message: "Repayment data uploaded successfully",
      total_records: insertedRepayments.length,
      repayments: insertedRepayments,
    });
  } catch (error) {
    console.error("❌ SUPPLY CHAIN REPAYMENT UPLOAD ERROR:", error);
    return res.status(500).json({
      message: "Failed to upload repayment data",
      error: error.message,
    });
  }
});

router.post(
  "/v1/supplychain/repayment-excel",
  upload.single("file"),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({
        message: "No file uploaded",
      });
    }

    const success_rows = [];
    const row_errors = [];
    const duplicate_utrs = new Set();
    const missing_lans = new Set();

    try {
      const workbook = xlsx.read(req.file.buffer, {
        type: "buffer",
      });

      const sheet = workbook.Sheets[workbook.SheetNames[0]];

      const rawData = xlsx.utils.sheet_to_json(sheet, {
        defval: "",
        header: 1,
      });

      const headers = rawData[0];

      const sheetData = rawData.slice(1).map((row, index) => {
        const formatted = { __row: index + 2 };

        headers.forEach((h, i) => {
          formatted[h] = row[i];
        });

        return formatted;
      });

      if (!sheetData.length) {
        return res.status(400).json({
          message: "Excel file empty",
        });
      }

      for (const row of sheetData) {
        const R = row.__row;

        try {
          const lan = String(row.lan || "").trim();
          const collection_date = excelDateToJSDate(row.collection_date);
          const collection_utr = String(row.collection_utr || "").trim();
          const collection_amount = Number(row.collection_amount);

          /* ---------- BASIC VALIDATION ---------- */

          if (
            !lan ||
            !collection_date ||
            !collection_utr ||
            Number.isNaN(collection_amount)
          ) {
            row_errors.push({
              row: R,
              stage: "validation",
              reason: "Missing required fields",
            });
            continue;
          }

          /* ---------- CHECK LAN EXISTS ---------- */

          const [lanExists] = await db.promise().query(
            `
            SELECT id
            FROM supply_chain_sanctions
            WHERE lan = ?
            `,
            [lan],
          );

          if (!lanExists.length) {
            missing_lans.add(lan);
            continue;
          }

          /* ---------- CHECK DUPLICATE UTR ---------- */

          const [utrExists] = await db.promise().query(
            `
            SELECT id
            FROM supply_chain_repayments
            WHERE collection_utr = ?
            `,
            [collection_utr],
          );

          if (utrExists.length) {
            duplicate_utrs.add(collection_utr);
            continue;
          }

          /* ---------- INSERT REPAYMENT ---------- */

          await db.promise().query(
            `
            INSERT INTO supply_chain_repayments (
              lan,
              collection_date,
              collection_utr,
              collection_amount
            )
            VALUES (?,?,?,?)
            `,
            [lan, collection_date, collection_utr, collection_amount],
          );

          /* ---------- ALLOCATION ENGINE ---------- */
          /* allocation handles its own transaction */

          await allocateSupplyChainRepayment(db, {
            lan,
            collection_date,
            collection_utr,
            collection_amount,
          });

          success_rows.push(R);
        } catch (err) {
          row_errors.push({
            row: R,
            stage: "insert",
            reason: err.message,
          });
        }
      }

      return res.json({
        message: "Repayment Excel processed successfully",
        total_rows: sheetData.length,
        inserted_rows: success_rows.length,
        failed_rows: row_errors.length,
        success_rows,
        duplicate_utrs: [...duplicate_utrs],
        missing_lans: [...missing_lans],
        row_errors,
      });
    } catch (err) {
      console.error("❌ Excel upload error:", err);

      return res.status(500).json({
        message: "Excel upload failed",
        error: err.message,
      });
    }
  },
);
//////////////////////////// Supply chain Collection Upload API END ////////////////////////

//////////////////////////////   CIRCLE PE ADD FOR LOAN BOOKING  ////////////////////////

router.post("/circle-pe-upload", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: "No file uploaded." });
  if (!req.body.lenderType)
    return res.status(400).json({ message: "Lender type is required." });

  const lenderType = req.body.lenderType?.toLowerCase().trim();

  const success_rows = [];
  const row_errors = [];
  const skippedDueToCIBIL = [];

  try {
    const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rawData = xlsx.utils.sheet_to_json(sheet, { defval: "" });

    if (rawData.length === 0)
      return res.status(400).json({ message: "Excel is empty or invalid." });

    const parse = (v) =>
      typeof v === "number"
        ? v
        : parseFloat((v ?? "").toString().replace(/[^0-9.-]/g, "")) || 0;

    for (const [i, row] of rawData.entries()) {
      const R = i + 2;
      let conn;

      try {
        const panCard = row["pan_number"];
        const aadharNumber = row["aadhaar_number"];
        const appId = row["App_Id"];
        const cibilScore = parseInt(row["credit_score"]);

        if (isNaN(cibilScore)) {
          skippedDueToCIBIL.push({
            ...row,
            reason: "Invalid or missing credit score",
          });
          continue;
        }
        if (!(cibilScore >= 500 || cibilScore === -1)) {
          skippedDueToCIBIL.push({ ...row, reason: "Low CIBIL Score" });
          continue;
        }

        // Check for duplicate app_id
        const [exists] = await db
          .promise()
          .query(`SELECT * FROM loan_booking_circle_pe WHERE app_id = ?`, [
            appId,
          ]);
        if (exists.length > 0) {
          row_errors.push({
            row: R,
            stage: "dup-check",
            reason: `Duplicate App ID (${appId})`,
          });
          continue;
        }

        // Generate partnerLoanId + LAN
        conn = await db.promise().getConnection();
        await conn.beginTransaction();

        const partnerName = "Circle PE";

        const loginDate = row["loan_application_date"]
          ? excelDateToJSDate(row["loan_application_date"])
          : null;

        const today = new Date();
        const loanAmount = parse(row["loan amount sanctioned"]);
        const { month, year } = getMonthYear(today);

        const partner = await partnerLimitService.getOrCreatePartner(
          conn,
          partnerName,
        );

        const limitCheck =
          await partnerLimitService.validatePartnerBookingLimit(
            conn,
            partner.partner_id,
            loanAmount,
            month,
            year,
          );

        if (!limitCheck.valid) {
          await conn.rollback();
          conn.release();

          row_errors.push({
            row: R,
            stage: "limit-check",
            reason: `Limit exceeded. Remaining ${limitCheck.remaining}, Required ${loanAmount}`,
          });

          continue;
        }

        // Fetch partner FLDG percent
        const [[partnerConfig]] = await conn.query(
          `SELECT fldg_percent, fldg_status FROM partner_master WHERE partner_id = ?`,
          [partner.partner_id],
        );

        if (!partnerConfig) {
          throw new Error("Partner configuration not found");
        }

        let requiredFldg = 0;

        if (partnerConfig?.fldg_status === 1) {
          const fldgPercent = Number(partnerConfig?.fldg_percent || 0);

          requiredFldg = Number(((loanAmount * fldgPercent) / 100).toFixed(2));
        }

        // Validate FLDG availability
        if (requiredFldg > 0) {
          const fldgCheck = await partnerFldgService.validateFldgAvailability(
            conn,
            partner.partner_id,
            requiredFldg,
          );

          if (!fldgCheck.valid) {
            await conn.rollback();
            conn.release();

            row_errors.push({
              row: R,
              stage: "fldg-check",
              reason: `Insufficient FLDG. Available: ${fldgCheck.available}, Required: ${requiredFldg}`,
            });

            continue;
          }
        }

        const { partnerLoanId, lan } =
          await generateLoanIdentifiers(lenderType);

        await conn.query(
          `INSERT INTO loan_booking_circle_pe (
    login_date, lan, partner_loan_id, app_id, customer_name, gender, dob,
    father_name, mobile_number, email_id, pan_number, aadhar_number,
    current_address, current_pincode, loan_amount, interest_rate,
    loan_tenure, emi_amount, cibil_score, product, lender, residence_type,
    customer_type, bank_name, name_in_bank, account_number, ifsc,
    net_disbursement, agreement_date, status
  ) VALUES (${new Array(30).fill("?").join(",")})`,
          [
            row["loan_application_date"]
              ? excelDateToJSDate(row["loan_application_date"])
              : null,
            lan,
            partnerLoanId,
            row["App_Id"] || row["app_id"],
            row["customer_name"],
            row["gender"],
            row["date_of_birth"]
              ? excelDateToJSDate(row["date_of_birth"])
              : null,
            row["fathers_name"],
            row["mobile_number"],
            row["email_id"],
            row["pan_number"],
            row["aadhaar_number"],
            row["current_address_line1"],
            row["current_address_pincode"],
            parse(
              row["loan amount sanctioned"] || row["loan_amount_sanctioned"],
            ),
            parse(row["interest_percent"]),
            parse(row["loan_tenure_months"]),
            parse(row["monthly emi"] || row["monthly_emi"]),
            parseInt(row["credit_score"]),
            row["product"],
            row["LenderType"] || lenderType,
            row["residence_type"],
            row["customer_type"],
            row["bank_name"],
            row["beneficiary_name"],
            row["institute_account_number"],
            row["ifsc_code"],
            parse(
              row["loan amount sanctioned"] || row["loan_amount_sanctioned"],
            ), // net_disbursement
            row["loan_application_date"]
              ? excelDateToJSDate(row["loan_application_date"])
              : null, // agreement date
            "Login",
          ],
        );

        console.log(
          parse(row["loan amount sanctioned"]),
          row["interest_percent"],
          row["loan_tenure_months"],
          parse(row["monthly emi"]),
        );

        await partnerLimitService.updateBookedLimit(
          conn,
          limitCheck.limitId,
          loanAmount,
          lan,
        );

        if (requiredFldg > 0) {
          await partnerFldgService.reserveFldg(
            conn,
            partner.partner_id,
            lan,
            requiredFldg,
            `Circle PE Loan reservation | Amount: ${loanAmount}`,
          );
        }

        await conn.commit();
        conn.release();

        success_rows.push(R);
      } catch (err) {
        if (conn) {
          await conn.rollback();
          conn.release();
        }
        row_errors.push({
          row: R,
          stage: "insert",
          reason: toClientError(err).message,
        });
        continue;
      }
    }

    return res.status(200).json({
      message: "Circle Pay file processed.",
      total_rows: rawData.length,
      inserted_rows: success_rows.length,
      failed_rows: row_errors.length,
      success_rows,
      row_errors,
      skippedDueToCIBIL,
      totalSkipped: skippedDueToCIBIL.length,
    });
  } catch (error) {
    console.error("❌ Circle Pay Upload Error:", error);
    return res.status(500).json({
      message: "Upload failed",
      error: toClientError(error),
      inserted_rows: success_rows.length,
      failed_rows: row_errors.length,
      success_rows,
      row_errors,
      skippedDueToCIBIL,
      totalSkipped: skippedDueToCIBIL.length,
    });
  }
});
router.post(
  "/circle-pe-houser-upload",
  upload.single("file"),
  async (req, res) => {
    if (!req.file)
      return res.status(400).json({ message: "No file uploaded." });
    if (!req.body.lenderType)
      return res.status(400).json({ message: "Lender type is required." });

    const lenderType = req.body.lenderType?.toLowerCase().trim();

    const success_rows = [];
    const row_errors = [];
    const skippedDueToCIBIL = [];

    try {
      const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rawData = xlsx.utils.sheet_to_json(sheet, { defval: "" });

      if (rawData.length === 0)
        return res.status(400).json({ message: "Excel is empty or invalid." });

      const parse = (v) =>
        typeof v === "number"
          ? v
          : parseFloat((v ?? "").toString().replace(/[^0-9.-]/g, "")) || 0;

      for (const [i, row] of rawData.entries()) {
        const R = i + 2;
        let conn;

        try {
          const panCard = row["pan_number"];
          const aadharNumber = row["aadhaar_number"];
          const appId = row["App_Id"];
          const cibilScore = parseInt(row["credit_score"]);

          if (isNaN(cibilScore)) {
            skippedDueToCIBIL.push({
              ...row,
              reason: "Invalid or missing credit score",
            });
            continue;
          }
          if (!(cibilScore >= 500 || cibilScore === -1)) {
            skippedDueToCIBIL.push({ ...row, reason: "Low CIBIL Score" });
            continue;
          }

          // Check for duplicate app_id
          const [exists] = await db
            .promise()
            .query(
              `SELECT * FROM loan_booking_circle_pe_houser WHERE app_id = ?`,
              [appId],
            );
          if (exists.length > 0) {
            row_errors.push({
              row: R,
              stage: "dup-check",
              reason: `Duplicate App ID (${appId})`,
            });
            continue;
          }

          // Generate partnerLoanId + LAN
          conn = await db.promise().getConnection();
          await conn.beginTransaction();

          const partnerName = "Circle Pe Houser";

          const loginDate = row["loan_application_date"]
            ? excelDateToJSDate(row["loan_application_date"])
            : null;

          const today = new Date();
          const loanAmount = parse(row["loan amount sanctioned"]);
          const { month, year } = getMonthYear(today);

          const partner = await partnerLimitService.getOrCreatePartner(
            conn,
            partnerName,
          );

          const limitCheck =
            await partnerLimitService.validatePartnerBookingLimit(
              conn,
              partner.partner_id,
              loanAmount,
              month,
              year,
            );

          if (!limitCheck.valid) {
            await conn.rollback();
            conn.release();

            row_errors.push({
              row: R,
              stage: "limit-check",
              reason: `Limit exceeded. Remaining ${limitCheck.remaining}, Required ${loanAmount}`,
            });

            continue;
          }

          // Fetch partner FLDG percent
          const [[partnerConfig]] = await conn.query(
            `SELECT fldg_percent, fldg_status FROM partner_master WHERE partner_id = ?`,
            [partner.partner_id],
          );

          if (!partnerConfig) {
            throw new Error("Partner configuration not found");
          }

          let requiredFldg = 0;

          if (partnerConfig?.fldg_status === 1) {
            const fldgPercent = Number(partnerConfig?.fldg_percent || 0);

            requiredFldg = Number(
              ((loanAmount * fldgPercent) / 100).toFixed(2),
            );
          }

          // Validate FLDG availability
          if (requiredFldg > 0) {
            const fldgCheck = await partnerFldgService.validateFldgAvailability(
              conn,
              partner.partner_id,
              requiredFldg,
            );

            if (!fldgCheck.valid) {
              await conn.rollback();
              conn.release();

              row_errors.push({
                row: R,
                stage: "fldg-check",
                reason: `Insufficient FLDG. Available: ${fldgCheck.available}, Required: ${requiredFldg}`,
              });

              continue;
            }
          }

          const { partnerLoanId, lan } =
            await generateLoanIdentifiers(lenderType);

          await conn.query(
            `INSERT INTO loan_booking_circle_pe_houser (
    login_date, lan, partner_loan_id, app_id, customer_name, gender, dob,
    father_name, mobile_number, email_id, pan_number, aadhar_number,
    current_address, current_pincode, loan_amount, interest_rate,
    loan_tenure, emi_amount, cibil_score, product, lender, residence_type,
    customer_type, bank_name, name_in_bank, account_number, ifsc,
    net_disbursement, agreement_date, status
  ) VALUES (${new Array(30).fill("?").join(",")})`,
            [
              row["loan_application_date"]
                ? excelDateToJSDate(row["loan_application_date"])
                : null,
              lan,
              partnerLoanId,
              row["App_Id"] || row["app_id"],
              row["customer_name"],
              row["gender"],
              row["date_of_birth"]
                ? excelDateToJSDate(row["date_of_birth"])
                : null,
              row["fathers_name"],
              row["mobile_number"],
              row["email_id"],
              row["pan_number"],
              row["aadhaar_number"],
              row["current_address_line1"],
              row["current_address_pincode"],
              parse(
                row["loan amount sanctioned"] || row["loan_amount_sanctioned"],
              ),
              parse(row["interest_percent"]),
              parse(row["loan_tenure_months"]),
              parse(row["monthly emi"] || row["monthly_emi"]),
              parseInt(row["credit_score"]),
              row["product"],
              row["LenderType"] || lenderType,
              row["residence_type"],
              row["customer_type"],
              row["bank_name"],
              row["beneficiary_name"],
              row["institute_account_number"],
              row["ifsc_code"],
              parse(
                row["loan amount sanctioned"] || row["loan_amount_sanctioned"],
              ), // net_disbursement
              row["loan_application_date"]
                ? excelDateToJSDate(row["loan_application_date"])
                : null, // agreement date
              "Login",
            ],
          );

          console.log(
            parse(row["loan amount sanctioned"]),
            row["interest_percent"],
            row["loan_tenure_months"],
            parse(row["monthly emi"]),
          );

          await partnerLimitService.updateBookedLimit(
            conn,
            limitCheck.limitId,
            loanAmount,
            lan,
          );

          if (requiredFldg > 0) {
            await partnerFldgService.reserveFldg(
              conn,
              partner.partner_id,
              lan,
              requiredFldg,
              `Circle PE Loan reservation | Amount: ${loanAmount}`,
            );
          }

          await conn.commit();
          conn.release();

          success_rows.push(R);
        } catch (err) {
          if (conn) {
            await conn.rollback();
            conn.release();
          }
          row_errors.push({
            row: R,
            stage: "insert",
            reason: toClientError(err).message,
          });
          continue;
        }
      }

      return res.status(200).json({
        message: "Circle pe houser file processed.",
        total_rows: rawData.length,
        inserted_rows: success_rows.length,
        failed_rows: row_errors.length,
        success_rows,
        row_errors,
        skippedDueToCIBIL,
        totalSkipped: skippedDueToCIBIL.length,
      });
    } catch (error) {
      console.error("❌ Circle Pe Houser Upload Error:", error);
      return res.status(500).json({
        message: "Upload failed",
        error: toClientError(error),
        inserted_rows: success_rows.length,
        failed_rows: row_errors.length,
        success_rows,
        row_errors,
        skippedDueToCIBIL,
        totalSkipped: skippedDueToCIBIL.length,
      });
    }
  },
);

//////////////////////////////   CIRCLE PE ADD FOR LOAN BOOKING  END ////////////////////////

/////////////  CIRCLE PAY API CALL for Loan Booking ////////
router.post("/v1/circlepe-lb", verifyApiKey, async (req, res) => {
  try {
    console.log("============== 📦 NEW CIRCLE PE REQUEST START ==============");
    console.log("🔹 Timestamp:", new Date().toISOString());

    // --- ENV info ---
    console.log("🔧 DB_CONNECTED =", !!db ? "✅ Yes" : "❌ No");

    // --- Partner validation ---
    console.log("👥 Partner received:", req.partner);
    if (
      !req.partner ||
      (req.partner.name || "").toLowerCase().trim() !== "circlepe"
    ) {
      console.error("❌ Partner validation failed!");
      return res
        .status(403)
        .json({ message: "This route is only for Circle Pe partner." });
    }

    // --- Payload logging ---
    const data = req.body;
    console.log("📥 Received JSON payload:", JSON.stringify(data, null, 2));

    // --- Lender type check ---
    const lenderType = data.lenderType?.trim()?.toLowerCase();
    console.log("🏦 Lender type received:", lenderType);
    if (!lenderType || lenderType !== "circlepe") {
      console.error("❌ Invalid lenderType:", lenderType);
      return res.status(400).json({
        message: "Invalid lenderType. Only 'CIRCLEPE' loans are accepted.",
      });
    }

    // --- Required fields check ---
    const requiredFields = [
      "App_Id",
      "customer_name",
      "mobile_number",
      "pan_number",
      "aadhaar_number",
      "loan_amount_sanctioned",
      "loan_tenure_months",
      "monthly_emi",
      "interest_percent",
      "credit_score",
      "bank_name",
      "beneficiary_name",
      "institute_account_number",
      "ifsc_code",
    ];

    for (const f of requiredFields) {
      if (!data[f] && data[f] !== 0) {
        console.error(`❌ Missing field detected: ${f}`);
        return res.status(400).json({ message: `${f} is required.` });
      }
    }
    console.log("✅ All required fields present.");

    // --- Credit score check ---
    const cibilScore = parseInt(data.credit_score);
    if (isNaN(cibilScore)) {
      console.error("❌ Invalid or missing credit score");
      return res
        .status(400)
        .json({ message: "Invalid or missing credit score." });
    }
    if (!(cibilScore >= 500 || cibilScore === -1)) {
      console.warn("⚠️ Skipping due to low CIBIL:", cibilScore);
      return res.status(400).json({
        message: `Low CIBIL Score (${cibilScore}). Application skipped.`,
      });
    }

    // --- Duplicate App_Id check ---
    console.log("🔍 Checking for duplicate App_Id:", data.App_Id);
    const [exists] = await db
      .promise()
      .query(`SELECT lan FROM loan_booking_circle_pe WHERE app_id = ?`, [
        data.App_Id,
      ]);
    console.log("🧾 Duplicate check result:", exists.length, "records found.");
    if (exists.length > 0) {
      console.error("❌ Duplicate App_Id found:", data.App_Id);
      return res
        .status(400)
        .json({ message: `Duplicate App_Id: ${data.App_Id}` });
    }

    // --- Generate LAN and PartnerLoanId ---
    console.log("⚙️ Generating LAN for lender:", lenderType);
    const { lan, partnerLoanId } = await generateLoanIdentifiers(lenderType);
    console.log("✅ Generated IDs:", { lan, partnerLoanId });

    const parseNum = (v) =>
      typeof v === "number"
        ? v
        : parseFloat((v ?? "").toString().replace(/[^0-9.-]/g, "")) || 0;

    // --- Insert into DB ---
    console.log("💾 Inserting record into loan_booking_circle_pe...");
    await db.promise().query(
      `INSERT INTO loan_booking_circle_pe (
        login_date, lan, partner_loan_id, app_id, customer_name, gender, dob,
        father_name, mobile_number, email_id, pan_number, aadhar_number,
        current_address, current_pincode, loan_amount, interest_rate,
        loan_tenure, emi_amount, cibil_score, product, lender, residence_type,
        customer_type, bank_name, name_in_bank, account_number, ifsc,
        net_disbursement, agreement_date, status
      ) VALUES (${new Array(30).fill("?").join(",")})`,
      [
        data.loan_application_date || new Date(),
        lan,
        partnerLoanId,
        data.App_Id,
        data.customer_name,
        data.gender,
        data.date_of_birth,
        data.fathers_name,
        data.mobile_number,
        data.email_id,
        data.pan_number,
        data.aadhaar_number,
        data.current_address_line1,
        data.current_address_pincode,
        parseNum(data.loan_amount_sanctioned),
        parseNum(data.interest_percent),
        parseNum(data.loan_tenure_months),
        parseNum(data.monthly_emi),
        cibilScore,
        data.product || "Mobile Finance",
        lenderType,
        data.residence_type,
        data.customer_type,
        data.bank_name,
        data.beneficiary_name,
        data.institute_account_number,
        data.ifsc_code,
        parseNum(data.loan_amount_sanctioned),
        data.loan_application_date,
        "Login",
      ],
    );

    console.log("✅ Record inserted successfully for LAN:", lan);

    return res.status(200).json({
      message: "Circle Pe upload completed.",
      results: [
        {
          message: "Circle Pe loan saved successfully.",
          app_id: data.App_Id,
          lan: lan,
        },
      ],
    });
  } catch (error) {
    console.error("❌ Unhandled Error in Circle Pe Upload:", error);
    res.status(500).json({
      message: "Upload failed. Please try again.",
      error: error.sqlMessage || error.message,
    });
  } finally {
    console.log("================ 📦 CIRCLE PE REQUEST END ================\n");
  }
});

///////////// CIRCLE PAY API CALL  END for Loan Booking ////////
////////////////////////   WCTL LOAN BOOKIN START /////////////////

router.post("/wctl-upload", upload.single("file"), async (req, res) => {
  console.log("Request received:", req.body);

  if (!req.file) return res.status(400).json({ message: "No file uploaded" });
  if (!req.body.lenderType)
    return res.status(400).json({ message: "Lender type is required." });

  try {
    const lenderType = req.body.lenderType;
    console.log("Lender Type:", lenderType);

    const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheetRaw = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], {
      defval: "",
    });

    // Normalize headers (remove spaces, consistent keys)
    const sheetData = sheetRaw.map((row) => {
      const cleanedRow = {};
      for (const key in row) {
        const cleanKey = key.toString().trim();
        cleanedRow[cleanKey] = row[key];
      }
      return cleanedRow;
    });

    if (!sheetData || sheetData.length === 0) {
      return res
        .status(400)
        .json({ message: "Uploaded Excel file is empty or invalid." });
    }

    let success = 0;
    let rejectedLimit = 0;
    let rejectedValidation = 0;

    for (const row of sheetData) {
      let conn;

      try {
        const loanAmount = parseFloat(row["Loan Amount"]) || 0;

        if (loanAmount <= 0) {
          rejectedValidation++;
          continue;
        }

        const disbursementDate = row["Disbursement Date"]
          ? excelDateToJSDate(row["Disbursement Date"])
          : null;

        if (!disbursementDate) {
          rejectedValidation++;
          continue;
        }

        conn = await db.promise().getConnection();

        await conn.beginTransaction();

        const partnerName = "WCTL";

        const today = new Date();

        const { month, year } = getMonthYear(today);

        const partner = await partnerLimitService.getOrCreatePartner(
          conn,
          partnerName,
        );

        const limitCheck =
          await partnerLimitService.validatePartnerBookingLimit(
            conn,
            partner.partner_id,
            loanAmount,
            month,
            year,
          );

        if (!limitCheck.valid) {
          rejectedLimit++;

          await conn.rollback();
          conn.release();

          continue;
        }

        // Fetch partner FLDG percent
        const [[partnerConfig]] = await conn.query(
          `SELECT fldg_percent, fldg_status FROM partner_master WHERE partner_id = ?`,
          [partner.partner_id],
        );

        if (!partnerConfig) {
          throw new Error("Partner configuration not found");
        }

        let requiredFldg = 0;

        if (partnerConfig?.fldg_status === 1) {
          const fldgPercent = Number(partnerConfig?.fldg_percent || 0);

          requiredFldg = Number(((loanAmount * fldgPercent) / 100).toFixed(2));
        }

        // Validate FLDG availability
        if (requiredFldg > 0) {
          const fldgCheck = await partnerFldgService.validateFldgAvailability(
            conn,
            partner.partner_id,
            requiredFldg,
          );

          if (!fldgCheck.valid) {
            await conn.rollback();
            conn.release();

            row_errors.push({
              row: R,
              stage: "fldg-check",
              reason: `Insufficient FLDG. Available: ${fldgCheck.available}, Required: ${requiredFldg}`,
            });

            continue;
          }
        }

        const { partnerLoanId, lan } =
          await generateLoanIdentifiers(lenderType);

        const query = `
  INSERT INTO loan_bookings_wctl (
    category, product_short_name, customer_name, loan_account_number,
    lan, loan_amount, interest_rate, loan_tenure, agreement_date,
    first_emi_date, tenure_end_date, emi_amount, interest_amount,
    rm_name, partner_loan_id, lender, status
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

        await conn.query(query, [
          row["Category"],
          row["Product Short Name"],
          row["Customer Name"],
          row["Loan Account Number"],
          lan,
          parseFloat(row["Loan Amount"]) || 0,
          parseFloat(row["ROI %"]) || 0,
          parseInt(row["TenureNo"]) || 0,
          row["Disbursement Date"]
            ? excelDateToJSDate(row["Disbursement Date"])
            : null,
          row["1st EMI start Date"]
            ? excelDateToJSDate(row["1st EMI start Date"])
            : null,
          row["Tenure End Date"]
            ? excelDateToJSDate(row["Tenure End Date"])
            : null,
          parseFloat(row["EMI AMOUNT"]) || 0,
          parseFloat(row["Interest Amount"]) || 0,
          row["RM NAME"],
          partnerLoanId,
          lenderType,
          "Approved",
        ]);

        await partnerLimitService.updateBookedLimit(
          conn,
          limitCheck.limitId,
          loanAmount,
          lan,
        );

        if (requiredFldg > 0) {
          await partnerFldgService.reserveFldg(
            conn,
            partner.partner_id,
            lan,
            requiredFldg,
            `WCTL Loan reservation | Amount: ${loanAmount}`,
          );
        }

        await conn.commit();
        conn.release();

        success++;
      } catch (err) {
        if (conn) {
          await conn.rollback();
          conn.release();
        }

        rejectedValidation++;
        console.error("Row insert error:", err);
      }
    }
    return res.json({
      message: "✅ WCTL Upload processed",
      total_rows: sheetData.length,
      success,
      rejected_limit_exceeded: rejectedLimit,
      rejected_validation: rejectedValidation,
    });
  } catch (error) {
    console.error("❌ Error processing WCTL upload:", error);
    res
      .status(500)
      .json({ message: "Error processing WCTL upload", error: error.message });
  }
});

////////////////// WCT LOAN BOOKIN END /////////////////////////////

////////////////////// ADIKOSH CAM DATA UPLOAD Start     /////////////////////
/**
 * Flatten up to 5 co-applicants/guarantors into the numbered columns.
 * Undefined values become null (INSERT-friendly).
 */
function buildCoColumns(coApplicants = []) {
  const out = {};
  const max = Math.min(coApplicants.length, 5);
  for (let i = 1; i <= 5; i++) {
    const ca = i <= max ? coApplicants[i - 1] : {};
    out[`coapplicant_name_${i}`] = str(ca?.name);
    out[`coapplicant_dob_${i}`] = dmy(ca?.dob);
    out[`coapplicant_aadhar_${i}`] = str(ca?.aadhar);
    out[`coapplicant_pan_${i}`] = str(ca?.pan);
    out[`coapplicant_cibil_${i}`] = int(ca?.cibil);
    out[`coapplicant_mobile_${i}`] = str(ca?.mobile);
    out[`coapplicant_loan_amount_${i}`] = dec(ca?.loanAmount);
    out[`coapplicant_tenure_${i}`] = int(ca?.tenure);
    out[`coapplicant_interest_rate_${i}`] = dec(ca?.interestRate);
    out[`coapplicant_emi_amount_${i}`] = dec(ca?.emiAmount);
    out[`company_name_${i}`] = str(ca?.companyName);
    out[`employment_stability_${i}`] = int(ca?.employmentStabilityYears);
    out[`total_monthly_income_1_${i}`] = pickIncome(ca?.totalMonthlyIncome, 0);
    out[`total_monthly_income_2_${i}`] = pickIncome(ca?.totalMonthlyIncome, 1);
    out[`total_monthly_income_3_${i}`] = pickIncome(ca?.totalMonthlyIncome, 2);
    out[`no_of_loans_${i}`] = int(ca?.noOfLoans);
    out[`emi_excl_fintree_${i}`] = dec(ca?.emiExcludingFintree);
    out[`emi_incl_fintree_${i}`] = dec(ca?.emiIncludingFintree);
    out[`current_address_${i}`] = str(ca?.currentAddress);
    out[`permanent_address_${i}`] = str(ca?.permanentAddress);
    out[`relation_with_guarantor_${i}`] = str(ca?.relationWithGuarantor);
  }
  return out;
}

// ---------- route ----------
// ---------- base + per-block columns ----------
const COLS_BASE = [
  "lan",
  "partner_loan_id",
  "company_name",
  "employment_stability_years",
  "total_monthly_income_1",
  "total_monthly_income_2",
  "total_monthly_income_3",
  "no_of_loans",
  "emi_excl_fintree",
  "emi_incl_fintree",
];

// 21 columns per co-app/guarantor block
function colsForBlock(i) {
  return [
    `coapplicant_name_${i}`,
    `coapplicant_dob_${i}`,
    `coapplicant_aadhar_${i}`,
    `coapplicant_pan_${i}`,
    `coapplicant_cibil_${i}`,
    `coapplicant_mobile_${i}`,
    `coapplicant_loan_amount_${i}`,
    `coapplicant_tenure_${i}`,
    `coapplicant_interest_rate_${i}`,
    `coapplicant_emi_amount_${i}`,
    `company_name_${i}`,
    `employment_stability_${i}`,
    `total_monthly_income_1_${i}`,
    `total_monthly_income_2_${i}`,
    `total_monthly_income_3_${i}`,
    `no_of_loans_${i}`,
    `emi_excl_fintree_${i}`,
    `emi_incl_fintree_${i}`,
    `current_address_${i}`,
    `permanent_address_${i}`,
    `relation_with_guarantor_${i}`,
  ];
}

// values array for a single co-app block (keeps order in colsForBlock)
function valsForBlock(ca = {}) {
  return [
    str(ca.name),
    dmy(ca.dob),
    str(ca.aadhar),
    str(ca.pan),
    int(ca.cibil),
    str(ca.mobile),
    dec(ca.loanAmount),
    int(ca.tenure),
    dec(ca.interestRate),
    dec(ca.emiAmount),
    str(ca.companyName),
    int(ca.employmentStabilityYears),
    pickIncome(ca.totalMonthlyIncome, 0),
    pickIncome(ca.totalMonthlyIncome, 1),
    pickIncome(ca.totalMonthlyIncome, 2),
    int(ca.noOfLoans),
    dec(ca.emiExcludingFintree),
    dec(ca.emiIncludingFintree),
    str(ca.currentAddress),
    str(ca.permanentAddress),
    str(ca.relationWithGuarantor),
  ];
}

// ---------- route for cam ----------
router.post("/v1/adikosh-cam", verifyApiKey, async (req, res) => {
  try {
    const b = req.body;

    // Minimal requireds (CAM is auxiliary)
    if (!b.lan && !b.partnerLoanId) {
      return res
        .status(400)
        .json({ message: "Either 'lan' or 'partnerLoanId' is required." });
    }
    if (!b.companyName) {
      return res.status(400).json({ message: "companyName is required." });
    }

    // Normalize co-applicants to exactly 5 blocks
    const coApps = Array.isArray(b.coApplicants)
      ? b.coApplicants.slice(0, 5)
      : [];
    while (coApps.length < 5) coApps.push({});

    // Build columns programmatically
    const columns = [...COLS_BASE];
    for (let i = 1; i <= 5; i++) columns.push(...colsForBlock(i));

    // Build params in exactly the same order
    const params = [
      str(b.lan),
      str(b.partnerLoanId),
      str(b.companyName),
      int(b.employmentStabilityYears),
      pickIncome(b.totalMonthlyIncome, 0),
      pickIncome(b.totalMonthlyIncome, 1),
      pickIncome(b.totalMonthlyIncome, 2),
      int(b.noOfLoans),
      dec(b.emiExcludingFintree),
      dec(b.emiIncludingFintree),
    ];
    for (let i = 0; i < 5; i++) params.push(...valsForBlock(coApps[i]));

    // ��� Check duplicates
    const [existingRecords] = await db
      .promise()
      .query(`SELECT lan FROM adikosh_cam_data WHERE lan = ?`, [b.lan]);

    if (existingRecords.length > 0) {
      return res.json({
        message: `CAM Data already exists for Lan: ${b.lan}`,
      });
    }

    // Assemble SQL safely (column count == value count)
    const placeholders = columns.map(() => "?").join(", ");
    const sql = `INSERT INTO adikosh_cam_data (${columns.join(
      ", ",
    )}) VALUES (${placeholders})`;

    // Execute
    await db.promise().query(sql, params);

    return res.json({
      message: "Adikosh CAM Data Saved Successfully.",
      lan: b.lan ?? null,
    });
  } catch (err) {
    console.error("❌ CAM upload error:", err);
    return res.status(500).json({
      message: "Upload failed.",
      error: err.sqlMessage || err.message,
    });
  }
});

router.post("/gq-non-fsf-upload", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: "No file uploaded." });

  const lenderType = req.body.lenderType; // optional validation below

  // collections returned to frontend
  const success_rows = []; // Excel row numbers that inserted
  const row_errors = []; // [{row, stage, reason}]

  try {
    const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheetData = xlsx.utils
      .sheet_to_json(workbook.Sheets[sheetName])
      .map((r, i) => ({ __row: i + 2, ...r })); // header assumed on row 1

    if (!sheetData || sheetData.length === 0) {
      return res.status(400).json({ message: "Excel file is empty." });
    }

    // tiny helpers
    const n = (v) =>
      v === null || v === undefined || v === ""
        ? null
        : Number(String(v).replace(/[^0-9.-]/g, "")) || 0;
    const i = (v) =>
      v === null || v === undefined || v === "" ? null : parseInt(v, 10);
    const s = (v) => (v === null || v === undefined ? "" : String(v).trim());

    for (const row of sheetData) {
      const R = row.__row;
      let conn;

      try {
        // 1) validation (add more fields here if you want to be strict)
        const app_id = s(row["App ID"]);
        if (!app_id) {
          row_errors.push({
            row: R,
            stage: "validation",
            reason: "Missing App ID",
          });
          continue;
        }
        if (!lenderType) {
          row_errors.push({
            row: R,
            stage: "validation",
            reason: "Missing lenderType in form data",
          });
          continue;
        }

        // 2) duplicate App ID check
        try {
          const [existing] = await db
            .promise()
            .query(`SELECT * FROM loan_booking_gq_non_fsf WHERE app_id = ?`, [
              app_id,
            ]);
          if (existing.length > 0) {
            row_errors.push({
              row: R,
              stage: "dup-check",
              reason: `Duplicate App ID (${app_id})`,
            });
            continue;
          }
        } catch (dupErr) {
          row_errors.push({
            row: R,
            stage: "dup-check",
            reason: toClientError(dupErr).message,
          });
          continue;
        }

        // ✅ FIXED: define loanAmount BEFORE limit check
        const loanAmount = n(row["Loan Amount Sanctioned"]);

        if (!loanAmount || loanAmount <= 0) {
          row_errors.push({
            row: R,
            stage: "validation",
            reason: "Invalid loan amount",
          });

          continue;
        }

        const loginDate = row["Loan Application Date"]
          ? excelDateToJSDate(row["Loan Application Date"])
          : null;

        if (!loginDate) {
          row_errors.push({
            row: R,
            stage: "validation",
            reason: "Missing Loan Application Date",
          });

          continue;
        }

        // 3) generate loan identifiers
        conn = await db.promise().getConnection();

        await conn.beginTransaction();

        const partnerName = "GQ NON FSF";

        const today = new Date();

        const { month, year } = getMonthYear(today);

        const partner = await partnerLimitService.getOrCreatePartner(
          conn,
          partnerName,
        );

        const limitCheck =
          await partnerLimitService.validatePartnerBookingLimit(
            conn,
            partner.partner_id,
            loanAmount,
            month,
            year,
          );

        if (!limitCheck.valid) {
          await conn.rollback();
          conn.release();

          row_errors.push({
            row: R,
            stage: "limit-check",
            reason: `Limit exceeded. Remaining ${limitCheck.remaining}, Required ${loanAmount}`,
          });

          continue;
        }

        // Fetch partner FLDG percent
        const [[partnerConfig]] = await conn.query(
          `SELECT fldg_percent, fldg_status FROM partner_master WHERE partner_id = ?`,
          [partner.partner_id],
        );

        if (!partnerConfig) {
          throw new Error("Partner configuration not found");
        }

        let requiredFldg = 0;

        if (partnerConfig?.fldg_status === 1) {
          const fldgPercent = Number(partnerConfig?.fldg_percent || 0);

          requiredFldg = Number(((loanAmount * fldgPercent) / 100).toFixed(2));
        }

        // Validate FLDG availability
        if (requiredFldg > 0) {
          const fldgCheck = await partnerFldgService.validateFldgAvailability(
            conn,
            partner.partner_id,
            requiredFldg,
          );

          if (!fldgCheck.valid) {
            await conn.rollback();
            conn.release();

            row_errors.push({
              row: R,
              stage: "fldg-check",
              reason: `Insufficient FLDG. Available: ${fldgCheck.available}, Required: ${requiredFldg}`,
            });

            continue;
          }
        }

        const { partnerLoanId, lan } =
          await generateLoanIdentifiers(lenderType);

        // 4) build values & insert
        const insertQuery = `
          INSERT INTO loan_booking_gq_non_fsf (
            partner_loan_id, lan, app_id, product, customer_type, residence_type, loan_type, disbursal_type,
            institute_account_number, beneficiary_name, ifsc_code, bank_name, aadhaar_number,
            agreement_signature_type, loan_application_date, emi_day, company_name, fathers_name,
            ckyc_no, customer_name, student_name, date_of_birth, gender, current_address_line1,
            current_address_line2, current_address_line3, current_address_landmark, current_address_pincode,
            current_address_city, current_address_state, proof_of_current_address, permanent_address_line1,
            permanent_address_line2, permanent_address_line3, permanent_address_landmark, permanent_address_pincode,
            permanent_address_city, permanent_address_state, office_address_line1, office_address_line2,
            office_address_line3, office_address_landmark, office_address_pincode, office_address_city,
            office_address_state, pan_number, employment_status, annual_income, credit_score,
            mobile_number, email_id, institute, loan_amount_sanctioned, loan_tenure_months, monthly_emi,
            interest_percent, monthly_interest_amount, no_of_advance_emis, advance_emi_total, subvention_amount,
            disbursal_amount, actual_disbursement, to_be_recovered, agreement_date, interest_rate_irr,
            flat_rate, nach_umrn, income_source, status, monthly_income, age, lender, loan_amount, interest_rate, loan_tenure
          ) VALUES (${new Array(75).fill("?").join(",")})
        `;

        // mirror your custom mapping
        const interestrate = row["Interest %"];
        const loantenure = row["Loan Tenure (Months)"];

        const values = [
          partnerLoanId,
          lan,
          app_id,
          row["Product"],
          row["Customer Type"],
          row["Residence Type"],
          row["Loan Type"],
          row["Disbursal Type"],
          row["Institute Account Number"],
          row["Beneficiary Name"],
          row["IFSC Code"],
          row["Bank Name"],
          row["Aadhaar Number"],
          row["Agreement Signature Type"],
          row["Loan Application Date"]
            ? excelDateToJSDate(row["Loan Application Date"])
            : null,
          row["Emi Day"],
          row["Company Name"],
          row["Fathers Name"],
          row["CKYC No"],
          row["Customer Name"],
          row["Student Name"],
          row["Date Of Birth"] ? excelDateToJSDate(row["Date Of Birth"]) : null,
          row["Gender"],
          row["Current Address Line 1"],
          row["Current Address Line 2"],
          row["Current Address Line 3"],
          row["Current Address Landmark"],
          row["Current Address Pincode"],
          row["Current Address City"],
          row["Current Address State"],
          row["Proof of Current Address"],
          row["Permanent Address Line 1"],
          row["Permanent Address Line 2"],
          row["Permanent Address Line 3"],
          row["Permanent Address Landmark"],
          row["Permanent Address Pincode"],
          row["Permanent Address City"],
          row["Permanent Address State"],
          row["Office Address Line 1"],
          row["Office Address Line 2"],
          row["Office Address Line 3"],
          row["Office Address Landmark"],
          row["Office Address Pincode"],
          row["Office Address City"],
          row["Office Address State"],
          row["PAN Number"],
          row["Employment Status"],
          n(row["Annual Income"]),
          row["Credit Score"] || null,
          row["Mobile Number"],
          row["Email ID"],
          row["Institute"],
          loanAmount, // loan_amount_sanctioned
          loantenure, // loan_tenure_months
          n(row["Monthly EMI"]),
          interestrate, // interest_percent
          n(row["Monthly Interest Amount"]),
          i(row["No. Of Advance EMIs"]),
          n(row["Advance EMI (Total)"]),
          n(row["Subvention Amount"]),
          n(row["Disbursal Amount"]),
          n(row["Actual Disbursement"]),
          n(row["To be Recovered"]),
          row["Agreement Date (DD-MMM-YYYY)"]
            ? excelDateToJSDate(row["Agreement Date (DD-MMM-YYYY)"])
            : null,
          parseFloat(row["Interest Rate (IRR %)"]),
          parseFloat(row["Flat Rate (%)"]),
          row["Nach UMRN"],
          row["Income Source"],
          "Login",
          n(row["Monthly Income"]),
          i(row["Age"]),
          lenderType,
          loanAmount, // loan_amount (duplicate as requested)
          interestrate, // interest_rate (duplicate)
          loantenure, // loan_tenure (duplicate)
        ];

        try {
          await conn.query(insertQuery, values);

          await partnerLimitService.updateBookedLimit(
            conn,
            limitCheck.limitId,
            loanAmount,
            lan,
          );

          if (requiredFldg > 0) {
            await partnerFldgService.reserveFldg(
              conn,
              partner.partner_id,
              lan,
              requiredFldg,
              `GO-Non FSF reservation | Amount: ${loanAmount}`,
            );
          }

          await conn.commit();
          conn.release();

          success_rows.push(R);
        } catch (insErr) {
          if (conn) {
            await conn.rollback();
            conn.release();
          }
          row_errors.push({
            row: R,
            stage: "insert",
            reason: toClientError(insErr).message,
          });
          continue;
        }
      } catch (loopErr) {
        // just in case something unexpected breaks the row
        row_errors.push({
          row: R,
          stage: "unknown",
          reason: toClientError(loopErr).message,
        });
        continue;
      }
    }

    // final summary (200 even if some rows failed; UI shows details)
    return res.json({
      message: "File processed.",
      total_rows: sheetData.length,
      inserted_rows: success_rows.length,
      failed_rows: row_errors.length,
      success_rows,
      row_errors,
    });
  } catch (err) {
    console.error("❌ Upload Error:", err);
    return res.status(500).json({
      message: "Upload failed",
      error: toClientError(err),
      inserted_rows: success_rows.length,
      failed_rows: row_errors.length,
      success_rows,
      row_errors,
    });
  }
});

// Helpers
const parse = (v) =>
  typeof v === "number"
    ? v
    : parseFloat((v ?? "").toString().replace(/[^0-9.]/g, "")) || 0;

const parseRate = (v) => {
  const value = parse(v);
  if (value > 999.99) {
    console.warn(`⚠️ High rate_of_interest (${value}) capped at 999.99`);
    return 999.99;
  }
  return value;
};
//////////////// LOAN BOOKING API FOR GQ NON FSF START //////////////////////////
router.post("/v1/gq-non-fsf-lb", verifyApiKey, async (req, res) => {
  let row_errors = [];

  try {
    console.log(req.partner.name);

    // 1️⃣ Verify Partner
    if (!req.partner || (req.partner.name || "") !== "GQ Non-FSF") {
      return res
        .status(403)
        .json({ message: "This route is only for GQ NON-FSF partner." });
    }

    const data = req.body;
    console.log("📥 Incoming GQ NON-FSF JSON:", data);

    const success_rows = [];

    // 2️⃣ lenderType validation
    const lenderType = data.lenderType;
    if (!lenderType)
      return res.status(400).json({ message: "lenderType is required." });

    if (lenderType !== "GQ Non-FSF") {
      return res.status(400).json({
        message: `Invalid lenderType: ${lenderType}. Only 'GQNONFSF' is allowed.`,
      });
    }

    // 3️⃣ Required field validation
    const requiredFields = [
      "appId",
      "loanAmount",
      "interestRate",
      "loanTenure",
    ];
    for (const field of requiredFields) {
      if (!data[field] && data[field] !== 0) {
        console.error(`❌ Missing field: ${field}`);
        return res.status(400).json({ message: `${field} is required.` });
      }
    }

    // 4️⃣ Duplicate check
    const [existing] = await db
      .promise()
      .query(`SELECT lan FROM loan_booking_gq_non_fsf WHERE app_id = ?`, [
        data.appId,
      ]);

    if (existing.length > 0) {
      console.warn(`⚠️ Duplicate App ID found: ${data.appId}`);
      return res.status(400).json({
        message: `Duplicate App ID (${data.appId}) already exists.`,
      });
    }

    // 5️⃣ Generate unique IDs (now safe)
    const { partnerLoanId, lan } = await generateLoanIdentifiers(lenderType);

    // 6️⃣ Insert query
    const insertQuery = `
      INSERT INTO loan_booking_gq_non_fsf (
        partner_loan_id, lan, app_id, product, customer_type, residence_type, loan_type, disbursal_type,
        institute_account_number, beneficiary_name, ifsc_code, bank_name, aadhaar_number,
        agreement_signature_type, loan_application_date, emi_day, company_name, fathers_name,
        ckyc_no, customer_name, student_name, date_of_birth, gender, current_address_line1,
        current_address_line2, current_address_line3, current_address_landmark, current_address_pincode,
        current_address_city, current_address_state, proof_of_current_address, permanent_address_line1,
        permanent_address_line2, permanent_address_line3, permanent_address_landmark, permanent_address_pincode,
        permanent_address_city, permanent_address_state, office_address_line1, office_address_line2,
        office_address_line3, office_address_landmark, office_address_pincode, office_address_city,
        office_address_state, pan_number, employment_status, annual_income, credit_score,
        mobile_number, email_id, institute, loan_amount_sanctioned, loan_tenure_months, monthly_emi,
        interest_percent, monthly_interest_amount, no_of_advance_emis, advance_emi_total, subvention_amount,
        disbursal_amount, actual_disbursement, to_be_recovered, agreement_date, interest_rate_irr,
        flat_rate, nach_umrn, income_source, status, monthly_income, age, lender, loan_amount, interest_rate, loan_tenure
      ) VALUES (${new Array(75).fill("?").join(",")})
    `;

    // 7️⃣ Value helpers
    const n = (v) =>
      v === null || v === undefined || v === ""
        ? null
        : Number(String(v).replace(/[^0-9.-]/g, "")) || 0;
    const i = (v) =>
      v === null || v === undefined || v === "" ? null : parseInt(v, 10);
    const s = (v) => (v === null || v === undefined ? "" : String(v).trim());

    // 8️⃣ Map JSON → DB fields
    const values = [
      partnerLoanId,
      lan,
      s(data.appId),
      s(data.product),
      s(data.customerType),
      s(data.residenceType),
      s(data.loanType),
      s(data.disbursalType),
      s(data.instituteAccountNumber),
      s(data.beneficiaryName),
      s(data.ifscCode),
      s(data.bankName),
      s(data.aadhaarNumber),
      s(data.agreementSignatureType),
      data.loanApplicationDate || null,
      i(data.emiDay),
      s(data.companyName),
      s(data.fathersName),
      s(data.ckycNo),
      s(data.customerName),
      s(data.studentName),
      data.dateOfBirth || null,
      s(data.gender),
      s(data.currentAddressLine1),
      s(data.currentAddressLine2),
      s(data.currentAddressLine3),
      s(data.currentAddressLandmark),
      s(data.currentAddressPincode),
      s(data.currentAddressCity),
      s(data.currentAddressState),
      s(data.proofOfCurrentAddress),
      s(data.permanentAddressLine1),
      s(data.permanentAddressLine2),
      s(data.permanentAddressLine3),
      s(data.permanentAddressLandmark),
      s(data.permanentAddressPincode),
      s(data.permanentAddressCity),
      s(data.permanentAddressState),
      s(data.officeAddressLine1),
      s(data.officeAddressLine2),
      s(data.officeAddressLine3),
      s(data.officeAddressLandmark),
      s(data.officeAddressPincode),
      s(data.officeAddressCity),
      s(data.officeAddressState),
      s(data.panNumber),
      s(data.employmentStatus),
      n(data.annualIncome),
      s(data.creditScore),
      s(data.mobileNumber),
      s(data.emailId),
      s(data.institute),
      n(data.loanAmountSanctioned || data.loanAmount),
      i(data.loanTenureMonths || data.loanTenure),
      n(data.monthlyEmi),
      n(data.interestPercent || data.interestRate),
      n(data.monthlyInterestAmount),
      i(data.noOfAdvanceEmis),
      n(data.advanceEmiTotal),
      n(data.subventionAmount),
      n(data.disbursalAmount),
      n(data.actualDisbursement),
      n(data.toBeRecovered),
      data.agreementDate || null,
      parseFloat(data.interestRateIrr) || null,
      parseFloat(data.flatRate) || null,
      s(data.nachUmrn),
      s(data.incomeSource),
      s(data.status) || "Login",
      n(data.monthlyIncome),
      i(data.age),
      lenderType,
      n(data.loanAmount),
      n(data.interestRate),
      i(data.loanTenure),
    ];

    // 9️⃣ Execute insert
    await db.promise().query(insertQuery, values);
    console.log(
      `✅ Loan inserted successfully → App ID: ${data.appId}, LAN: ${lan}`,
    );

    success_rows.push({ appId: data.appId, lan, partnerLoanId });

    // 🔟 Respond
    return res.json({
      message: "GQ NON-FSF Loan saved successfully.",
      inserted: success_rows.length,
      success_rows,
    });
  } catch (err) {
    console.error("❌ GQ NON-FSF Upload Error:", err);
    row_errors.push(err.message);

    return res.status(500).json({
      message: "Upload failed.",
      error: err.sqlMessage || err.message,
      row_errors,
    });
  }
});

/////////// ALDUN LOAN DATA UPLOAD //////////////////////////
router.post("/aldun-upload", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "No file uploaded." });
  }

  try {
    const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawData = xlsx.utils.sheet_to_json(sheet, { defval: "" });

    if (!rawData.length) {
      return res.status(400).json({ message: "Excel file is empty." });
    }

    const columnMap = {
      branchname: "branch_name",
      productname: "product_name",
      frequencyofpayment: "frequency_of_payment",
      productshortname: "product_short_name",
      loanaccountnumber: "loan_account_number",
      loanstatus: "loan_status",
      customername: "customer_name",
      sanctiondate: "sanction_date",
      disbursementdate: "disbursement_date",
      emistartdate: "emi_start_date",
      emienddate: "emi_end_date",
      sanctionamount: "sanction_amount",
      disbursedamount: "disbursed_amount",
      tenureindays: "tenure_in_days",
      emiamount: "emi_amount",
      rateofinterest: "rate_of_interest",
      totalprincipaldemand: "total_principal_demand",
      totalinterestdemand: "total_interest_demand",
      penaltydemand: "penalty_demand",
      totaldemand: "total_demand",
      totalprincipalcollected: "total_principal_collected",
      totalinterestcollected: "total_interest_collected",
      totalpenaltycollected: "total_penalty_collected",
      totalcollected: "total_collected",
      totalamountoverdue: "total_amount_overdue",
      dpdindays: "dpd_in_days",
      dpdstartdate: "dpd_start_date",
      processingfees: "processing_fees",
      gst: "gst",
      advanceemi: "advance_emi",
      futureintos: "future_int_os",
      futurepros: "future_pr_os",
      preemicollected: "pre_emi_collected",
      noofdueinstallments: "no_of_due_installments",
      rmname: "rm_name",
      accountstatus: "account_status",
      npasinceDate: "npa_since_date",
      npaclassification: "npa_classification",
      interestpaidtilltoday: "interest_paid_till_today",
      principalpaidtilltoday: "principal_paid_till_today",
      totalpaidtilltoday: "total_paid_till_today",
      demandedprincipalincludingtoday: "demanded_principal_incl_today",
      demandedinterestincludingtoday: "demanded_interest_incl_today",
      demandedtotalincludingtoday: "demanded_total_incl_today",
      totaloverduetilltoday: "total_overdue_till_today",
      extrapaid: "extra_paid",
      pos: "pos",
      lastpaymentdate: "last_payment_date",
      disbursalamount: "disbursal_amount",
      subventionamount: "subvention_amount",
      netdisbursalamount: "net_disbursal_amount",
    };

    for (const row of rawData) {
      const formattedRow = {};

      for (const [originalKey, value] of Object.entries(row)) {
        const normalizedKey = originalKey
          .toLowerCase()
          .replace(/\s+/g, "")
          .trim();
        const dbField = columnMap[normalizedKey];
        if (!dbField) continue;

        if (dbField === "rate_of_interest") {
          const rate = parseRate(value);
          formattedRow[dbField] = rate;

          if (rate !== parse(value)) {
            console.warn(
              `⚠️ High rate_of_interest (${parse(
                value,
              )}) capped at 999.99 for loan: ${row["Loan Account Number"]}`,
            );
          }
        } else if (dbField.includes("date")) {
          formattedRow[dbField] = parseDate(value);
        } else if (typeof value === "number" || /^[0-9,.]+$/.test(value)) {
          formattedRow[dbField] = parse(value);
        } else {
          formattedRow[dbField] = value;
        }
      }

      const dbFields = Object.values(columnMap);
      const values = dbFields.map((field) => formattedRow[field] ?? null);

      await db
        .promise()
        .query(
          `INSERT INTO aldun_loans (${dbFields.join(", ")}) VALUES (${dbFields
            .map(() => "?")
            .join(", ")})`,
          values,
        );
    }

    res.status(200).json({ message: "✅ ALdun data uploaded successfully." });
  } catch (error) {
    console.error("❌ Upload error:", error);
    res.status(500).json({
      message: "Failed to process file.",
      error: error.message || error.sqlMessage,
    });
  }
});

router.get("/aldun-active-loans", async (req, res) => {
  try {
    const [rows] = await db.promise().query(
      `SELECT loan_account_number, customer_name, pos, account_status, dpd_in_days, total_overdue_till_today
         FROM aldun_loans
         WHERE account_status = 'Active'`,
    );

    res.status(200).json(rows);
  } catch (error) {
    console.error("❌ Error fetching active loans:", error);
    res
      .status(500)
      .json({ message: "Failed to fetch loans", error: error.message });
  }
});

router.post("/aldun-manual-collection", async (req, res) => {
  const {
    loan_account_number,
    utr_no,
    collected_amount,
    collection_date,
    remarks,
  } = req.body;

  if (!loan_account_number || !collected_amount) {
    return res
      .status(400)
      .json({ message: "Loan account number and amount are required." });
  }

  try {
    // Insert into collection table
    await db.promise().query(
      `INSERT INTO aldun_collections (loan_account_number, utr_no, collected_amount, collection_date, remarks)
       VALUES (?, ?, ?, ?, ?)`,
      [
        loan_account_number,
        utr_no,
        collected_amount,
        collection_date || new Date(),
        remarks || "",
      ],
    );

    // Update POS in aldun_loans
    await db.promise().query(
      `UPDATE aldun_loans
   SET 
     pos = GREATEST(pos - ?, 0),
     total_overdue_till_today = GREATEST(total_overdue_till_today - ?, 0)
   WHERE loan_account_number = ?`,
      [collected_amount, collected_amount, loan_account_number],
    );

    res.status(200).json({ message: "✅ Collection recorded successfully." });
  } catch (error) {
    console.error("❌ Error saving collection:", error);
    res
      .status(500)
      .json({ message: "Failed to record collection", error: error.message });
  }
});

router.patch("/aldun-loans/:loan_account_number/inactive", async (req, res) => {
  const { loan_account_number } = req.params;

  try {
    // 1. Get the loan record
    const [rows] = await db
      .promise()
      .query(
        "SELECT pos, total_overdue_till_today FROM aldun_loans WHERE loan_account_number = ?",
        [loan_account_number],
      );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Loan not found." });
    }

    const { pos, total_overdue_till_today } = rows[0];

    // 2. Check POS and Overdue amounts
    if (pos > 0 || total_overdue_till_today > 0) {
      return res.status(400).json({
        message: `❌ Cannot mark as inactive. POS (${pos}) or Overdue (${total_overdue_till_today}) must be zero.`,
      });
    }

    // 3. Update account_status to 'Inactive'
    await db
      .promise()
      .query(
        "UPDATE aldun_loans SET account_status = 'Inactive' WHERE loan_account_number = ?",
        [loan_account_number],
      );

    res.status(200).json({ message: "✅ Loan marked as inactive." });
  } catch (error) {
    console.error("Error updating loan status:", error);
    res
      .status(500)
      .json({ message: "Internal server error.", error: error.message });
  }
});

router.post("/adikosh-upload", upload.single("file"), async (req, res) => {
  if (!req.file)
    return res
      .status(400)
      .json({ message: "No file uploaded. Please select a valid file." });
  if (!req.body.lenderType)
    return res.status(400).json({ message: "Lender type is required." });

  const lenderType = req.body.lenderType;

  // collections to return
  const success_rows = []; // Excel row numbers that inserted
  const row_errors = []; // [{row, stage, reason}]

  try {
    // only Adikosh allowed (your previous logic)
    if (
      ["EV Loan", "Health Care", "BL Loan", "GQ FSF", "GQ Non-FSF"].includes(
        lenderType,
      )
    ) {
      return res.status(400).json({ message: "Invalid adikosh lender type." });
    }

    // read excel
    const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheetData = xlsx.utils
      .sheet_to_json(workbook.Sheets[sheetName])
      .map((r, i) => ({ __row: i + 2, ...r })); // header at row 1

    if (!sheetData || sheetData.length === 0) {
      return res
        .status(400)
        .json({ message: "Uploaded Excel file is empty or invalid." });
    }

    // tiny helpers
    const n = (v) =>
      v === null || v === undefined || v === ""
        ? null
        : Number(String(v).replace(/[^0-9.-]/g, ""));
    const s = (v) => (v === null || v === undefined ? "" : String(v).trim());

    for (const row of sheetData) {
      const R = row.__row;

      try {
        // 1) basic validation
        const panCard = s(row["Pan Card"]);
        const aadharNumber = s(row["Aadhar Number"]);
        const loanAmount = n(row["Loan Amount"]);
        const tenure = n(row["Tenure"]);
        const interestRate = n(row["Interest Rate"]);
        const customerName = s(row["Customer Name"]);

        if (
          !customerName ||
          !panCard ||
          !aadharNumber ||
          loanAmount == null ||
          tenure == null ||
          interestRate == null
        ) {
          row_errors.push({
            row: R,
            stage: "validation",
            reason:
              "Missing required fields (Customer/PAN/Aadhaar/Loan/Tenure/Interest)",
          });
          continue;
        }

        // 2) duplicate PAN/Aadhaar
        try {
          const [existing] = await db
            .promise()
            .query(
              `SELECT lan FROM loan_booking_adikosh WHERE pan_card = ? OR aadhar_number = ?`,
              [panCard, aadharNumber],
            );
          if (existing.length > 0) {
            row_errors.push({
              row: R,
              stage: "dup-check",
              reason: `Duplicate PAN/Aadhaar (${panCard} / ${aadharNumber})`,
            });
            continue;
          }
        } catch (dupErr) {
          row_errors.push({
            row: R,
            stage: "dup-check",
            reason: toClientError(dupErr).message,
          });
          continue;
        }

        // 3) identifiers
        let partnerLoanId, lan;
        try {
          const ids = await generateLoanIdentifiers(lenderType);
          partnerLoanId = ids.partnerLoanId;
          lan = ids.lan;
        } catch (idErr) {
          row_errors.push({
            row: R,
            stage: "id-gen",
            reason: toClientError(idErr).message,
          });
          continue;
        }

        // 4) insert
        try {
          const query = `
            INSERT INTO loan_booking_adikosh (
              partner_loan_id, lan, login_date, customer_name, borrower_dob, father_name,
              address_line_1, address_line_2, village, district, state, pincode,
              mobile_number, email, occupation, relationship_with_borrower, cibil_score,
              guarantor_co_cibil_score, loan_amount, loan_tenure, interest_rate, emi_amount,
              guarantor_aadhar, guarantor_pan, dealer_name, name_in_bank, bank_name,
              account_number, ifsc, aadhar_number, pan_card, guarantor_co_applicant, guarantor_co_applicant_dob, product, lender,
              agreement_date, status, salary_day
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `;

          await db
            .promise()
            .query(query, [
              partnerLoanId,
              lan,
              row["LOGIN DATE"] ? excelDateToJSDate(row["LOGIN DATE"]) : null,
              customerName,
              row["Borrower DOB"]
                ? excelDateToJSDate(row["Borrower DOB"])
                : null,
              row["Father Name"],
              row["Address Line 1"],
              row["Address Line 2"],
              row["Village"],
              row["District"],
              row["State"],
              row["Pincode"],
              row["Mobile Number"],
              row["Email"],
              row["Occupation"],
              row["Relationship with Borrower"],
              row["CIBIL Score"],
              row["GURANTOR/Co-Applicant CIBIL Score"],
              loanAmount,
              tenure,
              interestRate,
              row["EMI Amount"],
              row["GURANTOR/Co-Applicant ADHAR"],
              row["GURANTOR/Co-Applicant PAN"],
              row["DEALER NAME"],
              row["Name in Bank"],
              row["Bank name"],
              row["Account Number"],
              row["IFSC"],
              aadharNumber,
              panCard,
              row["GURANTOR/Co-Applicant"],
              row["GURANTOR/Co-Applicant DOB"]
                ? excelDateToJSDate(row["GURANTOR/Co-Applicant DOB"])
                : null,
              row["Product"],
              lenderType,
              row["Agreement Date"]
                ? excelDateToJSDate(row["LOGIN DATE"])
                : null,
              "Approved",
              row["Salary Day"],
            ]);

          success_rows.push(R);
        } catch (insErr) {
          row_errors.push({
            row: R,
            stage: "insert",
            reason: toClientError(insErr).message,
          });
          continue;
        }
      } catch (loopErr) {
        row_errors.push({
          row: R,
          stage: "unknown",
          reason: toClientError(loopErr).message,
        });
        continue;
      }
    }

    // final summary (200 even if some failed; UI shows details)
    return res.json({
      message: "File processed.",
      total_rows: sheetData.length,
      inserted_rows: success_rows.length,
      failed_rows: row_errors.length,
      success_rows,
      row_errors,
    });
  } catch (error) {
    console.error("❌ Error in Upload Process:", error);
    return res.status(500).json({
      message: "Upload failed. Please try again.",
      error: toClientError(error),
      inserted_rows: success_rows.length,
      failed_rows: row_errors.length,
      success_rows,
      row_errors,
    });
  }
});

router.get("/schedule/:lan", (req, res) => {
  const lan = req.params.lan;
  let query;
  let tableName;
  let selectColumns = "*"; // Default to select all columns

  if (lan.startsWith("GQN")) {
    tableName = "manual_rps_gq_non_fsf";
  } else if (lan.startsWith("WCTL")) {
    tableName = "manual_rps_wctl ";
  } else if (lan.startsWith("GQF")) {
    tableName = "manual_rps_gq_fsf";
  } else if (lan.startsWith("BL")) {
    tableName = "manual_rps_bl_loan";
  } else if (lan.startsWith("E10")) {
    tableName = "manual_rps_embifi_loan";
  } else if (lan.startsWith("FINE")) {
    tableName = "manual_rps_emiclub";
  } else if (lan.startsWith("CARE")) {
    tableName = "manual_rps_carepay";
  } else if (lan.startsWith("STRL")) {
    tableName = "manual_rps_sterlion";
  } else if (lan.startsWith("ZYPF")) {
    tableName = "manual_rps_zypay";
  } else if (lan.startsWith("HEL")) {
    tableName = "manual_rps_helium";
  } else if (lan.startsWith("CIRF")) {
    tableName = "manual_rps_circlepe";
  } else if (lan.startsWith("CIRHUF")) {
    tableName = "manual_rps_circle_pe_houser";
  } else if (lan.startsWith("FINS")) {
    tableName = "manual_rps_finso_loan";
  } else if (lan.startsWith("HEYEV")) {
    tableName = "manual_rps_hey_ev";
  } else if (lan.startsWith("HEYBF")) {
    tableName = "manual_rps_hey_ev_battery";
  } else if (lan.startsWith("CLY")) {
    tableName = "manual_rps_clayoo";
  } else if (lan.startsWith("LDF")) {
    tableName = "manual_rps_loan_digit";
  } else if (lan.startsWith("MC")) {
    tableName = "manual_rps_motioncorp";
  } else if (lan.startsWith("SF")) {
    tableName = "manual_rps_seven_fincorp";
  } else if (lan.startsWith("BUN")) {
    tableName = "manual_rps_bundela";
  } else if (lan.startsWith("SH")) {
    tableName = "manual_rps_srbh";
  } else if (lan.startsWith("ADK")) {
    tableName = "manual_rps_adikosh";
    // ✅ Only fetch Main Adikosh RPS - Specify columns for ADK
    selectColumns = `lan, due_date, status, emi, interest, principal, opening, closing,
                     remaining_emi, remaining_interest, remaining_principal, payment_date, dpd,
                     remaining_amount, extra_paid`;
  } else {
    tableName = "manual_rps_ev_loan";
  }

  query = `SELECT ${selectColumns} FROM ${tableName} WHERE lan = ? ORDER BY due_date ASC`;

  db.query(query, [lan], (err, results) => {
    if (err) {
      console.error(
        `❌ Error fetching schedule for LAN ${lan} from ${tableName}:`,
        err,
      );
      return res.status(500).json({ message: "Database error" });
    }

    if (!results.length) {
      return res
        .status(404)
        .json({ message: "No schedule found for this loan" });
    }

    res.json(results);
  });
});

/////////////////////////////////
// Fintree RPS for Adikosh
router.get("/schedule/adikosh/fintree/:lan", async (req, res) => {
  const { lan } = req.params;
  try {
    const [results] = await db
      .promise()
      .query(
        `SELECT * FROM manual_rps_adikosh_fintree WHERE lan = ? ORDER BY due_date ASC`,
        [lan],
      );
    if (!results.length)
      return res.status(404).json({ message: "No Fintree RPS found" });
    res.json(results);
  } catch (err) {
    console.error("❌ Error fetching Fintree RPS:", err);
    res.status(500).json({ message: "Database error" });
  }
});

router.get("/schedule/gqnonfsf/fintree/:lan", async (req, res) => {
  const { lan } = req.params;
  try {
    const [results] = await db
      .promise()
      .query(
        `SELECT * FROM manual_rps_gq_non_fsf_fintree WHERE lan = ? ORDER BY due_date ASC`,
        [lan],
      );
    if (!results.length)
      return res.status(404).json({ message: "No Fintree RPS found" });
    res.json(results);
  } catch (err) {
    console.error("❌ Error fetching Fintree RPS:", err);
    res.status(500).json({ message: "Database error" });
  }
});

router.get("/schedule/gqfsf/fintree/:lan", async (req, res) => {
  const { lan } = req.params;
  try {
    const [results] = await db
      .promise()
      .query(
        `SELECT * FROM manual_rps_gq_fsf_fintree WHERE lan = ? ORDER BY due_date ASC`,
        [lan],
      );
    if (!results.length)
      return res.status(404).json({ message: "No Fintree RPS found" });
    res.json(results);
  } catch (err) {
    console.error("❌ Error fetching Fintree RPS:", err);
    res.status(500).json({ message: "Database error" });
  }
});

// Partner RPS for Adikosh
router.get("/schedule/adikosh/partner/:lan", async (req, res) => {
  const { lan } = req.params;
  try {
    const [results] = await db
      .promise()
      .query(
        `SELECT * FROM manual_rps_adikosh_partner WHERE lan = ? ORDER BY due_date ASC`,
        [lan],
      );
    if (!results.length)
      return res.status(404).json({ message: "No Partner RPS found" });
    res.json(results);
  } catch (err) {
    console.error("❌ Error fetching Partner RPS:", err);
    res.status(500).json({ message: "Database error" });
  }
});

// Partner RPS for Adikosh
router.get("/schedule/adikosh/fintree-roi/:lan", async (req, res) => {
  const { lan } = req.params;
  try {
    const [results] = await db
      .promise()
      .query(
        `SELECT * FROM manual_rps_adikosh_fintree_roi WHERE lan = ? ORDER BY due_date ASC`,
        [lan],
      );
    if (!results.length)
      return res.status(404).json({ message: "No Partner RPS found" });
    res.json(results);
  } catch (err) {
    console.error("❌ Error fetching Partner RPS:", err);
    res.status(500).json({ message: "Database error" });
  }
});

// ✅ Fetch Complete Loan Details for a Given LAN
router.get("/disbursed/:lan", async (req, res) => {
  const { lan } = req.params;

  try {
    // ✅ Fetch Loan Details
    const loanQuery = `
            SELECT customer_name, lan, partner_loan_id, loan_amount, interest_rate, emi_amount, loan_tenure, status
            FROM loan_bookings WHERE lan = ?`;

    // ✅ Fetch Disbursal Details
    const disbursalQuery = `
            SELECT disbursement_amount, processing_fee, disbursement_date, disbursement_utr
            FROM ev_disbursement_utr WHERE lan = ?`;

    // ✅ Fetch Schedule (Manual RPS Data, Excluding Opening & Closing)
    const scheduleQuery = `
            SELECT due_date, status, emi, interest, principal, remaining_emi, remaining_interest, remaining_principal
            FROM manual_rps_ev_loan WHERE lan = ?`;

    // ✅ Fetch Charges & Cashflow
    const chargesQuery = `SELECT charge_type, charge_amount FROM charges_cashflow WHERE lan = ?`;

    // ✅ Fetch Extra Charges
    const extraChargesQuery = `SELECT charge_type, charge_amount FROM extra_charges WHERE lan = ?`;

    // ✅ Fetch Allocation
    const allocationQuery = `SELECT allocated_amount, allocation_date FROM allocation WHERE lan = ?`;

    // ✅ Execute Queries
    const [loanDetails] = await db.promise().query(loanQuery, [lan]);
    const [disbursalDetails] = await db.promise().query(disbursalQuery, [lan]);
    const [schedule] = await db.promise().query(scheduleQuery, [lan]);
    const [charges] = await db.promise().query(chargesQuery, [lan]);
    const [extraCharges] = await db.promise().query(extraChargesQuery, [lan]);
    const [allocation] = await db.promise().query(allocationQuery, [lan]);

    // ✅ Check if LAN Exists
    if (!loanDetails.length) {
      return res.status(404).json({ message: "No data found for this LAN" });
    }

    res.json({
      loanDetails: loanDetails[0],
      disbursalDetails: disbursalDetails[0] || {},
      schedule: schedule || [],
      charges: charges || [],
      extraCharges: extraCharges || [],
      allocation: allocation || [],
    });
  } catch (error) {
    console.error("Error fetching loan details:", error);
    res.status(500).json({ message: "Error fetching loan details" });
  }
});

//////////////////////////////////////////
router.post("/uniqueupload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const jsonData = xlsx.utils.sheet_to_json(sheet);

    for (const row of jsonData) {
      const { Cust_ID, Name, PAN, UniqueID, PhoneNo, LAN } = row;

      await db
        .promise()
        .query(
          `INSERT INTO UniqueIdDetails (Cust_ID, Name, PAN, Unique_ID, PhoneNo, LAN) VALUES (?, ?, ?, ?, ?, ?)`,
          [Cust_ID, Name, PAN, UniqueID, PhoneNo, LAN],
        );
    }

    res
      .status(200)
      .json({ message: "✅ Unique ID data uploaded successfully" });
  } catch (err) {
    console.error("❌ Excel Read Error:", err);
    res.status(500).json({ message: "Excel processing failed" });
  }
});

// ✅ Route to fetch all records
router.get("/uniqueid", (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const offset = (page - 1) * limit;

  db.query(
    "SELECT COUNT(*) AS count FROM UniqueIdDetails",
    (err, countResult) => {
      if (err) return res.status(500).json({ error: "Count error" });

      const totalRows = countResult[0].count;
      const totalPages = Math.ceil(totalRows / limit);

      db.query(
        "SELECT Cust_ID, Name, PAN, ID AS Unique_ID, PhoneNo, LAN FROM UniqueIdDetails LIMIT ? OFFSET ?",
        [limit, offset],
        (err, rows) => {
          if (err) return res.status(500).json({ error: "Fetch error" });

          res.json({
            currentPage: page,
            totalPages,
            data: rows,
          });
        },
      );
    },
  );
});

module.exports = router;
