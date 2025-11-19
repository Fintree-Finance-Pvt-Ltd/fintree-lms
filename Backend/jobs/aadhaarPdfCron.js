// const cron = require("node-cron");
// const fs = require("fs");
// const path = require("path");
// const axios = require("axios");
// const db = require("../config/db");
// const xml2js = require("xml2js");
// const PDFDocument = require("pdfkit");

// // Parse Aadhaar XML
// async function parseAadhaarXML(xmlBuffer) {
//   return await xml2js.parseStringPromise(xmlBuffer, {
//     explicitArray: false,
//     trim: true,
//   });
// }

// // Generate Aadhaar PDF (UPDATED)
// async function createAadhaarPDF(json, outputPath) {
//   const doc = new PDFDocument({ margin: 50 });
//   const stream = fs.createWriteStream(outputPath);
//   doc.pipe(stream);

//   const kyc = json.Certificate.CertificateData.KycRes;
//   const uid = kyc.UidData;

//   const poi = uid.Poi?.$ || {};
//   const poa = uid.Poa?.$ || {};

//   // Header
//   doc.fontSize(24).text("Aadhaar KYC Report", { align: "center" });
//   doc.moveDown();

//   // Basic details
//   doc.fontSize(12).text(`Name: ${poi.name || "-"}`);
//   doc.text(`DOB: ${poi.dob || "-"}`);
//   doc.text(`Gender: ${poi.gender || "-"}`);
//   doc.moveDown();

//   // Address
//   doc.text("Address:");
//   doc.text(`${poa.co || ""}`);
//   doc.text(
//     `${poa.house || ""} ${poa.street || ""} ${poa.lm || ""}`.trim()
//   );
//   doc.text(
//     `${poa.loc || ""}, ${poa.vtc || ""}, ${poa.subdist || ""}, ${poa.dist || ""}, ${poa.state || ""} - ${poa.pc || ""}`
//   );
//   doc.moveDown();

//   // Photo
//   if (uid.Pht) {
//     try {
//       const img = Buffer.from(uid.Pht, "base64");
//       doc.image(img, { width: 180 });
//     } catch (e) {
//       console.error("❌ Photo decode error:", e.message);
//     }
//   }

//   doc.end();
//   return new Promise((resolve) => stream.on("finish", resolve));
// }

// // MAIN CRON FUNCTION (UPDATED)
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
//         // Parse meta_json
//         let meta = {};
//         try {
//           meta = JSON.parse(row.meta_json || "{}");
//         } catch {
//           meta = {};
//         }

//         // Already processed? Skip.
//         if (meta.aadhaar_pdf_generated === true) continue;

//         try {
//           let xmlPath = path.join("uploads", row.file_name || "");

//           // If file is missing → download from S3 automatically
//           if (!row.file_name || !fs.existsSync(xmlPath)) {
//             if (!row.source_url) {
//               console.log(`❌ Missing file and no S3 URL for ID ${row.id}`);
//               continue;
//             }

//             console.log(`📥 Downloading from S3 for ID ${row.id}`);

//             try {
//               const resp = await axios.get(row.source_url, {
//                 responseType: "arraybuffer",
//               });

//               let ext = ".xml";
//               const ct = resp.headers["content-type"] || "";

//               if (ct.includes("zip")) ext = ".zip";
//               if (ct.includes("xml")) ext = ".xml";

//               const newFile = `${Date.now()}_${row.id}${ext}`;
//               const newPath = path.join("uploads", newFile);

//               fs.writeFileSync(newPath, resp.data);

//               row.file_name = newFile;
//               xmlPath = newPath;

//               db.query(
//                 "UPDATE loan_documents SET file_name=? WHERE id=?",
//                 [newFile, row.id]
//               );

//               console.log(`✔ File downloaded: ${newFile}`);
//             } catch (e) {
//               console.log(`❌ Failed S3 download (ID ${row.id}):`, e.message);
//               continue;
//             }
//           }

//           // Read XML
//           if (row.file_name.endsWith(".zip")) {
//             console.log(`❌ ZIP found (not supported yet) — ID ${row.id}`);
//             continue;
//           }

//           const xmlBuffer = fs.readFileSync(xmlPath);
//           const json = await parseAadhaarXML(xmlBuffer);

//           // Generate PDF
//           const pdfFile = row.file_name.replace(".xml", ".pdf");
//           const pdfPath = path.join("uploads", pdfFile);

