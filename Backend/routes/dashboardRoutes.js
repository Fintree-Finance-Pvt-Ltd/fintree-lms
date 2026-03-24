"use strict";

/**
 * dashboardRoutes.js — Dashboard API routes (ONLY)
 *
 * All business logic lives in dashboardService.js.
 * Redis caching via withCache() from config/redis.js.
 * Observability via dashboardLogger middleware.
 *
 * Cache key namespace: "dash:<endpoint>:<...params>"
 * TTLs: metric-cards 300s | disbursal-trend 300s | dpd-buckets 180s | dpd-list 120s
 */

const express  = require("express");
const db       = require("../config/db");
const nodemailer = require("nodemailer");
const XLSX     = require("xlsx");

const { withCache }         = require("../config/redis");
const dashboardLogger       = require("../middleware/dashboardLogger");

const {
  normalizeProduct,
  dayRange,
  initColumnSchemaCache,
  buildDisbursalTrendSQL,
  buildMetricCards,
  buildDpdBuckets,
  buildDpdList,
} = require("../services/dashboardService");

const router = express.Router();

// ── Observability: applies ONLY to this router ──────────────────
router.use(dashboardLogger);

// ── Warm the column schema cache at startup (async, non-blocking) ─
initColumnSchemaCache(db).catch(err =>
  console.error("[dashboardRoutes] Schema cache init failed:", err.message)
);

/* ================================================================
   POST /api/dashboard/disbursal-trend
   ================================================================ */
router.post("/disbursal-trend", async (req, res) => {
  try {
    const { product, from, to } = req.body || {};
    const cacheKey = `dash:trend:${product || "ALL"}:${from || ""}:${to || ""}`;

    const result = await withCache(cacheKey, 300, async () => {
      const prod = normalizeProduct(product);
      const { start, end } = dayRange(from, to);
      const { sql, params } = buildDisbursalTrendSQL(prod, start, end);

      if (!sql) return [];

      const [rows] = await db.promise().query(sql, params);
      return rows;
    });

    res.json(result);
  } catch (err) {
    console.error("❌ Disbursal Trend Error:", err);
    res.status(500).json({ error: "Failed to fetch disbursal trend" });
  }
});

/* ================================================================
   POST /api/dashboard/metric-cards
   ================================================================ */
router.post("/metric-cards", async (req, res) => {
  try {
    const { product, from, to } = req.body || {};
    const cacheKey = `dash:metric:${product || "ALL"}:${from || ""}:${to || ""}`;

    const result = await withCache(cacheKey, 300, async () => {
      const prod = normalizeProduct(product);
      const { start, end } = dayRange(from, to);
      return buildMetricCards(prod, start, end, db);
    });

    res.json(result);
  } catch (err) {
    console.error("❌ Metric Card Fetch Error:", err);
    res.status(500).json({ error: "Failed to fetch metrics" });
  }
});

/* ================================================================
   POST /api/dashboard/dpd-buckets
   ================================================================ */
router.post("/dpd-buckets", async (req, res) => {
  try {
    const { product } = req.body || {};
    const cacheKey = `dash:dpdbkt:${product || "ALL"}`;

    const result = await withCache(cacheKey, 180, async () => {
      const prod = normalizeProduct(product);
      return buildDpdBuckets(prod, db);
    });

    res.json(result);
  } catch (err) {
    console.error("❌ DPD Buckets Error:", err);
    res.status(500).json({ error: "Failed to fetch DPD buckets" });
  }
});

/* ================================================================
   POST /api/dashboard/dpd-list
   ================================================================ */
