const express = require("express");
const multer = require("multer");
const xlsx = require("xlsx");
const db = require("../config/db");
const { allocateRepaymentByLAN } = require("../utils/allocate");
const { excelSerialDateToJS, queryDB } = require("../utils/helpers");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });
// // ✅ Excel serial date to JS date (YYYY-MM-DD)
// const excelSerialDateToJS = (value) => {
//   if (!value) return null;

//   if (!isNaN(value)) {
//     const excelEpoch = new Date(Date.UTC(1899, 11, 30));
//     return new Date(excelEpoch.getTime() + value * 86400000)
//       .toISOString()
//       .split("T")[0];
//   }

//   if (typeof value === "string" && value.match(/^\d{2}-[A-Za-z]{3}-\d{2}$/)) {
//     const [day, monthAbbr, yearShort] = value.split("-");
//     const monthNames = {
//       Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
//       Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
//     };
//     const month = monthNames[monthAbbr];
//     const year = parseInt("20" + yearShort, 10);
//     return new Date(Date.UTC(parseInt(day), month, year))
//       .toISOString()
//       .split("T")[0];
//   }

//   return null;
// };


router.post("/upload", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: "No file uploaded" });

  const successRows = [];
  const failedRows = [];
  const missingLANs = [];
  const duplicateUTRs = [];

  try {
    const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
    const sheet = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
    const sheetData = sheet.map((row, i) => ({ ...row, __row: i + 2 }));

    if (sheetData.length === 0) {
      return res.status(400).json({ message: "Empty or invalid file" });
    }

    const uniqueLANs = [...new Set(sheetData.map(r => r["LAN"]).filter(Boolean))];
    const lanResults = await Promise.all([
      queryDB(`SELECT lan FROM loan_booking_gq_non_fsf WHERE lan IN (?)`, [uniqueLANs]),
      queryDB(`SELECT lan FROM loan_booking_gq_fsf WHERE lan IN (?)`, [uniqueLANs]),
      queryDB(`SELECT lan FROM loan_booking_adikosh WHERE lan IN (?)`, [uniqueLANs]),
      queryDB(`SELECT lan FROM loan_bookings WHERE lan IN (?)`, [uniqueLANs]),
      queryDB(`SELECT lan FROM loan_bookings_wctl WHERE lan IN (?)`, [uniqueLANs]),
    ]);
    const validLANs = new Set(lanResults.flat().map(r => r.lan));

    for (const row of sheetData) {
      const rowNumber = row.__row;
      const lan = row["LAN"];
      const utr = row["UTR"];
      const bank_date = excelSerialDateToJS(row["Bank Date"]);
      const payment_date = excelSerialDateToJS(row["Payment Date"]);
      const payment_id = row["Payment Id"];
      const payment_mode = row["Payment Mode"];
      const transfer_amount = row["Transfer Amount"];

      if (!lan || !utr || !payment_date || !payment_id || !transfer_amount) {
        console.warn(`⚠️ Row ${rowNumber}: Missing required fields`, row);
        failedRows.push({ row: rowNumber, reason: "Missing required fields" });
        throw new Error(`❌ Fatal: Required data missing in row ${rowNumber} — upload stopped.`);
      }

      if (!validLANs.has(lan)) {
        console.warn(`❌ Row ${rowNumber}: Invalid LAN (${lan})`);
        missingLANs.push(lan);
        failedRows.push({ row: rowNumber, reason: "LAN not found" });
        throw new Error(`❌ Fatal: Invalid LAN in row ${rowNumber} — upload stopped.`);
      }

      const table = lan.startsWith("ADK") ? "repayments_upload_adikosh" : "repayments_upload";
      const [utrCheck] = await queryDB(`SELECT COUNT(*) AS count FROM ${table} WHERE utr = ?`, [utr]);

      if (utrCheck.count > 0) {
        console.error(`❌ Row ${rowNumber}: Duplicate UTR (${utr})`);
        duplicateUTRs.push(utr);
        failedRows.push({ row: rowNumber, reason: "Duplicate UTR" });
        throw new Error(`❌ Fatal: Duplicate UTR in row ${rowNumber} — upload stopped.`);
      }

      // ✅ 1️⃣ Call Penal Charge SP
      await queryDB(`CALL sp_generate_penal_charge(?)`, [lan]);
      // ✅ 2️⃣ Insert repayment
      await queryDB(
        `INSERT INTO ${table} (lan, bank_date, utr, payment_date, payment_id, payment_mode, transfer_amount)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [lan, bank_date, utr, payment_date, payment_id, payment_mode, transfer_amount]
      );

      await allocateRepaymentByLAN(lan, {
        lan, bank_date, utr, payment_date, payment_id, payment_mode, transfer_amount
      });

      successRows.push(rowNumber);
    }

     console.log(`✅ Repayment Uploaded Successfully: ${successRows.length} rows processed`);


    res.json({
      message: "✅ Upload successful",
      total_rows: sheetData.length,
      inserted_rows: successRows.length,
      failed_rows: failedRows.length,
      success_rows: successRows,
      failed_details: failedRows,
      missing_lans: missingLANs,
      duplicate_utrs: duplicateUTRs,
      
    });
    
  } catch (err) {
    console.error("❌ Upload stopped:", err.message);
    res.status(500).json({
      message: "❌ Upload stopped due to error",
      inserted_rows: successRows.length,
      failed_rows: failedRows.length,
      success_rows: successRows,
      failed_details: failedRows,
      missing_lans: missingLANs,
      duplicate_utrs: duplicateUTRs,
      error: err.message,
    });
  }
  
});

module.exports = router;
