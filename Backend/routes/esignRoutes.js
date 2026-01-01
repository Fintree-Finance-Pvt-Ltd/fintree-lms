// const express = require("express");
// const db = require("../config/db");
// const dayjs = require("dayjs");
// const CU_date = dayjs().format("DD-MM-YYYY");
// const handlebars = require("handlebars");
// const puppeteer = require("puppeteer");
// const authenticateUser = require("../middleware/verifyToken");
// const fs = require("fs");
// const path = require("path");
// const {
//   generateSanctionLetterPdf,
//   generateAgreementPdf
// } = require("../services/pdfGenerationService");
// const { initEsign } = require("../services/esignService")
// const router = express.Router();


// const templatePath = path.join(
//   __dirname,
//   "../templates",
//   "helium_agreement.html"
// );

// const templateHtml = fs.readFileSync(templatePath, "utf-8");

// const template = handlebars.compile(templateHtml);

// const rawTemplateHtml = fs.readFileSync(templatePath, "utf-8");

// // Helper: replace all {{KEY}} with data[KEY]

// function fillTemplate(html, data) {
//   let out = html;

//   for (const [key, value] of Object.entries(data)) {
//     const safe = value == null ? "" : String(value);

//     // matches {{key}} or {{ key }} anywhere

//     const pattern = new RegExp(`{{\\s*${key}\\s*}}`, "g");

//     out = out.replace(pattern, safe);
//   }

//   return out;
// }

// function numberToWords(num) {
//   if (!num || num === 0) return "Zero Rupees Only";

//   const a = [
//     "",
//     "One",
//     "Two",
//     "Three",
//     "Four",
//     "Five",
//     "Six",
//     "Seven",
//     "Eight",
//     "Nine",

//     "Ten",
//     "Eleven",
//     "Twelve",
//     "Thirteen",
//     "Fourteen",
//     "Fifteen",
//     "Sixteen",

//     "Seventeen",
//     "Eighteen",
//     "Nineteen",
//   ];

//   const b = [
//     "",
//     "",
//     "Twenty",
//     "Thirty",
//     "Forty",
//     "Fifty",
//     "Sixty",
//     "Seventy",

//     "Eighty",
//     "Ninety",
//   ];

//   const convert = (n) => {
//     if (n < 20) return a[n];

//     if (n < 100) return b[Math.floor(n / 10)] + (n % 10 ? " " + a[n % 10] : "");

//     if (n < 1000)
//       return (
//         a[Math.floor(n / 100)] +
//         " Hundred" +
//         (n % 100 ? " " + convert(n % 100) : "")
//       );

//     if (n < 100000)
//       return (
//         convert(Math.floor(n / 1000)) +
//         " Thousand" +
//         (n % 1000 ? " " + convert(n % 1000) : "")
//       );

//     if (n < 10000000)
//       return (
//         convert(Math.floor(n / 100000)) +
//         " Lakh" +
//         (n % 100000 ? " " + convert(n % 100000) : "")
//       );

//     return (
//       convert(Math.floor(n / 10000000)) +
//       " Crore" +
//       (n % 10000000 ? " " + convert(n % 10000000) : "")
//     );
//   };

//   return convert(num);
// }


// router.get("/api/loans", async (req, res) => {
//   try {
//     const [rows] = await db.promise().query(
//       `SELECT

//          id,

//          lan,

//          C_N,

//          L_A

//        FROM helium_loan_summary

//        ORDER BY id DESC`
//     );

//     res.json(rows);
//   } catch (err) {
//     console.error("Error fetching loans:", err);

//     res.status(500).json({ message: "Server error" });
//   }
// });


// router.get("/:lan/pdf", async (req, res) => {
//   const lan = req.params.lan;

//   try {
//     // STEP A: Get summary row from helium_loan_summary

//     const [summaryRows] = await db.promise().query(
//       `SELECT

//          lan,

//          C_N,

//          cur_add,

//          per_add,

//          L_A,

//          I_R,

//          L_T,

//          B_Na,

//          A_no,

//          ifsc,

//          DATE_FORMAT(L_date, '%d-%m-%Y') AS L_date,

//          E_S,

//          I_S,

//          P_S,

//          T_E,

//          L_P

//        FROM helium_loan_summary

//        WHERE lan = ?`,

//       [lan]
//     );

//     if (summaryRows.length === 0) {
//       return res.status(404).json({ message: "Loan summary not found" });
//     }

//     const summary = summaryRows[0];

//     // ⭐ NEW: Convert loan amount to words

//     const L_A_W = numberToWords(summary.L_A);

//     // ⭐ Insert current date (DD-MM-YYYY)

//     const CU_date = dayjs().format("DD-MM-YYYY");

//     // STEP B: Get EMI (and schedule info) from loan_rps_helium

