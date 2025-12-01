// services/esignService.js
const fs = require("fs");
const path = require("path");
const db = require("../config/db");
const digioEsign = require("./digioEsignClient");
const authenticateUser = require("../middleware/verifyToken");
const {
  generateSanctionLetterPdf,
  generateAgreementPdf
} = require("./pdfGenerationService");  // YOU WILL CREATE/UPDATE THIS

exports.initEsign = async (lan, type) => {
  if (!["SANCTION", "AGREEMENT"].includes(type)) {
    throw new Error("Invalid eSign type");
  }

  // Fetch loan
  const [loanRows] = await db.promise().query(
    "SELECT * FROM loan_booking_helium WHERE lan = ?",
    [lan]
  );
  if (!loanRows.length) throw new Error("Loan not found");

  const loan = loanRows[0];
  const identifier = loan.mobile_number || loan.email_id;
  if (!identifier) throw new Error("No customer identifier found");

  // Generate PDF
  let fileName;
  if (type === "SANCTION") {
    fileName = await generateSanctionLetterPdf(lan, loan);
  } else {
    fileName = await generateAgreementPdf(lan, loan);
  }

  // Construct full absolute path
  const filePath = path.join(__dirname, "../generated", fileName);

  console.log("📄 eSign using PDF:", filePath);

  // Validate file exists
  if (!fs.existsSync(filePath)) {
    throw new Error("PDF file not found on server: " + filePath);
  }

  // Read PDF
  const fileDataBase64 = fs.readFileSync(filePath).toString("base64");

  // Digio payload
  const payload = {
    signers: [
      {
        identifier,
        name: loan.customer_name,
        sign_type: "aadhaar",
        reason: `${type} eSign`,
      },
    ],
    expire_in_days: 10,
    display_on_page: "all",
    notify_signers: true,
    send_sign_link: true,
    file_name: fileName,
    file_data: fileDataBase64,
    meta_data: { lan, type },
  };

  console.log("sneding payload", payload)

  // Upload to Digio
  const resp = await digioEsign.post("/v2/client/document/uploadpdf", payload);
  const docId = resp.data.id;

  // Save into DB
  await db
    .promise()
    .query(
      `INSERT INTO esign_documents
       (lan, document_id, document_type, status, signer_identifier, raw_request, raw_response)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        lan,
        docId,
        type,
        "initiated",
        identifier,
        JSON.stringify(payload),
        JSON.stringify(resp.data),
      ]
    );

  // update loan table
  if (type === "SANCTION") {
    await db.promise().query(
      `UPDATE loan_booking_helium 
       SET sanction_esign_status='INITIATED', sanction_esign_document_id=? WHERE lan=?`,
      [docId, lan]
    );
  } else {
    await db.promise().query(
      `UPDATE loan_booking_helium 
       SET agreement_esign_status='INITIATED', agreement_esign_document_id=? WHERE lan=?`,
      [docId, lan]
    );
  }

  return { success: true, lan, docId };
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
//     uniqueId,
//     reason: `${type} Signing`, // as per documentation
//     templateId: "ALL",
//     fileName: pdfFileName,
//     signers: [
//       {
//         name: signerName,
//         mobile: identifier,
//         email: loan.email_id || undefined,
//         location: "India",
//       },
//     ],
//   };

//   console.log("📨 Sending Digitap request:", payload);

//   const genRes = await digitapEsign.post("/v1/generate-esign", payload);
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
