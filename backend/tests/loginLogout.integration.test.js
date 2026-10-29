const fs = require('fs/promises');
const path = require('path');
const { newDb } = require('pg-mem');
const request = require('supertest');
const { createApp } = require('../src/app');
const { UserRepository } = require('../src/repositories/userRepository');
const { AuthService } = require('../src/services/authService');
const { TokenRevocationStore } = require('../src/services/tokenRevocationStore');
const { signToken } = require('../src/utils/token');

const migrationPath = path.resolve(__dirname, '../../database/migrations/001_create_users.sql');

async function buildTestContext({ enableRateLimit = false } = {}) {
  const database = newDb();
  const adapter = database.adapters.createPg();
  const pool = new adapter.Pool();
  await pool.query(await fs.readFile(migrationPath, 'utf8'));

  const repository = new UserRepository(pool);
  const tokenRevocationStore = new TokenRevocationStore();
  const authService = new AuthService(repository, undefined, tokenRevocationStore);
  const app = createApp({ authService, enableRateLimit });

  return { app, pool, authService, tokenRevocationStore };
}

describe('US-02: Login and Logout (FR-AUTH-02, FR-AUTH-03)', () => {
  let app;
  let pool;
  let authService;

  beforeEach(async () => {
    ({ app, pool, authService } = await buildTestContext({ enableRateLimit: false }));

    // Register a standard test user for login/logout tests
    await request(app).post('/api/auth/register').send({
      username: 'alice_dev',
      email: 'Alice@Example.com',
      password: 'SecurePassword123!',
    });
  });

  afterEach(async () => {
    await pool.end();
  });

  describe('POST /api/auth/login (FR-AUTH-02)', () => {
    test('logs in successfully with valid registered username and password', async () => {
      const response = await request(app).post('/api/auth/login').send({
        username: 'alice_dev',
        password: 'SecurePassword123!',
      });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        status: 'success',
        data: expect.objectContaining({
          token: expect.any(String),
          user: expect.objectContaining({
            id: expect.any(String),
            username: 'alice_dev',
            email: 'alice@example.com',
            displayName: 'alice_dev',
            status: 'offline',
          }),
        }),
      });

      // Passwords and hashes must never be exposed
      expect(JSON.stringify(response.body)).not.toContain('SecurePassword123!');
      expect(response.body.data.user).not.toHaveProperty('password');
      expect(response.body.data.user).not.toHaveProperty('passwordHash');
      expect(response.body.data.user).not.toHaveProperty('password_hash');
    });

    test('logs in successfully with valid registered email (case-insensitive)', async () => {
      const response = await request(app).post('/api/auth/login').send({
        username: 'ALICE@EXAMPLE.COM',
        password: 'SecurePassword123!',
      });

      expect(response.status).toBe(200);
      expect(response.body.data.user.username).toBe('alice_dev');
      expect(response.body.data.user.email).toBe('alice@example.com');
      expect(response.body.data).toHaveProperty('token');
    });

    test('rejects wrong password with generic 401 error', async () => {
      const response = await request(app).post('/api/auth/login').send({
        username: 'alice_dev',
        password: 'WrongPassword999!',
      });

      expect(response.status).toBe(401);
      expect(response.headers['content-type']).toMatch(/application\/problem\+json/);
      expect(response.body).toEqual(
        expect.objectContaining({
          type: 'https://nexuschat.internal/errors/invalid-credentials',
          title: 'Unauthorized',
          status: 401,
          code: 'INVALID_CREDENTIALS',
          detail: 'Invalid username or password',
          instance: '/api/auth/login',
        }),
      );
    });

    test('rejects non-existent username with identical 401 error without revealing absence', async () => {
      const response = await request(app).post('/api/auth/login').send({
        username: 'ghost_user',
        password: 'SecurePassword123!',
      });

      expect(response.status).toBe(401);
      expect(response.headers['content-type']).toMatch(/application\/problem\+json/);
      expect(response.body).toEqual(
        expect.objectContaining({
          type: 'https://nexuschat.internal/errors/invalid-credentials',
          title: 'Unauthorized',
          status: 401,
          code: 'INVALID_CREDENTIALS',
          detail: 'Invalid username or password',
          instance: '/api/auth/login',
        }),
      );
    });

    test('rejects non-existent email with identical 401 error without revealing absence', async () => {
      const response = await request(app).post('/api/auth/login').send({
        username: 'unknown@example.com',
        password: 'SecurePassword123!',
      });

      expect(response.status).toBe(401);
      expect(response.body).toEqual(
        expect.objectContaining({
          status: 401,
          code: 'INVALID_CREDENTIALS',
          detail: 'Invalid username or password',
        }),
      );
    });

    test.each([
      ['missing password', { username: 'alice_dev' }, 'password'],
      ['empty password', { username: 'alice_dev', password: '' }, 'password'],
      ['missing credentials', { password: 'SecurePassword123!' }, 'username'],
      ['empty username', { username: '', password: 'SecurePassword123!' }, 'username'],
    ])('rejects %s with 400 validation error', async (_caseName, payload, field) => {
      const response = await request(app).post('/api/auth/login').send(payload);

      expect(response.status).toBe(400);
      expect(response.headers['content-type']).toMatch(/application\/problem\+json/);
      expect(response.body).toEqual(
        expect.objectContaining({
          status: 400,
          code: 'INVALID_INPUT_PAYLOAD',
          invalidParams: expect.arrayContaining([
            expect.objectContaining({ name: field }),
          ]),
        }),
      );
    });

    test('rejects unexpected fields in login payload', async () => {
      const response = await request(app).post('/api/auth/login').send({
        username: 'alice_dev',
        password: 'SecurePassword123!',
        extraField: 'not-allowed',
      });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('INVALID_INPUT_PAYLOAD');
    });

    test('limits login requests per minute per client', async () => {
      const rateLimitedContext = await buildTestContext({ enableRateLimit: true });

      for (let i = 0; i < 10; i += 1) {
        const response = await request(rateLimitedContext.app)
          .post('/api/auth/login')
          .send({});
        expect(response.status).toBe(400);
      }

      const blockedResponse = await request(rateLimitedContext.app)
        .post('/api/auth/login')
        .send({});

      expect(blockedResponse.status).toBe(429);
      expect(blockedResponse.body).toEqual(
        expect.objectContaining({
          status: 429,
          code: 'RATE_LIMIT_EXCEEDED',
          detail: 'Too many requests. Please wait a moment before retrying.',
        }),
      );

      await rateLimitedContext.pool.end();
    });
  });

  describe('Protected Operations & Access Control', () => {
    test('rejects unauthenticated request to /api/users/me without Authorization header', async () => {
      const response = await request(app).get('/api/users/me');

      expect(response.status).toBe(401);
      expect(response.headers['content-type']).toMatch(/application\/problem\+json/);
      expect(response.body).toEqual(
        expect.objectContaining({
          status: 401,
          code: 'UNAUTHORIZED',
          detail: 'Authentication token is required',
        }),
      );
    });

    test('rejects malformed Authorization header scheme', async () => {
      const response = await request(app)
        .get('/api/users/me')
        .set('Authorization', 'Basic dXNlcjpwYXNz');

      expect(response.status).toBe(401);
      expect(response.body).toEqual(
        expect.objectContaining({
          status: 401,
          code: 'UNAUTHORIZED',
          detail: expect.stringContaining('Bearer'),
        }),
      );
    });

    test('rejects invalid/corrupt token signature', async () => {
      const loginRes = await request(app).post('/api/auth/login').send({
        username: 'alice_dev',
        password: 'SecurePassword123!',
      });
      const validToken = loginRes.body.data.token;
      const tamperedToken = `${validToken.slice(0, -6)}tamper`;

      const response = await request(app)
        .get('/api/users/me')
        .set('Authorization', `Bearer ${tamperedToken}`);

      expect(response.status).toBe(401);
      expect(response.body.code).toBe('UNAUTHORIZED');
    });

    test('rejects expired token', async () => {
      const expiredToken = signToken(
        { sub: 'alice-id', username: 'alice_dev' },
        authService.jwtSecret,
        { expiresInSeconds: -10 },
      );

      const response = await request(app)
        .get('/api/users/me')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(response.status).toBe(401);
      expect(response.body).toEqual(
        expect.objectContaining({
          status: 401,
          code: 'UNAUTHORIZED',
          detail: 'Authentication token has expired',
        }),
      );
    });

    test('allows authenticated request with valid token and returns active user profile', async () => {
      const loginRes = await request(app).post('/api/auth/login').send({
        username: 'alice_dev',
        password: 'SecurePassword123!',
      });
      const token = loginRes.body.data.token;

      const response = await request(app)
        .get('/api/users/me')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        status: 'success',
        data: expect.objectContaining({
          username: 'alice_dev',
          email: 'alice@example.com',
          displayName: 'alice_dev',
          status: 'offline',
        }),
      });

      // Also verify /api/auth/me alias
      const authMeResponse = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(authMeResponse.status).toBe(200);
      expect(authMeResponse.body.data.username).toBe('alice_dev');
    });
  });

  describe('POST /api/auth/logout (FR-AUTH-03)', () => {
    test('rejects logout without authentication', async () => {
      const response = await request(app).post('/api/auth/logout');

      expect(response.status).toBe(401);
      expect(response.body.code).toBe('UNAUTHORIZED');
    });

    test('successfully logs out and invalidates token for subsequent operations', async () => {
      // 1. Log in to establish valid token
      const loginRes = await request(app).post('/api/auth/login').send({
        username: 'alice_dev',
        password: 'SecurePassword123!',
      });
      const token = loginRes.body.data.token;

      // 2. Access protected endpoint before logout
      const beforeLogout = await request(app)
        .get('/api/users/me')
        .set('Authorization', `Bearer ${token}`);
      expect(beforeLogout.status).toBe(200);

      // 3. Perform logout
      const logoutResponse = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`);

      expect(logoutResponse.status).toBe(200);
      expect(logoutResponse.body).toEqual({
        status: 'success',
        data: {
          message: 'Successfully logged out',
        },
      });

      // 4. Verify token can no longer access protected endpoints
      const afterLogoutMe = await request(app)
        .get('/api/users/me')
        .set('Authorization', `Bearer ${token}`);

      expect(afterLogoutMe.status).toBe(401);
      expect(afterLogoutMe.body).toEqual(
        expect.objectContaining({
          status: 401,
          code: 'UNAUTHORIZED',
          detail: 'Authentication token has been revoked',
        }),
      );

      // 5. Verify token cannot be reused for another logout
      const afterLogoutLogout = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`);

      expect(afterLogoutLogout.status).toBe(401);
      expect(afterLogoutLogout.body).toEqual(
        expect.objectContaining({
          status: 401,
          code: 'UNAUTHORIZED',
          detail: 'Authentication token has been revoked',
        }),
      );
    });
  });
});
