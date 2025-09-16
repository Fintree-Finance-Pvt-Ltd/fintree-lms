
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

/* ==========================================================
   0) ALWAYS-ON LOG HELPERS (prefix with timestamp + reqId)
   ========================================================== */
const mkLog = (reqId) => {
  const tag = () => `[RPS][${new Date().toISOString()}][${reqId}]`;
  return {
    log: (...a) => console.log(tag(), ...a),
    warn: (...a) => console.warn(tag(), ...a),
    err: (...a) => console.error(tag(), ...a),
    time: (label) => console.time(`${tag()} ${label}`),
    timeEnd: (label) => console.timeEnd(`${tag()} ${label}`),
  };
};

/* ==========================================================
   1) Multer (file stays in memory)
   ========================================================== */
const storage = multer.memoryStorage();
const upload = multer({ storage });

/* ==========================================================
   2) Date parser with logs (serial, DD-MMM-YY, DD-MM-YYYY/DD/MM/YYYY)
   ========================================================== */
const excelSerialToDate = (value, _log) => {
  _log.log("excelSerialToDate: input =", value);
  if (value == null || value === "") {
    _log.log("excelSerialToDate: => null (empty)");
    return null;
  }

  // 1) Excel serial as number/numeric string
  if (typeof value === "number" || /^\d+(\.\d+)?$/.test(String(value))) {
    const excelEpoch = Date.UTC(1899, 11, 30);
    const ms = excelEpoch + Math.floor(Number(value)) * 86400000;
    const out = new Date(ms).toISOString().slice(0, 10);
    _log.log("excelSerialToDate: serial ->", out);
    return out;
  }

  const s = String(value).trim();
  // 2) DD-MMM-YY
  const m2 = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2})$/);
  if (m2) {
    const [, dd, monAbbr, yy] = m2;
    const monthNames = { Jan:0, Feb:1, Mar:2, Apr:3, May:4, Jun:5, Jul:6, Aug:7, Sep:8, Oct:9, Nov:10, Dec:11 };
    const m = monthNames[monAbbr];
    if (m == null) {
      _log.log("excelSerialToDate: unknown month abbr -> null");
      return null;
    }
    const y = 2000 + parseInt(yy, 10);
    const out = new Date(Date.UTC(y, m, parseInt(dd, 10))).toISOString().slice(0, 10);
    _log.log("excelSerialToDate: DD-MMM-YY ->", out);
    return out;
  }

  // 3) DD-MM-YYYY or DD/MM/YYYY
  const m3 = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
  if (m3) {
    const [, dd, mm, yyyy] = m3;
    const out = new Date(Date.UTC(parseInt(yyyy,10), parseInt(mm,10)-1, parseInt(dd,10))).toISOString().slice(0,10);
    _log.log("excelSerialToDate: DD-MM/YYYY ->", out);
    return out;
  }

  _log.log("excelSerialToDate: unmatched, return null");
  return null;
};

/* ==========================================================
   3) Normalize headers per row (trim & collapse spaces)
   ========================================================== */
const normalizeRow = (row, _log) => {
  const out = {};
  _log.log("normalizeRow: raw keys =", Object.keys(row));
  for (const k in row) {
    const nk = k.trim().replace(/\s+/g, " ");
    out[nk] = row[k];
  }
  _log.log("normalizeRow: normalized keys =", Object.keys(out));
  return out;
};

/* ==========================================================
   4) Table config
   ========================================================== */
const RPS_TABLES = {
  WCTL:   "manual_rps_wctl",
  EMBIFI: "manual_rps_embifi_loan",                       // ensure exists
  EVBL:   process.env.RPS_DEFAULT_TABLE || "manual_rps_bl_loan", // change if your default is different
};

const BOOKING_TABLES = {
  WCTL:   "loan_bookings_wctl",
  EMBIFI: "loan_booking_embifi",
  EVBL:   "loan_bookings",
};

/* ==========================================================
   5) DB helpers with ultra-verbose logging
   ========================================================== */
