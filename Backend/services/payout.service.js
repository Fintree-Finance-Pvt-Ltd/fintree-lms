const axios = require("axios");
const crypto = require("crypto");
const db = require("../db");

/**
 * STEP 1: Approve loan
 * STEP 2: Initiate Easebuzz Quick Transfer
 * STEP 3: Save unique_request_number
 */
exports.approveAndInitiatePayout = async (req, res) => {
  const { lan } = req.params;
  const { table } = req.body;

  try {
    // 1️⃣ Fetch loan + beneficiary details
    const [[loan]] = await db.query(
      `SELECT customer_name, amount, account_number, ifsc, upi_handle, beneficiary_type
       FROM ${table}
       WHERE lan = ?`,
      [lan]
    );

    if (!loan) {
      return res.status(404).json({ message: "Loan not found" });
    }

    // 2️⃣ Update loan status to APPROVED
    await db.query(
      `UPDATE ${table} SET status = 'approved' WHERE lan = ?`,
      [lan]
    );

    // 3️⃣ Generate unique_request_number
    const unique_request_number = `LAN_${lan}_${Date.now()}`;

    // 4️⃣ Save initial payout record
    await db.query(
      `INSERT INTO quick_transfers
       (unique_request_number, amount, status)
       VALUES (?, ?, ?)`,
      [unique_request_number, loan.amount, "INITIATED"]
    );

    // 5️⃣ Generate Authorization Hash
    const raw = [
      process.env.EASEBUZZ_KEY,
      loan.account_number || "",
      loan.ifsc || "",
      loan.upi_handle || "",
      unique_request_number,
      loan.amount,
      process.env.EASEBUZZ_SALT,
    ].join("|");

    const authorization = crypto
      .createHash("sha512")
      .update(raw)
      .digest("hex");

    // 6️⃣ Call Easebuzz Initiate Quick Transfer
    const response = await axios.post(
      "https://wire.easebuzz.in/api/v1/quick_transfers/initiate/",
      {
        key: process.env.EASEBUZZ_KEY,
        beneficiary_type: loan.beneficiary_type,
        beneficiary_name: loan.customer_name,
        account_number: loan.account_number,
        ifsc: loan.ifsc,
        upi_handle: loan.upi_handle,
        unique_request_number,
        payment_mode: "NEFT",
        amount: loan.amount,
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
     * IMPORTANT:
     * HTTP 200 ≠ success payout
     * success=true ≠ payout success
     */
    if (response.data.success === false) {
      await db.query(
        `UPDATE quick_transfers
         SET status='FAILED', failure_reason=?
         WHERE unique_request_number=?`,
        [response.data.message, unique_request_number]
      );
    }

    return res.json({
      success: true,
      message: "Loan approved & payout initiated",
      unique_request_number,
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Approval or payout initiation failed",
    });
  }
};
