// ////////////////////////////////////////////////////
// // allocateSterlionUBL.js

// const db = require("../../config/db");

// const queryDB = (sql, params = []) =>
//   new Promise((resolve, reject) => {
//     db.query(sql, params, (err, results) => {
//       if (err) {
//         reject(err);
//       } else {
//         resolve(results);
//       }
//     });
//   });

// /**
//  * Allocate repayments for Sterlion UBL loans.
//  *
//  * Allocation order:
//  * 1. Oldest EMI first
//  * 2. Interest first
//  * 3. Principal second
//  * 4. Remaining amount goes to Excess Payment
//  */
// const allocateSterlionUBL = async (lan, payment) => {
//   if (!lan || !lan.startsWith("UBLF")) {
//     throw new Error(`Invalid Sterlion UBL LAN: ${lan}`);
//   }

//   let remaining = Number(payment.transfer_amount);
//   const paymentDate = payment.payment_date;
//   const paymentId = payment.payment_id;

//   if (!Number.isFinite(remaining) || remaining <= 0) {
//     throw new Error("Valid transfer_amount is required");
//   }

//   if (!paymentDate) {
//     throw new Error("payment_date is required");
//   }

//   if (!paymentId) {
//     throw new Error("payment_id is required");
//   }

//   const emiTable = "manual_rps_sterlion_ubl";
//   const loanTable = "loan_booking_sterlion_ubl";

//   /*
//    * Allocate against oldest unpaid installment.
//    * For upfront-interest products, remaining_interest will normally be zero,
//    * so payment will directly knock off principal.
//    */
//   while (remaining > 0) {
//     const emiRows = await queryDB(
//       `
//         SELECT *
//         FROM ${emiTable}
//         WHERE lan = ?
//           AND (
//             COALESCE(remaining_interest, 0) > 0
//             OR COALESCE(remaining_principal, 0) > 0
//           )
//         ORDER BY due_date ASC, id ASC
//         LIMIT 1
//       `,
//       [lan],
//     );

//     const emi = emiRows[0];

//     if (!emi) {
//       break;
//     }

//     let interestDue = Math.max(
//       0,
//       Number(emi.remaining_interest || 0),
//     );

//     let principalDue = Math.max(
//       0,
//       Number(emi.remaining_principal || 0),
//     );

//     // Allocate interest first
//     if (remaining > 0 && interestDue > 0) {
//       const interestAllocated = Math.min(
//         remaining,
//         interestDue,
//       );

//       remaining -= interestAllocated;
//       interestDue -= interestAllocated;

//       await queryDB(
//         `
//           INSERT INTO allocation
//           (
//             lan,
//             due_date,
//             allocation_date,
//             allocated_amount,
//             charge_type,
//             payment_id
//           )
//           VALUES (?, ?, ?, ?, 'Interest', ?)
//         `,
//         [
//           lan,
//           emi.due_date,
//           paymentDate,
//           interestAllocated,
//           paymentId,
//         ],
//       );
//     }

//     // Allocate principal after interest becomes zero
//     if (
//       remaining > 0 &&
//       interestDue <= 0 &&
//       principalDue > 0
//     ) {
//       const principalAllocated = Math.min(
//         remaining,
//         principalDue,
//       );

//       remaining -= principalAllocated;
//       principalDue -= principalAllocated;

//       await queryDB(
//         `
//           INSERT INTO allocation
//           (
//             lan,
//             due_date,
//             allocation_date,
//             allocated_amount,
//             charge_type,
//             payment_id
//           )
//           VALUES (?, ?, ?, ?, 'Principal', ?)
//         `,
//         [
//           lan,
//           emi.due_date,
//           paymentDate,
//           principalAllocated,
//           paymentId,
//         ],
//       );
//     }

//     interestDue = Number(interestDue.toFixed(2));
//     principalDue = Number(principalDue.toFixed(2));

//     const newRemaining = Number(
//       (interestDue + principalDue).toFixed(2),
//     );const installmentStatus =
//   newRemaining <= 0 ? "Paid" : "Partially Paid";

// await queryDB(
//   `
//     UPDATE ${emiTable}
//     SET
//       remaining_interest = ?,
//       remaining_principal = ?,
//       remaining_emi = ?,
//       remaining_amount = ?,
//       payment_date = ?,
//       status = ?
//     WHERE id = ?
//   `,
//   [
//     interestDue,
//     principalDue,
//     newRemaining,
//     newRemaining,
//     paymentDate,
//     installmentStatus,
//     emi.id,
//   ],
// );

