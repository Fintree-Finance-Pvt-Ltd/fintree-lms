const express = require("express");
const multer = require("multer");
const axios = require("axios");
const path = require("path");
const fs = require("fs");
const db = require("../config/db");
const PDFDocument = require("pdfkit"); // (ok to keep or remove if unused)
const verifyApiKey = require("../middleware/apiKeyAuth");

const router = express.Router();

// Ensure upload folder exists
const uploadPath = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath, { recursive: true });

// ✅ Configure Multer for Disk Storage
const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadPath),
  filename: (_, file, cb) => {
    const uniqueName = `${Date.now()}_${file.originalname.replace(/\s+/g, "_")}`;
    cb(null, uniqueName);
  },
});
const upload = multer({ storage });

// ---------- DB helper ----------
function q(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

// ---------- LOCK / STATUS logic (ONLY change you needed) ----------

// Canonical statuses that allow edit
const ALLOWED_STATUSES = new Set(["login", "disburse-initiate"]);

// Normalize DB variations -> canonical
function normalizeStatus(s) {
  if (!s) return "";
  // lower, trim, replace spaces/underscores with hyphen
  let v = String(s).trim().toLowerCase().replace(/[\s_]+/g, "-");
  // handle any "disburse/disbursal/disbuse ... initiate" variants
  if (v.includes("disb") && v.includes("initiat")) v = "disburse-initiate";
  return v;
}

// Extract alphabetic prefix from LAN (EV111155 -> EV, GQN0001 -> GQN)
function getLanPrefix(lan) {
  const m = String(lan || "").trim().match(/^[A-Za-z]+/);
  return m ? m[0].toUpperCase() : "";
}

// Map prefix -> booking table + status column
const LAN_TABLE_MAP = {
  BL:  { table: "loan_bookings",           statusCol: "status" },
  EV:  { table: "loan_booking_ev",         statusCol: "status" },
  GQNONFSF: { table: "loan_booking_gq_fsf",     statusCol: "status" },
  GQFSF:  { table: "loan_booking_gq_non_fsf", statusCol: "status" },
  ADKF:  { table: "loan_booking_adikosh",    statusCol: "status" },
  WCTL: { table: "loan_bookings_wctl",      statusCol: "status" },
  E1:  { table: "loan_booking_embifi",     statusCol: "status" },
  FINE: { table: "loan_booking_emiclub",   statusCol: "status" },
  FINS: { table: "loan_booking_finso",    statusCol: "status" },
  HEL: { table: "loan_booking_helium",   statusCol: "status" },
  DLR: { table: "dealer_onboarding",   statusCol: "status" },
  ZYPF: { table: "loan_booking_zypay_customer",   statusCol: "status" },
};

// Dynamic lock-state: pick table by LAN prefix; tolerate LAN/lan column casing
// 🔎 Debuggable lock-state. Logs what it did and returns extra fields.
async function getLockState(lan) {
  const prefix = getLanPrefix(lan);
  const map = LAN_TABLE_MAP[prefix];

  if (!map) {
    console.warn("[lock] unknown prefix", { lan, prefix });
    return { status: "unknown", canEdit: false, _dbg: { lan, prefix, table: null, statusCol: null } };
  }

  // Try both `LAN` and `lan` column names (handles schemas using uppercase)
  const rows = await q(
    "SELECT ?? AS status FROM ?? WHERE `LAN` = ? OR `lan` = ? LIMIT 1",
    [map.statusCol, map.table, lan, lan]
  );

  const statusRaw = (rows?.[0]?.status ?? "").toString().trim();
  const statusNormalized = normalizeStatus(statusRaw);
  const canEdit = statusNormalized ? ALLOWED_STATUSES.has(statusNormalized) : false;

  const dbg = { lan, prefix, table: map.table, statusCol: map.statusCol, statusRaw, statusNormalized, canEdit };

  // keep response shape that your UI expects, but add _dbg for quick troubleshooting
  return { status: statusRaw || "unknown", canEdit, _dbg: dbg };
}

function safeUnlink(fp) {
  try { fs.unlinkSync(fp); } catch (e) { if (e.code !== "ENOENT") console.error("unlink error:", e); }
}

// ---------------------------- Routes (unchanged) ----------------------------

// ✅ Upload a Document
router.post("/upload", upload.single("document"), (req, res) => {
  const { lan, filename } = req.body;

  if (!req.file || !lan) {
    return res.status(400).json({ error: "LAN and file are required." });
  }

  const storedName = req.file.filename;
  const originalName = filename || req.file.originalname;

  db.query(
    `INSERT INTO loan_documents (lan, file_name, original_name, uploaded_at) VALUES (?, ?, ?, NOW())`,
    [lan.trim(), storedName, originalName.trim()],
    (err) => {
      if (err) {
        console.error("❌ DB Insert Error:", err);
        return res.status(500).json({ error: "Database insert failed" });
      }
      res.status(200).json({ message: "✅ Document uploaded successfully" });
    }
  );
});
////////////////////// API to upload multiple files ///////////////////////
router.post("/upload-files", verifyApiKey, upload.array("documents", 10), (req, res) => {
  const { lan } = req.body;

  if (!req.files || req.files.length === 0 || !lan) {
    return res.status(400).json({ error: "LAN and files are required." });
  }

  // Build values for bulk insert
  const values = req.files.map((file) => [
    lan.trim(),
    file.filename, // stored name generated by multer
    file.originalname.trim(),
    new Date(),
  ]);

  db.query(
    `INSERT INTO loan_documents (lan, file_name, original_name, uploaded_at) VALUES ?`,
    [values],
    (err) => {
      if (err) {
        console.error("❌ DB Insert Error:", err);
        return res.status(500).json({ error: "Database insert failed" });
      }
      res.status(200).json({
        message: "✅ Documents uploaded successfully",
        lan,
        files: req.files.map((f) => f.originalname),
      });
    }
  );
});
///////////////////////ZYPAY CUSTOMER ///////////////////////////////
const ALLOWED_DOC_NAMES = [
  "AADHAR",
  "PAN",
  "CUSTOMER_PHOTO",
  "INVOICE",
  "INSTALLED_APP_PHOTO",
  "DEALER_WITH_CUSTOMER",
  "CUSTOMER_PHONE_BOX_PIC",
  "OPEN_BOX_PIC",
  "BUREAU_PDF",
  "IMEI_NUMBER_PHOTO",
  "OTHER"
];

router.post(
  "/zypay/upload-documents",
  verifyApiKey,
  upload.array("documents", 10),
  async (req, res) => {
    try {
      const { lan, doc_name, doc_password } = req.body;

      if (!lan || !doc_name || !req.files || req.files.length === 0) {
        return res.status(400).json({
          error: "LAN, doc_name, and documents are required"
        });
      }

      // ✅ Validate doc_name
      if (!ALLOWED_DOC_NAMES.includes(doc_name)) {
        return res.status(400).json({
          error: `Invalid doc_name. Allowed values: ${ALLOWED_DOC_NAMES.join(", ")}`
        });
      }

      const values = req.files.map((file) => [
        lan.trim(),
        file.filename,
        file.originalname.trim(),
        doc_password || null,
        doc_name,
        new Date()
      ]);

      const sql = `
        INSERT INTO loan_documents
        (
          lan,
          file_name,
          original_name,
          doc_password,
          doc_name,
          uploaded_at
        )
        VALUES ?
      `;

      db.query(sql, [values], (err) => {
        if (err) {
          console.error("❌ Document Insert Error:", err);
          return res.status(500).json({
            error: "Database insert failed"
          });
        }

        return res.status(200).json({
          message: "✅ Documents uploaded successfully",
          lan,
          doc_name,
          files: req.files.map((f) => f.originalname)
        });
      });
    } catch (error) {
      console.error("❌ Upload Error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);





///////////////// NEW CODE for EMICLUB DOC UPLOAD API /////////////////
/* ============================== Helpers ============================== */

const ALLOWED_DOCS = new Set([
  "KYC",
  "PAN_CARD",
  "PAN_VERIFICATION_AUDIT_TRAIL",
  "OFFLINE_VERIFICATION_OF_AADHAAR",
  "PROFILE_IMAGE",
  "INVOICE",
  "AGREEMENT",
  "KFS_DOCUMENT",
  "AUDIT_REPORT",
  "CIBIL_REPORT",
]);

function isValidUrl(u) {
  try { new URL(u); return true; } catch { return false; }
}

function inferOriginalNameFromUrl(url) {
  try {
    const p = new URL(url).pathname || "";
    const base = p.split("/").pop() || "";
    return base.trim() || null;
  } catch { return null; }
}

router.post("/upload-files-emiclub", verifyApiKey, async (req, res) => {
  try {
    const { lan: bodyLan, documents } = req.body;

    const lan = String(bodyLan || "").trim();
    if (!lan) return res.status(400).json({ error: "lan is required" });

    if (!Array.isArray(documents) || documents.length === 0)
      return res.status(400).json({ error: "documents[] is required" });

    const errors = [];
    const warnings = [];
    const cleaned = [];

    for (let i = 0; i < documents.length; i++) {
      const d = documents[i] || {};
      const doc_name = String(d.doc_name || "").trim();
      const url = String(d.documet_url || "").trim();
      const doc_password = (d.doc_password ?? "").toString().trim();

      if (!doc_name || !ALLOWED_DOCS.has(doc_name)) {
        errors.push({ index: i, field: "doc_name", reason: "Invalid doc_name" });
        continue;
      }
      if (!isValidUrl(url)) {
        errors.push({ index: i, field: "documet_url", reason: "Invalid URL" });
        continue;
      }

      // 1️⃣ Try downloading the file
      let file_name = null;
      const original_name = inferOriginalNameFromUrl(url) || `${doc_name}.pdf`;
      try {
        const resp = await axios.get(url, { responseType: "arraybuffer" });
        const ext = path.extname(original_name) || ".bin";
        file_name = `${Date.now()}_${doc_name}${ext}`;
        const fullPath = path.join(uploadPath, file_name);
        fs.writeFileSync(fullPath, resp.data);
      } catch (downloadErr) {
        errors.push({
          index: i,
          field: "documet_url",
          reason: `Failed to fetch remote file: ${downloadErr.message}`,
        });
        continue;
      }

      cleaned.push({
        lan,
        doc_name,
        source_url: url,
        file_name,
        original_name,
        doc_password: doc_password || null,
      });
    }

    if (cleaned.length === 0)
      return res.status(400).json({ error: "No valid documents to insert", details: errors });

    const now = new Date();
    const values = cleaned.map((row) => [
      row.lan,
      row.doc_name,
      row.file_name,
      row.source_url,
      row.doc_password,
      row.original_name,
      now,
    ]);

    const sql = `
      INSERT INTO loan_documents
        (lan, doc_name, file_name, source_url, doc_password, original_name, uploaded_at)
      VALUES ?
    `;

    await new Promise((resolve, reject) => {
      db.query(sql, [values], (err, result) => (err ? reject(err) : resolve(result)));
    });

    return res.status(200).json({
      message: "✅ Documents downloaded & saved locally",
      lan,
      inserted_count: cleaned.length,
      warnings,
      skipped_or_errors: errors,
      docs: cleaned.map((d) => ({
        doc_name: d.doc_name,
        original_name: d.original_name,
        local_file: d.file_name,
        source_url: d.source_url,
      })),
    });
  } catch (err) {
    console.error("❌ /upload-files-emiclub error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

///////////////// DEALER API DOC UPLOAD START /////////////////////
/* ===========================
   Dealer Allowed Docs
=========================== */

const ALLOWED_DEALER_DOCS = new Set([
  "BUSINESS_REGISTRATION",
  "INCORPORATION_CERTIFICATE",
  "SHOP_ESTABLISHMENT_CERTIFICATE",

  "GST_CERTIFICATE",
  "DEALER_PAN_CARD",
  "UDYAM_CERTIFICATE",
  "CIN_CERTIFICATE",

  "DEALER_KYC",
  "SHOP_ADDRESS_PROOF",
  "PROFILE_IMAGE",
  "BILL_INVOICE",

  "CANCELLED_CHEQUE",
  "BANK_STATEMENT",
  "BANK_ACCOUNT_CONFIRMATION",

  "RENTAL_AGREEMENT",
  "STORE_PHOTO_INSIDE",
  "STORE_PHOTO_OUTSIDE",
  "UTILITY_BILL",

  "DEALER_AGREEMENT",
  "FINANCING_ADDENDUM",
  "MISC_DOCUMENT",
]);

/* ===========================
   Helper Functions (Shared)
=========================== */

function isValidUrl(u) {
  try {
    new URL(u);
    return true;
  } catch {
    return false;
  }
}

function inferOriginalNameFromUrl(url) {
  try {
    const p = new URL(url).pathname || "";
    const base = p.split("/").pop() || "";
    return base.trim() || null;
  } catch {
    return null;
  }
}

/* ===========================
   Dealer Upload Route
=========================== */

router.post(
  "/upload-files-dealer",
  verifyApiKey,
  upload.array("documents", 20), // ✅ REQUIRED for form-data
  async (req, res) => {
    try {
      const { lan: bodyLan } = req.body || {};
      const files = req.files || [];

      const lan = String(bodyLan || "").trim();
      if (!lan)
        return res.status(400).json({ error: "lan is required" });

      if (!files.length)
        return res.status(400).json({ error: "documents[] is required" });

      const errors = [];
      const cleaned = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        // doc_name should be sent along with each file as form-data field
        const doc_name = String(req.body[`doc_name_${i}`] || "").trim();
        const doc_password = String(req.body[`doc_password_${i}`] || "").trim();

        if (!doc_name || !ALLOWED_DEALER_DOCS.has(doc_name)) {
          errors.push({
            index: i,
            field: "doc_name",
            reason: "Invalid dealer doc_name",
          });
          continue;
        }

        cleaned.push({
          lan,
          doc_name,
          source_url: null,
          file_name: file.filename,
          original_name: file.originalname,
          doc_password: doc_password || null,
        });
      }

      if (cleaned.length === 0) {
        return res.status(400).json({
          error: "No valid documents to insert",
          details: errors,
        });
      }

      const now = new Date();
      const values = cleaned.map((r) => [
        r.lan,
        r.doc_name,
        r.file_name,
        r.source_url,
        r.doc_password,
        r.original_name,
        now,
      ]);

      await q(
        `INSERT INTO loan_documents
         (lan, doc_name, file_name, source_url, doc_password, original_name, uploaded_at)
         VALUES ?`,
        [values]
      );

      res.status(200).json({
        message: "✅ Dealer documents uploaded successfully",
        lan,
        inserted_count: cleaned.length,
        skipped_or_errors: errors,
      });
    } catch (err) {
      console.error("❌ /upload-files-dealer error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);





///////////////// DEALER API DOC UPLOAD END /////////////////////


router.get("/lock-state/:lan", async (req, res) => {
  try {
    const { lan } = req.params;
    const lock = await getLockState(lan);
    // lock = { status, canEdit, _dbg: {...} }
    res.json(lock);
  } catch (err) {
    console.error("❌ Lock-state error:", err);
    res.status(500).json({ error: "Failed to fetch lock state" });
  }
});


// List by LAN
router.get("/:lan", async (req, res) => {
  try {
    const { lan } = req.params;
    const docs = await q(
      "SELECT id, lan, file_name, original_name, uploaded_at FROM loan_documents WHERE lan = ? ORDER BY uploaded_at DESC",
      [lan]
    );
    res.json(docs);
  } catch (err) {
    console.error("❌ List docs error:", err);
    res.status(500).json({ error: "Failed to fetch documents" });
  }
});

// Delete with lock
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const rows = await q("SELECT id, lan, file_name FROM loan_documents WHERE id = ? LIMIT 1", [id]);
    if (rows.length === 0) return res.status(404).json({ error: "Document not found" });

    const doc = rows[0];
    const { status, canEdit } = await getLockState(doc.lan);
    if (!canEdit) return res.status(403).json({ error: `Documents locked for status '${status}'` });

    await q("DELETE FROM loan_documents WHERE id = ? LIMIT 1", [id]);
    safeUnlink(path.join(uploadPath, doc.file_name || ""));

    res.json({ message: "✅ Document deleted", id });
  } catch (err) {
    console.error("❌ Delete doc error:", err);
    res.status(500).json({ error: "Failed to delete document" });
  }
});

// Replace with lock
router.put("/:id/replace", upload.single("document"), async (req, res) => {
  try {
    const { id } = req.params;
    if (!req.file) return res.status(400).json({ error: "New file is required" });

    const rows = await q(
      "SELECT id, lan, file_name, original_name FROM loan_documents WHERE id = ? LIMIT 1",
      [id]
    );
    if (rows.length === 0) {
      safeUnlink(path.join(uploadPath, req.file.filename));
      return res.status(404).json({ error: "Document not found" });
    }

    const oldDoc = rows[0];
    const { status, canEdit } = await getLockState(oldDoc.lan);
    if (!canEdit) {
      safeUnlink(path.join(uploadPath, req.file.filename));
      return res.status(403).json({ error: `Documents locked for status '${status}'` });
    }

    await q(
      "UPDATE loan_documents SET file_name = ?, original_name = ?, uploaded_at = NOW() WHERE id = ?",
      [req.file.filename, req.file.originalname, id]
    );

    safeUnlink(path.join(uploadPath, oldDoc.file_name || ""));
    res.json({ message: "✅ Document replaced", id, newFile: req.file.originalname });
  } catch (err) {
    console.error("❌ Replace doc error:", err);
    res.status(500).json({ error: "Failed to replace document" });
  }
});

const safeNum = (x) => Number(x) || 0;

const formatDate = (d) => {
  return new Date(d).toLocaleDateString("en-GB").split("/").reverse().join("-");
};

//////////////////////////  working one //////////////////////

// router.post("/generate-soa", async (req, res) => {
//   const { lan } = req.body;

//   let loanTable = "";
//   let rpsTable = "";
//   let paymentsTable = "";
//   let chargesTable = "";

//   if (lan.startsWith("GQN")) {
//     loanTable = "loan_booking_gq_non_fsf";
//     rpsTable = "manual_rps_gq_non_fsf";
//     paymentsTable = "repayments_upload";
//     chargesTable = "loan_charges";
//   } else if (lan.startsWith("GQF")) {
//     loanTable = "loan_booking_gq_fsf";
//     rpsTable = "manual_rps_gq_fsf";
//     paymentsTable = "repayments_upload";
//     chargesTable = "loan_charges";
//   } else if (lan.startsWith("ADK")) {
//     loanTable = "loan_booking_adikosh";
//     rpsTable = "manual_rps_adikosh";
//     paymentsTable = "repayments_upload_adikosh";
//     chargesTable = "loan_charges";
//   } else if (lan.startsWith("EV")) {
//     loanTable = "loan_booking_ev";
//     rpsTable = "manual_rps_ev_loan";
//     paymentsTable = "repayments_upload";
//     chargesTable = "loan_charges";
//   }
//   // else if (lan.startsWith("BL")) {
//   //   loanTable = "loan_bookings";
//   //   rpsTable = "manual_rps_ev_loan";
//   //   paymentsTable = "repayments_upload";
//   //   chargesTable = "loan_charges";
//   // }
//   else {
//     loanTable = "loan_bookings";
//     rpsTable = "manual_rps_bl_loan";
//     paymentsTable = "repayments_upload";
//     chargesTable = "loan_charges";
//   }

//   try {
//     const [loanRows] = await db.promise().query(`SELECT * FROM ${loanTable} WHERE lan = ?`, [lan]);
//     const loan = loanRows[0] || {};

//     const [rpsRows] = await db.promise().query(
//       `SELECT due_date, emi FROM ${rpsTable} WHERE lan = ? AND due_date <= CURDATE() ORDER BY due_date`,
//       [lan]
//     );

//     const [chargesRows] = await db.promise().query(
//       `SELECT due_date, charge_type, amount FROM ${chargesTable} WHERE lan = ? AND due_date <= CURDATE() ORDER BY due_date`,
//       [lan]
//     );

//     const [paymentRows] = await db.promise().query(
//       `SELECT bank_date AS payment_date, payment_mode, transfer_amount FROM ${paymentsTable} WHERE lan = ? AND bank_date <= CURDATE() ORDER BY bank_date`,
//       [lan]
//     );

//     let closing = 0;
//     const finalRows = [];

//     // Prepare payment pool
//     let remainingPayments = [];
//     paymentRows.forEach(p => {
//       remainingPayments.push({
//         date: p.payment_date,
//         mode: p.payment_mode,
//         amount: safeNum(p.transfer_amount)
//       });
//     });

//     const allDebits = [];

//     rpsRows.forEach(rps => {
//       allDebits.push({
//         due_date: rps.due_date,
//         description: 'EMI Due',
//         charge_type: 'EMI',
//         amount: safeNum(rps.emi)
//       });
//     });

//     chargesRows.forEach(c => {
//       if (c.charge_type === "Advanced_EMI" || c.charge_type === "Pre EMI") {
//     return; // skip these entries
//   }
//       allDebits.push({
//         due_date: c.due_date,
//         description: 'Penalty Charge',
//         charge_type: c.charge_type,
//         amount: safeNum(c.amount)
//       });
//     });

//     allDebits.sort((a, b) => new Date(a.due_date) - new Date(b.due_date));

//     // Knock-off logic - alternate debit/credit
//     for (let debitItem of allDebits) {
//       // Debit Row
//       const opening = closing;
//       closing = opening + debitItem.amount;

//       finalRows.push({
//         due_date: formatDate(debitItem.due_date),
//         description: debitItem.description,
//         charge_type: debitItem.charge_type,
//         debit: debitItem.amount.toFixed(2),
//         credit: '0.00',
//         opening: opening.toFixed(2),
//         closing: closing.toFixed(2),
//       });

//       // Knock-off from payments
//       while (debitItem.amount > 0 && remainingPayments.length > 0) {
//         let payment = remainingPayments[0];
//         const knockAmount = Math.min(debitItem.amount, payment.amount);

//         const openingCr = closing;
//         closing = openingCr - knockAmount;

//         finalRows.push({
//           due_date: formatDate(payment.date),
//           description: 'Repayment Received',
//           charge_type: payment.mode,
//           debit: '0.00',
//           credit: knockAmount.toFixed(2),
//           opening: openingCr.toFixed(2),
//           closing: closing.toFixed(2),
//         });

//         debitItem.amount -= knockAmount;
//         payment.amount -= knockAmount;

//         if (payment.amount <= 0) {
//           remainingPayments.shift(); // Move to next payment
//         }
//       }
//     }

//     // === PDF Generation ===
//     const doc = new PDFDocument({ margin: 40 });
//     const filename = `SOA_${lan}_${Date.now()}.pdf`;
//     const filePath = path.join(__dirname, `../uploads/${filename}`);
//     const writeStream = fs.createWriteStream(filePath);
//     doc.pipe(writeStream);

//     doc.image(path.join(__dirname, "../public/fintree-logo.png"), { fit: [100, 100], align: "center" })
//       .moveDown(0.5)
//       .fontSize(14)
//       .text("Statement Of Account", { align: "center" })
//       .moveDown()
//       .fontSize(12)
//       .text(`Customer Name: ${loan.customer_name || "-"}`)
//       .text(`Loan Account No: ${loan.lan || "-"}`)
//       .text(`Partner Loan ID: ${loan.partner_loan_id || "-"}`)
//       .text(`Date: ${new Date().toLocaleDateString("en-IN")}`)
//       .moveDown();

//     // Table
//     const rowHeight = 20;
//     const startX = 40;
//     let y = doc.y + 20;

//     const colWidths = [80, 100, 70, 60, 60, 70, 70];
//     const headers = ["Due Date", "Description", "Charge", "Debit", "Credit", "Opening", "Closing"];

//     let x = startX;
//     doc.font('Helvetica-Bold').fontSize(10);
//     headers.forEach((h, i) => {
//       doc.rect(x, y, colWidths[i], rowHeight).stroke();
//       doc.text(h, x + 2, y + 5, { width: colWidths[i] - 4 });
//       x += colWidths[i];
//     });
//     y += rowHeight;

//     doc.font('Helvetica').fontSize(9);

//     // Sort final rows by date before rendering
// finalRows.sort((a, b) => {
//   const dateA = new Date(a.due_date);
//   const dateB = new Date(b.due_date);

//   if (dateA.getTime() !== dateB.getTime()) {
//     return dateA - dateB;
//   }

//   // Assign priorities: EMI Due (1), Penalty Charge (2), Repayment Received (3)
//   const getPriority = (desc) => {
//     if (desc === 'EMI Due') return 1;
//     if (desc === 'Penalty Charge') return 2;
//     if (desc === 'Repayment Received') return 3;
//     return 4;
//   };

//   return getPriority(a.description) - getPriority(b.description);
// });

// finalRows.forEach(row => {
//   x = startX;
//   const values = [
//     row.due_date,
//     row.description,
//     row.charge_type,
//     row.debit,
//     row.credit,
//     row.opening,
//     row.closing,
//   ];

//       values.forEach((val, i) => {
//         doc.rect(x, y, colWidths[i], rowHeight).stroke();
//         doc.text(val, x + 2, y + 5, { width: colWidths[i] - 4 });
//         x += colWidths[i];
//       });

//       y += rowHeight;

//       if (y + rowHeight > doc.page.height - 50) {
//         doc.addPage();
//         y = 50;
//       }
//     });

//     doc.moveDown(2)
//       .fontSize(10)
//       .text("***This is a system generated letter and does not require a signature***", 50, doc.y);

//     writeStream.on("finish", async () => {
//       await db.promise().query(
//         `INSERT INTO loan_documents (lan, file_name, original_name) VALUES (?, ?, ?);`,
//         [lan, filename, `SOA - ${lan}`]
//       );
//       res.json({ fileUrl: `http://localhost:5000/uploads/${filename}` });
//     });
//     doc.end();

//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ error: "SOA generation failed", details: err.message });
//   }
// });


// ---------- helpers ----------
const fmtDate = d => {
  if (!d) return "-";
  const t = new Date(d);
  return isNaN(t) ? String(d) : t.toISOString().slice(0, 10);
};

const inr = n => (Number(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDDMMMYYYY = (d) => {
  if (!d) return "-";
  const dt = new Date(d);
  if (isNaN(dt)) return String(d);
  return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase();
};


// single-line cell (no wrap) trimmed with ellipsis
function cellText(doc, text, x, y, w, h, align = "left") {
  const pad = 3;
  const innerW = w - pad * 2;
  let s = (text === null || text === undefined || text === "") ? "-" : String(text);

  if (doc.widthOfString(s) > innerW) {
    const ell = "…";
    let lo = 0, hi = s.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      const candidate = s.slice(0, mid) + ell;
      if (doc.widthOfString(candidate) <= innerW) lo = mid + 1; else hi = mid;
    }
    s = s.slice(0, Math.max(0, lo - 1)) + ell;
  }

  doc.text(s, x + pad, y + (h - doc.currentLineHeight()) / 2, {
    width: innerW,
    align,
    lineBreak: false,
  });
}

// draw header with absolute positions; return next y
function drawHeaderAbs(doc, y, colX, colW, headers, rowH) {
  doc.font("Helvetica-Bold").fontSize(9);
  for (let i = 0; i < headers.length; i++) {
    const x = colX[i], w = colW[i];
    doc.rect(x, y, w, rowH).stroke();
    cellText(doc, headers[i], x, y, w, rowH, "left");
  }
  return y + rowH;
}

// ----------------- route -----------------
router.post("/generate-soa", async (req, res) => {
  const { lan } = req.body;
  if (!lan) return res.status(400).json({ error: "lan required" });

  // pick tables
  let loanTable = "", rpsTable = "", paymentsTable = "", chargesTable = "";
  if (lan.startsWith("GQN")) {
    loanTable = "loan_booking_gq_non_fsf";
    rpsTable = "manual_rps_gq_non_fsf";
    paymentsTable = "repayments_upload";
    chargesTable = "loan_charges";
  } else if (lan.startsWith("GQF")) {
    loanTable = "loan_booking_gq_fsf";
    rpsTable = "manual_rps_gq_fsf";
    paymentsTable = "repayments_upload";
    chargesTable = "loan_charges";
  } else if (lan.startsWith("ADK")) {
    loanTable = "loan_booking_adikosh";
    rpsTable = "manual_rps_adikosh";
    paymentsTable = "repayments_upload_adikosh";
    chargesTable = "loan_charges";
  } else if (lan.startsWith("EV")) {
    loanTable = "loan_booking_ev";
    rpsTable = "manual_rps_ev_loan";
    paymentsTable = "repayments_upload";
    chargesTable = "loan_charges";
  }
  else if (lan.startsWith("E1")) {
    loanTable = "loan_booking_embifi";
    rpsTable = "manual_rps_embifi_loan";
    paymentsTable = "repayments_upload";
    chargesTable = "loan_charges";
    }
  else if (lan.startsWith("ZYPF")) {
    loanTable = "loan_booking_zypay_customer";
    rpsTable = "manual_rps_zypay_customer";
    paymentsTable = "repayments_upload";
    chargesTable = "loan_charges";
  } else if (lan.startsWith("BL")) {
    loanTable = "loan_bookings";
    rpsTable = "manual_rps_bl_loan";
    paymentsTable = "repayments_upload";
    chargesTable = "loan_charges";
  }

  try {
    // -------- fetch from DB --------
    const [loanRows] = await db.promise().query(
      `SELECT * FROM ${loanTable} WHERE lan = ? LIMIT 1`, [lan]
    );
    const loan = loanRows[0] || {};
    const baseLoanAmt = safeNum(
      loan.loan_amount || loan.disbursed_amount || loan.disbursal_amount || loan.sanction_amount || 0
    );

    const [rpsRows] = await db.promise().query(
      `SELECT due_date, emi
         FROM ${rpsTable}
        WHERE lan = ?
          AND due_date <= CURDATE()
        ORDER BY due_date`, [lan]
    );

    const [chargesRows] = await db.promise().query(
      `SELECT due_date, charge_type, amount, charge_date
         FROM ${chargesTable}
        WHERE lan = ?
          AND (due_date <= CURDATE() OR charge_date <= CURDATE())
        ORDER BY COALESCE(due_date, charge_date)`, [lan]
    );

    const [paymentRows] = await db.promise().query(
      `SELECT payment_id, bank_date, payment_date, payment_mode, transfer_amount
         FROM ${paymentsTable}
        WHERE lan = ?
          AND (bank_date <= CURDATE() OR payment_date <= CURDATE())
        ORDER BY COALESCE(bank_date, payment_date)`, [lan]
    );

    const [allocationRows] = await db.promise().query(
      `SELECT id, due_date, allocation_date, allocated_amount, charge_type, payment_id, bank_date_allocation
         FROM allocation
        WHERE lan = ?
        ORDER BY COALESCE(allocation_date, bank_date_allocation), id`, [lan]
    );

    // Aggregate tenure / start / end / emi for the full schedule (no date filter)
const [[tenureAgg]] = await db.promise().query(
  `SELECT MIN(due_date) AS start_date,
          MAX(due_date) AS end_date,
          COUNT(*)       AS total_instalments,
          MAX(emi)       AS emi_any
     FROM ${rpsTable}
    WHERE lan = ?`,
  [lan]
);

// EMI/PEMI overdue = sum of EMIs with due_date <= today and status <> 'Paid'
const [[overdueAgg]] = await db.promise().query(
  `SELECT COALESCE(SUM(CASE WHEN status <> 'Paid' AND due_date <= CURDATE() THEN emi ELSE 0 END),0) AS total_emi_overdue
     FROM ${rpsTable}
    WHERE lan = ?`,
  [lan]
);

// Other overdues = unpaid loan_charges with due_date/charge_date <= today
const [[otherDueAgg]] = await db.promise().query(
  `SELECT COALESCE(SUM(amount - COALESCE(waived_amount,0) - COALESCE(paid_amount,0)),0) AS other_due
     FROM ${chargesTable}
    WHERE lan = ?
      AND (COALESCE(due_date, charge_date) <= CURDATE())
      AND (LOWER(COALESCE(paid_status,'')) <> 'paid')`,
  [lan]
);


    // -------- starting outstanding = Loan Amount (no Advance/Pre-EMI deduction) --------
    let outstanding = baseLoanAmt;

    // -------- build timeline --------
    const payMap = new Map((paymentRows || []).map(p => [p.payment_id, p]));

    // Debits: EMIs + charges (do NOT change outstanding)
    const debits = [];
    (rpsRows || []).forEach(r => {
      debits.push({
        type: "DEBIT",
        date: r.due_date,
        description: "EMI Due",
        charge_type: "EMI",
        debit: safeNum(r.emi),
      });
    });
    (chargesRows || []).forEach(c => {
      debits.push({
        type: "DEBIT",
        date: c.due_date || c.charge_date || null,
        description: c.charge_type || "Charge",
        charge_type: c.charge_type,
        debit: safeNum(c.amount),
      });
    });

    // Credits: allocations by component
    const credits = [];
    (allocationRows || []).forEach(a => {
      const allocDate = a.allocation_date || a.bank_date_allocation || null;
      const p = payMap.get(a.payment_id) || null;
      const payment_date = p ? p.payment_date || null : null; // shown in last column
      const amt = safeNum(a.allocated_amount);
      const ct = (a.charge_type || "").toLowerCase();

      credits.push({
        type: "CREDIT",
        date: allocDate || payment_date || new Date(),
        description: `Allocation - ${a.charge_type || "Allocation"}`,
        charge_type: a.charge_type,
        principal: ct === "principal" ? amt : 0,
        interest:  ct === "interest"  ? amt : 0,
        other: (ct !== "principal" && ct !== "interest") ? amt : 0,
        total: amt,
        payment_date,
      });
    });

    // Any unallocated payments → show as "other"
    const allocatedIds = new Set((allocationRows || []).map(a => a.payment_id).filter(Boolean));
    (paymentRows || []).forEach(p => {
      if (!allocatedIds.has(p.payment_id)) {
        credits.push({
          type: "CREDIT",
          date: p.bank_date || p.payment_date || new Date(),
          description: "Repayment (unallocated)",
          charge_type: p.payment_mode,
          principal: 0,
          interest:  0,
          other: safeNum(p.transfer_amount),
          total: safeNum(p.transfer_amount),
          payment_date: p.payment_date,
        });
      }
    });

    // Merge + sort (DEBIT before CREDIT on same date)
    const all = [...debits, ...credits].sort((a, b) => {
      const ta = new Date(a.date).getTime(), tb = new Date(b.date).getTime();
      if (ta !== tb) return ta - tb;
      if (a.type === "DEBIT" && b.type === "CREDIT") return -1;
      if (a.type === "CREDIT" && b.type === "DEBIT") return 1;
      return 0;
    });

    // Final rows (only principal reduces outstanding)
    const rows = [];
    for (const it of all) {
      const opening = outstanding;
      if (it.type === "DEBIT") {
        rows.push({
          date: fmtDate(it.date),
          description: it.description,
          charge: it.charge_type || "-",
          debit: safeNum(it.debit).toFixed(2),
          principal: "0.00",
          interest: "0.00",
          total_credit: "0.00",
          opening: opening.toFixed(2),
          closing: opening.toFixed(2),
          paydate: "-",
        });
      } else {
        const p = safeNum(it.principal || 0);
        const i = safeNum(it.interest  || 0);
        const o = safeNum(it.other     || 0);
        const tot = p + i + o;
        outstanding = Math.max(0, opening - p); // principal only
        rows.push({
          date: fmtDate(it.date),
          description: it.description,
          charge: it.charge_type || "-",
          debit: "0.00",
          principal: p.toFixed(2),
          interest: i.toFixed(2),
          total_credit: tot.toFixed(2),
          opening: opening.toFixed(2),
          closing: outstanding.toFixed(2),
          paydate: fmtDate(it.payment_date),
        });
      }
    }

    // ------------ summary header fields ------------
const productName = loan.lender || "BL Loan";
const loanAmt = baseLoanAmt;
const roi = loan.interest_rate || "-";

// start / end dates
const emiStart = tenureAgg?.start_date || null;
const emiLast  = tenureAgg?.end_date   || null;

// tenure months: from DB if present, else count of instalments
const tenureMonths = loan.loan_tenure || tenureAgg?.total_instalments || "-";

// emi amount: prefer loan.emi_amount then any schedule EMI
const emiAmt = safeNum(loan.emi_amount || tenureAgg?.emi_any || 0);

// overdue sums
const totalEmiOverdue = safeNum(overdueAgg?.total_emi_overdue || 0);
const otherOverdues   = safeNum(otherDueAgg?.other_due || 0);
const totalOverdue    = totalEmiOverdue + otherOverdues;

// principal outstanding is your running outstanding
const principalOutstanding = safeNum(outstanding);


    // -------- PDF: stable multi-page layout --------
    const MARGINS = { top: 40, left: 40, right: 40, bottom: 40 };
    const doc = new PDFDocument({
      size: "A4",
      layout: "landscape",
      margins: MARGINS,
    });

    const outDir = path.join(__dirname, "../uploads");
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const filename = `SOA_${lan}_${Date.now()}.pdf`;
    const filePath = path.join(outDir, filename);
    const ws = fs.createWriteStream(filePath);
    doc.pipe(ws);

    // --- Logo + Title ---
doc.image(path.join(__dirname, "../public/fintree-logo.png"), { fit: [100, 100], align: "center" })
  .moveDown(0.5);

doc.font("Helvetica-Bold").fontSize(16)
  .text("Statement Of Account", { align: "center" })
  .moveDown(0.6);

// --- Body (regular font) ---
doc.font("Helvetica").fontSize(11);

// Left column

const leftX  = doc.page.margins.left;
// const leftX   = leftX + 360; // second column start (tweak if needed)


const drawLine = (x, label, value) => {
  doc.text(`${label}: ${value}`, x);
  doc.moveDown(0.1);
};

doc.text(`Customer Name: ${loan.customer_name || "-"}`)
      .text(`Loan Account No: ${loan.lan || "-"}`)
      .text(`Partner Loan ID: ${loan.app_id || "-"}`)
drawLine(leftX,  "Loan Amount (Rs)",            inr(loanAmt));
drawLine(leftX,  "Rate of Interest (%)",        roi);
drawLine(leftX,  "EMI Start Date",              fmtDDMMMYYYY(emiStart));
drawLine(leftX,  "Loan Tenure",                 `${tenureMonths} Months`);

// Right column lines
// doc.y = startY; // align top of right column with left
drawLine(leftX,   "EMI Last Date",               fmtDDMMMYYYY(emiLast));
drawLine(leftX,   "EMI (Rs)",                    inr(emiAmt));
drawLine(leftX,   "Total EMI Overdue",     inr(totalEmiOverdue));
drawLine(leftX,   "Principal Outstanding",       inr(principalOutstanding));
drawLine(leftX, "Report Date", new Date().toLocaleDateString("en-IN"));

doc.moveDown(0.6);


    // column widths (edit here only)
    const colW = [
      60,  // Date
      95,  // Description
      70,  // Charge
      70,  // Debit
      70,  // Principal
      70,  // Interest
      70,  // Total Credit
      80,  // Opening
      80,  // Closing
      90   // Payment Date
    ];
    const headers = ["Date","Description","Charge","Debit","Principal","Interest","Total Credit","Opening","Closing","Payment Date"];

    // absolute X positions from the left margin
    const colX = new Array(colW.length);
    colX[0] = MARGINS.left;
    for (let i = 1; i < colW.length; i++) colX[i] = colX[i - 1] + colW[i - 1];

    const rowH = 18;
    const bottomY = doc.page.height - MARGINS.bottom;

    // Header (page 1)
    let y = drawHeaderAbs(doc, doc.y, colX, colW, headers, rowH);
    doc.font("Helvetica").fontSize(9);

    // Rows
    for (const r of rows) {
      if (y + rowH > bottomY) {
        doc.addPage({ size: "A4", layout: "landscape", margins: MARGINS });
        y = MARGINS.top + 10;
        y = drawHeaderAbs(doc, y, colX, colW, headers, rowH);
        doc.font("Helvetica").fontSize(9);
      }

      // grid boxes (absolute x each time)
      for (let i = 0; i < colW.length; i++) {
        doc.rect(colX[i], y, colW[i], rowH).stroke();
      }

      const vals = [
        r.date, r.description, r.charge, r.debit,
        r.principal, r.interest, r.total_credit,
        r.opening, r.closing, r.paydate
      ];
      for (let i = 0; i < colW.length; i++) {
        const right = i >= 3 && i <= 8; // numeric columns
        cellText(doc, vals[i], colX[i], y, colW[i], rowH, right ? "right" : "left");
      }
      y += rowH;
    }

    // footer
    doc.moveDown(1).fontSize(9)
      .text("***This is a system generated document and does not require a signature***",
            MARGINS.left, y + 6);

    doc.end();

    ws.on("finish", async () => {
      try {
        await db.promise().query(
          `INSERT INTO loan_documents (lan, file_name, original_name) VALUES (?, ?, ?)`,
          [lan, filename, `SOA - ${lan}`]
        );
      } catch {}
      const protocol = req.protocol || "http";
      const host = req.get("host") || "localhost:5000";
      res.json({ fileUrl: `${protocol}://${host}/uploads/${filename}` });
    });

    ws.on("error", err => res.status(500).json({ error: "Failed to write PDF", details: err.message }));

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "SOA generation failed", details: err.message });
  }
});

router.post("/generate-noc", async (req, res) => {
  const { lan } = req.body;
  if (!lan) return res.status(400).json({ error: "lan required" });

  // pick loan table same as SOA
  let loanTable = "";
  if (lan.startsWith("GQN"))      loanTable = "loan_booking_gq_non_fsf";
  else if (lan.startsWith("GQF")) loanTable = "loan_booking_gq_fsf";
  else if (lan.startsWith("ADK")) loanTable = "loan_booking_adikosh";
  else if (lan.startsWith("EV"))  loanTable = "loan_booking_ev";
  else if (lan.startsWith("BL"))  loanTable = "loan_bookings";
  else if (lan.startsWith("E1"))  loanTable = "loan_booking_embifi";
  else if (lan.startsWith("FINE"))  loanTable = "loan_booking_emiclub";
  else if (lan.startsWith("HEYBF"))  loanTable = "loan_booking_hey_ev_battery";
  else if (lan.startsWith("HEY"))  loanTable = "loan_booking_hey_ev";
  else if (lan.startsWith("HEL"))  loanTable = "loan_booking_helium";
  else if (lan.startsWith("FINS"))  loanTable = "loan_booking_finso";



  try {
    const [loanRows] = await db
      .promise()
      .query(`SELECT * FROM ${loanTable} WHERE lan = ? LIMIT 1`, [lan]);

    if (!loanRows.length) {
      return res.status(404).json({ error: "Loan not found for provided LAN" });
    }
    const loan = loanRows[0];

    // ✅ simple gate: ONLY when status === 'Fully Paid'
    const allowedStatuses = ["fully paid", "foreclosed", "settled"];

const statusNorm = String(loan.status || "").trim().toLowerCase();

if (!allowedStatuses.includes(statusNorm)) {
  return res.status(400).json({
    error: "NOC can be generated only when the loan is Fully Paid.",
    currentStatus: loan.status || "-"
  });
}

    // Create PDF
    const filename = `NOC_${lan}_${Date.now()}.pdf`;
    const filePath = path.join(uploadPath, filename);

    const doc = new PDFDocument({ margin: 50 });
    const writeStream = fs.createWriteStream(filePath);
    doc.pipe(writeStream);

    // Header
    const logoPath = path.join(__dirname, "../public/fintree-logo.png");
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, { fit: [120, 120], align: "center" }).moveDown(0.5);
    }
    doc.font("Helvetica-Bold").fontSize(16)
      .text("No Dues Certificate", { align: "center" })
      .moveDown(0.8);

    // Body
    const fmtDate = (d) =>
      new Date(d).toLocaleDateString("en-IN");

    const address = [
      loan.address_line_1, loan.address_line_2, loan.village,
      loan.district, loan.state, loan.pincode
    ].filter(Boolean).join(", ");

    doc.font("Helvetica").fontSize(11);
    doc.text(`Date: ${fmtDate(new Date())}`).moveDown(0.5);
    doc.text(`Name of the Borrower: ${loan.customer_name || ""}`);
    doc.text(`Ref.: Loan Account Number: ${loan.lan || ""}`);
    doc.text(`Ref.: Partner Account Number: ${loan.partner_loan_id || ""}`);
    doc.text(`Ref.: Partner Loan Account Number: ${loan.app_id || ""}`);
    doc.text(`Address of the Borrower: ${address}`).moveDown(1);

    doc.text("Dear Sir/Madam,").moveDown(0.8);
    const para = (t) => doc.text(t, { align: "justify" }).moveDown(0.8);
    para("We would like to thank you for your patronage, and we hope your experience with us has been a rewarding one.");
    para("We are pleased to confirm that there are no outstanding dues towards the captioned loan and the amount disbursed under the said loan account number has been closed in our books. The agreement signed by you in this regard stands terminated.");
    para("We will be happy to welcome you back! Fintree Finance Pvt. Ltd. is a one-stop solution for all financial needs. Our offerings include Consumer Durable Loans, Personal Loans, Vehicle Loans, Business Loans, and Mortgage Loans.");
    para("Thank you once again for selecting Fintree Finance Pvt. Ltd. as your preferred partner in helping you accomplish your financial goals.");

    doc.moveDown(1.2);
    doc.text("For and on behalf of Fintree Finance Pvt. Ltd.");
    doc.moveDown(2);
    doc.fontSize(9).text("***This is a system generated letter and does not require a signature***", { align: "center" });

    doc.end();

    writeStream.on("finish", async () => {
  try {
    // store just the filename (not /uploads/filename)
    await db.promise().query(
      `INSERT INTO loan_documents (lan, file_name, original_name, uploaded_at)
       VALUES (?, ?, ?, NOW())`,
      [lan, filename, `NOC - ${lan}`]
    );
  } catch (e) {
    console.error("loan_documents insert failed:", e.message);
    // non-fatal
  }

  // return absolute URL that matches your server's static mount
  const fileUrl = `${req.protocol}://${req.get("host")}/uploads/${filename}`;
  res.status(200).json({ message: "Generated", fileUrl });
});


    writeStream.on("error", (err) => {
      console.error("PDF write error:", err);
      res.status(500).json({ error: "Failed to write NOC PDF", details: err.message });
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "NOC generation failed", details: err.message });
  }
});

router.post("/generate-foreclosure", async (req, res) => {
  const { lan } = req.body;
  if (!lan) return res.status(400).json({ error: "lan required" });

  // 1) Select borrower table (same rules as your NOC)
  let bookingTable = "";
  if (lan.startsWith("GQN"))       bookingTable = "loan_booking_gq_non_fsf";
  else if (lan.startsWith("GQF"))  bookingTable = "loan_booking_gq_fsf";
  else if (lan.startsWith("ADK"))  bookingTable = "loan_booking_adikosh";
  else if (lan.startsWith("EV"))   bookingTable = "loan_booking_ev";
  else if (lan.startsWith("E1"))   bookingTable = "loan_booking_embifi";
  else if (lan.startsWith("WCTL")) bookingTable = "loan_bookings_wctl";
  else if (lan.startsWith("BL"))   bookingTable = "loan_bookings";
  else if (lan.startsWith("FINE")) bookingTable = "loan_booking_emiclub";

  // Helpers
  const fmtDateLong = (d) =>
    new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });

  // Format numbers like 1,23,456 (no currency sign)
  const fmtAmt = (n) =>
    Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  // Keep 1pt strokes aligned on device pixels to avoid fuzzy/vanishing lines
  const crisp = (v) => Math.round(v) + 0.5;

  try {
    // 2) Borrower info
    const [loanRows] = await db.promise().query(
      `SELECT lan, customer_name, partner_loan_id,
              address_line_1, address_line_2, village, district, state, pincode
         FROM ${bookingTable}
        WHERE lan = ? LIMIT 1`,
      [lan]
    );
    if (!loanRows.length) {
      return res.status(404).json({ error: `Borrower not found in ${bookingTable}` });
    }
    const loan = loanRows[0];

    // 3) Run foreclosure procedure FIRST
    const [procRes] = await db.promise().query("CALL sp_calculate_forecloser_collection(?)", [lan]);
    const fcRows = Array.isArray(procRes) && Array.isArray(procRes[0]) ? procRes[0] : procRes;
    if (!fcRows || !fcRows.length) {
      return res.status(404).json({ error: "No foreclosure data produced by procedure" });
    }
    const fc = fcRows[0];

    // Values
    const forecloserDate = fc.forecloser_date || new Date();
    const principalOS    = Number(fc.total_remaining_principal || 0);
    const overduePnI     = Number(fc.total_remaining_interest  || 0);
    const preClosureChg  = Number(fc.foreclosure_fee           || 0);
    const gstTotal       = Number(fc.foreclosure_tax           || 0);
    const cgst           = gstTotal / 2;
    const sgst           = gstTotal / 2;
    const netReceivable  = Number(fc.total_fc_amount           || 0);
    const penalty        = Number(fc.penalty || 0);
    const bounce         = Number(fc.bounce  || 0);
    const excess         = Number(fc.excess  || 0);

    // 4) PDF
    const filename = `Foreclosure_${lan}_${Date.now()}.pdf`;
    const filePath = path.join(uploadPath, filename);
    try { fs.mkdirSync(uploadPath, { recursive: true }); } catch {}

    const doc = new PDFDocument({ margin: 48 });
    const ws  = fs.createWriteStream(filePath);
    doc.pipe(ws);

    // Fonts: use core fonts (no external files)
    const FONT_REGULAR = "Helvetica";
    const FONT_BOLD    = "Helvetica-Bold";
    doc.fillColor("#000");

    // --- Logo top-right (fixed position)
    const logoPath = path.join(__dirname, "../public/fintree-logo.png");
    const topY = 44; // consistent top padding
    if (fs.existsSync(logoPath)) {
      const imgW = 120;
      doc.image(logoPath,
        doc.page.width - doc.page.margins.right - imgW, topY,
        { width: imgW }
      );
    }

    // --- Date + name (top-left)
    doc.font(FONT_BOLD).fontSize(11).text("Date", doc.page.margins.left, topY + 6);
    doc.font(FONT_REGULAR).text(fmtDateLong(forecloserDate), doc.page.margins.left + 50, topY + 6);
    doc.moveDown(0.6);

    if (loan.customer_name) {
      doc.font(FONT_BOLD).fontSize(11).text(loan.customer_name);
    }

    // Optional: address block if you want it
    const addressLines = [
      loan.address_line_1, loan.address_line_2,
      [loan.village, loan.district].filter(Boolean).join(", "),
      [loan.state, loan.pincode].filter(Boolean).join(" - ")
    ].filter(Boolean);
    if (addressLines.length) {
      doc.moveDown(0.2);
      doc.font(FONT_REGULAR).fontSize(10).text(addressLines.join("\n"));
    }
    doc.moveDown(1.0);

    // --- Centered title with crisp rules
    const title = `Pre-Closure of Your Loan Account No: ${lan}`;
    const xL = doc.page.margins.left;
    const xR = doc.page.width - doc.page.margins.right;

    const yRule1 = crisp(doc.y);
    doc.save().lineWidth(1).strokeColor("#000")
       .moveTo(xL, yRule1).lineTo(xR, yRule1).stroke().restore();

    doc.moveDown(0.35);
    doc.font(FONT_BOLD).fontSize(14).text(title, { align: "center" });
    doc.moveDown(0.35);

    const yRule2 = crisp(doc.y);
    doc.save().lineWidth(1).strokeColor("#000")
       .moveTo(xL, yRule2).lineTo(xR, yRule2).stroke().restore();
    doc.moveDown(0.6);

    // --- Greeting & intro
    doc.font(FONT_BOLD).fontSize(11).text("Dear Customer,");
    doc.moveDown(0.15);
    doc.font(FONT_REGULAR).fontSize(11).text(
      "We value your relationship with Fintree. As per request for Closure of your above mentioned loan account, " +
      "Please find below the amount payable:"
    );
    doc.moveDown(0.5);

    // --- Structured 3-column table
    // Columns: [Particulars | Sub | Amount (Rs.)]
    const tableX = doc.page.margins.left;
    let   tableY = doc.y;
    const usableW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const colW = [usableW - 120 - 140, 120, 140]; // big label, sublabel, amount
    const rowH = 24;
    const border = 0.8;

    const drawRow = (cells, {
      bold = false,
      shaded = false,
      align = ["left","left","right"]
    } = {}) => {
      const y = tableY;

      // shaded background (do it first, isolate state)
      if (shaded) {
        doc.save();
        doc.rect(tableX, y, usableW, rowH).fill("#eeeeee");
        doc.restore();
      }

      // top border (crisp)
      doc.save().lineWidth(border).strokeColor("#000")
         .moveTo(tableX, crisp(y)).lineTo(tableX + usableW, crisp(y)).stroke().restore();

      // vertical lines and text
      let cx = tableX;
      for (let i = 0; i < colW.length; i++) {
        doc.save().lineWidth(border).strokeColor("#000")
           .moveTo(crisp(cx), y).lineTo(crisp(cx), y + rowH).stroke().restore();

        doc.font(bold ? FONT_BOLD : FONT_REGULAR).fontSize(11)
           .fillColor("#000")
           .text(cells[i] ?? "", cx + 8, y + 6, { width: colW[i] - 16, align: align[i] });

        cx += colW[i];
      }
      // right edge
      doc.save().lineWidth(border).strokeColor("#000")
         .moveTo(crisp(tableX + usableW), y).lineTo(crisp(tableX + usableW), y + rowH).stroke().restore();

      // bottom border
      doc.save().lineWidth(border).strokeColor("#000")
         .moveTo(tableX, crisp(y + rowH)).lineTo(tableX + usableW, crisp(y + rowH)).stroke().restore();

      tableY += rowH;
    };

    // Header
    drawRow(["Particulars", " ", "Amount (Rs.)"], { bold: true, shaded: true, align: ["left","left","right"] });

    // Detail rows (amount column only numbers; no ₹ prefix)
    drawRow(["Principal O/s",                  "", fmtAmt(principalOS)]);
    drawRow(["Overdue Principal and Interest", "", fmtAmt(overduePnI)]);
    drawRow(["Penalty",                        "", fmtAmt(penalty)]);
    drawRow(["Bounce",                         "", fmtAmt(bounce)]);
    drawRow(["Excess Amount",                  "", fmtAmt(excess)]);
    drawRow(["Pre-Closure Charge*",            "", fmtAmt(preClosureChg)]);
    drawRow(["",                             "CGST", fmtAmt(cgst)]);
    drawRow(["",                             "SGST", fmtAmt(sgst)]);

    // Separator band
    drawRow(["", "", ""], { shaded: true });

    // Total row (bold)
    drawRow(["Net Receivable / (Refund)", "", fmtAmt(netReceivable)], { bold: true });

    // --- Notes (below table)
    doc.y = tableY + 12;
    doc.moveDown(1.0);
    doc.font(FONT_BOLD).fontSize(11).text("Kindly note that:");
    doc.moveDown(0.2);
    doc.font(FONT_REGULAR).fontSize(11).text(`We have taken the date of the Pre-Closure as ${fmtDateLong(forecloserDate)}`);
    doc.moveDown(0.6);
    doc.text("* GST applicable on Charges.");

    // --- Footer (bottom-center, with safe spacing)
    const footerMinTop = doc.page.height - doc.page.margins.bottom - 60; // cushion
    if (doc.y < footerMinTop) doc.y = footerMinTop;
    doc.fontSize(9).fillColor("#000").text(
      "This is a system generated letter and does not require a signature",
      { align: "center" }
    );

    doc.end();

    // 5) Save & respond
    ws.on("finish", async () => {
      try {
        await db.promise().query(
          `INSERT INTO loan_documents (lan, file_name, original_name, uploaded_at)
           VALUES (?, ?, ?, NOW())`,
          [lan, filename, `Foreclosure - ${lan}`]
        );
      } catch (e) {
        console.error("loan_documents insert failed:", e.message);
      }
      const fileUrl = `${req.protocol}://${req.get("host")}/uploads/${filename}`;
      res.status(200).json({ message: "Generated", fileUrl });
    });

    ws.on("error", (err) => {
      console.error("PDF write error:", err);
      res.status(500).json({ error: "Failed to write Foreclosure PDF", details: err.message });
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Foreclosure generation failed", details: err.message });
  }
});






module.exports = router;
