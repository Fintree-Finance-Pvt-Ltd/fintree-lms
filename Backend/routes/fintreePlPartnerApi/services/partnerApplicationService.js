const crypto = require("crypto");
const db = require("../../../config/db");
const { PartnerApiError } = require("../utils/partnerApiError");
const { hashRequestBody } = require("../utils/security");
const {
  prepareDocument,
  persistPreparedDocument,
  removeStoredDocument,
} = require("./documentStorageService");

const findApplicationForUpdate = async (connection, clientId, partnerApplicationId) => {
  const [rows] = await connection.query(
    `SELECT *
     FROM pl_partner_applications
     WHERE client_id = ? AND partner_application_id = ?
     LIMIT 1
     FOR UPDATE`,
    [clientId, partnerApplicationId],
  );

  if (!rows.length) {
    throw new PartnerApiError(404, "APPLICATION_NOT_FOUND", "Partner application was not found.");
  }

  return rows[0];
};

const assertApplicationIdentity = (application, payload) => {
  if (application.external_application_reference !== payload.externalApplicationReference) {
    throw new PartnerApiError(
      409,
      "APPLICATION_REFERENCE_MISMATCH",
      "externalApplicationReference does not match the application.",
    );
  }

  if (application.lan !== payload.lan) {
    throw new PartnerApiError(409, "APPLICATION_LAN_MISMATCH", "LAN does not match the application.");
  }
};

