const { ChannelService, normalizeChannelName } = require('../src/services/channelService');

describe('ChannelService', () => {
  test('returns not found if the channel disappears before rename completes', async () => {
    const repository = {
      findById: jest.fn().mockResolvedValue({ community_id: 'community-id' }),
      findNameConflict: jest.fn().mockResolvedValue(null),
      rename: jest.fn().mockResolvedValue(null),
    };
    const service = new ChannelService(repository, {
      canManageChannels: jest.fn().mockResolvedValue(true),
    });
    await expect(service.rename('user-id', 'channel-id', { name: 'Updates' }))
      .rejects.toMatchObject({ status: 404, code: 'CHANNEL_NOT_FOUND' });
  });
  test.each([
    ['General Chat', 'general-chat'],
    ['product_updates', 'product-updates'],
    ['  release---notes  ', 'release-notes'],
  ])('normalizes %s to %s', (input, expected) => {
    expect(normalizeChannelName(input)).toBe(expected);
  });

  test('checks permission before creating a channel', async () => {
    const channelRepository = {
      findNameConflict: jest.fn(),
      create: jest.fn(),
    };
    const permissionRepository = {
      canManageChannels: jest.fn().mockResolvedValue(false),
    };
    const service = new ChannelService(channelRepository, permissionRepository);

    await expect(
      service.create('user-id', 'community-id', { name: 'general', type: 'text' }),
    ).rejects.toMatchObject({
      status: 403,
      code: 'INSUFFICIENT_PERMISSIONS',
    });
    expect(channelRepository.findNameConflict).not.toHaveBeenCalled();
    expect(channelRepository.create).not.toHaveBeenCalled();
  });

  test('returns a safe channel DTO after creation', async () => {
    const createdAt = new Date('2026-10-29T10:00:00.000Z');
    const channelRepository = {
      findNameConflict: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(async (channel) => ({
        id: channel.id,
        community_id: channel.communityId,
        name: channel.name,
        type: channel.type,
        created_at: createdAt,
        updated_at: createdAt,
      })),
    };
    const permissionRepository = {
      canManageChannels: jest.fn().mockResolvedValue(true),
    };
    const service = new ChannelService(channelRepository, permissionRepository);

    const result = await service.create('user-id', 'community-id', {
      name: 'General Chat',
      type: 'text',
    });

    expect(result).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        communityId: 'community-id',
        name: 'general-chat',
        type: 'text',
        createdAt: createdAt.toISOString(),
        updatedAt: createdAt.toISOString(),
      }),
    );
  });
});
