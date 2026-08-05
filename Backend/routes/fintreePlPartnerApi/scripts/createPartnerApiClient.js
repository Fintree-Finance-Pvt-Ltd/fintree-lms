const crypto = require("crypto");
const db = require("../../../config/db");

async function main() {
  const clientCode = String(process.env.PLP_PARTNER_CLIENT_CODE || "FINTREE_PLP").trim();
  const displayName = String(
    process.env.PLP_PARTNER_CLIENT_NAME || "Fintree Personal Loan Platform",
  ).trim();
  const apiKey = String(process.env.PLP_PARTNER_API_KEY || "").trim();

  if (!apiKey || apiKey.length < 32) {
    throw new Error("PLP_PARTNER_API_KEY must contain at least 32 random characters.");
  }

  const apiKeyHash = crypto.createHash("sha256").update(apiKey).digest("hex");

  await db.promise().query(
    `INSERT INTO pl_partner_api_clients
     (client_code, display_name, api_key_hash, status, created_at, updated_at)
     VALUES (?, ?, ?, 'INACTIVE', NOW(), NOW())
     ON DUPLICATE KEY UPDATE
       display_name = VALUES(display_name),
       api_key_hash = VALUES(api_key_hash),
       updated_at = NOW()`,
    [clientCode, displayName, apiKeyHash],
  );

  console.log("Partner API client created/updated as INACTIVE:", { clientCode });
  console.log("Activate only after contract testing:");
  console.log(
    `UPDATE pl_partner_api_clients SET status='ACTIVE' WHERE client_code='${clientCode.replace(/'/g, "''")}';`,
  );
}

main()
  .catch((error) => {
    console.error("Partner API client creation failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await db.promise().end();
    } catch {}
  });
