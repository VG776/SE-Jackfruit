const { AppError } = require('../errors/AppError');

function messageNotFoundError() {
  return new AppError({
    status: 404,
    code: 'MESSAGE_NOT_FOUND',
    detail: 'The requested message could not be found.',
  });
}

function reactionNotFoundError() {
  return new AppError({
    status: 404,
    code: 'REACTION_NOT_FOUND',
    detail: 'The requested reaction could not be found.',
  });
}

// Groups raw rows into [{ emoji, count, userIds }] preserving first-seen order.
function summarizeReactions(rows) {
  const byEmoji = new Map();
  for (const row of rows) {
    if (!byEmoji.has(row.emoji)) {
      byEmoji.set(row.emoji, { emoji: row.emoji, count: 0, userIds: [] });
    }
    const entry = byEmoji.get(row.emoji);
    entry.count += 1;
    entry.userIds.push(row.user_id);
  }
  return [...byEmoji.values()];
}

class ReactionService {
  constructor(reactionRepository, messageRepository, channelService) {
    this.reactionRepository = reactionRepository;
    this.messageRepository = messageRepository;
    this.channelService = channelService;
  }

  // Resolves the message and verifies the caller may access its channel.
  // Missing, deleted, or inaccessible messages all produce the same 404 so message IDs
  // cannot be probed by non-members.
  async assertCanAccessMessage(userId, messageId) {
    const message = await this.messageRepository.findById(messageId);
    if (!message || message.deleted_at) throw messageNotFoundError();

    try {
      await this.channelService.assertCanAccessChannel(userId, message.channel_id);
    } catch (error) {
      if (error instanceof AppError && error.status === 404) throw messageNotFoundError();
      throw error;
    }

    return message;
  }

  async addReaction(userId, messageId, emoji) {
    await this.assertCanAccessMessage(userId, messageId);
    const added = await this.reactionRepository.add({ messageId, userId, emoji });
    const reactions = summarizeReactions(await this.reactionRepository.listByMessageId(messageId));
    return { messageId, added, reactions };
  }

  async removeReaction(userId, messageId, emoji) {
    await this.assertCanAccessMessage(userId, messageId);
    const removed = await this.reactionRepository.remove({ messageId, userId, emoji });
    if (!removed) throw reactionNotFoundError();
  }

  async listReactions(userId, messageId) {
    await this.assertCanAccessMessage(userId, messageId);
    const reactions = summarizeReactions(await this.reactionRepository.listByMessageId(messageId));
    return { messageId, reactions };
  }
}

module.exports = { ReactionService, summarizeReactions };
