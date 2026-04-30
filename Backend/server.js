require("dotenv").config({ path: __dirname + "/.env" });
const express = require("express");
const cors = require("cors");
const authRoutes = require("./routes/authRoutes");
const adminRoutes = require("./routes/adminRoutes");
const excelUploadRoutes = require("./routes/excelUpload");
const loanRoutes = require("./routes/loanRoutes");
const repaymentRoutes = require("./routes/repaymentsRoutes");
const loanChargesRoutes = require("./routes/loanChargesRoutes");
const manualRPSRoutes = require("./routes/manualRPSRoutes");
const DisbursalRoutes = require("./routes/DisbursalRoutes");
const applicationFormRoutes = require("./routes/applicationFormRoutes");
const chargesRoutes = require("./routes/chargesRoutes");
const deleteCashflowRoutes = require("./routes/deleteCashflowRoutes");
const allocationRoutes = require("./routes/allocationRoutes");
const forecloserRoutes = require("./routes/forecloserRoutes");
const forecloserUploadRoutes = require("./routes/forecloserUpload");
const reportsRoutes = require("./routes/reportRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const { initColumnSchemaCache } = require("./services/dashboardService");
const collectionApiRoutes = require("./routes/collectionApi");
const enachRoutes = require("./routes/enachRoutes");
const esignRoutes = require("./routes/esignRoutes");
const heliumWebhookRoutes = require("./routes/heliumRoutes/heliumWebhookRoute");
const dealerOnboardingRoutes = require("./routes/Dealer/dealerOnboardingRoutes");
const { retryPendingValidations } = require("./services/heliumValidationEngine");
const { autoApproveClayyoIfAllVerified } = require("./routes/clyooRoutes/clayyoBreEngine");
const { generateForReport, generateAllPending } = require('./jobs/cibilPdfService');
//const crypto = require("crypto");
// const { initScheduler } = require('./jobs/smsSchedulerRaw');
const { initScheduler, runOnce } = require("./jobs/smsSchedulerRaw");
const mobileRevocationLookup = require("./utils/mnrlApiService");
const { initAadhaarKyc } = require("./services/digitapaadharservice");


// function generateApiKey() {
//   return crypto.randomBytes(32).toString("hex");
//   // 32 bytes = 64 characters hex string
// }

// const apiKey = generateApiKey();
// console.log("Generated API Key:", apiKey);

const PORT = process.env.PORT;
// server.js
// import { v4 as uuidv4 } from 'uuid';

// ✅ Import jobs
require("./jobs/dailyJobs");

const fs = require("fs");
const path = require("path");
const { autoApproveLoanDigitIfAllVerified } = require("./routes/loanDigit/loanDigitBre");
const app = express();
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cors({
  origin: '*', // <-- Your frontend GitHub Pages URL
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
  credentials: true
}));

initScheduler();

// // Auto-generate API key once when server starts
// const API_KEY = process.env.API_KEY || uuidv4();
// console.log("✅ Generated API Key:", API_KEY); // Copy this and use in Postman

// function apiKeyAuth(req, res, next) {
//   const apiKey = req.headers['x-api-key'];

//   if (!apiKey || apiKey !== API_KEY) {
//     return res.status(403).json({ message: 'Forbidden: Invalid API Key' });
//   }

//   next();
// }
// app.use(express.static(path.join(__dirname, '../Frontend/dist')));
const reportsPath = path.join(__dirname, "reports");
if (!fs.existsSync(reportsPath)) {
  fs.mkdirSync(reportsPath, { recursive: true });
}

app.use(
  "/agreements",
  express.static(path.join(process.cwd(), "uploads", "agreements"))
);
app.use("/generated", express.static(path.join(__dirname, "generated")));
app.use("/reports", express.static(reportsPath));
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/loan-booking", excelUploadRoutes);
app.use("/api/wctl-ccod", require("./routes/wctlCCODRoutes/wctlRoutes")); // ✅ Register WCTL-CC-OD Routes
app.use("/api/helium-loans", require("./routes/heliumRoutes/heliumRoutes")); // ✅ Register Helium Loan Routes
app.use("/api/clayyo-loans", require("./routes/clyooRoutes/clyooRoutes")); // ✅ Register Clayyo Routes
app.use("/api/utr", require("./routes/utrRoutes")); // ✅ Register UTR Routes
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/enach", enachRoutes);
app.use("/api/esign", esignRoutes);
app.use("/api/helium-webhook", heliumWebhookRoutes);
app.use("/api/switch-my-loan", require("./routes/switchMyLoan/switchMyLoanRotues")); // ✅ Register Switch My Loan Routes
app.use("/api/loan-digit", require("./routes/loanDigit/loanDigitRoutes"));
app.use("/api/fldg", require("./routes/fldgRoutes")); // ✅ Register FLDG Routes

app.use(
  "/api/webhooks/easebuzz",
  require("../Backend/routes/easebuzz.webhooks.routes"),
); // ✅ Register Easebuzz Webhook Route

