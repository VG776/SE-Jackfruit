const { randomUUID } = require('crypto');
const { AppError } = require('../errors/AppError');

const MODERATOR_ROLES = ['admin', 'moderator'];

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

class ModerationService {
  constructor(moderationRepository, messageRepository, channelService) {
    this.moderationRepository = moderationRepository;
    this.messageRepository = messageRepository;
    this.channelService = channelService;
  }

  // Removes a message as a moderator/admin of its community and records an audit event.
  // Non-members and unknown messages get the same 404; members without moderation
  // permission get 403 and nothing changes.
  async removeMessage(actorId, channelId, messageId, { reason = null } = {}) {
    const channel = await this.channelService.assertCanAccessChannel(actorId, channelId);

    const role = await this.channelService.permissionRepository.roleInCommunity(
      actorId,
      channel.community_id,
    );
    if (!MODERATOR_ROLES.includes(role)) throw insufficientPermissionsError();

    const message = await this.messageRepository.findById(messageId);
    if (!message || message.deleted_at || message.channel_id !== channelId) {
      throw messageNotFoundError();
    }

    const removed = await this.moderationRepository.removeMessageWithAudit({
      messageId,
      auditId: randomUUID(),
      communityId: channel.community_id,
      actorId,
      details: { channelId, authorId: message.sender_id, reason },
    });
    if (!removed) throw messageNotFoundError();

    return { id: messageId, removed: true, moderated: true };
  }
}

module.exports = { ModerationService, MODERATOR_ROLES };