//     const [rpsRows] = await db.promise().query(
//       `SELECT

//       id,

//          emi,

//          interest,

//          principal,

//          opening,

//          closing,

//          remaining_emi,

//          remaining_interest,

//          remaining_principal

//        FROM loan_rps_helium

//        WHERE lan = ?

//        ORDER BY id ASC`,

//       [lan]
//     );

//     const rps = rpsRows[0] || {};

//     // STEP C: Data for template – match keys to {{placeholders}}

//     const dataForTemplate = {
//       lan: summary.lan,

//       C_N: summary.C_N,

//       cur_add: summary.cur_add,

//       per_add: summary.per_add,

//       L_A: summary.L_A,

//       L_A_W,

//       CU_date,

//       I_R: summary.I_R,

//       L_T: summary.L_T,

//       B_Na: summary.B_Na,

//       A_no: summary.A_no,

//       ifsc: summary.ifsc,

//       L_date: summary.L_date,

//       E_S: summary.E_S,

//       I_S: summary.I_S,

//       P_S: summary.P_S,

//       T_E: summary.T_E, // total EMI

//       L_P: summary.L_P, // loan principal

//       // from RPS:

//       id: rps.id || "",

//       emi: rps.emi || 0,

//       opening: rps.opening || 0,

//       closing: rps.closing || 0,

//       remaining_emi: rps.remaining_emi || 0,

//       remaining_interest: rps.remaining_interest || 0,

//       remaining_principal: rps.remaining_principal || 0,

//       interest: rps.interest || 0,

//       principal: rps.principal || 0,
//     };

//     // STEP D: fill the Word-exported HTML template

//     const filledHtml = fillTemplate(rawTemplateHtml, dataForTemplate);

//     // STEP E: HTML → PDF with full logo/header formatting

//     const browser = await puppeteer.launch({
//       headless: "new",

//       args: ["--no-sandbox", "--disable-setuid-sandbox"],
//     });

//     const page = await browser.newPage();

//     await page.setContent(filledHtml, {
//       waitUntil: "networkidle0",
//       timeout: 120000,
//     });

//     const pdfBuffer = await page.pdf({
//       format: "A4",

//       printBackground: true,

//       displayHeaderFooter: false, // IMPORTANT

//       margin: {
//         top: "20mm",

//         bottom: "20mm",

//         left: "15mm",

//         right: "15mm",
//       },
//     });

//     await browser.close();

//     res.setHeader("Content-Type", "application/pdf");

//     res.setHeader(
//       "Content-Disposition",

//       `attachment; filename="Rental_Agreement_${lan}.pdf"`
//     );

//     res.send(pdfBuffer);
//   } catch (err) {
//     console.error("Error generating PDF:", err);

//     res.status(500).json({ message: "Error generating PDF" });
//   }
// });





// ///////////////////////// new routes ///////////////////


// router.post("/:lan/esign/sanction", authenticateUser, async (req, res) => {
//   try {
//     const out = await initEsign(req.params.lan, "SANCTION");
//     res.json(out);
//   } catch (err) {
//     res.status(500).json({ success: false, error: err.message });
//   }
// });

// router.post("/:lan/esign/agreement", authenticateUser, async (req, res) => {
//   try {
//     // 🔐 ensure SANCTION completed before agreement
//     const [rows] = await db.promise().query(
//       "SELECT sanction_esign_status FROM loan_booking_helium WHERE lan=?",
//       [req.params.lan]
//     );
//     // if (rows[0].sanction_esign_status !== "SIGNED") {
//     //   return res.status(400).json({
//     //     success: false,
//     //     message: "Sanction Letter must be signed before loan agreement."
//     //   });
//     // }

//     const out = await initEsign(req.params.lan, "AGREEMENT");
//     res.json(out);
//   } catch (err) {
//     res.status(500).json({ success: false, error: err.message });
//   }
// });


// router.post("/v1/digio-esign-webhook", async (req, res) => {
//   const event = req.body;
//   const docId = event.id;
//   const status = event.state;

//   const [rows] = await db.promise().query(
//     "SELECT lan, document_type FROM esign_documents WHERE document_id=?",
//     [docId]
//   );
//   if (!rows.length) return res.status(200).send("ignored");

//   const { lan, document_type } = rows[0];

//   // Update esign_documents table
//   await db.promise().query(
//     "UPDATE esign_documents SET status=?, raw_response=? WHERE document_id=?",
//     [status, JSON.stringify(event), docId]
//   );

//   // Update loan table
//   if (document_type === "SANCTION") {
//     await db.promise().query(
//       `UPDATE loan_booking_helium SET sanction_esign_status=? WHERE lan=?`,
//       [status === "signed" ? "SIGNED" : status, lan]
//     );
//   } else {
//     await db.promise().query(
//       `UPDATE loan_booking_helium SET agreement_esign_status=? WHERE lan=?`,
//       [status === "signed" ? "SIGNED" : status, lan]
//     );
//   }

