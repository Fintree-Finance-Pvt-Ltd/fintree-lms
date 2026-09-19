const axios = require("axios");
const crypto = require("crypto");
const db = require("../config/db");
const partnerLimitService = require("./partnerLimitService");

const {
  processEmiClubDisbursement,
  processRapidMoneyDisbursement,
  processQuickMoneyDisbursement,
  processLoanDigitDisbursement,
  processFinsoDisbursement,
  processCarePayDisbursement,
  processYaMoneyDisbursement,
} = require("../services/processEmiClubDisbursement");

const { sendDisbursementWebhook } = require("../routes/switchMyLoan/switchMyLoanWebhook");

const {
  processClaimCureBuddyDisbursement,
} = require("./processClaimCureBuddyDisbursement");

const ALLOWED_PAYOUT_TABLES = [
  "loan_booking_emiclub",
  "loan_booking_switch_my_loan",
  "loan_booking_loan_digit",
  "loan_booking_finso",
  "loan_booking_carepay",
  "loan_booking_claim_cure_buddy",
  "pl_partner_applications",
  "loan_booking_quick_money",
  "loan_booking_ya_money",
];

// Per-partner maximum single-payout cap. `null` = no limit configured for
// that partner = unrestricted (default, unchanged behavior). To cap a
// partner, set a number here directly — e.g. loan_booking_emiclub: 75000.
// Checked once per payout, before any money moves.
const PARTNER_MAX_PAYOUT_LIMITS = {
  loan_booking_emiclub: 35000,
  loan_booking_switch_my_loan: 25000,
  loan_booking_loan_digit: 25000,
  loan_booking_finso: 100000,
  loan_booking_carepay: null,
  loan_booking_claim_cure_buddy: null,
  pl_partner_applications: null,
  loan_booking_quick_money: 25000,
  loan_booking_ya_money: null,
};

// Canonical partner_master.partner_name for each product, matching the names
// already used elsewhere in the codebase (switchMyLoanRotues.js/
// quickMoneyRoutes.js's own partner-limit checks, processEmiClubDisbursement.js's
// CarePay/YaMoney tracking) so this shares the same partner_master/
// partner_monthly_limit rows rather than creating duplicates under new names.
const TABLE_TO_PARTNER_NAME = {
  loan_booking_emiclub: "EMICLUB",
  loan_booking_switch_my_loan: "RAPID MONEY",
  loan_booking_loan_digit: "Loan Digit",
  loan_booking_finso: "Finso",
  loan_booking_carepay: "CAREPAY",
  loan_booking_claim_cure_buddy: "CLAIM CURE BUDDY",
  pl_partner_applications: "PL PARTNER",
  loan_booking_quick_money: "QUICK MONEY",
  loan_booking_ya_money: "YAMONEY",
};

// manual_rps_* table backing each partner's live POS (principal outstanding),
// same tables the Partner Limits screen already sums for its POS column. null
// = no known POS source for this product yet = POS limit check is skipped
// (unrestricted) until one exists, same as an unset pos_limit.
const TABLE_TO_POS_TABLE = {
  loan_booking_emiclub: "manual_rps_emiclub",
  loan_booking_switch_my_loan: "manual_rps_switch_my_loan",
  loan_booking_loan_digit: "manual_rps_loan_digit",
  loan_booking_finso: "manual_rps_finso_loan",
  loan_booking_carepay: "manual_rps_carepay",
  loan_booking_claim_cure_buddy: null,
  pl_partner_applications: null,
  loan_booking_quick_money: null,
  loan_booking_ya_money: null,
};

// Rapid Money and Quick Money already run their own pre-transfer disbursement-
// limit check and record usage themselves (in switchMyLoanRotues.js /
// quickMoneyRoutes.js) before this function is even called. Running the new
// centralized disbursement-limit gate for them too would read used_limit
// after their own call already recorded THIS transaction's amount, double-
// counting it against its own headroom. Leave their existing checks as the
// sole gate; only add the new POS-limit gate for them (an entirely new check
// with nothing existing to conflict with).
const DISBURSEMENT_GATE_EXEMPT_TABLES = new Set([
  "loan_booking_switch_my_loan",
  "loan_booking_quick_money",
]);

