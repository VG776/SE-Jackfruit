const express = require('express');
const { createSearchController } = require('../controllers/searchController');
const { requireAuthenticatedUser } = require('../middleware/requireAuthenticatedUser');
const { validate } = require('../middleware/validate');
const { searchQuerySchema } = require('../validation/searchSchemas');

function createSearchRouter(searchService, authenticate) {
  const router = express.Router();
  const controller = createSearchController(searchService);

  const validateSearchQuery = validate(searchQuerySchema, {
    source: 'query',
    target: 'validatedQuery',
  });

  // GET /api/search - Full-text search across authorized messages
  router.get(
    '/',
    authenticate,
    requireAuthenticatedUser,
    validateSearchQuery,
    controller.search,
  );

  return router;
}

module.exports = { createSearchRouter };
