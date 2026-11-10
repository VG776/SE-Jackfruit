const express = require('express');
const path = require('node:path');
const { createAuthRouter } = require('./routes/authRoutes');
const { createChannelRouter } = require('./routes/channelRoutes');
const { createMessageRouter } = require('./routes/messageRoutes');
const { createUserRouter } = require('./routes/userRoutes');
const { createCommunityRouter } = require('./routes/communityRoutes');
const { createAuthenticateMiddleware } = require('./middleware/authenticate');
const { errorHandler } = require('./middleware/errorHandler');
const { AppError } = require('./errors/AppError');

function createApp({
  authService,
  communityService,
  channelService,
  messageService,
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

  const apiAuthenticate = authenticate || createAuthenticateMiddleware(authService);
  if (channelService) {
    app.use('/api', createChannelRouter(channelService, apiAuthenticate));
  }

  if (messageService) {
    app.use('/api', createMessageRouter(messageService, apiAuthenticate));
  }

  app.use(express.static(path.resolve(__dirname, '../../frontend/src')));

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
