const express = require("express");
const multer = require("multer");
const xlsx = require("xlsx");
const db = require("../config/db");
const partnerApiLimiter = require("../middleware/rateLimiter");
// const { verifyApiKey } = require("../middleware/authMiddleware");
const {
  generateRepaymentSchedule,
} = require("../utils/repaymentScheduleGenerator");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// ---- Shared Helpers ----

const excelDateToJSDate = (value) => {
  if (!value) return null;
  if (!isNaN(value)) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    return new Date(excelEpoch.getTime() + value * 86400000).toISOString().split("T")[0];
  }
  if (typeof value === "string" && value.match(/^\d{2}-[A-Za-z]{3}-\d{2}$/)) {
    const [d, m, y] = value.split("-");
    const monthMap = { Jan:0, Feb:1, Mar:2, Apr:3, May:4, Jun:5, Jul:6, Aug:7, Sep:8, Oct:9, Nov:10, Dec:11 };
    return new Date(Date.UTC(+("20"+y), monthMap[m], +d)).toISOString().split("T")[0];
  }
  if (value.match(/^\d{2}-\d{2}-\d{4}$/)) {
    const [d, m, y] = value.split("-");
    return new Date(`${y}-${m}-${d}`).toISOString().split("T")[0];
  }
  return null;
};

const parse = (val) => (typeof val === "number" ? val : parseFloat((val ?? "").toString().replace(/[^0-9.]/g, "")) || 0);
const parseIntSafe = (v) => parseInt(v) || 0;

const generateLoanIdentifiers = async (lender) => {
  lender = lender.trim();
  const prefixes = {
    "EV Loan": ["MANEV1", "EV1"],
    "HC": ["HCIN1", "HCF1"],
    "BL Loan": ["BLIN1", "BL1"],
    "GQ FSF": ["GQFSF1", "GQFSF1"],
    "GQ Non-FSF": ["GQNonFSF1", "GQNonFSF1"],
    "Adikosh": ["ADK1", "ADKF1"],
  };
  const prefix = prefixes[lender];
  if (!prefix) throw new Error("Invalid lender type");

  const [[{ last_sequence = 11000 } = {}]] = await db.promise().query(
    "SELECT last_sequence FROM loan_sequences WHERE lender_name = ? FOR UPDATE",
    [lender]
  );
  const newSeq = last_sequence + 1;

  await db.promise().query(
    "INSERT INTO loan_sequences (lender_name, last_sequence) VALUES (?, ?) ON DUPLICATE KEY UPDATE last_sequence = ?",
    [lender, newSeq, newSeq]
  );

  return {
    partnerLoanId: `${prefix[0]}${newSeq}`,
    lan: `${prefix[1]}${newSeq}`,
  };
};


router.get("/approved-loans", (req, res) => {
  const { table = "loan_bookings", prefix = "EV" } = req.query;

  const allowedTables = {
    "loan_bookings": true,
    "loan_booking_adikosh": true,
    "loan_booking_gq_non_fsf": true,
    "loan_booking_gq_fsf": true,
    "loan_bookings_wctl": true,
  };

  if (!allowedTables[table]) {
    return res.status(400).json({ message: "Invalid table name" });
  }

  const query = `SELECT * FROM ?? WHERE status = 'Approved' AND LAN LIKE ?`;
  const values = [table, `${prefix}%`];

  db.query(query, values, (err, results) => {
    if (err) {
      console.error("Error fetching approved loans:", err);
      return res.status(500).json({ message: "Database error" });
    }
    res.json(results);
  });
});


router.get("/disbursed-loans", (req, res) => {
  const { table = "loan_bookings", prefix = "EV" } = req.query;

  const allowedTables = {
    "loan_bookings": true,
    "loan_booking_adikosh": true,
    "loan_booking_gq_non_fsf": true,
    "loan_booking_gq_fsf": true,
    "loan_bookings_wctl": true,

  };

  if (!allowedTables[table]) {
    return res.status(400).json({ message: "Invalid table name" });
  }

  const query = `SELECT * FROM ?? WHERE status = 'Disbursed' AND LAN LIKE ?`;
  const values = [table, `${prefix}%`];

  db.query(query, values, (err, results) => {
    if (err) {
      console.error("Error fetching approved loans:", err);
      return res.status(500).json({ message: "Database error" });
    }
    res.json(results);
  });
});


