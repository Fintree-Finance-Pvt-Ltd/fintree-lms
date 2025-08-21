// const express = require("express");
// const router = express.Router();
// const db = require("../config/db");
// const fs = require("fs");
// const path = require("path");
// const ExcelJS = require("exceljs");
// // const filePath = path.join(reportsDir, fileName);


// // 👇 This path should match where you're saving or reading report files
// const reportsDir = path.join(__dirname, "../../frontend/public/reports");

// if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });


// router.post("/trigger", async (req, res) => {
//   const startTime = Date.now();
//   const {
//       reportId,
//       startDate,
//       endDate,
//       product: lenderName,
//       description,
//   } = req.body;

//   console.log("📤 Triggering report with:", req.body);

//   const createdByUser = req.user?.username || "system";
//   const sanitizedReportId = reportId.replace(/\s+/g, "-").toLowerCase();
//   const timestamp = Date.now();
//   const fileName = `${sanitizedReportId}_${timestamp}.xlsx`;
//   const filePath = path.join(reportsDir, fileName);

//   // const reportProcMap = {
//   //     "cashflow-report": "sp_cashflow_report",
//   //     "due-demand-vs-collection-report(all-products)":
//   //         "sp_due_collection_all_report",
//   //     "consolidated-mis": "sp_consolidated_mis_report",
//   // };
//   function resolveProcedure(reportId, lenderName) {
//     const isAdikosh = lenderName?.toLowerCase() === "adikosh";
  
//     const map = {
//       "cashflow-report": isAdikosh
//         ? "sp_cashflow_report_adikosh"
//         : "sp_cashflow_report",
  
//       "due-demand-vs-collection-report(all-products)": isAdikosh
//         ? "sp_due_collection_all_report_adikosh"
//         : "sp_due_collection_all_report",
  
//       "consolidated-mis": isAdikosh
//         ? "sp_consolidated_mis_report_adikosh"
//         : "sp_consolidated_mis_report"
//     };
  
//     return map[reportId?.toLowerCase()] || null;
//   }
  

//   const reportProcMap = {
//     "cashflow-report": "sp_cashflow_report",
//     "due-demand-vs-collection-report(all-products)": "sp_due_collection_all_report",
//     "due-demand-vs-collection-report-adikosh": "sp_due_collection_all_report_adikosh", // <-- new Adikosh report SP
//     "consolidated-mis": "sp_consolidated_mis_report",
//   };
  
//   const selectedProcedure = resolveProcedure(reportId, lenderName);
//   if (!selectedProcedure) {
//       return res.status(400).json({ error: "Invalid report ID" });
//   }
//   // let selectedProcedure = reportProcMap[reportId.toLowerCase()];

//   // // Extra Adikosh override condition (if needed by lender value instead of reportId)
//   // if (!selectedProcedure && lenderName.toLowerCase() === "adikosh") {
//   //   selectedProcedure = "sp_due_collection_all_report_adikosh";
//   // }
  
//   // if (!selectedProcedure) {
//   //   return res.status(400).json({ error: "Invalid report ID or lender" });
//   // }
//   // let reportRowId = null;

//   try {
//       // 1. Insert metadata with status "Running"
//       const [insertResult] = await db.promise().query(
//           `INSERT INTO reports_download 
//       (report_id, file_name, file_path, description, product, created_by, time_taken, generated_at, status)
//       VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), ?)`,
//           [
//               reportId,
//               fileName,
//               filePath,
//               description || "No description",
//               lenderName || "Unknown",
//               createdByUser,
//               "In progress",
//               "Running",
//           ]
//       );

//       reportRowId = insertResult.insertId;

//       // 2. Return response immediately
//       res.status(202).json({ message: "Report triggered", fileName });

//       // 3. Start background processing
//       setImmediate(async () => {
//           try {
//               console.log("⚙️ Executing procedure:", selectedProcedure);

//               const [results] = await db.promise().query(
//                   `CALL ${selectedProcedure}(?, ?, ?)`,
//                   [startDate, endDate, lenderName]
//               );

//               const finalReport = results.find(
//                   (r) => Array.isArray(r) && r.length > 0 && typeof r[0] === "object"
//               );

//               if (!finalReport) {
//                   await db.promise().query(
//                       `UPDATE reports_download SET status = 'Failed' WHERE id = ?`,
//                       [reportRowId]
//                   );
//                   return;
//               }

//               const workbook = new ExcelJS.Workbook();
//               const worksheet = workbook.addWorksheet("Report");
              
//               // Set columns from data keys
//               worksheet.columns = Object.keys(finalReport[0]).map((key) => ({
//                 header: key,
//                 key,
//               }));

//               const formattedRows = finalReport.map((row) => {
//                 const newRow = {};
//                 Object.entries(row).forEach(([key, value]) => {
//                   if (value instanceof Date) {
//                     // Get local date parts (YYYY-MM-DD)
//                     const year = value.getFullYear();
//                     const month = String(value.getMonth() + 1).padStart(2, "0");
//                     const day = String(value.getDate()).padStart(2, "0");
//                     newRow[key] = `${year}-${month}-${day}`;
//                   } else if (
//                     typeof value === "string" &&
//                     /^\d{4}-\d{2}-\d{2}$/.test(value)
//                   ) {
//                     newRow[key] = value;
//                   } else {
//                     newRow[key] = value;
//                   }
//                 });
//                 return newRow;
//               });

