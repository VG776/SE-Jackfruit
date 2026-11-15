const { z } = require('zod');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const searchQuerySchema = z
  .object({
    q: z
      .string({ error: 'Search query parameter "q" is required' })
      .trim()
      .min(1, 'Search query must not be empty')
      .max(200, 'Search query must contain at most 200 characters'),
    channelId: z
      .string()
      .regex(UUID_REGEX, 'channelId must be a valid UUID')
      .optional(),
    communityId: z
      .string()
      .regex(UUID_REGEX, 'communityId must be a valid UUID')
      .optional(),
    page: z
      .coerce
      .number({ error: 'page must be a number' })
      .int('page must be an integer')
      .min(1, 'page must be at least 1')
      .optional()
      .default(1),
    limit: z
      .coerce
      .number({ error: 'limit must be a number' })
      .int('limit must be an integer')
      .min(1, 'limit must be at least 1')
      .max(100, 'limit must not exceed 100')
      .optional()
      .default(20),
  })
  .strict('Unexpected query parameters are not allowed');

module.exports = { searchQuerySchema };
