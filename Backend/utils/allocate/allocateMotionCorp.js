////////////////////////////////////////////////////
// allocateMotionCorp.js

const db = require("../../config/db");

const queryDB = (sql, params) =>
  new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) reject(err);
      else resolve(results);
    });
  });

/**
 * Allocate payments for Motion Corp loans.
 * Knock off interest first, then principal (oldest dues first).
 */
const allocateMotionCorp = async (lan, payment) => {

  let remaining = parseFloat(
    payment.transfer_amount
  );

  const paymentDate =
    payment.payment_date;

  const paymentId =
    payment.payment_id;

  if (!paymentId) {
    throw new Error(
      "❌ payment_id is required"
    );
  }

  // =====================================================
  // TABLES
  // =====================================================

  const emiTable =
    "manual_rps_motioncorp";

  const loanTable =
    "loan_booking_motion_corp";

  // =====================================================
  // STEP 1:
  // ALLOCATE EMI
  // Interest First → Principal Second
  // =====================================================

  while (remaining > 0) {

    const [emi] = await queryDB(
      `
      SELECT *
      FROM ${emiTable}
      WHERE lan = ?
      AND (
        remaining_interest > 0
        OR remaining_principal > 0
      )
      ORDER BY due_date ASC
      LIMIT 1
      `,
      [lan]
    );

    // No pending EMI
    if (!emi) break;

    let interestDue = Math.max(
      0,
      parseFloat(
        emi.remaining_interest || 0
      )
    );

    let principalDue = Math.max(
      0,
      parseFloat(
        emi.remaining_principal || 0
      )
    );

    // =================================================
    // INTEREST ALLOCATION
    // =================================================

    if (
      remaining > 0 &&
      interestDue > 0
    ) {

      const interestAlloc =
        Math.min(
          interestDue,
          remaining
        );

      remaining -= interestAlloc;

      interestDue -= interestAlloc;

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
        (
          ?, ?, ?, ?, 'Interest', ?
        )
        `,
        [
          lan,
          emi.due_date,
          paymentDate,
          interestAlloc,
          paymentId,
        ]
      );
    }

    // =================================================
    // PRINCIPAL ALLOCATION
    // =================================================

    if (
      remaining > 0 &&
      interestDue === 0 &&
      principalDue > 0
    ) {

      const principalAlloc =
        Math.min(
          principalDue,
          remaining
        );

      remaining -= principalAlloc;

      principalDue -= principalAlloc;

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
        (
          ?, ?, ?, ?, 'Principal', ?
        )
        `,
        [
          lan,
          emi.due_date,
          paymentDate,
          principalAlloc,
          paymentId,
        ]
      );
    }

    // =================================================
    // UPDATE EMI
    // =================================================

    const newRemaining =
      interestDue + principalDue;

    let emiStatus = "Pending";

    if (newRemaining <= 0) {
      emiStatus = "Paid";
    } else if (
      newRemaining <
      parseFloat(emi.emi)
    ) {
      emiStatus = "Partial";
    }

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
        newRemaining,
        newRemaining,
        paymentDate,
        emiStatus,
        emi.id,
      ]
    );

    // =================================================
    // STOP LOOP
    // =================================================

    if (
      interestDue > 0 ||
      principalDue > 0
    ) {
      break;
    }
  }

  // =====================================================
  // STEP 2:
  // EXCESS PAYMENT
  // =====================================================

  if (remaining > 0) {

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
      (
        ?, ?, ?, ?, 'Excess Payment', ?
      )
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
      `✅ Excess payment parked for Motion Corp LAN ${lan}`
    );

    remaining = 0;
  }

  // =====================================================
  // STEP 3:
  // UPDATE DPD
  // =====================================================

  await queryDB(
    `CALL sp_update_loan_status_dpd()`
  );

  // =====================================================
  // STEP 4:
  // CHECK FULLY PAID
  // =====================================================

  const [pending] = await queryDB(
    `
    SELECT COUNT(*) AS count
    FROM ${emiTable}
    WHERE lan = ?
    AND (
      remaining_interest > 0
      OR remaining_principal > 0
    )
    `,
    [lan]
  );

  if (pending.count === 0) {

    await queryDB(
      `
      UPDATE ${loanTable}
      SET status = 'Fully Paid'
      WHERE lan = ?
      `,
      [lan]
    );

    console.log(
      `✅ Loan status updated to Fully Paid for Motion Corp LAN ${lan}`
    );
  }

  // =====================================================
  // FINAL RESPONSE
  // =====================================================

  return {
    success: true,
    lan,
    payment_id: paymentId,
    allocated_amount:
      parseFloat(payment.transfer_amount),
    remaining_amount: remaining,
  };
};

module.exports = allocateMotionCorp;