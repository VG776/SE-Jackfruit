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

    async login(request, response, next) {
      try {
        const result = await authService.login(request.validatedBody);
        response.status(200).json({ status: 'success', data: result });
      } catch (error) {
        next(error);
      }
    },

    async logout(request, response, next) {
      try {
        const result = await authService.logout(request.token);
        response.status(200).json({ status: 'success', data: result });
      } catch (error) {
        next(error);
      }
    },

    async me(request, response, next) {
      try {
        response.status(200).json({ status: 'success', data: request.user });
      } catch (error) {
        next(error);
      }
    },
  };
}

module.exports = { createAuthController };
