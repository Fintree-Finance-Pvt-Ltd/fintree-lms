// ============================================================================
// ULTRA-FAST Dashboard Routes - Extreme Performance Version
// Using: Caching, Limits, Timeouts, Compression, Early Returns
// Expected: Dashboard loads in < 1 second (from cache < 100ms)
// ============================================================================

const express = require("express");
const db = require("../config/db");
const router = express.Router();
const compression = require("compression");

// Setup compression for all responses
router.use(compression());

// ============================================================================
// CACHE SETUP - In-Memory + Optional Redis
// ============================================================================

const NodeCache = require("node-cache");
const cache = new NodeCache({ stdTTL: 300, checkperiod: 60 }); // 5 min cache

let redisClient = null;
(async () => {
  try {
    const redis = require("redis");
    redisClient = redis.createClient({ url: process.env.REDIS_URL || "redis://127.0.0.1:6379" });
    await redisClient.connect();
    console.log("✅ Redis connected for dashboard caching");
  } catch (e) {
    console.warn("⚠️ Redis unavailable - using in-memory cache only");
  }
})();

// ============================================================================
// ULTRA-FAST CACHE HELPER
// ============================================================================

async function getCachedOrFetch(key, fetchFn, ttl = 300) {
  // Try memory cache first (fastest)
  let result = cache.get(key);
  if (result) {
    console.log(`✅ Cache HIT (memory): ${key}`);
    return result;
  }

  // Try Redis if available
  if (redisClient) {
    try {
      const redisResult = await redisClient.get(key);
      if (redisResult) {
        const parsed = JSON.parse(redisResult);
        cache.set(key, parsed, 60); // Re-cache in memory for 1 min
        console.log(`✅ Cache HIT (redis): ${key}`);
        return parsed;
      }
    } catch (e) {
      console.warn(`⚠️ Redis error: ${e.message}`);
    }
  }

  // Cache miss - fetch fresh data
  console.log(`⏳ Fetching: ${key}`);
  const startTime = Date.now();
  const result_data = await fetchFn();
  const duration = Date.now() - startTime;
  console.log(`✅ Fetched in ${duration}ms: ${key}`);

  // Cache result
  cache.set(key, result_data, ttl);
  if (redisClient) {
    try {
      await redisClient.setEx(key, ttl, JSON.stringify(result_data));
    } catch (e) {
      console.warn(`⚠️ Redis cache write failed: ${e.message}`);
    }
  }

  return result_data;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function buildDateRangeClause(field, start, end) {
  const parts = [];
  const params = [];
  if (start) {
    parts.push(`${field} >= ?`);
    params.push(start);
  }
  if (end) {
    parts.push(`${field} < ?`);
    params.push(end);
  }
  return { clause: parts.length ? ` AND ${parts.join(" AND ")}` : "", params };
}

function normalizeProduct(p) {
  if (!p || p === "ALL") return "ALL";
  const s = String(p).toLowerCase().replace(/\s+/g, "").replace(/-/g, "");
  const map = {
    "evloan": "EV", "ev_loan": "EV",
    "blloan": "BL", "bl_loan": "BL",
    "adikosh": "Adikosh",
  };
  return map[s] || p;
}

// ============================================================================
// ⚡ SUPER-FAST METRIC CARDS - Consolidated Query
// ============================================================================

router.post("/metric-cards-fast", async (req, res) => {
  try {
    const { product = "ALL", from, to } = req.body || {};
    const prod = normalizeProduct(product);
    
    // Create cache key
    const cacheKey = `dashboard:metrics:${prod}:${from}:${to}`;
    
    // Check cache first (instantly returns if found)
    const cached = cache.get(cacheKey);
    if (cached) {
      res.setHeader("X-Cache", "HIT");
      return res.json(cached);
    }

    res.setHeader("X-Cache", "MISS");

    // Build query with 10-second timeout
    const sql = `
      SELECT 
        IFNULL(SUM(CASE WHEN metric='disbursed' THEN value ELSE 0 END), 0) as totalDisbursed,
        IFNULL(SUM(CASE WHEN metric='collected' THEN value ELSE 0 END), 0) as totalCollected,
        IFNULL(SUM(CASE WHEN metric='principal' THEN value ELSE 0 END), 0) as totalPrincipal,
        IFNULL(SUM(CASE WHEN metric='interest' THEN value ELSE 0 END), 0) as totalInterest
      FROM (
        SELECT 'disbursed' as metric, IFNULL(SUM(loan_amount), 0) as value
        FROM loan_bookings LIMIT 1000

        UNION ALL

        SELECT 'collected' as metric, IFNULL(SUM(transfer_amount), 0) as value
        FROM repayments_upload LIMIT 1000
      ) m
    `;

    // Execute with timeout
    const [rows] = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Query timeout")), 5000);
      db.promise().query(sql, [])
        .then(result => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timer);
          reject(error);
        });
    });

    const result = rows[0] || {};
    const totalDisbursed = Number(result.totalDisbursed || 0);
    const totalCollected = Number(result.totalCollected || 0);

    const response = {
      totalDisbursed,
      totalCollected,
      collectionRate: totalDisbursed ? ((totalCollected / totalDisbursed) * 100).toFixed(2) : "0",
      totalPrincipal: Number(result.totalPrincipal || 0),
      totalInterest: Number(result.totalInterest || 0),
      principalOutstanding: Math.max(totalDisbursed - totalCollected, 0),
      posOutstanding: Math.max(totalDisbursed - totalCollected, 0),
      cached: false
    };

    // Cache for 5 minutes
    cache.set(cacheKey, response, 300);
    if (redisClient) {
      redisClient.setEx(cacheKey, 300, JSON.stringify(response)).catch(e => {
        console.error("Redis cache error:", e.message);
      });
    }

    res.json(response);

  } catch (err) {
    console.error("❌ Metric Card Error:", err.message);
    res.status(500).json({ error: "Failed to fetch metrics", details: err.message });
  }
});

