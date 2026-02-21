// function toYMD(d) {
//   return new Date(d).toISOString().split("T")[0];
// }

// /**
//  * Update existing daily demand rows from collection date onwards
//  * using the nearest available base row (<= collection date).
//  *
//  * ❌ No inserts
//  * ✅ Transaction-safe (uses passed connection)
//  */
// const updateDemandFromCollectionDate = async (
//   conn,
//   invoiceNumber,
//   collectionDate
// ) => {
//   if (!invoiceNumber) {
//     throw new Error("invoiceNumber is required");
//   }

//   /* 1️⃣ Fetch invoice */
//   const [[invoice]] = await conn.query(
//     `
//     SELECT
//       partner_loan_id,
//       lan,
//       invoice_due_date,
//       roi_percentage
//     FROM invoice_disbursements
//     WHERE invoice_number = ?
//     `,
//     [invoiceNumber]
//   );

//   if (!invoice) {
//     throw new Error(`Invoice not found: ${invoiceNumber}`);
//   }

//   /* 2️⃣ Fetch sanction */
//   const [[sanction]] = await conn.query(
//     `
//     SELECT interest_rate, penal_rate
//     FROM supply_chain_sanctions
//     WHERE partner_loan_id = ?
//       AND lan = ?
//     `,
//     [invoice.partner_loan_id, invoice.lan]
//   );

//   if (!sanction) {
//     throw new Error(`Sanction not found for lan ${invoice.lan}`);
//   }

//   const roi = Number(invoice.roi_percentage) / 100;
//   const penalRoi = Number(sanction.penal_rate || 0) / 100;

//   /* 3️⃣ Find BASE ROW (<= collection date) */
//   const [[baseRow]] = await conn.query(
//     `
//     SELECT *
//     FROM supply_chain_daily_demand
//     WHERE invoice_number = ?
//       AND daily_date <= ?
//     ORDER BY daily_date DESC
//     LIMIT 1
//     `,
//     [invoiceNumber, collectionDate]
//   );

//   if (!baseRow) {
//     throw new Error(
//       `No daily demand exists on or before ${collectionDate} for invoice ${invoiceNumber}`
//     );
//   }

//   const principal = Number(baseRow.remaining_principal);

//   if (principal <= 0) {
//     console.log(
//       `ℹ️ No remaining principal for invoice ${invoiceNumber}, skipping regeneration`
//     );
//     return;
//   }

//   const dailyInterest = +(principal * roi / 365).toFixed(6);

//   let cumInterest =
//     Number(baseRow.cumulate_interest_demand) || 0;
//   let cumPenal =
//     Number(baseRow.cumelate_penal_interest_demand) || 0;
//   let diffDays =
//     Number(baseRow.diff_days) || 0;

//   const dueDate = new Date(invoice.invoice_due_date);
//   const today = new Date(toYMD(new Date()));

//   /* 4️⃣ Start from NEXT day after base row */
//   let d = new Date(baseRow.daily_date);
//   d.setDate(d.getDate() + 1);

//   while (d <= today) {
//     diffDays++;
//     cumInterest += dailyInterest;

//     let penal = 0;
//     if (d > dueDate) {
//       penal = +(
//         (principal + cumInterest) * penalRoi / 365
//       ).toFixed(6);
//       cumPenal += penal;
//     }

//     const totalRemaining = +(
//       principal + cumInterest + cumPenal
//     ).toFixed(4);

//     const [result] = await conn.query(
//       `
//       UPDATE supply_chain_daily_demand
//       SET
//         diff_days = ?,
//         cumulate_interest_demand = ?,
//         daily_interest_demand = ?,
//         penal_interest_demand = ?,
//         cumelate_penal_interest_demand = ?,
//         total_amount_demand = ?,
//         total_remaining = ?,
//         remaining_interest = ?,
//         remaining_penal_interest = ?,
//         updated_at = CURRENT_TIMESTAMP
//       WHERE invoice_number = ?
//         AND daily_date = ?
//       `,
//       [
//         diffDays,
//         +cumInterest.toFixed(6),
//         dailyInterest,
//         penal,
//         +cumPenal.toFixed(6),
//         totalRemaining,
//         totalRemaining,
//         +cumInterest.toFixed(6),
//         +cumPenal.toFixed(6),
//         invoiceNumber,
//         toYMD(d),
//       ]
//     );

//     /* stop if future row does not exist */
//     if (result.affectedRows === 0) {
//       break;
//     }

//     d.setDate(d.getDate() + 1);
//   }

//   console.log(
//     `✅ Demand regenerated from ${toYMD(baseRow.daily_date)} onwards for invoice ${invoiceNumber}`
//   );
// };

// module.exports = { updateDemandFromCollectionDate };


