
// const express = require("express");
// const router = express.Router();
// const db = require("../config/db");
// const fs = require("fs");
// const path = require("path");
// const ExcelJS = require("exceljs");
// const authenticateUser = require("../middleware/verifyToken");

// const reportsDir = path.join(__dirname, "../reports");
// if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

// router.post("/trigger", authenticateUser,  async (req, res) => {
//   const startTime = Date.now();
//   const {
//     reportId,
//     startDate,
//     endDate,
//     product: lenderName,
//     description,
//   } = req.body;

//   console.log("📤 Triggering report with:", req.body);

//   const createdByUser = req.user?.name || "system";
//   const sanitizedReportId = reportId.replace(/\s+/g, "-").toLowerCase();
//   const timestamp = Date.now();
//   const fileName = `${sanitizedReportId}_${timestamp}.xlsx`;
//   const filePath = path.join(reportsDir, fileName);

//   function resolveProcedure(reportId, lenderName) {
//     const lender = lenderName?.toLowerCase();

//     const map = {
//       "cashflow-report": lender === "adikosh"
//         ? "sp_cashflow_report_adikosh"
//         : lender === "gq non-fsf"
//         ? "sp_cashflow_report_gq_non_fsf"
//         : "sp_cashflow_report",
//         // : "sp_cashflow_report_bank_date",

//       "due-demand-vs-collection-report(all-products)": lender === "adikosh"
//       ? "sp_due_collection_all_report_adikosh"
//       : lender === "gq non-fsf"
//       ? "sp_due_collection_all_report_gq_non_fsf"
//       : lender === "gq fsf"
//       ? "sp_due_collection_all_report_gq_fsf"
//       : lender === "wctl"
//       ? "sp_due_collection_all_report_wctl"
//       : "sp_due_collection_all_report",

//     "consolidated-mis": lender === "adikosh"
//       ? "sp_consolidated_mis_report_adikosh"
//       : lender === "gq non-fsf"
//       ? "sp_consolidated_mis_report_gq_non_fsf"
//       : lender === "gq fsf"
//       ? "sp_consolidated_mis_report_gq_fsf"
//       : lender === "wctl"
//       ? "sp_consolidated_mis_report_wctl"
//       : "sp_consolidated_mis_report",


//         "delayed-interest-report": "sp_delayed_interest_report",

//         "rps-generate-report": "sp_generate_rps_report",

//       // ✅ New IRR Report
//       "gq-non-fsf-irr-report": "sp_generate_gq_non_fsf_irr_report",

//       // More procedures can be added here...
//       "adikosh-cam-report": "sp_cam_data_report_adikosh",
//     };

//     return map[reportId?.toLowerCase()] || null;
//   }

//   const selectedProcedure = resolveProcedure(reportId, lenderName);
//   if (!selectedProcedure) {
//     return res.status(400).json({ error: "Invalid report ID" });
//   }

//   try {
//     console.log("inside try");
//     const [insertResult] = await db.promise().query(
//       `INSERT INTO reports_download 
//       (report_id, file_name, file_path, description, product, created_by, time_taken, generated_at, status)
//       VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), ?)`,
//       [
//         reportId,
//         fileName,
//         filePath,
//         description || "No description",
//         lenderName || "Unknown",
//         createdByUser,
//         "In progress",
//         "Running",
//       ]
//     );

//     console.log("🆕 Inserted report row with ID:", insertResult.insertId);
//     console.log("🗂️ File will be saved to:", filePath);
//     console.log("fileName:", fileName);

//     const reportRowId = insertResult.insertId;
//     res.status(202).json({ message: "Report triggered", fileName });

//     setImmediate(async () => {
//       try {
//         console.log("⚙️ Executing procedure:", selectedProcedure);

//         const [results] = await db.promise().query(
//           `CALL ${selectedProcedure}(?, ?, ?)`,
//           [startDate, endDate, lenderName]
//         );

//         const finalReport = results.find(
//           (r) => Array.isArray(r) && r.length > 0 && typeof r[0] === "object"
//         );

//         if (!finalReport) {
//           await db.promise().query(
//             `UPDATE reports_download SET status = 'Failed' WHERE id = ?`,
//             [reportRowId]
//           );
//           return;
//         }

//         const workbook = new ExcelJS.Workbook();
//         const worksheet = workbook.addWorksheet("Report");

//         worksheet.columns = Object.keys(finalReport[0]).map((key) => ({
//           header: key,
//           key,
//         }));

//         const formattedRows = finalReport.map((row) => {
//           const newRow = {};
//           Object.entries(row).forEach(([key, value]) => {
//             if (value instanceof Date) {
//               const year = value.getFullYear();
//               const month = String(value.getMonth() + 1).padStart(2, "0");
//               const day = String(value.getDate()).padStart(2, "0");
//               newRow[key] = `${year}-${month}-${day}`;
//             } else if (
//               typeof value === "string" &&
//               /^\d{4}-\d{2}-\d{2}$/.test(value)
//             ) {
//               newRow[key] = value;
//             } else {
//               newRow[key] = value;
//             }
//           });
//           return newRow;
//         });

//         formattedRows.forEach((row) => {
//           const cellValues = Object.values(row).map((val) =>
//             typeof val === "string" && /^\d{4}-\d{2}-\d{2}$/.test(val) ? `${val}` : val
//           );
//           worksheet.addRow(cellValues);
//         });

//         worksheet.getRow(1).eachCell((cell) => {
//           cell.fill = {
//             type: "pattern",
//             pattern: "solid",
//             fgColor: { argb: "D6EAF8" },
//           };
//           cell.font = { bold: true };
//           cell.border = {
//             top: { style: "thin" },
//             left: { style: "thin" },
//             bottom: { style: "thin" },
//             right: { style: "thin" },
//           };
//         });

//         worksheet.eachRow((row) => {
//           row.eachCell((cell) => {
//             cell.border = {
//               top: { style: "thin" },
//               left: { style: "thin" },
//               bottom: { style: "thin" },
//               right: { style: "thin" },
//             };
//           });
//         });

//         await workbook.xlsx.writeFile(filePath);

//         if (!fs.existsSync(filePath)) {
//           await db.promise().query(
//             `UPDATE reports_download SET status = 'Failed' WHERE id = ?`,
//             [reportRowId]
//           );
//           return;
//         }

//         const timeTakenInSeconds = Math.floor((Date.now() - startTime) / 1000);
//         const timeTakenFormatted = `${Math.floor(timeTakenInSeconds / 60)} minute ${timeTakenInSeconds % 60} seconds`;

//         await db.promise().query(
//           `UPDATE reports_download 
//           SET status = 'Completed', time_taken = ?, generated_at = NOW()
//           WHERE id = ?`,
//           [timeTakenFormatted, reportRowId]
//         );

//         console.log("✅ Report finished and updated successfully:", fileName);
//       } catch (err) {
//         console.error("❌ Background job error:", err);
//         await db.promise().query(
//           `UPDATE reports_download SET status = 'Failed' WHERE id = ?`,
//           [reportRowId]
//         );
//       }
//     });
//   } catch (err) {
//     console.error("❌ Trigger error:", err);
//     res.status(500).json({ error: err.message || "Server error" });
//   }
// });