router.post("/upload", verifyApiKey, partnerApiLimiter, upload.single("file"), async (req, res) => {
  const lenderType = req.body.lenderType;
  if (!req.file) return res.status(400).json({ message: "No file uploaded." });
  if (!lenderType) return res.status(400).json({ message: "Lender type is required." });

  try {
    const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const sheetData = xlsx.utils.sheet_to_json(sheet, { defval: "" });

    if (!Array.isArray(sheetData) || sheetData.length === 0) {
      return res.status(400).json({ message: "Excel file is empty or unreadable." });
    }

    const validLenders = ["EV Loan", "Health Care", "BL Loan"];
    if (!validLenders.includes(lenderType)) {
      return res.status(400).json({ message: "Invalid lender type." });
    }

    for (const row of sheetData) {
      const pan = row["Pan Card"];
      const aadhar = row["Aadhar Number"];
      if (!pan || !aadhar) continue;

      const [existing] = await db.promise().query(
        `SELECT lan FROM loan_bookings WHERE pan_card = ? OR aadhar_number = ?`,
        [pan, aadhar]
      );
      if (existing.length > 0) {
        return res.status(409).json({ message: `Duplicate PAN/Aadhar: ${pan} / ${aadhar}` });
      }

      const { partnerLoanId, lan } = await generateLoanIdentifiers(lenderType);

      await db.promise().query(
        `INSERT INTO loan_bookings (
          partner_loan_id, lan, login_date, customer_name, borrower_dob, father_name,
          address_line_1, address_line_2, village, district, state, pincode,
          mobile_number, email, occupation, relationship_with_borrower, cibil_score,
          guarantor_co_cibil_score, loan_amount, loan_tenure, interest_rate, emi_amount,
          guarantor_aadhar, guarantor_pan, dealer_name, name_in_bank, bank_name,
          account_number, ifsc, aadhar_number, pan_card, guarantor_co_applicant, guarantor_co_applicant_dob,
          product, lender, agreement_date, status
        ) VALUES (${new Array(38).fill("?").join(", ")})`,
        [
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
          row["Email"],
          row["Occupation"],
          row["Relationship with Borrower"],
          row["CIBIL Score"],
          row["GURANTOR/Co-Applicant CIBIL Score"],
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
          aadhar,
          pan,
          row["GURANTOR/Co-Applicant"],
          excelDateToJSDate(row["GURANTOR/Co-Applicant DOB"]),
          row["Product"],
          lenderType,
          excelDateToJSDate(row["Agreement Date"]),
          "Approved"
        ]
      );
    }

    res.status(200).json({ message: "✅ Upload successful for " + lenderType });
  } catch (error) {
    console.error("❌ Upload error:", error);
    res.status(500).json({ message: "Upload failed", error: error.message });
  }
});

