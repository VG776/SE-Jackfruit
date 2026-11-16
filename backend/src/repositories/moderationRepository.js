class ModerationRepository {
  constructor(pool) {
    this.pool = pool;
  }

  // Soft-deletes the message and writes the audit record in one transaction, so a removal
  // is never applied without its audit event (FR-MOD-01, FR-MOD-03).
  // Returns the removed message row, or null if it was already removed / does not exist.
  async removeMessageWithAudit({ messageId, auditId, communityId, actorId, details }) {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      const removed = await client.query(
        `UPDATE messages
         SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND deleted_at IS NULL
         RETURNING id, channel_id, sender_id, deleted_at`,
        [messageId],
      );

      if (removed.rows.length === 0) {
        await client.query('ROLLBACK');
        return null;
      }

      await client.query(
        `INSERT INTO audit_logs (id, community_id, actor_id, action, target_type, target_id, details)
         VALUES ($1, $2, $3, 'MESSAGE_REMOVED', 'message', $4, $5)`,
        [auditId, communityId, actorId, messageId, JSON.stringify(details)],
      );

      await client.query('COMMIT');
      return removed.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = { ModerationRepository };
