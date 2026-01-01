// const express = require("express");
// const db = require("../../config/db");
// const verifyApiKey = require("../../middleware/apiKeyAuth");
// const axios = require("axios");
// const path = require("path");
// const fs = require("fs");
// const { generateAgreementPdf } = require("../../services/pdfGenerationService");
// const { initEsign } = require("../../services/esignService");
// const { normalizeLan } = require("../utils/lanHelper");

// const lan = normalizeLan(generatedLan);



// const router = express.Router();

// /* ================== UPLOAD SETUP ================== */
// const uploadPath = path.join(__dirname, "../../uploads");
// if (!fs.existsSync(uploadPath)) {
//   fs.mkdirSync(uploadPath, { recursive: true });
// }

// /* ================== LAN GENERATOR ================== */
// const generateLoanIdentifiers = async (lender) => {
//   lender = lender.trim().toUpperCase();

//   if (lender !== "ZYPAY") {
//     throw new Error("Invalid lender type");
//   }

//   const prefixLan = "ZypF1000";

//   const [rows] = await db.promise().query(
//     "SELECT last_sequence FROM loan_sequences WHERE lender_name = ? FOR UPDATE",
//     [lender]
//   );

//   let newSequence;

//   if (rows.length > 0) {
//     newSequence = rows[0].last_sequence + 1;
//     await db.promise().query(
//       "UPDATE loan_sequences SET last_sequence = ? WHERE lender_name = ?",
//       [newSequence, lender]
//     );
//   } else {
//     newSequence = 11000;
//     await db.promise().query(
//       "INSERT INTO loan_sequences (lender_name, last_sequence) VALUES (?, ?)",
//       [lender, newSequence]
//     );
//   }

//   return {
//     lan: `${prefixLan}${newSequence}`,
//   };
// };

// /* ================== CREATE LOAN ================== */
// router.post("/v1/zypay-customer-lb", verifyApiKey, async (req, res) => {
//   try {
//     // 🔐 Partner validation
//     console.log("ROHIT ");
//     if (
//       !req.partner ||
//       (req.partner.name || "").trim() !== "ZYPAY"
//     ) {
//       return res.status(403).json({
//         message: "This route is only for Zypay Customer partner.",
//       });
//     }

//     const data = req.body;
//     console.log(data);

//     // 🔎 lenderType check
//     if (!data.lenderType || data.lenderType.toUpperCase() !== "ZYPAY") {
//       return res.status(400).json({
//         message: "Invalid lenderType. Only ZYPAY allowed.",
//       });
//     }

//     // ✅ Required fields
//     const requiredFields = [
//       "customer_id",
//       "login_date",
//       "first_name",
//       "last_name",
//       "gender",
//       "dob",
//       "father_name",
//       "mobile_number",
//       "pan_number",
//       "aadhar_number",

//       "current_address",
//       "current_village_city",
//       "current_district",
//       "current_state",
//       "current_pincode",

//       "permanent_address",
//       "permanent_village_city",
//       "permanent_district",
//       "permanent_state",
//       "permanent_pincode",

//       "loan_amount",
//       "interest_rate",
//       "loan_tenure",

//       "customer_type",
//       "employment_type",
//       "net_monthly_income",
//       "residence_type",

//       "bank_name",
//       "name_in_bank",
//       "account_number",
//       "ifsc",

//       "brand_name",
//       "model_name",
//       "storage",
//       "color",
//       "mrp",
//       "dp_amount",
//       "buero_score",
//     ];

//     for (const field of requiredFields) {
//       if (data[field] === undefined || data[field] === null) {
//         return res.status(400).json({ message: `${field} is required.` });
//       }
//     }

//     // 🔁 Duplicate PAN / Aadhaar check
//     const [existing] = await db.promise().query(
//       `SELECT lan FROM loan_booking_zypay_customer
//        WHERE pan_number = ? OR aadhar_number = ?`,
//       [data.pan_number, data.aadhar_number]
//     );

//     if (existing.length > 0) {
//       return res.status(409).json({
//   success: false,
//   code: "DUPLICATE_CUSTOMER",
//   message: "Customer already exists with PAN or Aadhaar.",
//   lan: existing[0].lan,
// });
//     }

