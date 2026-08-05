// Add this near your other route imports.
const express = require("express");
const fintreePlPartnerApiRoutes = require("./routes/fintreePlPartnerApi");

// IMPORTANT:
// Mount this route before a smaller global express.json() parser.
// The DOCUMENT API contains Base64 JSON and needs approximately 6 MB.
app.use(
  "/api/partner/v1",
  express.json({ limit: process.env.PL_PARTNER_JSON_LIMIT || "6mb" }),
  fintreePlPartnerApiRoutes,
);

// Your normal global JSON parser can remain smaller for all other APIs,
// but it must be registered after the partner route above.
// app.use(express.json({ limit: "1mb" }));
