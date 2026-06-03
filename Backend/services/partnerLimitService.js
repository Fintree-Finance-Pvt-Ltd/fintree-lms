// const db = require('../config/db');

// // Get or create partner (upsert)
// async function getOrCreatePartner(conn, partnerName) {
//   if (!partnerName || typeof partnerName !== 'string') {
//     throw new Error('Valid partnerName required');
//   }

//   partnerName = partnerName.trim();

//   // Check existing partner
//   const [existing] = await conn.query(
//     `SELECT partner_id, partner_name, status 
//      FROM partner_master 
//      WHERE partner_name = ?`,
//     [partnerName]
//   );

//   if (existing.length > 0) {
//     return existing[0];
//   }

//   // Insert new partner
//   const [result] = await conn.query(
//     `INSERT INTO partner_master (partner_name, status)
//      VALUES (?, 'active')`,
//     [partnerName]
//   );

//   return {
//     partner_id: result.insertId,
//     partner_name: partnerName,
//     status: 'active'
//   };
// }

// // Get monthly limit record (create if policy allows)
// async function getPartnerMonthlyLimit(conn, partnerId, month, year) {
//   const key = [partnerId, month, year].join('|');

//   let [limits] = await conn.query(
//     `SELECT id, assigned_limit, used_limit, remaining_limit 
//      FROM partner_monthly_limit 
//      WHERE partner_id = ? AND month = ? AND year = ? 
//      FOR UPDATE`,
//     [partnerId, month, year]
//   );

//   if (limits.length === 0) {
//     // Check policy
//     const autoCreate = process.env.AUTO_CREATE_LIMIT === 'true';
//     if (!autoCreate) {
//       throw new Error(`No limit record for partner/month/year`);
//     }

//     // Auto-create with 0 assigned
//     const [result] = await conn.query(
//       `INSERT INTO partner_monthly_limit (partner_id, month, year, assigned_limit, used_limit) 
//        VALUES (?, ?, ?, 0, 0)`,
//       [partnerId, month, year]
//     );

//     // Refetch
//     [limits] = await conn.query(
//       `SELECT id, assigned_limit, used_limit, remaining_limit 
//        FROM partner_monthly_limit WHERE id = ? FOR UPDATE`,
//       [result.insertId]
//     );
//   }

//   return limits[0];
// }

// // Validate limit
// async function validatePartnerLimit(conn, partnerId, loanAmount, month, year) {
//   const limit = await getPartnerMonthlyLimit(conn, partnerId, month, year);
//   const valid = limit.remaining_limit >= loanAmount;
//   return {
//     valid,
//     remaining: limit.remaining_limit,
//     limitId: limit.id,
//     used: limit.used_limit,
//     assigned: limit.assigned_limit
//   };
// }

// // Update used limit + audit (within transaction)
// async function updateUsedLimit(conn, limitId, loanAmount, actionType, bookingLan = null) {
//   const [limit] = await conn.query(
//     'SELECT id, partner_id FROM partner_monthly_limit WHERE id = ? FOR UPDATE',
//     [limitId]
//   );

//   if (!limit.length) throw new Error('Limit record not found');

//   // Update used_limit
//   await conn.query(
//     `UPDATE partner_monthly_limit 
//      SET used_limit = used_limit + ?, updated_at = NOW() 
//      WHERE id = ?`,
//     [actionType === 'BOOKED' ? loanAmount : 0, limitId]
//   );

//   // Audit
//   await conn.query(
//   `INSERT INTO partner_limit_audit (partner_id, booking_lan, loan_amount, month, year, action_type)
//    VALUES (?, ?, ?, 
//            (SELECT month FROM partner_monthly_limit WHERE id=?),
//            (SELECT year FROM partner_monthly_limit WHERE id=?),
//            ?)`,
//   [limit[0].partner_id, bookingLan, loanAmount, limitId, limitId, actionType]
// );
// }

// module.exports = {
//   getOrCreatePartner,
//   getPartnerMonthlyLimit,
//   validatePartnerLimit,
//   updateUsedLimit
// };






const db = require("../config/db");

// Get or create partner
async function getOrCreatePartner(conn, partnerName) {
  if (!partnerName || typeof partnerName !== "string") {
    throw new Error("Valid partnerName required");
  }

  partnerName = partnerName.trim();

  const [existing] = await conn.query(
    `
    SELECT 
      partner_id,
      partner_name,
      status
    FROM partner_master
    WHERE partner_name = ?
    `,
    [partnerName]
  );

  if (existing.length > 0) {
    return existing[0];
  }

  const [result] = await conn.query(
    `
    INSERT INTO partner_master 
      (partner_name, status)
    VALUES (?, 'active')
    `,
    [partnerName]
  );

  return {
    partner_id: result.insertId,
    partner_name: partnerName,
    status: "active",
  };
}

