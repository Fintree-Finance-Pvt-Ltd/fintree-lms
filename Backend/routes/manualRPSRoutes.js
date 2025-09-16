
// const express = require("express");
// const multer = require("multer");
// const xlsx = require("xlsx");
// const db = require("../config/db");

// const router = express.Router();

// // ✅ Configure Multer for File Uploads
// const storage = multer.memoryStorage();
// const upload = multer({ storage: storage });

// // ✅ Convert Excel Serial/Text Date to MySQL Format
// const excelSerialToDate = (value) => {
//     if (!value) return null;

//     // Case 1: Excel serial number
//     if (!isNaN(value)) {
//         const excelEpoch = new Date(Date.UTC(1899, 11, 30));
//         const correctDate = new Date(excelEpoch.getTime() + value * 86400000);
//         return correctDate.toISOString().split("T")[0];
//     }

//     // Case 2: "10-Mar-24"
//     if (typeof value === "string" && value.match(/^\d{2}-[A-Za-z]{3}-\d{2}$/)) {
//         const [day, monthAbbr, yearShort] = value.split("-");
//         const monthNames = {
//             Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
//             Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
//         };
//         const month = monthNames[monthAbbr];
//         if (month === undefined) return null;
//         const year = parseInt("20" + yearShort, 10);
//         return new Date(Date.UTC(year, month, parseInt(day)))
//             .toISOString()
//             .split("T")[0];
//     }

//     // Case 3: "DD-MM-YYYY"
//     if (typeof value === "string" && value.match(/^\d{2}-\d{2}-\d{4}$/)) {
//         const [day, month, year] = value.split("-");
//         return new Date(`${year}-${month}-${day}`).toISOString().split("T")[0];
//     }

//     return null;
// };

// // // ✅ Check if LAN Exists in `loan_bookings`
// // const getValidLAN = (lan) => {
// //     const tablename = lan.startsWith("WCTL") ? "loan_bookings_wctl" : "loan_bookings";
// //     return new Promise((resolve, reject) => {
// //         db.query(`SELECT lan FROM ${tablename} WHERE lan = ?`, [lan], (err, results) => {
// //             if (err) return reject(err);
// //             resolve(results.length > 0 ? results[0].lan : null);
// //         });
// //     });
// // };

// // // ✅ Check if RPS already exists for LAN & Due Date
// // const checkExistingRPS = (lan, due_date) => {
// //     return new Promise((resolve, reject) => {
// //         db.query("SELECT lan FROM manual_rps_bl_loan WHERE lan = ? AND due_date = ?", [lan, due_date], (err, results) => {
// //             if (err) return reject(err);
// //             resolve(results.length > 0);
// //         });
// //     });
// // };
// // router.post("/upload", upload.single("file"), async (req, res) => {
// //     if (!req.file) return res.status(400).json({ message: "No file uploaded" });

// //     try {
// //         const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
// //         const sheetName = workbook.SheetNames[0];
// //         const sheetData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

// //         if (sheetData.length === 0) {
// //             return res.status(400).json({ message: "No data found in the uploaded file" });
// //         }

// //         let dataToInsertWCTL = [];
// //         let dataToInsertEV = [];
// //         let skippedEntries = [];

// //         for (const row of sheetData) {
// //             const lan = row["LAN"];
// //             const due_date = excelSerialToDate(row["Due Date"]);

// //             if (!lan || !due_date) {
// //                 skippedEntries.push({ lan, due_date, reason: "Missing LAN or due date" });
// //                 continue;
// //             }

// //             const validLAN = await getValidLAN(lan);
// //             if (!validLAN) {
// //                 skippedEntries.push({ lan, due_date, reason: "LAN not found in loan_bookings" });
// //                 continue;
// //             }

// //             const exists = await checkExistingRPS(validLAN, due_date);
// //             if (exists) {
// //                 skippedEntries.push({ lan, due_date, reason: "Duplicate RPS entry" });
// //                 continue;
// //             }

// //             const dataRow = [
// //                 validLAN,
// //                 due_date,
// //                 row["Status"] || null,
// //                 row["EMI"] || null,
// //                 row["Interest"] || null,
// //                 row["Principal"] || null,
// //                 row["Opening"] ? parseFloat(row["Opening"]) : null,
// //                 row["Closing"] ? parseFloat(row["Closing"]) : null,
// //                 row["Remaining EMI"] || null,
// //                 row["Remaining Interest"] || null,
// //                 row["Remaining Principal"] || null
// //             ];

