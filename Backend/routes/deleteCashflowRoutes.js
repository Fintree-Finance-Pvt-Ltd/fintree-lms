const express = require("express");
const multer = require("multer");
const xlsx = require("xlsx");
const db = require("../config/db");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// ✅ Convert Excel Date or "10-Mar-24" to YYYY-MM-DD
const excelDateToJSDate = (value) => {
  if (!value) return null;

  if (!isNaN(value)) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const correctDate = new Date(excelEpoch.getTime() + value * 86400000);
    return correctDate.toISOString().split("T")[0];
  }

  if (typeof value === "string" && /^\d{2}-[A-Za-z]{3}-\d{2}$/.test(value)) {
    const [day, monthAbbr, yearShort] = value.split("-");
    const month = {
      Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
      Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11
    }[monthAbbr];

    if (month === undefined) return null;
    const year = parseInt("20" + yearShort, 10);

    return new Date(Date.UTC(parseInt(day, 10), month, year))
      .toISOString().split("T")[0];
  }

  return null;
};

const normalizePaymentId = (id) => id ? id.trim().toLowerCase() : "";

const queryDB = async (sql, params) => {
  try {
    const [rows] = await db.promise().query(sql, params);
    return Array.isArray(rows) ? rows : [];
  } catch (err) {
    console.error("❌ DB Query Error:", err);
    return [];
  }
};

// ✅ Upload Delete Cashflow
router.post("/upload-delete-cashflow", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: "No file uploaded" });

  try {
    const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
    const sheetData = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);

    if (!sheetData.length) {
      return res.status(400).json({ message: "Excel file is empty or invalid" });
    }

    for (const row of sheetData) {
      const lan = row["LAN"];
      const paymentDate = excelDateToJSDate(row["Payment Date"]);
      const paymentId = normalizePaymentId(row["Payment Id"]);
      const transferAmount = parseFloat(row["Transfer Amount"]) || 0;
      const reasonForDeletion = row["Reason for Deletion"];

      if (!lan || !paymentId || !transferAmount) {
        console.warn(`⚠️ Missing critical values in row:`, row);
        continue;
      }

      console.log(`🔍 Searching for LAN ${lan}, PID: ${paymentId}, Amt: ₹${transferAmount}`);

      const existingRecords = await queryDB(
        `SELECT id, lan, LOWER(TRIM(payment_id)) AS payment_id, DATE(payment_date) AS payment_date, ROUND(transfer_amount, 2) AS transfer_amount
         FROM repayments_upload WHERE lan = ? ORDER BY payment_date DESC`,
        [lan]
      );

      const matched = existingRecords.find(r =>
        r.payment_id === paymentId &&
        Math.abs(r.transfer_amount - transferAmount) < 0.01
        // Optional: match date too
        // && r.payment_date === paymentDate
      );

      if (!matched) {
        console.warn(`⚠️ No match found for: ${lan}, PID: ${paymentId}, Amt: ₹${transferAmount}`);
        continue;
      }

      // ✅ Backup before deletion
      await queryDB(
        `INSERT INTO deleted_cashflow_backup (lan, payment_id, payment_date, transfer_amount, reason, created_at)
         SELECT lan, payment_id, payment_date, transfer_amount, ?, NOW()
         FROM repayments_upload WHERE id = ?`,
        [reasonForDeletion, matched.id]
      );

      // ✅ Delete record
      await queryDB("DELETE FROM repayments_upload WHERE id = ?", [matched.id]);

      console.log(`🗑️ Deleted: ${lan}, PID: ${paymentId}`);

      // ✅ Reverse RPS
      try {
        await queryDB("CALL sp_reverse_repayment_schedule(?, ?, ?)", [
          lan, transferAmount, paymentDate
        ]);
        console.log(`✅ RPS Reversed for: ${lan}`);
      } catch (rpsErr) {
        console.error(`❌ RPS Reversal failed for ${lan}`, rpsErr);
      }
    }

    res.json({ message: "Delete Cashflow Excel processed successfully." });

  } catch (err) {
    console.error("❌ File processing failed:", err);
    res.status(500).json({ message: "Internal server error during Excel processing." });
  }
});

module.exports = router;