// Get monthly limit record
async function getPartnerMonthlyLimit(conn, partnerId, month, year) {
  let [limits] = await conn.query(
    `
    SELECT 
      id,
      partner_id,
      month,
      year,
      assigned_limit,
      booked_limit,
      used_limit,
      remaining_limit,
      booking_remaining_limit,
      pending_pipeline
    FROM partner_monthly_limit
    WHERE partner_id = ?
      AND month = ?
      AND year = ?
    FOR UPDATE
    `,
    [partnerId, month, year]
  );

  if (limits.length === 0) {
    const autoCreate = process.env.AUTO_CREATE_LIMIT === "true";

    if (!autoCreate) {
      throw new Error("No limit record for partner/month/year");
    }

    const [result] = await conn.query(
      `
      INSERT INTO partner_monthly_limit
        (partner_id, month, year, assigned_limit, booked_limit, used_limit)
      VALUES (?, ?, ?, 0, 0, 0)
      `,
      [partnerId, month, year]
    );

    [limits] = await conn.query(
      `
      SELECT 
        id,
        partner_id,
        month,
        year,
        assigned_limit,
        booked_limit,
        used_limit,
        remaining_limit,
        booking_remaining_limit,
        pending_pipeline
      FROM partner_monthly_limit
      WHERE id = ?
      FOR UPDATE
      `,
      [result.insertId]
    );
  }

  return limits[0];
}

// Validate booking/login limit
async function validatePartnerBookingLimit(
  conn,
  partnerId,
  loanAmount,
  month,
  year
) {
  const amount = Number(loanAmount || 0);

  if (amount <= 0) {
    throw new Error("INVALID_LOAN_AMOUNT");
  }

  const limit = await getPartnerMonthlyLimit(conn, partnerId, month, year);

  const bookingRemaining =
    Number(limit.assigned_limit || 0) - Number(limit.booked_limit || 0);

  const valid = bookingRemaining >= amount;

  return {
    valid,
    remaining: bookingRemaining,
    bookingRemaining,
    limitId: limit.id,
    booked: Number(limit.booked_limit || 0),
    used: Number(limit.used_limit || 0),
    assigned: Number(limit.assigned_limit || 0),
  };
}

// Validate disbursement limit
async function validatePartnerDisbursementLimit(
  conn,
  partnerId,
  loanAmount,
  month,
  year
) {
  const amount = Number(loanAmount || 0);

  if (amount <= 0) {
    throw new Error("INVALID_LOAN_AMOUNT");
  }

  const limit = await getPartnerMonthlyLimit(conn, partnerId, month, year);

  const disbursementRemaining =
    Number(limit.assigned_limit || 0) - Number(limit.used_limit || 0);

  const valid = disbursementRemaining >= amount;

  return {
    valid,
    remaining: disbursementRemaining,
    disbursementRemaining,
    limitId: limit.id,
    booked: Number(limit.booked_limit || 0),
    used: Number(limit.used_limit || 0),
    assigned: Number(limit.assigned_limit || 0),
  };
}

// Backward compatibility.
// Existing booking code calling validatePartnerLimit will now validate booking capacity.
async function validatePartnerLimit(conn, partnerId, loanAmount, month, year) {
  return validatePartnerBookingLimit(conn, partnerId, loanAmount, month, year);
}

// Increase booked/login pipeline
async function updateBookedLimit(conn, limitId, loanAmount, bookingLan = null) {
  const amount = Number(loanAmount || 0);

  if (amount <= 0) {
    throw new Error("INVALID_BOOKING_AMOUNT");
  }

  const [[limit]] = await conn.query(
    `
    SELECT 
      id,
      partner_id,
      month,
      year,
      assigned_limit,
      booked_limit
    FROM partner_monthly_limit
    WHERE id = ?
    FOR UPDATE
    `,
    [limitId]
  );

  if (!limit) {
    throw new Error("Limit record not found");
  }

  if (bookingLan) {
    const [[alreadyBooked]] = await conn.query(
      `
      SELECT id
      FROM partner_limit_audit
      WHERE booking_lan = ?
        AND action_type = 'BOOKED'
      LIMIT 1
      `,
      [bookingLan]
    );

    if (alreadyBooked) {
      return {
        skipped: true,
        reason: "BOOKED_LIMIT_ALREADY_UPDATED",
      };
    }
  }

  const bookingRemaining =
    Number(limit.assigned_limit || 0) - Number(limit.booked_limit || 0);

  if (bookingRemaining < amount) {
    const err = new Error("BOOKING_LIMIT_EXCEEDED");
    err.meta = {
      remaining: bookingRemaining,
      required: amount,
    };
    throw err;
  }

  await conn.query(
    `
    UPDATE partner_monthly_limit
    SET booked_limit = booked_limit + ?,
        updated_at = NOW()
    WHERE id = ?
    `,
    [amount, limitId]
  );

  await conn.query(
    `
    INSERT INTO partner_limit_audit
      (partner_id, booking_lan, loan_amount, month, year, action_type)
    VALUES (?, ?, ?, ?, ?, 'BOOKED')
    `,
    [limit.partner_id, bookingLan, amount, limit.month, limit.year]
  );

  return {
    skipped: false,
    updated: true,
  };
}

