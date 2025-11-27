// Backend/services/bankVerificationService.js
const digio = require("./digioClient");

// Penny-drop bank verification
async function verifyBankAccount({ accountNo, ifsc, name, amount }) {
  const body = {
    beneficiary_account_no: accountNo,
    beneficiary_ifsc: ifsc,
  };

  // Either send name for fuzzy match OR custom amount (max 2 Rs) – from docs
  if (name) body.beneficiary_name = name;
  if (amount) body.amount = String(amount);

  const res = await digio.post("/client/verify/bank_account", body);
  return res.data; // { id, verified, verified_at, beneficiary_name_with_bank, fuzzy_match_score, ...}
}

// Standalone Fuzzy-match (Name/Address)
async function fuzzyMatch({ context = "Name", sourceText, targetText, confidence = 75 }) {
  const body = {
    context,
    source: { text: sourceText },
    target: { text: targetText },
    confidence,
  };

  const res = await digio.post("/v3/client/kyc/fuzzy_match", body);
  return res.data; // { matched: true/false, match_score: 86.0 }
}

module.exports = {
  verifyBankAccount,
  fuzzyMatch,
};
