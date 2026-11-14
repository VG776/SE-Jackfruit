const fs = require('fs/promises');
const path = require('path');
const { newDb } = require('pg-mem');
const request = require('supertest');
const { createApp } = require('../src/app');
const { UserRepository } = require('../src/repositories/userRepository');
const { CommunityRepository } = require('../src/repositories/communityRepository');
const { ChannelRepository } = require('../src/repositories/channelRepository');
const { ChannelPermissionRepository } = require('../src/repositories/channelPermissionRepository');
const { MessageRepository } = require('../src/repositories/messageRepository');
const { ReactionRepository } = require('../src/repositories/reactionRepository');
const { AuthService } = require('../src/services/authService');
const { CommunityService } = require('../src/services/communityService');
const { ChannelService } = require('../src/services/channelService');
const { MessageService } = require('../src/services/messageService');
const { ReactionService } = require('../src/services/reactionService');

const THUMBS_UP = '\u{1F44D}';
const FIRE = '\u{1F525}';
const MISSING_ID = '00000000-0000-4000-8000-000000000000';

async function buildTestContext() {
  const database = newDb();
  const adapter = database.adapters.createPg();
  const pool = new adapter.Pool();

  for (const file of [
    '001_create_users.sql',
    '002_create_communities.sql',
    '003_create_channels.sql',
    '004_create_messages.sql',
    '005_index_message_history.sql',
    '006_create_community_invites.sql',
    '007_add_message_soft_delete.sql',
    '008_create_message_reactions.sql',
  ]) {
    const migration = path.resolve(__dirname, `../../database/migrations/${file}`);
    await pool.query(await fs.readFile(migration, 'utf8'));
  }

  const messageRepository = new MessageRepository(pool);
  const channelService = new ChannelService(
    new ChannelRepository(pool),
    new ChannelPermissionRepository(pool),
  );
  const app = createApp({
    authService: new AuthService(new UserRepository(pool)),
    communityService: new CommunityService(new CommunityRepository(pool)),
    channelService,
    messageService: new MessageService(messageRepository, channelService),
    reactionService: new ReactionService(
      new ReactionRepository(pool),
      messageRepository,
      channelService,
    ),
    enableRateLimit: false,
  });

  return { app, pool, messageRepository };
}

async function registerAndLogin(app, suffix) {
  await request(app)
    .post('/api/auth/register')
    .send({
      username: `user_${suffix}`,
      email: `user_${suffix}@example.com`,
      password: 'SecurePassword123!',
    });
  const login = await request(app)
    .post('/api/auth/login')
    .send({ username: `user_${suffix}`, password: 'SecurePassword123!' });
  return login.body.data.token;
}

