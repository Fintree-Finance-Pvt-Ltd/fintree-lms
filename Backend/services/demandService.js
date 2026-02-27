const db = require("../config/db"); 
const { allocateSupplyChainRepayment } = require("../services/supplyChainAllocation.service"); // Supply chain repayment allocation logic moved to separate service for better modularity and maintainability 
function toYMD(d) {
  return new Date(d).toISOString().split("T")[0];
}

/* =====================================================
   CORE: DAILY DEMAND GENERATOR
===================================================== */
// const generateDailySupplyChainDemand = async (
//   conn,
//   invoice,
//   tillDate
// ) => {
//   const {
//     partner_loan_id,
//     lan,
//     invoice_number,
//     invoice_due_date,
//     roi_percentage,
//     penal_rate,
//     disbursement_amount,
//     remaining_disbursement_amount,
//     disbursement_date
//   } = invoice;

//   const principal = Number(remaining_disbursement_amount);
//   const roi = Number(roi_percentage) / 100;
//   const penalRoi = Number(penal_rate || 0) / 100;

//   const dailyInterest = +(principal * roi / 365).toFixed(6);

//   const startDate = new Date(disbursement_date);
//   startDate.setDate(startDate.getDate() + 1);

//   const dueDate = new Date(invoice_due_date);
//   const endDate = new Date(tillDate);

//   let cumulativeInterest = 0;
//   let cumulativePenalInterest = 0;
//   let diffDays = 0;

//   const rows = [];

//   for (
//     let current = new Date(startDate);
//     current <= endDate;
//     current.setDate(current.getDate() + 1)
//   ) {
//     diffDays++;
//     cumulativeInterest += dailyInterest;

//     const overdueAmount = principal + cumulativeInterest;

//     let penalInterest = 0;
//     if (current > dueDate) {
//       penalInterest = +(
//         overdueAmount * penalRoi / 365
//       ).toFixed(6);
//       cumulativePenalInterest += penalInterest;
//     }

//     const totalAmountDemand = +(
//       overdueAmount + cumulativePenalInterest
//     ).toFixed(4);

//     rows.push([
//       partner_loan_id,
//       lan,
//       invoice_number,
//       invoice_due_date,
//       roi_percentage,
//       penal_rate || 0,
//       disbursement_amount,
// principal, // remaining_disbursement_amount
// disbursement_date,
//       toYMD(current),
//       diffDays,
//       +cumulativeInterest.toFixed(6),
//       1,
//       dailyInterest,
//       +overdueAmount.toFixed(6),
//       penalInterest,
//       +cumulativePenalInterest.toFixed(6),
//       totalAmountDemand,
//         // ✅ NEW FIELDS
//   totalAmountDemand,                 // total_remaining
//   principal,                         // remaining_principal
//   +cumulativeInterest.toFixed(6),    // remaining_interest
//   +cumulativePenalInterest.toFixed(6) // remaining_penal_interest
//     ]);
//   }

//   if (!rows.length) return;

//   await conn.query(
//     `INSERT INTO supply_chain_daily_demand (
//       partner_loan_id,
//       lan,
//       invoice_number,
//       invoice_due_date,
//       interest_rate,
//       penal_rate,
//       disbursement_amount,
//       remaining_disbursement_amount,
//       disbursement_date,
//       daily_date,
//       diff_days,
//       cumulate_interest_demand,
//       daily_days,
//       daily_interest_demand,
//       overdue_amount_demand,
//       penal_interest_demand,
//       cumelate_penal_interest_demand,
//       total_amount_demand,
//         -- ✅ NEW COLUMNS
//   total_remaining,
//   remaining_principal,
//   remaining_interest,
//   remaining_penal_interest
//     ) VALUES ?
//     ON DUPLICATE KEY UPDATE
//       diff_days = VALUES(diff_days),
//       cumulate_interest_demand = VALUES(cumulate_interest_demand),
//       daily_interest_demand = VALUES(daily_interest_demand),
//       overdue_amount_demand = VALUES(overdue_amount_demand),
//       penal_interest_demand = VALUES(penal_interest_demand),
//       cumelate_penal_interest_demand = VALUES(cumelate_penal_interest_demand),
//       total_amount_demand = VALUES(total_amount_demand),
//         -- ✅ NEW UPDATES
//   total_remaining = VALUES(total_remaining),
//   remaining_principal = VALUES(remaining_principal),
//   remaining_interest = VALUES(remaining_interest),
//   remaining_penal_interest = VALUES(remaining_penal_interest),
//       updated_at = CURRENT_TIMESTAMP`,
//     [rows]
//   );

