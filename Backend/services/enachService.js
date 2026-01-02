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
async function createMandate(payload) {
  const resp = await digio.post("/v3/client/mandate/create_form", payload);
  const data = resp.data;

  await db.promise().query(
    `INSERT INTO enach_mandates
     (lan, document_id, customer_identifier, status, mandate_amount,
      account_no, ifsc, account_type, bank_name, auth_url, raw_response)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      payload.mandate_data.customer_ref_number,
      data.id,
      payload.customer_identifier,
      data.state,
      payload.mandate_data.collection_amount,
      payload.mandate_data.customer_account_number,
      payload.mandate_data.destination_bank_id,
      payload.mandate_data.customer_account_type,
      payload.mandate_data.destination_bank_name,
      data.authentication_url,
      JSON.stringify(data),
    ]
  );

  await updateLoanTables(
    `UPDATE __TABLE__ SET bank_status='MANDATE_CREATED' WHERE lan=?`,
    [payload.mandate_data.customer_ref_number]
  );

  return data;
}

module.exports = {
  verifyBank,
  performFuzzyMatch,
  createMandate,
};
