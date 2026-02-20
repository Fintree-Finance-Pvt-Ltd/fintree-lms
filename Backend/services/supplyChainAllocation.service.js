// // src/services/supplyChainAllocation.service.js


// async function allocateSupplyChainRepayment(db, repayment) {
//   const {
//     lan,
//     collection_date,
//     collection_utr,
//     collection_amount,
//   } = repayment;

//   let remainingAmount = Number(collection_amount);

//   const [invoices] = await db.promise().query(
//     `
//     SELECT id, invoice_number
//     FROM invoice_disbursements
//     WHERE lan = ?
//       AND status = 'Active'
//     ORDER BY disbursement_date ASC, invoice_number ASC
//     `,
//     [lan]
//   );

//   for (const inv of invoices) {
//     if (remainingAmount <= 0) break;

//     const [[demand]] = await db.promise().query(
//       `
//       SELECT *
//       FROM supply_chain_daily_demand
//       WHERE lan = ?
//         AND invoice_number = ?
//       `,
//       [lan, inv.invoice_number]
//     );

//     if (!demand) continue;

//     let allocPrincipal = 0;
//     let allocInterest = 0;
//     let allocPenal = 0;

//     if (demand.remaining_principal > 0 && remainingAmount > 0) {
//       allocPrincipal = Math.min(demand.remaining_principal, remainingAmount);
//       remainingAmount -= allocPrincipal;
//     }

//     if (demand.remaining_interest > 0 && remainingAmount > 0) {
//       allocInterest = Math.min(demand.remaining_interest, remainingAmount);
//       remainingAmount -= allocInterest;
//     }

//     if (demand.remaining_penal_interest > 0 && remainingAmount > 0) {
//       allocPenal = Math.min(demand.remaining_penal_interest, remainingAmount);
//       remainingAmount -= allocPenal;
//     }

//     if (allocPrincipal + allocInterest + allocPenal === 0) continue;

//     await db.promise().query(
//       `
//       INSERT INTO supply_chain_allocation (
//         lan, invoice_number, collection_date, collection_utr,
//         total_collected, allocated_principal,
//         allocated_interest, allocated_penal_interest
//       ) VALUES (?,?,?,?,?,?,?,?)
//       `,
//       [
//         lan,
//         inv.invoice_number,
//         collection_date,
//         collection_utr,
//         collection_amount,
//         allocPrincipal,
//         allocInterest,
//         allocPenal,
//       ]
//     );

//     const newPrincipal = demand.remaining_principal - allocPrincipal;
//     const newInterest = demand.remaining_interest - allocInterest;
//     const newPenal = demand.remaining_penal_interest - allocPenal;
//     const totalRemaining = newPrincipal + newInterest + newPenal;

//     const newRemainingDisbursement =
//       demand.remaining_disbursement_amount - allocPrincipal;

//     await db.promise().query(
//       `
//       UPDATE supply_chain_daily_demand
//       SET
//         remaining_principal = ?,
//         remaining_interest = ?,
//         remaining_penal_interest = ?,
//         total_remaining = ?,
//         remaining_disbursement_amount = ?,
//         collection_date = ?
//       WHERE id = ?
//       `,
//       [
//         newPrincipal,
//         newInterest,
//         newPenal,
//         totalRemaining,
//         newRemainingDisbursement,
//         collection_date,
//         demand.id,
//       ]
//     );

//     const invoiceStatus = totalRemaining === 0 ? "CLOSED" : "Active";

//     await db.promise().query(
//       `
//       UPDATE invoice_disbursements
//       SET status = ?
//       WHERE id = ?
//       `,
//       [invoiceStatus, inv.id]
//     );
//   }

//   if (remainingAmount > 0) {
//     await db.promise().query(
//       `
//       INSERT INTO supply_chain_allocation (
//         lan, invoice_number, collection_date, collection_utr,
//         total_collected, allocated_principal,
//         allocated_interest, allocated_penal_interest
//       ) VALUES (?,?,?,?,?,?,?,?)
//       `,
//       [lan, null, collection_date, collection_utr, remainingAmount, 0, 0, 0]
//     );
//   }
// }

// module.exports = {
//   allocateSupplyChainRepayment,
// };

///--------------------//

// src/services/supplyChainAllocation.service.js
//Sajag Jain// async function allocateSupplyChainRepayment(db, repayment) {
//   const {
//     lan,
//     collection_date,
//     collection_utr,
//     collection_amount,
//   } = repayment;

