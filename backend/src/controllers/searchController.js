function createSearchController(searchService) {
  return {
    async search(request, response, next) {
      try {
        const result = await searchService.searchMessages(
          request.authenticatedUserId,
          request.validatedQuery,
        );
        response.status(200).json({ status: 'success', data: result });
      } catch (error) {
        next(error);
      }
    },
  };
}

module.exports = { createSearchController };
