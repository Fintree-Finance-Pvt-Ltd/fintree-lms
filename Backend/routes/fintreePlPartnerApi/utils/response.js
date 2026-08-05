const successEnvelope = (data, correlationId) => ({
  success: true,
  data,
  correlationId,
});

const errorEnvelope = (error, correlationId) => ({
  success: false,
  error: {
    code: error.code || "INTERNAL_ERROR",
    message: error.message || "An unexpected error occurred.",
    ...(error.details ? { details: error.details } : {}),
  },
  correlationId,
});

module.exports = { successEnvelope, errorEnvelope };
