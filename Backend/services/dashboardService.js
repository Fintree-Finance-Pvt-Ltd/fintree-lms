/**
 * dashboardService.js — Centralized business logic for dashboard module ONLY.
 *
 * Key exports:
 *   PRODUCT_MAP         — canonical product → table mapping (single source of truth)
 *   normalizeProduct()  — normalized product key lookup
 *   initColumnSchemaCache(db) — pre-warm schema at process startup (removes per-request SHOW COLUMNS)
 *   getColumnExpressions(bookTable) — returns dealer/district SQL expressions from cache
 *   dayRange() / buildDateRangeClause() — shared SQL helpers
 *   eqLan()            — collation-safe LAN equality
 *   buildDisbursalTrend(prod, start, end, db) — disbursal-trend query
 *   buildMetricCards(prod, start, end, db)    — metric-cards aggregation
 *   buildDpdBuckets(prod, db)                 — dpd-buckets aggregation
 *   buildDpdList(opts, db)                    — paginated dpd-list query
 */

"use strict";

/* ================================================================
   CONSTANTS
   ================================================================ */

const JOIN_COLLATE = "utf8mb4_unicode_ci";

/**
 * Canonical product map — single source of truth for all 12 products.
 * Each entry describes:
 *   rpsTable    — manual repayment schedule table
 *   bookTable   — loan booking table
 *   disbField   — field in bookTable that holds disbursed amount
 *   collType    — how collections are queried: 'join' | 'direct' | 'subquery'
 *   collBook    — used for join/direct collection types
 *   allocTable  — allocation table for PNI queries
 *   allocLike   — LIKE pattern to match LANs in allocation table
 *   label       — human-readable label used in SQL literals
 */
const PRODUCT_MAP = {
  BL: {
    rpsTable:   "manual_rps_bl_loan",
    bookTable:  "loan_bookings",
    disbField:  "loan_amount",
    collType:   "join",
    collBook:   "loan_bookings",
    allocTable: "allocation",
    allocLike:  "BL%",
    label:      "BL Loan",
  },
  EV: {
    rpsTable:   "manual_rps_ev_loan",
    bookTable:  "loan_booking_ev",
    disbField:  "loan_amount",
    collType:   "join",
    collBook:   "loan_booking_ev",
    allocTable: "allocation",
    allocLike:  "EV%",
    label:      "EV Loan",
  },
  Adikosh: {
    rpsTable:   "manual_rps_adikosh",
    bookTable:  "loan_booking_adikosh",
    disbField:  "net_disbursement",
    collType:   "direct",
    collBook:   "repayments_upload_adikosh",
    allocTable: "allocation_adikosh",
    allocLike:  "ADK%",
    label:      "Adikosh",
  },
  "GQ Non-FSF": {
    rpsTable:   "manual_rps_gq_non_fsf",
    bookTable:  "loan_booking_gq_non_fsf",
    disbField:  "disbursal_amount",
    collType:   "subquery",
    allocTable: "allocation",
    allocLike:  "%GQN%",
    label:      "GQ Non-FSF",
  },
  "GQ FSF": {
    rpsTable:   "manual_rps_gq_fsf",
    bookTable:  "loan_booking_gq_fsf",
    disbField:  "disbursal_amount",
    collType:   "subquery",
    allocTable: "allocation",
    allocLike:  "%GQF%",
    label:      "GQ FSF",
  },
  Embifi: {
    rpsTable:   "manual_rps_embifi_loan",
    bookTable:  "loan_booking_embifi",
    disbField:  "approved_loan_amount",
    collType:   "join",
    collBook:   "loan_booking_embifi",
    allocTable: "allocation",
    allocLike:  "E1%",
    label:      "Embifi",
  },
  WCTL: {
    rpsTable:   "manual_rps_wctl",
    bookTable:  "loan_bookings_wctl",
    disbField:  "loan_amount",
    collType:   "join",
    collBook:   "loan_bookings_wctl",
    allocTable: "allocation",
    allocLike:  "WCTL%",
    label:      "WCTL",
  },
  EMICLUB: {
    rpsTable:   "manual_rps_emiclub",
    bookTable:  "loan_booking_emiclub",
    disbField:  "loan_amount",
    collType:   "subquery",
    allocTable: "allocation",
    allocLike:  "%FINE%",
    label:      "EMICLUB",
  },
  Finso: {
    rpsTable:   "manual_rps_finso_loan",
    bookTable:  "loan_booking_finso",
    disbField:  "disbursal_amount",
    collType:   "subquery",
    allocTable: "allocation",
    allocLike:  "%FINS%",
    label:      "Finso",
  },
  "Hey EV": {
    rpsTable:   "manual_rps_hey_ev",
    bookTable:  "loan_booking_hey_ev",
    disbField:  "loan_amount",
    collType:   "subquery",
    allocTable: "allocation",
    allocLike:  "%HEY%",
    label:      "Hey EV",
  },
  "Circle Pe": {
    rpsTable:   "manual_rps_circlepe",
    bookTable:  "loan_booking_circle_pe",
    disbField:  "loan_amount",
    collType:   "subquery",
    allocTable: "allocation",
    allocLike:  "%CIR%",
    label:      "Circle Pe",
  },
  HELIUM: {
    rpsTable:   "manual_rps_helium",
    bookTable:  "loan_booking_helium",
    disbField:  "loan_amount",
    collType:   "subquery",
    allocTable: "allocation",
    allocLike:  "%HEL%",
    label:      "Helium",
  },
};

