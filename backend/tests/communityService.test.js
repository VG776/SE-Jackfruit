const { CommunityService } = require('../src/services/communityService');

describe('CommunityService', () => {
  function makeCommunityRepository(overrides = {}) {
    return {
      findByOwnerAndName: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(async ({ id, ownerId, name, description }) => ({
        id,
        owner_id: ownerId,
        name,
        description: description ?? null,
        created_at: new Date('2026-10-31T00:00:00.000Z'),
      })),
      ...overrides,
    };
  }

  const OWNER_ID = 'aaaaaaaa-0000-0000-0000-000000000001';

  describe('create()', () => {
    test('creates and returns a community DTO when the name is unique', async () => {
      const repository = makeCommunityRepository();
      const service = new CommunityService(repository);

      const result = await service.create({
        name: 'My Community',
        description: 'A place to hang out',
        ownerId: OWNER_ID,
      });

      expect(repository.findByOwnerAndName).toHaveBeenCalledWith(OWNER_ID, 'My Community');
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          ownerId: OWNER_ID,
          name: 'My Community',
          description: 'A place to hang out',
        }),
      );
      expect(result).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          ownerId: OWNER_ID,
          name: 'My Community',
          description: 'A place to hang out',
          createdAt: expect.any(String),
        }),
      );
    });

    test('trims whitespace from name and description', async () => {
      const repository = makeCommunityRepository();
      const service = new CommunityService(repository);

      await service.create({ name: '  Trimmed  ', description: '  desc  ', ownerId: OWNER_ID });

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Trimmed', description: 'desc' }),
      );
    });

    test('allows a community without a description', async () => {
      const repository = makeCommunityRepository();
      const service = new CommunityService(repository);

      const result = await service.create({ name: 'No Desc', ownerId: OWNER_ID });

      expect(result.description).toBeNull();
    });

    test('throws COMMUNITY_ALREADY_EXISTS when owner already has a community with that name', async () => {
      const repository = makeCommunityRepository({
        findByOwnerAndName: jest.fn().mockResolvedValue({
          id: 'existing-id',
          owner_id: OWNER_ID,
          name: 'Duplicate',
        }),
      });
      const service = new CommunityService(repository);

      await expect(
        service.create({ name: 'Duplicate', ownerId: OWNER_ID }),
      ).rejects.toMatchObject({
        status: 409,
        code: 'COMMUNITY_ALREADY_EXISTS',
        invalidParams: [expect.objectContaining({ name: 'name' })],
      });
      expect(repository.create).not.toHaveBeenCalled();
    });

    test('throws COMMUNITY_ALREADY_EXISTS on DB unique-constraint violation (race condition)', async () => {
      const dbError = new Error('duplicate key value violates unique constraint');
      dbError.code = '23505';
      const repository = makeCommunityRepository({
        create: jest.fn().mockRejectedValue(dbError),
      });
      const service = new CommunityService(repository);

      await expect(
        service.create({ name: 'RaceCondition', ownerId: OWNER_ID }),
      ).rejects.toMatchObject({ status: 409, code: 'COMMUNITY_ALREADY_EXISTS' });
    });

    test('re-throws unexpected errors from the repository', async () => {
      const unexpected = new Error('connection refused');
      const repository = makeCommunityRepository({
        create: jest.fn().mockRejectedValue(unexpected),
      });
      const service = new CommunityService(repository);

      await expect(service.create({ name: 'Oops', ownerId: OWNER_ID })).rejects.toThrow(
        'connection refused',
      );
    });
  });
});
