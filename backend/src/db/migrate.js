const fs = require('fs/promises');
const path = require('path');
const { createDatabasePool } = require('../config/database');

const migrationsDirectory = path.resolve(__dirname, '../../../database/migrations');

async function runMigrations(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const filenames = (await fs.readdir(migrationsDirectory))
    .filter((filename) => filename.endsWith('.sql'))
    .sort();

  for (const filename of filenames) {
    const alreadyApplied = await pool.query(
      'SELECT 1 FROM schema_migrations WHERE filename = $1',
      [filename],
    );

    if (alreadyApplied.rowCount > 0) {
      continue;
    }

    const sql = await fs.readFile(path.join(migrationsDirectory, filename), 'utf8');
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [filename]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

async function main() {
  const pool = createDatabasePool();

  try {
    await runMigrations(pool);
    console.log('Database migrations completed.');
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main().catch(() => {
    console.error('Database migration failed.');
    process.exitCode = 1;
  });
}

module.exports = { runMigrations };