////////////////////
function toYMD(d) {
  return new Date(d).toISOString().split("T")[0];
}

const updateDemandFromCollectionDate = async (
  conn,
  invoiceNumber,
  collectionDate
) => {
  const collectionYMD = toYMD(collectionDate);

  /* 1️⃣ Invoice */
  const [[invoice]] = await conn.query(
    `
    SELECT partner_loan_id, lan, invoice_due_date, roi_percentage
    FROM invoice_disbursements
    WHERE invoice_number = ?
    `,
    [invoiceNumber]
  );

  if (!invoice) throw new Error("Invoice not found");

  /* 2️⃣ Sanction */
  const [[sanction]] = await conn.query(
    `
    SELECT penal_rate
    FROM supply_chain_sanctions
    WHERE partner_loan_id = ?
      AND lan = ?
    `,
    [invoice.partner_loan_id, invoice.lan]
  );

  const roi = Number(invoice.roi_percentage) / 100;
  const penalRoi = Number(sanction.penal_rate || 0) / 100;

  const dueDate = new Date(toYMD(invoice.invoice_due_date));
  const today = new Date(toYMD(new Date()));

  /* 3️⃣ BASE = COLLECTION DATE ROW ONLY */
  const [[baseRow]] = await conn.query(
    `
    SELECT *
    FROM supply_chain_daily_demand
    WHERE invoice_number = ?
      AND daily_date = ?
    `,
    [invoiceNumber, collectionYMD]
  );

  if (!baseRow) {
    throw new Error("Collection date row missing");
  }

  const principal = Number(baseRow.remaining_principal);
  let cumInterest = Number(baseRow.remaining_interest);   // ✅ RESET BASE
  let cumPenal = Number(baseRow.remaining_penal_interest);

  const dailyInterest =
    principal > 0 ? +(principal * roi / 365).toFixed(6) : 0;

  let diffDays = Number(baseRow.diff_days || 0);

  /* 4️⃣ Update COLLECTION DATE ROW */
  const overdueToday = +(principal + cumInterest).toFixed(6);

  const penalToday =
    new Date(collectionYMD) > dueDate
      ? +(((overdueToday) * penalRoi) / 365).toFixed(6)
      : 0;

  cumPenal = +(cumPenal + penalToday).toFixed(6);

  const totalToday = +(principal + cumInterest + cumPenal).toFixed(4);

  await conn.query(
    `
    UPDATE supply_chain_daily_demand
    SET
      daily_interest_demand = ?,
      cumulate_interest_demand = ?,
      overdue_amount_demand = ?,
      penal_interest_demand = ?,
      cumelate_penal_interest_demand = ?,
      total_amount_demand = ?,
      total_remaining = ?,
      remaining_interest = ?,
      remaining_penal_interest = ?
    WHERE invoice_number = ?
      AND daily_date = ?
    `,
    [
      dailyInterest,
      cumInterest,
      overdueToday,
      penalToday,
      cumPenal,
      totalToday,
      totalToday,
      cumInterest,
      cumPenal,
      invoiceNumber,
      collectionYMD,
    ]
  );

  /* 5️⃣ From NEXT DAY onwards */
  let d = new Date(collectionYMD);
  d.setDate(d.getDate() + 1);

  while (d <= today) {
    diffDays++;

    cumInterest = +(cumInterest + dailyInterest).toFixed(6);
    const overdue = +(principal + cumInterest).toFixed(6);

    const penal =
      d > dueDate
        ? +(((overdue) * penalRoi) / 365).toFixed(6)
        : 0;

    cumPenal = +(cumPenal + penal).toFixed(6);

    const total = +(principal + cumInterest + cumPenal).toFixed(4);

    const [res] = await conn.query(
      `
      UPDATE supply_chain_daily_demand
      SET
        diff_days = ?,
        daily_interest_demand = ?,
        cumulate_interest_demand = ?,
        overdue_amount_demand = ?,
        penal_interest_demand = ?,
        cumelate_penal_interest_demand = ?,
        total_amount_demand = ?,
        total_remaining = ?,
        remaining_interest = ?,
        remaining_penal_interest = ?
      WHERE invoice_number = ?
        AND daily_date = ?
      `,
      [
        diffDays,
        dailyInterest,
        cumInterest,
        overdue,
        penal,
        cumPenal,
        total,
        total,
        cumInterest,
        cumPenal,
        invoiceNumber,
        toYMD(d),
      ]
    );

    if (res.affectedRows === 0) break;
    d.setDate(d.getDate() + 1);
  }

  console.log(
    `✅ Interest + penal demand fixed from collection date ${collectionYMD}`
  );
};

module.exports = { updateDemandFromCollectionDate };