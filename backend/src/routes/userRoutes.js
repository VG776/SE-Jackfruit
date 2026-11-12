const express = require('express');
const { createAuthController } = require('../controllers/authController');
const { createAuthenticateMiddleware } = require('../middleware/authenticate');
const { validate } = require('../middleware/validate');
const { profileUpdateSchema } = require('../validation/authSchemas');

function createUserRouter(authService) {
  const router = express.Router();
  const controller = createAuthController(authService);
  const authenticate = createAuthenticateMiddleware(authService);

  router.get('/me', authenticate, controller.me);
  router.put('/me', authenticate, validate(profileUpdateSchema), controller.updateProfile);

  return router;
}

module.exports = { createUserRouter };
