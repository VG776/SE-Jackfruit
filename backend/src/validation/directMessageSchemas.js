const { z } = require('zod');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const startConversationSchema = z
  .object({
    recipientId: z
      .string({ error: 'Recipient ID is required' })
      .regex(UUID_REGEX, 'Recipient ID must be a valid UUID'),
  })
  .strict('Unexpected fields are not allowed');

const conversationParamsSchema = z.object({
  conversationId: z
    .string({ error: 'Conversation ID is required' })
    .regex(UUID_REGEX, 'Conversation ID must be a valid UUID'),
});

const sendDirectMessageSchema = z
  .object({
    content: z
      .string({ error: 'Message content is required' })
      .trim()
      .min(1, 'Message content must not be empty')
      .max(2000, 'Message content must not exceed 2000 characters'),
  })
  .strict('Unexpected fields are not allowed');

module.exports = {
  startConversationSchema,
  conversationParamsSchema,
  sendDirectMessageSchema,
};
