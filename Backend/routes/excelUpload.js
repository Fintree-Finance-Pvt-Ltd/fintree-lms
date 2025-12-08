const express = require("express");
const multer = require("multer");
const xlsx = require("xlsx");
const db = require("../config/db");
const dotenv = require("dotenv");
const { parseStringPromise } = require("xml2js");
const axios = require("axios");
const he = require("he");
const authenticateUser = require("../middleware/verifyToken")
const { XMLParser } = require("fast-xml-parser");
// const verifyApiKey = require("../middleware/authMiddleware");
const verifyApiKey = require("../middleware/apiKeyAuth");
const { sendLoanStatusMail } = require("../jobs/mailer");
// const { pullCIBILReport }=  require("../jobs/experianService");
dotenv.config();

const router = express.Router();

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });


const generateLoanIdentifiers = async (lender) => {
  lender = lender.trim(); // normalize input

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
  }else if (lender === "WCTL") {
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
  } else if (lender === "emiclub") {
    //prefixPartnerLosan = "FINE1";
    prefixLan = "FINE1";
  }
  else if (lender === "WCTL_CC_OD") {
    prefixLan = "FCCOD1";
  } else if (lender === "Finso") {
    prefixLan = "FINS1";
  } else {
    return res.status(400).json({ message: "Invalid lender type." }); // ✅ handled in route
  }

  console.log("prefixPartnerLoan:", prefixPartnerLoan);
  console.log("prefixLan:", prefixLan);

  const [rows] = await db
    .promise()
    .query(
      "SELECT last_sequence FROM loan_sequences WHERE lender_name = ? FOR UPDATE",
      [lender]
    );

  let newSequence;

  if (rows.length > 0) {
    newSequence = rows[0].last_sequence + 1;
    await db
      .promise()
      .query(
        "UPDATE loan_sequences SET last_sequence = ? WHERE lender_name = ?",
        [newSequence, lender]
      );
  } else {
    newSequence = 11000;
    await db
      .promise()
      .query(
        "INSERT INTO loan_sequences (lender_name, last_sequence) VALUES (?, ?)",
        [lender, newSequence]
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

////////////////////////////////////////////////////////////////////////////////////////////////////////

/// ✅ File Upload API (Insert Loan Data Based on Lender)
// router.post("/upload", upload.single("file"), async (req, res) => {
//   if (!req.file)
//     return res
//       .status(400)
//       .json({ message: "No file uploaded. Please select a valid file." });
//   if (!req.body.lenderType)
//     return res.status(400).json({ message: "Lender type is required." });

//   try {
//     const lenderType = req.body.lenderType;
//     if (req.body.lenderType !== "EV Loan") {
//       return res
//         .status(400)
//         .json({
//           message: "Invalid upload lender type. Only EV Loan is supported.",
//         });
//     }

//     // ✅ Read Excel File
//     const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
//     const sheetName = workbook.SheetNames[0];
//     const sheetData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

//     if (!sheetData || sheetData.length === 0) {
//       return res
//         .status(400)
//         .json({ message: "Uploaded Excel file is empty or invalid." });
//     }
//     const lender = lenderType.trim(); // normalize input

//     for (const row of sheetData) {
//       const lender = row["lender"];
//       const panCard = row["Pan Card"];
//       const aadharNumber = row["Aadhar Number"];
//       const interestRate = row["InterestRate"];

//       if (lender !== "EV Loan") {
//         return res
//           .status(400)
//           .json({
//             message: "Invalid lender type in row. Only EV Loan is supported.",
//           });
//       }

//       // ✅ Check for existing customer using PAN & Aadhar
//       const [existingRecords] = await db
//         .promise()
//         .query(
//           `SELECT lan FROM loan_booking_ev WHERE pan_card = ? OR aadhar_number = ?`,
//           [panCard, aadharNumber]
//         );

//       if (existingRecords.length > 0) {
//         return res.json({
//           message: `Customer already exists. Duplicate found for Pan Card: ${panCard} or Aadhar Number: ${aadharNumber}`,
//         });
//       }

//       // ✅ Generate new loan identifiers
//       const { partnerLoanId, lan } = await generateLoanIdentifiers(lenderType);

//       // ✅ Insert Data into `loan_bookings`
//       //      const query = `
//       //   INSERT INTO loan_bookings (
//       //     partner_loan_id, lan, login_date, customer_name, borrower_dob, father_name,
//       //     address_line_1, address_line_2, village, district, state, pincode,
//       //     mobile_number, email, occupation, relationship_with_borrower, cibil_score,
//       //     guarantor_co_cibil_score, loan_amount, loan_tenure, interest_rate, emi_amount,
//       //     guarantor_aadhar, guarantor_pan, dealer_name, name_in_bank, bank_name,
//       //     account_number, ifsc, aadhar_number, pan_card, guarantor_co_applicant, guarantor_co_applicant_dob, product, lender,
//       //     agreement_date, status
//       //   ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? , ?, ?)
//       // `;

//       //     await db.promise().query(query, [
//       //       partnerLoanId,
//       //   lan,
//       //   row["LOGIN DATE"] ? excelDateToJSDate(row["LOGIN DATE"]) : null,
//       //   row["Customer Name"],
//       //   row["Borrower DOB"] ? excelDateToJSDate(row["Borrower DOB"]) : null,
//       //   row["Father Name"],
//       //   row["Address Line 1"],
//       //   row["Address Line 2"],
//       //   row["Village"],
//       //   row["District"],
//       //   row["State"],
//       //   row["Pincode"],
//       //   row["Mobile Number"],
//       //   row["Email"],
//       //   row["Occupation"],
//       //   row["Relationship with Borrower"],
//       //   row["CIBIL Score"],
//       //   row["GURANTOR/Co-Applicant CIBIL Score"], // ✅ New field
//       //   row["Loan Amount"],
//       //   row["Tenure"],
//       //   row["Interest Rate"],
//       //   row["EMI Amount"],
//       //   row["GURANTOR/Co-Applicant ADHAR"],
//       //   row["GURANTOR/Co-Applicant PAN"],
//       //   row["DEALER NAME"],
//       //   row["Name in Bank"],
//       //   row["Bank name"],
//       //   row["Account Number"],
//       //   row["IFSC"],
//       //   row["Aadhar Number"],
//       //   row["Pan Card"],
//       //   row["GURANTOR/Co-Applicant"], // ✅ New field
//       //   row["GURANTOR/Co-Applicant DOB"] ? excelDateToJSDate(row["GURANTOR/Co-Applicant DOB"]) : null, // ✅ New field
//       //   row["Product"],
//       //   lenderType,
//       //   row["Agreement Date"] ? excelDateToJSDate(row["LOGIN DATE"]) : null,
//       //   "Login"
//       //     ]);

//       // ✅ Insert Data into `loan_booking_ev`

//       const query = `
//   INSERT INTO loan_booking_ev (
//     partner_loan_id, lan, login_date, customer_name, borrower_dob, father_name,
//     address_line_1, address_line_2, village, district, state, pincode,
//     mobile_number, email, loan_amount, interest_rate, loan_tenure, emi_amount,
//     guarantor_name, guarantor_dob, guarantor_aadhar, guarantor_pan, dealer_name,
//     name_in_bank, bank_name, account_number, ifsc, aadhar_number, pan_card,
//     product, lender, agreement_date, status, disbursal_amount, processing_fee,
//     cibil_score, guarantor_cibil_score, relationship_with_borrower, co_applicant,
//     co_applicant_dob, co_applicant_aadhar, co_applicant_pan, co_applicant_cibil_score,
//     apr, battery_name, battery_type, battery_serial_no_1, battery_serial_no_2,
//     e_rikshaw_model, chassis_no, customer_name_as_per_bank, customer_bank_name,
//     customer_account_number, bank_ifsc_code
//   ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
// `;

//       await db.promise().query(query, [
//         partnerLoanId,
//         lan,
//         row["LOGIN DATE"] ? excelDateToJSDate(row["LOGIN DATE"]) : null,
//         row["Customer Name"],
//         row["Borrower DOB"] ? excelDateToJSDate(row["Borrower DOB"]) : null,
//         row["Father Name"],
//         row["Address Line 1"],
//         row["Address Line 2"],
//         row["Village"],
//         row["District"],
//         row["State"],
//         row["Pincode"],
//         row["Mobile Number"],
//         row["Email"] || null, // Assuming email might be optional
//         row["Loan Amount"],
//         row[" Interest Rate "],
//         row["Tenure"],
//         row["EMI Amount"] || null, // Optional if not provided
//         row["GURANTOR"],
//         row["GURANTOR DOB"] ? excelDateToJSDate(row["GURANTOR DOB"]) : null,
//         row["GURANTOR ADHAR"],
//         row["GURANTOR PAN"],
//         row["DEALER NAME"],
//         row["Name in Bank"],
//         row["Bank name"],
//         row["Account Number"],
//         row["IFSC"],
//         row["Aadhar Number"],
//         row["Pan Card"],
//         row["Product"],
//         row["lender"] || "EV_loan", // Default value as per table definition
//         row["Agreement Date"] ? excelDateToJSDate(row["LOGIN DATE"]) : null,
//         row["status"] || "Login", // Default value as per table definition
//         row["Disbursal Amount"] || null, // Optional if not provided
//         row["Processing Fee"] || 0.0, // Default value as per table definition
//         row["CIBIL Score"],
//         row["GURANTOR CIBIL Score"],
//         row["Relationship with Borrower"],
//         row["Co-Applicant"],
//         row["Co-Applicant DOB"]
//           ? excelDateToJSDate(row["Co-Applicant DOB"])
//           : null,
//         row["Co-Applicant AADHAR"],
//         row["Co-Applicant PAN"],
//         row["Co-Applicant CIBIL Score"],
//         row["APR"],
//         row["Battery Name"],
//         row["Battery Type"],
//         row["Battery Serial no 1"],
//         row["Battery Serial no 2"],
//         row["E-Rikshaw model"],
//         row["Chassis no"],
//         row["Customer Name as per bank"] || null, // New field
//         row["Customer Bank name"] || null, // New field
//         row["Customer Account Number"] || null, // New field
//         row["Bank IFSC Code"] || null, // New field
//       ]);

//       console.log(
//         `✅ Inserted loan for Interst Rate: ${interestRate}, Aadhar: ${aadharNumber}, LAN: ${lan}`
//       );
//     }

//     res.json({ message: "File uploaded and data saved successfully." });
//   } catch (error) {
//     console.error("❌ Error in Upload Process:", error);

//     res.status(500).json({
//       message: "Upload failed. Please try again.",
//       error: error.sqlMessage || error.message,
//     });
//   }
// });

// router.post("/upload", upload.single("file"), async (req, res) => {
//   if (!req.file)
//     return res
//       .status(400)
//       .json({ message: "No file uploaded. Please select a valid file." });

//   if (!req.body.lenderType)
//     return res.status(400).json({ message: "Lender type is required." });

//   try {
//     const lenderType = req.body.lenderType.trim();
//     if (lenderType !== "EV Loan") {
//       return res
//         .status(400)
//         .json({ message: "Invalid upload lender type. Only EV Loan is supported." });
//     }

//     // Read Excel
//     const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
//     const sheetName = workbook.SheetNames[0];
//     const sheetData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

//     if (!sheetData || sheetData.length === 0) {
//       return res.status(400).json({ message: "Uploaded Excel file is empty or invalid." });
//     }

//     // Accumulate per-row results instead of returning mid-loop
//     const success_rows = [];
//     const row_errors = [];

//     for (let i = 0; i < sheetData.length; i++) {
//       const row = sheetData[i];
//       const R = i + 2; // excel row (header on row 1)
//       try {
//         const rowLender = (row["lender"] || "").trim();
//         const panCard = row["Pan Card"];
//         const aadharNumber = row["Aadhar Number"];
//         const interestRate = row[" Interest Rate "]; // <-- use consistent header

//         // Per-row validations
//         if (rowLender !== "EV Loan") {
//           row_errors.push({ row: R, stage: "validation", reason: "Invalid lender type in row. Only EV Loan is supported." });
//           continue;
//         }

//         if (!panCard && !aadharNumber) {
//           row_errors.push({ row: R, stage: "validation", reason: "PAN or Aadhar is required in row." });
//           continue;
//         }

//         if (!interestRate || isNaN(interestRate) || interestRate <= 0) {
//           row_errors.push({ row: R, stage: "validation", reason: "Valid Interest Rate is required in row." });
//            continue;
//         }

//         // Duplicate check
//         const [existingRecords] = await db
//           .promise()
//           .query(
//             `SELECT lan FROM loan_booking_ev WHERE pan_card = ?`,
//             [panCard || null]
//           );

//         if (existingRecords.length > 0) {
//           row_errors.push({
//             row: R,
//             stage: "dup-check",
//             reason: `Customer already exists. Duplicate found for Pan Card: ${panCard || ""} or Aadhar Number: ${aadharNumber || ""}`,
//           });
//           continue;
//         }

//         // Generate IDs
//         const { partnerLoanId, lan } = await generateLoanIdentifiers(lenderType);

//         // INSERT (54 columns ↔ 54 placeholders)
//         const query = `
//           INSERT INTO loan_booking_ev (
//             partner_loan_id, lan, login_date, customer_name, borrower_dob, father_name,
//             address_line_1, address_line_2, village, district, state, pincode,
//             mobile_number, email, loan_amount, interest_rate, loan_tenure, emi_amount,
//             guarantor_name, guarantor_dob, guarantor_aadhar, guarantor_pan, dealer_name,
//             name_in_bank, bank_name, account_number, ifsc, aadhar_number, pan_card,
//             product, lender, agreement_date, status, disbursal_amount, processing_fee,
//             cibil_score, guarantor_cibil_score, relationship_with_borrower, co_applicant,
//             co_applicant_dob, co_applicant_aadhar, co_applicant_pan, co_applicant_cibil_score,
//             apr, battery_name, battery_type, battery_serial_no_1, battery_serial_no_2,
//             e_rikshaw_model, chassis_no, customer_name_as_per_bank, customer_bank_name,
//             customer_account_number, bank_ifsc_code
//           ) VALUES (
//             ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
//             ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
//             ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
//             ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
//           )
//         `;

//         await db.promise().query(query, [
//           partnerLoanId,                                   // 1
//           lan,                                             // 2
//           row["LOGIN DATE"] ? excelDateToJSDate(row["LOGIN DATE"]) : null, // 3
//           row["Customer Name"],                            // 4
//           row["Borrower DOB"] ? excelDateToJSDate(row["Borrower DOB"]) : null, // 5
//           row["Father Name"],                              // 6
//           row["Address Line 1"],                           // 7
//           row["Address Line 2"],                           // 8
//           row["Village"],                                  // 9
//           row["District"],                                 // 10
//           row["State"],                                    // 11
//           row["Pincode"],                                  // 12
//           row["Mobile Number"],                            // 13
//           row["Email"] || null,                            // 14
//           row["Loan Amount"],                              // 15
//           row[" Interest Rate "],                            // 16
//           row["Tenure"],                                   // 17
//           row["EMI Amount"] || null,                       // 18
//           row["GURANTOR"],                                 // 19
//           row["GURANTOR DOB"] ? excelDateToJSDate(row["GURANTOR DOB"]) : null, // 20
//           row["GURANTOR ADHAR"],                           // 21
//           row["GURANTOR PAN"],                             // 22
//           row["DEALER NAME"],                              // 23
//           row["Name in Bank"],                             // 24
//           row["Bank name"],                                // 25
//           row["Account Number"],                           // 26
//           row["IFSC"],                                     // 27
//           row["Aadhar Number"],                            // 28
//           row["Pan Card"],                                  // 29
//           row["Product"],                                  // 30
//           row["lender"] || "EV Loan",                      // 31  (standardized default)
//           row["Agreement Date"] ? excelDateToJSDate(row["Agreement Date"]) : null, // 32 (fixed mapping)
//           row["status"] || "Login",                        // 33
//           row["Disbursal Amount"] || null,                 // 34
//           row["Processing Fee"] || 0.0,                    // 35
//           row["CIBIL Score"],                              // 36
//           row["GURANTOR CIBIL Score"],                     // 37
//           row["Relationship with Borrower"],               // 38
//           row["Co-Applicant"],                             // 39
//           row["Co-Applicant DOB"] ? excelDateToJSDate(row["Co-Applicant DOB"]) : null, // 40
//           row["Co-Applicant AADHAR"],                      // 41
//           row["Co-Applicant PAN"],                         // 42
//           row["Co-Applicant CIBIL Score"],                 // 43
//           row["APR"],                                      // 44
//           row["Battery Name"],                             // 45
//           row["Battery Type"],                             // 46
//           row["Battery Serial no 1"],                      // 47
//           row["Battery Serial no 2"],                      // 48
//           row["E-Rikshaw model"],                          // 49
//           row["Chassis no"],                               // 50
//           row["Customer Name as per bank"] || null,        // 51
//           row["Customer Bank name"] || null,               // 52
//           row["Customer Account Number"] || null,          // 53
//           row["Bank IFSC Code"] || null,                   // 54
//         ]);

//         success_rows.push({ row: R, lan, partnerLoanId, interestRate });
//         console.log(`✅ Inserted row ${R} | Aadhar: ${row["Aadhar Number"]} | LAN: ${lan}`);
//       } catch (err) {
//         row_errors.push({ row: R, stage: "insert", reason: err.sqlMessage || err.message });
//         console.error(`❌ Row ${R} failed:`, err);
//       }
//     }

//     return res.json({
//       message: "File processed.",
//       total_rows: sheetData.length,
//       inserted_rows: success_rows.length,
//       failed_rows: row_errors.length,
//       success_rows,
//       row_errors,
//     });
//   } catch (error) {
//     console.error("❌ Error in Upload Process:", error);
//     return res.status(500).json({
//       message: "Upload failed. Please try again.",
//       error: error.sqlMessage || error.message,
//     });
//   }
// });
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
          (field) => !row[field] || String(row[field]).trim() === ""
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
        const { partnerLoanId, lan } = await generateLoanIdentifiers(
          lenderType
        );

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
      (f) => !data[f] || String(data[f]).trim() === ""
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

    await db.promise().query(query, [
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

    console.log(`✅ Manual EV Loan inserted | LAN: ${lan} | PAN: ${data.Pan_Card}`);

    return res.json({
      message: "EV Loan manually inserted successfully.",
      lan,
      partnerLoanId,
    });
  } catch (err) {
    console.error("❌ Manual entry failed:", err);
    return res.status(500).json({
      message: "Manual entry failed.",
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
          (field) => !row[field] || String(row[field]).trim() === ""
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
            reason: "Invalid lender type in row. Only HEY EV Loan is supported.",
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
        const { partnerLoanId, lan } = await generateLoanIdentifiers(
          lenderType
        );

const loanAmt = Number(row["Loan Amount"]) || 0;
const fldgPercent = Number(row["FLDG"]) || 0;   // e.g., 5 = 5%
const processPercent = Number(row["PROCESS FEE"]) || 0; // e.g., 2 = 2%

// Convert percentages to amounts
const fldgValue = loanAmt * (fldgPercent / 100);
const processFeeValue = loanAmt * (processPercent / 100);

// GST on process fee
const gstValue = processFeeValue * 0.18;

// Final disbursement amount
const disbursementAmount = loanAmt - (fldgValue + processFeeValue + gstValue);



        // ✅ Insert into DB
        const query = `
          INSERT INTO loan_booking_hey_ev (
            partner_loan_id, lan, login_date, customer_name, borrower_dob, father_name,
            address_line_1, address_line_2, village, district, state, pincode,
            mobile_number, email, loan_amount, interest_rate, loan_tenure,fldg,process_fee,emi_amount,
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
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,?,?
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


/////////////////////////// NEW CODE FOR HEY EV Battery LOAN DATA CROOS CHECK AND INSERTION //////////////////////

router.post(
  "/hey-ev-battery-upload",
  upload.single("file"),
  async (req, res) => {
    if (!req.file) {
      return res
        .status(400)
        .json({ message: "No file uploaded. Please select a valid file." });
    }

    if (!req.body.lenderType) {
      return res.status(400).json({ message: "Lender type is required." });
    }

    try {
      const lenderType = req.body.lenderType.trim();
      if (lenderType !== "HeyEV Battery") {
        return res.status(400).json({
          message:
            "Invalid upload lender type. Only HeyEV Battery is supported for this endpoint.",
        });
      }

      const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
      const sheetName = workbook.SheetNames[0];
      const sheetData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

      if (!sheetData || sheetData.length === 0) {
        return res.status(400).json({
          message: "Uploaded Excel file is empty or invalid.",
        });
      }

      // 43 required Excel fields
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
        "Eligible Loan Amount",
        "Loan Amount",
        " Interest Rate ",
        "Tenure",
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
        "Risk Category",
        "Risk bucket",
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
        "CKYC NO",
        "E-Rickshaw No.",
      ];

      const success_rows = [];
      const row_errors = [];

      for (let i = 0; i < sheetData.length; i++) {
        const row = sheetData[i];
        const R = i + 2; // Excel row (header = 1)

        try {
          // 1) Required-field validation
          const missingFields = requiredFields.filter(
            (field) => !row[field] || String(row[field]).trim() === ""
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
          if (rowLender !== "HeyEV Battery") {
            row_errors.push({
              row: R,
              stage: "validation",
              reason:
                "Invalid lender type in row. Only HeyEV Battery is supported for this sheet.",
            });
            continue;
          }

          const interestRate = Number(row[" Interest Rate "]);
          if (isNaN(interestRate) || interestRate <= 0) {
            row_errors.push({
              row: R,
              stage: "validation",
              reason: "Valid numeric Interest Rate is required.",
            });
            continue;
          }

          const aadharNumber = String(row["Borrower Aadhar Number"]).trim();
          const panCard = String(row["Borrower Pan Card"]).trim();

          // 2) Duplicate check on PAN in battery table
          const [existingRecords] = await db
            .promise()
            .query(
              `SELECT lan FROM loan_booking_hey_ev_battery WHERE borrower_pan_card = ?`,
              [panCard || null]
            );

          if (existingRecords.length > 0) {
            row_errors.push({
              row: R,
              stage: "dup-check",
              reason: `Customer already exists. Duplicate found for Pan Card: ${panCard}`,
            });
            continue;
          }

          // 3) Generate IDs
          const { partnerLoanId, lan } = await generateLoanIdentifiers(
            lenderType
          );

          // 4) Prepare values
          const loanAmount = Number(row["Loan Amount"]) || 0;
          const apr = Number(row["APR"]) || 0;

          const insertQuery = `
            INSERT INTO loan_booking_hey_ev_battery (
              partner_loan_id, lan,
              login_date, customer_name, borrower_dob, father_name,
              address_line_1, address_line_2, village, district, state, pincode,
              mobile_number, invoice_amount, ltv, eligible_loan_amount, loan_amount,
              interest_rate, tenure, dealer_name, name_in_bank, bank_name, account_number,
              ifsc, borrower_aadhar_number, borrower_pan_card, product, lender,
              agreement_date, cibil_score, risk_category, risk_bucket, apr,
              customer_name_as_per_bank, customer_bank_name, customer_account_number,
              bank_ifsc_code, battery_name, battery_type, battery_serial_no_1,
              charger_serial_no, e_rikshaw_model, chassis_no, ckyc_no, e_rickshaw_no,
              status
            ) VALUES (
              ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
              ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
              ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
              ?, ?, ?, ?, ?, ?, ?, ?, ?
            )
          `;

          await db.promise().query(insertQuery, [
            partnerLoanId,
            lan,
            row["LOGIN DATE"] ? excelDateToJSDate(row["LOGIN DATE"]) : null,
            row["Customer Name"],
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
            row["Invoice Amount"],
            row["LTV"],
            row["Eligible Loan Amount"],
            loanAmount,
            interestRate,
            row["Tenure"],
            row["DEALER NAME"],
            row["Name in Bank"],
            row["Bank name"],
            row["Account Number"],
            row["IFSC"],
            aadharNumber,
            panCard,
            row["Product"],
            row["lender"],
            row["Agreement Date"]
              ? excelDateToJSDate(row["Agreement Date"])
              : null,
            row["CIBIL Score"],
            row["Risk Category"],
            row["Risk bucket"],
            apr,
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
            row["CKYC NO"],
            row["E-Rickshaw No."],
            "Login", // default status
          ]);

          success_rows.push({ row: R, lan, partnerLoanId, interestRate });
          console.log(
            `✅ [Battery] Inserted row ${R} | PAN: ${panCard} | LAN: ${lan}`
          );
        } catch (err) {
          row_errors.push({
            row: R,
            stage: "insert",
            reason: err.sqlMessage || err.message,
          });
          console.error(`❌ [Battery] Row ${R} failed:`, err);
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
  }
);


///////////////////////////////////////////////////////////////////////////////////

// POST /api/loan-booking/create
// router.post("/create",verifyApiKey, async (req, res) => {
//   const row = req.body;
//   const lenderType = row.lender || "EV Loan";

//   try {
//     if (!row["Pan Card"] || !row["Aadhar Number"]) {
//       return res.status(400).json({ message: "PAN and Aadhar are required" });
//     }

//     const [existingRecords] = await db
//       .promise()
//       .query(`SELECT lan FROM loan_bookings WHERE pan_card = ? OR aadhar_number = ?`, [
//         row["Pan Card"],
//         row["Aadhar Number"],
//       ]);

//     if (existingRecords.length > 0) {
//       return res.json({
//         message: `Customer already exists for PAN: ${row["Pan Card"]} or Aadhar: ${row["Aadhar Number"]}`,
//       });
//     }

//     const { partnerLoanId, lan } = await generateLoanIdentifiers(lenderType);

//     const query = `
//       INSERT INTO loan_bookings (
//         partner_loan_id, lan, login_date, customer_name, borrower_dob, father_name,
//         address_line_1, address_line_2, village, district, state, pincode,
//         mobile_number, email, occupation, relationship_with_borrower, cibil_score,
//         guarantor_co_cibil_score, loan_amount, loan_tenure, interest_rate, emi_amount,
//         guarantor_aadhar, guarantor_pan, dealer_name, name_in_bank, bank_name,
//         account_number, ifsc, aadhar_number, pan_card, product, lender,
//         agreement_date, status
//       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
//     `;

//     await db.promise().query(query, [
//       partnerLoanId,
//       lan,
//       row["LOGIN DATE"] ? excelDateToJSDate(row["LOGIN DATE"]) : null,
//       row["Customer Name"],
//       row["Borrower DOB"] ? excelDateToJSDate(row["Borrower DOB"]) : null,
//       row["Father Name"],
//       row["Address Line 1"],
//       row["Address Line 2"],
//       row["Village"],
//       row["District"],
//       row["State"],
//       row["Pincode"],
//       row["Mobile Number"],
//       row["Email"],
//       row["Occupation"],
//       row["Relationship with Borrower"],
//       row["CIBIL Score"],
//       row["GURANTOR/Co-Applicant CIBIL Score"],
//       row["Loan Amount"],
//       row["Tenure"],
//       row["Interest Rate"],
//       row["EMI Amount"],
//       row["GURANTOR/Co-Applicant ADHAR"],
//       row["GURANTOR/Co-Applicant PAN"],
//       row["DEALER NAME"],
//       row["Name in Bank"],
//       row["Bank name"],
//       row["Account Number"],
//       row["IFSC"],
//       row["Aadhar Number"],
//       row["Pan Card"],
//       row["Product"],
//       lenderType,
//       row["Agreement Date"] ? excelDateToJSDate(row["Agreement Date"]) : null,
//       "Approved"
//     ]);

//     res.json({ message: "Loan created successfully", lan });
//   } catch (err) {
//     console.error("❌ Loan create error:", err);
//     res.status(500).json({ message: "Error creating loan", error: err.message });
//   }
// });

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

// function toIsoDateSafe(input) {
//   if (input === null || input === undefined) return null;

//   // If xlsx returned a real JS Date (when using cellDates: true)
//   if (input instanceof Date && !Number.isNaN(input.getTime())) {
//     return input.toISOString().split("T")[0];
//   }

//   // Excel serial number (days since 1899-12-30; adjust for 1900-02-29 bug)
//   if (typeof input === "number" && Number.isFinite(input)) {
//     const excelEpoch = Date.UTC(1899, 11, 30);
//     const days = Math.trunc(input);
//     const msWholeDays = (days - (days >= 60 ? 1 : 0)) * 86400000;
//     const msFracDay = Math.round((input - days) * 86400000);
//     return new Date(excelEpoch + msWholeDays + msFracDay)
//       .toISOString()
//       .split("T")[0];
//   }

//   // Normalize strings
//   const s = String(input).trim();
//   if (!s) return null;

//   // YYYY-MM-DD
//   let m;
//   if ((m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s))) {
//     return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
//       .toISOString()
//       .split("T")[0];
//   }

//   // DD/MM/YYYY or DD-MM-YYYY
//   if ((m = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/.exec(s))) {
//     return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]))
//       .toISOString()
//       .split("T")[0];
//   }

//   // DD-MMM-YY (e.g., 20-Aug-25)
//   if ((m = /^(\d{1,2})-([A-Za-z]{3})-(\d{2})$/.exec(s))) {
//     const months = {
//       Jan: 0,
//       Feb: 1,
//       Mar: 2,
//       Apr: 3,
//       May: 4,
//       Jun: 5,
//       Jul: 6,
//       Aug: 7,
//       Sep: 8,
//       Oct: 9,
//       Nov: 10,
//       Dec: 11,
//     };
//     const day = +m[1];
//     const mon = months[m[2]];
//     const year = 2000 + +m[3]; // assume 20xx
//     if (mon !== undefined) {
//       return new Date(Date.UTC(year, mon, day)).toISOString().split("T")[0];
//     }
//   }

//   // Last resort
//   const dt = new Date(s);
//   return Number.isNaN(dt.getTime()) ? null : dt.toISOString().split("T")[0];
// }

router.get("/login-loans", (req, res) => {
  const { table = "loan_booking_ev", prefix = "EV" } = req.query;

  const allowedTables = {
    loan_bookings: true,
    loan_booking_ev: true,
    loan_booking_hey_ev:true,
    loan_booking_adikosh: true,
    loan_booking_gq_non_fsf: true,
    loan_booking_gq_fsf: true,
    loan_bookings_wctl: true,
    loan_booking_emiclub: true,
    loan_booking_finso: true,
    loan_booking_circle_pe: true,
    loan_booking_hey_ev_battery:true,
  };

  if (!allowedTables[table]) {
    return res.status(400).json({ message: "Invalid table name" });
  }

  const query = `SELECT * FROM ?? WHERE status = 'Login' AND LAN LIKE ?`;
  const values = [table, `${prefix}%`];

  db.query(query, values, (err, results) => {
    if (err) {
      console.error("Error fetching login stage loans:", err);
      return res.status(500).json({ message: "Database error" });
    }
    res.json(results);
  });
});

router.get("/approve-initiate-loans", (req, res) => {
  const { table = "loan_booking_ev", prefix = "EV" } = req.query;

  const allowedTables = {
    loan_bookings: true,
    loan_booking_ev: true,
    loan_booking_hey_ev:true,
    loan_booking_adikosh: true,
    loan_booking_gq_non_fsf: true,
    loan_booking_gq_fsf: true,
    loan_bookings_wctl: true,
    loan_booking_emiclub: true,
    loan_booking_finso: true,
    loan_booking_circle_pe: true,
    loan_booking_hey_ev_battery:true,
  };

  if (!allowedTables[table]) {
    return res.status(400).json({ message: "Invalid table name" });
  }

  const query = `SELECT * FROM ?? WHERE status = 'Disburse initiate' AND LAN LIKE ?`;
  const values = [table, `${prefix}%`];

  db.query(query, values, (err, results) => {
    if (err) {
      console.error("Error fetching login stage loans:", err);
      return res.status(500).json({ message: "Database error" });
    }
    res.json(results);
  });
});

router.get("/all-loans", (req, res) => {
  const { table = "loan_bookings", prefix = "BL" } = req.query;

  const allowedTables = {
    loan_bookings: true,
    loan_booking_ev: true,
    loan_booking_adikosh: true,
    loan_booking_gq_non_fsf: true,
    loan_booking_gq_fsf: true,
    loan_bookings_wctl: true,
    loan_booking_hey_ev:true,
    loan_booking_emiclub: true,
    loan_booking_embifi: true,
    loan_booking_finso: true,
    loan_booking_circle_pe: true,
    loan_booking_hey_ev_battery:true,
  };

  if (!allowedTables[table]) {
    return res.status(400).json({ message: "Invalid table name" });
  }

  const query = `SELECT lb.*, DATE_FORMAT(CONVERT_TZ(edu.disbursement_date, '+00:00', '+05:30'), '%Y-%m-%d %H:%i:%s') AS disbursement_date
FROM ?? AS lb
LEFT JOIN ev_disbursement_utr AS edu ON edu.LAN = lb.LAN
WHERE lb.LAN LIKE ?`;
  const values = [table, `${prefix}%`];

  db.query(query, values, (err, results) => {
    if (err) {
      console.error("Error fetching approved loans:", err);
      return res.status(500).json({ message: "Database error" });
    }
    res.json(results);
  });
});

router.get("/approved-loans", (req, res) => {
  const { table = "loan_booking_ev", prefix = "EV" } = req.query;

  const allowedTables = {
    loan_bookings: true,
    loan_booking_ev: true,
    loan_booking_hey_ev:true,
    loan_booking_adikosh: true,
    loan_booking_gq_non_fsf: true,
    loan_booking_gq_fsf: true,
    loan_bookings_wctl: true,
    loan_booking_emiclub: true,
    loan_booking_embifi: true,
    loan_booking_finso: true,
    loan_booking_circle_pe: true,
    loan_booking_hey_ev_battery:true,
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
  const { table = "loan_booking_ev", prefix = "EV" } = req.query;

  const allowedTables = {
    loan_bookings: true,
    loan_booking_adikosh: true,
    loan_booking_gq_non_fsf: true,
    loan_booking_gq_fsf: true,
    loan_booking_emiclub: true,
    loan_bookings_wctl: true,
    loan_booking_ev: true,
    loan_booking_hey_ev:true,
    loan_booking_embifi: true,
    loan_booking_finso: true,
    loan_booking_circle_pe: true,
    loan_booking_hey_ev_battery:true,
  };

  if (!allowedTables[table]) {
    return res.status(400).json({ message: "Invalid table name" });
  }

  const query = `SELECT lb.*, DATE_FORMAT(CONVERT_TZ(edu.disbursement_date, '+00:00', '+05:30'), '%Y-%m-%d %H:%i:%s') AS disbursement_date
FROM ?? AS lb
LEFT JOIN ev_disbursement_utr AS edu ON edu.LAN = lb.LAN
WHERE lb.status = 'Disbursed' AND lb.LAN LIKE ?
`;
  const values = [table, `${prefix}%`];

  db.query(query, values, (err, results) => {
    if (err) {
      console.error("Error fetching disbursed loans:", err);
      return res.status(500).json({ message: "Database error" });
    }
    res.json(results);
  });
});

// router.put("/login-loans/:lan", (req, res) => {
//   const lan = req.params.lan;
//   const { status, table } = req.body;

//   const allowedTables = {
//     "loan_bookings": true,
//     "loan_booking_adikosh": true,
//     "loan_booking_gq_non_fsf": true,
//     "loan_booking_gq_fsf": true,
//     "loan_bookings_wctl": true,
//     "loan_booking_ev": true
//   };

//   if (!allowedTables[table]) {
//     return res.status(400).json({ message: "Invalid table name" });
//   }

//   if (!["approved", "rejected"].includes(status)) {
//     return res.status(400).json({ message: "Invalid status value" });
//   }

//   const query = `UPDATE ?? SET status = ? WHERE lan = ?`;
//   const values = [table, status, lan];

//   db.query(query, values, (err, result) => {
//   if (err) {
//     console.error("Error updating loan status:", err);
//     return res.status(500).json({ message: "Database error", error: err });
//   }
//   if (result.affectedRows === 0) {
//     return res.status(404).json({ message: "Loan not found with LAN " + lan });
//   }
//   res.json({ message: `Loan with LAN ${lan} updated to ${status} in ${table}` });
// });

// });

/////////////////////////////////////////////////////////////////////////////////////

router.put("/login-loans/:lan", (req, res) => {
  const lan = req.params.lan;
  const { status, table } = req.body;

  const allowedTables = {
    loan_bookings: true,
    loan_booking_adikosh: true,
    loan_booking_gq_non_fsf: true,
    loan_booking_gq_fsf: true,
    loan_bookings_wctl: true,
    loan_booking_ev: true,
    loan_booking_hey_ev:true,
    loan_booking_emiclub: true,
    loan_booking_finso: true,
    loan_booking_circle_pe: true,
    loan_booking_hey_ev_battery:true,

  };

  if (!allowedTables[table]) {
    return res.status(400).json({ message: "Invalid table name" });
  }

  if (!["Disburse initiate", "rejected"].includes(status)) {
    return res.status(400).json({ message: "Invalid status value" });
  }

  const query = `UPDATE ?? SET status = ? WHERE lan = ?`;
  const values = [table, status, lan];

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

          console.log(lan, "lan", status, "status", partnerLoanId, "partner loan id", customerName , "customer name");

          // ✅ WEBHOOK — for FINS loans only
          if (lan.startsWith("FINS")) {
            const webhookUrl =process.env.FINS_DISBINITIATE_WEBHOOK_URL;
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
                auth:{
                  username,
                  password,
                },
                headers:{
                  "Content-Type":"application/json",
                },
              });
              console.log(`✅ Webhook sent for ${lan} (${status})`);
            } catch (webhookErr) {
              console.error("❌ Error sending webhook:", webhookErr.message);
            }
          }
        }
      }
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

router.put("/approve-initiated-loans/:lan", (req, res) => {
  const lan = req.params.lan;
  const { status, table } = req.body;

  const allowedTables = {
    loan_bookings: true,
    loan_booking_adikosh: true,
    loan_booking_gq_non_fsf: true,
    loan_booking_gq_fsf: true,
    loan_booking_emiclub: true,
    loan_bookings_wctl: true,
    loan_booking_ev: true,
    loan_booking_hey_ev:true,
    loan_booking_finso: true,
    loan_booking_circle_pe: true,
    loan_booking_hey_ev_battery:true,
  };

  if (!allowedTables[table]) {
    return res.status(400).json({ message: "Invalid table name" });
  }

  if (!["approved", "rejected"].includes(status)) {
    return res.status(400).json({ message: "Invalid status value" });
  }

  const query = `UPDATE ?? SET status = ? WHERE lan = ?`;
  const values = [table, status, lan];

  db.query(query, values, async (err, result) => {
    if (err) {
      console.error("Error updating loan status:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    if (result.affectedRows === 0) {
      return res
        .status(404)
        .json({ message: "Loan not found with LAN " + lan });
    }

    // // ✅ Fetch loan amount for email
    // db.query(
    //   `SELECT customer_name, loan_amount, batch_id FROM ?? WHERE lan = ?`,
    //   [table, lan],
    //   async (fetchErr, rows) => {
    //     if (fetchErr) {
    //       console.error("Error fetching loan details:", fetchErr);
    //     } else if (rows.length > 0) {
    //       const {
    //         loan_amount: loanAmount,
    //         customer_name: customerName,
    //         batch_id: batchId,
    //       } = rows[0];

    //       // ✅ Only trigger email if LAN starts with "ADK"
    //       if (lan.startsWith("ADK")) {
    //         try {
    //           await sendLoanStatusMail({
    //             to: [
    //               "abhishek@getkosh.com",
    //               "ravikumar@nfcpl.in",
    //               "vineet.ranjan@getkosh.com",
    //               "rajeev@nfcpl.in",
    //             ],
    //             customerName,
    //             batchId,
    //             loanAmount,
    //             status,
    //           });
    //           console.log(`Email sent for ${lan} (${status})`);
    //         } catch (mailErr) {
    //           console.error("Error sending email:", mailErr);
    //         }
    //       }
    //     }
    //   }
    // );

    res.json({
      message: `Loan with LAN ${lan} updated to ${status} in ${table}`,
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
            applicant_address, applicant_state, applicant_city, applicant_pin_code,
            coapplicant_address, coapplicant_state, coapplicant_pin_code,
            bureau_score, monthly_income, account_no, ifsc_code,
            gps_device_cost, gst_on_gps_device, total_gps_device_cost, new_interest
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
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
            applicant_city,
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
      // ✅ Log specific fields

      const borrowerDOB = row["BORROWER DOB"]
        ? excelDateToJSDate(row["BORROWER DOB"])
        : null;

      const query = `
      INSERT INTO loan_bookings (
        partner_loan_id, lan, login_date, customer_name, borrower_dob, father_name,
        address_line_1, address_line_2, village, district, state, pincode,
        mobile_number, email, occupation, relationship_with_borrower, cibil_score,
        guarantor_co_cibil_score, loan_amount, loan_tenure, interest_rate, emi_amount,
        guarantor_aadhar, guarantor_pan, dealer_name, name_in_bank, bank_name,
        account_number, ifsc, aadhar_number, pan_card, product, lender,
        agreement_date, status,loan_account_no, speridian_loan_account_no
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

      await db.promise().query(query, [
        partnerLoanId,
        lan,
        row["LOGIN DATE"] ? excelDateToJSDate(row["LOGIN DATE"]) : null,
        row["Customer Name"],
        row["BORROWER DOB"] ? excelDateToJSDate(row["BORROWER DOB"]) : null,
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
        row["Agreement Date"] ? excelDateToJSDate(row["Agreement Date"]) : null,
        "Approved",
        row["Loan Account No"], // ✅ New Column
        row["Speridian loan account no"], // ✅ New Column
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

///////////////////////////// UPLOAD_UTR by SAJAG JAIN /////////////////////////////////////

// router.post("/upload-utr", upload.single("file"), async (req, res) => {
//   if (!req.file) return res.status(400).json({ message: "No file uploaded" });

//   // New: collect detailed issues
//   const rowErrors = []; // {lan, utr, reason, stage}

//   try {
//     const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
//     const sheetData = xlsx.utils.sheet_to_json(
//       workbook.Sheets[workbook.SheetNames[0]]
//     );

//     let processedCount = 0;
//     const duplicateUTRs = [];
//     const missingLANs = [];
//     const insertedLANs = new Set();

//     for (const row of sheetData) {
//       const disbursementUTR = row["Disbursement UTR"];
//       const disbursementDate = excelDateToJSDate(row["Disbursement Date"]); // fixed
//       const lan = row["LAN"];

//       if (!disbursementUTR || !disbursementDate || !lan) {
//         const reason = `Missing required fields: ${
//           !disbursementUTR ? "Disbursement UTR " : ""
//         }${!disbursementDate ? "Disbursement Date " : ""}${
//           !lan ? "LAN" : ""
//         }`.trim();
//         console.log(`⚠️ Skipping row: ${reason} | ${JSON.stringify(row)}`);
//         rowErrors.push({ lan: lan || null, utr: disbursementUTR || null, reason, stage: "validation" });
//         continue;
//       }

//       // Fetch loan details by LAN type
//       let loanRes = [];
//       try {
//         if (lan.startsWith("GQN")) {
//           [loanRes] = await db.promise().query(
//             `SELECT loan_amount_sanctioned AS loan_amount, emi_day AS emi_date, interest_percent AS interest_rate, loan_tenure_months AS loan_tenure, subvention_amount, no_of_advance_emis, product, lender
//              FROM loan_booking_gq_non_fsf WHERE lan = ?`, [lan]
//           );
//         } else if (lan.startsWith("GQF")) {
//           [loanRes] = await db.promise().query(
//             `SELECT loan_amount_sanctioned AS loan_amount, emi_day AS emi_date, interest_percent AS interest_rate, loan_tenure_months AS loan_tenure, subvention_amount, no_of_advance_emis, product, lender
//              FROM loan_booking_gq_fsf WHERE lan = ?`, [lan]
//           );
//         } else if (lan.startsWith("E10")) {
//           [loanRes] = await db.promise().query(
//             `SELECT approved_loan_amount AS loan_amount, new_interest AS interest_rate, loan_tenure_months AS loan_tenure, product, lender
//              FROM loan_booking_embifi WHERE lan = ?`, [lan]
//           );
//         } else if (lan.startsWith("ADK")) {
//           [loanRes] = await db.promise().query(
//             `SELECT loan_amount, interest_rate, loan_tenure, salary_day, product, lender
//              FROM loan_booking_adikosh WHERE lan = ?`, [lan]
//           );
//         } else if (lan.startsWith("EV")) {
//           [loanRes] = await db.promise().query(
//             `SELECT loan_amount, interest_rate, loan_tenure, product, lender
//              FROM loan_booking_ev WHERE lan = ?`, [lan]
//           );
//         }
//         ////// this for EMI CLUB ////////
//           else if (lan.startsWith("FINE")) {
//           [loanRes] = await db.promise().query(
//             `SELECT loan_amount,roi_apr as interest_rate  , loan_tenure, product, lender
//              FROM loan_booking_emiclub WHERE lan = ?`, [lan]
//           );
//         } else {
//           [loanRes] = await db.promise().query(
//             `SELECT loan_amount, interest_rate, loan_tenure, product, lender
//              FROM loan_bookings WHERE lan = ?`, [lan]
//           );
//         }
//       } catch (err) {
//         rowErrors.push({ lan, utr: disbursementUTR, reason: `DB query error: ${toClientError(err).message}`, stage: "fetch-loan" });
//         continue;
//       }

//       if (loanRes.length === 0) {
//         console.warn(`🚫 LAN not found: ${lan}`);
//         missingLANs.push(lan);
//         rowErrors.push({ lan, utr: disbursementUTR, reason: "LAN not found", stage: "fetch-loan" });
//         continue;
//       }

//       const {
//         loan_amount,
//         emi_date,
//         interest_rate,
//         loan_tenure,
//         subvention_amount,
//         no_of_advance_emis,
//         salary_day,
//         product,
//         lender,
//       } = loanRes[0];

//       // Duplicate UTR check
//       try {
//         const [utrExists] = await db
//           .promise()
//           .query("SELECT 1 FROM ev_disbursement_utr WHERE Disbursement_UTR = ?", [disbursementUTR]);

//         if (utrExists.length > 0) {
//           console.warn(`⚠️ Duplicate UTR: ${disbursementUTR}`);
//           duplicateUTRs.push(disbursementUTR);
//           rowErrors.push({ lan, utr: disbursementUTR, reason: "Duplicate UTR", stage: "pre-insert" });
//           continue;
//         }
//       } catch (err) {
//         rowErrors.push({ lan, utr: disbursementUTR, reason: `DB check error: ${toClientError(err).message}`, stage: "pre-insert" });
//         continue;
//       }

//       // Transaction (UPDATED to make RPS + UTR + status atomic)
//       let conn;
//       try {
//         conn = await db.promise().getConnection();
//         await conn.beginTransaction();

//         try {
//           if (!insertedLANs.has(lan)) {
//             // 🔴 IMPORTANT: pass `conn` (transaction) into the RPS generator.
//             await generateRepaymentSchedule(
//               conn,
//               lan,
//               loan_amount,
//               emi_date,
//               interest_rate,
//               loan_tenure,
//               disbursementDate,
//               subvention_amount,
//               no_of_advance_emis,
//               salary_day,
//               product,
//               lender
//             );
//             insertedLANs.add(lan);
//           }
//         } catch (rpsErr) {
//           rowErrors.push({ lan, utr: disbursementUTR, reason: `RPS error: ${toClientError(rpsErr).message}`, stage: "rps" });
//           await conn.rollback();
//           continue;
//         }

//         try {
//           await conn.query(
//             "INSERT INTO ev_disbursement_utr (Disbursement_UTR, Disbursement_Date, LAN) VALUES (?, ?, ?)",
//             [disbursementUTR, disbursementDate, lan]
//           );
//         } catch (insertErr) {
//           rowErrors.push({ lan, utr: disbursementUTR, reason: `UTR insert error: ${toClientError(insertErr).message}`, stage: "utr-insert" });
//           await conn.rollback();
//           continue;
//         }

//         try {
//           if (lan.startsWith("GQN")) {
//             await conn.query("UPDATE loan_booking_gq_non_fsf SET status = 'Disbursed' WHERE lan = ?", [lan]);
//           } else if (lan.startsWith("GQF")) {
//             await conn.query("UPDATE loan_booking_gq_fsf SET status = 'Disbursed' WHERE lan = ?", [lan]);
//           } else if (lan.startsWith("E10")) {
//             await conn.query("UPDATE loan_booking_embifi SET status = 'Disbursed' WHERE lan = ?", [lan]);
//           } else if (lan.startsWith("EV")) {
//             await conn.query("UPDATE loan_booking_ev SET status = 'Disbursed' WHERE lan = ?", [lan]);
//             }
//             ///// this for EMI CLUB /////
//              else if (lan.startsWith("FINE")) {
//             await conn.query("UPDATE loan_booking_emiclub SET status = 'Disbursed' WHERE lan = ?", [lan]);
//           } else {
//             await conn.query("UPDATE loan_booking_adikosh SET status = 'Disbursed' WHERE lan = ?", [lan]);
//           }
//         } catch (statusErr) {
//           rowErrors.push({ lan, utr: disbursementUTR, reason: `Status update error: ${toClientError(statusErr).message}`, stage: "status-update" });
//           await conn.rollback();
//           continue;
//         }

//         await conn.commit();
//         processedCount++;
//       } catch (txErr) {
//         rowErrors.push({ lan, utr: disbursementUTR, reason: `Transaction error: ${toClientError(txErr).message}`, stage: "transaction" });
//         try { if (conn) await conn.rollback(); } catch (_) {}
//       } finally {
//         try { if (conn) conn.release(); } catch (_) {}
//       }
//     }

//     // Always return 200 with a structured summary so UI can show partial success + detailed reasons
//     return res.json({
//       message: `UTR upload completed. ${processedCount} record(s) inserted.`,
//       processed_count: processedCount,
//       duplicate_utr: duplicateUTRs,
//       missing_lans: missingLANs,
//       row_errors: rowErrors, // 👈 NEW: show every failure with a reason & stage
//     });

//   } catch (error) {
//     console.error("❌ Error during UTR upload:", error);
//     // For top-level crash (e.g., invalid Excel), return details too
//     return res.status(500).json({
//       message: "Upload failed",
//       details: toClientError(error),
//     });
//   }
// });

///////////////////////////////// SAJAG ADD NEW ABOVE WALA //////////////////////////////////////

// router.post("/gq-fsf-upload", upload.single("file"), async (req, res) => {
//   if (!req.file) return res.status(400).json({ message: "No file uploaded." });
//   if (!req.body.lenderType)
//     return res.status(400).json({ message: "Lender type is required." });

//   try {
//     const lenderType = req.body.lenderType;
//     const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
//     const sheetName = workbook.SheetNames[0];
//     const rawSheet = workbook.Sheets[sheetName];
//     const rawData = xlsx.utils.sheet_to_json(rawSheet, {
//       defval: "",
//       header: 1,
//     });

//     // Normalize headers
//     const rawHeaders = rawData[0];
//     const normalizedHeaders = {};
//     rawHeaders.forEach((header, i) => {
//       const norm = header
//         ?.toString()
//         .toLowerCase()
//         .replace(/\s+/g, " ")
//         .trim()
//         .replace(/[^a-z0-9]/g, "");
//       if (norm) normalizedHeaders[i] = header;
//     });

//     const sheetData = rawData.slice(1).map((row) => {
//       const formatted = {};
//       Object.entries(normalizedHeaders).forEach(([idx, original]) => {
//         formatted[original] = row[idx] ?? "";
//       });
//       return formatted;
//     });

//     if (sheetData.length === 0) {
//       return res
//         .status(400)
//         .json({ message: "Uploaded Excel file is empty or invalid." });
//     }

//     const skippedDueToCIBIL = [];

//     for (const row of sheetData) {
//       const panCard = row["PAN Number"];
//       const aadharNumber = row["Aadhaar Number"];
//       const rawCibil = row["Credit Score"] || row["CIBIL Score"];
//       const cibilScore = parseInt(rawCibil);

//       if (isNaN(cibilScore)) {
//         skippedDueToCIBIL.push({
//           ...row,
//           reason: "Missing or invalid CIBIL Score",
//         });
//         continue;
//       }

//       if (!(cibilScore >= 500 || cibilScore === -1)) {
//         skippedDueToCIBIL.push({ ...row, reason: "Low CIBIL Score" });
//         continue;
//       }

//       // const [existingRecords] = await db
//       //   .promise()
//       //   .query(
//       //     `SELECT lan FROM loan_booking_gq_fsf WHERE pan_number = ? OR aadhaar_number = ?`,
//       //     [panCard, aadharNumber]
//       //   );

//       // if (existingRecords.length > 0) {
//       //   return res.json({
//       //     message: `Customer already exists. Duplicate found for PAN: ${panCard} or Aadhaar: ${aadharNumber}`,
//       //   });
//       // }

//       const { partnerLoanId, lan } = await generateLoanIdentifiers(lenderType);

//       // try {
//       //   const { partnerLoanId, lan } = await generateLoanIdentifiers(lenderType);
//       // } catch (err) {
//       //   return res.status(400).json({ message: err.message });
//       // }

//       const parse = (v) =>
//         typeof v === "number"
//           ? v
//           : parseFloat((v ?? "").toString().replace(/[^0-9.]/g, "")) || 0;

//       await db.promise().query(
//         `INSERT INTO loan_booking_gq_fsf (
//           partner_loan_id, lan, app_id, product, customer_type, residence_type, loan_type, disbursal_type,
//     institute_account_number, beneficiary_name, ifsc_code, bank_name, aadhaar_number,
//     agreement_signature_type, loan_application_date, emi_day, company_name, fathers_name,
//     ckyc_no, customer_name, student_name, date_of_birth, gender, current_address_line1,
//     current_address_line2, current_address_line3, current_address_landmark, current_address_pincode,
//     current_address_city, current_address_state, proof_of_current_address, permanent_address_line1,
//     permanent_address_line2, permanent_address_line3, permanent_address_landmark, permanent_address_pincode,
//     permanent_address_city, permanent_address_state, office_address_line1, office_address_line2,
//     office_address_line3, office_address_landmark, office_address_pincode, office_address_city,
//     office_address_state, pan_number, employment_status, annual_income, credit_score, mobile_number,
//     email_id, institute, loan_amount_sanctioned, loan_tenure_months, monthly_emi,
//     interest_percent, monthly_interest_amount, no_of_advance_emis, processing_fee, processing_fee_tax,
//     advance_emi_total, subvention_amount, disbursal_amount, retention_percentage, retention_amount, actual_disbursement, to_be_recovered,
//     agreement_date, interest_rate_irr, flat_rate, nach_umrn, income_source,
//     status, monthly_income, age, lender, loan_amount, interest_rate, loan_tenure
//         ) VALUES (${new Array(79).fill("?").join(",")})`,
//         [
//           partnerLoanId,
//           lan,
//           row["APPLICATION ID"],
//           row["Product"],
//           row["Customer Type"],
//           row["Residence Type"],
//           row["Loan Type"],
//           row["Disbursal Type"],
//           row["Institute Account Number"],
//           row["Beneficiary Name"],
//           row["IFSC Code"],
//           row["Bank Name"],
//           aadharNumber,
//           row["Agreement Signature Type"],
//           row["Loan Application Date"]
//             ? excelDateToJSDate(row["Loan Application Date"])
//             : null,
//           parse(row["Emi Day"]),
//           row["Company Name"],
//           row["Fathers Name"],
//           row["CKYC No"],
//           row["Customer Name"],
//           row["Student Name"],
//           row["Date Of Birth"] ? excelDateToJSDate(row["Date Of Birth"]) : null,
//           row["Gender"],
//           row["Current Address Line 1"],
//           row["Current Address Line 2"],
//           row["Current Address Line 3"],
//           row["Current Address Landmark"],
//           row["Current Address Pincode"],
//           row["Current Address City"],
//           row["Current Address State"],
//           row["Proof of Current Address"],
//           row["Permanent Address Line 1"],
//           row["Permanent Address Line 2"],
//           row["Permanent Address Line 3"],
//           row["Permanent Address Landmark"],
//           row["Permanent Address Pincode"],
//           row["Permanent Address City"],
//           row["Permanent Address State"],
//           row["Office Address Line 1"],
//           row["Office Address Line 2"],
//           row["Office Address Line 3"],
//           row["Office Address Landmark"],
//           row["Office Address Pincode"],
//           row["Office Address City"],
//           row["Office Address State"],
//           panCard,
//           row["Employment Status"],
//           parse(row["Annual Income"]),
//           cibilScore,
//           row["Mobile Number"],
//           row["Email ID"],
//           row["Institute"],
//           parse(row["Loan Amount Sanctioned"]),
//           parse(row["Loan Tenure (Months)"]),
//           parse(row["Monthly EMI"]),
//           parse(row["Interest %"]),
//           parse(row["Monthly Interest Amount"]),
//           parse(row["No. Of Advance EMIs"]),
//           parse(row["Processing Fee"]),
//           parse(row["Processing Fee Tax"]),
//           parse(row["Advance EMI (Total)"]),
//           parse(row["Subvention Amount"]),
//           parse(row["Disbursal Amount"]),
//           parse(row["Retention Percentage"]),
//           parse(row["Retention Amount"]),
//           parse(row["Actual Disbursement"]),
//           parse(row["To be Recovered"]),
//           row["Agreement Date (DD-MMM-YYYY)"]
//             ? excelDateToJSDate(row["Agreement Date (DD-MMM-YYYY)"])
//             : null,
//           parse(row["Interest Rate (IRR %)"]),
//           parse(row["Flat Rate (%)"]),
//           row["Nach UMRN"],
//           row["Income Source"],
//           "Login",
//           parse(row["Monthly Income"]),
//           parse(row["Age"]),
//           lenderType,
//           parse(row["Loan Amount Sanctioned"]),
//           parse(row["Interest %"]),
//           parse(row["Loan Tenure (Months)"]),
//         ]
//       );
//     }

//     res.status(200).json({
//       message: "✅ File uploaded and valid data saved.",
//       skippedDueToCIBIL,
//       totalSkipped: skippedDueToCIBIL.length,
//     });
//   } catch (error) {
//     console.error("❌ Upload Error:", error);
//     res.status(500).json({
//       message: "Upload failed",
//       error: error.sqlMessage || error.message,
//     });
//   }
// });

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

        // Insert
        try {
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
            ]
          );

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
        [data.panCard, data.aadharNumber]
      );

    if (existingRecords.length > 0) {
      return res.json({
        message: `Customer already exists for Pan: ${data.panNumber} or Aadhar: ${data.aadharNumber}`,
      });
    }

    // ��� Generate Loan IDs
    const { partnerLoanId, lan } = await generateLoanIdentifiers(lenderType);
    const customerName = `${data.firstName || ""} ${
      data.lastName || ""
    }`.trim();
    const agreement_date = excelDateToJSDate(data.sanctionDate);
    // ��� Insert into DB
    await db.promise().query(
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
      ]
    );

    res.json({
      message: "Adikosh loan saved successfully.",
      partnerLoanId,
      lan,
    });
  } catch (error) {
    console.error("❌ Error in JSON Upload:", error);
    res.status(500).json({
      message: "Upload failed. Please try again.",
      error: error.sqlMessage || error.message,
    });
  }
});

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
    "interest_rate",
    "loan_tenure",
    "cibil_score",
    "product",
    "lender",
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
    ", "
  )}) VALUES ${PLACEHOLDERS}`;

  try {
    if (
      !req.partner ||
      (req.partner.name || "").toLowerCase().trim() !== "finso"
    ) {
      return res
        .status(403)
        .json({ message: "This route is only for Finso partner." });
    }
    // ✅ Extract lender from header (case-insensitive)
    const lenderTypeRaw = req.headers["x-lender"] ?? req.headers["lender"];
    const lenderType = lenderTypeRaw?.toString().trim();

    if (!lenderType) {
      return res
        .status(400)
        .json({ message: "Lender header is required (x-lender: Finso)." });
    }
    if (lenderType.toLowerCase() !== "finso") {
      return res.status(400).json({
        message: `Invalid lender: ${lenderType}. Only 'Finso' loans can be inserted.`,
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
      "product"
    ];

    const results = [];

    for (const raw of records) {
      try {
        // ✅ Normalize aliases just in case upstream uses different keys
        const data = {
          ...raw,
          account_number:
            raw.account_number ?? raw.account_no ?? raw.acc_no ?? null,
          ifsc: raw.ifsc ?? raw.bank_ifsc ?? null,
          processing_fee: raw.processing_fee ?? 0.0,
        };

        // ✅ Required fields validation
        const missingField = requiredFields.find(
          (f) => data[f] === undefined || data[f] === null || data[f] === ""
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
            [data.pan_card]
          );
        if (existing.length > 0) {
          results.push({
            message: `Customer already exists for Pan: ${data.pan_card}`,
            data,
          });
          continue;
        }

        // --- Generate loan code ---

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
          data.interest_rate,
          data.loan_tenure,
          data.cibil_score ?? null,
          data.product,
          lenderType,
          data.employment_type ?? null,
          data.pre_emi ?? null,
          data.processing_fee ?? 0.0,
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
            `INSERT loan_booking_finso: values=${values.length} != columns=${COLS.length}`
          );
        }

        // ✅ Insert record
        await db.promise().query(INSERT_SQL, values);
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
        <EnquiryReason>13</EnquiryReason> 
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

console.log("📨 Sending SOAP request (Finso)...");

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

          console.log("📥 Experian Status:", response.status);
          console.log("📥 Raw Response:", response.data?.substring(0, 1000));

          const parser = new XMLParser({ ignoreAttributes: false });
          const soapParsed = parser.parse(response.data);

          const encodedInnerXml =
            soapParsed["SOAP-ENV:Envelope"]?.["SOAP-ENV:Body"]?.["ns2:processResponse"]?.["ns2:out"];

          if (encodedInnerXml) {
            const decodedInnerXml = he.decode(encodedInnerXml);
            parsedXmlToStore = decodedInnerXml;

            const innerParsed = parser.parse(decodedInnerXml);

            const scoreStr =
              innerParsed?.INProfileResponse?.SCORE?.BureauScore ?? null;

            score = scoreStr ? Number(scoreStr) : null;

            console.log("🎯 FINSO CIBIL SCORE =", score);
          }

          await db.promise().query(
            `INSERT INTO loan_cibil_reports (lan, pan_number, score, report_xml, created_at)
             VALUES (?,?,?,?, NOW())`,
            [lan, data.pan_card, score, parsedXmlToStore]
          );

          await db
            .promise()
            .execute(`UPDATE loan_booking_finso SET cibil_score_fintree = ? WHERE lan = ?`, [
              score,
              lan,
            ]);

          console.log("✅ CIBIL saved for FINSO LAN:", lan);
        } catch (err) {
          console.error("⚠️ CIBIL Pull Failed:", err.message);
          console.error("➡️ Status:", err.response?.status);
          console.error("➡️ Raw:", err.response?.data);
        }

        //////////////////////////////////////////
        //        🔍 BEURO SCORE END            //
        //////////////////////////////////////////

        results.push({
          message: "Finso loan saved successfully.",
          partner_loan_id: data.partner_loan_id,
          lan,
        });

      } catch (e) {
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
      message: "Finso upload completed.",
      results,
    });
  } catch (error) {
    console.error("❌ Error in Finso JSON Upload:", {
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

// ✅ Update Finso Bank Details by LAN
router.post("/v1/finso-bank-details", verifyApiKey, async (req, res) => {
  try {
    if (!req.partner || (req.partner.name || "").toLowerCase().trim() !== "finso") {
      return res.status(403).json({ message: "This route is only for Finso partner." });
    }

    const lenderTypeRaw = req.headers["x-lender"] ?? req.headers["lender"];
    const lenderType = lenderTypeRaw?.toString().trim();

    if (!lenderType) {
      return res.status(400).json({ message: "Lender header is required (x-lender: Finso)." });
    }
    if (lenderType.toLowerCase() !== "finso") {
      return res.status(400).json({
        message: `Invalid lender: ${lenderType}. Only 'Finso' loans can be inserted.`,
      });
    }

    // Normalize input
    let records = req.body;
    if (!Array.isArray(records)) records = [records];

    const requiredFields = [
      "lan",
      "e_mandate_no",
      "bank_name",
      "name_in_bank",
      "account_number",
      "ifsc",
    ];

    const results = [];

    for (const raw of records) {
      const data = {
        ...raw,
        account_number: raw.account_number ?? raw.account_no ?? raw.acc_no ?? null,
        ifsc: raw.ifsc ?? raw.bank_ifsc ?? null,
      };

      const missingField = requiredFields.find(
        (f) => data[f] === undefined || data[f] === null || data[f] === ""
      );
      if (missingField) {
        results.push({ error: `${missingField} is required.`, data });
        continue;
      }

      // ✅ Update existing record where LAN matches
      const [existing] = await db
        .promise()
        .query(`SELECT lan FROM loan_booking_finso WHERE lan = ? LIMIT 1`, [data.lan]);

      if (existing.length === 0) {
        results.push({ message: `Customer not found for lan: ${data.lan}`, data });
        continue;
      }

      const UPDATE_SQL = `
        UPDATE loan_booking_finso
        SET 
          e_mandate_no = ?,
          bank_name = ?,
          name_in_bank = ?,
          account_number = ?,
          ifsc = ?
        WHERE lan = ?
      `;

      const values = [
        data.e_mandate_no,
        data.bank_name,
        data.name_in_bank,
        data.account_number,
        data.ifsc,
        data.lan,
      ];

      await db.promise().query(UPDATE_SQL, values);

      results.push({
        message: "Finso loan bank details updated successfully.",
        lan: data.lan,
      });
    }


    return res.json({
      message: "Finso bank details processed successfully.",
      results,
    });
  } catch (error) {
    console.error("❌ Error in Finso JSON Upload:", error);
    return res.status(500).json({
      message: "Upload failed. Please try again.",
      error: error.sqlMessage || error.message,
    });
  }
});


//////////////// LOAN BOOKING FOR EMICLUB  //////////////////////
// routes/loanBookingEmiclub.js

// router.post("/v1/emiclub-lb", verifyApiKey, async (req, res) => {
//   try {
//     if (!req.partner || (req.partner.name || '').toLowerCase().trim() !== 'emiclub') {
//       return res.status(403).json({ message: 'This route is only for Emiclub partner.' });
//     }
//     const data = req.body;
//     console.log("Received JSON:", data);

//     // ✅ Validate lender type
//     const lenderType = data.lenderType?.trim()?.toLowerCase();
//     if (!lenderType || lenderType !== "emiclub") {
//       return res.status(400).json({
//         message: "Invalid lenderType. Only 'EMICLUB' loans are accepted.",
//       });
//     }

//     // ✅ Required fields validation
//     const requiredFields = [
//       "login_date",
//       "partner_loan_id",
//       "first_name",
//       "gender",
//       "dob",
//       "mobile_number",
//       "email_id",
//       "pan_number",
//       "aadhar_number",
//       "current_address",
//       "current_village_city",
//       "current_district",
//       "current_state",
//       "current_pincode",
//       "permanent_address",
//       "permanent_state",
//       "permanent_pincode",
//       "loan_amount",
//       "roi_apr",
//       "loan_tenure",
//       "emi_amount",
//       "bank_name",
//       "name_in_bank",
//       "account_number",
//       "ifsc",
//       "account_type",
//       "type_of_account",
//       "employment",
//       "annual_income",
//       "dealer_name",
//       "risk_category",
//       "customer_type"
//     ];

//     for (const field of requiredFields) {
//       if (!data[field] && data[field] !== 0) {
//         console.error(`❌ Missing field: ${field}`);
//         return res.status(400).json({ message: `${field} is required.` });
//       }
//     }

//     // ✅ Prevent duplicate PAN
//     const [existing] = await db
//       .promise()
//       .query(
//         `SELECT lan FROM loan_booking_emiclub WHERE pan_number = ?`,
//         [data.pan_number]
//       );

//     if (existing.length > 0) {
//       return res.status(400).json({
//         message: `Customer already exists for Pan: ${data.pan_number}`,
//       });
//     }

//     // ✅ Auto-generate only LAN
//     const { lan } = await generateLoanIdentifiers(lenderType);

//     const customer_name = `${data.first_name || ""} ${data.last_name || ""}`.trim();
//     const agreement_date = (data.login_date);

//     // ✅ Insert into DB (all columns aligned with schema)
// await db.promise().query(
//   `INSERT INTO loan_booking_emiclub (
//     lan, partner_loan_id, login_date,
//     first_name, middle_name, last_name, gender, dob,
//     father_name, mother_name, mobile_number, email_id,
//     pan_number, aadhar_number,
//     current_address, current_village_city, current_district, current_state, current_pincode,
//     permanent_address, permanent_village_city, permanent_district, permanent_state, permanent_pincode,
//     loan_amount, interest_rate, roi_apr, loan_tenure, emi_amount, cibil_score,
//     product, lender,
//     bank_name, name_in_bank, account_number, ifsc,
//     account_type, type_of_account,
//     net_disbursement, employment, risk_category, customer_type, annual_income,
//     dealer_name, dealer_mobile, dealer_address, dealer_city,
//     status, customer_name, agreement_date
//   )
//   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
//   [
//     lan, // 1
//     data.partner_loan_id, // 2
//     data.login_date, // 3
//     data.first_name, // 4
//     data.middle_name || null, // 5
//     data.last_name || null, // 6
//     data.gender, // 7
//     data.dob, // 8
//     data.father_name || null, // 9
//     data.mother_name || null, // 10
//     data.mobile_number, // 11
//     data.email_id, // 12
//     data.pan_number, // 13
//     data.aadhar_number, // 14
//     data.current_address, // 15
//     data.current_village_city, // 16
//     data.current_district, // 17
//     data.current_state, // 18
//     data.current_pincode, // 19
//     data.permanent_address, // 20
//     data.permanent_village_city || data.current_village_city, // 21
//     data.permanent_district || data.current_district, // 22
//     data.permanent_state, // 23
//     data.permanent_pincode, // 24
//     data.loan_amount, // 25
//     data.interest_rate, // 26
//     data.roi_apr, // 27
//     data.loan_tenure, // 28
//     data.emi_amount, // 29
//     data.cibil_score, // 30
//     "Monthly Loan", // 31 (product)
//     "EMICLUB", // 32 (lender)
//     data.bank_name, // 33
//     data.name_in_bank, // 34
//     data.account_number, // 35
//     data.ifsc, // 36
//     data.account_type, // 37
//     data.type_of_account, // 38
//     data.net_disbursement || data.loan_amount, // 39
//     data.employment, // 40
//     data.risk_category, // 41
//     data.customer_type, // 42
//     data.annual_income, // 43
//     data.dealer_name, // 44
//     data.dealer_mobile, // 45
//     data.dealer_address, // 46
//     data.dealer_city, // 47
//     "Login", // 48
//     customer_name, // 49
//     agreement_date // 50
//   ]
// );

//     console.log("✅ Customer inserted, now pulling CIBIL...");

//     // 6️⃣ Build SOAP XML
//     const dobFormatted = data.dob.replace(/-/g, "");
//     const soapBody = `<?xml version="1.0" encoding="UTF-8"?>
//       <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:urn="urn:cbv2">
//         <soapenv:Header/>
//         <soapenv:Body>
//           <urn:process>
//             <urn:in>
//               <INProfileRequest>
//                 <Identification>
//                   <XMLUser>${EXPERIAN_USER}</XMLUser>
//                   <XMLPassword>${EXPERIAN_PASSWORD}</XMLPassword>
//                 </Identification>
//                 <Application>
//                   <FTReferenceNumber>FT${Date.now()}</FTReferenceNumber>
//                   <CustomerReferenceID>${data.pan_number}</CustomerReferenceID>
//                   <EnquiryReason>13</EnquiryReason>
//                   <FinancePurpose>99</FinancePurpose>
//                   <AmountFinanced>${data.loan_amount}</AmountFinanced>
//                   <DurationOfAgreement>${data.loan_tenure}</DurationOfAgreement>
//                   <ScoreFlag>1</ScoreFlag>
//                   <PSVFlag>0</PSVFlag>
//                 </Application>
//                 <Applicant>
//                   <Surname>${data.last_name || ""}</Surname>
//                   <FirstName>${data.first_name || ""}</FirstName>
//                   <DateOfBirth>${dobFormatted}</DateOfBirth>
//                   <IncomeTaxPAN>${data.pan_number}</IncomeTaxPAN>
//                   <PhoneNumber>${data.mobile_number}</PhoneNumber>
//                 </Applicant>
//                 <Address>
//                   <FlatNoPlotNoHouseNo>${data.current_address}</FlatNoPlotNoHouseNo>
//                   <City>${data.current_village_city}</City>
//                   <State>${data.current_state}</State>
//                   <PinCode>${data.current_pincode}</PinCode>
//                 </Address>
//                 <AdditionalAddressFlag><Flag>N</Flag></AdditionalAddressFlag>
//               </INProfileRequest>
//             </urn:in>
//           </urn:process>
//         </soapenv:Body>
//       </soapenv:Envelope>`;

//     // 7️⃣ Send SOAP request to Experian
//     let score = null;
//     try {
//       const { data: xmlResponse } = await axios.post(EXPERIAN_URL, soapBody, {
//         headers: {
//           "Content-Type": "text/xml; charset=utf-8",
//           SOAPAction: "urn:cbv2/process",
//           Accept: "text/xml",
//         },
//         timeout: 30000,
//       });

//       const jsonResponse = await parseStringPromise(xmlResponse, { explicitArray: false });
//       score =
//         jsonResponse?.["soapenv:Envelope"]?.["soapenv:Body"]?.["processResponse"]?.out?.INProfileResponse?.Score?.Value ||
//         null;

//       await db
//         .promise()
//         .query(
//           `INSERT INTO loan_cibil_reports (lan, pan_number, score, report_xml, created_at)
//            VALUES (?,?,?,?,NOW())`,
//           [lan, data.pan_number, score, xmlResponse]
//         );

//       console.log("✅ CIBIL fetched successfully:", score);
//     } catch (err) {
//       console.error("⚠️ CIBIL Pull Failed:", err.message);
//     }

//     // 8️⃣ Final Response
//     return res.json({
//       message: "✅ EMICLUB loan saved successfully.",
//       lan,
//       // cibilScore: score || "Not Found",
//     });
//   } catch (error) {
//     console.error("❌ Error in EMICLUB Upload:", error);
//     res.status(500).json({
//       message: "Upload failed. Please try again.",
//       error: error.sqlMessage || error.message,
//     });
//   }
// });

////console sajag jain code running comment  ///////////////

// router.post("/v1/emiclub-lb", verifyApiKey, async (req, res) => {
//   try {
//     console.log(
//       "================= 📦 NEW EMICLUB REQUEST START ================="
//     );
//     console.log("🔹 Timestamp:", new Date().toISOString());

//     // --- Log all ENV variables used ---
//     console.log("🔧 ENV:: EXPERIAN_URL =", process.env.EXPERIAN_URL);
//     console.log("🔧 ENV:: EXPERIAN_USER =", process.env.EXPERIAN_USER);
//     console.log("🔧 ENV:: EXPERIAN_PASSWORD =", process.env.EXPERIAN_PASSWORD);
//     console.log("🔧 ENV:: DB_CONNECTED =", !!db ? "✅ Yes" : "❌ No");

//     // --- Partner validation ---
//     console.log("👥 Partner received:", req.partner);
//     if (
//       !req.partner ||
//       (req.partner.name || "").toLowerCase().trim() !== "emiclub"
//     ) {
//       console.error("❌ Partner validation failed!");
//       return res
//         .status(403)
//         .json({ message: "This route is only for Emiclub partner." });
//     }

//     // --- Body logging ---
//     const data = req.body;
//     console.log("📥 Received JSON payload:", JSON.stringify(data, null, 2));

//     // --- Lender type validation ---
//     const lenderType = data.lenderType?.trim()?.toLowerCase();
//     console.log("🏦 Lender type received:", lenderType);
//     if (!lenderType || lenderType !== "emiclub") {
//       console.error("❌ Invalid lenderType provided:", lenderType);
//       return res
//         .status(400)
//         .json({
//           message: "Invalid lenderType. Only 'EMICLUB' loans are accepted.",
//         });
//     }

//     // --- Required field check ---
//     const requiredFields = [
//       "login_date",
//       "partner_loan_id",
//       "first_name",
//       "last_name",
//       "gender",
//       "dob",
//       "mobile_number",
//       "email_id",
//       "pan_number",
//       "aadhar_number",
//       "current_address",
//       "current_village_city",
//       "current_district",
//       "current_state",
//       "current_pincode",
//       "permanent_address",
//       "permanent_state",
//       "permanent_pincode",
//       "loan_amount",
//       "roi_apr",
//       "loan_tenure",
//       "bank_name",
//       "name_in_bank",
//       "account_number",
//       "ifsc",
//       "account_type",
//       "type_of_account",
//       "employment",
//       "annual_income",
//       "dealer_name",
//       "risk_category",
//       "customer_type",
//     ];

//     for (const field of requiredFields) {
//       if (!data[field] && data[field] !== 0) {
//         console.error(`❌ Missing field detected: ${field}`);
//         return res.status(400).json({ message: `${field} is required.` });
//       }
//     }
//     console.log("✅ All required fields present.");

//     // --- Duplicate PAN check ---
//     console.log("🔍 Checking existing PAN:", data.pan_number);
//     const [existing] = await db
//       .promise()
//       .query(`SELECT lan FROM loan_booking_emiclub WHERE pan_number = ?`, [
//         data.pan_number,
//       ]);
//     console.log(
//       "🧾 Duplicate check result:",
//       existing.length,
//       "records found."
//     );

//     if (existing.length > 0) {
//       console.error("❌ Duplicate PAN found:", data.pan_number);
//       return res.status(400).json({
//         message: `Customer already exists for Pan: ${data.pan_number}`,
//       });
//     }

//     // --- Generate loan code ---
//     console.log("⚙️ Generating LAN for lender:", lenderType);
//     const { lan } = await generateLoanIdentifiers(lenderType);
//     console.log("✅ Generated LAN:", lan);

//     const customer_name = `${data.first_name || ""} ${
//       data.last_name || ""
//     }`.trim();
//     const agreement_date = data.login_date;

//     // --- Determine interest rate ---
// const interest_rate =  data.roi_apr / 12;
// console.log("📈 Using interest rate:", interest_rate);

//     // --- Insert into DB ---
//     console.log("💾 Inserting customer record into loan_booking_emiclub...");
//     await db.promise().query(
//       `INSERT INTO loan_booking_emiclub (
//         lan, partner_loan_id, login_date, first_name, middle_name, last_name, gender, dob,
//         father_name, mother_name, mobile_number, email_id,
//         pan_number, aadhar_number, current_address, current_village_city, current_district, current_state, current_pincode,
//         permanent_address, permanent_village_city, permanent_district, permanent_state, permanent_pincode,
//         loan_amount, interest_rate, roi_apr, loan_tenure, emi_amount, cibil_score,
//         product, lender, bank_name, name_in_bank, account_number, ifsc,
//         account_type, type_of_account, net_disbursement, employment, risk_category, customer_type,
//         annual_income, dealer_name, dealer_mobile, dealer_address, dealer_city,
//         status, customer_name, agreement_date
//       )
//       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
//       [
//         lan,
//         data.partner_loan_id,
//         data.login_date,
//         data.first_name,
//         data.middle_name || null,
//         data.last_name ,
//         data.gender,
//         data.dob,
//         data.father_name ,
//         data.mother_name ,
//         data.mobile_number,
//         data.email_id,
//         data.pan_number,
//         data.aadhar_number,
//         data.current_address,
//         data.current_village_city,
//         data.current_district,
//         data.current_state,
//         data.current_pincode,
//         data.permanent_address,
//         data.permanent_village_city || data.current_village_city,
//         data.permanent_district || data.current_district,
//         data.permanent_state,
//         data.permanent_pincode,
//         data.loan_amount,
//         interest_rate ,
//         data.roi_apr,
//         data.loan_tenure,
//         data.emi_amount,
//         data.cibil_score,
//         "Monthly Loan",
//         "EMICLUB",
//         data.bank_name,
//         data.name_in_bank,
//         data.account_number,
//         data.ifsc,
//         data.account_type,
//         data.type_of_account,
//         data.net_disbursement || data.loan_amount,
//         data.employment,
//         data.risk_category,
//         data.customer_type,
//         data.annual_income,
//         data.dealer_name,
//         data.dealer_mobile,
//         data.dealer_address,
//         data.dealer_city,
//         "Login",
//         customer_name,
//         agreement_date,
//       ]
//     );

//     ////  BEURO SCORE  CODE START/////
//     console.log("✅ Customer record inserted successfully.");
//     console.log ("cibil request data", "pan number :", data.pan_number, "loan amount :", data.loan_amount, "loan tenure :", data.loan_tenure, "first name :", data.first_name, "last name :", data.last_name, "mobile number :", data.mobile_number, "current address :", data.current_address, "current city :", data.current_village_city, "current state :", data.current_state, "current pincode :", data.current_pincode);
//     // --- Build SOAP XML ---
//     console.log("🧩 Building SOAP request body for Experian...");
//     const dobFormatted = data.dob.replace(/-/g, "");
//     console.log(data.first_name, data.last_name, data.pan_number, data.mobile_number, data.current_address, data.current_village_city, data.current_state, data.current_pincode);
//     console.log("🔧 Formatted DOB for SOAP:", dobFormatted);

//     const stateCodes = {
//   "JAMMU and KASHMIR": 1,
//   "HIMACHAL PRADESH": 2,
//   "PUNJAB": 3,
//   "CHANDIGARH": 4,
//   "UTTRANCHAL": 5,
//   "HARAYANA": 6,
//   "DELHI": 7,
//   "RAJASTHAN": 8,
//   "UTTAR PRADESH": 9,
//   "BIHAR": 10,
//   "SIKKIM": 11,
//   "ARUNACHAL PRADESH": 12,
//   "NAGALAND": 13,
//   "MANIPUR": 14,
//   "MIZORAM": 15,
//   "TRIPURA": 16,
//   "MEGHALAYA": 17,
//   "ASSAM": 18,
//   "WEST BENGAL": 19,
//   "JHARKHAND": 20,
//   "ORRISA": 21,
//   "CHHATTISGARH": 22,
//   "MADHYA PRADESH": 23,
//   "GUJRAT": 24,
//   "DAMAN and DIU": 25,
//   "DADARA and NAGAR HAVELI": 26,
//   "MAHARASHTRA": 27,
//   "ANDHRA PRADESH": 28,
//   "KARNATAKA": 29,
//   "GOA": 30,
//   "LAKSHADWEEP": 31,
//   "KERALA": 32,
//   "TAMIL NADU": 33,
//   "PONDICHERRY": 34,
//   "ANDAMAN and NICOBAR ISLANDS": 35,
//   "TELANGANA": 36
// };

// const state = data.state ?? "MAHARASHTRA"; // default to Maharashtra
// const state_code = stateCodes[state.toUpperCase()] ?? null;

//     const firstName = data.first_name.toUpperCase();
//     const lastName = data.last_name.toUpperCase();
//     const gender_code = (data.gender ?? 'Male') === 'Female' ? 2 : 1;
//     const soapBody = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:urn="urn:cbv2">
//    <soapenv:Header/>
//    <soapenv:Body>
//       <urn:process>
//          <urn:in>
//             <INProfileRequest>
//     <Identification>
//        <XMLUser>${process.env.EXPERIAN_USER}</XMLUser>
// <XMLPassword>${process.env.EXPERIAN_PASSWORD}</XMLPassword>
//     </Identification>
//     <Application>
//         <FTReferenceNumber></FTReferenceNumber>
//         <CustomerReferenceID></CustomerReferenceID>
//         <EnquiryReason>13</EnquiryReason>
//         <FinancePurpose>99</FinancePurpose>
//         <AmountFinanced>${data.loan_amount}</AmountFinanced>
//         <DurationOfAgreement>${data.loan_tenure}</DurationOfAgreement>
//         <ScoreFlag>3</ScoreFlag>
//         <PSVFlag>0</PSVFlag>
//     </Application>
//     <Applicant>
//         <Surname>${lastName}</Surname>
//         <FirstName>${firstName}</FirstName>
//         <MiddleName1></MiddleName1>
//         <MiddleName2></MiddleName2>
//         <MiddleName3></MiddleName3>
//         <GenderCode>${gender_code}</GenderCode>
//         <IncomeTaxPAN>${data.pan_number}</IncomeTaxPAN>
//         <PANIssueDate></PANIssueDate>
//         <PANExpirationDate></PANExpirationDate>
//         <PassportNumber></PassportNumber>
//         <PassportIssueDate></PassportIssueDate>
//         <PassportExpirationDate></PassportExpirationDate>
//         <VoterIdentityCard></VoterIdentityCard>
//         <VoterIDIssueDate></VoterIDIssueDate>
//         <VoterIDExpirationDate></VoterIDExpirationDate>
//         <DriverLicenseNumber></DriverLicenseNumber>
//         <DriverLicenseIssueDate></DriverLicenseIssueDate>
//         <DriverLicenseExpirationDate></DriverLicenseExpirationDate>
//         <RationCardNumber></RationCardNumber>
//         <RationCardIssueDate></RationCardIssueDate>
//         <RationCardExpirationDate></RationCardExpirationDate>
//         <UniversalIDNumber></UniversalIDNumber>
//         <UniversalIDIssueDate></UniversalIDIssueDate>
//         <UniversalIDExpirationDate></UniversalIDExpirationDate>
//         <DateOfBirth>${dobFormatted}</DateOfBirth>
//         <STDPhoneNumber></STDPhoneNumber>
//         <PhoneNumber>${data.mobile_number}</PhoneNumber>
//         <TelephoneExtension></TelephoneExtension>
//         <TelephoneType></TelephoneType>
//         <MobilePhone></MobilePhone>
//         <EMailId></EMailId>
//     </Applicant>
//     <Details>
//         <Income></Income>
//         <MaritalStatus></MaritalStatus>
//         <EmployStatus></EmployStatus>
//         <TimeWithEmploy></TimeWithEmploy>
//         <NumberOfMajorCreditCardHeld></NumberOfMajorCreditCardHeld>
//     </Details>
//     <Address>
//         <FlatNoPlotNoHouseNo>${data.current_address}</FlatNoPlotNoHouseNo>
//         <BldgNoSocietyName></BldgNoSocietyName>
//         <RoadNoNameAreaLocality></RoadNoNameAreaLocality>
//         <City>${data.current_village_city}</City>
//         <Landmark></Landmark>
//       <State>${state_code}</State>
//         <PinCode>${data.current_pincode}</PinCode>
//     </Address>
//     <AdditionalAddressFlag>
//         <Flag>N</Flag>
//     </AdditionalAddressFlag>
//     <AdditionalAddress>
//         <FlatNoPlotNoHouseNo></FlatNoPlotNoHouseNo>
//         <BldgNoSocietyName></BldgNoSocietyName>
//         <RoadNoNameAreaLocality></RoadNoNameAreaLocality>
//         <City></City>
//         <Landmark></Landmark>
//         <State></State>
//         <PinCode></PinCode>
//     </AdditionalAddress>
// </INProfileRequest>
// </urn:in>
//       </urn:process>
//    </soapenv:Body>
// </soapenv:Envelope>`;

//     console.log("🧾 SOAP XML Preview (first 500 chars):", soapBody.substring(0, 500));

//     // --- Send SOAP request ---
//     console.log("🌐 Sending SOAP request to Experian...");
//     let score = null;

//     try {
//       const response = await axios.post(process.env.EXPERIAN_URL, soapBody, {
//         headers: {
//           "Content-Type": "text/xml; charset=utf-8",
//           SOAPAction: "urn:cbv2/process",
//           Accept: "text/xml",
//         },
//         timeout: 30000,
//         validateStatus: () => true,
//       });

//       console.log("📥 Experian HTTP Status:", response.status);
//       console.log("📥 Experian Raw Response (first 1000 chars):", response.data?.substring(0, 1000));

//       if (response.status !== 200) throw new Error(`Experian returned HTTP ${response.status}`);

//       const jsonResponse = await parseStringPromise(response.data, { explicitArray: false });
//       score =
//         jsonResponse?.["soapenv:Envelope"]?.["soapenv:Body"]?.["processResponse"]?.out?.INProfileResponse?.BureauScore?.Value ||
//         null;

//       console.log("✅ Parsed CIBIL Score:", score);

//       await db.promise().query(
//         `INSERT INTO loan_cibil_reports (lan, pan_number, score, report_xml, created_at)
//          VALUES (?,?,?,?,NOW())`,
//         [lan, data.pan_number, score, response.data]
//       );

//       console.log("✅ CIBIL report saved successfully.");
//     } catch (err) {
//       console.error("⚠️ CIBIL Pull Failed:", err.message);
//       console.error("➡️ Response status:", err.response?.status);
//       console.error("➡️ Response data:", err.response?.data);
//       console.error("➡️ Request URL:", process.env.EXPERIAN_URL);
//       console.error("➡️ SOAP Body Preview:", soapBody.substring(0, 300));
//     }

//     console.log("✅ Completed EMI Club flow. LAN:", lan, "CIBIL Score:", score);
//     console.log("================= 📦 EMICLUB REQUEST END =================\n");
// ///////////////////    beauro code end ////////////
//     return res.json({
//       message: "✅ EMICLUB loan saved successfully.",
//       lan,
//       cibilScore: score || "Not Found",
//     });
//   } catch (error) {
//     console.error("❌ Unhandled Error in EMICLUB Upload:", error);
//     res.status(500).json({
//       message: "Upload failed. Please try again.",
//       error: error.sqlMessage || error.message,
//     });
//   }
// });
////////////////////// SAJAG JAIN NEW CODE FOR PARSE  ////////////////

// ---------- ROUTE ----------
router.post("/v1/emiclub-lb", verifyApiKey, async (req, res) => {
  try {
    console.log(
      "================= 📦 NEW EMICLUB REQUEST START ================="
    );
    // console.log("🔹 Timestamp:", new Date().toISOString());

    // // --- Log all ENV variables used ---
    // console.log("🔧 ENV:: EXPERIAN_URL =", process.env.EXPERIAN_URL);
    // console.log("🔧 ENV:: EXPERIAN_USER =", process.env.EXPERIAN_USER);
    // console.log("🔧 ENV:: EXPERIAN_PASSWORD =", process.env.EXPERIAN_PASSWORD);
    // console.log("🔧 ENV:: DB_CONNECTED =", !!db ? "✅ Yes" : "❌ No");

    // --- Partner validation ---
    //console.log("👥 Partner received:", req.partner);
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

    // // --- Duplicate PAN check ---
    // console.log("🔍 Checking existing PAN:", data.pan_number);
    // const [existing] = await db
    //   .promise()
    //   .query(`SELECT lan FROM loan_booking_emiclub WHERE pan_number = ?`, [
    //     data.pan_number,
    //   ]);
    // console.log(
    //   "🧾 Duplicate check result:",
    //   existing.length,
    //   "records found."
    // );

    // if (existing.length > 0) {
    //   console.error("❌ Duplicate PAN found:", data.pan_number);
    //   return res.status(400).json({
    //     message: `Customer already exists for Pan: ${data.pan_number}`,
    //   });
    // }

    // --- Generate loan code ---
    //console.log("⚙️ Generating LAN for lender:", lenderType);
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
    await db.promise().query(
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
      ]
    );

    ////  BEURO SCORE  CODE START/////
    console.log("✅ Customer record inserted successfully.");
    // console.log(
    //   "cibil request data",
    //   "pan number :",
    //   data.pan_number,
    //   "loan amount :",
    //   data.loan_amount,
    //   "loan tenure :",
    //   data.loan_tenure,
    //   "first name :",
    //   data.first_name,
    //   "last name :",
    //   data.last_name,
    //   "mobile number :",
    //   data.mobile_number,
    //   "current address :",
    //   data.current_address,
    //   "current city :",
    //   data.current_village_city,
    //   "current state :",
    //   data.current_state,
    //   "current pincode :",
    //   data.current_pincode
    // );
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
      data.current_pincode
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

    const state = data.state ?? "MAHARASHTRA"; // default to Maharashtra
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
        <EnquiryReason>13</EnquiryReason> 
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


//console.log(data.loanAmount, data.tenure, firstName, lastName, gender_code, data.pan_number, state_code, data.current_pincode)

    // console.log(
    //   "🧾 SOAP XML Preview (first 500 chars):",
    //   soapBody.substring(0, 7000)
    // );

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
        response.data?.substring(0, 7000)
      );

      if (response.status !== 200)
        throw new Error(`Experian returned HTTP ${response.status}`);
//////////////////// new addd.//////////
 // --- Parse SOAP XML ---
      const parser = new XMLParser({ ignoreAttributes: false });
      const soapParsed = parser.parse(response.data);
      const encodedInnerXml =
        soapParsed["SOAP-ENV:Envelope"]?.["SOAP-ENV:Body"]?.["ns2:processResponse"]?.["ns2:out"];

      if (!encodedInnerXml) throw new Error("Missing ns2:out field in Experian response");

      // Decode and parse the inner XML
      const decodedInnerXml = he.decode(encodedInnerXml);
      parsedXmlToStore = decodedInnerXml;
      const innerParsed = parser.parse(decodedInnerXml);

      // Extract score and message
      const scoreStr = innerParsed?.INProfileResponse?.SCORE?.BureauScore ?? null;
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
        [lan, data.pan_number, score, parsedXmlToStore] // store parsed/pretty INProfileResponse XML
      );

      await db
        .promise()
        .execute(
          "UPDATE loan_booking_emiclub SET cibil_score = ? WHERE lan = ?",
          [score, lan]
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
    console.error("❌ Unhandled Error in EMICLUB Upload:", error);
    res.status(500).json({
      message: "Upload failed. Please try again.",
      error: error.sqlMessage || error.message,
    });
  }
});


//////////////////emiclub missed cibil cases temporary route////////////////

router.post("/v1/emiclub-cibil-retry", async (req, res) => {
  console.log("================= ♻️ EMICLUB CIBIL RETRY START =================");
  const limit = req.body.limit || 10; // default 10 at a time
  try {
    const [rows] = await db
      .promise()
      .query(
        `SELECT * FROM loan_booking_emiclub WHERE cibil_score IS NULL ORDER BY lan DESC LIMIT ?`,
        [limit]
      );

    if (!rows.length) {
      return res.json({ message: "✅ No pending records with NULL CIBIL found." });
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
      } = row;

      console.log(`\n🚀 Processing LAN: ${lan} (PAN: ${pan_number})`);

      const state = current_state || "MAHARASHTRA";
      console.log("state", state);
      const state_code = stateCodes[state.toUpperCase()] ?? null;
      console.log("state code", state_code)
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
                <EnquiryReason>13</EnquiryReason>
                <FinancePurpose>99</FinancePurpose>
                <AmountFinanced>${loan_amount}</AmountFinanced>
                <DurationOfAgreement>${loan_tenure}</DurationOfAgreement>
                <ScoreFlag>1</ScoreFlag>
              </Application>
              <Applicant>
                <Surname>${(last_name || "").toUpperCase()}</Surname>
                <FirstName>${(first_name || "").toUpperCase()}</FirstName>
                <GenderCode>${gender_code}</GenderCode>
                <IncomeTaxPAN>${pan_number}</IncomeTaxPAN>
                <DateOfBirth>${dobFormatted}</DateOfBirth>
                <PhoneNumber>${mobile_number}</PhoneNumber>
              </Applicant>
              <Address>
                <FlatNoPlotNoHouseNo>${current_address}</FlatNoPlotNoHouseNo>
                <City>${current_village_city}</City>
                <State>${state_code}</State>
                <PinCode>${current_pincode}</PinCode>
              </Address>
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

        const parser = new XMLParser({ ignoreAttributes: false });
        const parsed = parser.parse(response.data);
        const encodedInnerXml =
          parsed["SOAP-ENV:Envelope"]?.["SOAP-ENV:Body"]?.["ns2:processResponse"]?.["ns2:out"];

        if (!encodedInnerXml) throw new Error("Missing ns2:out in response");

        const decoded = he.decode(encodedInnerXml);
        const innerParsed = parser.parse(decoded);
        const scoreStr = innerParsed?.INProfileResponse?.SCORE?.BureauScore ?? null;
        const score = scoreStr ? Number(scoreStr) : null;

        await db
          .promise()
          .query(
            `INSERT INTO loan_cibil_reports (lan, pan_number, score, report_xml, created_at)
             VALUES (?,?,?,?,NOW())`,
            [lan, pan_number, score, decoded]
          );

        await db
          .promise()
          .execute(`UPDATE loan_booking_emiclub SET cibil_score = ? WHERE lan = ?`, [score, lan]);

        console.log(`✅ CIBIL fetched for ${lan} → Score: ${score}`);
        results.push({ lan, pan_number, score, status: "success" });
      } catch (err) {
        console.error(`⚠️ Error for ${lan}:`, err.message);
        results.push({ lan, pan_number, error: err.message, status: "failed" });
      }
    }

    console.log("================= ♻️ EMICLUB CIBIL RETRY END =================");
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

////////////////////////////////////////////////////////////////////////////
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

      try {
        const panCard = row["pan_number"];
        const aadharNumber = row["aadhaar_number"];
        const appId = row["App_Id"];
        const cibilScore = parseInt(row["credit_score"]);

        if (isNaN(cibilScore)) {
          skippedDueToCIBIL.push({ ...row, reason: "Invalid or missing credit score" });
          continue;
        }
        if (!(cibilScore >= 500 || cibilScore === -1)) {
          skippedDueToCIBIL.push({ ...row, reason: "Low CIBIL Score" });
          continue;
        }

        // Check for duplicate app_id
        const [exists] = await db
          .promise()
          .query(`SELECT * FROM loan_booking_circle_pe WHERE app_id = ?`, [appId]);
        if (exists.length > 0) {
          row_errors.push({ row: R, stage: "dup-check", reason: `Duplicate App ID (${appId})` });
          continue;
        }

        // Generate partnerLoanId + LAN
        let partnerLoanId, lan;
        try {
          const ids = await generateLoanIdentifiers(lenderType);
          partnerLoanId = ids.partnerLoanId;
          lan = ids.lan;
        } catch (err) {
          row_errors.push({ row: R, stage: "id-gen", reason: toClientError(err).message });
          continue;
        }

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
    row["loan_application_date"] ? excelDateToJSDate (row["loan_application_date"]) :null,
    lan,
    partnerLoanId,
    row["App_Id"] || row["app_id"],
    row["customer_name"],
    row["gender"],
    row["date_of_birth"] ? excelDateToJSDate (row["date_of_birth"]) : null,
    row["fathers_name"],
    row["mobile_number"],
    row["email_id"],
    row["pan_number"],
    row["aadhaar_number"],
    row["current_address_line1"],
    row["current_address_pincode"],
    parse(row["loan amount sanctioned"] || row["loan_amount_sanctioned"]),
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
    parse(row["loan amount sanctioned"] || row["loan_amount_sanctioned"]), // net_disbursement
     row["loan_application_date"] ? excelDateToJSDate (row["loan_application_date"]) :null, // agreement date
    "Login",
  ]
);


console.log( parse(row["loan amount sanctioned"]),
            row["interest_percent"],
            row["loan_tenure_months"],
            parse(row["monthly emi"]),)


        success_rows.push(R);
      } catch (err) {
        row_errors.push({ row: R, stage: "insert", reason: toClientError(err).message });
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
      return res.status(400).json({ message: "Invalid or missing credit score." });
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
        data.gender ,
        data.date_of_birth ,
        data.fathers_name ,
        data.mobile_number,
        data.email_id ,
        data.pan_number,
        data.aadhaar_number,
        data.current_address_line1 ,
        data.current_address_pincode ,
        parseNum(data.loan_amount_sanctioned),
        parseNum(data.interest_percent),
        parseNum(data.loan_tenure_months),
        parseNum(data.monthly_emi),
        cibilScore,
        data.product || "Mobile Finance",
        lenderType,
        data.residence_type ,
        data.customer_type ,
        data.bank_name,
        data.beneficiary_name,
        data.institute_account_number,
        data.ifsc_code,
        parseNum(data.loan_amount_sanctioned),
        data.loan_application_date ,
        "Login",
      ]
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

    for (const row of sheetData) {
      const { partnerLoanId, lan } = await generateLoanIdentifiers(lenderType);

      const query = `
  INSERT INTO loan_bookings_wctl (
    category, product_short_name, customer_name, loan_account_number,
    lan, loan_amount, interest_rate, loan_tenure, agreement_date,
    first_emi_date, tenure_end_date, emi_amount, interest_amount,
    rm_name, partner_loan_id, lender, status
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

      await db
        .promise()
        .query(query, [
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
    }

    res.json({ message: "✅ WCTL Upload successful" });
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
      ", "
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
////////////////////// ADIKOSH CAM DATA UPLOAD END     /////////////////////

///////////// GQ NON FSF  //////////////////////////
// router.post("/gq-non-fsf-upload", upload.single("file"), async (req, res) => {
//   if (!req.file) {
//     return res.status(400).json({ message: "No file uploaded." });
//   }

//   const lenderType = req.body.lenderType;
//   // if (!["EV Loan", "Health Care"].includes(lenderType)) {
//   //   return res.status(400).json({ message: "Invalid lender type." });
//   // }

//   try {
//     const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
//     const sheetName = workbook.SheetNames[0];
//     const sheetData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

//     if (!sheetData || sheetData.length === 0) {
//       return res.status(400).json({ message: "Excel file is empty." });
//     }
//     for (const row of sheetData) {
//       const app_id = row["App ID"];
//       // const aadhaar = row["Aadhaar Number"];

//       const [existing] = await db
//         .promise()
//         .query(`SELECT * FROM loan_booking_gq_non_fsf WHERE app_id = ? `, [
//           app_id,
//         ]);

//       // const [existing] = await db
//       //   .promise()
//       //   .query(`SELECT * FROM loan_booking_gq_non_fsf WHERE pan_number = ?`, [pan]);

//       if (existing.length > 0) {
//         return res.status(409).json({
//           message: `Duplicate found for app ID: ${app_id}. Record already exists.`,
//         });
//       }

//       // ✅ Generate new loan identifiers
//       const { partnerLoanId, lan } = await generateLoanIdentifiers(lenderType);

//       const insertQuery = `
//         INSERT INTO loan_booking_gq_non_fsf (
//         partner_loan_id, lan,app_id, product, customer_type, residence_type, loan_type, disbursal_type,
//           institute_account_number, beneficiary_name, ifsc_code, bank_name, aadhaar_number,
//           agreement_signature_type, loan_application_date, emi_day, company_name, fathers_name,
//           ckyc_no, customer_name, student_name, date_of_birth, gender, current_address_line1,
//           current_address_line2, current_address_line3, current_address_landmark, current_address_pincode,
//           current_address_city, current_address_state, proof_of_current_address, permanent_address_line1,
//           permanent_address_line2, permanent_address_line3, permanent_address_landmark, permanent_address_pincode,
//           permanent_address_city, permanent_address_state, office_address_line1, office_address_line2,
//           office_address_line3, office_address_landmark, office_address_pincode, office_address_city,
//           office_address_state, pan_number, employment_status, annual_income, credit_score,
//           mobile_number, email_id, institute, loan_amount_sanctioned, loan_tenure_months, monthly_emi,
//           interest_percent, monthly_interest_amount, no_of_advance_emis, advance_emi_total, subvention_amount,
//           disbursal_amount, actual_disbursement, to_be_recovered, agreement_date, interest_rate_irr,
//           flat_rate, nach_umrn, income_source, status, monthly_income, age,lender,loan_amount,interest_rate,loan_tenure
//         ) VALUES (${new Array(75).fill("?").join(",")})
//       `;

//       // const parseDate   = (val) => {
//       //   if (!val) return null;
//       //   const parsed = new Date(val);
//       //   return isNaN(parsed) ? null : parsed;
//       // };

//       const parseNumber = (val) => (val ? parseFloat(val) : 0);
//       const loanAmount = row["Loan Amount Sanctioned"]; // ✅ New field for same data insert into 2nd column also
//       const interestrate = row["Interest %"]; //
//       const loantenure = row["Loan Tenure (Months)"]; //

//       await db.promise().query(insertQuery, [
//         partnerLoanId,
//         lan,
//         //row["LOGIN DATE"] ? excelDateToJSDate(row["LOGIN DATE"]) : null,
//         row["App ID"],
//         row["Product"],
//         row["Customer Type"],
//         row["Residence Type"],
//         row["Loan Type"],
//         row["Disbursal Type"],
//         row["Institute Account Number"],
//         row["Beneficiary Name"],
//         row["IFSC Code"],
//         row["Bank Name"],
//         row["Aadhaar Number"],
//         row["Agreement Signature Type"],
//         row["Loan Application Date"]
//           ? excelDateToJSDate(row["Loan Application Date"])
//           : null,
//         row["Emi Day"],
//         row["Company Name"],
//         row["Fathers Name"],
//         row["CKYC No"],
//         row["Customer Name"],
//         row["Student Name"],
//         row["Date Of Birth"] ? excelDateToJSDate(row["Date Of Birth"]) : null,
//         row["Gender"],
//         row["Current Address Line 1"],
//         row["Current Address Line 2"],
//         row["Current Address Line 3"],
//         row["Current Address Landmark"],
//         row["Current Address Pincode"],
//         row["Current Address City"],
//         row["Current Address State"],
//         row["Proof of Current Address"],
//         row["Permanent Address Line 1"],
//         row["Permanent Address Line 2"],
//         row["Permanent Address Line 3"],
//         row["Permanent Address Landmark"],
//         row["Permanent Address Pincode"],
//         row["Permanent Address City"],
//         row["Permanent Address State"],
//         row["Office Address Line 1"],
//         row["Office Address Line 2"],
//         row["Office Address Line 3"],
//         row["Office Address Landmark"],
//         row["Office Address Pincode"],
//         row["Office Address City"],
//         row["Office Address State"],
//         row["PAN Number"],
//         row["Employment Status"],
//         parseNumber(row["Annual Income"]),
//         row["Credit Score"] || null,
//         row["Mobile Number"],
//         row["Email ID"],
//         row["Institute"],
//         loanAmount,
//         //parseInt(row["Loan Tenure (Months)"]),
//         loantenure,
//         parseNumber(row["Monthly EMI"]),
//         // parseFloat(row["Insterest %"]),
//         interestrate,
//         parseNumber(row["Monthly Interest Amount"]),
//         parseInt(row["No. Of Advance EMIs"]),
//         parseNumber(row["Advance EMI (Total)"]),
//         parseNumber(row["Subvention Amount"]),
//         parseNumber(row["Disbursal Amount"]),
//         parseNumber(row["Actual Disbursement"]),
//         parseNumber(row["To be Recovered"]),
//         row["Agreement Date (DD-MMM-YYYY)"]
//           ? excelDateToJSDate(row["Agreement Date (DD-MMM-YYYY)"])
//           : null,
//         parseFloat(row["Interest Rate (IRR %)"]),
//         parseFloat(row["Flat Rate (%)"]),
//         row["Nach UMRN"],
//         row["Income Source"],
//         "Login",
//         parseNumber(row["Monthly Income"]),
//         parseInt(row["Age"]),
//         lenderType,
//         loanAmount,
//         interestrate, // ✅ New field for same data insert into 2nd column also
//         loantenure, // ✅ New field for same data insert into 2nd column also
//       ]);
//     }

//     res.json({
//       message: "✅ Loan data uploaded to loan_booking_gq_non_fsf successfully.",
//     });
//   } catch (err) {
//     console.error("❌ Upload Error:", err);
//     res
//       .status(500)
//       .json({ message: "Upload failed", error: err.message, stack: err.stack });
//   }
// });

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

        // 3) generate loan identifiers
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
        const loanAmount = row["Loan Amount Sanctioned"];
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
          await db.promise().query(insertQuery, values);
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

// const parseDate = (value) => {
//   if (typeof value === "number") {
//     const epoch = new Date(1899, 11, 30);
//     return new Date(epoch.getTime() + value * 86400000);
//   }
//   const date = new Date(value);
//   return isNaN(date.getTime()) ? null : date;
// };
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
      `✅ Loan inserted successfully → App ID: ${data.appId}, LAN: ${lan}`
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
                value
              )}) capped at 999.99 for loan: ${row["Loan Account Number"]}`
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
          values
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
         WHERE account_status = 'Active'`
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
      ]
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
        [loan_account_number]
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
        [loan_account_number]
      );

    res.status(200).json({ message: "✅ Loan marked as inactive." });
  } catch (error) {
    console.error("Error updating loan status:", error);
    res
      .status(500)
      .json({ message: "Internal server error.", error: error.message });
  }
});

