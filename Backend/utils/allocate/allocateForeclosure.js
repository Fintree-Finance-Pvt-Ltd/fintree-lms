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
const PROC_NAME = "sp_calculate_forecloser_collection"; // created above

function detectTablesByLan(lan) {
  const key = String(lan || "").trim().toUpperCase();
  if (key.startsWith("WCTL")) {
    return { emiTable: "manual_rps_wctl", loanTable: "loan_bookings_wctl" };
  }else if (key.startsWith("BL")) {
    return { emiTable: "manual_rps_bl_loan", loanTable: "loan_bookings" };
  }
  else if (key.startsWith("GQFSF")) {
    return { emiTable: "manual_rps_gq_fsf", loanTable: "loan_booking_gq_fsf" };
  }
  else if (key.startsWith("GQNON")) {
    return { emiTable: "manual_rps_gq_non_fsf", loanTable: "loan_booking_gq_non_fsf" };
  }
  else if (key.startsWith("FINE")) {
    return { emiTable: "manual_rps_emiclub", loanTable: "loan_booking_emiclub" };
  }
  else if (key.startsWith("E1")) {
    return { emiTable: "manual_rps_embifi_loan", loanTable: "loan_booking_embifi" };
  }else if (key.startsWith("FINS")) {
    return { emiTable: "manual_rps_finso_loan", loanTable: "loan_booking_finso" };
  }
  return { emiTable: "manual_rps_ev_loan", loanTable: "loan_booking_ev" };
}