router.post("/bl-upload", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: "No file uploaded" });
  const lenderType = req.body.lenderType;
  if (!lenderType) return res.status(400).json({ message: "Lender type is required." });

  try {
    const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheetData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "" });

    if (!sheetData.length) {
      return res.status(400).json({ message: "Uploaded Excel file is empty or invalid." });
    }

    const failedRows = [];

    for (const row of sheetData) {
      try {
        const panCard = row["Pan Card"];
        const aadharNumber = row["Aadhar Number"];
        if (!panCard || !aadharNumber) {
          failedRows.push({ row, reason: "Missing PAN or Aadhaar" });
          continue;
        }

        const [existingRecords] = await db
          .promise()
          .query(`SELECT lan FROM loan_bookings WHERE pan_card = ? OR aadhar_number = ?`, [panCard, aadharNumber]);
        if (existingRecords.length > 0) {
          failedRows.push({ row, reason: "Duplicate PAN or Aadhaar" });
          continue;
        }

        const { partnerLoanId, lan } = await generateLoanIdentifiers(lenderType);

        const borrowerDOB = excelDateToJSDate(row["BORROWER DOB"]);
        const agreementDate = excelDateToJSDate(row["Agreement Date"]);

        await db.promise().query(
          `INSERT INTO loan_bookings (
            partner_loan_id, lan, login_date, customer_name, borrower_dob, father_name,
            address_line_1, address_line_2, village, district, state, pincode,
            mobile_number, email, occupation, relationship_with_borrower, cibil_score,
            guarantor_co_cibil_score, loan_amount, loan_tenure, interest_rate, emi_amount,
            guarantor_aadhar, guarantor_pan, dealer_name, name_in_bank, bank_name,
            account_number, ifsc, aadhar_number, pan_card, product, lender,
            agreement_date, status, loan_account_no, speridian_loan_account_no
          ) VALUES (${new Array(37).fill("?").join(",")})`,
          [
            partnerLoanId,
            lan,
            excelDateToJSDate(row["LOGIN DATE"]),
            row["Customer Name"],
            borrowerDOB,
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
            aadharNumber,
            panCard,
            row["Product"],
            lenderType,
            agreementDate,
            "Approved",
            row["Loan Account No"],
            row["Speridian loan account no"]
          ]
        );
      } catch (innerErr) {
        console.error("❌ Failed to insert BL loan row:", innerErr);
        failedRows.push({ row, reason: innerErr.message });
      }
    }

    res.status(200).json({
      message: "✅ BL loans uploaded successfully.",
      failed: failedRows,
      totalFailed: failedRows.length
    });
  } catch (err) {
    console.error("❌ BL Upload Error:", err);
    res.status(500).json({ message: "Upload failed", error: err.message });
  }
});


router.post("/gq-fsf-upload", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: "No file uploaded." });
  const lenderType = req.body.lenderType;
  if (!lenderType) return res.status(400).json({ message: "Lender type is required." });

  try {
    const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
    const rawSheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawData = xlsx.utils.sheet_to_json(rawSheet, { header: 1, defval: "" });

    const headerRow = rawData[0];
    const normalizedHeaders = {};
    headerRow.forEach((h, i) => {
      const clean = h?.toString().toLowerCase().replace(/\s+/g, " ").trim().replace(/[^a-z0-9]/gi, "");
      if (clean) normalizedHeaders[i] = h;
    });

    const rows = rawData.slice(1).map(row => {
      const obj = {};
      Object.entries(normalizedHeaders).forEach(([i, h]) => {
        obj[h] = row[i] ?? "";
      });
      return obj;
    });

    const skippedDueToCIBIL = [];

    for (const row of rows) {
      const pan = row["PAN Number"];
      const aadhar = row["Aadhaar Number"];
      const rawCibil = row["Credit Score"] || row["CIBIL Score"];
      const cibilScore = parseInt(rawCibil);

      if (isNaN(cibilScore) || (cibilScore < 500 && cibilScore !== -1)) {
        skippedDueToCIBIL.push({ ...row, reason: "Low or invalid CIBIL Score" });
        continue;
      }

      const [existing] = await db.promise().query(
        "SELECT lan FROM loan_bookings WHERE pan_card = ? OR aadhar_number = ?",
        [pan, aadhar]
      );
      if (existing.length > 0) {
        return res.status(409).json({
          message: `Duplicate PAN or Aadhaar found: ${pan}, ${aadhar}`,
        });
      }

      const { partnerLoanId, lan } = await generateLoanIdentifiers(lenderType);

      await db.promise().query(
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
          email_id, institute, loan_amount_sanctioned, loan_tenure_months, monthly_emi, interest_percent,
          monthly_interest_amount, no_of_advance_emis, processing_fee, processing_fee_tax, advance_emi_total,
          subvention_amount, disbursal_amount, retention_percentage, retention_amount, actual_disbursement,
          to_be_recovered, agreement_date, interest_rate_irr, flat_rate, nach_umrn, income_source,
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
          aadhar,
          row["Agreement Signature Type"],
          excelDateToJSDate(row["Loan Application Date"]),
          parse(row["Emi Day"]),
          row["Company Name"],
          row["Fathers Name"],
          row["CKYC No"],
          row["Customer Name"],
          row["Student Name"],
          excelDateToJSDate(row["Date Of Birth"]),
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
          pan,
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
          excelDateToJSDate(row["Agreement Date (DD-MMM-YYYY)"]),
          parse(row["Interest Rate (IRR %)"]),
          parse(row["Flat Rate (%)"]),
          row["Nach UMRN"],
          row["Income Source"],
          "Approved",
          parse(row["Monthly Income"]),
          parseInt(row["Age"]),
          lenderType,
          parse(row["Loan Amount Sanctioned"]),
          parse(row["Interest %"]),
          parse(row["Loan Tenure (Months)"]),
        ]
      );
    }

    res.status(200).json({
      message: "✅ GQ FSF upload complete.",
      skippedDueToCIBIL,
      totalSkipped: skippedDueToCIBIL.length,
    });
  } catch (err) {
    console.error("❌ Upload Error:", err);
    res.status(500).json({ message: "Upload failed", error: err.message });
  }
});


