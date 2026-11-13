class ReactionRepository {
  constructor(pool) {
    this.pool = pool;
  }

  // Returns true when a new row was inserted, false when the user already had this reaction.
  async add({ messageId, userId, emoji }) {
    const existing = await this.pool.query(
      `SELECT 1 FROM message_reactions
       WHERE message_id = $1 AND user_id = $2 AND emoji = $3`,
      [messageId, userId, emoji],
    );
    if (existing.rows.length > 0) return false;

    // The primary key plus ON CONFLICT keeps concurrent duplicate requests harmless.
    await this.pool.query(
      `INSERT INTO message_reactions (message_id, user_id, emoji)
       VALUES ($1, $2, $3)
       ON CONFLICT (message_id, user_id, emoji) DO NOTHING`,
      [messageId, userId, emoji],
    );

    return true;
  }

  // Returns true when a row was removed, false when the user had no such reaction.
  async remove({ messageId, userId, emoji }) {
    const result = await this.pool.query(
      `DELETE FROM message_reactions
       WHERE message_id = $1 AND user_id = $2 AND emoji = $3
       RETURNING message_id`,
      [messageId, userId, emoji],
    );

    return result.rows.length > 0;
  }

  async listByMessageId(messageId) {
    const result = await this.pool.query(
      `SELECT emoji, user_id
       FROM message_reactions
       WHERE message_id = $1
       ORDER BY created_at ASC, emoji ASC`,
      [messageId],
    );

    return result.rows;
  }
}

module.exports = { ReactionRepository };
