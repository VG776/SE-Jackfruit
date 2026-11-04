const { randomUUID } = require('crypto');

class DirectMessageRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async findOrCreateConversation(user1Id, user2Id) {
    const [userAId, userBId] = [user1Id, user2Id].sort();

    const existing = await this.pool.query(
      `SELECT id, user_a_id, user_b_id, created_at
       FROM direct_conversations
       WHERE user_a_id = $1 AND user_b_id = $2`,
      [userAId, userBId],
    );

    if (existing.rows[0]) {
      return existing.rows[0];
    }

    const id = randomUUID();
    const inserted = await this.pool.query(
      `INSERT INTO direct_conversations (id, user_a_id, user_b_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_a_id, user_b_id) DO UPDATE
       SET user_a_id = EXCLUDED.user_a_id
       RETURNING id, user_a_id, user_b_id, created_at`,
      [id, userAId, userBId],
    );

    return inserted.rows[0];
  }

  async findConversationById(id) {
    const result = await this.pool.query(
      `SELECT id, user_a_id, user_b_id, created_at
       FROM direct_conversations
       WHERE id = $1`,
      [id],
    );

    return result.rows[0] || null;
  }

  async createMessage({ id, conversationId, senderId, content }) {
    const result = await this.pool.query(
      `INSERT INTO direct_messages (id, conversation_id, sender_id, content)
       VALUES ($1, $2, $3, $4)
       RETURNING id, conversation_id, sender_id, content, created_at, updated_at`,
      [id, conversationId, senderId, content],
    );

    return result.rows[0];
  }

  async findMessagesByConversation(conversationId, { limit = 50 } = {}) {
    const result = await this.pool.query(
      `SELECT id, conversation_id, sender_id, content, created_at, updated_at
       FROM direct_messages
       WHERE conversation_id = $1
       ORDER BY created_at ASC
       LIMIT $2`,
      [conversationId, limit],
    );

    return result.rows;
  }
}

module.exports = { DirectMessageRepository };
