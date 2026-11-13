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

function messageNotFoundError() {
  return new AppError({
    status: 404,
    code: 'MESSAGE_NOT_FOUND',
    detail: 'The requested message could not be found.',
  });
}

function insufficientPermissionsError() {
  return new AppError({
    status: 403,
    code: 'INSUFFICIENT_PERMISSIONS',
    detail: 'You do not have permission to perform this operation.',
  });
}

function toMessageDto(message) {
  return {
    id: message.id,
    channelId: message.channel_id,
    senderId: message.sender_id,
    content: message.content,
    deletedAt:
      message.deleted_at instanceof Date
        ? message.deleted_at.toISOString()
        : message.deleted_at || null,
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

  async getChannelHistory(userId, channelId, { limit = 50, cursor } = {}) {
    await this.channelService.assertCanAccessChannel(userId, channelId);

    let before = null;
    if (cursor) {
      try {
        before = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
      } catch (_error) {
        throw messageValidationError('The history cursor is invalid', [
          { name: 'cursor', reason: 'Expected a cursor returned by the message history endpoint' },
        ]);
      }
      if (
        !before ||
        typeof before.createdAt !== 'string' ||
        Number.isNaN(Date.parse(before.createdAt)) ||
        typeof before.id !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(before.id)
      ) {
        throw messageValidationError('The history cursor is invalid', [
          { name: 'cursor', reason: 'Expected a cursor returned by the message history endpoint' },
        ]);
      }
    }

    const rows = await this.messageRepository.findByChannelId(channelId, {
      limit: limit + 1,
      before,
    });
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit).reverse().map(toMessageDto);
    const lastMessage = page[0];
    const nextCursor = hasMore && lastMessage
      ? Buffer.from(JSON.stringify({ createdAt: lastMessage.createdAt, id: lastMessage.id })).toString('base64url')
      : null;

    return { messages: page, hasMore, nextCursor };
  }

  async editMessage(userId, channelId, messageId, { content }) {
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

    await this.channelService.assertCanAccessChannel(userId, channelId);

    const message = await this.messageRepository.findById(messageId);
    if (!message || message.deleted_at || message.channel_id !== channelId) {
      throw messageNotFoundError();
    }

    if (message.sender_id !== userId) {
      throw insufficientPermissionsError();
    }

    const updated = await this.messageRepository.update({
      id: messageId,
      content: trimmedContent,
    });

    if (!updated) {
      throw messageNotFoundError();
    }

    return toMessageDto(updated);
  }

  async deleteMessage(userId, channelId, messageId) {
    const channel = await this.channelService.assertCanAccessChannel(userId, channelId);

    const message = await this.messageRepository.findById(messageId);
    if (!message || message.deleted_at || message.channel_id !== channelId) {
      throw messageNotFoundError();
    }

    const isAuthor = message.sender_id === userId;
    if (!isAuthor) {
      const role = this.channelService.permissionRepository
        ? await this.channelService.permissionRepository.roleInCommunity(userId, channel.community_id)
        : null;
      if (role !== 'admin' && role !== 'moderator') {
        throw insufficientPermissionsError();
      }
    }

    const deleted = await this.messageRepository.softDelete(messageId);
    if (!deleted) {
      throw messageNotFoundError();
    }

    return { id: messageId, deleted: true };
  }
}

module.exports = { MessageService, toMessageDto };
