class UnreadRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async getCountsByChannel(userId) {
    const result = await this.pool.query(
      `WITH accessible_channels AS (
         SELECT DISTINCT ch.id
           FROM channels ch
           JOIN communities c ON c.id = ch.community_id
           LEFT JOIN community_members cm
             ON cm.community_id = c.id
            AND cm.user_id = $1
          WHERE c.owner_id = $1 OR cm.user_id = $1
       )
       SELECT ac.id AS channel_id, COUNT(m.id)::integer AS unread_count
         FROM accessible_channels ac
         LEFT JOIN channel_read_states rs
           ON rs.channel_id = ac.id
          AND rs.user_id = $1
         LEFT JOIN messages marker
           ON marker.id = rs.last_read_message_id
          AND marker.channel_id = ac.id
         LEFT JOIN messages m
           ON m.channel_id = ac.id
          AND m.deleted_at IS NULL
          AND m.sender_id <> $1
          AND (
            rs.last_read_message_id IS NULL
            OR marker.id IS NULL
            OR m.created_at > marker.created_at
            OR (m.created_at = marker.created_at AND m.id > marker.id)
          )
        GROUP BY ac.id
        ORDER BY ac.id`,
      [userId],
    );

    return result.rows.map((row) => ({
      channelId: row.channel_id,
      unreadCount: Number(row.unread_count),
    }));
  }

  async markChannelRead(userId, channelId) {
    const result = await this.pool.query(
      `INSERT INTO channel_read_states (user_id, channel_id, last_read_message_id, updated_at)
       VALUES (
         $1,
         $2,
         (SELECT id FROM messages
           WHERE channel_id = $2 AND deleted_at IS NULL
           ORDER BY created_at DESC, id DESC
           LIMIT 1),
         CURRENT_TIMESTAMP
       )
       ON CONFLICT (user_id, channel_id) DO UPDATE
         SET last_read_message_id = COALESCE(
               EXCLUDED.last_read_message_id,
               channel_read_states.last_read_message_id
             ),
             updated_at = CURRENT_TIMESTAMP
       RETURNING user_id, channel_id, last_read_message_id, updated_at`,
      [userId, channelId],
    );

    return result.rows[0];
  }
}

module.exports = { UnreadRepository };
