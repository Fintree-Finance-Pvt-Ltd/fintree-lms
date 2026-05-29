// const express = require("express");

// const router = express.Router();

// const {
//   createConsent,
//   payuSuccess,
//   payuFailure,
// } = require("./payu.controller");

// router.post("/create-consent", createConsent);

// router.post("/success", payuSuccess);

// router.post("/failure", payuFailure);

// module.exports = router;



const express = require("express");

const router = express.Router();

const {
  createConsent,
  payuSuccess,
  payuFailure,
} = require("./payu.controller");

router.post("/create-consent", createConsent);
router.post("/success", payuSuccess);
router.post("/failure", payuFailure);

module.exports = router;