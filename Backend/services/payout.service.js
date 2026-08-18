const axios = require("axios");
const crypto = require("crypto");
const db = require("../config/db");

const {
  processEmiClubDisbursement,
  processRapidMoneyDisbursement,
  processLoanDigitDisbursement,
  processFinsoDisbursement,
  processCarePayDisbursement,
} = require("../services/processEmiClubDisbursement");

const { sendDisbursementWebhook } = require("../routes/switchMyLoan/switchMyLoanWebhook");
const {
  processPlPartnerDisbursement,
} = require("../routes/fintreePlPartnerApi/services/plPartnerDisbursement");

const ALLOWED_PAYOUT_TABLES = [
  "loan_booking_emiclub",
  "loan_booking_switch_my_loan",
  "loan_booking_loan_digit",
  "loan_booking_finso",
  "loan_booking_carepay",
  "loan_booking_claim_cure_buddy",
  "pl_partner_applications",
];

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
      SELECT lan, payout_status
      FROM quick_transfers
      WHERE lan = ?
      ORDER BY id DESC
      LIMIT 1
      `,
      [lan],
    );

    if (existingTransfer) {
      const pStatus = String(existingTransfer.payout_status).toUpperCase();
      if (pStatus === "SUCCESS" || pStatus === "INITIATED") {
        console.log(`⛔ Payout already ${pStatus} for LAN: ${lan}`);

        return {
          success: false,
          message: `Payout already exists for this LAN with status: ${pStatus}`,
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
          timeout: 15000,
        },
      );
    }

    console.log("Easebuzz API Response:", response.data);

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
    } else if (table === "loan_booking_loan_digit") {
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
      await db.promise().query(
        `
        UPDATE loan_booking_claim_cure_buddy
        SET
          status = 'Disbursed',
          stage = 'Disbursed',
          updated_at = NOW()
        WHERE lan = ?
        `,
        [lan],
      );
    } else if (table === "pl_partner_applications") {
      try {
        await sendFintreePlDisbursementWebhook({
          lan,
          utr: tr.unique_transaction_reference,
          disbursementDate: tr.transfer_date,
          amount,
          tenureDays: loan.tenure_days,
          eventId: "evt-" + unique_request_number,
        });
      } catch (webhookError) {
        // Notifying the partner must never block RPS generation below — the loan
        // is disbursed either way. Log and continue; the webhook can be resent
        // manually (see sendFintreePlDisbursementWebhook's request body/URL).
        console.error("🔥 Fintree PL disbursement webhook failed (non-blocking)", {
          lan,
          error: webhookError.message,
        });
      }

      await processPlPartnerDisbursement({
        lan,
        disbursementUTR: tr.unique_transaction_reference,
        disbursementDate: new Date(tr.transfer_date),
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

  console.log("📤 Fintree PL disbursement webhook REQUEST:", {
    webhookUrl,
    PLP_BASE_URL: process.env.PLP_BASE_URL || null,
    PLP_DISBURSAL_WEBHOOK_URL: process.env.PLP_DISBURSAL_WEBHOOK_URL || null,
    webhookSecret,
    webhookSecretLength: webhookSecret.length,
    body,
  });

  try {
    await axios.post(webhookUrl, body, {
      headers: {
        "Content-Type": "application/json",
        ...(webhookSecret ? { "x-pl-webhook-secret": webhookSecret } : {}),
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
