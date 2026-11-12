function createMembershipController(membershipService) {
  return {
    async listMembers(request, response, next) {
      try {
        const members = await membershipService.listMembers(
          request.authenticatedUserId,
          request.validatedParams.communityId,
        );
        response.status(200).json({ status: 'success', data: members });
      } catch (error) {
        next(error);
      }
    },

    async createInvite(request, response, next) {
      try {
        const invite = await membershipService.createInvite(
          request.authenticatedUserId,
          request.validatedParams.communityId,
          request.validatedBody,
        );
        response.status(201).json({ status: 'success', data: invite });
      } catch (error) {
        next(error);
      }
    },

    async join(request, response, next) {
      try {
        const result = await membershipService.joinByCode(
          request.authenticatedUserId,
          request.validatedParams.code,
        );
        response.status(200).json({ status: 'success', data: result });
      } catch (error) {
        next(error);
      }
    },

    async updateMemberRole(request, response, next) {
      try {
        const result = await membershipService.updateMemberRole(
          request.authenticatedUserId,
          request.validatedParams.communityId,
          request.validatedParams.userId,
          request.validatedBody.role,
        );
        response.status(200).json({ status: 'success', data: result });
      } catch (error) {
        next(error);
      }
    },

    async removeMember(request, response, next) {
      try {
        const result = await membershipService.removeMember(
          request.authenticatedUserId,
          request.validatedParams.communityId,
          request.validatedParams.userId,
        );
        response.status(200).json({ status: 'success', data: result });
      } catch (error) {
        next(error);
      }
    },
  };
}

module.exports = { createMembershipController };

