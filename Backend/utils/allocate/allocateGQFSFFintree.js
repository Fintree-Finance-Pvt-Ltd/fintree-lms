
// const { queryDB } = require("../helpers");

// //////////////////

// module.exports = async function allocateGQFSFFintree(lan, payment) {

//   let remaining = parseFloat(payment.transfer_amount);
//   const { payment_date, payment_id } = payment;

//   console.log("🚀 allocateGQFSFFintree called with:", { lan, payment });

//   if (!payment_id) throw new Error("❌ payment_id missing");

//   try {

//     // --------------------------
//     // 1️⃣ Allocate EMI sequentially
//     // --------------------------
//     while (remaining > 0) {

//       const [emi] = await queryDB(
//         `SELECT *
//          FROM manual_rps_gq_fsf_fintree
//          WHERE lan = ?
//          AND (remaining_interest != 0 OR remaining_principal != 0)
//          ORDER BY due_date ASC
//          LIMIT 1`,
//         [lan]
//       );

//       if (!emi) break;

//       let interest = parseFloat(emi.remaining_interest || 0);
//       let principal = parseFloat(emi.remaining_principal || 0);

//       console.log("📄 EMI fetched:", {
//         emiId: emi.id,
//         interest,
//         principal,
//         remaining
//       });

//       // --------------------------
//       // 2️⃣ Interest Allocation (fixed logic)
//       // --------------------------
//       if (interest !== 0 && remaining > 0) {

//         const alloc = Math.min(Math.abs(interest), remaining);

//         if (interest < 0) {

//           // Negative interest adjustment
//           interest += alloc;

//           await queryDB(
//             `INSERT INTO allocation_fintree_fsf
//              (lan, due_date, allocation_date, allocated_amount, charge_type, payment_id)
//              VALUES (?, ?, ?, ?, 'Interest', ?)`,
//             [lan, emi.due_date, payment_date, -alloc, payment_id]
//           );

//         } else {

//           // Normal interest clearing
//           interest -= alloc;

//           await queryDB(
//             `INSERT INTO allocation_fintree_fsf
//              (lan, due_date, allocation_date, allocated_amount, charge_type, payment_id)
//              VALUES (?, ?, ?, ?, 'Interest', ?)`,
//             [lan, emi.due_date, payment_date, alloc, payment_id]
//           );
//         }

//         remaining -= alloc;

//         console.log("✅ Interest allocated:", {
//           alloc,
//           remaining,
//           newInterest: interest
//         });
//       }


//       // --------------------------
//       // 3️⃣ Principal Allocation (fixed logic)
//       // --------------------------
//       if (principal !== 0 && remaining > 0) {

//         const alloc = Math.min(Math.abs(principal), remaining);

//         if (principal < 0) {

//           // Negative principal adjustment
//           principal += alloc;

//           await queryDB(
//             `INSERT INTO allocation_fintree_fsf
//              (lan, due_date, allocation_date, allocated_amount, charge_type, payment_id)
//              VALUES (?, ?, ?, ?, 'Principal', ?)`,
//             [lan, emi.due_date, payment_date, -alloc, payment_id]
//           );

//         } else {

//           // Normal principal clearing
//           principal -= alloc;

//           await queryDB(
//             `INSERT INTO allocation_fintree_fsf
//              (lan, due_date, allocation_date, allocated_amount, charge_type, payment_id)
//              VALUES (?, ?, ?, ?, 'Principal', ?)`,
//             [lan, emi.due_date, payment_date, alloc, payment_id]
//           );
//         }

//         remaining -= alloc;

//         console.log("✅ Principal allocated:", {
//           alloc,
//           remaining,
//           newPrincipal: principal
//         });
//       }


