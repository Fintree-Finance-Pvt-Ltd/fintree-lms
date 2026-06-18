// const db = require("../../config/db");

// const {
//   PAYU_CONFIG,
//   generateTxnId,
//   formatAmount,
//   addDays,
//   addYears,
//   todayDate,
//   stringifyStable,
//   generateConsentHash,
//   verifyPayuResponseHash,
// } = require("./payu.helper");

// function clean(value) {
//   if (value === undefined || value === null) return "";
//   return String(value).trim();
// }

// function isValidDate(value) {
//   return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
// }

// exports.createConsent = async (req, res) => {
//   try {
//     const {
//       user_id,
//       plan_id,

//       name,
//       lastname,
//       email,
//       phone,
//       amount,

//       billing_cycle = "MONTHLY",
//       billing_interval = 1,
//       payment_start_date,
//       payment_end_date,

//       payment_mode = "ENACH",

//       // ENACH fields
//       bankcode,
//       account_number,
//       account_type,
//       ifsc_code,
//       verification_mode,

//       // UPI collect field
//       vpa,
//     } = req.body;

//     if (!PAYU_CONFIG.key || !PAYU_CONFIG.salt) {
//       return res.status(500).json({
//         success: false,
//         message: "PAYU_KEY or PAYU_SALT missing in environment",
//       });
//     }

//     if (!process.env.BASE_URL || !process.env.FRONTEND_URL) {
//       return res.status(500).json({
//         success: false,
//         message: "BASE_URL or FRONTEND_URL missing in environment",
//       });
//     }

//     if (!user_id || !name || !email || !phone || !amount) {
//       return res.status(400).json({
//         success: false,
//         message: "user_id, name, email, phone and amount are required",
//       });
//     }

//     const mode = clean(payment_mode).toUpperCase();

//     if (!["ENACH", "UPI_INTENT", "UPI_COLLECT", "HOSTED"].includes(mode)) {
//       return res.status(400).json({
//         success: false,
//         message:
//           "payment_mode must be ENACH, UPI_INTENT, UPI_COLLECT or HOSTED",
//       });
//     }

//     const billingCycle = clean(billing_cycle).toUpperCase();
//     const billingInterval = Number(billing_interval);

//     if (!Number.isInteger(billingInterval) || billingInterval < 1) {
//       return res.status(400).json({
//         success: false,
//         message: "billing_interval must be a positive integer",
//       });
//     }

//     const recurringAmount = formatAmount(amount);

//     if (Number(recurringAmount) <= 0) {
//       return res.status(400).json({
//         success: false,
//         message: "amount must be greater than 0",
//       });
//     }

//     if (
//       ["UPI_INTENT", "UPI_COLLECT"].includes(mode) &&
//       Number(recurringAmount) > 15000
//     ) {
//       return res.status(400).json({
//         success: false,
//         message: "UPI recurring billing amount cannot be more than 15000",
//       });
//     }

//     const txnid = generateTxnId("CONSENT");

//     let startDate;

//     if (payment_start_date) {
//       if (!isValidDate(payment_start_date)) {
//         return res.status(400).json({
//           success: false,
//           message: "payment_start_date must be YYYY-MM-DD",
//         });
//       }

//       startDate = payment_start_date;
//     } else {
//       startDate = mode === "ENACH" ? addDays(1) : todayDate();
//     }

//     let endDate = payment_end_date || addYears(1);

//     if (!isValidDate(endDate)) {
//       return res.status(400).json({
//         success: false,
//         message: "payment_end_date must be YYYY-MM-DD",
//       });
//     }

//     if (endDate <= startDate) {
//       return res.status(400).json({
//         success: false,
//         message: "payment_end_date must be after payment_start_date",
//       });
//     }

//     const siDetails = {
//       billingAmount: recurringAmount,
//       billingCurrency: "INR",
//       billingCycle,
//       billingInterval,
//       paymentStartDate: startDate,
//       paymentEndDate: endDate,
//       remarks: `${mode} Subscription Mandate`,
//     };

//     const siDetailsString = stringifyStable(siDetails);

//     let paymentSpecificParams = {};
//     let savedBankCode = null;

//     if (mode === "ENACH") {
//       if (!bankcode || !account_number || !account_type || !ifsc_code) {
//         return res.status(400).json({
//           success: false,
//           message:
//             "For ENACH, bankcode, account_number, account_type and ifsc_code are required",
//         });
//       }

