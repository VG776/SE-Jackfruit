const fs = require('fs/promises');
const path = require('path');
const bcrypt = require('bcryptjs');
const { newDb } = require('pg-mem');
const request = require('supertest');
const { createApp } = require('../src/app');
const { UserRepository } = require('../src/repositories/userRepository');
const { AuthService } = require('../src/services/authService');

const migrationPath = path.resolve(__dirname, '../../database/migrations/001_create_users.sql');

async function buildTestContext() {
  const database = newDb();
  const adapter = database.adapters.createPg();
  const pool = new adapter.Pool();
  await pool.query(await fs.readFile(migrationPath, 'utf8'));

  const repository = new UserRepository(pool);
  const authService = new AuthService(repository);
  const app = createApp({ authService, enableRateLimit: false });

  return { app, pool };
}

describe('POST /api/auth/register', () => {
  let app;
  let pool;

  beforeEach(async () => {
    ({ app, pool } = await buildTestContext());
  });

  afterEach(async () => {
    await pool.end();
  });

  test('creates a user and stores only a bcrypt hash', async () => {
    const plaintextPassword = 'SecurePassword123!';
    const response = await request(app).post('/api/auth/register').send({
      username: 'alice_dev',
      email: 'Alice@Example.com',
      password: plaintextPassword,
    });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      status: 'success',
      data: expect.objectContaining({
        id: expect.any(String),
        username: 'alice_dev',
        email: 'alice@example.com',
        displayName: 'alice_dev',
        createdAt: expect.any(String),
      }),
    });
    expect(JSON.stringify(response.body)).not.toContain(plaintextPassword);
    expect(response.body.data).not.toHaveProperty('passwordHash');

    const stored = await pool.query(
      'SELECT username, email, password_hash, status FROM users WHERE username = $1',
      ['alice_dev'],
    );
    expect(stored.rowCount).toBe(1);
    expect(stored.rows[0].password_hash).not.toBe(plaintextPassword);
    expect(await bcrypt.compare(plaintextPassword, stored.rows[0].password_hash)).toBe(true);
    expect(stored.rows[0].status).toBe('offline');
  });

  test.each([
    ['username', { username: 'ALICE_DEV', email: 'new@example.com' }],
    ['email', { username: 'new_user', email: 'ALICE@example.com' }],
  ])('rejects a duplicate %s without creating another user', async (field, duplicate) => {
    const first = await request(app).post('/api/auth/register').send({
      username: 'alice_dev',
      email: 'alice@example.com',
      password: 'SecurePassword123!',
    });
    expect(first.status).toBe(201);

    const response = await request(app)
      .post('/api/auth/register')
      .send({ ...duplicate, password: 'AnotherSecurePassword!' });

    expect(response.status).toBe(409);
    expect(response.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(response.body).toEqual(
      expect.objectContaining({
        status: 409,
        code: 'USER_ALREADY_EXISTS',
        instance: '/api/auth/register',
        invalidParams: [expect.objectContaining({ name: field })],
      }),
    );

    const count = await pool.query('SELECT COUNT(*)::integer AS count FROM users');
    expect(count.rows[0].count).toBe(1);
  });

  test.each([
    ['missing username', 'username', { email: 'alice@example.com', password: 'SecurePassword123!' }],
    ['missing email', 'email', { username: 'alice_dev', password: 'SecurePassword123!' }],
    ['missing password', 'password', { username: 'alice_dev', email: 'alice@example.com' }],
    ['empty username', 'username', { username: '', email: 'alice@example.com', password: 'SecurePassword123!' }],
    ['empty email', 'email', { username: 'alice_dev', email: '', password: 'SecurePassword123!' }],
    ['empty password', 'password', { username: 'alice_dev', email: 'alice@example.com', password: '' }],
    ['invalid email', 'email', { username: 'alice_dev', email: 'not-an-email', password: 'SecurePassword123!' }],
    ['weak password', 'password', { username: 'alice_dev', email: 'alice@example.com', password: '1234567' }],
    ['oversized username', 'username', { username: 'a'.repeat(31), email: 'alice@example.com', password: 'SecurePassword123!' }],
    ['special-character username', 'username', { username: 'alice!dev', email: 'alice@example.com', password: 'SecurePassword123!' }],
  ])('rejects %s with a clear validation response', async (_caseName, field, payload) => {
    const response = await request(app).post('/api/auth/register').send(payload);

    expect(response.status).toBe(400);
    expect(response.body).toEqual(
      expect.objectContaining({
        status: 400,
        code: 'INVALID_INPUT_PAYLOAD',
        detail: 'Please check your input and try again.',
        invalidParams: expect.arrayContaining([
          expect.objectContaining({ name: field, reason: expect.any(String) }),
        ]),
      }),
    );

    const count = await pool.query('SELECT COUNT(*)::integer AS count FROM users');
    expect(count.rows[0].count).toBe(0);
  });

  test('enforces the documented user status values in the database', async () => {
    await expect(
      pool.query(
        `INSERT INTO users (id, username, email, password_hash, display_name, status)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          'a2bd5b88-7f94-4ac8-88ed-64c3f603369b',
          'invalid_status_user',
          'invalid-status@example.com',
          'not-a-real-hash',
          'Invalid Status User',
          'active',
        ],
      ),
    ).rejects.toThrow();
  });

  test('does not expose internal error details or submitted secrets', async () => {
    const submittedPassword = 'NeverReturnThisPassword!';
    const internalError = new Error(`database failed for ${submittedPassword}`);
    internalError.code = '28P01';
    const authService = {
      register: jest.fn().mockRejectedValue(internalError),
    };
    const isolatedApp = createApp({ authService, enableRateLimit: false });

    const response = await request(isolatedApp).post('/api/auth/register').send({
      username: 'alice_dev',
      email: 'alice@example.com',
      password: submittedPassword,
    });

    expect(response.status).toBe(500);
    expect(JSON.stringify(response.body)).not.toContain(submittedPassword);
    expect(response.body).toEqual(
      expect.objectContaining({
        code: 'INTERNAL_SERVER_ERROR',
        detail: 'An unexpected error occurred. Please try again later.',
      }),
    );
  });

  test('rejects malformed JSON without exposing parser details', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .set('Content-Type', 'application/json')
      .send('{"username":');

    expect(response.status).toBe(400);
    expect(response.body).toEqual(
      expect.objectContaining({
        code: 'INVALID_INPUT_PAYLOAD',
        detail: 'The request body must contain valid JSON.',
      }),
    );
    expect(response.body).not.toHaveProperty('body');
  });

  test('limits registration to ten requests per minute per client', async () => {
    const rateLimitedApp = createApp({
      authService: new AuthService(new UserRepository(pool)),
      enableRateLimit: true,
    });

    for (let requestNumber = 0; requestNumber < 10; requestNumber += 1) {
      const response = await request(rateLimitedApp).post('/api/auth/register').send({});
      expect(response.status).toBe(400);
    }

    const response = await request(rateLimitedApp).post('/api/auth/register').send({});
    expect(response.status).toBe(429);
    expect(response.body).toEqual(
      expect.objectContaining({
        code: 'RATE_LIMIT_EXCEEDED',
        detail: 'Too many requests. Please wait a moment before retrying.',
      }),
    );
  });
});
