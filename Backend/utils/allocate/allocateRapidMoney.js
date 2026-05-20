////////////////////////////////////////////////////
// allocateRapidMoney.js

const db = require("../../config/db");

const queryDB = (sql, params) =>
  new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) reject(err);
      else resolve(results);
    });
  });

/**
 * Allocate payments for HELIUM loans.
 * Interest first, then principal. Oldest EMI first.
 */
const allocateRapidMoney = async (lan, payment) => {
  let remaining = parseFloat(payment.transfer_amount);
  const paymentDate = payment.payment_date;
  const paymentId = payment.payment_id;

  if (!paymentId) throw new Error("❌ payment_id is required");

  // --- RAPID MONEY loan tables ---
  const emiTable = "manual_rps_switch_my_loan";
  const loanTable = "loan_booking_switch_my_loan";

  // 1️⃣ Knock off EMIs in order — interest first, then principal
  while (remaining > 0) {
    const [emi] = await queryDB(
      `SELECT *
       FROM ${emiTable}
       WHERE lan = ?
       AND (remaining_interest > 0 OR remaining_principal > 0)
       ORDER BY due_date ASC
       LIMIT 1`,
      [lan]
    );

    if (!emi) break;

    let interestDue = Math.max(0, parseFloat(emi.remaining_interest || 0));
    let principalDue = Math.max(0, parseFloat(emi.remaining_principal || 0));

    // Interest allocation
    if (remaining > 0 && interestDue > 0) {
      const interestAlloc = Math.min(interestDue, remaining);
      remaining -= interestAlloc;
      interestDue -= interestAlloc;

      await queryDB(
        `INSERT INTO allocation
         (lan, due_date, allocation_date, allocated_amount, charge_type, payment_id)
         VALUES (?, ?, ?, ?, 'Interest', ?)`,
        [lan, emi.due_date, paymentDate, interestAlloc, paymentId]
      );
    }

    // Principal allocation
    if (remaining > 0 && interestDue === 0 && principalDue > 0) {
      const principalAlloc = Math.min(principalDue, remaining);
      remaining -= principalAlloc;
      principalDue -= principalAlloc;

      await queryDB(
        `INSERT INTO allocation
         (lan, due_date, allocation_date, allocated_amount, charge_type, payment_id)
         VALUES (?, ?, ?, ?, 'Principal', ?)`,
        [lan, emi.due_date, paymentDate, principalAlloc, paymentId]
      );
    }

    // Update EMI record
    const updatedRemaining = interestDue + principalDue;
    await queryDB(
      `UPDATE ${emiTable}
       SET remaining_interest = ?,
           remaining_principal = ?,
           remaining_emi = ?,
           remaining_amount = ?,
           payment_date = ?
       WHERE id = ?`,
      [
        interestDue,
        principalDue,
        updatedRemaining,
        updatedRemaining,
        paymentDate,
        emi.id,
      ]
    );

    // Stop if EMI still has dues
    if (interestDue > 0 || principalDue > 0) break;
  }


  /* =================================================
   2️⃣ Allocate Loan Charges
   Only after EMI dues are fully cleared
================================================= */

if (remaining > 0) {
  while (remaining > 0) {
    const [charge] = await queryDB(
      `
      SELECT *
      FROM loan_charges
      WHERE lan = ?
      AND paid_status != 'Paid'
      AND (
        amount - paid_amount - waived_amount - waived_off
      ) > 0
      ORDER BY due_date ASC, id ASC
      LIMIT 1
      `,
      [lan]
    );

    if (!charge) break;

    const outstandingCharge = Math.max(
      0,
      parseFloat(charge.amount || 0)
        - parseFloat(charge.paid_amount || 0)
        - parseFloat(charge.waived_amount || 0)
        - parseFloat(charge.waived_off || 0)
    );

    if (outstandingCharge <= 0) break;

    const chargeAllocation = Math.min(
      outstandingCharge,
      remaining
    );

    remaining -= chargeAllocation;

    const updatedPaidAmount =
      parseFloat(charge.paid_amount || 0)
      + chargeAllocation;

    const updatedOutstanding =
      outstandingCharge - chargeAllocation;

    const updatedStatus =
      updatedOutstanding <= 0
        ? "Paid"
        : "Partially Paid";

    /* =========================================
       Allocation Entry
    ========================================= */

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
      VALUES (?, ?, ?, ?, ?, ?)
      `,
      [
        lan,
        charge.due_date,
        paymentDate,
        chargeAllocation,
        charge.charge_type || "Charge",
        paymentId,
      ]
    );

    /* =========================================
       Update loan_charges
    ========================================= */

    await queryDB(
      `
      UPDATE loan_charges
      SET
        paid_amount = ?,
        paid_status = ?,
        payment_time = ?,
        remarks = ?
      WHERE id = ?
      `,
      [
        updatedPaidAmount,
        updatedStatus,
        paymentDate,
        `Allocated via payment ${paymentId}`,
        charge.id,
      ]
    );

    console.log("💠 Charge allocated", {
      lan,
      charge_id: charge.id,
      charge_type: charge.charge_type,
      allocated: chargeAllocation,
      remaining,
    });

    if (remaining <= 0) break;
  }
}

  // 2️⃣ Allocate excess payments
  if (remaining > 0) {
    await queryDB(
      `INSERT INTO allocation
       (lan, due_date, allocation_date, allocated_amount, charge_type, payment_id)
       VALUES (?, ?, ?, ?, 'Excess Payment', ?)`,
      [lan, paymentDate, paymentDate, remaining, paymentId]
    );
    console.log(`💠 Excess payment parked for RAPID MONEY LAN ${lan}`);
    remaining = 0;
  }

  // 3️⃣ Update loan DPD/status
  await queryDB(`CALL sp_update_loan_status_dpd()`);

  // 4️⃣ Mark as Fully Paid when no dues left
  const [pending] = await queryDB(
    `SELECT COUNT(*) AS count
     FROM ${emiTable}
     WHERE lan = ?
     AND (remaining_interest > 0 OR remaining_principal > 0)`,
    [lan]
  );

  if (pending.count === 0) {
    await queryDB(
      `UPDATE ${loanTable}
       SET status = 'Fully Paid'
       WHERE lan = ?`,
      [lan]
    );
    console.log(`💠 Loan marked Fully Paid for RAPID MONEY LAN ${lan}`);
  }
};

module.exports = allocateRapidMoney;
