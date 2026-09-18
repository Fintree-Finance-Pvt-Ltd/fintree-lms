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
 * Handle a refund/reversal row (negative transfer_amount) for a LAN —
 * e.g. a NACH mandate that bounced after already being allocated, or a
 * duplicate payment that was refunded back.
 *
 * Reconciliation-only: this does NOT undo the RPS balance, charge status,
 * or loan status the original payment set — it only records an offsetting
 * entry in `allocation` so SUM(allocation.allocated_amount) keeps matching
 * SUM(repayments_upload.transfer_amount) for this LAN. A loan whose payment
 * gets reversed will still show as paid/cleared; use the "Reversal (orig:
 * ...)" charge_type in the allocation table to find loans that need a
 * manual correction to their actual RPS/charge/status.
 *
 * Best-guess matching to the original payment being reversed: same LAN,
 * same absolute amount preferred (most recent among ties), falling back to
 * the most recent not-yet-matched positive payment on the LAN if no exact
 * amount match exists, and to an explicitly "unmatched" record if there's
 * no prior payment at all to guess from.
 */
async function recordRapidMoneyReversal(lan, transferAmount, paymentDate, paymentId) {
  const reversalAmount = Math.abs(transferAmount);

  const priorPayments = await queryDB(
    `
    SELECT payment_id, payment_date, transfer_amount
    FROM repayments_upload
    WHERE lan = ?
      AND transfer_amount > 0
      AND payment_id != ?
    ORDER BY payment_date DESC, id DESC
    `,
    [lan, paymentId],
  );

  const existingReversalRows = await queryDB(
    `SELECT charge_type FROM allocation WHERE lan = ? AND charge_type LIKE 'Reversal (orig: %'`,
    [lan],
  );

  const alreadyMatchedPaymentIds = new Set(
    existingReversalRows
      .map((row) => {
        const match = /^Reversal \(orig: (.+)\)$/.exec(row.charge_type || "");
        return match ? match[1] : null;
      })
      .filter(Boolean),
  );

  const candidates = priorPayments.filter(
    (p) => !alreadyMatchedPaymentIds.has(p.payment_id),
  );

  const exactMatch = candidates.find(
    (p) => Number(p.transfer_amount) === reversalAmount,
  );

  const matched = exactMatch || candidates[0] || null;

  let dueDate = paymentDate;

  if (matched) {
    const [matchedAllocation] = await queryDB(
      `SELECT due_date FROM allocation WHERE lan = ? AND payment_id = ? ORDER BY due_date ASC LIMIT 1`,
      [lan, matched.payment_id],
    );

    if (matchedAllocation?.due_date) {
      dueDate = matchedAllocation.due_date;
    }
  }

  const chargeType = matched
    ? `Reversal (orig: ${matched.payment_id})`
    : "Reversal (unmatched)";

  await queryDB(
    `INSERT INTO allocation
     (lan, due_date, allocation_date, allocated_amount, charge_type, payment_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [lan, dueDate, paymentDate, transferAmount, chargeType, paymentId],
  );

  console.log("💠 Reversal recorded (reconciliation-only)", {
    lan,
    paymentId,
    reversalAmount,
    matchedOriginalPaymentId: matched?.payment_id || null,
    matchStrategy: matched
      ? exactMatch
        ? "exact_amount"
        : "most_recent_fallback"
      : "unmatched",
  });

  return {
    skipped: false,
    reversal: true,
    matchedOriginalPaymentId: matched?.payment_id || null,
  };
}

/**
 * Allocate payments for HELIUM loans.
 * Interest first, then principal. Oldest EMI first.
 */
const allocateRapidMoney = async (lan, payment) => {
  const transferAmount = parseFloat(payment.transfer_amount);
  const paymentDate = payment.payment_date;
  const paymentId = payment.payment_id;

  if (!paymentId) throw new Error("❌ payment_id is required");

  if (transferAmount < 0) {
    return recordRapidMoneyReversal(lan, transferAmount, paymentDate, paymentId);
  }

  let remaining = transferAmount;

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

  // 4️⃣ Mark as Fully Paid only when no EMI dues AND no open loan charges are
  // left. Previously this only checked the EMI table, so a loan with every
  // EMI cleared but an open (unpaid, not fully waived) charge still
  // outstanding — e.g. the payment amount only covered the EMI dues with
  // nothing left over to allocate to charges — got marked Fully Paid anyway.
  const [pending] = await queryDB(
    `SELECT COUNT(*) AS count
     FROM ${emiTable}
     WHERE lan = ?
     AND (remaining_interest > 0 OR remaining_principal > 0)`,
    [lan]
  );

  const [pendingCharges] = await queryDB(
    `SELECT COUNT(*) AS count
     FROM loan_charges
     WHERE lan = ?
     AND paid_status != 'Paid'
     AND (amount - paid_amount - waived_amount - waived_off) > 0`,
    [lan]
  );

  if (pending.count === 0 && pendingCharges.count === 0) {
    await queryDB(
      `UPDATE ${loanTable}
       SET status = 'Fully Paid'
       WHERE lan = ?`,
      [lan]
    );
    console.log(`💠 Loan marked Fully Paid for RAPID MONEY LAN ${lan}`);
  } else if (pending.count === 0 && pendingCharges.count > 0) {
    console.log(
      `💠 EMIs cleared but ${pendingCharges.count} open charge(s) remain for RAPID MONEY LAN ${lan} — not marking Fully Paid`
    );
  }
};

module.exports = allocateRapidMoney;
