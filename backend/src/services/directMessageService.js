const { randomUUID } = require('crypto');
const { AppError } = require('../errors/AppError');

function conversationNotFoundError() {
  return new AppError({
    status: 404,
    code: 'CONVERSATION_NOT_FOUND',
    detail: 'The requested conversation could not be found.',
  });
}

function insufficientPermissionsError() {
  return new AppError({
    status: 403,
    code: 'INSUFFICIENT_PERMISSIONS',
    detail: 'You do not have permission to access this conversation.',
  });
}

function selfConversationError() {
  return new AppError({
    status: 400,
    code: 'INVALID_INPUT_PAYLOAD',
    detail: 'You cannot start a direct conversation with yourself.',
    invalidParams: [{ name: 'recipientId', reason: 'Recipient must be a different user' }],
  });
}

function messageValidationError(detail, invalidParams) {
  return new AppError({
    status: 400,
    code: 'INVALID_INPUT_PAYLOAD',
    detail,
    invalidParams,
  });
}

function toConversationDto(conversation) {
  return {
    id: conversation.id,
    userAId: conversation.user_a_id,
    userBId: conversation.user_b_id,
    createdAt:
      conversation.created_at instanceof Date
        ? conversation.created_at.toISOString()
        : conversation.created_at,
  };
}

function toDirectMessageDto(message) {
  return {
    id: message.id,
    conversationId: message.conversation_id,
    senderId: message.sender_id,
    content: message.content,
    createdAt:
      message.created_at instanceof Date ? message.created_at.toISOString() : message.created_at,
    updatedAt:
      message.updated_at instanceof Date ? message.updated_at.toISOString() : message.updated_at,
  };
}

class DirectMessageService {
  constructor(directMessageRepository) {
    this.directMessageRepository = directMessageRepository;
  }

  async startOrGetConversation(userId, recipientId) {
    if (userId === recipientId) {
      throw selfConversationError();
    }

    const conversation = await this.directMessageRepository.findOrCreateConversation(
      userId,
      recipientId,
    );

    return toConversationDto(conversation);
  }

  async sendMessage(userId, conversationId, { content }) {
    if (typeof content !== 'string') {
      throw messageValidationError('Message content is required and must be a string', [
        { name: 'content', reason: 'Expected string, received ' + typeof content },
      ]);
    }

    const trimmedContent = content.trim();
    if (trimmedContent.length === 0) {
      throw messageValidationError('Message content must not be empty', [
        { name: 'content', reason: 'Message content must not be empty' },
      ]);
    }

    if (content.length > 2000) {
      throw messageValidationError("Field 'content' must not exceed 2000 characters", [
        { name: 'content', reason: 'Length must be less than or equal to 2000 characters' },
      ]);
    }

    const conversation = await this.directMessageRepository.findConversationById(conversationId);
    if (!conversation) {
      throw conversationNotFoundError();
    }

    if (conversation.user_a_id !== userId && conversation.user_b_id !== userId) {
      throw insufficientPermissionsError();
    }

    const message = await this.directMessageRepository.createMessage({
      id: randomUUID(),
      conversationId,
      senderId: userId,
      content: trimmedContent,
    });

    return toDirectMessageDto(message);
  }

  async getMessages(userId, conversationId) {
    const conversation = await this.directMessageRepository.findConversationById(conversationId);
    if (!conversation) {
      throw conversationNotFoundError();
    }

    if (conversation.user_a_id !== userId && conversation.user_b_id !== userId) {
      throw insufficientPermissionsError();
    }

    const messages = await this.directMessageRepository.findMessagesByConversation(conversationId);
    return messages.map(toDirectMessageDto);
  }
}

module.exports = { DirectMessageService, toConversationDto, toDirectMessageDto };
