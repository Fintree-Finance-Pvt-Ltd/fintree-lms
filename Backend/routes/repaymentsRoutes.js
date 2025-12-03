// const express = require("express");
// const multer = require("multer");
// const xlsx = require("xlsx");
// const db = require("../config/db");
// const { allocateRepaymentByLAN } = require("../utils/allocate");
// const { excelSerialDateToJS, queryDB } = require("../utils/helpers");

// const router = express.Router();
// const upload = multer({ storage: multer.memoryStorage() });

// const toClientError = (err) => {
//   if (!err) return { message: "Unknown error" };
//   const { message, code, errno, sqlState, sqlMessage } = err;
//   return { message: sqlMessage || message || "Error", code, errno, sqlState };
// };

// router.post("/upload", upload.single("file"), async (req, res) => {
//   if (!req.file) return res.status(400).json({ message: "No file uploaded" });

//   const successRows = [];
//   const rowErrors = [];         // [{row, lan, utr, stage, reason}]
//   const missingLANs = [];
//   const duplicateUTRs = [];

//   try {
//     const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
//     const sheet = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
//     const sheetData = sheet.map((row, i) => ({ ...row, __row: i + 2 })); // header on row 1

//     if (sheetData.length === 0) {
//       return res.status(400).json({ message: "Empty or invalid file" });
//     }

//     // validate required headers (optional but helpful)
//     const required = ["LAN", "UTR", "Payment Date", "Payment Id", "Transfer Amount"];
//     const missingHeaders = required.filter((h) => !(h in sheetData[0]));
//     if (missingHeaders.length) {
//       return res.status(400).json({
//         message: "Missing required column(s)",
//         details: { missing_headers: missingHeaders },
//       });
//     }

//     // Build valid LAN set across all booking tables
//     const uniqueLANs = [...new Set(sheetData.map(r => r["LAN"]).filter(Boolean))];
//     let validLANs = new Set();

//     if (uniqueLANs.length) {
//       const results = await Promise.all([
//         queryDB(`SELECT lan FROM loan_booking_gq_non_fsf WHERE lan IN (?)`, [uniqueLANs]),
//         queryDB(`SELECT lan FROM loan_booking_gq_fsf WHERE lan IN (?)`, [uniqueLANs]),
//         queryDB(`SELECT lan FROM loan_booking_adikosh WHERE lan IN (?)`, [uniqueLANs]),
//         queryDB(`SELECT lan FROM loan_bookings WHERE lan IN (?)`, [uniqueLANs]),
//         queryDB(`SELECT lan FROM loan_booking_ev WHERE lan IN (?)`, [uniqueLANs]),
//         queryDB(`SELECT lan FROM loan_booking_hey_ev WHERE lan IN (?)`, [uniqueLANs]),
//         queryDB(`SELECT lan FROM loan_bookings_wctl WHERE lan IN (?)`, [uniqueLANs]),
//         queryDB(`SELECT lan FROM loan_booking_embifi WHERE lan IN (?)`, [uniqueLANs]),
//         queryDB(`SELECT lan FROM loan_booking_finso WHERE lan IN (?)`, [uniqueLANs]),
//         queryDB(`SELECT lan FROM loan_booking_emiclub WHERE lan IN (?)`, [uniqueLANs]),
//         queryDB(`SELECT lan FROM loan_booking_circle_pe WHERE lan IN (?)`, [uniqueLANs]),
        
//       ]);
//       validLANs = new Set(results.flat().map((r) => r.lan));
//     }

//     // Process each row independently
//     for (const row of sheetData) {
//       const rowNumber = row.__row;
//       const lan = row["LAN"];
//       const utr = row["UTR"];
//       const bank_date = excelSerialDateToJS(row["Bank Date"]);
//       const payment_date = excelSerialDateToJS(row["Payment Date"]);
//       const payment_id = row["Payment Id"];
//       const payment_mode = row["Payment Mode"];
//       const transfer_amount = row["Transfer Amount"];

//       // 1) Validate
//       if (!lan || !utr || !payment_date || !payment_id || !transfer_amount) {
//         rowErrors.push({ row: rowNumber, lan, utr, stage: "validation", reason: "Missing required fields" });
//         continue;
//       }

//       // 2) LAN exists?
//       if (!validLANs.has(lan)) {
//         if (!missingLANs.includes(lan)) missingLANs.push(lan);
//         rowErrors.push({ row: rowNumber, lan, utr, stage: "validation", reason: "LAN not found" });
//         continue;
//       }

//       // 3) Choose upload table by LAN prefix (extend if you add more)
//       let table = "repayments_upload";
//       if (lan.startsWith("ADK")) {
//         table = "repayments_upload_adikosh";
//       } // else default stays

