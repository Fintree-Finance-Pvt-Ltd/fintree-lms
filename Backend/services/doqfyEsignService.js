// services/doqfyEsignService.js

const fs = require("fs");
const path = require("path");
const db = require("../config/db");

const doqfyClient = require("./doqfyClient");

const { getLoanContext } = require("../utils/lanHelper");

const {
  generateSanctionLetterPdf,
  generateAgreementPdf
} = require("./pdfGenerationService");

exports.initDoqfyEsign = async (lan, type) => {
  try {
    console.log("🚀 INITIATING DOQFY ESIGN:", lan, type);

    /* --------------------------------------------------- */
    /* VALIDATION */
    /* --------------------------------------------------- */

    if (!["AGREEMENT", "SANCTION"].includes(type)) {
      throw new Error("Invalid eSign type");
    }

    /* --------------------------------------------------- */
    /* GET LOAN CONTEXT */
    /* --------------------------------------------------- */

    const { bookingTable } = getLoanContext(lan);

    /* --------------------------------------------------- */
    /* FETCH LOAN */
    /* --------------------------------------------------- */

    const [loanRows] = await db.promise().query(
      `SELECT * FROM ${bookingTable} WHERE lan = ?`,
      [lan]
    );

    if (!loanRows.length) {
      throw new Error("Loan not found");
    }

    const loan = loanRows[0];

    console.log("✅ LOAN FETCHED");

    /* --------------------------------------------------- */
    /* GENERATE PDF */
    /* --------------------------------------------------- */

    let pdfResult;

    if (type === "SANCTION") {
      const pdfName = await generateSanctionLetterPdf(lan);
      pdfResult = { pdfName };
    } else {
      pdfResult = await generateAgreementPdf(lan);
    }

    const fileName = pdfResult.pdfName;

    if (!fileName) {
      throw new Error("PDF generation failed");
    }

    const filePath = path.join(
      __dirname,
      "../uploads",
      fileName
    );

    if (!fs.existsSync(filePath)) {
      throw new Error("PDF file missing");
    }

    console.log("📄 PDF FOUND:", filePath);

    const pdfBase64 = fs.readFileSync(filePath).toString("base64");

    /* --------------------------------------------------- */
    /* DOQFY CONFIG */
    /* --------------------------------------------------- */

    // These values should ideally come from DB/config
    const BRANCH_ID = process.env.DOQFY_BRANCH_ID || 3581;

    // Example article id:
    // Article 5(j) Agreement
    const ARTICLE_ID = process.env.DOQFY_ARTICLE_ID || 3980;

    const referenceId = `${lan}_${type}_${Date.now()}`;

    /* --------------------------------------------------- */
    /* BUILD PAYLOAD */
    /* --------------------------------------------------- */

    const payload = {
      file_name: fileName,

      is_bulk: false,

      order_details: [
        {
          branch_id: Number(BRANCH_ID),

          referance_id: referenceId,

          // OPTIONAL ESTAMP
          estamps: [],

          esigns: {
            party_users: [
              {
                name: loan.customer_name,

                email: loan.email_id || "",

                contact_number:
                  loan.mobile_number || "",

                sign_position: "BOTTOM_RIGHT",

                method: "AADHAAR",

                position_details: {},

                pages: "ALL",

                remark: `${type} Signing`
              }
            ],

            witness_users: []
          }
        }
      ],

      document: pdfBase64
    };

    console.log("📤 SENDING PAYLOAD TO DOQFY", payload);

    /* --------------------------------------------------- */
    /* DOQFY API CALL */
    /* --------------------------------------------------- */

    let response;

    try {
      response = await doqfyClient.post(
        "/order/cat/upload/",
        payload
      );
    } catch (err) {
      console.error(
        "❌ DOQFY API ERROR:",
        err.response?.data || err.message
      );

      throw new Error(
        "DOQFY API ERROR: " +
          JSON.stringify(
            err.response?.data || err.message
          )
      );
    }

    console.log("✅ DOQFY RESPONSE RECEIVED");

    const orderId = response.data?.content?.order_id;

    if (!orderId) {
      throw new Error("Order ID missing from Doqfy");
    }

    console.log("✅ ORDER CREATED:", orderId);

    /* --------------------------------------------------- */
    /* FETCH ORDER DETAILS */
    /* --------------------------------------------------- */

    let signUrl = null;

    try {
      const orderResp = await doqfyClient.get(
        `/order/orders/?detail=1&order_ids=${orderId}`
      );

      console.log("✅ ORDER DETAILS FETCHED", orderResp);

      const orderData =
        orderResp.data?.content?.[0];

        console.log("order response data", orderData);

      const esignData =
        orderData?.esign?.[0];

      signUrl = esignData?.sign_url || null;

      console.log("✅ SIGN URL:", signUrl);
    } catch (err) {
      console.error(
        "⚠ FAILED TO FETCH ORDER DETAILS:",
        err.message
      );
    }

    /* --------------------------------------------------- */
    /* SAVE TO DATABASE */
    /* --------------------------------------------------- */

    await db.promise().query(
      `
      INSERT INTO esign_documents
      (
        lan,
        document_id,
        document_type,
        status,
        signer_identifier,
        raw_request,
        raw_response
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        lan,
        orderId,
        type,
        "INITIATED",
        loan.mobile_number || loan.email_id,
        JSON.stringify(payload),
        JSON.stringify(response.data)
      ]
    );

    /* --------------------------------------------------- */
    /* UPDATE BOOKING TABLE */
    /* --------------------------------------------------- */

    if (type === "SANCTION") {
      await db.promise().query(
        `
        UPDATE ${bookingTable}
        SET
          sanction_esign_status = 'INITIATED',
          sanction_esign_document_id = ?
        WHERE lan = ?
        `,
        [orderId, lan]
      );
    } else {
      await db.promise().query(
        `
        UPDATE ${bookingTable}
        SET
          agreement_esign_status = 'INITIATED',
          agreement_esign_document_id = ?
        WHERE lan = ?
        `,
        [orderId, lan]
      );
    }

    /* --------------------------------------------------- */
    /* RETURN */
    /* --------------------------------------------------- */

    return {
      success: true,
      lan,
      orderId,
      sign_url: signUrl
    };

  } catch (err) {
    console.error("❌ FINAL DOQFY ERROR:", err);
    throw err;
  }
};