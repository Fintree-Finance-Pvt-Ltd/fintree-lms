const express = require("express");
const db = require("../../config/db");
const authenticateUser = require("../../middleware/verifyToken");
const { runAllValidations } = require("../../services/heliumValidationEngine");
const { autoApproveIfAllVerified } = require("../../services/heliumValidationEngine");
const axios = require("axios");
const path = require("path");
const fs = require("fs");
const verifyApiKey = require("../../middleware/apiKeyAuth");

const router = express.Router();

const uploadPath = path.join(__dirname, "../../uploads");
if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath, { recursive: true });

async function downloadAndSaveFile(url, baseName) {
  if (!url) return null;
  try {
    const res = await axios.get(url, { responseType: "arraybuffer", timeout: 30000 });

    const safeBase = baseName.replace(/[^a-zA-Z0-9_.-]/g, "_");
    const fileName = `${Date.now()}_${safeBase}`;
    const fullPath = path.join(uploadPath, fileName);

    fs.writeFileSync(fullPath, res.data);

    // We will store just the fileName in DB (same as your manual upload route)
    return fileName;
  } catch (err) {
    console.error("❌ Error downloading Aadhaar file:", err.response?.data || err.message);
    return null;
  }
}

const saveBase64ToFile = async (base64Str, fileName, subFolder = "aadhaar") => {
  if (!base64Str) return null;

  // Remove possible data URI prefix & whitespace/newlines
  const cleaned = base64Str
    .replace(/^data:.*;base64,/, "")
    .replace(/\s/g, "");

  const buffer = Buffer.from(cleaned, "base64");

  const uploadRoot = path.join(__dirname,  "../../uploads"); // adjust to your uploads dir
  const folderPath = path.join(uploadRoot, subFolder);

  await fs.promises.mkdir(folderPath, { recursive: true });

  const filePath = path.join(folderPath, fileName);
  await fs.promises.writeFile(filePath, buffer);

  return filePath;
};

const isProbablyUrl = (str = "") => /^https?:\/\//i.test(str);


const generateLoanIdentifiers = async (lender) => {
  lender = lender.trim(); // normalize input

  let application_id;
  let prefixLan;

  if (lender === "HELIUM") {
    prefixLan = "HEL10";
    application_id = "HHF0001";
  }
  else {
    return res.status(400).json({ message: "Invalid lender type." }); // ✅ handled in route
  }

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
    application_id: `${application_id}${newSequence}`,
    lan: `${prefixLan}${newSequence}`,
  };
};


