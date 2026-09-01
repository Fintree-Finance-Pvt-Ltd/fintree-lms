const axios = require("axios");
const crypto = require("crypto");
const db = require("../../config/db");

const MAX_ATTEMPTS = 2;
const TIMEOUT_MS = Number(process.env.CLIENT_WEBHOOK_TIMEOUT_MS || 10000);
const RETRY_DELAY_MS = Number(process.env.CLIENT_WEBHOOK_RETRY_DELAY_MS || 1000);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// routes
function json(value) {
  try {
    return JSON.stringify(value ?? null);
  } catch (error) {
    return JSON.stringify({
      serialization_error: true,
      message: error.message,
    });
  }
}

function createSignature(body, secret) {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

async function createWebhookLog(payload) {
  const [result] = await db.promise().query(
    `
    INSERT INTO webhook_logs (
      lan,
      event,
      payload,
      response,
      status,
      attempts,
      created_at
    )
    VALUES (?, ?, ?, NULL, 'PENDING', 0, NOW(3))
    `,
    [
      payload.lan || null,
      payload.event || null,
      json(payload),
    ],
  );

  return result.insertId;
}

async function updateWebhookLog(logId, status, attempts, response) {
  if (!logId) {
    return;
  }

  await db.promise().query(
    `
    UPDATE webhook_logs
    SET response = ?,
        status = ?,
        attempts = ?
    WHERE id = ?
    `,
    [
      json(response),
      status,
      attempts,
      logId,
    ],
  );
}

function getFailure(error) {
  return {
    message: error.message || "Webhook request failed",
    code: error.code || null,
    response_status: error.response?.status || null,
    response_data: error.response?.data || null,
  };
}

async function sendClientWebhook(payload) {
  const url = String(process.env.CLIENT_WEBHOOK_URL || "").trim();
  const secret = String(process.env.CLIENT_WEBHOOK_SECRET || "").trim();
  let logId = null;

  try {
    logId = await createWebhookLog(payload);
  } catch (error) {
    console.error("[YA-MONEY-WEBHOOK] Log create failed", {
      lan: payload?.lan,
      message: error.message,
    });
  }

  if (!url || !secret) {
    const response = {
      message: "CLIENT_WEBHOOK_URL or CLIENT_WEBHOOK_SECRET is missing",
    };

    try {
      await updateWebhookLog(logId, "FAILED", 0, response);
    } catch (error) {
      console.error("[YA-MONEY-WEBHOOK] Log update failed", {
        logId,
        message: error.message,
      });
    }

    console.error("[YA-MONEY-WEBHOOK] Config missing", response);

    return {
      success: false,
      logId,
      attempts: 0,
      message: response.message,
    };
  }

  const body = JSON.stringify(payload);
  const headers = {
    "Content-Type": "application/json",
    "X-Webhook-Signature": createSignature(body, secret),
  };

  let failure = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await axios.post(url, body, {
        headers,
        timeout: TIMEOUT_MS,
        validateStatus: () => true,
      });

      const responseLog = {
        status_code: response.status,
        body: response.data ?? null,
      };

      if (response.status >= 200 && response.status < 300) {
        await updateWebhookLog(logId, "SUCCESS", attempt, responseLog);
        console.log("[YA-MONEY-WEBHOOK] Sent", {
          lan: payload.lan,
          logId,
          attempt,
          status: response.status,
        });

        return {
          success: true,
          logId,
          attempts: attempt,
          status: response.status,
          data: response.data,
        };
      }

      failure = {
        message: `Webhook returned HTTP ${response.status}`,
        response_status: response.status,
        response_data: response.data ?? null,
      };
    } catch (error) {
      failure = getFailure(error);
    }

    console.error("[YA-MONEY-WEBHOOK] Attempt failed", {
      lan: payload.lan,
      logId,
      attempt,
      failure,
    });

    if (attempt < MAX_ATTEMPTS) {
      await sleep(RETRY_DELAY_MS * attempt);
    }
  }

  try {
    await updateWebhookLog(logId, "FAILED", MAX_ATTEMPTS, failure);
  } catch (error) {
    console.error("[YA-MONEY-WEBHOOK] Log update failed", {
      logId,
      message: error.message,
    });
  }

  return {
    success: false,
    logId,
    attempts: MAX_ATTEMPTS,
    status: failure?.response_status || null,
    message: failure?.message || "Webhook delivery failed",
  };
}

module.exports = {
  sendClientWebhook,
};