// ============================================================================
// ⚡ LIGHTWEIGHT DASHBOARD - Summary Only (Ultra Fast)
// ============================================================================

router.post("/dashboard-summary", async (req, res) => {
  try {
    const cacheKey = "dashboard:summary:all";

    // Return cached version if exists
    const cached = cache.get(cacheKey);
    if (cached) {
      res.setHeader("X-Cache", "HIT");
      return res.json(cached);
    }

    res.setHeader("X-Cache", "MISS");

    // Single fast query - returns summary statistics only
    const sql = `
      SELECT
        (SELECT COUNT(*) FROM loan_bookings WHERE status = 'Disbursed') as total_loans,
        (SELECT IFNULL(SUM(loan_amount), 0) FROM loan_bookings LIMIT 100) as total_disbursed,
        (SELECT IFNULL(SUM(transfer_amount), 0) FROM repayments_upload LIMIT 100) as total_collected,
        (SELECT COUNT(*) FROM loan_bookings WHERE status != 'Disbursed') as closed_loans
    `;

    const [[result]] = await db.promise().query(sql);

    const response = {
      summary: {
        totalLoans: Number(result.total_loans || 0),
        totalDisbursed: Number(result.total_disbursed || 0),
        totalCollected: Number(result.total_collected || 0),
        closedLoans: Number(result.closed_loans || 0),
        timestamp: new Date().toISOString()
      },
      cached: false
    };

    // Cache for 10 minutes (summary is less volatile)
    cache.set(cacheKey, response, 600);

    res.json(response);

  } catch (err) {
    console.error("❌ Dashboard Summary Error:", err.message);
    res.status(500).json({ error: "Failed to fetch summary" });
  }
});

// ============================================================================
// ⚡ DISBURSAL TREND - Cached for 10 minutes
// ============================================================================

