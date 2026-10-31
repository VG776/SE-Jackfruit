function createCommunityController(communityService) {
  return {
    async create(request, response, next) {
      try {
        const community = await communityService.create({
          ...request.validatedBody,
          ownerId: request.user.id,
        });

        response.status(201).json({ status: 'success', data: community });
      } catch (error) {
        next(error);
      }
    },
  };
}

module.exports = { createCommunityController };