// app.use("/api/courses", courseRoutes);
app.use("/api/loan", loanRoutes); //  routes chanegd
app.use("/api/repayments", repaymentRoutes);
app.use("/api/collection", collectionApiRoutes);
app.use("/api/loan-charges", loanChargesRoutes);
app.use("/api/manual-rps", manualRPSRoutes);
app.use("/api/disbursal", DisbursalRoutes);
app.use("/api/application-form", applicationFormRoutes);
app.use("/api/charges", chargesRoutes); //  routes chanegd
app.use("/api/delete-cashflow", deleteCashflowRoutes);
app.use("/api/allocate", allocationRoutes); //  routes chanegd
app.use("/api/forecloser-collection", forecloserRoutes); // NOT foreclose-collection
app.use("/api/forecloser", forecloserUploadRoutes); // ✅ Register Route for Forecloser Upload FC Upload
app.use("/reports", express.static(path.join(__dirname, "/reports")));
app.use("/api/reports", reportsRoutes);// ✅ Register Route for Reports
app.use("/api/customers-soa", require("./routes/customersSOA")); // ✅ Register Route for Customer SOA
app.use("/api/dealer-onboarding", dealerOnboardingRoutes); // ✅ Register Route for Dealer Onboarding
app.use("/api/customers", require("./routes/Customer/customerRoutes")); // ✅ Register Route for Customers

app.use("/api/partners", require("./routes/partnerLimitRoutes")); // ✅ Partner Limit Management

app.use("/api/whatsapp-reminder", require("./routes/whatsappReminderRoutes")); // ✅ WhatsApp Due Date Reminder

app.use("/api/documents", require("./routes/documents"));// ✅ Register Route for Documents
app.use("/uploads", express.static(path.join(__dirname, "uploads"))); // To serve uploaded files

app.use("/api/supply-chain", require("./routes/supplyChainRoutes/supplyChainRoutes")); // ✅ Register Routes for Supply Chain Loans
app.post("/api/cibil/:id/pdf", async (req, res) => {
  try {
    const doc = await generateForReport(req.params.id);
    res.json({ ok: true, document: doc });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post("/api/cibil/generate-pending", async (req, res) => {
  try {
    const results = await generateAllPending(200);
    res.json({ ok: true, results });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post("/api/runheliumvalidations", async (req, res) => {
  try {
    const { lan } = req.body;

    if (!lan) {
      return res.status(400).json({ ok: false, message: "LAN is required" });
    }

    await retryPendingValidations(lan);

    res.json({
      ok: true,
      message: `Helium validations executed successfully for LAN ${lan}`,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/api/retryAadharVerification", async (req, res) => {
  try {
    const { lan , mobile_number, email_id, customer_name } = req.body;

    await initAadhaarKyc(
      lan,
      mobile_number,
      email_id,
      customer_name
    );
res.json({
      ok: true,
      message: `Helium validations executed successfully for LAN ${lan}`,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/api/runclayyovalidations", async (req, res) => {
  try {
    const { lan } = req.body;

    if (!lan) {
      return res.status(400).json({ ok: false, message: "LAN is required" });
    }

    await autoApproveClayyoIfAllVerified(lan);

    res.json({
      ok: true,
      message: `Clayyo validations executed successfully for LAN ${lan}`,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/api/loandigitvalidation", async (req, res) => {
  try {
    const { lan } = req.body;

    if (!lan) {
      return res.status(400).json({ ok: false, message: "LAN is required" });
    }

    await autoApproveLoanDigitIfAllVerified(lan);

    res.json({
      ok: true,
      message: `Loandigit validations executed successfully for LAN ${lan}`,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/api/test-sms", async (req, res) => {
  try {
    await runOnce(); // queues due/overdue and sends immediately
    res.json({ message: "✅ SMS job executed. Check sms_outbox for results." });
  } catch (err) {
    console.error("Test SMS error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/mobile-lookup-test", async (req, res) => {
  try {
    let { mobile_number, lan } = req.body;

    if (!mobile_number || !lan) {
      return res.status(400).json({
        ok: false,
        message: "Mobile number and LAN are required"
      });
    }

    // 🔥 FIX: sanitize mobile number
    mobile = String(mobile_number).trim().replace(/\D/g, "");

    // remove leading 91 if present
    if (mobile_number.startsWith("91") && mobile_number.length === 12) {
      mobile_number = mobile_number.slice(2);
    }

    console.log("Sanitized Mobile:", mobile_number);

    const result = await mobileRevocationLookup(mobile_number, lan);

    res.json({ ok: true, result });

  } catch (err) {
    console.error("Mobile lookup test error:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// app.get('*', (req, res) => {
//     res.sendFile(path.join(__dirname, '../Frontend/dist', 'index.html'));
//   });

app.listen(PORT || 5000, () => {
  console.log(`✅ Backend server running on ${PORT}`);
  // Pre-warm dashboard column schema cache (eliminates per-request SHOW COLUMNS queries)
  const db = require('./config/db');
  initColumnSchemaCache(db).catch(err =>
    console.error('[server] Dashboard schema cache init error:', err.message)
  );
});
