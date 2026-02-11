// const express = require("express");
// const db = require("../config/db");
// const { verifyWebhookHash } = require("../utils/webhookHashVerify");

// const router = express.Router();

// router.post("/payout", async (req, res) => {
//   const { event, data } = req.body;

//   if (!verifyWebhookHash(data)) {
//     return res.sendStatus(401);
//   }

//   /**
//    * TRANSFER_INITIATED (once)
//    * TRANSFER_STATUS_UPDATE (multiple times)
//    */
//   await db.promise().query(
//     `UPDATE quick_transfers
//      SET status=?, failure_reason=?, utr=?, raw_response=?, updated_at=NOW()
//      WHERE unique_request_number=?`,
//     [
//       data.status,
//       data.failure_reason || null,
//       data.unique_transaction_reference || null,
//       JSON.stringify(req.body),
//       data.unique_request_number,
//     ]
//   );

//   /**
//    * FINAL STATES (AUTO)
//    */
//   if (data.status === "success") {
//     // ✔ Disbursement confirmed
//     // ✔ Ledger posting
//   }

//   if (["failure", "rejected", "reversed"].includes(data.status)) {
//     // ✔ Mark failed
//     // ✔ Auto retry logic (optional)
//   }

//   return res.sendStatus(200);
// });

// module.exports = router;




////////////////////////////////////////////////////////////

const express = require("express");
const db = require("../config/db");
const { verifyWebhookHash } = require("../utils/webhookHashVerify");
const { sendLowBalanceAlertMail } = require("../jobs/mailer");

const router = express.Router();

router.post("/payout", async (req, res) => {
  try {
    const { event, data } = req.body;

    console.log("Received Payout Webhook:", req.body);



    /* ==============================
       1️⃣ Verify webhook signature
    ============================== */
    if (!verifyWebhookHash(data)) {
      console.error("❌ Invalid webhook hash");
      return res.sendStatus(401);
    }

    /* ==============================
       2️⃣ Update payout record
    ============================== */
    await db.promise().query(
      `
      UPDATE quick_transfers
      SET
        status = ?,
        payout_status = ?,
        failure_reason = ?,
        utr = ?,
        queue_on_low_balance = ?,
        transfer_date = ?,
        raw_webhook_response = ?,
        updated_at = NOW()
      WHERE unique_request_number = ?
      `,
      [
        data.status || null,
        data.status || null,
        data.failure_reason || null,
        data.unique_transaction_reference || null,
        data.queue_on_low_balance ?? 0,
        data.transfer_date ? new Date(data.transfer_date) : null,
        JSON.stringify(req.body),
        data.unique_request_number,
      ]
    );

    /* ==============================
       3️⃣ Final state handling
    ============================== */
    if (data.status === "success") {
      // ✅ Money credited
      // ➜ Ledger posting
      // ➜ Loan marked DISBURSED
      // ➜ Accounting entry
      console.log("✅ Payout SUCCESS:", data.unique_request_number);
    }

    if (["failure", "rejected", "reversed"].includes(data.status)) {
      // ❌ Failed payout
      // ➜ Retry logic (cron/manual)
      // ➜ Alert ops team
      console.log("❌ Payout FAILED:", data.unique_request_number);
    }

    return res.sendStatus(200);
  } catch (err) {
    console.error("Webhook processing error:", err);
    return res.sendStatus(500);
  }
});

router.post("/low-balance", async (req, res) => {
  try {
    const { event, data } = req.body;

    if (event !== "LOW_BALANCE_ALERT") {
      return res.status(400).json({ message: "Invalid event type" });
    }

    const {
      balance_amount,
      threshold_amount,
      virtual_account_number,
      virtual_ifsc_number,
    } = data;

    // ✅ Send email
    await sendLowBalanceAlertMail({
      to: process.env.LOW_BALANCE_ALERT_EMAILS, // comma-separated
      balanceAmount: balance_amount,
      thresholdAmount: threshold_amount,
      virtualAccountNumber: virtual_account_number,
      virtualIfscNumber: virtual_ifsc_number,
    });

    // ✅ (Recommended) Save webhook log in DB
    // await saveWebhookLogToDB(req.body);

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Low balance webhook error:", error);
    return res.status(500).json({ success: false });
  }
});

module.exports = router;