router.post("/gq-non-fsf-upload", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: "No file uploaded." });
  const lenderType = req.body.lenderType;
  if (!lenderType) return res.status(400).json({ message: "Lender type is required." });

  try {
    const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const sheetData = xlsx.utils.sheet_to_json(sheet, { defval: "" });

    if (!sheetData || sheetData.length === 0) {
      return res.status(400).json({ message: "Excel file is empty." });
    }

    const failedRows = [];

    for (const row of sheetData) {
      try {
        const pan = row["PAN Number"];
        const aadhar = row["Aadhaar Number"] || row["Aadhar Number"];

        if (!pan || !aadhar) {
          failedRows.push({ row, reason: "Missing PAN or Aadhaar" });
          continue;
        }

        const [existing] = await db.promise().query(
          `SELECT lan FROM loan_booking_gq_non_fsf WHERE pan_number = ? OR aadhaar_number = ?`,
          [pan, aadhar]
        );
        if (existing.length > 0) {
          failedRows.push({ row, reason: "Duplicate PAN/Aadhaar" });
          continue;
        }

        const { partnerLoanId, lan } = await generateLoanIdentifiers(lenderType);

        await db.promise().query(
          `INSERT INTO loan_booking_gq_non_fsf (
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
            flat_rate, nach_umrn, income_source, status, monthly_income, age, lender, loan_amount,
            interest_rate, loan_tenure
          ) VALUES (${new Array(75).fill("?").join(",")})`,
          [
            partnerLoanId,
            lan,
            row["App ID"],
            row["Product"],
            row["Customer Type"],
            row["Residence Type"],
            row["Loan Type"],
            row["Disbursal Type"],
            row["Institute Account Number"],
            row["Beneficiary Name"],
            row["IFSC Code"],
            row["Bank Name"],
            aadhar,
            row["Agreement Signature Type"],
            excelDateToJSDate(row["Loan Application Date"]),
            parse(row["Emi Day"]),
            row["Company Name"],
            row["Fathers Name"],
            row["CKYC No"],
            row["Customer Name"],
            row["Student Name"],
            excelDateToJSDate(row["Date Of Birth"]),
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
            pan,
            row["Employment Status"],
            parse(row["Annual Income"]),
            parse(row["Credit Score"]),
            row["Mobile Number"],
            row["Email ID"],
            row["Institute"],
            parse(row["Loan Amount Sanctioned"]),
            parse(row["Loan Tenure (Months)"]),
            parse(row["Monthly EMI"]),
            parse(row["Insterest %"]),
            parse(row["Monthly Interest Amount"]),
            parse(row["No. Of Advance EMIs"]),
            parse(row["Advance EMI (Total)"]),
            parse(row["Subvention Amount"]),
            parse(row["Disbursal Amount"]),
            parse(row["Actual Disbursement"]),
            parse(row["To be Recovered"]),
            excelDateToJSDate(row["Agreement Date (DD-MMM-YYYY)"]),
            parse(row["Interest Rate (IRR %)"]),
            parse(row["Flat Rate (%)"]),
            row["Nach UMRN"],
            row["Income Source"],
            "Approved",
            parse(row["Monthly Income"]),
            parse(row["Age"]),
            lenderType,
            parse(row["Loan Amount Sanctioned"]),
            parse(row["Insterest %"]),
            parse(row["Loan Tenure (Months)"])
          ]
        );
      } catch (innerErr) {
        console.error(`❌ Row failed:`, innerErr);
        failedRows.push({ row, reason: innerErr.message });
      }
    }

    res.status(200).json({
      message: "✅ GQ Non-FSF upload complete.",
      failed: failedRows,
      totalFailed: failedRows.length,
    });
  } catch (err) {
    console.error("❌ Upload Error:", err);
    res.status(500).json({ message: "Upload failed", error: err.message });
  }
});

