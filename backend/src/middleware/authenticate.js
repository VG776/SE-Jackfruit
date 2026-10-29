const { AppError } = require('../errors/AppError');

function createAuthenticateMiddleware(authService) {
  return async function authenticate(request, _response, next) {
    try {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        throw new AppError({
          status: 401,
          code: 'UNAUTHORIZED',
          detail: 'Authentication token is required',
        });
      }

      const [scheme, token] = authHeader.split(' ');
      if (scheme !== 'Bearer' || !token) {
        throw new AppError({
          status: 401,
          code: 'UNAUTHORIZED',
          detail: 'Invalid Authorization header format. Format must be: Bearer <token>',
        });
      }

      const user = await authService.authenticateToken(token);
      request.user = user;
      request.token = token;
      next();
    } catch (error) {
      next(error);
    }
  };
}

module.exports = { createAuthenticateMiddleware };
