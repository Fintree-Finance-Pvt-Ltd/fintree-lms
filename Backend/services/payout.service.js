const axios = require("axios");
const crypto = require("crypto");
const db = require("../config/db");

/**
 * Service function
 * ❌ NO req, res
 * ✅ Only plain arguments
 */
exports.approveAndInitiatePayout = async ({ lan, table }) => {
  try {

    console.log("table and lan picked", lan, table);
    /* =====================================================
       1️⃣ Fetch loan + beneficiary details
    ===================================================== */
    const [[loan]] = await db.promise().query(
      `
      SELECT 
        name_in_bank,
        loan_amount,
        account_number,
        ifsc,
        email_id,
        account_type
      FROM ?? 
      WHERE lan = ?
      `,
      [table, lan]
    );

    if (!loan) {
      throw new Error(`Loan not found for LAN ${lan}`);
    }

    /* =====================================================
       2️⃣ Generate unique_request_number
    ===================================================== */
    const unique_request_number = `LAN_${lan}_${Date.now()}`;

    /* =====================================================
       3️⃣ Insert initial payout record
    ===================================================== */
    await db.promise().query(
      `
      INSERT INTO quick_transfers
      (unique_request_number, amount, status)
      VALUES (?, ?, ?)
      `,
      [unique_request_number, loan.amount, "INITIATED"]
    );

    /* =====================================================
       4️⃣ Generate Easebuzz Authorization hash
       Format:
       key|account_number|ifsc|upi_handle|unique_request_number|amount|salt
    ===================================================== */
    const raw = [
      process.env.EASEBUZZ_KEY,
      loan.account_number || "",
      loan.ifsc || "",
      loan.upi_handle || "",
      unique_request_number,
      loan.loan_amount,
      process.env.EASEBUZZ_SALT,
    ].join("|");

    console.log("raw payload", raw);

    const authorization = crypto
      .createHash("sha512")
      .update(raw)
      .digest("hex");

      console.log("Authorixation", authorization);

    /* =====================================================
       5️⃣ Call Easebuzz Initiate Quick Transfer API
    ===================================================== */
    const response = await axios.post(
      "https://wire.easebuzz.in/api/v1/quick_transfers/initiate/",
      {
        key: process.env.EASEBUZZ_KEY,
          account_number: loan.account_number,
        beneficiary_type: "bank_account",
        beneficiary_name: loan.name_in_bank,
       upi_handle:"",
        unique_request_number,
        ifsc: loan.ifsc,
        payment_mode: "IMPS",
       amount: loan.loan_amount,
       udf1: loan.lan
      },
      {
        headers: {
          Authorization: authorization,
          "WIRE-API-KEY": process.env.EASEBUZZ_WIRE_API_KEY,
          "Content-Type": "application/json",
        },
        timeout: 15000,
      }
    );

    /* =====================================================
       6️⃣ Handle application-level failure
       HTTP 200 ≠ payout success
    ===================================================== */
    if (response.data?.success === false) {
      await db.promise().query(
        `
        UPDATE quick_transfers
        SET status = 'FAILED',
            failure_reason = ?
        WHERE unique_request_number = ?
        `,
        [response.data.message, unique_request_number]
      );
    }

    /* =====================================================
       7️⃣ RETURN RESULT (NO res.json HERE)
    ===================================================== */
    return {
      success: true,
      unique_request_number,
      easebuzz_acknowledged: response.data?.success === true,
    };

  } catch (error) {
    console.error("approveAndInitiatePayout error:", error);
    throw error; // let controller decide response
  }
};
