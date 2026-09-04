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
  RAPIDMONEY: {
    label: "Rapid Money",
    bookingTable: "loan_booking_switch_my_loan",
    rpsTable: "manual_rps_switch_my_loan",
    allocationTable: "allocation",
    repaymentTable: "repayments_upload",
    lanLike: "RML%",
    principalField: "loan_amount",
  },
  CAREPAY: {
    label: "CarePay",
    bookingTable: "loan_booking_carepay",
    rpsTable: "manual_rps_carepay",
    allocationTable: "allocation",
    repaymentTable: "repayments_upload",
    lanLike: "CARE%",
    principalField: "loan_amount",
  },
  // YAMONEY: {
  //   label: "Ya Money",
  //   bookingTable: "loan_booking_ya_money",
  //   rpsTable: "manual_rps_ya_money",
  //   allocationTable: "allocation",
  //   repaymentTable: "repayments_upload",
  //   lanLike: "YAM%",
  //   principalField: "loan_amount",
  // },
  QUICKMONEY: {
    label: "Quick Money",
    bookingTable: "loan_booking_quick_money",
    rpsTable: "manual_rps_quick_money",
    allocationTable: "allocation",
    repaymentTable: "repayments_upload",
    lanLike: "QML%",
    principalField: "loan_amount",
  },
  SASWAT: {
    label: "Saswat",
    bookingTable: "loan_booking_saswat",
    rpsTable: "manual_rps_saswat",
    allocationTable: "allocation",
    repaymentTable: "repayments_upload",
    lanLike: "SW%",
    principalField: "loan_amount",
  },
  SAMPADA: {
    label: "Sampada",
    bookingTable: "loan_booking_sampada",
    rpsTable: "manual_rps_sampada",
    allocationTable: "allocation",
    repaymentTable: "repayments_upload",
    lanLike: "SPL%",
    principalField: "loan_amount",
  },
  CLAIMCUREBUDDY: {
    label: "Claim Cure Buddy",
    bookingTable: "loan_booking_claim_cure_buddy",
    rpsTable: "manual_rps_claim_cure_buddy",
    allocationTable: "allocation",
    repaymentTable: "repayments_upload",
    lanLike: "CCB%",
    principalField: "disbursal_amount",
  },
  ZEBRS: {
    label: "Zebrs",
    bookingTable: "loan_booking_zebrs",
    rpsTable: "manual_rps_zebrs",
    allocationTable: "allocation",
    repaymentTable: "repayments_upload",
    lanLike: "ZBR%",
    principalField: "loan_amount",
  },
  MOTIONCORP: {
    label: "Motion Corp",
    bookingTable: "loan_booking_motion_corp",
    rpsTable: "manual_rps_motioncorp",
    allocationTable: "allocation",
    repaymentTable: "repayments_upload",
    lanLike: "MCL%",
    principalField: "loan_amount",
  },
  LOANDIGIT: {
    label: "Loan Digit",
    bookingTable: "loan_booking_loan_digit",
    rpsTable: "manual_rps_loan_digit",
    allocationTable: "allocation",
    repaymentTable: "repayments_upload",
    lanLike: "LDF%",
    principalField: "loan_amount",
  },
  SRBH: {
    label: "SRBH",
    bookingTable: "loan_booking_srbh",
    rpsTable: "manual_rps_srbh",
    allocationTable: "allocation",
    repaymentTable: "repayments_upload",
    lanLike: "SH%",
    principalField: "loan_amount",
  },
  BUNDELA: {
    label: "Bundela",
    bookingTable: "loan_booking_bundela",
    rpsTable: "manual_rps_bundela",
    allocationTable: "allocation",
    repaymentTable: "repayments_upload",
    lanLike: "BUN%",
    principalField: "loan_amount",
  },
  CLAYYO: {
    label: "Clayyo",
    bookingTable: "loan_booking_clayyo",
    rpsTable: "manual_rps_clayoo",
    allocationTable: "allocation",
    repaymentTable: "repayments_upload",
    lanLike: "CLY%",
    principalField: "loan_amount",
  },
  HELIUM: {
    label: "Helium",
    bookingTable: "loan_booking_helium",
    rpsTable: "manual_rps_helium",
    allocationTable: "allocation",
    repaymentTable: "repayments_upload",
    lanLike: "HEL%",
    principalField: "loan_amount",
  },
  EMICLUB: {
    label: "EMI Club",
    bookingTable: "loan_booking_emiclub",
    rpsTable: "manual_rps_emiclub",
    allocationTable: "allocation",
    repaymentTable: "repayments_upload",
    lanLike: "FINE%",
    principalField: "net_disbursement",
  },
  FINCREST: {
    label: "Fincrest",
    bookingTable: "loan_booking_finso",
    rpsTable: "manual_rps_finso_loan",
    allocationTable: "allocation",
    repaymentTable: "repayments_upload",
    lanLike: "FINS%",
    principalField: "disbursal_amount",
  },
  GQNONFSF: {
    label: "GQ Non-FSF",
    bookingTable: "loan_booking_gq_non_fsf",
    rpsTable: "manual_rps_gq_non_fsf",
    allocationTable: "allocation",
    repaymentTable: "repayments_upload",
    lanLike: "GQN%",
    principalField: "disbursal_amount",
  },
  GQFSF: {
    label: "GQ FSF",
    bookingTable: "loan_booking_gq_fsf",
    rpsTable: "manual_rps_gq_fsf",
    allocationTable: "allocation",
    repaymentTable: "repayments_upload",
    lanLike: "GQF%",
    principalField: "disbursal_amount",
  },
  CIRCLEPEHOUSER: {
    label: "Circle Pe Houser",
    bookingTable: "loan_booking_circle_pe_houser",
    rpsTable: "manual_rps_circle_pe_houser",
    allocationTable: "allocation",
    repaymentTable: "repayments_upload",
    lanLike: "CIRHUF%",
    principalField: "loan_amount",
  },
};

