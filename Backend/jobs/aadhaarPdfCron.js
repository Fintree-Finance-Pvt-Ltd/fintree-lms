
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

// startAadhaarCron.js

// const cron = require("node-cron");
// const fs = require("fs");
// const path = require("path");
// const axios = require("axios");
// const xml2js = require("xml2js");
// const db = require("../config/db");
// const { createAadhaarPDF } = require("./aadhaarPdfGenerator");

// async function parseAadhaarXML(xmlBuffer) {
//   const xmlString = xmlBuffer.toString("utf8");

//   console.log("🔍 XML Preview (first 200 chars):");
//   console.log(xmlString.slice(0, 200).replace(/\s+/g, " ").trim());
//   console.log("🔍 XML Length:", xmlString.length);

//   return await xml2js.parseStringPromise(xmlString, {
//     explicitArray: false,
//     trim: true,
//   });
// }

// function startAadhaarCron() {
//   cron.schedule("*/2 * * * *", async () => {
//     console.log("\n======================================");
//     console.log("⏳ Aadhaar PDF Cron Triggered...");
//     console.log("======================================\n");

//     const sql = `
//       SELECT id, lan, file_name, source_url, meta_json
//       FROM loan_documents
//       WHERE doc_name LIKE 'OFFLINE_VERIFICATION_OF_AADHAAR%'
//     `;

//     db.query(sql, async (err, rows) => {
//       if (err) {
//         console.error("❌ DB Error while fetching Aadhaar docs:", err);
//         return;
//       }

//       console.log(`📌 Total Aadhaar rows found: ${rows.length}`);

//       for (let row of rows) {
//         console.log("\n-----------------------------------");
//         console.log(`📝 Processing Row ID: ${row.id} (LAN: ${row.lan})`);
//         console.log("-----------------------------------");

//         let meta = {};
//         try {
//           meta = JSON.parse(row.meta_json || "{}");
//         } catch (e) {
//           console.warn("⚠ Could not parse meta_json, using empty object.");
//         }

//         if (meta.aadhaar_pdf_generated === true) {
//           console.log("➡ PDF already generated. Skipping this row.");
//           continue;
//         }

//         try {
//           if (!row.source_url) {
//             console.log("❌ No source_url found for this row. Skipping.");
//             continue;
//           }

//           // Decide local XML path
//           let xmlFileName = row.file_name;
//           let xmlPath = xmlFileName
//             ? path.join("uploads", xmlFileName)
//             : null;

//           // ============================
//           // 📥 DOWNLOAD XML IF NEEDED
//           // ============================
//           let needDownload = true;

//           if (xmlFileName && fs.existsSync(xmlPath)) {
//             console.log(`📂 Local XML file already exists: ${xmlPath}`);
//             needDownload = false;
//           }

//           if (needDownload) {
//             console.log(`🌐 Downloading XML for ID ${row.id}`);
//             console.log(`🔗 URL: ${row.source_url}`);

//             const resp = await axios.get(row.source_url, {
//               responseType: "arraybuffer",
//             });

//             console.log("🌐 HTTP Status:", resp.status);
//             console.log("🌐 Content-Type:", resp.headers["content-type"]);
//             console.log("🌐 Downloaded Bytes:", resp.data.length);

//             // Force save as .xml (like your old code)
//             const newFile = `${Date.now()}_${row.id}.xml`;
//             xmlPath = path.join("uploads", newFile);

//             // Ensure uploads dir exists
//             if (!fs.existsSync("uploads")) {
//               fs.mkdirSync("uploads", { recursive: true });
//               console.log("📁 'uploads' directory created.");
//             }

//             fs.writeFileSync(xmlPath, resp.data);
//             console.log(`💾 XML saved to: ${xmlPath}`);

//             // Update DB file_name to the new xml file
//             db.query(
//               "UPDATE loan_documents SET file_name=? WHERE id=?",
//               [newFile, row.id],
//               (updateErr) => {
//                 if (updateErr) {
//                   console.error("❌ Error updating file_name in DB:", updateErr);
//                 } else {
//                   console.log("✅ DB updated with new XML file_name:", newFile);
//                 }
//               }
//             );

//             row.file_name = newFile;
//           }

//           // ============================
//           // 📖 READ LOCAL XML
//           // ============================
//           if (!xmlPath || !fs.existsSync(xmlPath)) {
//             console.log("❌ XML file missing on disk even after download. Skipping.");
//             continue;
//           }

//           console.log(`📖 Reading XML from: ${xmlPath}`);
//           const xmlBuffer = fs.readFileSync(xmlPath);
//           console.log("📖 XML File Size (bytes):", xmlBuffer.length);

//           // ============================
//           // 🔍 PARSE XML
//           // ============================
//           console.log("📘 Parsing Aadhaar XML...");
//           const json = await parseAadhaarXML(xmlBuffer);
//           console.log("📘 XML Parsed Successfully!");

//           // ============================
//           // 🖨 GENERATE PDF
//           // ============================
//           const pdfFile = row.file_name.replace(".xml", ".pdf");
//           const pdfPath = path.join("uploads", pdfFile);

//           console.log(`🖨 Generating PDF → ${pdfFile}`);
//           await createAadhaarPDF(json, pdfPath);
//           console.log("✔ PDF generated successfully at:", pdfPath);