const dbQuery = (sql, params, _log, label = "dbQuery") =>
  new Promise((resolve, reject) => {
    _log.log(`${label}: SQL =`, sql);
    _log.log(`${label}: params =`, JSON.stringify(params));
    console.time(`[DB] ${label}`);
    db.query(sql, params, (err, rows) => {
      console.timeEnd(`[DB] ${label}`);
      if (err) {
        _log.err(`${label}: ERROR code=${err.code} msg=${err.sqlMessage || err.message}`);
        return reject(err);
      }
      _log.log(`${label}: rows/meta =`, Array.isArray(rows) ? rows.length : rows?.affectedRows);
      if (Array.isArray(rows) && rows.length) {
        _log.log(`${label}: first row sample =`, JSON.stringify(rows[0]));
      }
      resolve(rows);
    });
  });

const lanExistsIn = async (table, lan, _log) => {
  _log.log("lanExistsIn: table =", table, " lan =", lan);
  const rows = await dbQuery(
    `SELECT lan FROM ${table} WHERE lan = ? LIMIT 1`,
    [lan],
    _log,
    `lanExistsIn(${table})`
  );
  const out = rows.length > 0 ? rows[0].lan : null;
  _log.log("lanExistsIn: result =", out);
  return out;
};

const resolveLanRoute = async (lan, _log) => {
  _log.log("resolveLanRoute: start for lan =", lan);

  if (lan.startsWith("WCTL")) {
    _log.log("resolveLanRoute: lan starts with WCTL, checking booking table");
    const ok = await lanExistsIn(BOOKING_TABLES.WCTL, lan, _log);
    if (ok) {
      const out = { lan: ok, lenderKey: "WCTL", rpsTable: RPS_TABLES.WCTL };
      _log.log("resolveLanRoute: resolved =", out);
      return out;
    }
  }

  _log.log("resolveLanRoute: checking EMBIFI booking table");
  const emb = await lanExistsIn(BOOKING_TABLES.EMBIFI, lan, _log);
  if (emb) {
    const out = { lan: emb, lenderKey: "EMBIFI", rpsTable: RPS_TABLES.EMBIFI };
    _log.log("resolveLanRoute: resolved =", out);
    return out;
  }

  _log.log("resolveLanRoute: checking default booking table (EVBL)");
  const def = await lanExistsIn(BOOKING_TABLES.EVBL, lan, _log);
  if (def) {
    const out = { lan: def, lenderKey: "EVBL", rpsTable: RPS_TABLES.EVBL };
    _log.log("resolveLanRoute: resolved =", out);
    return out;
  }

  _log.log("resolveLanRoute: NOT FOUND in any booking table");
  return null;
};

const makeRouteCache = (_log) => {
  const cache = new Map();
  return {
    async getOrResolve(lan) {
      if (cache.has(lan)) {
        _log.log("routeCache: HIT for lan =", lan);
        return cache.get(lan);
      }
      _log.log("routeCache: MISS for lan =", lan, "-> resolving");
      const r = await resolveLanRoute(lan, _log);
      cache.set(lan, r);
      return r;
    },
  };
};

const checkExistingRPS = async (table, lan, due_date, _log) => {
  _log.log("checkExistingRPS: table =", table, " lan =", lan, " due_date =", due_date);
  const rows = await dbQuery(
    `SELECT 1 FROM ${table} WHERE lan = ? AND due_date = ? LIMIT 1`,
    [lan, due_date],
    _log,
    `checkExistingRPS(${table})`
  );
  const exists = rows.length > 0;
  _log.log("checkExistingRPS: exists =", exists);
  return exists;
};

/* ==========================================================
   6) Route: POST /upload  (EVERY STEP LOGGED)
   ========================================================== */