//       // --------------------------
//       // 4️⃣ Update EMI row
//       // --------------------------
//       await queryDB(
//         `UPDATE manual_rps_gq_fsf_fintree
//          SET remaining_interest = ?,
//              remaining_principal = ?,
//              remaining_emi = ?,
//              remaining_amount = ?,
//              payment_date = ?
//          WHERE id = ?`,
//         [
//           interest,
//           principal,
//           interest + principal,
//           interest + principal,
//           payment_date,
//           emi.id
//         ]
//       );

//       console.log("📝 EMI updated:", {
//         emiId: emi.id,
//         interest,
//         principal
//       });

//       if (remaining <= 0) break;
//     }


//     // --------------------------
//     // 5️⃣ Park Excess Payment
//     // --------------------------
//     if (remaining > 0) {

//       console.log("💰 Excess detected:", remaining);

//       await queryDB(
//         `INSERT INTO loan_charges_fintree_fsf
//          (lan, charge_type, amount, charge_date, due_date, paid_status, created_at)
//          VALUES (?, 'Excess Payment', ?, ?, ?, 'Not Paid', NOW())`,
//         [lan, remaining, payment_date, payment_date]
//       );

//       await queryDB(
//         `INSERT INTO allocation_fintree_fsf
//          (lan, due_date, allocation_date, allocated_amount, charge_type, payment_id)
//          VALUES (?, ?, ?, ?, 'Excess Payment', ?)`,
//         [lan, payment_date, payment_date, remaining, payment_id]
//       );

//       remaining = 0;
//     }

//      // --------------------------
//     // 6️⃣ Allocate Excess Payment
//     // --------------------------
//     await queryDB(
//       `CALL allocate_excess_payment_lan(?)`,
//       [lan]
//     );



//     // --------------------------
//     // 7️⃣ Auto Close Loan
//     // --------------------------
//     const [pending] = await queryDB(
//       `SELECT SUM(remaining_principal + remaining_interest) AS pending
//        FROM manual_rps_gq_fsf_fintree
//        WHERE lan = ?`,
//       [lan]
//     );

//     const hasPending = parseFloat(pending.pending || 0);

//     console.log("📊 Pending balance:", hasPending);

//     if (hasPending === 0) {

//       await queryDB(
//         `UPDATE loan_booking_gq_fsf
//          SET status = 'Fully Paid'
//          WHERE lan = ?`,
//         [lan]
//       );

//       console.log("🏁 Loan closed");
//     }

//     return { ok: true, remaining };

//   } catch (err) {

//     console.error("❌ allocateGQFSFFintree failed:", err);
//     throw err;
//   }
// };


/////////////// NEW CODE 


const { queryDB } = require("../helpers");

/**
 * GQ FSF Fintree repayment allocation
 *
 * Allocation order:
 * 1. Oldest pending RPS row
 * 2. Negative interest adjustment/credit
 * 3. Positive interest
 * 4. Principal
 * 5. Retention
 * 6. Continue to next RPS row
 * 7. Excess payment
 *
 * Important:
 * A negative interest adjustment does not consume collection cash.
 * It increases the amount available for principal/retention allocation.
 */
