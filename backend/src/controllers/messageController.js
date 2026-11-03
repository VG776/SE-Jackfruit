function createMessageController(messageService) {
  return {
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
