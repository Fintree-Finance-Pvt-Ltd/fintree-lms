////////////////////////////////////////////////////
const db = require("../../config/db");

const queryDB = (sql, params) =>
  new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) reject(err);
      else resolve(results);
    });
  });




// allocateEV.js
const allocateHEYEV = async (lan, payment) => {
  let remaining = parseFloat(payment.transfer_amount);
  const paymentDate = payment.payment_date;
  const paymentId = payment.payment_id;

  if (!paymentId) throw new Error("❌ payment_id is required");

  // --- Decide tables by LAN prefix (WCTL / BL / default EV) ---
  const lanKey = String(lan || "").trim().toUpperCase();

  let emiTable, loanTable;
  if (lanKey.startsWith("HEYBF")) {
    emiTable = "manual_rps_hey_ev_battery";
    loanTable = "loan_booking_hey_ev_battery";
  } else {
    // default EV loans
    emiTable = "manual_rps_hey_ev";
    loanTable = "loan_booking_hey_ev";
  }

  // 1️⃣ Knock off EMIs: interest first, then principal (oldest due first)
  while (remaining > 0) {
    const [emi] = await queryDB(
      `SELECT * FROM ${emiTable}
       WHERE lan = ? AND (remaining_interest > 0 OR remaining_principal > 0)
       ORDER BY due_date ASC
       LIMIT 1`,
      [lan]
    );

    if (!emi) break;

    let interestDue = Math.max(0, parseFloat(emi.remaining_interest || 0));
    let principalDue = Math.max(0, parseFloat(emi.remaining_principal || 0));

    // Interest Allocation
    if (remaining > 0 && interestDue > 0) {
      const interestAlloc = Math.min(interestDue, remaining);
      remaining -= interestAlloc;
      interestDue -= interestAlloc;

      await queryDB(
        `INSERT INTO allocation (lan, due_date, allocation_date, allocated_amount, charge_type, payment_id)
         VALUES (?, ?, ?, ?, 'Interest', ?)`,
        [lan, emi.due_date, paymentDate, interestAlloc, paymentId]
      );
    }

    // Principal Allocation
    if (remaining > 0 && interestDue === 0 && principalDue > 0) {
      const principalAlloc = Math.min(principalDue, remaining);
      remaining -= principalAlloc;
      principalDue -= principalAlloc;

      await queryDB(
        `INSERT INTO allocation (lan, due_date, allocation_date, allocated_amount, charge_type, payment_id)
         VALUES (?, ?, ?, ?, 'Principal', ?)`,
        [lan, emi.due_date, paymentDate, principalAlloc, paymentId]
      );
    }

    // Update EMI record for this installment
    const newRemaining = interestDue + principalDue;
    await queryDB(
      `UPDATE ${emiTable}
       SET remaining_interest = ?,
           remaining_principal = ?,
           remaining_emi = ?,
           remaining_amount = ?,
           payment_date = ?
       WHERE id = ?`,
      [interestDue, principalDue, newRemaining, newRemaining, paymentDate, emi.id]
    );

    // If this EMI still has dues, stop here so next call continues on same EMI
    if (interestDue > 0 || principalDue > 0) break;
  }

  // 2️⃣ Allocate to Excess Payment if amount still remains
  if (remaining > 0) {
    await queryDB(
      `INSERT INTO allocation (lan, due_date, allocation_date, allocated_amount, charge_type, payment_id)
       VALUES (?, ?, ?, ?, 'Excess Payment', ?)`,
      [lan, paymentDate, paymentDate, remaining, paymentId]
    );
    remaining = 0;
    console.log(`✅ Excess payment parked for LAN ${lan}`);
  }

  // Update DPD/loan status via SP (shared across products)
  await queryDB(`CALL sp_update_loan_status_dpd()`);

  // 3️⃣ If fully paid, mark loan closed in the right loan table
  const [pending] = await queryDB(
    `SELECT COUNT(*) AS count
     FROM ${emiTable}
     WHERE lan = ? AND (remaining_interest > 0 OR remaining_principal > 0)`,
    [lan]
  );

  if (pending.count === 0) {
    await queryDB(
      `UPDATE ${loanTable}
       SET status = 'Fully Paid'
       WHERE lan = ?`,
      [lan]
    );
    console.log(`✅ Loan status updated to Fully Paid for LAN ${lan}`);
  }
};

module.exports = allocateHEYEV;
