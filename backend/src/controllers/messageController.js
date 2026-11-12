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

    async editMessage(request, response, next) {
      try {
        const message = await messageService.editMessage(
          request.authenticatedUserId,
          request.validatedParams.channelId,
          request.validatedParams.messageId,
          request.validatedBody,
        );
        response.status(200).json({ status: 'success', data: message });
      } catch (error) {
        next(error);
      }
    },

    async deleteMessage(request, response, next) {
      try {
        const result = await messageService.deleteMessage(
          request.authenticatedUserId,
          request.validatedParams.channelId,
          request.validatedParams.messageId,
        );
        response.status(200).json({ status: 'success', data: result });
      } catch (error) {
        next(error);
      }
    },
  };
}

module.exports = { createMessageController };
