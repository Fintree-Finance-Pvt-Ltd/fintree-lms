// services/easebuzz/easebuzzClient.js

const axios = require("axios");

const {
  EASEBUZZ_ENDPOINTS,
} = require("./easebuzzConstants");

class EasebuzzApiError extends Error {
  constructor(
    message,
    {
      code = "EASEBUZZ_API_ERROR",
      statusCode = 502,
      providerHttpStatus = null,
      providerResponse = null,
      unknownResult = false,
    } = {},
  ) {
    super(message);

    this.name = "EasebuzzApiError";
    this.code = code;
    this.statusCode = statusCode;
    this.providerHttpStatus =
      providerHttpStatus;
    this.providerResponse =
      providerResponse;
    this.unknownResult =
      unknownResult;
  }
}

function sanitizeEasebuzzData(value) {
  if (
    !value ||
    typeof value !== "object"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(
      sanitizeEasebuzzData,
    );
  }

  const sensitive = new Set([
    "key",
    "hash",
    "holder_account_number",
    "account_number",
    "card_number",
    "card_cvv",
  ]);

  const sanitized = {};

  for (
    const [key, item]
    of Object.entries(value)
  ) {
    if (sensitive.has(key)) {
      sanitized[key] = "[REDACTED]";
    } else if (
      item &&
      typeof item === "object"
    ) {
      sanitized[key] =
        sanitizeEasebuzzData(item);
    } else {
      sanitized[key] = item;
    }
  }

  return sanitized;
}

function providerMessage(
  data,
  fallback,
) {
  return (
    data?.message ||
    data?.description ||
    data?.error ||
    fallback
  );
}

async function createEnachLink(
  payload,
) {
  const endpoint =
    EASEBUZZ_ENDPOINTS
      .EASYCOLLECT_CREATE;

  if (!endpoint) {
    const error = new Error(
      "EASEBUZZ_EASYCOLLECT_CREATE_URL is not configured",
    );

    error.code =
      "EASEBUZZ_CONFIGURATION_ERROR";

    error.statusCode = 500;

    throw error;
  }

  let response;

  try {
    response = await axios.post(
      endpoint,
      payload,
      {
        headers: {
          Accept:
            "application/json",

          "Content-Type":
            "application/json",
        },

        timeout: Number(
          process.env
            .EASEBUZZ_HTTP_TIMEOUT_MS ||
            20000,
        ),

        validateStatus: () => true,
      },
    );
  } catch (error) {
    throw new EasebuzzApiError(
      "Unable to confirm Easebuzz EasyCollect result",
      {
        code:
          error.code ===
          "ECONNABORTED"
            ? "EASEBUZZ_TIMEOUT"
            : "EASEBUZZ_NETWORK_ERROR",

        statusCode: 503,
        unknownResult: true,
      },
    );
  }

  const data =
    response.data &&
    typeof response.data === "object"
      ? response.data
      : {
          raw: response.data,
        };

  if (response.status >= 500) {
    throw new EasebuzzApiError(
      providerMessage(
        data,
        "Easebuzz returned an unknown result",
      ),
      {
        code:
          "EASEBUZZ_UNKNOWN_RESULT",

        statusCode: 503,

        providerHttpStatus:
          response.status,

        providerResponse:
          sanitizeEasebuzzData(data),

        unknownResult: true,
      },
    );
  }

  if (
    response.status < 200 ||
    response.status >= 300 ||
    data.status !== true
  ) {
    throw new EasebuzzApiError(
      providerMessage(
        data,
        "Easebuzz rejected the EasyCollect request",
      ),
      {
        code:
          "EASEBUZZ_LINK_CREATE_REJECTED",

        statusCode: 422,

        providerHttpStatus:
          response.status,

        providerResponse:
          sanitizeEasebuzzData(data),
      },
    );
  }

  if (!data.data?.payment_url) {
    throw new EasebuzzApiError(
      "Easebuzz did not return payment_url",
      {
        code:
          "EASEBUZZ_INVALID_LINK_RESPONSE",

        statusCode: 502,

        providerHttpStatus:
          response.status,

        providerResponse:
          sanitizeEasebuzzData(data),
      },
    );
  }

  return {
    data: data.data,

    message:
      data.message || null,

    providerHttpStatus:
      response.status,

    sanitizedResponse:
      sanitizeEasebuzzData(data),
  };
}

module.exports = {
  EasebuzzApiError,
  sanitizeEasebuzzData,
  createEnachLink,
};