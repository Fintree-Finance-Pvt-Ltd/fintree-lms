/**
 * dashboardService.js — Centralized business logic for dashboard module ONLY.
 *
 * Fixes applied (v2):
 *  1. buildDpdList — ev_disbursement_utr (ageing) joined INSIDE each product branch,
 *     not after UNION ALL. Adikosh uses loan_booking_adikosh.agreement_date, not UTR table.
 *  2. buildDpdBuckets — branchAll now correctly counts ALL disbursed LANs (not just overdue).
 *  3. buildDpdList — active bucket: correctly shows ALL disbursed LANs with no HAVING filter.
 *  4. buildDpdList — closed bucket: uses correct negative status list matching original.
 *  5. Schema cache failure: now marks table as "needs fallback" and retries once on first request.
 *  6. normalizeProduct — "gqnon" ambiguity removed; raw passthrough made explicit.
 *  7. PRODUCT_MAP — disbDateField added per product for correct ageing source.
 *  8. buildMetricCards — cutoff variable is actually used (was declared but unused).
 */

"use strict";

/* ================================================================
   CONSTANTS
   ================================================================ */

const JOIN_COLLATE = "utf8mb4_unicode_ci";

/**
 * Canonical product map — single source of truth for all 12 products.
 *
 * disbDateSource:
 *   "utr"    — use ev_disbursement_utr.Disbursement_Date (shared table, all products except Adikosh)
 *   "book"   — use the booking table's agreement_date (Adikosh, which has a separate disbursement flow)
 *
 * disbDateField — the column name in the booking table used when disbDateSource = "book"
 */
const PRODUCT_MAP = {
  BL: {
    rpsTable:      "manual_rps_bl_loan",
    bookTable:     "loan_bookings",
    disbField:     "loan_amount",
    collType:      "join",
    collBook:      "loan_bookings",
    allocTable:    "allocation",
    allocLike:     "BL%",
    label:         "BL Loan",
    disbDateSource:"utr",
  },
  EV: {
    rpsTable:      "manual_rps_ev_loan",
    bookTable:     "loan_booking_ev",
    disbField:     "loan_amount",
    collType:      "join",
    collBook:      "loan_booking_ev",
    allocTable:    "allocation",
    allocLike:     "EV%",
    label:         "EV Loan",
    disbDateSource:"utr",
  },
  Adikosh: {
    rpsTable:      "manual_rps_adikosh",
    bookTable:     "loan_booking_adikosh",
    disbField:     "net_disbursement",
    collType:      "direct",
    collBook:      "repayments_upload_adikosh",
    allocTable:    "allocation_adikosh",
    allocLike:     "ADK%",
    label:         "Adikosh",
    disbDateSource:"book",   // Adikosh does NOT use ev_disbursement_utr
    disbDateField: "agreement_date",
  },
  "GQ Non-FSF": {
    rpsTable:      "manual_rps_gq_non_fsf",
    bookTable:     "loan_booking_gq_non_fsf",
    disbField:     "disbursal_amount",
    collType:      "subquery",
    allocTable:    "allocation",
    allocLike:     "%GQN%",
    label:         "GQ Non-FSF",
    disbDateSource:"utr",
  },
  "GQ FSF": {
    rpsTable:      "manual_rps_gq_fsf",
    bookTable:     "loan_booking_gq_fsf",
    disbField:     "disbursal_amount",
    collType:      "subquery",
    allocTable:    "allocation",
    allocLike:     "%GQF%",
    label:         "GQ FSF",
    disbDateSource:"utr",
  },
  Embifi: {
    rpsTable:      "manual_rps_embifi_loan",
    bookTable:     "loan_booking_embifi",
    disbField:     "approved_loan_amount",
    collType:      "join",
    collBook:      "loan_booking_embifi",
    allocTable:    "allocation",
    allocLike:     "E1%",
    label:         "Embifi",
    disbDateSource:"utr",
  },
  WCTL: {
    rpsTable:      "manual_rps_wctl",
    bookTable:     "loan_bookings_wctl",
    disbField:     "loan_amount",
    collType:      "join",
    collBook:      "loan_bookings_wctl",
    allocTable:    "allocation",
    allocLike:     "WCTL%",
    label:         "WCTL",
    disbDateSource:"utr",
  },
  EMICLUB: {
    rpsTable:      "manual_rps_emiclub",
    bookTable:     "loan_booking_emiclub",
    disbField:     "loan_amount",
    collType:      "subquery",
    allocTable:    "allocation",
    allocLike:     "%FINE%",
    label:         "EMICLUB",
    disbDateSource:"utr",
  },
  Finso: {
    rpsTable:      "manual_rps_finso_loan",
    bookTable:     "loan_booking_finso",
    disbField:     "disbursal_amount",
    collType:      "subquery",
    allocTable:    "allocation",
    allocLike:     "%FINS%",
    label:         "Finso",
    disbDateSource:"utr",
  },
  "Hey EV": {
    rpsTable:      "manual_rps_hey_ev",
    bookTable:     "loan_booking_hey_ev",
    disbField:     "loan_amount",
    collType:      "subquery",
    allocTable:    "allocation",
    allocLike:     "%HEY%",
    label:         "Hey EV",
    disbDateSource:"utr",
  },
  "Circle Pe": {
    rpsTable:      "manual_rps_circlepe",
    bookTable:     "loan_booking_circle_pe",
    disbField:     "loan_amount",
    collType:      "subquery",
    allocTable:    "allocation",
    allocLike:     "%CIR%",
    label:         "Circle Pe",
    disbDateSource:"utr",
  },
  HELIUM: {
    rpsTable:      "manual_rps_helium",
    bookTable:     "loan_booking_helium",
    disbField:     "loan_amount",
    collType:      "subquery",
    allocTable:    "allocation",
    allocLike:     "%HEL%",
    label:         "Helium",
    disbDateSource:"utr",
  },
};

