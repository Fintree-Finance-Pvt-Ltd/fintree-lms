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
router.post("/:partnerKey/:lan", async (req, res) => {
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
router.get("/:id/report", async (req, res) => {
  try {
    const report = await getScreeningReport(req.params.id);
    if (!report?.pdfBuffer) {
      return res.status(404).json({ error: "No report available" });
    }

    const buf = Buffer.isBuffer(report.pdfBuffer)
      ? report.pdfBuffer
      : Buffer.from(report.pdfBuffer);

    // ── park the file against the LAN (idempotent) ──
    try {
      const [existing] = await pool.execute(
        `SELECT 1 FROM loan_documents
         WHERE lan = ? AND doc_name = 'AML_REPORT'
           AND JSON_EXTRACT(meta_json, '$.screeningRequestId') = ?
         LIMIT 1`,
        [report.lan, report.screeningRequestId],
      );

      if (!existing.length) {
        const outDir = path.join(__dirname, "../uploads"); // adjust path
        fs.mkdirSync(outDir, { recursive: true });
        const filename = `${report.lan}_${Date.now()}.pdf`;
        fs.writeFileSync(path.join(outDir, filename), buf);

        await pool.execute(
          `INSERT INTO loan_documents
             (lan, file_name, original_name, source_url, doc_name, sub_type, meta_json, uploaded_at)
           VALUES (?, ?, ?, ?, 'AML_REPORT', 'TRACKWIZZ', ?, NOW())`,
          [
            report.lan,
            filename,
            report.fileName,
            `/uploads/${filename}`,
            JSON.stringify({
              partner: report.partnerKey,
              screeningRequestId: report.screeningRequestId,
            }),
          ],
        );
      }
    } catch (parkErr) {
      // don't block the download if parking fails
      console.error("Unable to park AML report", parkErr.message);
    }

    res.setHeader("Content-Type", report.mimeType || "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${report.fileName}"`);
    res.setHeader("Content-Length", buf.length);
    res.setHeader("Cache-Control", "private, no-store");
    res.send(buf);
  } catch (err) {
    const status = err.code === "INVALID_SCREENING_REQUEST_ID" ? 400 : 500;
    res.status(status).json({ error: err.message });
  }
});

/**
 * GET /api/screening/report/:partnerKey/:lan
 * Download the latest PDF by partner + LAN.
 */
router.get("/report/:partnerKey/:lan", downloadScreeningReportByLan);

module.exports = router;