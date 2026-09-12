const express = require("express");
const router = express.Router();

const {
  autoApproveCarePayIfBureauVerified,
} = require("../CarePay/carePayBreEngine");

router.post("/carepay/:lan/rerun-bre", async (req, res) => {
  try {
    const lan = String(req.params.lan || "")
      .trim()
      .toUpperCase();

    if (!lan) {
      return res.status(400).json({
        success: false,
        message: "LAN is required",
      });
    }

    const result = await autoApproveCarePayIfBureauVerified(lan);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: "BRE could not be re-run",
        ...result,
      });
    }

    return res.status(200).json({
      success: true,
      message: "CarePay BRE re-run completed successfully",
      data: result,
    });
  } catch (error) {
    console.error("[CAREPAY-RERUN-BRE]", error);

    return res.status(500).json({
      success: false,
      message: "Failed to re-run CarePay BRE",
      error: error.message,
    });
  }
});

module.exports = router;