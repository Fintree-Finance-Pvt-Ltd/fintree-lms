// utils/allocate/allocateForeclosure.js
const db = require("../../config/db");

const queryDB = (sql, params) =>
  new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) reject(err);
      else resolve(results);
    });
  });

const begin = () => queryDB("START TRANSACTION");
const commit = () => queryDB("COMMIT");
const rollback = () => queryDB("ROLLBACK");

// === CONFIG ===
const PROC_NAME = "sp_calculate_forecloser_allocation_cal";

/** Map LAN prefix -> tables */
function detectTablesByLan(lan) {
  const key = String(lan || "").trim().toUpperCase();
  if (key.startsWith("WCTL")) return { emiTable: "manual_rps_wctl", loanTable: "loan_bookings_wctl" };
  if (key.startsWith("BL"))   return { emiTable: "manual_rps_bl_loan", loanTable: "loan_bookings" };
  if (key.startsWith("GQFSF"))return { emiTable: "manual_rps_gq_fsf", loanTable: "loan_booking_gq_fsf" };
  if (key.startsWith("GQNON"))return { emiTable: "manual_rps_gq_non_fsf", loanTable: "loan_booking_gq_non_fsf" };
  if (key.startsWith("FINE")) return { emiTable: "manual_rps_emiclub", loanTable: "loan_booking_emiclub" };
  if (key.startsWith("CIRF")) return { emiTable: "manual_rps_circlepe", loanTable: "loan_booking_circle_pe" };
  if (key.startsWith("E1"))   return { emiTable: "manual_rps_embifi_loan", loanTable: "loan_booking_embifi" };
  if (key.startsWith("ADK"))  return { emiTable: "manual_rps_adikosh", loanTable: "loan_booking_adikosh" };
  // default EV
  return { emiTable: "manual_rps_ev_loan", loanTable: "loan_booking_ev" };
}

