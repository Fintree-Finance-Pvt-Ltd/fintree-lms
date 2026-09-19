const express = require("express");
const db = require("../config/db");
const { verifyWebhookHash } = require("../utils/webhookHashVerify");
const { sendLowBalanceAlertMail } = require("../jobs/mailer");
const {
  processEmiClubDisbursement,
  processRapidMoneyDisbursement,
  processCarePayDisbursement,
  processYaMoneyDisbursement,
} = require("../services/processEmiClubDisbursement");
const {
  sendDisbursementWebhook,
  sendRejectionWebhook,
} = require("../routes/switchMyLoan/switchMyLoanWebhook");
const {
  processMandateWebhook,
} = require("../services/easebuzz/easebuzzMandateService");
const partnerLimitService = require("../services/partnerLimitService");
const {
  sendFintreePlDisbursementWebhook,
} = require("../services/payout.service");

const router = express.Router();

async function handleMandateWebhook(req, res) {
  try {
    const result =
      await processMandateWebhook(
        req.body || {},
        req.headers || {},
      );

    if (result.ignored) {
      console.warn(
        "Easebuzz mandate webhook ignored",
        {
          reason: result.reason,
          identifiers:
            result.identifiers,
        },
      );

      return res.status(200).json({
        received: true,
        ignored: true,
        reason: result.reason,
      });
    }

    console.log(
      "Easebuzz mandate webhook processed",
      {
        lan: result.mandate?.lan,
        transactionId:
          result.mandate?.transactionId,
        status:
          result.mandate?.status,
        providerStatus:
          result.mandate?.providerStatus,
        umrn:
          result.mandate?.umrn,
        duplicate:
          result.event?.duplicate,
      },
    );

    return res.status(200).json({
      received: true,
      success: true,
      data: {
        lan: result.mandate?.lan,
        transactionId:
          result.mandate?.transactionId,
        status:
          result.mandate?.status,
        providerStatus:
          result.mandate?.providerStatus,
        umrn:
          result.mandate?.umrn,
        duplicate:
          result.event?.duplicate,
      },
    });
  } catch (error) {
    if (Number(error.statusCode) === 401) {
      console.error(
        "Easebuzz mandate webhook unauthorized",
        {
          message: error.message,
        },
      );

      return res.status(401).json({
        success: false,
        message: error.message,
      });
    }

    console.error(
      "Easebuzz mandate webhook processing error",
      {
        message: error.message,
        stack: error.stack,
      },
    );

    return res.status(500).json({
      success: false,
      message:
        "Mandate webhook processing failed",
    });
  }
}

router.post(
  "/mandate",
  handleMandateWebhook,
);