async function addAlloc({ lan, dueDate, allocDate, amount, chargeType, paymentId, meta = null }) {
  if (!amount || amount <= 0) return 0;
  await queryDB(
    `INSERT INTO allocation (lan, due_date, allocation_date, allocated_amount, charge_type, payment_id, meta_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [lan, dueDate || null, allocDate, amount, chargeType, paymentId, meta ? JSON.stringify(meta) : null]
  );
  return amount;
}

async function allocateOnOneEmi({ emiTable, lan, emiRow, paymentDate, paymentId, bucket, remaining }) {
  if (remaining <= 0) return { allocated: 0, remaining };

  const dueDate = emiRow.due_date;
  let ri = Number(emiRow.remaining_interest || 0);
  let rp = Number(emiRow.remaining_principal || 0);

  if (bucket === "principal" && rp > 0) {
    const use = Math.min(rp, remaining);
    if (use > 0) {
      await addAlloc({ lan, dueDate, allocDate: paymentDate, amount: use, chargeType: "Principal", paymentId });
      rp -= use;
      remaining -= use;
    }
  }

  if (bucket === "interest" && ri > 0) {
    const use = Math.min(ri, remaining);
    if (use > 0) {
      await addAlloc({
        lan,
        dueDate,
        allocDate: paymentDate,
        amount: use,
        chargeType: "Interest (Overdue)",
        paymentId,
      });
      ri -= use;
      remaining -= use;
    }
  }

  const newRemaining = rp + ri;
  await queryDB(
    `UPDATE ${emiTable}
       SET remaining_interest = ?,
           remaining_principal = ?,
           remaining_emi = ?,
           remaining_amount = ?,
           payment_date = ?
     WHERE id = ?`,
    [ri, rp, newRemaining, newRemaining, paymentDate, emiRow.id]
  );

  return { allocated: 0, remaining };
}

async function sweepEmis({ emiTable, lan, paymentDate, paymentId, bucket, cutoffDateForInterest = null, remaining }) {
  if (remaining <= 0) return remaining;

  let where = `lan = ? AND (remaining_interest > 0 OR remaining_principal > 0)`;
  if (bucket === "interest" && cutoffDateForInterest) {
    where += ` AND due_date <= ? AND remaining_interest > 0`;
  }

  const params = bucket === "interest" && cutoffDateForInterest ? [lan, cutoffDateForInterest] : [lan];
  const emis = await queryDB(
    `SELECT * FROM ${emiTable}
     WHERE ${where}
     ORDER BY due_date ASC`,
    params
  );

  for (const emiRow of emis) {
    if (remaining <= 0) break;
    const res = await allocateOnOneEmi({
      emiTable,
      lan,
      emiRow,
      paymentDate,
      paymentId,
      bucket,
      remaining,
    });
    remaining = res.remaining;
  }
  return remaining;
}

const allocateForeclosure = async (lan, payment) => {
  const totalReceived = Number(payment.transfer_amount || 0);
  const paymentDate = payment.payment_date; // IMPORTANT: drive by Payment Date
  const paymentId = payment.payment_id;
  if (!paymentId) throw new Error("❌ payment_id is required");

  const { emiTable, loanTable } = detectTablesByLan(lan);

  await begin();
  try {
    // 1) Fetch FC breakup as-of Payment Date
    const fcRows = await queryDB(`CALL ${PROC_NAME}(?, ?)`, [lan, paymentDate]);
    const fc = Array.isArray(fcRows) ? (Array.isArray(fcRows[0]) ? fcRows[0][0] : fcRows[0]) : fcRows[0];
    if (!fc) throw new Error("❌ FC proc returned no row");

    const TRP = Number(fc.total_remaining_principal || 0);
    const TRI = Number(fc.total_remaining_interest || 0); // overdue only ≤ pay date
    const ACC = Number(fc.accrued_interest || 0);
    const FEE = Number(fc.foreclosure_fee || 0);
    const GST = Number(fc.foreclosure_tax || 0);
    const FC_TOTAL = Number(fc.total_fc_amount || 0);

    let remaining = totalReceived;

    // 2) Principal (all unpaid)
    remaining = await sweepEmis({
      emiTable,
      lan,
      paymentDate,
      paymentId,
      bucket: "principal",
      remaining,
    });

    // 3) Overdue interest (≤ payment date only)
    remaining = await sweepEmis({
      emiTable,
      lan,
      paymentDate,
      paymentId,
      bucket: "interest",
      cutoffDateForInterest: paymentDate,
      remaining,
    });

    // 4) Accrued Interest (from proc, single head)
    if (remaining > 0 && ACC > 0) {
      const use = Math.min(ACC, remaining);
      await addAlloc({
        lan,
        dueDate: null,
        allocDate: paymentDate,
        amount: use,
        chargeType: "Accrued Interest",
        paymentId,
        meta: { from_proc: true, computed: ACC },
      });
      remaining -= use;
    }

    // 5) FC Fee
    if (remaining > 0 && FEE > 0) {
      const use = Math.min(FEE, remaining);
      await addAlloc({
        lan,
        dueDate: null,
        allocDate: paymentDate,
        amount: use,
        chargeType: "FC Fee",
        paymentId,
        meta: { from_proc: true, computed: FEE },
      });
      remaining -= use;
    }

    // 6) FC GST
    if (remaining > 0 && GST > 0) {
      const use = Math.min(GST, remaining);
      await addAlloc({
        lan,
        dueDate: null,
        allocDate: paymentDate,
        amount: use,
        chargeType: "FC GST",
        paymentId,
        meta: { from_proc: true, computed: GST },
      });
      remaining -= use;
    }

    // 7) Penal charges (if you have a table—edit query if different)
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
      await addAlloc({ lan, dueDate: null, allocDate: paymentDate, amount: use, chargeType: "Penal Charges", paymentId });
      remaining -= use;
      penalDue -= use;
    }

    // 8) NACH bounce charges
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
      await addAlloc({ lan, dueDate: null, allocDate: paymentDate, amount: use, chargeType: "NACH Charges", paymentId });
      remaining -= use;
      nachDue -= use;
    }

    // 9) Excess?
    if (remaining > 0) {
      await addAlloc({
        lan,
        dueDate: paymentDate,
        allocDate: paymentDate,
        amount: remaining,
        chargeType: "Excess Payment",
        paymentId,
      });
      remaining = 0;
    }

    // 10) Short? -> waive leftovers in same order
    async function headAllocated(head) {
      const [r] = await queryDB(
        `SELECT IFNULL(SUM(allocated_amount),0) AS amt
           FROM allocation
          WHERE lan = ? AND payment_id = ? AND charge_type = ?`,
        [lan, paymentId, head]
      );
      return Number(r?.amt || 0);
    }

    const [principalAllocRow] = await queryDB(
      `SELECT IFNULL(SUM(allocated_amount),0) AS amt
         FROM allocation
        WHERE lan = ? AND payment_id = ? AND charge_type = 'Principal'`,
      [lan, paymentId]
    );
    const principalAlloc = Number(principalAllocRow?.amt || 0);
    const interestAlloc = Number(await headAllocated("Interest (Overdue)"));
    const accAlloc = Number(await headAllocated("Accrued Interest"));
    const feeAlloc = Number(await headAllocated("FC Fee"));
    const gstAlloc = Number(await headAllocated("FC GST"));
    const penalAlloc = Number(await headAllocated("Penal Charges"));
    const nachAlloc = Number(await headAllocated("NACH Charges"));

    const principalLeft = Math.max(0, TRP - principalAlloc);
    const interestLeft  = Math.max(0, TRI - interestAlloc);
    const accLeft       = Math.max(0, ACC - accAlloc);
    const feeLeft       = Math.max(0, FEE - feeAlloc);
    const gstLeft       = Math.max(0, GST - gstAlloc);

    const shortExists =
      principalLeft + interestLeft + accLeft + feeLeft + gstLeft > 0;

    if (shortExists) {
      const waiverHeads = [
        { head: "Principal",           amt: principalLeft },
        { head: "Interest (Overdue)",  amt: interestLeft },
        { head: "Accrued Interest",    amt: accLeft },
        { head: "FC Fee",              amt: feeLeft },
        { head: "FC GST",              amt: gstLeft },
      ];
      for (const w of waiverHeads) {
        if (w.amt > 0) {
          await addAlloc({
            lan,
            dueDate: null,
            allocDate: paymentDate,
            amount: Number(w.amt.toFixed(2)),
            chargeType: `Waiver - ${w.head}`,
            paymentId,
          });
        }
      }
    }

    // 11) Close loan if nothing due (after allocation & waivers)
    const [pending] = await queryDB(
      `SELECT COUNT(*) AS cnt
         FROM ${emiTable}
        WHERE lan = ?
          AND (remaining_interest > 0 OR remaining_principal > 0)`,
      [lan]
    );
    if (pending.cnt === 0 && !shortExists) {
      await queryDB(`UPDATE ${loanTable} SET status = 'Fully Paid' WHERE lan = ?`, [lan]);
    }

    await commit();
    return {
      ok: true,
      message: "✅ Foreclosure allocation completed",
      fc_breakup: { TRP, TRI, ACC, FEE, GST, FC_TOTAL },
      short_waiver_done: shortExists,
    };
  } catch (e) {
    await rollback();
    throw e;
  }
};

module.exports = allocateForeclosure;