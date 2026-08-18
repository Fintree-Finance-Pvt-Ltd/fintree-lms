////////////////////////////////////////////////////
// allocateWctlffpl.js

const db = require("../../config/db");

const queryDB = (sql, params) =>
  new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) reject(err);
      else resolve(results);
    });
  });

/**
 * Allocate payments for EMI Club loans.
 * Knock off interest first, then principal (oldest dues first).
 */
const allocateWctlffpl = async (lan, payment) => {
  let remaining = Number(payment.transfer_amount);
  const paymentDate = payment.payment_date;
  const paymentId = payment.payment_id;

  const emiTable = "manual_rps_wctl_ffpl";
  const loanTable = "loan_booking_wctl_ffpl";

  if (!paymentId) {
    throw new Error("❌ payment_id is required");
  }

  if (!Number.isFinite(remaining) || remaining <= 0) {
    throw new Error("❌ Invalid payment amount");
  }

  let totalInterestAllocated = 0;
  let totalPrincipalAllocated = 0;

  /*
   * ==========================================================
   * STEP 1
   * CLEAR ONLY INTEREST DUE UP TO PAYMENT DATE
   * ==========================================================
   */

  while (remaining > 0) {
    const [emi] = await queryDB(
      `
      SELECT *
      FROM ${emiTable}
      WHERE lan = ?
        AND remaining_interest > 0
        AND due_date <= DATE(?)
      ORDER BY due_date ASC, id ASC
      LIMIT 1
      `,
      [lan, paymentDate]
    );

    if (!emi) {
      break;
    }

    let interestDue = Math.max(
      0,
      Number(emi.remaining_interest || 0)
    );

    const principalDue = Math.max(
      0,
      Number(emi.remaining_principal || 0)
    );

    const interestAlloc = Math.min(
      remaining,
      interestDue
    );

    interestDue -= interestAlloc;
    remaining -= interestAlloc;

    interestDue = Number(
      Math.max(0, interestDue).toFixed(2)
    );

    remaining = Number(
      Math.max(0, remaining).toFixed(2)
    );

    totalInterestAllocated += interestAlloc;

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
        Number(interestAlloc.toFixed(2)),
        paymentId,
      ]
    );

    const newRemaining = Number(
      (interestDue + principalDue).toFixed(2)
    );

    await queryDB(
      `
      UPDATE ${emiTable}
      SET
        remaining_interest = ?,
        remaining_emi = ?,
        remaining_amount = ?,
        payment_date = ?,
        status = CASE
          WHEN ? = 0 THEN 'Paid'
          ELSE 'Pending'
        END
      WHERE id = ?
      `,
      [
        interestDue,
        newRemaining,
        newRemaining,
        paymentDate,
        newRemaining,
        emi.id,
      ]
    );
  }

  /*
   * ==========================================================
   * STEP 2
   * CHECK WHETHER ANY DUE INTEREST IS STILL UNPAID
   * ==========================================================
   */

  const [dueInterestPending] = await queryDB(
    `
    SELECT
      COALESCE(SUM(remaining_interest), 0)
        AS pending_interest
    FROM ${emiTable}
    WHERE lan = ?
      AND due_date <= DATE(?)
      AND remaining_interest > 0
    `,
    [lan, paymentDate]
  );

  const pendingDueInterest = Number(
    dueInterestPending.pending_interest || 0
  );

  /*
   * ==========================================================
   * STEP 3
   * IF DUE INTEREST = 0,
   * EXTRA PAYMENT GOES TO PRINCIPAL
   * ==========================================================
   */

  let principalPrepayment = 0;
  let newOutstandingPrincipal = null;

  if (
    remaining > 0 &&
    pendingDueInterest <= 0
  ) {
    /*
     * WCTL bullet principal normally exists
     * on the maturity/final RPS row.
     */
    const [bulletRow] = await queryDB(
      `
      SELECT *
      FROM ${emiTable}
      WHERE lan = ?
        AND remaining_principal > 0
      ORDER BY due_date DESC, id DESC
      LIMIT 1
      `,
      [lan]
    );

    if (bulletRow) {
      const outstandingPrincipal = Number(
        bulletRow.remaining_principal || 0
      );

      principalPrepayment = Math.min(
        remaining,
        outstandingPrincipal
      );

      if (principalPrepayment > 0) {
        remaining -= principalPrepayment;

        remaining = Number(
          Math.max(0, remaining).toFixed(2)
        );

        newOutstandingPrincipal = Number(
          (
            outstandingPrincipal -
            principalPrepayment
          ).toFixed(2)
        );

        totalPrincipalAllocated +=
          principalPrepayment;

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

            // Principal belongs to bullet maturity row
            bulletRow.due_date,

            paymentDate,

            Number(
              principalPrepayment.toFixed(2)
            ),

            paymentId,
          ]
        );
      }
    }
  }

  /*
   * ==========================================================
   * STEP 4
   * IF PRINCIPAL REDUCED → RECAST FUTURE RPS
   * ==========================================================
   */

  if (
    principalPrepayment > 0 &&
    newOutstandingPrincipal !== null
  ) {
    const [loan] = await queryDB(
      `
      SELECT
        interest_rate,
        product
      FROM ${loanTable}
      WHERE lan = ?
      LIMIT 1
      `,
      [lan]
    );

    if (!loan) {
      throw new Error(
        `WCTL FFPL loan not found for ${lan}`
      );
    }

    await recastWctlFfplFutureRps(
      lan,
      paymentDate,
      newOutstandingPrincipal,
      Number(loan.interest_rate),
      loan.product
    );
  }

  /*
   * ==========================================================
   * STEP 5
   * EXCESS ONLY AFTER PRINCIPAL IS ALSO FULLY CLEARED
   * ==========================================================
   */

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
      VALUES (?, ?, ?, ?, 'Excess Payment', ?)
      `,
      [
        lan,
        paymentDate,
        paymentDate,
        Number(remaining.toFixed(2)),
        paymentId,
      ]
    );

    remaining = 0;
  }

  /*
   * ==========================================================
   * STEP 6
   * UPDATE DPD
   * ==========================================================
   */

  await queryDB(
    `CALL sp_update_loan_status_dpd()`
  );

  /*
   * ==========================================================
   * STEP 7
   * FULLY PAID CHECK
   * ==========================================================
   */

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

  if (Number(pending.count) === 0) {
    await queryDB(
      `
      UPDATE ${loanTable}
      SET status = 'Fully Paid'
      WHERE lan = ?
      `,
      [lan]
    );
  }

  console.log(
    "✅ WCTL FFPL PAYMENT ALLOCATED:",
    {
      lan,
      paymentId,
      paymentDate,
      interestAllocated:
        Number(totalInterestAllocated.toFixed(2)),
      principalAllocated:
        Number(totalPrincipalAllocated.toFixed(2)),
      newOutstandingPrincipal,
    }
  );
};

const recastWctlFfplFutureRps = async (
  lan,
  paymentDate,
  outstandingPrincipal,
  interestRate,
  product
) => {
  const principalBalance = Number(
    outstandingPrincipal
  );

  const annualRate =
    Number(interestRate) / 100;

  if (
    !Number.isFinite(principalBalance) ||
    principalBalance < 0
  ) {
    throw new Error(
      `Invalid WCTL outstanding principal: ${outstandingPrincipal}`
    );
  }

  if (
    !Number.isFinite(annualRate) ||
    annualRate < 0
  ) {
    throw new Error(
      `Invalid WCTL interest rate: ${interestRate}`
    );
  }

  /*
   * =====================================================
   * WCTL FFPL MONTHLY BULLET RULE
   *
   * Fixed 30/360 basis.
   * No getWctlScheduleConfig() required here.
   * =====================================================
   */

  const days = 30;
  const basis = 360;

  /*
   * Fetch only FUTURE installments.
   * Paid/current/old rows are not changed.
   */
  const futureRows = await queryDB(
    `
    SELECT *
    FROM manual_rps_wctl_ffpl
    WHERE lan = ?
      AND due_date > DATE(?)
    ORDER BY due_date ASC, id ASC
    `,
    [lan, paymentDate]
  );

  if (!futureRows.length) {
    console.log(
      `No future WCTL FFPL RPS rows found for ${lan}`
    );

    return;
  }

  /*
   * New monthly interest after principal reduction
   *
   * Principal × ROI × 30 / 360
   */
  const monthlyInterest = Number(
    (
      principalBalance *
      annualRate *
      days /
      basis
    ).toFixed(2)
  );

  for (
    let index = 0;
    index < futureRows.length;
    index++
  ) {
    const row = futureRows[index];

    const isFinal =
      index === futureRows.length - 1;

    let principal = 0;
    let emi = monthlyInterest;
    let closing = principalBalance;

    /*
     * ==============================================
     * FINAL BULLET INSTALLMENT
     * ==============================================
     */
    if (isFinal) {
      principal = principalBalance;

      emi = Number(
        (
          monthlyInterest +
          principalBalance
        ).toFixed(2)
      );

      closing = 0;
    }

    await queryDB(
      `
      UPDATE manual_rps_wctl_ffpl
      SET
        opening = ?,
        emi = ?,
        interest = ?,
        principal = ?,
        closing = ?,

        remaining_emi = ?,
        remaining_interest = ?,
        remaining_principal = ?,
        remaining_amount = ?,

        status = 'Pending'
      WHERE id = ?
      `,
      [
        // opening
        principalBalance,

        // scheduled EMI
        emi,

        // interest
        monthlyInterest,

        // principal
        principal,

        // closing
        closing,

        // remaining EMI
        emi,

        // remaining interest
        monthlyInterest,

        // remaining principal
        principal,

        // remaining amount
        emi,

        // row id
        row.id,
      ]
    );
  }

  console.log(
    "✅ WCTL FFPL FUTURE RPS RECAST:",
    {
      lan,
      paymentDate,

      oldProduct: product,

      outstandingPrincipal:
        principalBalance,

      interestRate,

      days,

      basis,

      monthlyInterest,

      futureInstallments:
        futureRows.length,
    }
  );
};

module.exports = allocateWctlffpl;
