const fs = require('fs/promises');
const path = require('path');
const bcrypt = require('bcryptjs');
const { newDb } = require('pg-mem');
const request = require('supertest');
const { createApp } = require('../src/app');
const { UserRepository } = require('../src/repositories/userRepository');
const { CommunityRepository } = require('../src/repositories/communityRepository');
const { ChannelRepository } = require('../src/repositories/channelRepository');
const { ChannelPermissionRepository } = require('../src/repositories/channelPermissionRepository');
const { MessageRepository } = require('../src/repositories/messageRepository');
const { AuthService } = require('../src/services/authService');
const { CommunityService } = require('../src/services/communityService');
const { ChannelService } = require('../src/services/channelService');
const { MessageService } = require('../src/services/messageService');

async function buildTestContext({ enableRateLimit = false } = {}) {
  const database = newDb();
  const adapter = database.adapters.createPg();
  const pool = new adapter.Pool();

  for (const file of [
    '001_create_users.sql',
    '002_create_communities.sql',
    '003_create_channels.sql',
    '004_create_messages.sql',
  ]) {
    const migration = path.resolve(__dirname, `../../database/migrations/${file}`);
    await pool.query(await fs.readFile(migration, 'utf8'));
  }

  const userRepository = new UserRepository(pool);
  const communityRepository = new CommunityRepository(pool);
  const channelRepository = new ChannelRepository(pool);
  const permissionRepository = new ChannelPermissionRepository(pool);
  const messageRepository = new MessageRepository(pool);

  const authService = new AuthService(userRepository);
  const communityService = new CommunityService(communityRepository);
  const channelService = new ChannelService(channelRepository, permissionRepository);
  const messageService = new MessageService(messageRepository, channelService);

  const app = createApp({
    authService,
    communityService,
    channelService,
    messageService,
    enableRateLimit,
  });

  return { app, pool };
}

describe('NFR-02: Authentication and Security Controls Validation', () => {
  let app;
  let pool;

  beforeEach(async () => {
    ({ app, pool } = await buildTestContext({ enableRateLimit: false }));
  });

  afterEach(async () => {
    await pool.end();
  });

  describe('1. Secure Password Storage & Non-Exposure', () => {
    test('stores password as a salted bcrypt hash, never in plaintext', async () => {
      const plaintextPassword = 'SecurePassword123!';
      const res = await request(app).post('/api/auth/register').send({
        username: 'alice_sec',
        email: 'alice_sec@example.com',
        password: plaintextPassword,
      });

      expect(res.status).toBe(201);
      expect(res.body.data).not.toHaveProperty('password');
      expect(res.body.data).not.toHaveProperty('passwordHash');

      const dbUser = await pool.query(
        'SELECT password_hash FROM users WHERE username = $1',
        ['alice_sec'],
      );

      const hash = dbUser.rows[0].password_hash;
      expect(hash).not.toBe(plaintextPassword);
      expect(hash.startsWith('$2')).toBe(true);
      expect(await bcrypt.compare(plaintextPassword, hash)).toBe(true);
    });

    test('login response does not expose password or hash', async () => {
      await request(app).post('/api/auth/register').send({
        username: 'bob_sec',
        email: 'bob_sec@example.com',
        password: 'SecurePassword123!',
      });

      const loginRes = await request(app).post('/api/auth/login').send({
        username: 'bob_sec',
        password: 'SecurePassword123!',
      });

      expect(loginRes.status).toBe(200);
      expect(loginRes.body.data).toHaveProperty('token');
      expect(loginRes.body.data.user).not.toHaveProperty('password');
      expect(loginRes.body.data.user).not.toHaveProperty('passwordHash');
    });
  });

  describe('2. Protected REST Routes Authorization Enforcement', () => {
    test('GET /api/users/me rejects unauthenticated request with 401', async () => {
      const res = await request(app).get('/api/users/me');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
    });

    test('POST /api/communities rejects invalid token format with 401', async () => {
      const res = await request(app)
        .post('/api/communities')
        .set('Authorization', 'InvalidFormat')
        .send({ name: 'Secured Community' });

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
    });

    test('POST /api/channels/:id/messages rejects forged token with 401', async () => {
      const res = await request(app)
        .post('/api/channels/11111111-1111-4111-8111-111111111111/messages')
        .set('Authorization', 'Bearer forged.jwt.token')
        .send({ content: 'Hello' });

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
    });
  });

  describe('3. Rate Limiting Enforcement', () => {
    test('limits registration to 10 requests per minute and returns 429 on excess', async () => {
      const { app: rateLimitedApp, pool: rateLimitedPool } = await buildTestContext({
        enableRateLimit: true,
      });

      try {
        for (let i = 0; i < 10; i++) {
          const res = await request(rateLimitedApp).post('/api/auth/register').send({});
          expect(res.status).toBe(400);
        }

        const blockedRes = await request(rateLimitedApp).post('/api/auth/register').send({});
        expect(blockedRes.status).toBe(429);
        expect(blockedRes.body.code).toBe('RATE_LIMIT_EXCEEDED');
      } finally {
        await rateLimitedPool.end();
      }
    });
  });

  describe('4. Input Validation & Safe Error Handling', () => {
    test('rejects malformed JSON payload without exposing stack traces', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .set('Content-Type', 'application/json')
        .send('{"invalid json:');

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_INPUT_PAYLOAD');
      expect(JSON.stringify(res.body)).not.toContain('SyntaxError');
      expect(JSON.stringify(res.body)).not.toContain('node_modules');
    });

    test('internal 500 error sanitizes sensitive server details', async () => {
      const authService = {
        register: jest.fn().mockRejectedValue(new Error('FATAL: password authentication failed for postgres_admin_user')),
      };
      const brokenApp = createApp({ authService, enableRateLimit: false });

      const res = await request(brokenApp).post('/api/auth/register').send({
        username: 'victim_user',
        email: 'victim@example.com',
        password: 'Password123!',
      });

      expect(res.status).toBe(500);
      expect(res.body.code).toBe('INTERNAL_SERVER_ERROR');
      expect(JSON.stringify(res.body)).not.toContain('postgres_admin_user');
      expect(JSON.stringify(res.body)).not.toContain('FATAL');
    });
  });
});