///////////////Adikosh//////////////////////////

// router.post("/adikosh-upload", upload.single("file"), async (req, res) => {
//   if (!req.file)
//     return res
//       .status(400)
//       .json({ message: "No file uploaded. Please select a valid file." });
//   if (!req.body.lenderType)
//     return res.status(400).json({ message: "Lender type is required." });

//   try {
//     const lenderType = req.body.lenderType;
//     if (
//       ["EV Loan", "Health Care", "BL Loan", "GQ FSF", "GQ Non-FSF"].includes(
//         lenderType
//       )
//     ) {
//       return res.status(400).json({ message: "Invalid adikosh lender type." });
//     }

//     // ✅ Read Excel File
//     const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
//     const sheetName = workbook.SheetNames[0];
//     const sheetData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

//     if (!sheetData || sheetData.length === 0) {
//       return res
//         .status(400)
//         .json({ message: "Uploaded Excel file is empty or invalid." });
//     }

//     for (const row of sheetData) {
//       const panCard = row["Pan Card"];
//       const aadharNumber = row["Aadhar Number"];

//       // ✅ Check for existing customer using PAN & Aadhar
//       const [existingRecords] = await db
//         .promise()
//         .query(
//           `SELECT lan FROM loan_booking_adikosh WHERE pan_card = ? OR aadhar_number = ?`,
//           [panCard, aadharNumber]
//         );