//   console.log(
//     `✅ Daily demand generated till ${tillDate} for invoice ${invoice_number}`
//   );
// };


const generateDailySupplyChainDemand = async (conn, invoice, tillDate) => {
  const ctx = `[generateDailySupplyChainDemand][invoice=${invoice?.invoice_number}]`;

  try {
    const {
      partner_loan_id,
      lan,
      invoice_number,
      invoice_due_date,
      roi_percentage,
      penal_rate,
      disbursement_amount,
      remaining_disbursement_amount,
      disbursement_date
    } = invoice;

    const principal = Number(remaining_disbursement_amount);
    const roi = Number(roi_percentage) / 100;
    const penalRoi = Number(penal_rate || 0) / 100;

    const dailyInterest = +(principal * roi / 365).toFixed(6);

    const startDate = new Date(disbursement_date);
    startDate.setDate(startDate.getDate() + 1);

    const dueDate = new Date(invoice_due_date);
    const endDate = new Date(tillDate);

    let cumulativeInterest = 0;
    let cumulativePenalInterest = 0;
    let diffDays = 1;

    const rows = [];

    for (
      let current = new Date(startDate);
      current <= endDate;
      current.setDate(current.getDate() + 1)
    ) {
      diffDays++;
      cumulativeInterest += dailyInterest;

      const overdueAmount = principal + cumulativeInterest;

      let penalInterest = 0;
      if (current > dueDate) {
        penalInterest = +(overdueAmount * penalRoi / 365).toFixed(6);
        cumulativePenalInterest += penalInterest;
      }

      const totalAmountDemand = +(
        overdueAmount + cumulativePenalInterest
      ).toFixed(4);

      rows.push([
        partner_loan_id,
        lan,
        invoice_number,
        invoice_due_date,
        roi_percentage,
        penal_rate || 0,
        disbursement_amount,
        principal,
        disbursement_date,
        toYMD(current),
        diffDays,
        +cumulativeInterest.toFixed(6),
        1,
        dailyInterest,
        +overdueAmount.toFixed(6),
        penalInterest,
        +cumulativePenalInterest.toFixed(6),
        totalAmountDemand,
        totalAmountDemand,
        principal,
        +cumulativeInterest.toFixed(6),
        +cumulativePenalInterest.toFixed(6)
      ]);
    }

    if (!rows.length) {
      console.warn(`${ctx} No rows generated (date range issue?)`);
      return;
    }

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
        daily_interest_demand = VALUES(daily_interest_demand),
        overdue_amount_demand = VALUES(overdue_amount_demand),
        penal_interest_demand = VALUES(penal_interest_demand),
        cumelate_penal_interest_demand = VALUES(cumelate_penal_interest_demand),
        total_amount_demand = VALUES(total_amount_demand),
        total_remaining = VALUES(total_remaining),
        remaining_principal = VALUES(remaining_principal),
        remaining_interest = VALUES(remaining_interest),
        remaining_penal_interest = VALUES(remaining_penal_interest),
        updated_at = CURRENT_TIMESTAMP`,
      [rows]
    );

    console.log(`${ctx} ✅ Demand generated till ${tillDate}`);
  } catch (err) {
    console.error(`${ctx} ❌ Failed`, err);
    throw err; // VERY IMPORTANT
  }
};
/* =====================================================
   WRAPPER: FETCH FROM DB + ROI + PENAL FROM SANCTIONS
===================================================== */
// const generateDemandFromInvoiceDisbursement = async (
//   invoiceNumber
// ) => {
//   const conn = db.promise();

//   /* 1️⃣ Fetch invoice (NO penal_rate here) */
//   const [[invoice]] = await conn.query(
//     `SELECT
//        partner_loan_id,
//        lan,
//        invoice_number,
//        invoice_due_date,
//        roi_percentage,
//        disbursement_amount,
//        remaining_disbursement_amount,
//        disbursement_date
//      FROM invoice_disbursements
//      WHERE invoice_number = ?`,
//     [invoiceNumber]
//   );

//   if (!invoice) {
//     throw new Error("Invoice not found");
//   }

//   /* 2️⃣ Fetch sanction ROI + penal rate */
//   const [[sanction]] = await conn.query(
//     `SELECT
//        interest_rate,
//        penal_rate
//      FROM supply_chain_sanctions
//      WHERE partner_loan_id = ?
//        AND lan = ?`,
//     [invoice.partner_loan_id, invoice.lan]
//   );

//   if (!sanction) {
//     throw new Error("Sanction not found");
//   }

//   /* 3️⃣ ROI match validation */
//   if (
//     Number(invoice.roi_percentage) !==
//     Number(sanction.interest_rate)
//   ) {
//     throw new Error(
//       `ROI mismatch (invoice=${invoice.roi_percentage}, sanction=${sanction.interest_rate})`
//     );
//   }

//   /* 4️⃣ Inject penal rate from sanctions */
//   invoice.penal_rate = Number(sanction.penal_rate || 0);

//   /* 5️⃣ Generate daily demand */
//   const today = toYMD(new Date());

//   await generateDailySupplyChainDemand(
//     conn,
//     invoice,
//     today
//   );
// };


const generateDemandFromInvoiceDisbursement = async (invoiceNumber) => {
  const ctx = `[generateDemandFromInvoiceDisbursement][invoice=${invoiceNumber}]`;
  const conn = db.promise();

  try {
    console.log(`${ctx} ▶ Start`);

    const [[invoice]] = await conn.query(
      `SELECT
         partner_loan_id,
         lan,
         invoice_number,
         invoice_due_date,
         roi_percentage,
         disbursement_amount,
         remaining_disbursement_amount,
         disbursement_date
       FROM invoice_disbursements
       WHERE invoice_number = ?`,
      [invoiceNumber]
    );

    if (!invoice) {
      throw new Error("Invoice not found");
    }

    const [[sanction]] = await conn.query(
      `SELECT
         interest_rate,
         penal_rate
       FROM supply_chain_sanctions
       WHERE partner_loan_id = ?
         AND lan = ?`,
      [invoice.partner_loan_id, invoice.lan]
    );

    if (!sanction) {
      throw new Error("Sanction not found");
    }

    if (
      Number(invoice.roi_percentage) !==
      Number(sanction.interest_rate)
    ) {
      throw new Error(
        `ROI mismatch (invoice=${invoice.roi_percentage}, sanction=${sanction.interest_rate})`
      );
    }

    invoice.penal_rate = Number(sanction.penal_rate || 0);

    const today = toYMD(new Date());

     // 🔥 Generate Demand
    await generateDailySupplyChainDemand(conn, invoice, today);

    console.log(`${ctx} ✅ Demand Generated`);

    /* =====================================================
       🔥 ALLOCATION CALL (ONLY IF EXCESS PAYMENT EXISTS)
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

    for (const r of excessRows) {
      await allocateSupplyChainRepayment(db, {
        lan: r.lan,
        collection_date: r.collection_date,
        collection_utr: r.collection_utr,
        collection_amount: r.collection_amount
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
  generateDemandFromInvoiceDisbursement
};
