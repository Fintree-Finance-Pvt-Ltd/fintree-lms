const db = require("../../../config/db");

async function writeAudit({
  clientId,
  partnerApplicationId = null,
  endpoint,
  method,
  correlationId,
  idempotencyKey,
  requestHash,
  responseStatus,
  durationMs,
}) {
  try {
    await db.promise().query(
      `INSERT INTO pl_partner_api_audit_logs
       (client_id, partner_application_id, endpoint, request_method,
        correlation_id, idempotency_key, request_hash, response_status,
        duration_ms, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        clientId,
        partnerApplicationId,
        endpoint,
        method,
        correlationId,
        idempotencyKey,
        requestHash,
        responseStatus,
        durationMs,
      ],
    );
  } catch (error) {
    console.error("Partner API audit write failed:", {
      code: error.code || null,
      message: error.message,
      correlationId,
    });
  }
}

module.exports = { writeAudit };
