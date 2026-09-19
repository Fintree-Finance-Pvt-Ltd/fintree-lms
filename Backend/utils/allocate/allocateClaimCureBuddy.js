const db = require("../../config/db");
const { generateNoc } = require("../../services/noc.service");

const queryDB = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) reject(err);
      else resolve(results);
    });
  });

/**
 * Allocate a Claim Cure Buddy bullet repayment.
 * The CCB schedule contains one row, so payment is applied directly to
 * interest first and then principal. Any amount above the bullet demand is
 * recorded as an excess payment.
 */
const allocateClaimCureBuddy = async (lan, payment) => {
  const normalizedLan = String(lan || "").trim();
  const paymentDate = payment.payment_date;
  const paymentId = payment.payment_id;
  let remaining = Number(payment.transfer_amount);

  if (!normalizedLan) throw new Error("LAN is required for CCB allocation");
  if (!paymentId) throw new Error("payment_id is required for CCB allocation");
  if (!Number.isFinite(remaining) || remaining <= 0) {
    throw new Error("transfer_amount must be greater than zero for CCB allocation");
  }

  const [bullet] = await queryDB(
    `SELECT *
     FROM manual_rps_claim_cure_buddy
     WHERE lan = ?
       AND (COALESCE(remaining_interest, 0) > 0
         OR COALESCE(remaining_principal, 0) > 0)
     ORDER BY due_date ASC, id ASC
     LIMIT 1`,
    [normalizedLan],
  );

  if (bullet) {
    let interestDue = Math.max(0, Number(bullet.remaining_interest || 0));
    let principalDue = Math.max(0, Number(bullet.remaining_principal || 0));

    if (interestDue > 0) {
      const allocatedInterest = Math.min(interestDue, remaining);
      interestDue -= allocatedInterest;
      remaining -= allocatedInterest;

      await queryDB(
        `INSERT INTO allocation
         (lan, due_date, allocation_date, allocated_amount, charge_type, payment_id)
         VALUES (?, ?, ?, ?, 'Interest', ?)`,
        [normalizedLan, bullet.due_date, paymentDate, allocatedInterest, paymentId],
      );
    }

    if (remaining > 0 && interestDue === 0 && principalDue > 0) {
      const allocatedPrincipal = Math.min(principalDue, remaining);
      principalDue -= allocatedPrincipal;
      remaining -= allocatedPrincipal;

      await queryDB(
        `INSERT INTO allocation
         (lan, due_date, allocation_date, allocated_amount, charge_type, payment_id)
         VALUES (?, ?, ?, ?, 'Principal', ?)`,
        [normalizedLan, bullet.due_date, paymentDate, allocatedPrincipal, paymentId],
      );
    }

    const outstanding = interestDue + principalDue;
    await queryDB(
      `UPDATE manual_rps_claim_cure_buddy
       SET remaining_interest = ?,
           remaining_principal = ?,
           remaining_emi = ?,
           status = ?
       WHERE id = ?`,
      [
        interestDue,
        principalDue,
        outstanding,
        outstanding === 0 ? "Paid" : "Partially Paid",
        bullet.id,
      ],
    );
  }

  if (remaining > 0) {
    await queryDB(
      `INSERT INTO allocation
       (lan, due_date, allocation_date, allocated_amount, charge_type, payment_id)
       VALUES (?, ?, ?, ?, 'Excess Payment', ?)`,
      [normalizedLan, paymentDate, paymentDate, remaining, paymentId],
    );
  }

  const [pending] = await queryDB(
    `SELECT COUNT(*) AS count
     FROM manual_rps_claim_cure_buddy
     WHERE lan = ?
       AND (COALESCE(remaining_interest, 0) > 0
         OR COALESCE(remaining_principal, 0) > 0)`,
    [normalizedLan],
  );

  if (Number(pending.count) === 0) {
    await queryDB(
      `UPDATE loan_booking_claim_cure_buddy
       SET status = 'Fully Paid', updated_at = NOW()
       WHERE lan = ?`,
      [normalizedLan],
    );

    try {
      const nocResult = await generateNoc({
        lan: normalizedLan,
        baseUrl: process.env.BASE_URL || process.env.BACKEND_URL,
      });

      console.log("NOC generated successfully for Claim Cure Buddy", {
        lan: normalizedLan,
        fileUrl: nocResult.fileUrl,
        emailStatus: nocResult.email?.status,
      });
    } catch (nocError) {
      // Allocation and loan closure have already succeeded. NOC generation
      // must not make the repayment appear to have failed.
      console.error("NOC generation failed for Claim Cure Buddy", {
        lan: normalizedLan,
        message: nocError.message,
      });
    }
  }
};

module.exports = allocateClaimCureBuddy;