router.post("/manual-entry", async (req, res) => {
  try {
    const data = req.body;

    // ✅ Required fields (aligned with frontend)
    const requiredFields = [
      "login_date",
      "first_name",
      "last_name",
      "customer_name",
      "gender",
      "dob",
      "father_name",
      "mobile_number",
      "pan_number",
      "aadhar_number",
      "current_address",
      "current_village_city",
      "current_district",
      "current_state",
      "current_pincode",
      "permanent_address",
      "permanent_village_city",
      "permanent_district",
      "permanent_state",
      "permanent_pincode",
      "loan_amount",
      "interest_rate",
      "loan_tenure",
      // BRE-critical
      "customer_type",
      "employment_type",
      "net_monthly_income",
      "avg_monthly_rent",
      "residence_type",
      // make banking mandatory only if you want:
      "bank_name",
      "name_in_bank",
      "account_number",
      "ifsc",
      "email_id",
    ];

     const missing = requiredFields.filter(
      (key) => !data[key] || String(data[key]).trim() === ""
    );

    if (missing.length > 0) {
      return res.status(400).json({
        message: `Missing fields: ${missing.join(", ")}`,
      });
    }

    // 🎫 generate LAN + PLID
    const { lan, application_id } = await generateLoanIdentifiers("HELIUM");

    // 📝 INSERT into loan_booking_helium
    const insertLoan = `
      INSERT INTO loan_booking_helium (
        first_name,
        last_name,
        login_date,
        lan,
        app_id,
        customer_name,
        gender,
        dob,
        father_name,
        mother_name,
        mobile_number,
        email_id,
        pan_number,
        aadhar_number,
        current_address,
        current_village_city,
        current_district,
        current_state,
        current_pincode,
        permanent_address,
        permanent_village_city,
        permanent_district,
        permanent_state,
        permanent_pincode,
        loan_amount,
        interest_rate,
        loan_tenure,
        emi_amount,
        cibil_score,
        product,
        lender,
        residence_type,
        customer_type,
        bank_name,
        name_in_bank,
        account_number,
        ifsc,
        pre_emi,
        processing_fee,
        net_disbursement,
        status,
        agreement_date,
        employment_type,
        net_monthly_income,
        avg_monthly_rent
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?
      )
    `;

    await db.promise().query(insertLoan, [
      // 1–5
      data.first_name || null,
      data.last_name || null,
      data.login_date,
      lan,
      application_id,

      // 6–10
      data.customer_name,
      data.gender,
      data.dob,
      data.father_name,
      data.mother_name || null,

      // 11–15
      data.mobile_number,
      data.email_id || null,
      data.pan_number,
      data.aadhar_number,
      data.current_address,

      // 16–20
      data.current_village_city,
      data.current_district,
      data.current_state,
      data.current_pincode,
      data.permanent_address || null,

      // 21–25
      data.permanent_village_city || null,
      data.permanent_district || null,
      data.permanent_state || null,
      data.permanent_pincode || null,
      data.loan_amount,

      // 26–30
      data.interest_rate,
      data.loan_tenure,
      data.emi_amount || null,      // not in UI → null
      data.cibil_score || null,     // not in UI → null
      "Monthly Loan",

      // 31–35
      "HELIUM",
      data.residence_type || null,
      data.customer_type || null,
      data.bank_name || null,
      data.name_in_bank || null,

      // 36–40
      data.account_number || null,
      data.ifsc || null,
      data.pre_emi || null,
      data.processing_fee || null,
      data.net_disbursement || null, // or compute if needed

      // 41–45
      "Login",
      data.agreement_date || data.login_date,
      data.employment_type || null,
      data.net_monthly_income || null,
      data.avg_monthly_rent || null,
    ]);

    // 🧮 Call both procedures based on LAN
    await db
      .promise()
      .query("CALL sp_generate_helium_rps(?)", [lan])
      .catch((err) => console.error("Error in sp_generate_helium_rps:", err));

    // KYC verification row
    await db
      .promise()
      .query("INSERT INTO kyc_verification_status (lan) VALUES (?)", [lan]);

    // Build loan summary
    await db
      .promise()
      .query("CALL sp_build_helium_loan_summary(?)", [lan])
      .catch((err) =>
        console.error("Error in sp_build_helium_loan_summary:", err)
      );

    res.json({
      message: "Helium loan created successfully",
      lan,
      application_id,
    });

    // 🔥 Trigger async validations (non-blocking)
    runAllValidations(lan);
  } catch (err) {
    console.error("Error creating helium loan:", err);
    res.status(500).json({
      message: "Failed to create loan",
      error: err.sqlMessage || err.message,
    });
  }
});

