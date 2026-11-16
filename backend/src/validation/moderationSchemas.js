const { z } = require('zod');

const moderateMessageSchema = z
  .object({
    action: z.literal('REMOVE', { error: "Action must be 'REMOVE'" }),
    reason: z.string().trim().max(500, 'Reason must not exceed 500 characters').optional(),
  })
  .strict('Unexpected fields are not allowed');

module.exports = { moderateMessageSchema };