//     // Partial payment: stop on current EMI
//     if (interestDue > 0 || principalDue > 0) {
//       break;
//     }
//   }

//   /*
//    * Park additional amount as excess payment
//    * when all scheduled dues are cleared.
//    */
//   if (remaining > 0) {
//     const excessAmount = Number(remaining.toFixed(2));

//     // Insert excess payment allocation

//     await queryDB(
//       `
//         INSERT INTO allocation
//         (
//           lan,
//           due_date,
//           allocation_date,
//           allocated_amount,
//           charge_type,
//           payment_id
//         )
//         VALUES (?, ?, ?, ?, 'Excess Payment', ?)
//       `,
//       [
//         lan,
//         paymentDate,
//         paymentDate,
//         excessAmount,
//         paymentId,
//       ],
//     );

//     remaining = 0;
//   }

  

//   // Check whether all Sterlion UBL installments are cleared
//   const pendingRows = await queryDB(
//     `
//       SELECT COUNT(*) AS count
//       FROM ${emiTable}
//       WHERE lan = ?
//         AND (
//           COALESCE(remaining_interest, 0) > 0
//           OR COALESCE(remaining_principal, 0) > 0
//         )
//     `,
//     [lan],
//   );

//   const pendingCount = Number(
//     pendingRows[0]?.count || 0,
//   );

//   if (pendingCount === 0) {
//     await queryDB(
//       `
//         UPDATE ${loanTable}
//         SET status = 'Fully Paid'
//         WHERE lan = ?
//       `,
//       [lan],
//     );
//   }

//   return {
//     success: true,
//     lan,
//     pending_installments: pendingCount,
//     message: "Sterlion UBL repayment allocated successfully",
//   };
// };

// module.exports = allocateSterlionUBL;





////////////////////////////////////////////////////
// allocateSterlionUBL.js

const db = require("../../config/db");

const round = (value) =>
  Number(Number(value).toFixed(2));

const queryDB = (connection, sql, params = []) =>
  new Promise((resolve, reject) => {
    connection.query(sql, params, (err, results) => {
      if (err) return reject(err);
      resolve(results);
    });
  });

const beginTransaction = (connection) =>
  new Promise((resolve, reject) => {
    connection.beginTransaction((err) =>
      err ? reject(err) : resolve()
    );
  });

const commit = (connection) =>
  new Promise((resolve, reject) => {
    connection.commit((err) =>
      err ? reject(err) : resolve()
    );
  });

const rollback = (connection) =>
  new Promise((resolve) => {
    connection.rollback(() => resolve());
  });

const getConnection = () =>
  new Promise((resolve, reject) => {
    if (typeof db.getConnection === "function") {
      db.getConnection((err, connection) => {
        if (err) return reject(err);
        resolve(connection);
      });
    } else {
      resolve(db);
    }
  });

/**
 * Sterlion UBL Repayment Allocation
 *
 * I = Interest only
 * P = Principal only
 * C = Charges only
 *
 * No allocation_type:
 * Oldest EMI -> Interest -> Principal
 *
 * Remaining amount -> Excess Payment
 */

