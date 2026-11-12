const DirectMessageService = require('../src/services/directMessageService');

describe('DirectMessageService', () => {
  let directMessageRepository;
  let userRepository;
  let service;

  const USER_A = '11111111-1111-4111-8111-111111111111';
  const USER_B = '22222222-2222-4222-8222-222222222222';
  const STRANGER = '99999999-9999-4999-8999-999999999999';
  const CONV_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

  beforeEach(() => {
    directMessageRepository = {
      findOrCreateConversation: jest.fn(),
      findConversationById: jest.fn(),
      createMessage: jest.fn(),
      findMessagesByConversation: jest.fn(),
    };
    userRepository = {
      findById: jest.fn(),
    };
    service = new DirectMessageService(directMessageRepository, userRepository);
  });

  describe('startOrGetConversation', () => {
    it('creates or returns a conversation between two distinct users', async () => {
      userRepository.findById.mockResolvedValue({ id: USER_B, username: 'bob' });
      directMessageRepository.findOrCreateConversation.mockResolvedValue({
        id: CONV_ID,
        user_a_id: USER_A,
        user_b_id: USER_B,
        created_at: new Date('2026-11-12T10:00:00Z'),
      });

      const conv = await service.startOrGetConversation(USER_A, USER_B);

      expect(userRepository.findById).toHaveBeenCalledWith(USER_B);
      expect(directMessageRepository.findOrCreateConversation).toHaveBeenCalledWith(USER_A, USER_B);
      expect(conv).toEqual({
        id: CONV_ID,
        userAId: USER_A,
        userBId: USER_B,
        createdAt: '2026-11-12T10:00:00.000Z',
      });
    });

    it('rejects self-conversations with 400 SELF_DM_NOT_ALLOWED', async () => {
      await expect(service.startOrGetConversation(USER_A, USER_A)).rejects.toMatchObject({
        status: 400,
        code: 'SELF_DM_NOT_ALLOWED',
      });
    });

    it('rejects conversation if recipient user does not exist with 404', async () => {
      userRepository.findById.mockResolvedValue(null);

      await expect(service.startOrGetConversation(USER_A, USER_B)).rejects.toMatchObject({
        status: 404,
        code: 'USER_NOT_FOUND',
      });
    });
  });

  describe('sendMessage', () => {
    it('allows a participant to send a direct message', async () => {
      directMessageRepository.findConversationById.mockResolvedValue({
        id: CONV_ID,
        user_a_id: USER_A,
        user_b_id: USER_B,
      });
      directMessageRepository.createMessage.mockResolvedValue({
        id: 'msg-1',
        conversation_id: CONV_ID,
        sender_id: USER_A,
        content: 'Hello Bob!',
        created_at: new Date('2026-11-12T10:05:00Z'),
        updated_at: new Date('2026-11-12T10:05:00Z'),
      });

      const msg = await service.sendMessage(USER_A, CONV_ID, { content: '  Hello Bob!  ' });

      expect(directMessageRepository.createMessage).toHaveBeenCalledWith({
        conversationId: CONV_ID,
        senderId: USER_A,
        content: 'Hello Bob!',
      });
      expect(msg.content).toBe('Hello Bob!');
      expect(msg.senderId).toBe(USER_A);
    });

    it('rejects message if conversation does not exist', async () => {
      directMessageRepository.findConversationById.mockResolvedValue(null);

      await expect(
        service.sendMessage(USER_A, CONV_ID, { content: 'Hello' }),
      ).rejects.toMatchObject({
        status: 404,
        code: 'CONVERSATION_NOT_FOUND',
      });
    });

    it('rejects message from non-participant with 403 INSUFFICIENT_PERMISSIONS', async () => {
      directMessageRepository.findConversationById.mockResolvedValue({
        id: CONV_ID,
        user_a_id: USER_A,
        user_b_id: USER_B,
      });

      await expect(
        service.sendMessage(STRANGER, CONV_ID, { content: 'Intruder message' }),
      ).rejects.toMatchObject({
        status: 403,
        code: 'INSUFFICIENT_PERMISSIONS',
      });
    });
  });

  describe('getMessages', () => {
    it('allows a participant to fetch conversation messages', async () => {
      directMessageRepository.findConversationById.mockResolvedValue({
        id: CONV_ID,
        user_a_id: USER_A,
        user_b_id: USER_B,
      });
      directMessageRepository.findMessagesByConversation.mockResolvedValue([
        {
          id: 'msg-1',
          conversation_id: CONV_ID,
          sender_id: USER_A,
          content: 'Hi',
          created_at: new Date('2026-11-12T10:00:00Z'),
          updated_at: new Date('2026-11-12T10:00:00Z'),
        },
      ]);

      const messages = await service.getMessages(USER_B, CONV_ID);

      expect(messages).toHaveLength(1);
      expect(messages[0].senderId).toBe(USER_A);
      expect(messages[0].content).toBe('Hi');
    });

    it('rejects non-participant fetching conversation messages with 403', async () => {
      directMessageRepository.findConversationById.mockResolvedValue({
        id: CONV_ID,
        user_a_id: USER_A,
        user_b_id: USER_B,
      });

      await expect(service.getMessages(STRANGER, CONV_ID)).rejects.toMatchObject({
        status: 403,
        code: 'INSUFFICIENT_PERMISSIONS',
      });
    });

    it('rejects if conversation does not exist with 404', async () => {
      directMessageRepository.findConversationById.mockResolvedValue(null);

      await expect(service.getMessages(USER_A, CONV_ID)).rejects.toMatchObject({
        status: 404,
        code: 'CONVERSATION_NOT_FOUND',
      });
    });
  });
});
