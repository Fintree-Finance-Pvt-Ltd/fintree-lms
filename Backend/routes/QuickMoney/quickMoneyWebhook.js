const axios = require("axios");
const db = require("../../config/db");
const dayjs = require("dayjs");
const router = require("../authRoutes");
// const QUICK_MONEY_BASE_URL =
//   process.env.QUICK_MONEY_WEBHOOK_BASE_URL;

const QUICK_MONEY_BASE_URL = "http://localhost:5000";
const MAX_ATTEMPTS = 5;
const RETRY_AFTER_MINUTES = 5;

function getQuickMoneyHeaders() {
// const token =
//     process.env.QUICK_MONEY_WEBHOOK_TOKEN;

//   console.log("[SML] Token check:", {
//     hasToken: Boolean(token),
//     tokenLength: token ? String(token).trim().length : 0,
//   });

//     if (!token) {
//     throw new Error(
//       "QUICK_MONEY_WEBHOOK_TOKEN is missing in .env"
//     );
//   }

  return {
    // Authorization: `Bearer ${String(token)
    //   .trim()
    //   .replace(/^Bearer\s+/i, "")}`,
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

async function createWebhookLog({
  webhookType,
  applicationId,
  lan,
  webhookUrl,
  requestBody,
}) {
  await db.promise().query(
    `
    INSERT INTO quick_money_webhook_logs (
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
    FROM quick_money_webhook_logs
    WHERE application_id = ?
      AND webhook_type = ?
    LIMIT 1
    `,
    [
      applicationId,
      webhookType,
    ],
  );

  if (!log) {
    throw new Error(
      `Webhook log not found for application: ${applicationId}`,
    );
  }

  return log;
}

async function sendWebhookLog(logId) {
  const [[log]] = await db.promise().query(
    `
    SELECT *
    FROM quick_money_webhook_logs   
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
    console.log("[QUICK-MONEY-WEBHOOK] Sending", {
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
        headers: getQuickMoneyHeaders(),
        timeout: 15000,
      },
    );

    await db.promise().query(
      `
      UPDATE quick_money_webhook_logs
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

    console.log("[QUICK-MONEY-WEBHOOK] Sent successfully", {
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
    UPDATE quick_money_webhook_logs
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
    "[QUICK-MONEY-WEBHOOK] Failed",
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

async function sendQuickMoneyRejectionWebhook({
  applicationId,
}) {
  if (!applicationId) {
    throw new Error("applicationId is required");
  }

  const [[loan]] = await db.promise().query(
    `
    SELECT lan
    FROM loan_booking_quick_money
    WHERE application_id = ?
    LIMIT 1
    `,
    [applicationId],
  );

  if (!loan) {
    throw new Error(
      `Quick Money loan not found: ${applicationId}`,
    );
  }

  const webhookUrl =
    // `${BASE_URL}/api-api/v1/webhooks/fintree/` +
    // "loan-rejected";

  "http://localhost:5000/api/quick-money/test-webhook-receiver";
  const requestBody = {
    payload: {
      status: "Rejected",
      lead_id: applicationId,
    },
  };

  console.log(
    "[QUICK-MONEY-WEBHOOK] Creating rejection webhook",
    {
      applicationId,
      lan: loan.lan,
      webhookUrl,
      requestBody,
    },
  );

  const log = await createWebhookLog({
    webhookType: "REJECTION",
    applicationId,
    lan: loan.lan || null,
    webhookUrl,
    requestBody,
  });

  return sendWebhookLog(log.id);
}

async function sendQuickMoneyDisbursementWebhook({
  lan,
  transactionId,
  disbursementDate,
}) {
  if (!lan) {
    throw new Error("LAN is required");
  }

  if (!transactionId) {
    throw new Error(
      "transactionId/UTR is required"
    );
  }

  if (
    !disbursementDate ||
    !dayjs(disbursementDate).isValid()
  ) {
    throw new Error(
      "Valid disbursementDate is required"
    );
  }

  const [[loan]] =
    await db.promise().query(
      `
      SELECT
        application_id,
        tenure AS tenure_days,
        status
      FROM loan_booking_quick_money
      WHERE lan = ?
      LIMIT 1
      `,
      [lan],
    );

  if (!loan) {
    throw new Error(
      `Quick Money case not found: ${lan}`
    );
  }

  if (!loan.application_id) {
    throw new Error(
      `application_id missing for LAN: ${lan}`
    );
  }

  const tenureDays =
    Number(loan.tenure_days);

  if (
    !Number.isInteger(tenureDays) ||
    tenureDays <= 0
  ) {
    throw new Error(
      `Invalid tenure_days for LAN: ${lan}`
    );
  }

  const repaymentDate =
    dayjs(disbursementDate)
      .add(tenureDays - 1, "day")
      .format("YYYY-MM-DD");

  const webhookUrl =
  `http://localhost:5000/api/quick-money/test-webhook-receiver`
    // `${QUICK_MONEY_BASE_URL}/api-api/v1/webhooks/fintree/` +
    "disbursement-status";

  const requestBody = {
    payload: {
      status: "Disbursed",
      lead_id: loan.application_id,
      transaction_id: transactionId,
      disbursement_date:
        formatDate(disbursementDate),
      repayment_date:
        repaymentDate,
    },
  };

  const log =
    await createWebhookLog({
      webhookType: "DISBURSEMENT",
      applicationId:
        loan.application_id,
      lan,
      webhookUrl,
      requestBody,
    });

  return sendWebhookLog(log.id);
}

async function retryFailedWebhooks() {
  const [logs] = await db.promise().query(
    `
    SELECT id
    FROM quick_money_webhook_logs
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

  console.log(
    "[QUICK-MONEY-WEBHOOK-RETRY] Found",
    {
      total: logs.length,
    },
  );

  for (const log of logs) {
    await sendWebhookLog(log.id);
  }

  return {
    processed: logs.length,
  };
}


router.post("/test-send-webhook", async (req, res) => {
  try {
    const result = await sendQuickMoneyDisbursementWebhook({
      lan: "QML1011000",
      transactionId: "TESTUTR123456",
      disbursementDate: new Date(),
    });

    return res.status(200).json({
      is_success: true,
      data: result,
    });
  } catch (error) {
    console.error(
      "[QUICK MONEY] Test webhook failed:",
      error
    );

    return res.status(500).json({
      is_success: false,
      error: {
        message: error.message,
      },
    });
  }
});

module.exports = {
   sendQuickMoneyDisbursementWebhook,
   sendQuickMoneyRejectionWebhook,
   retryFailedWebhooks
};
