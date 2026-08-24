const db = require("../config/db");
const { approveAndInitiatePayout } = require("./payout.service");

const BOOKING_TABLE = "loan_booking_claim_cure_buddy";
const PAYOUT_TABLE = BOOKING_TABLE;

const clean = (value) => String(value ?? "").trim();
const upper = (value) => clean(value).toUpperCase();

const READY_LOAN_STATUSES = new Set([
  "BRE APPROVED",
  "APPROVED",
  "DISBURSE INITIATE",
]);

const COMPLETED_ESIGN_STATUSES = new Set([
  "SIGNED",
  "COMPLETED",
  "SIGN_COMPLETE",
]);

const ACTIVE_PAYOUT_STATUSES = new Set([
  "INITIATED",
  "PENDING",
  "PROCESSING",
  "QUEUED",
  "SUCCESS",
  "COMPLETED",
  "PROCESSED",
]);

function isClaimCureBuddyLan(lan) {
  return upper(lan).startsWith("CCB");
}

function isAgreementSigned(status) {
  return COMPLETED_ESIGN_STATUSES.has(upper(status));
}

function isMandateComplete(mandate) {
  return Boolean(clean(mandate?.umrn));
}

function isPayoutActiveOrDone(transfer) {
  const payoutStatus = upper(transfer?.payout_status || transfer?.status);

  return ACTIVE_PAYOUT_STATUSES.has(payoutStatus);
}

async function findLatestMandate(connection, lan) {
  const [rows] = await connection.query(
    `SELECT
       id,
       status,
       umrn,
       document_id,
       auth_url
     FROM enach_mandates
     WHERE lan = ?
     ORDER BY
       CASE
         WHEN umrn IS NOT NULL
          AND TRIM(umrn) <> ''
         THEN 0
         ELSE 1
       END,
       CASE
         WHEN UPPER(status) IN (
           'ACTIVE',
           'SUCCESS',
           'REGISTERED',
           'AUTH_SUCCESS',
           'AUTHSUCCESS',
           'APPROVED',
           'COMPLETED'
         )
         THEN 0
         ELSE 1
       END,
       id DESC
     LIMIT 1`,
    [lan],
  );

  return rows[0] || null;
}

async function triggerClaimCureBuddyAutoDisbursement({
  lan,
  source = "UNKNOWN",
  actorId = null,
} = {}) {
  const normalizedLan = upper(lan);

  if (!isClaimCureBuddyLan(normalizedLan)) {
    return {
      success: true,
      skipped: true,
      reason: "NOT_CLAIM_CURE_BUDDY_LAN",
      lan: normalizedLan,
      source,
    };
  }

  const connection = await db.promise().getConnection();
  let shouldInitiatePayout = false;

  try {
    await connection.beginTransaction();

    const [[loan]] = await connection.query(
      `SELECT
         lan,
         status,
         stage,
         bre_status,
         agreement_esign_status,
         disbursal_amount,
         customer_name_as_per_bank,
         customer_account_number,
         bank_ifsc_code
       FROM ${BOOKING_TABLE}
       WHERE lan = ?
       LIMIT 1
       FOR UPDATE`,
      [normalizedLan],
    );

    if (!loan) {
      await connection.commit();

      return {
        success: true,
        skipped: true,
        reason: "LOAN_NOT_FOUND",
        lan: normalizedLan,
        source,
      };
    }

    if (upper(loan.bre_status) !== "APPROVED") {
      await connection.commit();

      return {
        success: true,
        skipped: true,
        reason: "BRE_NOT_APPROVED",
        lan: normalizedLan,
        breStatus: loan.bre_status,
        source,
      };
    }

    if (!READY_LOAN_STATUSES.has(upper(loan.status))) {
      await connection.commit();

      return {
        success: true,
        skipped: true,
        reason: "LOAN_STATUS_NOT_READY",
        lan: normalizedLan,
        status: loan.status,
        source,
      };
    }

    if (!isAgreementSigned(loan.agreement_esign_status)) {
      await connection.commit();

      return {
        success: true,
        skipped: true,
        reason: "AGREEMENT_ESIGN_PENDING",
        lan: normalizedLan,
        agreementStatus: loan.agreement_esign_status,
        source,
      };
    }

    const mandate = await findLatestMandate(connection, normalizedLan);

    if (!isMandateComplete(mandate)) {
      await connection.commit();

      return {
        success: true,
        skipped: true,
        reason: "ENACH_PENDING",
        lan: normalizedLan,
        enachStatus: mandate?.status || "NOT_STARTED",
        source,
      };
    }

    const [[existingTransfer]] = await connection.query(
      `SELECT
         id,
         status,
         payout_status
       FROM quick_transfers
       WHERE lan = ?
       ORDER BY id DESC
       LIMIT 1
       FOR UPDATE`,
      [normalizedLan],
    );

    if (isPayoutActiveOrDone(existingTransfer)) {
      await connection.commit();

      return {
        success: true,
        skipped: true,
        reason: "PAYOUT_ALREADY_INITIATED",
        lan: normalizedLan,
        payoutStatus:
          existingTransfer.payout_status || existingTransfer.status,
        source,
      };
    }

    await connection.query(
      `UPDATE ${BOOKING_TABLE}
       SET
         status = 'Approved',
         stage = 'Disbursement Initiated',
         updated_by = COALESCE(?, updated_by),
         updated_at = NOW()
       WHERE lan = ?`,
      [actorId, normalizedLan],
    );

    shouldInitiatePayout = true;
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  if (!shouldInitiatePayout) {
    return {
      success: true,
      skipped: true,
      reason: "NOT_READY",
      lan: normalizedLan,
      source,
    };
  }

  try {
    const payoutResult = await approveAndInitiatePayout({
      lan: normalizedLan,
      table: PAYOUT_TABLE,
    });

    return {
      success: Boolean(payoutResult?.success),
      skipped: false,
      reason: payoutResult?.success ? null : "PAYOUT_NOT_STARTED",
      lan: normalizedLan,
      source,
      payout: payoutResult,
    };
  } catch (error) {
    console.error("ClaimCureBuddy auto disbursement payout failed", {
      lan: normalizedLan,
      source,
      message: error.message,
      stack: error.stack,
    });

    return {
      success: false,
      skipped: false,
      reason: "PAYOUT_ERROR",
      lan: normalizedLan,
      source,
      message: error.message,
    };
  }
}

module.exports = {
  triggerClaimCureBuddyAutoDisbursement,
  isClaimCureBuddyLan,
  isAgreementSigned,
  isMandateComplete,
};
