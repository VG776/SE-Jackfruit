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
const { ModerationRepository } = require('../src/repositories/moderationRepository');
const { AuthService } = require('../src/services/authService');
const { CommunityService } = require('../src/services/communityService');
const { ChannelService } = require('../src/services/channelService');
const { MessageService } = require('../src/services/messageService');
const { ModerationService } = require('../src/services/moderationService');

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
    '010_create_audit_logs.sql',
  ]) {
    const migration = path.resolve(__dirname, `../../database/migrations/${file}`);
    await pool.query(await fs.readFile(migration, 'utf8'));
  }

  const messageRepository = new MessageRepository(pool);
  const channelService = new ChannelService(
    new ChannelRepository(pool),
    new ChannelPermissionRepository(pool),
  );
  const moderationService = new ModerationService(
    new ModerationRepository(pool),
    messageRepository,
    channelService,
  );
  const app = createApp({
    authService: new AuthService(new UserRepository(pool)),
    communityService: new CommunityService(new CommunityRepository(pool)),
    channelService,
    messageService: new MessageService(messageRepository, channelService, moderationService),
    moderationService,
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

describe('US-16: Moderate messages (FR-MOD-01, FR-MOD-03, FR-COM-04)', () => {
  let app;
  let pool;
  let messageRepository;
  let tokens;
  let ids;
  let channelId;
  let messageId;

  const bearer = (token) => ({ Authorization: `Bearer ${token}` });
  const moderate = (token, id = messageId, body = { action: 'REMOVE', reason: 'spam' }) =>
    request(app)
      .post(`/api/channels/${channelId}/messages/${id}/moderation`)
      .set(bearer(token))
      .send(body);
  const auditRows = async () => (await pool.query('SELECT * FROM audit_logs')).rows;

  beforeEach(async () => {
    ({ app, pool, messageRepository } = await buildTestContext());
    tokens = {};
    ids = {};
    for (const name of ['owner', 'moderator', 'member', 'outsider']) {
      tokens[name] = await registerAndLogin(app, name);
      const me = await request(app).get('/api/users/me').set(bearer(tokens[name]));
      ids[name] = me.body.data.id;
    }

    const community = await request(app)
      .post('/api/communities')
      .set(bearer(tokens.owner))
      .send({ name: 'Gaming Hub' });
    const communityId = community.body.data.id;
    await pool.query(
      `INSERT INTO community_members (id, community_id, user_id, role) VALUES
       ('aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', $1, $2, 'moderator'),
       ('bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb', $1, $3, 'member')`,
      [communityId, ids.moderator, ids.member],
    );

    const channel = await request(app)
      .post(`/api/communities/${communityId}/channels`)
      .set(bearer(tokens.owner))
      .send({ name: 'general', type: 'text' });
    channelId = channel.body.data.id;

    const message = await request(app)
      .post(`/api/channels/${channelId}/messages`)
      .set(bearer(tokens.member))
      .send({ content: 'inappropriate content' });
    messageId = message.body.data.id;
  });

  afterEach(async () => {
    await pool.end();
  });

  test("moderator removes another user's message and an audit event is recorded", async () => {
    const res = await moderate(tokens.moderator);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ id: messageId, removed: true, moderated: true });
    expect((await messageRepository.findById(messageId)).deleted_at).not.toBeNull();

    const rows = await auditRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actor_id: ids.moderator,
      action: 'MESSAGE_REMOVED',
      target_type: 'message',
      target_id: messageId,
    });
    expect(rows[0].created_at).toBeTruthy();
    expect(JSON.parse(rows[0].details)).toEqual({
      channelId,
      authorId: ids.member,
      reason: 'spam',
    });
  });

  test('community admin (owner) can remove a message, reason optional', async () => {
    const res = await moderate(tokens.owner, messageId, { action: 'REMOVE' });

    expect(res.status).toBe(200);
    const rows = await auditRows();
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0].details).reason).toBeNull();
  });

  test('removed message disappears from channel history', async () => {
    await moderate(tokens.moderator);

    const history = await request(app)
      .get(`/api/channels/${channelId}/messages`)
      .set(bearer(tokens.member));
    expect(history.body.data.messages).toHaveLength(0);
  });

  test('an ordinary member gets 403 and nothing changes', async () => {
    const res = await moderate(tokens.member);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('INSUFFICIENT_PERMISSIONS');
    expect((await messageRepository.findById(messageId)).deleted_at).toBeNull();
    expect(await auditRows()).toHaveLength(0);
  });

  test('a user outside the community gets 404 and nothing changes', async () => {
    const res = await moderate(tokens.outsider);

    expect(res.status).toBe(404);
    expect((await messageRepository.findById(messageId)).deleted_at).toBeNull();
    expect(await auditRows()).toHaveLength(0);
  });

  test('unauthenticated requests get 401', async () => {
    const res = await request(app)
      .post(`/api/channels/${channelId}/messages/${messageId}/moderation`)
      .send({ action: 'REMOVE' });
    expect(res.status).toBe(401);
  });

  test('unknown message returns 404 without an audit event', async () => {
    const res = await moderate(tokens.moderator, MISSING_ID);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('MESSAGE_NOT_FOUND');
    expect(await auditRows()).toHaveLength(0);
  });

  test('moderating an already-removed message returns 404 and adds no second audit event', async () => {
    await moderate(tokens.moderator);
    const second = await moderate(tokens.moderator);

    expect(second.status).toBe(404);
    expect(await auditRows()).toHaveLength(1);
  });

  test.each([
    ['unsupported action', { action: 'BAN' }],
    ['missing action', {}],
    ['unexpected field', { action: 'REMOVE', extra: 1 }],
    ['over-long reason', { action: 'REMOVE', reason: 'x'.repeat(501) }],
  ])('rejects %s with 400', async (_name, body) => {
    const res = await moderate(tokens.moderator, messageId, body);

    expect(res.status).toBe(400);
    expect(await auditRows()).toHaveLength(0);
  });

  test('returns 500 and does not report success when the audit write fails', async () => {
    await pool.query('DROP TABLE audit_logs');

    const res = await moderate(tokens.moderator);

    expect(res.status).toBe(500);
  });

  test('audit records contain no secrets', async () => {
    await moderate(tokens.moderator);

    const serialized = JSON.stringify(await auditRows()).toLowerCase();
    expect(serialized).not.toContain('password');
    expect(serialized).not.toContain('token');
  });

  test("legacy DELETE by a moderator on another user's message is also audited", async () => {
    const res = await request(app)
      .delete(`/api/channels/${channelId}/messages/${messageId}`)
      .set(bearer(tokens.moderator));

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ id: messageId, deleted: true });
    expect(await auditRows()).toHaveLength(1);
  });

  test('an author deleting their own message is not a moderation event', async () => {
    const res = await request(app)
      .delete(`/api/channels/${channelId}/messages/${messageId}`)
      .set(bearer(tokens.member));

    expect(res.status).toBe(200);
    expect(await auditRows()).toHaveLength(0);
  });
});
