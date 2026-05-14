// services/doqfyClient.js

const axios = require("axios");

const {
  DOQFY_BASE_URL = "https://api.doqfy.in",
  DOQFY_API_KEY,
  DOQFY_SECRET_KEY,
} = process.env;

/* -------------------------------------------------- */
/* VALIDATION */
/* -------------------------------------------------- */

if (!DOQFY_API_KEY || !DOQFY_SECRET_KEY) {
  console.warn(
    "[doqfyClient] ⚠️ DOQFY_API_KEY / DOQFY_SECRET_KEY not set in .env"
  );
}

/* -------------------------------------------------- */
/* AXIOS INSTANCE */
/* -------------------------------------------------- */

const doqfyClient = axios.create({
  baseURL: DOQFY_BASE_URL,
  timeout: 30000,

  headers: {
    "Content-Type": "application/json",
    "api-key": DOQFY_API_KEY || "",
    "secret-key": DOQFY_SECRET_KEY || "",
  },
});

/* -------------------------------------------------- */
/* REQUEST LOGGER */
/* -------------------------------------------------- */

doqfyClient.interceptors.request.use(
  (config) => {
    console.log(
      `📤 DOQFY API REQUEST: ${config.method?.toUpperCase()} ${config.baseURL}${config.url}`
    );

    return config;
  },
  (error) => {
    console.error("❌ DOQFY REQUEST ERROR:", error);
    return Promise.reject(error);
  }
);

/* -------------------------------------------------- */
/* RESPONSE LOGGER */
/* -------------------------------------------------- */

doqfyClient.interceptors.response.use(
  (response) => {
    console.log(
      `✅ DOQFY API RESPONSE: ${response.status} ${response.config.url}`
    );

    return response;
  },
  (error) => {
    console.error(
      "❌ DOQFY RESPONSE ERROR:",
      error.response?.data || error.message
    );

    return Promise.reject(error);
  }
);

module.exports = doqfyClient;