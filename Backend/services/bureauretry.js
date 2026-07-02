const express = require("express");
const verifyApiKey = require("../middleware/apiKeyAuth");
const db = require("../config/db");
const {
  retriggerBureau,
  PARTNERS,
} = require("../services/bureauRetriggerService");

const router = express.Router();

/**
 * Single retrigger — partner auto-detected from LAN prefix.
 * You can override with ?partner=loan_digit if you ever need to.
 *
 *   POST /bureau/retrigger/:lan
 *   POST /bureau/retrigger/:lan?force=true
 *   POST /bureau/retrigger/:lan?partner=clayyo
 */
router.post("/retrigger/:lan", verifyApiKey, async (req, res) => {
  const { lan } = req.params;
  const force = String(req.query.force || "").toLowerCase() === "true";
  const partnerKey = req.query.partner;

  try {
    const result = await retriggerBureau(lan, {
      forceEvenIfVerified: force,
      partnerKey,
    });

    if (!result.success) {
      return res.status(400).json({
        status: "FAILED",
        lan,
        partner: result.partner,
        message: result.reason,
      });
    }

    return res.json({
      status: "SUCCESS",
      lan,
      partner: result.partner,
      score: result.score,
      note:
        result.reason === "ALREADY_VERIFIED"
          ? "Bureau already verified. Use ?force=true to re-pull."
          : undefined,
    });
  } catch (err) {
    console.error(`retrigger error for ${lan}:`, err);
    return res.status(500).json({
      status: "FAILED",
      message: err.message,
    });
  }
});

/**
 * Bulk retrigger by partner key.
 *
 *   POST /bureau/retrigger-bulk/loan_digit
 *   POST /bureau/retrigger-bulk/clayyo?limit=100
 */
router.post("/retrigger-bulk/:partnerKey", verifyApiKey, async (req, res) => {
  const { partnerKey } = req.params;
  const limit = Math.min(Number(req.query.limit) || 50, 200);

  const partner = PARTNERS[String(partnerKey).toLowerCase()];
  if (!partner) {
    return res
      .status(400)
      .json({ status: "FAILED", message: `Unknown partner: ${partnerKey}` });
  }

  try {
    const [rows] = await db.promise().query(
      `SELECT l.lan
       FROM \`${partner.table}\` l
       LEFT JOIN kyc_verification_status k ON k.lan = l.lan
       WHERE l.status = 'Login'
         AND (k.bureau_status IS NULL OR k.bureau_status IN ('FAILED', 'IN_PROGRESS'))
       ORDER BY l.id DESC
       LIMIT ?`,
      [limit],
    );

    const results = [];
    for (const { lan } of rows) {
      const r = await retriggerBureau(lan, { partnerKey: partner.key });
      results.push({ lan, ...r });
      await new Promise((r) => setTimeout(r, 500));
    }

    return res.json({
      status: "SUCCESS",
      partner: partner.key,
      processed: results.length,
      results,
    });
  } catch (err) {
    console.error(`bulk retrigger error for ${partnerKey}:`, err);
    return res.status(500).json({ status: "FAILED", message: err.message });
  }
});

/**
 * List registered partners — handy for admin UI.
 *
 *   GET /bureau/partners
 */
router.get("/partners", verifyApiKey, (req, res) => {
  const list = Object.values(PARTNERS).map((p) => ({
    key: p.key,
    lanPrefix: p.lanPrefix,
    table: p.table,
  }));
  return res.json({ status: "SUCCESS", partners: list });
});

module.exports = router;