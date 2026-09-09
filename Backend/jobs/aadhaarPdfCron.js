// startAadhaarCron.js
const cron = require("node-cron");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const xml2js = require("xml2js");

const db = require("../config/db");
const { createAadhaarPDF } = require("./aadhaarPdfGenerator");

// ======================================================
// ENSURE uploads FOLDER EXISTS
// ======================================================

if (!fs.existsSync("uploads")) {
  fs.mkdirSync("uploads", { recursive: true });
}

// ======================================================
// XML PARSER
// ======================================================

async function parseAadhaarXML(xmlBuffer) {

  return await xml2js.parseStringPromise(
    xmlBuffer.toString("utf8"),
    {
      explicitArray: false,
      trim: true,
    }
  );
}

// ======================================================
// PROCESS A SINGLE ROW
// (pulled out of the loop, unchanged logic — just properly
// awaited now instead of firing a nested callback that let
// the loop race ahead to the next row before this one finished)
// ======================================================

async function processAadhaarRow(row) {
  let meta = {};

  try {
    meta = JSON.parse(row.meta_json || "{}");
  } catch {}

  // ======================================================
  // SKIP IF PDF ALREADY GENERATED
  // ======================================================

  if (meta.aadhaar_pdf_generated === true) {

    console.log("➡ PDF already generated. Skipping.");
    return;
  }

  let localPath = row.file_name
    ? path.join("uploads", row.file_name)
    : null;

  let fileBuffer = null;

  // ======================================================
  // PRIORITY 1 -> LOCAL FILE
  // ======================================================

  if (
    localPath &&
    fs.existsSync(localPath)
  ) {

    console.log("📂 Using local uploaded file:");
    console.log(localPath);

    fileBuffer = fs.readFileSync(localPath);
  }

  // ======================================================
  // PRIORITY 2 -> source_url FALLBACK
  // ======================================================

  else if (row.source_url) {

    console.log("🌐 Local file missing.");
    console.log("📥 Downloading from source_url");

    const response = await axios.get(
      row.source_url,
      {
        responseType: "arraybuffer",
        timeout: 20000,
      }
    );

    fileBuffer = response.data;

    console.log("✅ Downloaded from source_url");

    // SAVE DOWNLOADED FILE LOCALLY

    const newFileName =
      `${Date.now()}_${row.id}.xml`;

    localPath = path.join(
      "uploads",
      newFileName
    );

    fs.writeFileSync(
      localPath,
      fileBuffer
    );

    console.log("💾 Downloaded XML saved:");
    console.log(localPath);

    // UPDATE DB FILE NAME

    try {
      await db.promise().query(
        `
        UPDATE loan_documents
        SET file_name=?
        WHERE id=?
        `,
        [newFileName, row.id],
      );
    } catch (updateErr) {
      console.error(
        "❌ Error updating file_name:",
        updateErr
      );
    }

    row.file_name = newFileName;
  }

  // ======================================================
  // NO FILE FOUND
  // ======================================================

  else {

    console.log(
      "❌ No local file and no source_url."
    );

    return;
  }

  // ======================================================
  // FILE SIZE VALIDATION
  // ======================================================

  if (
    !fileBuffer ||
    fileBuffer.length < 100
  ) {

    console.log("❌ Invalid or empty Aadhaar file.");
    return;
  }

  // ======================================================
  // DETECT FILE TYPE
  // ======================================================

  const fileText =
    fileBuffer.toString("utf8").trim();

  let parsedData = null;

  // ======================================================
  // JSON FILE
  // ======================================================

  if (fileText.startsWith("{")) {

    console.log("📘 Detected Aadhaar JSON");

    parsedData = JSON.parse(fileText);
  }

  // ======================================================
  // XML FILE
  // ======================================================

  else {

    console.log("📘 Detected Aadhaar XML");

    parsedData =
      await parseAadhaarXML(fileBuffer);
  }

  console.log("✅ Aadhaar Parsed Successfully");

  // ======================================================
  // VALIDATE AADHAAR STRUCTURE
  // ======================================================

  const validAadhaar =
    parsedData?.Certificate
    ||
    parsedData?.["Digilocker_Aadhaar_Card:_Name"];

  if (!validAadhaar) {

    console.log(
      "❌ Invalid Aadhaar structure."
    );

    return;
  }

  // ======================================================
  // PDF FILE PATH
  // ======================================================

  const pdfFileName =
    row.file_name
      .replace(".xml", ".pdf")
      .replace(".json", ".pdf");

  const pdfPath = path.join(
    "uploads",
    pdfFileName
  );

  // ======================================================
  // PREVENT DUPLICATE PDF INSERTS
  // ======================================================

  const duplicateCheckSQL = `
    SELECT id
    FROM loan_documents
    WHERE file_name=?
    LIMIT 1
  `;

  const [dupRows] = await db.promise().query(
    duplicateCheckSQL,
    [pdfFileName],
  );

  // ======================================================
  // IF PDF ALREADY EXISTS
  // ======================================================

  if (
    dupRows &&
    dupRows.length > 0
  ) {

    console.log(
      "➡ PDF already exists in DB."
    );

    meta.aadhaar_pdf_generated = true;
    meta.aadhaar_pdf_file = pdfFileName;

    await db.promise().query(
      `
      UPDATE loan_documents
      SET meta_json=?
      WHERE id=?
      `,
      [
        JSON.stringify(meta),
        row.id,
      ],
    );

    return;
  }

  // ======================================================
  // GENERATE PDF
  // ======================================================

  console.log("🖨 Generating PDF...");

  await createAadhaarPDF(
    parsedData,
    pdfPath
  );

  console.log("✅ PDF Generated:");
  console.log(pdfPath);

  // ======================================================
  // INSERT PDF ENTRY
  // ======================================================

  const pdfMeta = {
    type: "aadhaar_pdf",
    source_file: row.file_name,
    generated_at: new Date(),
  };

  const insertSQL = `
    INSERT INTO loan_documents
    (
      lan,
      doc_name,
      file_name,
      original_name,
      source_url,
      meta_json,
      uploaded_at
    )
    VALUES
    (
      ?,
      'AADHAAR_PDF',
      ?,
      ?,
      NULL,
      ?,
      NOW()
    )
  `;

  try {
    await db.promise().query(
      insertSQL,
      [
        row.lan,
        pdfFileName,
        pdfFileName,
        JSON.stringify(pdfMeta),
      ],
    );

    console.log(
      "✅ PDF row inserted successfully."
    );
  } catch (insertErr) {
    console.error(
      "❌ Error inserting PDF row:",
      insertErr
    );
  }

  // ======================================================
  // UPDATE ORIGINAL ROW META
  // ======================================================

  meta.aadhaar_pdf_generated = true;

  meta.aadhaar_pdf_file =
    pdfFileName;

  try {
    await db.promise().query(
      `
      UPDATE loan_documents
      SET meta_json=?
      WHERE id=?
      `,
      [
        JSON.stringify(meta),
        row.id,
      ],
    );

    console.log(
      "✅ meta_json updated."
    );
  } catch (metaErr) {
    console.error(
      "❌ Error updating meta_json:",
      metaErr
    );
  }

  console.log(
    `✅ DONE for LAN ${row.lan}`
  );
}

