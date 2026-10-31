const express = require('express');
const { createCommunityController } = require('../controllers/communityController');
const { createAuthenticateMiddleware } = require('../middleware/authenticate');
const { validate } = require('../middleware/validate');
const { createCommunitySchema } = require('../validation/communitySchemas');

function createCommunityRouter(communityService, authService) {
  const router = express.Router();
  const controller = createCommunityController(communityService);
  const authenticate = createAuthenticateMiddleware(authService);

  router.post('/', authenticate, validate(createCommunitySchema), controller.create);

  return router;
}

module.exports = { createCommunityRouter };
