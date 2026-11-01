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

function createChannelRouter(channelService) {
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

  router.use(requireAuthenticatedUser);
  router.post(
    '/communities/:communityId/channels',
    validateCommunityParams,
    validate(createChannelSchema),
    controller.create,
  );
  router.patch(
    '/channels/:channelId',
    validateChannelParams,
    validate(renameChannelSchema),
    controller.rename,
  );
  router.delete(
    '/channels/:channelId',
    validateChannelParams,
    validateDeleteConfirmation,
    controller.delete,
  );

  return router;
}

module.exports = { createChannelRouter };
