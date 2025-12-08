////////////////////////////////////////////////////
// allocateHelium.js

const db = require("../../config/db");

const queryDB = (sql, params) =>
  new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) reject(err);
      else resolve(results);
    });
  });

/**
 * Allocate payments for HELIUM loans.
 * Interest first, then principal. Oldest EMI first.
 */
const allocateHelium = async (lan, payment) => {
  let remaining = parseFloat(payment.transfer_amount);
  const paymentDate = payment.payment_date;
  const paymentId = payment.payment_id;

  if (!paymentId) throw new Error("❌ payment_id is required");

  // --- HELIUM loan tables ---
  const emiTable = "manual_rps_helium";
  const loanTable = "loan_booking_helium";

  // 1️⃣ Knock off EMIs in order — interest first, then principal
  while (remaining > 0) {
    const [emi] = await queryDB(
      `SELECT *
       FROM ${emiTable}
       WHERE lan = ?
       AND (remaining_interest > 0 OR remaining_principal > 0)
       ORDER BY due_date ASC
       LIMIT 1`,
      [lan]
    );

    if (!emi) break;

    let interestDue = Math.max(0, parseFloat(emi.remaining_interest || 0));
    let principalDue = Math.max(0, parseFloat(emi.remaining_principal || 0));

    // Interest allocation
    if (remaining > 0 && interestDue > 0) {
      const interestAlloc = Math.min(interestDue, remaining);
      remaining -= interestAlloc;
      interestDue -= interestAlloc;

      await queryDB(
        `INSERT INTO allocation
         (lan, due_date, allocation_date, allocated_amount, charge_type, payment_id)
         VALUES (?, ?, ?, ?, 'Interest', ?)`,
        [lan, emi.due_date, paymentDate, interestAlloc, paymentId]
      );
    }

    // Principal allocation
    if (remaining > 0 && interestDue === 0 && principalDue > 0) {
      const principalAlloc = Math.min(principalDue, remaining);
      remaining -= principalAlloc;
      principalDue -= principalAlloc;

      await queryDB(
        `INSERT INTO allocation
         (lan, due_date, allocation_date, allocated_amount, charge_type, payment_id)
         VALUES (?, ?, ?, ?, 'Principal', ?)`,
        [lan, emi.due_date, paymentDate, principalAlloc, paymentId]
      );
    }

    // Update EMI record
    const updatedRemaining = interestDue + principalDue;
    await queryDB(
      `UPDATE ${emiTable}
       SET remaining_interest = ?,
           remaining_principal = ?,
           remaining_emi = ?,
           remaining_amount = ?,
           payment_date = ?
       WHERE id = ?`,
      [
        interestDue,
        principalDue,
        updatedRemaining,
        updatedRemaining,
        paymentDate,
        emi.id,
      ]
    );

    // Stop if EMI still has dues
    if (interestDue > 0 || principalDue > 0) break;
  }

  // 2️⃣ Allocate excess payments
  if (remaining > 0) {
    await queryDB(
      `INSERT INTO allocation
       (lan, due_date, allocation_date, allocated_amount, charge_type, payment_id)
       VALUES (?, ?, ?, ?, 'Excess Payment', ?)`,
      [lan, paymentDate, paymentDate, remaining, paymentId]
    );
    console.log(`💠 Excess payment parked for HELIUM LAN ${lan}`);
    remaining = 0;
  }

  // 3️⃣ Update loan DPD/status
  await queryDB(`CALL sp_update_loan_status_dpd()`);

  // 4️⃣ Mark as Fully Paid when no dues left
  const [pending] = await queryDB(
    `SELECT COUNT(*) AS count
     FROM ${emiTable}
     WHERE lan = ?
     AND (remaining_interest > 0 OR remaining_principal > 0)`,
    [lan]
  );

  if (pending.count === 0) {
    await queryDB(
      `UPDATE ${loanTable}
       SET status = 'Fully Paid'
       WHERE lan = ?`,
      [lan]
    );
    console.log(`💠 Loan marked Fully Paid for HELIUM LAN ${lan}`);
  }
};

module.exports = allocateHelium;
