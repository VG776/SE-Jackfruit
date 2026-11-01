function createChannelController(channelService) {
  return {
    async create(request, response, next) {
      try {
        const channel = await channelService.create(
          request.authenticatedUserId,
          request.validatedParams.communityId,
          request.validatedBody,
        );
        response.status(201).json({ status: 'success', data: channel });
      } catch (error) {
        next(error);
      }
    },

    async rename(request, response, next) {
      try {
        const channel = await channelService.rename(
          request.authenticatedUserId,
          request.validatedParams.channelId,
          request.validatedBody,
        );
        response.status(200).json({ status: 'success', data: channel });
      } catch (error) {
        next(error);
      }
    },

    async delete(request, response, next) {
      try {
        await channelService.delete(
          request.authenticatedUserId,
          request.validatedParams.channelId,
        );
        response.status(204).end();
      } catch (error) {
        next(error);
      }
    },
  };
}

module.exports = { createChannelController };
