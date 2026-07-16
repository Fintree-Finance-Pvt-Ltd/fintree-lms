require("dotenv").config({ path: __dirname + "/.env" });
const express = require("express");
const cors = require("cors");
const db = require("./config/db");
const authRoutes = require("./routes/authRoutes");
const adminRoutes = require("./routes/adminRoutes");
const excelUploadRoutes = require("./routes/excelUpload");
const sterlionRoutes = require("./routes/sterlion/sterlionRoutes");
const carePayRoutes = require("./routes/CarePay/carePayRoutes");
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
const { retryPendingValidations, autoApproveIfAllVerified } = require("./services/heliumValidationEngine");
const { autoApproveClayyoIfAllVerified } = require("./routes/clyooRoutes/clayyoBreEngine");
const { autoApproveMotionCorpIfAllVerified } = require("./routes/MotionCorp/motionCorpBRE");
const { generateForReport, generateAllPending } = require('./jobs/cibilPdfService');
const crypto = require("crypto");
// const { initScheduler } = require('./jobs/smsSchedulerRaw');
const { initScheduler, runOnce } = require("./jobs/smsSchedulerRaw");
const mobileRevocationLookup = require("./utils/mnrlApiService");
const { initAadhaarKyc } = require("./services/digitapaadharservice");
const { autoRunFinsoBreIfReady} = require("./utils/fincrestBRE");
const { autoApproveSrbhIfAllVerified } = require("./routes/srbh/srbhBRE");
const { universalRunAllValidations} = require("./utils/runValiationsEngine");
const { sendDisbursementWebhook } = require("./routes/switchMyLoan/switchMyLoanWebhook");
const {
  sendWelcomeLetterAfterUtrUpload,
} = require("./services/welcomeLetterService");


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
require("./jobs/rapidMoneyWebhookRetry");

const fs = require("fs");
const path = require("path");
const { autoApproveLoanDigitIfAllVerified } = require("./routes/loanDigit/loanDigitBre");
const app = express();
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
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
app.use("/api/loan-booking", sterlionRoutes);
app.use("/api/loan-booking", carePayRoutes.loanBookingRouter);
app.use("/api/loan-booking", excelUploadRoutes);
app.use("/api/wctl-ccod", require("./routes/wctlCCODRoutes/wctlRoutes")); // ✅ Register WCTL-CC-OD Routes
app.use("/api/helium-loans", require("./routes/heliumRoutes/heliumRoutes")); // ✅ Register Helium Loan Routes
app.use("/api/clayyo-loans", require("./routes/clyooRoutes/clyooRoutes")); // ✅ Register Clayyo Routes
app.use("/api/payu", require("./services/PayuIntegration/payu.routes")); // ✅ Register PayU Routes

app.use(
  "/api/motion-corp",
  require("./routes/MotionCorp/motionCorpDealerRoutes")
);


app.use(
  "/api/seven-fincorp",
  require("./routes/Seven Fincorp/sevenFincorpDealerRoutes")
);


app.use(
  "/api/srbh",
  require("./routes/srbh/srbhDealerRoutes")
);


app.use(
  "/api/bundela",
  require("./routes/Bundela/bundelaDealerRoutes")
);


app.use("/api/utr", require("./routes/utrRoutes")); // ✅ Register UTR Routes
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/enach", enachRoutes);
app.use("/api/esign", esignRoutes);
app.use("/api/helium-webhook", heliumWebhookRoutes);
function safeAuditJson(value) {
  try {
    return JSON.stringify(value ?? null);
  } catch (error) {
    return JSON.stringify({
      serialization_error: true,
      message: error.message,
    });
  }
}

