const db = require('../config/db');

// Get or create partner (upsert)
async function getOrCreatePartner(conn, partnerName) {
  if (!partnerName || typeof partnerName !== 'string') {
    throw new Error('Valid partnerName required');
  }

  partnerName = partnerName.trim();

  // Check existing partner
  const [existing] = await conn.query(
    `SELECT partner_id, partner_name, status 
     FROM partner_master 
     WHERE partner_name = ?`,
    [partnerName]
  );

  if (existing.length > 0) {
    return existing[0];
  }

  // Insert new partner
  const [result] = await conn.query(
    `INSERT INTO partner_master (partner_name, status)
     VALUES (?, 'active')`,
    [partnerName]
  );

  return {
    partner_id: result.insertId,
    partner_name: partnerName,
    status: 'active'
  };
}

// Get monthly limit record (create if policy allows)
async function getPartnerMonthlyLimit(conn, partnerId, month, year) {
  const key = [partnerId, month, year].join('|');

  let [limits] = await conn.query(
    `SELECT id, assigned_limit, used_limit, remaining_limit 
     FROM partner_monthly_limit 
     WHERE partner_id = ? AND month = ? AND year = ? 
     FOR UPDATE`,
    [partnerId, month, year]
  );

  if (limits.length === 0) {
    // Check policy
    const autoCreate = process.env.AUTO_CREATE_LIMIT === 'true';
    if (!autoCreate) {
      throw new Error(`No limit record for partner/month/year`);
    }

    // Auto-create with 0 assigned
    const [result] = await conn.query(
      `INSERT INTO partner_monthly_limit (partner_id, month, year, assigned_limit, used_limit) 
       VALUES (?, ?, ?, 0, 0)`,
      [partnerId, month, year]
    );

    // Refetch
    [limits] = await conn.query(
      `SELECT id, assigned_limit, used_limit, remaining_limit 
       FROM partner_monthly_limit WHERE id = ? FOR UPDATE`,
      [result.insertId]
    );
  }

  return limits[0];
}

// Validate limit
async function validatePartnerLimit(conn, partnerId, loanAmount, month, year) {
  const limit = await getPartnerMonthlyLimit(conn, partnerId, month, year);
  const valid = limit.remaining_limit >= loanAmount;
  return {
    valid,
    remaining: limit.remaining_limit,
    limitId: limit.id,
    used: limit.used_limit,
    assigned: limit.assigned_limit
  };
}

// Update used limit + audit (within transaction)
async function updateUsedLimit(conn, limitId, loanAmount, actionType, bookingLan = null) {
  const [limit] = await conn.query(
    'SELECT id, partner_id FROM partner_monthly_limit WHERE id = ? FOR UPDATE',
    [limitId]
  );

  if (!limit.length) throw new Error('Limit record not found');

  // Update used_limit
  await conn.query(
    `UPDATE partner_monthly_limit 
     SET used_limit = used_limit + ?, updated_at = NOW() 
     WHERE id = ?`,
    [actionType === 'BOOKED' ? loanAmount : 0, limitId]
  );

  // Audit
  await conn.query(
  `INSERT INTO partner_limit_audit (partner_id, booking_lan, loan_amount, month, year, action_type)
   VALUES (?, ?, ?, 
           (SELECT month FROM partner_monthly_limit WHERE id=?),
           (SELECT year FROM partner_monthly_limit WHERE id=?),
           ?)`,
  [limit[0].partner_id, bookingLan, loanAmount, limitId, limitId, actionType]
);
}

module.exports = {
  getOrCreatePartner,
  getPartnerMonthlyLimit,
  validatePartnerLimit,
  updateUsedLimit
};

