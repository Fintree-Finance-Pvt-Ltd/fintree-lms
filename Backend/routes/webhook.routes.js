const router = require("express").Router();
const controller = require("../controllers/easebuzzWebhook.controller");

router.post("/easebuzz/payout", controller.easebuzzPayoutWebhook);

module.exports = router;
