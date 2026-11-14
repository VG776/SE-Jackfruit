const { z } = require('zod');

// Supported reaction values (FR-UX-01: reject invalid reaction values).
const SUPPORTED_REACTIONS = [
  '\u{1F44D}', // thumbs up
  '\u{1F44E}', // thumbs down
  '❤️', // red heart
  '\u{1F602}', // face with tears of joy
  '\u{1F62E}', // face with open mouth
  '\u{1F622}', // crying face
  '\u{1F389}', // party popper
  '\u{1F64F}', // folded hands
  '\u{1F440}', // eyes
  '\u{1F525}', // fire
];

const emojiField = z
  .string({ error: 'Emoji is required and must be a string' })
  .refine((value) => SUPPORTED_REACTIONS.includes(value), 'Unsupported reaction emoji');

const reactionMessageParamsSchema = z.object({
  messageId: z.uuid('Message ID must be a valid UUID'),
});

const reactionParamsSchema = z.object({
  messageId: z.uuid('Message ID must be a valid UUID'),
  emoji: emojiField,
});

const addReactionSchema = z
  .object({ emoji: emojiField })
  .strict('Unexpected fields are not allowed');

module.exports = {
  SUPPORTED_REACTIONS,
  reactionMessageParamsSchema,
  reactionParamsSchema,
  addReactionSchema,
};
