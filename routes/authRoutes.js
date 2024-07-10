const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

router.get('/signup', authController.signup_get);
router.post('/signup', authController.signup_post);
router.get('/signin', authController.signin_get);
router.post('/signin', authController.signin_post);

module.exports = router;
