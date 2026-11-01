const fs = require('fs/promises');
const path = require('path');
const { newDb } = require('pg-mem');
const request = require('supertest');
const { createApp } = require('../src/app');
const { AuthService } = require('../src/services/authService');
const { UserRepository } = require('../src/repositories/userRepository');
const { CommunityRepository } = require('../src/repositories/communityRepository');
const { CommunityService } = require('../src/services/communityService');
const { ChannelRepository } = require('../src/repositories/channelRepository');
const {
  ChannelPermissionRepository,
} = require('../src/repositories/channelPermissionRepository');
const { ChannelService } = require('../src/services/channelService');

const migrations = [
  path.resolve(__dirname, '../../database/migrations/001_create_users.sql'),
  path.resolve(__dirname, '../../database/migrations/002_create_communities.sql'),
  path.resolve(__dirname, '../../database/migrations/003_create_channels.sql'),
];

const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const MEMBER_ID = '22222222-2222-4222-8222-222222222222';
const ADMIN_ID = '55555555-5555-4555-8555-555555555555';
const COMMUNITY_ID = '33333333-3333-4333-8333-333333333333';

async function buildTestContext() {
  const database = newDb();
  const adapter = database.adapters.createPg();
  const pool = new adapter.Pool();

  for (const migration of migrations) {
    await pool.query(await fs.readFile(migration, 'utf8'));
  }

  await pool.query(
    `INSERT INTO users (id, username, email, password_hash, display_name)
     VALUES
       ($1, 'owner_user', 'owner@example.com', 'hash', 'Owner'),
       ($2, 'member_user', 'member@example.com', 'hash', 'Member'),
       ($3, 'admin_user', 'admin@example.com', 'hash', 'Admin')`,
    [OWNER_ID, MEMBER_ID, ADMIN_ID],
  );
  await pool.query(
    `INSERT INTO communities (id, owner_id, name, description)
     VALUES ($1, $2, 'Test Community', 'Channel integration tests')`,
    [COMMUNITY_ID, OWNER_ID],
  );
  await pool.query(
    `INSERT INTO community_members (id, community_id, user_id, role)
     VALUES
       ('66666666-6666-4666-8666-666666666666', $1, $2, 'member'),
       ('77777777-7777-4777-8777-777777777777', $1, $3, 'admin')`,
    [COMMUNITY_ID, MEMBER_ID, ADMIN_ID],
  );

  const repository = new ChannelRepository(pool);
  const permissionRepository = new ChannelPermissionRepository(pool);
  const channelService = new ChannelService(repository, permissionRepository);
  const authenticate = (incomingRequest, _response, next) => {
    const userId = incomingRequest.get('x-test-user-id');
    if (userId) {
      incomingRequest.user = { id: userId };
    }
    next();
  };
  const app = createApp({
    authService: { register: jest.fn() },
    channelService,
    authenticate,
    enableRateLimit: false,
  });

  return { app, pool, channelService };
}

async function createChannel(app, name = 'General Chat') {
  return request(app)
    .post(`/api/communities/${COMMUNITY_ID}/channels`)
    .set('x-test-user-id', OWNER_ID)
    .send({ name, type: 'text' });
}

describe('channel authentication routing', () => {
  test.each([
    ['get', '/api/does-not-exist'],
    ['post', '/api/does-not-exist'],
    ['get', `/api/channels/${COMMUNITY_ID}`],
    ['patch', `/api/channels/${COMMUNITY_ID}/does-not-exist`],
  ])('preserves 404 for unmatched %s %s without authenticating', async (method, url) => {
    const authService = { authenticateToken: jest.fn() };
    const app = createApp({ authService, channelService: {}, enableRateLimit: false });
    const response = await request(app)[method](url).set('Authorization', 'Bearer invalid-token');
    expect(response.status).toBe(404);
    expect(response.body.code).toBe('RESOURCE_NOT_FOUND');
    expect(authService.authenticateToken).not.toHaveBeenCalled();
  });

  test.each([
    ['post', `/api/communities/${COMMUNITY_ID}/channels`],
    ['patch', `/api/channels/${COMMUNITY_ID}`],
    ['delete', `/api/channels/${COMMUNITY_ID}?confirm=true`],
  ])('still requires authentication for %s %s', async (method, url) => {
    const app = createApp({ authService: {}, channelService: {}, enableRateLimit: false });
    const response = await request(app)[method](url);
    expect(response.status).toBe(401);
    expect(response.body.code).toBe('UNAUTHORIZED');
  });
});