router.post("/upload", upload.single("file"), async (req, res) => {
  const reqId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const L = mkLog(reqId);

  L.log("==== /upload START ====");
  L.log("ENV RPS_DEFAULT_TABLE =", process.env.RPS_DEFAULT_TABLE);
  L.log("Target RPS tables =", RPS_TABLES);

  if (!req.file) {
    L.err("No file uploaded");
    return res.status(400).json({ message: "No file uploaded" });
  }

  try {
    L.log("File meta =", {
      name: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
      bufferLen: req.file.buffer?.length,
    });

    L.time("xlsx:read");
    const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
    L.timeEnd("xlsx:read");

    L.log("Workbook SheetNames =", workbook.SheetNames);
    const sheetName = workbook.SheetNames[0];
    L.log("Using Sheet =", sheetName);

    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      L.err("Sheet not found in workbook");
      return res.status(400).json({ message: "First sheet not found" });
    }

    L.time("xlsx:to_json");
    const sheetData = xlsx.utils.sheet_to_json(sheet);
    L.timeEnd("xlsx:to_json");

    L.log("Rows parsed =", sheetData.length);
    if (sheetData.length > 0) {
      const headers = Object.keys(sheetData[0]);
      L.log("Detected headers (raw) =", headers);
    }

    if (sheetData.length === 0) {
      L.err("Empty sheet");
      return res.status(400).json({ message: "No data found in the uploaded file" });
    }

    // Buckets
    const buckets = {
      [RPS_TABLES.WCTL]:   [],
      [RPS_TABLES.EVBL]:   [],
      [RPS_TABLES.EMBIFI]: [],
    };
    const skipped = [];

    // Number parser (with logs)
    const numFactory = (field) => (v) => {
      const raw = v;
      if (v === "" || v == null) {
        L.log(`num(${field}): null from`, raw);
        return null;
      }
      const s = String(v).replace(/,/g, "");
      const n = parseFloat(s);
      if (Number.isNaN(n)) {
        L.warn(`num(${field}): NaN from`, raw, "-> NULL");
        return null;
      }
      L.log(`num(${field}):`, raw, "->", n);
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

    // Per-request route cache
    const routeCache = makeRouteCache(L);

    // Process each row (LOG EVERYTHING)
    for (let i = 0; i < sheetData.length; i++) {
      L.log("---- Row", i + 1, "RAW =", JSON.stringify(sheetData[i]));
      const row = normalizeRow(sheetData[i], L);
      L.log("Row", i + 1, "NORMALIZED =", JSON.stringify(row));

      const lanRaw   = row["LAN"];
      const due_date = excelSerialToDate(row["Due Date"], L);

      L.log(`Row ${i + 1} -> LAN =`, lanRaw, " Due Date raw =", row["Due Date"], " parsed =", due_date);

      if (!lanRaw || !due_date || isNaN(new Date(due_date).getTime())) {
        const reason = "Missing/invalid LAN or due date";
        skipped.push({ idx: i + 1, lan: lanRaw || null, due_date, reason });
        L.warn("Row", i + 1, "SKIP:", reason);
        continue;
      }

      const route = await routeCache.getOrResolve(lanRaw);
      L.log("Row", i + 1, "route =", route);
      if (!route) {
        const reason = "LAN not found in any booking table";
        skipped.push({ idx: i + 1, lan: lanRaw, due_date, reason });
        L.warn("Row", i + 1, "SKIP:", reason);
        continue;
      }

      const isDup = await checkExistingRPS(route.rpsTable, route.lan, due_date, L);
      L.log("Row", i + 1, "duplicate? =", isDup);
      if (isDup) {
        const reason = "Duplicate RPS entry";
        skipped.push({ idx: i + 1, lan: route.lan, due_date, reason });
        L.warn("Row", i + 1, "SKIP:", reason);
        continue;
      }

      // Build row array
      const dataRow = [
        route.lan,
        due_date,
        row["Status"] ?? null,
        numEMI(row["EMI"]),
        numInt(row["Interest"]),
        numPrin(row["Principal"]),
        numOpen(row["Opening"]),
        numClose(row["Closing"]),
        numRemEMI(row["Remaining EMI"]),
        numRemInt(row["Remaining Interest"]),
        numRemPrin(row["Remaining Principal"]),
      ];

      L.log("Row", i + 1, "dataRow =", JSON.stringify(dataRow));
      buckets[route.rpsTable].push(dataRow);
      L.log("Row", i + 1, "pushed to bucket =", route.rpsTable, " current count =", buckets[route.rpsTable].length);
    }

    // Bucket summary
    L.log("BUCKET SUMMARY =", {
      [RPS_TABLES.WCTL]:   buckets[RPS_TABLES.WCTL].length,
      [RPS_TABLES.EVBL]:   buckets[RPS_TABLES.EVBL].length,
      [RPS_TABLES.EMBIFI]: buckets[RPS_TABLES.EMBIFI].length,
      skipped: skipped.length,
    });
    if (console.table) {
      console.table([
        { table: RPS_TABLES.WCTL,   count: buckets[RPS_TABLES.WCTL].length },
        { table: RPS_TABLES.EVBL,   count: buckets[RPS_TABLES.EVBL].length },
        { table: RPS_TABLES.EMBIFI, count: buckets[RPS_TABLES.EMBIFI].length },
        { table: "skipped",         count: skipped.length },
      ]);
    }
    if (skipped.length) {
      L.log("SKIPPED FIRST 10 =", JSON.stringify(skipped.slice(0, 10)));
    }

    // Bulk insert helper (log SQL, params, timing, result)
    const doBulkInsert = async (table, rows) => {
      L.log(`doBulkInsert -> table=${table} rows=${rows?.length}`);
      if (!rows || rows.length === 0) {
        L.log(`doBulkInsert: nothing to insert for ${table}`);
        return null;
      }
      const sql = `
        INSERT INTO ${table}
          (lan, due_date, status, emi, interest, principal, opening, closing, remaining_emi, remaining_interest, remaining_principal)
        VALUES ?
      `;
      L.log("doBulkInsert SQL =", sql.replace(/\s+/g, " ").trim());
      L.log("doBulkInsert params sample first row =", JSON.stringify(rows[0]));
      console.time(`[DB] bulk ${table}`);
      const result = await new Promise((resolve, reject) => {
        db.query(sql, [rows], (err, res2) => {
          console.timeEnd(`[DB] bulk ${table}`);
          if (err) {
            L.err("doBulkInsert ERROR:", { table, code: err.code, msg: err.sqlMessage || err.message });
            L.log("doBulkInsert first row (again) =", JSON.stringify(rows[0]));
            return reject(err);
          }
          L.log("doBulkInsert OK:", {
            table,
            affectedRows: res2?.affectedRows,
            warningStatus: res2?.warningStatus,
          });
          resolve(res2);
        });
      });
      return result;
    };

    // Run inserts (each logs)
    await doBulkInsert(RPS_TABLES.WCTL,   buckets[RPS_TABLES.WCTL]);
    await doBulkInsert(RPS_TABLES.EVBL,   buckets[RPS_TABLES.EVBL]);
    await doBulkInsert(RPS_TABLES.EMBIFI, buckets[RPS_TABLES.EMBIFI]);

    const inserted =
      (buckets[RPS_TABLES.WCTL]?.length || 0) +
      (buckets[RPS_TABLES.EVBL]?.length || 0) +
      (buckets[RPS_TABLES.EMBIFI]?.length || 0);

    L.log("FINAL: inserted total =", inserted, " skipped =", skipped.length);

    if (skipped.length > 0) {
      L.log("Responding 207 with partial success");
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

    L.log("Responding 200 success for all rows");
    return res.json({
      message: "All rows uploaded successfully.",
      insertedByTable: {
        [RPS_TABLES.WCTL]:   buckets[RPS_TABLES.WCTL]?.length || 0,
        [RPS_TABLES.EVBL]:   buckets[RPS_TABLES.EVBL]?.length || 0,
        [RPS_TABLES.EMBIFI]: buckets[RPS_TABLES.EMBIFI]?.length || 0,
      },
    });
  } catch (err) {
    L.err("UNHANDLED ERROR:", err.code, err.sqlMessage || err.message);
    L.err("STACK(3) =", (err.stack || "").split("\n").slice(0, 3).join(" | "));
    return res.status(500).json({ message: "Error processing file." });
  }
});

module.exports = router;