//       const beneficiarydetail = {
//         beneficiaryName: `${clean(name)} ${clean(lastname)}`.trim(),
//         beneficiaryAccountNumber: clean(account_number),
//         beneficiaryAccountType: clean(account_type).toUpperCase(),
//         beneficiaryIfscCode: clean(ifsc_code).toUpperCase(),
//       };

//       if (verification_mode) {
//         beneficiarydetail.verificationMode = clean(
//           verification_mode
//         ).toUpperCase();
//       }

//       paymentSpecificParams = {
//         pg: "ENACH",
//         bankcode: clean(bankcode),
//         beneficiarydetail: stringifyStable(beneficiarydetail),
//       };

//       savedBankCode = clean(bankcode);
//     }

//     if (mode === "UPI_COLLECT") {
//       if (!vpa) {
//         return res.status(400).json({
//           success: false,
//           message: "For UPI_COLLECT, vpa is required",
//         });
//       }

//       paymentSpecificParams = {
//         pg: "UPI",
//         bankcode: "UPI",
//         vpa: clean(vpa),
//       };

//       savedBankCode = "UPI";
//     }

//     if (mode === "UPI_INTENT") {
//       paymentSpecificParams = {
//         pg: "UPI",
//         bankcode: "INTENT",
//         txn_s2s_flow: "4",
//       };

//       savedBankCode = "INTENT";
//     }

//     /*
//       PayU registration amount:
//       ENACH / NetBanking registration can be 0.00.
//       UPI registration should be at least 1.00.
//       Actual recurring amount is inside si_details.billingAmount.
//     */
//     const payuTransactionAmount = mode === "ENACH" ? "0.00" : "1.00";

//     const params = {
//       key: PAYU_CONFIG.key,
//       txnid,
//       amount: payuTransactionAmount,
//       productinfo: "Subscription",
//       firstname: clean(name),
//       email: clean(email),
//       phone: clean(phone),

//       surl: `${process.env.BASE_URL}/api/payu/success`,
//       furl: `${process.env.BASE_URL}/api/payu/failure`,

//       lastname: clean(lastname),

//       api_version: "7",
//       si: "1",
//       si_details: siDetailsString,

//       ...paymentSpecificParams,

//       udf1: "",
//       udf2: "",
//       udf3: "",
//       udf4: "",
//       udf5: "",
//     };

//     const hash = generateConsentHash(params);

//     await db.promise().query(
//       `
//       INSERT INTO payu_subscriptions (
//         user_id,
//         plan_id,
//         consent_txnid,
//         amount,
//         billing_cycle,
//         billing_interval,
//         payment_start_date,
//         payment_end_date,
//         customer_name,
//         email,
//         phone,
//         bankcode,
//         mandate_status
//       )
//       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
//       `,
//       [
//         user_id,
//         plan_id || null,
//         txnid,
//         recurringAmount,
//         billingCycle,
//         billingInterval,
//         startDate,
//         endDate,
//         `${clean(name)} ${clean(lastname)}`.trim(),
//         clean(email),
//         clean(phone),
//         savedBankCode,
//         "pending",
//       ]
//     );

//     return res.json({
//       success: true,
//       message: "PayU consent request created",
//       payment_mode: mode,
//       payu_url: PAYU_CONFIG.paymentUrl,
//       method: "POST",
//       params: {
//         ...params,
//         hash,
//       },
//     });
//   } catch (error) {
//     console.error("Create consent error:", error);

//     return res.status(500).json({
//       success: false,
//       message: "Failed to create PayU consent request",
//       error: error.message,
//     });
//   }
// };

// async function handlePayuCallback(req, res, source) {
//   const body = req.body;

//   console.log(`PayU ${source} response:`, body);

//   if (!body || !body.txnid) {
//     return res.status(400).send("Missing txnid");
//   }

//   const verified = verifyPayuResponseHash(body);

//   if (!verified) {
//     return res.status(400).send("Hash mismatch");
//   }

//   if (body.key !== PAYU_CONFIG.key) {
//     return res.status(400).send("Invalid merchant key");
//   }

//   const status = clean(body.status).toLowerCase();
//   const paymentSource = clean(body.payment_source).toLowerCase();

//   const [rows] = await db.promise().query(
//     `
//     SELECT id, amount
//     FROM payu_subscriptions
//     WHERE consent_txnid = ?
//     LIMIT 1
//     `,
//     [body.txnid]
//   );

//   if (!rows.length) {
//     return res.status(404).send("Subscription not found");
//   }

//   const subscription = rows[0];

