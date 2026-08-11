const crypto = require("crypto");
const db = require("../../../config/db");
const { PartnerApiError } = require("../utils/partnerApiError");
const { hashRequestBody } = require("../utils/security");
const {
  prepareDocument,
  persistPreparedDocument,
  removeStoredDocument,
} = require("./documentStorageService");
const { approveAndInitiatePayout } = require("../../../services/payout.service");

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

// async function updateDetails({ clientId, partnerApplicationId, payload }) {
//   const connection = await db.promise().getConnection();
//   let transactionStarted = false;

//   try {
//     await connection.beginTransaction();
//     transactionStarted = true;

//     const application = await findApplicationForUpdate(connection, clientId, partnerApplicationId);
//     assertApplicationIdentity(application, payload);

//     const [consents] = await connection.query(
//       `SELECT id
//        FROM pl_partner_application_consents
//        WHERE client_id = ? AND application_id = ? AND consent_type = 'LENDER_DATA_SHARING'
//        LIMIT 1`,
//       [clientId, application.id],
//     );

//     if (!consents.length) {
//       throw new PartnerApiError(
//         422,
//         "CONSENT_REQUIRED",
//         "Lender data-sharing consent must be recorded before details submission.",
//       );
//     }

//     const payloadHash = hashRequestBody(payload);
//     const [sameVersionRows] = await connection.query(
//       `SELECT request_hash, accepted_at
//        FROM pl_partner_application_detail_versions
//        WHERE application_id = ? AND details_version = ?
//        LIMIT 1
//        FOR UPDATE`,
//       [application.id, payload.detailsVersion],
//     );

//     if (sameVersionRows.length) {
//       if (sameVersionRows[0].request_hash !== payloadHash) {
//         throw new PartnerApiError(
//           409,
//           "DETAILS_VERSION_CONFLICT",
//           "The detailsVersion already exists with different content.",
//         );
//       }

//       await connection.commit();
//       transactionStarted = false;
//       return {
//         statusCode: 200,
//         data: {
//           status: "DETAILS_ACCEPTED",
//           detailsVersion: payload.detailsVersion,
//           updatedAt: new Date(sameVersionRows[0].accepted_at).toISOString(),
//         },
//       };
//     }

//     const [versionRows] = await connection.query(
//       `SELECT MAX(details_version) AS maximum_version
//        FROM pl_partner_application_detail_versions
//        WHERE application_id = ?`,
//       [application.id],
//     );

//     const maximumVersion = Number(versionRows[0]?.maximum_version || 0);
//     if (payload.detailsVersion < maximumVersion) {
//       throw new PartnerApiError(
//         409,
//         "STALE_DETAILS_VERSION",
//         "An older detailsVersion cannot replace the latest version.",
//       );
//     }

//     // Flatten payload into individual columns for easier querying and reporting
//     const cust = payload.customer || {};
//     const emp = payload.employment || {};
//     const aad = payload.aadhaarKyc || {};
//     const perm = payload.permanentAddress || {};
//     const curr = payload.currentAddress || {};
//     const ev = payload.currentAddressEvidence || {};

//     await connection.query(
//       `INSERT INTO pl_partner_application_detail_versions
//        (
//          application_id, details_version, request_hash,
//          customer_full_name, customer_first_name, customer_middle_name, customer_last_name, customer_father_name,
//          customer_pan_number, customer_date_of_birth, customer_gender, customer_mobile_number, customer_email,
//          employment_employment_type, employment_company_type, employment_company_name, employment_designation,
//          employment_business_name, employment_business_constitution, employment_monthly_income, employment_annual_turnover,
//          employment_employment_vintage, employment_business_vintage, employment_salary_mode, employment_completed_at,
//          aadhaar_status, aadhaar_masked, aadhaar_verified_name, aadhaar_date_of_birth, aadhaar_gender, aadhaar_provider,
//          aadhaar_provider_reference, aadhaar_verified_at,
//          perm_address_line1, perm_address_line2, perm_landmark, perm_locality, perm_district, perm_city, perm_state, perm_country, perm_pincode, perm_source,
//          curr_same_as_perm, curr_address_line1, curr_address_line2, curr_landmark, curr_locality, curr_district, curr_city, curr_state, curr_country, curr_pincode, curr_source,
//          evidence_live_photo_document_reference, liveness_provider, liveness_reference, liveness_status, liveness_score,
//          evidence_reference, evidence_latitude, evidence_longitude, evidence_captured_at, evidence_verified_at,
//          details_json, accepted_at, created_at
//        )
//        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
//       [
//         application.id,
//         payload.detailsVersion,
//         payloadHash,

