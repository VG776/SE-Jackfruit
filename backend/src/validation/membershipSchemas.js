const { z } = require('zod');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const communityParamsSchema = z.object({
  communityId: z.string({ error: 'Community ID is required' }).regex(UUID_REGEX, 'Community ID must be a valid UUID'),
});

const memberParamsSchema = z.object({
  communityId: z.string({ error: 'Community ID is required' }).regex(UUID_REGEX, 'Community ID must be a valid UUID'),
  userId: z.string({ error: 'User ID is required' }).regex(UUID_REGEX, 'User ID must be a valid UUID'),
});

const inviteCodeParamsSchema = z.object({
  code: z
    .string({ error: 'Invite code is required' })
    .trim()
    .min(1, 'Invite code must not be empty')
    .max(64, 'Invite code must not exceed 64 characters'),
});

const createInviteSchema = z
  .object({
    maxUses: z
      .number({ error: 'maxUses must be an integer' })
      .int('maxUses must be an integer')
      .positive('maxUses must be greater than 0')
      .max(10000, 'maxUses must not exceed 10000')
      .optional()
      .default(1),
    expiresInHours: z
      .number({ error: 'expiresInHours must be a number' })
      .positive('expiresInHours must be greater than 0')
      .max(8760, 'expiresInHours must not exceed 8760') // max 1 year
      .optional(),
  })
  .strict('Unexpected fields are not allowed');

const updateMemberRoleSchema = z
  .object({
    role: z.enum(['admin', 'moderator', 'member'], {
      error: 'Role must be one of: admin, moderator, member',
    }),
  })
  .strict('Unexpected fields are not allowed');

module.exports = {
  communityParamsSchema,
  memberParamsSchema,
  inviteCodeParamsSchema,
  createInviteSchema,
  updateMemberRoleSchema,
};

