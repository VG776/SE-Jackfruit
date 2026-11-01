class ChannelPermissionRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async canManageChannels(userId, communityId) {
    const result = await this.pool.query(
      `SELECT 1
         FROM communities c
         LEFT JOIN community_members cm
           ON cm.community_id = c.id
          AND cm.user_id = $2
        WHERE c.id = $1
          AND (c.owner_id = $2 OR cm.role = 'admin')
        LIMIT 1`,
      [communityId, userId],
    );

    return result.rowCount > 0;
  }
}

module.exports = { ChannelPermissionRepository };