// //             // ➡️ Choose table based on LAN prefix
// //             if (validLAN.startsWith("WCTL")) {
// //                 dataToInsertWCTL.push(dataRow);
// //             } else {
// //                 dataToInsertEV.push(dataRow);
// //             }
// //         }

// //         // ➡️ Insert into WCTL table
// //         if (dataToInsertWCTL.length > 0) {
// //             const insertQueryWCTL = `
// //                 INSERT INTO manual_rps_wctl
// //                 (lan, due_date, status, emi, interest, principal, opening, closing, remaining_emi, remaining_interest, remaining_principal) 
// //                 VALUES ?`;
// //             await new Promise((resolve, reject) => {
// //                 db.query(insertQueryWCTL, [dataToInsertWCTL], (err, result) => {
// //                     if (err) return reject(err);
// //                     resolve(result);
// //                 });
// //             });
// //         }

// //         // ➡️ Insert into EV Loan table
// //         if (dataToInsertEV.length > 0) {
// //             const insertQueryEV = `
// //                 INSERT INTO manual_rps_bl_loan
// //                 (lan, due_date, status, emi, interest, principal, opening, closing, remaining_emi, remaining_interest, remaining_principal) 
// //                 VALUES ?`;
// //             await new Promise((resolve, reject) => {
// //                 db.query(insertQueryEV, [dataToInsertEV], (err, result) => {
// //                     if (err) return reject(err);
// //                     resolve(result);
// //                 });
// //             });
// //         }

// //         const totalInserted = dataToInsertWCTL.length + dataToInsertEV.length;

// //         // ✅ Return response
// //         if (skippedEntries.length > 0) {
// //             return res.status(207).json({
// //                 message: `Upload partially completed. ${totalInserted} rows inserted, ${skippedEntries.length} skipped.`,
// //                 skipped: skippedEntries
// //             });
// //         } else {
// //             return res.json({ message: "All rows uploaded successfully." });
// //         }

// //     } catch (error) {
// //         console.error("Error processing RPS file:", error);
// //         return res.status(500).json({ message: "Error processing file." });
// //     }
// // });



// // module.exports = router;

// // --- Config: map lender → booking & RPS tables ---
// const RPS_TABLES = {
//   WCTL:   'manual_rps_wctl',
//   EMBIFI: 'manual_rps_embifi_loan', // ensure this exists in DB
//   EVBL:   'manual_rps_bl_loan',
// };

// const BOOKING_TABLES = {
//   WCTL:   'loan_bookings_wctl',
//   EMBIFI: 'loan_booking_embifi',
//   EVBL:   'loan_bookings',
// };

// // --- Helpers ---
// const lanExistsIn = (table, lan) =>
//   new Promise((resolve, reject) => {
//     db.query(`SELECT lan FROM ${table} WHERE lan = ? LIMIT 1`, [lan], (err, rows) => {
//       if (err) return reject(err);
//       resolve(rows.length > 0 ? rows[0].lan : null);
//     });
//   });

// /**
//  * Find which lender-route this LAN belongs to and return booking & RPS tables.
//  * Priority:
//  *   1) If LAN starts with WCTL and exists in WCTL booking → WCTL
//  *   2) If exists in Embifi booking → EMBIFI
//  *   3) Else if exists in default loan_bookings → EVBL
//  *   4) Else null
//  */
// const resolveLanRoute = async (lan) => {
//   if (lan.startsWith('WCTL')) {
//     const ok = await lanExistsIn(BOOKING_TABLES.WCTL, lan);
//     if (ok) return { lan: ok, lenderKey: 'WCTL', rpsTable: RPS_TABLES.WCTL };
//   }
//   const emb = await lanExistsIn(BOOKING_TABLES.EMBIFI, lan);
//   if (emb) return { lan: emb, lenderKey: 'EMBIFI', rpsTable: RPS_TABLES.EMBIFI };

//   const def = await lanExistsIn(BOOKING_TABLES.EVBL, lan);
//   if (def) return { lan: def, lenderKey: 'EVBL', rpsTable: RPS_TABLES.EVBL };

