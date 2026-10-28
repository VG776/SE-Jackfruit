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
}

module.exports = { UserRepository };
