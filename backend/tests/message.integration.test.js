const fs = require('fs/promises');
const path = require('path');
const { newDb } = require('pg-mem');
const request = require('supertest');
const { createApp } = require('../src/app');
const { ChannelRepository } = require('../src/repositories/channelRepository');
const { ChannelPermissionRepository } = require('../src/repositories/channelPermissionRepository');
const { ChannelService } = require('../src/services/channelService');
const { MessageRepository } = require('../src/repositories/messageRepository');
const { MessageService } = require('../src/services/messageService');

const migrations = [
  path.resolve(__dirname, '../../database/migrations/001_create_users.sql'),
  path.resolve(__dirname, '../../database/migrations/002_create_communities.sql'),
  path.resolve(__dirname, '../../database/migrations/003_create_channels.sql'),
  path.resolve(__dirname, '../../database/migrations/004_create_messages.sql'),
];

const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const MEMBER_ID = '22222222-2222-4222-8222-222222222222';
const NON_MEMBER_ID = '33333333-3333-4333-8333-333333333333';
const COMMUNITY_ID = '44444444-4444-4444-8444-444444444444';
const CHANNEL_ID = '55555555-5555-4555-8555-555555555555';
const UNKNOWN_CHANNEL_ID = '99999999-9999-4999-8999-999999999999';

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
       ($3, 'non_member_user', 'nonmember@example.com', 'hash', 'Non-Member')`,
    [OWNER_ID, MEMBER_ID, NON_MEMBER_ID],
  );

  await pool.query(
    `INSERT INTO communities (id, owner_id, name, description)
     VALUES ($1, $2, 'Test Community', 'Message test community')`,
    [COMMUNITY_ID, OWNER_ID],
  );

  await pool.query(
    `INSERT INTO community_members (id, community_id, user_id, role)
     VALUES ('77777777-7777-4777-8777-777777777777', $1, $2, 'member')`,
    [COMMUNITY_ID, MEMBER_ID],
  );

  await pool.query(
    `INSERT INTO channels (id, community_id, name, type)
     VALUES ($1, $2, 'general', 'text')`,
    [CHANNEL_ID, COMMUNITY_ID],
  );

  const channelRepository = new ChannelRepository(pool);
  const permissionRepository = new ChannelPermissionRepository(pool);
  const channelService = new ChannelService(channelRepository, permissionRepository);
  const messageRepository = new MessageRepository(pool);
  const messageService = new MessageService(messageRepository, channelService);

  const authenticate = (req, _res, next) => {
    const userId = req.get('x-test-user-id');
    if (userId) {
      req.user = { id: userId };
    }
    next();
  };

  const app = createApp({
    authService: { register: jest.fn() },
    channelService,
    messageService,
    authenticate,
    enableRateLimit: false,
  });

  return { app, pool, channelService, messageService, messageRepository };
}

describe('US-08 Message sending API integration (FR-MSG-01, FR-COM-04)', () => {
  let context;

  beforeEach(async () => {
    context = await buildTestContext();
  });

  afterEach(async () => {
    await context.pool.end();
  });

  describe('Authentication and authorization (FR-COM-04)', () => {
    test('rejects unauthenticated requests with 401', async () => {
      const response = await request(context.app)
        .post(`/api/channels/${CHANNEL_ID}/messages`)
        .send({ content: 'Hello world' });

      expect(response.status).toBe(401);
      expect(response.body.code).toBe('AUTHENTICATION_REQUIRED');
    });

    test('rejects non-member user attempting to send message to existing channel with 404 (prevent disclosure)', async () => {
      const response = await request(context.app)
        .post(`/api/channels/${CHANNEL_ID}/messages`)
        .set('x-test-user-id', NON_MEMBER_ID)
        .send({ content: 'Unauthorized message' });

      expect(response.status).toBe(404);
      expect(response.body.code).toBe('CHANNEL_NOT_FOUND');
    });

    test('returns identical 404 error when targeting non-existent channel', async () => {
      const response = await request(context.app)
        .post(`/api/channels/${UNKNOWN_CHANNEL_ID}/messages`)
        .set('x-test-user-id', NON_MEMBER_ID)
        .send({ content: 'Non-existent channel message' });

      expect(response.status).toBe(404);
      expect(response.body.code).toBe('CHANNEL_NOT_FOUND');
    });
  });

  describe('Message validation (FR-MSG-01)', () => {
    test('rejects empty string message with 400', async () => {
      const response = await request(context.app)
        .post(`/api/channels/${CHANNEL_ID}/messages`)
        .set('x-test-user-id', MEMBER_ID)
        .send({ content: '' });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('INVALID_INPUT_PAYLOAD');
    });

    test('rejects whitespace-only message with 400', async () => {
      const response = await request(context.app)
        .post(`/api/channels/${CHANNEL_ID}/messages`)
        .set('x-test-user-id', MEMBER_ID)
        .send({ content: '   \n   \t  ' });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('INVALID_INPUT_PAYLOAD');
    });

    test('rejects missing content property with 400', async () => {
      const response = await request(context.app)
        .post(`/api/channels/${CHANNEL_ID}/messages`)
        .set('x-test-user-id', MEMBER_ID)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('INVALID_INPUT_PAYLOAD');
    });

    test('rejects content exceeding 2000 characters with 400', async () => {
      const longMessage = 'm'.repeat(2001);
      const response = await request(context.app)
        .post(`/api/channels/${CHANNEL_ID}/messages`)
        .set('x-test-user-id', MEMBER_ID)
        .send({ content: longMessage });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('INVALID_INPUT_PAYLOAD');
    });

    test('rejects invalid channelId parameter with 400', async () => {
      const response = await request(context.app)
        .post('/api/channels/not-a-valid-uuid/messages')
        .set('x-test-user-id', MEMBER_ID)
        .send({ content: 'Valid content' });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('INVALID_INPUT_PAYLOAD');
    });

    test('rejects unexpected payload fields with 400', async () => {
      const response = await request(context.app)
        .post(`/api/channels/${CHANNEL_ID}/messages`)
        .set('x-test-user-id', MEMBER_ID)
        .send({ content: 'Hello', unexpectedProperty: 123 });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('INVALID_INPUT_PAYLOAD');
    });
  });

  describe('Successful message sending (FR-MSG-01)', () => {
    test('allows community member to send message and associates author and channel', async () => {
      const response = await request(context.app)
        .post(`/api/channels/${CHANNEL_ID}/messages`)
        .set('x-test-user-id', MEMBER_ID)
        .send({ content: 'Hello from member!', clientNonce: 'nonce-member-1' });

      expect(response.status).toBe(201);
      expect(response.body.status).toBe('success');
      expect(response.body.data).toMatchObject({
        channelId: CHANNEL_ID,
        senderId: MEMBER_ID,
        content: 'Hello from member!',
        clientNonce: 'nonce-member-1',
      });
      expect(response.body.data.id).toBeDefined();
      expect(response.body.data.createdAt).toBeDefined();

      // Verify persistence in database
      const dbRow = await context.messageRepository.findById(response.body.data.id);
      expect(dbRow).not.toBeNull();
      expect(dbRow.content).toBe('Hello from member!');
      expect(dbRow.channel_id).toBe(CHANNEL_ID);
      expect(dbRow.sender_id).toBe(MEMBER_ID);
    });

    test('allows community owner to send message in community channel', async () => {
      const response = await request(context.app)
        .post(`/api/channels/${CHANNEL_ID}/messages`)
        .set('x-test-user-id', OWNER_ID)
        .send({ content: 'Hello from owner!' });

      expect(response.status).toBe(201);
      expect(response.body.status).toBe('success');
      expect(response.body.data).toMatchObject({
        channelId: CHANNEL_ID,
        senderId: OWNER_ID,
        content: 'Hello from owner!',
      });
    });
  });

  describe('Message history and reconnection (FR-MSG-02)', () => {
    test('records the actual send time and returns messages oldest first', async () => {
      const route = `/api/channels/${CHANNEL_ID}/messages`;
      const send = async (content) => {
        const started = Date.now();
        const result = await request(context.app)
          .post(route)
          .set('x-test-user-id', MEMBER_ID)
          .send({ content })
          .expect(201);
        const message = result.body.data;
        expect(Date.parse(message.createdAt)).toBeGreaterThanOrEqual(started);
        expect(Date.parse(message.createdAt)).toBeLessThanOrEqual(Date.now());
        return message;
      };

      const first = await send('First message');
      await new Promise((resolve) => setTimeout(resolve, 25));
      const second = await send('Second message');
      expect(Date.parse(second.createdAt)).toBeGreaterThan(Date.parse(first.createdAt));

      const history = await request(context.app).get(route).set('x-test-user-id', OWNER_ID).expect(200);
      expect(history.body.data.messages.map(({ id, createdAt }) => ({ id, createdAt }))).toEqual([
        { id: first.id, createdAt: first.createdAt },
        { id: second.id, createdAt: second.createdAt },
      ]);
    });

    test('returns an authenticated channel history page and a cursor for older messages', async () => {
      const first = await context.messageService.sendMessage(MEMBER_ID, CHANNEL_ID, {
        content: 'Older message',
      });
      const second = await context.messageService.sendMessage(MEMBER_ID, CHANNEL_ID, {
        content: 'Newer message',
      });
      await context.pool.query('UPDATE messages SET created_at = $2 WHERE id = $1', [
        first.id,
        '2026-11-03T10:00:00Z',
      ]);
      await context.pool.query('UPDATE messages SET created_at = $2 WHERE id = $1', [
        second.id,
        '2026-11-03T10:00:01Z',
      ]);

      const firstPage = await request(context.app)
        .get(`/api/channels/${CHANNEL_ID}/messages?limit=1`)
        .set('x-test-user-id', MEMBER_ID);

      expect(firstPage.status).toBe(200);
      expect(firstPage.body.data.messages).toHaveLength(1);
      expect(firstPage.body.data.messages[0].id).toBe(second.id);
      expect(firstPage.body.data.hasMore).toBe(true);
      expect(firstPage.body.data.nextCursor).toBeTruthy();

      const nextPage = await request(context.app)
        .get(`/api/channels/${CHANNEL_ID}/messages?limit=1&cursor=${encodeURIComponent(firstPage.body.data.nextCursor)}`)
        .set('x-test-user-id', MEMBER_ID);

      expect(nextPage.status).toBe(200);
      expect(nextPage.body.data.messages.map((message) => message.id)).toEqual([first.id]);
      expect(nextPage.body.data.hasMore).toBe(false);
      expect(nextPage.body.data.nextCursor).toBeNull();
    });

    test('requires authentication and hides history from non-members', async () => {
      const anonymous = await request(context.app).get(`/api/channels/${CHANNEL_ID}/messages`);
      const nonMember = await request(context.app)
        .get(`/api/channels/${CHANNEL_ID}/messages`)
        .set('x-test-user-id', NON_MEMBER_ID);

      expect(anonymous.status).toBe(401);
      expect(nonMember.status).toBe(404);
      expect(nonMember.body.code).toBe('CHANNEL_NOT_FOUND');
    });

    test('rejects malformed history cursors and out-of-range limits', async () => {
      const invalidCursor = await request(context.app)
        .get(`/api/channels/${CHANNEL_ID}/messages?cursor=not-a-cursor`)
        .set('x-test-user-id', MEMBER_ID);
      const invalidLimit = await request(context.app)
        .get(`/api/channels/${CHANNEL_ID}/messages?limit=101`)
        .set('x-test-user-id', MEMBER_ID);

      expect(invalidCursor.status).toBe(400);
      expect(invalidLimit.status).toBe(400);
    });
  });
});
