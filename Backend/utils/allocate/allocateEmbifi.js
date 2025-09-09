const { queryDB } = require("../helpers");

/**
 * Allocate a single repayment for an Embifi LAN
 * @param {string} lan - e.g., "E100002"
 * @param {{transfer_amount: string|number, payment_date: string, payment_id: string}} payment
 */
const allocateEmbifi = async (lan, payment) => {
  let remaining = parseFloat(payment.transfer_amount);
  const paymentDate = payment.payment_date;
  const paymentId = payment.payment_id;

  if (!paymentId) throw new Error("❌ payment_id is required");

  const emiTable = "manual_rps_embifi_loan";
  const loanTable = "loan_booking_embifi";

  // 1️⃣ Knock off EMIs: interest first then principal
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

    if (!emi) break; // nothing left to allocate against

    let interestDue = parseFloat(emi.remaining_interest || 0);
    let principalDue = parseFloat(emi.remaining_principal || 0);

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

    // Principal Allocation (only after interest cleared)
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

    // Update the EMI row
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
        interestDue + principalDue,
        interestDue + principalDue,
        paymentDate,
        emi.id,
      ]
    );

    // If current EMI not fully cleared, stop allocating further EMIs
    if (interestDue > 0 || principalDue > 0) break;
  }

  // 2️⃣ Park any leftover as Excess Payment
  if (remaining > 0) {
    await queryDB(
      `INSERT INTO allocation (lan, due_date, allocation_date, allocated_amount, charge_type, payment_id)
       VALUES (?, ?, ?, ?, 'Excess Payment', ?)`,
      [lan, paymentDate, paymentDate, remaining, paymentId]
    );
    remaining = 0;
    console.log(`✅ Excess payment parked for LAN ${lan}`);
  }

  // 3️⃣ Run your status/DPD SP (keep same SP you already use system-wide)
  await queryDB(`CALL sp_update_loan_status_dpd()`);

  // 4️⃣ If no dues left, mark loan Fully Paid
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
    console.log(`✅ Loan status updated to Fully Paid for LAN ${lan}`);
  }
};

