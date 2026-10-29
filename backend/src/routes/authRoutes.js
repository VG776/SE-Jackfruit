const express = require('express');
const rateLimit = require('express-rate-limit');
const { createAuthController } = require('../controllers/authController');
const { validate } = require('../middleware/validate');
const { registerSchema } = require('../validation/authSchemas');

function createAuthRouter(authService, { enableRateLimit = true } = {}) {
  const router = express.Router();
  const controller = createAuthController(authService);
  const registerMiddleware = [];

  if (enableRateLimit) {
    registerMiddleware.push(
      rateLimit({
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
      }),
    );
  }

  router.post(
    '/register',
    ...registerMiddleware,
    validate(registerSchema),
    controller.register,
  );

  return router;
}

module.exports = { createAuthRouter };
