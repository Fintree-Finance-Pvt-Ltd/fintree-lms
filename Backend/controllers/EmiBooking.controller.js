const db = require("../db/mysql");
const wire = require("../services/easebuzzWire.service");
const { v4: uuidv4 } = require("uuid");

exports.approveInitiatedLoan = async (req, res) => {
  const { lan } = req.params;
  const { status, table } = req.body;

  // Update status normally
  await db.promise().query(
    `UPDATE ?? SET status = ? WHERE lan = ?`,
    [table, status, lan]
  );

  // 🔴 Only EMI Club + Approved
  if (table !== "loan_booking_emiclub" || status !== "approved") {
    return res.json({ message: "Status updated" });
  }

  try {
    const [[loan]] = await db.promise().query(
      `SELECT * FROM loan_booking_emiclub WHERE lan = ?`,
      [lan]
    );

    const uniqueRequestNo = `EMICLUB_${lan}_${Date.now()}`;

    const payload = {
      key: process.env.EASEBUZZ_WIRE_KEY,
      virtual_account_number: loan.virtual_account_number,
      beneficiary_type: "bank_account",
      beneficiary_name: loan.customer_name,
      account_number: loan.account_number,
      ifsc: loan.ifsc,
      unique_request_number: uniqueRequestNo,
      payment_mode: "IMPS",
      amount: loan.disbursement_amount,
      email: loan.email,
      phone: loan.mobile_number,
      narration: "EMI Club Loan Disbursement",
    };

    const ebRes = await wire.initiateQuickTransfer(payload);

    const tr = ebRes.data.data.transfer_request;

    await db.promise().query(
      `
      INSERT INTO payouts
      (lan, transaction_id, unique_request_number, amount, status, message)
      VALUES (?, ?, ?, ?, ?, ?)
      `,
      [
        lan,
        tr.id,
        uniqueRequestNo,
        tr.amount,
        tr.status === "success" ? "SUCCESS" : "PENDING",
        tr.failure_reason,
      ]
    );

    res.json({
      message: "Loan approved & payout initiated",
      transaction_id: tr.id,
      status: tr.status,
    });

  } catch (err) {
    console.error("Easebuzz Wire error:", err.response?.data || err.message);
    res.json({
      message: "Loan approved, payout pending verification",
    });
  }
};
