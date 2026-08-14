// services/easebuzz/easebuzzMandateRepository.js

const crypto = require("crypto");
const db = require("../../config/db");

const {
  MANDATE_STATUSES,
  MANDATE_EVENT_TYPES,
} = require("./easebuzzConstants");

const {
  sanitizeEasebuzzData,
} = require("./easebuzzClient");

function clean(value) {
  return String(value ?? "").trim();
}

function nullable(value) {
  const normalized = clean(value);
  return normalized === "" ? null : normalized;
}

function safeJson(value) {
  try {
    return JSON.stringify(value ?? {});
  } catch (_) {
    return JSON.stringify({
      serializationError: true,
    });
  }
}

function getExecutor(connection = null) {
  return connection || db.promise();
}

async function withTransaction(callback) {
  const connection =
    await db.promise().getConnection();

  try {
    await connection.beginTransaction();

    const result =
      await callback(connection);

    await connection.commit();

    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Prevent two simultaneous mandate-link requests for the same LAN.
 */
async function withLanInitiationLock(
  lan,
  callback,
) {
  const connection =
    await db.promise().getConnection();

  const normalizedLan = clean(lan);

  const lockHash = crypto
    .createHash("sha256")
    .update(normalizedLan, "utf8")
    .digest("hex")
    .slice(0, 48);

  const lockName =
    `easebuzz_easycollect_${lockHash}`;

  let lockAcquired = false;

  try {
    const [[row]] =
      await connection.query(
        `SELECT GET_LOCK(?, 10) AS acquired`,
        [lockName],
      );

    lockAcquired =
      Number(row?.acquired) === 1;

    if (!lockAcquired) {
      const error = new Error(
        "Another Easebuzz mandate request is already being processed for this LAN",
      );

      error.code =
        "EASEBUZZ_MANDATE_LOCK_UNAVAILABLE";

      error.statusCode = 409;

      throw error;
    }

    return await callback();
  } finally {
    if (lockAcquired) {
      try {
        await connection.query(
          `SELECT RELEASE_LOCK(?) AS released`,
          [lockName],
        );
      } catch (releaseError) {
        console.error(
          "Unable to release Easebuzz LAN lock",
          {
            lan: normalizedLan,
            message:
              releaseError.message,
          },
        );
      }
    }

    connection.release();
  }
}

function createEventHash({
  transactionId,
  eventType,
  providerEventId = "",
  payload = {},
}) {
  const source = [
    clean(transactionId),
    clean(eventType),
    clean(providerEventId),
    safeJson(payload),
  ].join("|");

  return crypto
    .createHash("sha256")
    .update(source, "utf8")
    .digest("hex");
}

async function insertEvent(
  {
    mandateId,
    lan,
    transactionId,
    eventType,
    eventSource = "SYSTEM",
    providerEventId = null,
    httpStatus = null,
    providerStatus = null,
    signatureVerified = null,
    payload = {},
  },
  connection = null,
) {
  const executor =
    getExecutor(connection);

  const sanitizedPayload =
    sanitizeEasebuzzData(
      payload ?? {},
    );

  const eventHash =
    createEventHash({
      transactionId,
      eventType,
      providerEventId,
      payload: sanitizedPayload,
    });

  const [result] =
    await executor.query(
      `INSERT INTO easebuzz_mandate_events
       (
         mandate_id,
         lan,
         transaction_id,
         event_type,
         event_source,
         provider_event_id,
         event_hash,
         http_status,
         provider_status,
         signature_verified,
         payload
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         id = LAST_INSERT_ID(id)`,
      [
        mandateId,
        lan,
        transactionId,
        eventType,
        eventSource,
        nullable(providerEventId),
        eventHash,
        httpStatus ?? null,
        nullable(providerStatus),

        signatureVerified === null ||
        signatureVerified === undefined
          ? null
          : signatureVerified
            ? 1
            : 0,

        safeJson(sanitizedPayload),
      ],
    );

  return {
    id: result.insertId,
    eventHash,

    duplicate:
      Number(result.affectedRows) !== 1,
  };
}

async function findById(
  id,
  connection = null,
) {
  const executor =
    getExecutor(connection);

  const [rows] =
    await executor.query(
      `SELECT *
       FROM easebuzz_mandates
       WHERE id = ?
       LIMIT 1`,
      [id],
    );

  return rows[0] || null;
}

async function findByTransactionId(
  transactionId,
  connection = null,
) {
  const executor =
    getExecutor(connection);

  const [rows] =
    await executor.query(
      `SELECT *
       FROM easebuzz_mandates
       WHERE transaction_id = ?
       LIMIT 1`,
      [transactionId],
    );

  return rows[0] || null;
}

async function findWebhookTargetForUpdate(
  {
    transactionId = null,
    easycollectLinkId = null,
    easebuzzMandateId = null,
    easebuzzRequestId = null,
    lan = null,
  } = {},
  connection,
) {
  if (!connection) {
    throw new Error(
      "A database transaction connection is required",
    );
  }

  const lookups = [];

  if (clean(transactionId)) {
    lookups.push({
      where: "transaction_id = ?",
      params: [clean(transactionId)],
    });
  }

  if (clean(easycollectLinkId)) {
    lookups.push({
      where: "easycollect_link_id = ?",
      params: [clean(easycollectLinkId)],
    });
  }

  if (clean(easebuzzMandateId)) {
    lookups.push({
      where: "easebuzz_mandate_id = ?",
      params: [clean(easebuzzMandateId)],
    });
  }

  if (clean(easebuzzRequestId)) {
    lookups.push({
      where: "easebuzz_request_id = ?",
      params: [clean(easebuzzRequestId)],
    });
  }

  if (clean(lan)) {
    lookups.push({
      where: "lan = ?",
      params: [clean(lan)],
    });
  }

  for (const lookup of lookups) {
    const [rows] =
      await connection.query(
        `SELECT *
         FROM easebuzz_mandates
         WHERE ${lookup.where}
         ORDER BY id DESC
         LIMIT 1
         FOR UPDATE`,
        lookup.params,
      );

    if (rows[0]) {
      return rows[0];
    }
  }

  return null;
}

async function findForUpdate(
  transactionId,
  connection,
) {
  if (!connection) {
    throw new Error(
      "A database transaction connection is required",
    );
  }

  const [rows] =
    await connection.query(
      `SELECT *
       FROM easebuzz_mandates
       WHERE transaction_id = ?
       LIMIT 1
       FOR UPDATE`,
      [transactionId],
    );

  return rows[0] || null;
}

async function findLatestByLan(
  lan,
  connection = null,
) {
  const executor =
    getExecutor(connection);

  const [rows] =
    await executor.query(
      `SELECT *
       FROM easebuzz_mandates
       WHERE lan = ?
       ORDER BY id DESC
       LIMIT 1`,
      [lan],
    );

  return rows[0] || null;
}

async function findAllByLan(
  lan,
  connection = null,
) {
  const executor =
    getExecutor(connection);

  const [rows] =
    await executor.query(
      `SELECT *
       FROM easebuzz_mandates
       WHERE lan = ?
       ORDER BY id DESC`,
      [lan],
    );

  return rows;
}

async function findTimeline(
  transactionId,
  connection = null,
) {
  const executor =
    getExecutor(connection);

  const mandate =
    await findByTransactionId(
      transactionId,
      executor,
    );

  if (!mandate) {
    return null;
  }

  const [events] =
    await executor.query(
      `SELECT *
       FROM easebuzz_mandate_events
       WHERE mandate_id = ?
       ORDER BY id ASC`,
      [mandate.id],
    );

  return {
    mandate,
    events,
  };
}

/**
 * Create an EasyCollect eNACH attempt.
 *
 * Full account number is not stored.
 */
async function createAttempt(input) {
  return withTransaction(
    async (connection) => {
      const [result] =
        await connection.query(
          `INSERT INTO easebuzz_mandates
           (
             lan,
             transaction_id,
             mandate_type,
             auth_mode,
             request_type,
             amount,
             link_amount,
             amount_rule,
             upfront_presentment_amount,
             frequency,
             start_date,
             end_date,
             link_expiry_date,
             customer_name,
             customer_email,
             customer_phone,
             account_last_four,
             account_type,
             ifsc,
             bank_code,
             message,
             is_auto_debit_link,
             is_auto_debit_seamless,
             status,
             created_by,
             updated_by
           )
           VALUES
           (
             ?, ?,
             'ENACH',
             ?,
             'EASYCOLLECT',
             ?, ?, ?,
             0.00,
             ?,
             NULL,
             ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
             1,
             1,
             ?, ?, ?
           )`,
          [
            input.lan,
            input.transactionId,

            nullable(
              input.authMode,
            ),

            input.maxDebitAmount,
            input.linkAmount,
            input.amountRule,
            input.frequency,

            input.finalCollectionDate,
            input.expiryDate ?? null,

            nullable(input.name),
            nullable(input.email),
            input.phone,

            nullable(
              input.accountLastFour,
            ),

            nullable(
              input.accountType,
            ),

            nullable(input.ifsc),
            nullable(input.bankCode),
            nullable(input.message),

            MANDATE_STATUSES.CREATED,

            input.createdBy ?? null,
            input.createdBy ?? null,
          ],
        );

      const mandate =
        await findById(
          result.insertId,
          connection,
        );

      await insertEvent(
        {
          mandateId:
            mandate.id,

          lan:
            mandate.lan,

          transactionId:
            mandate.transaction_id,

          eventType:
            MANDATE_EVENT_TYPES
              .MANDATE_CREATED,

          eventSource:
            "SYSTEM",

          payload: {
            lan:
              mandate.lan,

            merchantTxn:
              mandate.transaction_id,

            customerName:
              mandate.customer_name,

            linkAmount:
              Number(
                mandate.link_amount,
              ),

            maxDebitAmount:
              Number(
                mandate.amount,
              ),

            finalCollectionDate:
              mandate.end_date,

            expiryDate:
              mandate
                .link_expiry_date,

            frequency:
              mandate.frequency,

            amountRule:
              mandate.amount_rule,

            authMode:
              mandate.auth_mode,

            accountLastFour:
              mandate
                .account_last_four,

            accountType:
              mandate.account_type,

            ifsc:
              mandate.ifsc,

            bankCode:
              mandate.bank_code,
          },
        },
        connection,
      );

      return mandate;
    },
  );
}

/**
 * Called immediately before sending the request to Easebuzz.
 */
async function markLinkPending(
  transactionId,
  requestPayload = {},
  updatedBy = null,
) {
  return withTransaction(
    async (connection) => {
      const mandate =
        await findForUpdate(
          transactionId,
          connection,
        );

      if (!mandate) {
        const error = new Error(
          "Easebuzz mandate record not found",
        );

        error.code =
          "EASEBUZZ_MANDATE_NOT_FOUND";

        error.statusCode = 404;

        throw error;
      }

      const sanitizedRequest =
        sanitizeEasebuzzData(
          requestPayload,
        );

      await connection.query(
        `UPDATE easebuzz_mandates
         SET status = ?,
             latest_response = ?,
             last_error_code = NULL,
             last_error_message = NULL,
             updated_by = ?
         WHERE id = ?`,
        [
          MANDATE_STATUSES
            .LINK_CREATE_PENDING,

          safeJson({
            request:
              sanitizedRequest,
          }),

          updatedBy ??
            mandate.updated_by ??
            null,

          mandate.id,
        ],
      );

      await insertEvent(
        {
          mandateId:
            mandate.id,

          lan:
            mandate.lan,

          transactionId:
            mandate.transaction_id,

          eventType:
            MANDATE_EVENT_TYPES
              .LINK_CREATE_REQUEST,

          eventSource:
            "SYSTEM",

          payload:
            sanitizedRequest,
        },
        connection,
      );

      return findById(
        mandate.id,
        connection,
      );
    },
  );
}

/**
 * Store a successful EasyCollect link response.
 */
async function markLinkCreated(
  transactionId,
  {
    providerData = {},
    sanitizedResponse = {},
    providerHttpStatus = 200,
    updatedBy = null,
  } = {},
) {
  return withTransaction(
    async (connection) => {
      const mandate =
        await findForUpdate(
          transactionId,
          connection,
        );

      if (!mandate) {
        const error = new Error(
          "Easebuzz mandate record not found",
        );

        error.code =
          "EASEBUZZ_MANDATE_NOT_FOUND";

        error.statusCode = 404;

        throw error;
      }

      const safeResponse =
        sanitizeEasebuzzData(
          sanitizedResponse,
        );

      const providerState =
        nullable(
          providerData.state,
        );

      const providerEventId =
        providerData.id
          ? String(providerData.id)
          : null;

      await connection.query(
        `UPDATE easebuzz_mandates
         SET easycollect_link_id = ?,
             status = ?,
             provider_status = ?,
             link_state = ?,
             payment_url = ?,
             short_url = ?,
             latest_response = ?,
             last_error_code = NULL,
             last_error_message = NULL,
             updated_by = ?
         WHERE id = ?`,
        [
          providerData.id ?? null,

          MANDATE_STATUSES
            .LINK_CREATED,

          providerState,
          providerState,

          nullable(
            providerData.payment_url,
          ),

          nullable(
            providerData.short_url,
          ),

          safeJson(safeResponse),

          updatedBy ??
            mandate.updated_by ??
            null,

          mandate.id,
        ],
      );

      await insertEvent(
        {
          mandateId:
            mandate.id,

          lan:
            mandate.lan,

          transactionId:
            mandate.transaction_id,

          eventType:
            MANDATE_EVENT_TYPES
              .LINK_CREATE_RESPONSE,

          eventSource:
            "EASEBUZZ",

          providerEventId,

          httpStatus:
            providerHttpStatus,

          providerStatus:
            providerState,

          payload:
            safeResponse,
        },
        connection,
      );

      return findById(
        mandate.id,
        connection,
      );
    },
  );
}

/**
 * Store a failed or unknown EasyCollect result.
 */
async function markError(
  transactionId,
  {
    unknown = false,
    errorCode = null,
    errorMessage = null,
    providerHttpStatus = null,
    response = {},
    updatedBy = null,
  } = {},
) {
  return withTransaction(
    async (connection) => {
      const mandate =
        await findForUpdate(
          transactionId,
          connection,
        );

      if (!mandate) {
        return null;
      }

      const safeResponse =
        sanitizeEasebuzzData(
          response ?? {},
        );

      const nextStatus =
        unknown
          ? MANDATE_STATUSES.UNKNOWN
          : MANDATE_STATUSES.FAILED;

      await connection.query(
        `UPDATE easebuzz_mandates
         SET status = ?,
             failed_at =
               CASE
                 WHEN ? = 1
                 THEN failed_at
                 ELSE NOW()
               END,
             latest_response = ?,
             last_error_code = ?,
             last_error_message = ?,
             updated_by = ?
         WHERE id = ?`,
        [
          nextStatus,

          unknown ? 1 : 0,

          safeJson(safeResponse),

          nullable(errorCode),

          nullable(errorMessage),

          updatedBy ??
            mandate.updated_by ??
            null,

          mandate.id,
        ],
      );

      await insertEvent(
        {
          mandateId:
            mandate.id,

          lan:
            mandate.lan,

          transactionId:
            mandate.transaction_id,

          eventType:
            MANDATE_EVENT_TYPES.ERROR,

          eventSource:
            unknown
              ? "SYSTEM"
              : "EASEBUZZ",

          httpStatus:
            providerHttpStatus,

          payload: {
            unknownResult:
              unknown,

            errorCode,
            errorMessage,

            response:
              safeResponse,
          },
        },
        connection,
      );

      return findById(
        mandate.id,
        connection,
      );
    },
  );
}

/**
 * Store an EasyCollect mandate webhook.
 */
async function markWebhookUpdate({
  identifiers = {},
  nextStatus = null,
  providerStatus = null,
  linkState = null,
  easycollectLinkId = null,
  easebuzzMandateId = null,
  easebuzzRequestId = null,
  umrn = null,
  mandateType = null,
  authMode = null,
  amount = null,
  amountRule = null,
  frequency = null,
  startDate = null,
  endDate = null,
  customerName = null,
  customerEmail = null,
  customerPhone = null,
  accountLastFour = null,
  accountType = null,
  ifsc = null,
  bankCode = null,
  tpvValidationStatus = null,
  mandateSubmittedAt = null,
  authorizedAt = null,
  failedAt = null,
  cancelledAt = null,
  revokedAt = null,
  lastErrorCode = null,
  lastErrorMessage = null,
  providerEventId = null,
  signatureVerified = null,
  payload = {},
} = {}) {
  return withTransaction(
    async (connection) => {
      let mandate =
        await findWebhookTargetForUpdate(
          identifiers,
          connection,
        );

      const safePayload =
        sanitizeEasebuzzData(
          payload ?? {},
        );

      if (!mandate) {
        const canInsertFromWebhook =
          clean(identifiers.transactionId) &&
          clean(identifiers.lan) &&
          amount !== null &&
          amount !== undefined &&
          clean(frequency) &&
          (startDate || endDate) &&
          clean(customerPhone);

        if (!canInsertFromWebhook) {
          return {
            mandate: null,
            event: null,
          };
        }

        const [insertResult] =
          await connection.query(
            `INSERT INTO easebuzz_mandates
             (
               lan,
               transaction_id,
               easebuzz_request_id,
               easycollect_link_id,
               easebuzz_mandate_id,
               umrn,
               mandate_type,
               auth_mode,
               request_type,
               amount,
               link_amount,
               amount_rule,
               upfront_presentment_amount,
               frequency,
               start_date,
               end_date,
               customer_name,
               customer_email,
               customer_phone,
               account_last_four,
               account_type,
               ifsc,
               bank_code,
               message,
               is_auto_debit_link,
               is_auto_debit_seamless,
               status,
               provider_status,
               link_state,
               tpv_validation_status,
               mandate_submitted_at,
               authorized_at,
               failed_at,
               cancelled_at,
               revoked_at,
               latest_response,
               last_error_code,
               last_error_message
             )
             VALUES
             (
               ?, ?, ?, ?, ?, ?,
               ?, ?, 'WEBHOOK',
               ?, 1.00, ?, 0.00, ?,
               ?, ?,
               ?, ?, ?, ?, ?, ?, ?, ?,
               1, 1,
               ?, ?, ?,
               ?, ?, ?, ?, ?, ?,
               ?, ?, ?
             )
             ON DUPLICATE KEY UPDATE
               id = LAST_INSERT_ID(id)`,
            [
              clean(identifiers.lan),
              clean(identifiers.transactionId),
              nullable(easebuzzRequestId),
              nullable(easycollectLinkId),
              nullable(easebuzzMandateId),
              nullable(umrn),
              nullable(mandateType) || "UPI",
              nullable(authMode),
              amount,
              nullable(amountRule) || "MAX",
              nullable(frequency),
              startDate ?? null,
              endDate ?? startDate ?? null,
              nullable(customerName),
              nullable(customerEmail),
              nullable(customerPhone),
              nullable(accountLastFour),
              nullable(accountType),
              nullable(ifsc),
              nullable(bankCode),
              "Easebuzz mandate webhook",
              nullable(nextStatus) ||
                MANDATE_STATUSES.UNKNOWN,
              nullable(providerStatus),
              nullable(linkState),
              nullable(tpvValidationStatus),
              mandateSubmittedAt,
              authorizedAt,
              failedAt,
              cancelledAt,
              revokedAt,
              safeJson(safePayload),
              nullable(lastErrorCode),
              nullable(lastErrorMessage),
            ],
          );

        mandate =
          await findById(
            insertResult.insertId,
            connection,
          );
      }

      await connection.query(
        `UPDATE easebuzz_mandates
         SET easebuzz_request_id =
               COALESCE(easebuzz_request_id, ?),
             easycollect_link_id =
               COALESCE(easycollect_link_id, ?),
             easebuzz_mandate_id =
               COALESCE(easebuzz_mandate_id, ?),
             umrn =
               COALESCE(umrn, ?),
             mandate_type =
               COALESCE(?, mandate_type),
             auth_mode =
               COALESCE(?, auth_mode),
             amount =
               COALESCE(?, amount),
             amount_rule =
               COALESCE(?, amount_rule),
             frequency =
               COALESCE(?, frequency),
             start_date =
               COALESCE(?, start_date),
             end_date =
               COALESCE(?, end_date),
             customer_name =
               COALESCE(?, customer_name),
             customer_email =
               COALESCE(?, customer_email),
             customer_phone =
               COALESCE(?, customer_phone),
             account_last_four =
               COALESCE(?, account_last_four),
             account_type =
               COALESCE(?, account_type),
             ifsc =
               COALESCE(?, ifsc),
             bank_code =
               COALESCE(?, bank_code),
             tpv_validation_status =
               COALESCE(?, tpv_validation_status),
             status =
               CASE
                 WHEN ? IS NULL
                 THEN status
                 WHEN ? = ?
                      AND status <> ?
                 THEN status
                 ELSE ?
               END,
             provider_status =
               COALESCE(?, provider_status),
             link_state =
               COALESCE(?, link_state),
             mandate_submitted_at =
               COALESCE(?, mandate_submitted_at),
             authorized_at =
               COALESCE(?, authorized_at),
             failed_at =
               COALESCE(?, failed_at),
             cancelled_at =
               COALESCE(?, cancelled_at),
             revoked_at =
               COALESCE(?, revoked_at),
             latest_response = ?,
             last_error_code =
               CASE
                 WHEN ? IS NOT NULL
                 THEN ?
                 WHEN ? = ?
                 THEN NULL
                 ELSE last_error_code
               END,
             last_error_message =
               CASE
                 WHEN ? IS NOT NULL
                 THEN ?
                 WHEN ? = ?
                 THEN NULL
                 ELSE last_error_message
               END,
             updated_by =
               COALESCE(updated_by, created_by),
             updated_at = NOW()
         WHERE id = ?`,
        [
          nullable(easebuzzRequestId),
          nullable(easycollectLinkId),
          nullable(easebuzzMandateId),
          nullable(umrn),
          nullable(mandateType),
          nullable(authMode),
          amount ?? null,
          nullable(amountRule),
          nullable(frequency),
          startDate ?? null,
          endDate ?? null,
          nullable(customerName),
          nullable(customerEmail),
          nullable(customerPhone),
          nullable(accountLastFour),
          nullable(accountType),
          nullable(ifsc),
          nullable(bankCode),
          nullable(tpvValidationStatus),

          nullable(nextStatus),
          nullable(nextStatus),
          MANDATE_STATUSES.UNKNOWN,
          MANDATE_STATUSES.UNKNOWN,
          nullable(nextStatus),

          nullable(providerStatus),
          nullable(linkState),
          mandateSubmittedAt,
          authorizedAt,
          failedAt,
          cancelledAt,
          revokedAt,
          safeJson(safePayload),

          nullable(lastErrorCode),
          nullable(lastErrorCode),
          nullable(nextStatus),
          MANDATE_STATUSES.ACTIVE,

          nullable(lastErrorMessage),
          nullable(lastErrorMessage),
          nullable(nextStatus),
          MANDATE_STATUSES.ACTIVE,

          mandate.id,
        ],
      );

      const event =
        await insertEvent(
          {
            mandateId:
              mandate.id,

            lan:
              mandate.lan,

            transactionId:
              mandate.transaction_id,

            eventType:
              MANDATE_EVENT_TYPES.WEBHOOK,

            eventSource:
              "EASEBUZZ",

            providerEventId:
              nullable(providerEventId),

            providerStatus:
              nullable(providerStatus),

            signatureVerified,

            payload:
              safePayload,
          },
          connection,
        );

      return {
        mandate:
          await findById(
            mandate.id,
            connection,
          ),

        event,
      };
    },
  );
}

module.exports = {
  withTransaction,
  withLanInitiationLock,

  createEventHash,
  insertEvent,

  createAttempt,
  markLinkPending,
  markLinkCreated,
  markError,
  markWebhookUpdate,

  findById,
  findLatestByLan,
  findAllByLan,
  findByTransactionId,
  findWebhookTargetForUpdate,
  findTimeline,
};