//////////////////// API BASED ROUTES ////////////////////
router.post("/v1/helium-lb", verifyApiKey, async (req, res) => {
  try {
    // 🔐 Partner validation
    if (
      !req.partner ||
      (req.partner.name || "").toLowerCase().trim() !== "helium"
    ) {
      return res
        .status(403)
        .json({ message: "This route is only for Helium partner." });
    }

    const data = req.body;

    // 🔎 lenderType check
    if (!data.lenderType || data.lenderType.toLowerCase() !== "helium") {
      return res.status(400).json({
        message: "Invalid lenderType. Only HELIUM allowed.",
      });
    }

    // ✅ Required fields (snake_case only)
    const requiredFields = [
      "login_date",
      "first_name",
      "last_name",
      "gender",
      "dob",
      "father_name",
      "mobile_number",
      "pan_number",
      "aadhar_number",
      "current_address",
      "current_village_city",
      "current_district",
      "current_state",
      "current_pincode",
      "permanent_address",
      "permanent_village_city",
      "permanent_district",
      "permanent_state",
      "permanent_pincode",
      "loan_amount",
      "interest_rate",
      "loan_tenure",
      "customer_type",
      "employment_type",
      "net_monthly_income",
      "avg_monthly_rent",
      "residence_type",
      "bank_name",
      "name_in_bank",
      "account_number",
      "ifsc",
    ];

    for (const field of requiredFields) {
      if (!data[field] && data[field] !== 0) {
        return res.status(400).json({
          message: `${field} is required.`,
        });
      }
    }

    // 🔁 Duplicate PAN / Aadhaar check
    const [existing] = await db.promise().query(
      `SELECT lan FROM loan_booking_helium
       WHERE pan_number = ? OR aadhar_number = ?`,
      [data.pan_number, data.aadhar_number]
    );

    if (existing.length > 0) {
      return res.json({
        message: "Customer already exists with PAN or Aadhaar.",
      });
    }

    // 🎫 Generate identifiers
    const { lan, application_id } =
      await generateLoanIdentifiers("HELIUM");

    // 👤 customer_name auto concat
    const customer_name = `${data.first_name} ${data.last_name}`.trim();

    // 🗓️ AUTO fields
    const agreement_date = data.login_date;

    // 📝 SQL (KEEP THIS FORMAT – MariaDB safe)
    const insertSql = `
      INSERT INTO loan_booking_helium (
        first_name, last_name, login_date,
        lan, app_id, customer_name,
        gender, dob, father_name, mother_name,
        mobile_number, email_id,
        pan_number, aadhar_number,
        current_address, current_village_city, current_district, current_state, current_pincode,
        permanent_address, permanent_village_city, permanent_district, permanent_state, permanent_pincode,
        loan_amount, interest_rate, loan_tenure,
        emi_amount, cibil_score,
        product, lender,
        residence_type, customer_type,
        bank_name, name_in_bank, account_number, ifsc,
        pre_emi, processing_fee, net_disbursement,
        status, agreement_date,
        employment_type, net_monthly_income, avg_monthly_rent
      ) VALUES (
        ?,?,?,?,?,?,?,?,?,?,
        ?,?,?,?,?,?,?,?,?,?,
        ?,?,?,?,?,?,?,?,?,?,
        ?,?,?,?,?,?,?,?,?,?,
        ?,?,?,?,?
      );
    `;

    const values = [
      data.first_name,
      data.last_name,
      data.login_date,
      lan,
      application_id,
      customer_name,

      data.gender,
      data.dob,
      data.father_name,
      data.mother_name || null,

      data.mobile_number,
      data.email_id || null,

      data.pan_number,
      data.aadhar_number,

      data.current_address,
      data.current_village_city,
      data.current_district,
      data.current_state,
      data.current_pincode,

      data.permanent_address,
      data.permanent_village_city,
      data.permanent_district,
      data.permanent_state,
      data.permanent_pincode,

      data.loan_amount,
      data.interest_rate,
      data.loan_tenure,

      null, // emi_amount (AUTO)
      null, // cibil_score (AUTO)

      "Monthly Loan",
      "HELIUM",

      data.residence_type,
      data.customer_type,

      data.bank_name,
      data.name_in_bank,
      data.account_number,
      data.ifsc,

      null, // pre_emi (AUTO)
      null, // processing_fee (AUTO)
      null, // net_disbursement (AUTO)

      "Login",
      data.login_date,

      data.employment_type,
      data.net_monthly_income,
      data.avg_monthly_rent
    ];

    // 🛡️ Safety check
    if (values.length !== 45) {
      throw new Error(`SQL values mismatch: ${values.length}`);
    }

    await db.promise().query(insertSql, values);

    // 🧮 Post-insert processes
    await db.promise().query("CALL sp_generate_helium_rps(?)", [lan]);
    await db.promise().query(
      "INSERT INTO kyc_verification_status (lan) VALUES (?)",
      [lan]
    );
    await db.promise().query(
      "CALL sp_build_helium_loan_summary(?)",
      [lan]
    );

    res.json({
      message: "Helium loan created successfully.",
      lan,
      application_id,
    });

    // 🔥 async validations
    runAllValidations(lan);
  } catch (error) {
    console.error("❌ Helium API Error:", error);
    res.status(500).json({
      message: "Failed to create Helium loan.",
      error: error.sqlMessage || error.message,
    });
  }
});

//////////////////// API BASED ROUTES END ////////////////////

