const express = require("express");
const multer = require("multer");
const xlsx = require("xlsx");
const db = require("../config/db");
const { allocateRepaymentByLAN } = require("../utils/allocate");
const { excelSerialDateToJS, queryDB } = require("../utils/helpers");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

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

    console.log(`📥 Total Rows in Excel: ${sheetData.length}`);
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
      console.log(`🔄 Row ${rowNumber}: Generating Penal Charge before insert...`);
      await queryDB(`CALL sp_generate_penal_charge(?,?)`, [lan,payment_date]);
      console.log(`✅ Row ${rowNumber}: Penal Charge SP done.`);

      // ✅ 2️⃣ Insert repayment
      await queryDB(
        `INSERT INTO ${table} (lan, bank_date, utr, payment_date, payment_id, payment_mode, transfer_amount)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [lan, bank_date, utr, payment_date, payment_id, payment_mode, transfer_amount]
      );
      console.log(`✅ Row ${rowNumber}: Inserted into ${table}`);

      await allocateRepaymentByLAN(lan, {
        lan, bank_date, utr, payment_date, payment_id, payment_mode, transfer_amount
      });

      console.log(`✅ Row ${rowNumber}: Allocation done`);
      successRows.push(rowNumber);
    }

    console.log(`📊 Summary: Inserted ${successRows.length} | Failed ${failedRows.length}`);

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