// router.get("/download/:fileName", (req, res) => {
//   const { fileName } = req.params;
//   const filePath = path.join(reportsDir, fileName);

//   if (fs.existsSync(filePath)) {
//     res.setHeader("Content-Disposition", `attachment; filename=\"${fileName}\"`);
//     res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
//     res.download(filePath);
//   } else {
//     res.status(404).json({ error: "File not found" });
//   }
// });

// router.get("/downloads", (req, res) => {
//   const { reportId } = req.query;

//   let query = `
//     SELECT 
//       id, report_id, status, file_name, generated_at, 
//       description, product, created_by, time_taken
//     FROM reports_download
//   `;
//   const params = [];

//   if (reportId) {
//     query += " WHERE LOWER(report_id) = LOWER(?)";
//     params.push(reportId.toLowerCase());
//   }

//   query += " ORDER BY generated_at DESC";

//   db.query(query, params, (err, results) => {
//     if (err) {
//       console.error("❌ Error fetching downloads:", err);
//       return res.status(500).json({ message: "Database error" });
//     }

//     // build absolute URL
//     const apiBase = process.env.API_BASE_URL || "http://localhost:5000";
//     const withUrls = results.map(r => ({
//       ...r,
//       downloadUrl: `${apiBase}/reports/${r.file_name}`,
//     }));

//     res.json(withUrls);
//   });
// });


// // for templates of excel files of each product

// // Allowed product keys and file map
// const templateMap = {
//   ev: "ev.xlsx",
//   bl: "bl.xlsx",
//   gq_fsf: "GQ_FSF_Loan_Booking.xlsx",
//   gq_non_fsf: "gq_non_fsf.xlsx",
//   adikosh: "adikosh.xlsx",
//   utr_upload: "UTR_UPLOAD.xlsx",
//   repayment_upload: "repayment_upload.xlsx",
// };

// router.get("/download-template/:product", (req, res) => {
//   const productKey = req.params.product.toLowerCase();
//   const fileName = templateMap[productKey];

//   if (!fileName) {
//     return res.status(400).json({ message: "Invalid product format requested." });
//   }

//   const filePath = path.join(__dirname, `../templates/${fileName}`);

//   // Validate file existence
//   if (!fs.existsSync(filePath)) {
//     return res.status(404).json({ message: "Template file not found." });
//   }

//   res.download(filePath, `${productKey}_format.xlsx`, (err) => {
//     if (err) {
//       console.error(`Error sending ${productKey} template:`, err);
//       res.status(500).send("Failed to download template.");
//     }
//   });
// });

// module.exports = router;
//////////////////////////////// NEW code by SAJAG JAIN  ///////////////////////////////////////////////////////
// // routes/reportRoutes.js
// const express = require("express");
// const router = express.Router();
// const db = require("../config/db");
// const fs = require("fs");
// const path = require("path");
// const ExcelJS = require("exceljs");
// const authenticateUser = require("../middleware/verifyToken");

// // Optional PDF support (for CAM print)
// const PdfPrinter = require("pdfmake");

// const reportsDir = path.join(__dirname, "../reports");
// if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

// /** -------------------- helpers -------------------- **/

// // normalize strings to consistent ids (e.g. "Adikosh CAM Report" -> "adikosh-cam-report")
// function norm(s) {
//   return (s || "")
//     .toString()
//     .trim()
//     .toLowerCase()
//     .replace(/[\s_]+/g, "-")
//     .replace(/-+/g, "-");
// }

// function resolveProcedure(rawReportId, rawLender) {
//   const id = norm(rawReportId);
//   const lender = (rawLender || "").toString().trim().toLowerCase();

//   // id aliases (add more if needed)
//   const aliases = {
//     "cashflow-report": "cashflow-report",
//      "cashflow-report-bank-date": "cashflow-report-bank-date", // ✅ add this
//       "cashflow report bank date": "cashflow-report-bank-date", // alias

//     "due-demand-vs-collection-report(all-products)":
//       "due-demand-vs-collection-report(all-products)",
//     "due-demand-vs-collection-report":
//       "due-demand-vs-collection-report(all-products)",

//     "consolidated-mis": "consolidated-mis",

//     "delayed-interest-report": "delayed-interest-report",
//     "rps-generate-report": "rps-generate-report",
//     "irr-report": "irr-report",

//     "adikosh-cam-report": "adikosh-cam-report",
//     "adikosh-cam-report-pivot": "adikosh-cam-report-pivot",
//     "adikosh-cam-report-print": "adikosh-cam-report-print",
//     "adikosh-cam-print": "adikosh-cam-report-print",

//     "ccod-loan-data-report": "ccod-loan-data-report",
//   };

//   const key = aliases[id] || id;

//   const procMap = {
//     "cashflow-report": () =>
//       lender === "adikosh"
//         ? "sp_cashflow_report_adikosh"
//         : lender === "gq non-fsf"
//         ? "sp_cashflow_report_gq_non_fsf"
//         : lender === "gq fsf"
//         ? "sp_cashflow_report_gq_fsf"
//           : lender === "wctl"
//         ? "sp_cashflow_report_wctl"
//         : lender === "ev loan"
//         ? "sp_cashflow_report_ev"
//         : "sp_cashflow_report",

//   "cashflow-report-bank-date": () => "sp_cashflow_report_bank_date", // ✅ now handled

//     "due-demand-vs-collection-report(all-products)": () =>
//       lender === "adikosh"
//         ? "sp_due_collection_all_report_adikosh"
//         : lender === "gq non-fsf"
//         ? "sp_due_collection_all_report_gq_non_fsf"
//         : lender === "gq fsf"
//         ? "sp_due_collection_all_report_gq_fsf"
//         : lender === "bl loan"
//         ? "sp_due_collection_all_report_BL_Loan"
//         : lender === "embifi"
//         ? "sp_due_collection_all_report_embifi"
//         : lender === "wctl"
//         ? "sp_due_collection_all_report_wctl"
//         : "sp_due_collection_all_report",

//     "consolidated-mis": () =>
//       lender === "adikosh"
//         ? "sp_consolidated_mis_report_adikosh"
//         : lender === "gq non-fsf"
//         ? "sp_consolidated_mis_report_gq_non_fsf"
//         : lender === "gq fsf"
//         ? "sp_consolidated_mis_report_gq_fsf"
//         : lender === "embifi"
//         ? "sp_consolidated_mis_report_embifi"
//         : lender === "wctl"
//         ? "sp_consolidated_mis_report_wctl"
//         : "sp_consolidated_mis_report",


//         // NEW IRR Report add
//      "irr-report": () =>
//       lender === "gq non-fsf"
//      ? "sp_generate_gq_non_fsf_irr_report"
//      : "sp_generate_gq_fsf_irr_report",



//     "delayed-interest-report": () => "sp_delayed_interest_report",
//     "rps-generate-report": () => "sp_generate_rps_report",
//    // "gq-non-fsf-irr-report": () => "sp_generate_gq_non_fsf_irr_report",

//     // CAM (vertical)
//     "adikosh-cam-report": () => "sp_cam_data_report_adikosh",
//     // CAM (horizontal pivot)
//     "adikosh-cam-report-pivot": () => "sp_cam_data_report_adikosh_pivot",
//     // CAM printable (single LAN)
//     "adikosh-cam-report-print": () => "sp_cam_data_report_adikosh_print",

