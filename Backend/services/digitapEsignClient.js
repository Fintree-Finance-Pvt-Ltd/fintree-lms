// services/digitapEsignClient.js
const axios = require("axios");

const digitapEsign = axios.create({
  baseURL: "https://api.digitap.ai/ent",
  headers: {
    Authorization:
      "Basic " +
      Buffer.from(
        `${process.env.DIGITAP_CLIENT_ID}:${process.env.DIGITAP_CLIENT_SECRET}`
      ).toString("base64"),
    "Content-Type": "application/json",
  },
  timeout: 30000,
});

module.exports = digitapEsign;