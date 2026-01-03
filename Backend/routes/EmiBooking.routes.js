const router = require("express").Router();
const controller = require("../controllers/loanBooking.controller");

router.put("/approve-initiated-loans/:lan", controller.approveInitiatedLoan);

module.exports = router;