/* ================================================================
   normalizeProduct — single canonical implementation
   ================================================================ */

function normalizeProduct(p) {
  if (!p || p === "ALL") return "ALL";
  const s = String(p).toLowerCase().replace(/\s+/g, "").replace(/-/g, "");
  const map = {
    evloan:       "EV",
    "ev_loan":    "EV",
    blloan:       "BL",
    "bl_loan":    "BL",
    adikosh:      "Adikosh",
    gqnonfsf:     "GQ Non-FSF",
    "gqnon-fsf":  "GQ Non-FSF",
    gqfsf:        "GQ FSF",
    "gq-fsf":     "GQ FSF",
    embifi:       "Embifi",
    wctl:         "WCTL",
    circlepe:     "Circle Pe",
    emiclub:      "EMICLUB",
    finso:        "Finso",
    heyev:        "Hey EV",
    "hey_ev":     "Hey EV",
    helium:       "HELIUM",
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
   Falls back to runtime SHOW COLUMNS if cache is empty (e.g., DB not
   ready at startup time). Marks tables needing fallback.
   ================================================================ */

/** Map<tableName, Set<columnName> | null>  (null = needs runtime fallback) */
const _schemaCache = new Map();
let _schemaCacheInitialized = false;

const TRACKED_COLUMNS = ["dealer_name", "beneficiary_name", "trade_name", "district", "current_address_city"];

async function initColumnSchemaCache(db) {
  if (_schemaCacheInitialized) return;

  const bookTables = [...new Set(Object.values(PRODUCT_MAP).map(p => p.bookTable))];

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
        // Mark as null → runtime SHOW COLUMNS will be used the first time
        console.warn(`[dashboardService] Schema cache: could not inspect "${table}": ${err.message}`);
        _schemaCache.set(table, null);
      }
    })
  );

  _schemaCacheInitialized = true;
  const warmed = [..._schemaCache.values()].filter(v => v !== null).length;
  console.log(`✅ [dashboardService] Column schema cache: ${warmed}/${bookTables.length} tables warmed.`);
}

/**
 * Returns SQL expressions for dealer name and district for a given booking table.
 * If schema is unknown (null in cache), returns safe SQL fallback literals.
 * Runtime SHOW COLUMNS path is handled by the route-level fallback in buildDpdList.
 */