module.exports = async function allocateGQFSFFintree(
  lan,
  payment,
) {
  const round2 = (value, label = "value") => {
    const number = Number(value);

    if (!Number.isFinite(number)) {
      throw new Error(`Invalid ${label}: ${value}`);
    }

    return Math.round(
      (number + Number.EPSILON) * 100,
    ) / 100;
  };

  const TOLERANCE = 0.009;

  const paymentId = payment?.payment_id;
  const paymentDate = payment?.payment_date;

  const transferAmount = round2(
    payment?.transfer_amount,
    "payment.transfer_amount",
  );

  let remaining = transferAmount;

  if (!lan || !String(lan).trim()) {
    throw new Error("LAN is required");
  }

  if (!paymentId) {
    throw new Error(
      `payment_id is required for LAN=${lan}`,
    );
  }

  if (!paymentDate) {
    throw new Error(
      `payment_date is required for LAN=${lan}`,
    );
  }

  if (transferAmount <= 0) {
    throw new Error(
      `transfer_amount must be greater than zero ` +
        `for LAN=${lan}: ${transferAmount}`,
    );
  }

  const allocationSummary = {
    positiveInterest: 0,
    interestAdjustment: 0,
    netInterest: 0,
    principal: 0,
    retention: 0,
    excess: 0,
  };

  const allocationDetails = [];

  console.log(
    "🚀 allocateGQFSFFintree called:",
    {
      lan,
      paymentId,
      paymentDate,
      transferAmount,
    },
  );

  try {
    // =====================================================
    // 1. DUPLICATE PAYMENT CHECK
    // =====================================================

    const [existingAllocation] = await queryDB(
      `
        SELECT id
        FROM allocation_fintree_fsf
        WHERE lan = ?
          AND payment_id = ?
        LIMIT 1
      `,
      [lan, paymentId],
    );

    if (existingAllocation) {
      console.log(
        "⚠️ Payment already allocated:",
        {
          lan,
          paymentId,
        },
      );

      return {
        ok: true,
        duplicate: true,
        message: "Payment is already allocated",
        lan,
        paymentId,
        transferAmount,
      };
    }

    // =====================================================
    // 2. SEQUENTIAL RPS ALLOCATION
    // =====================================================

    while (remaining > TOLERANCE) {
      /*
       * Select the oldest RPS row having any pending:
       *
       * - interest
       * - principal
       * - retention
       */
      const [emi] = await queryDB(
        `
          SELECT *
          FROM manual_rps_gq_fsf_fintree
          WHERE lan = ?
            AND
            (
              ABS(
                COALESCE(
                  remaining_interest,
                  0
                )
              ) > ?
              OR ABS(
                COALESCE(
                  remaining_principal,
                  0
                )
              ) > ?
              OR ABS(
                COALESCE(
                  remaining_retention,
                  0
                )
              ) > ?
            )
          ORDER BY due_date ASC, id ASC
          LIMIT 1
        `,
        [
          lan,
          TOLERANCE,
          TOLERANCE,
          TOLERANCE,
        ],
      );

      if (!emi) {
        console.log(
          "ℹ️ No pending RPS demand found:",
          {
            lan,
            remaining,
          },
        );

        break;
      }

      let interest = round2(
        emi.remaining_interest || 0,
        "remaining_interest",
      );

      let principal = round2(
        emi.remaining_principal || 0,
        "remaining_principal",
      );

      let retention = round2(
        emi.remaining_retention || 0,
        "remaining_retention",
      );

      let rowWasAllocated = false;

      console.log(
        "📄 Oldest pending EMI fetched:",
        {
          rpsId: emi.id,
          dueDate: emi.due_date,
          interest,
          principal,
          retention,
          paymentRemaining: remaining,
        },
      );

      // ===================================================
      // 2A. NEGATIVE INTEREST ADJUSTMENT
      // ===================================================

      if (interest < -TOLERANCE) {
        const interestCredit = round2(
          Math.abs(interest),
        );

        /*
         * Insert negative allocation.
         *
         * Example:
         *
         * Interest adjustment = -191.04
         *
         * This is a credit, so it does not consume collection
         * cash. It increases allocation capacity by ₹191.04.
         */
        await queryDB(
          `
            INSERT INTO allocation_fintree_fsf
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
              ?,
              ?,
              ?,
              ?,
              'Interest',
              ?
            )
          `,
          [
            lan,
            emi.due_date,
            paymentDate,
            -interestCredit,
            paymentId,
          ],
        );

        allocationSummary.interestAdjustment =
          round2(
            allocationSummary.interestAdjustment -
              interestCredit,
          );

        allocationDetails.push({
          rpsId: emi.id,
          dueDate: emi.due_date,
          allocationDate: paymentDate,
          allocatedAmount: -interestCredit,
          chargeType: "Interest",
          adjustment: true,
          paymentId,
        });

        /*
         * Clear the negative interest demand.
         */
        interest = 0;

        /*
         * Increase allocation capacity.
         *
         * Example:
         *
         * Cash available       ₹58,331.35
         * Interest adjustment     ₹191.04
         * New capacity         ₹58,522.39
         */
        remaining = round2(
          remaining + interestCredit,
        );

        rowWasAllocated = true;

        console.log(
          "✅ Negative interest adjustment allocated:",
          {
            rpsId: emi.id,
            interestCredit,
            paymentRemaining: remaining,
          },
        );
      }

      // ===================================================
      // 2B. POSITIVE INTEREST
      // ===================================================

      if (
        interest > TOLERANCE &&
        remaining > TOLERANCE
      ) {
        const allocatedInterest = round2(
          Math.min(
            interest,
            remaining,
          ),
        );

        await queryDB(
          `
            INSERT INTO allocation_fintree_fsf
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
              ?,
              ?,
              ?,
              ?,
              'Interest',
              ?
            )
          `,
          [
            lan,
            emi.due_date,
            paymentDate,
            allocatedInterest,
            paymentId,
          ],
        );

        interest = round2(
          interest - allocatedInterest,
        );

        remaining = round2(
          remaining - allocatedInterest,
        );

        allocationSummary.positiveInterest =
          round2(
            allocationSummary.positiveInterest +
              allocatedInterest,
          );

        allocationDetails.push({
          rpsId: emi.id,
          dueDate: emi.due_date,
          allocationDate: paymentDate,
          allocatedAmount: allocatedInterest,
          chargeType: "Interest",
          adjustment: false,
          paymentId,
        });

        rowWasAllocated = true;

        console.log(
          "✅ Positive interest allocated:",
          {
            rpsId: emi.id,
            allocatedInterest,
            remainingInterest: interest,
            paymentRemaining: remaining,
          },
        );
      }

      // ===================================================
      // 2C. PRINCIPAL
      // ===================================================

      if (
        principal > TOLERANCE &&
        remaining > TOLERANCE
      ) {
        const allocatedPrincipal = round2(
          Math.min(
            principal,
            remaining,
          ),
        );

        await queryDB(
          `
            INSERT INTO allocation_fintree_fsf
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
              ?,
              ?,
              ?,
              ?,
              'Principal',
              ?
            )
          `,
          [
            lan,
            emi.due_date,
            paymentDate,
            allocatedPrincipal,
            paymentId,
          ],
        );

        principal = round2(
          principal - allocatedPrincipal,
        );

        remaining = round2(
          remaining - allocatedPrincipal,
        );

        allocationSummary.principal =
          round2(
            allocationSummary.principal +
              allocatedPrincipal,
          );

        allocationDetails.push({
          rpsId: emi.id,
          dueDate: emi.due_date,
          allocationDate: paymentDate,
          allocatedAmount: allocatedPrincipal,
          chargeType: "Principal",
          paymentId,
        });

        rowWasAllocated = true;

        console.log(
          "✅ Principal allocated:",
          {
            rpsId: emi.id,
            allocatedPrincipal,
            remainingPrincipal: principal,
            paymentRemaining: remaining,
          },
        );
      }

      // ===================================================
      // 2D. RETENTION
      // ===================================================

      if (
        retention > TOLERANCE &&
        remaining > TOLERANCE
      ) {
        const allocatedRetention = round2(
          Math.min(
            retention,
            remaining,
          ),
        );

        await queryDB(
          `
            INSERT INTO allocation_fintree_fsf
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
              ?,
              ?,
              ?,
              ?,
              'Retention',
              ?
            )
          `,
          [
            lan,
            emi.due_date,
            paymentDate,
            allocatedRetention,
            paymentId,
          ],
        );

        retention = round2(
          retention - allocatedRetention,
        );

        remaining = round2(
          remaining - allocatedRetention,
        );

        allocationSummary.retention =
          round2(
            allocationSummary.retention +
              allocatedRetention,
          );

        allocationDetails.push({
          rpsId: emi.id,
          dueDate: emi.due_date,
          allocationDate: paymentDate,
          allocatedAmount: allocatedRetention,
          chargeType: "Retention",
          paymentId,
        });

        rowWasAllocated = true;

        console.log(
          "✅ Retention allocated:",
          {
            rpsId: emi.id,
            allocatedRetention,
            remainingRetention: retention,
            paymentRemaining: remaining,
          },
        );
      }

      // ===================================================
      // 2E. CLEAN SMALL DECIMAL BALANCES
      // ===================================================

      if (
        Math.abs(interest) <=
        TOLERANCE
      ) {
        interest = 0;
      }

      if (
        Math.abs(principal) <=
        TOLERANCE
      ) {
        principal = 0;
      }

      if (
        Math.abs(retention) <=
        TOLERANCE
      ) {
        retention = 0;
      }

      /*
       * Signed row demand:
       *
       * remaining EMI
       * = remaining interest
       * + remaining principal
       * + remaining retention
       */
      let rowRemainingAmount = round2(
        interest +
          principal +
          retention,
      );

      if (
        Math.abs(rowRemainingAmount) <=
        TOLERANCE
      ) {
        rowRemainingAmount = 0;
      }

      let rowStatus = "Pending";

      if (rowRemainingAmount === 0) {
        rowStatus = "Paid";
      } else if (rowWasAllocated) {
        rowStatus = "Partially Paid";
      }

      // ===================================================
      // 2F. UPDATE RPS ROW
      // ===================================================

      await queryDB(
        `
          UPDATE manual_rps_gq_fsf_fintree
          SET
            remaining_interest = ?,
            remaining_principal = ?,
            remaining_retention = ?,
            remaining_emi = ?,
            remaining_amount = ?,
            status = ?,
            payment_date = ?
          WHERE id = ?
        `,
        [
          interest,
          principal,
          retention,
          rowRemainingAmount,
          rowRemainingAmount,
          rowStatus,
          paymentDate,
          emi.id,
        ],
      );

      console.log(
        "📝 RPS row updated:",
        {
          rpsId: emi.id,
          dueDate: emi.due_date,
          interest,
          principal,
          retention,
          rowRemainingAmount,
          rowStatus,
        },
      );

      /*
       * Protect against infinite loop if a row was selected
       * but no allocation or adjustment occurred.
       */
      if (!rowWasAllocated) {
        throw new Error(
          `No allocation made against RPS id=${emi.id}, ` +
            `LAN=${lan}`,
        );
      }

      /*
       * If payment is fully consumed, exit.
       * Otherwise continue and fetch the next oldest RPS row.
       */
      if (remaining <= TOLERANCE) {
        remaining = 0;
        break;
      }
    }

    // =====================================================
    // 3. EXCESS PAYMENT
    // =====================================================

    if (remaining > TOLERANCE) {
      const excessAmount = round2(
        remaining,
      );

      console.log(
        "💰 Excess payment detected:",
        {
          lan,
          paymentId,
          excessAmount,
        },
      );

      await queryDB(
        `
          INSERT INTO loan_charges_fintree_fsf
          (
            lan,
            charge_type,
            amount,
            charge_date,
            due_date,
            paid_status,
            created_at
          )
          VALUES
          (
            ?,
            'Excess Payment',
            ?,
            ?,
            ?,
            'Not Paid',
            NOW()
          )
        `,
        [
          lan,
          excessAmount,
          paymentDate,
          paymentDate,
        ],
      );

      await queryDB(
        `
          INSERT INTO allocation_fintree_fsf
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
            ?,
            ?,
            ?,
            ?,
            'Excess Payment',
            ?
          )
        `,
        [
          lan,
          paymentDate,
          paymentDate,
          excessAmount,
          paymentId,
        ],
      );

      allocationSummary.excess =
        round2(
          allocationSummary.excess +
            excessAmount,
        );

      allocationDetails.push({
        dueDate: paymentDate,
        allocationDate: paymentDate,
        allocatedAmount: excessAmount,
        chargeType: "Excess Payment",
        paymentId,
      });

      remaining = 0;

      /*
       * Execute excess reallocation only when an excess
       * payment was actually created.
       */
      await queryDB(
        `
          CALL allocate_excess_payment_lan(?)
        `,
        [lan],
      );
    }

    // =====================================================
    // 4. PAYMENT RECONCILIATION
    // =====================================================

    allocationSummary.netInterest =
      round2(
        allocationSummary.positiveInterest +
          allocationSummary.interestAdjustment,
      );

    /*
     * interestAdjustment is negative.
     *
     * Example:
     *
     * Positive interest     ₹0.00
     * Interest adjustment -₹191.04
     * Retention          ₹58,524.37
     * Net allocated      ₹58,333.33
     */
    const netAllocated = round2(
      allocationSummary.netInterest +
        allocationSummary.principal +
        allocationSummary.retention +
        allocationSummary.excess,
    );

    const allocationVariance = round2(
      transferAmount - netAllocated,
    );

    if (
      Math.abs(allocationVariance) >
      0.01
    ) {
      throw new Error(
        `Allocation variance for LAN=${lan}, ` +
          `payment_id=${paymentId}. ` +
          `Transfer=${transferAmount}, ` +
          `netAllocated=${netAllocated}, ` +
          `variance=${allocationVariance}`,
      );
    }

    // =====================================================
    // 5. PENDING BALANCE
    // =====================================================

    const [pendingRow] = await queryDB(
      `
        SELECT
          ROUND(
            COALESCE(
              SUM(
                COALESCE(
                  remaining_interest,
                  0
                )
                +
                COALESCE(
                  remaining_principal,
                  0
                )
                +
                COALESCE(
                  remaining_retention,
                  0
                )
              ),
              0
            ),
            2
          ) AS net_pending,

          ROUND(
            COALESCE(
              SUM(
                ABS(
                  COALESCE(
                    remaining_interest,
                    0
                  )
                )
                +
                ABS(
                  COALESCE(
                    remaining_principal,
                    0
                  )
                )
                +
                ABS(
                  COALESCE(
                    remaining_retention,
                    0
                  )
                )
              ),
              0
            ),
            2
          ) AS component_pending

        FROM manual_rps_gq_fsf_fintree
        WHERE lan = ?
      `,
      [lan],
    );

    const netPendingAmount = round2(
      pendingRow?.net_pending || 0,
    );

    const componentPendingAmount =
      round2(
        pendingRow?.component_pending ||
          0,
      );

    /*
     * Loan closes only when every remaining component
     * has been cleared.
     */
    const loanClosed =
      componentPendingAmount <=
      0.01;

    if (loanClosed) {
      await queryDB(
        `
          UPDATE loan_booking_gq_fsf
          SET status = 'Fully Paid'
          WHERE lan = ?
        `,
        [lan],
      );

      console.log(
        "🏁 Loan closed:",
        {
          lan,
          netPendingAmount,
          componentPendingAmount,
        },
      );
    } else {
      console.log(
        "📊 Loan still pending:",
        {
          lan,
          netPendingAmount,
          componentPendingAmount,
        },
      );
    }

    return {
      ok: true,
      duplicate: false,

      lan,
      paymentId,
      paymentDate,

      transferAmount,

      allocationSummary,

      netAllocated,
      allocationVariance,

      netPendingAmount,
      componentPendingAmount,

      loanClosed,

      allocationDetails,
    };
  } catch (error) {
    console.error(
      `❌ allocateGQFSFFintree failed ` +
        `for LAN=${lan}, ` +
        `payment_id=${paymentId}:`,
      error,
    );

    throw error;
  }
};