//   return null;
// };

// const checkExistingRPS = (table, lan, due_date) =>
//   new Promise((resolve, reject) => {
//     const sql = `SELECT 1 FROM ${table} WHERE lan = ? AND due_date = ? LIMIT 1`;
//     db.query(sql, [lan, due_date], (err, rows) => {
//       if (err) return reject(err);
//       resolve(rows.length > 0);
//     });
//   });

// // Keep your excelSerialToDate(...) helper as-is

// router.post('/upload', upload.single('file'), async (req, res) => {
//   if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

//   // ---- request-scoped logging setup ----
//   const LOG_LEVEL = (process.env.RPS_LOG_LEVEL || 'info').toLowerCase();
//   const shouldDebug = LOG_LEVEL === 'debug';
//   const reqId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
//   const tag = `[RPS][${new Date().toISOString()}][${reqId}]`;
//   const fmt = () => `[RPS][${new Date().toISOString()}][${reqId}]`;
//   const info  = (...a) => console.log(fmt(), ...a);
//   const debug = (...a) => { if (shouldDebug) console.log(fmt(), ...a); };
//   const warn  = (...a) => console.warn(fmt(), ...a);
//   const error = (...a) => console.error(fmt(), ...a);

//   try {
//     info('File received', {
//       name: req.file.originalname,
//       size: req.file.size,
//       mimetype: req.file.mimetype,
//     });

//     const tStart = Date.now();

//     const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
//     const sheetName = workbook.SheetNames[0];
//     const sheetData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

//     info('Workbook parsed', { sheetName, rows: sheetData.length });
//     if (sheetData.length === 0) {
//       return res.status(400).json({ message: 'No data found in the uploaded file' });
//     }

//     // Collect rows keyed by RPS table
//     const buckets = {
//       [RPS_TABLES.WCTL]:   [],
//       [RPS_TABLES.EVBL]:   [],
//       [RPS_TABLES.EMBIFI]: [],
//     };
//     const skipped = [];

//     // numeric parser with logging on NaN
//     const numFactory = (field) => (v) => {
//       if (v === '' || v == null) return null;
//       const s = String(v).replace(/,/g, '');
//       const n = parseFloat(s);
//       if (Number.isNaN(n)) {
//         warn('Non-numeric value, coercing to NULL', { field, value: v });
//         return null;
//       }
//       return n;
//     };
//     const numEMI = numFactory('EMI');
//     const numInt = numFactory('Interest');
//     const numPrin = numFactory('Principal');
//     const numOpen = numFactory('Opening');
//     const numClose = numFactory('Closing');
//     const numRemEMI = numFactory('Remaining EMI');
//     const numRemInt = numFactory('Remaining Interest');
//     const numRemPrin = numFactory('Remaining Principal');

//     for (let i = 0; i < sheetData.length; i++) {
//       const row = sheetData[i];
//       const lanRaw = row['LAN'];
//       const due_date = excelSerialToDate(row['Due Date']);

//       // basic validations
//       if (!lanRaw || !due_date || isNaN(new Date(due_date).getTime())) {
//         skipped.push({ idx: i + 1, lan: lanRaw || null, due_date, reason: 'Missing/invalid LAN or due date' });
//         warn('Skip row - missing/invalid LAN or due date', { idx: i + 1, lan: lanRaw, due_date });
//         continue;
//       }

//       // Which route?
//       const route = await resolveLanRoute(lanRaw);
//       if (!route) {
//         skipped.push({ idx: i + 1, lan: lanRaw, due_date, reason: 'LAN not found in any booking table' });
//         warn('Skip row - LAN not found in any booking table', { idx: i + 1, lan: lanRaw });
//         continue;
//       }
//       debug('Resolved route', { idx: i + 1, lan: route.lan, lenderKey: route.lenderKey, rpsTable: route.rpsTable });

//       // Duplicate check
//       const isDup = await checkExistingRPS(route.rpsTable, route.lan, due_date);
//       if (isDup) {
//         skipped.push({ idx: i + 1, lan: route.lan, due_date, reason: 'Duplicate RPS entry' });
//         debug('Duplicate detected; skipping', { idx: i + 1, lan: route.lan, due_date, table: route.rpsTable });
//         continue;
//       }