router.post("/adikosh-upload", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: "No file uploaded." });
  const lenderType = req.body.lenderType;
  if (!lenderType) return res.status(400).json({ message: "Lender type is required." });

  const blocked = ["EV Loan", "Health Care", "BL Loan", "GQ FSF", "GQ Non-FSF"];
  if (blocked.includes(lenderType)) {
    return res.status(400).json({ message: `Invalid Adikosh lender type: ${lenderType}` });
  }

  try {
    const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const sheetData = xlsx.utils.sheet_to_json(sheet, { defval: "" });

    if (!sheetData.length) {
      return res.status(400).json({ message: "Excel file is empty." });
    }

    for (const row of sheetData) {
      const pan = row["Pan Card"];
      const aadhar = row["Aadhar Number"];
      if (!pan || !aadhar) continue;

      const [existing] = await db.promise().query(
        "SELECT lan FROM loan_booking_adikosh WHERE pan_card = ? OR aadhar_number = ?",
        [pan, aadhar]
      );
      if (existing.length > 0) {
        return res.status(409).json({
          message: `Duplicate PAN or Aadhaar found: ${pan} / ${aadhar}`,
        });
      }

      const { partnerLoanId, lan } = await generateLoanIdentifiers(lenderType);

      await db.promise().query(
        `INSERT INTO loan_booking_adikosh (
          partner_loan_id, lan, login_date, customer_name, borrower_dob, father_name,
          address_line_1, address_line_2, village, district, state, pincode,
          mobile_number, email, occupation, relationship_with_borrower, cibil_score,
          guarantor_co_cibil_score, loan_amount, loan_tenure, interest_rate, emi_amount,
          guarantor_aadhar, guarantor_pan, dealer_name, name_in_bank, bank_name,
          account_number, ifsc, aadhar_number, pan_card, guarantor_co_applicant,
          guarantor_co_applicant_dob, product, lender, agreement_date, status, salary_day
        ) VALUES (${new Array(39).fill("?").join(",")})`,
        [
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
          row["Email"],
          row["Occupation"],
          row["Relationship with Borrower"],
          row["CIBIL Score"],
          row["GURANTOR/Co-Applicant CIBIL Score"],
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
          aadhar,
          pan,
          row["GURANTOR/Co-Applicant"],
          excelDateToJSDate(row["GURANTOR/Co-Applicant DOB"]),
          row["Product"],
          lenderType,
          excelDateToJSDate(row["Agreement Date"]),
          "Approved",
          row["Salary Day"]
        ]
      );
    }

    res.status(200).json({ message: "✅ Adikosh loans uploaded successfully." });
  } catch (err) {
    console.error("❌ Upload Error:", err);
    res.status(500).json({ message: "Upload failed", error: err.message });
  }
});

