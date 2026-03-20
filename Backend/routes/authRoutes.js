const express = require('express');
const router = express.Router();
const { login, me, forgotPassword, verifyOtp, resetPassword } = require('../controllers/authcontroller');

router.post('/login', login);
router.get('/me', me);
router.post('/forgot-password', forgotPassword);
router.post('/verify-otp', verifyOtp);
router.post('/reset-password', resetPassword);

module.exports = router;
