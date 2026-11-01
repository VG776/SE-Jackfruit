const { AppError } = require('../errors/AppError');

function requireAuthenticatedUser(request, _response, next) {
  const userId = request.user?.id || request.user?.sub;

  if (!userId) {
    return next(
      new AppError({
        status: 401,
        code: 'AUTHENTICATION_REQUIRED',
        detail: 'Authentication is required to perform this operation.',
      }),
    );
  }

  request.authenticatedUserId = userId;
  return next();
}

module.exports = { requireAuthenticatedUser };
