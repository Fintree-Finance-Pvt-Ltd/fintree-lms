// services/doqfyEsignService.js

const fs = require("fs");
const path = require("path");
const db = require("../config/db");

const doqfyClient = require("./doqfyClient");

const { getLoanContext } = require("../utils/lanHelper");

const {
  generateSanctionLetterPdf,
  generateAgreementPdf,
} = require("./pdfGenerationService");

function clean(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function buildDoqfyPartyUsers(loan, esignParties = [], type) {
  const partyUsers = [];

  for (const party of esignParties) {
    const name = clean(loan[party.name]);
    const email = clean(loan[party.email]);
    const mobile = clean(loan[party.mobile]);

    const isEmptySigner = !name && !email && !mobile;

    if (isEmptySigner && party.required) {
      throw new Error(`${party.role} details are missing`);
    }

    if (isEmptySigner && !party.required) {
      continue;
    }

    if (!name) {
      throw new Error(`${party.role} name is missing`);
    }

    if (!mobile && !email) {
      throw new Error(`${party.role} mobile or email is required`);
    }

    const useCoordinates =
      type === "AGREEMENT" &&
      party.sign_position === "DRAG_DROP" &&
      party.position_details &&
      Object.keys(party.position_details).length > 0;

    const partyUser = {
      name,
      email,
      contact_number: mobile,
      method: "AADHAAR",
      pages: "ALL",
      remark: `${type} Signing - ${party.role}`,
      sign_position: useCoordinates ? "DRAG_DROP" : "BOTTOM_RIGHT",
    };

    if (useCoordinates) {
      partyUser.position_details = party.position_details;
    } else {
      partyUser.position_details = {};
    }

    partyUsers.push(partyUser);
  }

  if (!partyUsers.length) {
    throw new Error("No valid signer found for eSign");
  }

  return partyUsers;
}

async function buildClaimCureBuddyCoApplicantUsers(
  lan,
  coApplicantTable,
  type,
) {
  // Currently co-applicants are added to the agreement only
  if (type !== "AGREEMENT") {
    return [];
  }

  const [rows] = await db.promise().query(
    `
    SELECT
      party_no,
      customer_name,
      first_name,
      last_name,
      email,
      mobile_number
    FROM ${coApplicantTable}
    WHERE lan = ?
    ORDER BY party_no ASC
    `,
    [lan],
  );

  const partyUsers = [];
  const singleCoApplicant = rows.length === 1;

  for (const row of rows) {
    const name = clean(
      row.customer_name ||
      [row.first_name, row.last_name].filter(Boolean).join(" "),
    );

    const email = clean(row.email);
    const mobile = clean(row.mobile_number);

    if (!name) {
      throw new Error(
        `CO_APPLICANT_${row.party_no} name is missing`,
      );
    }

    if (!mobile && !email) {
      throw new Error(
        `CO_APPLICANT_${row.party_no} mobile or email is required`,
      );
    }

    /*
     * When only one co-applicant exists, place the signature
     * inside the existing co-borrower signature position.
     *
     * When there are multiple co-applicants, use Doqfy's
     * automatic placement to avoid using the same coordinates.
     */
    const useCoordinates = singleCoApplicant;

    const partyUser = {
      name,
      email,
      contact_number: mobile,
      method: "AADHAAR",
      pages: "ALL",
      remark:
        `${type} Signing - CO_APPLICANT_${row.party_no}`,

      sign_position:
        useCoordinates ? "DRAG_DROP" : "BOTTOM_RIGHT",

      position_details: useCoordinates
        ? {
            ALL: [
              {
                x1: 191,
                x2: 266,
                y1: 84,
                y2: 129,
              },
            ],
          }
        : {},
    };

    partyUsers.push(partyUser);
  }

  return partyUsers;
}

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

    // const { bookingTable, esignParties } = getLoanContext(lan);

    const loanContext = getLoanContext(lan);

const {
  bookingTable,
  esignParties,
  coApplicantTable,
} = loanContext;

    /* --------------------------------------------------- */
    /* FETCH LOAN */
    /* --------------------------------------------------- */

    const [loanRows] = await db
      .promise()
      .query(`SELECT * FROM ${bookingTable} WHERE lan = ?`, [lan]);

    if (!loanRows.length) {
      throw new Error("Loan not found");
    }

    const loan = loanRows[0];

    console.log("✅ LOAN FETCHED");

    const partyUsers = buildDoqfyPartyUsers(loan, esignParties, type);

    // ClaimCureBuddy-only multiple co-applicant handling
if (
  loanContext.type === "CLAIM_CURE_BUDDY" &&
  coApplicantTable
) {
  const coApplicantUsers =
    await buildClaimCureBuddyCoApplicantUsers(
      lan,
      coApplicantTable,
      type,
    );

  partyUsers.push(...coApplicantUsers);
}

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

    const filePath = path.join(__dirname, "../uploads", fileName);

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
            party_users: partyUsers,
            witness_users: [],
          },
        },
      ],

      document: pdfBase64,
    };

    console.log("📤 SENDING PAYLOAD TO DOQFY", payload);

    /* --------------------------------------------------- */
    /* DOQFY API CALL */
    /* --------------------------------------------------- */

    let response;

    try {
      response = await doqfyClient.post("/order/cat/upload/", payload);
    } catch (err) {
      console.error("❌ DOQFY API ERROR:", err.response?.data || err.message);

      throw new Error(
        "DOQFY API ERROR: " + JSON.stringify(err.response?.data || err.message),
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
    let signUrls = [];

    try {
      const orderResp = await doqfyClient.get(
        `/order/orders/?detail=1&order_ids=${orderId}`,
      );

      console.log("✅ ORDER DETAILS FETCHED", orderResp);

      const orderData = orderResp.data?.content?.[0];

      console.log("order response data", orderData);

      // const esignData = orderData?.esign?.[0];

      // signUrl = esignData?.sign_url || null;

      const esignData = Array.isArray(orderData?.esign)
  ? orderData.esign
  : [];

signUrls = esignData
  .map((item, index) => ({
    party_no: index + 1,
    name: partyUsers[index]?.name || item?.name || "",
    sign_url: item?.sign_url || null,
  }))
  .filter((item) => item.sign_url);

signUrl = signUrls[0]?.sign_url || null;

      console.log("✅ SIGN URL:", signUrl);
    } catch (err) {
      console.error("⚠ FAILED TO FETCH ORDER DETAILS:", err.message);
    }

    /* --------------------------------------------------- */
    /* SAVE TO DATABASE */
    /* --------------------------------------------------- */

    const primarySigner = partyUsers[0];

    const signerIdentifier =
      primarySigner.contact_number || primarySigner.email || null;

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
        signerIdentifier,
        JSON.stringify(payload),
        JSON.stringify(response.data),
      ],
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
        [orderId, lan],
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
        [orderId, lan],
      );
    }

    /* --------------------------------------------------- */
    /* RETURN */
    /* --------------------------------------------------- */

    return {
      success: true,
      lan,
      orderId,
      sign_url: signUrl,
       ...(loanContext.type === "CLAIM_CURE_BUDDY"
    ? { sign_urls: signUrls }
    : {}),
    };
  } catch (err) {
    console.error("❌ FINAL DOQFY ERROR:", err);
    throw err;
  }
};