//     // 🎫 Generate LAN
//     const { lan } = await generateLoanIdentifiers("ZYPAY");

//     const customer_name = `${data.first_name} ${data.last_name}`.trim();
//     const agreement_date = data.login_date;

//     // 📝 INSERT SQL
//    const insertSql = `
//   INSERT INTO loan_booking_zypay_customer (
//     customer_id,
//     first_name, last_name, customer_name, login_date,
//     lan,

//     gender, dob, father_name, mobile_number,email_id,
//     pan_number, aadhar_number,

//     current_address, current_village_city, current_district, current_state, current_pincode,
//     permanent_address, permanent_village_city, permanent_district, permanent_state, permanent_pincode,

//     loan_amount, interest_rate, loan_tenure,

//     customer_type, employment_type, net_monthly_income, residence_type,

//     bank_name, name_in_bank, account_number, ifsc,

//     brand_name, model_name, storage, color, mrp, dp_amount, buero_score,

//     product, lender, status, agreement_date
//   ) VALUES (
//     ?, ?, ?, ?, ?,          -- 5
//     ?,                      -- 6

//     ?, ?, ?, ?,             -- 10
//     ?, ?,                   -- 12

//     ?, ?, ?, ?, ?,          -- 17
//     ?, ?, ?, ?, ?,          -- 22

//     ?, ?, ?,                -- 25

//     ?, ?, ?, ?,             -- 29

//     ?, ?, ?, ?,             -- 33

//     ?, ?, ?, ?, ?, ?, ?,    -- 40

//     ?, ?, ?, ?, ?              -- ✅ 45 (FIXED)
//   );
// `;


//     const values = [
//       data.customer_id,
//       data.first_name,
//       data.last_name,
//       customer_name,
//       data.login_date,

//       lan,

//       data.gender,
//       data.dob,
//       data.father_name,
//       data.mobile_number,
//       data.email_id ,

//       data.pan_number,
//       data.aadhar_number,

//       data.current_address,
//       data.current_village_city,
//       data.current_district,
//       data.current_state,
//       data.current_pincode,

//       data.permanent_address,
//       data.permanent_village_city,
//       data.permanent_district,
//       data.permanent_state,
//       data.permanent_pincode,

//       data.loan_amount,
//       data.interest_rate,
//       data.loan_tenure,

//       data.customer_type,
//       data.employment_type,
//       data.net_monthly_income,
//       data.residence_type,

//       data.bank_name,
//       data.name_in_bank,
//       data.account_number,
//       data.ifsc,

//       data.brand_name,
//       data.model_name,
//       data.storage,
//       data.color,
//       data.mrp,
//       data.dp_amount,
//       data.buero_score,

//       "Monthly Loan",
//       "ZYPAY",
//       "Login",
//       agreement_date,
//     ];

//      if (values.length !== 45) {
//       throw new Error(`SQL values mismatch: ${values.length}`);
//     }

//     await db.promise().query(insertSql, values);

//     /* ================== POST INSERT ================== */
//     await db.promise().query("CALL sp_generate_zypay_customer_rps(?)", [lan]);
//     await db.promise().query(
//       "INSERT INTO kyc_verification_status (lan) VALUES (?)",
//       [lan]
//     );
//     await db.promise().query(
//       "CALL sp_build_zypay_customer_loan_summary(?)",
//       [lan]
//     );

//     /* ================== RESPONSE ================== */
//     res.status(201).json({
//       success: true,
//       code: "LMS_CREATED",
//       message: "Zypay Customer loan created successfully",
//       lan,
//     });

//     /* ================== AUTO AGREEMENT + ESIGN ================== */
//     /* ================== AUTO AGREEMENT + ESIGN ================== */
// setTimeout(async () => {
//   try {
//     console.log("🧾 Auto agreement start for", lan);

//     const result = await generateAgreementPdf(lan);

//     if (!result || !result.pdfName) {
//       throw new Error("Agreement PDF not generated");
//     }

//     await db.promise().query(
//       `UPDATE loan_booking_zypay_customer
//        SET agreement_pdf_name=?, agreement_generated_at=NOW()
//        WHERE lan=?`,
//       [result.pdfName, lan]
//     );

