// const crypto = require("crypto");

// exports.verifyWebhookHash = (data) => {
//   const raw = [
//     process.env.EASEBUZZ_KEY,
//     data.beneficiary_account_number || "",
//     data.beneficiary_account_ifsc || "",
//     data.beneficiary_upi_handle || "",
//     data.unique_request_number,
//     data.amount,
//     data.unique_transaction_reference || "",
//     data.status,
//     process.env.EASEBUZZ_SALT,
//   ].join("|");

//   console.log("Raw String for Hashing:", raw);

//   const hash = crypto.createHash("sha512").update(raw).digest("hex");
//   console.log("Computed Hash:", hash);
//   console.log("Received Hash:", data.Authorization);
//   return hash === data.Authorization;
// };



const crypto = require("crypto");

exports.verifyWebhookHash = (data) => {
  const formatAmount = (amount) => {
    const num = Number(amount);

    if (Number.isInteger(num)) {
      return num.toFixed(1); // 2 → "2.0"
    }

    return num.toString(); // 2.3 → "2.3", 2.34 → "2.34"
  };

  const raw = [
    process.env.EASEBUZZ_KEY,
    data.beneficiary_account_number || "",
    data.beneficiary_account_ifsc || "",
    data.beneficiary_upi_handle || "",
    data.unique_request_number,
    formatAmount(data.amount),
    data.unique_transaction_reference || "",
    data.status,
    process.env.EASEBUZZ_SALT,
  ].join("|");

  console.log("Raw String for Hashing:", raw);

  const hash = crypto
    .createHash("sha512")
    .update(raw)
    .digest("hex");

  console.log("Computed Hash:", hash);
  console.log("Received Hash:", data.Authorization);

  return hash === data.Authorization;
};
