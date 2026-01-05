const crypto = require("crypto");

exports.verifyWebhookHash = (data) => {
  const raw = [
    process.env.EASEBUZZ_KEY,
    data.beneficiary_account_number || "",
    data.beneficiary_account_ifsc || "",
    data.beneficiary_upi_handle || "",
    data.unique_request_number,
    data.amount,
    data.unique_transaction_reference || "",
    data.status,
    process.env.EASEBUZZ_SALT,
  ].join("|");

  const hash = crypto.createHash("sha512").update(raw).digest("hex");
  return hash === data.Authorization;
};
