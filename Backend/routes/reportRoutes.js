////////////////////////
const express = require("express");
const router = express.Router();
const db = require("../config/db");
const fs = require("fs");
const path = require("path");
const ExcelJS = require("exceljs");
const authenticateUser = require("../middleware/verifyToken");
const exportBankPaymentFile = require("../utils/exportBankPaymentFile");
const exportConsumerBureauReport = require("../utils/exportConsumerBureauReport")


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
    "delete-collection-data": "delete-collection-data",
     "delete collection data": "delete-collection-data",
    "ccod-loan-data-report": "ccod-loan-data-report",
  "bank-payment-file-report": "bank-payment-file-report",
  "bank payment file report": "bank-payment-file-report",
"consumer-bureau-report": "consumer-bureau-report",
"consumer bureau report": "consumer-bureau-report",
"consumer_bureau_report": "consumer-bureau-report",
"pay out report":"pay-out-report",
"pay-out-report":"pay-out-report",
"pay_out_report":"pay-out-report",


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
        : lender === "hey ev"
        ? "sp_cashflow_report_hey_ev"
        : lender === "emiclub"
        ? "sp_cashflow_report_emiclub"
        : lender === "circlepe"
        ? "sp_cashflow_report_circlepe"
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
        : lender === "hey ev"
        ? "sp_due_collection_all_report_hey_ev"
        : lender === "emiclub"
        ? "sp_due_collection_all_report_emiclub"
        : lender === "circlepe"
        ? "sp_due_collection_all_report_circlepe"
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
        : lender === "hey ev"
        ? "sp_consolidated_mis_report_hey_ev"
        : lender === "circlepe"
        ? "sp_consolidated_mis_report_circlepe"
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

    // Delete Collection Report
    "delete-collection-data": () => "SP_Delete_data_collection",

    // CCOD LOAN DATA REPORT
    "ccod-loan-data-report": () => "sp_cc_ood_mis_report",

    "pay-out-report": () => "sp_emiclub_payout_report_emiclub",

        // Bank Payment File Report (for EmiClub)
    "bank-payment-file-report": () => "sp_bank_payment_file",

    // consumer bureau report
"consumer-bureau-report": () => "sp_consumer_bureau_report_all_products",



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
////////////////////new for payment file /////////////////////

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

  const isPrintReport =
    normalizedReportId === "adikosh-cam-report-print" ||
    normalizedReportId === "adikosh-cam-print"||
    normalizedReportId === "delete-collection-data";

  // ✅ Validation rules
  if (isPrintReport) {
    if (!lan) {
      return res
        .status(400)
        .json({ error: "LAN is required for CAM print report" });
    }
  } else if (normalizedReportId === "consumer-bureau-report") {
  if (!endDate) return res.status(400).json({ error: "endDate is required" });
  } else if (normalizedReportId !== "bank-payment-file-report") {
    if (!startDate || !endDate || !lenderName) {
      return res
        .status(400)
        .json({ error: "startDate, endDate and product are required" });
    }
  }

  // ✅ File setup
  const usePdf = outputFormat?.toLowerCase() === "pdf" && isPrintReport;
  const isBankPaymentFile = norm(reportId) === "bank-payment-file-report";
const ext = usePdf ? "pdf" : isBankPaymentFile ? "xls" : "xlsx";
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
    res.status(202).json({ message: "Report triggered", fileName });

    // ✅ Background job
    setImmediate(async () => {
      try {
        console.log("⚙️ Executing procedure:", selectedProcedure);

        let finalRows = [];
        if (isPrintReport) {
          const [results] = await db
            .promise()
            .query(`CALL ${selectedProcedure}(?)`, [lan]);
          const set = results.find(
            (r) => Array.isArray(r) && r.length && typeof r[0] === "object"
          );
          finalRows = set || [];
        } else if (normalizedReportId === "consumer-bureau-report") {
  const [results] = await db.promise().query(
    `CALL ${selectedProcedure}(?)`,
    [endDate]
  );
  const set = results.find(r => Array.isArray(r) && r.length && typeof r[0] === "object");
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

        // ✅ Output Handling
        if (ext === "xlsx" || ext === "xls") {
          if (normalizedReportId === "bank-payment-file-report") {
            // ⚙️ Use custom helper for bank payment file
            await exportBankPaymentFile(finalRows, filePath);
          } else if (normalizedReportId === "consumer-bureau-report") {
  await exportConsumerBureauReport(finalRows, filePath);
} else {
            // ✅ Default Excel export
            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet("Report");
            const headers = Object.keys(finalRows[0]);
            worksheet.columns = headers.map((key) => ({ header: key, key }));
            for (const row of finalRows) worksheet.addRow(row);
            worksheet.getRow(1).font = { bold: true };
            autofitColumns(worksheet);
            await workbook.xlsx.writeFile(filePath);
          }
        } else {
          // ✅ PDF export logic (unchanged)
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
              header: { fontSize: 16, bold: true, alignment: "center", margin: [0, 0, 0, 12] },
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

        // ✅ Mark report as completed
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
