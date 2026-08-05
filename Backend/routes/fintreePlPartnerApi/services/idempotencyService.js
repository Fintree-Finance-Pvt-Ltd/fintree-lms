const crypto = require("crypto");
const db = require("../../../config/db");
const { PartnerApiError } = require("../utils/partnerApiError");
const { safeJsonParse } = require("../utils/security");

const PROCESSING_LEASE_SECONDS = Number(
  process.env.PL_PARTNER_IDEMPOTENCY_LEASE_SECONDS || 120,
);

async function reserveRequest({
  clientId,
  idempotencyKey,
  method,
  endpoint,
  requestHash,
}) {
  const connection = await db.promise().getConnection();
  const lockToken = crypto.randomUUID();
  const leaseSeconds =
    Number.isFinite(PROCESSING_LEASE_SECONDS) && PROCESSING_LEASE_SECONDS > 0
      ? PROCESSING_LEASE_SECONDS
      : 120;
  const lockedUntilValue = new Date(Date.now() + leaseSeconds * 1000);

  try {
    await connection.beginTransaction();

    const [rows] = await connection.query(
      `SELECT id, request_method, endpoint, request_hash, processing_status,
              response_status, response_body, locked_until
       FROM pl_partner_idempotency_records
       WHERE client_id = ? AND idempotency_key = ?
       LIMIT 1
       FOR UPDATE`,
      [clientId, idempotencyKey],
    );

    if (rows.length) {
      const existing = rows[0];
      const sameRequest =
        existing.request_method === method &&
        existing.endpoint === endpoint &&
        existing.request_hash === requestHash;

      if (!sameRequest) {
        throw new PartnerApiError(
          409,
          "IDEMPOTENCY_KEY_REUSED",
          "The idempotency key was already used with a different request.",
        );
      }

      if (existing.processing_status === "COMPLETED") {
        await connection.commit();
        return {
          replay: true,
          statusCode: existing.response_status,
          body: safeJsonParse(existing.response_body),
        };
      }

      const lockedUntil = existing.locked_until
        ? new Date(existing.locked_until).getTime()
        : 0;

      if (
        existing.processing_status === "PROCESSING" &&
        lockedUntil > Date.now()
      ) {
        throw new PartnerApiError(
          409,
          "REQUEST_IN_PROGRESS",
          "A request with the same idempotency key is still being processed.",
        );
      }

      await connection.query(
        `UPDATE pl_partner_idempotency_records
         SET processing_status = 'PROCESSING',
             response_status = NULL,
             response_body = NULL,
             lock_token = ?,
             locked_until = ?,
             updated_at = NOW()
         WHERE id = ?`,
        [lockToken, lockedUntilValue, existing.id],
      );

      await connection.commit();
      return { replay: false, recordId: existing.id, lockToken };
    }

    const [insertResult] = await connection.query(
      `INSERT INTO pl_partner_idempotency_records
       (client_id, idempotency_key, request_method, endpoint, request_hash,
        processing_status, lock_token, locked_until, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'PROCESSING', ?, ?, NOW(), NOW())`,
      [
        clientId,
        idempotencyKey,
        method,
        endpoint,
        requestHash,
        lockToken,
        lockedUntilValue,
      ],
    );

    await connection.commit();
    return { replay: false, recordId: insertResult.insertId, lockToken };
  } catch (error) {
    try {
      await connection.rollback();
    } catch {}

    if (error?.code === "ER_DUP_ENTRY") {
      throw new PartnerApiError(
        409,
        "REQUEST_IN_PROGRESS",
        "A request with the same idempotency key is already being processed.",
      );
    }

    throw error;
  } finally {
    connection.release();
  }
}

async function completeRequest(recordId, lockToken, statusCode, responseBody) {
  const [result] = await db.promise().query(
    `UPDATE pl_partner_idempotency_records
     SET processing_status = 'COMPLETED',
         response_status = ?,
         response_body = ?,
         lock_token = NULL,
         locked_until = NULL,
         completed_at = NOW(),
         updated_at = NOW()
     WHERE id = ? AND processing_status = 'PROCESSING' AND lock_token = ?`,
    [statusCode, JSON.stringify(responseBody), recordId, lockToken],
  );

  if (result.affectedRows !== 1) {
    throw new PartnerApiError(
      409,
      "IDEMPOTENCY_LEASE_LOST",
      "The idempotency processing lease was lost.",
    );
  }
}

async function failRequest(recordId, lockToken, statusCode, responseBody, retryable) {
  const nextStatus = retryable ? "FAILED" : "COMPLETED";

  await db.promise().query(
    `UPDATE pl_partner_idempotency_records
     SET processing_status = ?,
         response_status = ?,
         response_body = ?,
         lock_token = NULL,
         locked_until = NULL,
         completed_at = CASE WHEN ? = 'COMPLETED' THEN NOW() ELSE completed_at END,
         updated_at = NOW()
     WHERE id = ? AND processing_status = 'PROCESSING' AND lock_token = ?`,
    [nextStatus, statusCode, JSON.stringify(responseBody), nextStatus, recordId, lockToken],
  );
}

module.exports = {
  reserveRequest,
  completeRequest,
  failRequest,
};