//       if (existingRecords.length > 0) {
//         return res.json({
//           message: `Customer already exists. Duplicate found for Pan Card: ${panCard} or Aadhar Number: ${aadharNumber}`,
//         });
//       }

//       // ✅ Generate new loan identifiers
//       const { partnerLoanId, lan } = await generateLoanIdentifiers(lenderType);

//       // ✅ Insert Data into `loan_bookings`
//       const query = `
//   INSERT INTO loan_booking_adikosh (
//     partner_loan_id, lan, login_date, customer_name, borrower_dob, father_name,
//     address_line_1, address_line_2, village, district, state, pincode,
//     mobile_number, email, occupation, relationship_with_borrower, cibil_score,
//     guarantor_co_cibil_score, loan_amount, loan_tenure, interest_rate, emi_amount,
//     guarantor_aadhar, guarantor_pan, dealer_name, name_in_bank, bank_name,
//     account_number, ifsc, aadhar_number, pan_card, guarantor_co_applicant, guarantor_co_applicant_dob, product, lender,
//     agreement_date, status, salary_day
//    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? , ?, ?, ?)
// `;

//       await db.promise().query(query, [
//         partnerLoanId,
//         lan,
//         row["LOGIN DATE"] ? excelDateToJSDate(row["LOGIN DATE"]) : null,
//         row["Customer Name"],
//         row["Borrower DOB"] ? excelDateToJSDate(row["Borrower DOB"]) : null,
//         row["Father Name"],
//         row["Address Line 1"],
//         row["Address Line 2"],
//         row["Village"],
//         row["District"],
//         row["State"],
//         row["Pincode"],
//         row["Mobile Number"],
//         row["Email"],
//         row["Occupation"],
//         row["Relationship with Borrower"],
//         row["CIBIL Score"],
//         row["GURANTOR/Co-Applicant CIBIL Score"], // ✅ New field
//         row["Loan Amount"],
//         row["Tenure"],
//         row["Interest Rate"],
//         row["EMI Amount"],
//         row["GURANTOR/Co-Applicant ADHAR"],
//         row["GURANTOR/Co-Applicant PAN"],
//         row["DEALER NAME"],
//         row["Name in Bank"],
//         row["Bank name"],
//         row["Account Number"],
//         row["IFSC"],
//         row["Aadhar Number"],
//         row["Pan Card"],
//         row["GURANTOR/Co-Applicant"], // ✅ New field
//         row["GURANTOR/Co-Applicant DOB"]
//           ? excelDateToJSDate(row["GURANTOR/Co-Applicant DOB"])
//           : null, // ✅ New field
//         row["Product"],
//         lenderType,
//         row["Agreement Date"] ? excelDateToJSDate(row["LOGIN DATE"]) : null,
//         "Approved",
//         row["Salary Day"], // ✅ New field for salary day
//       ]);
//     }

