const db = require("../../config/db");

async function checkCirclePeHouserDedup(panNumber, excludeLan = null) {
  const pan = String(panNumber || "")
    .trim()
    .toUpperCase();

  if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) {
    const error = new Error("Valid PAN is required for DE-DUP");
    error.statusCode = 400;
    throw error;
  }

  const [rows] = await db.promise().query(
    `
    SELECT
      lan,
      status
    FROM loan_booking_circle_pe_houser
    WHERE UPPER(TRIM(pan_number)) = ?
      AND (? IS NULL OR lan <> ?)
    `,
    [pan, excludeLan, excludeLan],
  );

  const closedStatuses = ["fully paid", "foreclosed"];

  const openLoans = rows.filter(
    (loan) =>
      !closedStatuses.includes(
        String(loan.status || "")
          .trim()
          .toLowerCase(),
      ),
  );

  return {
    eligible: openLoans.length < 2,
    totalPreviousLoans: rows.length,
    openLoanCount: openLoans.length,
    closedLoanCount: rows.length - openLoans.length,
    code: openLoans.length >= 2 ? "DEDUP_REJECTED" : "DEDUP_PASSED",
  };
}

module.exports = { checkCirclePeHouserDedup };
