const express = require("express");
const db = require("../config/db");
const authenticateUser = require("../middleware/verifyToken");

const router = express.Router();

const JOIN_COLLATE = "utf8mb4_unicode_ci";

const PRODUCT_CONFIG = {
  EV: {
    label: "EV Loan",
    bookingTable: "loan_booking_ev",
    rpsTable: "manual_rps_ev_loan",
    allocationTable: "allocation",
    repaymentTable: "repayments_upload",
    lanLike: "EV%",
    principalField: "loan_amount",
  },
};

const PRODUCT_ALIASES = {
  ev: "EV",
  "ev loan": "EV",
};

function normalizeProduct(product) {
  const raw = String(product || "EV").trim();
  return PRODUCT_ALIASES[raw.toLowerCase()] || raw.toUpperCase();
}

function toNumber(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function toDateOnly(value) {
  if (!value) return null;

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return String(value).slice(0, 10);
}

function buildSummaryQuery(config) {
  return `
    SELECT
      grouped.lender,
      grouped.product,
      grouped.as_of,
      COUNT(DISTINCT grouped.lan) AS loan_count,
      SUM(grouped.booked_principal) AS booked_principal,
      SUM(IFNULL(grouped.total_emi, 0)) AS emi,
      SUM(IFNULL(grouped.scheduled_principal, 0)) AS principal,
      SUM(IFNULL(grouped.scheduled_interest, 0)) AS total_interest,
      SUM(IFNULL(grouped.total_collection, 0)) AS total_collection,
      SUM(IFNULL(grouped.total_collection_principal, 0)) AS total_collection_principal,
      SUM(IFNULL(grouped.total_collection_interest, 0)) AS total_collection_interest,
      SUM(IFNULL(grouped.pos_remaining, 0)) AS pos_remaining,
      SUM(IFNULL(grouped.interest_remaining, 0)) AS interest_remaining,
      SUM(IFNULL(grouped.due_emi, 0)) AS due_emi,
      SUM(IFNULL(grouped.due_principal, 0)) AS due_principal,
      SUM(IFNULL(grouped.due_interest, 0)) AS due_interest,
      SUM(IFNULL(grouped.future_due, 0)) AS future_due,
      SUM(IFNULL(grouped.future_due, 0)) AS future_collection,
      SUM(IFNULL(grouped.future_due_principal, 0)) AS future_due_principal,
      SUM(IFNULL(grouped.future_due_interest, 0)) AS future_due_interest,
      MIN(grouped.next_due_date) AS next_due_date
    FROM (
      SELECT
        b.lan,
        COALESCE(NULLIF(TRIM(b.lender), ''), ?) AS lender,
        COALESCE(NULLIF(TRIM(b.product), ''), ?) AS product,
        CURDATE() AS as_of,
        IFNULL(b.${config.principalField}, 0) AS booked_principal,
        rps.total_emi,
        rps.scheduled_principal,
        rps.scheduled_interest,
        rps.pos_remaining,
        rps.interest_remaining,
        rps.due_emi,
        rps.due_principal,
        rps.due_interest,
        rps.future_due,
        rps.future_due_principal,
        rps.future_due_interest,
        rps.next_due_date,
        collections.total_collection,
        allocations.total_collection_principal,
        allocations.total_collection_interest
      FROM ${config.bookingTable} b
      LEFT JOIN (
        SELECT
          lan,
          SUM(IFNULL(emi, 0)) AS total_emi,
          SUM(IFNULL(principal, 0)) AS scheduled_principal,
          SUM(IFNULL(interest, 0)) AS scheduled_interest,
          SUM(
            CASE
              WHEN LOWER(COALESCE(status, '')) <> 'paid'
                THEN IFNULL(remaining_principal, 0)
              ELSE 0
            END
          ) AS pos_remaining,
          SUM(
            CASE
              WHEN LOWER(COALESCE(status, '')) <> 'paid'
                THEN IFNULL(remaining_interest, 0)
              ELSE 0
            END
          ) AS interest_remaining,
          SUM(
            CASE
              WHEN LOWER(COALESCE(status, '')) <> 'paid'
                AND due_date <= CURDATE()
                THEN COALESCE(remaining_emi, IFNULL(remaining_principal, 0) + IFNULL(remaining_interest, 0), 0)
              ELSE 0
            END
          ) AS due_emi,
          SUM(
            CASE
              WHEN LOWER(COALESCE(status, '')) <> 'paid'
                AND due_date <= CURDATE()
                THEN IFNULL(remaining_principal, 0)
              ELSE 0
            END
          ) AS due_principal,
          SUM(
            CASE
              WHEN LOWER(COALESCE(status, '')) <> 'paid'
                AND due_date <= CURDATE()
                THEN IFNULL(remaining_interest, 0)
              ELSE 0
            END
          ) AS due_interest,
          SUM(
            CASE
              WHEN LOWER(COALESCE(status, '')) <> 'paid'
                AND due_date > CURDATE()
                THEN COALESCE(remaining_emi, IFNULL(remaining_principal, 0) + IFNULL(remaining_interest, 0), 0)
              ELSE 0
            END
          ) AS future_due,
          SUM(
            CASE
              WHEN LOWER(COALESCE(status, '')) <> 'paid'
                AND due_date > CURDATE()
                THEN IFNULL(remaining_principal, 0)
              ELSE 0
            END
          ) AS future_due_principal,
          SUM(
            CASE
              WHEN LOWER(COALESCE(status, '')) <> 'paid'
                AND due_date > CURDATE()
                THEN IFNULL(remaining_interest, 0)
              ELSE 0
            END
          ) AS future_due_interest,
          MIN(
            CASE
              WHEN LOWER(COALESCE(status, '')) <> 'paid'
                AND due_date >= CURDATE()
                THEN due_date
              ELSE NULL
            END
          ) AS next_due_date
        FROM ${config.rpsTable}
        GROUP BY lan
      ) rps
        ON rps.lan COLLATE ${JOIN_COLLATE} = b.lan COLLATE ${JOIN_COLLATE}
      LEFT JOIN (
        SELECT
          lan,
          SUM(IFNULL(transfer_amount, 0)) AS total_collection
        FROM ${config.repaymentTable}
        WHERE payment_date IS NOT NULL
          AND lan LIKE ?
        GROUP BY lan
      ) collections
        ON collections.lan COLLATE ${JOIN_COLLATE} = b.lan COLLATE ${JOIN_COLLATE}
      LEFT JOIN (
        SELECT
          lan,
          SUM(
            CASE
              WHEN LOWER(charge_type) = 'principal'
                THEN IFNULL(allocated_amount, 0)
              ELSE 0
            END
          ) AS total_collection_principal,
          SUM(
            CASE
              WHEN LOWER(charge_type) = 'interest'
                THEN IFNULL(allocated_amount, 0)
              ELSE 0
            END
          ) AS total_collection_interest
        FROM ${config.allocationTable}
        WHERE lan LIKE ?
        GROUP BY lan
      ) allocations
        ON allocations.lan COLLATE ${JOIN_COLLATE} = b.lan COLLATE ${JOIN_COLLATE}
    ) grouped
    GROUP BY grouped.lender, grouped.product, grouped.as_of
    ORDER BY grouped.lender, grouped.product
  `;
}

router.get("/lender-summary", authenticateUser, async (req, res) => {
  const productKey = normalizeProduct(req.query.product);
  const config = PRODUCT_CONFIG[productKey];

  if (!config) {
    return res.status(400).json({
      message: "Only EV Loan summary is available right now.",
      supportedProducts: Object.values(PRODUCT_CONFIG).map((item) => item.label),
    });
  }

  try {
    const [rawRows] = await db
      .promise()
      .query(buildSummaryQuery(config), [
        config.label,
        config.label,
        config.lanLike,
        config.lanLike,
      ]);

    const rows = rawRows.map((row) => ({
      lender: row.lender,
      product: row.product,
      asOf: toDateOnly(row.as_of),
      nextDueDate: toDateOnly(row.next_due_date),
      loanCount: toNumber(row.loan_count),
      bookedPrincipal: toNumber(row.booked_principal),
      emi: toNumber(row.emi),
      principal: toNumber(row.principal),
      totalInterest: toNumber(row.total_interest),
      totalCollection: toNumber(row.total_collection),
      totalCollectionPrincipal: toNumber(row.total_collection_principal),
      totalCollectionInterest: toNumber(row.total_collection_interest),
      posRemaining: toNumber(row.pos_remaining),
      interestRemaining: toNumber(row.interest_remaining),
      dueEmi: toNumber(row.due_emi),
      duePrincipal: toNumber(row.due_principal),
      dueInterest: toNumber(row.due_interest),
      futureDue: toNumber(row.future_due),
      futureCollection: toNumber(row.future_collection),
      futureDuePrincipal: toNumber(row.future_due_principal),
      futureDueInterest: toNumber(row.future_due_interest),
    }));

    const totals = rows.reduce(
      (acc, row) => ({
        lenders: rows.length,
        loanCount: acc.loanCount + row.loanCount,
        bookedPrincipal: acc.bookedPrincipal + row.bookedPrincipal,
        emi: acc.emi + row.emi,
        principal: acc.principal + row.principal,
        totalInterest: acc.totalInterest + row.totalInterest,
        totalCollection: acc.totalCollection + row.totalCollection,
        totalCollectionPrincipal:
          acc.totalCollectionPrincipal + row.totalCollectionPrincipal,
        totalCollectionInterest:
          acc.totalCollectionInterest + row.totalCollectionInterest,
        posRemaining: acc.posRemaining + row.posRemaining,
        interestRemaining: acc.interestRemaining + row.interestRemaining,
        dueEmi: acc.dueEmi + row.dueEmi,
        duePrincipal: acc.duePrincipal + row.duePrincipal,
        dueInterest: acc.dueInterest + row.dueInterest,
        futureDue: acc.futureDue + row.futureDue,
        futureCollection: acc.futureCollection + row.futureCollection,
        futureDuePrincipal: acc.futureDuePrincipal + row.futureDuePrincipal,
        futureDueInterest: acc.futureDueInterest + row.futureDueInterest,
      }),
      {
        lenders: 0,
        loanCount: 0,
        bookedPrincipal: 0,
        emi: 0,
        principal: 0,
        totalInterest: 0,
        totalCollection: 0,
        totalCollectionPrincipal: 0,
        totalCollectionInterest: 0,
        posRemaining: 0,
        interestRemaining: 0,
        dueEmi: 0,
        duePrincipal: 0,
        dueInterest: 0,
        futureDue: 0,
        futureCollection: 0,
        futureDuePrincipal: 0,
        futureDueInterest: 0,
      },
    );

    res.json({
      product: config.label,
      asOf: rows[0]?.asOf || new Date().toISOString().slice(0, 10),
      totals,
      rows,
    });
  } catch (error) {
    console.error("Loan booking lender summary error:", error);
    res.status(500).json({
      message: "Unable to fetch lender summary.",
      error: error.sqlMessage || error.message,
    });
  }
});

module.exports = router;
