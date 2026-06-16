// const db = require("../../config/db");
// const axios = require("axios");

// const {
//   PAYU_CONFIG,
//   generateTxnId,
//   stringifyStable,
//   generateConsentHash,
//   verifyPayuResponseHash,
// } = require("./payu.helper");

// function addDays(days) {
//   const date = new Date();
//   date.setDate(date.getDate() + days);
//   return date.toISOString().slice(0, 10);
// }

// function addYears(years) {
//   const date = new Date();
//   date.setFullYear(date.getFullYear() + years);
//   return date.toISOString().slice(0, 10);
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

//       // eNACH fields
//       bankcode,
//       account_number,
//       account_type,
//       ifsc_code,
//       verification_mode,

//       // UPI collect field
//       vpa,
//     } = req.body;

//     console.log("Create consent request received with data:", req.body);

//     if (!user_id || !name || !email || !phone || !amount) {
//       return res.status(400).json({
//         success: false,
//         message: "user_id, name, email, phone and amount are required",
//       });
//     }

//     const mode = String(payment_mode).toUpperCase();

//     if (!["ENACH", "UPI_INTENT", "UPI_COLLECT"].includes(mode)) {
//       return res.status(400).json({
//         success: false,
//         message: "payment_mode must be ENACH, UPI_INTENT or UPI_COLLECT",
//       });
//     }

//     const txnid = generateTxnId("CONSENT");

//     /*
//       For eNACH, PayU Integration Lab says start date should be tomorrow.
//       For UPI, current/future date is okay.
//     */
//     const startDate =
//       payment_start_date || (mode === "ENACH" ? addDays(1) : addDays(0));

//     const endDate = payment_end_date || addYears(1);

//     const siDetails = {
//       billingAmount: String(amount),
//       billingCurrency: "INR",
//       billingCycle: billing_cycle,
//       billingInterval: Number(billing_interval),
//       paymentStartDate: startDate,
//       paymentEndDate: endDate,
//       remarks: `${mode} Subscription Mandate`,
//     };

//     const siDetailsString = stringifyStable(siDetails);

//     let paymentSpecificParams = {};
//     let savedBankCode = null;

//     if (mode === "ENACH") {
//       if (
//         !bankcode ||
//         !account_number ||
//         !account_type ||
//         !ifsc_code ||
//         !verification_mode
//       ) {
//         return res.status(400).json({
//           success: false,
//           message:
//             "For ENACH, bankcode, account_number, account_type, ifsc_code and verification_mode are required",
//         });
//       }

//       const beneficiarydetail = {
//         beneficiaryName: `${name} ${lastname || ""}`.trim(),
//         beneficiaryAccountNumber: account_number,
//         beneficiaryAccountType: account_type,
//         beneficiaryIfscCode: ifsc_code,
//         verificationMode: verification_mode,
//       };

//       const beneficiarydetailString = stringifyStable(beneficiarydetail);

//       paymentSpecificParams = {
//         pg: "ENACH",
//         bankcode,
//         beneficiarydetail: beneficiarydetailString,
//       };

//       savedBankCode = bankcode;
//     }

//     if (mode === "UPI_INTENT") {
//       paymentSpecificParams = {
//         pg: "UPI",
//         bankcode: "INTENT",
//         txn_s2s_flow: "4",
//       };

//       savedBankCode = "INTENT";
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
//         vpa,
//       };

//       savedBankCode = "UPI";
//     }

//     /*
//       eNACH transaction amount should be 1.
//       Actual recurring amount is inside si_details.billingAmount.
//     */
//     const payuTransactionAmount = mode === "ENACH" ? "1" : String(amount);

//     const params = {
//       key: PAYU_CONFIG.key,
//       txnid,
//       amount: payuTransactionAmount,
//       productinfo: "Subscription",
//       firstname: name,
//       email,
//       phone,

//       surl: `${process.env.BASE_URL}/api/payu/success`,
//       furl: `${process.env.BASE_URL}/api/payu/failure`,
//       lastname: lastname || "",

//       // service_provider: "payu_paisa",

//       // enforce_paymethod: 'enach|upi',
//       api_version: "7",
//       si: "1",
//       si_details: siDetailsString,

//       // ...paymentSpecificParams,

//       udf1: "",
//       udf2: "",
//       udf3: "",
//       udf4: "",
//       udf5: "",
//     };

//     const hash = generateConsentHash(params, siDetailsString);

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
//         amount,
//         billing_cycle,
//         billing_interval,
//         startDate,
//         endDate,
//         `${name} ${lastname || ""}`.trim(),
//         email,
//         phone,
//         savedBankCode,
//         "pending",
//       ]
//     );

