const { randomUUID } = require('crypto');
const bcrypt = require('bcryptjs');
const { AppError } = require('../errors/AppError');

const BCRYPT_SALT_ROUNDS = 12;

function duplicateAccountError(field) {
  const fieldLabel = field === 'email' ? 'Email' : 'Username';

  return new AppError({
    status: 409,
    code: 'USER_ALREADY_EXISTS',
    detail: `${fieldLabel} is already registered`,
    invalidParams: [{ name: field, reason: `${fieldLabel} must be unique` }],
  });
}

class AuthService {
  constructor(userRepository, passwordHasher = bcrypt) {
    this.userRepository = userRepository;
    this.passwordHasher = passwordHasher;
  }

  async register(userData) {
    const username = userData.username.trim();
    const email = userData.email.trim().toLowerCase();
    const conflicts = await this.userRepository.findRegistrationConflicts(username, email);

    if (conflicts.some((user) => user.username.toLowerCase() === username.toLowerCase())) {
      throw duplicateAccountError('username');
    }

    if (conflicts.some((user) => user.email.toLowerCase() === email)) {
      throw duplicateAccountError('email');
    }

    const passwordHash = await this.passwordHasher.hash(userData.password, BCRYPT_SALT_ROUNDS);

    try {
      const user = await this.userRepository.create({
        id: randomUUID(),
        username,
        email,
        passwordHash,
        displayName: username,
      });

      return {
        id: user.id,
        username: user.username,
        email: user.email,
        displayName: user.display_name,
        createdAt:
          user.created_at instanceof Date ? user.created_at.toISOString() : user.created_at,
      };
    } catch (error) {
      if (error.code === '23505') {
        const field = error.constraint === 'users_email_ci_unique' ? 'email' : 'username';
        throw duplicateAccountError(field);
      }

      throw error;
    }
  }
}

module.exports = { AuthService, BCRYPT_SALT_ROUNDS };