// Rapid Money, Quick Money, CarePay and YaMoney all already record their own
// disbursement usage (RML/QuickMoney pre-transfer in their routes; CarePay/
// YaMoney post-transfer inside processEmiClubDisbursement.js). Recording
// again here would be a harmless no-op (updateDisbursedLimit dedupes by LAN)
// but is skipped to avoid confusing duplicate audit-trail log noise.
const DISBURSEMENT_RECORD_EXEMPT_TABLES = new Set([
  "loan_booking_switch_my_loan",
  "loan_booking_quick_money",
  "loan_booking_carepay",
  "loan_booking_ya_money",
]);

async function getTableColumnSet(tableName) {
  const [rows] = await db.promise().query(
    `
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ?
    `,
    [tableName],
  );

  return new Set(rows.map((row) => row.COLUMN_NAME));
}

function pickColumn(columns, candidates) {
  return candidates.find((column) => columns.has(column)) || null;
}

function quoteColumn(column) {
  if (!/^[a-zA-Z0-9_]+$/.test(column)) {
    throw new Error(`Invalid column name: ${column}`);
  }

  return `\`${column}\``;
}

function coalesceExpression(columns) {
  return columns
    .map((column) => `NULLIF(TRIM(${quoteColumn(column)}), '')`)
    .join(", ");
}

async function buildYaMoneyPayoutQuery() {
  const tableName = "loan_booking_ya_money";
  const columns = await getTableColumnSet(tableName);

  const beneficiaryColumns = [
    "name_in_bank",
    "bank_account_holder_name",
    "account_holder_name",
    "bank_ac_name",
    "customer_name",
  ].filter((column) => columns.has(column));

  const amountColumn = pickColumn(columns, ["net_disbursement"]);

  const accountColumn = pickColumn(columns, [
    "account_number",
    "bank_account_number",
    "bank_ac_number",
    "customer_account_number",
  ]);

  const ifscColumn = pickColumn(columns, [
    "ifsc",
    "bank_ifsc_code",
    "ifsc_code",
    "bank_ifsc",
  ]);

  const missing = [];

  if (!beneficiaryColumns.length) missing.push("beneficiary name");
  if (!amountColumn) missing.push("net disbursement");
  if (!accountColumn) missing.push("account number");
  if (!ifscColumn) missing.push("IFSC");

  if (missing.length) {
    throw new Error(
      `Ya Money payout columns missing in ${tableName}: ${missing.join(", ")}`,
    );
  }

  return `
    SELECT
      COALESCE(${coalesceExpression(beneficiaryColumns)}) AS beneficiary_name,
      ${quoteColumn(amountColumn)} AS loan_amount,
      ${quoteColumn(accountColumn)} AS account_number,
      ${quoteColumn(ifscColumn)} AS ifsc
    FROM ${tableName}
    WHERE lan = ?
    LIMIT 1
  `;
}