function parseAuditResponse(value) {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function extractApplicationIdFromUrl(url) {
  const match = String(url || "").match(
    /\/v1\/loan\/([^/?]+)(?:\/|$)/,
  );

  return match ? decodeURIComponent(match[1]) : null;
}

function rmlApiAuditMiddleware(req, res, next) {
  const startedAt = Date.now();

  // Always generate a unique server-side ID.
  const requestId = crypto.randomUUID();

  const requestHeaders = safeAuditJson(req.headers);
  const requestQuery = safeAuditJson(req.query);
  const requestBody = safeAuditJson(req.body);

  let responseBody = null;
  let capturedParams = {};
  let capturedRoutePath =
    `${req.baseUrl || ""}${req.path || ""}`;

  res.setHeader("x-request-id", requestId);

  const originalJson = res.json.bind(res);
  const originalSend = res.send.bind(res);

  function captureRouteInformation() {
    capturedParams = {
      ...(req.params || {}),
    };

    if (req.route?.path) {
      capturedRoutePath =
        `${req.baseUrl || ""}${req.route.path}`;
    }
  }

  res.json = function auditJson(body) {
    captureRouteInformation();
    responseBody = body;
    return originalJson(body);
  };

  res.send = function auditSend(body) {
    captureRouteInformation();

    if (responseBody === null) {
      responseBody = parseAuditResponse(body);
    }

    return originalSend(body);
  };

  res.on("finish", () => {
    setImmediate(async () => {
      try {
        const responseData =
          responseBody?.data &&
          typeof responseBody.data === "object"
            ? responseBody.data
            : {};

        let applicationId =
          capturedParams.application_id ||
          req.body?.application_id ||
          responseData.application_id ||
          null;

        let partnerLoanId =
          req.body?.partner_loan_id ||
          responseData.partner_loan_id ||
          null;

        let lan =
          req.body?.lan ||
          responseData.lan ||
          null;

        if (applicationId || partnerLoanId || lan) {
          let lookupSql = null;
          let lookupValue = null;

          if (applicationId) {
            lookupSql = `
              SELECT application_id, partner_loan_id, lan
              FROM loan_booking_switch_my_loan
              WHERE application_id = ?
              LIMIT 1
            `;
            lookupValue = applicationId;
          } else if (partnerLoanId) {
            lookupSql = `
              SELECT application_id, partner_loan_id, lan
              FROM loan_booking_switch_my_loan
              WHERE partner_loan_id = ?
              LIMIT 1
            `;
            lookupValue = partnerLoanId;
          } else {
            lookupSql = `
              SELECT application_id, partner_loan_id, lan
              FROM loan_booking_switch_my_loan
              WHERE lan = ?
              LIMIT 1
            `;
            lookupValue = lan;
          }

          const [[loanRow]] = await db.promise().query(
            lookupSql,
            [lookupValue],
          );

          applicationId =
            applicationId ||
            loanRow?.application_id ||
            null;

          partnerLoanId =
            partnerLoanId ||
            loanRow?.partner_loan_id ||
            null;

          lan =
            lan ||
            loanRow?.lan ||
            null;
        }

        await db.promise().query(
          `
          INSERT INTO rml_api_audit_logs
          (
            request_id,
            application_id,
            partner_loan_id,
            lan,
            http_method,
            route_path,
            request_url,
            request_headers,
            request_params,
            request_query,
            request_body,
            response_status,
            response_body,
            duration_ms,
            ip_address,
            user_agent
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [
            requestId,
            applicationId,
            partnerLoanId,
            lan,
            req.method,
            capturedRoutePath,
            req.originalUrl,
            requestHeaders,
            safeAuditJson(capturedParams),
            requestQuery,
            requestBody,
            res.statusCode,
            safeAuditJson(responseBody),
            Date.now() - startedAt,
            req.ip ||
              req.socket?.remoteAddress ||
              null,
            req.headers["user-agent"] || null,
          ],
        );
      } catch (auditError) {
        console.error(
          "[RML API AUDIT] Failed to save audit log:",
          {
            requestId,
            message: auditError.message,
          },
        );
      }
    });
  });

  next();
}
app.use("/api/rapid-money", rmlApiAuditMiddleware, require("./routes/switchMyLoan/switchMyLoanRotues")); // ✅ Register Switch My Loan Routes
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
app.use("/api/zebrs", require("./routes/Zebrs/zebrsRoutes")); // ✅ Register Routes for Zebrs
app.use("/api/carepay", carePayRoutes); // ✅ Register Routes for CarePay Mandate UMRN Update
// app.use("/api/claim-cure-buddy", require("./routes/ClaimCureBuddy/ClaimCureBuddyRoutes")); // ✅ Register Routes for Claim Cure Buddy
app.use("/api/whatsapp-reminder", require("./routes/whatsappReminderRoutes")); // ✅ WhatsApp Due Date Reminder
app.use("/api/fundify", require("./routes/Fundify/fundifyRoutes")); // ✅ Register Routes for Fundify Loans

app.use("/api/documents", require("./routes/documents"));// ✅ Register Route for Documents
app.use("/uploads", express.static(path.join(__dirname, "uploads"))); // To serve uploaded files

app.use("/bureau", require("./services/bureauretry"));

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
    await autoApproveIfAllVerified(lan);
    res.json({
      ok: true,
      message: `Helium validations executed successfully for LAN ${lan}`,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/api/runfinsovalidations", async (req, res) => {
  try {
    const { lan } = req.body;

    if (!lan) {
      return res.status(400).json({ ok: false, message: "LAN is required" });
    }

    await autoRunFinsoBreIfReady(lan);

    res.json({
      ok: true,
      message: `FINCREST validations executed successfully for LAN ${lan}`,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// autoRunFinsoBreIfReady

// app.post("/api/retryAadharVerification", async (req, res) => {
//   try {
//     const pool = db.promise();
//     const { lan, mobile_number, email_id, customer_name } = req.body;

//      if (!lan) {
//       return res.status(400).json({
//         ok: false,
//         error: "LAN is required",
//       });
//     }

//     const aadhaarInit = await initAadhaarKyc(
//       lan,
//       mobile_number,
//       email_id,
//       customer_name
//     );

//     if (aadhaarInit.success) {
//       await pool.query(
//         `UPDATE kyc_verification_status 
//          SET aadhaar_transaction_id=?, aadhaar_kyc_url=?, aadhaar_unique_id=? 
//          WHERE lan=?`,
//         [
//           aadhaarInit.unifiedTransactionId,
//           aadhaarInit.kycUrl,
//           aadhaarInit.uniqueId,
//           lan,
//         ]
//       );

//       console.log(
//         "📨 Aadhaar INIT successful, KYC URL:",
//         aadhaarInit.kycUrl
//       );
//     } else {
//       console.log(
//         "❌ Aadhaar INIT Failed, marking FAILED:",
//         aadhaarInit.error || "Unknown error"
//       );
//       await pool.query(
//         "UPDATE kyc_verification_status SET aadhaar_status='FAILED' WHERE lan=?",
//         [lan]
//       );
//     }
//     res.json({
//       ok: true,
//       message: `Aadhaar Link reshared successfully for Clayyo where LAN = ${lan}`,
//     });
//   } catch (err) {
//     res.status(500).json({ ok: false, error: err.message });
//   }
// });

app.post("/api/retryAadharVerification", async (req, res) => {
  try {
    const pool = db.promise();
    const { lan, mobile_number, email_id, customer_name } = req.body;

    if (!lan) {
      return res.status(400).json({
        ok: false,
        error: "LAN is required",
      });
    }

    // 1. Get current Aadhaar status and retry count from DB
    const [rows] = await pool.query(
      `SELECT 
          aadhaar_status, 
          COALESCE(aadhaar_retry_count, 0) AS aadhaar_retry_count
       FROM kyc_verification_status
       WHERE lan = ?
       LIMIT 1`,
      [lan]
    );

    if (!rows.length) {
      return res.status(404).json({
        ok: false,
        error: `KYC verification record not found for LAN ${lan}`,
      });
    }

    const currentStatus = String(rows[0].aadhaar_status || "").trim().toUpperCase();
    const retryCount = Number(rows[0].aadhaar_retry_count || 0);

    // 2. If Aadhaar already verified, do not retry
    if (currentStatus === "VERIFIED") {
      return res.status(400).json({
        ok: false,
        error: "Aadhaar is already verified. Retry is not allowed.",
      });
    }

    // 3. Maximum 2 retry validation
    if (retryCount >= 2) {
      return res.status(400).json({
        ok: false,
        error: "Maximum Aadhaar retry limit reached.",
      });
    }

    // 4. Trigger Aadhaar KYC again
    const aadhaarInit = await initAadhaarKyc(
      lan,
      mobile_number,
      email_id,
      customer_name
    );

    if (aadhaarInit.success) {
      await pool.query(
        `UPDATE kyc_verification_status 
         SET 
            aadhaar_transaction_id = ?, 
            aadhaar_kyc_url = ?, 
            aadhaar_unique_id = ?,
            aadhaar_status = 'INITIATED',
            aadhaar_retry_count = COALESCE(aadhaar_retry_count, 0) + 1,
            updated_at = NOW()
         WHERE lan = ?`,
        [
          aadhaarInit.unifiedTransactionId,
          aadhaarInit.kycUrl,
          aadhaarInit.uniqueId,
          lan,
        ]
      );

      console.log("📨 Aadhaar INIT successful, KYC URL:", aadhaarInit.kycUrl);

      return res.json({
        ok: true,
        message: `Aadhaar link reshared successfully for LAN ${lan}`,
        aadhaar_retry_count: retryCount + 1,
        aadhaar_status: "INITIATED",
      });
    } else {
      console.log(
        "❌ Aadhaar INIT Failed:",
        aadhaarInit.error || "Unknown error"
      );

      await pool.query(
        `UPDATE kyc_verification_status 
         SET 
            aadhaar_status = 'FAILED',
            updated_at = NOW()
         WHERE lan = ?`,
        [lan]
      );

      return res.status(400).json({
        ok: false,
        error: aadhaarInit.error || "Aadhaar retry failed",
      });
    }
  } catch (err) {
    console.error("Aadhaar retry API error:", err);
    res.status(500).json({
      ok: false,
      error: err.message || "Internal server error",
    });
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

app.post("/api/srbhvalidation", async (req, res) => {
  try {
    const { lan } = req.body;

    if (!lan) {
      return res.status(400).json({ ok: false, message: "LAN is required" });
    }

    await autoApproveSrbhIfAllVerified(lan);

    res.json({
      ok: true,
      message: `Loandigit validations executed successfully for LAN ${lan}`,
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

app.post("/api/runmotioncorpvalidations", async (req, res) => {
  try {
    const { lan } = req.body;

    if (!lan) {
      return res.status(400).json({ ok: false, message: "LAN is required" });
    }

    await autoApproveMotionCorpIfAllVerified(lan);

    res.json({
      ok: true,
      message: `Motion Corp validations executed successfully for LAN ${lan}`,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});


app.post("/api/universalRunAllValidations", async (req, res) => {
  try {
    const { lan } = req.body;

    if (!lan) {
      return res.status(400).json({ ok: false, message: "LAN is required" });
    }

    await universalRunAllValidations(lan);

    res.json({
      ok: true,
      message: `Universal validations executed successfully for LAN ${lan}`,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});


// =====================================================
// SEND WELCOME LETTER MANUALLY
// =====================================================
app.post("/api/welcome-letter/send", async (req, res) => {
  try {
    const lan = String(req.body?.lan || "")
      .trim()
      .toUpperCase();

    let utrNumber = String(
      req.body?.utrNumber ||
      req.body?.utr ||
      req.body?.disbursement_utr ||
      "",
    ).trim();

    if (!lan) {
      return res.status(400).json({
        success: false,
        message: "LAN is required",
        code: "LAN_REQUIRED",
      });
    }

    /*
     * If UTR is not passed manually, fetch latest UTR from DB.
     */
    if (!utrNumber) {
      const [[utrRow]] = await db.promise().query(
        `
        SELECT Disbursement_UTR
        FROM ev_disbursement_utr
        WHERE LAN = ?
        ORDER BY id DESC
        LIMIT 1
        `,
        [lan],
      );

      utrNumber = String(utrRow?.Disbursement_UTR || "").trim();
    }

    if (!utrNumber) {
      return res.status(400).json({
        success: false,
        message: "UTR number is required or not found for this LAN",
        code: "UTR_REQUIRED",
      });
    }

    console.log("📩 Manual welcome letter request", {
      lan,
      utrNumber,
    });

    const emailResult = await sendWelcomeLetterAfterUtrUpload({
      lan,
      utrNumber,
    });

    return res.json({
      success: true,
      message: "Welcome letter sent successfully",
      data: {
        lan,
        utrNumber,
        recipient: emailResult?.recipient || null,
        messageId: emailResult?.emailMessageId || null,
        partnerTable: emailResult?.partnerTable || null,
        result: emailResult,
      },
    });
  } catch (error) {
    console.error("❌ Manual welcome letter failed", {
      message: error.message,
      code: error.code,
      context: error.context,
    });

    return res.status(500).json({
      success: false,
      message: error.message || "Welcome letter sending failed",
      code:
        error.code ||
        error.context?.errorCode ||
        "WELCOME_LETTER_FAILED",
      context: error.context || null,
    });
  }
});

app.post(
  "/api/test-rapid-money-disbursement-webhook",
  async (req, res) => {
    try {
      const {
        lan,
        transactionId,
        disbursementDate,
      } = req.body;

      if (
        !lan ||
        !transactionId ||
        !disbursementDate
      ) {
        return res.status(400).json({
          success: false,
          message:
            "lan, transactionId and disbursementDate are required",
        });
      }

      const result =
        await sendDisbursementWebhook({
          lan,
          transactionId,
          disbursementDate,
        });

      return res
        .status(
          result.success ? 200 : 202,
        )
        .json({
          success:
            result.success,
          message:
            result.success
              ? "Webhook sent successfully"
              : "Webhook failed and is queued for retry",
          result,
        });
    } catch (error) {
      console.error(
        "Rapid Money test webhook error:",
        error,
      );

      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  },
);

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
