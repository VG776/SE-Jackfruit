const express = require('express');
const { createAuthController } = require('../controllers/authController');
const { createAuthenticateMiddleware } = require('../middleware/authenticate');

function createUserRouter(authService) {
  const router = express.Router();
  const controller = createAuthController(authService);
  const authenticate = createAuthenticateMiddleware(authService);

  router.get('/me', authenticate, controller.me);

  return router;
}

module.exports = { createUserRouter };