//   res.status(200).send("ok");
// });


// router.get("/:lan/generate-sanction", async (req, res) => {
//   try {
//     const { lan } = req.params;

//     // 1. Fetch loan
//     const [rows] = await db
//       .promise()
//       .query("SELECT * FROM loan_booking_helium WHERE lan=?", [lan]);

//     if (!rows.length) {
//       return res.status(404).json({ message: "Loan not found" });
//     }

//     const loan = rows[0];

//     // 2. Generate PDF → returns ONLY fileName
//     const pdfName = await generateSanctionLetterPdf(lan);

//     if (!pdfName) {
//       return res.status(500).json({
//         success: false,
//         message: "PDF generation failed",
//       });
//     }

//     // 3. Save in DB
//     await db.promise().query(
//       `INSERT INTO loan_documents(lan, file_name, original_name, uploaded_at)
//        VALUES (?,?,?,NOW())`,
//       [lan, pdfName, "SANCTION_LETTER"]
//     );

//     // 4. Return correct URL
//     return res.json({
//       success: true,
//       url: `/generated/${pdfName}`,
//       pdfName,
//     });
//   } catch (err) {
//     console.error("Sanction PDF Error:", err);
//     return res.status(500).json({
//       success: false,
//       message: "Failed to generate sanction letter",
//     });
//   }
// });


// router.get("/:lan/generate-agreement", async (req, res) => {
//   try {
//     const { lan } = req.params;

//     const [rows] = await db
//       .promise()
//       .query("SELECT * FROM loan_booking_helium WHERE lan=?", [lan]);

//     if (!rows.length) return res.status(404).json({ message: "Loan not found" });

//     const loan = rows[0];

//     const { filePath, pdfName } = await generateAgreementPdf(lan, loan);

//     // Save in DB
//     await db.promise().query(
//       `INSERT INTO loan_documents(lan, file_name, original_name, uploaded_at)
//        VALUES (?,?,?,NOW())`,
//       [lan, pdfName, "AGREEMENT"]
//     );

//     res.json({
//       success: true,
//       url: `/uploads/${pdfName}`,
//       pdfName
//     });
//   } catch (err) {
//     console.error("Agreement PDF Error:", err);
//     res.status(500).json({ message: "Failed to generate agreement" });
//   }
// });






// ////////////////////////// new routes for digitap //////////////////////

// // router.post("/:lan/esign/:type", authenticateUser, async (req, res) => {
// //   try {
// //     const { lan, type } = req.params;
// //     const result = await initEsign(lan, type.toUpperCase());

// //     res.json(result);
// //   } catch (err) {
// //     console.error("❌ ESIGN ERROR:", err);
// //     res.status(500).json({ success: false, error: err.message });
// //   }
// // });

// module.exports = router;
////////////////////////////////////////// NEW CODE FOR CUST AND HELIUM BOTH /////////////////////////////////////////
// const express = require("express");
// const db = require("../config/db");
// const dayjs = require("dayjs");
// const handlebars = require("handlebars");
// const puppeteer = require("puppeteer");
// const authenticateUser = require("../middleware/verifyToken");
// const fs = require("fs");
// const path = require("path");
// const {
//   generateSanctionLetterPdf,
//   generateAgreementPdf
// } = require("../services/pdfGenerationService");
// const { initEsign } = require("../services/esignService");

// const router = express.Router();

// /* ======================================================
//    TEMPLATE LOADER
// ====================================================== */
// function isCustomerLan(lan = "") {
//   const s = String(lan).toUpperCase();
//   return s.startsWith("ZypF1"); // ✅ add ZypF
// }

// function loadAgreementTemplate(lan) {
//   const templateFile = lan.startsWith("ZypF1")
//     ? "Customer_Aggrement_Zypay.html"
//     : "helium_agreement.html";

//   const templatePath = path.join(__dirname, "../templates", templateFile);
//   const rawHtml = fs.readFileSync(templatePath, "utf-8");

//   return rawHtml;
// }

// /* ======================================================
//    TABLE RESOLVER
// ====================================================== */
// function getLoanContext(lan) {
//   if (lan.startsWith("ZypF1")) {
//     return {
//       summaryTable: "customer_loan_summary",
//       rpsTable: "loan_rps_customer",
//       bookingTable: "loan_booking_zypay_customer"
//     };
//   }

//   return {
//     summaryTable: "helium_loan_summary",
//     rpsTable: "loan_rps_helium",
//     bookingTable: "loan_booking_helium"
//   };
// }