//     res.json({ message: "File uploaded and data saved successfully." });
//   } catch (error) {
//     console.error("❌ Error in Upload Process:", error);

//     res.status(500).json({
//       message: "Upload failed. Please try again.",
//       error: error.sqlMessage || error.message,
//     });
//   }
// });

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
        lenderType
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
              [panCard, aadharNumber]
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

// ✅ Fetch a single disbursed loan by LAN
// router.get("/disbursed/:lan", (req, res) => {
//   const lan = req.params.lan;
//   const query = `
//         SELECT lb.*, ev.Disbursement_UTR, ev.Disbursement_Date
//         FROM loan_bookings lb
//         LEFT JOIN ev_disbursement_utr ev ON lb.lan = ev.LAN
//         WHERE lb.lan = ? AND lb.status = 'Disbursed'
//     `;

//   db.query(query, [lan], (err, results) => {
//     if (err) {
//       console.error("Error fetching disbursed loan details:", err);
//       return res.status(500).json({ message: "Database error" });
//     }

//     if (results.length === 0) {
//       return res
//         .status(404)
//         .json({ message: "Loan not found or not disbursed" });
//     }

//     res.json(results[0]);
//   });
// });

// ✅ Fetch Loan Schedule by LAN
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
    } else if (lan.startsWith("CIRF")) {
    tableName = "manual_rps_circlepe";
  } else if (lan.startsWith("FINS")) {
    tableName = "manual_rps_finso_loan";
  }else if (lan.startsWith("HEYEV")) {
    tableName = "manual_rps_hey_ev";
     }else if (lan.startsWith("HEYB")) {
    tableName = "manual_rps_hey_ev_battery";
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
        err
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
        [lan]
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
        [lan]
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
        [lan]
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
        [lan]
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
        [lan]
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
          [Cust_ID, Name, PAN, UniqueID, PhoneNo, LAN]
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
        }
      );
    }
  );
});

module.exports = router;