//     // CCOD LOAN DATA REPORT
//     "ccod-loan-data-report": () => "sp_cc_ood_mis_report",

  
//   };

//   return procMap[key] ? procMap[key]() : null;
// }

// function autofitColumns(worksheet) {
//   worksheet.columns.forEach((col) => {
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

// function formatDateLikeYYYYMMDD(val) {
//   if (!(val instanceof Date)) return val;
//   const y = val.getFullYear();
//   const m = String(val.getMonth() + 1).padStart(2, "0");
//   const d = String(val.getDate()).padStart(2, "0");
//   return `${y}-${m}-${d}`;
// }

// /** -------------------- trigger report -------------------- **/

// router.post("/trigger", authenticateUser, async (req, res) => {
//   const startTime = Date.now();
//   const {
//     reportId,
//     startDate,
//     endDate,
//     product: lenderName,
//     description,
//     outputFormat, // "excel" | "pdf" (default excel)
//     lan, // only required for *-print
//   } = req.body;

//   console.log("📤 Triggering report with:", req.body);

//   const createdByUser = req.user?.name || "system";
//   const normalizedReportId = norm(reportId);
//   const selectedProcedure = resolveProcedure(reportId, lenderName);

//   if (!selectedProcedure) {
//     return res.status(400).json({ error: `Invalid report ID: ${reportId}` });
//   }

//   // Decide whether this is a single-LAN print report
//   const isPrintReport =
//     normalizedReportId === "adikosh-cam-report-print" ||
//     normalizedReportId === "adikosh-cam-print";

//   // Basic validation
//   if (isPrintReport) {
//     if (!lan) {
//       return res.status(400).json({ error: "LAN is required for CAM print report" });
//     }
//   } else {
//     if (!startDate || !endDate || !lenderName) {
//       return res
//         .status(400)
//         .json({ error: "startDate, endDate and product are required" });
//     }
//   }

//   // Filename/extension by output type (PDF only for print)
//   const usePdf = outputFormat?.toLowerCase() === "pdf" && isPrintReport;
//   const ext = usePdf ? "pdf" : "xlsx";

//   const timestamp = Date.now();
//   const fileSafeId = normalizedReportId.replace(/[^a-z0-9-]/g, "");
//   const fileName = `${fileSafeId}_${timestamp}.${ext}`;
//   const filePath = path.join(reportsDir, fileName);

//   try {
//     const [insertResult] = await db.promise().query(
//       `INSERT INTO reports_download 
//        (report_id, file_name, file_path, description, product, created_by, time_taken, generated_at, status)
//        VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), ?)`,
//       [
//         reportId,
//         fileName,
//         filePath,
//         description || "No description",
//         lenderName || (isPrintReport ? "Adikosh" : "Unknown"),
//         createdByUser,
//         "In progress",
//         "Running",
//       ]
//     );

//     const reportRowId = insertResult.insertId;
//     console.log("🆕 Inserted report row ID:", reportRowId, "| file:", filePath);

//     // Respond immediately
//     res.status(202).json({ message: "Report triggered", fileName });

//     // Background job
//     setImmediate(async () => {
//       try {
//         console.log("⚙️ Executing procedure:", selectedProcedure);

//         let finalRows = [];
//         if (isPrintReport) {
//           const [results] = await db
//             .promise()
//             .query(`CALL ${selectedProcedure}(?)`, [lan]);
//             console.log ('select proc', selectedProcedure);

//           const set = results.find(
//             (r) => Array.isArray(r) && r.length && typeof r[0] === "object"
//           );
        
         
//         } else {
//           const [results] = await db
//             .promise()
//             .query(`CALL ${selectedProcedure}(?, ?, ?)`, [
//               startDate,
//               endDate,
//               lenderName,
//             ]);
           
//           const set = results.find(
//             (r) => Array.isArray(r) && r.length && typeof r[0] === "object"
//           );
          
//           finalRows = set || [];
       
//         }

//         if (!finalRows.length) {
//           console.warn("ℹ️ Procedure returned no rows");
//           await db
//             .promise()
//             .query(`UPDATE reports_download SET status='Failed' WHERE id=?`, [
//               reportRowId,
//             ]);
//           return;
//         }

//         // ---------- OUTPUT ----------
//         if (ext === "xlsx") {
//           // Excel output
//           const workbook = new ExcelJS.Workbook();
//           const worksheet = workbook.addWorksheet("Report");

//           const headers = Object.keys(finalRows[0]);
//           worksheet.columns = headers.map((key) => ({ header: key, key }));

//           for (const row of finalRows) {
//             const out = {};
//             for (const k of headers) {
//               const v = row[k];
//               out[k] =
//                 v instanceof Date
//                   ? formatDateLikeYYYYMMDD(v)
//                   : typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)
//                   ? v
//                   : v;
//             }
//             worksheet.addRow(out);
//           }

//           // style header row
//           worksheet.getRow(1).eachCell((cell) => {
//             cell.fill = {
//               type: "pattern",
//               pattern: "solid",
//               fgColor: { argb: "D6EAF8" },
//             };
//             cell.font = { bold: true };
//             cell.border = {
//               top: { style: "thin" },
//               left: { style: "thin" },
//               bottom: { style: "thin" },
//               right: { style: "thin" },
//             };
//           });

//           // borders
//           worksheet.eachRow((row) => {
//             row.eachCell((cell) => {
//               cell.border = {
//                 top: { style: "thin" },
//                 left: { style: "thin" },
//                 bottom: { style: "thin" },
//                 right: { style: "thin" },
//               };
//             });
//           });

//           // auto-fit
//           autofitColumns(worksheet);

//           await workbook.xlsx.writeFile(filePath);
//         } else {
//           // PDF output (simple section/sub-section table rendering for print SP)
//         // with this simpler one:
// const fonts = {
//   Helvetica: {
//     normal: "Helvetica",
//     bold: "Helvetica-Bold",
//     italics: "Helvetica-Oblique",
//     bolditalics: "Helvetica-BoldOblique",
//   },
// };
//           const printer = new PdfPrinter(fonts);

//           // Group rows
//           const grouped = {};
//           for (const r of finalRows) {
//             const sec = r.section || "General";
//             const sub = r.sub_section || "Details";
//             if (!grouped[sec]) grouped[sec] = {};
//             if (!grouped[sec][sub]) grouped[sec][sub] = [];
//             grouped[sec][sub].push([r.label, r.value ?? ""]);
//           }

//           const content = [{ text: "CAM DATA REPORT", style: "header" }];
//           for (const [section, subs] of Object.entries(grouped)) {
//             content.push({ text: section, style: "sectionHeader" });
//             for (const [sub, rows] of Object.entries(subs)) {
//               content.push({ text: sub, style: "subHeader" });
//               content.push({
//                 table: {
//                   widths: ["35%", "65%"],
//                   body: [["Field", "Value"], ...rows],
//                 },
//                 layout: "lightHorizontalLines",
//                 margin: [0, 0, 0, 8],
//               });
//             }
//           }

