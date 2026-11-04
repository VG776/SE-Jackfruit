class MessageRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async create({ id, channelId, senderId, content }) {
    const result = await this.pool.query(
      `INSERT INTO messages (id, channel_id, sender_id, content)
       VALUES ($1, $2, $3, $4)
       RETURNING id, channel_id, sender_id, content, created_at, updated_at`,
      [id, channelId, senderId, content],
    );

    return result.rows[0];
  }

  async findById(id) {
    const result = await this.pool.query(
      `SELECT id, channel_id, sender_id, content, created_at, updated_at
       FROM messages
       WHERE id = $1`,
      [id],
    );

    return result.rows[0] || null;
  }

  async findByChannelId(channelId, { limit = 50, before = null } = {}) {
    const result = await this.pool.query(
      `SELECT id, channel_id, sender_id, content, created_at, updated_at
       FROM messages
       WHERE channel_id = $1
         AND ($2::timestamptz IS NULL OR created_at < $2::timestamptz
              OR (created_at = $2::timestamptz AND id < $4::uuid))
       ORDER BY created_at DESC, id DESC
       LIMIT $3`,
      [channelId, before?.createdAt || null, limit, before?.id || 'ffffffff-ffff-4fff-bfff-ffffffffffff'],
    );

    return result.rows;
  }
}

module.exports = { MessageRepository };
