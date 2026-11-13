const express = require('express');
const { createMessageController } = require('../controllers/messageController');
const { requireAuthenticatedUser } = require('../middleware/requireAuthenticatedUser');
const { validate } = require('../middleware/validate');
const {
  channelParamsSchema,
  messageParamsSchema,
  messageHistoryQuerySchema,
  sendMessageSchema,
  editMessageSchema,
} = require('../validation/messageSchemas');

function createMessageRouter(messageService, authenticate) {
  const router = express.Router();
  const controller = createMessageController(messageService);
  const validateChannelParams = validate(channelParamsSchema, {
    source: 'params',
    target: 'validatedParams',
  });
  const validateMessageParams = validate(messageParamsSchema, {
    source: 'params',
    target: 'validatedParams',
  });

  router.post(
    '/channels/:channelId/messages',
    authenticate,
    requireAuthenticatedUser,
    validateChannelParams,
    validate(sendMessageSchema),
    controller.sendMessage,
  );

  router.get(
    '/channels/:channelId/messages',
    authenticate,
    requireAuthenticatedUser,
    validateChannelParams,
    validate(messageHistoryQuerySchema, { source: 'query', target: 'validatedQuery' }),
    controller.getHistory,
  );

  router.patch(
    '/channels/:channelId/messages/:messageId',
    authenticate,
    requireAuthenticatedUser,
    validateMessageParams,
    validate(editMessageSchema),
    controller.editMessage,
  );

  router.delete(
    '/channels/:channelId/messages/:messageId',
    authenticate,
    requireAuthenticatedUser,
    validateMessageParams,
    controller.deleteMessage,
  );

  return router;
}

module.exports = { createMessageRouter };
