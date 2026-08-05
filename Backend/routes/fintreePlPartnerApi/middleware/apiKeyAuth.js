const db = require("../../../config/db");
const { sha256 } = require("../utils/security");
const { PartnerApiError } = require("../utils/partnerApiError");

const parseAllowedIps = (value) => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return String(value)
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
};

const normalizeIp = (value) =>
  String(value || "")
    .replace(/^::ffff:/, "")
    .trim();

const apiKeyAuth = async (req, _res, next) => {
  try {
    const apiKey = String(req.get("x-api-key") || "").trim();

    if (!apiKey) {
      throw new PartnerApiError(
        401,
        "AUTHENTICATION_FAILED",
        "A valid API key is required.",
      );
    }

    const keyHash = sha256(apiKey);
    const [rows] = await db.promise().query(
      `SELECT id, client_code, display_name, status, allowed_ip_addresses
       FROM pl_partner_api_clients
       WHERE api_key_hash = ?
       LIMIT 1`,
      [keyHash],
    );

    if (!rows.length) {
      throw new PartnerApiError(
        401,
        "AUTHENTICATION_FAILED",
        "A valid API key is required.",
      );
    }

    const client = rows[0];
    if (client.status !== "ACTIVE") {
      throw new PartnerApiError(403, "CLIENT_DISABLED", "The partner client is inactive.");
    }

    const allowedIps = parseAllowedIps(client.allowed_ip_addresses);
    if (allowedIps.length > 0) {
      const requestIp = normalizeIp(req.ip || req.socket?.remoteAddress);
      if (!allowedIps.includes(requestIp)) {
        throw new PartnerApiError(403, "IP_NOT_ALLOWED", "The request IP is not allowed.");
      }
    }

    req.partnerClient = {
      id: client.id,
      clientCode: client.client_code,
      displayName: client.display_name,
    };

    return next();
  } catch (error) {
    return next(error);
  }
};

module.exports = apiKeyAuth;
