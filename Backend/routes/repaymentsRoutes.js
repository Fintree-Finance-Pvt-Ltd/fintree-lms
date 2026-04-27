// // const express = require("express");
// // const multer = require("multer");
// // const xlsx = require("xlsx");
// // const db = require("../config/db");
// // const { allocateRepaymentByLAN } = require("../utils/allocate");
// // const { excelSerialDateToJS, queryDB } = require("../utils/helpers");

// // const router = express.Router();
// // const upload = multer({ storage: multer.memoryStorage() });

// // const toClientError = (err) => {
// //   if (!err) return { message: "Unknown error" };
// //   const { message, code, errno, sqlState, sqlMessage } = err;
// //   return { message: sqlMessage || message || "Error", code, errno, sqlState };
// // };

// // router.post("/upload", upload.single("file"), async (req, res) => {
// //   if (!req.file) return res.status(400).json({ message: "No file uploaded" });

// //   const successRows = [];
// //   const rowErrors = [];         // [{row, lan, utr, stage, reason}]
// //   const missingLANs = [];
// //   const duplicateUTRs = [];

// //   try {
// //     const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
// //     const sheet = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
// //     const sheetData = sheet.map((row, i) => ({ ...row, __row: i + 2 })); // header on row 1

// //     if (sheetData.length === 0) {
// //       return res.status(400).json({ message: "Empty or invalid file" });
// //     }

// //     // validate required headers (optional but helpful)
// //     const required = ["LAN", "UTR", "Payment Date", "Payment Id", "Transfer Amount"];
// //     const missingHeaders = required.filter((h) => !(h in sheetData[0]));
// //     if (missingHeaders.length) {
// //       return res.status(400).json({
// //         message: "Missing required column(s)",
// //         details: { missing_headers: missingHeaders },
// //       });
// //     }

// //     // Build valid LAN set across all booking tables
// //     const uniqueLANs = [...new Set(sheetData.map(r => r["LAN"]).filter(Boolean))];
// //     let validLANs = new Set();

// //     if (uniqueLANs.length) {
// //       const results = await Promise.all([
// //         queryDB(`SELECT lan FROM loan_booking_gq_non_fsf WHERE lan IN (?)`, [uniqueLANs]),
// //         queryDB(`SELECT lan FROM loan_booking_gq_fsf WHERE lan IN (?)`, [uniqueLANs]),
// //         queryDB(`SELECT lan FROM loan_booking_adikosh WHERE lan IN (?)`, [uniqueLANs]),
// //         queryDB(`SELECT lan FROM loan_bookings WHERE lan IN (?)`, [uniqueLANs]),
// //         queryDB(`SELECT lan FROM loan_booking_ev WHERE lan IN (?)`, [uniqueLANs]),
// //         queryDB(`SELECT lan FROM loan_booking_hey_ev WHERE lan IN (?)`, [uniqueLANs]),
// //         queryDB(`SELECT lan FROM loan_bookings_wctl WHERE lan IN (?)`, [uniqueLANs]),
// //         queryDB(`SELECT lan FROM loan_booking_embifi WHERE lan IN (?)`, [uniqueLANs]),
// //         queryDB(`SELECT lan FROM loan_booking_finso WHERE lan IN (?)`, [uniqueLANs]),
// //         queryDB(`SELECT lan FROM loan_booking_emiclub WHERE lan IN (?)`, [uniqueLANs]),
// //         queryDB(`SELECT lan FROM loan_booking_circle_pe WHERE lan IN (?)`, [uniqueLANs]),

// //       ]);
// //       validLANs = new Set(results.flat().map((r) => r.lan));
// //     }

// //     // Process each row independently
// //     for (const row of sheetData) {
// //       const rowNumber = row.__row;
// //       const lan = row["LAN"];
// //       const utr = row["UTR"];
// //       const bank_date = excelSerialDateToJS(row["Bank Date"]);
// //       const payment_date = excelSerialDateToJS(row["Payment Date"]);
// //       const payment_id = row["Payment Id"];
// //       const payment_mode = row["Payment Mode"];
// //       const transfer_amount = row["Transfer Amount"];

// //       // 1) Validate
// //       if (!lan || !utr || !payment_date || !payment_id || !transfer_amount) {
// //         rowErrors.push({ row: rowNumber, lan, utr, stage: "validation", reason: "Missing required fields" });
// //         continue;
// //       }