//         cust.fullName || null,
//         cust.firstName || null,
//         cust.middleName || null,
//         cust.lastName || null,
//         cust.fatherName || null,

//         cust.panNumber || null,
//         cust.dateOfBirth ? new Date(cust.dateOfBirth) : null,
//         cust.gender || null,
//         cust.mobileNumber || null,
//         cust.email || null,

//         emp.employmentType || null,
//         emp.companyType || null,
//         emp.companyName || null,
//         emp.designation || null,

//         emp.businessName || null,
//         emp.businessConstitution || null,
//         emp.monthlyIncome != null ? emp.monthlyIncome : null,
//         emp.annualTurnover != null ? emp.annualTurnover : null,

//         emp.employmentVintage != null ? emp.employmentVintage : null,
//         emp.businessVintage != null ? emp.businessVintage : null,
//         emp.salaryMode || null,
//         emp.completedAt ? new Date(emp.completedAt) : null,

//         aad.status || null,
//         aad.maskedAadhaar || null,
//         aad.verifiedName || null,
//         aad.dateOfBirth ? new Date(aad.dateOfBirth) : null,
//         aad.gender || null,
//         aad.provider || null,

//         aad.providerReference || null,
//         aad.verifiedAt ? new Date(aad.verifiedAt) : null,

//         perm.addressLine1 || null,
//         perm.addressLine2 || null,
//         perm.landmark || null,
//         perm.locality || null,
//         perm.district || null,
//         perm.city || null,
//         perm.state || null,
//         perm.country || null,
//         perm.pincode || null,
//         perm.source || null,

//         curr.sameAsPermanent ? 1 : 0,
//         curr.addressLine1 || null,
//         curr.addressLine2 || null,
//         curr.landmark || null,
//         curr.locality || null,
//         curr.district || null,
//         curr.city || null,
//         curr.state || null,
//         curr.country || null,
//         curr.pincode || null,
//         curr.source || null,

//         ev.livePhotoDocumentReference || null,
//         ev.livenessProvider || null,
//         ev.livenessReference || null,
//         ev.livenessStatus || null,
//         ev.livenessScore != null ? Number(ev.livenessScore) : null,

//         ev.evidenceReference || null,
//         ev.latitude != null ? Number(ev.latitude) : null,
//         ev.longitude != null ? Number(ev.longitude) : null,
//         ev.capturedAt ? new Date(ev.capturedAt) : null,
//         ev.verifiedAt ? new Date(ev.verifiedAt) : null,

//         JSON.stringify(payload),
//       ],
//     );

//     // Also persist key fields on the main application row for quick access
//     await connection.query(
//       `UPDATE pl_partner_applications
//        SET
//          customer_full_name = ?,
//          customer_first_name = ?,
//          customer_middle_name = ?,
//          customer_last_name = ?,
//          customer_father_name = ?,
//          pan_number = ?,
//          date_of_birth = ?,
//          gender = ?,
//          mobile_number = ?,
//          email = ?,

