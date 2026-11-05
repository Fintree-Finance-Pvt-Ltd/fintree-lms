
const db = require("../../config/db");

// Use integer paise while allocating; convert to decimal strings at SQL boundaries.
const toPaise = (value, field) => {
  const text = String(value ?? "").trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) {
    throw new Error(`Invalid ${field}: a non-negative amount with at most 2 decimals is required`);
  }
  const [whole, fraction = ""] = text.split(".");
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(amount)) throw new Error(`Invalid ${field}: amount is too large`);
  return amount;
};
const money = (paise) => `${Math.floor(paise / 100)}.${String(paise % 100).padStart(2, "0")}`;

/** Oldest EMI first; within each EMI, interest first and principal second. */
const allocateArthavidhiCapital = async (lan, payment) => {
  if (typeof lan !== "string" || !lan.trim()) throw new Error("lan is required");
  const cleanLan = lan.trim();
  const paymentId = payment?.payment_id;
  if (paymentId === null || paymentId === undefined || !String(paymentId).trim()) {
    throw new Error("payment_id is required");
  }
  const total = toPaise(payment?.transfer_amount, "transfer_amount");
  if (total <= 0) throw new Error("transfer_amount must be greater than zero");

  const paymentDate = String(payment?.payment_date ?? "").trim();
  const parsedDate = new Date(`${paymentDate}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(paymentDate) ||
    Number.isNaN(parsedDate.getTime()) ||
    parsedDate.toISOString().slice(0, 10) !== paymentDate
  ) {
    throw new Error("payment_date must be a valid YYYY-MM-DD date");
  }

  const emiTable = "manual_rps_arthavidhi_capital";
  const loanTable = "loan_booking_arthavidhi";
  const connection = await db.promise().getConnection();
  let transactionOpen = false;
  let result;

  try {
    await connection.beginTransaction();
    transactionOpen = true;

    // Serialize allocations for this loan across callers using this allocator.
    const [loans] = await connection.query(
      `SELECT lan FROM ${loanTable} WHERE lan = ? FOR UPDATE`, [cleanLan],
    );
    if (!loans.length) throw new Error("Arthavidhi Capital loan not found");

    const [existing] = await connection.query(
      `SELECT allocated_amount FROM allocation
       WHERE lan = ? AND payment_id = ? FOR UPDATE`, [cleanLan, paymentId],
    );

    if (existing.length) {
      const previousTotal = existing.reduce((sum, row) => {
        const next = sum + toPaise(row.allocated_amount, "existing allocated_amount");
        if (!Number.isSafeInteger(next)) throw new Error("Existing allocation total is too large");
        return next;
      }, 0);
      if (previousTotal !== total) {
        throw new Error("payment_id already has allocations with a different total; reconcile before retrying");
      }
      result = {
        success: true, already_allocated: true, lan: cleanLan,
        payment_id: paymentId, allocated_amount: total / 100, remaining_amount: 0,
      };
    } else {
      // Do not close a loan without a populated, valid repayment schedule.
      const [rows] = await connection.query(
        `SELECT id, due_date, emi, remaining_interest, remaining_principal
         FROM ${emiTable} WHERE lan = ? ORDER BY due_date ASC, id ASC FOR UPDATE`,
        [cleanLan],
      );
      if (!rows.length) throw new Error("Arthavidhi Capital RPS not found");

      const installments = rows.map((row) => ({
        ...row,
        originalEmi: toPaise(row.emi, "RPS emi"),
        interestDue: toPaise(row.remaining_interest, "RPS remaining_interest"),
        principalDue: toPaise(row.remaining_principal, "RPS remaining_principal"),
      }));
      let remaining = total;

      const insertAllocation = async (dueDate, amount, chargeType) => {
        await connection.query(
          `INSERT INTO allocation
           (lan, due_date, allocation_date, allocated_amount, charge_type, payment_id)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [cleanLan, dueDate, paymentDate, money(amount), chargeType, paymentId],
        );
      };

      for (const emi of installments) {
        if (remaining <= 0) break;
        if (emi.interestDue + emi.principalDue === 0) continue;

        if (emi.interestDue > 0) {
          const allocated = Math.min(emi.interestDue, remaining);
          remaining -= allocated;
          emi.interestDue -= allocated;
          await insertAllocation(emi.due_date, allocated, "Interest");
        }
        if (remaining > 0 && emi.interestDue === 0 && emi.principalDue > 0) {
          const allocated = Math.min(emi.principalDue, remaining);
          remaining -= allocated;
          emi.principalDue -= allocated;
          await insertAllocation(emi.due_date, allocated, "Principal");
        }

        const newRemaining = emi.interestDue + emi.principalDue;
        const status = newRemaining === 0 ? "Paid"
          : newRemaining < emi.originalEmi ? "Partial" : "Pending";
        const [update] = await connection.query(
          `UPDATE ${emiTable}
           SET remaining_interest = ?, remaining_principal = ?, remaining_emi = ?,
               remaining_amount = ?, payment_date = ?, status = ?
           WHERE id = ? AND lan = ?`,
          [money(emi.interestDue), money(emi.principalDue), money(newRemaining),
          money(newRemaining), paymentDate, status, emi.id, cleanLan],
        );
        if (Number(update.affectedRows) !== 1) throw new Error("RPS installment update failed");
      }

      if (remaining > 0) {
        await insertAllocation(paymentDate, remaining, "Excess Payment");
        remaining = 0;
      }

      if (installments.every((emi) => emi.interestDue === 0 && emi.principalDue === 0)) {
        await connection.query(
          `UPDATE ${loanTable} SET status = 'Fully Paid' WHERE lan = ?`, [cleanLan],
        );
      }

      result = {
        success: true, lan: cleanLan, payment_id: paymentId,
        allocated_amount: total / 100, remaining_amount: remaining / 100,
      };
    }

    await connection.commit();
    transactionOpen = false;
  } catch (error) {
    if (transactionOpen) await connection.rollback().catch(() => { });
    throw error;
  } finally {
    connection.release();
  }

  // Refresh only this Arthavidhi loan; shared procedures may omit this product.
  try {
    await db.promise().query(`UPDATE manual_rps_arthavidhi_capital SET
      dpd=CASE WHEN COALESCE(remaining_principal,0)+COALESCE(remaining_interest,0)>0
        THEN GREATEST(DATEDIFF(CURDATE(),due_date),0) ELSE 0 END,
      status=CASE WHEN COALESCE(remaining_principal,0)+COALESCE(remaining_interest,0)=0 THEN 'Paid'
        WHEN COALESCE(remaining_principal,0)+COALESCE(remaining_interest,0)<emi THEN 'Part Paid'
        WHEN due_date<CURDATE() THEN 'Late' WHEN due_date=CURDATE() THEN 'Due' ELSE 'Not Set' END
      WHERE lan=?`, [cleanLan]);
    result.dpd_updated = true;
  } catch (error) {
    result.dpd_updated = false;
    result.message = "Payment is allocated; DPD refresh failed and must be retried separately";
    console.error("Arthavidhi Capital DPD refresh failed after allocation", {
      code: error.code || "DPD_REFRESH_FAILED",
    });
  }
  return result;
};

module.exports = allocateArthavidhiCapital;