//   const conn = await db.promise().getConnection();

//   try {
//     await conn.beginTransaction();

//     let remainingAmount = Number(collection_amount);

//     const [invoices] = await conn.query(
//       `
//       SELECT id, invoice_number
//       FROM invoice_disbursements
//       WHERE lan = ?
//         AND status = 'Active'
//       ORDER BY disbursement_date ASC, invoice_number ASC
//       `,
//       [lan]
//     );

//     console.log(`📄 Found ${invoices.length} active invoices for ${lan}`);

//     for (const inv of invoices) {
//       if (remainingAmount <= 0) break;

//       const [demands] = await conn.query(
//         `
//         SELECT *
//         FROM supply_chain_daily_demand
//         WHERE lan = ?
//           AND invoice_number = ?
//         LIMIT 1
//         `,
//         [lan, inv.invoice_number]
//       );

//       if (demands.length === 0) {
//         console.warn(`⚠️ No demand for invoice ${inv.invoice_number}`);
//         continue;
//       }

//       const demand = demands[0];

//       let allocPrincipal = 0;
//       let allocInterest = 0;
//       let allocPenal = 0;

//       if (demand.remaining_principal > 0 && remainingAmount > 0) {
//         allocPrincipal = Math.min(demand.remaining_principal, remainingAmount);
//         remainingAmount -= allocPrincipal;
//       }

//       if (demand.remaining_interest > 0 && remainingAmount > 0) {
//         allocInterest = Math.min(demand.remaining_interest, remainingAmount);
//         remainingAmount -= allocInterest;
//       }

//       if (demand.remaining_penal_interest > 0 && remainingAmount > 0) {
//         allocPenal = Math.min(demand.remaining_penal_interest, remainingAmount);
//         remainingAmount -= allocPenal;
//       }

//       const allocatedTotal =
//         allocPrincipal + allocInterest + allocPenal;

//       if (allocatedTotal === 0) continue;

//       await conn.query(
//         `
//         INSERT INTO supply_chain_allocation (
//           lan,
//           invoice_number,
//           collection_date,
//           collection_utr,
//           total_collected,
//           allocated_principal,
//           allocated_interest,
//           allocated_penal_interest
//         ) VALUES (?,?,?,?,?,?,?,?)
//         `,
//         [
//           lan,
//           inv.invoice_number,
//           collection_date,
//           collection_utr,
//           allocatedTotal,
//           allocPrincipal,
//           allocInterest,
//           allocPenal,
//         ]
//       );

//       const newPrincipal =
//         demand.remaining_principal - allocPrincipal;
//       const newInterest =
//         demand.remaining_interest - allocInterest;
//       const newPenal =
//         demand.remaining_penal_interest - allocPenal;

//       const totalRemaining =
//         newPrincipal + newInterest + newPenal;

//       const newRemainingDisbursement = Math.max(
//         0,
//         demand.remaining_disbursement_amount - allocPrincipal
//       );

//       await conn.query(
//   `
//   UPDATE supply_chain_daily_demand
//   SET
//     remaining_principal = GREATEST(remaining_principal - ?, 0),

//     total_remaining =
//       GREATEST(remaining_principal - ?, 0)
//       + remaining_interest
//       + remaining_penal_interest,

//     remaining_disbursement_amount =
//       GREATEST(remaining_disbursement_amount - ?, 0),

//     -- ✅ set collection_date ONLY ONCE
//     collection_date =
//       CASE
//         WHEN collection_date IS NULL THEN ?
//         ELSE collection_date
//       END
//   WHERE lan = ?
//     AND invoice_number = ?
//   `,
//   [
//     allocPrincipal,   // principal reduction
//     allocPrincipal,   // used again for total_remaining
//     allocPrincipal,   // disbursement reduction
//     collection_date,  // set only if NULL
//     lan,
//     inv.invoice_number,
//   ]
// );

//       // ✅ CHECK INVOICE STATUS (DATE-WISE)
//       const [pending] = await conn.query(
//         `
//         SELECT 1
//         FROM supply_chain_daily_demand d
//         WHERE d.lan = ?
//           AND d.invoice_number = ?
//           AND d.disbursement_date <= ?
//           AND (
//             d.remaining_principal > 0
//             OR d.remaining_interest > 0
//             OR d.remaining_penal_interest > 0
//           )
//         LIMIT 1
//         `,
//         [lan, inv.invoice_number, inv.disbursement_date]
//       );

