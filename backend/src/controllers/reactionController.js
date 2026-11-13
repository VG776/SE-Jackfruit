function createReactionController(reactionService) {
  return {
    async addReaction(request, response, next) {
      try {
        const data = await reactionService.addReaction(
          request.authenticatedUserId,
          request.validatedParams.messageId,
          request.validatedBody.emoji,
        );
        response.status(200).json({ status: 'success', data });
      } catch (error) {
        next(error);
      }
    },

    async removeReaction(request, response, next) {
      try {
        await reactionService.removeReaction(
          request.authenticatedUserId,
          request.validatedParams.messageId,
          request.validatedParams.emoji,
        );
        response.status(204).end();
      } catch (error) {
        next(error);
      }
    },

    async listReactions(request, response, next) {
      try {
        const data = await reactionService.listReactions(
          request.authenticatedUserId,
          request.validatedParams.messageId,
        );
        response.status(200).json({ status: 'success', data });
      } catch (error) {
        next(error);
      }
    },
  };
}

module.exports = { createReactionController };