// /* ======================================================
//    HELPERS
// ====================================================== */
// function fillTemplate(html, data) {
//   let out = html;
//   for (const [key, value] of Object.entries(data)) {
//     const safe = value == null ? "" : String(value);
//     out = out.replace(new RegExp(`{{\\s*${key}\\s*}}`, "g"), safe);
//   }
//   return out;
// }

// function numberToWords(num) {
//   if (!num || num === 0) return "Zero Rupees Only";

//   const a = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
//     "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
//     "Seventeen", "Eighteen", "Nineteen"];
//   const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

//   const convert = (n) => {
//     if (n < 20) return a[n];
//     if (n < 100) return b[Math.floor(n / 10)] + (n % 10 ? " " + a[n % 10] : "");
//     if (n < 1000) return a[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " + convert(n % 100) : "");
//     if (n < 100000) return convert(Math.floor(n / 1000)) + " Thousand" + (n % 1000 ? " " + convert(n % 1000) : "");
//     if (n < 10000000) return convert(Math.floor(n / 100000)) + " Lakh" + (n % 100000 ? " " + convert(n % 100000) : "");
//     return convert(Math.floor(n / 10000000)) + " Crore" + (n % 10000000 ? " " + convert(n % 10000000) : "");
//   };

//   return convert(num);
// }

// /* ======================================================
//    FETCH ALL LOANS
// ====================================================== */
// router.get("/api/loans", async (req, res) => {
//   try {
//     const [rows] = await db.promise().query(`
//       SELECT lan, C_N, L_A FROM helium_loan_summary
//       UNION ALL
//       SELECT lan, C_N, L_A FROM customer_loan_summary
//       ORDER BY lan DESC
//     `);
//     res.json(rows);
//   } catch (err) {
//     res.status(500).json({ message: "Server error" });
//   }
// });

// /* ======================================================
//    PDF GENERATION
// ====================================================== */
// router.get("/:lan/pdf", async (req, res) => {
//   const { lan } = req.params;
//   const { summaryTable, rpsTable } = getLoanContext(lan);

//   try {
//     const rawTemplateHtml = loadAgreementTemplate(lan);

//     const [summaryRows] = await db.promise().query(
//       `
//       SELECT
//         lan, C_N, cur_add, per_add, L_A, I_R, L_T,
//         B_Na, A_no, ifsc,
//         DATE_FORMAT(L_date,'%d-%m-%Y') AS L_date,
//         E_S, I_S, P_S, T_E, L_P
//       FROM ${summaryTable}
//       WHERE lan=?
//       `,
//       [lan]
//     );

//     if (!summaryRows.length) {
//       return res.status(404).json({ message: "Loan not found" });
//     }

//     const summary = summaryRows[0];

//     const [rpsRows] = await db.promise().query(
//       `
//       SELECT
//         id, emi, interest, principal,
//         opening, closing,
//         remaining_emi, remaining_interest, remaining_principal
//       FROM ${rpsTable}
//       WHERE lan=?
//       ORDER BY id ASC
//       `,
//       [lan]
//     );

//     const data = {
//       ...summary,
//       ...rpsRows[0],
//       CU_date: dayjs().format("DD-MM-YYYY"),
//       L_A_W: numberToWords(summary.L_A)
//     };

//     const html = fillTemplate(rawTemplateHtml, data);

//     const browser = await puppeteer.launch({
//       headless: "new",
//       args: ["--no-sandbox"]
//     });

//     const page = await browser.newPage();
//     await page.setContent(html, { waitUntil: "networkidle0" });

//     const pdf = await page.pdf({
//       format: "A4",
//       printBackground: true,
//       margin: { top: "20mm", bottom: "20mm", left: "15mm", right: "15mm" }
//     });

//     await browser.close();

//     res.setHeader("Content-Type", "application/pdf");
//     res.setHeader("Content-Disposition", `attachment; filename="Agreement_${lan}.pdf"`);
//     res.send(pdf);
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ message: "PDF generation failed" });
//   }
// });

// /* ======================================================
//    ESIGN ROUTES
// ====================================================== */
// router.post("/:lan/esign/:type", authenticateUser, async (req, res) => {
//   const { lan, type } = req.params;
//   const { bookingTable } = getLoanContext(lan);

//   try {
//     if (type === "agreement") {
//       const [rows] = await db.promise().query(
//         `SELECT sanction_esign_status FROM ${bookingTable} WHERE lan=?`,
//         [lan]
//       );
//       if (rows[0]?.sanction_esign_status !== "SIGNED") {
//         return res.status(400).json({
//           success: false,
//           message: "Sanction letter must be signed first"
//         });
//       }
//     }

//     const out = await initEsign(lan, type.toUpperCase());
//     res.json(out);
//   } catch (err) {
//     res.status(500).json({ success: false, error: err.message });
//   }
// });

