class ChannelPermissionRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async getCommunityManagementDecision(userId, communityId) {
    const result = await this.pool.query(
      `SELECT c.id,
              (c.owner_id = $2 OR cm.role = 'admin') AS permitted
         FROM communities c
         LEFT JOIN community_members cm
           ON cm.community_id = c.id
          AND cm.user_id = $2
        WHERE c.id = $1
        LIMIT 1`,
      [communityId, userId],
    );

    if (result.rowCount === 0) {
      return { exists: false, permitted: false };
    }

    return { exists: true, permitted: result.rows[0].permitted === true };
  }

  async getChannelManagementDecision(userId, channelId) {
    const result = await this.pool.query(
      `SELECT ch.id,
              (c.owner_id = $2 OR cm.role = 'admin') AS permitted
         FROM channels ch
         JOIN communities c ON c.id = ch.community_id
         LEFT JOIN community_members cm
           ON cm.community_id = c.id
          AND cm.user_id = $2
        WHERE ch.id = $1
        LIMIT 1`,
      [channelId, userId],
    );

    if (result.rowCount === 0) {
      return { exists: false, permitted: false };
    }

    return { exists: true, permitted: result.rows[0].permitted === true };
  }

  async canManageChannels(userId, communityId) {
    const decision = await this.getCommunityManagementDecision(userId, communityId);
    return decision.permitted;
  }
}

module.exports = { ChannelPermissionRepository };
