const express = require("express");
const db = require("../../config/db");
const path = require("path");
const fs = require("fs");

const router = express.Router();

const uploadPath = path.join(__dirname, "../../uploads");
if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath, { recursive: true });

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

module.exports = router;