// //       // 2) LAN exists?
// //       if (!validLANs.has(lan)) {
// //         if (!missingLANs.includes(lan)) missingLANs.push(lan);
// //         rowErrors.push({ row: rowNumber, lan, utr, stage: "validation", reason: "LAN not found" });
// //         continue;
// //       }

// //       // 3) Choose upload table by LAN prefix (extend if you add more)
// //       let table = "repayments_upload";
// //       if (lan.startsWith("ADK")) {
// //         table = "repayments_upload_adikosh";
// //       } // else default stays

// //       // 4) Duplicate UTR check (per-table scope)
// //       try {
// //         const [dup] = await queryDB(`SELECT COUNT(*) AS cnt FROM ${table} WHERE utr = ?`, [utr]);
// //         if (dup && dup.cnt > 0) {
// //           if (!duplicateUTRs.includes(utr)) duplicateUTRs.push(utr);
// //           rowErrors.push({ row: rowNumber, lan, utr, stage: "pre-insert", reason: "Duplicate UTR" });
// //           continue;
// //         }
// //       } catch (err) {
// //         rowErrors.push({ row: rowNumber, lan, utr, stage: "pre-insert", reason: `Dup check error: ${toClientError(err).message}` });
// //         continue;
// //       }

// //       // 5) Generate penal charge
// //       try {
// //         console.log(`Generating penal charge for LAN ${lan} (row ${rowNumber})`);
// //         await queryDB(`CALL sp_generate_penal_charge(?)`, [lan]);
// //       } catch (err) {
// //         rowErrors.push({ row: rowNumber, lan, utr, stage: "penal", reason: toClientError(err).message });
// //         continue;
// //       }

// //       // 6) Insert repayment row
// //       try {
// //         await queryDB(
// //           `INSERT INTO ${table} (lan, bank_date, utr, payment_date, payment_id, payment_mode, transfer_amount)
// //            VALUES (?, ?, ?, ?, ?, ?, ?)`,
// //           [lan, bank_date, utr, payment_date, payment_id, payment_mode, transfer_amount]
// //         );
// //       } catch (err) {
// //         rowErrors.push({ row: rowNumber, lan, utr, stage: "insert", reason: `Insert error: ${toClientError(err).message}` });
// //         continue;
// //       }

// //       // 7) Allocate
// //       try {
// //         await allocateRepaymentByLAN(lan, {
// //           lan, bank_date, utr, payment_date, payment_id, payment_mode, transfer_amount,
// //         });
// //       } catch (err) {
// //         rowErrors.push({ row: rowNumber, lan, utr, stage: "allocation", reason: toClientError(err).message });
// //         // optional: continue (repayment inserted but allocation failed); a later job could re-allocate
// //         continue;
// //       }

// //       successRows.push(rowNumber);
// //     }

// //     return res.json({
// //       message: `Upload completed. ${successRows.length} row(s) processed successfully.`,
// //       total_rows: sheetData.length,
// //       inserted_rows: successRows.length,
// //       failed_rows: rowErrors.length,
// //       success_rows: successRows,
// //       row_errors: rowErrors,
// //       missing_lans: missingLANs,
// //       duplicate_utrs: duplicateUTRs,
// //     });
// //   } catch (err) {
// //     console.error("❌ Upload parse error:", err);
// //     return res.status(500).json({
// //       message: "Upload failed",
// //       error: toClientError(err),
// //       inserted_rows: successRows.length,
// //       failed_rows: rowErrors.length,
// //       row_errors: rowErrors,
// //       missing_lans: missingLANs,
// //       duplicate_utrs: duplicateUTRs,
// //     });
// //   }
// // });

// // module.exports = router;

// const express = require("express");
// const multer = require("multer");
// const xlsx = require("xlsx");
// const db = require("../config/db");
// const { allocateRepaymentByLAN } = require("../utils/allocate");
// //const { excelSerialDateToJS} = require("../utils/helpers");
// const {  queryDB } = require("../utils/helpers");

// const excelSerialDateToJS = (value) => {
//   if (!value) return null;

//   // Already YYYY-MM-DD format
//   if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
//     return value;
//   }

