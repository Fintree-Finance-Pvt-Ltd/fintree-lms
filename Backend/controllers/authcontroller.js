const db = require('../config/db');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// âœ… LOGIN â€” sign token with .env secret
exports.login = (req, res) => {
console.log("í±‰ Login route hit with body:", req.body);
 const { email, password } = req.body;

  db.query('SELECT * FROM users WHERE email = ?', [email], async (err, results) => {
	console.log("inside the query");
    if (err) return res.status(500).json({ message: 'Database error' });
    if (!results.length) return res.status(401).json({ message: 'Invalid credentials' });

    const user = results[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: 'Invalid credentials' });

    // âœ… Sign token with SAME secret as .env
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

// âœ… ME â€” verify token with SAME secret as .env
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
