
// const cron = require("node-cron");
// const fs = require("fs");
// const path = require("path");
// const axios = require("axios");
// const xml2js = require("xml2js");
// const db = require("../config/db");
// const { createAadhaarPDF } = require("./aadhaarPdfGenerator");

// async function parseAadhaarXML(xmlBuffer) {
//   return await xml2js.parseStringPromise(xmlBuffer, {
//     explicitArray: false,
//     trim: true,
//   });
// }

// function startAadhaarCron() {
//   cron.schedule("*/2 * * * *", async () => {
//     console.log("⏳ Aadhaar PDF Cron Running...");

//     const sql = `
//       SELECT id, lan, file_name, source_url, meta_json
//       FROM loan_documents
//       WHERE doc_name='OFFLINE_VERIFICATION_OF_AADHAAR'
//     `;

//     db.query(sql, async (err, rows) => {
//       if (err) return console.error("DB error:", err);

//       for (let row of rows) {
//         let meta = {};
//         try { meta = JSON.parse(row.meta_json || "{}"); }
//         catch {}

//         if (meta.aadhaar_pdf_generated === true) continue;

//         try {
//           let xmlPath = path.join("uploads", row.file_name || "");

//           // Download XML if missing
//           if (!row.file_name || !fs.existsSync(xmlPath)) {
//             if (!row.source_url) {
//               console.log(`❌ No local file or URL for ID ${row.id}`);
//               continue;
//             }

//             console.log(`📥 Downloading XML for ID ${row.id}`);

//             const resp = await axios.get(row.source_url, {
//               responseType: "arraybuffer",
//             });

//             const newFile = `${Date.now()}_${row.id}.xml`;
//             xmlPath = path.join("uploads", newFile);
//             fs.writeFileSync(xmlPath, resp.data);

//             db.query(
//               "UPDATE loan_documents SET file_name=? WHERE id=?",
//               [newFile, row.id]
//             );

//             row.file_name = newFile;
//           }

//           const xmlBuffer = fs.readFileSync(xmlPath);
//           const json = await parseAadhaarXML(xmlBuffer);

//           const pdfFile = row.file_name.replace(".xml", ".pdf");
//           const pdfPath = path.join("uploads", pdfFile);

//           await createAadhaarPDF(json, pdfPath);

//           const pdfMeta = {
//             type: "aadhaar_pdf",
//             xml_source: row.file_name,
//             generated_at: new Date(),
//           };

//           const insertSQL = `
//             INSERT INTO loan_documents
//             (lan, doc_name, file_name, original_name, source_url, meta_json, uploaded_at)
//             VALUES (?, 'OFFLINE_VERIFICATION_OF_AADHAAR_PDF', ?, ?, NULL, ?, NOW())
//           `;

//           db.query(insertSQL, [
//             row.lan,
//             pdfFile,
//             pdfFile,
//             JSON.stringify(pdfMeta),
//           ]);

//           meta.aadhaar_pdf_generated = true;
//           meta.aadhaar_pdf_file = pdfFile;

//           db.query(
//             "UPDATE loan_documents SET meta_json=? WHERE id=?",
//             [JSON.stringify(meta), row.id]
//           );

//           console.log(`✔ PDF generated for LAN ${row.lan}`);

//         } catch (e) {
//           console.error(`❌ Error on ID ${row.id}: ${e.message}`);
//         }
//       }
//     });
//   });
// }

// module.exports = startAadhaarCron;


// startAadhaarCron.js

// startAadhaarCron.js (FINAL UPDATED VERSION)

const cron = require("node-cron");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const xml2js = require("xml2js");
const unzipper = require("unzipper");
const db = require("../config/db");
const { createAadhaarPDF } = require("./aadhaarPdfGenerator");

function parseAadhaarXML(xmlBuffer) {
  return xml2js.parseStringPromise(xmlBuffer.toString(), {
    explicitArray: false,
    trim: true,
  });
}