const allocateSterlionUBL = async (lan, payment) => {
  if (!lan || !lan.startsWith("UBLF")) {
    throw new Error(
      `Invalid Sterlion UBL LAN: ${lan}`
    );
  }

  const amount = Number(payment.transfer_amount);
  const paymentDate = payment.payment_date;
  const paymentId = payment.payment_id;

  const allocationType = String(
    payment.allocation_type || ""
  ).trim().toUpperCase();

  if (!["I", "P", "C"].includes(allocationType)) {
    throw new Error(
      "Invalid allocation_type. Allowed values: I, P, C"
    );
  }

  if (
    !Number.isFinite(amount) ||
    amount <= 0 ||
    round(amount) <= 0 ||
    Math.abs(amount - round(amount)) > 0.000001
  ) {
    throw new Error(
      "Valid transfer_amount with maximum 2 decimal places is required"
    );
  }

  if (!paymentDate) {
    throw new Error("payment_date is required");
  }

  if (!paymentId) {
    throw new Error("payment_id is required");
  }

  const emiTable = "manual_rps_sterlion_ubl";
  const loanTable = "loan_booking_sterlion_ubl";

  let remaining = round(amount);
  let connection;
  let transactionStarted = false;

  const totals = {
    interest: 0,
    principal: 0,
    charges: 0,
    excess: 0,
  };

  try {
    connection = await getConnection();

    await beginTransaction(connection);
    transactionStarted = true;

    // Lock loan to serialize allocations for this LAN
    const loanRows = await queryDB(
      connection,
      `
        SELECT lan
        FROM ${loanTable}
        WHERE lan = ?
        FOR UPDATE
      `,
      [lan]
    );

    if (!loanRows.length) {
      throw new Error(
        `Sterlion UBL loan not found: ${lan}`
      );
    }

    // Prevent same payment from being allocated twice
    const existingAllocation = await queryDB(
      connection,
      `
        SELECT id
        FROM allocation
        WHERE lan = ?
          AND payment_id = ?
        LIMIT 1
      `,
      [lan, paymentId]
    );

    if (existingAllocation.length) {
      throw new Error(
        `Payment ${paymentId} already allocated for ${lan}`
      );
    }

    const insertAllocation = async (
      dueDate,
      allocationAmount,
      chargeType
    ) => {
      const value = round(allocationAmount);

      if (value <= 0) return;

      await queryDB(
        connection,
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
          VALUES (?, ?, ?, ?, ?, ?)
        `,
        [
          lan,
          dueDate,
          paymentDate,
          value,
          chargeType,
          paymentId,
        ]
      );
    };

   
/*
 * ============================================
 * STEP 1: CHARGES ALLOCATION
 * Only when allocation_type = C
 * ============================================
 */

if (allocationType === "C") {
  const charges = await queryDB(
    connection,
    `
      SELECT *,
        GREATEST(
          0,
          amount
          - COALESCE(paid_amount, 0)
          - COALESCE(waived_amount, 0)
          - COALESCE(waived_off, 0)
        ) AS outstanding_charge
      FROM loan_charges
      WHERE lan = ?
        AND (
          amount
          - COALESCE(paid_amount, 0)
          - COALESCE(waived_amount, 0)
          - COALESCE(waived_off, 0)
        ) > 0
      ORDER BY due_date ASC, id ASC
      FOR UPDATE
    `,
    [lan]
  );

  for (const charge of charges) {
    if (remaining <= 0) break;

    const chargeDue = round(
      Number(charge.outstanding_charge || 0)
    );

    if (chargeDue <= 0) continue;

    const chargeAllocated = round(
      Math.min(remaining, chargeDue)
    );

    // Insert into allocation history
    await insertAllocation(
      charge.due_date,
      chargeAllocated,
      "Charges"
    );

    // Update loan_charges
    await queryDB(
      connection,
      `
        UPDATE loan_charges
        SET
          paid_amount =
            COALESCE(paid_amount, 0) + ?,

          paid_status = CASE
            WHEN (
              COALESCE(paid_amount, 0) + ?
              + COALESCE(waived_amount, 0)
              + COALESCE(waived_off, 0)
            ) >= amount
            THEN 'Paid'
            ELSE 'Partially Paid'
          END,

          payment_time = ?
        WHERE id = ?
      `,
      [
        chargeAllocated,
        chargeAllocated,
        `${String(paymentDate).slice(0, 10)} 00:00:00`,
        charge.id
      ]
    );

    remaining = round(
      remaining - chargeAllocated
    );

    totals.charges = round(
      totals.charges + chargeAllocated
    );
  }
}

    /*
     * ============================================
     * STEP 2: EMI ALLOCATION
     *
     * I = Interest only
     * P = Principal only
     * Blank = Interest then Principal
     *
     * C skips EMI allocation completely.
     * ============================================
     */

    if (allocationType !== "C") {
      while (remaining > 0) {
        let condition;

        if (allocationType === "I") {
          condition = `
            COALESCE(remaining_interest, 0) > 0
          `;
        } else if (allocationType === "P") {
          condition = `
            COALESCE(remaining_principal, 0) > 0
          `;
        } else {
          condition = `
            (
              COALESCE(remaining_interest, 0) > 0
              OR
              COALESCE(remaining_principal, 0) > 0
            )
          `;
        }

        const emiRows = await queryDB(
          connection,
          `
            SELECT *
            FROM ${emiTable}
            WHERE lan = ?
              AND ${condition}
            ORDER BY due_date ASC, id ASC
            LIMIT 1
            FOR UPDATE
          `,
          [lan]
        );

        const emi = emiRows[0];

        if (!emi) break;

        let interestDue = round(
          Math.max(
            0,
            Number(emi.remaining_interest || 0)
          )
        );

        let principalDue = round(
          Math.max(
            0,
            Number(emi.remaining_principal || 0)
          )
        );

        /*
         * STEP 2A: INTEREST
         *
         * I or Blank
         */

        if (
          remaining > 0 &&
          interestDue > 0 &&
          allocationType !== "P"
        ) {
          const interestAllocated = round(
            Math.min(remaining, interestDue)
          );

          remaining = round(
            remaining - interestAllocated
          );

          interestDue = round(
            interestDue - interestAllocated
          );

          await insertAllocation(
            emi.due_date,
            interestAllocated,
            "Interest"
          );

          totals.interest = round(
            totals.interest + interestAllocated
          );
        }

        /*
         * STEP 2B: PRINCIPAL
         *
         * P = Direct Principal
         * Blank = Only after Interest is zero
         */

        if (
          remaining > 0 &&
          principalDue > 0 &&
          allocationType !== "I" &&
          (
            allocationType === "P" ||
            interestDue <= 0
          )
        ) {
          const principalAllocated = round(
            Math.min(remaining, principalDue)
          );

          remaining = round(
            remaining - principalAllocated
          );

          principalDue = round(
            principalDue - principalAllocated
          );

          await insertAllocation(
            emi.due_date,
            principalAllocated,
            "Principal"
          );

          totals.principal = round(
            totals.principal + principalAllocated
          );
        }

        /*
         * STEP 2C: UPDATE EMI
         */

        const newRemaining = round(
          interestDue + principalDue
        );

        const installmentStatus =
          newRemaining <= 0
            ? "Paid"
            : "Partially Paid";

        await queryDB(
          connection,
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
          ]
        );

        // Typed allocation:
        // Continue to next eligible installment
        if (
          allocationType === "I" ||
          allocationType === "P"
        ) {
          continue;
        }

        // Automatic allocation:
        // Stop when current installment is partial
        if (
          interestDue > 0 ||
          principalDue > 0
        ) {
          break;
        }
      }
    }

    /*
     * ============================================
     * STEP 3: EXCESS PAYMENT
     *
     * Any amount not allocated goes to Excess.
     * No cross-allocation between I, P and C.
     * ============================================
     */

    if (remaining > 0) {
      const excessAmount = round(remaining);

      await insertAllocation(
        paymentDate,
        excessAmount,
        "Excess Payment"
      );

      totals.excess = excessAmount;

      remaining = 0;
    }

    /*
     * ============================================
     * STEP 4: CHECK PENDING INSTALLMENTS
     * ============================================
     */

    const pendingRows = await queryDB(
      connection,
      `
        SELECT COUNT(*) AS count
        FROM ${emiTable}
        WHERE lan = ?
          AND (
            COALESCE(remaining_interest, 0) > 0
            OR
            COALESCE(remaining_principal, 0) > 0
          )
      `,
      [lan]
    );

    const pendingCount = Number(
      pendingRows[0]?.count || 0
    );

    /*
     * Also check outstanding charges before
     * marking loan Fully Paid.
     */

   const chargesRows = await queryDB(
  connection,
  `
    SELECT COUNT(*) AS count
    FROM loan_charges
    WHERE lan = ?
      AND (
        amount
        - COALESCE(paid_amount, 0)
        - COALESCE(waived_amount, 0)
        - COALESCE(waived_off, 0)
      ) > 0
  `,
  [lan]
);

const pendingCharges = Number(
  chargesRows[0]?.count || 0
);

    /*
     * ============================================
     * STEP 5: FULLY PAID STATUS
     * ============================================
     */

    if (
      pendingCount === 0 &&
      pendingCharges === 0
    ) {
      await queryDB(
        connection,
        `
          UPDATE ${loanTable}
          SET status = 'Fully Paid'
          WHERE lan = ?
        `,
        [lan]
      );
    }

    // Commit all changes together
    await commit(connection);
    transactionStarted = false;

    console.log(
      "Sterlion UBL payment allocated:",
      {
        lan,
        paymentId,
        allocationType:
          allocationType || "AUTO",
        totals,
        pendingCount,
        pendingCharges,
      }
    );

    return {
      success: true,
      lan,
      payment_id: paymentId,
      allocation_type:
        allocationType || "AUTO",
      interest_allocated: totals.interest,
      principal_allocated: totals.principal,
      charges_allocated: totals.charges,
      excess_payment: totals.excess,
      pending_installments: pendingCount,
      pending_charges: pendingCharges,
      message:
        "Sterlion UBL repayment allocated successfully",
    };
  } catch (error) {
    if (connection && transactionStarted) {
      await rollback(connection);
    }

    console.error(
      "Sterlion UBL allocation failed:",
      error
    );

    throw error;
  } finally {
    if (
      connection &&
      connection !== db &&
      typeof connection.release === "function"
    ) {
      connection.release();
    }
  }
};

module.exports = allocateSterlionUBL;
