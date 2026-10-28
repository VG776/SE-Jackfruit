function createAuthController(authService) {
  return {
    async register(request, response, next) {
      try {
        const user = await authService.register(request.validatedBody);
        response.status(201).json({ status: 'success', data: user });
      } catch (error) {
        next(error);
      }
    },
  };
}

module.exports = { createAuthController };
