const axios = require("axios");
const db = require("../config/db");
const { generateInitiateAuth } = require("../utils/payoutAuth");

exports.initiateQuickTransfer = async (req, res) => {
  const payload = req.body;

  const unique_request_number = `URN_${Date.now()}`;

  // 1️⃣ Save transaction BEFORE API call
  await db.promise().query(
    `INSERT INTO quick_transfers (unique_request_number, amount, status)
     VALUES (?, ?, ?)`,
    [unique_request_number, payload.amount, "INITIATED"]
  );

  try {
    const authorization = generateInitiateAuth({
      key: process.env.EASEBUZZ_KEY,
      account_number: payload.account_number,
      ifsc: payload.ifsc,
      upi_handle: payload.upi_handle,
      unique_request_number,
      amount: payload.amount,
      salt: process.env.EASEBUZZ_SALT,
    });

    const response = await axios.post(
      "https://wire.easebuzz.in/api/v1/quick_transfers/initiate/",
      {
        ...payload,
        unique_request_number,
        key: process.env.EASEBUZZ_KEY,
      },
      {
        headers: {
          Authorization: authorization,
          "WIRE-API-KEY": process.env.EASEBUZZ_WIRE_API_KEY,
          "Content-Type": "application/json",
        },
      }
    );

    /**
     * HTTP 200 ONLY means request reached Easebuzz
     * success=true does NOT mean payout success
     */
    if (response.data.success === false) {
  await db.promise().query(
        `UPDATE quick_transfers
         SET status='FAILED', failure_reason=?
         WHERE unique_request_number=?`,
        [response.data.message, unique_request_number]
      );
    }

    return res.json({ success: true, unique_request_number });
  } catch (err) {
    /**
     * HTTP NON-200 / TIMEOUT
     * ❌ DO NOT MARK FAILED
     * Keep status INITIATED
     */
    return res.status(500).json({ success: false });
  }
};
