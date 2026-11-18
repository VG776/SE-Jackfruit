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
const { MembershipRepository } = require('../src/repositories/membershipRepository');
const { ModerationRepository } = require('../src/repositories/moderationRepository');
const { AuditRepository } = require('../src/repositories/auditRepository');
const { UnreadRepository } = require('../src/repositories/unreadRepository');
const DirectMessageRepository = require('../src/repositories/directMessageRepository');
const { AuthService } = require('../src/services/authService');
const { CommunityService } = require('../src/services/communityService');
const { ChannelService } = require('../src/services/channelService');
const { MessageService } = require('../src/services/messageService');
const { MembershipService } = require('../src/services/membershipService');
const { AuditService } = require('../src/services/auditService');
const { ModerationService } = require('../src/services/moderationService');
const { UnreadService } = require('../src/services/unreadService');
const DirectMessageService = require('../src/services/directMessageService');
const { signToken } = require('../src/utils/token');

const USER_A_ID = '11111111-1111-4111-8111-111111111111';
const USER_B_ID = '22222222-2222-4222-8222-222222222222';
const USER_C_ID = '33333333-3333-4333-8333-333333333333';
const COMMUNITY_ID = '44444444-4444-4444-8444-444444444444';
const CHANNEL_ID = '55555555-5555-4555-8555-555555555555';
const MESSAGE_ID = '66666666-6666-4666-8666-666666666666';

const ISO_8601_UTC_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

async function buildTestContext() {
  const database = newDb();
  const adapter = database.adapters.createPg();
  const pool = new adapter.Pool();

  const migrationFiles = [
    '001_create_users.sql',
    '002_create_communities.sql',
    '003_create_channels.sql',
    '004_create_messages.sql',
    '005_index_message_history.sql',
    '006_create_community_invites.sql',
    '007_add_message_soft_delete.sql',
    '007_create_direct_messages.sql',
    '008_create_message_reactions.sql',
    '009_create_channel_read_states.sql',
    '010_create_audit_logs.sql',
    '010_create_community_bans.sql',
  ];

  for (const file of migrationFiles) {
    const migrationPath = path.resolve(__dirname, `../../database/migrations/${file}`);
    const sql = await fs.readFile(migrationPath, 'utf8');
    await pool.query(sql);
  }

  const userRepo = new UserRepository(pool);
  const communityRepo = new CommunityRepository(pool);
  const channelRepo = new ChannelRepository(pool);
  const permissionRepo = new ChannelPermissionRepository(pool);
  const messageRepo = new MessageRepository(pool);
  const membershipRepo = new MembershipRepository(pool);
  const auditRepo = new AuditRepository(pool);
  const moderationRepo = new ModerationRepository(pool);
  const unreadRepo = new UnreadRepository(pool);
  const directMessageRepo = new DirectMessageRepository(pool);

  const authService = new AuthService(userRepo);
  const communityService = new CommunityService(communityRepo);
  const channelService = new ChannelService(channelRepo, permissionRepo);
  const auditService = new AuditService(auditRepo, permissionRepo);
  const membershipService = new MembershipService(membershipRepo, auditService);
  const moderationService = new ModerationService(moderationRepo, permissionRepo, auditService);
  const messageService = new MessageService(messageRepo, channelService);
  const unreadService = new UnreadService(unreadRepo, channelRepo);
  const directMessageService = new DirectMessageService(directMessageRepo);

  const app = createApp({
    authService,
    communityService,
    channelService,
    messageService,
    membershipService,
    auditService,
    moderationService,
    unreadService,
    directMessageService,
    enableRateLimit: false,
  });

  return {
    pool,
    app,
    authService,
    userRepo,
    communityRepo,
    channelRepo,
    messageRepo,
    membershipRepo,
    auditRepo,
    moderationRepo,
    unreadRepo,
    directMessageRepo,
  };
}

