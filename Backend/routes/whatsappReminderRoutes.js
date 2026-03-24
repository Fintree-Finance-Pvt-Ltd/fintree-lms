/**
 * WhatsApp Reminder Routes
 * 
 * API endpoints for triggering WhatsApp reminders and viewing logs
 */

const express = require("express");
const router = express.Router();
const { 
  triggerReminderService, 
  getWhatsAppLogs,
  initializeWhatsAppLogsTable 
} = require("../services/WhatsAppDueDateReminderService");

/**
 * POST /api/whatsapp-reminder/trigger
 * 
 * Manually trigger the WhatsApp reminder service
 * 
 * Query params (optional):
 * - testMode: boolean - If true, only process 5 records per table
 */
router.post("/trigger", async (req, res) => {
  try {
    console.log("Manual WhatsApp reminder trigger initiated");
    
    const result = await triggerReminderService();
    
    if (result.success) {
      res.status(200).json({
        success: true,
        message: "WhatsApp reminder service completed successfully",
        summary: {
          tablesScanned: result.tablesScanned,
          totalEMIsFound: result.totalEMIsFound,
          messagesSent: result.messagesSent,
          messagesFailed: result.messagesFailed,
          skipped: result.skipped
        }
      });
    } else {
      res.status(500).json({
        success: false,
        message: result.message
      });
    }
  } catch (error) {
    console.error("Error triggering WhatsApp reminder service:", error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/whatsapp-reminder/logs
 * 
 * Get WhatsApp message logs
 * 
 * Query params:
 * - limit: number (default 50)
 * - offset: number (default 0)
 * - lan: string (optional) - Filter by LAN
 * - status: string (optional) - Filter by status (sent, failed, skipped)
 * - date: string (optional) - Filter by date (YYYY-MM-DD)
 */
router.get("/logs", async (req, res) => {
  try {
    const { limit, offset, lan, status, date } = req.query;
    
    const logs = await getWhatsAppLogs({
      limit: limit ? parseInt(limit) : 50,
      offset: offset ? parseInt(offset) : 0,
      lan,
      status,
      date
    });
    
    res.status(200).json({
      success: true,
      count: logs.length,
      data: logs
    });
  } catch (error) {
    console.error("Error fetching WhatsApp logs:", error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/whatsapp-reminder/init-logs
 * 
 * Initialize the WhatsApp logs table (create if not exists)
 */
router.post("/init-logs", async (req, res) => {
  try {
    await initializeWhatsAppLogsTable();
    
    res.status(200).json({
      success: true,
      message: "WhatsApp logs table initialized successfully"
    });
  } catch (error) {
    console.error("Error initializing WhatsApp logs table:", error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/whatsapp-reminder/stats
 * 
 * Get WhatsApp reminder statistics
 */
router.get("/stats", async (req, res) => {
  try {
    const db = require("../config/db");
    
    // Get today's stats
    const today = new Date().toISOString().split("T")[0];
    
    const [todayStats] = await db.promise().query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) as skipped
      FROM whatsapp_logs
      WHERE DATE(sent_at) = ?
    `, [today]);
    
    // Get all-time stats
    const [allTimeStats] = await db.promise().query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) as skipped
      FROM whatsapp_logs
    `);
    
    // Get unique LANs contacted
    const [uniqueLANs] = await db.promise().query(`
      SELECT COUNT(DISTINCT lan) as unique_lans
      FROM whatsapp_logs
      WHERE status = 'sent'
    `);
    
    res.status(200).json({
      success: true,
      today: todayStats[0],
      allTime: allTimeStats[0],
      uniqueLANsContacted: uniqueLANs[0].unique_lans
    });
  } catch (error) {
    console.error("Error fetching WhatsApp stats:", error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = router;