exports.approveAndInitiatePayout = async ({ lan, table }) => {
  try {
    console.log("🚀 Starting payout process for LAN:", lan, table);

    if (!lan) {
      throw new Error("LAN is required");
    }

    if (!ALLOWED_PAYOUT_TABLES.includes(table)) {
      throw new Error(`Invalid payout table: ${table}`);
    }

    const [[existingTransfer]] = await db.promise().query(
      `
      SELECT lan, COALESCE(payout_status, status) AS effective_status
      FROM quick_transfers
      WHERE lan = ?
      ORDER BY id DESC
      LIMIT 1
      `,
      [lan],
    );

    if (existingTransfer) {
      // Check both status and payout_status. The row is inserted with
      // status='INITIATED' *before* the Easebuzz call is made, but
      // payout_status is only set afterward, from the response. If that
      // call times out or errors before a response comes back, payout_status
      // stays NULL forever — checking only payout_status would let a retry
      // silently slip through for a transfer whose outcome is still unknown,
      // risking a real double-disbursement.
      const status = String(existingTransfer.status || "").toUpperCase();
      const pStatus = String(existingTransfer.payout_status || "").toUpperCase();

      if (
        pStatus === "SUCCESS" ||
        pStatus === "INITIATED" ||
        status === "INITIATED"
      ) {
        const reportedStatus = pStatus || status;

        console.log(`⛔ Payout already ${reportedStatus} for LAN: ${lan}`);

        return {
          success: false,
          message: `Payout already exists for this LAN with status: ${reportedStatus}`,
        };
      }
    }

    let loanQuery = "";
    let loanParams = [lan];

    if (table === "loan_booking_emiclub") {
      loanQuery = `
        SELECT
          name_in_bank AS beneficiary_name,
          loan_amount,
          account_number,
          ifsc
        FROM loan_booking_emiclub
        WHERE lan = ?
        LIMIT 1
      `;
    }

    if (table === "loan_booking_switch_my_loan") {
      loanQuery = `
        SELECT
          bank_ac_name AS beneficiary_name,
          disbursal_amount AS loan_amount,
          bank_ac_number AS account_number,
          bank_ifsc_code AS ifsc
        FROM loan_booking_switch_my_loan
        WHERE lan = ?
        LIMIT 1
      `;
    }

    if (table === "loan_booking_quick_money") {
  loanQuery = `
    SELECT
      bank_ac_name AS beneficiary_name,
      disbursal_amount AS loan_amount,
      bank_ac_number AS account_number,
      bank_ifsc_code AS ifsc
    FROM loan_booking_quick_money
    WHERE lan = ?
    LIMIT 1
  `;
}
    if (table === "loan_booking_loan_digit") {
      loanQuery = `
        SELECT
          name_in_bank AS beneficiary_name,
          net_disbursement_amount as loan_amount,
          account_number,
          ifsc
        FROM loan_booking_loan_digit
        WHERE lan = ?
        LIMIT 1
      `;
    }

    if (table === "loan_booking_finso") {
      loanQuery = `
        SELECT
          name_in_bank AS beneficiary_name,
          net_disbursement as loan_amount,
          account_number,
          ifsc
        FROM loan_booking_finso
        WHERE lan = ?
        LIMIT 1
      `;
    }

    if (table === "loan_booking_carepay") {
      loanQuery = `
        SELECT
          h.account_holder_name AS beneficiary_name,
          lb.net_disbursement AS loan_amount,
          h.account_number AS account_number,
          h.ifsc_code AS ifsc
        FROM loan_booking_carepay lb
        INNER JOIN carepay_hospital_booking h
          ON h.lan = lb.hospital_lan
        WHERE lb.lan = ?
        LIMIT 1
      `;
    }

    if (table === "loan_booking_claim_cure_buddy") {
      loanQuery = `
        SELECT
          customer_name_as_per_bank AS beneficiary_name,
          disbursal_amount AS loan_amount,
          customer_account_number AS account_number,
          bank_ifsc_code AS ifsc
        FROM loan_booking_claim_cure_buddy
        WHERE lan = ?
        LIMIT 1
      `;
    }

    if (table === "pl_partner_applications") {
      loanQuery = `
        SELECT
          bank_account_holder_name AS beneficiary_name,
          bre_approved_loan_amount AS loan_amount,
          bank_account_number AS account_number,
          bank_ifsc_code AS ifsc,
          selected_offer_tenure AS tenure_days
        FROM pl_partner_applications
        WHERE lan = ?
        LIMIT 1
      `;
    }

    if (table === "loan_booking_ya_money") {
      loanQuery = await buildYaMoneyPayoutQuery();
    }

    const [[loan]] = await db.promise().query(loanQuery, loanParams);

    if (!loan) {
      throw new Error(`Loan not found: ${lan}`);
    }

    if (!loan.beneficiary_name) {
      throw new Error(`Beneficiary name missing for LAN: ${lan}`);
    }

    if (!loan.account_number) {
      throw new Error(`Account number missing for LAN: ${lan}`);
    }

    if (!loan.ifsc) {
      throw new Error(`IFSC missing for LAN: ${lan}`);
    }

    if (!loan.loan_amount || Number(loan.loan_amount) <= 0) {
      throw new Error(`Invalid loan amount for LAN: ${lan}`);
    }

    const amount = Number(loan.loan_amount);

    // Per-partner max single-payout cap (hardcoded in PARTNER_MAX_PAYOUT_LIMITS
    // above, no DB lookup). null/undefined = no limit configured for this
    // partner = unrestricted, same as before this check existed. Checked
    // before any write (quick_transfers insert, Easebuzz call) so a blocked
    // payout never moves money or leaves a transfer record.
    const maxAllowed = PARTNER_MAX_PAYOUT_LIMITS[table];

    if (maxAllowed !== null && maxAllowed !== undefined) {
      if (amount > Number(maxAllowed)) {
        console.log(
          `⛔ Payout amount ${amount} exceeds max limit ${maxAllowed} for ${table}, LAN: ${lan}`,
        );

        return {
          success: false,
          reason: "MAX_PAYOUT_LIMIT_EXCEEDED",
          message: `Payout amount ₹${amount} exceeds the configured maximum of ₹${maxAllowed} for this partner.`,
        };
      }
    }

    // Centralized partner monthly-disbursement-limit and POS-limit gate,
    // covering every product uniformly. RML/QuickMoney already enforce the
    // disbursement limit themselves upstream (see DISBURSEMENT_GATE_EXEMPT_TABLES
    // above), so only the new POS check runs for them here; everything else
    // gets both checks for the first time. Both checks no-op (unrestricted)
    // for any partner that hasn't had a limit configured yet.
    const gatePartnerName = TABLE_TO_PARTNER_NAME[table];

    if (gatePartnerName) {
      if (!DISBURSEMENT_GATE_EXEMPT_TABLES.has(table)) {
        const disbursementGate =
          await partnerLimitService.checkPartnerDisbursementGate(
            db.promise(),
            { partnerName: gatePartnerName, amount },
          );

        if (disbursementGate.blocked) {
          console.log(
            `⛔ ${disbursementGate.reason} for ${table}, LAN: ${lan}`,
            disbursementGate.message,
          );

          return {
            success: false,
            reason: disbursementGate.reason,
            message: disbursementGate.message,
          };
        }
      }

      const posGate = await partnerLimitService.checkPartnerPosGate(
        db.promise(),
        {
          partnerName: gatePartnerName,
          amount,
          posTableName: TABLE_TO_POS_TABLE[table],
        },
      );

      if (posGate.blocked) {
        console.log(
          `⛔ ${posGate.reason} for ${table}, LAN: ${lan}`,
          posGate.message,
        );

        return {
          success: false,
          reason: posGate.reason,
          message: posGate.message,
        };
      }
    }

    const unique_request_number = `LAN_${lan}_${Date.now()}`;

    await db.promise().query(
      `
      INSERT INTO quick_transfers
        (lan, unique_request_number, amount, status)
      VALUES (?, ?, ?, 'INITIATED')
      `,
      [lan, unique_request_number, amount],
    );

    const raw = [
      process.env.EASEBUZZ_KEY,
      loan.account_number,
      loan.ifsc,
      "",
      unique_request_number,
      amount,
      process.env.EASEBUZZ_SALT,
    ].join("|");

    const authorization = crypto.createHash("sha512").update(raw).digest("hex");

    let response;

    let isTestMode = process.env.ENABLE_REAL_PAYOUT !== "true";


    if (isTestMode) {
      console.log("🧪 TEST MODE ENABLED");

      response = {
        data: {
          success: true,
          data: {
            transfer_request: {
              id: `TEST_${Date.now()}`,
              status: "success",
              transfer_date: new Date().toISOString(),
              unique_transaction_reference: `TESTUTR${Date.now()}`,
              queue_on_low_balance: 0,
            },
          },
        },
      };
    } else {
      response = await axios.post(
        "https://wire.easebuzz.in/api/v1/quick_transfers/initiate/",
        {
          key: process.env.EASEBUZZ_KEY,
          beneficiary_type: "bank_account",
          beneficiary_name: loan.beneficiary_name
            .trim()
            .replace(/\s+/g, " ")
            .toUpperCase(),
          account_number: loan.account_number,
          ifsc: loan.ifsc,
          upi_handle: "",
          unique_request_number,
          payment_mode: "IMPS",
          amount,
        },
        {
          headers: {
            Authorization: authorization,
            "WIRE-API-KEY": process.env.EASEBUZZ_WIRE_API_KEY,
            "Content-Type": "application/json",
          },
          // Was 15s — confirmed a real transfer succeeded on Easebuzz's side
          // after the client had already timed out and given up, leaving the
          // outcome ambiguous in our own system. 45s gives more headroom
          // before we abort, matching the timeout already used for other
          // outbound webhook calls elsewhere in this codebase (30s) plus
          // some margin given this specific endpoint has shown itself to be
          // slower under load.
          timeout: 45000,
        },
      );
    }

    // Was logging the full response.data, which includes the beneficiary's
    // bank account number, IFSC, and name — log only what's actually useful
    // for tracing a payout, not the customer's bank details.
    console.log("Easebuzz API Response:", {
      success: response.data?.success,
      status: response.data?.data?.transfer_request?.status,
      id: response.data?.data?.transfer_request?.id,
      unique_transaction_reference:
        response.data?.data?.transfer_request?.unique_transaction_reference,
      amount: response.data?.data?.transfer_request?.amount,
      failure_reason: response.data?.data?.transfer_request?.failure_reason,
    });

    if (response.data?.success === false) {
      await db.promise().query(
        `
        UPDATE quick_transfers
        SET
          status = 'FAILED',
          failure_reason = ?,
          raw_api_response = ?,
          updated_at = NOW()
        WHERE unique_request_number = ?
        `,
        [
          response.data.message || "API_FAILURE",
          JSON.stringify(response.data),
          unique_request_number,
        ],
      );

      return {
        success: false,
        unique_request_number,
      };
    }

    const tr = response.data?.data?.transfer_request;

    if (!tr) {
      await db.promise().query(
        `
        UPDATE quick_transfers
        SET
          status = 'FAILED',
          failure_reason = ?,
          raw_api_response = ?,
          updated_at = NOW()
        WHERE unique_request_number = ?
        `,
        [
          "INVALID_EASEBUZZ_RESPONSE",
          JSON.stringify(response.data),
          unique_request_number,
        ],
      );

      return {
        success: false,
        unique_request_number,
      };
    }

    const normalizedStatus = String(tr.status || "").toLowerCase();

    await db.promise().query(
      `
      UPDATE quick_transfers
      SET
        status = ?,
        payout_status = ?,
        easebuzz_transfer_id = ?,
        queue_on_low_balance = ?,
        transfer_date = ?,
        raw_api_response = ?,
        utr = ?,
        updated_at = NOW()
      WHERE unique_request_number = ?
      `,
      [
        normalizedStatus,
        normalizedStatus,
        tr.id || null,
        tr.queue_on_low_balance ?? 0,
        tr.transfer_date ? tr.transfer_date.split("T")[0] : null,
        JSON.stringify(response.data),
        tr.unique_transaction_reference || null,
        unique_request_number,
      ],
    );

    /**
     * Do not set Switch My Loan status to "API Approved"
     * because its status column is ENUM and does not allow that value.
     */
    if (table === "loan_booking_emiclub") {
      await db.promise().query(
        `
        UPDATE loan_booking_emiclub
        SET status = 'API Approved'
        WHERE lan = ?
        `,
        [lan],
      );
    }

    // if (table === "loan_booking_switch_my_loan") {
    //   await db.promise().query(
    //     `
    //     UPDATE loan_booking_switch_my_loan
    //     SET status = 'Disbursed'
    //     WHERE lan = ?
    //     `,
    //     [lan]
    //   );
    // }

    console.log("💾 quick_transfers UPDATED", {
      lan,
      unique_request_number,
      payout_status: normalizedStatus,
    });

    const finalSuccessStatuses = ["success", "completed", "processed"];

    if (!finalSuccessStatuses.includes(normalizedStatus)) {
      console.log("⏳ Payout not final yet. RPS will not be generated now.", {
        lan,
        normalizedStatus,
      });

      return {
        success: true,
        unique_request_number,
        payout_status: normalizedStatus,
        message: "Payout initiated but not final yet",
      };
    }

    if (!tr.unique_transaction_reference || !tr.transfer_date) {
      console.warn("⚠️ Missing UTR or transfer date", {
        lan,
        utr: tr.unique_transaction_reference,
        transfer_date: tr.transfer_date,
      });

      return {
        success: false,
        unique_request_number,
        payout_status: normalizedStatus,
        message: "Missing UTR or transfer date",
      };
    }
    if (table === "loan_booking_emiclub") {
      await processEmiClubDisbursement({
        lan,
        disbursementUTR: tr.unique_transaction_reference,
        disbursementDate: new Date(tr.transfer_date),
      });
    } else if (table === "loan_booking_switch_my_loan") {
      const webhookResult =
    await sendDisbursementWebhook({
      lan,
      transactionId:
        tr.unique_transaction_reference,
      disbursementDate:
        tr.transfer_date,
    });

  console.log(
    "Rapid Money webhook result:",
    {
      lan,
      success:
        webhookResult?.success,
      alreadySent:
        webhookResult?.alreadySent,
      logId:
        webhookResult?.logId,
      message:
        webhookResult?.message,
    },
  );
      
      await processRapidMoneyDisbursement({
        lan,
        disbursementUTR: tr.unique_transaction_reference,
        disbursementDate: new Date(tr.transfer_date),
      });
    }else if (table === "loan_booking_quick_money") {

  if (
    String(tr.status).toLowerCase() === "success"
  ) {

    console.log(
      "[QUICK MONEY] Easebuzz payout successful",
      {
        lan,
        utr: tr.unique_transaction_reference,
        transferDate: tr.transfer_date,
      },
    );

    // 1. Send Disbursed webhook
    const webhookResult =
      await sendQuickMoneyDisbursementWebhook({
        lan,
        transactionId:
          tr.unique_transaction_reference,
        disbursementDate:
          new Date(tr.transfer_date),
      });

    console.log(
      "[QUICK MONEY] Disbursement webhook result:",
      webhookResult,
    );

    // 2. Generate RPS + UTR + update status
    await processQuickMoneyDisbursement({
      lan,
      disbursementUTR:
        tr.unique_transaction_reference,
      disbursementDate:
        new Date(tr.transfer_date),
    });

  } else {

    // ============================================
    // EASEBUZZ PAYOUT FAILED
    // ============================================

    console.log(
      "[QUICK MONEY] Easebuzz payout failed",
      {
        lan,
        status: tr.status,
        transactionReference:
          tr.unique_transaction_reference,
        transferRequest: tr,
      },
    );

    const rejectionResult =
      await sendQuickMoneyRejectionWebhook({
        applicationId:
          loan.application_id,
      });

    console.log(
      "[QUICK MONEY] Rejection webhook result:",
      rejectionResult,
    );
  }
}
     else if (table === "loan_booking_loan_digit") {
      await processLoanDigitDisbursement({
        lan,
        disbursementUTR: tr.unique_transaction_reference,
        disbursementDate: new Date(tr.transfer_date),
      });
    } else if (table === "loan_booking_finso") {
      await processFinsoDisbursement({
        lan,
        disbursementUTR: tr.unique_transaction_reference,
        disbursementDate: new Date(tr.transfer_date),
      });
    } else if (table === "loan_booking_carepay") {
      await processCarePayDisbursement({
        lan,
        disbursementUTR: tr.unique_transaction_reference,
        disbursementDate: new Date(tr.transfer_date),
      });
    } else if (table === "loan_booking_claim_cure_buddy") {
      await processClaimCureBuddyDisbursement({
        lan,
        disbursementUTR: tr.unique_transaction_reference,
        disbursementDate: new Date(tr.transfer_date),
      });
    } else if (table === "loan_booking_ya_money") {
      await processYaMoneyDisbursement({
        lan,
        disbursementUTR: tr.unique_transaction_reference,
        disbursementDate: new Date(tr.transfer_date),
      });
    } else if (table === "pl_partner_applications") {
      /*
       * FTPL / PLP — pure webhook forwarding bridge.
       * Only forward the disbursal payload to the partner.
       * NO internal processing (RPS, LMS update, status change).
       */
      try {
        await sendFintreePlDisbursementWebhook({
          lan,
          utr: tr.unique_transaction_reference,
          disbursementDate: tr.transfer_date,
          amount,
          tenureDays: loan.tenure_days,
          eventId: "evt-" + unique_request_number,
        });

        console.log("PLP webhook forwarded successfully", {
          lan,
          utr: tr.unique_transaction_reference,
        });
      } catch (webhookError) {
        console.error("PLP webhook forwarding failed", {
          lan,
          utr: tr.unique_transaction_reference,
          error: webhookError.message,
        });
      }
    }

    // Record usage against the partner's monthly disbursement limit for
    // products that don't already track it themselves (see
    // DISBURSEMENT_RECORD_EXEMPT_TABLES above). No-ops if no limit has been
    // configured for this partner/month yet.
    if (
      gatePartnerName &&
      !DISBURSEMENT_RECORD_EXEMPT_TABLES.has(table)
    ) {
      await partnerLimitService.recordDisbursementUsage(db.promise(), {
        partnerName: gatePartnerName,
        amount,
        lan,
      });
    }

    console.log("🎉 PAYOUT FLOW COMPLETE", {
      lan,
      unique_request_number,
      payout_status: normalizedStatus,
    });

    return {
      success: true,
      unique_request_number,
      payout_status: tr.status,
    };
  } catch (err) {
    console.error("🔥 approveAndInitiatePayout ERROR", {
      lan,
      table,
      error: err.message,
      stack: err.stack,
    });

    throw err;
  }
};