//          employment_employment_type = ?,
//          employment_company_type = ?,
//          employment_company_name = ?,
//          employment_designation = ?,
//          employment_business_name = ?,
//          employment_business_constitution = ?,
//          employment_monthly_income = ?,
//          employment_annual_turnover = ?,
//          employment_employment_vintage = ?,
//          employment_business_vintage = ?,
//          employment_salary_mode = ?,
//          employment_completed_at = ?,

//          aadhaar_status = ?,
//          aadhaar_masked = ?,
//          aadhaar_verified_name = ?,
//          aadhaar_date_of_birth = ?,
//          aadhaar_gender = ?,
//          aadhaar_provider = ?,
//          aadhaar_provider_reference = ?,
//          aadhaar_verified_at = ?,

//          perm_address_line1 = ?,
//          perm_address_line2 = ?,
//          perm_landmark = ?,
//          perm_locality = ?,
//          perm_district = ?,
//          perm_city = ?,
//          perm_state = ?,
//          perm_country = ?,
//          perm_pincode = ?,
//          perm_source = ?,

//          curr_same_as_perm = ?,
//          curr_address_line1 = ?,
//          curr_address_line2 = ?,
//          curr_landmark = ?,
//          curr_locality = ?,
//          curr_district = ?,
//          curr_city = ?,
//          curr_state = ?,
//          curr_country = ?,
//          curr_pincode = ?,
//          curr_source = ?,

//          evidence_live_photo_document_reference = ?,
//          liveness_provider = ?,
//          liveness_reference = ?,
//          liveness_status = ?,
//          liveness_score = ?,
//          evidence_reference = ?,
//          evidence_latitude = ?,
//          evidence_longitude = ?,
//          evidence_captured_at = ?,
//          evidence_verified_at = ?,

//          latest_details_version = ?,
//          details_updated_at = NOW(),
//          updated_at = NOW()
//        WHERE id = ?`,
//       [
//         cust.fullName || null,
//         cust.firstName || null,
//         cust.middleName || null,
//         cust.lastName || null,
//         cust.fatherName || null,
//         cust.panNumber || null,
//         cust.dateOfBirth ? new Date(cust.dateOfBirth) : null,
//         cust.gender || null,
//         cust.mobileNumber || null,
//         cust.email || null,

//         emp.employmentType || null,
//         emp.companyType || null,
//         emp.companyName || null,
//         emp.designation || null,
//         emp.businessName || null,
//         emp.businessConstitution || null,
//         emp.monthlyIncome != null ? emp.monthlyIncome : null,
//         emp.annualTurnover != null ? emp.annualTurnover : null,
//         emp.employmentVintage != null ? emp.employmentVintage : null,
//         emp.businessVintage != null ? emp.businessVintage : null,
//         emp.salaryMode || null,
//         emp.completedAt ? new Date(emp.completedAt) : null,

//         aad.status || null,
//         aad.maskedAadhaar || null,
//         aad.verifiedName || null,
//         aad.dateOfBirth ? new Date(aad.dateOfBirth) : null,
//         aad.gender || null,
//         aad.provider || null,
//         aad.providerReference || null,
//         aad.verifiedAt ? new Date(aad.verifiedAt) : null,

//         perm.addressLine1 || null,
//         perm.addressLine2 || null,
//         perm.landmark || null,
//         perm.locality || null,
//         perm.district || null,
//         perm.city || null,
//         perm.state || null,
//         perm.country || null,
//         perm.pincode || null,
//         perm.source || null,

//         curr.sameAsPermanent ? 1 : 0,
//         curr.addressLine1 || null,
//         curr.addressLine2 || null,
//         curr.landmark || null,
//         curr.locality || null,
//         curr.district || null,
//         curr.city || null,
//         curr.state || null,
//         curr.country || null,
//         curr.pincode || null,
//         curr.source || null,

