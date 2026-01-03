const crypto = require("crypto");

/**
 * Hash Sequence:
 * key|beneficiary_account_number|ifsc|upi_handle|
 * unique_request_number|amount|unique_transaction_reference|status|salt
 */
exports.verifyEasebuzzWebhookHash = ({
  key,
  beneficiary_account_number = "",
  ifsc = "",
  upi_handle = "",
  unique_request_number,
  amount,
  unique_transaction_reference = "",
  status,
  salt,
  receivedHash,
}) => {
  const raw = [
    key,
    beneficiary_account_number,
    ifsc,
    upi_handle,
    unique_request_number,
    Number(amount).toFixed(2),
    unique_transaction_reference,
    status,
    salt,
  ].join("|");

  const generatedHash = crypto
    .createHash("sha512")
    .update(raw)
    .digest("hex");

  return generatedHash === receivedHash;
};
