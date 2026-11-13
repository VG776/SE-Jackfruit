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
const { AuthService } = require('../src/services/authService');
const { CommunityService } = require('../src/services/communityService');
const { ChannelService } = require('../src/services/channelService');
const { MessageService } = require('../src/services/messageService');

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
  ]) {
    const migration = path.resolve(__dirname, `../../database/migrations/${file}`);
    await pool.query(await fs.readFile(migration, 'utf8'));
  }

  const userRepository = new UserRepository(pool);
  const communityRepository = new CommunityRepository(pool);
  const channelRepository = new ChannelRepository(pool);
  const permissionRepository = new ChannelPermissionRepository(pool);
  const messageRepository = new MessageRepository(pool);

  const authService = new AuthService(userRepository);
  const communityService = new CommunityService(communityRepository);
  const channelService = new ChannelService(channelRepository, permissionRepository);
  const messageService = new MessageService(messageRepository, channelService);

  const app = createApp({
    authService,
    communityService,
    channelService,
    messageService,
    enableRateLimit: false,
  });

  return { app, pool, messageRepository };
}

async function registerAndLogin(app, suffix = '') {
  await request(app)
    .post('/api/auth/register')
    .send({
      username: `user_${suffix}`,
      email: `user_${suffix}@example.com`,
      password: 'SecurePassword123!',
    });

  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ username: `user_${suffix}`, password: 'SecurePassword123!' });

  return loginRes.body.data.token;
}

