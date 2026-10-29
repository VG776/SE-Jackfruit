
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || 'nexuschat',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  connectionTimeoutMillis: 5000
});

pool.on('error', (error) => {
  console.error('Unexpected PostgreSQL error:', error.message);
});

async function testConnection() {
  const result = await pool.query('SELECT NOW() AS current_time');
  console.log(
    'PostgreSQL connected:',
    result.rows[0].current_time
  );
}

module.exports = { pool, testConnection };
