const fs = require('fs/promises');
const path = require('path');
const { newDb } = require('pg-mem');
const request = require('supertest');
const { createApp } = require('../src/app');
const { UserRepository } = require('../src/repositories/userRepository');
const { AuthService } = require('../src/services/authService');
const { signToken } = require('../src/utils/token');

const USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222';
const migrationPath = path.resolve(__dirname, '../../database/migrations/001_create_users.sql');

describe('US-03 profile retrieval and update (FR-AUTH-04)', () => {
  let app;
  let pool;
  let userToken;
  let otherUserToken;

  beforeEach(async () => {
    const database = newDb();
    const adapter = database.adapters.createPg();
    pool = new adapter.Pool();
    await pool.query(await fs.readFile(migrationPath, 'utf8'));
    await pool.query(
      `INSERT INTO users (id, username, email, password_hash, display_name)
       VALUES ($1, 'alice', 'alice@example.com', 'secret-hash', 'Alice'),
              ($2, 'bob', 'bob@example.com', 'other-secret-hash', 'Bob')`,
      [USER_ID, OTHER_USER_ID],
    );

    const authService = new AuthService(new UserRepository(pool));
    app = createApp({ authService, enableRateLimit: false });
    userToken = signToken({ sub: USER_ID }, authService.jwtSecret);
    otherUserToken = signToken({ sub: OTHER_USER_ID }, authService.jwtSecret);
  });

  afterEach(async () => {
    await pool.end();
  });

  test('returns the authenticated user profile without password data', async () => {
    const response = await request(app)
      .get('/api/users/me')
      .set('Authorization', `Bearer ${userToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      id: USER_ID,
      username: 'alice',
      email: 'alice@example.com',
      displayName: 'Alice',
      avatarUrl: null,
      status: 'offline',
    });
    expect(response.body.data).not.toHaveProperty('password_hash');
  });

  test('updates permitted fields for the authenticated user and returns the refreshed profile', async () => {
    const response = await request(app)
      .put('/api/users/me')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        displayName: ' Alice Cooper ',
        avatarUrl: 'https://example.com/avatar.png',
        status: 'online',
      });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      id: USER_ID,
      username: 'alice',
      email: 'alice@example.com',
      displayName: 'Alice Cooper',
      avatarUrl: 'https://example.com/avatar.png',
      status: 'online',
    });

    const refreshed = await request(app)
      .get('/api/users/me')
      .set('Authorization', `Bearer ${userToken}`);
    expect(refreshed.body.data.displayName).toBe('Alice Cooper');
    expect(refreshed.body.data.avatarUrl).toBe('https://example.com/avatar.png');

    const otherUser = await request(app)
      .get('/api/users/me')
      .set('Authorization', `Bearer ${otherUserToken}`);
    expect(otherUser.body.data).toMatchObject({ id: OTHER_USER_ID, displayName: 'Bob' });
  });

  test('allows clearing a previously set avatar URL with null', async () => {
    await pool.query('UPDATE users SET avatar_url = $2 WHERE id = $1', [
      USER_ID,
      'https://example.com/old.png',
    ]);

    const response = await request(app)
      .put('/api/users/me')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ avatarUrl: null });

    expect(response.status).toBe(200);
    expect(response.body.data.avatarUrl).toBeNull();
  });

  test.each([
    ['empty profile', {}],
    ['blank display name', { displayName: '   ' }],
    ['display name over 50 characters', { displayName: 'x'.repeat(51) }],
    ['unsupported avatar URL protocol', { avatarUrl: 'javascript:alert(1)' }],
    ['invalid status', { status: 'administrator' }],
    ['email change', { email: 'attacker@example.com' }],
    ['user ID change', { id: OTHER_USER_ID, displayName: 'Changed' }],
    ['target user field', { userId: OTHER_USER_ID, displayName: 'Changed' }],
  ])('rejects %s without changing either account', async (_label, profile) => {
    const response = await request(app)
      .put('/api/users/me')
      .set('Authorization', `Bearer ${userToken}`)
      .send(profile);

    expect(response.status).toBe(400);
    const [user, otherUser] = await Promise.all([
      pool.query('SELECT display_name, email FROM users WHERE id = $1', [USER_ID]),
      pool.query('SELECT display_name, email FROM users WHERE id = $1', [OTHER_USER_ID]),
    ]);
    expect(user.rows[0]).toEqual({ display_name: 'Alice', email: 'alice@example.com' });
    expect(otherUser.rows[0]).toEqual({ display_name: 'Bob', email: 'bob@example.com' });
  });

  test.each(['GET', 'PUT'])('rejects unauthenticated %s profile requests', async (method) => {
    let requestBuilder = request(app)[method.toLowerCase()]('/api/users/me');
    if (method === 'PUT') requestBuilder = requestBuilder.send({ displayName: 'No token' });

    const response = await requestBuilder;
    expect(response.status).toBe(401);
  });
});
