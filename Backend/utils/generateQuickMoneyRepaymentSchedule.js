const dayjs = require("dayjs");

const round2 = (num) =>
  Number(Number(num).toFixed(2));

function formatDateOnly(dateValue) {
  if (!dateValue) return null;

  return new Date(dateValue)
    .toISOString()
    .split("T")[0];
}

async function generateQuickMoneyRepaymentSchedule(
  conn,
  lan,
  loanAmount,
  annualInterestRate,
  tenureDays,
  disbursementDate,
  repaymentDate
) {
  try {
    console.log("[QUICK_RPS][START]", {
      lan,
      loanAmount,
      annualInterestRate,
      tenureDays,
      disbursementDate,
      repaymentDate,
    });

    if (!lan) {
      throw new Error("LAN missing");
    }

    const principal = round2(loanAmount);
    const roi = Number(annualInterestRate);
    const days = Number(tenureDays);

    if (!principal || principal <= 0) {
      throw new Error("Invalid loan amount");
    }

    if (Number.isNaN(roi) || roi < 0) {
      throw new Error("Invalid interest rate");
    }

    if (!days || days <= 0) {
      throw new Error("Invalid tenure days");
    }

    if (
      !disbursementDate ||
      !dayjs(disbursementDate).isValid()
    ) {
      throw new Error("Invalid disbursement date");
    }

    /*
     * Single-payment short-term loan logic
     *
     * Due Date:
     * Disbursement Date + (Tenure Days - 1)
     */

    const dueDate = dayjs(disbursementDate)
      .add(days - 1, "day")
      .format("YYYY-MM-DD");

    /*
     * Interest:
     *
     * Principal × Annual ROI × Tenure Days / 36500
     *
     * Interest is rounded to nearest rupee.
     */

    const interest = Math.round(
      (principal * roi * days) / 36500
    );

    const emi = round2(
      principal + interest
    );

    console.log("[QUICK_RPS][CALCULATION]", {
      lan,
      principal,
      roi,
      days,
      interest,
      emi,
      dueDate,
    });

    /*
     * Check whether RPS already exists.
     */

    const [existingRps] = await conn.query(
      `
      SELECT id
      FROM manual_rps_quick_money
      WHERE lan = ?
      LIMIT 1
      `,
      [lan]
    );

    if (existingRps.length > 0) {
      console.log(
        "[QUICK_RPS][SKIP] RPS already exists",
        { lan }
      );

      return {
        skipped: true,
        reason: "RPS_ALREADY_EXISTS",
      };
    }

    /*
     * Insert single RPS row.
     */

    await conn.query(
      `
      INSERT INTO manual_rps_quick_money
      (
        lan,
        due_date,
        status,
        emi,
        interest,
        principal,
        opening,
        closing,
        remaining_emi,
        remaining_interest,
        remaining_principal,
        payment_date,
        dpd,
        remaining_amount,
        extra_paid
      )
      VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        lan,
        dueDate,
        "Pending",
        emi,
        interest,
        principal,
        principal,
        0,
        emi,
        interest,
        principal,
        null,
        0,
        emi,
        0,
      ]
    );

    console.log(
      "[QUICK_RPS][SUCCESS] Single RPS row generated",
      {
        lan,
        dueDate,
        emi,
        interest,
        principal,
      }
    );

    return {
      success: true,
      data: {
        lan,
        dueDate,
        emi,
        interest,
        principal,
      },
    };

  } catch (err) {
    console.error("[QUICK_RPS][ERROR]", {
      lan,
      error: err.message,
      stack: err.stack,
    });

    throw err;
  }
}

module.exports = {
  generateQuickMoneyRepaymentSchedule,
};