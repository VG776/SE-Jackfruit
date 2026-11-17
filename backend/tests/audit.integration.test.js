const fs = require('fs/promises');
const path = require('path');
const { newDb } = require('pg-mem');
const request = require('supertest');
const { createApp } = require('../src/app');
const { UserRepository } = require('../src/repositories/userRepository');
const { CommunityRepository } = require('../src/repositories/communityRepository');
const { ChannelPermissionRepository } = require('../src/repositories/channelPermissionRepository');
const { MembershipRepository } = require('../src/repositories/membershipRepository');
const { AuditRepository } = require('../src/repositories/auditRepository');
const { AuthService } = require('../src/services/authService');
const { CommunityService } = require('../src/services/communityService');
const { MembershipService } = require('../src/services/membershipService');
const { AuditService } = require('../src/services/auditService');

async function buildContext() {
  const pool = new (newDb().adapters.createPg().Pool)();
  for (const file of [
    '001_create_users.sql',
    '002_create_communities.sql',
    '003_create_channels.sql',
    '004_create_messages.sql',
    '005_index_message_history.sql',
    '006_create_community_invites.sql',
    '007_add_message_soft_delete.sql',
    '010_create_audit_logs.sql',
    '010_create_community_bans.sql',
  ]) {
    await pool.query(await fs.readFile(path.resolve(__dirname, `../../database/migrations/${file}`), 'utf8'));
  }
  const auditService = new AuditService(new AuditRepository(pool), new ChannelPermissionRepository(pool));
  const app = createApp({
    authService: new AuthService(new UserRepository(pool)),
    communityService: new CommunityService(new CommunityRepository(pool)),
    membershipService: new MembershipService(new MembershipRepository(pool), auditService),
    auditService,
    enableRateLimit: false,
  });
  return { app, pool, auditService };
}

async function login(app, name) {
  await request(app).post('/api/auth/register').send({
    username: `user_${name}`,
    email: `user_${name}@example.com`,
    password: 'SecurePassword123!',
  });
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: `user_${name}`, password: 'SecurePassword123!' });
  const token = res.body.data.token;
  const me = await request(app).get('/api/users/me').set('Authorization', `Bearer ${token}`);
  return { token, id: me.body.data.id };
}

describe('US-18: Record moderation audit events (FR-MOD-03, FR-MOD-01)', () => {
  let app;
  let pool;
  let auditService;
  let u;
  let communityId;
  const bearer = (t) => ({ Authorization: `Bearer ${t}` });
  const list = (t, query = '') =>
    request(app).get(`/api/communities/${communityId}/audit-logs${query}`).set(bearer(t));

  beforeEach(async () => {
    ({ app, pool, auditService } = await buildContext());
    u = {};
    for (const n of ['owner', 'mod', 'member', 'outsider']) u[n] = await login(app, n);
    const c = await request(app).post('/api/communities').set(bearer(u.owner.token)).send({ name: 'Hub' });
    communityId = c.body.data.id;
    await pool.query(
      `INSERT INTO community_members (id, community_id, user_id, role) VALUES
       ('aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', $1, $2, 'moderator'),
       ('bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb', $1, $3, 'member')`,
      [communityId, u.mod.id, u.member.id],
    );
  });

  afterEach(() => pool.end());

  test('records actor, action, target and timestamp for a ban and returns it newest-first', async () => {
    const ban = await request(app)
      .post(`/api/communities/${communityId}/members/${u.member.id}/moderation`)
      .set(bearer(u.mod.token))
      .send({ action: 'BAN', reason: 'spam' });
    expect(ban.status).toBe(200);

    const res = await list(u.owner.token);

    expect(res.status).toBe(200);
    expect(res.body.data.logs).toEqual([
      {
        id: expect.any(String),
        actor: { id: u.mod.id, username: 'user_mod' },
        action: 'MEMBER_BANNED',
        targetType: 'user',
        targetId: u.member.id,
        details: { reason: 'spam' },
        createdAt: expect.any(String),
      },
    ]);
  });

  test('a moderator can read the log', async () => {
    expect((await list(u.mod.token)).status).toBe(200);
  });

  test('an ordinary member gets 403, an outsider 404, unauthenticated 401', async () => {
    expect((await list(u.member.token)).status).toBe(403);
    expect((await list(u.outsider.token)).status).toBe(404);
    const anon = await request(app).get(`/api/communities/${communityId}/audit-logs`);
    expect(anon.status).toBe(401);
  });

  test('supports pagination and rejects invalid query values', async () => {
    for (const action of ['a1', 'a2', 'a3']) {
      await auditService.record({ communityId, actorId: u.owner.id, action, targetType: 'x', targetId: u.member.id });
    }
    const page = await list(u.owner.token, '?limit=2&page=2');
    expect(page.body.data.logs).toHaveLength(1);
    expect((await list(u.owner.token, '?limit=0')).status).toBe(400);
    expect((await list(u.owner.token, '?foo=1')).status).toBe(400);
  });

  test('does not store secrets passed in details', async () => {
    await auditService.record({
      communityId,
      actorId: u.owner.id,
      action: 'TEST',
      targetType: 'x',
      targetId: u.member.id,
      details: { reason: 'ok', password: 'p', authToken: 't' },
    });
    const res = await list(u.owner.token);
    expect(res.body.data.logs[0].details).toEqual({ reason: 'ok' });
  });

  test('audit log is scoped to its community', async () => {
    const other = await request(app).post('/api/communities').set(bearer(u.outsider.token)).send({ name: 'Other' });
    await auditService.record({
      communityId: other.body.data.id,
      actorId: u.outsider.id,
      action: 'OTHER',
      targetType: 'x',
      targetId: u.member.id,
    });
    expect((await list(u.owner.token)).body.data.logs).toHaveLength(0);
  });

  test('records MEMBER_REMOVED when kicking a member or removing via admin delete', async () => {
    const kick = await request(app)
      .post(`/api/communities/${communityId}/members/${u.member.id}/moderation`)
      .set(bearer(u.mod.token))
      .send({ action: 'KICK', reason: 'violating rules' });
    expect(kick.status).toBe(200);

    const res = await list(u.owner.token);
    expect(res.status).toBe(200);
    expect(res.body.data.logs[0]).toMatchObject({
      actor: { id: u.mod.id, username: 'user_mod' },
      action: 'MEMBER_REMOVED',
      targetType: 'user',
      targetId: u.member.id,
      details: { reason: 'violating rules' },
    });
  });
});
