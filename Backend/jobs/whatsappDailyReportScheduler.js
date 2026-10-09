/**
 * whatsappDailyReportScheduler.js
 *
 * Automated daily scheduler for the WhatsApp partner-wise DISBURSED CASE COUNT report.
 * Uses node-cron with explicit 'Asia/Kolkata' timezone.
 *
 * Features:
 *  - Configurable via WHATSAPP_DAILY_REPORT_HOUR & WHATSAPP_DAILY_REPORT_MINUTE.
 *  - Enforces WHATSAPP_AUTO_ENABLED=true gate.
 *  - Respects business hour boundaries WHATSAPP_START_HOUR (9) and WHATSAPP_END_HOUR (20).
 *  - Automatically prevents duplicate execution if the report for the day was already sent.
 *  - Overlap protection ensures one execution at a time.
 */

"use strict";

const cron = require("node-cron");
const {
  getKolkataDateString,
  hasReportBeenSent,
  generateAndSendDailyReport,
  generateAndSendDailyImageReport,
  REPORT_TYPE,
  IMAGE_REPORT_TYPE,
} = require("../services/whatsappDailyReportService");

const TIMEZONE = "Asia/Kolkata";
let isJobRunning = false;

/**
 * Get current hour in Asia/Kolkata timezone.
 */
function getKolkataCurrentHour() {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    hour: "numeric",
    hour12: false,
  });
  return parseInt(formatter.format(new Date()), 10);
}

/**
 * Initialize and start the daily WhatsApp report cron job.
 */
function initWhatsAppReportScheduler() {
  const autoEnabled = String(process.env.WHATSAPP_AUTO_ENABLED || "true").toLowerCase() === "true";
  const reportHour = parseInt(process.env.WHATSAPP_DAILY_REPORT_HOUR, 10) || 20; // Default 20:00 (8:00 PM IST)
  const reportMinute = parseInt(process.env.WHATSAPP_DAILY_REPORT_MINUTE, 10) || 0; // Default minute 0
  const startHour = parseInt(process.env.WHATSAPP_START_HOUR, 10) || 9;
  const endHour = parseInt(process.env.WHATSAPP_END_HOUR, 10) || 20;

  if (!autoEnabled) {
    console.log("[WhatsAppScheduler] WhatsApp automated reporting is disabled (WHATSAPP_AUTO_ENABLED=false). Scheduler will not run.");
    return null;
  }

  // Validate cron schedule within valid range
  const validMinute = Math.min(Math.max(reportMinute, 0), 59);
  const validHour = Math.min(Math.max(reportHour, 0), 23);
  const cronExpression = `${validMinute} ${validHour} * * *`;

  console.log(`[WhatsAppScheduler] Registering daily WhatsApp disbursement report cron: '${cronExpression}' (${TIMEZONE}) [Active hours: ${startHour}:00 - ${endHour}:00]`);

  const task = cron.schedule(
    cronExpression,
    async () => {
      if (isJobRunning) {
        console.warn("[WhatsAppScheduler] Previous report run still in progress. Skipping.");
        return;
      }

      isJobRunning = true;
      try {
        const currentAutoEnabled = String(process.env.WHATSAPP_AUTO_ENABLED || "true").toLowerCase() === "true";
        if (!currentAutoEnabled) {
          console.log("[WhatsAppScheduler] Automated reports disabled at runtime. Skipping.");
          return;
        }

        // Validate business hours
        const currentHour = getKolkataCurrentHour();
        if (currentHour < startHour || currentHour > endHour) {
          console.warn(`[WhatsAppScheduler] Current hour (${currentHour}) is outside configured window (${startHour} - ${endHour}). Skipping.`);
          return;
        }

        const todayKolkata = getKolkataDateString();
        console.log(`[WhatsAppScheduler] Triggering scheduled daily disbursement report for date: ${todayKolkata}`);

        const isSent = await hasReportBeenSent(todayKolkata, REPORT_TYPE);
        if (!isSent) {
          try {
            console.log(`[WhatsAppScheduler] Dispatching daily disbursement IMAGE in document format for date: ${todayKolkata}`);
            const result = await generateAndSendDailyReport({
              date: todayKolkata,
              forceResend: false,
              triggeredBy: "SCHEDULER",
            });
            console.log("[WhatsAppScheduler] Scheduled report completed successfully:", {
              date: result.date,
              totalDisbursedCases: result.totalDisbursedCases,
              partnerCount: result.partnerCount,
              mediaId: result.mediaId,
              file: result.file,
              documentFormat: result.documentFormat,
            });
          } catch (err) {
            console.error("[WhatsAppScheduler] Scheduled report failed:", err.message);
          }
        } else {
          console.log(`[WhatsAppScheduler] Daily report for ${todayKolkata} already sent. Skipping automatic dispatch.`);
        }
      } catch (error) {
        console.error("[WhatsAppScheduler] Error during scheduled report execution:", error.message);
      } finally {
        isJobRunning = false;
      }
    },
    {
      timezone: TIMEZONE,
    }
  );

  return task;
}

// Auto-initialize when required
const schedulerTask = initWhatsAppReportScheduler();

module.exports = {
  initWhatsAppReportScheduler,
  schedulerTask,
};
