const express = require('express');
const { createChannelController } = require('../controllers/channelController');
const { requireAuthenticatedUser } = require('../middleware/requireAuthenticatedUser');
const { validate } = require('../middleware/validate');
const {
  createChannelSchema,
  renameChannelSchema,
  communityParamsSchema,
  channelParamsSchema,
  confirmDeleteSchema,
} = require('../validation/channelSchemas');

function createChannelRouter(channelService, authenticate) {
  const router = express.Router();
  const controller = createChannelController(channelService);
  const validateCommunityParams = validate(communityParamsSchema, {
    source: 'params',
    target: 'validatedParams',
  });
  const validateChannelParams = validate(channelParamsSchema, {
    source: 'params',
    target: 'validatedParams',
  });
  const validateDeleteConfirmation = validate(confirmDeleteSchema, {
    source: 'query',
    target: 'validatedQuery',
  });

  router.get(
    '/communities/:communityId/channels',
    authenticate,
    requireAuthenticatedUser,
    validateCommunityParams,
    controller.list,
  );
  router.post(
    '/communities/:communityId/channels',
    authenticate,
    requireAuthenticatedUser,
    validateCommunityParams,
    validate(createChannelSchema),
    controller.create,
  );
  router.patch(
    '/channels/:channelId',
    authenticate,
    requireAuthenticatedUser,
    validateChannelParams,
    validate(renameChannelSchema),
    controller.rename,
  );
  router.delete(
    '/channels/:channelId',
    authenticate,
    requireAuthenticatedUser,
    validateChannelParams,
    validateDeleteConfirmation,
    controller.delete,
  );

  return router;
}

module.exports = { createChannelRouter };
