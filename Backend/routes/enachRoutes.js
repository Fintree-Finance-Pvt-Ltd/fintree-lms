// Backend/routes/enachRoutes.js
const express = require("express");
const db = require("../config/db");
const authenticateUser = require("../middleware/verifyToken");
const {
  verifyBankAccount,
  fuzzyMatch,
} = require("../services/bankVerificationService");
const digio = require("../services/digioClient");
//const { verifyBank, performFuzzyMatch, createMandate } = require("../services/enachService");

const router = express.Router();

/**
 * Utility: update both loan tables
 */
async function updateLoanTablestatus(query, params) {
  await Promise.all([
    db.promise().query(query.replace("__TABLE__", "loan_booking_helium"), params),
    db.promise().query(query.replace("__TABLE__", "loan_booking_clayyo"), params),
    db.promise().query(query.replace("__TABLE__", "loan_booking_motion_corp"), params),
    db.promise().query(
      query.replace("__TABLE__", "loan_booking_zypay_customer"),
      params
    ),
  ]);
}

async function updateLoanTables({
  lan,
  bank_name,
  beneficiary_name,
  account_no,
  ifsc,
}) {
  const tableConfigs = [
    {
      table: "loan_booking_helium",
      fields: {
        bank_name: "bank_name",
        beneficiary_name: "name_in_bank",
        account_no: "account_number",
        ifsc: "ifsc",
      },
    },
    {
      table: "loan_booking_clayyo",
      fields: {
        bank_name: "bank_name",
        beneficiary_name: "name_in_bank",
        account_no: "account_number",
        ifsc: "ifsc",
      },
    },
    {
      table: "loan_booking_zypay_customer",
      fields: {
        bank_name: "bank_name",
        beneficiary_name: "name_in_bank",
        account_no: "account_number",
        ifsc: "ifsc",
      },
    },
    {
      table: "loan_booking_motion_corp",
      fields: {
        bank_name: "customer_bank_name",
        beneficiary_name: "customer_name_as_per_bank",
        account_no: "customer_account_number",
        ifsc: "bank_ifsc_code",
      },
    },
  ];
  await Promise.all(
    tableConfigs.map(({ table, fields }) => {
      const sql = ` UPDATE ${table} SET ${fields.bank_name} = ?, ${fields.beneficiary_name} = ?, ${fields.account_no} = ?, ${fields.ifsc} = ?, bank_status = 'VERIFIED' WHERE lan = ? `;
      return db
        .promise()
        .query(sql, [
          bank_name || null,
          beneficiary_name || null,
          account_no,
          ifsc,
          lan,
        ]);
    }),
  );
}

/**
 * POST /api/enach/verify-bank
 */
router.post("/verify-bank", authenticateUser, async (req, res) => {
  try {
    const {
      lan,
      account_no,
      ifsc,
      name,
      bank_name,
      account_type,
      mandate_amount,
    } = req.body;

    if (!lan || !account_no || !ifsc || !name) {
      return res
        .status(400)
        .json({ message: "lan, account_no, ifsc and name are required" });
    }

    const pennyAmount = Number(process.env.DIGIO_PENNY_AMOUNT || "1.00");

    // 1️⃣ Penny drop
    const response = await verifyBankAccount({
      accountNo: account_no,
      ifsc,
      name,
      amount: pennyAmount,
    });

    // 2️⃣ Store verification
    await db.promise().query(
      `INSERT INTO bank_verification
       (lan, account_no, ifsc, verified, verified_at,
        bank_name, bank_beneficiary_name, fuzzy_match_score, raw_response,
        account_type, mandate_amount)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         account_no = VALUES(account_no),
         ifsc = VALUES(ifsc),
         verified = VALUES(verified),
         verified_at = VALUES(verified_at),
         bank_name = VALUES(bank_name),
         bank_beneficiary_name = VALUES(bank_beneficiary_name),
         fuzzy_match_score = VALUES(fuzzy_match_score),
         raw_response = VALUES(raw_response),
         account_type = VALUES(account_type),
         mandate_amount = VALUES(mandate_amount)`,
      [
        lan,
        account_no,
        ifsc,
        response.verified ? 1 : 0,
        response.verified_at || null,
        bank_name || null,
        response.beneficiary_name_with_bank || name || null,
        typeof response.fuzzy_match_score === "number"
          ? response.fuzzy_match_score
          : null,
        JSON.stringify(response),
        account_type || null,
        mandate_amount || null,
      ],
    );

    // 3️⃣ Fail fast
    if (!response.verified) {
      return res.json({
        success: false,
        lan,
        verified: false,
        fuzzy_match_score: response.fuzzy_match_score ?? null,
        provider_id: response.id,
        raw: response,
      });
    }

    // 4️⃣ Update loan tables
    await updateLoanTables({
      lan,
      bank_name,
      beneficiary_name: name || response.beneficiary_name_with_bank || null,
      account_no,
      ifsc,
    });

    res.json({
      success: true,
      lan,
      verified: true,
      fuzzy_match_score: response.fuzzy_match_score ?? null,
      provider_id: response.id,
      raw: response,
    });
  } catch (err) {
    console.error("❌ Bank verification error:", err);
    res.status(500).json({
      success: false,
      message: "Bank verification failed",
      error: err.response?.data || err.message,
    });
  }
});