describe('US-06 channel management API', () => {
  let app;
  let pool;

  beforeEach(async () => {
    ({ app, pool } = await buildTestContext());
  });

  afterEach(async () => {
    await pool.end();
  });

  test('creates and persists a normalized text channel for the community owner', async () => {
    const response = await createChannel(app);

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      status: 'success',
      data: expect.objectContaining({
        id: expect.any(String),
        communityId: COMMUNITY_ID,
        name: 'general-chat',
        type: 'text',
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      }),
    });

    const stored = await pool.query(
      'SELECT community_id, name, type FROM channels WHERE id = $1',
      [response.body.data.id],
    );
    expect(stored.rows).toEqual([
      { community_id: COMMUNITY_ID, name: 'general-chat', type: 'text' },
    ]);
  });

  test('rejects a duplicate channel name within the same community', async () => {
    expect((await createChannel(app, 'General Chat')).status).toBe(201);
    const response = await createChannel(app, 'general_chat');

    expect(response.status).toBe(409);
    expect(response.body).toEqual(
      expect.objectContaining({
        code: 'CHANNEL_ALREADY_EXISTS',
        invalidParams: [expect.objectContaining({ name: 'name' })],
      }),
    );
    const count = await pool.query('SELECT COUNT(*)::integer AS count FROM channels');
    expect(count.rows[0].count).toBe(1);
  });

  test.each([
    ['missing name', { type: 'text' }],
    ['empty name', { name: '   ', type: 'text' }],
    ['separator-only name', { name: '---___', type: 'text' }],
    ['oversized name', { name: 'a'.repeat(101), type: 'text' }],
    ['unsupported character', { name: 'general<script>', type: 'text' }],
    ['unsupported type', { name: 'voice-chat', type: 'voice' }],
    ['unexpected field', { name: 'general', type: 'text', private: true }],
  ])('rejects %s without creating a channel', async (_caseName, payload) => {
    const response = await request(app)
      .post(`/api/communities/${COMMUNITY_ID}/channels`)
      .set('x-test-user-id', OWNER_ID)
      .send(payload);

    expect(response.status).toBe(400);
    expect(response.body).toEqual(
      expect.objectContaining({
        code: 'INVALID_INPUT_PAYLOAD',
        detail: 'Please check your input and try again.',
      }),
    );
    const count = await pool.query('SELECT COUNT(*)::integer AS count FROM channels');
    expect(count.rows[0].count).toBe(0);
  });

  test('rejects an unauthenticated channel request', async () => {
    const response = await request(app)
      .post(`/api/communities/${COMMUNITY_ID}/channels`)
      .send({ name: 'general', type: 'text' });

    expect(response.status).toBe(401);
    expect(response.body).toEqual(
      expect.objectContaining({ code: 'AUTHENTICATION_REQUIRED' }),
    );
  });

  test('rejects channel creation by a user without manage-channel permission', async () => {
    const response = await request(app)
      .post(`/api/communities/${COMMUNITY_ID}/channels`)
      .set('x-test-user-id', MEMBER_ID)
      .send({ name: 'general', type: 'text' });

    expect(response.status).toBe(403);
    expect(response.body).toEqual(
      expect.objectContaining({ code: 'INSUFFICIENT_PERMISSIONS' }),
    );
    const count = await pool.query('SELECT COUNT(*)::integer AS count FROM channels');
    expect(count.rows[0].count).toBe(0);
  });

  test('allows an admin member to create, rename, and delete a channel', async () => {
    const created = await request(app)
      .post(`/api/communities/${COMMUNITY_ID}/channels`)
      .set('x-test-user-id', ADMIN_ID)
      .send({ name: 'Admin Channel', type: 'text' });

    expect(created.status).toBe(201);
    const channelId = created.body.data.id;

    const renamed = await request(app)
      .patch(`/api/channels/${channelId}`)
      .set('x-test-user-id', ADMIN_ID)
      .send({ name: 'Admin Updates' });

    expect(renamed.status).toBe(200);
    expect(renamed.body.data.name).toBe('admin-updates');

    const deleted = await request(app)
      .delete(`/api/channels/${channelId}?confirm=true`)
      .set('x-test-user-id', ADMIN_ID);

    expect(deleted.status).toBe(204);
    const count = await pool.query('SELECT COUNT(*)::integer AS count FROM channels');
    expect(count.rows[0].count).toBe(0);
  });

  test('rejects an invalid community identifier', async () => {
    const response = await request(app)
      .post('/api/communities/not-a-uuid/channels')
      .set('x-test-user-id', OWNER_ID)
      .send({ name: 'general', type: 'text' });

    expect(response.status).toBe(400);
    expect(response.body.invalidParams).toEqual([
      expect.objectContaining({ name: 'communityId' }),
    ]);
  });

  test('renames a channel and persists the normalized name', async () => {
    const created = await createChannel(app);
    const channelId = created.body.data.id;
    const response = await request(app)
      .patch(`/api/channels/${channelId}`)
      .set('x-test-user-id', OWNER_ID)
      .send({ name: 'Product Updates' });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual(
      expect.objectContaining({ id: channelId, name: 'product-updates' }),
    );
    const stored = await pool.query('SELECT name FROM channels WHERE id = $1', [channelId]);
    expect(stored.rows[0].name).toBe('product-updates');
  });

  test.each(['', '---___', 'a'.repeat(101), '<script>'])('rejects invalid rename %s without changing the channel', async (name) => {
    const created = await createChannel(app);
    const response = await request(app).patch(`/api/channels/${created.body.data.id}`)
      .set('x-test-user-id', OWNER_ID).send({ name });
    expect(response.status).toBe(400);
    expect(response.body.invalidParams).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'name', reason: expect.any(String) }),
    ]));
    const stored = await pool.query('SELECT name FROM channels WHERE id = $1', [created.body.data.id]);
    expect(stored.rows[0].name).toBe('general-chat');
  });

  test('rejects a duplicate rename but permits renaming a channel to its own name', async () => {
    const created = await createChannel(app);
    await createChannel(app, 'Announcements');
    await request(app).patch(`/api/channels/${created.body.data.id}`)
      .set('x-test-user-id', OWNER_ID).send({ name: 'announcements' }).expect(409);
    await request(app).patch(`/api/channels/${created.body.data.id}`)
      .set('x-test-user-id', OWNER_ID).send({ name: 'General Chat' }).expect(200);
    const stored = await pool.query('SELECT name FROM channels WHERE id = $1', [created.body.data.id]);
    expect(stored.rows[0].name).toBe('general-chat');
  });

  test.each(['moderator', 'outsider', 'admin-in-another-community'])('denies all channel mutations to a %s', async (role) => {
    await pool.query('DELETE FROM community_members WHERE user_id = $1', [MEMBER_ID]);
    if (role === 'moderator') {
      await pool.query(`INSERT INTO community_members (id, community_id, user_id, role)
        VALUES ('88888888-8888-4888-8888-888888888888', $1, $2, 'moderator')`, [COMMUNITY_ID, MEMBER_ID]);
    } else if (role === 'admin-in-another-community') {
      await pool.query(`INSERT INTO communities (id, owner_id, name)
        VALUES ('99999999-9999-4999-8999-999999999999', $1, 'Other Community')`, [ADMIN_ID]);
      await pool.query(`INSERT INTO community_members (id, community_id, user_id, role)
        VALUES ('88888888-8888-4888-8888-888888888888', '99999999-9999-4999-8999-999999999999', $1, 'admin')`, [MEMBER_ID]);
    }
    const created = await createChannel(app);
    await request(app).post(`/api/communities/${COMMUNITY_ID}/channels`)
      .set('x-test-user-id', MEMBER_ID).send({ name: 'Forbidden', type: 'text' }).expect(403);
    await request(app).patch(`/api/channels/${created.body.data.id}`)
      .set('x-test-user-id', MEMBER_ID).send({ name: 'Forbidden' }).expect(403);
    await request(app).delete(`/api/channels/${created.body.data.id}?confirm=true`)
      .set('x-test-user-id', MEMBER_ID).expect(403);
    const stored = await pool.query('SELECT name FROM channels');
    expect(stored.rows).toEqual([{ name: 'general-chat' }]);
  });

  test('reflects deletion in a subsequent rename request', async () => {
    const created = await createChannel(app);
    await request(app).delete(`/api/channels/${created.body.data.id}?confirm=true`)
      .set('x-test-user-id', OWNER_ID).expect(204);
    await request(app).patch(`/api/channels/${created.body.data.id}`)
      .set('x-test-user-id', OWNER_ID).send({ name: 'Deleted' }).expect(404);
  });

  test('rejects a channel rename by a user without permission', async () => {
    const created = await createChannel(app);
    const response = await request(app)
      .patch(`/api/channels/${created.body.data.id}`)
      .set('x-test-user-id', MEMBER_ID)
      .send({ name: 'unauthorized-name' });

    expect(response.status).toBe(403);
    const stored = await pool.query('SELECT name FROM channels WHERE id = $1', [
      created.body.data.id,
    ]);
    expect(stored.rows[0].name).toBe('general-chat');
  });

  test('requires explicit confirmation before deleting a channel', async () => {
    const created = await createChannel(app);
    const response = await request(app)
      .delete(`/api/channels/${created.body.data.id}`)
      .set('x-test-user-id', OWNER_ID);

    expect(response.status).toBe(400);
    const count = await pool.query('SELECT COUNT(*)::integer AS count FROM channels');
    expect(count.rows[0].count).toBe(1);
  });

  test('rejects channel deletion by a user without permission', async () => {
    const created = await createChannel(app);
    const response = await request(app)
      .delete(`/api/channels/${created.body.data.id}?confirm=true`)
      .set('x-test-user-id', MEMBER_ID);

    expect(response.status).toBe(403);
    const count = await pool.query('SELECT COUNT(*)::integer AS count FROM channels');
    expect(count.rows[0].count).toBe(1);
  });

  test('deletes a confirmed channel and persists its removal', async () => {
    const created = await createChannel(app);
    const response = await request(app)
      .delete(`/api/channels/${created.body.data.id}?confirm=true`)
      .set('x-test-user-id', OWNER_ID);

    expect(response.status).toBe(204);
    expect(response.text).toBe('');
    const count = await pool.query('SELECT COUNT(*)::integer AS count FROM channels');
    expect(count.rows[0].count).toBe(0);
  });

  test('returns not found when the requested channel does not exist', async () => {
    const response = await request(app)
      .patch('/api/channels/44444444-4444-4444-8444-444444444444')
      .set('x-test-user-id', OWNER_ID)
      .send({ name: 'missing-channel' });

    expect(response.status).toBe(404);
    expect(response.body).toEqual(expect.objectContaining({ code: 'CHANNEL_NOT_FOUND' }));
  });

  test('uses real login authentication and a newly created community for channel management', async () => {
    const realApp = createApp({
      authService: new AuthService(new UserRepository(pool)),
      communityService: new CommunityService(new CommunityRepository(pool)),
      channelService: new ChannelService(
        new ChannelRepository(pool),
        new ChannelPermissionRepository(pool),
      ),
      enableRateLimit: false,
    });
    await request(realApp).post('/api/auth/register').send({
      username: 'channel_owner', email: 'channel_owner@example.com', password: 'SecurePassword123!',
    }).expect(201);
    const login = await request(realApp).post('/api/auth/login').send({
      username: 'channel_owner', password: 'SecurePassword123!',
    }).expect(200);
    const authorization = `Bearer ${login.body.data.token}`;
    const community = await request(realApp).post('/api/communities')
      .set('Authorization', authorization).send({ name: 'Integrated Community' }).expect(201);
    const created = await request(realApp)
      .post(`/api/communities/${community.body.data.id}/channels`)
      .set('Authorization', authorization).send({ name: 'General Chat', type: 'text' }).expect(201);
    await request(realApp).patch(`/api/channels/${created.body.data.id}`)
      .set('Authorization', authorization).send({ name: 'Updates' }).expect(200);
    await request(realApp).delete(`/api/channels/${created.body.data.id}?confirm=true`)
      .set('Authorization', authorization).expect(204);
    await request(realApp).post('/api/auth/logout')
      .set('Authorization', authorization).expect(200);
    await request(realApp).post(`/api/communities/${community.body.data.id}/channels`)
      .set('Authorization', authorization).send({ name: 'Denied', type: 'text' }).expect(401);
  });
});
