const express = require("express");
const multer = require("multer");
const xlsx = require("xlsx");
const db = require("../config/db");
// const verifyApiKey = require("../middleware/authMiddleware");


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
  } else if (lender === "HC") {
    prefixPartnerLoan = "HCIN1";
    prefixLan = "HCF1";
  } else if (lender === "BL Loan") {
    prefixPartnerLoan = "BLIN1";
    prefixLan = "BL1";
  } else if (lender === "GQ FSF") {
    prefixPartnerLoan = "GQFSF1";
    prefixLan = "GQFSF1";
  } else if (lender === "GQ Non-FSF") {
    prefixPartnerLoan = "GQNonFSF1";
    prefixLan = "GQNonFSF1";
  } else if (lender === "Adikosh") {
    prefixPartnerLoan = "ADK1";
    prefixLan = "ADKF1";
  } else {
    return res.status(400).json({ message: "Invalid hai lender type." }); // ✅ handled in route
  }

  console.log("prefixPartnerLoan:", prefixPartnerLoan);
  console.log("prefixLan:", prefixLan);

  const [rows] = await db.promise().query(
    "SELECT last_sequence FROM loan_sequences WHERE lender_name = ? FOR UPDATE",
    [lender]
  );

  let newSequence;

  if (rows.length > 0) {
    newSequence = rows[0].last_sequence + 1;
    await db.promise().query(
      "UPDATE loan_sequences SET last_sequence = ? WHERE lender_name = ?",
      [newSequence, lender]
    );
  } else {
    newSequence = 11000;
    await db.promise().query(
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
      Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
      Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
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


/// ✅ File Upload API (Insert Loan Data Based on Lender)
router.post("/upload", upload.single("file"), async (req, res) => {
  console.log("Request received:", req.body); // ✅ Log request data
  console.log("Uploaded file:", req.file); // ✅ Log file info
  if (!req.file)
    return res
      .status(400)
      .json({ message: "No file uploaded. Please select a valid file." });
  if (!req.body.lenderType)
    return res.status(400).json({ message: "Lender type is required." });

  try {
    const lenderType = req.body.lenderType;
    if (!["EV Loan", "Health Care"].includes(lenderType)) {
      return res.status(400).json({ message: "Invalid upload lender type." });
    }

    // ✅ Read Excel File
    const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheetData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

    if (!sheetData || sheetData.length === 0) {
      return res
        .status(400)
        .json({ message: "Uploaded Excel file is empty or invalid." });
    }

    for (const row of sheetData) {
      const panCard = row["Pan Card"];
      const aadharNumber = row["Aadhar Number"];

      // ✅ Check for existing customer using PAN & Aadhar
      const [existingRecords] = await db
        .promise()
        .query(
          `SELECT lan FROM loan_bookings WHERE pan_card = ? OR aadhar_number = ?`,
          [panCard, aadharNumber]
        );
      console.log("Existing Records:", existingRecords);

      if (existingRecords.length > 0) {

        return res.json({
          message: `Customer already exists. Duplicate found for Pan Card: ${panCard} or Aadhar Number: ${aadharNumber}`,
        });
      }

      // ✅ Generate new loan identifiers
      const { partnerLoanId, lan } = await generateLoanIdentifiers(lenderType);

      // ✅ Insert Data into `loan_bookings`
     const query = `
  INSERT INTO loan_bookings (
    partner_loan_id, lan, login_date, customer_name, borrower_dob, father_name,
    address_line_1, address_line_2, village, district, state, pincode,
    mobile_number, email, occupation, relationship_with_borrower, cibil_score,
    guarantor_co_cibil_score, loan_amount, loan_tenure, interest_rate, emi_amount,
    guarantor_aadhar, guarantor_pan, dealer_name, name_in_bank, bank_name,
    account_number, ifsc, aadhar_number, pan_card, guarantor_co_applicant, guarantor_co_applicant_dob, product, lender,
    agreement_date, status
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? , ?, ?)
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
  row["GURANTOR/Co-Applicant"], // ✅ New field
  row["GURANTOR/Co-Applicant DOB"] ? excelDateToJSDate(row["GURANTOR/Co-Applicant DOB"]) : null, // ✅ New field
  row["Product"],
  lenderType,
  row["Agreement Date"] ? excelDateToJSDate(row["LOGIN DATE"]) : null,
  "Approved"
    ]);
    
            
    }

    res.json({ message: "File uploaded and data saved successfully." });
  } catch (error) {
    console.error("❌ Error in Upload Process:", error);

    res.status(500).json({
      message: "Upload failed. Please try again.",
      error: error.sqlMessage || error.message,
    });
  }
});
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

router.get("/approved-loans", (req, res) => {
  const { table = "loan_bookings", prefix = "EV" } = req.query;

  const allowedTables = {
    "loan_bookings": true,
    "loan_booking_adikosh": true,
    "loan_booking_gq_non_fsf": true,
    "loan_booking_gq_fsf": true,
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




/////////////////////////////////////////////////////////////////////////////////////
router.post("/hc-upload", upload.single("file"), async (req, res) => {
  console.log("Request received:", req.body); // ✅ Log request data
  console.log("Uploaded file:", req.file); // ✅ Log file info
  if (!req.file) return res.status(400).json({ message: "No file uploaded" });
  if (!req.body.lenderType)
    return res.status(400).json({ message: "Lender type is required." });

  try {
    const lenderType = req.body.lenderType; // ✅ Ensure this is received
    console.log("Lender Type:", lenderType);

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
      "Approved"
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
////////////////// BL Loan........./////////////////////////////////
router.post("/bl-upload", upload.single("file"), async (req, res) => {
  console.log("Request received:", req.body); // ✅ Log request data
  console.log("Uploaded file:", req.file); // ✅ Log file info
  if (!req.file) return res.status(400).json({ message: "No file uploaded" });
  if (!req.body.lenderType)
    return res.status(400).json({ message: "Lender type is required." });

  try {
    const lenderType = req.body.lenderType; // ✅ Ensure this is received
    console.log("Lender Type:", lenderType);

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
       console.log("BORROWER DOB Raw:", row["BORROWER DOB"]);

       const borrowerDOB = row["BORROWER DOB"]
         ? excelDateToJSDate(row["BORROWER DOB"])
         : null;
     
       console.log("Parsed DOB:", borrowerDOB);



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
      row["Loan Account No"],                       // ✅ New Column
      row["Speridian loan account no"]              // ✅ New Column
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

router.post("/upload-utr", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: "No file uploaded" });

  try {
    const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
    const sheetData = xlsx.utils.sheet_to_json(
      workbook.Sheets[workbook.SheetNames[0]]
    );

    let processedCount = 0;
    let duplicateUTRs = [];
    let missingLANs = [];
    let insertedLANs = new Set();

    for (const row of sheetData) {
      const disbursementUTR = row["Disbursement UTR"];
      const disbursementDate = row["Disbursement Date"]
        ? new Date((row["Disbursement Date"] - 25569) * 86400000)
            .toISOString()
            .split("T")[0]
        : null;
      const lan = row["LAN"];

      if (!disbursementUTR || !disbursementDate || !lan) {
        console.log(
          `⚠️ Skipping row due to missing data: ${JSON.stringify(row)}`
        );
        continue;
      }

      console.log(`🔍 Checking loan for LAN: ${lan}`);

      // ✅ Separate query for each table
      let loanRes = [];
      if (lan.startsWith("GQN")) {
        [loanRes] = await db.promise().query(
          `SELECT loan_amount_sanctioned AS loan_amount, emi_day AS emi_date, interest_percent AS interest_rate, loan_tenure_months AS loan_tenure, subvention_amount,no_of_advance_emis, product, lender 
           FROM loan_booking_gq_non_fsf WHERE lan = ?`,
          [lan]
        );
      } else if (lan.startsWith("GQF")) {
        [loanRes] = await db.promise().query(
          `SELECT loan_amount_sanctioned AS loan_amount, emi_day AS emi_date, interest_percent AS interest_rate, loan_tenure_months AS loan_tenure, subvention_amount, no_of_advance_emis, product, lender 
           FROM loan_bookings_gq_fsf WHERE lan = ?`,
          [lan]
        );
      } else if (lan.startsWith("ADK")) {
        [loanRes] = await db.promise().query(
          `SELECT loan_amount, interest_rate, loan_tenure, salary_day, product, lender 
           FROM loan_booking_adikosh WHERE lan = ?`,
          [lan]
        );
      } else {
        [loanRes] = await db.promise().query(
          `SELECT loan_amount, interest_rate, loan_tenure, product, lender 
           FROM loan_bookings WHERE lan = ?`,
          [lan]
        );
      }

      console.log(`🔍 Loan result for LAN ${lan}: ${JSON.stringify(loanRes)}`);

      if (loanRes.length === 0) {
        console.warn(`🚫 LAN not found: ${lan}`);
        missingLANs.push(lan);
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
      console.log(
        `🔍 Loan details for LAN ${lan}: ${JSON.stringify(loanRes[0])}`
      );

      const [utrExists] = await db
        .promise()
        .query("SELECT * FROM EV_Disbursement_UTR WHERE Disbursement_UTR = ?", [
          disbursementUTR,
        ]);

      if (utrExists.length > 0) {
        console.warn(`⚠️ Duplicate UTR: ${disbursementUTR}`);
        duplicateUTRs.push(disbursementUTR);
        continue;
      }

      console.log("lender testing", lender);

      try {
        if (!insertedLANs.has(lan)) {
          console.log(`⚙️ Generating RPS for LAN: ${lan}`);

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

        // ✅ Only insert UTR if RPS was successfully generated
        await db
          .promise()
          .query(
            "INSERT INTO EV_Disbursement_UTR (Disbursement_UTR, Disbursement_Date, LAN) VALUES (?, ?, ?)",
            [disbursementUTR, disbursementDate, lan]
          );
        console.log(`✅ UTR inserted for LAN: ${lan}`);
        // ✅ Update loan status if it's a GQ loan
        if (lan.startsWith("GQN")) {
          await db
            .promise()
            .query(
              "UPDATE loan_booking_gq_non_fsf SET status = 'Disbursed' WHERE lan = ?",
              [lan]
            );
          console.log(`✅ Status updated to 'Disbursed' for LAN: ${lan}`);
        } else if (lan.startsWith("GQF")) {
          await db
            .promise()
            .query(
              "UPDATE loan_bookings_gq_fsf SET status = 'Disbursed' WHERE lan = ?",
              [lan]
            );
          console.log(`✅ Status updated to 'Disbursed' for LAN: ${lan}`);
        } else {
          await db
            .promise()
            .query(
              "UPDATE loan_booking_adikosh SET status = 'Disbursed' WHERE lan = ?",
              [lan]
            );
          console.log(`✅ Status updated to 'Disbursed' for LAN: ${lan}`);
        }
        processedCount++;
      } catch (rpsErr) {
        console.error(
          `❌ Failed RPS generation for ${lan}, skipping UTR insert`,
          rpsErr
        );
      }
    }
    res.json({
      message: `UTR upload completed. ${processedCount} records inserted.`,
      duplicate_utr: duplicateUTRs,
      missing_lans: missingLANs,
    });
  } catch (error) {
    console.error("❌ Error during UTR upload:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/gq-fsf-upload", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: "No file uploaded." });
  if (!req.body.lenderType) return res.status(400).json({ message: "Lender type is required." });

  try {
    const lenderType = req.body.lenderType;
    const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const rawSheet = workbook.Sheets[sheetName];
    const rawData = xlsx.utils.sheet_to_json(rawSheet, { defval: "", header: 1 });

    // Normalize headers
    const rawHeaders = rawData[0];
    const normalizedHeaders = {};
    rawHeaders.forEach((header, i) => {
      const norm = header?.toString().toLowerCase().replace(/\s+/g, " ").trim().replace(/[^a-z0-9]/g, "");
      if (norm) normalizedHeaders[i] = header;
    });

    const sheetData = rawData.slice(1).map((row) => {
      const formatted = {};
      Object.entries(normalizedHeaders).forEach(([idx, original]) => {
        formatted[original] = row[idx] ?? "";
      });
      return formatted;
    });

    if (sheetData.length === 0) {
      return res.status(400).json({ message: "Uploaded Excel file is empty or invalid." });
    }

    const skippedDueToCIBIL = [];

    for (const row of sheetData) {
      const panCard = row["PAN Number"];
      const aadharNumber = row["Aadhaar Number"];
      const rawCibil = row["Credit Score"] || row["CIBIL Score"];
      const cibilScore = parseInt(rawCibil);

      if (isNaN(cibilScore)) {
        skippedDueToCIBIL.push({ ...row, reason: "Missing or invalid CIBIL Score" });
        continue;
      }

      if (!(cibilScore >= 500 || cibilScore === -1)) {
        skippedDueToCIBIL.push({ ...row, reason: "Low CIBIL Score" });
        continue;
      }

      const [existingRecords] = await db
        .promise()
        .query(
          `SELECT lan FROM loan_bookings WHERE pan_card = ? OR aadhar_number = ?`,
          [panCard, aadharNumber]
        );

      if (existingRecords.length > 0) {
        return res.json({
          message: `Customer already exists. Duplicate found for PAN: ${panCard} or Aadhaar: ${aadharNumber}`,
        });
      }

      console.log("lender is", lenderType)
      const { partnerLoanId, lan } = await generateLoanIdentifiers(lenderType);

      // try {
      //   const { partnerLoanId, lan } = await generateLoanIdentifiers(lenderType);
      // } catch (err) {
      //   return res.status(400).json({ message: err.message });
      // }
      
      

      const parse = (v) =>
        typeof v === "number" ? v : parseFloat((v ?? "").toString().replace(/[^0-9.]/g, "")) || 0;

      await db.promise().query(
        `INSERT INTO loan_bookings_gq_fsf (
          partner_loan_id, lan, app_id, product, customer_type, residence_type, loan_type, disbursal_type,
    institute_account_number, beneficiary_name, ifsc_code, bank_name, aadhaar_number,
    agreement_signature_type, loan_application_date, emi_day, company_name, fathers_name,
    ckyc_no, customer_name, student_name, date_of_birth, gender, current_address_line_1,
    current_address_line_2, current_address_line_3, current_address_landmark, current_address_pincode,
    current_address_city, current_address_state, proof_of_current_address, permanent_address_line_1,
    permanent_address_line_2, permanent_address_line_3, permanent_address_landmark, permanent_address_pincode,
    permanent_address_city, permanent_address_state, office_address_line_1, office_address_line_2,
    office_address_line_3, office_address_landmark, office_address_pincode, office_address_city,
    office_address_state, pan_number, employment_status, annual_income, credit_score, mobile_number,
    email_id, institute, loan_amount_sanctioned, loan_tenure_months, monthly_emi,
    interest_percent, monthly_interest_amount, no_of_advance_emis, processing_fee, processing_fee_tax,
    advance_emi_total, subvention_amount, disbursal_amount, retention_percentage, retention_amount, actual_disbursement, to_be_recovered,
    agreement_date, interest_rate_irr, flat_rate_percent, nach_umrn, income_source,
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
          "Approved",
          parse(row["Monthly Income"]),
          parse(row["Age"]),
          lenderType,
          parse(row["Loan Amount Sanctioned"]),
          parse(row["Interest %"]),
          parse(row["Loan Tenure (Months)"])
        ]
      );
    }

    res.status(200).json({
      message: "✅ File uploaded and valid data saved.",
      skippedDueToCIBIL,
      totalSkipped: skippedDueToCIBIL.length
    });
  } catch (error) {
    console.error("❌ Upload Error:", error);
    res.status(500).json({
      message: "Upload failed",
      error: error.sqlMessage || error.message
    });
  }
});

router.get("/gq-fsf-disbursed", (req, res) => {
  const query =
    "SELECT * FROM loan_bookings_gq_fsf WHERE status = 'Disbursed' and LAN Like 'GQF%'";

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






///////////// GQ NON FSF  //////////////////////////
router.post("/gq-non-fsf-upload", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "No file uploaded." });
  }

  const lenderType = req.body.lenderType;
  // if (!["EV Loan", "Health Care"].includes(lenderType)) {
  //   return res.status(400).json({ message: "Invalid lender type." });
  // }

  try {
    const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheetData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

    if (!sheetData || sheetData.length === 0) {
      return res.status(400).json({ message: "Excel file is empty." });
    }

    console.log("inside upload");

    for (const row of sheetData) {
      const pan = row["PAN Number"];
      const aadhaar = row["Aadhaar Number"];

      const [existing] = await db
        .promise()
        .query(`SELECT * FROM loan_booking_gq_non_fsf WHERE pan_number = ? OR aadhaar_number = ?`, [pan, aadhaar]);

      // const [existing] = await db
      //   .promise()
      //   .query(`SELECT * FROM loan_booking_gq_non_fsf WHERE pan_number = ?`, [pan]);

      if (existing.length > 0) {
        return res.status(409).json({
          message: `Duplicate found for PAN: ${pan}`,
        });
      }

      console.log("lenderType from request:", lenderType);

    // ✅ Generate new loan identifiers
    const { partnerLoanId, lan } = await generateLoanIdentifiers(lenderType);
    console.log("Identifiers generated:", partnerLoanId, lan);

    console.log("Row being inserted:", row);

      const insertQuery = `
        INSERT INTO loan_booking_gq_non_fsf (
        partner_loan_id, lan,app_id, product, customer_type, residence_type, loan_type, disbursal_type,
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
          flat_rate, nach_umrn, income_source, status, monthly_income, age,lender,loan_amount,interest_rate,loan_tenure
        ) VALUES (${new Array(75).fill("?").join(",")})
      `;

      // const parseDate   = (val) => {
      //   if (!val) return null;
      //   const parsed = new Date(val);
      //   return isNaN(parsed) ? null : parsed;
      // };

      const parseNumber = (val) => (val ? parseFloat(val) : 0);
      const loanAmount = row["Loan Amount Sanctioned"];// ✅ New field for same data insert into 2nd column also
      const interestrate = row["Insterest %"];//
      const loantenure = row["Loan Tenure (Months)"];//

      await db.promise().query(insertQuery, [
        partnerLoanId,
        lan,
        //row["LOGIN DATE"] ? excelDateToJSDate(row["LOGIN DATE"]) : null,
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
        row["Aadhaar Number"],
        row["Agreement Signature Type"],
       row["Loan Application Date"] ? excelDateToJSDate(row["Loan Application Date"]) : null,
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
        parseNumber(row["Annual Income"]),
        row["Credit Score"] || null,
        row["Mobile Number"],
        row["Email ID"],
        row["Institute"],
        loanAmount,
        //parseInt(row["Loan Tenure (Months)"]),
        loantenure,
        parseNumber(row["Monthly EMI"]),
        // parseFloat(row["Insterest %"]),
        interestrate,
        parseNumber(row["Monthly Interest Amount"]),
        parseInt(row["No. Of Advance EMIs"]),
        parseNumber(row["Advance EMI (Total)"]),
        parseNumber(row["Subvention Amount"]),
        parseNumber(row["Disbursal Amount"]),
        parseNumber(row["Actual Disbursement"]),
        parseNumber(row["To be Recovered"]),
        row["Agreement Date (DD-MMM-YYYY)"] ? excelDateToJSDate(row["Agreement Date (DD-MMM-YYYY)"]) : null,
        parseFloat(row["Interest Rate (IRR %)"]),
        parseFloat(row["Flat Rate (%)"]),
        row["Nach UMRN"],
        row["Income Source"],
        "Approved",
        parseNumber(row["Monthly Income"]),
        parseInt(row["Age"]),
        lenderType,
        loanAmount,
        interestrate, // ✅ New field for same data insert into 2nd column also
        loantenure, // ✅ New field for same data insert into 2nd column also
      ]);
    }

    res.json({ message: "✅ Loan data uploaded to loan_booking_gq_non_fsf successfully." });
  } catch (err) {
    console.error("❌ Upload Error:", err);
    res.status(500).json({ message: "Upload failed", error: err.message, stack: err.stack  });
  }
});