//       // Build payload row (align columns across all RPS tables)
//       const dataRow = [
//         route.lan,
//         due_date,
//         row['Status'] ?? null,
//         numEMI(row['EMI']),
//         numInt(row['Interest']),
//         numPrin(row['Principal']),
//         numOpen(row['Opening']),
//         numClose(row['Closing']),
//         numRemEMI(row['Remaining EMI']),
//         numRemInt(row['Remaining Interest']),
//         numRemPrin(row['Remaining Principal']),
//       ];

//       buckets[route.rpsTable].push(dataRow);
//     }

//     info('Bucket sizes', {
//       [RPS_TABLES.WCTL]:   buckets[RPS_TABLES.WCTL].length,
//       [RPS_TABLES.EVBL]:   buckets[RPS_TABLES.EVBL].length,
//       [RPS_TABLES.EMBIFI]: buckets[RPS_TABLES.EMBIFI].length,
//       skipped: skipped.length,
//     });
//     if (shouldDebug && skipped.length) {
//       debug('Skipped sample (up to 10)', skipped.slice(0, 10));
//     }

//     // Bulk insert per table (if any rows present) with timing and result logs
//     const doBulkInsert = (table, rows) =>
//       new Promise((resolve, reject) => {
//         if (!rows || rows.length === 0) return resolve(null);
//         const sql = `
//           INSERT INTO ${table}
//             (lan, due_date, status, emi, interest, principal, opening, closing, remaining_emi, remaining_interest, remaining_principal)
//           VALUES ?
//         `;
//         const label = `${tag} INSERT ${table}`;
//         console.time(label);
//         db.query(sql, [rows], (err, result) => {
//           console.timeEnd(label);
//           if (err) {
//             error('Bulk insert failed', { table, rows: rows.length, code: err.code, sqlMessage: err.sqlMessage || err.message });
//             return reject(err);
//           }
//           info('Bulk insert ok', {
//             table,
//             rows: rows.length,
//             affectedRows: result?.affectedRows,
//             warningStatus: result?.warningStatus,
//           });
//           resolve(result);
//         });
//       });

//     await Promise.all([
//       doBulkInsert(RPS_TABLES.WCTL, buckets[RPS_TABLES.WCTL]),
//       doBulkInsert(RPS_TABLES.EVBL, buckets[RPS_TABLES.EVBL]),
//       doBulkInsert(RPS_TABLES.EMBIFI, buckets[RPS_TABLES.EMBIFI]),
//     ]);

//     const inserted =
//       (buckets[RPS_TABLES.WCTL]?.length || 0) +
//       (buckets[RPS_TABLES.EVBL]?.length || 0) +
//       (buckets[RPS_TABLES.EMBIFI]?.length || 0);

//     const ms = Date.now() - tStart;
//     info('Upload completed', { inserted, skipped: skipped.length, duration_ms: ms });

//     if (skipped.length > 0) {
//       return res.status(207).json({
//         message: `Upload partially completed. ${inserted} rows inserted, ${skipped.length} skipped.`,
//         insertedByTable: {
//           [RPS_TABLES.WCTL]:   buckets[RPS_TABLES.WCTL]?.length || 0,
//           [RPS_TABLES.EVBL]:   buckets[RPS_TABLES.EVBL]?.length || 0,
//           [RPS_TABLES.EMBIFI]: buckets[RPS_TABLES.EMBIFI]?.length || 0,
//         },
//         skipped,
//       });
//     }

//     return res.json({
//       message: 'All rows uploaded successfully.',
//       insertedByTable: {
//         [RPS_TABLES.WCTL]:   buckets[RPS_TABLES.WCTL]?.length || 0,
//         [RPS_TABLES.EVBL]:   buckets[RPS_TABLES.EVBL]?.length || 0,
//         [RPS_TABLES.EMBIFI]: buckets[RPS_TABLES.EMBIFI]?.length || 0,
//       },
//     });
//   } catch (err) {
//     error('Unhandled error processing RPS file', {
//       code: err.code,
//       message: err.message,
//       stack: err.stack?.split('\n').slice(0, 3).join(' | '),
//     });
//     return res.status(500).json({ message: 'Error processing file.' });
//   }
// });