router.post("/aldun-upload", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: "No file uploaded." });

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
      netdisbursalamount: "net_disbursal_amount"
    };

    for (const row of rawData) {
      const formattedRow = {};

      for (const [originalKey, value] of Object.entries(row)) {
        const normalizedKey = originalKey.toLowerCase().replace(/\s+/g, "").trim();
        const dbField = columnMap[normalizedKey];
        if (!dbField) continue;

        if (dbField === "rate_of_interest") {
          const rate = parse(value);
          formattedRow[dbField] = rate > 999.99 ? 999.99 : rate;
        } else if (dbField.includes("date")) {
          formattedRow[dbField] = excelDateToJSDate(value);
        } else if (!isNaN(value)) {
          formattedRow[dbField] = parse(value);
        } else {
          formattedRow[dbField] = value;
        }
      }

      const dbFields = Object.values(columnMap);
      const values = dbFields.map((f) => formattedRow[f] ?? null);

      await db.promise().query(
        `INSERT INTO aldun_loans (${dbFields.join(", ")}) VALUES (${dbFields.map(() => "?").join(", ")})`,
        values
      );
    }

    res.status(200).json({ message: "✅ ALDUN loans uploaded successfully." });
  } catch (err) {
    console.error("❌ ALDUN Upload Error:", err);
    res.status(500).json({ message: "Upload failed", error: err.message });
  }
});


