// Backend/services/digioClient.js
const axios = require("axios");

const {
  DIGIO_BASE_URL,         // e.g. https://api.digio.in or whatever they gave you
  DIGIO_CLIENT_ID,
  DIGIO_CLIENT_SECRET,
} = process.env;

if (!DIGIO_BASE_URL || !DIGIO_CLIENT_ID || !DIGIO_CLIENT_SECRET) {
  console.warn("⚠️ DIGIO_* env vars not fully set. Check .env");
}

const digio = axios.create({
  baseURL: DIGIO_BASE_URL,
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
  },
});

// Add Basic auth for every request
digio.interceptors.request.use((config) => {
  const basic = Buffer.from(`${DIGIO_CLIENT_ID}:${DIGIO_CLIENT_SECRET}`).toString("base64");
  config.headers.authorization = `Basic ${basic}`;
  return config;
});

module.exports = digio;