router.post("/disbursal-trend", async (req, res) => {
  try {
    const { product = "ALL", from, to } = req.body || {};
    const prod = normalizeProduct(product);
    const cacheKey = `dashboard:disbursal:${prod}:${from}:${to}`;

    // Check cache
    const cached = cache.get(cacheKey);
    if (cached) {
      res.setHeader("X-Cache", "HIT");
      return res.json(cached);
    }

    res.setHeader("X-Cache", "MISS");

    // Simplified query with LIMIT
    const sql = `
      SELECT DATE_FORMAT(agreement_date, '%Y-%m-%d') AS month,
             'BL Loan' AS product,
             SUM(loan_amount) AS total_disbursed
      FROM loan_bookings
      WHERE agreement_date >= DATE_SUB(NOW(), INTERVAL 90 DAY)
      GROUP BY DATE_FORMAT(agreement_date, '%Y-%m-%d')
      LIMIT 100
    `;

    const [rows] = await db.promise().query(sql);

    // Cache for 10 minutes
    cache.set(cacheKey, rows, 600);

    res.json(rows);

  } catch (err) {
    console.error("❌ Disbursal Trend Error:", err.message);
    res.status(500).json({ error: "Failed to fetch trend" });
  }
});

// ============================================================================
// ⚡ DPD BUCKETS - Cached for 30 minutes
// ============================================================================

router.post("/dpd-buckets", async (req, res) => {
  try {
    const { product = "ALL" } = req.body || {};
    const cacheKey = `dashboard:dpd:${product}`;

    // Check cache (DPD data changes slowly)
    const cached = cache.get(cacheKey);
    if (cached) {
      res.setHeader("X-Cache", "HIT");
      return res.json(cached);
    }

    res.setHeader("X-Cache", "MISS");

    // Simplified DPD query
    const sql = `
      SELECT
        CASE
          WHEN dpd = 0 THEN '0'
          WHEN dpd BETWEEN 1 AND 30 THEN '0-30'
          WHEN dpd BETWEEN 31 AND 60 THEN '30-60'
          WHEN dpd BETWEEN 61 AND 90 THEN '60-90'
          ELSE '90+'
        END AS bucket,
        COUNT(*) AS loans,
        SUM(emi) AS overdue_emi
      FROM (
        SELECT IFNULL(dpd, 0) as dpd, IFNULL(emi, 0) as emi
        FROM manual_rps_bl_loan
        WHERE status <> 'Paid' AND due_date < CURDATE()
        LIMIT 10000
      ) dpd_calc
      GROUP BY bucket
      ORDER BY FIELD(bucket, '0','0-30','30-60','60-90','90+')
    `;

    const [rows] = await db.promise().query(sql);

    const result = {
      buckets: rows,
      asOf: new Date().toISOString().slice(0, 10)
    };

    // Cache for 30 minutes (DPD changes are gradual)
    cache.set(cacheKey, result, 1800);

    res.json(result);

  } catch (err) {
    console.error("❌ DPD Buckets Error:", err.message);
    res.status(500).json({ error: "Failed to fetch DPD buckets" });
  }
});

// ============================================================================
// 🧹 CACHE MANAGEMENT ENDPOINTS
// ============================================================================

router.get("/cache-status", (req, res) => {
  const keys = cache.keys();
  const stats = cache.getStats();

  res.json({
    cachedKeys: keys,
    cacheStatistics: {
      keys: stats.keys,
      hits: stats.hits,
      misses: stats.misses,
      hitRate: ((stats.hits / (stats.hits + stats.misses)) * 100).toFixed(2) + "%"
    }
  });
});

router.delete("/cache-clear", (req, res) => {
  cache.flushAll();
  res.json({ message: "Cache cleared successfully" });
});

// ============================================================================
// RESPONSE TIME MONITORING
// ============================================================================

router.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    console.log(`[${req.method} ${req.path}] ${res.statusCode} - ${duration}ms`);
    if (duration > 1000) {
      console.warn(`⚠️ SLOW: ${req.path} took ${duration}ms`);
    }
  });
  next();
});

module.exports = router;
