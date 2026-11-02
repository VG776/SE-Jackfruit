class ChannelPermissionRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async roleInCommunity(userId, communityId) {
    const result = await this.pool.query(
      `SELECT CASE WHEN c.owner_id = $2 THEN 'admin' ELSE cm.role END AS role
         FROM communities c
         LEFT JOIN community_members cm
           ON cm.community_id = c.id
          AND cm.user_id = $2
        WHERE c.id = $1
          AND (c.owner_id = $2 OR cm.user_id IS NOT NULL)
        LIMIT 1`,
      [communityId, userId],
    );

    return result.rows[0]?.role || null;
  }
}

module.exports = { ChannelPermissionRepository };
