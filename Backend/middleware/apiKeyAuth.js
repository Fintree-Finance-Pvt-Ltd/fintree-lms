const db = require("../config/db");

// middleware/verifyApiKey.js
const verifyApiKey = async (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) return res.status(401).json({ message: "API key required" });

  try {
    const [rows] = await db.promise().query(
      "SELECT id, partner_name FROM api_keys WHERE api_key = ? AND status = 'active' LIMIT 1",
      [apiKey]
    );

    if (!rows.length) {
      return res.status(403).json({ message: "Invalid API key" });
    }

    // Attach partner info for downstream routes
    req.partner = {
      id: rows[0].id,
      name: rows[0].partner_name
    };

    next();
  } catch (err) {
    console.error("API key error:", err);
    res.status(500).json({ message: "Internal error" });
  }
};

module.exports = verifyApiKey;
