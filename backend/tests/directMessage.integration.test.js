const fs = require('fs/promises');
const path = require('path');
const { newDb } = require('pg-mem');
const request = require('supertest');
const { createApp } = require('../src/app');
const { UserRepository } = require('../src/repositories/userRepository');
const { DirectMessageRepository } = require('../src/repositories/directMessageRepository');
const { AuthService } = require('../src/services/authService');
const { DirectMessageService } = require('../src/services/directMessageService');

async function buildTestContext() {
  const database = newDb();
  const adapter = database.adapters.createPg();
  const pool = new adapter.Pool();

  for (const file of [
    '001_create_users.sql',
    '002_create_communities.sql',
    '003_create_channels.sql',
    '004_create_messages.sql',
    '005_create_direct_messages.sql',
  ]) {
    const migration = path.resolve(__dirname, `../../database/migrations/${file}`);
    await pool.query(await fs.readFile(migration, 'utf8'));
  }

  const userRepository = new UserRepository(pool);
  const directMessageRepository = new DirectMessageRepository(pool);
  const authService = new AuthService(userRepository);
  const directMessageService = new DirectMessageService(directMessageRepository);

  const app = createApp({
    authService,
    directMessageService,
    enableRateLimit: false,
  });

  return { app, pool, directMessageRepository };
}

async function registerAndLogin(app, username) {
  await request(app)
    .post('/api/auth/register')
    .send({
      username,
      email: `${username}@example.com`,
      password: 'SecurePassword123!',
    });

  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ username, password: 'SecurePassword123!' });

  const token = loginRes.body.data.token;
  const meRes = await request(app)
    .get('/api/users/me')
    .set('Authorization', `Bearer ${token}`);

  return { token, userId: meRes.body.data.id };
}

describe('US-10: Send and Receive Direct Messages (FR-MSG-03)', () => {
  let app;
  let pool;
  let directMessageRepository;
  let userA;
  let userB;
  let userC;

  beforeEach(async () => {
    ({ app, pool, directMessageRepository } = await buildTestContext());

    userA = await registerAndLogin(app, 'alice');
    userB = await registerAndLogin(app, 'bob');
    userC = await registerAndLogin(app, 'charlie');
  });

  afterEach(async () => {
    await pool.end();
  });

  describe('POST /api/direct-messages/conversations', () => {
    test('initiates a conversation between two users and returns 201', async () => {
      const res = await request(app)
        .post('/api/direct-messages/conversations')
        .set('Authorization', `Bearer ${userA.token}`)
        .send({ recipientId: userB.userId });

      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        status: 'success',
        data: expect.objectContaining({
          id: expect.any(String),
          userAId: expect.any(String),
          userBId: expect.any(String),
          createdAt: expect.any(String),
        }),
      });
    });

    test('is idempotent: returns same conversation when called again', async () => {
      const res1 = await request(app)
        .post('/api/direct-messages/conversations')
        .set('Authorization', `Bearer ${userA.token}`)
        .send({ recipientId: userB.userId });

      const res2 = await request(app)
        .post('/api/direct-messages/conversations')
        .set('Authorization', `Bearer ${userB.token}`)
        .send({ recipientId: userA.userId });

      expect(res1.body.data.id).toBe(res2.body.data.id);
    });

    test('rejects self-conversation with 400', async () => {
      const res = await request(app)
        .post('/api/direct-messages/conversations')
        .set('Authorization', `Bearer ${userA.token}`)
        .send({ recipientId: userA.userId });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_INPUT_PAYLOAD');
    });

    test('rejects unauthenticated request with 401', async () => {
      const res = await request(app)
        .post('/api/direct-messages/conversations')
        .send({ recipientId: userB.userId });

      expect(res.status).toBe(401);
    });
  });

  describe('POST & GET /api/direct-messages/conversations/:conversationId/messages', () => {
    let conversationId;

    beforeEach(async () => {
      const convRes = await request(app)
        .post('/api/direct-messages/conversations')
        .set('Authorization', `Bearer ${userA.token}`)
        .send({ recipientId: userB.userId });
      conversationId = convRes.body.data.id;
    });

    test('participant can send a direct message successfully (201)', async () => {
      const res = await request(app)
        .post(`/api/direct-messages/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${userA.token}`)
        .send({ content: 'Hello Bob!' });

      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        status: 'success',
        data: expect.objectContaining({
          id: expect.any(String),
          conversationId,
          senderId: userA.userId,
          content: 'Hello Bob!',
        }),
      });

      // Verify persistence in DB
      const messages = await directMessageRepository.findMessagesByConversation(conversationId);
      expect(messages).toHaveLength(1);
      expect(messages[0].content).toBe('Hello Bob!');
    });

    test('both participants can exchange messages and retrieve them in order', async () => {
      await request(app)
        .post(`/api/direct-messages/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${userA.token}`)
        .send({ content: 'Message 1 from Alice' });

      await request(app)
        .post(`/api/direct-messages/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${userB.token}`)
        .send({ content: 'Message 2 from Bob' });

      const getRes = await request(app)
        .get(`/api/direct-messages/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${userB.token}`);

      expect(getRes.status).toBe(200);
      expect(getRes.body.data).toHaveLength(2);
      expect(getRes.body.data[0].content).toBe('Message 1 from Alice');
      expect(getRes.body.data[1].content).toBe('Message 2 from Bob');
    });

    test('rejects non-participant trying to send a message with 403', async () => {
      const res = await request(app)
        .post(`/api/direct-messages/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${userC.token}`)
        .send({ content: 'Eavesdropper' });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('INSUFFICIENT_PERMISSIONS');
    });

    test('rejects non-participant trying to read messages with 403', async () => {
      const res = await request(app)
        .get(`/api/direct-messages/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${userC.token}`);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('INSUFFICIENT_PERMISSIONS');
    });

    test('returns 404 when sending to non-existent conversation', async () => {
      const fakeId = '00000000-0000-4000-8000-000000000000';
      const res = await request(app)
        .post(`/api/direct-messages/conversations/${fakeId}/messages`)
        .set('Authorization', `Bearer ${userA.token}`)
        .send({ content: 'Lost in the void' });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('CONVERSATION_NOT_FOUND');
    });

    test('returns 404 when getting messages for non-existent conversation', async () => {
      const fakeId = '00000000-0000-4000-8000-000000000000';
      const res = await request(app)
        .get(`/api/direct-messages/conversations/${fakeId}/messages`)
        .set('Authorization', `Bearer ${userA.token}`);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('CONVERSATION_NOT_FOUND');
    });

    test('rejects empty or whitespace content with 400', async () => {
      const res = await request(app)
        .post(`/api/direct-messages/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${userA.token}`)
        .send({ content: '   ' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_INPUT_PAYLOAD');
    });

    test('rejects unauthenticated message sending with 401', async () => {
      const res = await request(app)
        .post(`/api/direct-messages/conversations/${conversationId}/messages`)
        .send({ content: 'Unauthed message' });

      expect(res.status).toBe(401);
    });
  });
});
