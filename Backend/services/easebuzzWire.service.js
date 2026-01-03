const axios = require("axios");
const { generateAuthorizationHash } = require("../utils/easebuzzHash.util");

const BASE_URL = "https://wire.easebuzz.in/api/v1/quick_transfers/initiate/";

exports.initiateQuickTransfer = async (payload) => {
  const authorization = generateAuthorizationHash({
    key: payload.key,
    account_number: payload.account_number || "",
    ifsc: payload.ifsc || "",
    upi_handle: payload.upi_handle || "",
    unique_request_number: payload.unique_request_number,
    amount: payload.amount,
    salt: process.env.EASEBUZZ_WIRE_SALT,
  });

  return axios.post(BASE_URL, payload, {
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: authorization,
      "WIRE-API-KEY": process.env.EASEBUZZ_WIRE_API_KEY,
    },
    timeout: 15000,
  });
};
