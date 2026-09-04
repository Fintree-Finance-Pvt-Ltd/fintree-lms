const axios = require("axios");
const crypto = require("crypto");


const EASEBUZZ_BASE_URL_C =
  process.env.EASEBUZZ_BASE_URL_C ||
  "https://dashboard.easebuzz.in";


const EASEBUZZ_CREATE_PATH_C =
  process.env.EASEBUZZ_EASYCOLLECT_CREATE_PATH_C ||
  "/easycollect/v1/create";


const EASEBUZZ_TIMEOUT_C = Number(
  process.env.EASEBUZZ_TIMEOUT_C || 30000
);


const easebuzzClient = axios.create({
  baseURL: EASEBUZZ_BASE_URL_C,

  timeout: EASEBUZZ_TIMEOUT_C,

  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
  },
});


 function generatePaymentRequestId() {
  return `PAY-${crypto.randomUUID()}`;
}


 function generateMerchantTxn(lan) {
  const random = crypto
    .randomBytes(4)
    .toString("hex");

  return `LMS-${lan}-${Date.now()}-${random}`;
}


 function buildEasyCollectHash(input) {
  const hashString = [
    input.key,
    input.merchantTxn,
    input.name,
    input.email,
    input.phone,
    input.amount,
    input.udf1,
    input.udf2,
    input.udf3,
    input.udf4,
    input.udf5,
    input.message,
    input.salt,
  ].join("|");


  return crypto
    .createHash("sha512")
    .update(hashString)
    .digest("hex");
}


 async function createEasyCollectPaymentLink(input) {
  const key = String(
    process.env.EASEBUZZ_WIRE_API_KEY_C || ""
  ).trim();


  const salt = String(
    process.env.EASEBUZZ_SALT_C || ""
  ).trim();


  if (!key) {
    throw new Error(
      "Missing EASEBUZZ_WIRE_API_KEY_C"
    );
  }


  if (!salt) {
    throw new Error(
      "Missing EASEBUZZ_SALT_C"
    );
  }


  const name = String(
    input.customerName || ""
  ).trim();


  const phone = String(
    input.mobile || ""
  ).trim();


  const email = String(
    input.email ||
    "noemail@fintreefinance.com"
  ).trim();


  const amount = Number(
    input.amount
  ).toFixed(2);


  const udf1 = String(
    input.lan || ""
  );

  const udf2 = String(
    input.lender || ""
  );

  const udf3 = String(
    input.paymentRequestId || ""
  );

  const udf4 = "LMS";

  const udf5 = String(
    input.partnerCode || ""
  );


  const message =
    `${input.purpose || "Payment"} for LAN ${input.lan}`;


  const payload = {
    key,


    txnid:
      input.merchantTxn,

    merchant_txn:
      input.merchantTxn,

    name,

    phone,

    email,

    amount,

    udf1,

    udf2,

    udf3,

    udf4,

    udf5,

    message,

    operation: [
      {
        type: "sms",
        template:
          "Default sms template",
      },
    ],
  };


  if (input.expiryDate) {
    payload.expiry_date =
      input.expiryDate;
  }


  payload.hash =
    buildEasyCollectHash({
      key,

      merchantTxn:
        payload.merchant_txn,

      name:
        payload.name,

      email:
        payload.email,

      phone:
        payload.phone,

      amount:
        payload.amount,

      udf1:
        payload.udf1,

      udf2:
        payload.udf2,

      udf3:
        payload.udf3,

      udf4:
        payload.udf4,

      udf5:
        payload.udf5,

      message:
        payload.message,

      salt,
    });


  console.log(
    "Easebuzz request:",
    {
      merchant_txn:
        payload.merchant_txn,

      name:
        payload.name,

      phone:
        payload.phone,

      email:
        payload.email,

      amount:
        payload.amount,

      udf1:
        payload.udf1,

      udf2:
        payload.udf2,

      udf3:
        payload.udf3,

      udf4:
        payload.udf4,

      udf5:
        payload.udf5,

      message:
        payload.message,

      hash: "HASH_GENERATED",
    }
  );


  const response =
    await easebuzzClient.post(
      EASEBUZZ_CREATE_PATH_C,
      payload
    );


  return {
    merchantTxn:
      input.merchantTxn,

    requestPayload:
      payload,

    response:
      response?.data || null,
  };
}


 function extractEasebuzzPaymentLink(response) {

  return (

    response?.data?.payment_link ||

    response?.data?.payment_url ||

    response?.data?.url ||

    response?.payment_link ||

    response?.payment_url ||

    response?.url ||

    null

  );

}


 function extractEasebuzzId(response) {
  return (
    response?.data?.easepayid ||

    response?.data?.easebuzzid ||

    response?.data?.id ||

    response?.easepayid ||

    response?.easebuzzid ||

    response?.id ||

    null
  );
}


 function normalizeEasebuzzStatus(status) {

  const value = String(status || "")
    .trim()
    .toLowerCase();


  if (
    [
      "success",
      "successful",
      "captured",
      "paid",
      "completed"
    ].includes(value)
  ) {
    return "SUCCESS";
  }


  if (
    [
      "failure",
      "failed",
      "error",
      "usercancelled",
      "dropped"
    ].includes(value)
  ) {
    return "FAILED";
  }


  if (
    [
      "pending",
      "initiated"
    ].includes(value)
  ) {
    return "PROCESSING";
  }


  return "RECEIVED";
}


 function extractEasebuzzWebhookIds(body) {

  return {

    merchantTxn:
      body?.txnid ||
      body?.merchant_txn ||
      body?.udf3 ||
      null,


    easebuzzId:
      body?.easepayid ||
      body?.easebuzzid ||
      body?.payment_id ||
      null,

  };

}


module.exports = {
  generatePaymentRequestId,
  generateMerchantTxn,
  buildEasyCollectHash,
  createEasyCollectPaymentLink,
  extractEasebuzzPaymentLink,
  extractEasebuzzId,
  normalizeEasebuzzStatus,
  extractEasebuzzWebhookIds,
};