router.get("/all-loans", async (req, res) => {
  try {
    const [rows] = await db
      .promise()
      .query(
        `
        SELECT
          lb.lan,
          lb.customer_name,
          lb.app_id,
          lb.partner_loan_id,
          lb.loan_amount,
          net_disbursement AS disbursement_amount,
          DATE_FORMAT(CONVERT_TZ(edu.disbursement_date, '+00:00', '+05:30'), '%Y-%m-%d %H:%i:%s') AS disbursement_date,
          lb.status
        FROM loan_booking_helium AS lb
        LEFT JOIN ev_disbursement_utr AS edu ON edu.LAN = lb.LAN
        ORDER BY login_date DESC, lan DESC
      `
      );

    return res.json(rows);
  } catch (err) {
    console.error("❌ Error fetching Helium loans:", err);
    return res.status(500).json({
      message: "Failed to fetch Helium loans",
      error: err.sqlMessage || err.message,
    });
  }
});

router.get("/approved-loans", async (req, res) => {
  try {
    const [rows] = await db
      .promise()
      .query(
        `
        SELECT
          lan,
          customer_name,
          app_id,
          mobile_number,
          partner_loan_id,
          loan_amount,
          sanction_esign_status,
          agreement_esign_status,
          bank_status,
          bank_name,
          account_number,
          ifsc,
          status
        FROM loan_booking_helium where status = 'Approved'
        ORDER BY login_date DESC, lan DESC
      `
      );

    return res.json(rows);
  } catch (err) {
    console.error("❌ Error fetching Helium loans:", err);
    return res.status(500).json({
      message: "Failed to fetch Helium loans",
      error: err.sqlMessage || err.message,
    });
  }
});

router.get("/:lan", async (req, res) => {
  const { lan } = req.params;

  try {
    const [rows] = await db
      .promise()
      .query(
        `
        SELECT
          lb.lan,
          lb.app_id,
          lb.login_date,
          lb.customer_name,
          lb.gender,
          lb.dob,
          lb.father_name,
          lb.mother_name,
          lb.mobile_number,
          lb.email_id,
          lb.pan_number,
          lb.aadhar_number,

          lb.current_address,
          lb.current_village_city,
          lb.current_district,
          lb.current_state,
          lb.current_pincode,
          lb.permanent_address,
          lb.permanent_village_city,
          lb.permanent_district,
          lb.permanent_state,
          lb.permanent_pincode,

          lb.loan_amount,
          lb.interest_rate,
          lb.loan_tenure,
          lb.emi_amount,
          lb.pre_emi,
          lb.processing_fee,
          lb.net_disbursement,
          lb.cibil_score,
          lb.status,
          lb.sanction_esign_status,
          lb.agreement_esign_status,

          -- HRS / risk fields (assumes you added these columns)
          lb.helium_risk_score,
          lb.helium_risk_band,
          lb.helium_risk_flag,

          lb.helium_credit_score_comp,
          lb.helium_credit_score_flag,

          lb.helium_age_score,
          lb.helium_age_flag,

          lb.helium_customer_type_score,
          lb.helium_customer_type_flag,

          lb.helium_employment_score,
          lb.helium_employment_flag,

          lb.helium_income_score,
          lb.helium_income_flag,

          lb.helium_demographic_score,
          lb.helium_demographic_flag,

          lb.net_monthly_income,
          lb.avg_monthly_rent,

          -- KYC status
          k.pan_status      AS kyc_pan_status,
          k.aadhaar_status  AS kyc_aadhaar_status,
          k.bureau_status   AS kyc_bureau_status

        FROM loan_booking_helium lb
        LEFT JOIN kyc_verification_status k
          ON k.lan = lb.lan
        WHERE lb.lan = ?
      `,
        [lan]
      );

    if (!rows.length) {
      return res.status(404).json({ message: "Loan not found" });
    }

    const row = rows[0];

    // Shape the response to match the frontend expectation
    const loan = {
      lan: row.lan,
      app_id: row.app_id,
      login_date: row.login_date,
      customer_name: row.customer_name,
      gender: row.gender,
      dob: row.dob,
      father_name: row.father_name,
      mother_name: row.mother_name,
      mobile_number: row.mobile_number,
      email_id: row.email_id,
      pan_number: row.pan_number,
      aadhar_number: row.aadhar_number,
      sanction_esign_status: row.sanction_esign_status,
      agreement_esign_status: row.agreement_esign_status,

      current_address: row.current_address,
      current_village_city: row.current_village_city,
      current_district: row.current_district,
      current_state: row.current_state,
      current_pincode: row.current_pincode,
      permanent_address: row.permanent_address,
      permanent_village_city: row.permanent_village_city,
      permanent_district: row.permanent_district,
      permanent_state: row.permanent_state,
      permanent_pincode: row.permanent_pincode,

      loan_amount: row.loan_amount,
      interest_rate: row.interest_rate,
      loan_tenure: row.loan_tenure,
      emi_amount: row.emi_amount,
      pre_emi: row.pre_emi,
      processing_fee: row.processing_fee,
      net_disbursement: row.net_disbursement,
      cibil_score: row.cibil_score,
      status: row.status,

      // HRS / risk fields
      helium_risk_score: row.helium_risk_score,
      helium_risk_band: row.helium_risk_band,
      helium_risk_flag: row.helium_risk_flag,

      helium_credit_score_comp: row.helium_credit_score_comp,
      helium_credit_score_flag: row.helium_credit_score_flag,

      helium_age_score: row.helium_age_score,
      helium_age_flag: row.helium_age_flag,

      helium_customer_type_score: row.helium_customer_type_score,
      helium_customer_type_flag: row.helium_customer_type_flag,

      helium_employment_score: row.helium_employment_score,
      helium_employment_flag: row.helium_employment_flag,

      helium_income_score: row.helium_income_score,
      helium_income_flag: row.helium_income_flag,

      helium_demographic_score: row.helium_demographic_score,
      helium_demographic_flag: row.helium_demographic_flag,

      net_monthly_income: row.net_monthly_income,
      avg_monthly_rent: row.avg_monthly_rent,
    };

    const kyc = {
      pan_status: row.kyc_pan_status || "PENDING",
      aadhaar_status: row.kyc_aadhaar_status || "PENDING",
      bureau_status: row.kyc_bureau_status || "PENDING",
    };

    return res.json({ loan, kyc });
  } catch (err) {
    console.error("❌ Error fetching Helium loan details:", err);
    return res.status(500).json({
      message: "Failed to fetch Helium loan details",
      error: err.sqlMessage || err.message,
    });
  }
});


