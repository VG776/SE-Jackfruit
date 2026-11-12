function createDirectMessageController(directMessageService) {
  return {
    async startConversation(request, response, next) {
      try {
        const conversation = await directMessageService.startOrGetConversation(
          request.authenticatedUserId,
          request.validatedBody.recipientId,
        );
        response.status(200).json({ status: 'success', data: conversation });
      } catch (error) {
        next(error);
      }
    },

    async sendMessage(request, response, next) {
      try {
        const message = await directMessageService.sendMessage(
          request.authenticatedUserId,
          request.validatedParams.conversationId,
          request.validatedBody,
        );
        response.status(201).json({ status: 'success', data: message });
      } catch (error) {
        next(error);
      }
    },

    async getMessages(request, response, next) {
      try {
        const messages = await directMessageService.getMessages(
          request.authenticatedUserId,
          request.validatedParams.conversationId,
        );
        response.status(200).json({ status: 'success', data: messages });
      } catch (error) {
        next(error);
      }
    },
  };
}

module.exports = { createDirectMessageController };