const PRODUCT_ALIASES = {
  ev: "EV",
  "ev loan": "EV",
  carepay: "CAREPAY",
  "carepay loan": "CAREPAY",
  "rapid money": "RAPIDMONEY",
  "quick money": "QUICKMONEY",
  "ya money": "YAMONEY",
  "claim cure buddy": "CLAIMCUREBUDDY",
  "motion corp": "MOTIONCORP",
  "loan digit": "LOANDIGIT",
};

function normalizeProduct(product) {
  const raw = String(product || "ALL").trim();
  return (
    PRODUCT_ALIASES[raw.toLowerCase()] ||
    raw.toUpperCase().replace(/[\s_-]+/g, "")
  );
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
      SUM(IFNULL(grouped.future_due_interest, 0)) AS future_due_interest
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
          ) AS future_due_interest
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

function emptyTotals() {
  return {
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
  };
}

function mapSummaryRow(row) {
  return {
    lender: row.lender,
    product: row.product,
    asOf: toDateOnly(row.as_of),
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
  };
}

function sumTotals(rows) {
  const totals = rows.reduce((acc, row) => {
    acc.loanCount += row.loanCount;
    acc.bookedPrincipal += row.bookedPrincipal;
    acc.emi += row.emi;
    acc.principal += row.principal;
    acc.totalInterest += row.totalInterest;
    acc.totalCollection += row.totalCollection;
    acc.totalCollectionPrincipal += row.totalCollectionPrincipal;
    acc.totalCollectionInterest += row.totalCollectionInterest;
    acc.posRemaining += row.posRemaining;
    acc.interestRemaining += row.interestRemaining;
    acc.dueEmi += row.dueEmi;
    acc.duePrincipal += row.duePrincipal;
    acc.dueInterest += row.dueInterest;
    acc.futureDue += row.futureDue;
    acc.futureCollection += row.futureCollection;
    acc.futureDuePrincipal += row.futureDuePrincipal;
    acc.futureDueInterest += row.futureDueInterest;
    return acc;
  }, emptyTotals());

  totals.lenders = rows.length;
  return totals;
}

async function fetchProductSummary(config) {
  const [rawRows] = await db
    .promise()
    .query(buildSummaryQuery(config), [
      config.label,
      config.label,
      config.lanLike,
      config.lanLike,
    ]);

  return rawRows.map(mapSummaryRow);
}

router.get("/lender-summary", authenticateUser, async (req, res) => {
  const productKey = normalizeProduct(req.query.product);
  const isAll = productKey === "ALL" || productKey === "ALLPRODUCTS";
  const config = PRODUCT_CONFIG[productKey];

  if (!isAll && !config) {
    return res.status(400).json({
      message: `Lender summary is not available for "${
        req.query.product || ""
      }".`,
      supportedProducts: Object.values(PRODUCT_CONFIG).map((item) => item.label),
    });
  }

  try {
    if (isAll) {
      const entries = Object.values(PRODUCT_CONFIG);
      const settled = await Promise.allSettled(
        entries.map((item) => fetchProductSummary(item)),
      );

      const rows = [];
      const skipped = [];

      settled.forEach((result, index) => {
        if (result.status === "fulfilled") {
          rows.push(...result.value);
        } else {
          const reason = result.reason || {};
          console.error(
            `Lender summary (ALL) failed for ${entries[index].label}:`,
            reason.sqlMessage || reason.message,
          );
          skipped.push({
            product: entries[index].label,
            error: reason.sqlMessage || reason.message || "Unknown error",
          });
        }
      });

      rows.sort(
        (a, b) =>
          String(a.product || "").localeCompare(String(b.product || "")) ||
          String(a.lender || "").localeCompare(String(b.lender || "")),
      );

      return res.json({
        product: "All Products",
        asOf: rows[0]?.asOf || new Date().toISOString().slice(0, 10),
        totals: sumTotals(rows),
        rows,
        skipped,
      });
    }

    const rows = await fetchProductSummary(config);

    res.json({
      product: config.label,
      asOf: rows[0]?.asOf || new Date().toISOString().slice(0, 10),
      totals: sumTotals(rows),
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
