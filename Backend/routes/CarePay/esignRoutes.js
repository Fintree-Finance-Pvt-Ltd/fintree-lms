const express = require("express");
const db = require("../../config/db");
const verifyApiKey = require("../../middleware/apiKeyAuth");

function isCarePayPartner(req) {
  return (req.partner?.name || "").toLowerCase().trim() === "carepay";
}

function nullableString(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed === "" ? null : trimmed;
}

function normalizeCarePayLan(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizeCarePayDocumentType(value) {
  const documentType = String(value || "AGREEMENT").trim().toUpperCase();

  if (!["AGREEMENT", "SANCTION"].includes(documentType)) {
    const err = new Error(
      "Invalid document_type. Allowed values are AGREEMENT and SANCTION.",
    );
    err.statusCode = 400;
    throw err;
  }

  return documentType;
}

function normalizeCarePayEsignStatus(value) {
  const status = String(value || "INITIATED").trim();
  const upperStatus = status.toUpperCase();

  if (["COMPLETED", "SIGNED", "SIGN_COMPLETE"].includes(upperStatus)) {
    return "SIGNED";
  }

  if (upperStatus === "REQUESTED") {
    return "INITIATED";
  }

  return upperStatus || "INITIATED";
}

function safeJson(value) {
  if (value === undefined || value === null || value === "") return null;

  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({
      serialization_error: true,
      message: "Unable to stringify payload",
    });
  }
}

