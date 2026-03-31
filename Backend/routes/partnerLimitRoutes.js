const express = require('express');
const db = require('../config/db');
const partnerLimitService = require('../services/partnerLimitService');

const router = express.Router();

router.get("/partners-list", async (req, res) => {

  try {

    const [rows] = await db.promise().query(`
      SELECT
        partner_id,
        partner_name,
        status,
        fldg_percent,
        fldg_status
      FROM partner_master
      ORDER BY partner_name
    `);

    res.json(rows);

  } catch (err) {

    res.status(500).json({
      message: "Failed to fetch partners",
      error: err.message
    });

  }

});


router.put("/:partnerId/fldg", async (req, res) => {

  try {

    const { partnerId } = req.params;

    const {
      fldg_percent,
      fldg_status
    } = req.body;

    await db.promise().query(
      `
      UPDATE partner_master
      SET
        fldg_status = ?
      WHERE partner_id = ?
      `,
      [fldg_status, partnerId]
    );

    res.json({
      message: "FLDG updated successfully"
    });

  } catch (err) {

    res.status(500).json({
      message: "Update failed",
      error: err.message
    });

  }

});


router.put("/:partnerId/status", async (req, res) => {

  try {

    const { partnerId } = req.params;

    const { status } = req.body;

    await db.promise().query(
      `
      UPDATE partner_master
      SET status = ?
      WHERE partner_id = ?
      `,
      [status, partnerId]
    );

    res.json({
      message: "Partner status updated"
    });

  } catch (err) {

    res.status(500).json({
      message: "Status update failed",
      error: err.message
    });

  }

});

// GET /api/partners - List all partners with current monthly limits
router.get('/partners', async (req, res) => {
  try {
    const { month, year } = req.query;
    const m = parseInt(month) || new Date().getMonth() + 1;
    const y = parseInt(year) || new Date().getFullYear();

    const [partners] = await db.promise().query(`
      SELECT 
        pm.partner_id, 
        pm.partner_name, 
        pm.status,
        pm.fldg_percent,
  pm.fldg_status,
        pml.id as limit_id,
        pml.assigned_limit,
        pml.used_limit, 
        pml.remaining_limit,
        pml.month,
        pml.year
      FROM partner_master pm
      LEFT JOIN partner_monthly_limit pml ON pm.partner_id = pml.partner_id 
        AND pml.month = ? AND pml.year = ?
      ORDER BY pm.partner_name
    `, [m, y]);

    res.json({
      month: m,
      year: y,
      partners
    });
  } catch (err) {
    console.error('Partner list error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/partners - Create new partner
router.post('/partners', async (req, res) => {
  const conn = await db.promise().getConnection();

  try {
    const { partner_name } = req.body;

    if (!partner_name || partner_name.trim() === '') {
      return res.status(400).json({ error: 'partner_name required' });
    }

    const partner = await partnerLimitService.getOrCreatePartner(
      conn,
      partner_name
    );

    res.status(201).json({
      message: 'Partner created successfully',
      partner
    });

  } catch (err) {
    console.error('Partner create error:', err);
    res.status(500).json({ error: err.message });

  } finally {
    conn.release();
  }
});

// POST /api/partners/:name/limits - Set monthly limit
router.post('/partners/:name/limits', async (req, res) => {
  try {
    const { name } = req.params;
    const { month, year, assigned_limit } = req.body;
    if (!month || !year || assigned_limit == null) {
      return res.status(400).json({ error: 'month, year, assigned_limit required' });
    }

    const conn = await db.promise().getConnection();
    await conn.beginTransaction();

    try {
      const partner = await partnerLimitService.getOrCreatePartner(conn, name);
      let limitId;

      // Get or create limit record
      try {
        const limit = await partnerLimitService.getPartnerMonthlyLimit(conn, partner.partner_id, month, year);
        limitId = limit.id;
      } catch {
        // Create if not exists (ignore auto-create policy here)
        const [result] = await conn.query(
          `INSERT INTO partner_monthly_limit (partner_id, month, year, assigned_limit, used_limit) 
           VALUES (?, ?, ?, ?, 0)`,
          [partner.partner_id, month, year, assigned_limit]
        );
        limitId = result.insertId;
      }

      // Update assigned limit
      await conn.query(
        `UPDATE partner_monthly_limit SET assigned_limit = ?, updated_at = NOW() WHERE id = ?`,
        [assigned_limit, limitId]
      );

      await conn.commit();
      conn.release();

      res.json({ message: 'Limit updated', limit_id: limitId });
    } catch (err) {
      await conn.rollback();
      conn.release();
      throw err;
    }
  } catch (err) {
    console.error('Limit set error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/partners/:name/limits - Get partner limits history
router.get('/partners/:name/limits', async (req, res) => {
  try {
    const { name } = req.params;
    const { year } = req.query;

    const [partner] = await db.promise().query(
      'SELECT partner_id FROM partner_master WHERE partner_name = ?',
      [name]
    );
    if (!partner.length) return res.status(404).json({ error: 'Partner not found' });

    const [limits] = await db.promise().query(
      `SELECT month, year, assigned_limit, used_limit, remaining_limit 
       FROM partner_monthly_limit 
       WHERE partner_id = ?${year ? ' AND year = ?' : ''}
       ORDER BY year DESC, month DESC`,
      [partner[0].partner_id, ...(year ? [year] : [])]
    );

    const [audits] = await db.promise().query(
      `SELECT a.*, pm.partner_name, lb.lan as booking_lan
       FROM partner_limit_audit a
       JOIN partner_master pm ON a.partner_id = pm.partner_id
       LEFT JOIN loan_bookings lb ON a.booking_lan = lb.lan
       WHERE pm.partner_name = ?
       ORDER BY a.created_at DESC
       LIMIT 100`,
      [name]
    );

    res.json({ limits, recent_audits: audits });
  } catch (err) {
    console.error('Partner limits error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

