const express = require("express");
const db = require("../../config/db");
const path = require("path");
const axios = require("axios");
const fs = require("fs");
require("dotenv").config();
const {
  verifyBank,
  performFuzzyMatch,
  createMandate,
} = require("../../services/enachService");
const { sendWelcomeKitMail} = require("../../jobs/mailer");
const router = express.Router();

const uploadPath = path.join(__dirname, "../../uploads");
if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath, { recursive: true });

const uploadDir = path.join(__dirname, "../../uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

async function downloadAndSaveFile(url, baseName) {
  if (!url) return null;
  try {
    const res = await axios.get(url, { responseType: "arraybuffer", timeout: 30000 });

    const safeBase = baseName.replace(/[^a-zA-Z0-9_.-]/g, "_");
    const fileName = `${Date.now()}_${safeBase}`;
    const fullPath = path.join(uploadPath, fileName);

    fs.writeFileSync(fullPath, res.data);

    // We will store just the fileName in DB (same as your manual upload route)
    return fileName;
  } catch (err) {
    console.error("❌ Error downloading Aadhaar file:", err.response?.data || err.message);
    return null;
  }
}

router.post("/v1/digi-aadhaar-webhook", async (req, res) => {
  try {
    const payload = req.body || {};
    console.log("📥 Digitap Aadhaar Webhook Payload:", JSON.stringify(payload).slice(0, 500));

    const transactionId = payload.transactionId;
    const status = (payload.status || "").toLowerCase();
    const data = payload.data || {};

    // We ALWAYS return 200 to stop retries, even if we ignore the event.
    if (!transactionId) {
      console.warn("⚠️ Webhook missing transactionId, ignoring.");
      return res.status(200).send("ignored");
    }

    // If failure -> mark FAILED (if record exists) and exit
    if (status !== "success") {
      console.log("❌ Aadhaar webhook status is failure for txn:", transactionId);

      const uniqueId = data.uniqueId || null;

      await db
        .promise()
        .query(
          `UPDATE kyc_verification_status
           SET aadhaar_status='FAILED'
           WHERE aadhaar_transaction_id = ? OR aadhaar_unique_id = ?`,
          [transactionId, uniqueId]
        );

      return res.status(200).send("failure-processed");
    }

    // ✅ Success flow
    const uniqueId = data.uniqueId;
    if (!uniqueId) {
      console.warn("⚠️ Webhook success but no uniqueId in data, ignoring.");
      return res.status(200).send("ignored");
    }

    // Find LAN from aadhaar_unique_id
    const [rows] = await db
      .promise()
      .query(
        `SELECT lan FROM kyc_verification_status WHERE aadhaar_unique_id = ?`,
        [uniqueId]
      );

    if (!rows.length) {
      console.error("❌ No KYC row found for uniqueId from webhook:", uniqueId);
      return res.status(200).send("no-matching-lan");
    }

    const lan = rows[0].lan;
    console.log("🔗 Webhook Aadhaar mapped to LAN:", lan);

    // PDF + XML links from webhook data
    const pdfLink = data.pdfLink || null; // presigned PDF URL
    const xmlLink = data.link || null;    // zip/xml presigned URL

    // Download & save locally
    const pdfFilePath = await downloadAndSaveFile(
      pdfLink,
      `aadhaar_${lan}_${Date.now()}.pdf`
    );
    const xmlFilePath = await downloadAndSaveFile(
      xmlLink,
      `aadhaar_${lan}_${Date.now()}.xml`
    );

    // Insert docs into loan_documents (like manual upload)
    if (pdfFilePath) {
      await db
        .promise()
        .query(
          `INSERT INTO loan_documents (lan, file_name, original_name, uploaded_at)
           VALUES (?, ?, ?, NOW())`,
          [lan, path.basename(pdfFilePath), "AADHAAR_DIGI_KYC_PDF"]
        );
    }

    if (xmlFilePath) {
      await db
        .promise()
        .query(
          `INSERT INTO loan_documents (lan, file_name, original_name, uploaded_at)
           VALUES (?, ?, ?, NOW())`,
          [lan, path.basename(xmlFilePath), "AADHAAR_DIGI_KYC_XML"]
        );
    }

    // Extract Aadhaar basic fields from webhook data
    const aadhaarName = data.name || null;
    const aadhaarMasked = data.maskedAdharNumber || data.maskedAadhaar || null;

    let aadhaarDob = null;
    if (data.dob) {
      const parts = data.dob.split("-"); // dd-mm-yyyy
      if (parts.length === 3) {
        aadhaarDob = `${parts[2]}-${parts[1]}-${parts[0]}`; // yyyy-mm-dd
      }
    }

    const addr = data.address || {};
    const aadhaarAddressStr = addr
      ? `${addr.house || ""}, ${addr.street || ""}, ${addr.loc || ""}, ${addr.dist || ""
        }, ${addr.state || ""} - ${addr.pc || ""}`
        .replace(/,\s*,/g, ",")
        .replace(/^,\s*/g, "")
        .trim()
      : null;

    // Update KYC table with webhook JSON + paths + fields
    await db
      .promise()
      .query(
        `UPDATE kyc_verification_status
         SET aadhaar_status='VERIFIED',
             aadhaar_api_response=?,
             aadhaar_pdf_path=?,
             aadhaar_xml_path=?,
             aadhaar_name=?,
             aadhaar_masked_number=?,
             aadhaar_dob=?,
             aadhaar_address=?
         WHERE lan=?`,
        [
          JSON.stringify(payload),  // full webhook payload
          pdfFilePath || null,
          xmlFilePath || null,
          aadhaarName,
          aadhaarMasked,
          aadhaarDob,
          aadhaarAddressStr,
          lan,
        ]
      );

    console.log("✅ Aadhaar VERIFIED via webhook for LAN:", lan);

    // Optionally run auto-approval if all checks done
    await autoApproveIfAllVerified(lan);

    return res.status(200).send("ok");
  } catch (err) {
    console.error("❌ Aadhaar Webhook Processing Error:", err);
    // still return 200 so Digitap doesn't spam retries
    return res.status(200).send("error-logged");
  }
});



// 🔐 Digio credentials for downloading signed file
const DIGIO_USERNAME = process.env.DIGIO_ESIGN_CLIENT_ID;
const DIGIO_PASSWORD = process.env.DIGIO_ESIGN_CLIENT_SECRET;

// Helper: Download Signed PDF
async function downloadSignedPdf(docId) {
  const url = `https://api.digio.in/v2/client/document/${docId}/download`;

  const resp = await axios.get(url, {
    responseType: "arraybuffer",
    auth: { username: DIGIO_USERNAME, password: DIGIO_PASSWORD },
  });

  return resp.data; // Buffer (PDF)
}

async function downloadSignedPdfFromDigio(documentId) {
  const downloadUrl = `${process.env.DIGIO_BASE_URL}/v2/client/document/download?document_id=${documentId}`;

  const response = await axios.get(downloadUrl, {
    responseType: "arraybuffer",
    headers: {
      Authorization:
        "Basic " +
        Buffer.from(
          process.env.DIGIO_ESIGN_CLIENT_ID + ":" + process.env.DIGIO_ESIGN_CLIENT_SECRET
        ).toString("base64"),
    },
  });

  return response.data; // PDF binary
}

function parseDigioError(err) {
  try {
    if (err?.response?.data instanceof Buffer) {
      const text = err.response.data.toString("utf8");
      return JSON.parse(text);
    }
  } catch (e) {
    return { message: "Failed to parse Digio error buffer", raw: err.response.data.toString("utf8") };
  }

  return err.response?.data || { message: err.message };
}


// ---------------------------
// 🔔 DIGIO WEBHOOK LISTENER
// ---------------------------
// router.post("/esign-webhook", async (req, res) => {
//  try {
//     const body = req.body;
//     const event = body.event; // doc.signed | doc.sign.failed | doc.sign.rejected

//     console.log("📥 Digio Webhook Received:", event);

//     // Extract Document ID
//     const doc = body?.payload?.document;
//     const documentId = doc?.id;

//     if (!documentId) {
//       console.log("⚠️ No document ID in webhook");
//       return res.status(200).send("ignored");
//     }

//     // Get LAN from esign_documents
//     const [rows] = await db.promise().query(
//       `SELECT lan, document_type FROM esign_documents WHERE document_id = ?`,
//       [documentId]
//     );

//     if (!rows.length) {
//       console.log("⚠️ No matching LAN found for this doc");
//       return res.status(200).send("ignored");
//     }

//     const lan = rows[0].lan;
//     const type = rows[0].document_type; // SANCTION | AGREEMENT

//     // Save webhook entry
//     await db.promise().query(
//       `INSERT INTO esign_webhooks(document_id, lan, event, raw_payload, digio_timestamp)
//        VALUES (?, ?, ?, ?, ?)`,
//       [
//         documentId,
//         lan,
//         event,
//         JSON.stringify(body),
//         body.created_at || null
//       ]
//     );

//     // If NOT signed → just mark failure
//     if (event !== "doc.signed") {
//       await db.promise().query(
//         `UPDATE esign_documents SET status=? WHERE document_id=?`,
//         ["FAILED", documentId]
//       );

//       return res.status(200).send("event-processed");
//     }

//     console.log("✅ Document SIGNED. Downloading signed PDF…");

//     // Signed document download link
//     const downloadUrl = doc?.signed_file_url || doc?.file_download_url;

//     if (!downloadUrl) {
//       console.log("❌ No signed file URL from Digio");
//       return res.status(200).send("missing-download-url");
//     }

//     // Download PDF
//     const fileName = `signed_${lan}_${type}_${Date.now()}.pdf`;
//     const savePath = path.join(uploadDir, fileName);

//     const response = await axios.get(downloadUrl, { responseType: "arraybuffer" });
//     fs.writeFileSync(savePath, response.data);

//     console.log("📄 Signed PDF saved at:", savePath);

//     // Update esign table
//     await db.promise().query(
//       `UPDATE esign_documents 
//        SET status='SIGNED', signed_file_path=? 
//        WHERE document_id=?`,
//       [savePath, documentId]
//     );

//     // Insert into loan_documents
//     await db.promise().query(
//       `INSERT INTO loan_documents(lan, file_name, original_name, uploaded_at)
//        VALUES (?, ?, ?, NOW())`,
//       [lan, fileName, `${type}_SIGNED`]
//     );

//     // Update loan table
//     if (type === "SANCTION") {
//       await db.promise().query(
//         `UPDATE loan_booking_helium 
//          SET sanction_esign_status='SIGNED' WHERE lan=?`,
//         [lan]
//       );
//     } else {
//       await db.promise().query(
//         `UPDATE loan_booking_helium 
//          SET agreement_esign_status='SIGNED' WHERE lan=?`,
//         [lan]
//       );
//     }

//     return res.status(200).send("ok");
//   } catch (err) {
//     console.error("❌ Webhook Processing Error:", err);
//     return res.status(200).send("error-logged"); // Must return 200 always
//   }
// });

// router.post("/esign-webhook", async (req, res) => {
//   try {
//     const body = req.body;
//     const event = body.event;

//     console.log("📥 Digio Webhook Received:", event);

//     const doc = body?.payload?.document;
//     const documentId = doc?.id;
// console.log(doc)
//     if (!documentId) return res.status(200).send("ignored");

//     // Get LAN & type
//     const [rows] = await db.promise().query(
//       `SELECT lan, document_type FROM esign_documents WHERE document_id = ? LIMIT 1`,
//       [documentId]
//     );



//     if (!rows.length) return res.status(200).send("ignored");

//     const lan = rows[0].lan;
//     const type = rows[0].document_type;

//     // Store webhook JSON
//     await db.promise().query(
//       `INSERT INTO esign_webhooks(document_id, lan, event, raw_payload, digio_timestamp)
//        VALUES (?, ?, ?, ?, ?)`,
//       [
//         documentId,
//         lan,
//         event,
//         JSON.stringify(body),
//         body.created_at || null,
//       ]
//     );

//     // If not signed: update DB
//     if (event !== "doc.signed") {
//       await db.promise().query(
//         `UPDATE esign_documents SET status='FAILED' WHERE document_id=?`,
//         [documentId]
//       );
//       return res.status(200).send("failed-event-processed");
//     }

//     console.log("✅ Document SIGNED. Fetching signed PDF…");


//     // 🔥 Download signed PDF from Digio API
//     const pdfBinary = await downloadSignedPdfFromDigio(documentId);

//     // Save locally
//     const folderPath = path.join(__dirname, "../../uploads");
//     if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });

//     const fileName = `signed_${lan}_${type}_${Date.now()}.pdf`;
//     const savePath = path.join(folderPath, fileName);

//     fs.writeFileSync(savePath, pdfBinary);

//     console.log("📄 Signed PDF saved:", savePath);

//     // Update Document Table
//     await db.promise().query(
//       `UPDATE esign_documents 
//        SET status='SIGNED', signed_file_path=? 
//        WHERE document_id=?`,
//       [savePath, documentId]
//     );

//     // Insert into loan_documents
//     await db.promise().query(
//       `INSERT INTO loan_documents (lan, file_name, original_name, uploaded_at)
//        VALUES (?, ?, ?, NOW())`,
//       [lan, fileName, `${type}_SIGNED`]
//     );

//     // Update loan status
//     if (type === "SANCTION") {
//       await db.promise().query(
//         `UPDATE loan_booking_helium 
//      SET sanction_esign_status = 'SIGNED' 
//      WHERE lan = ?`,
//         [lan]
//       );

//       await db.promise().query(
//         `UPDATE loan_booking_zypay_customer 
//      SET sanction_esign_status = 'SIGNED' 
//      WHERE lan = ?`,
//         [lan]
//       );
//     } else {
//       await db.promise().query(
//         `UPDATE loan_booking_helium 
//      SET agreement_esign_status = 'SIGNED' 
//      WHERE lan = ?`,
//         [lan]
//       );

//       await db.promise().query(
//         `UPDATE loan_booking_zypay_customer 
//      SET agreement_esign_status = 'SIGNED' 
//      WHERE lan = ?`,
//         [lan]
//       );
//     }

//     await db.promise().query(
//       'Select * from loan_booking_zypay_customer where lan=?',
//       [lan]
//     ).then(([rows]) => {
//       if (rows.length > 0) {
//         doc.account_no = rows[0].account_no;
//         doc.ifsc = rows[0].ifsc;
//         doc.customer_name = rows[0].customer_name;
//         doc.bank_name = rows[0].bank_name;
//         doc.bank_beneficiary_name = rows[0].name_in_bank;
//         doc.mandate_amount = rows[0].loan_amount;
//       }


// console.log(doc);

//     // 🔁 Auto-trigger eNACH after agreement signed
//     await verifyBank({
//       lan,
//       account_no: doc.account_no,
//       ifsc: doc.ifsc,
//       name: doc.customer_name,
//       bank_name: doc.bank_name,
//       account_type: "savings",
//       mandate_amount: doc.mandate_amount,
//     });

//     await performFuzzyMatch({
//       lan,
//       sourceText: doc.customer_name,
//       targetText: doc.bank_beneficiary_name,
//     });
// console.log(doc);
//     await createMandate({
//       customer_identifier: lan,
//       mandate_data: {
//         customer_ref_number: lan,
//         customer_account_number: doc.account_no,
//         destination_bank_id: doc.ifsc,
//         destination_bank_name: doc.bank_name,
//         customer_name: doc.customer_name,
//         collection_amount: doc.mandate_amount,
//         frequency: "Monthly",
//         instrument_type: "debit",
//         is_recurring: true,
//       },
//     });



//     return res.status(200).send("ok");
//   } catch (err) {
//     const digioError = parseDigioError(err);

//     console.error("❌ Webhook Processing Error:", digioError);

//     return res.status(200).send("error-logged");
//   }
// });


router.post("/esign-webhook", async (req, res) => {
  try {
    const body = req.body;
    const event = body?.event;

    console.log("📥 Digio Webhook Received:", event);

    const doc = body?.payload?.document;
    const documentId = doc?.id;

    if (!documentId) {
      console.log("⚠️ No document ID, ignoring");
      return res.status(200).send("ignored");
    }

    // Fetch LAN & document type
    const [docs] = await db.promise().query(
      `SELECT lan, document_type 
       FROM esign_documents 
       WHERE document_id = ? 
       LIMIT 1`,
      [documentId]
    );

    if (!docs.length) {
      console.log("⚠️ Document not found, ignoring");
      return res.status(200).send("ignored");
    }

    const { lan, document_type: type } = docs[0];

    // Store webhook payload
    await db.promise().query(
      `INSERT INTO esign_webhooks
       (document_id, lan, event, raw_payload, digio_timestamp)
       VALUES (?, ?, ?, ?, ?)`,
      [
        documentId,
        lan,
        event,
        JSON.stringify(body),
        body.created_at || null,
      ]
    );

    /**
     * Ignore non-terminal events
     */
    if (event !== "doc.signed") {
      console.log("ℹ️ Non signed event, skipping:", event);
      return res.status(200).send("event-logged");
    }

    console.log("✅ Document SIGNED. Downloading PDF...");

    /**
     * Download signed PDF
     */
    const pdfBinary = await downloadSignedPdfFromDigio(documentId);

    const folderPath = path.join(__dirname, "../../uploads");
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }

    const fileName = `signed_${lan}_${type}_${Date.now()}.pdf`;
    const savePath = path.join(folderPath, fileName);

    fs.writeFileSync(savePath, pdfBinary);

    console.log("📄 PDF saved:", savePath);

    /**
     * DB updates (transaction safe)
     */
    const connection = await db.promise().getConnection();
    try {
      await connection.beginTransaction();

      await connection.query(
        `UPDATE esign_documents
         SET status='SIGNED', signed_file_path=?
         WHERE document_id=?`,
        [savePath, documentId]
      );

      await connection.query(
        `INSERT INTO loan_documents
         (lan, file_name, original_name, uploaded_at)
         VALUES (?, ?, ?, NOW())`,
        [lan, fileName, `${type}_SIGNED`]
      );

      if (type === "SANCTION") {
        await connection.query(
          `UPDATE loan_booking_helium
           SET sanction_esign_status='SIGNED'
           WHERE lan=?`,
          [lan]
        );

        await connection.query(
          `UPDATE loan_booking_zypay_customer
           SET sanction_esign_status='SIGNED'
           WHERE lan=?`,
          [lan]
        );
      } else {
        await connection.query(
          `UPDATE loan_booking_helium
           SET agreement_esign_status='SIGNED'
           WHERE lan=?`,
          [lan]
        );

        await connection.query(
          `UPDATE loan_booking_zypay_customer
           SET agreement_esign_status='SIGNED'
           WHERE lan=?`,
          [lan]
        );
      }

      /**
       * Fetch bank details
       */
      const [customers] = await connection.query(
        `SELECT * FROM loan_booking_zypay_customer WHERE lan=?`,
        [lan]
      );

      if (!customers.length) {
        throw new Error("Customer data missing");
      }

      const customer = customers[0];

      await connection.commit();

      if (type === "AGREEMENT" && lan.startsWith("ZYP")) {
  sendWelcomeKitMail({
    to: customer.email_id,
    customerName: customer.customer_name,
    lan,
    accountNumber: customer.lan,
    pdfPath: savePath,
  })
    .then(() =>
      console.log("📨 Welcome Kit email sent:", customer.email_id)
    )
    .catch(err =>
      console.error("⚠️ Welcome Kit mail failed:", err.message)
    );
}

      /**
       * 🔁 Trigger eNACH ONLY after agreement
       */
      if (type !== "SANCTION") {
        await verifyBank({
          lan,
          account_no: customer.account_number,
          ifsc: customer.ifsc,
          name: customer.customer_name,
          bank_name: customer.bank_name,
          account_type: "savings",
          mandate_amount: customer.loan_amount,
        });

        await performFuzzyMatch({
          lan,
          sourceText: customer.customer_name,
          targetText: customer.name_in_bank,
        });

       await createMandate({
  lan,
  customer_identifier: customer.mobile_number, // PAN only
  amount: customer.loan_amount,
  account_no: customer.account_number,
  ifsc: customer.ifsc,
  bank_name: customer.bank_name,
  customer_name: customer.name_in_bank,
});

      }
    } catch (dbErr) {
      await connection.rollback();
      throw dbErr;
    } finally {
      connection.release();
    }

    return res.status(200).send("ok");
  } catch (err) {
    const digioError = parseDigioError(err);
    console.error("❌ Webhook Processing Error:", digioError);
    return res.status(200).send("error-logged");
  }
});



