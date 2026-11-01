const { AppError } = require('../errors/AppError');

function insufficientPermissionsError() {
  return new AppError({
    status: 403,
    code: 'INSUFFICIENT_PERMISSIONS',
    detail: 'You do not have permission to manage channels in this community.',
  });
}

function createAuthorizeChannelManagement(permissionRepository, { resource = 'communityId' } = {}) {
  return async function authorizeChannelManagement(request, _response, next) {
    try {
      const userId = request.authenticatedUserId;
      const resourceId = request.validatedParams[resource];
      const decision = resource === 'communityId'
        ? await permissionRepository.getCommunityManagementDecision(userId, resourceId)
        : await permissionRepository.getChannelManagementDecision(userId, resourceId);

      // Leave missing-resource handling to the service so it can return its
      // resource-specific 404 response without exposing database details.
      if (!decision.exists) {
        return next();
      }

      if (!decision.permitted) {
        return next(insufficientPermissionsError());
      }

      return next();
    } catch (error) {
      return next(error);
    }
  };
}

module.exports = { createAuthorizeChannelManagement };
