const express = require("express");
const db = require("../config/db");
const { verifyWebhookHash } = require("../utils/webhookHashVerify");
const { sendLowBalanceAlertMail } = require("../jobs/mailer");
const {
  processRapidMoneyDisbursement,
  processCarePayDisbursement,
} = require("../services/processEmiClubDisbursement");
const {
  sendDisbursementWebhook,
} = require("../routes/switchMyLoan/switchMyLoanWebhook");

const router = express.Router();
const {
  sendWelcomeLetterAfterUtrUpload,
} = require("../services/welcomeLetterService");

router.post("/payout", async (req, res) => {
  let conn;
  let transactionStarted = false;

  try {
    const { event, data } = req.body || {};

    console.log("Received Payout Webhook:", req.body);

    if (!data || typeof data !== "object") {
      return res.status(400).json({
        success: false,
        message: "Webhook data is required",
      });
    }

    if (!data.unique_request_number) {
      return res.status(400).json({
        success: false,
        message: "unique_request_number is required",
      });
    }

    if (!verifyWebhookHash(data)) {
      console.error("❌ Invalid webhook hash");

      return res.sendStatus(401);
    }

    const normalizedStatus = String(data.status || "")
      .trim()
      .toLowerCase();

    const successStatuses = ["success", "completed", "processed"];

    const isSuccess = successStatuses.includes(normalizedStatus);

    console.log("📩 Payout Webhook Event:", {
      event,
      status: normalizedStatus,
      uniqueRequestNumber: data.unique_request_number,
    });

    conn = await db.promise().getConnection();

    await conn.beginTransaction();
    transactionStarted = true;

    const [[transfer]] = await conn.query(
      `
        SELECT
          lan,
          payout_status,
          utr,
          transfer_date
        FROM quick_transfers
        WHERE unique_request_number = ?
        LIMIT 1
        `,
      [data.unique_request_number],
    );

    if (!transfer) {
      await conn.rollback();
      transactionStarted = false;

      console.error("❌ Transfer not found", {
        uniqueRequestNumber: data.unique_request_number,
      });

      return res.sendStatus(404);
    }

    const existingStatus = String(transfer.payout_status || "")
      .trim()
      .toLowerCase();

    const effectiveUtr =
      data.unique_transaction_reference || transfer.utr || null;

    const effectiveTransferDate =
      data.transfer_date || transfer.transfer_date || null;

    /*
     * Duplicate successful callback.
     *
     * Partner webhook remains idempotent.
     * Internal processing is retried in case
     * it failed after the first callback.
     */
    if (isSuccess && successStatuses.includes(existingStatus)) {
      await conn.rollback();
      transactionStarted = false;

      console.log("Duplicate successful payout callback", {
        lan: transfer.lan,
        utr: effectiveUtr,
      });

      if (transfer.lan?.startsWith("RML") && effectiveUtr && effectiveTransferDate) {
        const webhookResult = await sendDisbursementWebhook({
          lan: transfer.lan,
          transactionId: effectiveUtr,
          disbursementDate: effectiveTransferDate,
        });

        console.log("Rapid Money partner webhook result", {
          lan: transfer.lan,
          utr: effectiveUtr,
          success: webhookResult?.success,
          alreadySent: webhookResult?.alreadySent,
          logId: webhookResult?.logId,
          message: webhookResult?.message,
        });

        if (!webhookResult?.success) {
          console.log("Partner webhook failed and will be retried by cron", {
            lan: transfer.lan,
            logId: webhookResult?.logId,
          });
        }

        const processingResult = await processRapidMoneyDisbursement({
          lan: transfer.lan,
          disbursementUTR: effectiveUtr,
          disbursementDate: effectiveTransferDate,
        });

        console.log("Duplicate callback internal processing result", {
          lan: transfer.lan,
          result: processingResult,
        });
      }

      if (transfer.lan?.startsWith("CARE") && effectiveUtr && effectiveTransferDate) {
        const processingResult = await processCarePayDisbursement({
          lan: transfer.lan,
          disbursementUTR: effectiveUtr,
          disbursementDate: new Date(effectiveTransferDate),
        });

        console.log("Duplicate callback CarePay processing result", {
          lan: transfer.lan,
          result: processingResult,
        });
      }

      return res.sendStatus(200);
    }

    /*
     * Successful payouts must contain
     * UTR and transfer date.
     */
    if (isSuccess && (!effectiveUtr || !effectiveTransferDate)) {
      throw new Error("Successful payout is missing UTR or transfer_date");
    }

    /*
     * This update works for all products.
     */
    await conn.query(
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
        normalizedStatus,
        normalizedStatus,
        data.failure_reason || null,
        effectiveUtr,
        data.queue_on_low_balance ?? 0,
        effectiveTransferDate ? new Date(effectiveTransferDate) : null,
        JSON.stringify(req.body),
        data.unique_request_number,
      ],
    );

    /*
     * Commit Easebuzz callback information
     * before partner webhook or RPS generation.
     */
    await conn.commit();
    transactionStarted = false;

    if (isSuccess) {
      const lan = transfer.lan;

      const disbursementDate = new Date(effectiveTransferDate);

      if (Number.isNaN(disbursementDate.getTime())) {
        throw new Error(`Invalid transfer_date: ${effectiveTransferDate}`);
      }

      /*
       * Rapid Money-specific processing.
       *
       * Other products skip this block and
       * continue without an error.
       */
      if (lan?.startsWith("RML")) {
        /*
         * STEP 1:
         * Easebuzz confirmed money was disbursed.
         * Notify the partner before internal RPS.
         */
        try {
          const webhookResult = await sendDisbursementWebhook({
            lan,
            transactionId: effectiveUtr,
            disbursementDate: effectiveTransferDate,
          });

          console.log("Rapid Money partner webhook result", {
            lan,
            utr: effectiveUtr,
            success: webhookResult?.success,
            alreadySent: webhookResult?.alreadySent,
            logId: webhookResult?.logId,
            message: webhookResult?.message,
          });

          if (!webhookResult?.success) {
            console.log("Partner webhook will be retried by cron", {
              lan,
              logId: webhookResult?.logId,
            });
          }
        } catch (webhookError) {
          /*
           * Continue RPS even if creating the
           * webhook log itself fails.
           */
          console.error("Rapid Money partner webhook error", {
            lan,
            message: webhookError.message,
            stack: webhookError.stack,
          });
        }

        /*
         * STEP 2:
         * Internal RPS, UTR and status processing.
         */
        const rapidMoneyResult = await processRapidMoneyDisbursement({
          lan,
          disbursementUTR: effectiveUtr,
          disbursementDate,
        });

        console.log("Rapid Money internal processing result", {
          lan,
          utr: effectiveUtr,
          success: rapidMoneyResult?.success,
          skipped: rapidMoneyResult?.skipped,
          reason: rapidMoneyResult?.reason,
        });

        /*
         * STEP 3:
         * Welcome letter.
         */
        try {
          const welcomeLetterResult = await sendWelcomeLetterAfterUtrUpload({
            lan,
            utrNumber: effectiveUtr,
          });

          console.log("✅ Welcome Letter Sent", {
            lan,
            utr: effectiveUtr,
            messageId: welcomeLetterResult?.emailMessageId,
            recipient: welcomeLetterResult?.recipient,
          });
        } catch (welcomeLetterError) {
          console.error("❌ Welcome Letter Failed", {
            lan,
            utr: effectiveUtr,
            errorCode: welcomeLetterError?.code || "WELCOME_LETTER_FAILED",
            errorMessage:
              welcomeLetterError?.message || "Unable to send welcome letter",
          });
        }
      } else if (lan?.startsWith("CARE")) {
        const carePayResult = await processCarePayDisbursement({
          lan,
          disbursementUTR: effectiveUtr,
          disbursementDate,
        });

        console.log("CarePay internal processing result", {
          lan,
          utr: effectiveUtr,
          success: carePayResult?.success,
          skipped: carePayResult?.skipped,
          reason: carePayResult?.reason,
        });
      } else {
        /*
         * Remaining products only store
         * quick_transfer success here.
         */
        console.log("Payout success stored for product without final processing hook", {
          lan,
          utr: effectiveUtr,
        });
      }

      console.log("✅ Payout SUCCESS", {
        lan,
        utr: effectiveUtr,
      });
    }

    if (
      ["failure", "failed", "rejected", "reversed"].includes(normalizedStatus)
    ) {
      console.log("❌ Payout FAILED", {
        uniqueRequestNumber: data.unique_request_number,
        status: normalizedStatus,
        reason: data.failure_reason,
      });
    }

    return res.sendStatus(200);
  } catch (error) {
    console.error("Webhook processing error:", {
      message: error.message,
      stack: error.stack,
      responseStatus: error.response?.status || null,
      responseData: error.response?.data || null,
    });

    if (conn && transactionStarted) {
      try {
        await conn.rollback();
        transactionStarted = false;
      } catch (rollbackError) {
        console.error("Webhook rollback failed:", rollbackError.message);
      }
    }

    return res.status(500).json({
      success: false,
      message: "Payout webhook processing failed",
    });
  } finally {
    if (conn) {
      conn.release();
    }
  }
});

router.post("/low-balance", async (req, res) => {
  try {
    const { event, data } = req.body;
    console.log("Received Low Balance Webhook:", req.body);

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
