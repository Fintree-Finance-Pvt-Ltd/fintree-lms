const { queryDB } = require("../helpers");

/**
 * Allocate a single repayment for an SRBH LAN
 *
 * @param {string} lan
 * @param {{
 *   transfer_amount: string|number,
 *   payment_date: string,
 *   payment_id: string
 * }} payment
 */
const allocateSRBH = async (lan, payment) => {
  let remaining = parseFloat(payment.transfer_amount);
  const paymentDate = payment.payment_date;
  const paymentId = payment.payment_id;

  if (!lan) {
    throw new Error("❌ LAN is required");
  }

  if (!paymentId) {
    throw new Error("❌ payment_id is required");
  }

  if (!paymentDate) {
    throw new Error("❌ payment_date is required");
  }

  if (Number.isNaN(remaining) || remaining <= 0) {
    throw new Error("❌ transfer_amount must be greater than 0");
  }

  // Change these only if your actual SRBH table names are different
  const emiTable = "manual_rps_srbh";
  const loanTable = "loan_booking_srbh";

  console.log(
    `🔄 Starting SRBH allocation | LAN: ${lan} | Amount: ${remaining} | Payment ID: ${paymentId}`
  );

  // ============================================================
  // 1. Allocate EMI
  //    Priority: Interest -> Principal
  // ============================================================
  while (remaining > 0) {
    const [emi] = await queryDB(
      `
      SELECT *
      FROM ${emiTable}
      WHERE lan = ?
        AND (
          COALESCE(remaining_interest, 0) > 0
          OR COALESCE(remaining_principal, 0) > 0
        )
      ORDER BY due_date ASC
      LIMIT 1
      `,
      [lan]
    );

    // Nothing pending in RPS
    if (!emi) {
      break;
    }

    let interestDue = parseFloat(emi.remaining_interest || 0);
    let principalDue = parseFloat(emi.remaining_principal || 0);

    // ============================================================
    // Interest Allocation
    // ============================================================
    if (remaining > 0 && interestDue > 0) {
      const interestAlloc = Math.min(interestDue, remaining);

      remaining -= interestAlloc;
      interestDue -= interestAlloc;

      await queryDB(
        `
        INSERT INTO allocation (
          lan,
          due_date,
          allocation_date,
          allocated_amount,
          charge_type,
          payment_id
        )
        VALUES (?, ?, ?, ?, 'Interest', ?)
        `,
        [
          lan,
          emi.due_date,
          paymentDate,
          interestAlloc,
          paymentId,
        ]
      );

      console.log(
        `✅ SRBH Interest allocated | LAN: ${lan} | Due: ${emi.due_date} | Amount: ${interestAlloc}`
      );
    }

    // ============================================================
    // Principal Allocation
    // Principal can be allocated only after interest becomes zero
    // ============================================================
    if (
      remaining > 0 &&
      interestDue <= 0 &&
      principalDue > 0
    ) {
      const principalAlloc = Math.min(principalDue, remaining);

      remaining -= principalAlloc;
      principalDue -= principalAlloc;

      await queryDB(
        `
        INSERT INTO allocation (
          lan,
          due_date,
          allocation_date,
          allocated_amount,
          charge_type,
          payment_id
        )
        VALUES (?, ?, ?, ?, 'Principal', ?)
        `,
        [
          lan,
          emi.due_date,
          paymentDate,
          principalAlloc,
          paymentId,
        ]
      );

      console.log(
        `✅ SRBH Principal allocated | LAN: ${lan} | Due: ${emi.due_date} | Amount: ${principalAlloc}`
      );
    }

    // Avoid floating point negatives like -0.0000001
    interestDue = Math.max(0, Number(interestDue.toFixed(2)));
    principalDue = Math.max(0, Number(principalDue.toFixed(2)));

    const remainingEmi = Number(
      (interestDue + principalDue).toFixed(2)
    );

    // ============================================================
    // Update RPS
    // ============================================================
    await queryDB(
      `
      UPDATE ${emiTable}
      SET
        remaining_interest = ?,
        remaining_principal = ?,
        remaining_emi = ?,
        remaining_amount = ?,
        payment_date = ?
      WHERE id = ?
      `,
      [
        interestDue,
        principalDue,
        remainingEmi,
        remainingEmi,
        paymentDate,
        emi.id,
      ]
    );

    /*
     * If this EMI still has pending amount,
     * don't move to the next EMI.
     */
    if (interestDue > 0 || principalDue > 0) {
      break;
    }
  }

  // ============================================================
  // 2. Remaining amount becomes Excess Payment
  // ============================================================
  remaining = Number(remaining.toFixed(2));

  if (remaining > 0) {
    await queryDB(
      `
      INSERT INTO allocation (
        lan,
        due_date,
        allocation_date,
        allocated_amount,
        charge_type,
        payment_id
      )
      VALUES (?, ?, ?, ?, 'Excess Payment', ?)
      `,
      [
        lan,
        paymentDate,
        paymentDate,
        remaining,
        paymentId,
      ]
    );

    console.log(
      `✅ SRBH Excess payment parked | LAN: ${lan} | Amount: ${remaining}`
    );

    remaining = 0;
  }

  // ============================================================
  // 3. Update loan status / DPD
  // ============================================================
  await queryDB(`CALL sp_update_loan_status_dpd()`);

  // ============================================================
  // 4. Check whether all SRBH EMIs are cleared
  // ============================================================
  const [pending] = await queryDB(
    `
    SELECT COUNT(*) AS count
    FROM ${emiTable}
    WHERE lan = ?
      AND (
        COALESCE(remaining_interest, 0) > 0
        OR COALESCE(remaining_principal, 0) > 0
      )
    `,
    [lan]
  );

  // ============================================================
  // 5. Mark loan Fully Paid
  // ============================================================
  if (Number(pending.count) === 0) {
    await queryDB(
      `
      UPDATE ${loanTable}
      SET status = 'Fully Paid'
      WHERE lan = ?
      `,
      [lan]
    );

    console.log(
      `✅ SRBH loan status updated to Fully Paid | LAN: ${lan}`
    );
  }

  console.log(`✅ SRBH allocation completed | LAN: ${lan}`);

  return {
    success: true,
    lan,
    payment_id: paymentId,
    message: "SRBH repayment allocated successfully",
  };
};

module.exports = allocateSRBH;