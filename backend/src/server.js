const { createDatabasePool } = require('./config/database');
const { UserRepository } = require('./repositories/userRepository');
const { AuthService } = require('./services/authService');
const { createApp } = require('./app');

const port = Number(process.env.API_PORT || 5000);
const pool = createDatabasePool();
const userRepository = new UserRepository(pool);
const authService = new AuthService(userRepository);
const app = createApp({ authService });

const server = app.listen(port, () => {
  console.log(`NexusChat API listening on port ${port}.`);
});

async function shutDown() {
  server.close(async () => {
    await pool.end();
  });
}

process.on('SIGINT', shutDown);
process.on('SIGTERM', shutDown);