//     console.log(`✅ Agreement generated for ${lan}`);

//     await initEsign(lan, "AGREEMENT");
//     console.log(`✍️ Agreement eSign initiated for ${lan}`);

//   } catch (err) {
//     console.error(`❌ Auto Agreement failed for ${lan}:`, err.message);
//   }
// }, 3000); // ⏱ REQUIRED delay


//   } catch (error) {
//     console.error("❌ Zypay Customer API Error:", error);
//     res.status(500).json({
//       message: "Failed to create Zypay Customer loan.",
//       error: error.sqlMessage || error.message,
//     });
//   }
// });

// module.exports = router;


const express = require("express");
const db = require("../../config/db");
const verifyApiKey = require("../../middleware/apiKeyAuth");
// const axios = require("axios"); // ❌ unused (remove if not needed)
const path = require("path");
const fs = require("fs");
const { generateAgreementPdf } = require("../../services/pdfGenerationService");
const { initEsign } = require("../../services/esignService");

// ✅ FIX: correct helper path (adjust if your folder structure differs)
const { normalizeLan } = require("../../utils/lanHelper");

const router = express.Router();

/* ================== UPLOAD SETUP ================== */
const uploadPath = path.join(__dirname, "../../uploads");
if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true });
}

/* ================== LAN GENERATOR ================== */
const generateLoanIdentifiers = async (lender) => {
  lender = String(lender).trim().toUpperCase();

  if (lender !== "ZYPAY") {
    throw new Error("Invalid lender type");
  }

  const prefixLan = "ZypF1000";

  // NOTE: FOR UPDATE works reliably only inside a transaction.
  const [rows] = await db
    .promise()
    .query(
      "SELECT last_sequence FROM loan_sequences WHERE lender_name = ? FOR UPDATE",
      [lender]
    );

  let newSequence;

  if (rows.length > 0) {
    newSequence = Number(rows[0].last_sequence) + 1;
    await db
      .promise()
      .query("UPDATE loan_sequences SET last_sequence = ? WHERE lender_name = ?", [
        newSequence,
        lender,
      ]);
  } else {
    newSequence = 11000;
    await db
      .promise()
      .query("INSERT INTO loan_sequences (lender_name, last_sequence) VALUES (?, ?)", [
        lender,
        newSequence,
      ]);
  }

  return { lan: `${prefixLan}${newSequence}` };
};

