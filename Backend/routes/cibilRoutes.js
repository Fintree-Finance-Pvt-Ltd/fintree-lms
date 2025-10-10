const express = require('express');
const router = express.Router();
const { generateForLan, generateForAll } = require('../controllers/cibilController');

router.post('/cibil/:lan/generate', generateForLan);
router.post('/cibil/generate-all', generateForAll);

module.exports = router;
