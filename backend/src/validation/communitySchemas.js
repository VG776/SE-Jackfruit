const { z } = require('zod');

const createCommunitySchema = z
  .object({
    name: z
      .string({ error: 'Community name is required and must be a string' })
      .trim()
      .min(2, 'Community name must contain at least 2 characters')
      .max(100, 'Community name must contain at most 100 characters'),
    description: z
      .string({ error: 'Description must be a string' })
      .trim()
      .max(500, 'Description must contain at most 500 characters')
      .optional(),
  })
  .strict('Unexpected fields are not allowed');

module.exports = { createCommunitySchema };