//       const invoiceStatus = pending.length === 0 ? "CLOSED" : "Active";

//       await conn.query(
//         `
//         UPDATE invoice_disbursements
//         SET status = ?
//         WHERE id = ?
//         `,
//         [invoiceStatus, inv.id]
//       );
//     }

//     // Excess amount
//     if (remainingAmount > 0) {
//       await conn.query(
//         `
//         INSERT INTO supply_chain_allocation (
//           lan,
//           invoice_number,
//           collection_date,
//           collection_utr,
//           total_collected,
//           allocated_principal,
//           allocated_interest,
//           allocated_penal_interest
//         ) VALUES (?,?,?,?,?,?,?,?)
//         `,
//         [lan, null, collection_date, collection_utr, remainingAmount, 0, 0, 0]
//       );
//     }

//     await conn.commit();
//     console.log("✅ Allocation completed for", lan);
//   } catch (err) {
//     await conn.rollback();
//     console.error("❌ Allocation failed:", err);
//     throw err;
//   } finally {
//     conn.release();
//   }
// }

// module.exports = { allocateSupplyChainRepayment };


//////////////////////// FINAL CODE FOR DEMAND CALCULATION WITH NEW FIELDS (total_remaining, remaining_principal, remaining_interest, remaining_penal_interest) ////////////////////////
// const {
//     generateDailySupplyChainDemand,
// } = require("../services/supplyChain/updateDemandFromCollectionDate");

// async function allocateSupplyChainRepayment(db, repayment) {
//     const {
//         lan,
//         collection_date,
//         collection_utr,
//         collection_amount,
//     } = repayment;

//     const conn = await db.promise().getConnection();

//     try {
//         await conn.beginTransaction();

//         let remainingAmount = Number(collection_amount);

//         /* 1️⃣ Get active invoices FIFO */
//         const [invoices] = await conn.query(
//             `
//       SELECT id, invoice_number, disbursement_date
//       FROM invoice_disbursements
//       WHERE lan = ?
//         AND status = 'Active'
//       ORDER BY disbursement_date ASC, invoice_number ASC
//       `,
//             [lan]
//         );

//         for (const inv of invoices) {
//             if (remainingAmount <= 0) break;

//             /* 2️⃣ Get oldest unpaid daily demand (ROW LEVEL) */
//             const [demands] = await conn.query(
//                 `
//         SELECT *
//         FROM supply_chain_daily_demand
//         WHERE lan = ?
//           AND invoice_number = ?
//           AND remaining_principal > 0
//         ORDER BY daily_date ASC
//         LIMIT 1
//         FOR UPDATE
//         `,
//                 [lan, inv.invoice_number]
//             );

//             if (demands.length === 0) continue;

//             const demand = demands[0];

//             /* 3️⃣ Allocate principal first */
//             const allocPrincipal = Math.min(
//                 demand.remaining_principal,
//                 remainingAmount
//             );

//             if (allocPrincipal <= 0) continue;

//             remainingAmount -= allocPrincipal;

//             /* 4️⃣ Allocation entry */
//             await conn.query(
//                 `
//         INSERT INTO supply_chain_allocation (
//           lan,
//           invoice_number,
//           collection_date,
//           collection_utr,
//           total_collected,
//           allocated_principal,
//           allocated_interest,
//           allocated_penal_interest
//         ) VALUES (?,?,?,?,?,?,?,?)
//         `,
//                 [
//                     lan,
//                     inv.invoice_number,
//                     collection_date,
//                     collection_utr,
//                     allocPrincipal,
//                     allocPrincipal,
//                     0,
//                     0,
//                 ]
//             );

//             /* 5️⃣ UPDATE DAILY DEMAND (FINAL FIX) */
//             await conn.query(
//                 `
//         UPDATE supply_chain_daily_demand
//         SET
//           remaining_principal =
//             GREATEST(remaining_principal - ?, 0),

//           remaining_disbursement_amount =
//             GREATEST(remaining_disbursement_amount - ?, 0),

//           total_remaining =
//             GREATEST(remaining_principal - ?, 0)
//             + remaining_interest
//             + remaining_penal_interest,

