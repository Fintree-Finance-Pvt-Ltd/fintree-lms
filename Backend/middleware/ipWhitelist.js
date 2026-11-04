const { getClientIp } = require("../utils/clientIp");

// Factory so RapidMoney and QuickMoney each get their own whitelist env var.
// Add more IPs by editing the env var (comma-separated) and restarting PM2 —
// no code/DB change needed.
function createIpWhitelistMiddleware(envVarName, productLabel) {
  return function ipWhitelistMiddleware(req, res, next) {
    const allowedIps = String(process.env[envVarName] || "")
      .split(",")
      .map((ip) => ip.trim())
      .filter(Boolean);

    if (!allowedIps.length) {
      console.error(
        `[${productLabel} IP WHITELIST] ${envVarName} is not set — blocking all requests until it is configured.`,
      );
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    const clientIp = getClientIp(req);

    if (!clientIp || !allowedIps.includes(clientIp)) {
      console.error(
        `[${productLabel} IP WHITELIST] Blocked request from non-whitelisted IP:`,
        clientIp,
      );
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    next();
  };
}

module.exports = createIpWhitelistMiddleware;
