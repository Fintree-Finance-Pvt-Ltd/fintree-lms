const express = require("express");
const db = require("../../config/db");
const path = require("path");
const axios = require("axios");
const fs = require("fs");
require("dotenv").config();

const router = express.Router();

const uploadPath = path.join(__dirname, "../../uploads");
if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath, { recursive: true });

const uploadDir = path.join(__dirname, "../../uploads/esign");
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
      ? `${addr.house || ""}, ${addr.street || ""}, ${addr.loc || ""}, ${
          addr.dist || ""
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
const DIGIO_USERNAME = process.env.DIGIO_CLIENT_ID;
const DIGIO_PASSWORD = process.env.DIGIO_CLIENT_SECRET;

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
          process.env.DIGIO_CLIENT_ID + ":" + process.env.DIGIO_CLIENT_SECRET
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

router.post("/esign-webhook", async (req, res) => {
  try {
    const body = req.body;
    const event = body.event;

    console.log("📥 Digio Webhook Received:", event);

    const doc = body?.payload?.document;
    const documentId = doc?.id;

    if (!documentId) return res.status(200).send("ignored");

    // Get LAN & type
    const [rows] = await db.promise().query(
      `SELECT lan, document_type FROM esign_documents WHERE document_id = ?`,
      [documentId]
    );

    if (!rows.length) return res.status(200).send("ignored");

    const lan = rows[0].lan;
    const type = rows[0].document_type;

    // Store webhook JSON
    await db.promise().query(
      `INSERT INTO esign_webhooks(document_id, lan, event, raw_payload, digio_timestamp)
       VALUES (?, ?, ?, ?, ?)`,
      [
        documentId,
        lan,
        event,
        JSON.stringify(body),
        body.created_at || null,
      ]
    );

    // If not signed: update DB
    if (event !== "doc.signed") {
      await db.promise().query(
        `UPDATE esign_documents SET status='FAILED' WHERE document_id=?`,
        [documentId]
      );
      return res.status(200).send("failed-event-processed");
    }

    console.log("✅ Document SIGNED. Fetching signed PDF…");

    // 🔥 Download signed PDF from Digio API
    const pdfBinary = await downloadSignedPdfFromDigio(documentId);

    // Save locally
    const folderPath = path.join(__dirname, "../../uploads/esign");
    if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });

    const fileName = `signed_${lan}_${type}_${Date.now()}.pdf`;
    const savePath = path.join(folderPath, fileName);

    fs.writeFileSync(savePath, pdfBinary);

    console.log("📄 Signed PDF saved:", savePath);

    // Update Document Table
    await db.promise().query(
      `UPDATE esign_documents 
       SET status='SIGNED', signed_file_path=? 
       WHERE document_id=?`,
      [savePath, documentId]
    );

    // Insert into loan_documents
    await db.promise().query(
      `INSERT INTO loan_documents (lan, file_name, original_name, uploaded_at)
       VALUES (?, ?, ?, NOW())`,
      [lan, fileName, `${type}_SIGNED`]
    );

    // Update loan status
    if (type === "SANCTION") {
      await db.promise().query(
        `UPDATE loan_booking_helium 
         SET sanction_esign_status='SIGNED' WHERE lan=?`,
        [lan]
      );
    } else {
      await db.promise().query(
        `UPDATE loan_booking_helium 
         SET agreement_esign_status='SIGNED' WHERE lan=?`,
        [lan]
      );
    }

    return res.status(200).send("ok");
  } catch (err) {
    console.error("❌ Webhook Processing Error:", err.response?.data || err);
    return res.status(200).send("error-logged");
  }
});



module.exports = router;