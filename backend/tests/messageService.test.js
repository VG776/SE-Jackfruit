const { MessageService, toMessageDto } = require('../src/services/messageService');
const { AppError } = require('../src/errors/AppError');

describe('MessageService', () => {
  let messageRepository;
  let channelService;
  let messageService;

  const USER_ID = '11111111-1111-4111-8111-111111111111';
  const CHANNEL_ID = '22222222-2222-4222-8222-222222222222';

  beforeEach(() => {
    messageRepository = {
      create: jest.fn().mockImplementation(async ({ id, channelId, senderId, content }) => ({
        id,
        channel_id: channelId,
        sender_id: senderId,
        content,
        created_at: new Date('2026-11-03T10:00:00Z'),
        updated_at: new Date('2026-11-03T10:00:00Z'),
      })),
      findById: jest.fn(),
    };

    channelService = {
      assertCanAccessChannel: jest.fn().mockResolvedValue({ id: CHANNEL_ID }),
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

  describe('toMessageDto', () => {
    it('formats date timestamps into ISO strings', () => {
      const row = {
        id: 'msg-1',
        channel_id: 'chan-1',
        sender_id: 'usr-1',
        content: 'hey',
        created_at: new Date('2026-11-03T12:00:00Z'),
        updated_at: new Date('2026-11-03T12:00:00Z'),
      };

      const dto = toMessageDto(row);
      expect(dto).toEqual({
        id: 'msg-1',
        channelId: 'chan-1',
        senderId: 'usr-1',
        content: 'hey',
        createdAt: '2026-11-03T12:00:00.000Z',
        updatedAt: '2026-11-03T12:00:00.000Z',
      });
    });
  });
});