// Increase disbursed/used pipeline
async function updateDisbursedLimit(
  conn,
  limitId,
  loanAmount,
  bookingLan = null
) {
  const amount = Number(loanAmount || 0);

  if (amount <= 0) {
    throw new Error("INVALID_DISBURSEMENT_AMOUNT");
  }

  const [[limit]] = await conn.query(
    `
    SELECT 
      id,
      partner_id,
      month,
      year,
      assigned_limit,
      used_limit
    FROM partner_monthly_limit
    WHERE id = ?
    FOR UPDATE
    `,
    [limitId]
  );

  if (!limit) {
    throw new Error("Limit record not found");
  }

  if (bookingLan) {
    const [[alreadyDisbursed]] = await conn.query(
      `
      SELECT id
      FROM partner_limit_audit
      WHERE booking_lan = ?
        AND action_type = 'DISBURSED'
      LIMIT 1
      `,
      [bookingLan]
    );

    if (alreadyDisbursed) {
      return {
        skipped: true,
        reason: "DISBURSED_LIMIT_ALREADY_UPDATED",
      };
    }
  }

  const disbursementRemaining =
    Number(limit.assigned_limit || 0) - Number(limit.used_limit || 0);

  if (disbursementRemaining < amount) {
    const err = new Error("DISBURSEMENT_LIMIT_EXCEEDED");
    err.meta = {
      remaining: disbursementRemaining,
      required: amount,
    };
    throw err;
  }

  await conn.query(
    `
    UPDATE partner_monthly_limit
    SET used_limit = used_limit + ?,
        updated_at = NOW()
    WHERE id = ?
    `,
    [amount, limitId]
  );

  await conn.query(
    `
    INSERT INTO partner_limit_audit
      (partner_id, booking_lan, loan_amount, month, year, action_type)
    VALUES (?, ?, ?, ?, ?, 'DISBURSED')
    `,
    [limit.partner_id, bookingLan, amount, limit.month, limit.year]
  );

  return {
    skipped: false,
    updated: true,
  };
}

// Reduce booked pipeline if loan is cancelled/rejected before disbursement
async function reverseBookedLimit(
  conn,
  limitId,
  loanAmount,
  actionType,
  bookingLan = null
) {
  const amount = Number(loanAmount || 0);

  if (!["REJECTED", "CANCELLED"].includes(actionType)) {
    throw new Error("INVALID_REVERSE_ACTION");
  }

  if (amount <= 0) {
    throw new Error("INVALID_REVERSE_AMOUNT");
  }

  const [[limit]] = await conn.query(
    `
    SELECT 
      id,
      partner_id,
      month,
      year,
      booked_limit
    FROM partner_monthly_limit
    WHERE id = ?
    FOR UPDATE
    `,
    [limitId]
  );

  if (!limit) {
    throw new Error("Limit record not found");
  }

  if (bookingLan) {
    const [[alreadyReversed]] = await conn.query(
      `
      SELECT id
      FROM partner_limit_audit
      WHERE booking_lan = ?
        AND action_type = ?
      LIMIT 1
      `,
      [bookingLan, actionType]
    );

    if (alreadyReversed) {
      return {
        skipped: true,
        reason: `${actionType}_LIMIT_ALREADY_UPDATED`,
      };
    }
  }

  await conn.query(
    `
    UPDATE partner_monthly_limit
    SET booked_limit = GREATEST(booked_limit - ?, 0),
        updated_at = NOW()
    WHERE id = ?
    `,
    [amount, limitId]
  );

  await conn.query(
    `
    INSERT INTO partner_limit_audit
      (partner_id, booking_lan, loan_amount, month, year, action_type)
    VALUES (?, ?, ?, ?, ?, ?)
    `,
    [limit.partner_id, bookingLan, amount, limit.month, limit.year, actionType]
  );

  return {
    skipped: false,
    updated: true,
  };
}

// Backward compatibility for old calls
async function updateUsedLimit(
  conn,
  limitId,
  loanAmount,
  actionType,
  bookingLan = null
) {
  if (actionType === "BOOKED") {
    return updateBookedLimit(conn, limitId, loanAmount, bookingLan);
  }

  if (actionType === "DISBURSED") {
    return updateDisbursedLimit(conn, limitId, loanAmount, bookingLan);
  }

  throw new Error(`Unsupported actionType: ${actionType}`);
}

module.exports = {
  getOrCreatePartner,
  getPartnerMonthlyLimit,

  validatePartnerLimit,
  validatePartnerBookingLimit,
  validatePartnerDisbursementLimit,

  updateBookedLimit,
  updateDisbursedLimit,
  reverseBookedLimit,

  updateUsedLimit,
};