/** Insert into allocation log */
async function addAlloc({ lan, dueDate, allocDate, amount, chargeType, paymentId, meta = null }) {
  if (!amount || amount <= 0) return 0;
  await queryDB(
    `INSERT INTO allocation (lan, due_date, allocation_date, allocated_amount, charge_type, payment_id, meta_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [lan, dueDate || null, allocDate, amount, chargeType, paymentId, meta ? JSON.stringify(meta) : null]
  );
  return amount;
}

/** Update EMI row */
async function updateEmiAmounts(emiTable, emiId, { ri, rp, paymentDate }) {
  const remainingEmi = (Number(ri) || 0) + (Number(rp) || 0);
  await queryDB(
    `UPDATE ${emiTable}
       SET remaining_interest = ?,
           remaining_principal = ?,
           remaining_emi = ?,
           remaining_amount = ?,
           payment_date = ?
     WHERE id = ?`,
    [ri, rp, remainingEmi, remainingEmi, paymentDate, emiId]
  );
}

/** Safely coerce numeric */
function N(x) {
  const v = Number(x);
  return isNaN(v) ? 0 : v;
}

/** Try to read a principal component for a FUTURE EMI even when remaining_principal is 0 */
function computeFuturePrincipalComponent(emi) {
  // common column names across your variants
  const candidates = [
    emi.remaining_principal, emi.principal_component, emi.emi_principal,
    emi.principal, emi.principal_amt, emi.principal_amount
  ];

  for (const c of candidates) {
    const v = N(c);
    if (v > 0) return v;
  }

  // derive from EMI - interest if possible
  const emiAmt = N(emi.emi_amount) || N(emi.total_emi) || N(emi.remaining_amount) || N(emi.remaining_emi);
  const interestComp = N(emi.remaining_interest) || N(emi.emi_interest) || N(emi.interest);
  if (emiAmt > 0 && emiAmt - interestComp > 0) return +(emiAmt - interestComp).toFixed(2);

  // final fallback: 0
  return 0;
}

/** Sweep due_date <= paymentDate : Principal then Overdue Interest */
async function sweepPastEmis({ emiTable, lan, paymentDate, paymentId, remaining }) {
  if (remaining <= 0) return remaining;

  const emis = await queryDB(
    `SELECT * FROM ${emiTable}
      WHERE lan = ? 
        AND (remaining_interest > 0 OR remaining_principal > 0)
        AND due_date <= ?
      ORDER BY due_date ASC`,
    [lan, paymentDate]
  );

  for (const emi of emis) {
    if (remaining <= 0) break;

    const dueDate = emi.due_date;
    let rp = N(emi.remaining_principal);
    let ri = N(emi.remaining_interest);

    // principal first
    if (rp > 0 && remaining > 0) {
      const use = Math.min(rp, remaining);
      await addAlloc({ lan, dueDate, allocDate: paymentDate, amount: use, chargeType: "Principal", paymentId });
      rp -= use;
      remaining -= use;
    }

    // overdue interest next
    if (ri > 0 && remaining > 0) {
      const use = Math.min(ri, remaining);
      await addAlloc({ lan, dueDate, allocDate: paymentDate, amount: use, chargeType: "Interest (Overdue)", paymentId });
      ri -= use;
      remaining -= use;
    }

    await updateEmiAmounts(emiTable, emi.id, { ri, rp, paymentDate });
  }

  return remaining;
}

/**
 * Sweep due_date > paymentDate:
 *  - allocate ONLY principal component (even if remaining_principal is 0)
 *  - ALWAYS waive future interest of each EMI to 0 (per requirement)
 *  - update the row so leftover (if any) is carried as remaining_principal (interest=0)
 */
async function sweepFutureEmisPrincipalOnly({ emiTable, lan, paymentDate, paymentId, remaining }) {
  if (remaining <= 0) return { remaining, totalFutureInterestWaived: 0, totalFuturePrincipalAllocated: 0 };

  const emis = await queryDB(
    `SELECT * FROM ${emiTable}
      WHERE lan = ?
        AND (remaining_interest > 0 OR remaining_principal > 0 OR remaining_emi > 0 OR remaining_amount > 0)
        AND due_date > ?
      ORDER BY due_date ASC`,
    [lan, paymentDate]
  );

  let totalFutureInterestWaived = 0;
  let totalFuturePrincipalAllocated = 0;

  for (const emi of emis) {
    if (remaining <= 0) break;

    const dueDate = emi.due_date;

    // Compute this EMI's future principal component (scheduled principal)
    const principalComp = computeFuturePrincipalComponent(emi);

    // Compute this EMI's future interest component (waive fully)
    const interestComp = N(emi.remaining_interest) || N(emi.emi_interest) || N(emi.interest);

    // Always waive future interest (regardless of principal coverage)
    if (interestComp > 0) {
      await addAlloc({
        lan,
        dueDate,
        allocDate: paymentDate,
        amount: interestComp,
        chargeType: "Waiver - Interest (Future)",
        paymentId,
        meta: { reason: "Foreclosure future interest waived" },
      });
      totalFutureInterestWaived += interestComp;
    }

    // Allocate principal only
    let rp_left = principalComp;
    if (principalComp > 0 && remaining > 0) {
      const useP = Math.min(principalComp, remaining);
      await addAlloc({ lan, dueDate, allocDate: paymentDate, amount: useP, chargeType: "Principal", paymentId });
      totalFuturePrincipalAllocated += useP;
      rp_left = +(principalComp - useP).toFixed(2);
      remaining = +(remaining - useP).toFixed(2);
    }

    // After foreclosure rule: interest becomes 0 for all future EMIs
    const ri_after = 0;

    // Update row to reflect true leftover: only principal can remain
    await updateEmiAmounts(emiTable, emi.id, {
      ri: ri_after,
      rp: rp_left,
      paymentDate
    });
  }

  return { remaining, totalFutureInterestWaived, totalFuturePrincipalAllocated };
}

const allocateForeclosure = async (lan, payment) => {
  const totalReceived = N(payment.transfer_amount);
  const paymentDate = payment.payment_date; // drive by Payment Date
  const paymentId   = payment.payment_id;
  if (!paymentId) throw new Error("❌ payment_id is required");

  const { emiTable, loanTable } = detectTablesByLan(lan);

  await begin();
  try {
    // 1) Get breakup as-of payment date (for ACC, fee, tax)
    const fcRows = await queryDB(`CALL ${PROC_NAME}(?, ?)`, [lan, paymentDate]);
    const fc = Array.isArray(fcRows) ? (Array.isArray(fcRows[0]) ? fcRows[0][0] : fcRows[0]) : fcRows[0];
    if (!fc) throw new Error("❌ FC proc returned no row");

    const TRP = N(fc.total_remaining_principal); // reference
    const TRI = N(fc.total_remaining_interest);  // overdue interest ≤ T (reference)
    const ACC = N(fc.accrued_interest);          // accrual last due -> T
    const FEE = N(fc.foreclosure_fee);
    const GST = N(fc.foreclosure_tax);
    const FC_TOTAL = N(fc.total_fc_amount);

    let remaining = totalReceived;

    // 2) Past & today EMIs: principal then overdue interest
    remaining = await sweepPastEmis({ emiTable, lan, paymentDate, paymentId, remaining });

    // 3) Accrued interest (single head)
    if (remaining > 0 && ACC > 0) {
      const use = Math.min(ACC, remaining);
      await addAlloc({
        lan,
        dueDate: paymentDate,
        allocDate: paymentDate,
        amount: use,
        chargeType: "Accrued Interest",
        paymentId,
        meta: { from_proc: true, computed: ACC },
      });
      remaining = +(remaining - use).toFixed(2);
    }

    // 4) Future EMIs: principal only; always waive future interest
    const futureRes = await sweepFutureEmisPrincipalOnly({
      emiTable, lan, paymentDate, paymentId, remaining
    });
    remaining = futureRes.remaining;

    // 5) FC fee, then GST (both MUST appear in allocation)
    if (remaining > 0 && FEE > 0) {
      const use = Math.min(FEE, remaining);
      await addAlloc({ lan, dueDate: paymentDate, allocDate: paymentDate, amount: use, chargeType: "FC Fee", paymentId, meta: { computed: FEE } });
      remaining = +(remaining - use).toFixed(2);
    }
    if (remaining > 0 && GST > 0) {
      const use = Math.min(GST, remaining);
      await addAlloc({ lan, dueDate: paymentDate, allocDate: paymentDate, amount: use, chargeType: "FC GST", paymentId, meta: { computed: GST } });
      remaining = +(remaining - use).toFixed(2);
    }

    // 6) Penal charges
    let penalDue = 0;
    try {
      const [p] = await queryDB(
        `SELECT IFNULL(SUM(balance_amount),0) AS due
           FROM loan_charges
          WHERE lan = ? AND charge_type = 'Penal' AND status IN ('Unpaid','Due')`,
        [lan]
      );
      penalDue = N(p?.due);
    } catch { penalDue = 0; }

    if (remaining > 0 && penalDue > 0) {
      const use = Math.min(penalDue, remaining);
      await addAlloc({ lan, dueDate: paymentDate, allocDate: paymentDate, amount: use, chargeType: "Penal Charges", paymentId });
      remaining = +(remaining - use).toFixed(2);
    }

    // 7) NACH bounce charges
    let nachDue = 0;
    try {
      const [n] = await queryDB(
        `SELECT IFNULL(SUM(balance_amount),0) AS due
           FROM loan_charges
          WHERE lan = ? AND charge_type = 'NACH Bounce' AND status IN ('Unpaid','Due')`,
        [lan]
      );
      nachDue = N(n?.due);
    } catch { nachDue = 0; }

    if (remaining > 0 && nachDue > 0) {
      const use = Math.min(nachDue, remaining);
      await addAlloc({ lan, dueDate: paymentDate, allocDate: paymentDate, amount: use, chargeType: "NACH Charges", paymentId });
      remaining = +(remaining - use).toFixed(2);
    }

    // 8) Excess
    if (remaining > 0) {
      await addAlloc({ lan, dueDate: paymentDate, allocDate: paymentDate, amount: remaining, chargeType: "Excess Payment", paymentId });
      remaining = 0;
    }

    // 9) Close loan if nothing remains on any EMI
    const [pending] = await queryDB(
      `SELECT COUNT(*) AS cnt
         FROM ${emiTable}
        WHERE lan = ?
          AND (remaining_interest > 0 OR remaining_principal > 0)`,
      [lan]
    );
    if (pending.cnt === 0) {
      await queryDB(`UPDATE ${loanTable} SET status = 'Fully Paid' WHERE lan = ?`, [lan]);
    }

    await commit();
    return {
      ok: true,
      message: "✅ Foreclosure allocation completed",
      fc_breakup: { TRP, TRI, ACC, FEE, GST, FC_TOTAL },
      future_interest_waived: futureRes.totalFutureInterestWaived || 0,
      future_principal_allocated: futureRes.totalFuturePrincipalAllocated || 0
    };
  } catch (e) {
    await rollback();
    throw e;
  }
};

module.exports = allocateForeclosure;
