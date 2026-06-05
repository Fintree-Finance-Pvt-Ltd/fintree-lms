const express = require("express");
const router = express.Router();
const multer = require("multer");
const xlsx = require("xlsx");
const db = require("../config/db");
const util = require("util");

const upload = multer({ storage: multer.memoryStorage() }); // ✅ unified storage
const query = util.promisify(db.query).bind(db);

// ✅ Convert Excel Serial Date or string date to YYYY-MM-DD
const excelDateToJSDate = (value) => {
  if (!value) return null;

  // Case 1: Excel serial number
  if (typeof value === "number" && !isNaN(value)) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const correctDate = new Date(excelEpoch.getTime() + value * 86400000);
    return isNaN(correctDate.getTime()) ? null : correctDate.toISOString().split("T")[0];
  }

  // Case 2: Text format "DD-MMM-YY"
  if (typeof value === "string" && value.match(/^\d{2}-[A-Za-z]{3}-\d{2}$/)) {
    const [day, monthAbbr, yearShort] = value.split("-");
    const monthNames = {
      Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
      Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
    };
    const month = monthNames[monthAbbr];
    if (month === undefined) return null;
    const year = parseInt("20" + yearShort, 10);
    const date = new Date(Date.UTC(year, month, parseInt(day)));
    return isNaN(date.getTime()) ? null : date.toISOString().split("T")[0];
  }

  // Case 3: "DD-MM-YYYY"
  if (typeof value === "string" && value.match(/^\d{2}-\d{2}-\d{4}$/)) {
    const [day, month, year] = value.split("-");
    const date = new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day)));
    return isNaN(date.getTime()) ? null : date.toISOString().split("T")[0];
  }

  return null;
};

//////////////////// Foreclosure Upload ////////////////////
router.post("/upload", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: "No file uploaded" });

  try {
    const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      return res.status(400).json({ message: "Invalid Excel file" });
    }

    const sheet = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: null });
    if (!sheet.length) return res.status(400).json({ message: "Excel file is empty" });

    for (const [i, row] of sheet.entries()) {
      const lan = row["LAN"]?.toString().trim();
      const bankDate = excelDateToJSDate(row["Bank Date"]);
      const paymentDate = excelDateToJSDate(row["Payment Date"]);
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
      await query(
        `INSERT INTO foreclosure_upload (
          lan, bank_date, utr, payment_date, payment_id,
          payment_mode, transfer_amount, foreclosure, charge_type,
          max_waiver_amount, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [lan, bankDate, utr, paymentDate, paymentId, paymentMode, transferAmount, foreclosure, chargeType, maxWaiver]
      );

      // ✅ Insert into repayments_upload
      await query(
        `INSERT INTO repayments_upload (
          lan, bank_date, utr, payment_date, payment_id,
          payment_mode, transfer_amount, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
        [lan, bankDate, utr, paymentDate, paymentId, paymentMode, transferAmount]
      );

      // ✅ Call stored procedures if foreclosure is Yes
      if (foreclosure?.toLowerCase() === "yes") {
        await query("CALL sp_calculate_forecloser_collection(?)", [lan]);
        await query("CALL sp_process_forecloser_charges(?, ?, ?, ?, ?, ?, ?)", [
          lan, paymentId, utr, paymentMode, transferAmount, paymentDate, bankDate
        ]);
      }
    }

    res.json({ message: "✅ Foreclosure upload processed successfully" });

  } catch (error) {
    console.error("❌ Foreclosure upload failed:", error);
    res.status(500).json({ message: "Error processing foreclosure Excel file." });
  }
});

//////////////////// 20% Amount Upload ////////////////////
router.post("/upload-20percent", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: "No file uploaded" });

  try {
    const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      return res.status(400).json({ message: "Invalid Excel file" });
    }

    const rawSheetData = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: null });

    // ✅ Normalize headers
    const sheetData = rawSheetData.map((row) => {
      const cleanRow = {};
      for (let key in row) {
        const newKey = key.trim().toLowerCase().replace(/%/g, "percent").replace(/\s+/g, "_");
        cleanRow[newKey] = row[key];
      }
      return cleanRow;
    });

    for (const [index, row] of sheetData.entries()) {
      const product = row["product"];
      const lan = row["lan"];
      const appId = row["app_id"];
      const amount = row["20percent_amount"];
      const utr = row["utr"];
      const rawPaymentDate = row["payment_date"];
      const paymentDate = rawPaymentDate ? excelDateToJSDate(rawPaymentDate) : null;

      console.log(`DEBUG ROW ${index + 1}:`, { product, lan, appId, amount, utr, rawPaymentDate, paymentDate });

      if (!product || !lan || appId == null || amount == null || !utr) {
        console.warn(`⚠️ Row ${index + 1} skipped due to missing required fields`);
        continue;
      }

      let targetTable = "";
      let bookingTable = "";
      if (product === "GQNonFSF") {
        targetTable = "GQNonFSF_20PercentAmount";
        bookingTable = "loan_booking_gq_non_fsf";
      } else if (product === "GQFSF") {
        targetTable = "GQFSF_20PercentAmount";
        bookingTable = "loan_booking_gq_fsf";
      } else {
        console.warn(`⚠️ Row ${index + 1}: Unknown product skipped: ${product}`);
        continue;
      }

      // Booking check
      const booking = await query(`SELECT 1 FROM ${bookingTable} WHERE lan = ? AND app_id = ? LIMIT 1`, [lan, appId]);
      if (booking.length === 0) {
        console.warn(`⚠️ Row ${index + 1}: Not found in ${bookingTable} → LAN=${lan}, App_id=${appId}`);
        continue;
      }

      // Duplicate check
      const exists = await query(`SELECT 1 FROM ${targetTable} WHERE lan = ? AND app_id = ? LIMIT 1`, [lan, appId]);
      if (exists.length > 0) {
        console.log(`⏩ Row ${index + 1}: Duplicate skipped → LAN=${lan}, App_id=${appId}`);
        continue;
      }

      // Insert
      await query(
        `INSERT INTO ${targetTable}
         (product, lan, app_id, amount_20percent, utr, payment_date)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [product, lan, appId, amount, utr, paymentDate]
      );
      console.log(`✅ Row ${index + 1}: Inserted into ${targetTable}`);
    }

    res.json({ message: "✅ 20% Amount data uploaded successfully" });
  } catch (error) {
    console.error("❌ 20% upload failed:", error);
    res.status(500).json({ message: "Error processing 20% Excel file." });
  }
});

module.exports = router;
