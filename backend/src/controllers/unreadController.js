function createUnreadController(unreadService) {
  return {
    async getCounts(request, response, next) {
      try {
        const counts = await unreadService.getUnreadCounts(request.authenticatedUserId);
        response.status(200).json({ status: 'success', data: counts });
      } catch (error) {
        next(error);
      }
    },

    async markChannelRead(request, response, next) {
      try {
        const state = await unreadService.markChannelRead(
          request.authenticatedUserId,
          request.validatedParams.channelId,
        );
        response.status(200).json({ status: 'success', data: state });
      } catch (error) {
        next(error);
      }
    },
  };
}

module.exports = { createUnreadController };
