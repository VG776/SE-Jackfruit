const { AppError } = require('../errors/AppError');

class DirectMessageService {
  constructor(directMessageRepository, userRepository) {
    this.directMessageRepository = directMessageRepository;
    this.userRepository = userRepository;
  }

  toConversationDto(row) {
    return {
      id: row.id,
      userAId: row.user_a_id,
      userBId: row.user_b_id,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    };
  }

  toMessageDto(row) {
    return {
      id: row.id,
      conversationId: row.conversation_id,
      senderId: row.sender_id,
      content: row.content,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
      updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
    };
  }

  async startOrGetConversation(userId, recipientId) {
    if (userId === recipientId) {
      throw new AppError({
        status: 400,
        code: 'SELF_DM_NOT_ALLOWED',
        detail: 'Cannot start a direct conversation with yourself.',
      });
    }

    if (this.userRepository) {
      const recipient = await this.userRepository.findById(recipientId);
      if (!recipient) {
        throw new AppError({
          status: 404,
          code: 'USER_NOT_FOUND',
          detail: 'Recipient user not found.',
        });
      }
    }

    const conversation = await this.directMessageRepository.findOrCreateConversation(
      userId,
      recipientId,
    );
    return this.toConversationDto(conversation);
  }

  assertParticipant(userId, conversation) {
    if (conversation.user_a_id !== userId && conversation.user_b_id !== userId) {
      throw new AppError({
        status: 403,
        code: 'INSUFFICIENT_PERMISSIONS',
        detail: 'You are not a participant in this conversation.',
      });
    }
  }

  async sendMessage(userId, conversationId, { content }) {
    const conversation = await this.directMessageRepository.findConversationById(conversationId);
    if (!conversation) {
      throw new AppError({
        status: 404,
        code: 'CONVERSATION_NOT_FOUND',
        detail: 'Direct conversation not found.',
      });
    }

    this.assertParticipant(userId, conversation);

    const message = await this.directMessageRepository.createMessage({
      conversationId,
      senderId: userId,
      content: content.trim(),
    });

    return this.toMessageDto(message);
  }

  async getMessages(userId, conversationId) {
    const conversation = await this.directMessageRepository.findConversationById(conversationId);
    if (!conversation) {
      throw new AppError({
        status: 404,
        code: 'CONVERSATION_NOT_FOUND',
        detail: 'Direct conversation not found.',
      });
    }

    this.assertParticipant(userId, conversation);

    const messages = await this.directMessageRepository.findMessagesByConversation(conversationId);
    return messages.map((m) => this.toMessageDto(m));
  }
}

module.exports = DirectMessageService;