//   // Excel serial number
//   if (!isNaN(value)) {
//     const excelEpoch = new Date(Date.UTC(1899, 11, 30));
//     return new Date(excelEpoch.getTime() + value * 86400000)
//       .toISOString()
//       .split("T")[0];
//   }

//   // Format like 22-Mar-26
//   if (typeof value === "string" && /^\d{2}-[A-Za-z]{3}-\d{2}$/.test(value)) {
//     const [day, monthAbbr, yearShort] = value.split("-");

//     const monthNames = {
//       Jan: 0, Feb: 1, Mar: 2, Apr: 3,
//       May: 4, Jun: 5, Jul: 6, Aug: 7,
//       Sep: 8, Oct: 9, Nov: 10, Dec: 11,
//     };

//     const month = monthNames[monthAbbr];
//     const year = parseInt("20" + yearShort, 10);

//     return new Date(Date.UTC(year, month, day))
//       .toISOString()
//       .split("T")[0];
//   }

//   return null;
// };

// const router = express.Router();
// const upload = multer({ storage: multer.memoryStorage() });

// const toClientError = (err) => {
//   if (!err) return { message: "Unknown error" };
//   const { message, code, errno, sqlState, sqlMessage } = err;
//   return { message: sqlMessage || message || "Error", code, errno, sqlState };
// };

// // ======= COMMON PROCESSOR FOR EXCEL + JSON UPLOAD ==========
// async function processRows(sheetData, res) {

//   const successRows = [];
//   const rowErrors = [];
//   const missingLANs = [];
//   const duplicateUTRs = [];

//   try {
//     if (!sheetData.length) {
//       return res.status(400).json({ message: "Empty or invalid data" });
//     }

//     // Normalize headers (Excel + JSON compatibility)
//     sheetData = sheetData.map((row) => ({
//       LAN: row.LAN || row.lan,
//       UTR: row.UTR || row.utr,
//       "Payment Date": row["Payment Date"] || row.payment_date,
//       "Bank Date":
//         row["Bank Date"] ||
//         row.bank_date ||
//         row["Payment Date"] ||
//         row.payment_date,
//       "Payment Id": row["Payment Id"] || row.payment_id,
//       "Payment Mode": row["Payment Mode"] || row.payment_mode,
//       "Transfer Amount":
//         row["Transfer Amount"] || row.transfer_amount,
//       __row: row.__row,
//     }));

//     // Required columns validation
//     const required = [
//       "LAN",
//       "UTR",
//       "Payment Date",
//       "Payment Id",
//       "Payment Mode",
//       "Transfer Amount",
//     ];

//     const missingHeaders = required.filter(
//       (h) => !(h in sheetData[0])
//     );

//     if (missingHeaders.length) {
//       return res.status(400).json({
//         message: "Missing required column(s)",
//         details: { missing_headers: missingHeaders },
//       });
//     }

//     // Build valid LAN set
//     const uniqueLANs = [
//       ...new Set(sheetData.map((r) => r["LAN"]).filter(Boolean)),
//     ];

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
//         queryDB(`SELECT lan FROM loan_booking_helium WHERE lan IN (?)`, [uniqueLANs]),
//        // queryDB(`SELECT lan FROM loan_booking_hey_ev_battery WHERE lan IN (?)`, [uniqueLANs]),
//         queryDB(`SELECT lan FROM loan_booking_zypay_customer WHERE lan IN (?)`, [uniqueLANs]),
//         queryDB(`SELECT lan FROM loan_booking_clayyo WHERE lan IN (?)`, [uniqueLANs]),
//         queryDB(`SELECT lan FROM loan_booking_loan_digit WHERE lan IN (?)`, [uniqueLANs]),
//       ]);

//       validLANs = new Set(results.flat().map((r) => r.lan));
//     }

//     // Process rows
//     for (const row of sheetData) {
//       const rowNumber = row.__row || 1;

//       const lan = row["LAN"];
//       const utr = row["UTR"];
//       const bank_date = excelSerialDateToJS(row["Bank Date"]);
//       const payment_date = excelSerialDateToJS(row["Payment Date"]);
//       const payment_id = row["Payment Id"];
//       const payment_mode = row["Payment Mode"];
//       const transfer_amount = row["Transfer Amount"];