//   if (status !== "success" || paymentSource !== "sist") {
//     await db.promise().query(
//       `
//       UPDATE payu_subscriptions
//       SET
//         mandate_status = 'failed',
//         raw_consent_response = ?
//       WHERE consent_txnid = ?
//       `,
//       [JSON.stringify(body), body.txnid]
//     );

//     await db.promise().query(
//       `
//       INSERT INTO payu_transactions (
//         subscription_id,
//         txnid,
//         payu_payuid,
//         authpayuid,
//         amount,
//         type,
//         status,
//         field9,
//         raw_response
//       )
//       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
//       `,
//       [
//         subscription.id,
//         body.txnid,
//         body.mihpayid || null,
//         body.mihpayid || null,
//         body.amount || subscription.amount,
//         "consent",
//         status || "failed",
//         body.field9 || body.error_Message || null,
//         JSON.stringify(body),
//       ]
//     );

//     return res.redirect(`${process.env.FRONTEND_URL}/subscription-failed`);
//   }

//   await db.promise().query(
//     `
//     UPDATE payu_subscriptions
//     SET
//       mandate_status = 'active',
//       payu_mihpayid = ?,
//       authpayuid = ?,
//       raw_consent_response = ?,
//       next_billing_date = DATE_ADD(CURDATE(), INTERVAL 1 MONTH)
//     WHERE consent_txnid = ?
//     `,
//     [
//       body.mihpayid || null,
//       body.mihpayid || null,
//       JSON.stringify(body),
//       body.txnid,
//     ]
//   );

//   await db.promise().query(
//     `
//     INSERT INTO payu_transactions (
//       subscription_id,
//       txnid,
//       payu_payuid,
//       authpayuid,
//       amount,
//       type,
//       status,
//       field9,
//       raw_response
//     )
//     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
//     `,
//     [
//       subscription.id,
//       body.txnid,
//       body.mihpayid || null,
//       body.mihpayid || null,
//       body.amount || subscription.amount,
//       "consent",
//       status,
//       body.field9 || null,
//       JSON.stringify(body),
//     ]
//   );

//   return res.redirect(`${process.env.FRONTEND_URL}/subscription-success`);
// }

// exports.payuSuccess = async (req, res) => {
//   try {
//     return await handlePayuCallback(req, res, "success");
//   } catch (error) {
//     console.error("PayU success callback error:", error);
//     return res.status(500).send("Success callback failed");
//   }
// };

// exports.payuFailure = async (req, res) => {
//   try {
//     return await handlePayuCallback(req, res, "failure");
//   } catch (error) {
//     console.error("PayU failure callback error:", error);
//     return res.status(500).send("Failure callback failed");
//   }
// };


const db = require("../../config/db");

const {
  PAYU_CONFIG,
  clean,
  generateTxnId,
  formatAmount,
  todayDate,
  isValidDate,
  addYearsToDate,
  generateConsentHash,
  verifyPayuResponseHash,
} = require("./payu.helper");

const VALID_BILLING_CYCLES = new Set([
  "DAILY",
  "WEEKLY",
  "MONTHLY",
  "YEARLY",
  "ONCE",
  "ADHOC",
]);

const PAYU_REGISTRATION_AMOUNT = "1.00";

function normalizeBaseUrl(value) {
  return clean(value).replace(/\/+$/, "");
}

function buildFrontendRedirect(path, txnid) {
  const frontendUrl = normalizeBaseUrl(process.env.FRONTEND_URL);

  return `${frontendUrl}${path}?txnid=${encodeURIComponent(txnid)}`;
}