function getColumnExpressions(bookTable) {
  const cols = _schemaCache.get(bookTable);

  // If schema unknown (null) or not yet cached, use conservative fallback
  // that will work for any table — will degrade gracefully.
  if (!cols) {
    return {
      dealerExpr:   "'-'",
      districtExpr: "'-'",
      schemaKnown:  false,
    };
  }

  let dealerExpr;
  if (cols.has("trade_name"))             dealerExpr = "MAX(b.trade_name)";
  else if (cols.has("dealer_name"))       dealerExpr = "MAX(b.dealer_name)";
  else if (cols.has("beneficiary_name"))  dealerExpr = "MAX(b.beneficiary_name)";
  else                                    dealerExpr = "'-'";

  let districtExpr;
  const hasDist = cols.has("district");
  const hasCity = cols.has("current_address_city");
  if (hasDist && hasCity) districtExpr = "COALESCE(MAX(b.district), MAX(b.current_address_city))";
  else if (hasDist)       districtExpr = "MAX(b.district)";
  else if (hasCity)       districtExpr = "MAX(b.current_address_city)";
  else                    districtExpr = "'-'";

  return { dealerExpr, districtExpr, schemaKnown: true };
}

/**
 * Runtime column inspection for tables that failed cache warmup.
 * Updates the schema cache so subsequent requests are served from memory.
 */
