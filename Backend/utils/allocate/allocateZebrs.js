const { queryDB } = require("../helpers");

/**
 * Allocate a single repayment for a ZEBRS LAN
 *
 * Allocation Priority:
 * 1. Interest
 * 2. Principal
 * 3. Excess Payment
 *
 * @param {string} lan
 * @param {{
 *   transfer_amount: string|number,
 *   payment_date: string,
 *   payment_id: string
 * }} payment
 */
const allocateZebrs = async (lan, payment) => {
  let remaining = parseFloat(payment.transfer_amount);

  const paymentDate = payment.payment_date;
  const paymentId = payment.payment_id;

  // ============================================================
  // VALIDATION
  // ============================================================

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
    throw new Error(
      "❌ transfer_amount must be greater than 0"
    );
  }

  // ============================================================
  // ZEBRS TABLES
  // ============================================================

  const emiTable = "manual_rps_zebrs";
  const loanTable = "loan_booking_zebrs";

  console.log(
    `🔄 Starting ZEBRS allocation | LAN: ${lan} | Amount: ${remaining} | Payment ID: ${paymentId}`
  );

  // ============================================================
  // 1. ALLOCATE EMI
  //
  // Priority:
  // Interest -> Principal
  // ============================================================

  while (remaining > 0) {

    // Get oldest pending EMI
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

    // No pending EMI
    if (!emi) {
      break;
    }

    let interestDue =
      parseFloat(emi.remaining_interest || 0);

    let principalDue =
      parseFloat(emi.remaining_principal || 0);

    // ============================================================
    // 1A. INTEREST ALLOCATION
    // ============================================================

    if (
      remaining > 0 &&
      interestDue > 0
    ) {

      const interestAlloc = Math.min(
        interestDue,
        remaining
      );

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
        `✅ ZEBRS Interest allocated | LAN: ${lan} | Due: ${emi.due_date} | Amount: ${interestAlloc}`
      );
    }

    // ============================================================
    // 1B. PRINCIPAL ALLOCATION
    //
    // Principal allocation starts only after
    // interest for this EMI becomes zero.
    // ============================================================

    if (
      remaining > 0 &&
      interestDue <= 0 &&
      principalDue > 0
    ) {

      const principalAlloc = Math.min(
        principalDue,
        remaining
      );

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
        `✅ ZEBRS Principal allocated | LAN: ${lan} | Due: ${emi.due_date} | Amount: ${principalAlloc}`
      );
    }

    // ============================================================
    // Handle floating point precision
    // ============================================================

    interestDue = Math.max(
      0,
      Number(interestDue.toFixed(2))
    );

    principalDue = Math.max(
      0,
      Number(principalDue.toFixed(2))
    );

    remaining = Math.max(
      0,
      Number(remaining.toFixed(2))
    );

    const remainingEmi = Number(
      (
        interestDue +
        principalDue
      ).toFixed(2)
    );

    // ============================================================
    // Determine RPS status
    // ============================================================

    let emiStatus = "Pending";

    if (
      interestDue === 0 &&
      principalDue === 0
    ) {
      emiStatus = "Paid";
    } else if (
      Number(emi.remaining_interest || 0) !== interestDue ||
      Number(emi.remaining_principal || 0) !== principalDue
    ) {
      emiStatus = "Partially Paid";
    }

    // ============================================================
    // UPDATE ZEBRS RPS
    // ============================================================

    await queryDB(
      `
      UPDATE ${emiTable}
      SET
        remaining_interest = ?,
        remaining_principal = ?,
        remaining_emi = ?,
        remaining_amount = ?,
        payment_date = ?,
        status = ?
      WHERE id = ?
      `,
      [
        interestDue,
        principalDue,
        remainingEmi,
        remainingEmi,
        paymentDate,
        emiStatus,
        emi.id,
      ]
    );

    console.log(
      `📝 ZEBRS RPS updated | LAN: ${lan} | Due: ${emi.due_date} | Remaining EMI: ${remainingEmi} | Status: ${emiStatus}`
    );

    // ============================================================
    // If current EMI is only partially paid,
    // stop processing next EMI.
    // ============================================================

    if (
      interestDue > 0 ||
      principalDue > 0
    ) {
      break;
    }
  }

  // ============================================================
  // 2. EXCESS PAYMENT
  //
  // If all EMI principal + interest has been cleared
  // and money still remains, park it as Excess Payment.
  // ============================================================

  remaining = Number(
    remaining.toFixed(2)
  );

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
      `✅ ZEBRS Excess payment parked | LAN: ${lan} | Amount: ${remaining}`
    );

    remaining = 0;
  }

  // ============================================================
  // 3. UPDATE LOAN STATUS / DPD
  // ============================================================

  try {

    await queryDB(
      `CALL sp_update_loan_status_dpd()`
    );

  } catch (dpdError) {

    console.error(
      `⚠️ ZEBRS DPD update failed | LAN: ${lan}`,
      dpdError
    );
  }

  // ============================================================
  // 4. CHECK PENDING EMIs
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

  const pendingCount =
    Number(pending?.count || 0);

  console.log(
    `📊 ZEBRS pending EMI count | LAN: ${lan} | Pending: ${pendingCount}`
  );

  // ============================================================
  // 5. MARK LOAN FULLY PAID
  // ============================================================

  if (pendingCount === 0) {

    await queryDB(
      `
      UPDATE ${loanTable}
      SET status = 'Fully Paid'
      WHERE lan = ?
      `,
      [lan]
    );

    console.log(
      `✅ ZEBRS loan marked Fully Paid | LAN: ${lan}`
    );
  }

  // ============================================================
  // RESPONSE
  // ============================================================

  console.log(
    `✅ ZEBRS allocation completed | LAN: ${lan} | Payment ID: ${paymentId}`
  );

  return {
    success: true,
    lan,
    payment_id: paymentId,
    pending_emi_count: pendingCount,
    loan_status:
      pendingCount === 0
        ? "Fully Paid"
        : "Active",
    message:
      "ZEBRS repayment allocated successfully",
  };
};

module.exports = allocateZebrs;