// Helpers
const parse = (v) =>
  typeof v === "number" ? v : parseFloat((v ?? "").toString().replace(/[^0-9.]/g, "")) || 0;

const parseRate = (v) => {
  const value = parse(v);
  if (value > 999.99) {
    console.warn(`⚠️ High rate_of_interest (${value}) capped at 999.99`);
    return 999.99;
  }
  return value;
};

const parseDate = (value) => {
  if (typeof value === "number") {
    const epoch = new Date(1899, 11, 30);
    return new Date(epoch.getTime() + value * 86400000);
  }
  const date = new Date(value);
  return isNaN(date.getTime()) ? null : date;
};



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
      netdisbursalamount: "net_disbursal_amount"
    };

    for (const row of rawData) {
      const formattedRow = {};

      for (const [originalKey, value] of Object.entries(row)) {
        const normalizedKey = originalKey.toLowerCase().replace(/\s+/g, "").trim();
        const dbField = columnMap[normalizedKey];
        if (!dbField) continue;

        if (dbField === "rate_of_interest") {
          const rate = parseRate(value);
          formattedRow[dbField] = rate;

          if (rate !== parse(value)) {
            console.warn(`⚠️ High rate_of_interest (${parse(value)}) capped at 999.99 for loan: ${row["Loan Account Number"]}`);
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

      await db.promise().query(
        `INSERT INTO aldun_loans (${dbFields.join(", ")}) VALUES (${dbFields.map(() => "?").join(", ")})`,
        values
      );
    }

    res.status(200).json({ message: "✅ ALdun data uploaded successfully." });
  } catch (error) {
    console.error("❌ Upload error:", error);
    res.status(500).json({
      message: "Failed to process file.",
      error: error.message || error.sqlMessage
    });
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











///////////////Adikosh//////////////////////////

router.post("/adikosh-upload", upload.single("file"), async (req, res) => {
  console.log("Request received:", req.body); // ✅ Log request data
  console.log("Uploaded file:", req.file); // ✅ Log file info
  if (!req.file)
    return res
      .status(400)
      .json({ message: "No file uploaded. Please select a valid file." });
  if (!req.body.lenderType)
    return res.status(400).json({ message: "Lender type is required." });

  try {
    const lenderType = req.body.lenderType;
    if (["EV Loan", "Health Care","BL Loan","GQ FSF","GQ Non-FSF"].includes(lenderType)) {
      return res.status(400).json({ message: "Invalid adikosh lender type." });
    }

    // ✅ Read Excel File
    const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheetData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

    if (!sheetData || sheetData.length === 0) {
      return res
        .status(400)
        .json({ message: "Uploaded Excel file is empty or invalid." });
    }

    for (const row of sheetData) {
      const panCard = row["Pan Card"];
      const aadharNumber = row["Aadhar Number"];

      // ✅ Check for existing customer using PAN & Aadhar
      const [existingRecords] = await db
        .promise()
        .query(
          `SELECT lan FROM loan_bookings WHERE pan_card = ? OR aadhar_number = ?`,
          [panCard, aadharNumber]
        );
      console.log("Existing Records:", existingRecords);

      if (existingRecords.length > 0) {
        console.log(
          `Customer already exists. Duplicate found for Pan Card: ${panCard} or Aadhar Number: ${aadharNumber}`
        );

        return res.json({
          message: `Customer already exists. Duplicate found for Pan Card: ${panCard} or Aadhar Number: ${aadharNumber}`,
        });
      }

      // ✅ Generate new loan identifiers
      const { partnerLoanId, lan } = await generateLoanIdentifiers(lenderType);

      // ✅ Insert Data into `loan_bookings`
     const query = `
  INSERT INTO loan_booking_adikosh (
    partner_loan_id, lan, login_date, customer_name, borrower_dob, father_name,
    address_line_1, address_line_2, village, district, state, pincode,
    mobile_number, email, occupation, relationship_with_borrower, cibil_score,
    guarantor_co_cibil_score, loan_amount, loan_tenure, interest_rate, emi_amount,
    guarantor_aadhar, guarantor_pan, dealer_name, name_in_bank, bank_name,
    account_number, ifsc, aadhar_number, pan_card, guarantor_co_applicant, guarantor_co_applicant_dob, product, lender,
    agreement_date, status, salary_day
   ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? , ?, ?, ?)
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
  row["GURANTOR/Co-Applicant"], // ✅ New field
  row["GURANTOR/Co-Applicant DOB"] ? excelDateToJSDate(row["GURANTOR/Co-Applicant DOB"]) : null, // ✅ New field
  row["Product"],
  lenderType,
  row["Agreement Date"] ? excelDateToJSDate(row["LOGIN DATE"]) : null,
  "Approved",
  row["Salary Day"] // ✅ New field for salary day
    ]);
    
            
    }

    res.json({ message: "File uploaded and data saved successfully." });
  } catch (error) {
    console.error("❌ Error in Upload Process:", error);

    res.status(500).json({
      message: "Upload failed. Please try again.",
      error: error.sqlMessage || error.message,
    });
  }
});

// ✅ Fetch a single disbursed loan by LAN
// router.get("/disbursed/:lan", (req, res) => {
//   const lan = req.params.lan;
//   const query = `
//         SELECT lb.*, ev.Disbursement_UTR, ev.Disbursement_Date
//         FROM loan_bookings lb
//         LEFT JOIN EV_Disbursement_UTR ev ON lb.lan = ev.LAN
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
  } else if (lan.startsWith("GQF")) {
    tableName = "manual_rps_gq_fsf";
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
      console.error(`❌ Error fetching schedule for LAN ${lan} from ${tableName}:`, err);
      return res.status(500).json({ message: "Database error" });
    }

    if (!results.length) {
      return res.status(404).json({ message: "No schedule found for this loan" });
    }

    res.json(results);
  });
});

/////////////////////////////////
// Fintree RPS for Adikosh
router.get("/schedule/adikosh/fintree/:lan", async (req, res) => {
  const { lan } = req.params;
  try {
    const [results] = await db.promise().query(
      `SELECT * FROM manual_rps_adikosh_fintree WHERE lan = ? ORDER BY due_date ASC`,
      [lan]
    );
    if (!results.length) return res.status(404).json({ message: "No Fintree RPS found" });
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
    const [results] = await db.promise().query(
      `SELECT * FROM manual_rps_adikosh_partner WHERE lan = ? ORDER BY due_date ASC`,
      [lan]
    );
    if (!results.length) return res.status(404).json({ message: "No Partner RPS found" });
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
            FROM EV_Disbursement_UTR WHERE lan = ?`;

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

      await db.promise().query(
        `INSERT INTO UniqueIdDetails (Cust_ID, Name, PAN, Unique_ID, PhoneNo, LAN) VALUES (?, ?, ?, ?, ?, ?)`,
        [Cust_ID, Name, PAN, UniqueID, PhoneNo, LAN]
      );
    }

    res.status(200).json({ message: "✅ Unique ID data uploaded successfully" });
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

  db.query("SELECT COUNT(*) AS count FROM UniqueIdDetails", (err, countResult) => {
    if (err) return res.status(500).json({ error: "Count error" });

    const totalRows = countResult[0].count;
    const totalPages = Math.ceil(totalRows / limit);

    db.query("SELECT Cust_ID, Name, PAN, ID AS Unique_ID, PhoneNo, LAN FROM UniqueIdDetails LIMIT ? OFFSET ?", [limit, offset], (err, rows) => {
      if (err) return res.status(500).json({ error: "Fetch error" });

      res.json({
        currentPage: page,
        totalPages,
        data: rows,
      });
    });
  });
});


module.exports = router;
