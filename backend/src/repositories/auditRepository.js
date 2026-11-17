class AuditRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async record({ id, communityId, actorId, action, targetType, targetId, details }) {
    const result = await this.pool.query(
      `INSERT INTO audit_logs (id, community_id, actor_id, action, target_type, target_id, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, created_at`,
      [id, communityId, actorId, action, targetType, targetId, JSON.stringify(details || {})],
    );
    return result.rows[0];
  }

  async listByCommunity(communityId, { limit, offset }) {
    const result = await this.pool.query(
      `SELECT a.id, a.actor_id, u.username AS actor_username, a.action, a.target_type,
              a.target_id, a.details, a.created_at
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.actor_id
       WHERE a.community_id = $1
       ORDER BY a.created_at DESC, a.id DESC
       LIMIT $2 OFFSET $3`,
      [communityId, limit, offset],
    );
    return result.rows;
  }
}

module.exports = { AuditRepository };