//               formattedRows.forEach((row) => {
//                 const cellValues = Object.values(row).map((val) =>
//                   typeof val === "string" && /^\d{4}-\d{2}-\d{2}$/.test(val) ? `${val}` : val
//                 );
//                 worksheet.addRow(cellValues);
//               });
              
              
//               // Header styling
//               worksheet.getRow(1).eachCell((cell) => {
//                 cell.fill = {
//                   type: "pattern",
//                   pattern: "solid",
//                   fgColor: { argb: "D6EAF8" }, // light blue
//                 };
//                 cell.font = { bold: true };
//                 cell.border = {
//                   top: { style: "thin" },
//                   left: { style: "thin" },
//                   bottom: { style: "thin" },
//                   right: { style: "thin" },
//                 };
//               });
       
//               // 🟫 Apply borders to all cells
//               worksheet.eachRow((row) => {
//                 row.eachCell((cell) => {
//                   cell.border = {
//                     top: { style: "thin" },
//                     left: { style: "thin" },
//                     bottom: { style: "thin" },
//                     right: { style: "thin" },
//                   };
//                 });
//               });
       
//               await workbook.xlsx.writeFile(filePath);

//               if (!fs.existsSync(filePath)) {
//                   await db.promise().query(
//                       `UPDATE reports_download SET status = 'Failed' WHERE id = ?`,
//                       [reportRowId]
//                   );
//                   return;
//               }

//               const timeTakenInSeconds = Math.floor((Date.now() - startTime) / 1000);
//               const timeTakenFormatted = `${Math.floor(timeTakenInSeconds / 60)} minute ${timeTakenInSeconds % 60} seconds`;

//               await db.promise().query(
//                   `UPDATE reports_download 
//           SET status = 'Completed', time_taken = ?, generated_at = NOW()
//           WHERE id = ?`,
//                   [timeTakenFormatted, reportRowId]
//               );

//               console.log("✅ Report finished and updated successfully:", fileName);
//           } catch (err) {
//               console.error("❌ Background job error:", err);
//               if (reportRowId) {
//                   await db.promise().query(
//                       `UPDATE reports_download SET status = 'Failed' WHERE id = ?`,
//                       [reportRowId]
//                   );
//               }
//           }
//       });
//   } catch (err) {
//       console.error("❌ Trigger error:", err);
//       if (reportRowId) {
//           await db.promise().query(
//               `UPDATE reports_download SET status = 'Failed' WHERE id = ?`,
//               [reportRowId]
//           );
//       }
//       res.status(500).json({ error: err.message || "Server error" });
//   }
// });




// // 🔹 GET: Download file
// router.get("/download/:fileName", (req, res) => {
//   const { fileName } = req.params;
//   const filePath = path.join(reportsDir, fileName);

//   if (fs.existsSync(filePath)) {
//     res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
//     res.setHeader(
//       "Content-Type",
//       "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
//     );
//     res.download(filePath);
//   } else {
//     res.status(404).json({ error: "File not found" });
//   }
// });

// // 🔹 GET: Fetch all downloadable reports
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

//   // console.log("📤 Query:", query);

//   db.query(query, params, (err, results) => {
//     if (err) {
//       console.error("❌ Error fetching downloads:", err);
//       return res.status(500).json({ message: "Database error" });
//     }
//     res.json(results);
//   });
// });


// module.exports = router;
const express = require("express");
const router = express.Router();
const db = require("../config/db");
const fs = require("fs");
const path = require("path");
const ExcelJS = require("exceljs");
const authenticateUser = require("../middleware/verifyToken");

const reportsDir = path.join(__dirname, "../../Frontend/public/reports");
if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

