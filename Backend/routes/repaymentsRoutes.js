// const express = require("express");
// const multer = require("multer");
// const xlsx = require("xlsx");
// const db = require("../config/db");
// const { allocateRepaymentByLAN } = require("../utils/allocate");
// const { excelSerialDateToJS, queryDB } = require("../utils/helpers");

// const router = express.Router();
// const upload = multer({ storage: multer.memoryStorage() });

// router.post("/upload", upload.single("file"), async (req, res) => {
//   if (!req.file) return res.status(400).json({ message: "No file uploaded" });

//   const successRows = [];
//   const failedRows = [];
//   const missingLANs = [];
//   const duplicateUTRs = [];

//   try {
//     const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
//     const sheet = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
//     const sheetData = sheet.map((row, i) => ({ ...row, __row: i + 2 }));

//     if (sheetData.length === 0) {
//       return res.status(400).json({ message: "Empty or invalid file" });
//     }

//     // ✅ Add loan_booking_embifi here
//     const uniqueLANs = [...new Set(sheetData.map(r => r["LAN"]).filter(Boolean))];
//     const lanResults = await Promise.all([
//       queryDB(`SELECT lan FROM loan_booking_gq_non_fsf WHERE lan IN (?)`, [uniqueLANs]),
//       queryDB(`SELECT lan FROM loan_booking_gq_fsf WHERE lan IN (?)`, [uniqueLANs]),
//       queryDB(`SELECT lan FROM loan_booking_adikosh WHERE lan IN (?)`, [uniqueLANs]),
//       queryDB(`SELECT lan FROM loan_bookings WHERE lan IN (?)`, [uniqueLANs]),
//       queryDB(`SELECT lan FROM loan_booking_ev WHERE lan IN (?)`, [uniqueLANs]),
//       queryDB(`SELECT lan FROM loan_bookings_wctl WHERE lan IN (?)`, [uniqueLANs]),
//       queryDB(`SELECT lan FROM loan_booking_embifi WHERE lan IN (?)`, [uniqueLANs]) // 👈 NEW
//     ]);
//     const validLANs = new Set(lanResults.flat().map(r => r.lan));

//     for (const row of sheetData) {
//       const rowNumber = row.__row;
//       const lan = row["LAN"];
//       const utr = row["UTR"];
//       const bank_date = excelSerialDateToJS(row["Bank Date"]);
//       const payment_date = excelSerialDateToJS(row["Payment Date"]);
//       const payment_id = row["Payment Id"];
//       const payment_mode = row["Payment Mode"];
//       const transfer_amount = row["Transfer Amount"];

//       if (!lan || !utr || !payment_date || !payment_id || !transfer_amount) {
//         console.warn(`⚠️ Row ${rowNumber}: Missing required fields`, row);
//         failedRows.push({ row: rowNumber, reason: "Missing required fields" });
//         throw new Error(`❌ Fatal: Required data missing in row ${rowNumber} — upload stopped.`);
//       }

//       if (!validLANs.has(lan)) {
//         console.warn(`❌ Row ${rowNumber}: Invalid LAN (${lan})`);
//         missingLANs.push(lan);
//         failedRows.push({ row: rowNumber, reason: "LAN not found" });
//         throw new Error(`❌ Fatal: Invalid LAN in row ${rowNumber} — upload stopped.`);
//       }

//       // ✅ Choose table based on LAN prefix
//       let table = "repayments_upload";
//       if (lan.startsWith("ADK")) {
//         table = "repayments_upload_adikosh";
//       } else{
//         table = "repayments_upload"; // 👈 NEW
//       }

//       // ✅ Duplicate UTR check
//       const [utrCheck] = await queryDB(`SELECT COUNT(*) AS count FROM ${table} WHERE utr = ?`, [utr]);
//       if (utrCheck.count > 0) {
//         console.error(`❌ Row ${rowNumber}: Duplicate UTR (${utr})`);
//         duplicateUTRs.push(utr);
//         failedRows.push({ row: rowNumber, reason: "Duplicate UTR" });
//         throw new Error(`❌ Fatal: Duplicate UTR in row ${rowNumber} — upload stopped.`);
//       }

//       // ✅ Penal charges & repayment insert
//       await queryDB(`CALL sp_generate_penal_charge(?)`, [lan]);
//       await queryDB(
//         `INSERT INTO ${table} (lan, bank_date, utr, payment_date, payment_id, payment_mode, transfer_amount)
//          VALUES (?, ?, ?, ?, ?, ?, ?)`,
//         [lan, bank_date, utr, payment_date, payment_id, payment_mode, transfer_amount]
//       );

//       await allocateRepaymentByLAN(lan, {
//         lan, bank_date, utr, payment_date, payment_id, payment_mode, transfer_amount
//       });