// /* ======================================================
//    DIGIO WEBHOOK
// ====================================================== */
// router.post("/v1/digio-esign-webhook", async (req, res) => {
//   const event = req.body;
//   const docId = event.id;
//   const status = event.state;

//   const [rows] = await db.promise().query(
//     "SELECT lan, document_type FROM esign_documents WHERE document_id=?",
//     [docId]
//   );
//   if (!rows.length) return res.send("ignored");

//   const { lan, document_type } = rows[0];
//   const { bookingTable } = getLoanContext(lan);

//   await db.promise().query(
//     "UPDATE esign_documents SET status=?, raw_response=? WHERE document_id=?",
//     [status, JSON.stringify(event), docId]
//   );

//   const col =
//     document_type === "SANCTION"
//       ? "sanction_esign_status"
//       : "agreement_esign_status";

//   await db.promise().query(
//     `UPDATE ${bookingTable} SET ${col}=? WHERE lan=?`,
//     [status === "signed" ? "SIGNED" : status, lan]
//   );

//   res.send("ok");
// });

// /* ======================================================
//    SANCTION & AGREEMENT GENERATION
// ====================================================== */
// router.get("/:lan/generate-sanction", async (req, res) => {
//   const { lan } = req.params;
//   const { bookingTable } = getLoanContext(lan);

//   const [rows] = await db.promise().query(
//     `SELECT * FROM ${bookingTable} WHERE lan=?`,
//     [lan]
//   );
//   if (!rows.length) return res.status(404).json({ message: "Loan not found" });

//   const pdfName = await generateSanctionLetterPdf(lan);
//   res.json({ success: true, pdfName, url: `/generated/${pdfName}` });
// });

// router.get("/:lan/generate-agreement", async (req, res) => {
//   const { lan } = req.params;
//   const { bookingTable } = getLoanContext(lan);

//   const [rows] = await db.promise().query(
//     `SELECT * FROM ${bookingTable} WHERE lan=?`,
//     [lan]
//   );
//   if (!rows.length) return res.status(404).json({ message: "Loan not found" });

//  const result = await generateAgreementPdf(lan, rows[0]);

// if (!result || !result.pdfName) {
//   console.error("❌ Agreement PDF generation returned empty result:", result);
//   return;
// }

// const { pdfName } = result;

//   res.json({ success: true, pdfName, url: `/uploads/${pdfName}` });
// });

// module.exports = router;



// const express = require("express");
// const db = require("../config/db");
// const dayjs = require("dayjs");
// const puppeteer = require("puppeteer");
// const authenticateUser = require("../middleware/verifyToken");
// const fs = require("fs");
// const path = require("path");
// const {
//   generateSanctionLetterPdf,
//   generateAgreementPdf
// } = require("../services/pdfGenerationService");
// const { initEsign } = require("../services/esignService");
// const { isCustomerLan } = require("../utils/lanHelper");
// const { getLoanContext } = require("../utils/lanHelper");

// const { bookingTable } = getLoanContext(lan);


// const router = express.Router();

// /* ======================================================
//    LAN TYPE HELPER (single source of truth)
// ====================================================== */
// function isCustomerLan(lan = "") {
//   const s = String(lan).trim().toUpperCase();
//   // Support both legacy "CUST..." and Zypay format "ZypF1..."
//   return s.startsWith("CUST") || s.startsWith("ZYPF1") || s.startsWith("ZypF");
// }

// /* ======================================================
//    TEMPLATE LOADER
// ====================================================== */
// function loadAgreementTemplate(lan) {
//   const templateFile = isCustomerLan(lan)
//     ? "Customer_Aggrement_Zypay.html"
//     : "helium_agreement.html";

//   const templatePath = path.join(__dirname, "../templates", templateFile);

//   // Make template errors very obvious
//   if (!fs.existsSync(templatePath)) {
//     throw new Error(`Agreement template not found: ${templatePath}`);
//   }

//   return fs.readFileSync(templatePath, "utf-8");
// }

// /* ======================================================
//    TABLE RESOLVER
// ====================================================== */
// // function getLoanContext(lan) {
// //   if (isCustomerLan(lan)) {
// //     return {
// //       summaryTable: "customer_loan_summary",
// //       rpsTable: "loan_rps_customer",
// //       bookingTable: "loan_booking_zypay_customer"
// //     };
// //   }

// //   return {
// //     summaryTable: "helium_loan_summary",
// //     rpsTable: "loan_rps_helium",
// //     bookingTable: "loan_booking_helium"
// //   };
// // }

// /* ======================================================
//    HELPERS
// ====================================================== */
// function fillTemplate(html, data) {
//   let out = html;
//   for (const [key, value] of Object.entries(data)) {
//     const safe = value == null ? "" : String(value);
//     out = out.replace(new RegExp(`{{\\s*${key}\\s*}}`, "g"), safe);
//   }
//   return out;
// }

