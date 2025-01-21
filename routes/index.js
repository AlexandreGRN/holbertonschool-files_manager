const express = require('express');
const AppController = require('../controllers/AppController');
import UsersController from '../controllers/UsersController';

const router = express.Router();
router.get('/status', AppController.getStatus);
router.get('/stats', AppController.getStats);
router.post('/users', UsersController.postNew);

module.exports = router;