/* ================================================================
   normalizeProduct — single canonical implementation (was 3x duplicate)
   ================================================================ */

function normalizeProduct(p) {
  if (!p || p === "ALL") return "ALL";
  const s = String(p).toLowerCase().replace(/\s+/g, "").replace(/-/g, "");
  const map = {
    evloan:    "EV",
    ev_loan:   "EV",
    blloan:    "BL",
    bl_loan:   "BL",
    adikosh:   "Adikosh",
    gqnonfsf:  "GQ Non-FSF",
    gqnon:     "GQ Non-FSF",
    gqfsf:     "GQ FSF",
    gqf:       "GQ FSF",
    embifi:    "Embifi",
    wctl:      "WCTL",
    circlepe:  "Circle Pe",
    emiclub:   "EMICLUB",
    finso:     "Finso",
    heyev:     "Hey EV",
    hey_ev:    "Hey EV",
    helium:    "HELIUM",
  };
  return map[s] || p;
}

/* ================================================================
   DATE / RANGE HELPERS
   ================================================================ */

function dayRange(from, to) {
  const start = from && String(from).trim() ? String(from).trim() : null;
  let end = null;
  if (to && String(to).trim()) {
    const dt = new Date(String(to).trim());
    dt.setDate(dt.getDate() + 1);
    end = dt.toISOString().slice(0, 10);
  }
  return { start, end };
}

function buildDateRangeClause(field, start, end) {
  const parts = [];
  const params = [];
  if (start) { parts.push(`${field} >= ?`); params.push(start); }
  if (end)   { parts.push(`${field} < ?`);  params.push(end); }
  return { clause: parts.length ? ` AND ${parts.join(" AND ")}` : "", params };
}

function eqLan(left, right) {
  return `${left} COLLATE ${JOIN_COLLATE} = ${right} COLLATE ${JOIN_COLLATE}`;
}

/* ================================================================
   COLUMN SCHEMA CACHE
   Populated ONCE at process startup via initColumnSchemaCache(db).
   Replaces up to 48 serial SHOW COLUMNS calls per dpd-list request.
   ================================================================ */

/** Map<tableName, Set<columnName>> */
const _schemaCache = new Map();
let _schemaCacheInitialized = false;

const TRACKED_COLUMNS = ["dealer_name", "beneficiary_name", "trade_name", "district", "current_address_city"];

/**
 * Call this once at server startup:
 *   const { initColumnSchemaCache } = require('./services/dashboardService');
 *   await initColumnSchemaCache(db);
 */