async function createApplication({ clientId, payload, correlationId }) {
  const createRequestHash = hashRequestBody(payload);
  const connection = await db.promise().getConnection();
  let transactionStarted = false;

  try {
    await connection.beginTransaction();
    transactionStarted = true;

    const [conflicts] = await connection.query(
      `SELECT partner_application_id, partner_application_number,
              external_application_reference, lan, status, created_at, create_request_hash
       FROM pl_partner_applications
       WHERE client_id = ?
         AND (external_application_reference = ? OR lan = ?)
       FOR UPDATE`,
      [clientId, payload.externalApplicationReference, payload.lan],
    );

    if (conflicts.length) {
      const existing = conflicts[0];
      const sameApplication =
        existing.external_application_reference === payload.externalApplicationReference &&
        existing.lan === payload.lan;

      if (!sameApplication || existing.create_request_hash !== createRequestHash) {
        throw new PartnerApiError(
          409,
          "APPLICATION_REFERENCE_CONFLICT",
          "The external application reference or LAN is already linked to another application.",
        );
      }

      await connection.commit();
      transactionStarted = false;

      return {
        statusCode: 200,
        data: {
          partnerApplicationId: existing.partner_application_id,
          partnerApplicationNumber: existing.partner_application_number,
          externalApplicationReference: existing.external_application_reference,
          lan: existing.lan,
          status: "CREATED",
          createdAt: new Date(existing.created_at).toISOString(),
        },
      };
    }

    const partnerApplicationId = crypto.randomUUID();
    const [insertResult] = await connection.query(
      `INSERT INTO pl_partner_applications
       (client_id, partner_application_id, partner_application_number,
        external_application_reference, lan, source_system, product_code, create_request_hash, status,
        customer_full_name, customer_first_name, customer_middle_name,
        customer_last_name, customer_father_name, pan_number, date_of_birth,
        gender, mobile_number, email, pan_verified, pan_provider_reference,
        pan_verified_at, created_at, updated_at)
       VALUES (?, ?, NULL, ?, ?, ?, ?, ?, 'CREATED', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        clientId,
        partnerApplicationId,
        payload.externalApplicationReference,
        payload.lan,
        payload.sourceSystem,
        payload.productCode,
        createRequestHash,
        payload.customer.fullName,
        payload.customer.firstName,
        payload.customer.middleName,
        payload.customer.lastName,
        payload.customer.fatherName,
        payload.customer.panNumber,
        payload.customer.dateOfBirth,
        payload.customer.gender,
        payload.customer.mobileNumber,
        payload.customer.email,
        payload.panVerification.verified ? 1 : 0,
        payload.panVerification.providerReference,
        payload.panVerification.verifiedAt
          ? new Date(payload.panVerification.verifiedAt)
          : null,
      ],
    );

    const partnerApplicationNumber = `FINPL${String(insertResult.insertId).padStart(8, "0")}`;

    await connection.query(
      `UPDATE pl_partner_applications
       SET partner_application_number = ?
       WHERE id = ?`,
      [partnerApplicationNumber, insertResult.insertId],
    );

    await connection.commit();
    transactionStarted = false;

    return {
      statusCode: 201,
      data: {
        partnerApplicationId,
        partnerApplicationNumber,
        externalApplicationReference: payload.externalApplicationReference,
        lan: payload.lan,
        status: "CREATED",
        createdAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    if (transactionStarted) {
      try {
        await connection.rollback();
      } catch {}
    }

    if (error?.code === "ER_DUP_ENTRY") {
      throw new PartnerApiError(
        409,
        "APPLICATION_REFERENCE_CONFLICT",
        "The external application reference or LAN already exists.",
      );
    }

    throw error;
  } finally {
    connection.release();
  }
}

async function recordConsent({ clientId, partnerApplicationId, payload }) {
  const connection = await db.promise().getConnection();
  let transactionStarted = false;

  try {
    await connection.beginTransaction();
    transactionStarted = true;

    const application = await findApplicationForUpdate(connection, clientId, partnerApplicationId);
    assertApplicationIdentity(application, payload);

    const [existingRows] = await connection.query(
      `SELECT application_id, consent_reference, source_consent_reference, consent_type, consent_template_id, consent_version,
              consent_text_hash, accepted_at, ip_address, user_agent_hash, recorded_at
       FROM pl_partner_application_consents
       WHERE client_id = ? AND consent_id = ?
       LIMIT 1
       FOR UPDATE`,
      [clientId, payload.consentId],
    );

    if (existingRows.length) {
      const existing = existingRows[0];
      const exactSame =
        Number(existing.application_id) === Number(application.id) &&
        (existing.source_consent_reference || null) === (payload.consentReference || null) &&
        existing.consent_type === payload.consentType &&
        existing.consent_template_id === payload.consentTemplateId &&
        existing.consent_version === payload.consentVersion &&
        existing.consent_text_hash === payload.consentTextHash &&
        new Date(existing.accepted_at).toISOString() === new Date(payload.acceptedAt).toISOString() &&
        (existing.ip_address || null) === (payload.ipAddress || null) &&
        (existing.user_agent_hash || null) === (payload.userAgentHash || null);

      if (!exactSame) {
        throw new PartnerApiError(
          409,
          "CONSENT_ID_CONFLICT",
          "The consentId already exists with different immutable evidence.",
        );
      }

      await connection.commit();
      transactionStarted = false;

      return {
        statusCode: 200,
        data: {
          consentReference: existing.consent_reference,
          status: "RECORDED",
          recordedAt: new Date(existing.recorded_at).toISOString(),
        },
      };
    }

    const consentReference = `FIN-CONSENT-${crypto.randomUUID()}`;
    await connection.query(
      `INSERT INTO pl_partner_application_consents
       (client_id, application_id, consent_id, consent_reference, source_consent_reference, consent_type,
        consent_template_id, consent_version, consent_text_hash, accepted_at,
        ip_address, user_agent_hash, recorded_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        clientId,
        application.id,
        payload.consentId,
        consentReference,
        payload.consentReference,
        payload.consentType,
        payload.consentTemplateId,
        payload.consentVersion,
        payload.consentTextHash,
        new Date(payload.acceptedAt),
        payload.ipAddress,
        payload.userAgentHash,
      ],
    );

    await connection.query(
      `UPDATE pl_partner_applications
       SET status = CASE WHEN status = 'CREATED' THEN 'CONSENT_RECORDED' ELSE status END, updated_at = NOW()
       WHERE id = ?`,
      [application.id],
    );

    await connection.commit();
    transactionStarted = false;

    return {
      statusCode: 201,
      data: {
        consentReference,
        status: "RECORDED",
        recordedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    if (transactionStarted) {
      try {
        await connection.rollback();
      } catch {}
    }
    throw error;
  } finally {
    connection.release();
  }
}

async function updateDetails({ clientId, partnerApplicationId, payload }) {
  const connection = await db.promise().getConnection();
  let transactionStarted = false;

  try {
    await connection.beginTransaction();
    transactionStarted = true;

    const application = await findApplicationForUpdate(connection, clientId, partnerApplicationId);
    assertApplicationIdentity(application, payload);

    const [consents] = await connection.query(
      `SELECT id
       FROM pl_partner_application_consents
       WHERE client_id = ? AND application_id = ? AND consent_type = 'LENDER_DATA_SHARING'
       LIMIT 1`,
      [clientId, application.id],
    );

    if (!consents.length) {
      throw new PartnerApiError(
        422,
        "CONSENT_REQUIRED",
        "Lender data-sharing consent must be recorded before details submission.",
      );
    }

    const payloadHash = hashRequestBody(payload);
    const [sameVersionRows] = await connection.query(
      `SELECT request_hash, accepted_at
       FROM pl_partner_application_detail_versions
       WHERE application_id = ? AND details_version = ?
       LIMIT 1
       FOR UPDATE`,
      [application.id, payload.detailsVersion],
    );

    if (sameVersionRows.length) {
      if (sameVersionRows[0].request_hash !== payloadHash) {
        throw new PartnerApiError(
          409,
          "DETAILS_VERSION_CONFLICT",
          "The detailsVersion already exists with different content.",
        );
      }

      await connection.commit();
      transactionStarted = false;
      return {
        statusCode: 200,
        data: {
          status: "DETAILS_ACCEPTED",
          detailsVersion: payload.detailsVersion,
          updatedAt: new Date(sameVersionRows[0].accepted_at).toISOString(),
        },
      };
    }

    const [versionRows] = await connection.query(
      `SELECT MAX(details_version) AS maximum_version
       FROM pl_partner_application_detail_versions
       WHERE application_id = ?`,
      [application.id],
    );

    const maximumVersion = Number(versionRows[0]?.maximum_version || 0);
    if (payload.detailsVersion < maximumVersion) {
      throw new PartnerApiError(
        409,
        "STALE_DETAILS_VERSION",
        "An older detailsVersion cannot replace the latest version.",
      );
    }

    await connection.query(
      `INSERT INTO pl_partner_application_detail_versions
       (application_id, details_version, request_hash, details_json, accepted_at, created_at)
       VALUES (?, ?, ?, ?, NOW(), NOW())`,
      [application.id, payload.detailsVersion, payloadHash, JSON.stringify(payload)],
    );

    await connection.query(
      `UPDATE pl_partner_applications
       SET status = CASE
             WHEN status IN ('DOCUMENTS_PARTIALLY_RECEIVED','DOCUMENTS_RECEIVED') THEN status
             ELSE 'DETAILS_ACCEPTED'
           END,
           latest_details_version = ?,
           details_updated_at = NOW(),
           updated_at = NOW()
       WHERE id = ?`,
      [payload.detailsVersion, application.id],
    );

    await connection.commit();
    transactionStarted = false;

    return {
      statusCode: 200,
      data: {
        status: "DETAILS_ACCEPTED",
        detailsVersion: payload.detailsVersion,
        updatedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    if (transactionStarted) {
      try {
        await connection.rollback();
      } catch {}
    }
    throw error;
  } finally {
    connection.release();
  }
}

async function uploadDocument({ clientId, partnerApplicationId, payload }) {
  const prepared = await prepareDocument(payload);
  let applicationId = null;

  const validationConnection = await db.promise().getConnection();
  let validationTransactionStarted = false;

  try {
    await validationConnection.beginTransaction();
    validationTransactionStarted = true;

    const application = await findApplicationForUpdate(
      validationConnection,
      clientId,
      partnerApplicationId,
    );
    applicationId = application.id;
    assertApplicationIdentity(application, payload);

    if (
      ![
        "DETAILS_ACCEPTED",
        "DOCUMENTS_PARTIALLY_RECEIVED",
        "DOCUMENTS_RECEIVED",
      ].includes(application.status)
    ) {
      throw new PartnerApiError(
        422,
        "DETAILS_REQUIRED",
        "Application details must be accepted before document upload.",
      );
    }

    const [existingRows] = await validationConnection.query(
      `SELECT partner_document_id, document_type, file_sha256, received_at
       FROM pl_partner_application_documents
       WHERE application_id = ? AND source_document_id = ? AND document_type = ?
       LIMIT 1
       FOR UPDATE`,
      [application.id, payload.sourceDocumentId, payload.documentType],
    );

    if (existingRows.length) {
      const existing = existingRows[0];
      if (existing.file_sha256 !== prepared.calculatedHash) {
        throw new PartnerApiError(
          409,
          "DOCUMENT_CONFLICT",
          "The source document identifier already exists with different content.",
        );
      }

      await validationConnection.commit();
      validationTransactionStarted = false;
      return {
        statusCode: 200,
        data: {
          partnerDocumentId: existing.partner_document_id,
          documentType: existing.document_type,
          status: "RECEIVED",
          fileSha256: existing.file_sha256,
          receivedAt: new Date(existing.received_at).toISOString(),
        },
      };
    }

    await validationConnection.commit();
    validationTransactionStarted = false;
  } catch (error) {
    if (validationTransactionStarted) {
      try {
        await validationConnection.rollback();
      } catch {}
    }
    throw error;
  } finally {
    validationConnection.release();
  }

  const stored = await persistPreparedDocument({
    partnerApplicationId,
    documentType: payload.documentType,
    prepared,
  });

  const connection = await db.promise().getConnection();
  let transactionStarted = false;

  try {
    await connection.beginTransaction();
    transactionStarted = true;

    const application = await findApplicationForUpdate(connection, clientId, partnerApplicationId);
    assertApplicationIdentity(application, payload);

    if (application.id !== applicationId) {
      throw new PartnerApiError(
        409,
        "APPLICATION_CHANGED",
        "The application changed while the document was being stored.",
      );
    }

    const [existingRows] = await connection.query(
      `SELECT partner_document_id, document_type, file_sha256, received_at
       FROM pl_partner_application_documents
       WHERE application_id = ? AND source_document_id = ? AND document_type = ?
       LIMIT 1
       FOR UPDATE`,
      [application.id, payload.sourceDocumentId, payload.documentType],
    );

    if (existingRows.length) {
      const existing = existingRows[0];
      if (existing.file_sha256 !== prepared.calculatedHash) {
        throw new PartnerApiError(
          409,
          "DOCUMENT_CONFLICT",
          "The source document identifier already exists with different content.",
        );
      }

      await connection.commit();
      transactionStarted = false;
      await removeStoredDocument(stored.absolutePath);
      return {
        statusCode: 200,
        data: {
          partnerDocumentId: existing.partner_document_id,
          documentType: existing.document_type,
          status: "RECEIVED",
          fileSha256: existing.file_sha256,
          receivedAt: new Date(existing.received_at).toISOString(),
        },
      };
    }

    const partnerDocumentId = `FIN-DOC-${crypto.randomUUID()}`;
    await connection.query(
      `INSERT INTO pl_partner_application_documents
       (application_id, partner_document_id, source_document_id, document_type,
        original_file_name, stored_file_name, storage_path, mime_type, file_size,
        file_sha256, source, captured_at, status, received_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'RECEIVED', NOW(), NOW())`,
      [
        application.id,
        partnerDocumentId,
        payload.sourceDocumentId,
        payload.documentType,
        payload.fileName,
        stored.relativePath.split("/").pop(),
        stored.relativePath,
        payload.mimeType,
        payload.fileSize,
        prepared.calculatedHash,
        payload.source,
        new Date(payload.capturedAt),
      ],
    );

    const [documentCounts] = await connection.query(
      `SELECT COUNT(*) AS document_count
       FROM pl_partner_application_documents
       WHERE application_id = ? AND status = 'RECEIVED'`,
      [application.id],
    );

    const applicationStatus =
      Number(documentCounts[0]?.document_count || 0) >= 2
        ? "DOCUMENTS_RECEIVED"
        : "DOCUMENTS_PARTIALLY_RECEIVED";

    await connection.query(
      `UPDATE pl_partner_applications
       SET status = ?, updated_at = NOW()
       WHERE id = ?`,
      [applicationStatus, application.id],
    );

    await connection.commit();
    transactionStarted = false;

    return {
      statusCode: 201,
      data: {
        partnerDocumentId,
        documentType: payload.documentType,
        status: "RECEIVED",
        fileSha256: prepared.calculatedHash,
        receivedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    if (transactionStarted) {
      try {
        await connection.rollback();
      } catch {}
    }
    await removeStoredDocument(stored.absolutePath);
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  createApplication,
  recordConsent,
  updateDetails,
  uploadDocument,
};