//       // 4) Duplicate UTR check (per-table scope)
//       try {
//         const [dup] = await queryDB(`SELECT COUNT(*) AS cnt FROM ${table} WHERE utr = ?`, [utr]);
//         if (dup && dup.cnt > 0) {
//           if (!duplicateUTRs.includes(utr)) duplicateUTRs.push(utr);
//           rowErrors.push({ row: rowNumber, lan, utr, stage: "pre-insert", reason: "Duplicate UTR" });
//           continue;
//         }
//       } catch (err) {
//         rowErrors.push({ row: rowNumber, lan, utr, stage: "pre-insert", reason: `Dup check error: ${toClientError(err).message}` });
//         continue;
//       }

//       // 5) Generate penal charge
//       try {
//         console.log(`Generating penal charge for LAN ${lan} (row ${rowNumber})`);
//         await queryDB(`CALL sp_generate_penal_charge(?)`, [lan]);
//       } catch (err) {
//         rowErrors.push({ row: rowNumber, lan, utr, stage: "penal", reason: toClientError(err).message });
//         continue;
//       }

//       // 6) Insert repayment row
//       try {
//         await queryDB(
//           `INSERT INTO ${table} (lan, bank_date, utr, payment_date, payment_id, payment_mode, transfer_amount)
//            VALUES (?, ?, ?, ?, ?, ?, ?)`,
//           [lan, bank_date, utr, payment_date, payment_id, payment_mode, transfer_amount]
//         );
//       } catch (err) {
//         rowErrors.push({ row: rowNumber, lan, utr, stage: "insert", reason: `Insert error: ${toClientError(err).message}` });
//         continue;
//       }

//       // 7) Allocate
//       try {
//         await allocateRepaymentByLAN(lan, {
//           lan, bank_date, utr, payment_date, payment_id, payment_mode, transfer_amount,
//         });
//       } catch (err) {
//         rowErrors.push({ row: rowNumber, lan, utr, stage: "allocation", reason: toClientError(err).message });
//         // optional: continue (repayment inserted but allocation failed); a later job could re-allocate
//         continue;
//       }

//       successRows.push(rowNumber);
//     }

//     return res.json({
//       message: `Upload completed. ${successRows.length} row(s) processed successfully.`,
//       total_rows: sheetData.length,
//       inserted_rows: successRows.length,
//       failed_rows: rowErrors.length,
//       success_rows: successRows,
//       row_errors: rowErrors,
//       missing_lans: missingLANs,
//       duplicate_utrs: duplicateUTRs,
//     });
//   } catch (err) {
//     console.error("❌ Upload parse error:", err);
//     return res.status(500).json({
//       message: "Upload failed",
//       error: toClientError(err),
//       inserted_rows: successRows.length,
//       failed_rows: rowErrors.length,
//       row_errors: rowErrors,
//       missing_lans: missingLANs,
//       duplicate_utrs: duplicateUTRs,
//     });
//   }
// });

// module.exports = router;


const express = require("express");
const multer = require("multer");
const xlsx = require("xlsx");
const db = require("../config/db");
const { allocateRepaymentByLAN } = require("../utils/allocate");
const { excelSerialDateToJS, queryDB } = require("../utils/helpers");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

const toClientError = (err) => {
  if (!err) return { message: "Unknown error" };
  const { message, code, errno, sqlState, sqlMessage } = err;
  return { message: sqlMessage || message || "Error", code, errno, sqlState };
};

