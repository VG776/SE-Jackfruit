const express = require('express');
const { createModerationController } = require('../controllers/moderationController');
const { requireAuthenticatedUser } = require('../middleware/requireAuthenticatedUser');
const { validate } = require('../middleware/validate');
const { messageParamsSchema } = require('../validation/messageSchemas');
const { moderateMessageSchema } = require('../validation/moderationSchemas');

function createModerationRouter(moderationService, authenticate) {
  const router = express.Router();
  const controller = createModerationController(moderationService);

  router.post(
    '/channels/:channelId/messages/:messageId/moderation',
    authenticate,
    requireAuthenticatedUser,
    validate(messageParamsSchema, { source: 'params', target: 'validatedParams' }),
    validate(moderateMessageSchema),
    controller.moderateMessage,
  );

  return router;
}

module.exports = { createModerationRouter };