describe('US-11: Edit and Delete Messages (FR-MSG-04)', () => {
  let app;
  let pool;
  let messageRepository;
  let ownerToken;
  let memberToken;
  let channelId;
  let communityId;

  beforeEach(async () => {
    ({ app, pool, messageRepository } = await buildTestContext());

    ownerToken = await registerAndLogin(app, 'owner');
    memberToken = await registerAndLogin(app, 'member');

    // Create community as owner
    const commRes = await request(app)
      .post('/api/communities')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Gaming Hub' });
    communityId = commRes.body.data.id;

    // Add member to community
    const memberUserRes = await request(app)
      .get('/api/users/me')
      .set('Authorization', `Bearer ${memberToken}`);
    const memberUserId = memberUserRes.body.data.id;

    await pool.query(
      `INSERT INTO community_members (id, community_id, user_id, role)
       VALUES ('aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', $1, $2, 'member')`,
      [communityId, memberUserId],
    );

    // Create channel
    const chanRes = await request(app)
      .post(`/api/communities/${communityId}/channels`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'general', type: 'text' });
    channelId = chanRes.body.data.id;
  });

  afterEach(async () => {
    await pool.end();
  });

  describe('PATCH /api/channels/:channelId/messages/:messageId', () => {
    test('author can edit their own message successfully', async () => {
      const msgRes = await request(app)
        .post(`/api/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ content: 'Original message' });
      const messageId = msgRes.body.data.id;

      const editRes = await request(app)
        .patch(`/api/channels/${channelId}/messages/${messageId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ content: 'Edited message' });

      expect(editRes.status).toBe(200);
      expect(editRes.body).toEqual({
        status: 'success',
        data: expect.objectContaining({
          id: messageId,
          content: 'Edited message',
        }),
      });

      // Verify persistence in DB
      const inDb = await messageRepository.findById(messageId);
      expect(inDb.content).toBe('Edited message');
    });

    test('rejects edit attempt from non-author with 403', async () => {
      const msgRes = await request(app)
        .post(`/api/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ content: 'Original by owner' });
      const messageId = msgRes.body.data.id;

      const editRes = await request(app)
        .patch(`/api/channels/${channelId}/messages/${messageId}`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ content: 'Tampered content' });

      expect(editRes.status).toBe(403);
      expect(editRes.body.code).toBe('INSUFFICIENT_PERMISSIONS');

      // Verify DB was not modified
      const inDb = await messageRepository.findById(messageId);
      expect(inDb.content).toBe('Original by owner');
    });

    test('returns 404 for non-existent message ID', async () => {
      const fakeId = '00000000-0000-4000-8000-000000000000';
      const editRes = await request(app)
        .patch(`/api/channels/${channelId}/messages/${fakeId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ content: 'Something' });

      expect(editRes.status).toBe(404);
      expect(editRes.body.code).toBe('MESSAGE_NOT_FOUND');
    });

    test('rejects empty or whitespace-only edit with 400', async () => {
      const msgRes = await request(app)
        .post(`/api/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ content: 'Hello' });
      const messageId = msgRes.body.data.id;

      const editRes = await request(app)
        .patch(`/api/channels/${channelId}/messages/${messageId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ content: '    ' });

      expect(editRes.status).toBe(400);
      expect(editRes.body.code).toBe('INVALID_INPUT_PAYLOAD');
    });

    test('rejects unauthenticated edit with 401', async () => {
      const fakeId = '00000000-0000-4000-8000-000000000000';
      const editRes = await request(app)
        .patch(`/api/channels/${channelId}/messages/${fakeId}`)
        .send({ content: 'Unauthed' });

      expect(editRes.status).toBe(401);
    });
  });

  describe('DELETE /api/channels/:channelId/messages/:messageId', () => {
    test('author can delete their own message', async () => {
      const msgRes = await request(app)
        .post(`/api/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ content: 'To be deleted' });
      const messageId = msgRes.body.data.id;

      const delRes = await request(app)
        .delete(`/api/channels/${channelId}/messages/${messageId}`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(delRes.status).toBe(200);
      expect(delRes.body).toEqual({
        status: 'success',
        data: { id: messageId, deleted: true },
      });

      // Verify soft delete in DB
      const inDb = await messageRepository.findById(messageId);
      expect(inDb.deleted_at).not.toBeNull();

      // Verify it no longer appears in channel history
      const historyRes = await request(app)
        .get(`/api/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(historyRes.body.data.messages.some((m) => m.id === messageId)).toBe(false);
    });

    test('moderator or community admin can delete another user message', async () => {
      const msgRes = await request(app)
        .post(`/api/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ content: 'Message by member' });
      const messageId = msgRes.body.data.id;

      // Owner (admin of community) deletes member's message
      const delRes = await request(app)
        .delete(`/api/channels/${channelId}/messages/${messageId}`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(delRes.status).toBe(200);
      expect(delRes.body.data.deleted).toBe(true);
    });

    test('regular member cannot delete another user message (403)', async () => {
      const msgRes = await request(app)
        .post(`/api/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ content: 'Message by owner' });
      const messageId = msgRes.body.data.id;

      // Member attempts to delete owner's message
      const delRes = await request(app)
        .delete(`/api/channels/${channelId}/messages/${messageId}`)
        .set('Authorization', `Bearer ${memberToken}`);

      expect(delRes.status).toBe(403);
      expect(delRes.body.code).toBe('INSUFFICIENT_PERMISSIONS');
    });

    test('returns 404 when trying to delete already deleted message', async () => {
      const msgRes = await request(app)
        .post(`/api/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ content: 'Double delete' });
      const messageId = msgRes.body.data.id;

      await request(app)
        .delete(`/api/channels/${channelId}/messages/${messageId}`)
        .set('Authorization', `Bearer ${ownerToken}`);

      // Second delete attempt
      const secondDel = await request(app)
        .delete(`/api/channels/${channelId}/messages/${messageId}`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(secondDel.status).toBe(404);
      expect(secondDel.body.code).toBe('MESSAGE_NOT_FOUND');
    });

    test('cannot edit an already deleted message', async () => {
      const msgRes = await request(app)
        .post(`/api/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ content: 'Delete then edit' });
      const messageId = msgRes.body.data.id;

      await request(app)
        .delete(`/api/channels/${channelId}/messages/${messageId}`)
        .set('Authorization', `Bearer ${ownerToken}`);

      const editRes = await request(app)
        .patch(`/api/channels/${channelId}/messages/${messageId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ content: 'New text' });

      expect(editRes.status).toBe(404);
      expect(editRes.body.code).toBe('MESSAGE_NOT_FOUND');
    });

    test('returns 401 without auth token on delete', async () => {
      const fakeId = '00000000-0000-4000-8000-000000000000';
      const delRes = await request(app)
        .delete(`/api/channels/${channelId}/messages/${fakeId}`);

      expect(delRes.status).toBe(401);
    });
  });
});
