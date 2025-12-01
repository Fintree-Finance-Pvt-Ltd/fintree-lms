// services/digioEsignClient.js
const axios = require("axios");

const {
  DIGIO_ESIGN_BASE_URL = "https://ext.digio.in:444",
  DIGIO_CLIENT_ID,
  DIGIO_CLIENT_SECRET,
} = process.env;

if (!DIGIO_CLIENT_ID || !DIGIO_CLIENT_SECRET) {
  console.warn(
    "[digioEsignClient] ⚠️ DIGIO_CLIENT_ID / DIGIO_CLIENT_SECRET not set in .env"
  );
}

const digioEsign = axios.create({
  baseURL: DIGIO_ESIGN_BASE_URL,
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
  },
  auth: {
    // Basic auth: username = client_id, password = client_secret
    username: DIGIO_CLIENT_ID || "",
    password: DIGIO_CLIENT_SECRET || "",
  },
});

module.exports = digioEsign;
