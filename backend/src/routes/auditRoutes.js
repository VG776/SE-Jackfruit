const express = require('express');
const { z } = require('zod');
const { requireAuthenticatedUser } = require('../middleware/requireAuthenticatedUser');
const { validate } = require('../middleware/validate');

const paramsSchema = z.object({ communityId: z.uuid('Community ID must be a valid UUID') });
const querySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict('Unexpected query parameters are not allowed');

function createAuditRouter(auditService, authenticate) {
  const router = express.Router();

  router.get(
    '/communities/:communityId/audit-logs',
    authenticate,
    requireAuthenticatedUser,
    validate(paramsSchema, { source: 'params', target: 'validatedParams' }),
    validate(querySchema, { source: 'query', target: 'validatedQuery' }),
    async (request, response, next) => {
      try {
        const data = await auditService.list(
          request.authenticatedUserId,
          request.validatedParams.communityId,
          request.validatedQuery,
        );
        response.status(200).json({ status: 'success', data });
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}

module.exports = { createAuditRouter };
