// Resolves the real caller IP from x-real-ip (set by nginx from its own
// $remote_addr) instead of req.ip, which just reflects the proxy's own
// loopback connection since the app has no `trust proxy` config.
//
// Deliberately does NOT fall back to x-forwarded-for: that header can carry
// a client-supplied value nginx only appends to ($proxy_add_x_forwarded_for),
// not replaces, so its first entry is attacker-controlled. Trusting it as a
// fallback let a request with no x-real-ip at all forge any IP it wanted and
// walk straight through the whitelist (confirmed in testing) — only
// x-real-ip and the raw socket address are safe to trust here.
function getClientIp(req) {
  const headerIp = req.headers["x-real-ip"];
  const raw = String(headerIp || req.socket?.remoteAddress || "").trim();
  return raw.replace(/^::ffff:/, "") || null;
}

module.exports = { getClientIp };
