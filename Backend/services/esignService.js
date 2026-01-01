// services/esignService.js
const fs = require("fs");
const path = require("path");
const db = require("../config/db");
const digioEsign = require("./digioEsignClient");
const { getLoanContext } = require("../utils/lanHelper");
const {
  generateSanctionLetterPdf,
  generateAgreementPdf
} = require("./pdfGenerationService");

exports.initEsign = async (lan, type) => {
  try {
    console.log("🚀 INITIATING DIGIO ESIGN FOR:", lan, type);

    /* --------------------- VALIDATION --------------------- */
    if (!["AGREEMENT", "SANCTION"].includes(type)) {
      throw new Error("Invalid eSign type");
    }

    /* --------------------- RESOLVE TABLE --------------------- */
    const { bookingTable } = getLoanContext(lan);

    /* --------------------- FETCH LOAN --------------------- */
    const [loanRows] = await db.promise().query(
      `SELECT * FROM ${bookingTable} WHERE lan = ?`,
      [lan]
    );

    if (!loanRows.length) throw new Error("Loan not found");

    const loan = loanRows[0];

    const identifier = loan.mobile_number || loan.email_id;
    if (!identifier) throw new Error("No customer mobile/email found");

    console.log("➡ Using Identifier:", identifier);

    /* --------------------- GENERATE PDF --------------------- */
    let pdfResult;

    if (type === "SANCTION") {
      const pdfName = await generateSanctionLetterPdf(lan);
      pdfResult = { pdfName };
    } else {
      pdfResult = await generateAgreementPdf(lan);
    }

    const fileName = pdfResult.pdfName;
    if (!fileName || typeof fileName !== "string") {
      throw new Error("Invalid PDF name returned");
    }

    const filePath = path.join(__dirname, "../uploads", fileName);

    console.log("📄 Using PDF:", filePath);

    if (!fs.existsSync(filePath)) {
      throw new Error("PDF file missing: " + filePath);
    }

    const pdfBase64 = fs.readFileSync(filePath).toString("base64");

    /* --------------------- DIGIO PAYLOAD --------------------- */
    const payload = {
      file_name: fileName,
      expire_in_days: 10,
      notify_signers: true,
      send_sign_link: true,
      include_authentication_url: true,
      display_on_page: "all",

      signers: [
        {
          identifier,
          name: loan.customer_name,
          sign_type: "aadhaar",
          reason: `${type} Signing`
        }
      ],

      reference_id: `${lan}_${type}_${Date.now()}`,
      file_data: pdfBase64
    };

    console.log("📤 SENT PAYLOAD TO DIGIO");

    /* --------------------- DIGIO API CALL --------------------- */
    let resp;
    try {
      resp = await digioEsign.post("/v2/client/document/uploadpdf", payload);
    } catch (err) {
      console.error("❌ DIGIO ERROR RESPONSE:", err.response?.data);
      throw new Error(
        "DIGIO API ERROR: " +
          JSON.stringify(err.response?.data || err.message)
      );
    }

    const docId = resp.data.id;
    const authUrl = resp.data.authentication_url || null;

    console.log("✅ DIGIO DOCUMENT CREATED:", docId);

    /* --------------------- SAVE DOCUMENT --------------------- */
    await db.promise().query(
      `
      INSERT INTO esign_documents
        (lan, document_id, document_type, status, signer_identifier, raw_request, raw_response)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        lan,
        docId,
        type,
        "INITIATED",
        identifier,
        JSON.stringify(payload),
        JSON.stringify(resp.data)
      ]
    );

    /* --------------------- UPDATE BOOKING TABLE --------------------- */
    if (type === "SANCTION") {
      await db.promise().query(
        `
        UPDATE ${bookingTable}
        SET sanction_esign_status='INITIATED',
            sanction_esign_document_id=?
        WHERE lan=?
        `,
        [docId, lan]
      );
    } else {
      await db.promise().query(
        `
        UPDATE ${bookingTable}
        SET agreement_esign_status='INITIATED',
            agreement_esign_document_id=?
        WHERE lan=?
        `,
        [docId, lan]
      );
    }

    /* --------------------- RETURN --------------------- */
    return {
      success: true,
      lan,
      docId,
      authentication_url: authUrl
    };
  } catch (err) {
    console.error("❌ FINAL ESIGN ERROR:", err);
    throw err;
  }
};





/////////////////////////////////  for digitap ///////////////////////////////////

// services/esignService.js
// const fs = require("fs");
// const path = require("path");
// const axios = require("axios");
// const db = require("../config/db");
// const digitapEsign = require("./digitapEsignClient");
// const {
//   generateSanctionLetterPdf,
//   generateAgreementPdf,
// } = require("./pdfGenerationService");

// exports.initEsign = async (lan, type) => {
//   console.log("➡️ initEsign started for", lan, type);

//   if (!["SANCTION", "AGREEMENT"].includes(type))
//     throw new Error("Invalid eSign type");

//   // 1️⃣ Fetch Loan
//   const [rows] = await db
//     .promise()
//     .query("SELECT * FROM loan_booking_helium WHERE lan=?", [lan]);

//   if (!rows.length) throw new Error("Loan not found");

//   const loan = rows[0];
//   const signerName = loan.customer_name;
//   const identifier = loan.mobile_number;

//   if (!identifier) throw new Error("No mobile/email for signer");

//   // 2️⃣ Generate PDF
//   const pdfFileName =
//     type === "SANCTION"
//       ? await generateSanctionLetterPdf(lan, loan)
//       : await generateAgreementPdf(lan);

//   const pdfPath = path.join(__dirname, "../generated", pdfFileName);
//   const pdfBuffer = fs.readFileSync(pdfPath);

//   // 3️⃣ Call Digitap generate-esign API
//   const uniqueId = `${lan}_${type}_${Date.now()}`;

//   const payload = {
//     "uniqueId": "HEL1011036_SANCTION_17664732140",
//     "reason": `${type} Signing`, // as per documentation
//     "templateId": "ESIG5054779",
//     "fileName": pdfFileName,
//     "signers": [
//       {
//         "email": loan.email_id || undefined,
//         "location": "Madhya Pradesh",
//         "mobile": identifier,
//         "name": signerName,
//       },
//     ],
//   };

//   console.log("📨 Sending Digitap request:", payload);
// let genRes;
//   // const genRes = await digitapEsign.post("/v1/generate-esign", payload);
//   try {
//       genRes = await digitapEsign.post("/v1/generate-esign", payload);
//     } catch (err) {
//       console.log("❌ DIGITAP ERROR RAW:", err);
//       console.log("❌ DIGITAP ERROR RESPONSE:", err.response?.data);
//       console.log("❌ DIGITAP ERROR STATUS:", err.response?.status);

//       throw new Error(
//         "DIGITAP API ERROR: " +
//           JSON.stringify(err.response?.data || err.message)
//       );
//     }
//   console.log("res", genRes);
//   const model = genRes.data.model;

//   const docId = model.docId;
//   const uploadUrl = model.url;

//   console.log("📄 Digitap docId:", docId);
//   console.log("⬆️ Upload URL received");

//   // 4️⃣ Upload PDF to Digitap S3 server
//   await axios.put(uploadUrl, pdfBuffer, {
//     headers: { "Content-Type": "application/pdf" },
//   });

//   console.log("✅ PDF uploaded successfully");

//   // 5️⃣ Save record in DB
//   await db
//     .promise()
//     .query(
//       `INSERT INTO esign_documents (lan, document_id, document_type, status, created_at) 
//        VALUES (?, ?, ?, 'INITIATED', NOW())`,
//       [lan, docId, type]
//     );

//   // 6️⃣ Build launch URL
//   const launch_url = `https://sdk.digitap.ai/e-sign/templateesignprocess.html?docId=${docId}&redirect_url=${process.env.ESIGN_SUCCESS}&error_url=${process.env.ESIGN_ERROR}`;

//   return {
//     success: true,
//     lan,
//     docId,
//     launch_url,
//   };
// };