function startAadhaarCron() {
  cron.schedule("*/2 * * * *", async () => {
    console.log("\n===============================");
    console.log("⏳ Aadhaar PDF Cron Running...");
    console.log("===============================\n");

    const sql = `
      SELECT id, lan, file_name, source_url, meta_json
      FROM loan_documents
      WHERE doc_name='OFFLINE_VERIFICATION_OF_AADHAAR'
    `;

    db.query(sql, async (err, rows) => {
      if (err) {
        console.error("❌ DB Error:", err);
        return;
      }

      console.log(`📌 Found ${rows.length} Aadhaar records.`);

      for (let row of rows) {
        console.log("\n-----------------------------------");
        console.log(`📝 Processing Row ID: ${row.id} (LAN: ${row.lan})`);
        console.log("-----------------------------------");

        let meta = {};
        try { meta = JSON.parse(row.meta_json || "{}"); } catch {}

        if (meta.aadhaar_pdf_generated === true) {
          console.log("➡ PDF already generated. Skipping...");
          continue;
        }

        try {
          console.log(`🔗 Source URL: ${row.source_url}`);

          // ============================
          // 📥 DOWNLOAD FILE AS STREAM
          // ============================
          console.log("⬇ Downloading Aadhaar file (stream mode)...");
          const resp = await axios.get(row.source_url, {
            responseType: "stream",
          });

          const chunks = [];
          for await (const chunk of resp.data) chunks.push(chunk);
          const fileBuffer = Buffer.concat(chunks);

          console.log(`📦 Download Complete — Size: ${fileBuffer.length} bytes`);

          // ============================
          // 🔍 DETECT ZIP
          // ============================
          const isZip =
            row.source_url.endsWith(".zip") ||
            resp.headers["content-type"]?.includes("zip") ||
            fileBuffer.slice(0, 2).toString("hex") === "504b";

          let xmlBuffer;

          if (isZip) {
            console.log("📦 ZIP detected → extracting XML...");

            try {
              const directory = await unzipper.Open.buffer(fileBuffer);
              const xmlFile = directory.files.find(f =>
                f.path.toLowerCase().endsWith(".xml")
              );

              if (!xmlFile) {
                console.log("❌ ERROR: No XML found inside ZIP.");
                continue;
              }

              console.log(`📄 Found XML inside ZIP: ${xmlFile.path}`);
              xmlBuffer = await xmlFile.buffer();
              console.log("📄 XML Extracted Successfully.");
            } catch (zipError) {
              console.error("❌ ZIP Extraction Error:", zipError.message);
              continue;
            }
          } else {
            console.log("📄 File is plain XML → using directly.");
            xmlBuffer = fileBuffer;
          }

          // ============================
          // 🔍 PARSE XML
          // ============================
          console.log("📘 Parsing Aadhaar XML...");
          const json = await parseAadhaarXML(xmlBuffer);
          console.log("📘 XML Parsed Successfully!");

          // ============================
          // 📄 GENERATE PDF
          // ============================
          const pdfFile = `${Date.now()}_${row.id}.pdf`;
          const pdfPath = path.join("uploads", pdfFile);

          console.log(`🖨 Generating PDF → ${pdfFile}`);
          await createAadhaarPDF(json, pdfPath);
          console.log("✔ PDF Created Successfully!");

          // ============================
          // 💾 INSERT PDF RECORD
          // ============================
          const pdfMeta = {
            type: "aadhaar_pdf",
            source: row.source_url,
            generated_at: new Date(),
          };

          console.log("💾 Inserting PDF metadata into DB...");

          db.query(
            `INSERT INTO loan_documents
            (lan, doc_name, file_name, original_name, source_url, meta_json, uploaded_at)
            VALUES (?, 'OFFLINE_VERIFICATION_OF_AADHAAR_PDF', ?, ?, NULL, ?, NOW())`,
            [row.lan, pdfFile, pdfFile, JSON.stringify(pdfMeta)]
          );

          // ============================
          // 💾 UPDATE ORIGINAL RECORD
          // ============================
          meta.aadhaar_pdf_generated = true;
          meta.aadhaar_pdf_file = pdfFile;

          db.query(
            "UPDATE loan_documents SET meta_json=? WHERE id=?",
            [JSON.stringify(meta), row.id]
          );

          console.log(`✅ DONE — PDF generated for ID ${row.id}`);

        } catch (e) {
          console.error(`❌ ERROR processing ID ${row.id}:`, e.message);
        }
      }
    });
  });
}

module.exports = startAadhaarCron;