//       successRows.push(rowNumber);
//     }

//     console.log(`✅ Repayment Uploaded Successfully: ${successRows.length} rows processed`);
// //      await queryDB("CALL sp_set_allocation_bankdate_by_utr(1)"); // 👈 NEW: Update bank_date in allocation table  based on UTR
// // console.log("✅ Allocation bank_date updated based on UTR");
//     res.json({
//       message: "✅ Upload successful",
//       total_rows: sheetData.length,
//       inserted_rows: successRows.length,
//       failed_rows: failedRows.length,
//       success_rows: successRows,
//       failed_details: failedRows,
//       missing_lans: missingLANs,
//       duplicate_utrs: duplicateUTRs,
//     });

//   } catch (err) {
//     console.error("❌ Upload stopped:", err.message);
//     res.status(500).json({
//       message: "❌ Upload stopped due to error",
//       inserted_rows: successRows.length,
//       failed_rows: failedRows.length,
//       success_rows: successRows,
//       failed_details: failedRows,
//       missing_lans: missingLANs,
//       duplicate_utrs: duplicateUTRs,
//       error: err.message,
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

router.post("/upload", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: "No file uploaded" });

  const successRows = [];
  const rowErrors = [];         // [{row, lan, utr, stage, reason}]
  const missingLANs = [];
  const duplicateUTRs = [];

  try {
    const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
    const sheet = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
    const sheetData = sheet.map((row, i) => ({ ...row, __row: i + 2 })); // header on row 1

    if (sheetData.length === 0) {
      return res.status(400).json({ message: "Empty or invalid file" });
    }

    // validate required headers (optional but helpful)
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
        queryDB(`SELECT lan FROM loan_bookings_wctl WHERE lan IN (?)`, [uniqueLANs]),
        queryDB(`SELECT lan FROM loan_booking_embifi WHERE lan IN (?)`, [uniqueLANs]),
        queryDB(`SELECT lan FROM loan_booking_finso WHERE lan IN (?)`, [uniqueLANs]),
      ]);
      validLANs = new Set(results.flat().map((r) => r.lan));
    }

    // Process each row independently
    for (const row of sheetData) {
      const rowNumber = row.__row;
      const lan = row["LAN"];
      const utr = row["UTR"];
      const bank_date = excelSerialDateToJS(row["Bank Date"]);
      const payment_date = excelSerialDateToJS(row["Payment Date"]);
      const payment_id = row["Payment Id"];
      const payment_mode = row["Payment Mode"];
      const transfer_amount = row["Transfer Amount"];

      // 1) Validate
      if (!lan || !utr || !payment_date || !payment_id || !transfer_amount) {
        rowErrors.push({ row: rowNumber, lan, utr, stage: "validation", reason: "Missing required fields" });
        continue;
      }

      // 2) LAN exists?
      if (!validLANs.has(lan)) {
        if (!missingLANs.includes(lan)) missingLANs.push(lan);
        rowErrors.push({ row: rowNumber, lan, utr, stage: "validation", reason: "LAN not found" });
        continue;
      }

      // 3) Choose upload table by LAN prefix (extend if you add more)
      let table = "repayments_upload";
      if (lan.startsWith("ADK")) {
        table = "repayments_upload_adikosh";
      } else if (lan.startsWith("E11")) {
        table = "repayments_upload_embifi"; // if you have a specific embifi upload table; else keep default
      } // else default stays

      // 4) Duplicate UTR check (per-table scope)
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

      // 5) Generate penal charge
      try {
        console.log(`Generating penal charge for LAN ${lan} (row ${rowNumber})`);
        await queryDB(`CALL sp_generate_penal_charge(?)`, [lan]);
      } catch (err) {
        rowErrors.push({ row: rowNumber, lan, utr, stage: "penal", reason: toClientError(err).message });
        continue;
      }

      // 6) Insert repayment row
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

      // 7) Allocate
      try {
        await allocateRepaymentByLAN(lan, {
          lan, bank_date, utr, payment_date, payment_id, payment_mode, transfer_amount,
        });
      } catch (err) {
        rowErrors.push({ row: rowNumber, lan, utr, stage: "allocation", reason: toClientError(err).message });
        // optional: continue (repayment inserted but allocation failed); a later job could re-allocate
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
    console.error("❌ Upload parse error:", err);
    return res.status(500).json({
      message: "Upload failed",
      error: toClientError(err),
      inserted_rows: successRows.length,
      failed_rows: rowErrors.length,
      row_errors: rowErrors,
      missing_lans: missingLANs,
      duplicate_utrs: duplicateUTRs,
    });
  }
});

module.exports = router;
