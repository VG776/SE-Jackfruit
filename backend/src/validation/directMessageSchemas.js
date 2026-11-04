const { z } = require('zod');

const startConversationSchema = z
  .object({
    recipientId: z.uuid('Recipient ID must be a valid UUID'),
  })
  .strict('Unexpected fields are not allowed');

const conversationParamsSchema = z.object({
  conversationId: z.uuid('Conversation ID must be a valid UUID'),
});

const sendDirectMessageSchema = z
  .object({
    content: z
      .string({ error: 'Message content is required and must be a string' })
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
