const express = require("express");
const router = express.Router();
const multer = require("multer");
const xlsx = require("xlsx");
const db = require("../config/db");
const fs = require("fs");
const path = require("path");

const upload = multer({ dest: "uploads/" });

// Utility: Convert Excel serial number to JS Date (YYYY-MM-DD)
const excelSerialToJSDate = (serial) => {
  if (!serial || isNaN(serial)) return null;
  const excelEpoch = new Date(Date.UTC(1899, 11, 30));
  const date = new Date(excelEpoch.getTime() + serial * 86400000);
  return date.toISOString().split("T")[0]; // return YYYY-MM-DD
};

// ✅ Foreclosure Upload API
router.post("/upload", upload.single("excel"), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: "No file uploaded" });

  const filePath = req.file.path;

  try {
    const workbook = xlsx.readFile(filePath);
    const sheet = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);

    if (!sheet.length) {
      return res.status(400).json({ message: "Excel file is empty" });
    }

    for (const [i, row] of sheet.entries()) {
      const lan = row["LAN"]?.toString().trim();
      const bankDate = excelSerialToJSDate(row["Bank Date"]);
      const paymentDate = excelSerialToJSDate(row["Payment Date"]);
      const paymentId = row["Payment ID"] || row["Payment Id"];
      const utr = row["UTR"];
      const paymentMode = row["Payment Mode"];
      const transferAmount = parseFloat(row["Transfer Amount"]);
      const foreclosure = row["Foreclosure"]?.toString().trim();
      const chargeType = row["Charge Type"] || row["Charge_Type"];
      const maxWaiver = parseFloat(row["Maximum Waiver Amount"]) || 0;

      // ❗ Validation
      if (!lan || !paymentId || isNaN(transferAmount)) {
        console.warn(`⚠️ Row ${i + 2}: Skipped due to missing required fields`, row);
        continue;
      }

      // ✅ Insert into foreclosure_upload
      await db.promise().query(`
        INSERT INTO foreclosure_upload (
          lan, bank_date, utr, payment_date, payment_id,
          payment_mode, transfer_amount, foreclosure, charge_type,
          max_waiver_amount, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
      `, [lan, bankDate, utr, paymentDate, paymentId, paymentMode, transferAmount, foreclosure, chargeType, maxWaiver]);

      // ✅ Insert into repayments_upload
      await db.promise().query(`
        INSERT INTO repayments_upload (
          lan, bank_date, utr, payment_date, payment_id,
          payment_mode, transfer_amount, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
      `, [lan, bankDate, utr, paymentDate, paymentId, paymentMode, transferAmount]);

      // ✅ Call stored procedures if foreclosure is Yes
      if (foreclosure?.toLowerCase() === "yes") {
       // await db.promise().query("CALL sp_calculate_forecloser_collection(?)", [lan]);
        await db.promise().query("CALL sp_process_forecloser_charges(?, ?, ?, ?, ?, ?, ?)", [
          lan, paymentId, utr, paymentMode, transferAmount, paymentDate, bankDate
        ]);
      }
    }

    fs.unlinkSync(filePath); // cleanup
    res.json({ message: "✅ Upload and processing completed." });

  } catch (error) {
    console.error("❌ Upload processing failed:", error);
    res.status(500).json({ message: "Error processing foreclosure Excel file." });
  } finally {
    // fallback cleanup in case error occurred before cleanup
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
});

module.exports = router;