//           // ============================
//           // 💾 INSERT PDF RECORD
//           // ============================
//           const pdfMeta = {
//             type: "aadhaar_pdf",
//             xml_source: row.file_name,
//             generated_at: new Date(),
//           };

//           console.log("💾 Inserting new PDF row in loan_documents...");

//           const insertSQL = `
//             INSERT INTO loan_documents
//             (lan, doc_name, file_name, original_name, source_url, meta_json, uploaded_at)
//             VALUES (?, 'OFFLINE_VERIFICATION_OF_AADHAAR_PDF', ?, ?, NULL, ?, NOW())
//           `;

//           db.query(
//             insertSQL,
//             [row.lan, pdfFile, pdfFile, JSON.stringify(pdfMeta)],
//             (insertErr) => {
//               if (insertErr) {
//                 console.error("❌ Error inserting PDF row:", insertErr);
//               } else {
//                 console.log("✅ PDF row inserted successfully.");
//               }
//             }
//           );

//           // ============================
//           // 💾 UPDATE ORIGINAL META_JSON
//           // ============================
//           meta.aadhaar_pdf_generated = true;
//           meta.aadhaar_pdf_file = pdfFile;

//           db.query(
//             "UPDATE loan_documents SET meta_json=? WHERE id=?",
//             [JSON.stringify(meta), row.id],
//             (metaErr) => {
//               if (metaErr) {
//                 console.error("❌ Error updating meta_json:", metaErr);
//               } else {
//                 console.log("✅ meta_json updated with PDF info.");
//               }
//             }
//           );

//           console.log(`✅ DONE — PDF generated for LAN ${row.lan}, ID ${row.id}`);

//         } catch (e) {
//           console.error(`❌ Error processing ID ${row.id}:`, e.message);
//         }
//       }
//     });
//   });
// }

// module.exports = startAadhaarCron;


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
// MAIN CRON
// ======================================================

function startAadhaarCron() {

  cron.schedule("*/2 * * * *", async () => {

    console.log("\n======================================");
    console.log("⏳ Aadhaar PDF Cron Triggered...");
    console.log("======================================\n");

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

    db.query(sql, async (err, rows) => {

      if (err) {
        console.error("❌ DB Error:", err);
        return;
      }

      console.log(`📌 Total Aadhaar Rows Found: ${rows.length}`);

      // ======================================================
      // PROCESS EACH ROW
      // ======================================================

      for (const row of rows) {

        console.log("\n-----------------------------------");
        console.log(`📝 Processing Row ID: ${row.id}`);
        console.log(`🏦 LAN: ${row.lan}`);
        console.log("-----------------------------------");

        let meta = {};

        try {
          meta = JSON.parse(row.meta_json || "{}");
        } catch {}

        // ======================================================
        // SKIP IF PDF ALREADY GENERATED
        // ======================================================

        if (meta.aadhaar_pdf_generated === true) {

          console.log("➡ PDF already generated. Skipping.");
          continue;
        }

        try {

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

            db.query(
              `
              UPDATE loan_documents
              SET file_name=?
              WHERE id=?
              `,
              [newFileName, row.id],
              (updateErr) => {

                if (updateErr) {
                  console.error(
                    "❌ Error updating file_name:",
                    updateErr
                  );
                }
              }
            );

            row.file_name = newFileName;
          }

          // ======================================================
          // NO FILE FOUND
          // ======================================================

          else {

            console.log(
              "❌ No local file and no source_url."
            );

            continue;
          }

          // ======================================================
          // FILE SIZE VALIDATION
          // ======================================================

          if (
            !fileBuffer ||
            fileBuffer.length < 100
          ) {

            console.log("❌ Invalid or empty Aadhaar file.");
            continue;
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

            continue;
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

          db.query(
            duplicateCheckSQL,
            [pdfFileName],
            async (dupErr, dupRows) => {

              if (dupErr) {

                console.error(
                  "❌ Duplicate Check Error:",
                  dupErr
                );

                return;
              }

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

                db.query(
                  `
                  UPDATE loan_documents
                  SET meta_json=?
                  WHERE id=?
                  `,
                  [
                    JSON.stringify(meta),
                    row.id,
                  ]
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

              db.query(
                insertSQL,
                [
                  row.lan,
                  pdfFileName,
                  pdfFileName,
                  JSON.stringify(pdfMeta),
                ],
                (insertErr) => {

                  if (insertErr) {

                    console.error(
                      "❌ Error inserting PDF row:",
                      insertErr
                    );

                    return;
                  }

                  console.log(
                    "✅ PDF row inserted successfully."
                  );
                }
              );

              // ======================================================
              // UPDATE ORIGINAL ROW META
              // ======================================================

              meta.aadhaar_pdf_generated = true;

              meta.aadhaar_pdf_file =
                pdfFileName;

              db.query(
                `
                UPDATE loan_documents
                SET meta_json=?
                WHERE id=?
                `,
                [
                  JSON.stringify(meta),
                  row.id,
                ],
                (metaErr) => {

                  if (metaErr) {

                    console.error(
                      "❌ Error updating meta_json:",
                      metaErr
                    );

                    return;
                  }

                  console.log(
                    "✅ meta_json updated."
                  );
                }
              );

              console.log(
                `✅ DONE for LAN ${row.lan}`
              );
            });

        } catch (e) {

          console.error(
            `❌ Error on Row ID ${row.id}:`,
            e.message
          );
        }
      }
    });
  });
}

module.exports = startAadhaarCron;
