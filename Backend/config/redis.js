/**
 * redis.js — Dashboard-scoped Redis configuration.
 *
 * withCache() — read-through caching with:
 *   - Graceful fallback if Redis unavailable
 *   - Empty-result guard: does NOT cache empty arrays or zero-row objects
 *   - invalidateDashboardCache() — SCAN+DEL for cache busting on mutations
 */

const redis = require("redis");
require("dotenv").config();

let client;

const getRedisClient = async () => {
  if (client) return client;

  client = redis.createClient({
    url: process.env.REDIS_URL || "redis://localhost:6379",
  });

  client.on("error", (err) => console.error("❌ Redis Client Error", err));
  client.on("connect", () => console.log("✅ Redis Connected"));

  try {
    await client.connect();
  } catch (error) {
    console.error("Failed to connect to Redis:", error);
    // Allow the application to fallback normally without crashing
  }

  return client;
};

/**
 * Returns true if the data should NOT be cached.
 * Prevents caching of empty arrays, empty row objects, and zero-total paginated results.
 */
function isEmptyResult(data) {
  if (data === null || data === undefined) return true;
  // Empty array
  if (Array.isArray(data) && data.length === 0) return true;
  // Paginated dpd-list with 0 rows
  if (data && typeof data === "object" && Array.isArray(data.rows) && data.rows.length === 0) return true;
  // DPD buckets with empty buckets array
  if (data && typeof data === "object" && Array.isArray(data.buckets) && data.buckets.length === 0) return true;
  return false;
}

/**
 * Read-through cache wrapper.
 * - Returns cached value if available and valid
 * - Fetches fresh data and caches it (unless the result is empty/null)
 * - Falls back to direct DB call if Redis is unavailable
 */
const withCache = async (key, ttlSeconds, fetchFunction) => {
  try {
    const rClient = await getRedisClient();
    if (!rClient.isOpen) return await fetchFunction();

    const cached = await rClient.get(key);
    if (cached) {
      const parsed = JSON.parse(cached);
      // Defensive: if somehow an empty result was cached, re-fetch
      if (!isEmptyResult(parsed)) {
        return parsed;
      }
    }

    const data = await fetchFunction();

    // Only cache non-empty results
    if (!isEmptyResult(data)) {
      await rClient.setEx(key, ttlSeconds, JSON.stringify(data));
    }

    return data;
  } catch (error) {
    console.error(`Cache error on key ${key}:`, error);
    return await fetchFunction(); // Safe fallback to DB
  }
};

/**
 * Invalidate all dashboard cache keys matching a namespace prefix.
 * Uses SCAN to avoid blocking Redis with KEYS command on large datasets.
 * Example: invalidateDashboardCache("dash:metric") clears all metric-card cache entries.
 */
const invalidateDashboardCache = async (prefix) => {
  try {
    const rClient = await getRedisClient();
    if (!rClient.isOpen) return;

    const pattern = `${prefix}*`;
    let cursor = 0;
    let deleted = 0;

    do {
      const result = await rClient.scan(cursor, { MATCH: pattern, COUNT: 100 });
      cursor = result.cursor;
      const keys = result.keys;
      if (keys.length > 0) {
        await rClient.del(keys);
        deleted += keys.length;
      }
    } while (cursor !== 0);

    if (deleted > 0) {
      console.log(`🗑️  Invalidated ${deleted} Redis key(s) matching "${pattern}"`);
    }
  } catch (err) {
    console.error("Redis invalidation error:", err);
  }
};

module.exports = {
  getRedisClient,
  withCache,
  invalidateDashboardCache,
};
