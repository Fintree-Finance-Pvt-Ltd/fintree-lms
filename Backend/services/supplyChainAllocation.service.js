// // src/services/supplyChainAllocation.service.js



const {
  updateDemandFromCollectionDate,
} = require("../services/supplyChain/updateDemandFromCollectionDate");

/**
 * ✅ Timezone-safe YYYY-MM-DD (does NOT use toISOString / UTC)
 * Fixes off-by-one (e.g., 2025-07-19 becoming 2025-07-18).
 */
function toYMD(input) {
  if (input == null) return null;

  // Already YYYY-MM-DD
  if (typeof input === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input)) return input;

  const d = new Date(input);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date: ${input}`);

  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function allocateSupplyChainRepayment(db, repayment) {
  const { lan, collection_date, collection_utr, collection_amount } = repayment;

  const conn = await db.promise().getConnection();

  try {
    await conn.beginTransaction();

    // Raw + normalized for debugging clarity
    const requestedCollectionDate = collection_date;
    const baseCollectionDate = toYMD(collection_date);

    // invoiceNo -> effective allocation date (YYYY-MM-DD) used for regen
    const affectedInvoices = new Map();

    /* 🔁 STEP 0: Fetch existing excess (LOCKED) — MUST BE BEFORE remainingAmount logic */
    const [[existingExcess]] = await conn.query(
      `
      SELECT id, excess_payment
      FROM supply_chain_allocation
      WHERE lan = ?
        AND excess_payment > 0
      ORDER BY created_at ASC
      LIMIT 1
      FOR UPDATE
      `,
      [lan]
    );

    /**
     * ✅ IMPORTANT FIX: DO NOT DOUBLE-ADD EXCESS
     * - If existingExcess exists, use ONLY that (ignore collection_amount)
     * - Else use collection_amount
     */
    let remainingAmount = 0;
    if (existingExcess) {
      console.log(`♻️ Using previous excess = ${existingExcess.excess_payment}`);
      remainingAmount = Number(existingExcess.excess_payment) || 0;
    } else {
      remainingAmount = Number(collection_amount) || 0;
    }

    /* 1️⃣ FIFO Active Invoices */
    const [invoices] = await conn.query(
      `
      SELECT invoice_number
      FROM invoice_disbursements
      WHERE lan = ?
        AND status = 'Active'
      ORDER BY disbursement_date ASC, invoice_number ASC
      `,
      [lan]
    );

    for (const inv of invoices) {
      if (remainingAmount <= 0) break;

      // Start with normalized incoming date
      let allocDate = baseCollectionDate;

      /* 2️⃣ Demand row on allocDate (LOCKED) */
      let [[demand]] = await conn.query(
        `
        SELECT *
        FROM supply_chain_daily_demand
        WHERE lan = ?
          AND invoice_number = ?
          AND daily_date = ?
        FOR UPDATE
        `,
        [lan, inv.invoice_number, allocDate]
      );

      /**
       * ✅ If not found, anchor to a valid demand row:
       *  - first try >= allocDate (handles gaps)
       *  - else fallback to earliest demand row for that invoice (handles "collection before disbursement")
       */
      if (!demand) {
        let [[nextDemand]] = await conn.query(
          `
          SELECT *
          FROM supply_chain_daily_demand
          WHERE lan = ?
            AND invoice_number = ?
            AND daily_date >= ?
          ORDER BY daily_date ASC
          LIMIT 1
          FOR UPDATE
          `,
          [lan, inv.invoice_number, allocDate]
        );

        if (!nextDemand) {
          [[nextDemand]] = await conn.query(
            `
            SELECT *
            FROM supply_chain_daily_demand
            WHERE lan = ?
              AND invoice_number = ?
            ORDER BY daily_date ASC
            LIMIT 1
            FOR UPDATE
            `,
            [lan, inv.invoice_number]
          );
        }

        if (!nextDemand) continue;

        demand = nextDemand;
        allocDate = toYMD(nextDemand.daily_date);

        console.log(
          `⚠️ Demand row missing on base date for invoice ${inv.invoice_number}. ` +
            `requested=${requestedCollectionDate} normalized=${baseCollectionDate} effective=${allocDate}`
        );
      }

      let allocPrincipal = 0;
      let allocInterest = 0;
      let allocPenal = 0;

      /* 3️⃣ Principal allocation */
      if (remainingAmount > 0 && Number(demand.remaining_principal) > 0) {
        allocPrincipal = Math.min(Number(demand.remaining_principal), remainingAmount);
        remainingAmount -= allocPrincipal;
      }

      /* 4️⃣ Interest allocation */
      if (remainingAmount > 0 && Number(demand.remaining_interest) > 0) {
        allocInterest = Math.min(Number(demand.remaining_interest), remainingAmount);
        remainingAmount -= allocInterest;
      }

      /* 5️⃣ Penal allocation */
      if (remainingAmount > 0 && Number(demand.remaining_penal_interest) > 0) {
        allocPenal = Math.min(Number(demand.remaining_penal_interest), remainingAmount);
        remainingAmount -= allocPenal;
      }

      if (allocPrincipal + allocInterest + allocPenal === 0) continue;

      affectedInvoices.set(inv.invoice_number, allocDate);

      /* 6️⃣ Allocation Ledger (use allocDate) */
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
          allocDate,
          collection_utr,
          allocPrincipal + allocInterest + allocPenal,
          allocPrincipal,
          allocInterest,
          allocPenal,
        ]
      );

      /* =========================
         UPDATED DEMAND LOGIC
         ========================= */

      /* A️⃣ Zero rows BEFORE allocDate */
      await conn.query(
        `
        UPDATE supply_chain_daily_demand
        SET
          remaining_principal = 0,
          remaining_interest = 0,
          remaining_penal_interest = 0,
          remaining_disbursement_amount = 0,
          total_remaining = 0
        WHERE lan = ?
          AND invoice_number = ?
          AND daily_date < ?
        `,
        [lan, inv.invoice_number, allocDate]
      );

      const newRemainingPrincipal = Number(demand.remaining_principal) - allocPrincipal;
      const newRemainingInterest = Number(demand.remaining_interest) - allocInterest;
      const newRemainingPenal = Number(demand.remaining_penal_interest) - allocPenal;

      /* B️⃣ Update allocDate row */
      await conn.query(
        `
        UPDATE supply_chain_daily_demand
        SET
          remaining_principal = GREATEST(?,0),
          remaining_interest = GREATEST(?,0),
          remaining_penal_interest = GREATEST(?,0),
          remaining_disbursement_amount = GREATEST(?,0),
          total_remaining =
            GREATEST(?,0) + GREATEST(?,0) + GREATEST(?,0),
          collection_date = ?
        WHERE lan = ?
          AND invoice_number = ?
          AND daily_date = ?
        `,
        [
          newRemainingPrincipal,
          newRemainingInterest,
          newRemainingPenal,
          newRemainingPrincipal,
          newRemainingPrincipal,
          newRemainingInterest,
          newRemainingPenal,
          allocDate,
          lan,
          inv.invoice_number,
          allocDate,
        ]
      );

      /* C️⃣ Update rows AFTER allocDate */
      await conn.query(
        `
        UPDATE supply_chain_daily_demand
        SET
          remaining_principal = GREATEST(?,0),
          remaining_interest = GREATEST(?,0),
          remaining_penal_interest = GREATEST(?,0),
          remaining_disbursement_amount = GREATEST(?,0),
          total_remaining =
            GREATEST(?,0) + GREATEST(?,0) + GREATEST(?,0)
        WHERE lan = ?
          AND invoice_number = ?
          AND daily_date > ?
        `,
        [
          newRemainingPrincipal,
          newRemainingInterest,
          newRemainingPenal,
          newRemainingPrincipal,
          newRemainingPrincipal,
          newRemainingInterest,
          newRemainingPenal,
          lan,
          inv.invoice_number,
          allocDate,
        ]
      );
    }

    /* 8️⃣ Remove old excess (parked row) */
    if (existingExcess) {
      await conn.query(
        `
        DELETE FROM supply_chain_allocation
        WHERE id = ?
        `,
        [existingExcess.id]
      );
      console.log("🧹 Old excess cleared");
    }

    /* 9️⃣ Park remaining excess (keep baseCollectionDate for the parked txn bucket) */
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
          allocated_penal_interest,
          excess_payment
        ) VALUES (?,?,?,?,?,?,?,?,?)
        `,
        [
          lan,
          null,
          baseCollectionDate,
          collection_utr,
          remainingAmount,
          0,
          0,
          0,
          remainingAmount,
        ]
      );

      console.log(`🅿️ New excess parked = ${remainingAmount}`);
    }

    /* 🔟 Regenerate demand using effective allocDate per invoice */
    for (const [invoiceNo, allocDate] of affectedInvoices) {
      console.log(`[Demand Regen] Processing invoiceNo=${invoiceNo} from ${allocDate}`);
      await updateDemandFromCollectionDate(conn, invoiceNo, allocDate);
      console.log(`[Demand Regen] Completed invoiceNo=${invoiceNo}`);
    }

    /* 1️⃣1️⃣ Update sanction (txn bucket = baseCollectionDate + utr) */
    await conn.query(
      `
      UPDATE supply_chain_sanctions s
      JOIN (
          SELECT
              a.lan,
              COALESCE(SUM(a.allocated_principal),0) AS alloc_principal_txn
          FROM supply_chain_allocation a
          WHERE a.lan = ?
            AND a.collection_date = ?
            AND a.collection_utr = ?
          GROUP BY a.lan
      ) x
      ON x.lan = s.lan
      SET
          s.utilized_sanction_limit =
              GREATEST(s.utilized_sanction_limit - x.alloc_principal_txn,0),
          s.unutilization_sanction_limit =
              LEAST(
                s.unutilization_sanction_limit + x.alloc_principal_txn,
                s.sanction_amount
              )
      `,
      [lan, baseCollectionDate, collection_utr]
    );

    /* 1️⃣2️⃣ Close fully paid invoices */
    for (const invoiceNo of affectedInvoices.keys()) {
      const [pending] = await conn.query(
        `
        SELECT 1
        FROM supply_chain_daily_demand
        WHERE lan = ?
          AND invoice_number = ?
          AND (
            remaining_principal > 0
            OR remaining_interest > 0
            OR remaining_penal_interest > 0
          )
        LIMIT 1
        `,
        [lan, invoiceNo]
      );

      if (pending.length === 0) {
        await conn.query(
          `
          UPDATE invoice_disbursements
          SET status = 'CLOSED'
          WHERE lan = ?
            AND invoice_number = ?
          `,
          [lan, invoiceNo]
        );

        console.log(`✅ Invoice CLOSED → ${invoiceNo}`);
      }
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