// ======= COMMON PROCESSOR FOR EXCEL + JSON UPLOAD ==========
async function processRows(sheetData, res) {

  const successRows = [];
  const rowErrors = [];
  const missingLANs = [];
  const duplicateUTRs = [];

  try {
    if (!sheetData.length) {
      return res.status(400).json({ message: "Empty or invalid data" });
    }

    // Required columns
    const required = ["LAN", "UTR", "Payment Date", "Payment Id", "Transfer Amount"];
    const missingHeaders = required.filter((h) => !(h in sheetData[0]));

    if (missingHeaders.length) {
      return res.status(400).json({
        message: "Missing required column(s)",
        details: { missing_headers: missingHeaders },
      });
    }

    // Build valid LAN set across all booking tables
    const uniqueLANs = [...new Set(sheetData.map(r => r["LAN"]).filter(Boolean))];
    let validLANs = new Set();

    if (uniqueLANs.length) {
      const results = await Promise.all([
        queryDB(`SELECT lan FROM loan_booking_gq_non_fsf WHERE lan IN (?)`, [uniqueLANs]),
        queryDB(`SELECT lan FROM loan_booking_gq_fsf WHERE lan IN (?)`, [uniqueLANs]),
        queryDB(`SELECT lan FROM loan_booking_adikosh WHERE lan IN (?)`, [uniqueLANs]),
        queryDB(`SELECT lan FROM loan_bookings WHERE lan IN (?)`, [uniqueLANs]),
        queryDB(`SELECT lan FROM loan_booking_ev WHERE lan IN (?)`, [uniqueLANs]),
        queryDB(`SELECT lan FROM loan_booking_hey_ev WHERE lan IN (?)`, [uniqueLANs]),
        queryDB(`SELECT lan FROM loan_bookings_wctl WHERE lan IN (?)`, [uniqueLANs]),
        queryDB(`SELECT lan FROM loan_booking_embifi WHERE lan IN (?)`, [uniqueLANs]),
        queryDB(`SELECT lan FROM loan_booking_finso WHERE lan IN (?)`, [uniqueLANs]),
        queryDB(`SELECT lan FROM loan_booking_emiclub WHERE lan IN (?)`, [uniqueLANs]),
        queryDB(`SELECT lan FROM loan_booking_circle_pe WHERE lan IN (?)`, [uniqueLANs]),
      ]);

      validLANs = new Set(results.flat().map((r) => r.lan));
    }

    // Process each row
    for (const row of sheetData) {
      const rowNumber = row.__row || 1;

      const lan = row["LAN"];
      const utr = row["UTR"];
      const bank_date = excelSerialDateToJS(row["Bank Date"]);
      const payment_date = excelSerialDateToJS(row["Payment Date"]);
      const payment_id = row["Payment Id"];
      const payment_mode = row["Payment Mode"];
      const transfer_amount = row["Transfer Amount"];

      // validation
      if (!lan || !utr || !payment_date || !payment_id || !transfer_amount) {
        rowErrors.push({ row: rowNumber, lan, utr, bank_date,payment_date, payment_id,payment_mode,transfer_amount, stage: "validation", reason: "Missing required fields" });
        continue;
      }

      // LAN check
      if (!validLANs.has(lan)) {
        if (!missingLANs.includes(lan)) missingLANs.push(lan);
        rowErrors.push({ row: rowNumber, lan, utr, stage: "validation", reason: "LAN not found" });
        continue;
      }

      // Choose upload table by LAN prefix
      let table = "repayments_upload";
      if (lan.startsWith("ADK")) {
        table = "repayments_upload_adikosh";
      }

      // Duplicate UTR check
      try {
        const [dup] = await queryDB(`SELECT COUNT(*) AS cnt FROM ${table} WHERE utr = ?`, [utr]);
        if (dup && dup.cnt > 0) {
          if (!duplicateUTRs.includes(utr)) duplicateUTRs.push(utr);
          rowErrors.push({ row: rowNumber, lan, utr, stage: "pre-insert", reason: "Duplicate UTR" });
          continue;
        }
      } catch (err) {
        rowErrors.push({ row: rowNumber, lan, utr, stage: "pre-insert", reason: `Dup check error: ${toClientError(err).message}` });
        continue;
      }

      // Penal charge
      try {
        console.log(`Generating penal charge for LAN ${lan} (row ${rowNumber})`);
        await queryDB(`CALL sp_generate_penal_charge(?)`, [lan]);
      } catch (err) {
        rowErrors.push({ row: rowNumber, lan, utr, stage: "penal", reason: toClientError(err).message });
        continue;
      }

      // Insert into repayment table
      try {
        await queryDB(
          `INSERT INTO ${table} (lan, bank_date, utr, payment_date, payment_id, payment_mode, transfer_amount)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [lan, bank_date, utr, payment_date, payment_id, payment_mode, transfer_amount]
        );
      } catch (err) {
        rowErrors.push({ row: rowNumber, lan, utr, stage: "insert", reason: `Insert error: ${toClientError(err).message}` });
        continue;
      }

      // Allocate
      try {
        await allocateRepaymentByLAN(lan, {
          lan, bank_date, utr, payment_date, payment_id, payment_mode, transfer_amount,
        });
      } catch (err) {
        rowErrors.push({ row: rowNumber, lan, utr, stage: "allocation", reason: toClientError(err).message });
        continue;
      }

      successRows.push(rowNumber);
    }

    return res.json({
      message: `Upload completed. ${successRows.length} row(s) processed successfully.`,
      total_rows: sheetData.length,
      inserted_rows: successRows.length,
      failed_rows: rowErrors.length,
      success_rows: successRows,
      row_errors: rowErrors,
      missing_lans: missingLANs,
      duplicate_utrs: duplicateUTRs,
    });

  } catch (err) {
    console.error("Processor error:", err);
    return res.status(500).json({
      message: "Processing failed",
      error: toClientError(err),
    });
  }
}

// ====== EXCEL UPLOAD ROUTE ======
router.post("/upload", upload.single("file"), async (req, res) => {
  if (!req.file)
    return res.status(400).json({ message: "No file uploaded" });

  try {
    const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
    const sheet = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
    const sheetData = sheet.map((row, i) => ({ ...row, __row: i + 2 })); // Excel row numbering

    return await processRows(sheetData, res);
  } catch (err) {
    console.error("Excel upload error:", err);
    return res.status(500).json({ message: "Upload failed", error: err.message });
  }
});

// ====== JSON API UPLOAD ROUTE ======
router.post("/upload-json", async (req, res) => {
  const rows = req.body?.rows;

  if (!rows || !Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ message: "Invalid or empty data" });
  }

  try {
    const sheetData = rows.map((row, i) => ({ ...row, __row: i + 1 }));
    return await processRows(sheetData, res);
  } catch (err) {
    console.error("JSON upload error:", err);
    return res.status(500).json({ message: "Upload failed", error: err.message });
  }
});

module.exports = router;
