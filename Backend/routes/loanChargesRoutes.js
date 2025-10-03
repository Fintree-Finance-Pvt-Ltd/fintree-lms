const express = require("express");
const multer = require("multer");
const xlsx = require("xlsx");
const db = require("../config/db");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

const excelSerialDateToJS = (value) => {
  if (!value) return null;

  if (!isNaN(value)) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30)); // Excel base date (UTC)

    let correctDate = new Date(excelEpoch.getTime() + value * 86400000);

    return correctDate.toISOString().split("T")[0]; // Return YYYY-MM-DD (no time manipulation)
  }

  // ✅ Case 2: Handle Text Date (e.g., "10-Mar-24")

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

    return new Date(Date.UTC(parseInt(day, 10), month, year))

      .toISOString()

      .split("T")[0];
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

//////////// 20 % amount charges ////////////////
// ✅ Upload GQ Non-FSF / FSF 20% Amount Excel API
router.post("/upload-20percent", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: "No file uploaded" });

  try {
    const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheetData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

    for (const row of sheetData) {
      const product = row["Product"];
      const lan = row["LAN"];
      const appId = row["App id"];
      const amount = row["20% Amount"];
      const utr = row["UTR"];
      const paymentDate = row["Payment date"] ? excelSerialDateToJS(row["Payment date"]) : null;

      // Decide which table & booking table to check
      let targetTable = "";
      let bookingTable = "";

      if (product === "GQNonFSF") {
        targetTable = "GQNonFSF_20PercentAmount";
        bookingTable = "loan_booking_gq_non_fsf";
      } else if (product === "GQFSF") {
        targetTable = "GQFSF_20PercentAmount";
        bookingTable = "loan_booking_gq_fsf";
      } else {
        console.log(`Skipping unknown product: ${product}`);
        continue; // Skip row if product does not match
      }

      // ✅ Step 1: Check if LAN & App_id exist in respective booking table
      const checkBookingQuery = `SELECT id FROM ${bookingTable} WHERE lan = ? AND app_id = ? LIMIT 1`;

      db.query(checkBookingQuery, [lan, appId], (err, bookingResults) => {
        if (err) {
          console.error("Booking Table Check Error:", err);
          return;
        }

        if (bookingResults.length === 0) {
          console.log(`No matching record found in ${bookingTable} for LAN: ${lan}, App_id: ${appId}`);
          return; // Skip insert
        }

        // ✅ Step 2: Check if already inserted in target table
        const checkTargetQuery = `SELECT id FROM ${targetTable} WHERE lan = ? AND app_id = ? LIMIT 1`;

        db.query(checkTargetQuery, [lan, appId], (err2, targetResults) => {
          if (err2) {
            console.error("Target Table Check Error:", err2);
            return;
          }

          if (targetResults.length === 0) {
            // ✅ Step 3: Insert into target table
            const insertQuery = `
              INSERT INTO ${targetTable} 
              (product, lan, app_id, amount_20percent, utr, payment_date)
              VALUES (?, ?, ?, ?, ?, ?)
            `;

            db.query(insertQuery, [product, lan, appId, amount, utr, paymentDate], (err3) => {
              if (err3) console.error("Database Insert Error:", err3);
              else console.log(`Inserted into ${targetTable} for LAN: ${lan}, App_id: ${appId}`);
            });
          } else {
            console.log(`Skipping duplicate in ${targetTable} for LAN: ${lan}, App_id: ${appId}`);
          }
        });
      });
    }

    res.json({ message: "20% Amount data uploaded successfully (with booking table validation)" });

  } catch (error) {
    console.error("Error processing file:", error);
    res.status(500).json({ message: "Error processing file" });
  }
});


module.exports = router;
