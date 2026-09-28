const express = require("express");

const router = express.Router();

/**
 * Fintree Personal Loan configuration
 *
 * These values are temporary until the final database
 * table and LAN configuration are confirmed.
 */
const FINTREE_PERSONAL_LOAN_CONFIG = Object.freeze({
  lenderName: "Fintree Personal Loan",
  lenderType: "FINTREE-PERSONAL-LOAN",
  lanPrefix: "PLF",
  tableName: "loan_booking_fintree_personal_loan",
});

/**
 * Health-check endpoint
 *
 * GET /fintree-personal-loan/health
 */
router.get("/health", (req, res) => {
  return res.status(200).json({
    success: true,
    message: "Fintree Personal Loan routes are active",
    data: {
      lenderName: FINTREE_PERSONAL_LOAN_CONFIG.lenderName,
      lenderType: FINTREE_PERSONAL_LOAN_CONFIG.lenderType,
      lanPrefix: FINTREE_PERSONAL_LOAN_CONFIG.lanPrefix,
      tableName: FINTREE_PERSONAL_LOAN_CONFIG.tableName,
      backendReady: false,
    },
  });
});

/**
 * Partner APIs will be added later:
 *
 * POST /v1/loan/assessment-fee
 * POST /v1/create
 * PUT  /v1/update-details
 * POST /v1/run-bre
 * POST /v1/approve
 * POST /v1/disburse
 * GET  /v1/status/:partnerLoanId
 */

module.exports = router;