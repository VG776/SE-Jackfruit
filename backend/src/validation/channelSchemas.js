const { z } = require('zod');

const channelNameSchema = z
  .string({ error: 'Channel name is required and must be a string' })
  .trim()
  .min(1, 'Channel name must not be empty')
  .max(100, 'Channel name must contain at most 100 characters')
  .regex(/[A-Za-z0-9]/, 'Channel name must contain at least one letter or number')
  .regex(
    /^[A-Za-z0-9 _-]+$/,
    'Channel name may contain only letters, numbers, spaces, hyphens, and underscores',
  );

const createChannelSchema = z
  .object({
    name: channelNameSchema,
    type: z.literal('text', { error: 'Channel type must be text' }),
  })
  .strict('Unexpected fields are not allowed');

const renameChannelSchema = z
  .object({
    name: channelNameSchema,
  })
  .strict('Unexpected fields are not allowed');

const communityParamsSchema = z.object({
  communityId: z.uuid('Community ID must be a valid UUID'),
});

const channelParamsSchema = z.object({
  channelId: z.uuid('Channel ID must be a valid UUID'),
});

const confirmDeleteSchema = z.object({
  confirm: z.literal('true', { error: 'Channel deletion requires confirm=true' }),
});

module.exports = {
  createChannelSchema,
  renameChannelSchema,
  communityParamsSchema,
  channelParamsSchema,
  confirmDeleteSchema,
};