/**
 * POST /api/enach/fuzzy-match
 */
router.post("/fuzzy-match", authenticateUser, async (req, res) => {
  try {
    const { lan, context, sourceText, targetText, confidence } = req.body;

    if (!sourceText || !targetText) {
      return res
        .status(400)
        .json({ message: "sourceText & targetText are required" });
    }

    const response = await fuzzyMatch({
      context: context || "Name",
      sourceText,
      targetText,
      confidence,
    });

    if (lan) {
      await db.promise().query(
        `INSERT INTO fuzzy_match_logs
         (lan, context, matched, score, source_text, target_text, raw_response, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          lan,
          context || "Name",
          response.matched ? 1 : 0,
          response.match_score ?? null,
          sourceText,
          targetText,
          JSON.stringify(response),
        ],
      );
    }

    res.json({
      success: true,
      lan,
      matched: response.matched,
      score: response.match_score,
      raw: response,
    });
  } catch (err) {
    console.error("❌ Fuzzy match error:", err);
    res.status(500).json({
      success: false,
      message: "Fuzzy match failed",
      error: err.response?.data || err.message,
    });
  }
});

/**
 * POST /api/enach/create-mandate
 */
router.post("/create-mandate", authenticateUser, async (req, res) => {
  try {
    const {
      lan,
      customer_identifier,
      amount,
      start_date,
      end_date,
      frequency,
      account_no,
      ifsc,
      account_type,
      name_in_bank,
      bank_name,
    } = req.body;

    if (!lan || !customer_identifier || !amount || !account_no || !ifsc) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const payload = {
      customer_identifier,
      auth_mode: "api",
      mandate_type: "create",
      corporate_config_id: process.env.DIGIO_CORPORATE_CONFIG_ID,
      notify_customer: true,
      include_authentication_url: true,
      mandate_data: {
        maximum_amount: Number(amount),
        instrument_type: "debit",
        first_collection_date:
          start_date || new Date().toISOString().slice(0, 10),
        final_collection_date: end_date || undefined,
        is_recurring: true,
        frequency: frequency || "Monthly",
        management_category: "L001",
        name_in_bank,
        customer_account_number: account_no,
        customer_account_type: account_type || "savings",
        destination_bank_id: ifsc,
        destination_bank_name: bank_name,
        customer_ref_number: lan,
        scheme_ref_number: lan,
      },
    };

    Object.keys(payload.mandate_data).forEach(
      (k) =>
        payload.mandate_data[k] === undefined && delete payload.mandate_data[k],
    );

    const resp = await digio.post("/v3/client/mandate/create_form", payload);
    const data = resp.data;

    await db.promise().query(
      `INSERT INTO enach_mandates
       (lan, document_id, customer_identifier, status, mandate_amount,
        account_no, ifsc, account_type, bank_name, auth_url, raw_response)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         status = VALUES(status),
         auth_url = VALUES(auth_url),
         raw_response = VALUES(raw_response)`,
      [
        lan,
        data.id,
        customer_identifier,
        data.state || "partial",
        amount,
        account_no,
        ifsc,
        account_type,
        bank_name,
        data.authentication_url || data.url || null,
        JSON.stringify(data),
      ],
    );

    await updateLoanTablestatus(
      `UPDATE __TABLE__ SET bank_status='MANDATE_INITIATED' WHERE lan=?`,
      [lan],
    );

    res.json({
      success: true,
      lan,
      documentId: data.id,
      status: data.state,
      auth_url: data.authentication_url || data.url,
    });
  } catch (err) {
    console.error("❌ Mandate error:", err);
    res.status(500).json({
      success: false,
      error: err.response?.data || err.message,
    });
  }
});

/**
 * Digio Webhook
 */
router.post("/webhooks/digio-mandate", async (req, res) => {
  try {
    const event = req.body;
    const { status, data } = event;

    if (status === "Success" && data) {
      await db.promise().query(
        `UPDATE enach_mandates
         SET status=?, umrn=?, webhook_payload=?
         WHERE document_id=?`,
        [
          data.registrationStatus || "SUCCESS",
          data.umrn || null,
          JSON.stringify(event),
          data.documentId,
        ],
      );

      await updateLoanTablestatus(
        `UPDATE __TABLE__ SET bank_status='MANDATE_CREATED' WHERE lan=?`,
        [data.customer_ref_number],
      );
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error("❌ Webhook error:", err);
    res.status(200).json({ received: true, error: true });
  }
});

module.exports = router;
