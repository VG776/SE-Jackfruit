const express = require('express');
const { createChannelController } = require('../controllers/channelController');
const { requireAuthenticatedUser } = require('../middleware/requireAuthenticatedUser');
const { createAuthorizeChannelManagement } = require('../middleware/authorizeChannelManagement');
const { validate } = require('../middleware/validate');
const {
  createChannelSchema,
  renameChannelSchema,
  communityParamsSchema,
  channelParamsSchema,
  confirmDeleteSchema,
} = require('../validation/channelSchemas');

function createChannelRouter(channelService, authenticate, permissionRepository = null) {
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
  const authorizeCommunityManagement = permissionRepository
    ? createAuthorizeChannelManagement(permissionRepository)
    : (_request, _response, next) => next();
  const authorizeChannelManagement = permissionRepository
    ? createAuthorizeChannelManagement(permissionRepository, { resource: 'channelId' })
    : (_request, _response, next) => next();

  router.post(
    '/communities/:communityId/channels',
    authenticate,
    requireAuthenticatedUser,
    validateCommunityParams,
    authorizeCommunityManagement,
    validate(createChannelSchema),
    controller.create,
  );
  router.patch(
    '/channels/:channelId',
    authenticate,
    requireAuthenticatedUser,
    validateChannelParams,
    authorizeChannelManagement,
    validate(renameChannelSchema),
    controller.rename,
  );
  router.delete(
    '/channels/:channelId',
    authenticate,
    requireAuthenticatedUser,
    validateChannelParams,
    authorizeChannelManagement,
    validateDeleteConfirmation,
    controller.delete,
  );

  return router;
}

module.exports = { createChannelRouter };
