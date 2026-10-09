const express = require('express');
const router = express.Router();
const {
  getUserPages,
  createUser,
  getAllUsers,
  getAllPages,
  updatePermissions
} = require('../controllers/adminController');
const verifyToken = require('../middleware/verifyToken');
const isAdmin = require('../middleware/isAdmin');

router.get('/user-pages/:id', verifyToken, getUserPages);
router.post('/create-user', verifyToken, isAdmin, createUser);
router.get('/users', verifyToken, isAdmin, getAllUsers);
router.get('/pages', verifyToken, isAdmin, getAllPages);
router.post('/update-permissions', verifyToken, isAdmin, updatePermissions);

module.exports = router;