// router.get("/aadhaar-callback", async (req, res) => {
//   try {
//     const { unifiedTransactionId, status } = req.query;
//     console.log("req.query;", req.query);

//     if (!unifiedTransactionId) {
//       return res.status(400).send("❌ Missing unifiedTransactionId");
//     }

//     console.log("📥 Incoming Aadhaar callback:", req.query);

//     // ❌ If user cancelled or failed Aadhaar KYC
//     if (status !== "success") {
//       return res.send("❌ Aadhaar verification failed or cancelled by user.");
//     }

//     // ------------------------------------------------------
//     // 1️⃣ Fetch Aadhaar KYC details from Digitap
//     // ------------------------------------------------------

//     const authHeader = Buffer.from(
//       `${process.env.DIGITAP_CLIENT_ID}:${process.env.DIGITAP_CLIENT_SECRET}`
//     ).toString("base64");

//     const digitapResponse = await axios.get(
//       `${process.env.DIGITAP_BASE_URL}/kyc-unified/v1/${unifiedTransactionId}/details/`,
//       {
//         headers: {
//           Authorization: `Basic ${authHeader}`,
//         },
//       }
//     );

//     console.log("📥 Aadhaar Callback Details:", digitapResponse.data);

//     const result = digitapResponse.data;
//     const uniqueId = result.model?.uniqueId;

//     if (!uniqueId) {
//       return res.status(400).send("❌ Digitap returned invalid KYC details");
//     }

//     // ------------------------------------------------------
//     // 2️⃣ Fetch LAN from helium_verification_status using uniqueId
//     // ------------------------------------------------------

//     const [rows] = await db.promise().query(
//       `SELECT lan FROM kyc_verification_status WHERE aadhaar_unique_id = ?`,
//       [uniqueId]
//     );

//     if (!rows.length) {
//       console.log("❌ No matching LAN found for uniqueId:", uniqueId);
//       return res.status(404).send("No matching loan record found.");
//     }

//     const lan = rows[0].lan;
//     console.log(`🔗 Aadhaar KYC mapped to LAN: ${lan}`);

//     // ------------------------------------------------------
//     // 3️⃣ Save Aadhaar KYC response and update status
//     // ------------------------------------------------------

//     await db.promise().query(
//       `UPDATE kyc_verification_status 
//        SET aadhaar_status='VERIFIED',
//            aadhaar_api_response=?,
//            updated_at=NOW()
//        WHERE lan=?`,
//       [JSON.stringify(result), lan]
//     );