// ======================================================
// MAIN CRON
// ======================================================

function startAadhaarCron() {

  cron.schedule(
    "*/2 * * * *",
    async () => {
      const startedAt = Date.now();
      console.log("⏳ Aadhaar PDF Cron Triggered...");

      // ======================================================
      // FETCH ALL POSSIBLE AADHAAR RECORDS
      // ======================================================

      const sql = `
        SELECT
          id,
          lan,
          doc_name,
          file_name,
          original_name,
          source_url,
          meta_json
        FROM loan_documents
        WHERE
          (
            original_name LIKE '%aadhaar%'
            OR file_name LIKE '%aadhaar%'
            OR doc_name = 'OFFLINE_VERIFICATION_OF_AADHAAR'
          )
      `;

      try {
        const [rows] = await db.promise().query(sql);

        console.log(`📌 Total Aadhaar Rows Found: ${rows.length}`);

        // ======================================================
        // PROCESS EACH ROW, ONE AT A TIME
        // (previously the duplicate-check/generate/insert chain for
        // a row wasn't awaited, so the loop raced ahead to the next
        // row while a PDF was still being generated for the last one)
        // ======================================================

        for (const row of rows) {
          try {
            await processAadhaarRow(row);
          } catch (e) {
            console.error(
              `❌ Error on Row ID ${row.id}:`,
              e.message
            );
          }
        }

        console.log(`✅ Aadhaar PDF cron finished in ${Date.now() - startedAt}ms`);
      } catch (err) {
        console.error(`❌ Aadhaar PDF cron failed after ${Date.now() - startedAt}ms:`, err.message);
      }
    },
    {
      // Single schedule, no cross-job contention here (unlike the SMS
      // scheduler) — node-cron's own overlap protection is sufficient.
      noOverlap: true,
    },
  );
}

module.exports = startAadhaarCron;
