
const { queryDB } = require("../helpers");

/**
 * Allocate a single repayment for a Ya Money LAN
 *
 * Priority: Interest -> Principal -> Excess Payment
 *
 * @param {string} lan
 * @param {{
 *   transfer_amount: string|number,
 *   payment_date: string,
 *   payment_id: string
 * }} payment
 */
const allocateYaMoney = async (lan, payment) => {
  let remaining = Math.round(
    Number(payment?.transfer_amount) * 100
  );

  const paymentDate = payment?.payment_date;
  const paymentId = payment?.payment_id;

  if (!lan) {
    throw new Error("LAN is required");
  }

  if (!paymentId) {
    throw new Error("payment_id is required");
  }

  if (!paymentDate) {
    throw new Error("payment_date is required");
  }

  if (!Number.isSafeInteger(remaining) || remaining <= 0) {
    throw new Error("transfer_amount must be greater than 0");
  }

  const emiTable = "manual_rps_ya_money";
  const loanTable = "loan_booking_ya_money";

  const toPaise = (value) =>
    Math.round(Number(value || 0) * 100);

  const toRupees = (value) =>
    Number((value / 100).toFixed(2));

  console.log(
    `Starting Ya Money allocation | LAN: ${lan} | Amount: ${toRupees(remaining)} | Payment ID: ${paymentId}`
  );

  // ============================================================
  // 1. Allocate EMI
  // Priority: Interest -> Principal
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
      ORDER BY due_date ASC, id ASC
      LIMIT 1
      `,
      [lan]
    );

    if (!emi) {
      break;
    }

    let interestDue = toPaise(emi.remaining_interest);
    let principalDue = toPaise(emi.remaining_principal);

    // ============================================================
    // Interest Allocation
    // ============================================================

    if (remaining > 0 && interestDue > 0) {
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
          toRupees(interestAlloc),
          paymentId,
        ]
      );

      console.log(
        `Ya Money Interest allocated | LAN: ${lan} | Amount: ${toRupees(interestAlloc)}`
      );
    }

    // ============================================================
    // Principal Allocation
    // Only after interest becomes zero
    // ============================================================

    if (
      remaining > 0 &&
      interestDue === 0 &&
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
          toRupees(principalAlloc),
          paymentId,
        ]
      );

      console.log(
        `Ya Money Principal allocated | LAN: ${lan} | Amount: ${toRupees(principalAlloc)}`
      );
    }

    const remainingEmi = interestDue + principalDue;

    // ============================================================
    // Update Ya Money RPS
    // ============================================================

    await queryDB(
      `
      UPDATE ${emiTable}
      SET
        remaining_interest = ?,
        remaining_principal = ?,
        remaining_amount = ?,
        payment_date = ?
      WHERE id = ?
        AND lan = ?
      `,
      [
        toRupees(interestDue),
        toRupees(principalDue),
        toRupees(remainingEmi),
        paymentDate,
        emi.id,
        lan,
      ]
    );

    // If current EMI is partially paid, stop allocation.
    if (interestDue > 0 || principalDue > 0) {
      break;
    }
  }

  // ============================================================
  // 2. Remaining Amount -> Excess Payment
  // ============================================================

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
        toRupees(remaining),
        paymentId,
      ]
    );

    console.log(
      `Ya Money Excess Payment | LAN: ${lan} | Amount: ${toRupees(remaining)}`
    );

    remaining = 0;
  }

  // ============================================================
  // 3. Update Loan Status / DPD
  // ============================================================

  await queryDB(`CALL sp_update_loan_status_dpd()`);

  // ============================================================
  // 4. Check Pending EMIs
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
  // 5. Mark Loan Fully Paid
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
      `Ya Money loan Fully Paid | LAN: ${lan}`
    );
  }

  console.log(
    `Ya Money allocation completed | LAN: ${lan}`
  );

  return {
    success: true,
    lan,
    payment_id: paymentId,
    message: "Ya Money repayment allocated successfully",
  };
};

module.exports = allocateYaMoney;
