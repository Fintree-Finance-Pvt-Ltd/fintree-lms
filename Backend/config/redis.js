const redis = require("redis");
require("dotenv").config();

let client;

const getRedisClient = async () => {
  if (client) return client;

  client = redis.createClient({
    url: process.env.REDIS_URL || "redis://localhost:6379",
  });

  client.on("error", (err) => console.error("❌ Redis Client Error", err));
  client.on("connect", () => console.log("✅ redis Connected"));

  try {
    await client.connect();
  } catch (error) {
    console.error("Failed to connect to Redis:", error);
    // Allow the application to fallback normally without crashing
  }

  return client;
};

// Reusable cache wrapper
const withCache = async (key, ttlSeconds, fetchFunction) => {
  try {
    const rClient = await getRedisClient();
    if (!rClient.isOpen) return await fetchFunction();

    const cached = await rClient.get(key);
    if (cached) {
      return JSON.parse(cached);
    }

    const data = await fetchFunction();
    await rClient.setEx(key, ttlSeconds, JSON.stringify(data));
    return data;
  } catch (error) {
    console.error(`Cache error on key ${key}:`, error);
    return await fetchFunction(); // Safe fallback to DB
  }
};

module.exports = {
  getRedisClient,
  withCache,
};
