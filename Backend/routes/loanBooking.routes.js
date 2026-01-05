const express = require("express");
const router = express.Router();
const { approveAndInitiatePayout } = require("../services/payout.service");

router.put(
  "/approve-initiated-loans/:lan",
  approveAndInitiatePayout
);

module.exports = router;
