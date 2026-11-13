const { MessageService, toMessageDto } = require('../src/services/messageService');
const { AppError } = require('../src/errors/AppError');

describe('MessageService', () => {
  let messageRepository;
  let channelService;
  let messageService;

  const USER_ID = '11111111-1111-4111-8111-111111111111';
  const OTHER_USER_ID = '33333333-3333-4333-8333-333333333333';
  const CHANNEL_ID = '22222222-2222-4222-8222-222222222222';
  const MESSAGE_ID = '44444444-4444-4444-8444-444444444444';
  const COMMUNITY_ID = '55555555-5555-4555-8555-555555555555';

  beforeEach(() => {
    messageRepository = {
      create: jest.fn().mockImplementation(async ({ id, channelId, senderId, content }) => ({
        id,
        channel_id: channelId,
        sender_id: senderId,
        content,
        deleted_at: null,
        created_at: new Date('2026-11-03T10:00:00Z'),
        updated_at: new Date('2026-11-03T10:00:00Z'),
      })),
      findById: jest.fn(),
      findByChannelId: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockImplementation(async ({ id, content }) => ({
        id,
        channel_id: CHANNEL_ID,
        sender_id: USER_ID,
        content,
        deleted_at: null,
        created_at: new Date('2026-11-03T10:00:00Z'),
        updated_at: new Date('2026-11-03T10:05:00Z'),
      })),
      softDelete: jest.fn().mockImplementation(async (id) => ({
        id,
        channel_id: CHANNEL_ID,
        sender_id: USER_ID,
        content: 'Original',
        deleted_at: new Date('2026-11-03T10:10:00Z'),
        created_at: new Date('2026-11-03T10:00:00Z'),
        updated_at: new Date('2026-11-03T10:10:00Z'),
      })),
    };

    channelService = {
      assertCanAccessChannel: jest.fn().mockResolvedValue({ id: CHANNEL_ID, community_id: COMMUNITY_ID }),
      permissionRepository: {
        roleInCommunity: jest.fn().mockResolvedValue('member'),
      },
    };

    messageService = new MessageService(messageRepository, channelService);
  });

  describe('sendMessage', () => {
    it('creates and returns message when user is authorized and content is valid', async () => {
      const result = await messageService.sendMessage(USER_ID, CHANNEL_ID, {
        content: 'Hello, world!',
        clientNonce: 'nonce-123',
      });

      expect(channelService.assertCanAccessChannel).toHaveBeenCalledWith(USER_ID, CHANNEL_ID);
      expect(messageRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          channelId: CHANNEL_ID,
          senderId: USER_ID,
          content: 'Hello, world!',
        }),
      );
      expect(result).toMatchObject({
        channelId: CHANNEL_ID,
        senderId: USER_ID,
        content: 'Hello, world!',
        clientNonce: 'nonce-123',
      });
      expect(result.id).toBeDefined();
    });

    it('rejects empty content or whitespace-only content', async () => {
      await expect(
        messageService.sendMessage(USER_ID, CHANNEL_ID, { content: '' }),
      ).rejects.toThrow(AppError);

      await expect(
        messageService.sendMessage(USER_ID, CHANNEL_ID, { content: '   \n  \t ' }),
      ).rejects.toThrow(AppError);

      expect(messageRepository.create).not.toHaveBeenCalled();
    });

    it('rejects content exceeding 2000 characters', async () => {
      const longContent = 'a'.repeat(2001);
      await expect(
        messageService.sendMessage(USER_ID, CHANNEL_ID, { content: longContent }),
      ).rejects.toThrow(AppError);

      expect(messageRepository.create).not.toHaveBeenCalled();
    });

    it('rejects invalid non-string content', async () => {
      await expect(
        messageService.sendMessage(USER_ID, CHANNEL_ID, { content: null }),
      ).rejects.toThrow(AppError);

      await expect(
        messageService.sendMessage(USER_ID, CHANNEL_ID, { content: 12345 }),
      ).rejects.toThrow(AppError);

      expect(messageRepository.create).not.toHaveBeenCalled();
    });

    it('propagates authorization error when user cannot access channel', async () => {
      channelService.assertCanAccessChannel.mockRejectedValue(
        new AppError({
          status: 404,
          code: 'CHANNEL_NOT_FOUND',
          detail: 'The requested channel could not be found.',
        }),
      );

      await expect(
        messageService.sendMessage(USER_ID, CHANNEL_ID, { content: 'Test message' }),
      ).rejects.toThrow(AppError);

      expect(messageRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('editMessage', () => {
    it('allows author to edit their message', async () => {
      messageRepository.findById.mockResolvedValue({
        id: MESSAGE_ID,
        channel_id: CHANNEL_ID,
        sender_id: USER_ID,
        content: 'Original',
        deleted_at: null,
      });

      const result = await messageService.editMessage(USER_ID, CHANNEL_ID, MESSAGE_ID, {
        content: 'Updated content',
      });

      expect(messageRepository.update).toHaveBeenCalledWith({
        id: MESSAGE_ID,
        content: 'Updated content',
      });
      expect(result.content).toBe('Updated content');
    });

    it('rejects edit from a non-author with 403', async () => {
      messageRepository.findById.mockResolvedValue({
        id: MESSAGE_ID,
        channel_id: CHANNEL_ID,
        sender_id: USER_ID,
        content: 'Original',
        deleted_at: null,
      });

      await expect(
        messageService.editMessage(OTHER_USER_ID, CHANNEL_ID, MESSAGE_ID, {
          content: 'Hacked',
        }),
      ).rejects.toMatchObject({
        status: 403,
        code: 'INSUFFICIENT_PERMISSIONS',
      });
    });

    it('returns 404 if message does not exist or is deleted', async () => {
      messageRepository.findById.mockResolvedValue(null);

      await expect(
        messageService.editMessage(USER_ID, CHANNEL_ID, MESSAGE_ID, { content: 'New' }),
      ).rejects.toMatchObject({
        status: 404,
        code: 'MESSAGE_NOT_FOUND',
      });

      messageRepository.findById.mockResolvedValue({
        id: MESSAGE_ID,
        channel_id: CHANNEL_ID,
        sender_id: USER_ID,
        deleted_at: new Date(),
      });

      await expect(
        messageService.editMessage(USER_ID, CHANNEL_ID, MESSAGE_ID, { content: 'New' }),
      ).rejects.toMatchObject({
        status: 404,
        code: 'MESSAGE_NOT_FOUND',
      });
    });

    it('rejects empty content on edit', async () => {
      await expect(
        messageService.editMessage(USER_ID, CHANNEL_ID, MESSAGE_ID, { content: '  ' }),
      ).rejects.toThrow(AppError);
    });
  });

  describe('deleteMessage', () => {
    it('allows author to delete their message', async () => {
      messageRepository.findById.mockResolvedValue({
        id: MESSAGE_ID,
        channel_id: CHANNEL_ID,
        sender_id: USER_ID,
        deleted_at: null,
      });

      const result = await messageService.deleteMessage(USER_ID, CHANNEL_ID, MESSAGE_ID);

      expect(messageRepository.softDelete).toHaveBeenCalledWith(MESSAGE_ID);
      expect(result).toEqual({ id: MESSAGE_ID, deleted: true });
    });

    it('allows moderator or admin to delete another user message', async () => {
      messageRepository.findById.mockResolvedValue({
        id: MESSAGE_ID,
        channel_id: CHANNEL_ID,
        sender_id: USER_ID,
        deleted_at: null,
      });
      channelService.permissionRepository.roleInCommunity.mockResolvedValue('moderator');

      const result = await messageService.deleteMessage(OTHER_USER_ID, CHANNEL_ID, MESSAGE_ID);

      expect(messageRepository.softDelete).toHaveBeenCalledWith(MESSAGE_ID);
      expect(result).toEqual({ id: MESSAGE_ID, deleted: true });
    });

    it('rejects non-author regular member with 403', async () => {
      messageRepository.findById.mockResolvedValue({
        id: MESSAGE_ID,
        channel_id: CHANNEL_ID,
        sender_id: USER_ID,
        deleted_at: null,
      });
      channelService.permissionRepository.roleInCommunity.mockResolvedValue('member');

      await expect(
        messageService.deleteMessage(OTHER_USER_ID, CHANNEL_ID, MESSAGE_ID),
      ).rejects.toMatchObject({
        status: 403,
        code: 'INSUFFICIENT_PERMISSIONS',
      });
    });

    it('returns 404 when deleting a non-existent or already-deleted message', async () => {
      messageRepository.findById.mockResolvedValue(null);

      await expect(
        messageService.deleteMessage(USER_ID, CHANNEL_ID, MESSAGE_ID),
      ).rejects.toMatchObject({
        status: 404,
        code: 'MESSAGE_NOT_FOUND',
      });
    });
  });

  describe('toMessageDto', () => {
    it('formats date timestamps into ISO strings', () => {
      const row = {
        id: 'msg-1',
        channel_id: 'chan-1',
        sender_id: 'usr-1',
        content: 'hey',
        deleted_at: null,
        created_at: new Date('2026-11-03T12:00:00Z'),
        updated_at: new Date('2026-11-03T12:00:00Z'),
      };

      const dto = toMessageDto(row);
      expect(dto).toEqual({
        id: 'msg-1',
        channelId: 'chan-1',
        senderId: 'usr-1',
        content: 'hey',
        deletedAt: null,
        createdAt: '2026-11-03T12:00:00.000Z',
        updatedAt: '2026-11-03T12:00:00.000Z',
      });
    });
  });
});
