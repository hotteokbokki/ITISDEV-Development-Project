const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');

router.get('/list', userController.getUserlist);
router.get('/create', userController.createUsers);
router.put('/toggleUserActivation/:accountID', userController.toggleUserActivation);

module.exports = router;