//     console.log(`✅ Aadhaar VERIFIED for LAN: ${lan}`);

//     // ------------------------------------------------------
//     // 4️⃣ Trigger Auto-Approval Logic
//     // ------------------------------------------------------

//     await autoApproveIfAllVerified(lan);

//     // ------------------------------------------------------
//     // 5️⃣ Redirect user or show success message
//     // ------------------------------------------------------

//     return res.send(
//       `<h2>🎉 Aadhaar KYC Completed Successfully!</h2><p>LAN: ${lan}</p>`
//     );

//   } catch (err) {
//     console.error("❌ Aadhaar Callback Error:", err);

//     return res.status(500).send("❌ Aadhaar Callback Error");
//   }
// });


// routes/heliumAadhaarRoutes.js (for example)

router.get("/aadhaar-callback", async (req, res) => {
  const { unifiedTransactionId, status } = req.query;

  if (!unifiedTransactionId) {
    return res.status(400).send("❌ Missing transaction ID");
  }

  // If Digitap says failure in query itself
  if (status && status !== "success") {
    console.log("❌ Aadhaar callback status not success:", status);

    // If you want, you can mark FAILED here:
    // await db.promise().query(
    //   "UPDATE kyc_verification_status SET aadhaar_status='FAILED' WHERE aadhaar_transaction_id=?",
    //   [unifiedTransactionId]
    // );

    // Redirect back to frontend with failure
    return res.redirect(
      `http://localhost:5173/helium/kyc-result?status=failed&txn=${unifiedTransactionId}`
    );
  }

  try {
    console.log("📥 Inside Helium Aadhaar callback, txn:", unifiedTransactionId);

    const response = await axios.get(
      `${process.env.DIGITAP_BASE_URL}/kyc-unified/v1/${unifiedTransactionId}/details/`,
      {
        headers: {
          Authorization:
            "Basic " +
            Buffer.from(
              `${process.env.DIGITAP_CLIENT_ID}:${process.env.DIGITAP_CLIENT_SECRET}`
            ).toString("base64"),
        },
        timeout: 30000,
      }
    );

    const result = response.data;
    const model = result?.model || {};

    const uniqueId = model.uniqueId;
    const pdfLink = model.pdfLink || model.pdf_url || null; // adjust key if needed
    const xmlLink = model.xmlLink || model.xml_url || null; // adjust key if needed

    console.log("✅ Aadhaar details fetched from Digitap. uniqueId:", uniqueId);

    // 🔎 Find LAN from kyc_verification_status using aadhaar_unique_id
    const [rows] = await db
      .promise()
      .query(
        `SELECT lan FROM kyc_verification_status WHERE aadhaar_unique_id=?`,
        [uniqueId]
      );

    if (!rows.length) {
      console.error("❌ No KYC row found for uniqueId:", uniqueId);
      return res
        .status(404)
        .send("No matching KYC record found for this Aadhaar transaction");
    }

    const lan = rows[0].lan;
    console.log("🔗 Aadhaar KYC mapped to LAN:", lan);

    // 🧾 Download PDF & XML immediately (short-lived URLs)
    const pdfFileName = await downloadAndSaveFile(
      pdfLink,
      `aadhaar_${lan}.pdf`
    );
    const xmlFileName = await downloadAndSaveFile(
      xmlLink,
      `aadhaar_${lan}.xml`
    );

    // 🗃️ Insert into loan_documents table (like manual uploads)
    if (pdfFileName) {
      await db
        .promise()
        .query(
          `INSERT INTO loan_documents (lan, file_name, original_name, uploaded_at)
           VALUES (?, ?, ?, NOW())`,
          [lan, pdfFileName, "AADHAAR_DIGI_KYC_PDF"]
        );
    }

    if (xmlFileName) {
      await db
        .promise()
        .query(
          `INSERT INTO loan_documents (lan, file_name, original_name, uploaded_at)
           VALUES (?, ?, ?, NOW())`,
          [lan, xmlFileName, "AADHAAR_DIGI_KYC_XML"]
        );
    }

    // 🔍 Extract some key Aadhaar fields
    const aadhaarName = model.name || null;
    const aadhaarMasked = model.maskedAdharNumber || model.maskedAadhaar || null;
    let aadhaarDob = null;
    if (model.dob) {
      // assuming dob is "dd-mm-yyyy"
      const parts = model.dob.split("-");
      if (parts.length === 3) {
        aadhaarDob = `${parts[2]}-${parts[1]}-${parts[0]}`; // yyyy-mm-dd
      }
    }

    const addr = model.address || {};
    const aadhaarAddressStr = addr
      ? `${addr.house || ""}, ${addr.street || ""}, ${addr.state || ""} - ${
          addr.pc || ""
        }`
          .replace(/,\s*,/g, ",")
          .trim()
      : null;

    // ✅ Update KYC table with full JSON + paths + key fields
    await db
      .promise()
      .query(
        `UPDATE kyc_verification_status 
         SET aadhaar_status='VERIFIED',
             aadhaar_api_response=?,
             aadhaar_pdf_path=?,
             aadhaar_xml_path=?,
             aadhaar_name=?,
             aadhaar_masked_number=?,
             aadhaar_dob=?,
             aadhaar_address=?
         WHERE lan=?`,
        [
          JSON.stringify(result),
          pdfFileName || null,
          xmlFileName || null,
          aadhaarName,
          aadhaarMasked,
          aadhaarDob,
          aadhaarAddressStr,
          lan,
        ]
      );

    console.log("✅ Aadhaar VERIFIED for LAN:", lan);

    // 🔄 Trigger BRE auto-approval if all checks OK
    await autoApproveIfAllVerified(lan);

    // Redirect back to your frontend
     return res.send(
      `<h2>🎉 Aadhaar KYC Completed Successfully!</h2><p>LAN: ${lan}</p>`
    );
  } catch (err) {
    console.error("❌ Aadhaar Callback Error:", err.response?.data || err);

    // Optionally mark as FAILED
    // await db.promise().query(
    //   "UPDATE kyc_verification_status SET aadhaar_status='FAILED' WHERE aadhaar_transaction_id=?",
    //   [unifiedTransactionId]
    // );

    return res.redirect(
      `http://localhost:5173/helium/kyc-result?status=error&txn=${unifiedTransactionId}`
    );
  }
});