//     if (mode === "UPI_INTENT") {
//   const payuForm = new URLSearchParams();

//   Object.entries({
//     ...params,
//     hash,
//   }).forEach(([key, value]) => {
//     payuForm.append(key, value ?? "");
//   });

//   const payuResponse = await axios.post(
//     PAYU_CONFIG.paymentUrl,
//     payuForm.toString(),
//     {
//       headers: {
//         "Content-Type": "application/x-www-form-urlencoded",
//       },
//     }
//   );

//   let payuData = payuResponse.data;

//   if (typeof payuData === "string") {
//     try {
//       payuData = JSON.parse(payuData);
//     } catch (error) {
//       console.error("PayU non-JSON response:", payuData);

//       return res.status(500).json({
//         success: false,
//         message: "PayU returned non-JSON response for UPI Intent",
//         raw: payuData,
//       });
//     }
//   }

//   const intentURIData =
//     payuData?.result?.intentURIData ||
//     payuData?.intentURIData ||
//     null;

//   return res.json({
//     success: true,
//     message: "UPI Intent created",
//     payment_mode: mode,
//     txnid,
//     txnStatus: payuData?.metaData?.txnStatus || payuData?.txnStatus || "pending",
//     intentURIData,
//     payu_response: payuData,
//   });
// }

//     return res.json({
//       success: true,
//       message: "PayU consent request created",
//       payment_mode: mode,
//       payu_url: PAYU_CONFIG.paymentUrl,
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

// exports.payuSuccess = async (req, res) => {
//   try {
//     const body = req.body;

//     console.log("PayU success response:", body);

//     const verified = verifyPayuResponseHash(body);

//     if (!verified) {
//       return res.status(400).send("Hash mismatch");
//     }

//     if (body.status !== "success") {
//       await db.promise().query(
//         `
//         UPDATE payu_subscriptions
//         SET
//           mandate_status = 'failed',
//           raw_consent_response = ?
//         WHERE consent_txnid = ?
//         `,
//         [JSON.stringify(body), body.txnid]
//       );

//       return res.redirect(`${process.env.FRONTEND_URL}/subscription-failed`);
//     }

//     const authpayuid = body.mihpayid;

//     await db.promise().query(
//       `
//       UPDATE payu_subscriptions
//       SET
//         mandate_status = 'active',
//         payu_mihpayid = ?,
//         authpayuid = ?,
//         raw_consent_response = ?,
//         next_billing_date = DATE_ADD(CURDATE(), INTERVAL 1 MONTH)
//       WHERE consent_txnid = ?
//       `,
//       [body.mihpayid, authpayuid, JSON.stringify(body), body.txnid]
//     );

//     const [rows] = await db.promise().query(
//       `
//       SELECT id, amount
//       FROM payu_subscriptions
//       WHERE consent_txnid = ?
//       LIMIT 1
//       `,
//       [body.txnid]
//     );

//     if (rows.length > 0) {
//       await db.promise().query(
//         `
//         INSERT INTO payu_transactions (
//           subscription_id,
//           txnid,
//           payu_payuid,
//           authpayuid,
//           amount,
//           type,
//           status,
//           field9,
//           raw_response
//         )
//         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
//         `,
//         [
//           rows[0].id,
//           body.txnid,
//           body.mihpayid,
//           authpayuid,
//           body.amount || rows[0].amount,
//           "consent",
//           body.status,
//           body.field9 || null,
//           JSON.stringify(body),
//         ]
//       );
//     }

//     return res.redirect(`${process.env.FRONTEND_URL}/subscription-success`);
//   } catch (error) {
//     console.error("PayU success callback error:", error);

//     return res.status(500).send("Success callback failed");
//   }
// };

// exports.payuFailure = async (req, res) => {
//   try {
//     const body = req.body;

//     console.log("PayU failure response:", body);

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

//     return res.redirect(`${process.env.FRONTEND_URL}/subscription-failed`);
//   } catch (error) {
//     console.error("PayU failure callback error:", error);

//     return res.status(500).send("Failure callback failed");
//   }
// };




const db = require("../../config/db");

const {
  PAYU_CONFIG,
  generateTxnId,
  formatAmount,
  addDays,
  addYears,
  todayDate,
  stringifyStable,
  generateConsentHash,
  verifyPayuResponseHash,
} = require("./payu.helper");

