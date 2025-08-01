const express = require('express');
const router = express.Router();
const { login, me } = require('../controllers/authController');

router.post('/login', login);
router.get('/me', me);

module.exports = router;