//           const docDefinition = {
//             content,
//             pageSize: "A4",
//             pageMargins: [30, 30, 30, 40],
//             styles: {
//               header: {
//                 fontSize: 16,
//                 bold: true,
//                 alignment: "center",
//                 margin: [0, 0, 0, 12],
//               },
//               sectionHeader: { fontSize: 13, bold: true, margin: [0, 8, 0, 4] },
//               subHeader: { fontSize: 11, bold: true, margin: [0, 4, 0, 4] },
//             },
//             defaultStyle: { font: "Helvetica" },
//           };

//           const pdfDoc = printer.createPdfKitDocument(docDefinition);
//           await new Promise((resolve, reject) => {
//             const stream = fs.createWriteStream(filePath);
//             pdfDoc.pipe(stream);
//             pdfDoc.end();
//             stream.on("finish", resolve);
//             stream.on("error", reject);
//           });
//         }

//         if (!fs.existsSync(filePath)) {
//           await db
//             .promise()
//             .query(`UPDATE reports_download SET status='Failed' WHERE id=?`, [
//               reportRowId,
//             ]);
//           return;
//         }

//         const secs = Math.floor((Date.now() - startTime) / 1000);
//         const pretty = `${Math.floor(secs / 60)} minute ${secs % 60} seconds`;
//         await db
//           .promise()
//           .query(
//             `UPDATE reports_download 
//              SET status='Completed', time_taken=?, generated_at=NOW()
//              WHERE id=?`,
//             [pretty, reportRowId]
//           );

//         console.log("✅ Report generated:", fileName);
//       } catch (err) {
//         console.error("❌ Background job error:", err);
//         await db
//           .promise()
//           .query(`UPDATE reports_download SET status='Failed' WHERE id=?`, [
//             reportRowId,
//           ]);
//       }
//     });
//   } catch (err) {
//     console.error("❌ Trigger error:", err);
//     res.status(500).json({ error: err.message || "Server error" });
//   }
// });

// /** -------------------- download a generated file -------------------- **/
// router.get("/download/:fileName", (req, res) => {
//   const { fileName } = req.params;
//   const filePath = path.join(reportsDir, fileName);

//   if (fs.existsSync(filePath)) {
//     res.setHeader(
//       "Content-Disposition",
//       `attachment; filename="${fileName}"`
//     );
//     const isPdf = fileName.toLowerCase().endsWith(".pdf");
//     res.setHeader(
//       "Content-Type",
//       isPdf
//         ? "application/pdf"
//         : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
//     );
//     res.download(filePath);
//   } else {
//     res.status(404).json({ error: "File not found" });
//   }
// });

// /** -------------------- list generated downloads -------------------- **/
// router.get("/downloads", (req, res) => {
//   const { reportId } = req.query;

//   let query = `
//     SELECT 
//       id, report_id, status, file_name, generated_at, 
//       description, product, created_by, time_taken
//     FROM reports_download
//   `;
//   const params = [];

//   if (reportId) {
//     query += " WHERE LOWER(report_id) = LOWER(?)";
//     params.push(reportId.toLowerCase());
//   }

//   query += " ORDER BY generated_at DESC";

//   db.query(query, params, (err, results) => {
//     if (err) {
//       console.error("❌ Error fetching downloads:", err);
//       return res.status(500).json({ message: "Database error" });
//     }

//     const apiBase = process.env.API_BASE_URL || "http://localhost:5000";
//     const withUrls = results.map((r) => ({
//       ...r,
//       downloadUrl: `${apiBase}/reports/${r.file_name}`,
//     }));

//     res.json(withUrls);
//   });
// });

// /** -------------------- templates -------------------- **/

// const templateMap = {
//   ev: "ev.xlsx",
//   bl: "bl.xlsx",
//   gq_fsf: "GQ_FSF_Loan_Booking.xlsx",
//   gq_non_fsf: "gq_non_fsf.xlsx",
//   adikosh: "adikosh.xlsx",
//   utr_upload: "UTR_UPLOAD.xlsx",
//   repayment_upload: "repayment_upload.xlsx",
// };

// router.get("/download-template/:product", (req, res) => {
//   const productKey = req.params.product.toLowerCase();
//   const fileName = templateMap[productKey];

//   if (!fileName) {
//     return res.status(400).json({ message: "Invalid product format requested." });
//   }

//   const filePath = path.join(__dirname, `../templates/${fileName}`);

//   if (!fs.existsSync(filePath)) {
//     return res.status(404).json({ message: "Template file not found." });
//   }

//   res.download(filePath, `${productKey}_format.xlsx`, (err) => {
//     if (err) {
//       console.error(`Error sending ${productKey} template:`, err);
//       res.status(500).send("Failed to download template.");
//     }
//   });
// });

// module.exports = router;


/////////////////////////// NEW CODE FOR NUMBER CHANGE IN EXCEL CODE ////////////////////
// const express = require("express");
// const router = express.Router();
// const db = require("../config/db");
// const fs = require("fs");
// const path = require("path");
// const ExcelJS = require("exceljs");
// const authenticateUser = require("../middleware/verifyToken");

// // Optional PDF support (for CAM print)
// const PdfPrinter = require("pdfmake");

// const reportsDir = path.join(__dirname, "../reports");
// if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

// /** -------------------- helpers -------------------- **/

// // normalize strings to consistent ids (e.g. "Adikosh CAM Report" -> "adikosh-cam-report")
// function norm(s) {
//   return (s || "")
//     .toString()
//     .trim()
//     .toLowerCase()
//     .replace(/[\s_]+/g, "-")
//     .replace(/-+/g, "-");
// }

// function resolveProcedure(rawReportId, rawLender) {
//   const id = norm(rawReportId);
//   const lender = (rawLender || "").toString().trim().toLowerCase();

//   // id aliases (add more if needed)
//   const aliases = {
//     "cashflow-report": "cashflow-report",
//     "cashflow-report-bank-date": "cashflow-report-bank-date", // ✅ add this
//     "cashflow report bank date": "cashflow-report-bank-date", // alias

//     "due-demand-vs-collection-report(all-products)":
//       "due-demand-vs-collection-report(all-products)",
//     "due-demand-vs-collection-report":
//       "due-demand-vs-collection-report(all-products)",

//     "consolidated-mis": "consolidated-mis",

//     "delayed-interest-report": "delayed-interest-report",
//     "rps-generate-report": "rps-generate-report",
//     "irr-report": "irr-report",

//     "adikosh-cam-report": "adikosh-cam-report",
//     "adikosh-cam-report-pivot": "adikosh-cam-report-pivot",
//     "adikosh-cam-report-print": "adikosh-cam-report-print",
//     "adikosh-cam-print": "adikosh-cam-report-print",

//     "ccod-loan-data-report": "ccod-loan-data-report",
//   };

//   const key = aliases[id] || id;

//   const procMap = {
//     "cashflow-report": () =>
//       lender === "adikosh"
//         ? "sp_cashflow_report_adikosh"
//         : lender === "gq non-fsf"
//         ? "sp_cashflow_report_gq_non_fsf"
//         : lender === "gq fsf"
//         ? "sp_cashflow_report_gq_fsf"
//         : lender === "wctl"
//         ? "sp_cashflow_report_wctl"
//         : lender === "ev loan"
//         ? "sp_cashflow_report_ev"
//         : "sp_cashflow_report",

//     "cashflow-report-bank-date": () => "sp_cashflow_report_bank_date", // ✅ now handled