//           collection_date =
//             CASE
//               WHEN collection_date IS NULL THEN ?
//               ELSE collection_date
//             END
//  WHERE lan = ?
//     AND invoice_number = ?
//         `,
//                 [
//                     allocPrincipal,
//                     allocPrincipal,
//                     allocPrincipal,
//                     collection_date,
//                     lan,
//                     inv.invoice_number,
//                 ]
//             );

//             /* 6️⃣ Check if invoice is fully closed */
//             const [pending] = await conn.query(
//                 `
//         SELECT 1
//         FROM supply_chain_daily_demand
//         WHERE invoice_number = ?
//           AND (
//             remaining_principal > 0
//             OR remaining_interest > 0
//             OR remaining_penal_interest > 0
//           )
//         LIMIT 1
//         `,
//                 [inv.invoice_number]
//             );

//             if (pending.length === 0) {
//                 await conn.query(
//                     `
//           UPDATE invoice_disbursements
//           SET status = 'CLOSED'
//           WHERE id = ?
//           `,
//                     [inv.id]
//                 );
//             }
//         }

//         /* 7️⃣ Excess amount handling */
//         if (remainingAmount > 0) {
//             await conn.query(
//                 `
//         INSERT INTO supply_chain_allocation (
//           lan,
//           invoice_number,
//           collection_date,
//           collection_utr,
//           total_collected,
//           allocated_principal,
//           allocated_interest,
//           allocated_penal_interest
//         ) VALUES (?,?,?,?,?,?,?,?)
//         `,
//                 [lan, null, collection_date, collection_utr, remainingAmount, 0, 0, 0]
//             );
//         }
//         /* 🔥 8️⃣ FINAL HEALING UPDATE (THIS IS WHAT YOU ASKED FOR) */
//         await conn.query(
//             `
//       UPDATE supply_chain_daily_demand
//       SET total_remaining =
//         remaining_principal
//         + remaining_interest
//         + remaining_penal_interest
//       WHERE lan = ?
//       `,
//             [lan]
//         );

//         /* B) Update sanction limits */
//         await conn.query(
//             `
//   UPDATE supply_chain_sanctions s
//   JOIN (
//     SELECT
//       d.lan,
//       COALESCE(SUM(d.remaining_disbursement_amount), 0) AS total_remaining_disb,
//       COALESCE(SUM(a.allocated_principal), 0) AS total_alloc_principal
//     FROM supply_chain_daily_demand d
//     LEFT JOIN supply_chain_allocation a
//       ON a.lan = d.lan
//     WHERE d.lan = ?
//   ) x ON x.lan = s.lan
//   SET
//     s.utilized_sanction_limit =
//       GREATEST(s.utilized_sanction_limit - x.total_remaining_disb, 0),

//     s.unutilization_sanction_limit =
//       s.unutilization_sanction_limit + x.total_alloc_principal
//   `,
//             [lan]
//         );


//          /* 🔁 9️⃣ Re-generate demand ONLY for invoices affected */
//     for (const invoiceNo of touchedInvoices) {
//       await updateDemandFromCollectionDate(
//         conn,            // ✅ same transaction
//         invoiceNo,       // ✅ correct invoice number
//         collection_date  // ✅ collection date
//       );
//     }


//         await conn.commit();
//         console.log(`✅ Allocation completed for ${lan}`);
//     } catch (err) {
//         await conn.rollback();
//         console.error("❌ Allocation failed:", err);
//         throw err;
//     } finally {
//         conn.release();
//     }
// }

// module.exports = { allocateSupplyChainRepayment };




///////////////////// NEW this is Final ////

const {
  updateDemandFromCollectionDate,
} = require("../services/supplyChain/updateDemandFromCollectionDate");

