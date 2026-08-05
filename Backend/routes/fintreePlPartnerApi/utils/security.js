const crypto = require("crypto");
const { PartnerApiError } = require("./partnerApiError");

const sha256 = (value) =>
  crypto.createHash("sha256").update(value).digest("hex");

const stableStringify = (value) => {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const keys = Object.keys(value).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(",")}}`;
};

const hashRequestBody = (body) => sha256(stableStringify(body ?? {}));

const isUuid = (value) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || ""),
  );

const requireCorrelationId = (req) => {
  const correlationId = String(req.get("x-correlation-id") || "").trim();

  if (!isUuid(correlationId)) {
    throw new PartnerApiError(
      400,
      "INVALID_CORRELATION_ID",
      "X-Correlation-Id must be a valid UUID.",
    );
  }

  return correlationId;
};

const requireIdempotencyKey = (req) => {
  const idempotencyKey = String(req.get("idempotency-key") || "").trim();

  if (!idempotencyKey || idempotencyKey.length > 191) {
    throw new PartnerApiError(
      400,
      "INVALID_IDEMPOTENCY_KEY",
      "Idempotency-Key is required and must not exceed 191 characters.",
    );
  }

  return idempotencyKey;
};

const safeJsonParse = (value) => {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "object") return value;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

module.exports = {
  sha256,
  stableStringify,
  hashRequestBody,
  requireCorrelationId,
  requireIdempotencyKey,
  safeJsonParse,
};
