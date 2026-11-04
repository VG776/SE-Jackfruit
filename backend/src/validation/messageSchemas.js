const { z } = require('zod');

const channelParamsSchema = z.object({
  channelId: z.uuid('Channel ID must be a valid UUID'),
});

const messageParamsSchema = z.object({
  channelId: z.uuid('Channel ID must be a valid UUID'),
  messageId: z.uuid('Message ID must be a valid UUID'),
});

const sendMessageSchema = z
  .object({
    content: z
      .string({ error: 'Message content is required and must be a string' })
      .trim()
      .min(1, 'Message content must not be empty')
      .max(2000, 'Message content must not exceed 2000 characters'),
    clientNonce: z.string().max(100).optional(),
  })
  .strict('Unexpected fields are not allowed');

const editMessageSchema = z
  .object({
    content: z
      .string({ error: 'Message content is required and must be a string' })
      .trim()
      .min(1, 'Message content must not be empty')
      .max(2000, 'Message content must not exceed 2000 characters'),
  })
  .strict('Unexpected fields are not allowed');

module.exports = {
  channelParamsSchema,
  messageParamsSchema,
  sendMessageSchema,
  editMessageSchema,
};
