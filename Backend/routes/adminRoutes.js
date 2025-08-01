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

router.get('/user-pages/:id', verifyToken, getUserPages);
router.post('/create-user', verifyToken, createUser);
router.get('/users', verifyToken, getAllUsers);
router.get('/pages', verifyToken, getAllPages);
router.post('/update-permissions', verifyToken, updatePermissions);

module.exports = router;
