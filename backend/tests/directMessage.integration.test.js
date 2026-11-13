const fs = require('fs/promises');
const path = require('path');
const { newDb } = require('pg-mem');
const request = require('supertest');
const { createApp } = require('../src/app');
const { AuthService } = require('../src/services/authService');
const { UserRepository } = require('../src/repositories/userRepository');
const DirectMessageRepository = require('../src/repositories/directMessageRepository');
const DirectMessageService = require('../src/services/directMessageService');

const migrations = [
  path.resolve(__dirname, '../../database/migrations/001_create_users.sql'),
  path.resolve(__dirname, '../../database/migrations/002_create_communities.sql'),
  path.resolve(__dirname, '../../database/migrations/003_create_channels.sql'),
  path.resolve(__dirname, '../../database/migrations/004_create_messages.sql'),
  path.resolve(__dirname, '../../database/migrations/005_index_message_history.sql'),
  path.resolve(__dirname, '../../database/migrations/006_create_community_invites.sql'),
  path.resolve(__dirname, '../../database/migrations/007_create_direct_messages.sql'),
];

const ALICE_ID = '11111111-1111-4111-8111-111111111111';
const BOB_ID = '22222222-2222-4222-8222-222222222222';
const EVE_ID = '33333333-3333-4333-8333-333333333333';
const UNKNOWN_ID = '99999999-9999-4999-8999-999999999999';

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
       ($1, 'alice', 'alice@example.com', 'hash', 'Alice'),
       ($2, 'bob', 'bob@example.com', 'hash', 'Bob'),
       ($3, 'eve', 'eve@example.com', 'hash', 'Eve')`,
    [ALICE_ID, BOB_ID, EVE_ID],
  );

  const userRepository = new UserRepository(pool);
  const authService = new AuthService(userRepository);
  const directMessageRepository = new DirectMessageRepository(pool);
  const directMessageService = new DirectMessageService(directMessageRepository, userRepository);

  const authenticate = (incomingRequest, _response, next) => {
    const authHeader = incomingRequest.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return next();
    }
    const token = authHeader.slice(7);
    const userMap = {
      alice_token: { id: ALICE_ID, username: 'alice', sub: ALICE_ID },
      bob_token: { id: BOB_ID, username: 'bob', sub: BOB_ID },
      eve_token: { id: EVE_ID, username: 'eve', sub: EVE_ID },
    };
    if (userMap[token]) {
      incomingRequest.user = userMap[token];
      incomingRequest.authenticatedUserId = userMap[token].id;
    }
    next();
  };

  const app = createApp({
    authService,
    directMessageService,
    authenticate,
    enableRateLimit: false,
  });

  return { pool, app };
}

describe('Direct Messaging Integration Tests (US-10, FR-MSG-03, FR-COM-04)', () => {
  let app;

  beforeEach(async () => {
    const ctx = await buildTestContext();
    app = ctx.app;
  });

  describe('POST /api/direct-messages/conversations', () => {
    it('creates a new conversation between two users', async () => {
      const response = await request(app)
        .post('/api/direct-messages/conversations')
        .set('Authorization', 'Bearer alice_token')
        .send({ recipientId: BOB_ID });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data.id).toBeDefined();
      expect(response.body.data.userAId).toBe(ALICE_ID);
      expect(response.body.data.userBId).toBe(BOB_ID);
    });

    it('returns the existing conversation idempotently regardless of initiator', async () => {
      const res1 = await request(app)
        .post('/api/direct-messages/conversations')
        .set('Authorization', 'Bearer alice_token')
        .send({ recipientId: BOB_ID });

      const res2 = await request(app)
        .post('/api/direct-messages/conversations')
        .set('Authorization', 'Bearer bob_token')
        .send({ recipientId: ALICE_ID });

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
      expect(res1.body.data.id).toBe(res2.body.data.id);
    });

    it('rejects self-conversations with 400', async () => {
      const response = await request(app)
        .post('/api/direct-messages/conversations')
        .set('Authorization', 'Bearer alice_token')
        .send({ recipientId: ALICE_ID });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('SELF_DM_NOT_ALLOWED');
    });

    it('returns 404 if recipient does not exist', async () => {
      const response = await request(app)
        .post('/api/direct-messages/conversations')
        .set('Authorization', 'Bearer alice_token')
        .send({ recipientId: UNKNOWN_ID });

      expect(response.status).toBe(404);
      expect(response.body.code).toBe('USER_NOT_FOUND');
    });

    it('rejects unauthenticated requests with 401', async () => {
      const response = await request(app)
        .post('/api/direct-messages/conversations')
        .send({ recipientId: BOB_ID });

      expect(response.status).toBe(401);
      expect(response.body.code).toBe('AUTHENTICATION_REQUIRED');
    });

    it('rejects invalid recipientId format with 400 validation error', async () => {
      const response = await request(app)
        .post('/api/direct-messages/conversations')
        .set('Authorization', 'Bearer alice_token')
        .send({ recipientId: 'not-a-uuid' });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('INVALID_INPUT_PAYLOAD');
    });
  });

  describe('POST /api/direct-messages/conversations/:conversationId/messages', () => {
    let conversationId;

    beforeEach(async () => {
      const convRes = await request(app)
        .post('/api/direct-messages/conversations')
        .set('Authorization', 'Bearer alice_token')
        .send({ recipientId: BOB_ID });
      conversationId = convRes.body.data.id;
    });

    it('allows a participant to send a direct message', async () => {
      const response = await request(app)
        .post(`/api/direct-messages/conversations/${conversationId}/messages`)
        .set('Authorization', 'Bearer alice_token')
        .send({ content: 'Hey Bob, this is private!' });

      expect(response.status).toBe(201);
      expect(response.body.status).toBe('success');
      expect(response.body.data.id).toBeDefined();
      expect(response.body.data.conversationId).toBe(conversationId);
      expect(response.body.data.senderId).toBe(ALICE_ID);
      expect(response.body.data.content).toBe('Hey Bob, this is private!');
    });

    it('allows the other participant to reply', async () => {
      const response = await request(app)
        .post(`/api/direct-messages/conversations/${conversationId}/messages`)
        .set('Authorization', 'Bearer bob_token')
        .send({ content: 'Got it, Alice!' });

      expect(response.status).toBe(201);
      expect(response.body.data.senderId).toBe(BOB_ID);
      expect(response.body.data.content).toBe('Got it, Alice!');
    });

    it('rejects non-participant send attempts with 403 INSUFFICIENT_PERMISSIONS', async () => {
      const response = await request(app)
        .post(`/api/direct-messages/conversations/${conversationId}/messages`)
        .set('Authorization', 'Bearer eve_token')
        .send({ content: 'Trying to inject message into Alice & Bob DM' });

      expect(response.status).toBe(403);
      expect(response.body.code).toBe('INSUFFICIENT_PERMISSIONS');
    });

    it('returns 404 when sending to non-existent conversation', async () => {
      const response = await request(app)
        .post(`/api/direct-messages/conversations/${UNKNOWN_ID}/messages`)
        .set('Authorization', 'Bearer alice_token')
        .send({ content: 'Hello into the void' });

      expect(response.status).toBe(404);
      expect(response.body.code).toBe('CONVERSATION_NOT_FOUND');
    });

    it('rejects empty or whitespace-only messages with 400', async () => {
      const response = await request(app)
        .post(`/api/direct-messages/conversations/${conversationId}/messages`)
        .set('Authorization', 'Bearer alice_token')
        .send({ content: '   ' });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('INVALID_INPUT_PAYLOAD');
    });

    it('rejects unauthenticated requests with 401', async () => {
      const response = await request(app)
        .post(`/api/direct-messages/conversations/${conversationId}/messages`)
        .send({ content: 'Hello' });

      expect(response.status).toBe(401);
      expect(response.body.code).toBe('AUTHENTICATION_REQUIRED');
    });
  });

  describe('GET /api/direct-messages/conversations/:conversationId/messages', () => {
    let conversationId;

    beforeEach(async () => {
      const convRes = await request(app)
        .post('/api/direct-messages/conversations')
        .set('Authorization', 'Bearer alice_token')
        .send({ recipientId: BOB_ID });
      conversationId = convRes.body.data.id;

      await request(app)
        .post(`/api/direct-messages/conversations/${conversationId}/messages`)
        .set('Authorization', 'Bearer alice_token')
        .send({ content: 'Message 1 from Alice' });

      await request(app)
        .post(`/api/direct-messages/conversations/${conversationId}/messages`)
        .set('Authorization', 'Bearer bob_token')
        .send({ content: 'Message 2 from Bob' });
    });

    it('allows participants to fetch messages in chronological order', async () => {
      const response = await request(app)
        .get(`/api/direct-messages/conversations/${conversationId}/messages`)
        .set('Authorization', 'Bearer alice_token');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data[0].content).toBe('Message 1 from Alice');
      expect(response.body.data[1].content).toBe('Message 2 from Bob');

      const bobRes = await request(app)
        .get(`/api/direct-messages/conversations/${conversationId}/messages`)
        .set('Authorization', 'Bearer bob_token');

      expect(bobRes.status).toBe(200);
      expect(bobRes.body.data).toHaveLength(2);
    });

    it('rejects non-participant read attempts with 403 INSUFFICIENT_PERMISSIONS', async () => {
      const response = await request(app)
        .get(`/api/direct-messages/conversations/${conversationId}/messages`)
        .set('Authorization', 'Bearer eve_token');

      expect(response.status).toBe(403);
      expect(response.body.code).toBe('INSUFFICIENT_PERMISSIONS');
    });

    it('returns 404 for non-existent conversation', async () => {
      const response = await request(app)
        .get(`/api/direct-messages/conversations/${UNKNOWN_ID}/messages`)
        .set('Authorization', 'Bearer alice_token');

      expect(response.status).toBe(404);
      expect(response.body.code).toBe('CONVERSATION_NOT_FOUND');
    });

    it('rejects unauthenticated requests with 401', async () => {
      const response = await request(app).get(
        `/api/direct-messages/conversations/${conversationId}/messages`,
      );

      expect(response.status).toBe(401);
      expect(response.body.code).toBe('AUTHENTICATION_REQUIRED');
    });
  });
});