describe('NFR-05: Database Integrity, Logging, and Traceability Verification (SRS §7, SRS §6.3)', () => {
  let context;
  let pool;
  let app;

  beforeEach(async () => {
    context = await buildTestContext();
    pool = context.pool;
    app = context.app;

    // Seed baseline user Alice
    await pool.query(
      `INSERT INTO users (id, username, email, password_hash, display_name, status)
       VALUES ($1, 'alice', 'alice@example.com', 'samplehashalice', 'Alice', 'online')`,
      [USER_A_ID],
    );

    // Seed baseline user Bob
    await pool.query(
      `INSERT INTO users (id, username, email, password_hash, display_name, status)
       VALUES ($1, 'bob', 'bob@example.com', 'samplehashbob', 'Bob', 'offline')`,
      [USER_B_ID],
    );

    // Seed community owned by Alice
    await pool.query(
      `INSERT INTO communities (id, owner_id, name, description)
       VALUES ($1, $2, 'General Community', 'Test community description')`,
      [COMMUNITY_ID, USER_A_ID],
    );

    // Seed community memberships
    await pool.query(
      `INSERT INTO community_members (id, community_id, user_id, role)
       VALUES ('aaaaaaaa-0000-4000-8000-000000000001', $1, $2, 'admin'),
              ('aaaaaaaa-0000-4000-8000-000000000002', $1, $3, 'member')`,
      [COMMUNITY_ID, USER_A_ID, USER_B_ID],
    );

    // Seed channel in community
    await pool.query(
      `INSERT INTO channels (id, community_id, name, type)
       VALUES ($1, $2, 'general', 'text')`,
      [CHANNEL_ID, COMMUNITY_ID],
    );
  });

  afterEach(async () => {
    if (pool) {
      await pool.end();
    }
  });

  describe('1. Database Primary Keys & Unique Constraints Verification (SRS §7)', () => {
    test('enforces UUID primary key uniqueness on users table', async () => {
      await expect(
        pool.query(
          `INSERT INTO users (id, username, email, password_hash, display_name)
           VALUES ($1, 'alice_dup', 'alice_dup@example.com', 'hash', 'Alice Dup')`,
          [USER_A_ID],
        ),
      ).rejects.toThrow();
    });

    test('enforces case-insensitive uniqueness on usernames', async () => {
      await expect(
        pool.query(
          `INSERT INTO users (id, username, email, password_hash, display_name)
           VALUES ($1, 'ALICE', 'new_alice@example.com', 'hash', 'Alice Capitalized')`,
          [USER_C_ID],
        ),
      ).rejects.toThrow();
    });

    test('enforces case-insensitive uniqueness on email addresses', async () => {
      await expect(
        pool.query(
          `INSERT INTO users (id, username, email, password_hash, display_name)
           VALUES ($1, 'charlie', 'ALICE@EXAMPLE.COM', 'hash', 'Charlie')`,
          [USER_C_ID],
        ),
      ).rejects.toThrow();
    });

    test('enforces case-insensitive community name uniqueness per owner', async () => {
      const duplicateCommId = '77777777-7777-4777-8777-777777777777';
      await expect(
        pool.query(
          `INSERT INTO communities (id, owner_id, name)
           VALUES ($1, $2, 'general community')`,
          [duplicateCommId, USER_A_ID],
        ),
      ).rejects.toThrow();
    });

    test('allows identical community names under different owners', async () => {
      const commBobId = '77777777-7777-4777-8777-777777777777';
      const result = await pool.query(
        `INSERT INTO communities (id, owner_id, name)
         VALUES ($1, $2, 'General Community')
         RETURNING id, name`,
        [commBobId, USER_B_ID],
      );
      expect(result.rows[0].name).toBe('General Community');
    });

    test('enforces channel name uniqueness within the same community', async () => {
      const duplicateChannelId = '88888888-8888-4888-8888-888888888888';
      await expect(
        pool.query(
          `INSERT INTO channels (id, community_id, name, type)
           VALUES ($1, $2, 'GENERAL', 'text')`,
          [duplicateChannelId, COMMUNITY_ID],
        ),
      ).rejects.toThrow();
    });

    test('enforces unique membership per user in a community', async () => {
      const duplicateMemberId = '99999999-9999-4999-8999-999999999999';
      await expect(
        pool.query(
          `INSERT INTO community_members (id, community_id, user_id, role)
           VALUES ($1, $2, $3, 'member')`,
          [duplicateMemberId, COMMUNITY_ID, USER_B_ID],
        ),
      ).rejects.toThrow();
    });

    test('enforces unique invite codes', async () => {
      const inviteId1 = 'a1111111-0000-4000-8000-000000000001';
      const inviteId2 = 'a2222222-0000-4000-8000-000000000002';
      await pool.query(
        `INSERT INTO community_invites (id, community_id, inviter_id, code)
         VALUES ($1, $2, $3, 'UNIQUE_CODE_123')`,
        [inviteId1, COMMUNITY_ID, USER_A_ID],
      );

      await expect(
        pool.query(
          `INSERT INTO community_invites (id, community_id, inviter_id, code)
           VALUES ($1, $2, $3, 'UNIQUE_CODE_123')`,
          [inviteId2, COMMUNITY_ID, USER_A_ID],
        ),
      ).rejects.toThrow();
    });

    test('enforces composite primary key on message reactions (message_id, user_id, emoji)', async () => {
      await pool.query(
        `INSERT INTO messages (id, channel_id, sender_id, content)
         VALUES ($1, $2, $3, 'Test Message for Reaction')`,
        [MESSAGE_ID, CHANNEL_ID, USER_A_ID],
      );

      await pool.query(
        `INSERT INTO message_reactions (message_id, user_id, emoji)
         VALUES ($1, $2, '👍')`,
        [MESSAGE_ID, USER_B_ID],
      );

      await expect(
        pool.query(
          `INSERT INTO message_reactions (message_id, user_id, emoji)
           VALUES ($1, $2, '👍')`,
          [MESSAGE_ID, USER_B_ID],
        ),
      ).rejects.toThrow();
    });

    test('enforces composite primary key on channel read states (user_id, channel_id)', async () => {
      await pool.query(
        `INSERT INTO channel_read_states (user_id, channel_id)
         VALUES ($1, $2)`,
        [USER_A_ID, CHANNEL_ID],
      );

      await expect(
        pool.query(
          `INSERT INTO channel_read_states (user_id, channel_id)
           VALUES ($1, $2)`,
          [USER_A_ID, CHANNEL_ID],
        ),
      ).rejects.toThrow();
    });

    test('enforces composite primary key on community bans (community_id, user_id)', async () => {
      await pool.query(
        `INSERT INTO community_bans (community_id, user_id, banned_by, reason)
         VALUES ($1, $2, $3, 'Spamming')`,
        [COMMUNITY_ID, USER_B_ID, USER_A_ID],
      );

      await expect(
        pool.query(
          `INSERT INTO community_bans (community_id, user_id, banned_by, reason)
           VALUES ($1, $2, $3, 'Duplicate ban')`,
          [COMMUNITY_ID, USER_B_ID, USER_A_ID],
        ),
      ).rejects.toThrow();
    });
  });

  describe('2. Foreign Key Referential Integrity & Cascades (SRS §7)', () => {
    test('rejects orphan records referencing non-existent parent foreign keys', async () => {
      const nonExistentUserId = '00000000-0000-4000-8000-000000000000';
      const nonExistentCommId = '00000000-0000-4000-8000-000000000001';

      // Non-existent owner in communities
      await expect(
        pool.query(
          `INSERT INTO communities (id, owner_id, name)
           VALUES ('12345678-1234-4234-8234-123456789012', $1, 'Invalid Owner')`,
          [nonExistentUserId],
        ),
      ).rejects.toThrow();

      // Non-existent community in channels
      await expect(
        pool.query(
          `INSERT INTO channels (id, community_id, name)
           VALUES ('12345678-1234-4234-8234-123456789013', $1, 'Invalid Channel')`,
          [nonExistentCommId],
        ),
      ).rejects.toThrow();
    });

    test('cascades deletion of community to channels, messages, invites, bans, and audit logs', async () => {
      // Create message, invite, audit log, and ban in community
      await pool.query(
        `INSERT INTO messages (id, channel_id, sender_id, content)
         VALUES ($1, $2, $3, 'Hello Community')`,
        [MESSAGE_ID, CHANNEL_ID, USER_A_ID],
      );

      const inviteId = 'b1111111-0000-4000-8000-000000000001';
      await pool.query(
        `INSERT INTO community_invites (id, community_id, inviter_id, code)
         VALUES ($1, $2, $3, 'CASCADE_INVITE')`,
        [inviteId, COMMUNITY_ID, USER_A_ID],
      );

      const auditId = 'b2222222-0000-4000-8000-000000000002';
      await pool.query(
        `INSERT INTO audit_logs (id, community_id, actor_id, action, target_type, target_id)
         VALUES ($1, $2, $3, 'CHANNEL_CREATED', 'channel', $4)`,
        [auditId, COMMUNITY_ID, USER_A_ID, CHANNEL_ID],
      );

      await pool.query(
        `INSERT INTO community_bans (community_id, user_id, banned_by, reason)
         VALUES ($1, $2, $3, 'Rule violation')`,
        [COMMUNITY_ID, USER_B_ID, USER_A_ID],
      );

      // Verify records exist before community deletion
      const preChannels = await pool.query('SELECT count(*) FROM channels WHERE community_id = $1', [COMMUNITY_ID]);
      const preMessages = await pool.query('SELECT count(*) FROM messages WHERE channel_id = $1', [CHANNEL_ID]);
      const preInvites = await pool.query('SELECT count(*) FROM community_invites WHERE community_id = $1', [COMMUNITY_ID]);
      const preAudit = await pool.query('SELECT count(*) FROM audit_logs WHERE community_id = $1', [COMMUNITY_ID]);
      const preBans = await pool.query('SELECT count(*) FROM community_bans WHERE community_id = $1', [COMMUNITY_ID]);

      expect(Number(preChannels.rows[0].count)).toBe(1);
      expect(Number(preMessages.rows[0].count)).toBe(1);
      expect(Number(preInvites.rows[0].count)).toBe(1);
      expect(Number(preAudit.rows[0].count)).toBe(1);
      expect(Number(preBans.rows[0].count)).toBe(1);

      // Delete community
      await pool.query('DELETE FROM communities WHERE id = $1', [COMMUNITY_ID]);

      // Verify ON DELETE CASCADE removed all child records
      const postChannels = await pool.query('SELECT count(*) FROM channels WHERE community_id = $1', [COMMUNITY_ID]);
      const postMessages = await pool.query('SELECT count(*) FROM messages WHERE channel_id = $1', [CHANNEL_ID]);
      const postInvites = await pool.query('SELECT count(*) FROM community_invites WHERE community_id = $1', [COMMUNITY_ID]);
      const postAudit = await pool.query('SELECT count(*) FROM audit_logs WHERE community_id = $1', [COMMUNITY_ID]);
      const postBans = await pool.query('SELECT count(*) FROM community_bans WHERE community_id = $1', [COMMUNITY_ID]);

      expect(Number(postChannels.rows[0].count)).toBe(0);
      expect(Number(postMessages.rows[0].count)).toBe(0);
      expect(Number(postInvites.rows[0].count)).toBe(0);
      expect(Number(postAudit.rows[0].count)).toBe(0);
      expect(Number(postBans.rows[0].count)).toBe(0);
    });

    test('cascades deletion of user to owned communities, memberships, and messages', async () => {
      await pool.query(
        `INSERT INTO messages (id, channel_id, sender_id, content)
         VALUES ($1, $2, $3, 'Bob message')`,
        [MESSAGE_ID, CHANNEL_ID, USER_B_ID],
      );

      // Delete user Bob
      await pool.query('DELETE FROM users WHERE id = $1', [USER_B_ID]);

      const remainingMemberships = await pool.query(
        'SELECT count(*) FROM community_members WHERE user_id = $1',
        [USER_B_ID],
      );
      const remainingMessages = await pool.query(
        'SELECT count(*) FROM messages WHERE sender_id = $1',
        [USER_B_ID],
      );

      expect(Number(remainingMemberships.rows[0].count)).toBe(0);
      expect(Number(remainingMessages.rows[0].count)).toBe(0);
    });

    test('sets actor_id to NULL on user deletion in audit_logs (ON DELETE SET NULL)', async () => {
      const auditId = 'b3333333-0000-4000-8000-000000000003';
      await pool.query(
        `INSERT INTO audit_logs (id, community_id, actor_id, action, target_type, target_id)
         VALUES ($1, $2, $3, 'TEST_ACTION', 'community', $2)`,
        [auditId, COMMUNITY_ID, USER_B_ID],
      );

      // Delete actor Bob
      await pool.query('DELETE FROM users WHERE id = $1', [USER_B_ID]);

      const logResult = await pool.query('SELECT actor_id, action FROM audit_logs WHERE id = $1', [auditId]);
      expect(logResult.rows.length).toBe(1);
      expect(logResult.rows[0].actor_id).toBeNull();
      expect(logResult.rows[0].action).toBe('TEST_ACTION');
    });

    test('sets banned_by to NULL on user deletion in community_bans (ON DELETE SET NULL)', async () => {
      await pool.query(
        `INSERT INTO community_bans (community_id, user_id, banned_by, reason)
         VALUES ($1, $2, $3, 'Violation')`,
        [COMMUNITY_ID, USER_B_ID, USER_A_ID],
      );

      // Delete administrator Alice
      await pool.query('DELETE FROM users WHERE id = $1', [USER_A_ID]);

      // Note: deleting Alice cascades to community deletion because Alice owned the community
      const commCheck = await pool.query('SELECT count(*) FROM communities WHERE id = $1', [COMMUNITY_ID]);
      expect(Number(commCheck.rows[0].count)).toBe(0);
    });
  });

  describe('3. Check Constraints & Domain Integrity (SRS §7)', () => {
    test('enforces user status check constraint (online, idle, offline)', async () => {
      await expect(
        pool.query(
          `INSERT INTO users (id, username, email, password_hash, display_name, status)
           VALUES ($1, 'charlie', 'charlie@example.com', 'hash', 'Charlie', 'invisible')`,
          [USER_C_ID],
        ),
      ).rejects.toThrow();
    });

    test('enforces channel type check constraint (text)', async () => {
      await expect(
        pool.query(
          `INSERT INTO channels (id, community_id, name, type)
           VALUES ('c1111111-0000-4000-8000-000000000001', $1, 'voice-channel', 'voice')`,
          [COMMUNITY_ID],
        ),
      ).rejects.toThrow();
    });

    test('enforces community member role check constraint (admin, moderator, member)', async () => {
      // Seed Charlie
      await pool.query(
        `INSERT INTO users (id, username, email, password_hash, display_name)
         VALUES ($1, 'charlie', 'charlie@example.com', 'hash', 'Charlie')`,
        [USER_C_ID],
      );

      await expect(
        pool.query(
          `INSERT INTO community_members (id, community_id, user_id, role)
           VALUES ('c2222222-0000-4000-8000-000000000002', $1, $2, 'superadmin')`,
          [COMMUNITY_ID, USER_C_ID],
        ),
      ).rejects.toThrow();
    });

    test('enforces invite max_uses > 0 check constraint', async () => {
      await expect(
        pool.query(
          `INSERT INTO community_invites (id, community_id, inviter_id, code, max_uses)
           VALUES ('c3333333-0000-4000-8000-000000000003', $1, $2, 'ZERO_USES', 0)`,
          [COMMUNITY_ID, USER_A_ID],
        ),
      ).rejects.toThrow();
    });

    test('enforces direct conversation user ordering constraint (user_a_id < user_b_id)', async () => {
      const [lesserId, greaterId] = [USER_A_ID, USER_B_ID].sort();
      const directConvId = 'c4444444-0000-4000-8000-000000000004';

      // Attempt inverted order
      await expect(
        pool.query(
          `INSERT INTO direct_conversations (id, user_a_id, user_b_id)
           VALUES ($1, $2, $3)`,
          [directConvId, greaterId, lesserId],
        ),
      ).rejects.toThrow();

      // Correct order succeeds
      const result = await pool.query(
        `INSERT INTO direct_conversations (id, user_a_id, user_b_id)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [directConvId, lesserId, greaterId],
      );
      expect(result.rows[0].id).toBe(directConvId);
    });
  });

  describe('4. Transaction Atomic Rollbacks & State Consistency (SRS §7)', () => {
    const sqlOf = (client) => client.query.mock.calls.map(([sql]) => sql.trim().split(/\s+/)[0]);

    test('ModerationRepository.removeMessageWithAudit commits atomically on success', async () => {
      const client = { query: jest.fn(), release: jest.fn() };
      client.query.mockImplementation(async (sql) => {
        if (sql.includes('UPDATE messages')) return { rows: [{ id: MESSAGE_ID }] };
        return { rows: [] };
      });
      const poolMock = { connect: jest.fn().mockResolvedValue(client) };
      const repo = new ModerationRepository(poolMock);

      const result = await repo.removeMessageWithAudit({
        messageId: MESSAGE_ID,
        auditId: '11111111-2222-4333-8444-555555555555',
        communityId: COMMUNITY_ID,
        actorId: USER_A_ID,
        details: { reason: 'Inappropriate content' },
      });

      expect(result).toEqual({ id: MESSAGE_ID });
      expect(sqlOf(client)).toEqual(['BEGIN', 'UPDATE', 'INSERT', 'COMMIT']);
      expect(client.release).toHaveBeenCalledTimes(1);
    });

    test('ModerationRepository.removeMessageWithAudit rolls back message deletion when audit insert fails', async () => {
      const auditFailure = new Error('Audit insert failed');
      const client = { query: jest.fn(), release: jest.fn() };
      client.query.mockImplementation(async (sql) => {
        if (sql.includes('INSERT INTO audit_logs')) throw auditFailure;
        if (sql.includes('UPDATE messages')) return { rows: [{ id: MESSAGE_ID }] };
        return { rows: [] };
      });
      const poolMock = { connect: jest.fn().mockResolvedValue(client) };
      const repo = new ModerationRepository(poolMock);

      await expect(
        repo.removeMessageWithAudit({
          messageId: MESSAGE_ID,
          auditId: '11111111-2222-4333-8444-555555555555',
          communityId: COMMUNITY_ID,
          actorId: USER_A_ID,
          details: { reason: 'Violation' },
        }),
      ).rejects.toBe(auditFailure);

      expect(sqlOf(client)).toEqual(['BEGIN', 'UPDATE', 'INSERT', 'ROLLBACK']);
      expect(client.release).toHaveBeenCalledTimes(1);
    });

    test('ModerationRepository.removeMessageWithAudit rolls back when message is not found or already deleted', async () => {
      const client = { query: jest.fn().mockResolvedValue({ rows: [] }), release: jest.fn() };
      const poolMock = { connect: jest.fn().mockResolvedValue(client) };
      const repo = new ModerationRepository(poolMock);

      const result = await repo.removeMessageWithAudit({
        messageId: MESSAGE_ID,
        auditId: '11111111-2222-4333-8444-555555555555',
        communityId: COMMUNITY_ID,
        actorId: USER_A_ID,
        details: { reason: 'Violation' },
      });

      expect(result).toBeNull();
      expect(sqlOf(client)).toEqual(['BEGIN', 'UPDATE', 'ROLLBACK']);
      expect(client.release).toHaveBeenCalledTimes(1);
    });

    test('MembershipRepository.banMember commits removal and ban insert atomically', async () => {
      const client = { query: jest.fn(), release: jest.fn() };
      client.query.mockImplementation(async (sql) => {
        if (sql.includes('DELETE FROM community_members')) {
          return { rows: [{ id: 'mem1', community_id: COMMUNITY_ID, user_id: USER_B_ID, role: 'member' }] };
        }
        return { rows: [] };
      });
      const poolMock = { connect: jest.fn().mockResolvedValue(client) };
      const repo = new MembershipRepository(poolMock);

      const result = await repo.banMember({
        communityId: COMMUNITY_ID,
        userId: USER_B_ID,
        bannedBy: USER_A_ID,
        reason: 'Violation of rules',
      });

      expect(result).toHaveProperty('user_id', USER_B_ID);
      expect(sqlOf(client)).toEqual(['BEGIN', 'DELETE', 'INSERT', 'COMMIT']);
      expect(client.release).toHaveBeenCalledTimes(1);
    });

    test('MembershipRepository.banMember rolls back member removal if ban record insertion fails', async () => {
      const banInsertError = new Error('Unique ban constraint violation');
      const client = { query: jest.fn(), release: jest.fn() };
      client.query.mockImplementation(async (sql) => {
        if (sql.includes('INSERT INTO community_bans')) throw banInsertError;
        if (sql.includes('DELETE FROM community_members')) {
          return { rows: [{ id: 'mem1', community_id: COMMUNITY_ID, user_id: USER_B_ID, role: 'member' }] };
        }
        return { rows: [] };
      });
      const poolMock = { connect: jest.fn().mockResolvedValue(client) };
      const repo = new MembershipRepository(poolMock);

      await expect(
        repo.banMember({
          communityId: COMMUNITY_ID,
          userId: USER_B_ID,
          bannedBy: USER_A_ID,
          reason: 'Duplicate Ban Attempt',
        }),
      ).rejects.toBe(banInsertError);

      expect(sqlOf(client)).toEqual(['BEGIN', 'DELETE', 'INSERT', 'ROLLBACK']);
      expect(client.release).toHaveBeenCalledTimes(1);
    });

    test('MembershipRepository.banMember rolls back if target member is not found in community', async () => {
      const client = { query: jest.fn().mockResolvedValue({ rows: [] }), release: jest.fn() };
      const poolMock = { connect: jest.fn().mockResolvedValue(client) };
      const repo = new MembershipRepository(poolMock);

      const result = await repo.banMember({
        communityId: COMMUNITY_ID,
        userId: USER_B_ID,
        bannedBy: USER_A_ID,
        reason: 'Member not found',
      });

      expect(result).toBeNull();
      expect(sqlOf(client)).toEqual(['BEGIN', 'DELETE', 'ROLLBACK']);
      expect(client.release).toHaveBeenCalledTimes(1);
    });
  });

  describe('5. Timestamp Convention Verification (UTC & ISO 8601) (SRS §7)', () => {
    test('database table defaults generate valid UTC timestamps', async () => {
      const userRes = await pool.query('SELECT created_at, updated_at FROM users WHERE id = $1', [USER_A_ID]);
      const commRes = await pool.query('SELECT created_at, updated_at FROM communities WHERE id = $1', [COMMUNITY_ID]);
      const chanRes = await pool.query('SELECT created_at, updated_at FROM channels WHERE id = $1', [CHANNEL_ID]);

      const userCreatedAt = new Date(userRes.rows[0].created_at).toISOString();
      const commCreatedAt = new Date(commRes.rows[0].created_at).toISOString();
      const chanCreatedAt = new Date(chanRes.rows[0].created_at).toISOString();

      expect(userCreatedAt).toMatch(ISO_8601_UTC_REGEX);
      expect(userCreatedAt.endsWith('Z')).toBe(true);
      expect(commCreatedAt).toMatch(ISO_8601_UTC_REGEX);
      expect(commCreatedAt.endsWith('Z')).toBe(true);
      expect(chanCreatedAt).toMatch(ISO_8601_UTC_REGEX);
      expect(chanCreatedAt.endsWith('Z')).toBe(true);
    });

    test('API user profile response delivers ISO 8601 UTC timestamp', async () => {
      const token = signToken({ sub: USER_A_ID }, context.authService.jwtSecret);
      const res = await request(app)
        .get('/api/users/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.createdAt).toMatch(ISO_8601_UTC_REGEX);
      expect(res.body.data.createdAt.endsWith('Z')).toBe(true);
    });

    test('API message response delivers ISO 8601 UTC timestamp', async () => {
      const token = signToken({ sub: USER_A_ID }, context.authService.jwtSecret);
      const sendRes = await request(app)
        .post(`/api/channels/${CHANNEL_ID}/messages`)
        .set('Authorization', `Bearer ${token}`)
        .send({ content: 'Hello UTC timestamp check' });

      expect(sendRes.status).toBe(201);
      expect(sendRes.body.data.createdAt).toMatch(ISO_8601_UTC_REGEX);
      expect(sendRes.body.data.createdAt.endsWith('Z')).toBe(true);
    });

    test('API community response delivers ISO 8601 UTC timestamp', async () => {
      const token = signToken({ sub: USER_A_ID }, context.authService.jwtSecret);
      const res = await request(app)
        .post('/api/communities')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Timestamp Verification Community' });

      expect(res.status).toBe(201);
      expect(res.body.data.createdAt).toMatch(ISO_8601_UTC_REGEX);
      expect(res.body.data.createdAt.endsWith('Z')).toBe(true);
    });
  });

  describe('6. Safe Logging & Sensitive Data Protection (SRS §6.3, SRS §7, SEC-10, TC-NF06)', () => {
    let originalConsoleError;
    let loggedErrors;

    beforeEach(() => {
      loggedErrors = [];
      originalConsoleError = console.error;
      console.error = jest.fn((...args) => {
        loggedErrors.push(args);
      });
    });

    afterEach(() => {
      console.error = originalConsoleError;
    });

    test('errorHandler emits structured diagnostic error with correlationId on 500 without exposing secrets', async () => {
      // Temporarily set NODE_ENV to development to test production/development logger
      const prevEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      // Create an endpoint that triggers an internal error with sensitive context
      const crashingApp = createApp({
        authService: context.authService,
        communityService: {
          listForUser: jest.fn().mockImplementation(() => {
            const err = new Error('Database connection failed with password=supersecretpass');
            err.stack = 'SecretStackTrace /var/www/secret/keys';
            throw err;
          }),
        },
        enableRateLimit: false,
      });

      const token = signToken({ sub: USER_A_ID }, context.authService.jwtSecret);
      const res = await request(crashingApp)
        .get('/api/communities')
        .set('Authorization', `Bearer ${token}`);

      process.env.NODE_ENV = prevEnv;

      expect(res.status).toBe(500);
      expect(res.type).toBe('application/problem+json');
      expect(res.body).toHaveProperty('correlationId');
      expect(res.body.code).toBe('INTERNAL_SERVER_ERROR');
      expect(res.body.detail).toBe('An unexpected error occurred. Please try again later.');

      // Response payload must NOT leak internal error message, credentials, or stack trace
      const payloadString = JSON.stringify(res.body);
      expect(payloadString).not.toContain('supersecretpass');
      expect(payloadString).not.toContain('SecretStackTrace');
      expect(payloadString).not.toContain('/var/www/secret/keys');

      // Console error log must contain diagnostic correlationId and error name, but NOT credentials or query text
      expect(loggedErrors.length).toBeGreaterThan(0);
      const logEntry = loggedErrors[0][0];
      expect(logEntry).toHaveProperty('event', 'request_failed');
      expect(logEntry).toHaveProperty('correlationId', res.body.correlationId);
      expect(logEntry).toHaveProperty('errorName', 'Error');

      const logString = JSON.stringify(logEntry);
      expect(logString).not.toContain('supersecretpass');
      expect(logString).not.toContain('SecretStackTrace');
    });

    test('registration and login requests do not expose plaintext password in responses', async () => {
      const plaintextPassword = 'VerySecurePassword987!';
      const regRes = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'dave',
          email: 'dave@example.com',
          password: plaintextPassword,
        });

      expect(regRes.status).toBe(201);
      const regBodyStr = JSON.stringify(regRes.body);
      expect(regBodyStr).not.toContain(plaintextPassword);
      expect(regRes.body.data).not.toHaveProperty('password');
      expect(regRes.body.data).not.toHaveProperty('passwordHash');

      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'dave',
          password: plaintextPassword,
        });

      expect(loginRes.status).toBe(200);
      const loginBodyStr = JSON.stringify(loginRes.body);
      expect(loginBodyStr).not.toContain(plaintextPassword);
      expect(loginRes.body.data.user).not.toHaveProperty('password');
      expect(loginRes.body.data.user).not.toHaveProperty('passwordHash');
    });

    test('audit logs record security and moderation actions without recording secrets or passwords', async () => {
      const auditId = 'e1111111-0000-4000-8000-000000000001';
      await pool.query(
        `INSERT INTO audit_logs (id, community_id, actor_id, action, target_type, target_id, details)
         VALUES ($1, $2, $3, 'MEMBER_BANNED', 'user', $4, $5)`,
        [
          auditId,
          COMMUNITY_ID,
          USER_A_ID,
          USER_B_ID,
          JSON.stringify({ reason: 'Repeated offensive conduct', severity: 'high' }),
        ],
      );

      const auditRow = await pool.query('SELECT * FROM audit_logs WHERE id = $1', [auditId]);
      expect(auditRow.rows.length).toBe(1);

      const record = auditRow.rows[0];
      expect(record.action).toBe('MEMBER_BANNED');
      expect(record.details).toContain('Repeated offensive conduct');

      // Verify no passwords, tokens, or hashes are present in the audit log
      const fullAuditStr = JSON.stringify(record);
      expect(fullAuditStr).not.toContain('password');
      expect(fullAuditStr).not.toContain('Bearer');
      expect(fullAuditStr).not.toContain('secret');
    });
  });
});