async function initColumnSchemaCache(db) {
  if (_schemaCacheInitialized) return;

  const bookTables = [...new Set(Object.values(PRODUCT_MAP).map(p => p.bookTable))];

  // Run all SHOW COLUMNS queries in parallel
  await Promise.all(
    bookTables.map(async (table) => {
      try {
        const checkPromises = TRACKED_COLUMNS.map(col =>
          db.promise().query(`SHOW COLUMNS FROM \`${table}\` LIKE ?`, [col])
        );
        const results = await Promise.all(checkPromises);

        const colSet = new Set();
        results.forEach(([rows], idx) => {
          if (rows.length > 0) colSet.add(TRACKED_COLUMNS[idx]);
        });
        _schemaCache.set(table, colSet);
      } catch (err) {
        // Table might not exist yet — default to empty set
        console.warn(`[dashboardService] Schema cache: could not inspect "${table}":`, err.message);
        _schemaCache.set(table, new Set());
      }
    })
  );

  _schemaCacheInitialized = true;
  console.log(`✅ [dashboardService] Column schema cache warmed for ${bookTables.length} booking tables.`);
}

/**
 * Returns SQL expressions for dealer name and district for a given booking table,
 * using the pre-warmed schema cache.
 * Falls back to safe defaults if cache not initialized.
 */
function getColumnExpressions(bookTable) {
  const cols = _schemaCache.get(bookTable) || new Set();

  let dealerExpr;
  if (cols.has("trade_name"))        dealerExpr = "MAX(b.trade_name)";
  else if (cols.has("dealer_name"))  dealerExpr = "MAX(b.dealer_name)";
  else if (cols.has("beneficiary_name")) dealerExpr = "MAX(b.beneficiary_name)";
  else                               dealerExpr = "'-'";

  let districtExpr;
  const hasDist = cols.has("district");
  const hasCity = cols.has("current_address_city");
  if (hasDist && hasCity) districtExpr = "COALESCE(MAX(b.district), MAX(b.current_address_city))";
  else if (hasDist)       districtExpr = "MAX(b.district)";
  else if (hasCity)       districtExpr = "MAX(b.current_address_city)";
  else                    districtExpr = "'-'";

  return { dealerExpr, districtExpr };
}

/* ================================================================
   DISBURSAL TREND QUERY BUILDER
   ================================================================ */

function buildDisbursalTrendSQL(prod, start, end) {
  const unions = [];
  const params = [];

  for (const [key, cfg] of Object.entries(PRODUCT_MAP)) {
    if (prod !== "ALL" && prod !== key) continue;

    const dr = buildDateRangeClause("agreement_date", start, end);
    unions.push(`
      SELECT
        DATE_FORMAT(lb.agreement_date, '%Y-%m-%d') AS month,
        '${cfg.label}' AS product,
        SUM(mr.principal) AS total_disbursed
      FROM ${cfg.bookTable} lb
      JOIN ${cfg.rpsTable} mr ON lb.lan = mr.lan
      WHERE 1=1 ${dr.clause}
      GROUP BY DATE_FORMAT(lb.agreement_date, '%Y-%m-%d')
    `);
    params.push(...dr.params);
  }

  if (!unions.length) return { sql: null, params: [] };

  const sql = unions.join(" UNION ALL ") + " ORDER BY month, product";
  return { sql, params };
}

/* ================================================================
   METRIC CARDS QUERY BUILDER + EXECUTOR
   ================================================================ */

