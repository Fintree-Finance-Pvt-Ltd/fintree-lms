////////////////////////////////////////////////////
// allocateSaswat.js

const db = require("../../config/db");

const round2 = (value) =>
  Number(
    (
      Math.round(
        (Number(value || 0) + Number.EPSILON) * 100,
      ) / 100
    ).toFixed(2),
  );

/**
 * Allocate repayments for Saswat loans.
 *
 * Allocation order:
 * 1. Oldest due first
 * 2. Interest first
 * 3. Principal second
 * 4. Remaining amount goes to Excess Payment
 */
const allocateSaswat = async (
  lan,
  payment,
) => {
  const normalizedLan = String(
    lan || "",
  )
    .trim()
    .toUpperCase();

  const paymentId = String(
    payment?.payment_id || "",
  ).trim();

  const paymentDate =
    payment?.payment_date ||
    payment?.bank_date ||
    null;

  const transferAmount = round2(
    String(
      payment?.transfer_amount ?? "",
    )
      .replace(/,/g, "")
      .replace(/₹/g, "")
      .trim(),
  );

  if (!normalizedLan) {
    throw new Error(
      "Saswat LAN is required",
    );
  }

  if (!paymentId) {
    throw new Error(
      "payment_id is required for Saswat allocation",
    );
  }

  if (!paymentDate) {
    throw new Error(
      "payment_date is required for Saswat allocation",
    );
  }

  if (
    !Number.isFinite(transferAmount) ||
    transferAmount <= 0
  ) {
    throw new Error(
      `Invalid transfer amount for Saswat LAN ${normalizedLan}`,
    );
  }

  const emiTable =
    "manual_rps_saswat";

  const loanTable =
    "loan_booking_saswat";

  let conn;
  let transactionStarted = false;

  try {
    conn =
      await db
        .promise()
        .getConnection();

    await conn.beginTransaction();
    transactionStarted = true;

    /*
     * Lock and confirm Saswat loan.
     */
    const [loanRows] =
      await conn.query(
        `
          SELECT
            id,
            lan,
            status
          FROM ${loanTable}
          WHERE UPPER(TRIM(lan)) = ?
          LIMIT 1
          FOR UPDATE
        `,
        [normalizedLan],
      );

    if (loanRows.length === 0) {
      throw new Error(
        `Saswat loan not found for LAN ${normalizedLan}`,
      );
    }

    /*
     * Prevent duplicate allocation for the same
     * LAN and payment ID.
     */
    const [existingAllocation] =
      await conn.query(
        `
          SELECT id
          FROM allocation
          WHERE lan = ?
            AND payment_id = ?
          LIMIT 1
        `,
        [
          normalizedLan,
          paymentId,
        ],
      );

    if (
      existingAllocation.length > 0
    ) {
      await conn.commit();
      transactionStarted = false;

      console.log(
        "[SASWAT ALLOCATION SKIPPED]",
        {
          lan: normalizedLan,
          paymentId,
          reason:
            "PAYMENT_ALREADY_ALLOCATED",
        },
      );

      return {
        success: true,
        skipped: true,
        reason:
          "PAYMENT_ALREADY_ALLOCATED",
        lan: normalizedLan,
        payment_id: paymentId,
      };
    }

    let remaining =
      transferAmount;

    let totalInterestAllocated = 0;
    let totalPrincipalAllocated = 0;
    let totalExcessAllocated = 0;

    const allocationDetails = [];

    /*
     * Allocate oldest EMI first.
     */
    while (remaining > 0.009) {
      const [emiRows] =
        await conn.query(
          `
            SELECT
              id,
              lan,
              due_date,
              emi,
              interest,
              principal,
              remaining_interest,
              remaining_principal,
              remaining_emi,
              remaining_amount,
              status
            FROM ${emiTable}
            WHERE lan = ?
              AND (
                remaining_interest > 0.009
                OR remaining_principal > 0.009
              )
            ORDER BY due_date ASC, id ASC
            LIMIT 1
            FOR UPDATE
          `,
          [normalizedLan],
        );

      if (emiRows.length === 0) {
        break;
      }

      const emi = emiRows[0];

      let interestDue = round2(
        Math.max(
          0,
          Number(
            emi.remaining_interest || 0,
          ),
        ),
      );

      let principalDue = round2(
        Math.max(
          0,
          Number(
            emi.remaining_principal || 0,
          ),
        ),
      );

      let interestAllocated = 0;
      let principalAllocated = 0;

      /*
       * 1. Allocate interest.
       */
      if (
        remaining > 0.009 &&
        interestDue > 0.009
      ) {
        interestAllocated =
          round2(
            Math.min(
              interestDue,
              remaining,
            ),
          );

        remaining =
          round2(
            remaining -
              interestAllocated,
          );

        interestDue =
          round2(
            interestDue -
              interestAllocated,
          );

        await conn.query(
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
            normalizedLan,
            emi.due_date,
            paymentDate,
            interestAllocated,
            paymentId,
          ],
        );

        totalInterestAllocated =
          round2(
            totalInterestAllocated +
              interestAllocated,
          );

        allocationDetails.push({
          rps_id: emi.id,
          due_date: emi.due_date,
          charge_type: "Interest",
          allocated_amount:
            interestAllocated,
        });
      }

      /*
       * 2. Allocate principal only after
       * interest is completely cleared.
       */
      if (
        remaining > 0.009 &&
        interestDue <= 0.009 &&
        principalDue > 0.009
      ) {
        principalAllocated =
          round2(
            Math.min(
              principalDue,
              remaining,
            ),
          );

        remaining =
          round2(
            remaining -
              principalAllocated,
          );

        principalDue =
          round2(
            principalDue -
              principalAllocated,
          );

        await conn.query(
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
            normalizedLan,
            emi.due_date,
            paymentDate,
            principalAllocated,
            paymentId,
          ],
        );

        totalPrincipalAllocated =
          round2(
            totalPrincipalAllocated +
              principalAllocated,
          );

        allocationDetails.push({
          rps_id: emi.id,
          due_date: emi.due_date,
          charge_type: "Principal",
          allocated_amount:
            principalAllocated,
        });
      }

      const currentRemainingDue =
        round2(
          interestDue +
            principalDue,
        );

      let installmentStatus =
        emi.status || "Pending";

      if (
        currentRemainingDue <= 0.009
      ) {
        installmentStatus = "Paid";
      } else if (
        interestAllocated > 0 ||
        principalAllocated > 0
      ) {
        installmentStatus =
          "Partially Paid";
      }

      /*
       * Update the current RPS installment.
       */
      await conn.query(
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
          currentRemainingDue,
          currentRemainingDue,
          paymentDate,
          installmentStatus,
          emi.id,
        ],
      );

      /*
       * Stop when the current installment
       * still has unpaid amount.
       */
      if (
        interestDue > 0.009 ||
        principalDue > 0.009
      ) {
        break;
      }
    }

    /*
     * Park excess payment after all RPS dues
     * have been allocated.
     */
    if (remaining > 0.009) {
      totalExcessAllocated =
        round2(remaining);

      await conn.query(
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
          normalizedLan,
          paymentDate,
          paymentDate,
          totalExcessAllocated,
          paymentId,
        ],
      );

      allocationDetails.push({
        due_date: paymentDate,
        charge_type:
          "Excess Payment",
        allocated_amount:
          totalExcessAllocated,
      });

      console.log(
        `✅ Excess payment parked for Saswat LAN ${normalizedLan}`,
      );

      remaining = 0;
    }

    /*
     * Check pending Saswat installments.
     */
    const [pendingRows] =
      await conn.query(
        `
          SELECT COUNT(*) AS count
          FROM ${emiTable}
          WHERE lan = ?
            AND (
              remaining_interest > 0.009
              OR remaining_principal > 0.009
            )
        `,
        [normalizedLan],
      );

    const pendingCount =
      Number(
        pendingRows[0]?.count || 0,
      );

    let loanStatusUpdated = false;

    /*
     * Mark loan Fully Paid after all RPS
     * interest and principal are cleared.
     */
    if (pendingCount === 0) {
      const [statusUpdate] =
        await conn.query(
          `
            UPDATE ${loanTable}
            SET status = 'Fully Paid'
            WHERE lan = ?
          `,
          [normalizedLan],
        );

      loanStatusUpdated =
        statusUpdate.affectedRows > 0;

      console.log(
        `✅ Saswat loan status updated to Fully Paid for LAN ${normalizedLan}`,
      );
    }

    await conn.commit();
    transactionStarted = false;

    /*
     * Run the common DPD procedure after
     * successful allocation transaction.
     */
    try {
      await db
        .promise()
        .query(
          `CALL sp_update_loan_status_dpd()`,
        );
    } catch (procedureError) {
      /*
       * Allocation is already committed.
       * Do not fail the payment because of
       * the common DPD procedure.
       */
      console.error(
        "[SASWAT DPD PROCEDURE ERROR]",
        {
          lan: normalizedLan,
          message:
            procedureError.message,
        },
      );
    }

    const result = {
      success: true,
      skipped: false,
      lan: normalizedLan,
      payment_id: paymentId,
      payment_date: paymentDate,
      transfer_amount:
        transferAmount,
      interest_allocated:
        totalInterestAllocated,
      principal_allocated:
        totalPrincipalAllocated,
      excess_allocated:
        totalExcessAllocated,
      unallocated_amount:
        round2(remaining),
      pending_installments:
        pendingCount,
      fully_paid:
        pendingCount === 0,
      loan_status_updated:
        loanStatusUpdated,
      allocations:
        allocationDetails,
    };

    console.log(
      "✅ SASWAT PAYMENT ALLOCATION COMPLETED",
      result,
    );

    return result;
  } catch (error) {
    if (
      conn &&
      transactionStarted
    ) {
      try {
        await conn.rollback();
      } catch (rollbackError) {
        console.error(
          "Saswat allocation rollback failed:",
          rollbackError,
        );
      }
    }

    console.error(
      `❌ Saswat allocation failed for LAN ${normalizedLan}:`,
      error,
    );

    throw error;
  } finally {
    if (conn) {
      conn.release();
    }
  }
};

module.exports = allocateSaswat;