//     "due-demand-vs-collection-report(all-products)": () =>
//       lender === "adikosh"
//         ? "sp_due_collection_all_report_adikosh"
//         : lender === "gq non-fsf"
//         ? "sp_due_collection_all_report_gq_non_fsf"
//         : lender === "gq fsf"
//         ? "sp_due_collection_all_report_gq_fsf"
//         : lender === "bl loan"
//         ? "sp_due_collection_all_report_BL_Loan"
//         : lender === "embifi"
//         ? "sp_due_collection_all_report_embifi"
//         : lender === "wctl"
//         ? "sp_due_collection_all_report_wctl"
//         : "sp_due_collection_all_report",

//     "consolidated-mis": () =>
//       lender === "adikosh"
//         ? "sp_consolidated_mis_report_adikosh"
//         : lender === "gq non-fsf"
//         ? "sp_consolidated_mis_report_gq_non_fsf"
//         : lender === "gq fsf"
//         ? "sp_consolidated_mis_report_gq_fsf"
//         : lender === "embifi"
//         ? "sp_consolidated_mis_report_embifi"
//         : lender === "wctl"
//         ? "sp_consolidated_mis_report_wctl"
//         : "sp_consolidated_mis_report",

//     // NEW IRR Report add
//     "irr-report": () =>
//       lender === "gq non-fsf"
//         ? "sp_generate_gq_non_fsf_irr_report"
//         : "sp_generate_gq_fsf_irr_report",

//     "delayed-interest-report": () => "sp_delayed_interest_report",
//     "rps-generate-report": () => "sp_generate_rps_report",

//     // CAM (vertical)
//     "adikosh-cam-report": () => "sp_cam_data_report_adikosh",
//     // CAM (horizontal pivot)
//     "adikosh-cam-report-pivot": () => "sp_cam_data_report_adikosh_pivot",
//     // CAM printable (single LAN)
//     "adikosh-cam-report-print": () => "sp_cam_data_report_adikosh_print",

//     // CCOD LOAN DATA REPORT
//     "ccod-loan-data-report": () => "sp_cc_ood_mis_report",
//   };

//   return procMap[key] ? procMap[key]() : null;
// }

// function autofitColumns(worksheet) {
//   worksheet.columns.forEach((col) => {
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

// function formatDateLikeYYYYMMDD(val) {
//   if (!(val instanceof Date)) return val;
//   const y = val.getFullYear();
//   const m = String(val.getMonth() + 1).padStart(2, "0");
//   const d = String(val.getDate()).padStart(2, "0");
//   return `${y}-${m}-${d}`;
// }

// /** -------------------- trigger report -------------------- **/

// router.post("/trigger", authenticateUser, async (req, res) => {
//   const startTime = Date.now();
//   const {
//     reportId,
//     startDate,
//     endDate,
//     product: lenderName,
//     description,
//     outputFormat, // "excel" | "pdf" (default excel)
//     lan, // only required for *-print
//   } = req.body;

//   console.log("📤 Triggering report with:", req.body);

//   const createdByUser = req.user?.name || "system";
//   const normalizedReportId = norm(reportId);
//   const selectedProcedure = resolveProcedure(reportId, lenderName);

//   if (!selectedProcedure) {
//     return res.status(400).json({ error: `Invalid report ID: ${reportId}` });
//   }

//   // Decide whether this is a single-LAN print report
//   const isPrintReport =
//     normalizedReportId === "adikosh-cam-report-print" ||
//     normalizedReportId === "adikosh-cam-print";

//   // Basic validation
//   if (isPrintReport) {
//     if (!lan) {
//       return res
//         .status(400)
//         .json({ error: "LAN is required for CAM print report" });
//     }
//   } else {
//     if (!startDate || !endDate || !lenderName) {
//       return res
//         .status(400)
//         .json({ error: "startDate, endDate and product are required" });
//     }
//   }

//   // Filename/extension by output type (PDF only for print)
//   const usePdf = outputFormat?.toLowerCase() === "pdf" && isPrintReport;
//   const ext = usePdf ? "pdf" : "xlsx";

//   const timestamp = Date.now();
//   const fileSafeId = normalizedReportId.replace(/[^a-z0-9-]/g, "");
//   const fileName = `${fileSafeId}_${timestamp}.${ext}`;
//   const filePath = path.join(reportsDir, fileName);

//   try {
//     const [insertResult] = await db.promise().query(
//       `INSERT INTO reports_download 
//        (report_id, file_name, file_path, description, product, created_by, time_taken, generated_at, status)
//        VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), ?)`,
//       [
//         reportId,
//         fileName,
//         filePath,
//         description || "No description",
//         lenderName || (isPrintReport ? "Adikosh" : "Unknown"),
//         createdByUser,
//         "In progress",
//         "Running",
//       ]
//     );

//     const reportRowId = insertResult.insertId;
//     console.log("🆕 Inserted report row ID:", reportRowId, "| file:", filePath);

//     // Respond immediately
//     res.status(202).json({ message: "Report triggered", fileName });

//     // Background job
//     setImmediate(async () => {
//       try {
//         console.log("⚙️ Executing procedure:", selectedProcedure);

//         let finalRows = [];
//         if (isPrintReport) {
//           const [results] = await db
//             .promise()
//             .query(`CALL ${selectedProcedure}(?)`, [lan]);
//           console.log("select proc", selectedProcedure);

//           const set = results.find(
//             (r) => Array.isArray(r) && r.length && typeof r[0] === "object"
//           );
//         } else {
//           const [results] = await db
//             .promise()
//             .query(`CALL ${selectedProcedure}(?, ?, ?)`, [
//               startDate,
//               endDate,
//               lenderName,
//             ]);

//           const set = results.find(
//             (r) => Array.isArray(r) && r.length && typeof r[0] === "object"
//           );

//           finalRows = set || [];
//         }

//         if (!finalRows.length) {
//           console.warn("ℹ️ Procedure returned no rows");
//           await db
//             .promise()
//             .query(`UPDATE reports_download SET status='Failed' WHERE id=?`, [
//               reportRowId,
//             ]);
//           return;
//         }

//         // ---------- OUTPUT ----------
//         if (ext === "xlsx") {
//           // Excel output
//           const workbook = new ExcelJS.Workbook();
//           const worksheet = workbook.addWorksheet("Report");

//           const headers = Object.keys(finalRows[0]);
//           worksheet.columns = headers.map((key) => ({ header: key, key }));

//           for (const row of finalRows) {
//             const out = {};
//             for (const k of headers) {
//               const v = row[k];
//               // ✅ Dates stay as strings, numbers stay as numbers
//               out[k] =
//                 v instanceof Date
//                   ? formatDateLikeYYYYMMDD(v)
//                   : v;
//             }
//             worksheet.addRow(out);
//           }

//           // ✅ Format numbers as numbers with 2 decimals
//           worksheet.eachRow((row, rowNumber) => {
//             row.eachCell((cell) => {
//               if (typeof cell.value === "number") {
//                 cell.numFmt = "#,##0.00";
//               }
//             });
//           });