//         ev.livePhotoDocumentReference || null,
//         ev.livenessProvider || null,
//         ev.livenessReference || null,
//         ev.livenessStatus || null,
//         ev.livenessScore != null ? Number(ev.livenessScore) : null,
//         ev.evidenceReference || null,
//         ev.latitude != null ? Number(ev.latitude) : null,
//         ev.longitude != null ? Number(ev.longitude) : null,
//         ev.capturedAt ? new Date(ev.capturedAt) : null,
//         ev.verifiedAt ? new Date(ev.verifiedAt) : null,

//         payload.detailsVersion,
//         application.id,
//       ],
//     );

//     await connection.query(
//       `UPDATE pl_partner_applications
//        SET status = CASE
//              WHEN status IN ('DOCUMENTS_PARTIALLY_RECEIVED','DOCUMENTS_RECEIVED') THEN status
//              ELSE 'DETAILS_ACCEPTED'
//            END,
//            latest_details_version = ?,
//            details_updated_at = NOW(),
//            updated_at = NOW()
//        WHERE id = ?`,
//       [payload.detailsVersion, application.id],
//     );

//     await connection.commit();
//     transactionStarted = false;

//     return {
//       statusCode: 200,
//       data: {
//         status: "DETAILS_ACCEPTED",
//         detailsVersion: payload.detailsVersion,
//         updatedAt: new Date().toISOString(),
//       },
//     };
//   } catch (error) {
//     if (transactionStarted) {
//       try {
//         await connection.rollback();
//       } catch {}
//     }
//     throw error;
//   } finally {
//     connection.release();
//   }
// }

