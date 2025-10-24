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

/** Update one EMI row with new remaining fields */
async function updateEmiAmounts(emiTable, emiId, { ri, rp, paymentDate }) {
  const remainingEmi = ri + rp;
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

/** Sweep for EMIs with due_date <= T (collect principal then overdue interest) */
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
    let rp = Number(emi.remaining_principal || 0);
    let ri = Number(emi.remaining_interest || 0);

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
 * Sweep future EMIs (due_date > T):
 * - allocate only principal
 * - when an EMI's principal is fully covered, waive its remaining interest to 0
 * - if principal not fully covered, do not waive its interest (foreclosure incomplete)
 */
async function sweepFutureEmisPrincipalOnly({ emiTable, lan, paymentDate, paymentId, remaining }) {
  if (remaining <= 0) return { remaining, totalFutureInterestWaived: 0 };

  const emis = await queryDB(
    `SELECT * FROM ${emiTable}
      WHERE lan = ?
        AND (remaining_interest > 0 OR remaining_principal > 0)
        AND due_date > ?
      ORDER BY due_date ASC`,
    [lan, paymentDate]
  );

  let totalFutureInterestWaived = 0;

  for (const emi of emis) {
    if (remaining <= 0) break;

    const dueDate = emi.due_date;
    let rp = Number(emi.remaining_principal || 0);
    let ri = Number(emi.remaining_interest || 0);

    if (rp <= 0 && ri > 0) {
      // principal already zero; this is pure future interest -> waive it
      await addAlloc({
        lan,
        dueDate,
        allocDate: paymentDate,
        amount: ri,
        chargeType: "Waiver - Interest (Future)",
        paymentId,
        meta: { reason: "Foreclosure future interest waived" },
      });
      totalFutureInterestWaived += ri;
      ri = 0;
      await updateEmiAmounts(emiTable, emi.id, { ri, rp, paymentDate });
      continue;
    }

    if (rp > 0) {
      // allocate principal only
      const useP = Math.min(rp, remaining);
      if (useP > 0) {
        await addAlloc({ lan, dueDate, allocDate: paymentDate, amount: useP, chargeType: "Principal", paymentId });
        rp -= useP;
        remaining -= useP;
      }

      // fully cleared principal -> waive any remaining future interest for this EMI
      if (rp === 0 && ri > 0) {
        await addAlloc({
          lan,
          dueDate,
          allocDate: paymentDate,
          amount: ri,
          chargeType: "Waiver - Interest (Future)",
          paymentId,
          meta: { reason: "Foreclosure future interest waived" },
        });
        totalFutureInterestWaived += ri;
        ri = 0;
      }

      await updateEmiAmounts(emiTable, emi.id, { ri, rp, paymentDate });
    }
  }

  return { remaining, totalFutureInterestWaived };
}

const allocateForeclosure = async (lan, payment) => {
  const totalReceived = Number(payment.transfer_amount || 0);
  const paymentDate = payment.payment_date; // drive by Payment Date
  const paymentId   = payment.payment_id;
  if (!paymentId) throw new Error("❌ payment_id is required");

  const { emiTable, loanTable } = detectTablesByLan(lan);

  await begin();
  try {
    // 1) Get breakup as-of payment date
    const fcRows = await queryDB(`CALL ${PROC_NAME}(?, ?)`, [lan, paymentDate]);
    const fc = Array.isArray(fcRows) ? (Array.isArray(fcRows[0]) ? fcRows[0][0] : fcRows[0]) : fcRows[0];
    if (!fc) throw new Error("❌ FC proc returned no row");

    const TRP = Number(fc.total_remaining_principal || 0); // all principal (past + future)
    const TRI = Number(fc.total_remaining_interest || 0);  // overdue interest ≤ T
    const ACC = Number(fc.accrued_interest || 0);          // accrual from last due date → T
    const FEE = Number(fc.foreclosure_fee || 0);
    const GST = Number(fc.foreclosure_tax || 0);
    const FC_TOTAL = Number(fc.total_fc_amount || 0);

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
      remaining -= use;
    }

    // 4) Future EMIs: principal only; waive future interest on cleared EMIs
    const futureRes = await sweepFutureEmisPrincipalOnly({
      emiTable, lan, paymentDate, paymentId, remaining
    });
    remaining = futureRes.remaining;

    // 5) FC fee, then GST
    if (remaining > 0 && FEE > 0) {
      const use = Math.min(FEE, remaining);
      await addAlloc({ lan, dueDate: paymentDate, allocDate: paymentDate, amount: use, chargeType: "FC Fee", paymentId, meta: { computed: FEE } });
      remaining -= use;
    }
    if (remaining > 0 && GST > 0) {
      const use = Math.min(GST, remaining);
      await addAlloc({ lan, dueDate: paymentDate, allocDate: paymentDate, amount: use, chargeType: "FC GST", paymentId, meta: { computed: GST } });
      remaining -= use;
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
      penalDue = Number(p?.due || 0);
    } catch { penalDue = 0; }

    if (remaining > 0 && penalDue > 0) {
      const use = Math.min(penalDue, remaining);
      await addAlloc({ lan, dueDate: paymentDate, allocDate: paymentDate, amount: use, chargeType: "Penal Charges", paymentId });
      remaining -= use;
      penalDue -= use;
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
      nachDue = Number(n?.due || 0);
    } catch { nachDue = 0; }

    if (remaining > 0 && nachDue > 0) {
      const use = Math.min(nachDue, remaining);
      await addAlloc({ lan, dueDate: paymentDate, allocDate: paymentDate, amount: use, chargeType: "NACH Charges", paymentId });
      remaining -= use;
      nachDue -= use;
    }

    // 8) Excess
    if (remaining > 0) {
      await addAlloc({ lan, dueDate: paymentDate, allocDate: paymentDate, amount: remaining, chargeType: "Excess Payment", paymentId });
      remaining = 0;
    }

    // 9) Close loan if nothing remains anywhere
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
      future_interest_waived: futureRes.totalFutureInterestWaived || 0
    };
  } catch (e) {
    await rollback();
    throw e;
  }
};

module.exports = allocateForeclosure;
