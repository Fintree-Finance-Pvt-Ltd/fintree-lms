////////////////////////////////////////////////////
// allocateSterlionUBL.js

const db = require("../../config/db");

const queryDB = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) {
        reject(err);
      } else {
        resolve(results);
      }
    });
  });

/**
 * Allocate repayments for Sterlion UBL loans.
 *
 * Allocation order:
 * 1. Oldest EMI first
 * 2. Interest first
 * 3. Principal second
 * 4. Remaining amount goes to Excess Payment
 */
const allocateSterlionUBL = async (lan, payment) => {
  if (!lan || !lan.startsWith("UBLF")) {
    throw new Error(`Invalid Sterlion UBL LAN: ${lan}`);
  }

  let remaining = Number(payment.transfer_amount);
  const paymentDate = payment.payment_date;
  const paymentId = payment.payment_id;

  if (!Number.isFinite(remaining) || remaining <= 0) {
    throw new Error("Valid transfer_amount is required");
  }

  if (!paymentDate) {
    throw new Error("payment_date is required");
  }

  if (!paymentId) {
    throw new Error("payment_id is required");
  }

  const emiTable = "manual_rps_sterlion_ubl";
  const loanTable = "loan_booking_sterlion_ubl";

  /*
   * Allocate against oldest unpaid installment.
   * For upfront-interest products, remaining_interest will normally be zero,
   * so payment will directly knock off principal.
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
      [lan],
    );

    const emi = emiRows[0];

    if (!emi) {
      break;
    }

    let interestDue = Math.max(
      0,
      Number(emi.remaining_interest || 0),
    );

    let principalDue = Math.max(
      0,
      Number(emi.remaining_principal || 0),
    );

    // Allocate interest first
    if (remaining > 0 && interestDue > 0) {
      const interestAllocated = Math.min(
        remaining,
        interestDue,
      );

      remaining -= interestAllocated;
      interestDue -= interestAllocated;

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
          VALUES (?, ?, ?, ?, 'Interest', ?)
        `,
        [
          lan,
          emi.due_date,
          paymentDate,
          interestAllocated,
          paymentId,
        ],
      );
    }

    // Allocate principal after interest becomes zero
    if (
      remaining > 0 &&
      interestDue <= 0 &&
      principalDue > 0
    ) {
      const principalAllocated = Math.min(
        remaining,
        principalDue,
      );

      remaining -= principalAllocated;
      principalDue -= principalAllocated;

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
          VALUES (?, ?, ?, ?, 'Principal', ?)
        `,
        [
          lan,
          emi.due_date,
          paymentDate,
          principalAllocated,
          paymentId,
        ],
      );
    }

    interestDue = Number(interestDue.toFixed(2));
    principalDue = Number(principalDue.toFixed(2));

    const newRemaining = Number(
      (interestDue + principalDue).toFixed(2),
    );const installmentStatus =
  newRemaining <= 0 ? "Paid" : "Partially Paid";

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
    installmentStatus,
    emi.id,
  ],
);

    // Partial payment: stop on current EMI
    if (interestDue > 0 || principalDue > 0) {
      break;
    }
  }

  /*
   * Park additional amount as excess payment
   * when all scheduled dues are cleared.
   */
  if (remaining > 0) {
    const excessAmount = Number(remaining.toFixed(2));

    // Insert excess payment allocation

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
        VALUES (?, ?, ?, ?, 'Excess Payment', ?)
      `,
      [
        lan,
        paymentDate,
        paymentDate,
        excessAmount,
        paymentId,
      ],
    );

    remaining = 0;
  }

  

  // Check whether all Sterlion UBL installments are cleared
  const pendingRows = await queryDB(
    `
      SELECT COUNT(*) AS count
      FROM ${emiTable}
      WHERE lan = ?
        AND (
          COALESCE(remaining_interest, 0) > 0
          OR COALESCE(remaining_principal, 0) > 0
        )
    `,
    [lan],
  );

  const pendingCount = Number(
    pendingRows[0]?.count || 0,
  );

  if (pendingCount === 0) {
    await queryDB(
      `
        UPDATE ${loanTable}
        SET status = 'Fully Paid'
        WHERE lan = ?
      `,
      [lan],
    );
  }

  return {
    success: true,
    lan,
    pending_installments: pendingCount,
    message: "Sterlion UBL repayment allocated successfully",
  };
};

module.exports = allocateSterlionUBL;