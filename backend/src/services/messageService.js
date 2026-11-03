const { randomUUID } = require('crypto');
const { AppError } = require('../errors/AppError');

function messageValidationError(detail, invalidParams) {
  return new AppError({
    status: 400,
    code: 'INVALID_INPUT_PAYLOAD',
    detail,
    invalidParams,
  });
}

function toMessageDto(message) {
  return {
    id: message.id,
    channelId: message.channel_id,
    senderId: message.sender_id,
    content: message.content,
    createdAt:
      message.created_at instanceof Date ? message.created_at.toISOString() : message.created_at,
    updatedAt:
      message.updated_at instanceof Date ? message.updated_at.toISOString() : message.updated_at,
  };
}

class MessageService {
  constructor(messageRepository, channelService) {
    this.messageRepository = messageRepository;
    this.channelService = channelService;
  }

  async sendMessage(userId, channelId, { content, clientNonce }) {
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

    // Verify channel access via ChannelService (enforces community membership / ownership)
    // Non-member or non-existent channel throws 404 (channelNotFoundError / generic 404)
    await this.channelService.assertCanAccessChannel(userId, channelId);

    const message = await this.messageRepository.create({
      id: randomUUID(),
      channelId,
      senderId: userId,
      content,
    });

    const dto = toMessageDto(message);
    if (clientNonce) {
      dto.clientNonce = clientNonce;
    }
    return dto;
  }
}

module.exports = { MessageService, toMessageDto };