// function numberToWords(num) {
//   if (!num || num === 0) return "Zero Rupees Only";

//   const a = [
//     "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
//     "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
//     "Seventeen", "Eighteen", "Nineteen"
//   ];
//   const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

//   const convert = (n) => {
//     if (n < 20) return a[n];
//     if (n < 100) return b[Math.floor(n / 10)] + (n % 10 ? " " + a[n % 10] : "");
//     if (n < 1000) return a[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " + convert(n % 100) : "");
//     if (n < 100000) return convert(Math.floor(n / 1000)) + " Thousand" + (n % 1000 ? " " + convert(n % 1000) : "");
//     if (n < 10000000) return convert(Math.floor(n / 100000)) + " Lakh" + (n % 100000 ? " " + convert(n % 100000) : "");
//     return convert(Math.floor(n / 10000000)) + " Crore" + (n % 10000000 ? " " + convert(n % 10000000) : "");
//   };

//   return convert(Number(num));
// }

// /* ======================================================
//    FETCH ALL LOANS
// ====================================================== */
// router.get("/api/loans", async (req, res) => {
//   try {
//     const [rows] = await db.promise().query(`
//       SELECT lan, C_N, L_A FROM helium_loan_summary
//       UNION ALL
//       SELECT lan, C_N, L_A FROM customer_loan_summary
//       ORDER BY lan DESC
//     `);
//     res.json(rows);
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ message: "Server error" });
//   }
// });

// /* ======================================================
//    PDF GENERATION (HTML TEMPLATE + PUPPETEER)
// ====================================================== */
// router.get("/:lan/pdf", async (req, res) => {
//   const { lan } = req.params;
//   const { summaryTable, rpsTable } = getLoanContext(lan);

//   try {
//     const rawTemplateHtml = loadAgreementTemplate(lan);

//     const [summaryRows] = await db.promise().query(
//       `
//       SELECT
//         lan, C_N, cur_add, per_add, L_A, I_R, L_T,
//         B_Na, A_no, ifsc,
//         DATE_FORMAT(L_date,'%d-%m-%Y') AS L_date,
//         E_S, I_S, P_S, T_E, L_P
//       FROM ${summaryTable}
//       WHERE lan=?
//       `,
//       [lan]
//     );

//     if (!summaryRows.length) {
//       return res.status(404).json({ message: "Loan not found" });
//     }

//     const summary = summaryRows[0];

//     const [rpsRows] = await db.promise().query(
//       `
//       SELECT
//         id, emi, interest, principal,
//         opening, closing,
//         remaining_emi, remaining_interest, remaining_principal
//       FROM ${rpsTable}
//       WHERE lan=?
//       ORDER BY id ASC
//       `,
//       [lan]
//     );

//     // rps can be empty for brand-new loans; avoid crash
//     const firstRps = rpsRows && rpsRows.length ? rpsRows[0] : {};

//     const data = {
//       ...summary,
//       ...firstRps,
//       CU_date: dayjs().format("DD-MM-YYYY"),
//       L_A_W: numberToWords(summary.L_A)
//     };

//     const html = fillTemplate(rawTemplateHtml, data);

//     const browser = await puppeteer.launch({
//       headless: "new",
//       args: ["--no-sandbox"]
//     });

//     const page = await browser.newPage();
//     await page.setContent(html, { waitUntil: "networkidle0" });

//     const pdf = await page.pdf({
//       format: "A4",
//       printBackground: true,
//       margin: { top: "20mm", bottom: "20mm", left: "15mm", right: "15mm" }
//     });

//     await browser.close();

//     res.setHeader("Content-Type", "application/pdf");
//     res.setHeader("Content-Disposition", `attachment; filename="Agreement_${lan}.pdf"`);
//     res.send(pdf);
//   } catch (err) {
//     console.error("PDF generation failed:", err);
//     res.status(500).json({ message: "PDF generation failed", error: err.message });
//   }
// });

// /* ======================================================
//    ESIGN ROUTES
// ====================================================== */
// router.post("/:lan/esign/:type", authenticateUser, async (req, res) => {
//   const { lan, type } = req.params;
//   const { bookingTable } = getLoanContext(lan);

//   try {
//     if (type === "agreement") {
//       const [rows] = await db.promise().query(
//         `SELECT sanction_esign_status FROM ${bookingTable} WHERE lan=?`,
//         [lan]
//       );
//       if (rows[0]?.sanction_esign_status !== "SIGNED") {
//         return res.status(400).json({
//           success: false,
//           message: "Sanction letter must be signed first"
//         });
//       }
//     }