router.post("/trigger", authenticateUser,  async (req, res) => {
  const startTime = Date.now();
  const {
    reportId,
    startDate,
    endDate,
    product: lenderName,
    description,
  } = req.body;

  console.log("📤 Triggering report with:", req.body);

  const createdByUser = req.user?.name || "system";
  const sanitizedReportId = reportId.replace(/\s+/g, "-").toLowerCase();
  const timestamp = Date.now();
  const fileName = `${sanitizedReportId}_${timestamp}.xlsx`;
  const filePath = path.join(reportsDir, fileName);

  function resolveProcedure(reportId, lenderName) {
    const lender = lenderName?.toLowerCase();

    const map = {
      "cashflow-report": lender === "adikosh"
        ? "sp_cashflow_report_adikosh"
        : lender === "gq non-fsf"
        ? "sp_cashflow_report_gq_non_fsf"
        : "sp_cashflow_report",

      "due-demand-vs-collection-report(all-products)": lender === "adikosh"
      ? "sp_due_collection_all_report_adikosh"
      : lender === "gq non-fsf"
      ? "sp_due_collection_all_report_gq_non_fsf"
      : lender === "gq fsf"
      ? "sp_due_collection_all_report_gq_fsf"
      : lender === "wctl"
      ? "sp_due_collection_all_report_wctl"
      : "sp_due_collection_all_report",

    "consolidated-mis": lender === "adikosh"
      ? "sp_consolidated_mis_report_adikosh"
      : lender === "gq non-fsf"
      ? "sp_consolidated_mis_report_gq_non_fsf"
      : lender === "gq fsf"
      ? "sp_consolidated_mis_report_gq_fsf"
      : lender === "wctl"
      ? "sp_consolidated_mis_report_wctl"
      : "sp_consolidated_mis_report",


        "delayed-interest-report": "sp_delayed_interest_report",

        "rps-generate-report": "sp_generate_rps_report",

    };

    return map[reportId?.toLowerCase()] || null;
  }

  const selectedProcedure = resolveProcedure(reportId, lenderName);
  if (!selectedProcedure) {
    return res.status(400).json({ error: "Invalid report ID" });
  }

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
        lenderName || "Unknown",
        createdByUser,
        "In progress",
        "Running",
      ]
    );

    const reportRowId = insertResult.insertId;
    res.status(202).json({ message: "Report triggered", fileName });

    setImmediate(async () => {
      try {
        console.log("⚙️ Executing procedure:", selectedProcedure);

        const [results] = await db.promise().query(
          `CALL ${selectedProcedure}(?, ?, ?)`,
          [startDate, endDate, lenderName]
        );

        const finalReport = results.find(
          (r) => Array.isArray(r) && r.length > 0 && typeof r[0] === "object"
        );

        if (!finalReport) {
          await db.promise().query(
            `UPDATE reports_download SET status = 'Failed' WHERE id = ?`,
            [reportRowId]
          );
          return;
        }

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet("Report");

        worksheet.columns = Object.keys(finalReport[0]).map((key) => ({
          header: key,
          key,
        }));

        const formattedRows = finalReport.map((row) => {
          const newRow = {};
          Object.entries(row).forEach(([key, value]) => {
            if (value instanceof Date) {
              const year = value.getFullYear();
              const month = String(value.getMonth() + 1).padStart(2, "0");
              const day = String(value.getDate()).padStart(2, "0");
              newRow[key] = `${year}-${month}-${day}`;
            } else if (
              typeof value === "string" &&
              /^\d{4}-\d{2}-\d{2}$/.test(value)
            ) {
              newRow[key] = value;
            } else {
              newRow[key] = value;
            }
          });
          return newRow;
        });

        formattedRows.forEach((row) => {
          const cellValues = Object.values(row).map((val) =>
            typeof val === "string" && /^\d{4}-\d{2}-\d{2}$/.test(val) ? `${val}` : val
          );
          worksheet.addRow(cellValues);
        });

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

        await workbook.xlsx.writeFile(filePath);

        if (!fs.existsSync(filePath)) {
          await db.promise().query(
            `UPDATE reports_download SET status = 'Failed' WHERE id = ?`,
            [reportRowId]
          );
          return;
        }

        const timeTakenInSeconds = Math.floor((Date.now() - startTime) / 1000);
        const timeTakenFormatted = `${Math.floor(timeTakenInSeconds / 60)} minute ${timeTakenInSeconds % 60} seconds`;

        await db.promise().query(
          `UPDATE reports_download 
          SET status = 'Completed', time_taken = ?, generated_at = NOW()
          WHERE id = ?`,
          [timeTakenFormatted, reportRowId]
        );

        console.log("✅ Report finished and updated successfully:", fileName);
      } catch (err) {
        console.error("❌ Background job error:", err);
        await db.promise().query(
          `UPDATE reports_download SET status = 'Failed' WHERE id = ?`,
          [reportRowId]
        );
      }
    });
  } catch (err) {
    console.error("❌ Trigger error:", err);
    res.status(500).json({ error: err.message || "Server error" });
  }
});

router.get("/download/:fileName", (req, res) => {
  const { fileName } = req.params;
  const filePath = path.join(reportsDir, fileName);

  if (fs.existsSync(filePath)) {
    res.setHeader("Content-Disposition", `attachment; filename=\"${fileName}\"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.download(filePath);
  } else {
    res.status(404).json({ error: "File not found" });
  }
});

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
    res.json(results);
  });
});

// for templates of excel files of each product

// Allowed product keys and file map
const templateMap = {
  ev: "ev.xlsx",
  bl: "bl.xlsx",
  gq_fsf: "GQ_FSF_Loan_Booking.xlsx",
  gq_non_fsf: "gq_non_fsf.xlsx",
  adikosh: "adikosh.xlsx",
  utr_upload: "UTR_UPLOAD.xlsx",
  repayment_upload: "repayment_upload.xlsx",
};

router.get("/download-template/:product", (req, res) => {
  const productKey = req.params.product.toLowerCase();
  const fileName = templateMap[productKey];

  if (!fileName) {
    return res.status(400).json({ message: "Invalid product format requested." });
  }

  const filePath = path.join(__dirname, `../templates/${fileName}`);

  // Validate file existence
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