async function buildMetricCards(prod, start, end, db) {
  const pclR = buildDateRangeClause("r.payment_date", start, end);
  const pclA = buildDateRangeClause("payment_date", start, end);
  const jsToday = new Date().toISOString().slice(0, 10);
  const cutoff = end || jsToday;

  const disburseQueries = [];
  const disburseParams = [];
  const collectQueries = [];
  const collectParams = [];
  const pniQueries = [];
  const pniParams = [];
  const dpdQueries = [];
  const dpdParams = [];

  for (const [key, cfg] of Object.entries(PRODUCT_MAP)) {
    if (prod !== "ALL" && prod !== key) continue;

    // --- Disbursement ---
    const dcl = buildDateRangeClause("agreement_date", start, end);
    disburseQueries.push(`
      SELECT IFNULL(SUM(${cfg.disbField}), 0) AS amount
      FROM ${cfg.bookTable}
      WHERE status IN ('Disbursed') ${dcl.clause}
    `);
    disburseParams.push(...dcl.params);

    // --- Collections ---
    if (cfg.collType === "join") {
      collectQueries.push(`
        SELECT IFNULL(SUM(r.transfer_amount), 0) AS amount
        FROM repayments_upload r
        JOIN ${cfg.collBook} b ON ${eqLan("b.lan", "r.lan")}
        WHERE r.payment_date IS NOT NULL AND b.status = 'Disbursed'
        ${pclR.clause}
      `);
      collectParams.push(...pclR.params);
    } else if (cfg.collType === "direct") {
      collectQueries.push(`
        SELECT IFNULL(SUM(transfer_amount), 0) AS amount
        FROM ${cfg.collBook}
        WHERE payment_date IS NOT NULL ${pclA.clause}
      `);
      collectParams.push(...pclA.params);
    } else {
      // subquery
      collectQueries.push(`
        SELECT IFNULL(SUM(transfer_amount), 0) AS amount
        FROM repayments_upload
        WHERE payment_date IS NOT NULL
          AND lan COLLATE ${JOIN_COLLATE} IN (
            SELECT lan COLLATE ${JOIN_COLLATE} FROM ${cfg.bookTable} WHERE status = 'Disbursed'
          )
          ${pclA.clause}
      `);
      collectParams.push(...pclA.params);
    }

    // --- PNI Range ---
    const r = buildDateRangeClause("bank_date_allocation", start, end);
    pniQueries.push(`
      SELECT
        IFNULL(SUM(CASE WHEN charge_type='Principal' THEN allocated_amount ELSE 0 END),0) AS principal,
        IFNULL(SUM(CASE WHEN charge_type='Interest'  THEN allocated_amount ELSE 0 END),0) AS interest
      FROM ${cfg.allocTable}
      WHERE allocation_date IS NOT NULL ${r.clause}
        AND lan LIKE '${cfg.allocLike}'
    `);
    pniParams.push(...r.params);

    // --- DPD ---
    const br = buildDateRangeClause("b.agreement_date", start, end);
    dpdQueries.push(`
      SELECT
        '${key}' AS lender,
        COUNT(DISTINCT CASE WHEN rps.dpd BETWEEN 0  AND 30  THEN rps.lan END) AS dpd_0_30,
        COUNT(DISTINCT CASE WHEN rps.dpd BETWEEN 31 AND 60  THEN rps.lan END) AS dpd_31_60,
        COUNT(DISTINCT CASE WHEN rps.dpd BETWEEN 61 AND 90  THEN rps.lan END) AS dpd_61_90,
        COUNT(DISTINCT CASE WHEN rps.dpd > 90              THEN rps.lan END) AS dpd_91_plus,
        IFNULL(SUM(rps.remaining_principal), 0) AS remaining_principal
      FROM ${cfg.rpsTable} rps
      JOIN ${cfg.bookTable} b ON ${eqLan("b.lan", "rps.lan")}
      WHERE b.status = 'Disbursed' ${br.clause}
    `);
    dpdParams.push(...br.params);
  }

  // Execute all 4 groups in parallel
  const [
    [disbRows],
    [collRows],
    [pniRows],
    [dpdRows],
  ] = await Promise.all([
    db.promise().query(disburseQueries.join(" UNION ALL "), disburseParams),
    db.promise().query(collectQueries.join(" UNION ALL "), collectParams),
    db.promise().query(pniQueries.join(" UNION ALL "), pniParams),
    db.promise().query(dpdQueries.join(" UNION ALL "), dpdParams),
  ]);

  const totalDisbursed  = disbRows.reduce((s, r) => s + Number(r.amount || 0), 0);
  const totalCollected  = collRows.reduce((s, r) => s + Number(r.amount || 0), 0);
  const totalPrincipal  = pniRows.reduce((s, r) => s + Number(r.principal || 0), 0);
  const totalInterest   = pniRows.reduce((s, r) => s + Number(r.interest || 0), 0);
  const dpd_0_30        = dpdRows.reduce((s, r) => s + Number(r.dpd_0_30 || 0), 0);
  const dpd_31_60       = dpdRows.reduce((s, r) => s + Number(r.dpd_31_60 || 0), 0);
  const dpd_61_90       = dpdRows.reduce((s, r) => s + Number(r.dpd_61_90 || 0), 0);
  const dpd_91_plus     = dpdRows.reduce((s, r) => s + Number(r.dpd_91_plus || 0), 0);
  const totalRemainingPrincipal = dpdRows.reduce((s, r) => s + Number(r.remaining_principal || 0), 0);

  const collectionRate = totalDisbursed ? (totalCollected / totalDisbursed) * 100 : 0;

  const lenderWiseDPD = dpdRows.map(row => ({
    lender:            row.lender,
    dpd_0_30:          Number(row.dpd_0_30 || 0),
    dpd_31_60:         Number(row.dpd_31_60 || 0),
    dpd_61_90:         Number(row.dpd_61_90 || 0),
    dpd_91_plus:       Number(row.dpd_91_plus || 0),
    remainingPrincipal: Number(row.remaining_principal || 0),
  }));

  return {
    totalDisbursed,
    totalCollected,
    collectionRate,
    totalPrincipal,
    totalInterest,
    principalOutstanding: totalRemainingPrincipal,
    interestOutstanding:  0,
    posOutstanding:       totalRemainingPrincipal,
    dpdCases:             { dpd_0_30, dpd_31_60, dpd_61_90, dpd_91_plus },
    lenderWiseDPD,
  };
}

