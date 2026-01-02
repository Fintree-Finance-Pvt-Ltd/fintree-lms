const db = require("../config/db");
const {
  verifyBankAccount,
  fuzzyMatch,
} = require("./bankVerificationService");
const digio = require("./digioClient");

/**
 * Utility: update both loan tables
 */
async function updateLoanTables(query, params) {
  await db
    .promise()
    .query(
      query.replace("__TABLE__", "loan_booking_zypay_customer"),
      params
    );
}


/**
 * STEP 1: Verify Bank
 */
async function verifyBank({ lan, account_no, ifsc, name, bank_name, account_type, mandate_amount }) {
  const pennyAmount = Number(process.env.DIGIO_PENNY_AMOUNT || "1.00");

  const response = await verifyBankAccount({
    accountNo: account_no,
    ifsc,
    name,
    amount: pennyAmount,
  });

  await db.promise().query(
    `INSERT INTO bank_verification
     (lan, account_no, ifsc, verified, verified_at,
      bank_name, bank_beneficiary_name, fuzzy_match_score, raw_response,
      account_type, mandate_amount)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       verified = VALUES(verified),
       verified_at = VALUES(verified_at),
       fuzzy_match_score = VALUES(fuzzy_match_score),
       raw_response = VALUES(raw_response)`,
    [
      lan,
      account_no,
      ifsc,
      response.verified ? 1 : 0,
      response.verified_at || null,
      bank_name || null,
      response.beneficiary_name_with_bank || name,
      response.fuzzy_match_score ?? null,
      JSON.stringify(response),
      account_type || null,
      mandate_amount || null,
    ]
  );

  if (!response.verified) return response;

  await updateLoanTables(
    `UPDATE __TABLE__
     SET bank_status='VERIFIED'
     WHERE lan=?`,
    [lan]
  );

  return response;
}

/**
 * STEP 2: Fuzzy Match
 */
async function performFuzzyMatch({ lan, sourceText, targetText }) {
  const response = await fuzzyMatch({
    context: "Name",
    sourceText,
    targetText,
  });

  await db.promise().query(
    `INSERT INTO fuzzy_match_logs
     (lan, context, matched, score, source_text, target_text, raw_response, created_at)
     VALUES (?, 'Name', ?, ?, ?, ?, ?, NOW())`,
    [
      lan,
      response.matched ? 1 : 0,
      response.match_score,
      sourceText,
      targetText,
      JSON.stringify(response),
    ]
  );

  return response;
}

/**
 * STEP 3: Create Mandate
 */
async function createMandate(input) {
  const {
    lan,
    customer_identifier, // PAN number
    amount,
    account_no,
    ifsc,
    customer_name,
    bank_name,
  } = input;

  // ---- validations ----
  if (!lan || !customer_identifier || !amount || !account_no || !ifsc) {
    throw new Error("Missing required fields");
  }

  if (!process.env.DIGIO_CORPORATE_CONFIG_ID) {
    throw new Error("DIGIO_CORPORATE_CONFIG_ID missing in env");
  }

  // ---- business rules ----
  const start_date = new Date();
  const end_date = new Date();
  end_date.setMonth(end_date.getMonth() + 6);

  const formatDate = (d) => d.toISOString().slice(0, 10);

  // ---- payload ----
  const payload = {
    customer_identifier, // PAN number
    auth_mode: "api",
    mandate_type: "create",
    corporate_config_id: process.env.DIGIO_CORPORATE_CONFIG_ID,
    notify_customer: true,
    include_authentication_url: true,
    mandate_data: {
      collection_amount: Number(amount),
      instrument_type: "debit",
      first_collection_date: formatDate(start_date),
      final_collection_date: formatDate(end_date),
      is_recurring: true,
      frequency: "Monthly", // enforced
      management_category: "L001",
      customer_name,
      customer_account_number: account_number,
      customer_account_type: "savings", // enforced
      destination_bank_id: ifsc,
      destination_bank_name: bank_name,
      customer_ref_number: lan,
      scheme_ref_number: lan,
    },
  };

  // ---- Digio API call ----
  const resp = await digio.post(
    "/v3/client/mandate/create_form",
    payload
  );

  return resp.data;
}

module.exports = {
  verifyBank,
  performFuzzyMatch,
  createMandate,
};
