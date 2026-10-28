const { AuthService, BCRYPT_SALT_ROUNDS } = require('../src/services/authService');

describe('AuthService', () => {
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
