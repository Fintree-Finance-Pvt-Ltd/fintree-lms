const express = require("express");
const multer = require("multer");
const xlsx = require("xlsx");
const db = require("../config/db");

const router = express.Router();
const util = require("util");

const upload = multer({ storage: multer.memoryStorage() });
const query = util.promisify(db.query).bind(db); // ✅ Promisify MySQL queries


// ✅ Convert Excel Serial Date or string date to YYYY-MM-DD
const excelDateToJSDate = (value) => {
  if (!value) return null;

  // Case 1: Excel serial number (e.g., 44645)
  if (!isNaN(value)) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30)); // Excel base date
    const correctDate = new Date(excelEpoch.getTime() + value * 86400000);
    return correctDate.toISOString().split("T")[0]; // YYYY-MM-DD
  }

  // Case 2: Text format "DD-MMM-YY" like "10-Mar-24"
  if (typeof value === "string" && value.match(/^\d{2}-[A-Za-z]{3}-\d{2}$/)) {
    const [day, monthAbbr, yearShort] = value.split("-");
    const monthNames = {
      Jan: 0,
      Feb: 1,
      Mar: 2,
      Apr: 3,
      May: 4,
      Jun: 5,
      Jul: 6,
      Aug: 7,
      Sep: 8,
      Oct: 9,
      Nov: 10,
      Dec: 11,
    };
    const month = monthNames[monthAbbr];
    if (month === undefined) return null;
    const year = parseInt("20" + yearShort, 10);
    return new Date(Date.UTC(parseInt(year), month, parseInt(day)))
      .toISOString()
      .split("T")[0];
  }

  // ✅ Case 3: "DD-MM-YYYY" (your format)
  if (typeof value === "string" && value.match(/^\d{2}-\d{2}-\d{4}$/)) {
    const [day, month, year] = value.split("-");
    return new Date(`${year}-${month}-${day}`).toISOString().split("T")[0];
  }

  return null;
};




// ✅ Upload Charges Excel API
router.post("/upload", upload.single("file"), async (req, res) => {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    try {
        // ✅ Read Excel File
        const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
        const sheetName = workbook.SheetNames[0];
        const sheetData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

        // ✅ Insert Data into MySQL
        for (const row of sheetData) {
            const query = `
                INSERT INTO loan_charges (lan, due_date, amount, charge_type, created_at) 
                VALUES (?, ?, ?, ?, NOW())`; 

            db.query(query, [
                row["LAN"],
                row["Due Date"] ? excelSerialDateToJS(row["Due Date"]) : null, // ✅ Convert Excel Date
                row["Amount"],
                row["Charge Type"]
            ], (err) => {
                if (err) console.error("Database Insert Error:", err);
            });
        }

        res.json({ message: "Charges uploaded successfully" });

    } catch (error) {
        console.error("Error processing file:", error);
        res.status(500).json({ message: "Error processing file" });
    }
});

// ✅ API to Get Extra Charges for a Specific LAN
router.get("/:lan", async (req, res) => {
    const { lan } = req.params;

    try {
        const query = `
            SELECT 
                IFNULL(due_date, 'N/A') AS due_date,  -- ✅ Fix column name
                amount, 
                IFNULL(paid_amount, 0) AS paid_amount, 
                IFNULL(waived_off, 0) AS waived_off, 
                charge_type, 
                paid_status, 
                IFNULL(payment_time, 'N/A') AS payment_time, 
                created_at
            FROM loan_charges 
            WHERE lan = ? and charge_type != 'Excess Payment'
            ORDER BY created_at ASC
        `;

        db.query(query, [lan], (err, results) => {
            if (err) {
                console.error("Error fetching extra charges:", err);
                return res.status(500).json({ error: "Database error" });
            }
            res.json(results);
        });
    } catch (error) {
        res.status(500).json({ error: "Server error" });
    }
});


////// 20% Amount Upload API //////

router.post("/upload-20percent", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: "No file uploaded" });

  try {
    const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const rawSheetData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null });

    // ✅ Normalize keys (trim, lowercase, replace % and spaces with _)
    const sheetData = rawSheetData.map(row => {
      const cleanRow = {};
      for (let key in row) {
        const newKey = key.trim().toLowerCase().replace(/%/g, "percent").replace(/\s+/g, "_");
        cleanRow[newKey] = row[key];
      }
      return cleanRow;
    });

    for (const row of sheetData) {
      const product = row["product"];
      const lan = row["lan"];
      const appId = row["app_id"];
      const amount = row["20percent_amount"] ?? row["20_percent_amount"]; // handle both cases
      const utr = row["utr"];
      const rawPaymentDate = row["payment_date"];
      const paymentDate = rawPaymentDate ? excelDateToJSDate(rawPaymentDate) : null;

      console.log("DEBUG:", row);

      // ✅ Check required fields safely (not falsy check)
      if (!product || !lan || appId == null || amount == null || !utr) {
        console.warn("⚠️ Row skipped due to missing required fields:", row);
        continue;
      }

      // Decide which table & booking table
      let targetTable = "";
      let bookingTable = "";
      if (product === "GQNonFSF") {
        targetTable = "GQNonFSF_20PercentAmount";
        bookingTable = "loan_booking_gq_non_fsf";
      } else if (product === "GQFSF") {
        targetTable = "GQFSF_20PercentAmount";
        bookingTable = "loan_booking_gq_fsf";
      } else {
        console.warn(`⚠️ Unknown product skipped: ${product}`);
        continue;
      }

      // ✅ Step 1: Check booking table
      const booking = await query(
        `SELECT id FROM ${bookingTable} WHERE lan = ? AND app_id = ? LIMIT 1`,
        [lan, appId]
      );

      if (booking.length === 0) {
        console.warn(`⚠️ Not found in ${bookingTable}: LAN=${lan}, App_id=${appId}`);
        continue;
      }

      // ✅ Step 2: Check duplicate
      const exists = await query(
        `SELECT id FROM ${targetTable} WHERE lan = ? AND app_id = ? LIMIT 1`,
        [lan, appId]
      );

      if (exists.length > 0) {
        console.log(`⏩ Skipping duplicate: ${lan}, App_id=${appId}`);
        continue;
      }

      // ✅ Step 3: Insert
      await query(
        `INSERT INTO ${targetTable} 
         (product, lan, app_id, amount_20percent, utr, payment_date) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [product, lan, appId, amount, utr, paymentDate]
      );

      console.log(`✅ Inserted into ${targetTable}: LAN=${lan}, App_id=${appId}`);
    }

    res.json({ message: "20% Amount data uploaded successfully" });

  } catch (error) {
    console.error("❌ Error processing file:", error);
    res.status(500).json({ message: "Error processing file" });
  }
});


module.exports = router;
