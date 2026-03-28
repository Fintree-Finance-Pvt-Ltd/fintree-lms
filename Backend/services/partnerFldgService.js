const db = require('../config/db');

// Create FLDG receipt entry
async function createFldgReceipt(conn, partnerId, utrNo, amount, paymentDate, remarks = null) {
  const [result] = await conn.query(
    `INSERT INTO partner_fldg_receipts
     (partner_id, utr_no, fldg_amount, payment_date, remarks)
     VALUES (?, ?, ?, ?, ?)`,
    [partnerId, utrNo, amount, paymentDate, remarks]
  );

  return result.insertId;
}


// Get partner available FLDG balance
async function getPartnerAvailableFldg(conn, partnerId) {

  const [[credit]] = await conn.query(
    `SELECT COALESCE(SUM(fldg_amount),0) AS total_credit
     FROM partner_fldg_receipts
     WHERE partner_id = ?`,
    [partnerId]
  );

  const [[utilized]] = await conn.query(
    `SELECT COALESCE(SUM(amount),0) AS total_utilized
     FROM partner_fldg_utilization
     WHERE partner_id = ?
     AND utilization_type IN ('RESERVED','CONSUMED')`,
    [partnerId]
  );

  const [[released]] = await conn.query(
    `SELECT COALESCE(SUM(amount),0) AS total_released
     FROM partner_fldg_utilization
     WHERE partner_id = ?
     AND utilization_type = 'RELEASED'`,
    [partnerId]
  );

  return (
  Number(credit.total_credit || 0)
  - Number(utilized.total_utilized || 0)
  + Number(released.total_released || 0)
);
}


// Validate FLDG availability before loan booking
async function validateFldgAvailability(conn, partnerId, requiredAmount) {

  const available = await getPartnerAvailableFldg(conn, partnerId);

  return {
    valid: available >= requiredAmount,
    available
  };
}


// Reserve FLDG during booking
async function reserveFldg(conn, partnerId, bookingLan, amount, remarks = null) {

  await conn.query(
    `INSERT INTO partner_fldg_utilization
     (partner_id, booking_lan, utilization_type, amount, remarks)
     VALUES (?, ?, 'RESERVED', ?, ?)`,
    [partnerId, bookingLan, amount, remarks]
  );
}


// Release FLDG (if loan cancelled later)
async function releaseFldg(conn, partnerId, bookingLan, amount, remarks = null) {

  await conn.query(
    `INSERT INTO partner_fldg_utilization
     (partner_id, booking_lan, utilization_type, amount, remarks)
     VALUES (?, ?, 'RELEASED', ?, ?)`,
    [partnerId, bookingLan, amount, remarks]
  );
}


// Get partner FLDG receipts history
async function getPartnerReceipts(conn, partnerId) {

  const [rows] = await conn.query(
    `SELECT *
     FROM partner_fldg_receipts
     WHERE partner_id = ?
     ORDER BY payment_date DESC`,
    [partnerId]
  );

  return rows;
}


// Get partner FLDG utilization ledger
async function getPartnerFldgLedger(conn, partnerId) {

  const [rows] = await conn.query(
    `SELECT *
     FROM partner_fldg_utilization
     WHERE partner_id = ?
     ORDER BY utilization_date DESC`,
    [partnerId]
  );

  return rows;
}


module.exports = {
  createFldgReceipt,
  getPartnerAvailableFldg,
  validateFldgAvailability,
  reserveFldg,
  releaseFldg,
  getPartnerReceipts,
  getPartnerFldgLedger
};