//       // Validation
//       if (!lan || !utr || !payment_date || !payment_id || !payment_mode || !transfer_amount) {
//         rowErrors.push({
//           row: rowNumber,
//           lan,
//           utr,
//           bank_date,
//           payment_date,
//           payment_id,
//           payment_mode,
//           transfer_amount,
//           stage: "validation",
//           reason: "Missing required fields",
//         });
//         continue;
//       }

//       // LAN check
//       if (!validLANs.has(lan)) {
//         if (!missingLANs.includes(lan)) missingLANs.push(lan);

//         rowErrors.push({
//           row: rowNumber,
//           lan,
//           utr,
//           stage: "validation",
//           reason: "LAN not found",
//         });

//         continue;
//       }

//       // Select upload table
//       let table = "repayments_upload";

//       if (lan.startsWith("ADK")) {
//         table = "repayments_upload_adikosh";
//       }

//       // Duplicate UTR check
//       const [dup] = await queryDB(
//         `SELECT COUNT(*) AS cnt FROM ${table} WHERE utr = ?`,
//         [utr]
//       );

//       if (dup.cnt > 0) {
//         if (!duplicateUTRs.includes(utr)) duplicateUTRs.push(utr);

//         rowErrors.push({
//           row: rowNumber,
//           lan,
//           utr,
//           stage: "pre-insert",
//           reason: "Duplicate UTR",
//         });

//         continue;
//       }

//       // Penal charge SP
//       await queryDB(`CALL sp_generate_penal_charge(?)`, [lan]);

//       // Insert repayment
//       await queryDB(
//         `INSERT INTO ${table}
//         (lan, bank_date, utr, payment_date, payment_id, payment_mode, transfer_amount)
//         VALUES (?, ?, ?, ?, ?, ?, ?)`,
//         [
//           lan,
//           bank_date,
//           utr,
//           payment_date,
//           payment_id,
//           payment_mode,
//           transfer_amount,
//         ]
//       );

//       // Allocation
//       await allocateRepaymentByLAN(lan, {
//         lan,
//         bank_date,
//         utr,
//         payment_date,
//         payment_id,
//         payment_mode,
//         transfer_amount,
//       });

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
//     console.error("Processor error:", err);

//     return res.status(500).json({
//       message: "Processing failed",
//       error: toClientError(err),
//     });
//   }
// }

// // ====== EXCEL UPLOAD ROUTE ======
// router.post("/upload", upload.single("file"), async (req, res) => {
//   if (!req.file)
//     return res.status(400).json({ message: "No file uploaded" });

//   try {
//     const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
//     const sheet = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
//     const sheetData = sheet.map((row, i) => ({ ...row, __row: i + 2 })); // Excel row numbering

//     return await processRows(sheetData, res);
//   } catch (err) {
//     console.error("Excel upload error:", err);
//     return res.status(500).json({ message: "Upload failed", error: err.message });
//   }
// });

// // ====== JSON API UPLOAD ROUTE ======
// // router.post("/upload-json", async (req, res) => {
// //   const rows = req.body?.rows;

// //   if (!rows || !Array.isArray(rows) || rows.length === 0) {
// //     return res.status(400).json({ message: "Invalid or empty data" });
// //   }

// //   try {
// //     const sheetData = rows.map((row, i) => ({ ...row, __row: i + 1 }));
// //     return await processRows(sheetData, res);
// //   } catch (err) {
// //     console.error("JSON upload error:", err);
// //     return res.status(500).json({ message: "Upload failed", error: err.message });
// //   }
// // });

// // ====== JSON API UPLOAD ROUTE ======
// router.post("/upload-json", async (req, res) => {
//   let rows = req.body?.rows || req.body;

//   // Allow single object OR array
//   if (!Array.isArray(rows)) {
//     rows = [rows];
//   }

//   if (!rows.length) {
//     return res.status(400).json({ message: "Invalid or empty data" });
//   }

//   try {
//     // Normalize headers (Excel + JSON compatibility)
//     const sheetData = rows.map((row, i) => ({
//       LAN: row["LAN"] || row.lan,
//       UTR: row["UTR"] || row.utr,
//       "Payment Date": row["Payment Date"] || row.payment_date,
//       "Payment Id": row["Payment Id"] || row.payment_id,
//       payment_mode: row.payment_mode || row["Payment Mode"],
//       "Transfer Amount":
//         row["Transfer Amount"] || row.transfer_amount,

