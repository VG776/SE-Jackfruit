class UserRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async findRegistrationConflicts(username, email) {
    const result = await this.pool.query(
      `SELECT username, email
         FROM users
        WHERE LOWER(username) = LOWER($1)
           OR LOWER(email) = LOWER($2)`,
      [username, email],
    );

    return result.rows;
  }

  async create({ id, username, email, passwordHash, displayName }) {
    const result = await this.pool.query(
      `INSERT INTO users (id, username, email, password_hash, display_name)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, username, email, display_name, created_at`,
      [id, username, email, passwordHash, displayName],
    );

    return result.rows[0];
  }

  async findById(id) {
    const result = await this.pool.query(
      `SELECT id, username, email, display_name, avatar_url, status, created_at, updated_at
         FROM users
        WHERE id = $1`,
      [id],
    );

    return result.rows[0] || null;
  }

  async updateProfile(userId, profile) {
    const result = await this.pool.query(
      `UPDATE users
          SET display_name = CASE WHEN $2::boolean THEN $3 ELSE display_name END,
              avatar_url = CASE WHEN $4::boolean THEN $5 ELSE avatar_url END,
              status = CASE WHEN $6::boolean THEN $7 ELSE status END,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING id, username, email, display_name, avatar_url, status, created_at, updated_at`,
      [
        userId,
        profile.displayName !== undefined,
        profile.displayName ?? null,
        profile.avatarUrl !== undefined,
        profile.avatarUrl ?? null,
        profile.status !== undefined,
        profile.status ?? null,
      ],
    );

    return result.rows[0] || null;
  }

  async findByIdentifier(identifier) {
    const result = await this.pool.query(
      `SELECT id, username, email, password_hash, display_name, avatar_url, status, created_at, updated_at
         FROM users
        WHERE LOWER(username) = LOWER($1)
           OR LOWER(email) = LOWER($1)`,
      [identifier],
    );

    return result.rows[0] || null;
  }
}

module.exports = { UserRepository };