// module.exports = router;



///////////////////////// NEW CODE//////////////
// routes/rpsUpload.js
const express = require("express");
const multer = require("multer");
const xlsx = require("xlsx");
const db = require("../config/db");

const router = express.Router();

/* =========================
   Multer: file in memory
   ========================= */
const storage = multer.memoryStorage();
const upload = multer({ storage });

/* =========================
   Date parser (robust, UTC)
   Supports:
     - Excel serial (1900 system)
     - "DD-MMM-YY" (e.g. 10-Mar-24)
     - "DD-MM-YYYY" or "DD/MM/YYYY"
   ========================= */
const excelSerialToDate = (value) => {
  if (value == null || value === "") return null;

  // 1) Excel serial number (number or numeric string)
  if (typeof value === "number" || /^\d+(\.\d+)?$/.test(String(value))) {
    const excelEpoch = Date.UTC(1899, 11, 30); // 1900-based serials
    const ms = excelEpoch + Math.floor(Number(value)) * 86400000;
    return new Date(ms).toISOString().slice(0, 10); // YYYY-MM-DD
  }

  const s = String(value).trim();

  // 2) "DD-MMM-YY"
  const m2 = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2})$/);
  if (m2) {
    const [, dd, monAbbr, yy] = m2;
    const monthNames = { Jan:0, Feb:1, Mar:2, Apr:3, May:4, Jun:5, Jul:6, Aug:7, Sep:8, Oct:9, Nov:10, Dec:11 };
    const m = monthNames[monAbbr];
    if (m == null) return null;
    const y = 2000 + parseInt(yy, 10);
    const d = new Date(Date.UTC(y, m, parseInt(dd, 10)));
    return d.toISOString().slice(0, 10);
  }

  // 3) "DD-MM-YYYY" or "DD/MM/YYYY"
  const m3 = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
  if (m3) {
    const [, dd, mm, yyyy] = m3;
    const d = new Date(Date.UTC(parseInt(yyyy, 10), parseInt(mm, 10) - 1, parseInt(dd, 10)));
    return d.toISOString().slice(0, 10);
  }

  return null; // unknown format
};

/* =========================
   Normalize a row's headers
   Trims & collapses spaces
   ========================= */
const normalizeRow = (row) => {
  const out = {};
  for (const k in row) {
    const nk = k.trim().replace(/\s+/g, " ");
    out[nk] = row[k];
  }
  return out;
};

/* =========================
   Config: tables
   ========================= */
const RPS_TABLES = {
  WCTL:   "manual_rps_wctl",
  EMBIFI: "manual_rps_embifi_loan",                          // ensure exists
  EVBL:   process.env.RPS_DEFAULT_TABLE || "manual_rps_bl_loan", // override if needed
};

const BOOKING_TABLES = {
  WCTL:   "loan_bookings_wctl",
  EMBIFI: "loan_booking_embifi",
  EVBL:   "loan_bookings",
};

/* =========================
   DB helpers
   ========================= */
const lanExistsIn = (table, lan) =>
  new Promise((resolve, reject) => {
    db.query(`SELECT lan FROM ${table} WHERE lan = ? LIMIT 1`, [lan], (err, rows) => {
      if (err) return reject(err);
      resolve(rows.length > 0 ? rows[0].lan : null);
    });
  });

/**
 * Resolve which lender-route a LAN belongs to.
 * Priority:
 *  1) If starts with WCTL and exists in WCTL booking → WCTL
 *  2) If exists in Embifi booking → EMBIFI
 *  3) Else if exists in default loan_bookings → EVBL
 *  4) Else null
 */
const resolveLanRoute = async (lan) => {
  if (lan.startsWith("WCTL")) {
    const ok = await lanExistsIn(BOOKING_TABLES.WCTL, lan);
    if (ok) return { lan: ok, lenderKey: "WCTL", rpsTable: RPS_TABLES.WCTL };
  }
  const emb = await lanExistsIn(BOOKING_TABLES.EMBIFI, lan);
  if (emb) return { lan: emb, lenderKey: "EMBIFI", rpsTable: RPS_TABLES.EMBIFI };

  const def = await lanExistsIn(BOOKING_TABLES.EVBL, lan);
  if (def) return { lan: def, lenderKey: "EVBL", rpsTable: RPS_TABLES.EVBL };

  return null;
};