//     const out = await initEsign(lan, type.toUpperCase());
//     res.json(out);
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ success: false, error: err.message });
//   }
// });

// /* ======================================================
//    DIGIO WEBHOOK
// ====================================================== */
// router.post("/v1/digio-esign-webhook", async (req, res) => {
//   try {
//     const event = req.body;
//     const docId = event.id;
//     const status = event.state;

//     const [rows] = await db.promise().query(
//       "SELECT lan, document_type FROM esign_documents WHERE document_id=?",
//       [docId]
//     );
//     if (!rows.length) return res.send("ignored");

//     const { lan, document_type } = rows[0];
//     const { bookingTable } = getLoanContext(lan);

//     await db.promise().query(
//       "UPDATE esign_documents SET status=?, raw_response=? WHERE document_id=?",
//       [status, JSON.stringify(event), docId]
//     );

//     const col =
//       document_type === "SANCTION"
//         ? "sanction_esign_status"
//         : "agreement_esign_status";

//     await db.promise().query(
//       `UPDATE ${bookingTable} SET ${col}=? WHERE lan=?`,
//       [status === "signed" ? "SIGNED" : status, lan]
//     );

//     res.send("ok");
//   } catch (err) {
//     console.error("Webhook error:", err);
//     res.status(500).send("error");
//   }
// });

// /* ======================================================
//    SANCTION & AGREEMENT GENERATION
// ====================================================== */
// router.get("/:lan/generate-sanction", async (req, res) => {
//   const { lan } = req.params;
//   const { bookingTable } = getLoanContext(lan);

//   try {
//     const [rows] = await db.promise().query(
//       `SELECT * FROM ${bookingTable} WHERE lan=?`,
//       [lan]
//     );
//     if (!rows.length) return res.status(404).json({ message: "Loan not found" });

//     const pdfName = await generateSanctionLetterPdf(lan);
//     res.json({ success: true, pdfName, url: `/generated/${pdfName}` });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ success: false, message: "Sanction generation failed", error: err.message });
//   }
// });

// router.get("/:lan/generate-agreement", async (req, res) => {
//   const { lan } = req.params;
//   const { bookingTable } = getLoanContext(lan);

//   try {
//     const [rows] = await db.promise().query(
//       `SELECT * FROM ${bookingTable} WHERE lan=?`,
//       [lan]
//     );
//     if (!rows.length) return res.status(404).json({ message: "Loan not found" });

//     const result = await generateAgreementPdf(lan, rows[0]);

//     if (!result || !result.pdfName) {
//       return res.status(500).json({
//         success: false,
//         message: "Agreement PDF generation returned empty result",
//         result
//       });
//     }

//     const { pdfName } = result;
//     res.json({ success: true, pdfName, url: `/uploads/${pdfName}` });
//   } catch (err) {
//     console.error("Generate agreement failed:", err);
//     res.status(500).json({
//       success: false,
//       message: "Generate agreement failed",
//       error: err.message
//     });
//   }
// });

// module.exports = router;
///////////////////////////////////////////////////
const express = require("express");
const db = require("../config/db");
const dayjs = require("dayjs");
const puppeteer = require("puppeteer");
const authenticateUser = require("../middleware/verifyToken");
const fs = require("fs");
const path = require("path");

const {
  generateSanctionLetterPdf,
  generateAgreementPdf
} = require("../services/pdfGenerationService");

const { initEsign } = require("../services/esignService");
const { getLoanContext } = require("../utils/lanHelper");

const router = express.Router();

/* ======================================================
   TEMPLATE LOADER
====================================================== */
function loadAgreementTemplate(templateFile) {
  const templatePath = path.join(__dirname, "../templates", templateFile);

  if (!fs.existsSync(templatePath)) {
    throw new Error(`Agreement template not found: ${templatePath}`);
  }

  return fs.readFileSync(templatePath, "utf-8");
}

/* ======================================================
   HELPERS
====================================================== */
function fillTemplate(html, data) {
  let out = html;
  for (const [key, value] of Object.entries(data)) {
    out = out.replace(
      new RegExp(`{{\\s*${key}\\s*}}`, "g"),
      value == null ? "" : String(value)
    );
  }
  return out;
}

