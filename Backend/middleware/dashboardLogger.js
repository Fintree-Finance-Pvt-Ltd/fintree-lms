/**
 * dashboardLogger.js — Observability middleware for dashboard routes ONLY.
 * Adds:
 *  - X-Response-Time header on every response
 *  - Console warning for slow requests (> SLOW_THRESHOLD_MS)
 *
 * Usage: apply ONLY on the dashboard router, not globally.
 */

const SLOW_THRESHOLD_MS = 1000; // warn on anything > 1s

function dashboardLogger(req, res, next) {
  const startAt = process.hrtime.bigint();

  res.on("finish", () => {
    const durationNs = process.hrtime.bigint() - startAt;
    const durationMs = Number(durationNs / 1_000_000n);

    // Attach timing header (visible on second call when cached)
    res.setHeader("X-Response-Time", `${durationMs}ms`);

    const label = `[Dashboard] ${req.method} ${req.path}`;

    if (durationMs > SLOW_THRESHOLD_MS) {
      console.warn(
        `⚠️  SLOW ${label} — ${durationMs}ms (status ${res.statusCode})`
      );
    } else {
      // Only log at debug level in development
      if (process.env.NODE_ENV !== "production") {
        console.log(`✅ ${label} — ${durationMs}ms`);
      }
    }
  });

  next();
}

module.exports = dashboardLogger;
