function createMessageController(messageService) {
  return {
    async getHistory(request, response, next) {
      try {
        const history = await messageService.getChannelHistory(
          request.authenticatedUserId,
          request.validatedParams.channelId,
          request.validatedQuery,
        );
        response.status(200).json({ status: 'success', data: history });
      } catch (error) {
        next(error);
      }
    },
    async sendMessage(request, response, next) {
      try {
        const message = await messageService.sendMessage(
          request.authenticatedUserId,
          request.validatedParams.channelId,
          request.validatedBody,
        );
        response.status(201).json({ status: 'success', data: message });
      } catch (error) {
        next(error);
      }
    },
  };
}

module.exports = { createMessageController };
