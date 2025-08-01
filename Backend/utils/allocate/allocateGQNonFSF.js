
// const { queryDB } = require("../helpers");

// module.exports = async function allocateEV(lan, payment) {
//   let remaining = parseFloat(payment.transfer_amount);
//   const { payment_date, payment_id } = payment;

//   if (!payment_id) throw new Error("❌ payment_id missing");

//   while (remaining > 0) {
//     const [emi] = await queryDB(
//       `SELECT * FROM manual_rps_gq_non_fsf WHERE lan = ? AND (remaining_interest > 0 OR remaining_principal > 0) ORDER BY due_date ASC LIMIT 1`,
//       [lan]
//     );
//     if (!emi) break;

//     let interest = parseFloat(emi.remaining_interest || 0);
//     let principal = parseFloat(emi.remaining_principal || 0);

//     if (interest > 0 && remaining > 0) {
//       const alloc = Math.min(interest, remaining);
//       remaining -= alloc;
//       interest -= alloc;
//       await queryDB(
//         `INSERT INTO allocation (lan, due_date, allocation_date, allocated_amount, charge_type, payment_id)
//          VALUES (?, ?, ?, ?, 'Interest', ?)`,
//         [lan, emi.due_date, payment_date, alloc, payment_id]
//       );
//     }

//     if (interest === 0 && principal > 0 && remaining > 0) {
//       const alloc = Math.min(principal, remaining);
//       remaining -= alloc;
//       principal -= alloc;
//       await queryDB(
//         `INSERT INTO allocation (lan, due_date, allocation_date, allocated_amount, charge_type, payment_id)
//          VALUES (?, ?, ?, ?, 'Principal', ?)`,
//         [lan, emi.due_date, payment_date, alloc, payment_id]
//       );
//     }

//     await queryDB(
//       `UPDATE manual_rps_gq_non_fsf SET remaining_interest=?, remaining_principal=?, remaining_emi=?, remaining_amount=?, payment_date=? WHERE id=?`,
//       [interest, principal, interest + principal, interest + principal, payment_date, emi.id]
//     );

//     if (interest > 0 || principal > 0) break;
//   }

//   // Allocate to NACH charges
//   if (remaining > 0) {
//     const charges = await queryDB(
//       `SELECT * FROM loan_charges WHERE lan = ? AND charge_type = 'NACH_Bounce' AND paid_status = 'Unpaid' ORDER BY due_date ASC`,
//       [lan]
//     );
//     for (const charge of charges) {
//       if (remaining <= 0) break;
//       const alloc = Math.min(charge.amount, remaining);
//       remaining -= alloc;
//       const paid = alloc === charge.amount;
//       await queryDB(
//         `UPDATE loan_charges SET paid_amount = ?, paid_status = ?, payment_time = ? WHERE id = ?`,
//         [alloc, paid ? "Paid" : "Unpaid", payment.payment_date, charge.id]
//       );
//       await queryDB(
//         `INSERT INTO allocation (lan, due_date, allocation_date, allocated_amount, charge_type, payment_id)
//          VALUES (?, ?, ?, ?, 'NACH_Bounce', ?)`,
//         [lan, payment.payment_date, payment.payment_date, alloc, payment.payment_id]
//       );
//     }
//   }
// };


const { queryDB } = require("../helpers");

module.exports = async function allocateEV(lan, payment) {
  let remaining = parseFloat(payment.transfer_amount);
  const { payment_date, payment_id } = payment;

  if (!payment_id) throw new Error("❌ payment_id missing");

  // 1️⃣ Allocate to EMIs
  while (remaining > 0) {
    const [emi] = await queryDB(
      `SELECT * FROM manual_rps_gq_non_fsf WHERE lan = ? AND (remaining_interest > 0 OR remaining_principal > 0)
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
        `INSERT INTO allocation (lan, due_date, allocation_date, allocated_amount, charge_type, payment_id)
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
        `INSERT INTO allocation (lan, due_date, allocation_date, allocated_amount, charge_type, payment_id)
         VALUES (?, ?, ?, ?, 'Principal', ?)`,
        [lan, emi.due_date, payment_date, alloc, payment_id]
      );
    }

    await queryDB(
      `UPDATE manual_rps_gq_non_fsf
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

  // 2️⃣ Allocate to NACH_Bounce (optional) — COMMENTED as requested
  /*
  if (remaining > 0) {
    const charges = await queryDB(
      `SELECT * FROM loan_charges WHERE lan = ? AND charge_type = 'NACH_Bounce' AND paid_status = 'Unpaid'
       ORDER BY due_date ASC`,
      [lan]
    );

    for (const charge of charges) {
      if (remaining <= 0) break;
      const alloc = Math.min(charge.amount, remaining);
      remaining -= alloc;
      const paid = alloc === charge.amount;

      await queryDB(
        `UPDATE loan_charges SET paid_amount = ?, paid_status = ?, payment_time = ? WHERE id = ?`,
        [alloc, paid ? "Paid" : "Unpaid", payment_date, charge.id]
      );

      await queryDB(
        `INSERT INTO allocation (lan, due_date, allocation_date, allocated_amount, charge_type, payment_id)
         VALUES (?, ?, ?, ?, 'NACH_Bounce', ?)`,
        [lan, payment_date, payment_date, alloc, payment_id]
      );
    }
  }
  */

  // 3️⃣ Park excess as Excess Payment if still remaining
  if (remaining > 0) {
    await queryDB(
      `INSERT INTO loan_charges (lan, charge_type, amount, charge_date, due_date, paid_status, created_at)
       VALUES (?, 'Excess Payment', ?, ?, ?, 'Not Paid', NOW())`,
      [lan, remaining, payment_date, payment_date]
    );

    await queryDB(
      `INSERT INTO allocation (lan, due_date, allocation_date, allocated_amount, charge_type, payment_id)
       VALUES (?, ?, ?, ?, 'Excess Payment', ?)`,
      [lan, payment_date, payment_date, remaining, payment_id]
    );

    remaining = 0;
  }

  // 4️⃣ Auto-close loan if fully cleared
  const [pending] = await queryDB(
    `SELECT SUM(remaining_principal + remaining_interest) AS pending
     FROM manual_rps_gq_non_fsf WHERE lan = ?`,
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