async function sendFintreePlDisbursementWebhook({
  lan,
  utr,
  disbursementDate,
  amount,
  tenureDays,
  eventId,
}) {
  if (!Number.isInteger(tenureDays) || tenureDays <= 0) {
    throw new Error("Invalid repayment tenure for LAN: " + lan);
  }

  const baseUrl = String(process.env.PLP_BASE_URL || "")
    .trim()
    .replace(/\/+$/, "");
  const webhookUrl =
    String(process.env.PLP_DISBURSAL_WEBHOOK_URL || "").trim() ||
    (baseUrl ? baseUrl + "/api/webhooks/lenders/FFPL2026/disbursal" : "");

  if (!webhookUrl) {
    throw new Error(
      "PLP_DISBURSAL_WEBHOOK_URL or PLP_BASE_URL is required for partner disbursement.",
    );
  }

  const parsedDisbursementDate = new Date(disbursementDate);
  if (Number.isNaN(parsedDisbursementDate.getTime())) {
    throw new Error("Invalid disbursement date for LAN: " + lan);
  }

  const disbursementDateOnly = parsedDisbursementDate.toISOString().split("T")[0];
  const firstRepayment = new Date(disbursementDateOnly + "T00:00:00.000Z");
  firstRepayment.setUTCDate(firstRepayment.getUTCDate() + tenureDays);

  const body = {
    lan,
    utr,
    disbursement_date: disbursementDateOnly,
    amount: String(amount),
    firstRepaymentDate: firstRepayment.toISOString().split("T")[0],
    status: "SUCCESS",
    eventId,
  };

  const webhookSecret = String(process.env.PLP_DISBURSAL_WEBHOOK_SECRET || "").trim();

  // Was logging webhookSecret in plaintext — keep only whether it's
  // configured and its length, never the value itself.
  console.log("📤 Fintree PL disbursement webhook REQUEST:", {
    webhookUrl,
    webhookSecretConfigured: Boolean(webhookSecret),
    webhookSecretLength: webhookSecret.length,
    body,
  });

  try {
    await axios.post(webhookUrl, body, {
      headers: {
        "Content-Type": "application/json",
        ...(webhookSecret
          ? {
              "x-pl-webhook-secret": webhookSecret,
              "x-lender-webhook-secret": webhookSecret,
              "x-disbursal-webhook-secret": webhookSecret,
              "x-webhook-secret": webhookSecret,
            }
          : {}),
      },
      timeout: 15000,
    });
  } catch (err) {
    console.error("📥 Fintree PL disbursement webhook RESPONSE (failure):", {
      webhookUrl,
      status: err.response?.status || null,
      statusText: err.response?.statusText || null,
      responseHeaders: err.response?.headers || null,
      responseData: err.response?.data || null,
      errorMessage: err.message,
    });
    throw err;
  }

  console.log("Fintree PL disbursement webhook sent:", {
    lan,
    webhookUrl,
    eventId,
  });
}
exports.sendFintreePlDisbursementWebhook = sendFintreePlDisbursementWebhook;
