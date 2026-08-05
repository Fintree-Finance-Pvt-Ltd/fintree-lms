const express = require("express");
const verifyApiKey = require("../../middleware/apiKeyAuth");
const requestContext = require("./middleware/requestContext");
const { PartnerApiError } = require("./utils/partnerApiError");
const { errorEnvelope } = require("./utils/response");
const {
  createApplicationHandler,
  recordConsentHandler,
  updateDetailsHandler,
  uploadDocumentHandler,
} = require("./controllers/partnerApplicationController");

const router = express.Router();

router.post(
  "/application",
  verifyApiKey,
  requestContext,
  createApplicationHandler,
);

router.post(
  "/applications/:partnerApplicationId/consent",
  verifyApiKey,
  requestContext,
  recordConsentHandler,
);

router.put(
  "/applications/:partnerApplicationId/profile",
  verifyApiKey,
  requestContext,
  updateDetailsHandler,
);

router.post(
  "/applications/:partnerApplicationId/docs",
  verifyApiKey,
  requestContext,
  uploadDocumentHandler,
);

router.use((error, req, res, _next) => {
  const normalizedError =
    error instanceof PartnerApiError
      ? error
      : new PartnerApiError(
          500,
          "INTERNAL_ERROR",
          "An unexpected error occurred.",
        );

  const correlationId =
    req.partnerRequestContext?.correlationId || null;

  return res
    .status(normalizedError.statusCode)
    .json(
      errorEnvelope(
        normalizedError,
        correlationId,
      ),
    );
});

module.exports = router;
