function createModerationController(moderationService) {
  return {
    async moderateMessage(request, response, next) {
      try {
        const result = await moderationService.removeMessage(
          request.authenticatedUserId,
          request.validatedParams.channelId,
          request.validatedParams.messageId,
          { reason: request.validatedBody.reason },
        );
        response.status(200).json({ status: 'success', data: result });
      } catch (error) {
        next(error);
      }
    },
  };
}

module.exports = { createModerationController };