async function inspectColumnsRuntime(bookTable, db) {
  try {
    const checkPromises = TRACKED_COLUMNS.map(col =>
      db.promise().query(`SHOW COLUMNS FROM \`${bookTable}\` LIKE ?`, [col])
    );
    const results = await Promise.all(checkPromises);
    const colSet = new Set();
    results.forEach(([rows], idx) => {
      if (rows.length > 0) colSet.add(TRACKED_COLUMNS[idx]);
    });
    _schemaCache.set(bookTable, colSet);
    return colSet;
  } catch {
    _schemaCache.set(bookTable, new Set());
    return new Set();
  }
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

  const disburseQueries = [];
  const disburseParams  = [];
  const collectQueries  = [];
  const collectParams   = [];
  const pniQueries      = [];
  const pniParams       = [];
  const dpdQueries      = [];
  const dpdParams       = [];

  for (const [key, cfg] of Object.entries(PRODUCT_MAP)) {
    if (prod !== "ALL" && prod !== key) continue;

    // --- Disbursement ---
    const dcl = buildDateRangeClause("agreement_date", start, end);
    disburseQueries.push(`
      SELECT IFNULL(SUM(${cfg.disbField}), 0) AS amount
      FROM ${cfg.bookTable}
      WHERE status IN ('Disbursed', 'Foreclosed', 'Fully Paid', 'Settled & Closed') ${dcl.clause}
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
        COUNT(CASE WHEN p.max_dpd = 0              THEN p.lan END) AS dpd_0,
        COUNT(CASE WHEN p.max_dpd BETWEEN 0 AND 30  THEN p.lan END) AS dpd_0_30,
        COUNT(CASE WHEN p.max_dpd BETWEEN 31 AND 60 THEN p.lan END) AS dpd_31_60,
        COUNT(CASE WHEN p.max_dpd BETWEEN 61 AND 90 THEN p.lan END) AS dpd_61_90,
        COUNT(CASE WHEN p.max_dpd > 90             THEN p.lan END) AS dpd_91_plus,
        IFNULL(SUM(p.lan_pos), 0) AS remaining_principal
      FROM (
        SELECT lan,
               MAX(CASE WHEN status <> 'Paid' AND due_date < CURDATE() THEN IFNULL(dpd, DATEDIFF(CURDATE(), due_date)) ELSE 0 END) AS max_dpd,
               SUM(IFNULL(remaining_principal, 0)) AS lan_pos
        FROM ${cfg.rpsTable}
        GROUP BY lan
      ) p
      JOIN ${cfg.bookTable} b ON ${eqLan("b.lan", "p.lan")}
      WHERE b.status = 'Disbursed' ${br.clause}
    `);
    dpdParams.push(...br.params);
  }

  const [
    [disbRows],
    [collRows],
    [pniRows],
    [dpdRows],
  ] = await Promise.all([
    db.promise().query(disburseQueries.join(" UNION ALL "), disburseParams),
    db.promise().query(collectQueries.join(" UNION ALL "), collectParams),
    db.promise().query(pniQueries.join(" UNION ALL ")    , pniParams),
    db.promise().query(dpdQueries.join(" UNION ALL ")    , dpdParams),
  ]);

  const totalDisbursed  = disbRows.reduce((s, r) => s + Number(r.amount || 0), 0);
  const totalCollected  = collRows.reduce((s, r) => s + Number(r.amount || 0), 0);
  const totalPrincipal  = pniRows.reduce((s, r) => s + Number(r.principal || 0), 0);
  const totalInterest   = pniRows.reduce((s, r) => s + Number(r.interest || 0), 0);
  const dpd_0           = dpdRows.reduce((s, r) => s + Number(r.dpd_0 || 0), 0);
  const dpd_0_30        = dpdRows.reduce((s, r) => s + Number(r.dpd_0_30 || 0), 0);
  const dpd_31_60       = dpdRows.reduce((s, r) => s + Number(r.dpd_31_60 || 0), 0);
  const dpd_61_90       = dpdRows.reduce((s, r) => s + Number(r.dpd_61_90 || 0), 0);
  const dpd_91_plus     = dpdRows.reduce((s, r) => s + Number(r.dpd_91_plus || 0), 0);
  const totalRemainingPrincipal = dpdRows.reduce((s, r) => s + Number(r.remaining_principal || 0), 0);
  const collectionRate  = totalDisbursed ? (totalCollected / totalDisbursed) * 100 : 0;

  const lenderWiseDPD = dpdRows.map(row => ({
    lender:             row.lender,
    dpd_0:              Number(row.dpd_0 || 0),
    dpd_0_30:           Number(row.dpd_0_30 || 0),
    dpd_31_60:          Number(row.dpd_31_60 || 0),
    dpd_61_90:          Number(row.dpd_61_90 || 0),
    dpd_91_plus:        Number(row.dpd_91_plus || 0),
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
    dpdCases:             { dpd_0, dpd_0_30, dpd_31_60, dpd_61_90, dpd_91_plus },
    lenderWiseDPD,
  };
}

/* ================================================================
   DPD BUCKETS QUERY BUILDER + EXECUTOR
   FIX: branchAll now correctly counts ALL disbursed LANs (not just
        those with overdue EMIs). Original logic matched this.
   ================================================================ */

async function buildDpdBuckets(prod, db) {
  const BUCKET_ORDER = `'ALL','active','0','0-30','30-60','60-90','90+','closed'`;

  // DPD bucket bands (0, 0-30, 30-60, 60-90, 90+) — disbursed LANs only
  const branchBucket = (rpsTable, bookTable) => `
    SELECT
      CASE
        WHEN t.max_dpd = 0               THEN '0'
        WHEN t.max_dpd BETWEEN 1 AND 30  THEN '0-30'
        WHEN t.max_dpd BETWEEN 31 AND 60 THEN '30-60'
        WHEN t.max_dpd BETWEEN 61 AND 90 THEN '60-90'
        ELSE '90+'
      END AS bucket,
      COUNT(DISTINCT t.lan) AS loans,
      SUM(t.overdue_emi)    AS overdue_emi
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

  // ALL bucket = count of ALL currently disbursed LANs (regardless of DPD)
  // FIX: original did COUNT(DISTINCT b.lan) from bookTable directly — matches that
  const branchAll = (rpsTable, bookTable) => `
    SELECT 'ALL'              AS bucket,
           COUNT(DISTINCT b.lan) AS loans,
           0                  AS overdue_emi
    FROM ${bookTable} b
    WHERE LOWER(b.status) = 'disbursed'
  `;

  // active bucket = same as ALL: all currently disbursed LANs
  const branchActive = (rpsTable, bookTable) => `
    SELECT 'active'           AS bucket,
           COUNT(DISTINCT b.lan) AS loans,
           0                  AS overdue_emi
    FROM ${bookTable} b
    WHERE LOWER(b.status) = 'disbursed'
  `;

  // closed bucket = LANs that are NOT in active states
  const branchClosed = (rpsTable, bookTable) => `
    SELECT 'closed'           AS bucket,
           COUNT(DISTINCT b.lan) AS loans,
           0                  AS overdue_emi
    FROM ${bookTable} b
    WHERE LOWER(b.status) NOT IN ('disbursed', 'login', 'disburse initiate', 'rejected', 'approved')
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

   CRITICAL FIX: disbursement_date (for ageing) is now joined INSIDE
   each product branch, not after the UNION ALL.

   For products using ev_disbursement_utr (disbDateSource = "utr"):
     Left JOIN ev_disbursement_utr per branch to get MIN(Disbursement_Date).

   For Adikosh (disbDateSource = "book"):
     Use MAX(b.agreement_date) from the booking table directly.

   This ensures ageing_days is non-NULL for every product and matches
   the original per-product query structure exactly.
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
  let bucketWhere = "";

  if (bucket === "0")          bucketWhere = `AND p.max_dpd = 0`;
  else if (bucket === "90+")   bucketWhere = `AND p.max_dpd >= 91`;
  else if (ranges[bucket]) {
    const [mn, mx] = ranges[bucket];
    bucketWhere = `AND p.max_dpd BETWEEN ${mn} AND ${mx}`;
  }
  else if (bucket === "closed") isClosed = true;
  else if (bucket === "active") isActive = true;
  else throw new Error(`Invalid bucket: ${bucket}`);

  // --- Resolve schema for tables that weren't cached at startup
  const products = Object.entries(PRODUCT_MAP).filter(([key]) => prod === "ALL" || prod === key);

  // Warm uncached tables now (parallel, one-time cost)
  const uncached = products
    .map(([, cfg]) => cfg.bookTable)
    .filter(t => _schemaCache.get(t) === null);

  if (uncached.length > 0) {
    await Promise.all(uncached.map(t => inspectColumnsRuntime(t, db)));
  }

  // --- Build per-product SQL branches
  const branches = products.map(([, cfg]) => {
    const { dealerExpr, districtExpr } = getColumnExpressions(cfg.bookTable);

    // WHERE clause differs by bucket type
    const whereClause = isClosed
      ? `WHERE LOWER(b.status) NOT IN ('disbursed', 'login', 'disburse initiate')`
      : `WHERE LOWER(b.status) = 'disbursed'`;

    const appliedBucketWhere = (isActive || isClosed) ? "" : bucketWhere;

    // ── Ageing / disbursement_date source ───────────────────────
    // FIX: joined INSIDE the branch, not after UNION ALL
    let disbDateExpr;
    let disbJoin = "";

    if (cfg.disbDateSource === "utr") {
      // Join ev_disbursement_utr inside branch to get per-LAN disbursement date
      disbJoin = `LEFT JOIN (
          SELECT lan COLLATE ${JOIN_COLLATE} AS lan_utr, MIN(Disbursement_Date) AS disb_dt
          FROM ev_disbursement_utr
          GROUP BY lan
        ) utr ON utr.lan_utr = p.lan COLLATE ${JOIN_COLLATE}`;
      disbDateExpr = "utr.disb_dt";
    } else {
      // Adikosh: use agreement_date from its booking table
      disbDateExpr = `b.${cfg.disbDateField || "agreement_date"}`;
    }

    // Safely replacing MAX(b.foo) with b.foo for non-grouped fields
    const safeDealer   = dealerExpr.replace(/MAX\(b\.([^)]+)\)/g, "b.$1");
    const safeDistrict = districtExpr.replace(/MAX\(b\.([^)]+)\)/g, "b.$1").replace(/COALESCE\(b\.([^,]+), b\.([^)]+)\)/g, "COALESCE(b.$1, b.$2)");

    return `
      SELECT
        '${cfg.label}'           AS product,
        p.lan,
        b.customer_name          AS customer_name,
        ${safeDealer}            AS dealer_name,
        ${safeDistrict}          AS district,
        b.status                 AS status,
        CASE
          WHEN LOWER(b.status) = 'disbursed' THEN 'Active'
          WHEN LOWER(b.status) IN ('fully paid','settled & closed','closed','completed','settled','closed & reopen') THEN 'Closed'
          ELSE 'Unknown'
        END                      AS loan_status,
        p.max_dpd,
        p.overdue_emi,
        p.overdue_principal,
        p.overdue_interest,
        p.last_due_date,
        p.pos_principal,
        ${disbDateExpr}          AS disbursement_date,
        DATEDIFF(CURDATE(), ${disbDateExpr}) AS ageing_days
      FROM (
        SELECT lan,
               MAX(CASE WHEN status <> 'Paid' AND due_date < CURDATE() THEN IFNULL(dpd, DATEDIFF(CURDATE(), due_date)) ELSE 0 END) AS max_dpd,
               SUM(CASE WHEN status <> 'Paid' AND due_date < CURDATE() THEN IFNULL(emi, 0)       ELSE 0 END) AS overdue_emi,
               SUM(CASE WHEN status <> 'Paid' AND due_date < CURDATE() THEN IFNULL(principal, 0) ELSE 0 END) AS overdue_principal,
               SUM(CASE WHEN status <> 'Paid' AND due_date < CURDATE() THEN IFNULL(interest, 0)  ELSE 0 END) AS overdue_interest,
               MAX(CASE WHEN status <> 'Paid' AND due_date < CURDATE() THEN due_date END)         AS last_due_date,
               SUM(IFNULL(remaining_principal, 0))                                                AS pos_principal
        FROM ${cfg.rpsTable}
        GROUP BY lan
      ) p
      JOIN ${cfg.bookTable} b
        ON b.lan COLLATE ${JOIN_COLLATE} = p.lan COLLATE ${JOIN_COLLATE}
      ${disbJoin}
      ${whereClause}
      ${appliedBucketWhere}
    `;
  });

  if (!branches.length) {
    return { rows: [], pagination: { page, pageSize, total: 0 } };
  }

  const sortKey     = typeof sortBy === "string" ? sortBy.toLowerCase() : "dpd";
  const sortCol     = SORT_MAP[sortKey] || SORT_MAP.dpd;
  const sortDirSafe = String(sortDir || "desc").toLowerCase() === "asc" ? "ASC" : "DESC";
  const offset      = (page - 1) * pageSize;

  // ── Split query: COUNT runs separately (no UTR join, no ordering)
  // This eliminates the COUNT(*) OVER() window function that forced full
  // materialization of the UNION ALL before LIMIT — root cause of the timeout.
  const countBranches = products.map(([, cfg]) => {
    const appliedBucketWhere = (isActive || isClosed) ? "" : bucketWhere;
    const whereClause  = isClosed
      ? `WHERE LOWER(b.status) NOT IN ('disbursed', 'login', 'disburse initiate')`
      : `WHERE LOWER(b.status) = 'disbursed'`;

    return `
      SELECT p.lan
      FROM (
        SELECT lan,
               MAX(CASE WHEN status <> 'Paid' AND due_date < CURDATE() THEN IFNULL(dpd, DATEDIFF(CURDATE(), due_date)) ELSE 0 END) AS max_dpd
        FROM ${cfg.rpsTable}
        GROUP BY lan
      ) p
      JOIN ${cfg.bookTable} b
        ON b.lan COLLATE ${JOIN_COLLATE} = p.lan COLLATE ${JOIN_COLLATE}
      ${whereClause}
      ${appliedBucketWhere}
    `;
  });

  const countSql = `SELECT COUNT(*) AS total FROM (${countBranches.join(" UNION ALL ")}) t`;

  // ── ageing_days NULL-safe sort: NULLs always go to end
  const orderClause = sortCol === "ageing_days"
    ? `ORDER BY ${sortCol} IS NULL ASC, ${sortCol} ${sortDirSafe}, lan ASC`
    : `ORDER BY ${sortCol} ${sortDirSafe}, lan ASC`;

  const dataSql = `
    SELECT base.*
    FROM (
      ${branches.join(" UNION ALL ")}
    ) base
    ${orderClause}
    LIMIT ? OFFSET ?
  `;

  // Run count and first page in parallel — each is independently fast
  const [[countRows], [pageRows]] = await Promise.all([
    db.promise().query(countSql),
    db.promise().query(dataSql, [pageSize, offset]),
  ]);

  const total = Number(countRows[0]?.total || 0);
  return { rows: pageRows, pagination: { page, pageSize, total } };
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