/* ================== CREATE LOAN ================== */
router.post("/v1/zypay-customer-lb", verifyApiKey, async (req, res) => {
  try {
    // 🔐 Partner validation
    console.log("ROHIT");
    if (!req.partner || String(req.partner.name || "").trim().toUpperCase() !== "ZYPAY") {
      return res.status(403).json({
        message: "This route is only for Zypay Customer partner.",
      });
    }

    const data = req.body;
    console.log(data);

    // 🔎 lenderType check
    if (!data.lenderType || String(data.lenderType).toUpperCase() !== "ZYPAY") {
      return res.status(400).json({
        message: "Invalid lenderType. Only ZYPAY allowed.",
      });
    }

    // ✅ Required fields
    const requiredFields = [
      "customer_id",
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
      "residence_type",

      "bank_name",
      "name_in_bank",
      "account_number",
      "ifsc",

      "brand_name",
      "model_name",
      "storage",
      "color",
      "mrp",
      "dp_amount",
      "buero_score",
    ];

    for (const field of requiredFields) {
      if (data[field] === undefined || data[field] === null) {
        return res.status(400).json({ message: `${field} is required.` });
      }
    }

    // 🔁 Duplicate PAN / Aadhaar check
    const [existing] = await db.promise().query(
      `SELECT lan FROM loan_booking_zypay_customer
       WHERE pan_number = ? OR aadhar_number = ?`,
      [data.pan_number, data.aadhar_number]
    );

    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        code: "DUPLICATE_CUSTOMER",
        message: "Customer already exists with PAN or Aadhaar.",
        lan: existing[0].lan,
      });
    }

    // 🎫 Generate LAN (✅ normalize inside route, not outside)
    const generated = await generateLoanIdentifiers("ZYPAY");
    const lan = normalizeLan(generated.lan); // ✅ safe normalization (keeps uppercase in code paths)

    const customer_name = `${data.first_name} ${data.last_name}`.trim();
    const agreement_date = data.login_date;

    // 📝 INSERT SQL
    const insertSql = `
      INSERT INTO loan_booking_zypay_customer (
        customer_id,
        first_name, last_name, customer_name, login_date,
        lan,

        gender, dob, father_name, mobile_number, email_id,
        pan_number, aadhar_number,

        current_address, current_village_city, current_district, current_state, current_pincode,
        permanent_address, permanent_village_city, permanent_district, permanent_state, permanent_pincode,

        loan_amount, interest_rate, loan_tenure,

        customer_type, employment_type, net_monthly_income, residence_type,

        bank_name, name_in_bank, account_number, ifsc,

        brand_name, model_name, storage, color, mrp, dp_amount, buero_score,

        product, lender, status, agreement_date
      ) VALUES (
        ?, ?, ?, ?, ?,            -- 5
        ?,                        -- 6

        ?, ?, ?, ?, ?,            -- 11
        ?, ?,                     -- 13

        ?, ?, ?, ?, ?,            -- 18
        ?, ?, ?, ?, ?,            -- 23

        ?, ?, ?,                  -- 26

        ?, ?, ?, ?,               -- 30

        ?, ?, ?, ?,               -- 34

        ?, ?, ?, ?, ?, ?, ?,      -- 41

        ?, ?, ?, ?, ?             -- 46
      );
    `;

    const values = [
      data.customer_id,
      data.first_name,
      data.last_name,
      customer_name,
      data.login_date,

      lan,

      data.gender,
      data.dob,
      data.father_name,
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
      data.permanent_village_city,
      data.permanent_district,
      data.permanent_state,
      data.permanent_pincode,

      data.loan_amount,
      data.interest_rate,
      data.loan_tenure,

      data.customer_type,
      data.employment_type,
      data.net_monthly_income,
      data.residence_type,

      data.bank_name,
      data.name_in_bank,
      data.account_number,
      data.ifsc,

      data.brand_name,
      data.model_name,
      data.storage,
      data.color,
      data.mrp,
      data.dp_amount,
      data.buero_score,

      "Monthly Loan",
      "ZYPAY",
      "Login",
      agreement_date,
    ];

    // ✅ count check (must match placeholders)
    if (values.length !== 46) {
      throw new Error(`SQL values mismatch: ${values.length} (expected 46)`);
    }

    await db.promise().query(insertSql, values);

    /* ================== POST INSERT ================== */
    await db.promise().query("CALL sp_generate_zypay_customer_rps(?)", [lan]);
    await db.promise().query("INSERT INTO kyc_verification_status (lan) VALUES (?)", [lan]);
    await db.promise().query("CALL sp_build_zypay_customer_loan_summary(?)", [lan]);

    /* ================== RESPONSE ================== */
    res.status(201).json({
      success: true,
      code: "LMS_CREATED",
      message: "Zypay Customer loan created successfully",
      lan,
    });

    /* ================== AUTO AGREEMENT + ESIGN ================== */
    setTimeout(async () => {
      try {
        console.log("🧾 Auto agreement start for", lan);

        const result = await generateAgreementPdf(lan);
        if (!result || !result.pdfName) throw new Error("Agreement PDF not generated");

        await db.promise().query(
          `UPDATE loan_booking_zypay_customer
           SET agreement_pdf_name=?, agreement_generated_at=NOW()
           WHERE lan=?`,
          [result.pdfName, lan]
        );

        console.log(`✅ Agreement generated for ${lan}`);

        await initEsign(lan, "AGREEMENT");
        console.log(`✍️ Agreement eSign initiated for ${lan}`);
      } catch (err) {
        console.error(`❌ Auto Agreement failed for ${lan}:`, err.message);
      }
    }, 3000);
  } catch (error) {
    console.error("❌ Zypay Customer API Error:", error);
    return res.status(500).json({
      message: "Failed to create Zypay Customer loan.",
      error: error.sqlMessage || error.message,
    });
  }
});

module.exports = router;
