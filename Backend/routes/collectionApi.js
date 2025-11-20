const express = require("express");
const db = require("../config/db");
const router = express.Router();

function buildWhereAndParams({ partnerLoanId, customerName, mobileNumber, panNumber }) {
  if (partnerLoanId && String(partnerLoanId).trim()) {
    return { whereSql: "e.partner_loan_id = ?", params: [String(partnerLoanId).trim()] };
  }
  if (customerName && String(customerName).trim()) {
    return {
      whereSql: "LOWER(e.customer_name) LIKE CONCAT('%', LOWER(?), '%')",
      params: [String(customerName).trim()],
    };
  }
  if (mobileNumber && String(mobileNumber).trim()) {
    return { whereSql: "e.mobile_number = ?", params: [String(mobileNumber).trim()] };
  }
  if (panNumber && String(panNumber).trim()) {
    return { whereSql: "e.pan_card = ?", params: [String(panNumber).trim()] };
  }
  return { whereSql: "", params: [] };
}

router.get("/malhotra/search", async (req, res) => {
  try {
    const { partnerLoanId, customerName, mobileNumber, panNumber } = req.query;

    // exactly one filter
    const { whereSql, params } = buildWhereAndParams({
      partnerLoanId, customerName, mobileNumber, panNumber,
    });

    if (!whereSql) {
      return res.status(400).json({
        message: "Provide any one: partnerLoanId | customerName | mobileNumber | panNumber",
      });
    }

    // Detailed response derived from manual_rps_ev_loan
    const sql = `
      WITH agg AS (
        SELECT
          rps.lan,

          /* DPD: use rps.dpd if present, else days since due_date */
          MAX(COALESCE(rps.dpd, DATEDIFF(CURDATE(), rps.due_date), 0)) AS dpd,

          /* Overdue: sum EMI for rows not paid and past due */
          SUM(
            CASE
              WHEN LOWER(TRIM(COALESCE(rps.status, ''))) <> 'paid'
                   AND rps.due_date IS NOT NULL
                   AND rps.due_date < CURDATE()
              THEN COALESCE(rps.remaining_emi, 0)
              ELSE 0
            END
          ) AS overdue_emi,

          /* Preferred POS: remaining_amount on any unpaid row (max snapshot) */
          MAX(
            CASE
              WHEN LOWER(TRIM(COALESCE(rps.status,''))) <> 'paid'
              THEN COALESCE(rps.remaining_principal, 0)
              ELSE NULL
            END
          ) AS pos_from_remaining_amt_unpaid,

          /* Fallback POS-1: max remaining_principal regardless of status */
          MAX(COALESCE(rps.remaining_principal, 0)) AS pos_from_remaining_amt_any,

          /* Fallback POS-2: sum principal on unpaid rows */
          SUM(
            CASE
              WHEN LOWER(TRIM(COALESCE(rps.status,''))) <> 'paid'
              THEN COALESCE(rps.remaining_principal, 0)
              ELSE 0
            END
          ) AS pos_from_unpaid_principal,

          /* Representative EMI */
          MAX(COALESCE(rps.emi, 0)) AS emi_current
        FROM manual_rps_ev_loan rps
        GROUP BY rps.lan
      )
      SELECT
        e.partner_loan_id AS partnerLoanId,
        e.lan             AS lan,
        COALESCE(a.dpd, 0) AS dpd,

        /* Choose POS in priority: unpaid remaining_principal -> any remaining_principal -> unpaid principal sum */
        CAST(
          ROUND(
            COALESCE(
              a.pos_from_remaining_amt_unpaid,
              a.pos_from_remaining_amt_any,
              a.pos_from_unpaid_principal,
              0.00
            ), 2
          ) AS CHAR
        ) AS pos,

        CAST(ROUND(COALESCE(a.overdue_emi, 0.00), 2) AS CHAR) AS overdue,

        e.customer_name   AS customerName,
        e.mobile_number   AS mobileNumber,
        e.pan_card        AS panNumber,

        CAST(ROUND(COALESCE(e.loan_amount, 0.00), 2) AS CHAR) AS approvedLoanAmount,

        /* prefer EMI from RPS; fallback to booking EMI if RPS is zero */
        CAST(
          ROUND(
            COALESCE(NULLIF(a.emi_current, 0), e.emi_amount, 0.00),
            2
          ) AS CHAR
        ) AS emiAmount,

        TRIM(CONCAT_WS(' ',
          e.address_line_1,
          e.address_line_2,
          e.village,
          e.district,
          e.state,
          e.pincode
        ))              AS address,
        e.district      AS city,
        UPPER(e.state)  AS state
      FROM loan_booking_ev e
      LEFT JOIN agg a
        ON a.lan COLLATE utf8mb4_unicode_ci = e.lan COLLATE utf8mb4_unicode_ci
      WHERE ${whereSql}
      LIMIT 50;
    `;

    const [rows] = await db.promise().query(sql, params);
    return res.json({ data: rows || [] });
  } catch (err) {
    console.error("[/malhotra/search] error:", err);
    return res.status(500).json({ message: "Internal error" });
  }
});

router.get("/malhotra/total-cases", async(req, res) => {
  try {
    console.log("first")
    const sql = `
      SELECT COUNT(*) AS totalCases
      FROM loan_booking_ev;
    `;

    const [rows] = await db.promise().query(sql);
    return res.json({ totalCases: rows[0].totalCases || 0 });
  } catch (err) {
    console.error("[/malhotra/total-cases] error:", err);
    return res.status(500).json({ message: "Internal error" });
  }
});

module.exports = router;
