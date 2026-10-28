const { z } = require('zod');

const registerSchema = z
  .object({
    username: z
      .string({ error: 'Username is required and must be a string' })
      .trim()
      .min(3, 'Username must contain at least 3 characters')
      .max(30, 'Username must contain at most 30 characters')
      .regex(
        /^[A-Za-z0-9_]+$/,
        'Username may contain only letters, numbers, and underscores',
      ),
    email: z
      .string({ error: 'Email is required and must be a string' })
      .trim()
      .max(254, 'Email must contain at most 254 characters')
      .email('Email must be a valid email address'),
    password: z
      .string({ error: 'Password is required and must be a string' })
      .min(8, 'Password must contain at least 8 characters')
      .refine((value) => Buffer.byteLength(value, 'utf8') <= 72, {
        message: 'Password must contain at most 72 bytes',
      }),
  })
  .strict('Unexpected fields are not allowed');

module.exports = { registerSchema };
