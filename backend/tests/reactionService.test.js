const { ReactionService, summarizeReactions } = require('../src/services/reactionService');
const { AppError } = require('../src/errors/AppError');

const USER = '11111111-1111-4111-8111-111111111111';
const MESSAGE = '22222222-2222-4222-8222-222222222222';
const CHANNEL = '33333333-3333-4333-8333-333333333333';

function build({ message = { id: MESSAGE, channel_id: CHANNEL, deleted_at: null }, access } = {}) {
  const reactionRepository = {
    add: jest.fn().mockResolvedValue(true),
    remove: jest.fn().mockResolvedValue(true),
    listByMessageId: jest.fn().mockResolvedValue([{ emoji: 'a', user_id: USER }]),
  };
  const messageRepository = { findById: jest.fn().mockResolvedValue(message) };
  const channelService = {
    assertCanAccessChannel: jest.fn(access || (() => Promise.resolve({ id: CHANNEL }))),
  };
  return {
    service: new ReactionService(reactionRepository, messageRepository, channelService),
    reactionRepository,
    channelService,
  };
}

describe('summarizeReactions', () => {
  test('groups rows by emoji with counts and user IDs', () => {
    expect(
      summarizeReactions([
        { emoji: 'a', user_id: 'u1' },
        { emoji: 'b', user_id: 'u1' },
        { emoji: 'a', user_id: 'u2' },
      ]),
    ).toEqual([
      { emoji: 'a', count: 2, userIds: ['u1', 'u2'] },
      { emoji: 'b', count: 1, userIds: ['u1'] },
    ]);
  });

  test('returns an empty array when there are no reactions', () => {
    expect(summarizeReactions([])).toEqual([]);
  });
});

describe('ReactionService', () => {
  test('addReaction checks channel access, persists, and returns the summary', async () => {
    const { service, reactionRepository, channelService } = build();

    const result = await service.addReaction(USER, MESSAGE, 'a');

    expect(channelService.assertCanAccessChannel).toHaveBeenCalledWith(USER, CHANNEL);
    expect(reactionRepository.add).toHaveBeenCalledWith({
      messageId: MESSAGE,
      userId: USER,
      emoji: 'a',
    });
    expect(result).toEqual({
      messageId: MESSAGE,
      added: true,
      reactions: [{ emoji: 'a', count: 1, userIds: [USER] }],
    });
  });

  test('throws MESSAGE_NOT_FOUND for missing or deleted messages without writing', async () => {
    for (const message of [null, { id: MESSAGE, channel_id: CHANNEL, deleted_at: new Date() }]) {
      const { service, reactionRepository } = build({ message });
      await expect(service.addReaction(USER, MESSAGE, 'a')).rejects.toMatchObject({
        status: 404,
        code: 'MESSAGE_NOT_FOUND',
      });
      expect(reactionRepository.add).not.toHaveBeenCalled();
    }
  });

  test('maps channel-access 404 to MESSAGE_NOT_FOUND and never writes', async () => {
    const { service, reactionRepository } = build({
      access: () => Promise.reject(new AppError({ status: 404, code: 'CHANNEL_NOT_FOUND', detail: 'x' })),
    });

    await expect(service.addReaction(USER, MESSAGE, 'a')).rejects.toMatchObject({
      code: 'MESSAGE_NOT_FOUND',
    });
    expect(reactionRepository.add).not.toHaveBeenCalled();
  });

  test('propagates unexpected errors from the access check', async () => {
    const boom = new Error('db down');
    const { service } = build({ access: () => Promise.reject(boom) });

    await expect(service.addReaction(USER, MESSAGE, 'a')).rejects.toBe(boom);
  });

  test('removeReaction throws REACTION_NOT_FOUND when nothing was removed', async () => {
    const { service, reactionRepository } = build();
    reactionRepository.remove.mockResolvedValue(false);

    await expect(service.removeReaction(USER, MESSAGE, 'a')).rejects.toMatchObject({
      status: 404,
      code: 'REACTION_NOT_FOUND',
    });
  });

  test('removeReaction resolves when the reaction existed', async () => {
    const { service } = build();
    await expect(service.removeReaction(USER, MESSAGE, 'a')).resolves.toBeUndefined();
  });
});
