const express = require('express');
const { createDirectMessageController } = require('../controllers/directMessageController');
const { requireAuthenticatedUser } = require('../middleware/requireAuthenticatedUser');
const { validate } = require('../middleware/validate');
const {
  startConversationSchema,
  conversationParamsSchema,
  sendDirectMessageSchema,
} = require('../validation/directMessageSchemas');

function createDirectMessageRouter(directMessageService, authenticate) {
  const router = express.Router();
  const controller = createDirectMessageController(directMessageService);

  const validateStartBody = validate(startConversationSchema);
  const validateConversationParams = validate(conversationParamsSchema, {
    source: 'params',
    target: 'validatedParams',
  });
  const validateSendBody = validate(sendDirectMessageSchema);

  router.post(
    '/direct-messages/conversations',
    authenticate,
    requireAuthenticatedUser,
    validateStartBody,
    controller.startConversation,
  );

  router.post(
    '/direct-messages/conversations/:conversationId/messages',
    authenticate,
    requireAuthenticatedUser,
    validateConversationParams,
    validateSendBody,
    controller.sendMessage,
  );

  router.get(
    '/direct-messages/conversations/:conversationId/messages',
    authenticate,
    requireAuthenticatedUser,
    validateConversationParams,
    controller.getMessages,
  );

  return router;
}

module.exports = { createDirectMessageRouter };
