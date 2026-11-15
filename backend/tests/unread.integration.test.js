const fs = require('fs/promises');
const path = require('path');
const { newDb } = require('pg-mem');
const request = require('supertest');
const { createApp } = require('../src/app');
const { ChannelPermissionRepository } = require('../src/repositories/channelPermissionRepository');
const { ChannelRepository } = require('../src/repositories/channelRepository');
const { MessageRepository } = require('../src/repositories/messageRepository');
const { UnreadRepository } = require('../src/repositories/unreadRepository');
const { UserRepository } = require('../src/repositories/userRepository');
const { AuthService } = require('../src/services/authService');
const { ChannelService } = require('../src/services/channelService');
const { MessageService } = require('../src/services/messageService');
const { UnreadService } = require('../src/services/unreadService');
const { signToken } = require('../src/utils/token');

const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const MEMBER_ID = '22222222-2222-4222-8222-222222222222';
const OUTSIDER_ID = '33333333-3333-4333-8333-333333333333';
const COMMUNITY_ID = '44444444-4444-4444-8444-444444444444';
const CHANNEL_ID = '55555555-5555-4555-8555-555555555555';
const OTHER_CHANNEL_ID = '66666666-6666-4666-8666-666666666666';
const migrationNames = [
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
];

describe('US-15 unread counts and read state (FR-UX-03)', () => {
  let app;
  let pool;
  let memberToken;
  let outsiderToken;
  let messageRepository;

  beforeEach(async () => {
    const database = newDb();
    const adapter = database.adapters.createPg();
    pool = new adapter.Pool();
    for (const name of migrationNames) {
      const file = path.resolve(__dirname, `../../database/migrations/${name}`);
      await pool.query(await fs.readFile(file, 'utf8'));
    }

    await pool.query(
      `INSERT INTO users (id, username, email, password_hash, display_name)
       VALUES ($1, 'owner', 'owner@example.com', 'hash', 'Owner'),
              ($2, 'member', 'member@example.com', 'hash', 'Member'),
              ($3, 'outsider', 'outsider@example.com', 'hash', 'Outsider')`,
      [OWNER_ID, MEMBER_ID, OUTSIDER_ID],
    );
    await pool.query(
      'INSERT INTO communities (id, owner_id, name) VALUES ($1, $2, $3)',
      [COMMUNITY_ID, OWNER_ID, 'Unread tests'],
    );
    await pool.query(
      `INSERT INTO community_members (id, community_id, user_id, role)
       VALUES ('77777777-7777-4777-8777-777777777777', $1, $2, 'member')`,
      [COMMUNITY_ID, MEMBER_ID],
    );
    await pool.query(
      `INSERT INTO channels (id, community_id, name)
       VALUES ($1, $2, 'general'), ($3, $2, 'random')`,
      [CHANNEL_ID, COMMUNITY_ID, OTHER_CHANNEL_ID],
    );

    const authService = new AuthService(new UserRepository(pool));
    const channelService = new ChannelService(
      new ChannelRepository(pool),
      new ChannelPermissionRepository(pool),
    );
    messageRepository = new MessageRepository(pool);
    const unreadService = new UnreadService(new UnreadRepository(pool), channelService);
    app = createApp({
      authService,
      channelService,
      messageService: new MessageService(messageRepository, channelService),
      unreadService,
      enableRateLimit: false,
    });
    memberToken = signToken({ sub: MEMBER_ID }, authService.jwtSecret);
    outsiderToken = signToken({ sub: OUTSIDER_ID }, authService.jwtSecret);
  });

  afterEach(async () => {
    await pool.end();
  });

  async function sendMessage(id, senderId, channelId, content) {
    return messageRepository.create({ id, senderId, channelId, content });
  }

  test('returns persisted unread counts only for channels the user can access', async () => {
    await sendMessage('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', OWNER_ID, CHANNEL_ID, 'First');
    await sendMessage('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', MEMBER_ID, CHANNEL_ID, 'Own message');
    await sendMessage('cccccccc-cccc-4ccc-8ccc-cccccccccccc', OWNER_ID, OTHER_CHANNEL_ID, 'Other channel');

    const response = await request(app)
      .get('/api/unread-counts')
      .set('Authorization', `Bearer ${memberToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      totalUnreadCount: 2,
      channels: [
        { channelId: CHANNEL_ID, unreadCount: 1 },
        { channelId: OTHER_CHANNEL_ID, unreadCount: 1 },
      ],
    });
  });

  test('marking a channel read advances the durable cursor and only later incoming messages become unread', async () => {
    const older = await sendMessage(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', OWNER_ID, CHANNEL_ID, 'Older incoming',
    );
    await sendMessage('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', MEMBER_ID, CHANNEL_ID, 'Own message');

    const marked = await request(app)
      .post(`/api/channels/${CHANNEL_ID}/read`)
      .set('Authorization', `Bearer ${memberToken}`);

    expect(marked.status).toBe(200);
    expect(marked.body.data).toMatchObject({
      channelId: CHANNEL_ID,
      lastReadMessageId: expect.any(String),
      unreadCount: 0,
    });
    expect(marked.body.data.lastReadMessageId).toBe('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');

    await sendMessage('cccccccc-cccc-4ccc-8ccc-cccccccccccc', OWNER_ID, CHANNEL_ID, 'New incoming');
    const counts = await request(app)
      .get('/api/unread-counts')
      .set('Authorization', `Bearer ${memberToken}`);
    expect(counts.body.data.channels.find((entry) => entry.channelId === CHANNEL_ID).unreadCount)
      .toBe(1);
    expect(older.id).not.toBe(marked.body.data.lastReadMessageId);
  });

  test('requires authentication and prevents non-members from marking a channel read', async () => {
    const anonymous = await request(app).get('/api/unread-counts');
    const denied = await request(app)
      .post(`/api/channels/${CHANNEL_ID}/read`)
      .set('Authorization', `Bearer ${outsiderToken}`);

    expect(anonymous.status).toBe(401);
    expect(denied.status).toBe(404);
    expect(denied.body.code).toBe('CHANNEL_NOT_FOUND');
    const state = await pool.query('SELECT * FROM channel_read_states WHERE channel_id = $1', [CHANNEL_ID]);
    expect(state.rows).toHaveLength(0);
  });
});
