class ChannelRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async listForCommunity(communityId) {
    const result = await this.pool.query(
      `SELECT id, community_id, name, type, created_at, updated_at
         FROM channels
        WHERE community_id = $1
        ORDER BY created_at, id`,
      [communityId],
    );
    return result.rows;
  }

  async findById(channelId) {
    const result = await this.pool.query(
      `SELECT id, community_id, name, type, created_at, updated_at
         FROM channels
        WHERE id = $1`,
      [channelId],
    );

    return result.rows[0] || null;
  }

  async findNameConflict(communityId, name, excludedChannelId = null) {
    const result = await this.pool.query(
      `SELECT id
         FROM channels
        WHERE community_id = $1
          AND LOWER(name) = LOWER($2)
          AND ($3::uuid IS NULL OR id <> $3)`,
      [communityId, name, excludedChannelId],
    );

    return result.rows[0] || null;
  }

  async create({ id, communityId, name, type }) {
    const result = await this.pool.query(
      `INSERT INTO channels (id, community_id, name, type)
       VALUES ($1, $2, $3, $4)
       RETURNING id, community_id, name, type, created_at, updated_at`,
      [id, communityId, name, type],
    );

    return result.rows[0];
  }

  async rename(channelId, name) {
    const result = await this.pool.query(
      `UPDATE channels
          SET name = $2,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
       RETURNING id, community_id, name, type, created_at, updated_at`,
      [channelId, name],
    );

    return result.rows[0] || null;
  }

  async delete(channelId) {
    const result = await this.pool.query('DELETE FROM channels WHERE id = $1', [channelId]);
    return result.rowCount > 0;
  }
}

module.exports = { ChannelRepository };
