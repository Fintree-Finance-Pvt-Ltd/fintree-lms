/**
 * PL Partner repayment schedule (RPS) generation on disbursement.
 *
 * Mirrors processRapidMoneyDisbursement in
 * Backend/services/processEmiClubDisbursement.js — same shape, same
 * ev_disbursement_utr dedup table every lender's disbursement processor
 * already shares — but writes RPS rows into its own dedicated
 * manual_rps_fintree_personal_loan table via generatePlPartnerRepaymentSchedule,
 * not RapidMoney's shared manual_rps_switch_my_loan. Kept in its own file so
 * PL Partner logic stays separate from RapidMoney's, same principle as
 * plPartnerBre.js.
 *
 * Unlike RapidMoney/SML (where Fintree generates the LAN itself, guaranteeing
 * a fixed prefix), PL Partner's LAN is supplied by the partner in the Create
 * Application call — there's no reliable prefix to gate on here, so this
 * relies entirely on payout.service.js only calling it for
 * table === "pl_partner_applications".
 *
 * RPS principal is the GROSS approved amount (bre_gross_approved_amount) —
 * what the customer owes back — not the net amount actually wired to their
 * bank (bre_approved_loan_amount, after processing fee + GST were deducted
 * upfront). This matches how SML's RPS uses loan_amount (gross), not
 * disbursal_amount (net).
 */
const db = require("../../../config/db");
const {
  generatePlPartnerRepaymentSchedule,
} = require("./generatePlPartnerRepaymentSchedule");

async function processPlPartnerDisbursement({ lan, disbursementUTR, disbursementDate }) {
  console.log("[PLP][START] Processing disbursement", {
    lan,
    disbursementUTR,
    disbursementDate,
  });

  if (!disbursementUTR || !disbursementDate) {
    console.log("[PLP][SKIP] Missing UTR or Disbursement Date", {
      disbursementUTR,
      disbursementDate,
    });

    return { skipped: true, reason: "MISSING_UTR_OR_DATE" };
  }

  let conn;
  try {
    conn = await db.promise().getConnection();
    await conn.beginTransaction();

    const [[application]] = await conn.query(
      `
      SELECT interest_rate, bre_gross_approved_amount, selected_offer_tenure
      FROM pl_partner_applications
      WHERE lan = ?
      FOR UPDATE
      `,
      [lan],
    );

    if (!application) {
      throw new Error(`PL partner application not found: ${lan}`);
    }

    const [utrExists] = await conn.query(
      `SELECT 1 FROM ev_disbursement_utr WHERE Disbursement_UTR = ? LIMIT 1`,
      [disbursementUTR],
    );

    if (utrExists.length > 0) {
      await conn.rollback();
      return { skipped: true, reason: "DUPLICATE_UTR" };
    }

    const [existingRps] = await conn.query(
      `SELECT id FROM manual_rps_fintree_personal_loan WHERE lan = ? LIMIT 1`,
      [lan],
    );

    if (existingRps.length > 0) {
      await conn.rollback();
      return { skipped: true, reason: "RPS_ALREADY_EXISTS" };
    }

    console.log("[PLP][STEP] Generating repayment schedule", {
      lan,
      grossApprovedAmount: application.bre_gross_approved_amount,
      interestRate: application.interest_rate,
      tenureDays: application.selected_offer_tenure,
      disbursementDate,
    });

    await generatePlPartnerRepaymentSchedule(
      conn,
      lan,
      application.bre_gross_approved_amount,
      application.interest_rate,
      application.selected_offer_tenure,
      disbursementDate,
      null,
    );

    await conn.query(
      `
      INSERT INTO ev_disbursement_utr
        (Disbursement_UTR, Disbursement_Date, LAN)
      VALUES (?, ?, ?)
      `,
      [disbursementUTR, disbursementDate, lan],
    );

    await conn.commit();

    console.log("[PLP][SUCCESS] RPS generated", { lan });

    return { success: true };
  } catch (err) {
    if (conn) await conn.rollback();
    throw err;
  } finally {
    if (conn) conn.release();
  }
}

module.exports = {
  processPlPartnerDisbursement,
};