function numberToWords(num) {
  if (!num || num === 0) return "Zero Rupees Only";

  const a = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
    "Seventeen", "Eighteen", "Nineteen"
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

/* ======================================================
   FETCH ALL LOANS
====================================================== */
router.get("/api/loans", async (req, res) => {
  try {
    const [rows] = await db.promise().query(`
      SELECT lan, C_N, L_A FROM helium_loan_summary
      UNION ALL
      SELECT lan, C_N, L_A FROM customer_loan_summary
      ORDER BY lan DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

/* ======================================================
   PDF PREVIEW (HTML → PDF)
====================================================== */
router.get("/:lan/pdf", async (req, res) => {
  const { lan } = req.params;
  const { summaryTable, rpsTable, agreementTemplate } = getLoanContext(lan);

  try {
    const templateHtml = loadAgreementTemplate(agreementTemplate);

    const [summaryRows] = await db.promise().query(
      `
      SELECT
        lan, C_N, cur_add, per_add, L_A, I_R, L_T,
        B_Na, A_no, ifsc,
        DATE_FORMAT(L_date,'%d-%m-%Y') AS L_date,
        E_S, I_S, P_S, T_E, L_P
      FROM ${summaryTable}
      WHERE lan=?
      `,
      [lan]
    );

    if (!summaryRows.length) {
      return res.status(404).json({ message: "Loan not found" });
    }

    const [rpsRows] = await db.promise().query(
      `
      SELECT id, emi, interest, principal, opening, closing
      FROM ${rpsTable}
      WHERE lan=?
      ORDER BY id ASC
      `,
      [lan]
    );

    const summary = summaryRows[0];
    const firstRps = rpsRows.length ? rpsRows[0] : {};

    const data = {
      ...summary,
      ...firstRps,
      CU_date: dayjs().format("DD-MM-YYYY"),
      L_A_W: numberToWords(summary.L_A)
    };

    const html = fillTemplate(templateHtml, data);

    const browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox"]
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "20mm", bottom: "20mm", left: "15mm", right: "15mm" }
    });

    await browser.close();

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="Agreement_${lan}.pdf"`);
    res.send(pdf);
  } catch (err) {
    console.error("PDF generation failed:", err);
    res.status(500).json({ message: "PDF generation failed", error: err.message });
  }
});

/* ======================================================
   ESIGN INIT
====================================================== */
router.post("/:lan/esign/:type", authenticateUser, async (req, res) => {
  const { lan, type } = req.params;
  const { bookingTable } = getLoanContext(lan);

  try {
    if (type === "agreement") {
      const [rows] = await db.promise().query(
        `SELECT sanction_esign_status FROM ${bookingTable} WHERE lan=?`,
        [lan]
      );

      if (rows[0]?.sanction_esign_status !== "SIGNED") {
        return res.status(400).json({
          success: false,
          message: "Sanction letter must be signed first"
        });
      }
    }

    const out = await initEsign(lan, type.toUpperCase());
    res.json(out);
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ======================================================
   DIGIO WEBHOOK
====================================================== */
router.post("/v1/digio-esign-webhook", async (req, res) => {
  try {
    const event = req.body;
    const docId = event.id;
    const status = event.state;

    const [rows] = await db.promise().query(
      "SELECT lan, document_type FROM esign_documents WHERE document_id=?",
      [docId]
    );
    if (!rows.length) return res.send("ignored");

    const { lan, document_type } = rows[0];
    const { bookingTable } = getLoanContext(lan);

    await db.promise().query(
      "UPDATE esign_documents SET status=?, raw_response=? WHERE document_id=?",
      [status, JSON.stringify(event), docId]
    );

    const col =
      document_type === "SANCTION"
        ? "sanction_esign_status"
        : "agreement_esign_status";

    await db.promise().query(
      `UPDATE ${bookingTable} SET ${col}=? WHERE lan=?`,
      [status === "signed" ? "SIGNED" : status, lan]
    );

    res.send("ok");
  } catch (err) {
    console.error("Webhook error:", err);
    res.status(500).send("error");
  }
});

/* ======================================================
   SANCTION & AGREEMENT GENERATION
====================================================== */
router.get("/:lan/generate-sanction", async (req, res) => {
  const { lan } = req.params;
  const { bookingTable } = getLoanContext(lan);

  try {
    const [rows] = await db.promise().query(
      `SELECT * FROM ${bookingTable} WHERE lan=?`,
      [lan]
    );
    if (!rows.length) return res.status(404).json({ message: "Loan not found" });

    const pdfName = await generateSanctionLetterPdf(lan);
    res.json({ success: true, pdfName, url: `/uploads/${pdfName}` });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: "Sanction generation failed",
      error: err.message
    });
  }
});

router.get("/:lan/generate-agreement", async (req, res) => {
  const { lan } = req.params;

  try {
    const result = await generateAgreementPdf(lan);

    if (!result || !result.pdfName) {
      return res.status(500).json({
        success: false,
        message: "Agreement PDF generation returned empty result"
      });
    }

    res.json({
      success: true,
      pdfName: result.pdfName,
      url: `/uploads/${result.pdfName}`
    });
  } catch (err) {
    console.error("Generate agreement failed:", err);
    res.status(500).json({
      success: false,
      message: "Generate agreement failed",
      error: err.message
    });
  }
});

module.exports = router;