//       __row: i + 1,
//     }));

//     return await processRows(sheetData, res);
//   } catch (err) {
//     console.error("JSON upload error:", err);

//     return res.status(500).json({
//       message: "Upload failed",
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

/**
 * API date parser (separate from Excel parser)
 * Supports:
 * YYYY-MM-DD
 * DD-MM-YYYY
 * DD/MM/YYYY
 */
const parseApiDate = (value) => {
  if (!value) return null;

  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  if (typeof value === "string" && /^\d{2}-\d{2}-\d{4}$/.test(value)) {
    const [d, m, y] = value.split("-");
    return `${y}-${m}-${d}`;
  }

  if (typeof value === "string" && /^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
    const [d, m, y] = value.split("/");
    return `${y}-${m}-${d}`;
  }

  return null;
};

const toClientError = (err) => {
  if (!err) return { message: "Unknown error" };
  const { message, code, errno, sqlState, sqlMessage } = err;
  return { message: sqlMessage || message || "Error", code, errno, sqlState };
};

/**
 * COMMON PROCESSOR FOR BOTH EXCEL + JSON
 */
async function processRows(sheetData, res) {
  const successRows = [];
  const rowErrors = [];
  const missingLANs = [];
  const duplicateUTRs = [];

  try {
    if (!sheetData.length) {
      return res.status(400).json({ message: "Empty or invalid data" });
    }

    /**
     * Normalize headers (Excel + JSON compatibility)
     */
    sheetData = sheetData.map((row) => ({
      LAN: row.LAN || row.lan,
      UTR: row.UTR || row.utr,

      "Payment Date": row["Payment Date"] || row.payment_date,

      "Bank Date":
        row["Bank Date"] ||
        row.bank_date ||
        row["Payment Date"] ||
        row.payment_date,

      "Payment Id": row["Payment Id"] || row.payment_id,

      "Payment Mode": row["Payment Mode"] || row.payment_mode,

      "Transfer Amount": row["Transfer Amount"] || row.transfer_amount,

      __row: row.__row,
    }));

    /**
     * Validate required columns
     */
    const required = [
      "LAN",
      "UTR",
      "Payment Date",
      "Payment Id",
      "Payment Mode",
      "Transfer Amount",
    ];

    const missingHeaders = required.filter((h) => !(h in sheetData[0]));

    if (missingHeaders.length) {
      return res.status(400).json({
        message: "Missing required column(s)",
        details: { missing_headers: missingHeaders },
      });
    }

    /**
     * Fetch valid LANs
     */
    const uniqueLANs = [
      ...new Set(sheetData.map((r) => r["LAN"]).filter(Boolean)),
    ];

    let validLANs = new Set();

    if (uniqueLANs.length) {
      const results = await Promise.all([
        queryDB(`SELECT lan FROM loan_booking_gq_non_fsf WHERE lan IN (?)`, [
          uniqueLANs,
        ]),
        queryDB(`SELECT lan FROM loan_booking_gq_fsf WHERE lan IN (?)`, [
          uniqueLANs,
        ]),
        queryDB(`SELECT lan FROM loan_booking_adikosh WHERE lan IN (?)`, [
          uniqueLANs,
        ]),
        queryDB(`SELECT lan FROM loan_bookings WHERE lan IN (?)`, [uniqueLANs]),
        queryDB(`SELECT lan FROM loan_booking_ev WHERE lan IN (?)`, [
          uniqueLANs,
        ]),
        queryDB(`SELECT lan FROM loan_booking_hey_ev WHERE lan IN (?)`, [
          uniqueLANs,
        ]),
        queryDB(`SELECT lan FROM loan_bookings_wctl WHERE lan IN (?)`, [
          uniqueLANs,
        ]),
        queryDB(`SELECT lan FROM loan_booking_embifi WHERE lan IN (?)`, [
          uniqueLANs,
        ]),
        queryDB(`SELECT lan FROM loan_booking_finso WHERE lan IN (?)`, [
          uniqueLANs,
        ]),
        queryDB(`SELECT lan FROM loan_booking_emiclub WHERE lan IN (?)`, [
          uniqueLANs,
        ]),
        queryDB(`SELECT lan FROM loan_booking_circle_pe WHERE lan IN (?)`, [
          uniqueLANs,
        ]),
        queryDB(`SELECT lan FROM loan_booking_helium WHERE lan IN (?)`, [
          uniqueLANs,
        ]),
        queryDB(
          `SELECT lan FROM loan_booking_zypay_customer WHERE lan IN (?)`,
          [uniqueLANs],
        ),
        queryDB(`SELECT lan FROM loan_booking_clayyo WHERE lan IN (?)`, [
          uniqueLANs,
        ]),
        queryDB(`SELECT lan FROM loan_booking_loan_digit WHERE lan IN (?)`, [
          uniqueLANs,
        ]),
        queryDB(`SELECT lan FROM loan_booking_hey_ev_battery WHERE lan IN (?)`, [uniqueLANs]),
      ]);

      validLANs = new Set(results.flat().map((r) => r.lan));
    }

    /**
     * Process each row
     */
    for (const row of sheetData) {
      const rowNumber = row.__row || 1;

      const lan = row["LAN"];
      const utr = row["UTR"];

      const bank_date =
        typeof row["Bank Date"] === "string"
          ? row["Bank Date"]
          : excelSerialDateToJS(row["Bank Date"]);

      const payment_date =
        typeof row["Payment Date"] === "string"
          ? row["Payment Date"]
          : excelSerialDateToJS(row["Payment Date"]);
          
      const payment_id = row["Payment Id"];
      const payment_mode = row["Payment Mode"];
      const transfer_amount = row["Transfer Amount"];

      /**
       * Validation
       */
      if (
        !lan ||
        !utr ||
        !payment_date ||
        !payment_id ||
        !payment_mode ||
        !transfer_amount
      ) {
        rowErrors.push({
          row: rowNumber,
          lan,
          utr,
          bank_date,
          payment_date,
          payment_id,
          payment_mode,
          transfer_amount,
          stage: "validation",
          reason: "Missing required fields",
        });

        continue;
      }

      /**
       * LAN existence check
       */
      if (!validLANs.has(lan)) {
        if (!missingLANs.includes(lan)) {
          missingLANs.push(lan);
        }

        rowErrors.push({
          row: rowNumber,
          lan,
          utr,
          stage: "validation",
          reason: "LAN not found",
        });

        continue;
      }

      /**
       * Select upload table
       */
      let table = "repayments_upload";

      if (lan.startsWith("ADK")) {
        table = "repayments_upload_adikosh";
      }

      /**
       * Duplicate UTR check
       */
      const [dup] = await queryDB(
        `SELECT COUNT(*) AS cnt FROM ${table} WHERE utr = ?`,
        [utr],
      );

      if (dup.cnt > 0) {
        if (!duplicateUTRs.includes(utr)) {
          duplicateUTRs.push(utr);
        }

        rowErrors.push({
          row: rowNumber,
          lan,
          utr,
          stage: "pre-insert",
          reason: "Duplicate UTR",
        });

        continue;
      }

      /**
       * Penal charge SP
       */
      // await queryDB(`CALL sp_generate_penal_charge(?)`, [lan]);

      /**
       * Insert repayment
       */
      await queryDB(
        `INSERT INTO ${table}
        (lan, bank_date, utr, payment_date, payment_id, payment_mode, transfer_amount)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          lan,
          bank_date,
          utr,
          payment_date,
          payment_id,
          payment_mode,
          transfer_amount,
        ],
      );

      /**
       * Allocation
       */
      await allocateRepaymentByLAN(lan, {
        lan,
        bank_date,
        utr,
        payment_date,
        payment_id,
        payment_mode,
        transfer_amount,
      });

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

/**
 * EXCEL UPLOAD ROUTE
 */
router.post("/upload", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      message: "No file uploaded",
    });
  }

  try {
    const workbook = xlsx.read(req.file.buffer, {
      type: "buffer",
    });

    const sheet = xlsx.utils.sheet_to_json(
      workbook.Sheets[workbook.SheetNames[0]],
    );

    const sheetData = sheet.map((row, i) => ({
      ...row,
      __row: i + 2,
    }));

    return await processRows(sheetData, res);
  } catch (err) {
    console.error("Excel upload error:", err);

    return res.status(500).json({
      message: "Upload failed",
      error: err.message,
    });
  }
});

/**
 * JSON API UPLOAD ROUTE
 */
router.post("/upload-json", async (req, res) => {
  let rows = req.body?.rows || req.body;

  if (!Array.isArray(rows)) {
    rows = [rows];
  }

  if (!rows.length) {
    return res.status(400).json({
      message: "Invalid or empty data",
    });
  }

  try {
    const sheetData = rows.map((row, i) => {
      const paymentDate =
        parseApiDate(row.payment_date) || parseApiDate(row["Payment Date"]);

      const bankDate =
        parseApiDate(row.bank_date) ||
        parseApiDate(row["Bank Date"]) ||
        paymentDate;

      return {
        LAN: row["LAN"] || row.lan,
        UTR: row["UTR"] || row.utr,
        "Payment Date": paymentDate,
        "Bank Date": bankDate,
        "Payment Id": row["Payment Id"] || row.payment_id,
        "Payment Mode": row["Payment Mode"] || row.payment_mode,
        "Transfer Amount": row["Transfer Amount"] || row.transfer_amount,
        __row: i + 1,
      };
    });

    return await processRows(sheetData, res);
  } catch (err) {
    console.error("JSON upload error:", err);

    return res.status(500).json({
      message: "Upload failed",
      error: err.message,
    });
  }
});




// retention release route 
router.post("/update-retention-release", (req, res) => {
  const { lan, utr, payment_date } = req.body;
  const created_by = req.user?.id || "system";

  if (!lan || !utr || !payment_date) {
    return res.status(400).json({
      success: false,
      message: "LAN, UTR and payment_date required",
    });
  }

  let table = "";
  let product_type = "";

  if (lan.startsWith("GQF")) {
    table = "loan_booking_gq_fsf";
    product_type = "GQ_FSF";
  } else if (lan.startsWith("GQN")) {
    table = "loan_booking_gq_non_fsf";
    product_type = "GQ_NON_FSF";
  } else {
    return res.status(400).json({
      success: false,
      message: "Invalid LAN prefix",
    });
  }

  // STEP 1: Check if retention already released
  const checkRetentionQuery = `
    SELECT lan 
    FROM retention_release_gq 
    WHERE lan = ?
  `;

  db.query(checkRetentionQuery, [lan], (err, retentionResult) => {
    if (err) {
      return res.status(500).json({
        success: false,
        message: "Database error",
      });
    }

    if (retentionResult.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Retention already released for this LAN",
      });
    }

    // STEP 2: Check duplicate UTR
    const checkUtrQuery = `
      SELECT utr 
      FROM retention_release_gq 
      WHERE utr = ?
    `;

    db.query(checkUtrQuery, [utr], (err, utrResult) => {
      if (err) {
        return res.status(500).json({
          success: false,
          message: "Database error",
        });
      }

      if (utrResult.length > 0) {
        return res.status(400).json({
          success: false,
          message: "This UTR already exists",
        });
      }

      // STEP 3: Check LAN exists in booking table
      const checkLanQuery = `
        SELECT lan 
        FROM ??
        WHERE lan = ?
      `;

      db.query(checkLanQuery, [table, lan], (err, lanResult) => {
        if (err) {
          return res.status(500).json({
            success: false,
            message: "Database error",
          });
        }

        if (!lanResult.length) {
          return res.status(404).json({
            success: false,
            message: "LAN not found",
          });
        }

        // STEP 4: Insert retention record
        const insertQuery = `
          INSERT INTO retention_release_gq
          (lan, utr, payment_date, retention_release, product_type, created_by)
          VALUES (?, ?, ?, ?, ?, ?)
        `;

        db.query(
          insertQuery,
          [lan, utr, payment_date, true, product_type, created_by],
          (insertErr) => {
            if (insertErr) {
              return res.status(500).json({
                success: false,
                message: "Failed to insert retention record",
              });
            }

            // STEP 5: Update booking table flag
            const updateQuery = `
              UPDATE ??
              SET retention_release = 1
              WHERE lan = ?
            `;

            db.query(updateQuery, [table, lan], (updateErr) => {
              if (updateErr) {
                return res.status(500).json({
                  success: false,
                  message: "Failed to update booking table",
                });
              }

              return res.json({
                success: true,
                message: "Retention released successfully",
              });
            });
          }
        );
      });
    });
  });
});

module.exports = router;