//           await createAadhaarPDF(json, pdfPath);

//           // Insert NEW PDF row
//           const pdfMeta = {
//             type: "aadhaar_pdf",
//             source_xml: row.file_name,
//             generated_at: new Date(),
//           };

//           const insertSql = `
//             INSERT INTO loan_documents
//             (lan, doc_name, file_name, original_name, source_url, doc_password, meta_json, uploaded_at)
//             VALUES (?, ?, ?, ?, NULL, NULL, ?, NOW())
//           `;

//           db.query(insertSql, [
//             row.lan,
//             "OFFLINE_VERIFICATION_OF_AADHAAR_PDF",
//             pdfFile,
//             pdfFile,
//             JSON.stringify(pdfMeta),
//           ]);

//           // Update original meta_json
//           meta.aadhaar_pdf_generated = true;
//           meta.aadhaar_pdf_file = pdfFile;

//           db.query(
//             "UPDATE loan_documents SET meta_json=? WHERE id=?",
//             [JSON.stringify(meta), row.id]
//           );

//           console.log(`✔ PDF Generated & Row Inserted (LAN=${row.lan})`);

//         } catch (e) {
//           console.error(`❌ Error processing ID ${row.id}:`, e.message);
//         }
//       }
//     });
//   });
// }

// module.exports = startAadhaarCron;


const cron = require("node-cron");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const xml2js = require("xml2js");
const db = require("../config/db");
const { createAadhaarPDF } = require("./aadhaarPdfGenerator");

async function parseAadhaarXML(xmlBuffer) {
  return await xml2js.parseStringPromise(xmlBuffer, {
    explicitArray: false,
    trim: true,
  });
}

function startAadhaarCron() {
  cron.schedule("*/2 * * * *", async () => {
    console.log("⏳ Aadhaar PDF Cron Running...");

    const sql = `
      SELECT id, lan, file_name, source_url, meta_json
      FROM loan_documents
      WHERE doc_name='OFFLINE_VERIFICATION_OF_AADHAAR'
    `;

    db.query(sql, async (err, rows) => {
      if (err) return console.error("DB error:", err);

      for (let row of rows) {
        let meta = {};
        try { meta = JSON.parse(row.meta_json || "{}"); }
        catch {}

        if (meta.aadhaar_pdf_generated === true) continue;

        try {
          let xmlPath = path.join("uploads", row.file_name || "");

          // Download XML if missing
          if (!row.file_name || !fs.existsSync(xmlPath)) {
            if (!row.source_url) {
              console.log(`❌ No local file or URL for ID ${row.id}`);
              continue;
            }

            console.log(`📥 Downloading XML for ID ${row.id}`);

            const resp = await axios.get(row.source_url, {
              responseType: "arraybuffer",
            });

            const newFile = `${Date.now()}_${row.id}.xml`;
            xmlPath = path.join("uploads", newFile);
            fs.writeFileSync(xmlPath, resp.data);

            db.query(
              "UPDATE loan_documents SET file_name=? WHERE id=?",
              [newFile, row.id]
            );

            row.file_name = newFile;
          }

          const xmlBuffer = fs.readFileSync(xmlPath);
          const json = await parseAadhaarXML(xmlBuffer);

          const pdfFile = row.file_name.replace(".xml", ".pdf");
          const pdfPath = path.join("uploads", pdfFile);

          await createAadhaarPDF(json, pdfPath);

          const pdfMeta = {
            type: "aadhaar_pdf",
            xml_source: row.file_name,
            generated_at: new Date(),
          };

          const insertSQL = `
            INSERT INTO loan_documents
            (lan, doc_name, file_name, original_name, source_url, meta_json, uploaded_at)
            VALUES (?, 'OFFLINE_VERIFICATION_OF_AADHAAR_PDF', ?, ?, NULL, ?, NOW())
          `;

          db.query(insertSQL, [
            row.lan,
            pdfFile,
            pdfFile,
            JSON.stringify(pdfMeta),
          ]);

          meta.aadhaar_pdf_generated = true;
          meta.aadhaar_pdf_file = pdfFile;

          db.query(
            "UPDATE loan_documents SET meta_json=? WHERE id=?",
            [JSON.stringify(meta), row.id]
          );

          console.log(`✔ PDF generated for LAN ${row.lan}`);

        } catch (e) {
          console.error(`❌ Error on ID ${row.id}: ${e.message}`);
        }
      }
    });
  });
}

module.exports = startAadhaarCron;
