class MessageRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async create({ id, channelId, senderId, content }) {
    const sentAt = new Date().toISOString();
    const result = await this.pool.query(
      `INSERT INTO messages (id, channel_id, sender_id, content, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $5)
       RETURNING id, channel_id, sender_id, content, created_at, updated_at`,
      [id, channelId, senderId, content, sentAt],
    );

    return result.rows[0];
  }

  async findById(id) {
    const result = await this.pool.query(
      `SELECT id, channel_id, sender_id, content, deleted_at, created_at, updated_at
       FROM messages
       WHERE id = $1`,
      [id],
    );

    return result.rows[0] || null;
  }

  async findByChannelId(channelId, { limit = 50, before = null } = {}) {
    const result = await this.pool.query(
      `SELECT id, channel_id, sender_id, content, deleted_at, created_at, updated_at
       FROM messages
       WHERE channel_id = $1
         AND deleted_at IS NULL
         AND ($2::timestamptz IS NULL OR created_at < $2::timestamptz
              OR (created_at = $2::timestamptz AND id < $4::uuid))
       ORDER BY created_at DESC, id DESC
       LIMIT $3`,
      [channelId, before?.createdAt || null, limit, before?.id || 'ffffffff-ffff-4fff-bfff-ffffffffffff'],
    );

    return result.rows;
  }

  async update({ id, content }) {
    const result = await this.pool.query(
      `UPDATE messages
       SET content = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING id, channel_id, sender_id, content, deleted_at, created_at, updated_at`,
      [id, content],
    );

    return result.rows[0] || null;
  }

  async softDelete(id) {
    const result = await this.pool.query(
      `UPDATE messages
       SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING id, channel_id, sender_id, content, deleted_at, created_at, updated_at`,
      [id],
    );

    return result.rows[0] || null;
  }
}

module.exports = { MessageRepository };
