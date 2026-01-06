const express = require("express");
const db = require("../config/db");
const { verifyWebhookHash } = require("../utils/webhookHashVerify");

const router = express.Router();

router.post("/payout", async (req, res) => {
  const { event, data } = req.body;

  if (!verifyWebhookHash(data)) {
    return res.sendStatus(401);
  }

  /**
   * TRANSFER_INITIATED (once)
   * TRANSFER_STATUS_UPDATE (multiple times)
   */
  await db.promise().query(
    `UPDATE quick_transfers
     SET status=?, failure_reason=?, utr=?, raw_response=?, updated_at=NOW()
     WHERE unique_request_number=?`,
    [
      data.status,
      data.failure_reason || null,
      data.unique_transaction_reference || null,
      JSON.stringify(req.body),
      data.unique_request_number,
    ]
  );

  /**
   * FINAL STATES (AUTO)
   */
  if (data.status === "success") {
    // ✔ Disbursement confirmed
    // ✔ Ledger posting
  }

  if (["failure", "rejected", "reversed"].includes(data.status)) {
    // ✔ Mark failed
    // ✔ Auto retry logic (optional)
  }

  return res.sendStatus(200);
});

module.exports = router;