async function allocateSupplyChainRepayment(db, repayment) {
  const {
    lan,
    collection_date,
    collection_utr,
    collection_amount,
  } = repayment;

  const conn = await db.promise().getConnection();

  try {
    await conn.beginTransaction();

    let remainingAmount = Number(collection_amount);
    const affectedInvoices = new Set();

    /* 1️⃣ Get active invoices FIFO */
    const [invoices] = await conn.query(
      `
      SELECT id, invoice_number
      FROM invoice_disbursements
      WHERE lan = ?
        AND status = 'Active'
      ORDER BY disbursement_date ASC, invoice_number ASC
      `,
      [lan]
    );

    for (const inv of invoices) {
      if (remainingAmount <= 0) break;

      /* 2️⃣ Oldest unpaid demand row */
      const [[demand]] = await conn.query(
        `
        SELECT *
        FROM supply_chain_daily_demand
        WHERE lan = ?
          AND invoice_number = ?
          AND remaining_principal > 0
        ORDER BY daily_date ASC
        LIMIT 1
        FOR UPDATE
        `,
        [lan, inv.invoice_number]
      );

      if (!demand) continue;

      const allocPrincipal = Math.min(
        Number(demand.remaining_principal),
        remainingAmount
      );

      if (allocPrincipal <= 0) continue;

      remainingAmount -= allocPrincipal;
      affectedInvoices.add(inv.invoice_number);

      /* 3️⃣ Allocation entry */
      await conn.query(
        `
        INSERT INTO supply_chain_allocation (
          lan,
          invoice_number,
          collection_date,
          collection_utr,
          total_collected,
          allocated_principal,
          allocated_interest,
          allocated_penal_interest
        ) VALUES (?,?,?,?,?,?,?,?)
        `,
        [
          lan,
          inv.invoice_number,
          collection_date,
          collection_utr,
          allocPrincipal,
          allocPrincipal,
          0,
          0,
        ]
      );

      /* 4️⃣ Reduce principal */
      await conn.query(
        `
        UPDATE supply_chain_daily_demand
        SET
          remaining_principal =
            GREATEST(remaining_principal - ?, 0),
          remaining_disbursement_amount =
            GREATEST(remaining_disbursement_amount - ?, 0),
          total_remaining =
            GREATEST(remaining_principal - ?, 0)
            + remaining_interest
            + remaining_penal_interest,
          collection_date =
            COALESCE(collection_date, ?)
        WHERE lan = ?
          AND invoice_number = ?
        `,
        [
          allocPrincipal,
          allocPrincipal,
          allocPrincipal,
          collection_date,
          lan,
          inv.invoice_number,
        ]
      );
    }

    /* 5️⃣ Excess handling */
    if (remainingAmount > 0) {
      await conn.query(
        `
        INSERT INTO supply_chain_allocation (
          lan,
          invoice_number,
          collection_date,
          collection_utr,
          total_collected,
          allocated_principal,
          allocated_interest,
          allocated_penal_interest
        ) VALUES (?,?,?,?,?,?,?,?)
        `,
        [lan, null, collection_date, collection_utr, remainingAmount, 0, 0, 0]
      );
    }

    /* 6️⃣ Heal totals */
    await conn.query(
      `
      UPDATE supply_chain_daily_demand
      SET total_remaining =
        remaining_principal
        + remaining_interest
        + remaining_penal_interest
      WHERE lan = ?
      `,
      [lan]
    );

    /* 7️⃣ SANCTION UPDATE — COLLATION FIX (FINAL) */
    await conn.query(
      `
      UPDATE supply_chain_sanctions s
      JOIN (
        SELECT
          d.lan COLLATE utf8mb4_unicode_ci AS lan,
          COALESCE(SUM(d.remaining_disbursement_amount), 0) AS total_remaining_disb,
          COALESCE(SUM(a.allocated_principal), 0) AS total_alloc_principal
        FROM supply_chain_daily_demand d
        LEFT JOIN supply_chain_allocation a
          ON a.lan COLLATE utf8mb4_unicode_ci
             = d.lan COLLATE utf8mb4_unicode_ci
        WHERE d.lan COLLATE utf8mb4_unicode_ci = ?
        GROUP BY d.lan
      ) x
        ON x.lan COLLATE utf8mb4_unicode_ci
           = s.lan COLLATE utf8mb4_unicode_ci
      SET
        s.utilized_sanction_limit =
          GREATEST(s.utilized_sanction_limit - x.total_remaining_disb, 0),
        s.unutilization_sanction_limit =
          s.unutilization_sanction_limit + x.total_alloc_principal
      `,
      [lan]
    );

    /* 8️⃣ REGENERATE DEMAND (invoice-wise) */
    for (const invoiceNo of affectedInvoices) {
      await updateDemandFromCollectionDate(
        conn,
        invoiceNo,
        collection_date
      );
    }

    await conn.commit();
    console.log(`✅ Allocation completed for ${lan}`);
  } catch (err) {
    await conn.rollback();
    console.error("❌ Allocation failed:", err);
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { allocateSupplyChainRepayment };