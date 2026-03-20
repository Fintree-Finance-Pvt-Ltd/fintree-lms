const db = require('../config/db');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { sendResetOtp } = require('../jobs/mailer');

// ✅ LOGIN — sign token with .env secret
exports.login = (req, res) => {
console.log("🔥 Login route hit with body:", req.body);
 const { email, password } = req.body;

  db.query('SELECT * FROM users WHERE email = ?', [email], async (err, results) => {
	console.log("inside the query");
    if (err) return res.status(500).json({ message: 'Database error' });
    if (!results.length) return res.status(401).json({ message: 'Invalid credentials' });

    const user = results[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: 'Invalid credentials' });

    // ✅ Sign token with SAME secret as .env
    const token = jwt.sign(
      { id: user.id, role: user.role, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    res.json({
      token,
      user: { id: user.id, name: user.name, role: user.role }
    });
  });
};

// ✅ ME — verify token with SAME secret as .env
exports.me = (req, res) => {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.split(" ")[1];

  if (!token) return res.status(401).json({ message: "No token provided" });

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return res.status(401).json({ message: "Invalid or expired token" });

    const userId = decoded.id;
    const role = decoded.role;
    const name = decoded.name;

    if (role === "admin") {
      db.query("SELECT * FROM pages", (err2, pages) => {
        if (err2) return res.status(500).json({ message: "DB error" });
        res.json({ userId, role, name, pages });
      });
    } else {
      db.query(
        `SELECT p.* 
         FROM pages p 
         JOIN user_permissions up ON p.id = up.page_id 
         WHERE up.user_id = ?`,
        [userId],
        (err2, pages) => {
          if (err2) return res.status(500).json({ message: "DB error" });
          res.json({ userId, role, name, pages });
        }
      );
    }
  });
};

// 🔐 FORGOT PASSWORD - Send OTP
exports.forgotPassword = async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: 'Email required' });

  db.query('SELECT id FROM users WHERE email = ?', [email], async (err, results) => {
    if (err) return res.status(500).json({ message: 'Database error' });
    if (!results.length) return res.status(404).json({ message: 'Email not found' });

    const userId = results[0].id;
    const otp = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min

    // Delete old OTPS for user
    await new Promise((resolve, reject) => {
      db.query('DELETE FROM reset_otps WHERE user_id = ?', [userId], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Insert new OTP
    db.query(
      'INSERT INTO reset_otps (user_id, email, otp, expires_at) VALUES (?, ?, ?, ?)',
      [userId, email, otp, expiresAt],
      async (err) => {
        if (err) return res.status(500).json({ message: 'Failed to generate OTP' });

        try {
          await sendResetOtp({ to: email, otp });
          res.json({ message: 'OTP sent to your email' });
        } catch (mailErr) {
          console.error('Mail error:', mailErr);
          res.status(500).json({ message: 'OTP sent, but mail delivery failed' });
        }
      }
    );
  });
};

// 🔐 VERIFY OTP
exports.verifyOtp = (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) return res.status(400).json({ message: 'Email and OTP required' });

  const now = new Date();
  db.query(
    'SELECT user_id FROM reset_otps WHERE email = ? AND otp = ? AND expires_at > ? AND used = FALSE',
    [email, otp, now],
    (err, results) => {
      if (err) return res.status(500).json({ message: 'Database error' });
      if (!results.length) return res.status(400).json({ message: 'Invalid or expired OTP' });

      res.json({ message: 'OTP verified', userId: results[0].user_id });
    }
  );
};

// 🔐 RESET PASSWORD
exports.resetPassword = async (req, res) => {
  const { email, otp, newPassword } = req.body;
  if (!email || !otp || !newPassword) return res.status(400).json({ message: 'Email, OTP, and new password required' });

  const now = new Date();
  db.query(
    'SELECT user_id FROM reset_otps WHERE email = ? AND otp = ? AND expires_at > ? AND used = FALSE FOR UPDATE',
    [email, otp, now],
    async (err, results) => {
      if (err) return res.status(500).json({ message: 'Database error' });
      if (!results.length) return res.status(400).json({ message: 'Invalid or expired OTP' });

      const userId = results[0].user_id;
      const hashedPassword = await bcrypt.hash(newPassword, 12);

      db.query(
        'UPDATE users SET password = ? WHERE id = ?',
        [hashedPassword, userId],
        (err) => {
          if (err) return res.status(500).json({ message: 'Failed to update password' });

          // Mark OTP used
          db.query('UPDATE reset_otps SET used = TRUE WHERE user_id = ? AND otp = ?', [userId, otp], (err) => {
            if (err) console.error('Failed to mark OTP used:', err);
          });

          res.json({ message: 'Password reset successful' });
        }
      );
    }
  );
};

