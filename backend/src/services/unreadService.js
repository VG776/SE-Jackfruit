class UnreadService {
  constructor(unreadRepository, channelService) {
    this.unreadRepository = unreadRepository;
    this.channelService = channelService;
  }

  async getUnreadCounts(userId) {
    const channels = await this.unreadRepository.getCountsByChannel(userId);
    return {
      totalUnreadCount: channels.reduce((total, channel) => total + channel.unreadCount, 0),
      channels,
    };
  }

  async getChannelUnreadCount(userId, channelId) {
    await this.channelService.assertCanAccessChannel(userId, channelId);
    const channels = await this.unreadRepository.getCountsByChannel(userId);
    return channels.find((channel) => channel.channelId === channelId)?.unreadCount ?? 0;
  }

  async markChannelRead(userId, channelId) {
    await this.channelService.assertCanAccessChannel(userId, channelId);
    const readState = await this.unreadRepository.markChannelRead(userId, channelId);
    const unreadCount = await this.getChannelUnreadCount(userId, channelId);
    return {
      channelId,
      lastReadMessageId: readState.last_read_message_id,
      unreadCount,
    };
  }
}

module.exports = { UnreadService };