function clean(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function isValidDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
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
      amount,

      billing_cycle = "MONTHLY",
      billing_interval = 1,
      payment_start_date,
      payment_end_date,

      payment_mode = "ENACH",

      // ENACH fields
      bankcode,
      account_number,
      account_type,
      ifsc_code,
      verification_mode,

      // UPI collect field
      vpa,
    } = req.body;

    if (!PAYU_CONFIG.key || !PAYU_CONFIG.salt) {
      return res.status(500).json({
        success: false,
        message: "PAYU_KEY or PAYU_SALT missing in environment",
      });
    }

    if (!process.env.BASE_URL || !process.env.FRONTEND_URL) {
      return res.status(500).json({
        success: false,
        message: "BASE_URL or FRONTEND_URL missing in environment",
      });
    }

    if (!user_id || !name || !email || !phone || !amount) {
      return res.status(400).json({
        success: false,
        message: "user_id, name, email, phone and amount are required",
      });
    }

    const mode = clean(payment_mode).toUpperCase();

    if (!["ENACH", "UPI_INTENT", "UPI_COLLECT", "HOSTED"].includes(mode)) {
      return res.status(400).json({
        success: false,
        message:
          "payment_mode must be ENACH, UPI_INTENT, UPI_COLLECT or HOSTED",
      });
    }

    const billingCycle = clean(billing_cycle).toUpperCase();
    const billingInterval = Number(billing_interval);

    if (!Number.isInteger(billingInterval) || billingInterval < 1) {
      return res.status(400).json({
        success: false,
        message: "billing_interval must be a positive integer",
      });
    }

    const recurringAmount = formatAmount(amount);

    if (Number(recurringAmount) <= 0) {
      return res.status(400).json({
        success: false,
        message: "amount must be greater than 0",
      });
    }

    if (
      ["UPI_INTENT", "UPI_COLLECT"].includes(mode) &&
      Number(recurringAmount) > 15000
    ) {
      return res.status(400).json({
        success: false,
        message: "UPI recurring billing amount cannot be more than 15000",
      });
    }

    const txnid = generateTxnId("CONSENT");

    let startDate;

    if (payment_start_date) {
      if (!isValidDate(payment_start_date)) {
        return res.status(400).json({
          success: false,
          message: "payment_start_date must be YYYY-MM-DD",
        });
      }

      startDate = payment_start_date;
    } else {
      startDate = mode === "ENACH" ? addDays(1) : todayDate();
    }

    let endDate = payment_end_date || addYears(1);

    if (!isValidDate(endDate)) {
      return res.status(400).json({
        success: false,
        message: "payment_end_date must be YYYY-MM-DD",
      });
    }

    if (endDate <= startDate) {
      return res.status(400).json({
        success: false,
        message: "payment_end_date must be after payment_start_date",
      });
    }

    const siDetails = {
      billingAmount: recurringAmount,
      billingCurrency: "INR",
      billingCycle,
      billingInterval,
      paymentStartDate: startDate,
      paymentEndDate: endDate,
      remarks: `${mode} Subscription Mandate`,
    };

    const siDetailsString = stringifyStable(siDetails);

    let paymentSpecificParams = {};
    let savedBankCode = null;

    if (mode === "ENACH") {
      if (!bankcode || !account_number || !account_type || !ifsc_code) {
        return res.status(400).json({
          success: false,
          message:
            "For ENACH, bankcode, account_number, account_type and ifsc_code are required",
        });
      }

      const beneficiarydetail = {
        beneficiaryName: `${clean(name)} ${clean(lastname)}`.trim(),
        beneficiaryAccountNumber: clean(account_number),
        beneficiaryAccountType: clean(account_type).toUpperCase(),
        beneficiaryIfscCode: clean(ifsc_code).toUpperCase(),
      };

      if (verification_mode) {
        beneficiarydetail.verificationMode = clean(
          verification_mode
        ).toUpperCase();
      }

      paymentSpecificParams = {
        pg: "ENACH",
        bankcode: clean(bankcode),
        beneficiarydetail: stringifyStable(beneficiarydetail),
      };

      savedBankCode = clean(bankcode);
    }

    if (mode === "UPI_COLLECT") {
      if (!vpa) {
        return res.status(400).json({
          success: false,
          message: "For UPI_COLLECT, vpa is required",
        });
      }

      paymentSpecificParams = {
        pg: "UPI",
        bankcode: "UPI",
        vpa: clean(vpa),
      };

      savedBankCode = "UPI";
    }

    if (mode === "UPI_INTENT") {
      paymentSpecificParams = {
        pg: "UPI",
        bankcode: "INTENT",
        txn_s2s_flow: "4",
      };

      savedBankCode = "INTENT";
    }

    /*
      PayU registration amount:
      ENACH / NetBanking registration can be 0.00.
      UPI registration should be at least 1.00.
      Actual recurring amount is inside si_details.billingAmount.
    */
    const payuTransactionAmount = mode === "ENACH" ? "0.00" : "1.00";

    const params = {
      key: PAYU_CONFIG.key,
      txnid,
      amount: payuTransactionAmount,
      productinfo: "Subscription",
      firstname: clean(name),
      email: clean(email),
      phone: clean(phone),

      surl: `${process.env.BASE_URL}/api/payu/success`,
      furl: `${process.env.BASE_URL}/api/payu/failure`,

      lastname: clean(lastname),

      api_version: "7",
      si: "1",
      si_details: siDetailsString,

      ...paymentSpecificParams,

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
        bankcode,
        mandate_status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        user_id,
        plan_id || null,
        txnid,
        recurringAmount,
        billingCycle,
        billingInterval,
        startDate,
        endDate,
        `${clean(name)} ${clean(lastname)}`.trim(),
        clean(email),
        clean(phone),
        savedBankCode,
        "pending",
      ]
    );

    return res.json({
      success: true,
      message: "PayU consent request created",
      payment_mode: mode,
      payu_url: PAYU_CONFIG.paymentUrl,
      method: "POST",
      params: {
        ...params,
        hash,
      },
    });
  } catch (error) {
    console.error("Create consent error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create PayU consent request",
      error: error.message,
    });
  }
};

