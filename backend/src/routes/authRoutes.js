const express = require('express');
const rateLimit = require('express-rate-limit');
const { createAuthController } = require('../controllers/authController');
const { createAuthenticateMiddleware } = require('../middleware/authenticate');
const { validate } = require('../middleware/validate');
const { registerSchema, loginSchema } = require('../validation/authSchemas');

function createRateLimiter() {
  return rateLimit({
    windowMs: 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    handler(request, response) {
      response.status(429).type('application/problem+json').json({
        type: 'https://nexuschat.internal/errors/rate-limit-exceeded',
        title: 'Too Many Requests',
        status: 429,
        code: 'RATE_LIMIT_EXCEEDED',
        detail: 'Too many requests. Please wait a moment before retrying.',
        instance: request.originalUrl,
      });
    },
  });
}

function createAuthRouter(authService, { enableRateLimit = true } = {}) {
  const router = express.Router();
  const controller = createAuthController(authService);
  const authenticate = createAuthenticateMiddleware(authService);

  const authLimiterMiddleware = enableRateLimit ? [createRateLimiter()] : [];

  router.post(
    '/register',
    ...authLimiterMiddleware,
    validate(registerSchema),
    controller.register,
  );

  router.post(
    '/login',
    ...authLimiterMiddleware,
    validate(loginSchema),
    controller.login,
  );

  router.post(
    '/logout',
    authenticate,
    controller.logout,
  );

  router.get(
    '/me',
    authenticate,
    controller.me,
  );

  return router;
}

module.exports = { createAuthRouter };