async function updateDetails({
  clientId,
  partnerApplicationId,
  payload,
}) {
  const connection = await db.promise().getConnection();
  let transactionStarted = false;

  try {
    await connection.beginTransaction();
    transactionStarted = true;

    const application =
      await findApplicationForUpdate(
        connection,
        clientId,
        partnerApplicationId,
      );

    assertApplicationIdentity(application, payload);

    const [consents] = await connection.query(
      `SELECT id
       FROM pl_partner_application_consents
       WHERE client_id = ?
         AND application_id = ?
         AND consent_type = 'LENDER_DATA_SHARING'
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

    const [sameVersionRows] =
      await connection.query(
        `SELECT request_hash,
                accepted_at
         FROM pl_partner_application_detail_versions
         WHERE application_id = ?
           AND details_version = ?
         LIMIT 1
         FOR UPDATE`,
        [
          application.id,
          payload.detailsVersion,
        ],
      );

    if (sameVersionRows.length) {
      if (
        sameVersionRows[0].request_hash !==
        payloadHash
      ) {
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
          detailsVersion:
            payload.detailsVersion,
          updatedAt: new Date(
            sameVersionRows[0].accepted_at,
          ).toISOString(),
        },
      };
    }

    const [versionRows] = await connection.query(
      `SELECT MAX(details_version) AS maximum_version
       FROM pl_partner_application_detail_versions
       WHERE application_id = ?`,
      [application.id],
    );

    const maximumVersion = Number(
      versionRows[0]?.maximum_version || 0,
    );

    if (
      payload.detailsVersion < maximumVersion
    ) {
      throw new PartnerApiError(
        409,
        "STALE_DETAILS_VERSION",
        "An older detailsVersion cannot replace the latest version.",
      );
    }

    const cust = payload.customer || {};
    const emp = payload.employment || {};
    const aad = payload.aadhaarKyc || {};
    const perm =
      payload.permanentAddress || {};
    const curr =
      payload.currentAddress || {};
    const ev =
      payload.currentAddressEvidence || {};

    /*
     * There are 65 dynamic values in this array.
     * The SQL below generates exactly 65 question-mark
     * placeholders from this array.
     *
     * accepted_at and created_at are populated using NOW().
     */
    const detailValues = [
      application.id,
      payload.detailsVersion,
      payloadHash,

      cust.fullName || null,
      cust.firstName || null,
      cust.middleName || null,
      cust.lastName || null,
      cust.fatherName || null,

      cust.panNumber || null,
      cust.dateOfBirth
        ? new Date(cust.dateOfBirth)
        : null,
      cust.gender || null,
      cust.mobileNumber || null,
      cust.email || null,

      emp.employmentType || null,
      emp.companyType || null,
      emp.companyName || null,
      emp.designation || null,

      emp.businessName || null,
      emp.businessConstitution || null,
      emp.monthlyIncome != null
        ? emp.monthlyIncome
        : null,
      emp.annualTurnover != null
        ? emp.annualTurnover
        : null,

      emp.employmentVintage != null
        ? emp.employmentVintage
        : null,
      emp.businessVintage != null
        ? emp.businessVintage
        : null,
      emp.salaryMode || null,
      emp.completedAt
        ? new Date(emp.completedAt)
        : null,

      aad.status || null,
      aad.maskedAadhaar || null,
      aad.verifiedName || null,
      aad.dateOfBirth
        ? new Date(aad.dateOfBirth)
        : null,
      aad.gender || null,
      aad.provider || null,
      aad.providerReference || null,
      aad.verifiedAt
        ? new Date(aad.verifiedAt)
        : null,

      perm.addressLine1 || null,
      perm.addressLine2 || null,
      perm.landmark || null,
      perm.locality || null,
      perm.district || null,
      perm.city || null,
      perm.state || null,
      perm.country || null,
      perm.pincode || null,
      perm.source || null,

      curr.sameAsPermanent ? 1 : 0,
      curr.addressLine1 || null,
      curr.addressLine2 || null,
      curr.landmark || null,
      curr.locality || null,
      curr.district || null,
      curr.city || null,
      curr.state || null,
      curr.country || null,
      curr.pincode || null,
      curr.source || null,

      ev.livePhotoDocumentReference || null,
      ev.livenessProvider || null,
      ev.livenessReference || null,
      ev.livenessStatus || null,
      ev.livenessScore != null
        ? Number(ev.livenessScore)
        : null,

      ev.evidenceReference || null,
      ev.latitude != null
        ? Number(ev.latitude)
        : null,
      ev.longitude != null
        ? Number(ev.longitude)
        : null,
      ev.capturedAt
        ? new Date(ev.capturedAt)
        : null,
      ev.verifiedAt
        ? new Date(ev.verifiedAt)
        : null,

      JSON.stringify(payload),
    ];

    const detailPlaceholders = detailValues
      .map(() => "?")
      .join(", ");

    await connection.query(
      `INSERT INTO pl_partner_application_detail_versions
       (
         application_id,
         details_version,
         request_hash,

         customer_full_name,
         customer_first_name,
         customer_middle_name,
         customer_last_name,
         customer_father_name,

         customer_pan_number,
         customer_date_of_birth,
         customer_gender,
         customer_mobile_number,
         customer_email,

         employment_employment_type,
         employment_company_type,
         employment_company_name,
         employment_designation,
         employment_business_name,
         employment_business_constitution,
         employment_monthly_income,
         employment_annual_turnover,
         employment_employment_vintage,
         employment_business_vintage,
         employment_salary_mode,
         employment_completed_at,

         aadhaar_status,
         aadhaar_masked,
         aadhaar_verified_name,
         aadhaar_date_of_birth,
         aadhaar_gender,
         aadhaar_provider,
         aadhaar_provider_reference,
         aadhaar_verified_at,

         perm_address_line1,
         perm_address_line2,
         perm_landmark,
         perm_locality,
         perm_district,
         perm_city,
         perm_state,
         perm_country,
         perm_pincode,
         perm_source,

         curr_same_as_perm,
         curr_address_line1,
         curr_address_line2,
         curr_landmark,
         curr_locality,
         curr_district,
         curr_city,
         curr_state,
         curr_country,
         curr_pincode,
         curr_source,

         evidence_live_photo_document_reference,
         liveness_provider,
         liveness_reference,
         liveness_status,
         liveness_score,

         evidence_reference,
         evidence_latitude,
         evidence_longitude,
         evidence_captured_at,
         evidence_verified_at,

         details_json,
         accepted_at,
         created_at
       )
       VALUES (
         ${detailPlaceholders},
         NOW(),
         NOW()
       )`,
      detailValues,
    );

    await connection.query(
      `UPDATE pl_partner_applications
       SET
         customer_full_name = ?,
         customer_first_name = ?,
         customer_middle_name = ?,
         customer_last_name = ?,
         customer_father_name = ?,
         pan_number = ?,
         date_of_birth = ?,
         gender = ?,
         mobile_number = ?,
         email = ?,

         employment_employment_type = ?,
         employment_company_type = ?,
         employment_company_name = ?,
         employment_designation = ?,
         employment_business_name = ?,
         employment_business_constitution = ?,
         employment_monthly_income = ?,
         employment_annual_turnover = ?,
         employment_employment_vintage = ?,
         employment_business_vintage = ?,
         employment_salary_mode = ?,
         employment_completed_at = ?,

         aadhaar_status = ?,
         aadhaar_masked = ?,
         aadhaar_verified_name = ?,
         aadhaar_date_of_birth = ?,
         aadhaar_gender = ?,
         aadhaar_provider = ?,
         aadhaar_provider_reference = ?,
         aadhaar_verified_at = ?,

         perm_address_line1 = ?,
         perm_address_line2 = ?,
         perm_landmark = ?,
         perm_locality = ?,
         perm_district = ?,
         perm_city = ?,
         perm_state = ?,
         perm_country = ?,
         perm_pincode = ?,
         perm_source = ?,

         curr_same_as_perm = ?,
         curr_address_line1 = ?,
         curr_address_line2 = ?,
         curr_landmark = ?,
         curr_locality = ?,
         curr_district = ?,
         curr_city = ?,
         curr_state = ?,
         curr_country = ?,
         curr_pincode = ?,
         curr_source = ?,

         evidence_live_photo_document_reference = ?,
         liveness_provider = ?,
         liveness_reference = ?,
         liveness_status = ?,
         liveness_score = ?,
         evidence_reference = ?,
         evidence_latitude = ?,
         evidence_longitude = ?,
         evidence_captured_at = ?,
         evidence_verified_at = ?,

         latest_details_version = ?,
         details_updated_at = NOW(),
         updated_at = NOW()
       WHERE id = ?`,
      [
        cust.fullName || null,
        cust.firstName || null,
        cust.middleName || null,
        cust.lastName || null,
        cust.fatherName || null,
        cust.panNumber || null,
        cust.dateOfBirth
          ? new Date(cust.dateOfBirth)
          : null,
        cust.gender || null,
        cust.mobileNumber || null,
        cust.email || null,

        emp.employmentType || null,
        emp.companyType || null,
        emp.companyName || null,
        emp.designation || null,
        emp.businessName || null,
        emp.businessConstitution || null,
        emp.monthlyIncome != null
          ? emp.monthlyIncome
          : null,
        emp.annualTurnover != null
          ? emp.annualTurnover
          : null,
        emp.employmentVintage != null
          ? emp.employmentVintage
          : null,
        emp.businessVintage != null
          ? emp.businessVintage
          : null,
        emp.salaryMode || null,
        emp.completedAt
          ? new Date(emp.completedAt)
          : null,

        aad.status || null,
        aad.maskedAadhaar || null,
        aad.verifiedName || null,
        aad.dateOfBirth
          ? new Date(aad.dateOfBirth)
          : null,
        aad.gender || null,
        aad.provider || null,
        aad.providerReference || null,
        aad.verifiedAt
          ? new Date(aad.verifiedAt)
          : null,

        perm.addressLine1 || null,
        perm.addressLine2 || null,
        perm.landmark || null,
        perm.locality || null,
        perm.district || null,
        perm.city || null,
        perm.state || null,
        perm.country || null,
        perm.pincode || null,
        perm.source || null,

        curr.sameAsPermanent ? 1 : 0,
        curr.addressLine1 || null,
        curr.addressLine2 || null,
        curr.landmark || null,
        curr.locality || null,
        curr.district || null,
        curr.city || null,
        curr.state || null,
        curr.country || null,
        curr.pincode || null,
        curr.source || null,

        ev.livePhotoDocumentReference || null,
        ev.livenessProvider || null,
        ev.livenessReference || null,
        ev.livenessStatus || null,
        ev.livenessScore != null
          ? Number(ev.livenessScore)
          : null,
        ev.evidenceReference || null,
        ev.latitude != null
          ? Number(ev.latitude)
          : null,
        ev.longitude != null
          ? Number(ev.longitude)
          : null,
        ev.capturedAt
          ? new Date(ev.capturedAt)
          : null,
        ev.verifiedAt
          ? new Date(ev.verifiedAt)
          : null,

        payload.detailsVersion,
        application.id,
      ],
    );

    await connection.query(
      `UPDATE pl_partner_applications
       SET status = CASE
         WHEN status IN (
           'DOCUMENTS_PARTIALLY_RECEIVED',
           'DOCUMENTS_RECEIVED'
         )
           THEN status
         ELSE 'DETAILS_ACCEPTED'
       END,
       latest_details_version = ?,
       details_updated_at = NOW(),
       updated_at = NOW()
       WHERE id = ?`,
      [
        payload.detailsVersion,
        application.id,
      ],
    );

    await connection.commit();
    transactionStarted = false;

    return {
      statusCode: 200,
      data: {
        status: "DETAILS_ACCEPTED",
        detailsVersion:
          payload.detailsVersion,
        updatedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    if (transactionStarted) {
      try {
        await connection.rollback();
      } catch {
        // Ignore rollback errors.
      }
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

async function approveApplication({ clientId, partnerApplicationId, payload }) {
  // Minimal stub: validate application exists and return a fixed Approved response
  const connection = await db.promise().getConnection();
  try {
    const [rows] = await connection.query(
      `SELECT id FROM pl_partner_applications WHERE client_id = ? AND partner_application_id = ? LIMIT 1`,
      [clientId, partnerApplicationId],
    );

    if (!rows.length) {
      throw new PartnerApiError(404, "APPLICATION_NOT_FOUND", "Partner application was not found.");
    }

    return {
      statusCode: 200,
      data: {
        status: "Approved",
        CREDIT_LIMIT_CHECK_RPM: {
          derived_values: {
            LIMIT_ASSIGNMENT_IS_NEW_CUSTOMER_RPM: 8000,
            LIMIT_ASSIGNMENT_IS_REPEAT_CUSTOMER_RPM: 0,
          },
        },
      },
    };
  } finally {
    connection.release();
  }
}

async function disburseApplication({ clientId, partnerApplicationId, payload }) {
  const connection = await db.promise().getConnection();
  try {
    const application = await findApplicationForUpdate(connection, clientId, partnerApplicationId);
    assertApplicationIdentity(application, payload);

    if (!payload.triggerFund) {
      throw new PartnerApiError(
        400,
        "VALIDATION_ERROR",
        "trigger_fund must be true.",
      );
    }

    const disbursalReference = `DISB-${crypto.randomUUID()}`;

    approveAndInitiatePayout({
      lan: application.lan,
      table: "pl_partner_applications",
    }).catch((payoutError) => {
      console.error("Partner application payout initiation failed:", {
        partnerApplicationId,
        lan: application.lan,
        message: payoutError.message,
      });
    });

    return {
      statusCode: 200,
      data: {
        status: "ACCEPTED",
        disbursalReference,
      },
    };
  } finally {
    connection.release();
  }
}

module.exports = {
  createApplication,
  recordConsent,
  updateDetails,
  uploadDocument,
  approveApplication,
  disburseApplication,
};
