const crypto = require("crypto");

exports.generateInitiateAuth = ({
  key,
  account_number = "",
  ifsc = "",
  upi_handle = "",
  unique_request_number,
  amount,
  salt,
}) => {
  const raw = [
    key,
    account_number,
    ifsc,
    upi_handle,
    unique_request_number,
    amount,
    salt,
  ].join("|");

  return crypto.createHash("sha512").update(raw).digest("hex");
};
