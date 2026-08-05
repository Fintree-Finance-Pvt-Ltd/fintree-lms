const {
  validateCreatePayload,
  validateConsentPayload,
  validateDetailsPayload,
  validateDocumentPayload,
} = require("../utils/validation");
const { PartnerApiError } = require("../utils/partnerApiError");
const { successEnvelope, errorEnvelope } = require("../utils/response");
const {
  reserveRequest,
  completeRequest,
  failRequest,
} = require("../services/idempotencyService");
const { writeAudit } = require("../services/auditService");
const {
  createApplication,
  recordConsent,
  updateDetails,
  uploadDocument,
} = require("../services/partnerApplicationService");

const normalizeError = (error) => {
  if (error instanceof PartnerApiError) return error;

  console.error("PL partner API request failed:", {
    code: error?.code || null,
    message: error?.message || "Unknown error",
  });

  return new PartnerApiError(
    500,
    "INTERNAL_ERROR",
    "An unexpected error occurred while processing the request.",
  );
};

const execute = ({ validator, service, getPartnerApplicationId }) => async (req, res) => {
  const clientId = req.partner.id;
  const partnerName = req.partner.name;
  const requestContext = req.partnerRequestContext;
  let idempotencyRecordId = null;
  let idempotencyLockToken = null;
  let responseStatus = 500;
  const partnerApplicationId = getPartnerApplicationId
    ? getPartnerApplicationId(req)
    : null;

  try {
    const payload = validator(req.body || {});

    const reservation = await reserveRequest({
      clientId,
      idempotencyKey: requestContext.idempotencyKey,
      method: requestContext.method,
      endpoint: requestContext.normalizedPath,
      requestHash: requestContext.requestHash,
    });

    if (reservation.replay) {
      responseStatus = reservation.statusCode;
      return res.status(reservation.statusCode).json(reservation.body);
    }

    idempotencyRecordId = reservation.recordId;
    idempotencyLockToken = reservation.lockToken;

    const result = await service({
      clientId,
      partnerApplicationId,
      payload,
      correlationId: requestContext.correlationId,
    });

    const body = successEnvelope(result.data, requestContext.correlationId);
    await completeRequest(
      idempotencyRecordId,
      idempotencyLockToken,
      result.statusCode,
      body,
    );

    responseStatus = result.statusCode;
    return res.status(result.statusCode).json(body);
  } catch (rawError) {
    const error = normalizeError(rawError);
    responseStatus = error.statusCode;
    const body = errorEnvelope(error, requestContext?.correlationId || null);

    if (idempotencyRecordId) {
      const retryable = [429, 500, 502, 503, 504].includes(error.statusCode);
      try {
        await failRequest(
          idempotencyRecordId,
          idempotencyLockToken,
          error.statusCode,
          body,
          retryable,
        );
      } catch (idempotencyError) {
        console.error("Failed to finalize partner idempotency record:", {
          code: idempotencyError.code || null,
          message: idempotencyError.message,
          correlationId: requestContext?.correlationId || null,
        });
      }
    }

    return res.status(error.statusCode).json(body);
  } finally {
    if (requestContext && req.partner) {
      await writeAudit({
        clientId,
        partnerApplicationId,
        endpoint: requestContext.normalizedPath,
        method: requestContext.method,
        correlationId: requestContext.correlationId,
        idempotencyKey: requestContext.idempotencyKey,
        requestHash: requestContext.requestHash,
        responseStatus,
        durationMs: Date.now() - requestContext.startedAt,
      });
    }
  }
};

const createApplicationHandler = execute({
  validator: validateCreatePayload,
  service: createApplication,
});

const recordConsentHandler = execute({
  validator: validateConsentPayload,
  service: recordConsent,
  getPartnerApplicationId: (req) => String(req.params.partnerApplicationId || "").trim(),
});

const updateDetailsHandler = execute({
  validator: validateDetailsPayload,
  service: updateDetails,
  getPartnerApplicationId: (req) => String(req.params.partnerApplicationId || "").trim(),
});

const uploadDocumentHandler = execute({
  validator: validateDocumentPayload,
  service: uploadDocument,
  getPartnerApplicationId: (req) => String(req.params.partnerApplicationId || "").trim(),
});

const { validateApprovePayload } = require("../utils/validation");
const { approveApplication } = require("../services/partnerApplicationService");

const approveHandler = execute({
  validator: validateApprovePayload,
  service: approveApplication,
  getPartnerApplicationId: (req) => String(req.params.partnerApplicationId || "").trim(),
});

module.exports = {
  createApplicationHandler,
  recordConsentHandler,
  updateDetailsHandler,
  uploadDocumentHandler,
  approveHandler,
};
