const express = require('express');
const { createReactionController } = require('../controllers/reactionController');
const { requireAuthenticatedUser } = require('../middleware/requireAuthenticatedUser');
const { validate } = require('../middleware/validate');
const {
  reactionMessageParamsSchema,
  reactionParamsSchema,
  addReactionSchema,
} = require('../validation/reactionSchemas');

function createReactionRouter(reactionService, authenticate) {
  const router = express.Router();
  const controller = createReactionController(reactionService);
  const paramsOptions = { source: 'params', target: 'validatedParams' };

  router.get(
    '/messages/:messageId/reactions',
    authenticate,
    requireAuthenticatedUser,
    validate(reactionMessageParamsSchema, paramsOptions),
    controller.listReactions,
  );

  router.post(
    '/messages/:messageId/reactions',
    authenticate,
    requireAuthenticatedUser,
    validate(reactionMessageParamsSchema, paramsOptions),
    validate(addReactionSchema),
    controller.addReaction,
  );

  router.delete(
    '/messages/:messageId/reactions/:emoji',
    authenticate,
    requireAuthenticatedUser,
    validate(reactionParamsSchema, paramsOptions),
    controller.removeReaction,
  );

  return router;
}

module.exports = { createReactionRouter };
