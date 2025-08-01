const db = require('../config/db');
const bcrypt = require('bcryptjs');

exports.createUser = async (req, res) => {
  const { name, email, password, role } = req.body;

  const hash = await bcrypt.hash(password, 10);

  db.query(
    'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
    [name, email, hash, role],
    (err, result) => {
      if (err) return res.status(500).json({ message: 'DB error', err });
      res.json({ message: 'User created', id: result.insertId });
    }
  );
};

exports.getAllUsers = (req, res) => {
  db.query('SELECT id, name, email, role FROM users', (err, results) => {
    if (err) return res.status(500).json({ message: 'DB error', err });
    res.json(results);
  });
};

exports.getAllPages = (req, res) => {
  db.query('SELECT * FROM pages', (err, results) => {
    if (err) return res.status(500).json({ message: 'DB error', err });
    res.json(results);
  });
};

exports.updatePermissions = (req, res) => {
  const { userId, pageIds } = req.body;

  // Remove old permissions
  db.query('DELETE FROM user_permissions WHERE user_id = ?', [userId], (err) => {
    if (err) return res.status(500).json({ message: 'DB error', err });

    // Add new permissions
    const values = pageIds.map((pageId) => [userId, pageId]);

    if (values.length === 0) return res.json({ message: 'Permissions cleared' });

    db.query(
      'INSERT INTO user_permissions (user_id, page_id) VALUES ?',
      [values],
      (err2) => {
        if (err2) return res.status(500).json({ message: 'DB error', err: err2 });
        res.json({ message: 'Permissions updated' });
      }
    );
  });
};


exports.getUserPages = (req, res) => {
  const userId = req.params.id;

  // Get user role
  db.query('SELECT role FROM users WHERE id = ?', [userId], (err, results) => {
    if (err) return res.status(500).json({ message: 'DB error' });
    if (!results.length) return res.status(404).json({ message: 'User not found' });

    const role = results[0].role;

    if (role === 'admin') {
      // ✅ Admins get all pages
      db.query('SELECT * FROM pages', (err2, pages) => {
        if (err2) return res.status(500).json({ message: 'DB error' });
        return res.json(pages);
      });
    } else {
      // ✅ Regular user gets allowed pages only
      const sql = `
        SELECT p.id, p.name, p.path, p.category
FROM pages p
JOIN user_permissions up ON p.id = up.page_id
WHERE up.user_id = ?
      `;

      db.query(sql, [userId], (err3, pages) => {
        if (err3) return res.status(500).json({ message: 'DB error' });
        return res.json(pages);
      });
    }
  });
};