// Per-request cache to avoid repeated DB lookups for the same LAN
const makeRouteCache = () => {
  const cache = new Map();
  return {
    get: (k) => cache.get(k),
    set: (k, v) => cache.set(k, v),
    async getOrResolve(k) {
      if (cache.has(k)) return cache.get(k);
      const v = await resolveLanRoute(k);
      cache.set(k, v);
      return v;
    },
  };
};

const checkExistingRPS = (table, lan, due_date) =>
  new Promise((resolve, reject) => {
    const sql = `SELECT 1 FROM ${table} WHERE lan = ? AND due_date = ? LIMIT 1`;
    db.query(sql, [lan, due_date], (err, rows) => {
      if (err) return reject(err);
      resolve(rows.length > 0);
    });
  });

/* =========================
   POST /upload
   ========================= */
router.post("/upload", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: "No file uploaded" });

  // Request-scoped logger
  const LOG_LEVEL = (process.env.RPS_LOG_LEVEL || "info").toLowerCase();
  const shouldDebug = LOG_LEVEL === "debug";
  const reqId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const tag = () => `[RPS][${new Date().toISOString()}][${reqId}]`;
  const info  = (...a) => console.log(tag(), ...a);
  const debug = (...a) => { if (shouldDebug) console.log(tag(), ...a); };
  const warn  = (...a) => console.warn(tag(), ...a);
  const error = (...a) => console.error(tag(), ...a);

  // Per-request route cache
  const routeCache = makeRouteCache();

  try {
    info("File received", {
      name: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
    });

    const tStart = Date.now();
    const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheetData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

    info("Workbook parsed", { sheetName, rows: sheetData.length });
    if (sheetData.length === 0) {
      return res.status(400).json({ message: "No data found in the uploaded file" });
    }

    // Buckets by target table
    const buckets = {
      [RPS_TABLES.WCTL]:   [],
      [RPS_TABLES.EVBL]:   [],
      [RPS_TABLES.EMBIFI]: [],
    };
    const skipped = [];

    // Numeric parser + warnings on bad values
    const numFactory = (field) => (v) => {
      if (v === "" || v == null) return null;
      const s = String(v).replace(/,/g, "");
      const n = parseFloat(s);
      if (Number.isNaN(n)) {
        warn("Non-numeric value, coercing to NULL", { field, value: v });
        return null;
      }
      return n;
    };
    const numEMI     = numFactory("EMI");
    const numInt     = numFactory("Interest");
    const numPrin    = numFactory("Principal");
    const numOpen    = numFactory("Opening");
    const numClose   = numFactory("Closing");
    const numRemEMI  = numFactory("Remaining EMI");
    const numRemInt  = numFactory("Remaining Interest");
    const numRemPrin = numFactory("Remaining Principal");

    for (let i = 0; i < sheetData.length; i++) {
      const row = normalizeRow(sheetData[i]);
      const lanRaw = row["LAN"];
      const due_date = excelSerialToDate(row["Due Date"]);

      // Basic validations
      if (!lanRaw || !due_date || isNaN(new Date(due_date).getTime())) {
        skipped.push({ idx: i + 1, lan: lanRaw || null, due_date, reason: "Missing/invalid LAN or due date" });
        warn("Skip row - missing/invalid LAN or due date", { idx: i + 1, lan: lanRaw, due_date });
        continue;
      }

      // Resolve route (cached)
      const route = await routeCache.getOrResolve(lanRaw);
      if (!route) {
        skipped.push({ idx: i + 1, lan: lanRaw, due_date, reason: "LAN not found in any booking table" });
        warn("Skip row - LAN not found in any booking table", { idx: i + 1, lan: lanRaw });
        continue;
      }
      debug("Resolved route", { idx: i + 1, lan: route.lan, lenderKey: route.lenderKey, rpsTable: route.rpsTable });

      // Duplicate check
      const isDup = await checkExistingRPS(route.rpsTable, route.lan, due_date);
      if (isDup) {
        skipped.push({ idx: i + 1, lan: route.lan, due_date, reason: "Duplicate RPS entry" });
        debug("Duplicate detected; skipping", { idx: i + 1, lan: route.lan, due_date, table: route.rpsTable });
        continue;
      }

      // Build row
      const dataRow = [
        route.lan,                         // lan
        due_date,                          // due_date (YYYY-MM-DD)
        row["Status"] ?? null,            // status
        numEMI(row["EMI"]),               // emi
        numInt(row["Interest"]),          // interest
        numPrin(row["Principal"]),        // principal
        numOpen(row["Opening"]),          // opening
        numClose(row["Closing"]),         // closing
        numRemEMI(row["Remaining EMI"]),  // remaining_emi
        numRemInt(row["Remaining Interest"]), // remaining_interest
        numRemPrin(row["Remaining Principal"]), // remaining_principal
      ];

      buckets[route.rpsTable].push(dataRow);
    }

    info("Bucket sizes", {
      [RPS_TABLES.WCTL]:   buckets[RPS_TABLES.WCTL].length,
      [RPS_TABLES.EVBL]:   buckets[RPS_TABLES.EVBL].length,
      [RPS_TABLES.EMBIFI]: buckets[RPS_TABLES.EMBIFI].length,
      skipped: skipped.length,
    });
    if (shouldDebug && skipped.length) debug("Skipped sample (up to 10)", skipped.slice(0, 10));

    // Bulk insert with timing
    const doBulkInsert = (table, rows) =>
      new Promise((resolve, reject) => {
        if (!rows || rows.length === 0) return resolve(null);
        const sql = `
          INSERT INTO ${table}
            (lan, due_date, status, emi, interest, principal, opening, closing, remaining_emi, remaining_interest, remaining_principal)
          VALUES ?
        `;
        const label = `${tag()} INSERT ${table}`;
        console.time(label);
        db.query(sql, [rows], (err, result) => {
          console.timeEnd(label);
          if (err) {
            error("Bulk insert failed", { table, rows: rows.length, code: err.code, sqlMessage: err.sqlMessage || err.message });
            return reject(err);
          }
          info("Bulk insert ok", {
            table,
            rows: rows.length,
            affectedRows: result?.affectedRows,
            warningStatus: result?.warningStatus,
          });
          resolve(result);
        });
      });

    await Promise.all([
      doBulkInsert(RPS_TABLES.WCTL,   buckets[RPS_TABLES.WCTL]),
      doBulkInsert(RPS_TABLES.EVBL,   buckets[RPS_TABLES.EVBL]),
      doBulkInsert(RPS_TABLES.EMBIFI, buckets[RPS_TABLES.EMBIFI]),
    ]);

    const inserted =
      (buckets[RPS_TABLES.WCTL]?.length || 0) +
      (buckets[RPS_TABLES.EVBL]?.length || 0) +
      (buckets[RPS_TABLES.EMBIFI]?.length || 0);

    const ms = Date.now() - tStart;
    info("Upload completed", { inserted, skipped: skipped.length, duration_ms: ms });

    if (skipped.length > 0) {
      return res.status(207).json({
        message: `Upload partially completed. ${inserted} rows inserted, ${skipped.length} skipped.`,
        insertedByTable: {
          [RPS_TABLES.WCTL]:   buckets[RPS_TABLES.WCTL]?.length || 0,
          [RPS_TABLES.EVBL]:   buckets[RPS_TABLES.EVBL]?.length || 0,
          [RPS_TABLES.EMBIFI]: buckets[RPS_TABLES.EMBIFI]?.length || 0,
        },
        skipped,
      });
    }

    return res.json({
      message: "All rows uploaded successfully.",
      insertedByTable: {
        [RPS_TABLES.WCTL]:   buckets[RPS_TABLES.WCTL]?.length || 0,
        [RPS_TABLES.EVBL]:   buckets[RPS_TABLES.EVBL]?.length || 0,
        [RPS_TABLES.EMBIFI]: buckets[RPS_TABLES.EMBIFI]?.length || 0,
      },
    });
  } catch (err) {
    error("Unhandled error processing RPS file", {
      code: err.code,
      message: err.message,
      stack: err.stack?.split("\n").slice(0, 3).join(" | "),
    });
    return res.status(500).json({ message: "Error processing file." });
  }
});

module.exports = router;
