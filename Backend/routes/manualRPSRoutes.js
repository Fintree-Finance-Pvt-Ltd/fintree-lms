
const express = require("express");
const multer = require("multer");
const xlsx = require("xlsx");
const db = require("../config/db");

const router = express.Router();

// ✅ Configure Multer for File Uploads
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// ✅ Convert Excel Serial/Text Date to MySQL Format
const excelSerialToDate = (value) => {
    if (!value) return null;

    // Case 1: Excel serial number
    if (!isNaN(value)) {
        const excelEpoch = new Date(Date.UTC(1899, 11, 30));
        const correctDate = new Date(excelEpoch.getTime() + value * 86400000);
        return correctDate.toISOString().split("T")[0];
    }

    // Case 2: "10-Mar-24"
    if (typeof value === "string" && value.match(/^\d{2}-[A-Za-z]{3}-\d{2}$/)) {
        const [day, monthAbbr, yearShort] = value.split("-");
        const monthNames = {
            Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
            Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
        };
        const month = monthNames[monthAbbr];
        if (month === undefined) return null;
        const year = parseInt("20" + yearShort, 10);
        return new Date(Date.UTC(year, month, parseInt(day)))
            .toISOString()
            .split("T")[0];
    }

    // Case 3: "DD-MM-YYYY"
    if (typeof value === "string" && value.match(/^\d{2}-\d{2}-\d{4}$/)) {
        const [day, month, year] = value.split("-");
        return new Date(`${year}-${month}-${day}`).toISOString().split("T")[0];
    }

    return null;
};

// ✅ Check if LAN Exists in `loan_bookings`
const getValidLAN = (lan) => {
    const tablename = lan.startsWith("WCTL") ? "loan_bookings_wctl" : "loan_bookings";
    return new Promise((resolve, reject) => {
        db.query(`SELECT lan FROM ${tablename} WHERE lan = ?`, [lan], (err, results) => {
            if (err) return reject(err);
            resolve(results.length > 0 ? results[0].lan : null);
        });
    });
};

// ✅ Check if RPS already exists for LAN & Due Date
const checkExistingRPS = (lan, due_date) => {
    return new Promise((resolve, reject) => {
        db.query("SELECT lan FROM manual_rps_ev_loan WHERE lan = ? AND due_date = ?", [lan, due_date], (err, results) => {
            if (err) return reject(err);
            resolve(results.length > 0);
        });
    });
};
router.post("/upload", upload.single("file"), async (req, res) => {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    try {
        const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
        const sheetName = workbook.SheetNames[0];
        const sheetData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

        if (sheetData.length === 0) {
            return res.status(400).json({ message: "No data found in the uploaded file" });
        }

        let dataToInsertWCTL = [];
        let dataToInsertEV = [];
        let skippedEntries = [];

        for (const row of sheetData) {
            const lan = row["LAN"];
            const due_date = excelSerialToDate(row["Due Date"]);

            if (!lan || !due_date) {
                skippedEntries.push({ lan, due_date, reason: "Missing LAN or due date" });
                continue;
            }

            const validLAN = await getValidLAN(lan);
            if (!validLAN) {
                skippedEntries.push({ lan, due_date, reason: "LAN not found in loan_bookings" });
                continue;
            }

            const exists = await checkExistingRPS(validLAN, due_date);
            if (exists) {
                skippedEntries.push({ lan, due_date, reason: "Duplicate RPS entry" });
                continue;
            }

            const dataRow = [
                validLAN,
                due_date,
                row["Status"] || null,
                row["EMI"] || null,
                row["Interest"] || null,
                row["Principal"] || null,
                row["Opening"] ? parseFloat(row["Opening"]) : null,
                row["Closing"] ? parseFloat(row["Closing"]) : null,
                row["Remaining EMI"] || null,
                row["Remaining Interest"] || null,
                row["Remaining Principal"] || null
            ];

            // ➡️ Choose table based on LAN prefix
            if (validLAN.startsWith("WCTL")) {
                dataToInsertWCTL.push(dataRow);
            } else {
                dataToInsertEV.push(dataRow);
            }
        }

        // ➡️ Insert into WCTL table
        if (dataToInsertWCTL.length > 0) {
            const insertQueryWCTL = `
                INSERT INTO manual_rps_wctl
                (lan, due_date, status, emi, interest, principal, opening, closing, remaining_emi, remaining_interest, remaining_principal) 
                VALUES ?`;
            await new Promise((resolve, reject) => {
                db.query(insertQueryWCTL, [dataToInsertWCTL], (err, result) => {
                    if (err) return reject(err);
                    resolve(result);
                });
            });
        }

        // ➡️ Insert into EV Loan table
        if (dataToInsertEV.length > 0) {
            const insertQueryEV = `
                INSERT INTO manual_rps_ev_loan
                (lan, due_date, status, emi, interest, principal, opening, closing, remaining_emi, remaining_interest, remaining_principal) 
                VALUES ?`;
            await new Promise((resolve, reject) => {
                db.query(insertQueryEV, [dataToInsertEV], (err, result) => {
                    if (err) return reject(err);
                    resolve(result);
                });
            });
        }

        const totalInserted = dataToInsertWCTL.length + dataToInsertEV.length;

        // ✅ Return response
        if (skippedEntries.length > 0) {
            return res.status(207).json({
                message: `Upload partially completed. ${totalInserted} rows inserted, ${skippedEntries.length} skipped.`,
                skipped: skippedEntries
            });
        } else {
            return res.json({ message: "All rows uploaded successfully." });
        }

    } catch (error) {
        console.error("Error processing RPS file:", error);
        return res.status(500).json({ message: "Error processing file." });
    }
});



module.exports = router;