async function handlePayuCallback(req, res, source) {
  const body = req.body;

  console.log(`PayU ${source} response:`, body);

  if (!body || !body.txnid) {
    return res.status(400).send("Missing txnid");
  }

  const verified = verifyPayuResponseHash(body);

  if (!verified) {
    return res.status(400).send("Hash mismatch");
  }

  if (body.key !== PAYU_CONFIG.key) {
    return res.status(400).send("Invalid merchant key");
  }

  const status = clean(body.status).toLowerCase();
  const paymentSource = clean(body.payment_source).toLowerCase();

  const [rows] = await db.promise().query(
    `
    SELECT id, amount
    FROM payu_subscriptions
    WHERE consent_txnid = ?
    LIMIT 1
    `,
    [body.txnid]
  );

  if (!rows.length) {
    return res.status(404).send("Subscription not found");
  }

  const subscription = rows[0];

  if (status !== "success" || paymentSource !== "sist") {
    await db.promise().query(
      `
      UPDATE payu_subscriptions
      SET
        mandate_status = 'failed',
        raw_consent_response = ?
      WHERE consent_txnid = ?
      `,
      [JSON.stringify(body), body.txnid]
    );

    await db.promise().query(
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
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        subscription.id,
        body.txnid,
        body.mihpayid || null,
        body.mihpayid || null,
        body.amount || subscription.amount,
        "consent",
        status || "failed",
        body.field9 || body.error_Message || null,
        JSON.stringify(body),
      ]
    );

    return res.redirect(`${process.env.FRONTEND_URL}/subscription-failed`);
  }

  await db.promise().query(
    `
    UPDATE payu_subscriptions
    SET
      mandate_status = 'active',
      payu_mihpayid = ?,
      authpayuid = ?,
      raw_consent_response = ?,
      next_billing_date = DATE_ADD(CURDATE(), INTERVAL 1 MONTH)
    WHERE consent_txnid = ?
    `,
    [
      body.mihpayid || null,
      body.mihpayid || null,
      JSON.stringify(body),
      body.txnid,
    ]
  );

  await db.promise().query(
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
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      subscription.id,
      body.txnid,
      body.mihpayid || null,
      body.mihpayid || null,
      body.amount || subscription.amount,
      "consent",
      status,
      body.field9 || null,
      JSON.stringify(body),
    ]
  );

  return res.redirect(`${process.env.FRONTEND_URL}/subscription-success`);
}

exports.payuSuccess = async (req, res) => {
  try {
    return await handlePayuCallback(req, res, "success");
  } catch (error) {
    console.error("PayU success callback error:", error);
    return res.status(500).send("Success callback failed");
  }
};

exports.payuFailure = async (req, res) => {
  try {
    return await handlePayuCallback(req, res, "failure");
  } catch (error) {
    console.error("PayU failure callback error:", error);
    return res.status(500).send("Failure callback failed");
  }
};