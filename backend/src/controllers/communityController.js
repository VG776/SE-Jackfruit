function createCommunityController(communityService) {
  return {
    async list(request, response, next) {
      try {
        const communities = await communityService.listForUser(request.authenticatedUserId);
        response.json({ status: 'success', data: communities });
      } catch (error) {
        next(error);
      }
    },

    async create(request, response, next) {
      try {
        const community = await communityService.create({
          ...request.validatedBody,
          ownerId: request.authenticatedUserId,
        });

        response.status(201).json({ status: 'success', data: community });
      } catch (error) {
        next(error);
      }
    },
  };
}

module.exports = { createCommunityController };
