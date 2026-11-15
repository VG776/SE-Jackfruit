class SearchRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async searchMessages({ userId, terms, channelId, communityId, limit = 20, offset = 0 }) {
    const conditions = [
      'm.deleted_at IS NULL',
      // Authorization boundary: user must be community owner or accepted community member
      '(c.owner_id = $1 OR cm.user_id IS NOT NULL)',
    ];
    const params = [userId];

    if (channelId) {
      params.push(channelId);
      conditions.push(`m.channel_id = $${params.length}`);
    }

    if (communityId) {
      params.push(communityId);
      conditions.push(`c.community_id = $${params.length}`);
    }

    // Match each term in content (case-insensitive substring match)
    for (const term of terms) {
      params.push(`%${term}%`);
      conditions.push(`m.content ILIKE $${params.length}`);
    }

    const whereClause = conditions.join(' AND ');

    // 1. Count total matching rows
    const countSql = `
      SELECT COUNT(DISTINCT m.id) AS total
        FROM messages m
        JOIN channels ch ON ch.id = m.channel_id
        JOIN communities c ON c.id = ch.community_id
        LEFT JOIN community_members cm ON cm.community_id = c.id AND cm.user_id = $1
       WHERE ${whereClause}
    `;

    const countResult = await this.pool.query(countSql, params);
    const totalCount = parseInt(countResult.rows[0]?.total || '0', 10);

    if (totalCount === 0) {
      return { totalCount: 0, rows: [] };
    }

    // 2. Fetch paginated rows with community, channel, and sender metadata
    params.push(limit);
    const limitPlaceholder = `$${params.length}`;
    params.push(offset);
    const offsetPlaceholder = `$${params.length}`;

    const dataSql = `
      SELECT m.id,
             m.content,
             m.created_at,
             m.updated_at,
             ch.id AS channel_id,
             ch.name AS channel_name,
             c.id AS community_id,
             c.name AS community_name,
             u.id AS sender_id,
             u.username AS sender_username,
             u.display_name AS sender_display_name,
             u.avatar_url AS sender_avatar_url
        FROM messages m
        JOIN channels ch ON ch.id = m.channel_id
        JOIN communities c ON c.id = ch.community_id
        JOIN users u ON u.id = m.sender_id
        LEFT JOIN community_members cm ON cm.community_id = c.id AND cm.user_id = $1
       WHERE ${whereClause}
       ORDER BY m.created_at DESC, m.id DESC
       LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}
    `;

    const dataResult = await this.pool.query(dataSql, params);

    return {
      totalCount,
      rows: dataResult.rows,
    };
  }
}

module.exports = { SearchRepository };
