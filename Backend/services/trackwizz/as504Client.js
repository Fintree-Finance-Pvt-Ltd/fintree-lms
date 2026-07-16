/**
 * Low-level AS504 HTTP client.
 * POST to the tenant AS504 URL with headers: APIToken, Cluster, Domain.
 */
const axios = require("axios");
const config = require("../../config/trackwizz.config");

// Common MRV rejection codes → human-readable hints (from AS504 v1.3 §6)
const MRV_HINTS = {
  MRV1: "API Token missing — check TW_API_TOKEN env",
  MRV2: "Invalid/unrecognized API Token — verify token with TrackWizz team",
  MRV3: "User lacks API access in Subscription Master (TrackWizz-side config)",
  MRV10: "sourceSystemName is missing in payload",
  MRV11: "sourceSystemCustomerCode is missing",
  MRV12: "purpose is missing",
  MRV13: "Unknown purpose code",
  MRV14: "constitutionType is missing",
  MRV27:
    "sourceSystemName not configured on TrackWizz side — ask vendor to whitelist it",
  MRV28:
    "requestId contains disallowed characters (only alphanum, - _ . space)",
  MRV29: "requestId is missing",
  MRV49:
    "sourceSystemCustomerCode or applicationRefNumber required for purpose 01/03",
};

class As504Error extends Error {
  constructor(
    message,
    {
      code = null,
      httpStatus = null,
      responseBody = null,
      transient = false,
    } = {},
  ) {
    super(message);
    this.name = "As504Error";
    this.code = code; // MRV*/VS* code if TrackWizz rejected
    this.httpStatus = httpStatus;
    this.responseBody = responseBody;
    this.transient = transient; // true → safe to retry (timeout / 5xx / network)
  }
}

/**
 * Fire the AS504 request.
 * @param {object} payload - full request body from payloadBuilder
 * @returns {Promise<{ httpStatus: number, body: object }>}
 * @throws {As504Error}
 */
async function callAs504(payload) {
  if (!config.apiToken) {
    throw new As504Error("TW_API_TOKEN not configured", { code: "CONFIG" });
  }

  if (!config.domain) {
    throw new As504Error("TW_DOMAIN not configured", { code: "CONFIG" });
  }

  let res;
  try {
    res = await axios.post(config.url, payload, {
      headers: {
        "Content-Type": "application/json",
        APIToken: config.apiToken,
        Cluster: config.cluster,
        Domain: config.domain, // per docs: originating domain of the request
      },
      timeout: config.timeoutMs,
      // Response may be several MB when reportData (base64 PDF) is returned
      maxContentLength: 50 * 1024 * 1024,
      maxBodyLength: 10 * 1024 * 1024,
      validateStatus: () => true, // handle non-2xx ourselves
    });
  } catch (err) {
    // network error / timeout — transient, caller may retry
    throw new As504Error(`AS504 transport error: ${err.message}`, {
      code: "TRANSPORT",
      transient: true,
    });
  }

  const body = res.data;

  if (res.status >= 500) {
    throw new As504Error(`AS504 server error (HTTP ${res.status})`, {
      httpStatus: res.status,
      responseBody: body,
      transient: true,
    });
  }

  // TrackWizz signals request-level rejection via validationCode (MRV*)
  // May be a single code, a comma-joined string, or an array of codes.
  if (body && body.validationCode) {
    const codes = Array.isArray(body.validationCode)
      ? body.validationCode.map(String)
      : String(body.validationCode)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
    const hints = codes
      .map((c) => MRV_HINTS[c])
      .filter(Boolean)
      .join("; ");
    throw new As504Error(
      `AS504 rejected request [${codes.join(",")}]: ${body.validationDescription || ""}${hints ? " — " + hints : ""}`,
      { code: codes.join(","), httpStatus: res.status, responseBody: body },
    );
  }

  if (res.status !== 200 || !body || !body.response) {
    throw new As504Error(`Unexpected AS504 response (HTTP ${res.status})`, {
      httpStatus: res.status,
      responseBody: body,
      transient: res.status === 429,
    });
  }

  return { httpStatus: res.status, body };
}

/**
 * Extract the Purpose-01 screening result from a successful response.
 */
function parsePurpose01Response(body) {
  const overallStatus = body.response?.overallStatus ?? null;
  const cust = body.response?.customerResponse?.[0] ?? {};
  const purposeRes =
    (cust.purposeResponse || []).find((p) => p.purposeCode === "01") ||
    cust.purposeResponse?.[0] ||
    {};
  const data = purposeRes.data || {};

  return {
    overallStatus, // AcceptedByTW / RejectedByTW
    validationOutcome: cust.validationOutcome ?? null, // Success / Failure
    validationCode: purposeRes.validationCode || null,
    validationDescription: purposeRes.validationDescription || null,
    validationFailureCount: purposeRes.validationFailureCount ?? 0,
    suggestedAction: data.suggestedAction ?? null, // Proceed / Review / Stop
    profileCode: data.profileCode ?? null,
    hitsDetected: data.hitsDetected ?? null, // Yes / No
    hitsCount: data.hitsCount ?? 0,
    confirmedHits: data.confirmedHits ?? null, // Yes / No
    caseId: data.caseId ?? null, // set when hits found
    caseUrl: data.caseUrl ?? null, // TW case manager link
    reportData: data.reportData ?? null, // base64 PDF (nullable)
    hits: (data.hitResponse || []).map((h) => ({
      source: h.source ?? null,
      watchlistSourceId: h.watchlistSourceId ?? null,
      matchType: h.matchType ?? null, // Confirm Hit / Probable Hit
      score: h.score ?? null,
      confirmedMatchingAttributes: h.confirmedMatchingAttributes ?? null,
    })),
  };
}

module.exports = { callAs504, parsePurpose01Response, As504Error, MRV_HINTS };
