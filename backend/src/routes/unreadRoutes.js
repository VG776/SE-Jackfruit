const express = require('express');
const { createUnreadController } = require('../controllers/unreadController');
const { requireAuthenticatedUser } = require('../middleware/requireAuthenticatedUser');
const { validate } = require('../middleware/validate');
const { channelParamsSchema } = require('../validation/messageSchemas');

function createUnreadRouter(unreadService, authenticate) {
  const router = express.Router();
  const controller = createUnreadController(unreadService);
  const validateChannelParams = validate(channelParamsSchema, {
    source: 'params',
    target: 'validatedParams',
  });

  router.get('/unread-counts', authenticate, requireAuthenticatedUser, controller.getCounts);
  router.post(
    '/channels/:channelId/read',
    authenticate,
    requireAuthenticatedUser,
    validateChannelParams,
    controller.markChannelRead,
  );

  return router;
}

module.exports = { createUnreadRouter };