// 🔔 Digitap Webhook for Aadhaar KYC
// This URL is what you will give Digitap to whitelist, e.g.:
//   https://yourdomain.com/api/helium-loans/aadhaar-webhook
router.post("/v1/digi-aadhaar-webhook", async (req, res) => {
  try {
    console.log("Inside aaahdar webhook");
    const payload = req.body || {};
    console.log("📥 Digitap Aadhaar Webhook Payload:", JSON.stringify(payload).slice(0, 500));

    const transactionId = payload.transactionId;
    const status = (payload.status || "").toLowerCase();
    const data = payload.data || {};

    // We ALWAYS return 200 to stop retries, even if we ignore the event.
    if (!transactionId) {
      console.warn("⚠️ Webhook missing transactionId, ignoring.");
      return res.status(200).send("ignored");
    }

    // If failure -> mark FAILED (if record exists) and exit
    if (status !== "success") {
      console.log("❌ Aadhaar webhook status is failure for txn:", transactionId);

      const uniqueId = data.uniqueId || null;

      await db
        .promise()
        .query(
          `UPDATE kyc_verification_status
           SET aadhaar_status='FAILED'
           WHERE aadhaar_transaction_id = ? OR aadhaar_unique_id = ?`,
          [transactionId, uniqueId]
        );

      return res.status(200).send("failure-processed");
    }

    // ✅ Success flow
    const uniqueId = data.uniqueId;
    if (!uniqueId) {
      console.warn("⚠️ Webhook success but no uniqueId in data, ignoring.");
      return res.status(200).send("ignored");
    }

    // Find LAN from aadhaar_unique_id
    const [rows] = await db
      .promise()
      .query(
        `SELECT lan FROM kyc_verification_status WHERE aadhaar_unique_id = ?`,
        [uniqueId]
      );

    if (!rows.length) {
      console.error("❌ No KYC row found for uniqueId from webhook:", uniqueId);
      return res.status(200).send("no-matching-lan");
    }

    const lan = rows[0].lan;
    console.log("🔗 Webhook Aadhaar mapped to LAN:", lan);

    // // PDF + XML links from webhook data
    // const pdfLink = data.pdfLink || null; // presigned PDF URL
    // const xmlLink = data.link || null;    // zip/xml presigned URL

    // // Download & save locally
    // const pdfFilePath = await downloadAndSaveFile(
    //   pdfLink,
    //   `aadhaar_${lan}_${Date.now()}.pdf`
    // );
    // const xmlFilePath = await downloadAndSaveFile(
    //   xmlLink,
    //   `aadhaar_${lan}_${Date.now()}.xml`
    // );

    // PDF + XML from webhook data
const pdfLink = data.pdfLink || null; // can be base64 OR URL
const xmlLink = data.link || null;    // can be base64 OR URL

let pdfFilePath = null;
let xmlFilePath = null;

// 🔹 Handle PDF
if (pdfLink) {
  if (isProbablyUrl(pdfLink)) {
    // old behaviour (if provider ever sends URLs)
    pdfFilePath = await downloadAndSaveFile(
      pdfLink,
      `aadhaar_${lan}_${Date.now()}.pdf`
    );
  } else {
    // base64 → file
    pdfFilePath = await saveBase64ToFile(
      pdfLink,
      `aadhaar_${lan}_${Date.now()}.pdf`,
      "aadhaar"
    );
  }
}

// 🔹 Handle XML / ZIP
if (xmlLink) {
  if (isProbablyUrl(xmlLink)) {
    xmlFilePath = await downloadAndSaveFile(
      xmlLink,
      `aadhaar_${lan}_${Date.now()}.xml`
    );
  } else {
    xmlFilePath = await saveBase64ToFile(
      xmlLink,
      `aadhaar_${lan}_${Date.now()}.xml`,
      "aadhaar"
    );
  }
}


    // Insert docs into loan_documents (like manual upload)
    if (pdfFilePath) {
      await db
        .promise()
        .query(
          `INSERT INTO loan_documents (lan, file_name, original_name, uploaded_at)
           VALUES (?, ?, ?, NOW())`,
          [lan, path.basename(pdfFilePath), "AADHAAR_DIGI_KYC_PDF"]
        );
    }

    if (xmlFilePath) {
      await db
        .promise()
        .query(
          `INSERT INTO loan_documents (lan, file_name, original_name, uploaded_at)
           VALUES (?, ?, ?, NOW())`,
          [lan, path.basename(xmlFilePath), "AADHAAR_DIGI_KYC_XML"]
        );
    }

    // Extract Aadhaar basic fields from webhook data
    const aadhaarName = data.name || null;
    const aadhaarMasked = data.maskedAdharNumber || data.maskedAadhaar || null;

    let aadhaarDob = null;
    if (data.dob) {
      const parts = data.dob.split("-"); // dd-mm-yyyy
      if (parts.length === 3) {
        aadhaarDob = `${parts[2]}-${parts[1]}-${parts[0]}`; // yyyy-mm-dd
      }
    }

    const addr = data.address || {};
    const aadhaarAddressStr = addr
      ? `${addr.house || ""}, ${addr.street || ""}, ${addr.loc || ""}, ${
          addr.dist || ""
        }, ${addr.state || ""} - ${addr.pc || ""}`
          .replace(/,\s*,/g, ",")
          .replace(/^,\s*/g, "")
          .trim()
      : null;

    // Update KYC table with webhook JSON + paths + fields
    await db
      .promise()
      .query(
        `UPDATE kyc_verification_status
         SET aadhaar_status='VERIFIED',
             aadhaar_api_response=?,
             aadhaar_pdf_path=?,
             aadhaar_xml_path=?,
             aadhaar_name=?,
             aadhaar_masked_number=?,
             aadhaar_dob=?,
             aadhaar_address=?
         WHERE lan=?`,
        [
          JSON.stringify(payload),  // full webhook payload
          pdfFilePath || null,
          xmlFilePath || null,
          aadhaarName,
          aadhaarMasked,
          aadhaarDob,
          aadhaarAddressStr,
          lan,
        ]
      );

    console.log("✅ Aadhaar VERIFIED via webhook for LAN:", lan);

    // Optionally run auto-approval if all checks done
    await autoApproveIfAllVerified(lan);

    return res.status(200).send("ok");
  } catch (err) {
    console.error("❌ Aadhaar Webhook Processing Error:", err);
    // still return 200 so Digitap doesn't spam retries
    return res.status(200).send("error-logged");
  }
});


module.exports = router;