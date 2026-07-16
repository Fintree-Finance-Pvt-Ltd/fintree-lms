const express = require("express");
const router = express.Router();

const {
  screenLead,
  screenLoanBooking,
  getScreeningReport,
  downloadScreeningReportByLan,
} = require("../services/trackwizz/screeningService");

/**
 * POST /api/screening/:partnerKey/lan/:lan
 * Screens a partner booking by LAN and writes aml_* columns back.
 * Example: POST /api/screening/switch_my_loan/lan/LDF00123
 */
router.post("/:partnerKey/lan/:lan", async (req, res) => {
  try {
    const outcome = await screenLoanBooking(req.params.partnerKey, req.params.lan);
    res.status(200).json({
      decision: outcome.decision,
      amlStatus: outcome.amlStatus,
      amlScore: outcome.amlScore,
      hitsCount: outcome.hitsCount ?? 0,
      reason: outcome.amlReason,
      screeningRequestId: outcome.screeningRequestId,
      reportStored: outcome.reportStored || false,
      degraded: outcome.degraded || false,
    });
  } catch (err) {
    const inputErrors = [
      "UNKNOWN_PARTNER", "INVALID_LAN", "LEAD_NOT_FOUND",
      "DUPLICATE_LAN", "NO_IDENTITY_FIELD", "NO_IDENTIFIER",
    ];
    res
      .status(inputErrors.includes(err.code) ? 400 : 500)
      .json({ error: err.message, code: err.code || "SCREENING_FAILED" });
  }
});

/**
 * POST /api/screening/lead
 * Ad-hoc screening without touching the loan table (testing).
 */
router.post("/lead", async (req, res) => {
  try {
    const outcome = await screenLead(req.body);
    res.status(200).json(outcome);
  } catch (err) {
    res.status(400).json({ error: err.message, code: err.code });
  }
});

/**
 * GET /api/screening/:id/report
 * Download the PDF by screening-request id.
 */
router.get("/:id(\\d+)/report", async (req, res) => {
  try {
    const report = await getScreeningReport(req.params.id);
    if (!report?.pdfBuffer) {
      return res.status(404).json({ error: "No report available" });
    }
    const buf = Buffer.isBuffer(report.pdfBuffer)
      ? report.pdfBuffer
      : Buffer.from(report.pdfBuffer);
    res.setHeader("Content-Type", report.mimeType || "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${report.fileName}"`);
    res.setHeader("Content-Length", buf.length);
    res.setHeader("Cache-Control", "private, no-store");
    res.send(buf);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/screening/report/:partnerKey/:lan
 * Download the latest PDF by partner + LAN.
 */
router.get("/report/:partnerKey/:lan", downloadScreeningReportByLan);

module.exports = router;