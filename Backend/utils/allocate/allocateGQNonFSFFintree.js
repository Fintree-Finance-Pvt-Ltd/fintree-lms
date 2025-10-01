

const { queryDB } = require("../helpers");

module.exports = async function allocateGQNonFSFFintree(lan, payment) {
  let remaining = parseFloat(payment.transfer_amount);
  const { payment_date, payment_id } = payment;

  if (!payment_id) throw new Error("❌ payment_id missing");

  // 1️⃣ Allocate to EMIs
  while (remaining > 0) {
    const [emi] = await queryDB(
      `SELECT * FROM manual_rps_gq_non_fsf_fintree WHERE lan = ? AND (remaining_interest > 0 OR remaining_principal > 0)
       ORDER BY due_date ASC LIMIT 1`,
      [lan]
    );

    if (!emi) break;

    let interest = parseFloat(emi.remaining_interest || 0);
    let principal = parseFloat(emi.remaining_principal || 0);

    // Interest first
    if (interest > 0 && remaining > 0) {
      const alloc = Math.min(interest, remaining);
      remaining -= alloc;
      interest -= alloc;

      await queryDB(
        `INSERT INTO allocation_fintree (lan, due_date, allocation_fintree_date, allocated_amount, charge_type, payment_id)
         VALUES (?, ?, ?, ?, 'Interest', ?)`,
        [lan, emi.due_date, payment_date, alloc, payment_id]
      );
    }

    // Then Principal
    if (interest === 0 && principal > 0 && remaining > 0) {
      const alloc = Math.min(principal, remaining);
      remaining -= alloc;
      principal -= alloc;

      await queryDB(
        `INSERT INTO allocation_fintree (lan, due_date, allocation_fintree_date, allocated_amount, charge_type, payment_id)
         VALUES (?, ?, ?, ?, 'Principal', ?)`,
        [lan, emi.due_date, payment_date, alloc, payment_id]
      );
    }

    await queryDB(
      `UPDATE manual_rps_gq_non_fsf_fintree
       SET remaining_interest = ?, remaining_principal = ?,
           remaining_emi = ?, remaining_amount = ?, payment_date = ?
       WHERE id = ?`,
      [
        interest,
        principal,
        interest + principal,
        interest + principal,
        payment_date,
        emi.id,
      ]
    );

    if (interest > 0 || principal > 0) break; // Stop if still pending
  }
// 3️⃣ Park excess as Excess Payment if still remaining
  if (remaining > 0) {
    await queryDB(
      `INSERT INTO loan_charges_fintree (lan, charge_type, amount, charge_date, due_date, paid_status, created_at)
       VALUES (?, 'Excess Payment', ?, ?, ?, 'Not Paid', NOW())`,
      [lan, remaining, payment_date, payment_date]
    );

    await queryDB(
      `INSERT INTO allocation_fintree (lan, due_date, allocation_fintree_date, allocated_amount, charge_type, payment_id)
       VALUES (?, ?, ?, ?, 'Excess Payment', ?)`,
      [lan, payment_date, payment_date, remaining, payment_id]
    );

    remaining = 0;
  }

  // 4️⃣ Auto-close loan if fully cleared
  const [pending] = await queryDB(
    `SELECT SUM(remaining_principal + remaining_interest) AS pending
     FROM manual_rps_gq_non_fsf_fintree WHERE lan = ?`,
    [lan]
  );

  const hasPending = parseFloat(pending.pending || 0);

  if (hasPending === 0) {
    await queryDB(
      `UPDATE loan_booking_gq_non_fsf SET status = 'Fully Paid' WHERE lan = ?`,
      [lan]
    );
  }
};