router.post(
  "/easycollect/mandate",
  handleMandateWebhook,
);

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
          transfer_date,
          amount
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
          disbursementDate: new Date(effectiveTransferDate),
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

      if (transfer.lan?.startsWith("YAM") && effectiveUtr && effectiveTransferDate) {
        const processingResult = await processYaMoneyDisbursement({
          lan: transfer.lan,
          disbursementUTR: effectiveUtr,
          disbursementDate: new Date(effectiveTransferDate),
        });

        console.log("Duplicate callback Ya Money processing result", {
          lan: transfer.lan,
          result: processingResult,
        });
      }

      if (transfer.lan?.startsWith("FINE") && effectiveUtr && effectiveTransferDate) {
        const processingResult = await processEmiClubDisbursement({
          lan: transfer.lan,
          disbursementUTR: effectiveUtr,
          disbursementDate: new Date(effectiveTransferDate),
        });

        console.log("Duplicate callback EmiClub processing result", {
          lan: transfer.lan,
          result: processingResult,
        });

        await partnerLimitService.recordDisbursementUsage(db.promise(), {
          partnerName: "EMICLUB",
          amount: Number(transfer.amount),
          lan: transfer.lan,
        });
      }

      if (transfer.lan?.startsWith("CCB")) {
        await db.promise().query(
          `UPDATE loan_booking_claim_cure_buddy
           SET
             status = 'Disbursed',
             stage = 'Disbursed',
             updated_at = NOW()
           WHERE lan = ?`,
          [transfer.lan],
        );

        await partnerLimitService.recordDisbursementUsage(db.promise(), {
          partnerName: "CLAIM CURE BUDDY",
          amount: Number(transfer.amount),
          lan: transfer.lan,
        });
      }

      /*
       * FTPL / PLP — pure forwarding bridge.
       * Duplicate callbacks are silently ignored;
       * the partner is idempotent on their side.
       */
      if (transfer.lan?.startsWith("FTPL") || transfer.lan?.startsWith("PLP")) {
        console.log("Duplicate Easebuzz payout callback for PLP/FTPL — ignoring", {
          lan: transfer.lan,
          utr: effectiveUtr,
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

        // Welcome letter is now sent inside processRapidMoneyDisbursement
        // itself, right after it commits — that function is the single
        // place every disbursement-completion path (this webhook's
        // main-success branch, its duplicate-callback branch, and
        // payout.service.js's own synchronous success path) converges on,
        // so it only fires once, exactly when the disbursement first
        // actually completes.
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
      } else if (lan?.startsWith("YAM")) {
        const yaMoneyResult = await processYaMoneyDisbursement({
          lan,
          disbursementUTR: effectiveUtr,
          disbursementDate,
        });

        console.log("Ya Money internal processing result", {
          lan,
          utr: effectiveUtr,
          success: yaMoneyResult?.success,
          skipped: yaMoneyResult?.skipped,
          reason: yaMoneyResult?.reason,
        });
      } else if (lan?.startsWith("FINE")) {
        /*
         * EmiClub-specific processing. processEmiClubDisbursement generates
         * the RPS and sends the partner webhook internally (same as the
         * manual UTR upload flow's EmiClub handling in utrRoutes.js) — no
         * separate webhook call needed here, unlike RapidMoney above.
         */
        const emiClubResult = await processEmiClubDisbursement({
          lan,
          disbursementUTR: effectiveUtr,
          disbursementDate,
        });

        console.log("EmiClub internal processing result", {
          lan,
          utr: effectiveUtr,
          success: emiClubResult?.success,
          skipped: emiClubResult?.skipped,
          reason: emiClubResult?.reason,
        });

        await partnerLimitService.recordDisbursementUsage(db.promise(), {
          partnerName: "EMICLUB",
          amount: Number(transfer.amount),
          lan,
        });
      } else if (lan?.startsWith("CCB")) {
        await db.promise().query(
          `UPDATE loan_booking_claim_cure_buddy
           SET
             status = 'Disbursed',
             stage = 'Disbursed',
             updated_at = NOW()
           WHERE lan = ?`,
          [lan],
        );

        console.log("ClaimCureBuddy payout success stored", {
          lan,
          utr: effectiveUtr,
        });

        await partnerLimitService.recordDisbursementUsage(db.promise(), {
          partnerName: "CLAIM CURE BUDDY",
          amount: Number(transfer.amount),
          lan,
        });
      } else if (lan?.startsWith("FTPL") || lan?.startsWith("PLP")) {
        /*
         * FTPL / PLP — pure webhook forwarding bridge.
         *
         * Only forward the disbursal payload to the partner.
         * NO internal processing (RPS, LMS update, status change).
         * The partner system handles everything on their side.
         */
        try {
          const [[plApp]] = await db.promise().query(
            `SELECT selected_offer_tenure, bre_gross_approved_amount
             FROM pl_partner_applications
             WHERE lan = ? LIMIT 1`,
            [lan],
          );

          await sendFintreePlDisbursementWebhook({
            lan,
            utr: effectiveUtr,
            disbursementDate: effectiveTransferDate,
            amount: transfer.amount || (plApp ? plApp.bre_gross_approved_amount : 0),
            tenureDays: plApp ? plApp.selected_offer_tenure : 30,
            eventId: "evt-eb-" + data.unique_request_number,
          });

          console.log("PLP webhook forwarded successfully", {
            lan,
            utr: effectiveUtr,
          });
        } catch (wbErr) {
          console.error("PLP webhook forwarding failed", {
            lan,
            utr: effectiveUtr,
            error: wbErr.message,
          });
        }
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

      if (transfer.lan?.startsWith("RML")) {
        const [[rmlLoan]] = await db.promise().query(
          `SELECT application_id FROM loan_booking_switch_my_loan WHERE lan = ? LIMIT 1`,
          [transfer.lan],
        );

        try {
          await db.promise().query(
            `UPDATE loan_booking_switch_my_loan
             SET status = 'REJECTED',
                 updated_at = NOW()
             WHERE lan = ?`,
            [transfer.lan],
          );

          console.log("Rapid Money loan marked REJECTED after payout failure", {
            lan: transfer.lan,
            reason: data.failure_reason,
          });
        } catch (statusError) {
          console.error("Failed to mark Rapid Money loan REJECTED after payout failure", {
            lan: transfer.lan,
            message: statusError.message,
          });
        }

        if (rmlLoan?.application_id) {
          try {
            const rejectionResult = await sendRejectionWebhook({
              applicationId: rmlLoan.application_id,
            });

            console.log("Rapid Money rejection webhook result (payout failure)", {
              lan: transfer.lan,
              applicationId: rmlLoan.application_id,
              result: rejectionResult,
            });
          } catch (webhookError) {
            console.error("Rapid Money rejection webhook failed (payout failure)", {
              lan: transfer.lan,
              applicationId: rmlLoan.application_id,
              message: webhookError.message,
            });
          }
        } else {
          console.error("Cannot send Rapid Money rejection webhook — application_id missing", {
            lan: transfer.lan,
          });
        }
      }
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

/*
|--------------------------------------------------------------------------
| PL DISBURSAL WEBHOOK FORWARDING
|--------------------------------------------------------------------------
|
| Dedicated endpoint for forwarding FTPL/PLP disbursal confirmations
| to the Personal Loan platform.
|
| When Easebuzz confirms a payout for a PL loan (LAN starting with FTPL
| or PLP), this endpoint can be called to forward the disbursal details
| to: POST https://pl-fintree-uat.fintreelms.com/api/webhooks/lenders/FFPL2026/disbursal
|
| Expects body:
| {
|   "lan": "FTPL00000006",
|   "utr": "UTR1234567890",
|   "disbursementDate": "2026-08-11",
|   "amount": 5000,
|   "tenureDays": 30,
|   "eventId": "optional-event-id"
| }
|
*/
router.post("/pl-disbursal", async (req, res) => {
  try {
    const { lan, utr, disbursementDate, amount, tenureDays, eventId } = req.body || {};

    console.log("📩 PL DISBURSAL WEBHOOK FORWARDING REQUEST:", {
      lan,
      utr,
      disbursementDate,
      amount,
      tenureDays,
      eventId,
    });

    if (!lan || !String(lan).trim()) {
      return res.status(400).json({
        success: false,
        code: "LAN_REQUIRED",
        message: "lan is required",
      });
    }

    const normalizedLan = String(lan).trim().toUpperCase();
    if (!normalizedLan.startsWith("FTPL") && !normalizedLan.startsWith("PLP")) {
      return res.status(422).json({
        success: false,
        code: "INVALID_LAN_PREFIX",
        message: "Only FTPL or PLP loan-account numbers are accepted",
      });
    }

    if (!utr || !String(utr).trim()) {
      return res.status(400).json({
        success: false,
        code: "UTR_REQUIRED",
        message: "utr is required",
      });
    }

    if (!disbursementDate) {
      return res.status(400).json({
        success: false,
        code: "DISBURSEMENT_DATE_REQUIRED",
        message: "disbursementDate is required",
      });
    }

    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({
        success: false,
        code: "INVALID_AMOUNT",
        message: "amount must be a positive number",
      });
    }

    const tenure = Number(tenureDays);
    if (!Number.isInteger(tenure) || tenure <= 0) {
      return res.status(400).json({
        success: false,
        code: "INVALID_TENURE",
        message: "tenureDays must be a positive integer",
      });
    }

    await sendFintreePlDisbursementWebhook({
      lan: normalizedLan,
      utr: String(utr).trim(),
      disbursementDate,
      amount: parsedAmount,
      tenureDays: tenure,
      eventId: eventId || `evt-pl-manual-${Date.now()}`,
    });

    console.log("✅ PL disbursal webhook forwarded successfully", {
      lan: normalizedLan,
      utr,
    });

    return res.status(200).json({
      success: true,
      message: "Disbursal webhook forwarded to PL platform",
      lan: normalizedLan,
      utr: String(utr).trim(),
    });
  } catch (error) {
    console.error("🔥 PL DISBURSAL WEBHOOK FORWARDING ERROR:", {
      code: error.code,
      message: error.message,
      responseStatus: error.response?.status || null,
      responseData: error.response?.data || null,
    });

    return res.status(error.response?.status || 500).json({
      success: false,
      code: "PL_DISBURSAL_WEBHOOK_FAILED",
      message: error.message || "Failed to forward disbursal webhook to PL platform",
      plResponse: error.response?.data || null,
    });
  }
});

module.exports = router;
