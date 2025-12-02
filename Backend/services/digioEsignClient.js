// services/digioEsignClient.js
const axios = require("axios");

const {
  DIGIO_BASE_URL = "https://api.digio.in" ,
  DIGIO_ESIGN_CLIENT_ID,
  DIGIO_ESIGN_CLIENT_SECRET,
} = process.env;

if (!DIGIO_ESIGN_CLIENT_ID || !DIGIO_ESIGN_CLIENT_SECRET) {
  console.warn(
    "[digioEsignClient] ⚠️ DIGIO_CLIENT_ID / DIGIO_CLIENT_SECRET not set in .env"
  );
}

const digioEsign = axios.create({
  baseURL: DIGIO_BASE_URL,
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
  },
  auth: {
    // Basic auth: username = client_id, password = client_secret
    username: DIGIO_ESIGN_CLIENT_ID || "",
    password: DIGIO_ESIGN_CLIENT_SECRET || "",
  },
});

module.exports = digioEsign;


// Backend/services/digioClient.js
// const axios = require("axios");

// const {
//   DIGIO_BASE_URL = "https://api.digio.in" ,
//   DIGIO_ESIGN_CLIENT_ID,
//   DIGIO_ESIGN_CLIENT_SECRET,
// } = process.env;

// if (!DIGIO_ESIGN_CLIENT_ID || !DIGIO_ESIGN_CLIENT_SECRET) {
//   console.warn(
//     "[digioEsignClient] ⚠️ DIGIO_CLIENT_ID / DIGIO_CLIENT_SECRET not set in .env"
//   );
// }

// const digioEsign = axios.create({
//   baseURL: DIGIO_BASE_URL,
//   timeout: 30000,
//   headers: {
//     "Content-Type": "application/json",
//   },
// });

// // Add Basic auth for every request
// digioEsign.interceptors.request.use((config) => {
//   const basic = Buffer.from(`${DIGIO_ESIGN_CLIENT_ID}:${DIGIO_ESIGN_CLIENT_SECRET}`).toString("base64");
//   config.headers.authorization = `Basic ${basic}`;
//   return config;
// });

// module.exports = digioEsign;
