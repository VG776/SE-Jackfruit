const { DirectMessageService, toConversationDto, toDirectMessageDto } = require('../src/services/directMessageService');
const { AppError } = require('../src/errors/AppError');

describe('DirectMessageService', () => {
  let directMessageRepository;
  let directMessageService;

  const USER_A = '11111111-1111-4111-8111-111111111111';
  const USER_B = '22222222-2222-4222-8222-222222222222';
  const USER_C = '33333333-3333-4333-8333-333333333333';
  const CONVERSATION_ID = '44444444-4444-4444-8444-444444444444';
  const MESSAGE_ID = '55555555-5555-4555-8555-555555555555';

  beforeEach(() => {
    directMessageRepository = {
      findOrCreateConversation: jest.fn().mockImplementation(async (a, b) => ({
        id: CONVERSATION_ID,
        user_a_id: a < b ? a : b,
        user_b_id: a < b ? b : a,
        created_at: new Date('2026-11-04T10:00:00Z'),
      })),
      findConversationById: jest.fn(),
      createMessage: jest.fn().mockImplementation(async ({ id, conversationId, senderId, content }) => ({
        id,
        conversation_id: conversationId,
        sender_id: senderId,
        content,
        created_at: new Date('2026-11-04T10:05:00Z'),
        updated_at: new Date('2026-11-04T10:05:00Z'),
      })),
      findMessagesByConversation: jest.fn().mockResolvedValue([]),
    };

    directMessageService = new DirectMessageService(directMessageRepository);
  });

  describe('startOrGetConversation', () => {
    test('creates or retrieves conversation between two distinct users', async () => {
      const result = await directMessageService.startOrGetConversation(USER_A, USER_B);

      expect(directMessageRepository.findOrCreateConversation).toHaveBeenCalledWith(USER_A, USER_B);
      expect(result).toMatchObject({
        id: CONVERSATION_ID,
        userAId: USER_A,
        userBId: USER_B,
        createdAt: '2026-11-04T10:00:00.000Z',
      });
    });

    test('rejects self-conversation with 400', async () => {
      await expect(
        directMessageService.startOrGetConversation(USER_A, USER_A),
      ).rejects.toMatchObject({
        status: 400,
        code: 'INVALID_INPUT_PAYLOAD',
      });

      expect(directMessageRepository.findOrCreateConversation).not.toHaveBeenCalled();
    });
  });

  describe('sendMessage', () => {
    test('participant can send message successfully', async () => {
      directMessageRepository.findConversationById.mockResolvedValue({
        id: CONVERSATION_ID,
        user_a_id: USER_A,
        user_b_id: USER_B,
      });

      const result = await directMessageService.sendMessage(USER_A, CONVERSATION_ID, {
        content: 'Hey there!',
      });

      expect(directMessageRepository.createMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: CONVERSATION_ID,
          senderId: USER_A,
          content: 'Hey there!',
        }),
      );
      expect(result.content).toBe('Hey there!');
    });

    test('rejects non-participant sender with 403', async () => {
      directMessageRepository.findConversationById.mockResolvedValue({
        id: CONVERSATION_ID,
        user_a_id: USER_A,
        user_b_id: USER_B,
      });

      await expect(
        directMessageService.sendMessage(USER_C, CONVERSATION_ID, { content: 'Intruder' }),
      ).rejects.toMatchObject({
        status: 403,
        code: 'INSUFFICIENT_PERMISSIONS',
      });

      expect(directMessageRepository.createMessage).not.toHaveBeenCalled();
    });

    test('returns 404 for non-existent conversation', async () => {
      directMessageRepository.findConversationById.mockResolvedValue(null);

      await expect(
        directMessageService.sendMessage(USER_A, CONVERSATION_ID, { content: 'Hello' }),
      ).rejects.toMatchObject({
        status: 404,
        code: 'CONVERSATION_NOT_FOUND',
      });
    });

    test('rejects empty content with 400', async () => {
      await expect(
        directMessageService.sendMessage(USER_A, CONVERSATION_ID, { content: '   ' }),
      ).rejects.toThrow(AppError);
    });

    test('rejects content exceeding 2000 characters', async () => {
      await expect(
        directMessageService.sendMessage(USER_A, CONVERSATION_ID, { content: 'x'.repeat(2001) }),
      ).rejects.toThrow(AppError);
    });
  });

  describe('getMessages', () => {
    test('participant can retrieve conversation messages', async () => {
      directMessageRepository.findConversationById.mockResolvedValue({
        id: CONVERSATION_ID,
        user_a_id: USER_A,
        user_b_id: USER_B,
      });
      directMessageRepository.findMessagesByConversation.mockResolvedValue([
        {
          id: MESSAGE_ID,
          conversation_id: CONVERSATION_ID,
          sender_id: USER_A,
          content: 'Message 1',
          created_at: new Date('2026-11-04T10:00:00Z'),
          updated_at: new Date('2026-11-04T10:00:00Z'),
        },
      ]);

      const messages = await directMessageService.getMessages(USER_B, CONVERSATION_ID);

      expect(messages).toHaveLength(1);
      expect(messages[0].content).toBe('Message 1');
    });

    test('rejects non-participant with 403', async () => {
      directMessageRepository.findConversationById.mockResolvedValue({
        id: CONVERSATION_ID,
        user_a_id: USER_A,
        user_b_id: USER_B,
      });

      await expect(
        directMessageService.getMessages(USER_C, CONVERSATION_ID),
      ).rejects.toMatchObject({
        status: 403,
        code: 'INSUFFICIENT_PERMISSIONS',
      });
    });

    test('returns 404 for non-existent conversation', async () => {
      directMessageRepository.findConversationById.mockResolvedValue(null);

      await expect(
        directMessageService.getMessages(USER_A, CONVERSATION_ID),
      ).rejects.toMatchObject({
        status: 404,
        code: 'CONVERSATION_NOT_FOUND',
      });
    });
  });

  describe('DTO mappers', () => {
    test('toConversationDto maps dates properly', () => {
      const dto = toConversationDto({
        id: 'c1',
        user_a_id: 'u1',
        user_b_id: 'u2',
        created_at: new Date('2026-11-04T12:00:00Z'),
      });
      expect(dto).toEqual({
        id: 'c1',
        userAId: 'u1',
        userBId: 'u2',
        createdAt: '2026-11-04T12:00:00.000Z',
      });
    });

    test('toDirectMessageDto maps dates properly', () => {
      const dto = toDirectMessageDto({
        id: 'm1',
        conversation_id: 'c1',
        sender_id: 'u1',
        content: 'hello',
        created_at: new Date('2026-11-04T12:00:00Z'),
        updated_at: new Date('2026-11-04T12:00:00Z'),
      });
      expect(dto).toEqual({
        id: 'm1',
        conversationId: 'c1',
        senderId: 'u1',
        content: 'hello',
        createdAt: '2026-11-04T12:00:00.000Z',
        updatedAt: '2026-11-04T12:00:00.000Z',
      });
    });
  });
});
