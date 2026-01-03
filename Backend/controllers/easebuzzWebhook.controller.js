const db = require("../config/db");
const { verifyEasebuzzWebhookHash } = require("../utils/easebuzzHash.util");

const FINAL_STATES = ["SUCCESS", "FAILED", "REVERSED"];

const mapStatus = (status) => {
  if (status === "success") return "SUCCESS";
  if (status === "failure" || status === "rejected") return "FAILED";
  if (status === "reversed") return "REVERSED";
  if (status === "in_process") return "IN_PROCESS";
  return "PENDING"; // accepted, pending
};

exports.easebuzzPayoutWebhook = async (req, res) => {
  try {
    const { event, data } = req.body;

    if (!data?.id) {
      return res.sendStatus(200);
    }

    // 1️⃣ Verify hash
    const isValid = verifyEasebuzzWebhookHash({
      key: process.env.EASEBUZZ_WIRE_KEY,
      beneficiary_account_number: data.beneficiary_account_number || "",
      ifsc: data.beneficiary_account_ifsc || "",
      upi_handle: data.beneficiary_upi_handle || "",
      unique_request_number: data.unique_request_number,
      amount: data.amount,
      unique_transaction_reference: data.unique_transaction_reference || "",
      status: data.status,
      salt: process.env.EASEBUZZ_WIRE_SALT,
      receivedHash: data.Authorization,
    });

    if (!isValid) {
      console.error("❌ Invalid Easebuzz webhook hash");
      return res.sendStatus(401);
    }

    const transactionId = data.id;
    const newStatus = mapStatus(data.status);

    // 2️⃣ Fetch existing payout
    const [[existing]] = await db.promise().query(
      `SELECT status FROM payouts WHERE transaction_id = ?`,
      [transactionId]
    );

    // 3️⃣ If not exists → create on TRANSFER_INITIATED
    if (!existing && event === "TRANSFER_INITIATED") {
      await db.promise().query(
        `
        INSERT INTO payouts
        (transaction_id, unique_request_number, amount, status, message, utr)
        VALUES (?, ?, ?, ?, ?, ?)
        `,
        [
          transactionId,
          data.unique_request_number,
          data.amount,
          newStatus,
          data.failure_reason || null,
          data.unique_transaction_reference || null,
        ]
      );

      return res.sendStatus(200);
    }

    // 4️⃣ Ignore unknown payouts
    if (!existing) {
      return res.sendStatus(200);
    }

    // 5️⃣ Do NOT downgrade final states
    if (FINAL_STATES.includes(existing.status)) {
      return res.sendStatus(200);
    }

    // 6️⃣ Update payout status
    await db.promise().query(
      `
      UPDATE payouts
      SET status = ?, message = ?, utr = ?, updated_at = NOW()
      WHERE transaction_id = ?
      `,
      [
        newStatus,
        data.failure_reason || null,
        data.unique_transaction_reference || null,
        transactionId,
      ]
    );

    return res.sendStatus(200);
  } catch (err) {
    console.error("Webhook processing error:", err);
    return res.sendStatus(200); // NEVER retry from Easebuzz
  }
};