describe('US-13: Add and remove reactions (FR-UX-01)', () => {
  let app;
  let pool;
  let messageRepository;
  let ownerToken;
  let memberToken;
  let outsiderToken;
  let channelId;
  let messageId;

  const bearer = (token) => ({ Authorization: `Bearer ${token}` });
  const react = (token, id, emoji) =>
    request(app).post(`/api/messages/${id}/reactions`).set(bearer(token)).send({ emoji });
  const unreact = (token, id, emoji) =>
    request(app)
      .delete(`/api/messages/${id}/reactions/${encodeURIComponent(emoji)}`)
      .set(bearer(token));

  beforeEach(async () => {
    ({ app, pool, messageRepository } = await buildTestContext());
    ownerToken = await registerAndLogin(app, 'owner');
    memberToken = await registerAndLogin(app, 'member');
    outsiderToken = await registerAndLogin(app, 'outsider');

    const community = await request(app)
      .post('/api/communities')
      .set(bearer(ownerToken))
      .send({ name: 'Gaming Hub' });
    const communityId = community.body.data.id;

    const me = await request(app).get('/api/users/me').set(bearer(memberToken));
    await pool.query(
      `INSERT INTO community_members (id, community_id, user_id, role)
       VALUES ('aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', $1, $2, 'member')`,
      [communityId, me.body.data.id],
    );

    const channel = await request(app)
      .post(`/api/communities/${communityId}/channels`)
      .set(bearer(ownerToken))
      .send({ name: 'general', type: 'text' });
    channelId = channel.body.data.id;

    const message = await request(app)
      .post(`/api/channels/${channelId}/messages`)
      .set(bearer(ownerToken))
      .send({ content: 'Hello everyone' });
    messageId = message.body.data.id;
  });

  afterEach(async () => {
    await pool.end();
  });

  describe('POST /api/messages/:messageId/reactions', () => {
    test('member adds a supported reaction and the count is returned', async () => {
      const res = await react(memberToken, messageId, THUMBS_UP);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({
        messageId,
        added: true,
        reactions: [{ emoji: THUMBS_UP, count: 1, userIds: [expect.any(String)] }],
      });
    });

    test('reactions from different users are counted together', async () => {
      await react(ownerToken, messageId, THUMBS_UP);
      const res = await react(memberToken, messageId, THUMBS_UP);

      expect(res.body.data.reactions).toEqual([
        { emoji: THUMBS_UP, count: 2, userIds: expect.any(Array) },
      ]);
    });

    test('the same user reacting twice with the same emoji is not duplicated', async () => {
      await react(memberToken, messageId, THUMBS_UP);
      const second = await react(memberToken, messageId, THUMBS_UP);

      expect(second.status).toBe(200);
      expect(second.body.data.added).toBe(false);
      expect(second.body.data.reactions[0].count).toBe(1);

      const rows = await pool.query('SELECT * FROM message_reactions');
      expect(rows.rows).toHaveLength(1);
    });

    test('a user may add different emoji to the same message', async () => {
      await react(memberToken, messageId, THUMBS_UP);
      const res = await react(memberToken, messageId, FIRE);

      expect(res.body.data.reactions.map((r) => r.emoji)).toEqual([THUMBS_UP, FIRE]);
    });

    test('rejects unsupported emoji values with 400 and stores nothing', async () => {
      const res = await react(memberToken, messageId, 'not-an-emoji');

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_INPUT_PAYLOAD');
      const rows = await pool.query('SELECT * FROM message_reactions');
      expect(rows.rows).toHaveLength(0);
    });

    test('rejects a missing emoji and unexpected fields with 400', async () => {
      const missing = await request(app)
        .post(`/api/messages/${messageId}/reactions`)
        .set(bearer(memberToken))
        .send({});
      const extra = await request(app)
        .post(`/api/messages/${messageId}/reactions`)
        .set(bearer(memberToken))
        .send({ emoji: THUMBS_UP, userId: MISSING_ID });

      expect(missing.status).toBe(400);
      expect(extra.status).toBe(400);
    });

    test('rejects a malformed message ID with 400', async () => {
      const res = await react(memberToken, 'not-a-uuid', THUMBS_UP);
      expect(res.status).toBe(400);
    });

    test('rejects unauthenticated requests with 401', async () => {
      const res = await request(app)
        .post(`/api/messages/${messageId}/reactions`)
        .send({ emoji: THUMBS_UP });
      expect(res.status).toBe(401);
    });

    test('a non-member gets the same 404 as a missing message and nothing changes', async () => {
      const forbidden = await react(outsiderToken, messageId, THUMBS_UP);
      const missing = await react(outsiderToken, MISSING_ID, THUMBS_UP);

      expect(forbidden.status).toBe(404);
      expect(forbidden.body.code).toBe('MESSAGE_NOT_FOUND');
      expect(forbidden.body.detail).toBe(missing.body.detail);
      const rows = await pool.query('SELECT * FROM message_reactions');
      expect(rows.rows).toHaveLength(0);
    });

    test('rejects reactions on a deleted message with 404', async () => {
      await messageRepository.softDelete(messageId);

      const res = await react(memberToken, messageId, THUMBS_UP);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('MESSAGE_NOT_FOUND');
    });
  });

  describe('DELETE /api/messages/:messageId/reactions/:emoji', () => {
    test('removes the caller\'s own reaction with 204', async () => {
      await react(memberToken, messageId, THUMBS_UP);

      const res = await unreact(memberToken, messageId, THUMBS_UP);

      expect(res.status).toBe(204);
      const rows = await pool.query('SELECT * FROM message_reactions');
      expect(rows.rows).toHaveLength(0);
    });

    test('only removes the caller\'s reaction, not other users\' reactions', async () => {
      await react(ownerToken, messageId, THUMBS_UP);
      await react(memberToken, messageId, THUMBS_UP);

      await unreact(memberToken, messageId, THUMBS_UP);

      const list = await request(app)
        .get(`/api/messages/${messageId}/reactions`)
        .set(bearer(ownerToken));
      expect(list.body.data.reactions).toEqual([
        { emoji: THUMBS_UP, count: 1, userIds: [expect.any(String)] },
      ]);
    });

    test('returns 404 when the caller has no such reaction', async () => {
      await react(ownerToken, messageId, THUMBS_UP);

      const res = await unreact(memberToken, messageId, THUMBS_UP);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('REACTION_NOT_FOUND');
    });

    test('rejects an unsupported emoji with 400', async () => {
      const res = await unreact(memberToken, messageId, 'nope');
      expect(res.status).toBe(400);
    });

    test('a non-member cannot remove reactions and gets 404', async () => {
      await react(ownerToken, messageId, THUMBS_UP);

      const res = await unreact(outsiderToken, messageId, THUMBS_UP);

      expect(res.status).toBe(404);
      const rows = await pool.query('SELECT * FROM message_reactions');
      expect(rows.rows).toHaveLength(1);
    });

    test('rejects unauthenticated requests with 401', async () => {
      const res = await request(app).delete(
        `/api/messages/${messageId}/reactions/${encodeURIComponent(THUMBS_UP)}`,
      );
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/messages/:messageId/reactions', () => {
    test('returns an empty list for a message without reactions', async () => {
      const res = await request(app)
        .get(`/api/messages/${messageId}/reactions`)
        .set(bearer(memberToken));

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ messageId, reactions: [] });
    });

    test('is hidden from non-members with 404', async () => {
      const res = await request(app)
        .get(`/api/messages/${messageId}/reactions`)
        .set(bearer(outsiderToken));
      expect(res.status).toBe(404);
    });
  });

  test('reactions are removed together with their message', async () => {
    await react(memberToken, messageId, THUMBS_UP);
    await pool.query('DELETE FROM messages WHERE id = $1', [messageId]);

    const rows = await pool.query('SELECT * FROM message_reactions');
    expect(rows.rows).toHaveLength(0);
  });
});
