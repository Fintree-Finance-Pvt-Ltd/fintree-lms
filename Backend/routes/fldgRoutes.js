const express = require('express');
const db = require('../config/db');
const fldgService = require('../services/partnerFldgService');

const router = express.Router();


/*
POST /api/fldg/receipts
Create FLDG receipt entry
*/
router.post('/receipts', async (req, res) => {

  const conn = await db.promise().getConnection();

  try {

    const {
      partner_id,
      utr_no,
      fldg_amount,
      payment_date,
      remarks
    } = req.body;

    if (!partner_id || !utr_no || !fldg_amount || !payment_date) {
      return res.status(400).json({
        error: 'partner_id, utr_no, fldg_amount, payment_date required'
      });
    }

    await conn.beginTransaction();

    const receiptId = await fldgService.createFldgReceipt(
      conn,
      partner_id,
      utr_no,
      fldg_amount,
      payment_date,
      remarks
    );

    await conn.commit();

    res.json({
      message: 'FLDG receipt added successfully',
      receipt_id: receiptId
    });

  } catch (err) {

    await conn.rollback();

    console.error('FLDG receipt error:', err);

    res.status(500).json({ error: err.message });

  } finally {

    conn.release();

  }

});


/*
GET /api/fldg/summary/:partnerId
Get partner FLDG summary
*/
router.get('/summary/:partnerId', async (req, res) => {

  try {

    const partnerId = req.params.partnerId;

    const conn = await db.promise().getConnection();

    const available = await fldgService.getPartnerAvailableFldg(
      conn,
      partnerId
    );

    conn.release();

    res.json({
      partner_id: partnerId,
      remaining_amount: Number(available || 0)
    });

  } catch (err) {

    console.error('FLDG summary error:', err);

    res.status(500).json({ error: err.message });

  }

});

/*
GET /api/fldg/summary
Get FLDG summary for all partners
*/
router.get('/summary', async (req, res) => {

  try {

    const [rows] = await db.promise().query(`
      SELECT 
        pm.partner_id,
        pm.partner_name,
        pm.fldg_percent,

        COALESCE((
          SELECT SUM(fldg_amount)
          FROM partner_fldg_receipts r
          WHERE r.partner_id = pm.partner_id
        ), 0) AS total_received,

        COALESCE((
          SELECT SUM(amount)
          FROM partner_fldg_utilization u
          WHERE u.partner_id = pm.partner_id
          AND utilization_type IN ('RESERVED','CONSUMED')
        ), 0) AS utilized_amount,

        COALESCE((
          SELECT SUM(amount)
          FROM partner_fldg_utilization u
          WHERE u.partner_id = pm.partner_id
          AND utilization_type = 'RELEASED'
        ), 0) AS released_amount

      FROM partner_master pm
      ORDER BY pm.partner_name
    `);

    const formatted = rows.map(r => ({
      ...r,
      total_received: Number(r.total_received || 0),
  utilized_amount: Number(r.utilized_amount || 0),
  released_amount: Number(r.released_amount || 0),

  remaining_amount:
    Number(r.total_received || 0)
    - Number(r.utilized_amount || 0)
    + Number(r.released_amount || 0)
    }));

    res.json(formatted);

  } catch (err) {

    console.error('FLDG summary list error:', err);

    res.status(500).json({ error: err.message });

  }

});


/*
GET /api/fldg/receipts/:partnerId
Get receipts history
*/
router.get('/receipts/:partnerId', async (req, res) => {

  try {

    const conn = await db.promise().getConnection();

    const rows = await fldgService.getPartnerReceipts(
      conn,
      req.params.partnerId
    );

    conn.release();

    res.json(rows);

  } catch (err) {

    console.error('Receipts fetch error:', err);

    res.status(500).json({ error: err.message });

  }

});


/*
GET /api/fldg/ledger/:partnerId
Get utilization ledger
*/
/*
GET /api/fldg/ledger/:partnerId
Combined ledger: receipts + utilization
*/
/*
GET /api/fldg/ledger/:partnerId
Combined ledger + partner name
*/
router.get('/ledger/:partnerId', async (req, res) => {

  try {

    const partnerId = req.params.partnerId;

    // fetch partner name
    const [[partner]] = await db.promise().query(
      `SELECT partner_name FROM partner_master WHERE partner_id = ?`,
      [partnerId]
    );

    if (!partner) {
      return res.status(404).json({ error: "Partner not found" });
    }

    const [rows] = await db.promise().query(`
      SELECT
        id,
        'CREDIT' AS entry_type,
        utr_no AS reference,
        fldg_amount AS amount,
        payment_date AS entry_date,
        remarks,
        created_at
      FROM partner_fldg_receipts
      WHERE partner_id = ?

      UNION ALL

      SELECT
        id,
        utilization_type AS entry_type,
        booking_lan AS reference,
        amount,
        utilization_date AS entry_date,
        remarks,
        created_at
      FROM partner_fldg_utilization
      WHERE partner_id = ?

      ORDER BY entry_date DESC
    `, [partnerId, partnerId]);

    res.json({
      partner_name: partner.partner_name,
      ledger: rows
    });

  } catch (err) {

    console.error('Ledger fetch error:', err);

    res.status(500).json({ error: err.message });

  }

});


module.exports = router;