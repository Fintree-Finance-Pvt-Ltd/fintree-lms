// const db = require("../../config/db");

// const {
//   PAYU_CONFIG,
//   generateTxnId,
//   stringifyStable,
//   generateConsentHash,
//   verifyPayuResponseHash,
// } = require("./payu.helper");

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
//       bankcode,
//       account_number,
//       account_type,
//       ifsc_code,
//       verification_mode,
//       billing_cycle = "MONTHLY",
//       billing_interval = 1,
//       payment_start_date,
//       payment_end_date,
//     } = req.body;

//     if (!user_id || !name || !email || !phone || !amount) {
//       return res.status(400).json({
//         success: false,
//         message: "user_id, name, email, phone and amount are required",
//       });
//     }

//     const txnid = generateTxnId("CONSENT");

//     const startDate =
//       payment_start_date || new Date().toISOString().slice(0, 10);
//     const endDate = payment_end_date || "2027-12-31";

//     const siDetails = {
//       billingAmount: String(amount),
//       billingCurrency: "INR",
//       billingCycle: billing_cycle,
//       billingInterval: Number(billing_interval),
//       paymentStartDate: startDate,
//       paymentEndDate: endDate,
//       remarks: "Subscription Mandate",
//     };

//     const beneficiarydetail = {
//       beneficiaryName: `${name} ${lastname || ""}`.trim(),
//       beneficiaryAccountNumber: account_number,
//       beneficiaryAccountType: account_type,
//       beneficiaryIfscCode: ifsc_code,
//       verificationMode: verification_mode,
//     };

//     const beneficiarydetailString = stringifyStable(beneficiarydetail);

//     const siDetailsString = stringifyStable(siDetails);

//     const params = {
//       key: PAYU_CONFIG.key,
//       txnid,
//       amount: String(amount),
//       productinfo: "Subscription",
//       firstname: name,
//       email,
//       phone,
//       lastname: lastname,

//       surl: `${process.env.BASE_URL}/api/payu/success`,
//       furl: `${process.env.BASE_URL}/api/payu/failure`,

//       service_provider: "payu_paisa",
//       api_version: "7",
//       si: "1",
//       si_details: siDetailsString,
//       beneficiarydetail: beneficiarydetailString,

//       enforce_paymethod: "creditcard|debitcard|netbanking|upi",

//       // netbanking recurring
//       pg: "ENACH",
//       bankcode,

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
//         name,
//         email,
//         phone,
//         bankcode,
//         "pending",
//       ],
//     );

//     return res.json({
//       success: true,
//       message: "PayU consent request created",
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
//         [JSON.stringify(body), body.txnid],
//       );

//       return res.status(400).send("Payment failed");
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
//       [body.mihpayid, authpayuid, JSON.stringify(body), body.txnid],
//     );

//     const [rows] = await db.promise().query(
//       `
//       SELECT id, amount
//       FROM payu_subscriptions
//       WHERE consent_txnid = ?
//       LIMIT 1
//       `,
//       [body.txnid],
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
//         ],
//       );
//     }

//     return res.send("Subscription mandate activated successfully");
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
//       [JSON.stringify(body), body.txnid],
//     );

//     return res.send("Payment failed");
//   } catch (error) {
//     console.error("PayU failure callback error:", error);

//     return res.status(500).send("Failure callback failed");
//   }
// };


const db = require("../../config/db");
const axios = require("axios");

const {
  PAYU_CONFIG,
  generateTxnId,
  stringifyStable,
  generateConsentHash,
  verifyPayuResponseHash,
} = require("./payu.helper");

function addDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function addYears(years) {
  const date = new Date();
  date.setFullYear(date.getFullYear() + years);
  return date.toISOString().slice(0, 10);
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

      // eNACH fields
      bankcode,
      account_number,
      account_type,
      ifsc_code,
      verification_mode,

      // UPI collect field
      vpa,
    } = req.body;

    if (!user_id || !name || !email || !phone || !amount) {
      return res.status(400).json({
        success: false,
        message: "user_id, name, email, phone and amount are required",
      });
    }

    const mode = String(payment_mode).toUpperCase();

    if (!["ENACH", "UPI_INTENT", "UPI_COLLECT"].includes(mode)) {
      return res.status(400).json({
        success: false,
        message: "payment_mode must be ENACH, UPI_INTENT or UPI_COLLECT",
      });
    }

    const txnid = generateTxnId("CONSENT");

    /*
      For eNACH, PayU Integration Lab says start date should be tomorrow.
      For UPI, current/future date is okay.
    */
    const startDate =
      payment_start_date || (mode === "ENACH" ? addDays(1) : addDays(0));

    const endDate = payment_end_date || addYears(1);

    const siDetails = {
      billingAmount: String(amount),
      billingCurrency: "INR",
      billingCycle: billing_cycle,
      billingInterval: Number(billing_interval),
      paymentStartDate: startDate,
      paymentEndDate: endDate,
      remarks: `${mode} Subscription Mandate`,
    };

    const siDetailsString = stringifyStable(siDetails);

    let paymentSpecificParams = {};
    let savedBankCode = null;

    if (mode === "ENACH") {
      if (
        !bankcode ||
        !account_number ||
        !account_type ||
        !ifsc_code ||
        !verification_mode
      ) {
        return res.status(400).json({
          success: false,
          message:
            "For ENACH, bankcode, account_number, account_type, ifsc_code and verification_mode are required",
        });
      }

      const beneficiarydetail = {
        beneficiaryName: `${name} ${lastname || ""}`.trim(),
        beneficiaryAccountNumber: account_number,
        beneficiaryAccountType: account_type,
        beneficiaryIfscCode: ifsc_code,
        verificationMode: verification_mode,
      };

      const beneficiarydetailString = stringifyStable(beneficiarydetail);

      paymentSpecificParams = {
        pg: "ENACH",
        bankcode,
        beneficiarydetail: beneficiarydetailString,
      };

      savedBankCode = bankcode;
    }

    if (mode === "UPI_INTENT") {
      paymentSpecificParams = {
        pg: "UPI",
        bankcode: "INTENT",
        txn_s2s_flow: "4",
      };

      savedBankCode = "INTENT";
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
        vpa,
      };

      savedBankCode = "UPI";
    }

    /*
      eNACH transaction amount should be 1.
      Actual recurring amount is inside si_details.billingAmount.
    */
    const payuTransactionAmount = mode === "ENACH" ? "1" : String(amount);

    const params = {
      key: PAYU_CONFIG.key,
      txnid,
      amount: payuTransactionAmount,
      productinfo: "Subscription",
      firstname: name,
      lastname: lastname || "",
      email,
      phone,

      surl: `${process.env.BASE_URL}/api/payu/success`,
      furl: `${process.env.BASE_URL}/api/payu/failure`,

      service_provider: "payu_paisa",

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

    const hash = generateConsentHash(params, siDetailsString);

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
        amount,
        billing_cycle,
        billing_interval,
        startDate,
        endDate,
        `${name} ${lastname || ""}`.trim(),
        email,
        phone,
        savedBankCode,
        "pending",
      ]
    );

    if (mode === "UPI_INTENT") {
  const payuForm = new URLSearchParams();

  Object.entries({
    ...params,
    hash,
  }).forEach(([key, value]) => {
    payuForm.append(key, value ?? "");
  });

  const payuResponse = await axios.post(
    PAYU_CONFIG.paymentUrl,
    payuForm.toString(),
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    }
  );

  let payuData = payuResponse.data;

  if (typeof payuData === "string") {
    try {
      payuData = JSON.parse(payuData);
    } catch (error) {
      console.error("PayU non-JSON response:", payuData);

      return res.status(500).json({
        success: false,
        message: "PayU returned non-JSON response for UPI Intent",
        raw: payuData,
      });
    }
  }

  const intentURIData =
    payuData?.result?.intentURIData ||
    payuData?.intentURIData ||
    null;

  return res.json({
    success: true,
    message: "UPI Intent created",
    payment_mode: mode,
    txnid,
    txnStatus: payuData?.metaData?.txnStatus || payuData?.txnStatus || "pending",
    intentURIData,
    payu_response: payuData,
  });
}

    return res.json({
      success: true,
      message: "PayU consent request created",
      payment_mode: mode,
      payu_url: PAYU_CONFIG.paymentUrl,
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

exports.payuSuccess = async (req, res) => {
  try {
    const body = req.body;

    console.log("PayU success response:", body);

    const verified = verifyPayuResponseHash(body);

    if (!verified) {
      return res.status(400).send("Hash mismatch");
    }

    if (body.status !== "success") {
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

      return res.redirect(`${process.env.FRONTEND_URL}/subscription-failed`);
    }

    const authpayuid = body.mihpayid;

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
      [body.mihpayid, authpayuid, JSON.stringify(body), body.txnid]
    );

    const [rows] = await db.promise().query(
      `
      SELECT id, amount
      FROM payu_subscriptions
      WHERE consent_txnid = ?
      LIMIT 1
      `,
      [body.txnid]
    );

    if (rows.length > 0) {
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
          rows[0].id,
          body.txnid,
          body.mihpayid,
          authpayuid,
          body.amount || rows[0].amount,
          "consent",
          body.status,
          body.field9 || null,
          JSON.stringify(body),
        ]
      );
    }

    return res.redirect(`${process.env.FRONTEND_URL}/subscription-success`);
  } catch (error) {
    console.error("PayU success callback error:", error);

    return res.status(500).send("Success callback failed");
  }
};

exports.payuFailure = async (req, res) => {
  try {
    const body = req.body;

    console.log("PayU failure response:", body);

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

    return res.redirect(`${process.env.FRONTEND_URL}/subscription-failed`);
  } catch (error) {
    console.error("PayU failure callback error:", error);

    return res.status(500).send("Failure callback failed");
  }
};