/* ================================================================
   DPD BUCKETS QUERY BUILDER + EXECUTOR
   ================================================================ */

async function buildDpdBuckets(prod, db) {
  const BUCKET_ORDER = `'ALL','active','0','0-30','30-60','60-90','90+','closed'`;

  const branchBucket = (rpsTable, bookTable) => `
    SELECT
      CASE
        WHEN t.max_dpd = 0              THEN '0'
        WHEN t.max_dpd BETWEEN 1 AND 30 THEN '0-30'
        WHEN t.max_dpd BETWEEN 31 AND 60 THEN '30-60'
        WHEN t.max_dpd BETWEEN 61 AND 90 THEN '60-90'
        ELSE '90+'
      END AS bucket,
      COUNT(DISTINCT t.lan) AS loans,
      SUM(t.overdue_emi) AS overdue_emi
    FROM (
      SELECT rps.lan,
             MAX(CASE WHEN rps.status <> 'Paid' AND rps.due_date < CURDATE()
                      THEN IFNULL(rps.dpd, DATEDIFF(CURDATE(), rps.due_date)) ELSE 0 END) AS max_dpd,
             SUM(CASE WHEN rps.status <> 'Paid' AND rps.due_date < CURDATE() THEN IFNULL(rps.emi,0) ELSE 0 END) AS overdue_emi
      FROM ${rpsTable} rps
      JOIN ${bookTable} b ON b.lan = rps.lan
      WHERE LOWER(b.status) = 'disbursed'
      GROUP BY rps.lan
    ) t
    GROUP BY bucket
  `;

  const branchAll = (rpsTable, bookTable) => `
    SELECT 'ALL' AS bucket,
           COUNT(DISTINCT t.lan) AS loans,
           SUM(t.overdue_emi) AS overdue_emi
    FROM (
      SELECT rps.lan,
             SUM(CASE WHEN rps.status <> 'Paid' AND rps.due_date < CURDATE() THEN IFNULL(rps.emi,0) ELSE 0 END) AS overdue_emi
      FROM ${rpsTable} rps
      JOIN ${bookTable} b ON b.lan = rps.lan
      WHERE LOWER(b.status) = 'disbursed'
      GROUP BY rps.lan
    ) t
  `;

  const branchActive = (rpsTable, bookTable) => `
    SELECT 'active' AS bucket,
           COUNT(DISTINCT t.lan) AS loans,
           SUM(t.overdue_emi) AS overdue_emi
    FROM (
      SELECT rps.lan,
             SUM(CASE WHEN rps.status <> 'Paid' AND rps.due_date < CURDATE() THEN IFNULL(rps.emi,0) ELSE 0 END) AS overdue_emi
      FROM ${rpsTable} rps
      JOIN ${bookTable} b ON b.lan = rps.lan
      WHERE LOWER(b.status) = 'disbursed'
      GROUP BY rps.lan
    ) t
  `;

  const branchClosed = (rpsTable, bookTable) => `
    SELECT 'closed' AS bucket,
           COUNT(DISTINCT b.lan) AS loans,
           0 AS overdue_emi
    FROM ${bookTable} b
    WHERE LOWER(b.status) NOT IN ('disbursed','login','disburse initiate','rejected','approved')
  `;

  const unions = [];
  for (const [key, cfg] of Object.entries(PRODUCT_MAP)) {
    if (prod !== "ALL" && prod !== key) continue;
    unions.push(branchBucket(cfg.rpsTable, cfg.bookTable));
    unions.push(branchAll(cfg.rpsTable, cfg.bookTable));
    unions.push(branchActive(cfg.rpsTable, cfg.bookTable));
    unions.push(branchClosed(cfg.rpsTable, cfg.bookTable));
  }

  if (!unions.length) {
    return { buckets: [], asOf: new Date().toISOString().slice(0, 10) };
  }

  const sql = `
    SELECT bucket,
           SUM(loans)       AS loans,
           SUM(overdue_emi) AS overdue_emi
    FROM (${unions.join(" UNION ALL ")}) x
    GROUP BY bucket
    ORDER BY FIELD(bucket, ${BUCKET_ORDER})
  `;

  const [rows] = await db.promise().query(sql);

  const map = {
    ALL:     { bucket: "ALL",     loans: 0, overdue_emi: 0 },
    active:  { bucket: "active",  loans: 0, overdue_emi: 0 },
    "0":     { bucket: "0",       loans: 0, overdue_emi: 0 },
    "0-30":  { bucket: "0-30",    loans: 0, overdue_emi: 0 },
    "30-60": { bucket: "30-60",   loans: 0, overdue_emi: 0 },
    "60-90": { bucket: "60-90",   loans: 0, overdue_emi: 0 },
    "90+":   { bucket: "90+",     loans: 0, overdue_emi: 0 },
    closed:  { bucket: "closed",  loans: 0, overdue_emi: 0 },
  };

  rows.forEach(r => {
    map[r.bucket] = {
      bucket:      r.bucket,
      loans:       Number(r.loans || 0),
      overdue_emi: Number(r.overdue_emi || 0),
    };
  });

  return {
    buckets: [map.ALL, map.active, map["0"], map["0-30"], map["30-60"], map["60-90"], map["90+"], map.closed],
    asOf: new Date().toISOString().slice(0, 10),
  };
}

