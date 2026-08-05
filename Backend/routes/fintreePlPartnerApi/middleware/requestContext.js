const {
  requireCorrelationId,
  requireIdempotencyKey,
  hashRequestBody,
} = require("../utils/security");

const requestContext = (req, _res, next) => {
  try {
    req.partnerRequestContext = {
      correlationId: requireCorrelationId(req),
      idempotencyKey: requireIdempotencyKey(req),
      requestHash: hashRequestBody(req.body),
      method: req.method.toUpperCase(),
      endpoint: req.originalUrl.split("?")[0],
      normalizedPath: req.originalUrl.split("?")[0],
      startedAt: Date.now(),
    };
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = requestContext;
