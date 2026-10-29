const { randomUUID } = require('crypto');
const bcrypt = require('bcryptjs');
const { AppError } = require('../errors/AppError');
const { signToken, verifyToken } = require('../utils/token');
const { TokenRevocationStore } = require('./tokenRevocationStore');

const BCRYPT_SALT_ROUNDS = 12;
const DUMMY_HASH = '$2a$12$e8uq4f.Q9v4L9Fq01b.W5O7zU.7y7RjE1Q8Z4yO7k9g4Z3m5P4a6G';

function duplicateAccountError(field) {
  const fieldLabel = field === 'email' ? 'Email' : 'Username';

  return new AppError({
    status: 409,
    code: 'USER_ALREADY_EXISTS',
    detail: `${fieldLabel} is already registered`,
    invalidParams: [{ name: field, reason: `${fieldLabel} must be unique` }],
  });
}

function invalidCredentialsError() {
  return new AppError({
    status: 401,
    code: 'INVALID_CREDENTIALS',
    detail: 'Invalid username or password',
  });
}

function toSafeUserDTO(user) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    displayName: user.display_name || user.displayName,
    avatarUrl: user.avatar_url ?? user.avatarUrl ?? null,
    status: user.status || 'offline',
    createdAt:
      user.created_at instanceof Date
        ? user.created_at.toISOString()
        : user.createdAt instanceof Date
          ? user.createdAt.toISOString()
          : user.created_at || user.createdAt,
  };
}

class AuthService {
  constructor(
    userRepository,
    passwordHasher = bcrypt,
    tokenRevocationStore = new TokenRevocationStore(),
    {
      jwtSecret = process.env.JWT_SECRET || 'nexuschat-dev-secret-key-at-least-32-chars-long',
      jwtExpiresIn = 900,
    } = {},
  ) {
    this.userRepository = userRepository;
    this.passwordHasher = passwordHasher;
    this.tokenRevocationStore = tokenRevocationStore;
    this.jwtSecret = jwtSecret;
    this.jwtExpiresIn = jwtExpiresIn;
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

      return toSafeUserDTO(user);
    } catch (error) {
      if (error.code === '23505') {
        const field = error.constraint === 'users_email_ci_unique' ? 'email' : 'username';
        throw duplicateAccountError(field);
      }

      throw error;
    }
  }

  async login(credentials) {
    const identifier = (credentials.username || credentials.email || '').trim();
    const password = credentials.password;

    const user = await this.userRepository.findByIdentifier(identifier);

    if (!user) {
      // Execute dummy compare to prevent timing-based user enumeration attacks
      await this.passwordHasher.compare(password, DUMMY_HASH);
      throw invalidCredentialsError();
    }

    const isMatch = await this.passwordHasher.compare(password, user.password_hash);
    if (!isMatch) {
      throw invalidCredentialsError();
    }

    const safeUser = toSafeUserDTO(user);
    const token = signToken(
      {
        sub: user.id,
        username: user.username,
        email: user.email,
      },
      this.jwtSecret,
      { expiresInSeconds: this.jwtExpiresIn },
    );

    return {
      token,
      user: safeUser,
    };
  }

  async logout(token) {
    if (!token) {
      throw new AppError({
        status: 401,
        code: 'UNAUTHORIZED',
        detail: 'Authentication token is required',
      });
    }

    const payload = verifyToken(token, this.jwtSecret);

    if (this.tokenRevocationStore.isRevoked(payload.jti)) {
      throw new AppError({
        status: 401,
        code: 'UNAUTHORIZED',
        detail: 'Authentication token has been revoked',
      });
    }

    this.tokenRevocationStore.revoke(payload.jti, payload.exp);

    return {
      message: 'Successfully logged out',
    };
  }

  async authenticateToken(token) {
    if (!token) {
      throw new AppError({
        status: 401,
        code: 'UNAUTHORIZED',
        detail: 'Authentication token is required',
      });
    }

    const payload = verifyToken(token, this.jwtSecret);

    if (this.tokenRevocationStore.isRevoked(payload.jti)) {
      throw new AppError({
        status: 401,
        code: 'UNAUTHORIZED',
        detail: 'Authentication token has been revoked',
      });
    }

    const user = await this.userRepository.findById(payload.sub);
    if (!user) {
      throw new AppError({
        status: 401,
        code: 'UNAUTHORIZED',
        detail: 'User account no longer exists',
      });
    }

    return toSafeUserDTO(user);
  }
}

module.exports = { AuthService, BCRYPT_SALT_ROUNDS };