/* ================================================================
   DPD LIST QUERY BUILDER + EXECUTOR
   Uses pre-warmed column schema cache — zero SHOW COLUMNS per request.
   ================================================================ */

const SORT_MAP = {
  pos:      "pos_principal",
  emi:      "overdue_emi",
  dpd:      "max_dpd",
  due:      "last_due_date",
  ageing:   "ageing_days",
  customer: "customer_name",
  dealer:   "dealer_name",
  district: "district",
};

async function buildDpdList({ prod, bucket, page, pageSize, sortBy, sortDir }, db) {
  const ranges = { "0-30": [1, 30], "30-60": [31, 60], "60-90": [61, 90] };
  let havingStr = "";
  let isClosed = false;
  let isActive = false;

  if (bucket === "0")           havingStr = "HAVING max_dpd = 0";
  else if (bucket === "90+")    havingStr = "HAVING max_dpd >= 91";
  else if (ranges[bucket]) {
    const [mn, mx] = ranges[bucket];
    havingStr = `HAVING max_dpd BETWEEN ${mn} AND ${mx}`;
  } else if (bucket === "closed") isClosed = true;
  else if (bucket === "active")   isActive = true;
  else throw new Error(`Invalid bucket: ${bucket}`);

  // Build per-product branch SQL (all in parallel using cached schema)
  const branchPromises = Object.entries(PRODUCT_MAP)
    .filter(([key]) => prod === "ALL" || prod === key)
    .map(([, cfg]) => {
      const { dealerExpr, districtExpr } = getColumnExpressions(cfg.bookTable);

      const whereClause = isClosed
        ? "WHERE LOWER(b.status) NOT IN ('disbursed','login','disburse initiate')"
        : "WHERE LOWER(b.status) = 'disbursed'";

      return `
        SELECT '${cfg.label}' AS product,
               rps.lan,
               MAX(b.customer_name) AS customer_name,
               ${dealerExpr} AS dealer_name,
               ${districtExpr} AS district,
               MAX(b.status) AS status,
               CASE
                 WHEN LOWER(b.status) = 'disbursed' THEN 'Active'
                 WHEN LOWER(b.status) IN ('fully paid','settled & closed','closed','completed','settled','closed & reopen') THEN 'Closed'
                 ELSE 'Unknown'
               END AS loan_status,
               MAX(IFNULL(rps.dpd, DATEDIFF(CURDATE(), rps.due_date))) AS max_dpd,
               SUM(CASE WHEN rps.status <> 'Paid' AND rps.due_date < CURDATE() THEN IFNULL(rps.emi, 0)       ELSE 0 END) AS overdue_emi,
               SUM(CASE WHEN rps.status <> 'Paid' AND rps.due_date < CURDATE() THEN IFNULL(rps.principal, 0) ELSE 0 END) AS overdue_principal,
               SUM(CASE WHEN rps.status <> 'Paid' AND rps.due_date < CURDATE() THEN IFNULL(rps.interest, 0)  ELSE 0 END) AS overdue_interest,
               MAX(CASE WHEN rps.status <> 'Paid' AND rps.due_date < CURDATE() THEN rps.due_date END) AS last_due_date,
               SUM(IFNULL(rps.remaining_principal, 0)) AS pos_principal
        FROM ${cfg.rpsTable} rps
        JOIN ${cfg.bookTable} b ON b.lan COLLATE ${JOIN_COLLATE} = rps.lan COLLATE ${JOIN_COLLATE}
        ${whereClause}
        GROUP BY rps.lan
        ${!isActive ? havingStr : ""}
      `;
    });

  if (!branchPromises.length) {
    return { rows: [], pagination: { page, pageSize, total: 0 } };
  }

  const sortKey = typeof sortBy === "string" ? sortBy.toLowerCase() : "dpd";
  const sortCol = SORT_MAP[sortKey] || SORT_MAP.dpd;
  const sortDirSafe = String(sortDir || "desc").toLowerCase() === "asc" ? "ASC" : "DESC";
  const offset = (page - 1) * pageSize;

  const sql = `
    WITH d AS (
      SELECT lan, MIN(Disbursement_Date) AS disbursement_date
      FROM ev_disbursement_utr
      GROUP BY lan
    ),
    base AS (
      ${branchPromises.join(" UNION ALL ")}
    )
    SELECT base.*, d.disbursement_date,
           DATEDIFF(CURDATE(), d.disbursement_date) AS ageing_days,
           COUNT(*) OVER() AS total_rows
    FROM base
    LEFT JOIN d ON d.lan = base.lan
    ORDER BY ${sortCol} ${sortDirSafe}, lan ASC
    LIMIT ? OFFSET ?
  `;

  const [pageRows] = await db.promise().query(sql, [pageSize, offset]);
  const total = pageRows.length ? Number(pageRows[0].total_rows) : 0;
  const rows = pageRows.map(({ total_rows, ...r }) => r);

  return { rows, pagination: { page, pageSize, total } };
}

/* ================================================================
   EXPORTS
   ================================================================ */

module.exports = {
  PRODUCT_MAP,
  normalizeProduct,
  dayRange,
  buildDateRangeClause,
  eqLan,
  initColumnSchemaCache,
  getColumnExpressions,
  buildDisbursalTrendSQL,
  buildMetricCards,
  buildDpdBuckets,
  buildDpdList,
};