function parseJson(value) {
  if (!value) return null;
  if (typeof value !== "string") return value;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function extractCarePaySignUrl(rawResponse) {
  const parsed = parseJson(rawResponse);

  return (
    parsed?.sign_url ||
    parsed?.signUrl ||
    parsed?.url ||
    parsed?.authentication_url ||
    parsed?.content?.sign_url ||
    parsed?.content?.[0]?.esign?.[0]?.sign_url ||
    parsed?.order?.content?.[0]?.esign?.[0]?.sign_url ||
    null
  );
}

function getCarePayDocumentId(data) {
  return String(
    data.document_id ||
      data.order_id ||
      data.doc_id ||
      data.doqfy_order_id ||
      "",
  ).trim();
}

async function fetchCarePayLoanForEsign(lan) {
  const normalizedLan = normalizeCarePayLan(lan);

  if (!normalizedLan) {
    const err = new Error("lan is required.");
    err.statusCode = 400;
    throw err;
  }

  if (!normalizedLan.startsWith("CARE")) {
    const err = new Error("This route is only for CarePay LANs.");
    err.statusCode = 400;
    throw err;
  }

  const [rows] = await db.promise().query(
    `SELECT lan, partner_loan_id, customer_name
     FROM loan_booking_carepay
     WHERE lan = ?
     LIMIT 1`,
    [normalizedLan],
  );

  if (!rows.length) {
    const err = new Error("CarePay loan not found.");
    err.statusCode = 404;
    throw err;
  }

  return rows[0];
}

function buildCarePayRawResponse(data) {
  const rawResponseValue =
    data.raw_response || data.doqfy_response || data.response || data;
  const rawResponse = parseJson(rawResponseValue) || rawResponseValue;

  if (rawResponse && typeof rawResponse === "object" && !Array.isArray(rawResponse)) {
    return {
      ...rawResponse,
      sign_url:
        data.sign_url ||
        data.signUrl ||
        rawResponse.sign_url ||
        rawResponse.signUrl ||
        null,
    };
  }

  return rawResponse;
}

function mapCarePayEsignDocument(row) {
  return {
    id: row.id,
    lan: row.lan,
    document_id: row.document_id,
    document_type: row.document_type,
    status: row.status,
    signer_identifier: row.signer_identifier,
    sign_url: extractCarePaySignUrl(row.raw_response),
    signed_file_path: row.signed_file_path,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function upsertCarePayEsignDocument(data) {
  const loan = await fetchCarePayLoanForEsign(data.lan);
  const documentId = getCarePayDocumentId(data);

  if (!documentId) {
    const err = new Error("document_id or order_id is required.");
    err.statusCode = 400;
    throw err;
  }

  const documentType = normalizeCarePayDocumentType(
    data.document_type || data.type,
  );
  const status = normalizeCarePayEsignStatus(
    data.status ||
      data.order_status ||
      data.state ||
      data.signatory_data?.[0]?.status,
  );
  const signerIdentifier = nullableString(
    data.signer_identifier ||
      data.customer_identifier ||
      data.mobile_number ||
      data.email_id,
  );
  const rawRequest = safeJson(data.raw_request || data.doqfy_request || null);
  const rawResponse = safeJson(buildCarePayRawResponse(data));

  const [existingRows] = await db.promise().query(
    `SELECT id, lan
     FROM esign_documents
     WHERE document_id = ?
     LIMIT 1`,
    [documentId],
  );

  const existing = existingRows[0];

  if (existing && normalizeCarePayLan(existing.lan) !== loan.lan) {
    const err = new Error("document_id already exists for another LAN.");
    err.statusCode = 409;
    throw err;
  }

  if (existing) {
    await db.promise().query(
      `
      UPDATE esign_documents
      SET
        document_type = ?,
        status = ?,
        signer_identifier = ?,
        raw_request = COALESCE(?, raw_request),
        raw_response = ?,
        updated_at = NOW()
      WHERE id = ?
      `,
      [
        documentType,
        status,
        signerIdentifier,
        rawRequest,
        rawResponse,
        existing.id,
      ],
    );
  } else {
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
        loan.lan,
        documentId,
        documentType,
        status,
        signerIdentifier,
        rawRequest,
        rawResponse,
      ],
    );
  }

  await db.promise().query(
    `
    UPDATE loan_booking_carepay
    SET agreement_esign_status = ?,
        updated_at = NOW()
    WHERE lan = ?
    `,
    [status, loan.lan],
  );

  return {
    lan: loan.lan,
    partner_loan_id: loan.partner_loan_id,
    customer_name: loan.customer_name,
    document_id: documentId,
    document_type: documentType,
    status,
    signer_identifier: signerIdentifier,
    sign_url: extractCarePaySignUrl(rawResponse),
    action: existing ? "updated" : "created",
  };
}

async function getCarePayEsignStatus({ lan, documentType }) {
  const loan = await fetchCarePayLoanForEsign(lan);
  const params = [loan.lan];
  let typeFilter = "";

  if (documentType) {
    typeFilter = " AND document_type = ?";
    params.push(normalizeCarePayDocumentType(documentType));
  }

  const [rows] = await db.promise().query(
    `
    SELECT
      id,
      lan,
      document_id,
      document_type,
      status,
      signer_identifier,
      raw_response,
      signed_file_path,
      created_at,
      updated_at
    FROM esign_documents
    WHERE lan = ?
      ${typeFilter}
    ORDER BY COALESCE(updated_at, created_at) DESC, id DESC
    `,
    params,
  );

  const documents = rows.map(mapCarePayEsignDocument);
  const latest = documents[0] || null;

  return {
    lan: loan.lan,
    partner_loan_id: loan.partner_loan_id,
    customer_name: loan.customer_name,
    status: latest?.status || "NOT_INITIATED",
    latest_document: latest,
    documents,
  };
}

module.exports = function createCarePayEsignRoutes() {
  const router = express.Router();

router.post("/v1/carepay-esign-status-update", async (req, res) => {
  try {
    const body = req.body || {};
    const lan = normalizeCarePayLan(
      body.lan || body.LAN || body.loan_account_number,
    );

    if (!lan) {
      return res.status(400).json({
        message: "lan is required.",
      });
    }

    if (!lan.startsWith("CARE")) {
      return res.status(400).json({
        message: "This route is only for CarePay LANs.",
      });
    }

    // Find latest status from esign_documents (read-only)
    const [docRows] = await db.promise().query(
      `
      SELECT status, document_id, document_type
      FROM esign_documents
      WHERE lan = ?
      ORDER BY COALESCE(updated_at, created_at) DESC, id DESC
      LIMIT 1
      `,
      [lan],
    );

    if (!docRows.length) {
      return res.status(404).json({
        message: "No eSign document found for this LAN.",
      });
    }

    const docStatus = normalizeCarePayEsignStatus(docRows[0].status);

    // Only update carepay when esign_documents status is SIGNED
    if (docStatus !== "SIGNED") {
      return res.status(200).json({
        message: "eSign document is not signed yet. Skipped carepay update.",
        data: {
          lan,
          esign_status: docStatus,
          document_id: docRows[0].document_id,
        },
      });
    }

    // Verify loan exists
    const [loanRows] = await db.promise().query(
      `SELECT lan
       FROM loan_booking_carepay
       WHERE lan = ?
       LIMIT 1`,
      [lan],
    );

    if (!loanRows.length) {
      return res.status(404).json({
        message: "CarePay loan not found.",
      });
    }

    // Update ONLY carepay table
    await db.promise().query(
      `
      UPDATE loan_booking_carepay
      SET agreement_esign_status = ?,
          updated_at = NOW()
      WHERE lan = ?
      `,
      [docStatus, lan], // "SIGNED"
    );

    return res.status(200).json({
      message: "CarePay eSign status updated successfully.",
      data: {
        lan,
        status: docStatus,
        document_id: docRows[0].document_id,
        document_type: docRows[0].document_type,
      },
    });
  } catch (error) {
    console.error("CarePay eSign status update error:", error);

    return res.status(error.statusCode || 500).json({
      message: "Failed to update CarePay eSign status.",
      error: error.sqlMessage || error.message,
    });
  }
});

  const handleCarePayEsignStatus = async (req, res) => {
    try {
      if (!isCarePayPartner(req)) {
        return res
          .status(403)
          .json({ message: "This route is only for CarePay partner." });
      }

      const lan = req.params?.lan || req.query?.lan;
      const documentType = req.query?.document_type || req.query?.type;
      const data = await getCarePayEsignStatus({ lan, documentType });

      return res.status(200).json({
        message: "CarePay eSign status fetched successfully.",
        data,
      });
    } catch (error) {
      console.error("CarePay eSign status fetch error:", error);

      return res.status(error.statusCode || 500).json({
        message: "Failed to fetch CarePay eSign status.",
        error: error.sqlMessage || error.message,
      });
    }
  };

  router.get(
    "/v1/carepay-esign-status/:lan",
    verifyApiKey,
    handleCarePayEsignStatus,
  );

  // router.get(
  //   "/v1/carepay-esign-status",
  //   verifyApiKey,
  //   handleCarePayEsignStatus,
  // );

  // router.post("/v1/carepay-esign-webhook", async (req, res) => {
  //   try {
  //     const documentId = getCarePayDocumentId(req.body || {});

  //     if (!documentId) {
  //       return res.status(400).json({
  //         message: "document_id or order_id is required.",
  //       });
  //     }

  //     const [rows] = await db.promise().query(
  //       `SELECT lan
  //        FROM esign_documents
  //        WHERE document_id = ?
  //          AND lan LIKE 'CARE%'
  //        LIMIT 1`,
  //       [documentId],
  //     );

  //     if (!rows.length) {
  //       return res.status(200).send("ignored");
  //     }

  //     const status = normalizeCarePayEsignStatus(
  //       req.body?.status ||
  //         req.body?.order_status ||
  //         req.body?.state ||
  //         req.body?.signatory_data?.[0]?.status,
  //     );
  //     const rawResponse = safeJson(buildCarePayRawResponse(req.body || {}));

  //     // await db.promise().query(
  //     //   `
  //     //   UPDATE esign_documents
  //     //   SET
  //     //     status = ?,
  //     //     raw_response = ?,
  //     //     updated_at = NOW()
  //     //   WHERE document_id = ?
  //     //   `,
  //     //   [status, rawResponse, documentId],
  //     // );

  //     await db.promise().query(
  //       `
  //       UPDATE loan_booking_carepay
  //       SET agreement_esign_status = ?,
  //           updated_at = NOW()
  //       WHERE lan = ?
  //       `,
  //       [status, rows[0].lan],
  //     );

  //     return res.status(200).json({
  //       message: "CarePay eSign status updated successfully.",
  //       data: {
  //         lan: rows[0].lan,
  //         document_id: documentId,
  //         status,
  //       },
  //     });
  //   } catch (error) {
  //     console.error("CarePay eSign status update error:", error);

  //     return res.status(error.statusCode || 500).json({
  //       message: "Failed to update CarePay eSign status.",
  //       error: error.sqlMessage || error.message,
  //     });
  //   }
  // });

  return router;
};