router.post("/dpd-list", async (req, res) => {
  try {
    const {
      product,
      bucket,
      page: pageRaw,
      pageSize: pageSizeRaw,
      sortBy: sortByRaw,
      sortDir: sortDirRaw,
    } = req.body || {};

    const prod     = normalizeProduct(product);
    const page     = Math.max(1, parseInt(pageRaw || 1, 10));
    const pageSize = Math.min(1000, Math.max(1, parseInt(pageSizeRaw || 25, 10)));
    const sortBy   = typeof sortByRaw === "string" ? sortByRaw.toLowerCase() : "dpd";
    const sortDir  = String(sortDirRaw || "desc").toLowerCase() === "asc" ? "asc" : "desc";

    // Valid buckets for dpd-list (NOTE: "ALL" is NOT a valid dpd-list bucket —
    // it is only used as a product filter, not a DPD band selector)
    const validBuckets = ["0", "0-30", "30-60", "60-90", "90+", "closed", "active"];
    if (!validBuckets.includes(bucket)) {
      return res.status(400).json({ error: `Invalid bucket: "${bucket}". Valid values: ${validBuckets.join(", ")}` });
    }

    // dpd-list is paginated — shorter TTL (120s) to keep data fresh
    // Use normalized `prod` in key to avoid cache splits on raw product string variants
    const cacheKey = `dash:dpdlist:${prod}:${bucket}:${page}:${pageSize}:${sortBy}:${sortDir}`;

    const result = await withCache(cacheKey, 120, async () =>
      buildDpdList({ prod, bucket, page, pageSize, sortBy, sortDir }, db)
    );

    res.json(result);
  } catch (err) {
    if (err.message && err.message.startsWith("Invalid bucket")) {
      return res.status(400).json({ error: err.message });
    }
    console.error("❌ DPD List Error:", err);
    res.status(500).json({ error: "Failed to fetch DPD list" });
  }
});

/* ================================================================
   POST /api/dashboard/dpd-export-email
   (Not cached — this is a one-shot triggered action)
   ================================================================ */
router.post("/dpd-export-email", async (req, res) => {
  try {
    const { userId: userIdFromBody, product, bucket, page, rows } = req.body || {};
    const userId = req.user?.id || userIdFromBody;
    if (!userId) return res.status(400).json({ error: "Missing userId" });

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: "No rows to export" });
    }

    // Fetch recipient email
    const [[u]] = await db
      .promise()
      .query("SELECT email, name FROM users WHERE id = ? LIMIT 1", [userId]);
    if (!u?.email) return res.status(404).json({ error: "User email not found" });

    const columns = [
      { key: "lan",               header: "LAN" },
      { key: "customer_name",     header: "Customer Name" },
      { key: "product",           header: "Product" },
      { key: "max_dpd",           header: "Max DPD" },
      { key: "overdue_emi",       header: "Overdue EMI" },
      { key: "overdue_principal", header: "Overdue Principal" },
      { key: "overdue_interest",  header: "Overdue Interest" },
      { key: "pos_principal",     header: "POS (Principal)" },
    ];

    const header   = columns.map(c => c.header);
    const dataRows = rows.map(r => [
      r.lan ?? "",
      r.customer_name ?? "",
      r.product ?? "",
      Number(r.max_dpd ?? 0),
      Number(r.overdue_emi ?? 0),
      Number(r.overdue_principal ?? 0),
      Number(r.overdue_interest ?? 0),
      Number(r.pos_principal ?? 0),
    ]);

    const ws = XLSX.utils.aoa_to_sheet([header, ...dataRows]);
    for (let r = 1; r <= dataRows.length; r++) {
      for (const c of [3, 4, 5, 6]) {
        const addr = XLSX.utils.encode_cell({ r, c });
        if (ws[addr]) { ws[addr].t = "n"; ws[addr].z = "#,##0"; }
      }
    }
    ws["!cols"] = header.map((h, i) => ({
      wch: Math.min(40, Math.max(12,
        String(h).length + 2,
        ...dataRows.map(row => (row[i] ? String(row[i]).length + 2 : 0))
      )),
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Visible Rows");

    const safeProduct = String(product || "ALL").replace(/[^\w-]+/g, "_");
    const safeBucket  = String(bucket  || "").replace(/[^\w-]+/g, "_");
    const filename    = `DPD_${safeProduct}_${safeBucket}_page_${page || 1}.xlsx`;
    const buf = XLSX.write(wb, { bookType: "xlsx", type: "buffer" });

    const transporter = nodemailer.createTransport({
      host:   process.env.SMTP_HOST,
      port:   Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_SECURE) === "true",
      auth:   process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });

    await transporter.sendMail({
      from:    process.env.FROM_EMAIL || "no-reply@yourdomain.com",
      to:      u.email,
      subject: `DPD report — ${product} ${bucket} (page ${page || 1})`,
      text:    `Hi ${u.name || ""},\n\nAttached is your DPD report (${filename}).`,
      html:    `<p>Hi ${u.name || ""},</p><p>Attached is your DPD report:</p><p><b>${filename}</b></p>`,
      attachments: [{ filename, content: buf,
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }],
    });

    res.json({ ok: true, sentTo: u.email });
  } catch (err) {
    console.error("❌ dpd-export-email error:", err);
    res.status(500).json({ error: "Failed to email report" });
  }
});

module.exports = router;