//           // style header row
//           worksheet.getRow(1).eachCell((cell) => {
//             cell.fill = {
//               type: "pattern",
//               pattern: "solid",
//               fgColor: { argb: "D6EAF8" },
//             };
//             cell.font = { bold: true };
//             cell.border = {
//               top: { style: "thin" },
//               left: { style: "thin" },
//               bottom: { style: "thin" },
//               right: { style: "thin" },
//             };
//           });

//           // borders
//           worksheet.eachRow((row) => {
//             row.eachCell((cell) => {
//               cell.border = {
//                 top: { style: "thin" },
//                 left: { style: "thin" },
//                 bottom: { style: "thin" },
//                 right: { style: "thin" },
//               };
//             });
//           });

//           // auto-fit
//           autofitColumns(worksheet);

//           await workbook.xlsx.writeFile(filePath);
//         } else {
//           // PDF output (unchanged)
//           const fonts = {
//             Helvetica: {
//               normal: "Helvetica",
//               bold: "Helvetica-Bold",
//               italics: "Helvetica-Oblique",
//               bolditalics: "Helvetica-BoldOblique",
//             },
//           };
//           const printer = new PdfPrinter(fonts);

//           const grouped = {};
//           for (const r of finalRows) {
//             const sec = r.section || "General";
//             const sub = r.sub_section || "Details";
//             if (!grouped[sec]) grouped[sec] = {};
//             if (!grouped[sec][sub]) grouped[sec][sub] = [];
//             grouped[sec][sub].push([r.label, r.value ?? ""]);
//           }

//           const content = [{ text: "CAM DATA REPORT", style: "header" }];
//           for (const [section, subs] of Object.entries(grouped)) {
//             content.push({ text: section, style: "sectionHeader" });
//             for (const [sub, rows] of Object.entries(subs)) {
//               content.push({ text: sub, style: "subHeader" });
//               content.push({
//                 table: {
//                   widths: ["35%", "65%"],
//                   body: [["Field", "Value"], ...rows],
//                 },
//                 layout: "lightHorizontalLines",
//                 margin: [0, 0, 0, 8],
//               });
//             }
//           }

//           const docDefinition = {
//             content,
//             pageSize: "A4",
//             pageMargins: [30, 30, 30, 40],
//             styles: {
//               header: {
//                 fontSize: 16,
//                 bold: true,
//                 alignment: "center",
//                 margin: [0, 0, 0, 12],
//               },
//               sectionHeader: { fontSize: 13, bold: true, margin: [0, 8, 0, 4] },
//               subHeader: { fontSize: 11, bold: true, margin: [0, 4, 0, 4] },
//             },
//             defaultStyle: { font: "Helvetica" },
//           };

//           const pdfDoc = printer.createPdfKitDocument(docDefinition);
//           await new Promise((resolve, reject) => {
//             const stream = fs.createWriteStream(filePath);
//             pdfDoc.pipe(stream);
//             pdfDoc.end();
//             stream.on("finish", resolve);
//             stream.on("error", reject);
//           });
//         }

//         if (!fs.existsSync(filePath)) {
//           await db
//             .promise()
//             .query(`UPDATE reports_download SET status='Failed' WHERE id=?`, [
//               reportRowId,
//             ]);
//           return;
//         }

//         const secs = Math.floor((Date.now() - startTime) / 1000);
//         const pretty = `${Math.floor(secs / 60)} minute ${secs % 60} seconds`;
//         await db
//           .promise()
//           .query(
//             `UPDATE reports_download 
//              SET status='Completed', time_taken=?, generated_at=NOW()
//              WHERE id=?`,
//             [pretty, reportRowId]
//           );

//         console.log("✅ Report generated:", fileName);
//       } catch (err) {
//         console.error("❌ Background job error:", err);
//         await db
//           .promise()
//           .query(`UPDATE reports_download SET status='Failed' WHERE id=?`, [
//             reportRowId,
//           ]);
//       }
//     });
//   } catch (err) {
//     console.error("❌ Trigger error:", err);
//     res.status(500).json({ error: err.message || "Server error" });
//   }
// });

// /** -------------------- download a generated file -------------------- **/
// router.get("/download/:fileName", (req, res) => {
//   const { fileName } = req.params;
//   const filePath = path.join(reportsDir, fileName);

//   if (fs.existsSync(filePath)) {
//     res.setHeader(
//       "Content-Disposition",
//       `attachment; filename="${fileName}"`
//     );
//     const isPdf = fileName.toLowerCase().endsWith(".pdf");
//     res.setHeader(
//       "Content-Type",
//       isPdf
//         ? "application/pdf"
//         : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
//     );
//     res.download(filePath);
//   } else {
//     res.status(404).json({ error: "File not found" });
//   }
// });

// /** -------------------- list generated downloads -------------------- **/
// router.get("/downloads", (req, res) => {
//   const { reportId } = req.query;

//   let query = `
//     SELECT 
//       id, report_id, status, file_name, generated_at, 
//       description, product, created_by, time_taken
//     FROM reports_download
//   `;
//   const params = [];

//   if (reportId) {
//     query += " WHERE LOWER(report_id) = LOWER(?)";
//     params.push(reportId.toLowerCase());
//   }

//   query += " ORDER BY generated_at DESC";

//   db.query(query, params, (err, results) => {
//     if (err) {
//       console.error("❌ Error fetching downloads:", err);
//       return res.status(500).json({ message: "Database error" });
//     }

//     const apiBase = process.env.API_BASE_URL || "http://localhost:5000";
//     const withUrls = results.map((r) => ({
//       ...r,
//       downloadUrl: `${apiBase}/reports/${r.file_name}`,
//     }));

//     res.json(withUrls);
//   });
// });

// /** -------------------- templates -------------------- **/

// const templateMap = {
//   ev: "ev.xlsx",
//   bl: "bl.xlsx",
//   gq_fsf: "GQ_FSF_Loan_Booking.xlsx",
//   gq_non_fsf: "gq_non_fsf.xlsx",
//   adikosh: "adikosh.xlsx",
//   utr_upload: "UTR_UPLOAD.xlsx",
//   repayment_upload: "repayment_upload.xlsx",
// };

// router.get("/download-template/:product", (req, res) => {
//   const productKey = req.params.product.toLowerCase();
//   const fileName = templateMap[productKey];

//   if (!fileName) {
//     return res.status(400).json({ message: "Invalid product format requested." });
//   }

//   const filePath = path.join(__dirname, `../templates/${fileName}`);

//   if (!fs.existsSync(filePath)) {
//     return res.status(404).json({ message: "Template file not found." });
//   }

//   res.download(filePath, `${productKey}_format.xlsx`, (err) => {
//     if (err) {
//       console.error(`Error sending ${productKey} template:`, err);
//       res.status(500).send("Failed to download template.");
//     }
//   });
// });

// module.exports = router;


////////////////////////
const express = require("express");
const router = express.Router();
const db = require("../config/db");
const fs = require("fs");
const path = require("path");
const ExcelJS = require("exceljs");
const authenticateUser = require("../middleware/verifyToken");

// Optional PDF support
const PdfPrinter = require("pdfmake");

const reportsDir = path.join(__dirname, "../reports");
if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

/** -------------------- helpers -------------------- **/

// normalize strings to consistent ids (e.g. "Adikosh CAM Report" -> "adikosh-cam-report")
function norm(s) {
  return (s || "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-");
}

