/**
 * PL Partner repayment / extra charge / extra charge waiver.
 *
 * Ported from Backend/routes/switchMyLoan/switchMyLoanRotues.js's repayment
 * (`/v1/loan/:application_id/repayment`), repayment-charges, and
 * extra_charge_waiver endpoints — reusing the same shared, LAN-keyed tables
 * (repayments_upload, loan_charges, allocation) every lender already writes
 * to. Only the RPS table differs (manual_rps_fintree_personal_loan, via
 * allocatePlPartner — see Backend/utils/allocate/allocatePlPartner.js), which
 * is why a separate allocator (not SML's file) was needed.
 *
 * One deliberate correctness fix versus SML's waiver logic: SML's version
 * selects only `id, amount, waived_amount` before computing outstanding as
 * amount - paid_amount - waived_amount - waived_off, so paid_amount/waived_off
 * are always undefined there and silently treated as 0 — ignoring any partial
 * payment already made against the charge. This version selects all four
 * columns so the outstanding calculation is actually correct. Also relaxed
 * the waiver lookup from paid_status = 'Unpaid' to paid_status != 'Paid', so
 * a partially-paid charge can still be waived for its remaining balance.
 */
const db = require("../../../config/db");
const { PartnerApiError } = require("../utils/partnerApiError");
const { allocateRepaymentByLAN } = require("../../../utils/allocate");

async function loadApplication(clientId, partnerApplicationId) {
  const connection = await db.promise().getConnection();

  try {
    const [[application]] = await connection.query(
      `SELECT id, lan, external_application_reference
       FROM pl_partner_applications
       WHERE client_id = ? AND partner_application_id = ?
       LIMIT 1
       FOR UPDATE`,
      [clientId, partnerApplicationId],
    );

    if (!application) {
      throw new PartnerApiError(404, "APPLICATION_NOT_FOUND", "Partner application was not found.");
    }

    return application;
  } finally {
    connection.release();
  }
}

function assertApplicationIdentity(application, payload) {
  if (application.external_application_reference !== payload.externalApplicationReference) {
    throw new PartnerApiError(
      409,
      "APPLICATION_REFERENCE_MISMATCH",
      "externalApplicationReference does not match the application.",
    );
  }

  if (application.lan !== payload.lan) {
    throw new PartnerApiError(409, "APPLICATION_LAN_MISMATCH", "LAN does not match the application.");
  }
}

async function recordRepayment({ clientId, partnerApplicationId, payload }) {
  const application = await loadApplication(clientId, partnerApplicationId);
  assertApplicationIdentity(application, payload);

  const lan = application.lan;

  const [[duplicate]] = await db.promise().query(
    `SELECT id FROM repayments_upload WHERE utr = ? LIMIT 1`,
    [payload.utr],
  );

  if (duplicate) {
    throw new PartnerApiError(409, "DUPLICATE_UTR", "A repayment with this utr has already been recorded.");
  }

  await db.promise().query(
    `INSERT INTO repayments_upload
     (lan, bank_date, utr, payment_date, payment_id, payment_mode, transfer_amount)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      lan,
      payload.paymentDate,
      payload.utr,
      payload.paymentDate,
      payload.paymentId,
      payload.paymentMode,
      payload.amount,
    ],
  );

  await db.promise().query(`CALL sp_generate_penal_charge(?)`, [lan]);

  await allocateRepaymentByLAN(lan, {
    lan,
    transfer_amount: payload.amount,
    payment_date: payload.paymentDate,
    payment_id: payload.paymentId,
  });

  return {
    statusCode: 200,
    data: {
      status: "REPAYMENT_RECORDED",
    },
  };
}

async function addExtraCharge({ clientId, partnerApplicationId, payload }) {
  const application = await loadApplication(clientId, partnerApplicationId);
  assertApplicationIdentity(application, payload);

  const lan = application.lan;

  await db.promise().query(
    `INSERT INTO loan_charges
     (lan, charge_date, due_date, amount, charge_type, remarks)
     VALUES (?, CURDATE(), ?, ?, ?, ?)`,
    [lan, payload.dueDate, payload.amount, payload.chargeType, payload.remarks || null],
  );

  return {
    statusCode: 200,
    data: {
      status: "CHARGE_ADDED",
    },
  };
}

async function waiveExtraCharge({ clientId, partnerApplicationId, payload }) {
  const application = await loadApplication(clientId, partnerApplicationId);
  assertApplicationIdentity(application, payload);

  const lan = application.lan;

  const [[chargeRow]] = await db.promise().query(
    `SELECT id, amount, paid_amount, waived_amount, waived_off
     FROM loan_charges
     WHERE lan = ?
       AND charge_type = ?
       AND paid_status != 'Paid'
     ORDER BY due_date ASC
     LIMIT 1`,
    [lan, payload.chargeType],
  );

  if (!chargeRow) {
    throw new PartnerApiError(404, "CHARGE_NOT_FOUND", "Charge not found or already settled.");
  }

  const outstanding =
    Number(chargeRow.amount || 0) -
    Number(chargeRow.paid_amount || 0) -
    Number(chargeRow.waived_amount || 0) -
    Number(chargeRow.waived_off || 0);

  const waiverAmount = Number(payload.waiverAmount);

  if (waiverAmount > outstanding) {
    throw new PartnerApiError(
      400,
      "VALIDATION_ERROR",
      "waiverAmount exceeds the outstanding charge amount.",
      { field: "waiverAmount" },
    );
  }

  const newWaivedAmount = Number(chargeRow.waived_amount || 0) + waiverAmount;
  const updatedOutstanding = outstanding - waiverAmount;
  const newStatus = updatedOutstanding <= 0 ? "Waived" : "Partially Waived";

  await db.promise().query(
    `UPDATE loan_charges
     SET waived_amount = ?, waived_off = ?, paid_status = ?
     WHERE id = ?`,
    [newWaivedAmount, waiverAmount, newStatus, chargeRow.id],
  );

  return {
    statusCode: 200,
    data: {
      status: "CHARGE_WAIVED",
    },
  };
}

module.exports = {
  recordRepayment,
  addExtraCharge,
  waiveExtraCharge,
};
