const axios = require("axios");
const db = require("../../config/db");

const BASE_URL =
  process.env.RAPID_MONEY_WEBHOOK_BASE_URL || "https://web.rapidmoney.in";

const MAX_ATTEMPTS = 5;
const RETRY_AFTER_MINUTES = 5;

function getHeaders() {
  const token =
    process.env.RAPID_MONEY_WEBHOOK_TOKEN ||"y2v8v4e4b1g7f9a3c6e2b4d8f1a7d5e9b2d6g3a8c1f4e7d0f2a1c6e5b1d8f3c5";

  console.log("[SML] Token check:", {
    hasToken: Boolean(token),
    tokenLength: token ? String(token).trim().length : 0,
  });

  if (!token) {
    throw new Error("RAPID_MONEY_WEBHOOK_TOKEN is missing in .env");
  }

  return {
    Authorization: `Bearer ${String(token)
      .trim()
      .replace(/^Bearer\s+/i, "")}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

function formatDate(value) {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
      return trimmed.slice(0, 10);
    }
  }

  const date =
    value instanceof Date
      ? value
      : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error(
      `Invalid date: ${value}`,
    );
  }

  const year = date.getFullYear();

  const month = String(
    date.getMonth() + 1,
  ).padStart(2, "0");

  const day = String(
    date.getDate(),
  ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

/**
 * Create webhook log.
 *
 * The unique key prevents duplicate rows for the same
 * application and webhook type.
 */
async function createWebhookLog({
  webhookType,
  applicationId,
  lan,
  webhookUrl,
  requestBody,
}) {
  await db.promise().query(
    `
    INSERT INTO rapid_money_webhook_logs (
      webhook_type,
      application_id,
      lan,
      webhook_url,
      request_body,
      status,
      attempts,
      max_attempts,
      next_retry_at
    )
    VALUES (?, ?, ?, ?, ?, 'PENDING', 0, ?, NOW())

    ON DUPLICATE KEY UPDATE
      lan = VALUES(lan),
      webhook_url = VALUES(webhook_url),
      request_body = VALUES(request_body),
      updated_at = NOW()
    `,
    [
      webhookType,
      applicationId,
      lan || null,
      webhookUrl,
      JSON.stringify(requestBody),
      MAX_ATTEMPTS,
    ],
  );

  const [[log]] = await db.promise().query(
    `
    SELECT *
    FROM rapid_money_webhook_logs
    WHERE application_id = ?
      AND webhook_type = ?
    LIMIT 1
    `,
    [applicationId, webhookType],
  );

  return log;
}

/**
 * Send one webhook log.
 */
async function sendWebhookLog(logId) {
  const [[log]] = await db.promise().query(
    `
    SELECT *
    FROM rapid_money_webhook_logs
    WHERE id = ?
    LIMIT 1
    `,
    [logId],
  );

  if (!log) {
    throw new Error(`Webhook log not found: ${logId}`);
  }

  if (log.status === "SUCCESS") {
    return {
      success: true,
      alreadySent: true,
      logId,
    };
  }

  if (Number(log.attempts) >= Number(log.max_attempts)) {
    return {
      success: false,
      message: "Maximum retry attempts reached",
      logId,
    };
  }

  try {
    console.log("[RAPID-MONEY-WEBHOOK] Sending", {
      logId,
      webhookType: log.webhook_type,
      applicationId: log.application_id,
      lan: log.lan,
      attempt: Number(log.attempts) + 1,
    });

    const response = await axios.post(
      log.webhook_url,
      JSON.parse(log.request_body),
      {
        headers: getHeaders(),
        timeout: 15000,
      },
    );

    await db.promise().query(
      `
      UPDATE rapid_money_webhook_logs
      SET
        status = 'SUCCESS',
        attempts = attempts + 1,
        response_status = ?,
        response_body = ?,
        error_message = NULL,
        next_retry_at = NULL,
        last_attempt_at = NOW(),
        sent_at = NOW(),
        updated_at = NOW()
      WHERE id = ?
      `,
      [response.status, JSON.stringify(response.data || {}), logId],
    );

    console.log("[RAPID-MONEY-WEBHOOK] Sent successfully", {
      logId,
      webhookType: log.webhook_type,
      applicationId: log.application_id,
      status: response.status,
    });

    return {
      success: true,
      logId,
      status: response.status,
      data: response.data,
    };
  } catch (error) {
  const newAttempts =
    Number(log.attempts || 0) + 1;

  const maxAttempts =
    Number(
      log.max_attempts ||
        MAX_ATTEMPTS,
    );

  const responseStatus =
    error.response?.status || null;

  const responseBody =
    error.response?.data || null;

  const errorMessage =
    error.response?.data?.message ||
    error.message ||
    "Webhook failed";

  const nextRetryAt =
    newAttempts >= maxAttempts
      ? null
      : new Date(
          Date.now() +
            RETRY_AFTER_MINUTES *
              60 *
              1000,
        );

  await db.promise().query(
    `
    UPDATE rapid_money_webhook_logs
    SET
      status = 'FAILED',
      attempts = ?,
      response_status = ?,
      response_body = ?,
      error_message = ?,
      next_retry_at = ?,
      last_attempt_at = NOW(),
      updated_at = NOW()
    WHERE id = ?
    `,
    [
      newAttempts,
      responseStatus,
      responseBody
        ? JSON.stringify(responseBody)
        : null,
      String(errorMessage).slice(
        0,
        2000,
      ),
      nextRetryAt,
      logId,
    ],
  );

  console.error(
    "[RAPID-MONEY-WEBHOOK] Failed",
    {
      logId,
      webhookType:
        log.webhook_type,
      applicationId:
        log.application_id,
      status: responseStatus,
      message: errorMessage,
      nextRetryAt,
    },
  );

  return {
    success: false,
    logId,
    status: responseStatus,
    message: errorMessage,
  };
}
}

/**
 * Loan Rejection Webhook
 */
async function sendRejectionWebhook({ applicationId }) {
  if (!applicationId) {
    throw new Error("applicationId is required");
  }

  const [[loan]] = await db.promise().query(
    `
    SELECT lan
    FROM loan_booking_switch_my_loan
    WHERE application_id = ?
    LIMIT 1
    `,
    [applicationId],
  );

  const webhookUrl =
    `${BASE_URL}/api-api/v1/webhooks/fintree/` + "loan-rejected";

  const requestBody = {
    payload: {
      status: "Rejected",
      lead_id: applicationId,
    },
  };

  const log = await createWebhookLog({
    webhookType: "REJECTION",
    applicationId,
    lan: loan?.lan || null,
    webhookUrl,
    requestBody,
  });

  return sendWebhookLog(log.id);
}

/**
 * Disbursement webhook.
 *
 * Only LAN, UTR and disbursement date are required.
 * application_id and repayment_date are fetched from
 * loan_booking_switch_my_loan.
 */
async function sendDisbursementWebhook({
  lan,
  transactionId,
  disbursementDate,
}) {
  if (!lan) {
    throw new Error("LAN is required");
  }

  if (!transactionId) {
    throw new Error("transactionId/UTR is required");
  }

  const [[loan]] = await db.promise().query(
    `
    SELECT
      application_id,
      repayment_date,
      status
    FROM loan_booking_switch_my_loan
    WHERE lan = ?
    LIMIT 1
    `,
    [lan],
  );

  if (!loan) {
    throw new Error(`Switch My Loan case not found: ${lan}`);
  }

  if (!loan.application_id) {
    throw new Error(`application_id missing for LAN: ${lan}`);
  }

  if (!loan.repayment_date) {
    throw new Error(`repayment_date missing for LAN: ${lan}`);
  }

  const webhookUrl =
    `${BASE_URL}/api-api/v1/webhooks/fintree/` + "disbursement-status";

  const requestBody = {
    payload: {
      status: "Disbursed",
      lead_id: loan.application_id,
      transaction_id: transactionId,
      disbursement_date: formatDate(disbursementDate),
      repayment_date: formatDate(loan.repayment_date),
    },
  };

  const log = await createWebhookLog({
    webhookType: "DISBURSEMENT",
    applicationId: loan.application_id,
    lan,
    webhookUrl,
    requestBody,
  });

  return sendWebhookLog(log.id);
}

/**
 * Retry all pending and failed webhooks.
 */
async function retryFailedWebhooks() {
  const [logs] = await db.promise().query(
    `
    SELECT id
    FROM rapid_money_webhook_logs
    WHERE status IN ('PENDING', 'FAILED')
      AND attempts < max_attempts
      AND (
        next_retry_at IS NULL
        OR next_retry_at <= NOW()
      )
    ORDER BY id ASC
    LIMIT 20
    `,
  );

  console.log("[RAPID-MONEY-WEBHOOK-RETRY] Found", {
    total: logs.length,
  });

  for (const log of logs) {
    await sendWebhookLog(log.id);
  }

  return {
    processed: logs.length,
  };
}

module.exports = {
  sendRejectionWebhook,
  sendDisbursementWebhook,
  retryFailedWebhooks,
};
