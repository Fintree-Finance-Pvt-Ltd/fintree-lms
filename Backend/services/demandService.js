
///////////////////////////////////////////////// NEW CODE FOR today date +30 ///////////////
const db = require("../config/db");
const {
  allocateSupplyChainRepayment,
} = require("../services/supplyChainAllocation.service");

/* ================= SAFE DATE HELPERS ================= */

function parseDateOnly(d) {
  if (!d) return null;

  if (d instanceof Date) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  const [y, m, day] = String(d).slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, day);
}

function toYMD(d) {
  const dt = parseDateOnly(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(date, days) {
  const d = parseDateOnly(date);
  d.setDate(d.getDate() + days);
  return d;
}

/* ================= DAILY DEMAND ENGINE ================= */

const generateDailySupplyChainDemand = async (
  conn,
  invoice,
  fromDateOrTillDate,
  maybeTillDate = null,
  seedData = {}
) => {
  const ctx = `[generateDailySupplyChainDemand][invoice=${invoice?.invoice_number}]`;

  try {
    const {
      partner_loan_id,
      lan,
      invoice_number,
      roi_percentage,
      penal_rate,
      disbursement_amount,
      remaining_disbursement_amount,
      disbursement_date,
    } = invoice;

    const principal = Number(remaining_disbursement_amount);
    const roi = Number(roi_percentage) / 100;
    const penalRoi = Number(penal_rate || 0) / 100;

    const dailyInterest = +(principal * roi / 365).toFixed(6);

    /* ===== PREFIX RULES ===== */

    const disbDate = parseDateOnly(disbursement_date);

    let calculatedStartDate;
    let calculatedDueDate;

    if (lan.startsWith("MFL")) {
      calculatedStartDate = disbDate;
      calculatedDueDate = addDays(disbDate, 91);
    } else if (lan.startsWith("FFPL") || lan.startsWith("KITE")) {
      calculatedStartDate = addDays(disbDate, 1);
      calculatedDueDate = addDays(disbDate, 90);
    } else {
      calculatedStartDate = addDays(disbDate, 1);
      calculatedDueDate = addDays(disbDate, 90);
    }

    let startDate;
    let endDate;

    if (!maybeTillDate) {
      startDate = calculatedStartDate;
      endDate = parseDateOnly(fromDateOrTillDate);
    } else {
      startDate = parseDateOnly(fromDateOrTillDate);
      endDate = parseDateOnly(maybeTillDate);
    }

    const dueDate = calculatedDueDate;

    let cumulativeInterest = Number(seedData.cumulativeInterest || 0);
    let cumulativePenalInterest = Number(
      seedData.cumulativePenalInterest || 0
    );
    let diffDays = Number(seedData.diffDays || 0);

    const rows = [];

    for (
      let current = parseDateOnly(startDate);
      current <= endDate;
      current = addDays(current, 1)
    ) {
      diffDays++;

      cumulativeInterest = +(
        cumulativeInterest + dailyInterest
      ).toFixed(6);

      const overdueAmount = +(principal + cumulativeInterest).toFixed(6);

      let penalInterest = 0;

      if (current > dueDate) {
        penalInterest = +(overdueAmount * penalRoi / 365).toFixed(6);

        cumulativePenalInterest = +(
          cumulativePenalInterest + penalInterest
        ).toFixed(6);
      }

      const totalAmountDemand = +(
        overdueAmount + cumulativePenalInterest
      ).toFixed(4);

      rows.push([
        partner_loan_id,
        lan,
        invoice_number,
        toYMD(dueDate),
        roi_percentage,
        penal_rate || 0,
        disbursement_amount,
        principal,
        toYMD(disbursement_date),
        toYMD(current),
        diffDays,
        cumulativeInterest,
        1,
        dailyInterest,
        overdueAmount,
        penalInterest,
        cumulativePenalInterest,
        totalAmountDemand,
        totalAmountDemand,
        principal,
        cumulativeInterest,
        cumulativePenalInterest,
      ]);
    }

    if (!rows.length) return;

    await conn.query(
      `INSERT INTO supply_chain_daily_demand (
        partner_loan_id,
        lan,
        invoice_number,
        invoice_due_date,
        interest_rate,
        penal_rate,
        disbursement_amount,
        remaining_disbursement_amount,
        disbursement_date,
        daily_date,
        diff_days,
        cumulate_interest_demand,
        daily_days,
        daily_interest_demand,
        overdue_amount_demand,
        penal_interest_demand,
        cumelate_penal_interest_demand,
        total_amount_demand,
        total_remaining,
        remaining_principal,
        remaining_interest,
        remaining_penal_interest
      ) VALUES ?
      ON DUPLICATE KEY UPDATE
        diff_days = VALUES(diff_days),
        cumulate_interest_demand = VALUES(cumulate_interest_demand),
        updated_at = CURRENT_TIMESTAMP`,
      [rows]
    );

    console.log(
      `${ctx} ✅ Demand generated from ${toYMD(startDate)} till ${toYMD(endDate)}`
    );
  } catch (err) {
    console.error(`${ctx} ❌ Failed`, err);
    throw err;
  }
};

/* ================= MAIN WRAPPER ================= */

const generateDemandFromInvoiceDisbursement = async (invoiceNumber) => {
  const ctx = `[generateDemandFromInvoiceDisbursement][invoice=${invoiceNumber}]`;
  const conn = db.promise();

  try {
    console.log(`${ctx} ▶ Start`);

    const [[invoice]] = await conn.query(
      `SELECT *
       FROM invoice_disbursements
       WHERE invoice_number = ?`,
      [invoiceNumber]
    );

    if (!invoice) throw new Error("Invoice not found");

    const [[sanction]] = await conn.query(
      `SELECT interest_rate, penal_rate
       FROM supply_chain_sanctions
       WHERE partner_loan_id = ?
       AND lan = ?`,
      [invoice.partner_loan_id, invoice.lan]
    );

    if (!sanction) throw new Error("Sanction not found");

    invoice.penal_rate = sanction.penal_rate || 0;

    const disbDate = parseDateOnly(invoice.disbursement_date);

    let startDate;
    let dueDate;

    if (invoice.lan.startsWith("MFL")) {
      startDate = disbDate;
      dueDate = addDays(disbDate, 91);
    } else {
      startDate = addDays(disbDate, 1);
      dueDate = addDays(disbDate, 90);
    }

    const generationEndDate = addDays(dueDate, 30);

    const [[lastRow]] = await conn.query(
      `SELECT MAX(daily_date) last_date
       FROM supply_chain_daily_demand
       WHERE invoice_number = ?`,
      [invoice.invoice_number]
    );

    let fromDate;
    let tillDate;

    if (!lastRow.last_date) {
      fromDate = startDate;
      tillDate = generationEndDate;
    } else {
      const nextDate = addDays(lastRow.last_date, 1);

      if (nextDate > generationEndDate) {
        console.log(`${ctx} No pending rows`);
        return { success: true };
      }

      fromDate = nextDate;
      tillDate = nextDate;
    }

    await generateDailySupplyChainDemand(
      conn,
      invoice,
      fromDate,
      tillDate
    );

    console.log(`${ctx} ✅ Demand Generated`);

    /* =====================================================
       ALLOCATION CALL (ONLY IF EXCESS PAYMENT EXISTS)
    ===================================================== */
    const [excessRows] = await conn.query(
      `SELECT
         lan,
         collection_date,
         collection_utr,
         excess_payment AS collection_amount
       FROM supply_chain_allocation
       WHERE lan = ?
         AND excess_payment > 0`,
      [invoice.lan]
    );

    if (!excessRows.length) {
      console.log(`${ctx} ℹ No excess payment found`);
      return { success: true };
    }

    console.log(`${ctx} 🔄 Allocating ${excessRows.length} excess payments`);

    const invDisbDate = toYMD(new Date(invoice.disbursement_date));

    for (const r of excessRows) {
      const excessDate = toYMD(new Date(r.collection_date));

      // allocate only on a date where demand exists
      const effectiveDate = invDisbDate > excessDate ? invDisbDate : excessDate;

      await allocateSupplyChainRepayment(db, {
        lan: r.lan,
        collection_date: effectiveDate,
        collection_utr: r.collection_utr,
        collection_amount: r.collection_amount,
      });
    }

    console.log(`${ctx} ✅ Allocation completed`);
    return { success: true };
  } catch (err) {
    console.error(`${ctx} ❌ Failed`, err);
    throw err;
  }
};

module.exports = {
  generateDailySupplyChainDemand,
  generateDemandFromInvoiceDisbursement,
};