router.post("/upload-utr", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: "No file uploaded" });

  try {
    const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
    const sheetData = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: "" });

    let processedCount = 0;
    let duplicateUTRs = [];
    let missingLANs = [];
    let insertedLANs = new Set();

    for (const row of sheetData) {
      const lan = row["LAN"] || row["Lan"] || row["lan"];
      const disbursementUTR = row["Disbursement UTR"];
      const disbursementDate = row["Disbursement Date"] ? excelDateToJSDate(row["Disbursement Date"]) : null;

      if (!lan || !disbursementUTR || !disbursementDate) {
        console.warn(`⚠️ Skipping row due to missing data: ${JSON.stringify(row)}`);
        continue;
      }

      // Check for duplicate UTR
      const [utrExists] = await db.promise().query(
        `SELECT LAN FROM EV_Disbursement_UTR WHERE Disbursement_UTR = ?`,
        [disbursementUTR]
      );
      if (utrExists.length > 0) {
        duplicateUTRs.push(disbursementUTR);
        console.warn(`⚠️ Duplicate UTR skipped: ${disbursementUTR}`);
        continue;
      }

      // Fetch loan details
      let loanDetailsQuery = "", loanTable = "", loanFields = "", loanRes = [];

      if (lan.startsWith("GQN")) {
        loanTable = "loan_booking_gq_non_fsf";
        loanFields = `loan_amount_sanctioned AS loan_amount, emi_day AS emi_date, interest_percent AS interest_rate,
                      loan_tenure_months AS loan_tenure, subvention_amount, no_of_advance_emis, product, lender`;
      } else if (lan.startsWith("GQF")) {
        loanTable = "loan_booking_gq_fsf";
        loanFields = `loan_amount_sanctioned AS loan_amount, emi_day AS emi_date, interest_percent AS interest_rate,
                      loan_tenure_months AS loan_tenure, subvention_amount, no_of_advance_emis, product, lender`;
      } else if (lan.startsWith("ADK")) {
        loanTable = "loan_booking_adikosh";
        loanFields = `loan_amount, interest_rate, loan_tenure, salary_day, product, lender`;
      } else {
        loanTable = "loan_bookings";
        loanFields = `loan_amount, interest_rate, loan_tenure, product, lender`;
      }

      [loanRes] = await db.promise().query(`SELECT ${loanFields} FROM ${loanTable} WHERE lan = ?`, [lan]);

      if (loanRes.length === 0) {
        missingLANs.push(lan);
        console.warn(`🚫 LAN not found: ${lan}`);
        continue;
      }

      const {
        loan_amount,
        emi_date,
        interest_rate,
        loan_tenure,
        subvention_amount,
        no_of_advance_emis,
        salary_day,
        product,
        lender,
      } = loanRes[0];

      try {
        if (!insertedLANs.has(lan)) {
          await generateRepaymentSchedule(
            lan,
            loan_amount,
            emi_date,
            interest_rate,
            loan_tenure,
            disbursementDate,
            subvention_amount,
            no_of_advance_emis,
            salary_day,
            product,
            lender
          );
          insertedLANs.add(lan);
        }

        // Insert UTR
        await db.promise().query(
          `INSERT INTO EV_Disbursement_UTR (Disbursement_UTR, Disbursement_Date, LAN) VALUES (?, ?, ?)`,
          [disbursementUTR, disbursementDate, lan]
        );

        // Update loan status
        await db.promise().query(
          `UPDATE ${loanTable} SET status = 'Disbursed', disbursal_utr = ?, disbursal_date = ? WHERE lan = ?`,
          [disbursementUTR, disbursementDate, lan]
        );

        processedCount++;
      } catch (err) {
        console.error(`❌ Failed processing LAN ${lan}:`, err.message);
      }
    }

    res.json({
      message: `✅ UTR upload completed. ${processedCount} records inserted.`,
      duplicate_utr: duplicateUTRs,
      missing_lans: missingLANs,
    });
  } catch (error) {
    console.error("❌ Error during UTR upload:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

 router.get("/aldun-active-loans", async (req, res) => {
  try {
    const [rows] = await db
      .promise()
      .query(
        `SELECT loan_account_number, customer_name, pos, account_status, dpd_in_days, total_overdue_till_today
         FROM aldun_loans
         WHERE account_status = 'Active'`
      );

    res.status(200).json(rows);
  } catch (error) {
    console.error("❌ Error fetching active loans:", error);
    res.status(500).json({ message: "Failed to fetch loans", error: error.message });
  }
});


router.post("/aldun-manual-collection", async (req, res) => {
  const { loan_account_number, utr_no, collected_amount, collection_date, remarks } = req.body;

  if (!loan_account_number || !collected_amount) {
    return res.status(400).json({ message: "Loan account number and amount are required." });
  }

  try {
    // Insert into collection table
    await db.promise().query(
      `INSERT INTO aldun_collections (loan_account_number, utr_no, collected_amount, collection_date, remarks)
       VALUES (?, ?, ?, ?, ?)`,
      [loan_account_number, utr_no, collected_amount, collection_date || new Date(), remarks || ""]
    );

    // Update POS in aldun_loans
    await db.promise().query(
      `UPDATE aldun_loans
   SET 
     pos = GREATEST(pos - ?, 0),
     total_overdue_till_today = GREATEST(total_overdue_till_today - ?, 0)
   WHERE loan_account_number = ?`,
      [collected_amount, collected_amount, loan_account_number]
    );

    res.status(200).json({ message: "✅ Collection recorded successfully." });
  } catch (error) {
    console.error("❌ Error saving collection:", error);
    res.status(500).json({ message: "Failed to record collection", error: error.message });
  }
});


router.patch("/aldun-loans/:loan_account_number/inactive", async (req, res) => {
  const { loan_account_number } = req.params;

  try {
    // 1. Get the loan record
    const [rows] = await db
      .promise()
      .query("SELECT pos, total_overdue_till_today FROM aldun_loans WHERE loan_account_number = ?", [loan_account_number]);

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
      .query("UPDATE aldun_loans SET account_status = 'Inactive' WHERE loan_account_number = ?", [loan_account_number]);

    res.status(200).json({ message: "✅ Loan marked as inactive." });
  } catch (error) {
    console.error("Error updating loan status:", error);
    res.status(500).json({ message: "Internal server error.", error: error.message });
  }
});

router.get("/disbursed/:lan", async (req, res) => {
  const { lan } = req.params;

  try {
    const query = `
      SELECT lb.*, ev.Disbursement_UTR, ev.Disbursement_Date
      FROM loan_bookings lb
      LEFT JOIN EV_Disbursement_UTR ev ON lb.lan = ev.LAN
      WHERE lb.lan = ? AND lb.status = 'Disbursed'
    `;
    const [results] = await db.promise().query(query, [lan]);

    if (!results.length) {
      return res.status(404).json({ message: "Loan not found or not disbursed" });
    }

    res.json(results[0]);
  } catch (err) {
    console.error("❌ Error fetching disbursed loan:", err);
    res.status(500).json({ message: "Database error" });
  }
});


router.get("/schedule/:lan", async (req, res) => {
  const { lan } = req.params;

  try {
    let query = "";
    if (lan.startsWith("GQN")) {
      query = `SELECT * FROM manual_rps_gq_non_fsf WHERE lan = ? ORDER BY due_date ASC`;
    } else if (lan.startsWith("GQF")) {
      query = `SELECT * FROM manual_rps_gq_fsf WHERE lan = ? ORDER BY due_date ASC`;
    } else if (lan.startsWith("ADK")) {
      query = `
        SELECT lan, due_date, status, emi, interest, principal, opening, closing,
               remaining_emi, remaining_interest, remaining_principal, payment_date, dpd,
               remaining_amount, extra_paid
        FROM manual_rps_adikosh WHERE lan = ? ORDER BY due_date ASC`;
    } else {
      query = `SELECT * FROM manual_rps_ev_loan WHERE lan = ? ORDER BY due_date ASC`;
    }

    const [results] = await db.promise().query(query, [lan]);
    if (!results.length) {
      return res.status(404).json({ message: "No schedule found for this loan" });
    }

    res.json(results);
  } catch (err) {
    console.error("❌ Error fetching schedule:", err);
    res.status(500).json({ message: "Database error" });
  }
});


router.get("/schedule/adikosh/fintree/:lan", async (req, res) => {
  try {
    const [results] = await db.promise().query(
      `SELECT * FROM manual_rps_adikosh_fintree WHERE lan = ? ORDER BY due_date ASC`,
      [req.params.lan]
    );
    if (!results.length) return res.status(404).json({ message: "No Fintree RPS found" });
    res.json(results);
  } catch (err) {
    console.error("❌ Error fetching Fintree RPS:", err);
    res.status(500).json({ message: "Database error" });
  }
});

router.get("/schedule/adikosh/fintree-roi/:lan", async (req, res) => {
  try {
    const [results] = await db.promise().query(
      `SELECT * FROM manual_rps_adikosh_fintree_roi WHERE lan = ? ORDER BY due_date ASC`,
      [req.params.lan]
    );
    if (!results.length) return res.status(404).json({ message: "No Fintree ROI RPS found" });
    res.json(results);
  } catch (err) {
    console.error("❌ Error fetching Fintree ROI:", err);
    res.status(500).json({ message: "Database error" });
  }
});

router.get("/schedule/adikosh/partner/:lan", async (req, res) => {
  try {
    const [results] = await db.promise().query(
      `SELECT * FROM manual_rps_adikosh_partner WHERE lan = ? ORDER BY due_date ASC`,
      [req.params.lan]
    );
    if (!results.length) return res.status(404).json({ message: "No Partner RPS found" });
    res.json(results);
  } catch (err) {
    console.error("❌ Error fetching Partner RPS:", err);
    res.status(500).json({ message: "Database error" });
  }
});


router.post("/uniqueupload", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: "No file uploaded" });

  try {
    const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
    const jsonData = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: "" });

    const failed = [];

    for (const row of jsonData) {
      try {
        const { Cust_ID, Name, PAN, UniqueID, PhoneNo, LAN } = row;
        if (!Cust_ID || !UniqueID || !LAN) {
          failed.push({ row, reason: "Missing key fields" });
          continue;
        }

        await db.promise().query(
          `INSERT INTO UniqueIdDetails (Cust_ID, Name, PAN, Unique_ID, PhoneNo, LAN) VALUES (?, ?, ?, ?, ?, ?)`,
          [Cust_ID, Name, PAN, UniqueID, PhoneNo, LAN]
        );
      } catch (innerErr) {
        failed.push({ row, reason: innerErr.message });
      }
    }

    res.status(200).json({
      message: "✅ Unique ID upload completed",
      failedCount: failed.length,
      failed,
    });
  } catch (err) {
    console.error("❌ Unique Upload Error:", err);
    res.status(500).json({ message: "Upload failed" });
  }
});

module.exports = {
  router,
  upload,
  excelDateToJSDate,
  generateLoanIdentifiers,
  parse,
  parseIntSafe,
};

