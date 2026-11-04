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
}

module.exports = { MessageRepository };
