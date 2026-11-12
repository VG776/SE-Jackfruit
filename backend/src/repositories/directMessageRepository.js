const crypto = require('crypto');

class DirectMessageRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async findOrCreateConversation(user1Id, user2Id) {
    const [userAId, userBId] = user1Id < user2Id ? [user1Id, user2Id] : [user2Id, user1Id];

    const existing = await this.pool.query(
      'SELECT id, user_a_id, user_b_id, created_at FROM direct_conversations WHERE user_a_id = $1 AND user_b_id = $2',
      [userAId, userBId],
    );

    if (existing.rows.length > 0) {
      return existing.rows[0];
    }

    const conversationId = crypto.randomUUID();
    const result = await this.pool.query(
      `INSERT INTO direct_conversations (id, user_a_id, user_b_id, created_at)
       VALUES ($1, $2, $3, NOW())
       RETURNING id, user_a_id, user_b_id, created_at`,
      [conversationId, userAId, userBId],
    );

    return result.rows[0];
  }

  async findConversationById(id) {
    const result = await this.pool.query(
      'SELECT id, user_a_id, user_b_id, created_at FROM direct_conversations WHERE id = $1',
      [id],
    );
    return result.rows[0] || null;
  }

  async createMessage({ id = crypto.randomUUID(), conversationId, senderId, content }) {
    const result = await this.pool.query(
      `INSERT INTO direct_messages (id, conversation_id, sender_id, content, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())
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

module.exports = DirectMessageRepository;
