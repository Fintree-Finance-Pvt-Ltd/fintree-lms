const express = require('express');
const router = express.Router();
const db = require('../config/db');
const verifyToken = require('../middleware/verifyToken');

// Fetch failed and initiated payouts
router.get('/failed-payouts', verifyToken, async (req, res) => {
  try {
    const [rows] = await db.promise().query(
      `SELECT *
       FROM quick_transfers 
       WHERE LOWER(status) IN ('initiated', 'failure') 
       ORDER BY created_at DESC`
    );

    // Parse the JSON safely to extract the failure reason
    const data = rows.map(row => {
      let failureReason = "N/A";
      try {
        const rawJson = row.raw_api_response || row.raw_Api_rseponse;
        if (rawJson) {
          const parsed = typeof rawJson === 'string' ? JSON.parse(rawJson) : rawJson;
          if (parsed?.data?.transfer_request?.failure_reason) {
            failureReason = parsed.data.transfer_request.failure_reason;
          } else if (parsed?.message) {
             failureReason = parsed.message;
          }
        }
      } catch (e) {
        failureReason = "Invalid Response Format";
      }

      return {
        id: row.id,
        lan: row.lan,
        status: row.status,
        failure_reason: failureReason,
        created_at: row.created_at
      };
    });

    res.json(data);
  } catch (err) {
    console.error("Error fetching failed payouts:", err);
    res.status(500).json({ message: "Server error fetching payouts" });
  }
});

// Reinitiate payout
router.post('/reinitiate', verifyToken, async (req, res) => {
  const { id, lan } = req.body;
  if (!id || !lan) return res.status(400).json({ message: "ID and LAN required" });

  try {
    // 1. Delete from quick_transfers
    await db.promise().query('DELETE FROM quick_transfers WHERE id = ?', [id]);

    // 2. Set status to BRE_APPROVED in correct loan booking table based on LAN prefix
    let table = null;
    if (lan.startsWith('RML')) {
      table = 'loan_booking_switch_my_loan';
    } else if (lan.startsWith('QML')) {
      table = 'loan_booking_quick_money';
    } else {
      return res.status(400).json({ message: "Unknown LAN prefix. Cannot determine loan booking table." });
    }

    await db.promise().query(
      `UPDATE ?? SET status = 'BRE_APPROVED' WHERE lan = ?`,
      [table, lan]
    );

    // 3. Call the payout service to actually initiate the transfer
    const payoutService = require('../services/payout.service');
    const payoutResult = await payoutService.approveAndInitiatePayout({ lan, table });

    if (payoutResult && payoutResult.success === false) {
       return res.status(400).json({ 
         message: payoutResult.message || "Payout initiation failed from provider.",
         details: payoutResult
       });
    }

    res.json({ 
      message: "Payout reinitiated successfully.", 
      lan,
      payoutResult 
    });
  } catch (err) {
    console.error("Error reinitiating payout:", err);
    res.status(500).json({ message: "Failed to reinitiate payout" });
  }
});

module.exports = router;
