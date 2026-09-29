const db = require("../../config/db");

// Matches the existing EMIClub allocation order: oldest EMI, interest, principal.
async function allocateEmiClub2(lan, payment) {
  const amount = Number(payment?.transfer_amount);
  const paymentDate = payment?.payment_date;
  const paymentId = payment?.payment_id;
  if (!lan || !lan.startsWith("FINE2")) throw new Error("Invalid EMIClub2 LAN");
  if (!paymentId || !paymentDate || !Number.isFinite(amount) || amount <= 0) {
    throw new Error("Valid payment_id, payment_date and positive transfer_amount are required");
  }

  const conn = await db.promise().getConnection();
  const queryDB = async (sql, params = []) => (await conn.query(sql, params))[0];
  try {
  await conn.beginTransaction();
  const [loan] = await queryDB("SELECT status FROM loan_booking_emiclub2 WHERE lan = ? FOR UPDATE", [lan]);
  if (!loan) throw new Error(`EMIClub2 loan not found: ${lan}`);
  const [existing] = await queryDB("SELECT COUNT(*) AS count FROM allocation WHERE lan = ? AND payment_id = ?", [lan, paymentId]);
  if (Number(existing.count)) {
    await conn.rollback();
    return { success: true, lan, alreadyAllocated: true };
  }
  if (!["disbursed", "fully paid"].includes(String(loan.status).toLowerCase())) throw new Error("EMIClub2 loan is not disbursed");

  const [schedule] = await queryDB(
    `SELECT COUNT(*) AS count FROM manual_rps_emiclub2 WHERE lan = ?`, [lan]
  );
  if (!Number(schedule.count)) throw new Error(`No EMIClub2 RPS found for ${lan}`);

  let remaining = amount;
  while (remaining > 0) {
    const [emi] = await queryDB(
      `SELECT * FROM manual_rps_emiclub2
       WHERE lan = ? AND (remaining_interest > 0 OR remaining_principal > 0)
       ORDER BY due_date ASC, id ASC LIMIT 1`,
      [lan]
    );
    if (!emi) break;

    let interestDue = Math.max(0, Number(emi.remaining_interest || 0));
    let principalDue = Math.max(0, Number(emi.remaining_principal || 0));
    const interestPaid = Math.min(interestDue, remaining);
    interestDue = Number((interestDue - interestPaid).toFixed(2));
    remaining = Number((remaining - interestPaid).toFixed(2));
    if (interestPaid > 0) {
      await queryDB(
        `INSERT INTO allocation (lan, due_date, allocation_date, allocated_amount, charge_type, payment_id)
         VALUES (?, ?, ?, ?, 'Interest', ?)`,
        [lan, emi.due_date, paymentDate, interestPaid, paymentId]
      );
    }

    const principalPaid = interestDue === 0 ? Math.min(principalDue, remaining) : 0;
    principalDue = Number((principalDue - principalPaid).toFixed(2));
    remaining = Number((remaining - principalPaid).toFixed(2));
    if (principalPaid > 0) {
      await queryDB(
        `INSERT INTO allocation (lan, due_date, allocation_date, allocated_amount, charge_type, payment_id)
         VALUES (?, ?, ?, ?, 'Principal', ?)`,
        [lan, emi.due_date, paymentDate, principalPaid, paymentId]
      );
    }

    const due = Number((interestDue + principalDue).toFixed(2));
    await queryDB(
      `UPDATE manual_rps_emiclub2
       SET remaining_interest = ?, remaining_principal = ?,
           remaining_emi = ?, remaining_amount = ?, payment_date = ?
       WHERE id = ?`,
      [interestDue, principalDue, due, due, paymentDate, emi.id]
    );
    if (due > 0) break;
  }

  if (remaining > 0) {
    await queryDB(
      `INSERT INTO allocation (lan, due_date, allocation_date, allocated_amount, charge_type, payment_id)
       VALUES (?, ?, ?, ?, 'Excess Payment', ?)`,
      [lan, paymentDate, paymentDate, remaining, paymentId]
    );
  }

  // Update only this product; the shared procedure may not include EMIClub2.
  await queryDB(
    `UPDATE manual_rps_emiclub2
     SET status = CASE
       WHEN COALESCE(remaining_interest, 0) + COALESCE(remaining_principal, 0) <= 0 THEN 'Paid'
       WHEN due_date IS NULL OR due_date > CURDATE() THEN 'Not Set'
       WHEN due_date = CURDATE() THEN 'Due'
       WHEN COALESCE(remaining_interest, 0) + COALESCE(remaining_principal, 0) < emi THEN 'Part Paid'
       ELSE 'Late' END,
       dpd = CASE WHEN COALESCE(remaining_interest, 0) + COALESCE(remaining_principal, 0) > 0
         THEN GREATEST(DATEDIFF(CURDATE(), due_date), 0) ELSE 0 END
     WHERE lan = ?`, [lan]
  );
  const [pending] = await queryDB(
    `SELECT COUNT(*) AS count FROM manual_rps_emiclub2
     WHERE lan = ? AND (remaining_interest > 0 OR remaining_principal > 0)`,
    [lan]
  );
  if (Number(pending.count) === 0) {
    await queryDB(
      `UPDATE loan_booking_emiclub2 SET status = 'Fully Paid' WHERE lan = ?`,
      [lan]
    );
  }
  await conn.commit();
  return { success: true, lan, excessPayment: remaining };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

module.exports = allocateEmiClub2;
