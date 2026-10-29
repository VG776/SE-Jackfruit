
require('dotenv').config({
  path: require('path').resolve(__dirname, '../../.env')
});

const { testConnection, pool } = require('../src/db');

async function main() {
  try {
    await testConnection();
    console.log('PASS: Database connection successful');
  } catch (error) {
    console.error('FAIL: Database connection failed:', error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
