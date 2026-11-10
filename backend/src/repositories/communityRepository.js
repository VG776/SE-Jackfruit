class CommunityRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async listForUser(userId) {
    const result = await this.pool.query(
      `SELECT c.id, c.name, c.description,
              CASE WHEN c.owner_id = $1 THEN 'admin' ELSE cm.role END AS role
         FROM communities c
         LEFT JOIN community_members cm ON cm.community_id = c.id AND cm.user_id = $1
        WHERE c.owner_id = $1 OR cm.user_id IS NOT NULL
        ORDER BY c.name, c.id`,
      [userId],
    );
    return result.rows;
  }

  async findByOwnerAndName(ownerId, name) {
    const result = await this.pool.query(
      `SELECT id, owner_id, name
         FROM communities
        WHERE owner_id = $1
          AND LOWER(name) = LOWER($2)`,
      [ownerId, name],
    );

    return result.rows[0] || null;
  }

  async create({ id, ownerId, name, description }) {
    const result = await this.pool.query(
      `INSERT INTO communities (id, owner_id, name, description)
       VALUES ($1, $2, $3, $4)
       RETURNING id, owner_id, name, description, created_at`,
      [id, ownerId, name, description ?? null],
    );

    return result.rows[0];
  }
}

module.exports = { CommunityRepository };