function resolveProcedure(rawReportId, rawLender) {
  const id = norm(rawReportId);
  const lender = (rawLender || "").toString().trim().toLowerCase();

  // id aliases (add more if needed)
  const aliases = {
    "cashflow-report": "cashflow-report",
    "cashflow-report-bank-date": "cashflow-report-bank-date",
    "cashflow report bank date": "cashflow-report-bank-date",
    "due-demand-vs-collection-report(all-products)":
      "due-demand-vs-collection-report(all-products)",
    "due-demand-vs-collection-report":
      "due-demand-vs-collection-report(all-products)",
    "consolidated-mis": "consolidated-mis",
    "consolidated mis": "consolidated-mis",
    "delayed-interest-report": "delayed-interest-report",
    "rps-generate-report": "rps-generate-report",
    "irr-report": "irr-report",
    "adikosh-cam-report": "adikosh-cam-report",
    "adikosh-cam-report-pivot": "adikosh-cam-report-pivot",
    "adikosh-cam-report-print": "adikosh-cam-report-print",
    "adikosh-cam-print": "adikosh-cam-report-print",
    "ccod-loan-data-report": "ccod-loan-data-report",
  };

  const key = aliases[id] || id;

  const procMap = {
    "cashflow-report": () =>
      lender === "adikosh"
        ? "sp_cashflow_report_adikosh"
        : lender === "gq non-fsf"
        ? "sp_cashflow_report_gq_non_fsf"
        : lender === "embifi"
        ? "sp_cashflow_report_embifi"
        : lender === "gq fsf"
        ? "sp_cashflow_report_gq_fsf"
        : lender === "wctl"
        ? "sp_cashflow_report_wctl"
        : lender === "ev loan"
        ? "sp_cashflow_report_ev"
        : lender === "emiclub"
        ? "sp_cashflow_report_emiclub"
        : "sp_cashflow_report",

    "cashflow-report-bank-date": () => "sp_cashflow_report_bank_date",

    "due-demand-vs-collection-report(all-products)": () =>
      lender === "adikosh"
        ? "sp_due_collection_all_report_adikosh"
        : lender === "gq non-fsf"
        ? "sp_due_collection_all_report_gq_non_fsf"
        : lender === "gq fsf"
        ? "sp_due_collection_all_report_gq_fsf"
        : lender === "bl loan"
        ? "sp_due_collection_all_report_BL_Loan"
        : lender === "embifi"
        ? "sp_due_collection_all_report_embifi"
        : lender === "wctl"
        ? "sp_due_collection_all_report_wctl"
        : lender === "emiclub"
        ? "sp_due_collection_all_report_emiclub"
        : "sp_due_collection_all_report",

    "consolidated-mis": () =>
      lender === "adikosh"
        ? "sp_consolidated_mis_report_adikosh"
        : lender === "gq non-fsf"
        ? "sp_consolidated_mis_report_gq_non_fsf"
        : lender === "gq fsf"
        ? "sp_consolidated_mis_report_gq_fsf"
        : lender === "embifi"
        ? "sp_consolidated_mis_report_embifi"
        : lender === "wctl"
        ? "sp_consolidated_mis_report_wctl"
        : lender === "emiclub"
        ? "sp_consolidated_mis_report_emiclub"
        : "sp_consolidated_mis_report",

    // NEW IRR Report add
    "irr-report": () =>
      lender === "gq non-fsf"
        ? "sp_generate_gq_non_fsf_irr_report"
        : "sp_generate_gq_fsf_irr_report",

    "delayed-interest-report": () => "sp_delayed_interest_report",
    "rps-generate-report": () => "sp_generate_rps_report",

    // CAM (vertical)
    "adikosh-cam-report": () => "sp_cam_data_report_adikosh",
    // CAM (horizontal pivot)
    "adikosh-cam-report-pivot": () => "sp_cam_data_report_adikosh_pivot",
    // CAM printable (single LAN)
    "adikosh-cam-report-print": () => "sp_cam_data_report_adikosh_print",

    // CCOD LOAN DATA REPORT
    "ccod-loan-data-report": () => "sp_cc_ood_mis_report",
  };

  return procMap[key] ? procMap[key]() : null;
}