exports.createConsent = async (req, res) => {
  try {
    const {
      user_id,
      plan_id,

      name,
      lastname,
      email,
      phone,

      // Actual recurring/subscription amount.
      amount,

      billing_cycle = "MONTHLY",
      billing_interval = 1,

      // For hosted checkout, start today so UPI mandate registration
      // remains compatible.
      payment_end_date,
    } = req.body;

    if (!PAYU_CONFIG.key || !PAYU_CONFIG.salt) {
      return res.status(500).json({
        success: false,
        message: "PayU merchant key or salt is missing",
      });
    }

    if (!process.env.BASE_URL || !process.env.FRONTEND_URL) {
      return res.status(500).json({
        success: false,
        message: "BASE_URL or FRONTEND_URL is missing",
      });
    }

    if (
      !user_id ||
      !clean(name) ||
      !clean(email) ||
      !clean(phone) ||
      amount === undefined ||
      amount === null ||
      amount === ""
    ) {
      return res.status(400).json({
        success: false,
        message:
          "user_id, name, email, phone and amount are required",
      });
    }

    if (!/^\S+@\S+\.\S+$/.test(clean(email))) {
      return res.status(400).json({
        success: false,
        message: "Invalid email address",
      });
    }

    if (!/^[0-9]{10,15}$/.test(clean(phone))) {
      return res.status(400).json({
        success: false,
        message: "Phone must contain 10 to 15 digits",
      });
    }

    const recurringAmount = formatAmount(amount);
    const billingCycle = clean(billing_cycle).toUpperCase();
    const billingInterval = Number(billing_interval);

    if (!VALID_BILLING_CYCLES.has(billingCycle)) {
      return res.status(400).json({
        success: false,
        message: "Invalid billing_cycle",
      });
    }

    if (
      !Number.isInteger(billingInterval) ||
      billingInterval < 1
    ) {
      return res.status(400).json({
        success: false,
        message:
          "billing_interval must be a positive integer",
      });
    }

    if (
      ["ONCE", "ADHOC"].includes(billingCycle) &&
      billingInterval !== 1
    ) {
      return res.status(400).json({
        success: false,
        message:
          `${billingCycle} billing_interval must be 1`,
      });
    }

    /*
     * Current date is safest for Hosted Checkout because the
     * customer may select UPI on the PayU page.
     */
    const startDate = todayDate();

    const endDate = payment_end_date
      ? clean(payment_end_date)
      : addYearsToDate(startDate, 1);

    if (!isValidDate(endDate)) {
      return res.status(400).json({
        success: false,
        message: "payment_end_date must be YYYY-MM-DD",
      });
    }

    if (endDate <= startDate) {
      return res.status(400).json({
        success: false,
        message:
          "payment_end_date must be after payment_start_date",
      });
    }

    const txnid = generateTxnId("SUB");

    /*
     * Keep this property order unchanged.
     * This exact JSON string is used in the PayU hash and form POST.
     */
    const siDetails = {
      billingAmount: recurringAmount,
      billingCurrency: "INR",
      billingCycle,
      billingInterval,
      paymentStartDate: startDate,
      paymentEndDate: endDate,
      remarks: "Subscription mandate",
    };

    const siDetailsString = JSON.stringify(siDetails);

    const baseUrl = normalizeBaseUrl(process.env.BASE_URL);

    /*
     * PayU Hosted Subscription request.
     *
     * Notice that there is no:
     * - pg
     * - bankcode
     * - vpa
     * - account number
     * - IFSC
     * - verification mode
     */
    const params = {
      key: PAYU_CONFIG.key,
      txnid,

      /*
       * This is the mandate registration/penny transaction amount.
       * The recurring amount is in si_details.billingAmount.
       */
      amount: PAYU_REGISTRATION_AMOUNT,

      productinfo: "Subscription Mandate",
      firstname: clean(name),
      lastname: clean(lastname),
      email: clean(email).toLowerCase(),
      phone: clean(phone),

      surl: `${baseUrl}/api/payu/success`,
      furl: `${baseUrl}/api/payu/failure`,

      api_version: "7",
      si: "1",
      si_details: siDetailsString,

      udf1: "",
      udf2: "",
      udf3: "",
      udf4: "",
      udf5: "",
    };

    const hash = generateConsentHash(params);

    await db.promise().query(
      `
      INSERT INTO payu_subscriptions (
        user_id,
        plan_id,
        consent_txnid,
        amount,
        billing_cycle,
        billing_interval,
        payment_start_date,
        payment_end_date,
        customer_name,
        email,
        phone,
        mandate_status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        Number(user_id),
        plan_id ? Number(plan_id) : null,
        txnid,
        recurringAmount,
        billingCycle,
        billingInterval,
        startDate,
        endDate,
        `${clean(name)} ${clean(lastname)}`.trim(),
        clean(email).toLowerCase(),
        clean(phone),
        "pending",
      ]
    );

    return res.status(200).json({
      success: true,
      message: "PayU Hosted Subscription request created",
      payu_url: PAYU_CONFIG.paymentUrl,
      method: "POST",
      params: {
        ...params,
        hash,
      },
    });
  } catch (error) {
    console.error("Create PayU consent error:", {
      message: error.message,
    });

    return res.status(500).json({
      success: false,
      message: "Failed to create PayU subscription request",
    });
  }
};

async function handlePayuCallback(req, res) {
  const body = req.body || {};

  if (!body.txnid) {
    return res.status(400).send("Missing transaction ID");
  }

  if (!verifyPayuResponseHash(body)) {
    return res.status(400).send("Invalid PayU response hash");
  }

  if (clean(body.key) !== PAYU_CONFIG.key) {
    return res.status(400).send("Invalid merchant key");
  }

  let responseAmount;

  try {
    responseAmount = formatAmount(body.amount);
  } catch {
    return res.status(400).send("Invalid response amount");
  }

  if (responseAmount !== PAYU_REGISTRATION_AMOUNT) {
    return res.status(400).send("Response amount mismatch");
  }

  const connection = await db.promise().getConnection();

  try {
    await connection.beginTransaction();

    const [subscriptions] = await connection.query(
      `
      SELECT
        id,
        amount,
        mandate_status,
        payment_start_date
      FROM payu_subscriptions
      WHERE consent_txnid = ?
      LIMIT 1
      FOR UPDATE
      `,
      [clean(body.txnid)]
    );

    if (!subscriptions.length) {
      await connection.rollback();
      return res.status(404).send("Subscription not found");
    }

    const subscription = subscriptions[0];

    const responseStatus = clean(body.status).toLowerCase();
    const paymentSource = clean(
      body.payment_source
    ).toLowerCase();

    const isSuccessfulConsent =
      responseStatus === "success" &&
      paymentSource === "sist" &&
      Boolean(clean(body.mihpayid));

    /*
     * Do not downgrade an already active mandate because of a
     * repeated or delayed failure callback.
     */
    const resultingMandateStatus =
      subscription.mandate_status === "active"
        ? "active"
        : isSuccessfulConsent
          ? "active"
          : "failed";

    if (
      subscription.mandate_status !== "active" ||
      isSuccessfulConsent
    ) {
      await connection.query(
        `
        UPDATE payu_subscriptions
        SET
          mandate_status = ?,
          payu_mihpayid = CASE
            WHEN ? IS NOT NULL THEN ?
            ELSE payu_mihpayid
          END,
          authpayuid = CASE
            WHEN ? IS NOT NULL THEN ?
            ELSE authpayuid
          END,
          raw_consent_response = ?,
          next_billing_date = CASE
            WHEN ? = 'active' THEN payment_start_date
            ELSE next_billing_date
          END
        WHERE consent_txnid = ?
        `,
        [
          resultingMandateStatus,

          clean(body.mihpayid) || null,
          clean(body.mihpayid) || null,

          clean(body.mihpayid) || null,
          clean(body.mihpayid) || null,

          JSON.stringify(body),
          resultingMandateStatus,
          clean(body.txnid),
        ]
      );
    }

    /*
     * Idempotent callback storage.
     */
    const [existingTransactions] = await connection.query(
      `
      SELECT id
      FROM payu_transactions
      WHERE subscription_id = ?
        AND txnid = ?
        AND type = 'consent'
      LIMIT 1
      `,
      [subscription.id, clean(body.txnid)]
    );

    const transactionValues = [
      clean(body.mihpayid) || null,
      clean(body.mihpayid) || null,
      responseAmount,
      responseStatus || "failure",
      clean(body.field9 || body.error_Message) || null,
      JSON.stringify(body),
    ];

    if (existingTransactions.length) {
      await connection.query(
        `
        UPDATE payu_transactions
        SET
          payu_payuid = ?,
          authpayuid = ?,
          amount = ?,
          status = ?,
          field9 = ?,
          raw_response = ?
        WHERE id = ?
        `,
        [
          ...transactionValues,
          existingTransactions[0].id,
        ]
      );
    } else {
      await connection.query(
        `
        INSERT INTO payu_transactions (
          subscription_id,
          txnid,
          payu_payuid,
          authpayuid,
          amount,
          type,
          status,
          field9,
          raw_response
        )
        VALUES (?, ?, ?, ?, ?, 'consent', ?, ?, ?)
        `,
        [
          subscription.id,
          clean(body.txnid),
          ...transactionValues,
        ]
      );
    }

    await connection.commit();

    if (isSuccessfulConsent) {
      return res.redirect(
        buildFrontendRedirect(
          "/subscription-success",
          body.txnid
        )
      );
    }

    return res.redirect(
      buildFrontendRedirect(
        "/subscription-failed",
        body.txnid
      )
    );
  } catch (error) {
    await connection.rollback();

    console.error("PayU callback error:", {
      txnid: clean(body.txnid),
      message: error.message,
    });

    return res.status(500).send("PayU callback processing failed");
  } finally {
    connection.release();
  }
}

exports.payuSuccess = async (req, res) => {
  return handlePayuCallback(req, res);
};

exports.payuFailure = async (req, res) => {
  return handlePayuCallback(req, res);
};