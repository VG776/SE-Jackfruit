const { AuthService, BCRYPT_SALT_ROUNDS } = require('../src/services/authService');
const { TokenRevocationStore } = require('../src/services/tokenRevocationStore');

describe('AuthService', () => {
  describe('register', () => {
    test('hashes the password with 12 rounds and returns a safe user DTO', async () => {
      const userRepository = {
        findRegistrationConflicts: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation(async (user) => ({
          ...user,
          display_name: user.displayName,
          created_at: new Date('2026-10-13T10:00:00.000Z'),
        })),
      };
      const passwordHasher = {
        hash: jest.fn().mockResolvedValue('hashed-password'),
      };
      const service = new AuthService(userRepository, passwordHasher);

      const result = await service.register({
        username: 'alice_dev',
        email: 'Alice@Example.com',
        password: 'SecurePassword123!',
      });

      expect(passwordHasher.hash).toHaveBeenCalledWith('SecurePassword123!', BCRYPT_SALT_ROUNDS);
      expect(userRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          username: 'alice_dev',
          email: 'alice@example.com',
          passwordHash: 'hashed-password',
          displayName: 'alice_dev',
        }),
      );
      expect(result).toEqual(
        expect.objectContaining({
          username: 'alice_dev',
          email: 'alice@example.com',
          displayName: 'alice_dev',
        }),
      );
      expect(result).not.toHaveProperty('password');
      expect(result).not.toHaveProperty('passwordHash');
    });

    test.each([
      ['username', [{ username: 'Alice_Dev', email: 'other@example.com' }]],
      ['email', [{ username: 'other_user', email: 'ALICE@example.com' }]],
    ])('rejects a duplicate %s', async (field, conflicts) => {
      const userRepository = {
        findRegistrationConflicts: jest.fn().mockResolvedValue(conflicts),
        create: jest.fn(),
      };
      const service = new AuthService(userRepository);

      await expect(
        service.register({
          username: 'alice_dev',
          email: 'alice@example.com',
          password: 'SecurePassword123!',
        }),
      ).rejects.toMatchObject({
        status: 409,
        code: 'USER_ALREADY_EXISTS',
        invalidParams: [expect.objectContaining({ name: field })],
      });
      expect(userRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    test('authenticates valid credentials with username and returns token and safe user DTO', async () => {
      const user = {
        id: '11111111-1111-1111-1111-111111111111',
        username: 'alice_dev',
        email: 'alice@example.com',
        password_hash: 'hashed-password',
        display_name: 'Alice Dev',
        avatar_url: null,
        status: 'offline',
        created_at: new Date('2026-10-13T10:00:00.000Z'),
      };
      const userRepository = {
        findByIdentifier: jest.fn().mockResolvedValue(user),
      };
      const passwordHasher = {
        compare: jest.fn().mockResolvedValue(true),
      };
      const service = new AuthService(userRepository, passwordHasher);

      const result = await service.login({
        username: 'alice_dev',
        password: 'ValidPassword123!',
      });

      expect(userRepository.findByIdentifier).toHaveBeenCalledWith('alice_dev');
      expect(passwordHasher.compare).toHaveBeenCalledWith('ValidPassword123!', 'hashed-password');
      expect(result).toHaveProperty('token');
      expect(typeof result.token).toBe('string');
      expect(result.user).toEqual({
        id: '11111111-1111-1111-1111-111111111111',
        username: 'alice_dev',
        email: 'alice@example.com',
        displayName: 'Alice Dev',
        avatarUrl: null,
        status: 'offline',
        createdAt: '2026-10-13T10:00:00.000Z',
      });
      expect(result.user).not.toHaveProperty('passwordHash');
      expect(result.user).not.toHaveProperty('password_hash');
    });

    test('authenticates valid credentials with email', async () => {
      const user = {
        id: '11111111-1111-1111-1111-111111111111',
        username: 'alice_dev',
        email: 'alice@example.com',
        password_hash: 'hashed-password',
        display_name: 'Alice Dev',
        created_at: new Date('2026-10-13T10:00:00.000Z'),
      };
      const userRepository = {
        findByIdentifier: jest.fn().mockResolvedValue(user),
      };
      const passwordHasher = {
        compare: jest.fn().mockResolvedValue(true),
      };
      const service = new AuthService(userRepository, passwordHasher);

      const result = await service.login({
        email: 'alice@example.com',
        password: 'ValidPassword123!',
      });

      expect(userRepository.findByIdentifier).toHaveBeenCalledWith('alice@example.com');
      expect(result.user.username).toBe('alice_dev');
    });

    test('rejects non-existent account with 401 INVALID_CREDENTIALS and runs dummy comparison', async () => {
      const userRepository = {
        findByIdentifier: jest.fn().mockResolvedValue(null),
      };
      const passwordHasher = {
        compare: jest.fn().mockResolvedValue(false),
      };
      const service = new AuthService(userRepository, passwordHasher);

      await expect(
        service.login({
          username: 'nonexistent_user',
          password: 'SomePassword123!',
        }),
      ).rejects.toMatchObject({
        status: 401,
        code: 'INVALID_CREDENTIALS',
        detail: 'Invalid username or password',
      });

      expect(passwordHasher.compare).toHaveBeenCalledWith('SomePassword123!', expect.any(String));
    });

    test('rejects invalid password with 401 INVALID_CREDENTIALS and identical error message', async () => {
      const user = {
        id: '11111111-1111-1111-1111-111111111111',
        username: 'alice_dev',
        email: 'alice@example.com',
        password_hash: 'hashed-password',
      };
      const userRepository = {
        findByIdentifier: jest.fn().mockResolvedValue(user),
      };
      const passwordHasher = {
        compare: jest.fn().mockResolvedValue(false),
      };
      const service = new AuthService(userRepository, passwordHasher);

      await expect(
        service.login({
          username: 'alice_dev',
          password: 'WrongPassword!',
        }),
      ).rejects.toMatchObject({
        status: 401,
        code: 'INVALID_CREDENTIALS',
        detail: 'Invalid username or password',
      });
    });
  });

  describe('logout and token revocation', () => {
    test('successfully revokes a valid token', async () => {
      const user = {
        id: '11111111-1111-1111-1111-111111111111',
        username: 'alice_dev',
        email: 'alice@example.com',
        password_hash: 'hashed-password',
      };
      const userRepository = {
        findByIdentifier: jest.fn().mockResolvedValue(user),
        findById: jest.fn().mockResolvedValue(user),
      };
      const passwordHasher = {
        compare: jest.fn().mockResolvedValue(true),
      };
      const revocationStore = new TokenRevocationStore();
      const service = new AuthService(userRepository, passwordHasher, revocationStore);

      const { token } = await service.login({
        username: 'alice_dev',
        password: 'ValidPassword123!',
      });

      const logoutResult = await service.logout(token);
      expect(logoutResult).toEqual({ message: 'Successfully logged out' });

      // After logout, token is rejected by authenticateToken
      await expect(service.authenticateToken(token)).rejects.toMatchObject({
        status: 401,
        code: 'UNAUTHORIZED',
        detail: 'Authentication token has been revoked',
      });

      // Subsequent logout attempt with same revoked token is rejected
      await expect(service.logout(token)).rejects.toMatchObject({
        status: 401,
        code: 'UNAUTHORIZED',
        detail: 'Authentication token has been revoked',
      });
    });

    test('rejects logout without token', async () => {
      const service = new AuthService({});
      await expect(service.logout(null)).rejects.toMatchObject({
        status: 401,
        code: 'UNAUTHORIZED',
        detail: 'Authentication token is required',
      });
    });
  });

  describe('authenticateToken', () => {
    test('returns user DTO for valid token', async () => {
      const user = {
        id: '11111111-1111-1111-1111-111111111111',
        username: 'alice_dev',
        email: 'alice@example.com',
        password_hash: 'hashed-password',
        display_name: 'Alice',
      };
      const userRepository = {
        findByIdentifier: jest.fn().mockResolvedValue(user),
        findById: jest.fn().mockResolvedValue(user),
      };
      const passwordHasher = {
        compare: jest.fn().mockResolvedValue(true),
      };
      const service = new AuthService(userRepository, passwordHasher);

      const { token } = await service.login({
        username: 'alice_dev',
        password: 'Password123!',
      });

      const authenticatedUser = await service.authenticateToken(token);
      expect(authenticatedUser).toEqual(
        expect.objectContaining({
          id: user.id,
          username: user.username,
          email: user.email,
        }),
      );
    });

    test('rejects token if user was deleted from database', async () => {
      const user = {
        id: '11111111-1111-1111-1111-111111111111',
        username: 'alice_dev',
        email: 'alice@example.com',
        password_hash: 'hashed-password',
      };
      const userRepository = {
        findByIdentifier: jest.fn().mockResolvedValue(user),
        findById: jest.fn().mockResolvedValue(null),
      };
      const passwordHasher = {
        compare: jest.fn().mockResolvedValue(true),
      };
      const service = new AuthService(userRepository, passwordHasher);

      const { token } = await service.login({
        username: 'alice_dev',
        password: 'Password123!',
      });

      await expect(service.authenticateToken(token)).rejects.toMatchObject({
        status: 401,
        code: 'UNAUTHORIZED',
        detail: 'User account no longer exists',
      });
    });
  });
});