function autofitColumns(worksheet) {
  worksheet.columns.forEach((col) => {
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

function formatDateLikeYYYYMMDD(val) {
  if (!(val instanceof Date)) return val;
  const y = val.getFullYear();
  const m = String(val.getMonth() + 1).padStart(2, "0");
  const d = String(val.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** -------------------- trigger report -------------------- **/

router.post("/trigger", authenticateUser, async (req, res) => {
  const startTime = Date.now();
  const {
    reportId,
    startDate,
    endDate,
    product: lenderName,
    description,
    outputFormat,
    lan,
  } = req.body;

  console.log("📤 Triggering report with:", req.body);

  const createdByUser = req.user?.name || "system";
  const normalizedReportId = norm(reportId);
  const selectedProcedure = resolveProcedure(reportId, lenderName);

  if (!selectedProcedure) {
    return res.status(400).json({ error: `Invalid report ID: ${reportId}` });
  }

  // Decide whether this is a single-LAN print report
  const isPrintReport =
    normalizedReportId === "adikosh-cam-report-print" ||
    normalizedReportId === "adikosh-cam-print";

  // Basic validation
  if (isPrintReport) {
    if (!lan) {
      return res
        .status(400)
        .json({ error: "LAN is required for CAM print report" });
    }
  } else {
    if (!startDate || !endDate || !lenderName) {
      return res
        .status(400)
        .json({ error: "startDate, endDate and product are required" });
    }
  }

  // Filename/extension by output type (PDF only for print)
  const usePdf = outputFormat?.toLowerCase() === "pdf" && isPrintReport;
  const ext = usePdf ? "pdf" : "xlsx";

  const timestamp = Date.now();
  const fileSafeId = normalizedReportId.replace(/[^a-z0-9-]/g, "");
  const fileName = `${fileSafeId}_${timestamp}.${ext}`;
  const filePath = path.join(reportsDir, fileName);

  try {
    const [insertResult] = await db.promise().query(
      `INSERT INTO reports_download 
       (report_id, file_name, file_path, description, product, created_by, time_taken, generated_at, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), ?)`,
      [
        reportId,
        fileName,
        filePath,
        description || "No description",
        lenderName || (isPrintReport ? "Adikosh" : "Unknown"),
        createdByUser,
        "In progress",
        "Running",
      ]
    );

    const reportRowId = insertResult.insertId;
    console.log("🆕 Inserted report row ID:", reportRowId, "| file:", filePath);

    // Respond immediately
    res.status(202).json({ message: "Report triggered", fileName });

    // Background job
    setImmediate(async () => {
      try {
        console.log("⚙️ Executing procedure:", selectedProcedure);

        let finalRows = [];
        if (isPrintReport) {
          const [results] = await db
            .promise()
            .query(`CALL ${selectedProcedure}(?)`, [lan]);
          console.log("select proc", selectedProcedure);
          
           const set = results.find(
             (r) => Array.isArray(r) && r.length && typeof r[0] === "object"
           );
          finalRows = set || [];
        } else {
          const [results] = await db
            .promise()
            .query(`CALL ${selectedProcedure}(?, ?, ?)`, [
              startDate,
              endDate,
              lenderName,
            ]);

          const set = results.find(
            (r) => Array.isArray(r) && r.length && typeof r[0] === "object"
          );

          finalRows = set || [];
        }

        if (!finalRows.length) {
          console.warn("ℹ️ Procedure returned no rows");
          await db
            .promise()
            .query(`UPDATE reports_download SET status='Failed' WHERE id=?`, [
              reportRowId,
            ]);
          return;
        }

        // ---------- OUTPUT ----------
        if (ext === "xlsx") {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Report");

  const headers = Object.keys(finalRows[0]);
  worksheet.columns = headers.map((key) => ({ header: key, key }));

  for (const row of finalRows) {
    const out = {};
    for (const k of headers) {
      let v = row[k];

      // ✅ Dates: keep as text
      if (v instanceof Date) {
        out[k] = formatDateLikeYYYYMMDD(v);

      // ✅ YYYY-MM-DD strings: keep as text
      } else if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
        out[k] = v;

      // ✅ Numeric-looking strings → convert to Number
      } else if (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v.replace(/,/g, ''))) {
        out[k] = Number(v.replace(/,/g, ""));  // strip commas → convert to number

      // ✅ Already numbers → keep
      } else if (typeof v === "number") {
        out[k] = v;

      // ✅ Everything else → leave
      } else {
        out[k] = v;
      }
    }
    worksheet.addRow(out);
  }

  // ✅ Apply Excel number formatting
  worksheet.eachRow((row) => {
    row.eachCell((cell) => {
      if (typeof cell.value === "number") {
        cell.numFmt = "#,##0.00"; // Excel numeric format with 2 decimals
      }
    });
  });

  // Style header row
  worksheet.getRow(1).eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "D6EAF8" },
    };
    cell.font = { bold: true };
    cell.border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };
  });

  // Add borders
  worksheet.eachRow((row) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
    });
  });

  // Auto-fit columns
  autofitColumns(worksheet);

  await workbook.xlsx.writeFile(filePath);
}
// PDF CODE
 else {
          // PDF generation (unchanged)
          const fonts = {
            Helvetica: {
              normal: "Helvetica",
              bold: "Helvetica-Bold",
              italics: "Helvetica-Oblique",
              bolditalics: "Helvetica-BoldOblique",
            },
          };
          const printer = new PdfPrinter(fonts);

          const grouped = {};
          for (const r of finalRows) {
            const sec = r.section || "General";
            const sub = r.sub_section || "Details";
            if (!grouped[sec]) grouped[sec] = {};
            if (!grouped[sec][sub]) grouped[sec][sub] = [];
            grouped[sec][sub].push([r.label, r.value ?? ""]);
          }

          const content = [{ text: "CAM DATA REPORT", style: "header" }];
          for (const [section, subs] of Object.entries(grouped)) {
            content.push({ text: section, style: "sectionHeader" });
            for (const [sub, rows] of Object.entries(subs)) {
              content.push({ text: sub, style: "subHeader" });
              content.push({
                table: {
                  widths: ["35%", "65%"],
                  body: [["Field", "Value"], ...rows],
                },
                layout: "lightHorizontalLines",
                margin: [0, 0, 0, 8],
              });
            }
          }

          const docDefinition = {
            content,
            pageSize: "A4",
            pageMargins: [30, 30, 30, 40],
            styles: {
              header: {
                fontSize: 16,
                bold: true,
                alignment: "center",
                margin: [0, 0, 0, 12],
              },
              sectionHeader: { fontSize: 13, bold: true, margin: [0, 8, 0, 4] },
              subHeader: { fontSize: 11, bold: true, margin: [0, 4, 0, 4] },
            },
            defaultStyle: { font: "Helvetica" },
          };

          const pdfDoc = printer.createPdfKitDocument(docDefinition);
          await new Promise((resolve, reject) => {
            const stream = fs.createWriteStream(filePath);
            pdfDoc.pipe(stream);
            pdfDoc.end();
            stream.on("finish", resolve);
            stream.on("error", reject);
          });
        }

        const secs = Math.floor((Date.now() - startTime) / 1000);
        const pretty = `${Math.floor(secs / 60)} minute ${secs % 60} seconds`;
        await db
          .promise()
          .query(
            `UPDATE reports_download 
             SET status='Completed', time_taken=?, generated_at=NOW()
             WHERE id=?`,
            [pretty, reportRowId]
          );

        console.log("✅ Report generated:", fileName);
      } catch (err) {
        console.error("❌ Background job error:", err);
        await db
          .promise()
          .query(`UPDATE reports_download SET status='Failed' WHERE id=?`, [
            reportRowId,
          ]);
      }
    });
  } catch (err) {
    console.error("❌ Trigger error:", err);
    res.status(500).json({ error: err.message || "Server error" });
  }
});

/** -------------------- download a generated file -------------------- **/
router.get("/download/:fileName", (req, res) => {
  const { fileName } = req.params;
  const filePath = path.join(reportsDir, fileName);

  if (fs.existsSync(filePath)) {
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${fileName}"`
    );
    const isPdf = fileName.toLowerCase().endsWith(".pdf");
    res.setHeader(
      "Content-Type",
      isPdf
        ? "application/pdf"
        : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.download(filePath);
  } else {
    res.status(404).json({ error: "File not found" });
  }
});

/** -------------------- list generated downloads -------------------- **/
router.get("/downloads", (req, res) => {
  const { reportId } = req.query;

  let query = `
    SELECT 
      id, report_id, status, file_name, generated_at, 
      description, product, created_by, time_taken
    FROM reports_download
  `;
  const params = [];

  if (reportId) {
    query += " WHERE LOWER(report_id) = LOWER(?)";
    params.push(reportId.toLowerCase());
  }

  query += " ORDER BY generated_at DESC";

  db.query(query, params, (err, results) => {
    if (err) {
      console.error("❌ Error fetching downloads:", err);
      return res.status(500).json({ message: "Database error" });
    }

    const apiBase = process.env.API_BASE_URL || "http://localhost:5000";
    const withUrls = results.map((r) => ({
      ...r,
      downloadUrl: `${apiBase}/reports/${r.file_name}`,
    }));

    res.json(withUrls);
  });
});

/** -------------------- templates -------------------- **/

const templateMap = {
  ev: "ev.xlsx",
  bl: "bl.xlsx",
  gq_fsf: "GQ_FSF_Loan_Booking.xlsx",
  gq_non_fsf: "gq_non_fsf.xlsx",
  adikosh: "adikosh.xlsx",
  utr_upload: "UTR_UPLOAD.xlsx",
  repayment_upload: "repayment_upload.xlsx",
  emiclub :"emiclub.xlsx",
};

router.get("/download-template/:product", (req, res) => {
  const productKey = req.params.product.toLowerCase();
  const fileName = templateMap[productKey];

  if (!fileName) {
    return res.status(400).json({ message: "Invalid product format requested." });
  }

  const filePath = path.join(__dirname, `../templates/${fileName}`);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ message: "Template file not found." });
  }

  res.download(filePath, `${productKey}_format.xlsx`, (err) => {
    if (err) {
      console.error(`Error sending ${productKey} template:`, err);
      res.status(500).send("Failed to download template.");
    }
  });
});

module.exports = router;
