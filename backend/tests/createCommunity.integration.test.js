const fs = require('fs/promises');
const path = require('path');
const { newDb } = require('pg-mem');
const request = require('supertest');
const { createApp } = require('../src/app');
const { UserRepository } = require('../src/repositories/userRepository');
const { CommunityRepository } = require('../src/repositories/communityRepository');
const { AuthService } = require('../src/services/authService');
const { CommunityService } = require('../src/services/communityService');

const usersMigrationPath = path.resolve(
  __dirname,
  '../../database/migrations/001_create_users.sql',
);
const communitiesMigrationPath = path.resolve(
  __dirname,
  '../../database/migrations/002_create_communities.sql',
);

async function buildTestContext() {
  const database = newDb();
  const adapter = database.adapters.createPg();
  const pool = new adapter.Pool();

  await pool.query(await fs.readFile(usersMigrationPath, 'utf8'));
  await pool.query(await fs.readFile(communitiesMigrationPath, 'utf8'));

  const userRepository = new UserRepository(pool);
  const communityRepository = new CommunityRepository(pool);
  const authService = new AuthService(userRepository);
  const communityService = new CommunityService(communityRepository);
  const app = createApp({ authService, communityService, enableRateLimit: false });

  return { app, pool, authService };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function registerAndLogin(app, suffix = '') {
  await request(app)
    .post('/api/auth/register')
    .send({
      username: `alice_dev${suffix}`,
      email: `alice${suffix}@example.com`,
      password: 'SecurePassword123!',
    });

  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ username: `alice_dev${suffix}`, password: 'SecurePassword123!' });

  return loginRes.body.data.token;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('US-04: Create Community (FR-COM-01)', () => {
  let app;
  let pool;
  let token;

  beforeEach(async () => {
    ({ app, pool } = await buildTestContext());
    token = await registerAndLogin(app);
  });

  afterEach(async () => {
    await pool.end();
  });

  // ---- Happy path ----------------------------------------------------------

  test('creates a community and returns 201 with the community DTO', async () => {
    const response = await request(app)
      .post('/api/communities')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'My Awesome Community', description: 'A great place' });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      status: 'success',
      data: expect.objectContaining({
        id: expect.any(String),
        ownerId: expect.any(String),
        name: 'My Awesome Community',
        description: 'A great place',
        createdAt: expect.any(String),
      }),
    });
  });

  test('creates a community without a description', async () => {
    const response = await request(app)
      .post('/api/communities')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'No Description Community' });

    expect(response.status).toBe(201);
    expect(response.body.data.description).toBeNull();
  });

  test('persists the community in the database', async () => {
    await request(app)
      .post('/api/communities')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Persisted Community' });

    const stored = await pool.query(
      'SELECT name FROM communities WHERE LOWER(name) = LOWER($1)',
      ['Persisted Community'],
    );
    expect(stored.rowCount).toBe(1);
    expect(stored.rows[0].name).toBe('Persisted Community');
  });

  // ---- Duplicate name ------------------------------------------------------

  test('rejects a duplicate community name for the same owner (409)', async () => {
    await request(app)
      .post('/api/communities')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Unique Name' });

    const response = await request(app)
      .post('/api/communities')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Unique Name' });

    expect(response.status).toBe(409);
    expect(response.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(response.body).toEqual(
      expect.objectContaining({
        status: 409,
        code: 'COMMUNITY_ALREADY_EXISTS',
        invalidParams: [expect.objectContaining({ name: 'name' })],
      }),
    );

    const count = await pool.query('SELECT COUNT(*)::integer AS count FROM communities');
    expect(count.rows[0].count).toBe(1);
  });

  test('rejects a duplicate community name case-insensitively', async () => {
    await request(app)
      .post('/api/communities')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'my-server' });

    const response = await request(app)
      .post('/api/communities')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'MY-SERVER' });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('COMMUNITY_ALREADY_EXISTS');
  });

  test('allows two different owners to create communities with the same name', async () => {
    const token2 = await registerAndLogin(app, '_b');

    const res1 = await request(app)
      .post('/api/communities')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Shared Name' });

    const res2 = await request(app)
      .post('/api/communities')
      .set('Authorization', `Bearer ${token2}`)
      .send({ name: 'Shared Name' });

    expect(res1.status).toBe(201);
    expect(res2.status).toBe(201);

    const count = await pool.query('SELECT COUNT(*)::integer AS count FROM communities');
    expect(count.rows[0].count).toBe(2);
  });

  // ---- Validation errors ---------------------------------------------------

  test.each([
    ['missing name', {}, 'name'],
    ['empty name', { name: '' }, 'name'],
    ['name too short', { name: 'x' }, 'name'],
    ['name too long', { name: 'a'.repeat(101) }, 'name'],
    ['description too long', { name: 'Valid', description: 'x'.repeat(501) }, 'description'],
  ])('rejects %s with 400 and a clear validation response', async (_label, payload, field) => {
    const response = await request(app)
      .post('/api/communities')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);

    expect(response.status).toBe(400);
    expect(response.body).toEqual(
      expect.objectContaining({
        status: 400,
        code: 'INVALID_INPUT_PAYLOAD',
        invalidParams: expect.arrayContaining([
          expect.objectContaining({ name: field, reason: expect.any(String) }),
        ]),
      }),
    );

    const count = await pool.query('SELECT COUNT(*)::integer AS count FROM communities');
    expect(count.rows[0].count).toBe(0);
  });

  test('rejects unexpected fields with 400', async () => {
    const response = await request(app)
      .post('/api/communities')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Valid', unknownField: 'oops' });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('INVALID_INPUT_PAYLOAD');
  });

  // ---- Authentication checks -----------------------------------------------

  test('returns 401 when no Authorization header is provided', async () => {
    const response = await request(app)
      .post('/api/communities')
      .send({ name: 'Unauth Community' });

    expect(response.status).toBe(401);
    expect(response.body.code).toBe('UNAUTHORIZED');
  });

  test('returns 401 when an invalid token is provided', async () => {
    const response = await request(app)
      .post('/api/communities')
      .set('Authorization', 'Bearer this.is.not.valid')
      .send({ name: 'Unauth Community' });

    expect(response.status).toBe(401);
    expect(response.body.code).toBe('UNAUTHORIZED');
  });

  test('returns 401 when Authorization header format is wrong', async () => {
    const response = await request(app)
      .post('/api/communities')
      .set('Authorization', `Basic ${token}`)
      .send({ name: 'Unauth Community' });

    expect(response.status).toBe(401);
    expect(response.body.code).toBe('UNAUTHORIZED');
  });

  // ---- Error safety --------------------------------------------------------

  test('does not expose internal error details or secrets', async () => {
    const communityService = {
      create: jest.fn().mockRejectedValue(new Error('database connection failed with secret_key')),
    };
    const brokenApp = createApp({
      authService: { authenticateToken: jest.fn().mockResolvedValue({ id: 'some-id' }) },
      communityService,
      enableRateLimit: false,
    });

    const response = await request(brokenApp)
      .post('/api/communities')
      .set('Authorization', 'Bearer fake-but-passes-mock')
      .send({ name: 'Will Fail' });

    expect(response.status).toBe(500);
    expect(response.body.code).toBe('INTERNAL_SERVER_ERROR');
    expect(JSON.stringify(response.body)).not.toContain('secret_key');
  });
});
