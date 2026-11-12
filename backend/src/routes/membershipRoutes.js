const express = require('express');
const { createMembershipController } = require('../controllers/membershipController');
const { requireAuthenticatedUser } = require('../middleware/requireAuthenticatedUser');
const { validate } = require('../middleware/validate');
const {
  communityParamsSchema,
  memberParamsSchema,
  inviteCodeParamsSchema,
  createInviteSchema,
  updateMemberRoleSchema,
} = require('../validation/membershipSchemas');

function createMembershipRouter(membershipService, authenticate) {
  const router = express.Router();
  const controller = createMembershipController(membershipService);

  const validateCommunityParams = validate(communityParamsSchema, {
    source: 'params',
    target: 'validatedParams',
  });

  const validateMemberParams = validate(memberParamsSchema, {
    source: 'params',
    target: 'validatedParams',
  });

  const validateInviteCodeParams = validate(inviteCodeParamsSchema, {
    source: 'params',
    target: 'validatedParams',
  });

  // GET /api/communities/:communityId/members - List members
  router.get(
    '/communities/:communityId/members',
    authenticate,
    requireAuthenticatedUser,
    validateCommunityParams,
    controller.listMembers,
  );

  // POST /api/communities/:communityId/invites - Create invite code (Admin only)
  router.post(
    '/communities/:communityId/invites',
    authenticate,
    requireAuthenticatedUser,
    validateCommunityParams,
    validate(createInviteSchema),
    controller.createInvite,
  );

  // POST /api/invites/:code/join - Join community via invite code
  router.post(
    '/invites/:code/join',
    authenticate,
    requireAuthenticatedUser,
    validateInviteCodeParams,
    controller.join,
  );

  // PATCH /api/communities/:communityId/members/:userId - Update member role (Admin only)
  router.patch(
    '/communities/:communityId/members/:userId',
    authenticate,
    requireAuthenticatedUser,
    validateMemberParams,
    validate(updateMemberRoleSchema),
    controller.updateMemberRole,
  );

  // DELETE /api/communities/:communityId/members/:userId - Remove member (Admin only)
  router.delete(
    '/communities/:communityId/members/:userId',
    authenticate,
    requireAuthenticatedUser,
    validateMemberParams,
    controller.removeMember,
  );

  return router;
}

module.exports = { createMembershipRouter };

