const { queryDB } = require("../helpers");

/**
 * Allocate a single repayment for SabGrow
 *
 * Allocation priority:
 *
 * 1. Interest
 * 2. Principal
 * 3. Next pending EMI
 * 4. Excess Payment
 *
 * Tables:
 *   loan_booking_sabgrow
 *   manual_rps_sabgrow
 *   allocation
 */
const allocateSabGrow = async (lan, payment) => {
  let remaining = Number(payment.transfer_amount);

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

  if (
    !Number.isFinite(remaining) ||
    remaining <= 0
  ) {
    throw new Error(
      "❌ transfer_amount must be greater than 0"
    );
  }

  const cleanLan = String(lan)
    .trim()
    .toUpperCase();

  const emiTable = "manual_rps_sabgrow";
  const loanTable = "loan_booking_sabgrow";

  console.log(
    `[SabGrow] Starting allocation | LAN: ${cleanLan} | Amount: ${remaining} | Payment ID: ${paymentId}`
  );

  /*
   * ============================================================
   * 1. VERIFY SABGROW LOAN
   * ============================================================
   */

  const loanRows = await queryDB(
    `
    SELECT
      lan,
      customer_name,
      status
    FROM ${loanTable}
    WHERE lan = ?
    LIMIT 1
    `,
    [cleanLan]
  );

  if (!loanRows || loanRows.length === 0) {
    throw new Error(
      `SabGrow LAN not found: ${cleanLan}`
    );
  }

  /*
   * ============================================================
   * 2. CHECK DUPLICATE PAYMENT
   * ============================================================
   */

  const [existingAllocation] = await queryDB(
    `
    SELECT id
    FROM allocation
    WHERE lan = ?
      AND payment_id = ?
    LIMIT 1
    `,
    [
      cleanLan,
      paymentId
    ]
  );

  if (
    existingAllocation &&
    existingAllocation.length > 0
  ) {
    throw new Error(
      `Payment ${paymentId} is already allocated for LAN ${cleanLan}`
    );
  }

  /*
   * ============================================================
   * 3. ALLOCATE INTEREST → PRINCIPAL
   * ============================================================
   */

  while (remaining > 0) {

   const emiRows = await queryDB(
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
  [cleanLan]
);

if (!emiRows || emiRows.length === 0) {
  break;
}

const emi = emiRows[0];

if (!emi) {
  break;
}

    let interestDue = Number(
      emi.remaining_interest || 0
    );

    let principalDue = Number(
      emi.remaining_principal || 0
    );

    /*
     * Prevent floating-point issues
     */
    interestDue = Number(
      interestDue.toFixed(2)
    );

    principalDue = Number(
      principalDue.toFixed(2)
    );

    /*
     * ==========================================================
     * 3A. INTEREST ALLOCATION
     * ==========================================================
     */

    if (
      remaining > 0 &&
      interestDue > 0
    ) {

      const interestAllocated =
        Math.min(
          interestDue,
          remaining
        );

      remaining = Number(
        (
          remaining -
          interestAllocated
        ).toFixed(2)
      );

      interestDue = Number(
        (
          interestDue -
          interestAllocated
        ).toFixed(2)
      );

      await queryDB(
        `
        INSERT INTO allocation
        (
          lan,
          due_date,
          allocation_date,
          allocated_amount,
          charge_type,
          payment_id
        )
        VALUES
        (?, ?, ?, ?, 'Interest', ?)
        `,
        [
          cleanLan,
          emi.due_date,
          paymentDate,
          interestAllocated,
          paymentId
        ]
      );

      console.log(
        `[SabGrow] Interest allocated | LAN: ${cleanLan} | Due: ${emi.due_date} | Amount: ${interestAllocated}`
      );
    }

    /*
     * ==========================================================
     * 3B. PRINCIPAL ALLOCATION
     * ==========================================================
     *
     * Principal can only be allocated after
     * interest for that EMI is fully cleared.
     */

    if (
      remaining > 0 &&
      interestDue <= 0 &&
      principalDue > 0
    ) {

      const principalAllocated =
        Math.min(
          principalDue,
          remaining
        );

      remaining = Number(
        (
          remaining -
          principalAllocated
        ).toFixed(2)
      );

      principalDue = Number(
        (
          principalDue -
          principalAllocated
        ).toFixed(2)
      );

      await queryDB(
        `
        INSERT INTO allocation
        (
          lan,
          due_date,
          allocation_date,
          allocated_amount,
          charge_type,
          payment_id
        )
        VALUES
        (?, ?, ?, ?, 'Principal', ?)
        `,
        [
          cleanLan,
          emi.due_date,
          paymentDate,
          principalAllocated,
          paymentId
        ]
      );

      console.log(
        `[SabGrow] Principal allocated | LAN: ${cleanLan} | Due: ${emi.due_date} | Amount: ${principalAllocated}`
      );
    }

    /*
     * ==========================================================
     * 3C. CALCULATE REMAINING EMI
     * ==========================================================
     */

    const remainingEmi = Number(
      (
        interestDue +
        principalDue
      ).toFixed(2)
    );

    /*
     * ==========================================================
     * 3D. UPDATE RPS
     * ==========================================================
     */

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
        remainingEmi <= 0
          ? "Paid"
          : "Pending",
        emi.id
      ]
    );

    /*
     * ==========================================================
     * 3E. IF EMI NOT FULLY PAID
     * ==========================================================
     *
     * Do not move to the next EMI.
     */

    if (
      interestDue > 0 ||
      principalDue > 0
    ) {
      break;
    }

    /*
     * Current EMI is completely paid.
     * Loop will automatically pick next EMI.
     */

    console.log(
      `[SabGrow] EMI fully cleared | LAN: ${cleanLan} | Due: ${emi.due_date}`
    );
  }

  /*
   * ============================================================
   * 4. ROUND REMAINING AMOUNT
   * ============================================================
   */

  remaining = Number(
    remaining.toFixed(2)
  );

  /*
   * ============================================================
   * 5. EXCESS PAYMENT
   * ============================================================
   *
   * If all RPS installments are cleared and money is
   * still remaining, park it as Excess Payment.
   */

  if (remaining > 0) {

    /*
     * Find the latest RPS row for this LAN.
     */
    const [latestRpsRows] =
      await queryDB(
        `
        SELECT id
        FROM ${emiTable}
        WHERE lan = ?
        ORDER BY due_date DESC, id DESC
        LIMIT 1
        `,
        [cleanLan]
      );

    /*
     * Update extra_paid on latest RPS.
     */
    if (
      latestRpsRows &&
      latestRpsRows.length > 0
    ) {

      await queryDB(
        `
        UPDATE ${emiTable}
        SET extra_paid =
          COALESCE(extra_paid, 0) + ?
        WHERE id = ?
        `,
        [
          remaining,
          latestRpsRows[0].id
        ]
      );
    }

    /*
     * Insert allocation entry.
     */
    await queryDB(
      `
      INSERT INTO allocation
      (
        lan,
        due_date,
        allocation_date,
        allocated_amount,
        charge_type,
        payment_id
      )
      VALUES
      (?, ?, ?, ?, 'Excess Payment', ?)
      `,
      [
        cleanLan,
        paymentDate,
        paymentDate,
        remaining,
        paymentId
      ]
    );

    console.log(
      `[SabGrow] Excess payment parked | LAN: ${cleanLan} | Amount: ${remaining}`
    );

    remaining = 0;
  }

  /*
   * ============================================================
   * 6. UPDATE LOAN STATUS / DPD
   * ============================================================
   */

  try {

    await queryDB(
      `CALL sp_update_loan_status_dpd()`
    );

  } catch (error) {

    console.error(
      `[SabGrow] DPD procedure failed | LAN: ${cleanLan}`,
      error.message
    );

    /*
     * Don't fail collection allocation only because
     * DPD procedure failed.
     */
  }

  /*
   * ============================================================
   * 7. CHECK PENDING RPS
   * ============================================================
   */

  const pendingRows =
    await queryDB(
      `
      SELECT COUNT(*) AS count
      FROM ${emiTable}
      WHERE lan = ?
        AND (
          COALESCE(remaining_interest, 0) > 0
          OR COALESCE(remaining_principal, 0) > 0
        )
      `,
      [cleanLan]
    );

  const pendingCount =
    Number(
      pendingRows?.[0]?.count || 0
    );

  /*
   * ============================================================
   * 8. FULLY PAID
   * ============================================================
   */

  if (pendingCount === 0) {

    await queryDB(
      `
      UPDATE ${loanTable}
      SET status = 'Fully Paid'
      WHERE lan = ?
      `,
      [cleanLan]
    );

    console.log(
      `[SabGrow] Loan marked Fully Paid | LAN: ${cleanLan}`
    );
  }

  /*
   * ============================================================
   * 9. RESULT
   * ============================================================
   */

  console.log(
    `[SabGrow] Allocation completed | LAN: ${cleanLan}`
  );

  return {
    success: true,
    lan: cleanLan,
    payment_id: paymentId,
    allocated_amount:
      Number(payment.transfer_amount),
    remaining_amount: remaining,
    pending_rps: pendingCount,
    status:
      pendingCount === 0
        ? "Fully Paid"
        : "Active",
    message:
      "SabGrow repayment allocated successfully"
  };
};

module.exports = allocateSabGrow;