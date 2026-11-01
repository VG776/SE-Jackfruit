const express = require('express');
const { createAuthRouter } = require('./routes/authRoutes');
const { createChannelRouter } = require('./routes/channelRoutes');
const { createUserRouter } = require('./routes/userRoutes');
const { createCommunityRouter } = require('./routes/communityRoutes');
const { createAuthenticateMiddleware } = require('./middleware/authenticate');
const { errorHandler } = require('./middleware/errorHandler');
const { AppError } = require('./errors/AppError');

function createApp({
  authService,
  communityService,
  channelService,
  channelPermissionRepository,
  authenticate,
  enableRateLimit = true,
}) {
  if (!authService) {
    throw new Error('authService is required');
  }

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '16kb' }));
  app.use('/api/auth', createAuthRouter(authService, { enableRateLimit }));
  app.use('/api/users', createUserRouter(authService));
  if (communityService) {
    app.use('/api/communities', createCommunityRouter(communityService, authService));
  }

  if (channelService) {
    const channelAuthenticate = authenticate || createAuthenticateMiddleware(authService);
    app.use(
      '/api',
      createChannelRouter(channelService, channelAuthenticate, channelPermissionRepository),
    );
  }

  app.use((request, _response, next) => {
    next(
      new AppError({
        status: 404,
        code: 'RESOURCE_NOT_FOUND',
        detail: 'The requested resource could not be found.',
      }),
    );
  });

  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