router.post("/enach-webhook", async (req, res) => {
  try {
    const event = req.body.event;
    const mandate = req.body?.payload?.mandate;
    const mandateId = mandate?.id;

    console.log("📥 eNACH WEBHOOK:", event, "Mandate:", mandateId);

    if (!mandateId) return res.status(200).send("ignored");

    // Save webhook JSON
    await db.promise().query(
      `UPDATE enach_mandates 
       SET webhook_payload=? 
       WHERE document_id=?`,
      [JSON.stringify(req.body), mandateId]
    );

    // Fetch LAN
    const [rows] = await db.promise().query(
      `SELECT lan FROM enach_mandates WHERE document_id=?`,
      [mandateId]
    );

    if (!rows.length) return res.status(200).send("unknown-mandate");

    const lan = rows[0].lan;
    const newStatus = mandate.state || "UNKNOWN";
    const umrn = mandate.umrn || null;

    console.log("🔄 Updating mandate:", mandateId, "STATUS:", newStatus);

    // Update mandate table
    await db.promise().query(
      `UPDATE enach_mandates 
       SET status=?, umrn=?, raw_response=? 
       WHERE document_id=?`,
      [
        newStatus,
        umrn,
        JSON.stringify(mandate),
        mandateId
      ]
    );

    // Update loan table status
    let bankStatus = "PENDING";

    if (event === "mandate.auth_success") bankStatus = "AUTH_SUCCESS";
    if (event === "mandate.register_success") bankStatus = "ACTIVE";
    if (event === "mandate.auth_fail" || event === "mandate.register_failed") bankStatus = "FAILED";

    await db.promise().query(
      `UPDATE loan_booking_helium 
   SET bank_status = ?, enach_umrn = ? 
   WHERE lan = ?`,
      [bankStatus, umrn, lan]
    );

    await db.promise().query(
      `UPDATE loan_booking_zypay_customer 
   SET bank_status = ?, enach_umrn = ? 
   WHERE lan = ?`,
      [bankStatus, umrn, lan]
    );


    console.log("✅ Loan updated =>", lan, bankStatus);

    return res.status(200).send("ok");

  } catch (err) {
    console.error("❌ Webhook error:", err);
    return res.status(200).send("error");
  }
});




module.exports = router;