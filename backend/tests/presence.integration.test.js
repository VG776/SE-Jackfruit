const fs = require('fs/promises');
const http = require('http');
const path = require('path');
const { newDb } = require('pg-mem');
const WebSocket = require('ws');
const { createApp } = require('../src/app');
const { ChannelRepository } = require('../src/repositories/channelRepository');
const { ChannelPermissionRepository } = require('../src/repositories/channelPermissionRepository');
const { ChannelService } = require('../src/services/channelService');
const { MessageRepository } = require('../src/repositories/messageRepository');
const { MessageService } = require('../src/services/messageService');
const { createWebSocketGateway, PROTOCOL, presenceMap } = require('../src/realtime/webSocketGateway');

const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const MEMBER_ID = '22222222-2222-4222-8222-222222222222';
const COMMUNITY_ID = '33333333-3333-4333-8333-333333333333';
const CHANNEL_ID = '44444444-4444-4444-8444-444444444444';

describe('US-12: Presence and Typing Indicators (FR-MSG-05)', () => {
  let pool;
  let server;
  let gateway;
  let baseUrl;
  let authService;

  beforeEach(async () => {
    presenceMap.clear();

    const database = newDb();
    const adapter = database.adapters.createPg();
    pool = new adapter.Pool();
    for (const migrationName of [
      '001_create_users.sql',
      '002_create_communities.sql',
      '003_create_channels.sql',
      '004_create_messages.sql',
    ]) {
      const migration = path.resolve(__dirname, `../../database/migrations/${migrationName}`);
      await pool.query(await fs.readFile(migration, 'utf8'));
    }
    await pool.query(
      `INSERT INTO users (id, username, email, password_hash, display_name)
       VALUES ($1, 'owner', 'owner@example.com', 'hash', 'Owner'),
              ($2, 'member', 'member@example.com', 'hash', 'Member')`,
      [OWNER_ID, MEMBER_ID],
    );
    await pool.query(
      'INSERT INTO communities (id, owner_id, name) VALUES ($1, $2, $3)',
      [COMMUNITY_ID, OWNER_ID, 'Community'],
    );
    await pool.query(
      `INSERT INTO community_members (id, community_id, user_id, role)
       VALUES ('55555555-5555-4555-8555-555555555555', $1, $2, 'member')`,
      [COMMUNITY_ID, MEMBER_ID],
    );
    await pool.query(
      'INSERT INTO channels (id, community_id, name) VALUES ($1, $2, $3)',
      [CHANNEL_ID, COMMUNITY_ID, 'general'],
    );

    authService = {
      authenticateToken: jest.fn(async (token) => {
        if (token === 'owner-token') return { id: OWNER_ID };
        if (token === 'member-token') return { id: MEMBER_ID };
        const error = new Error('Invalid token');
        error.status = 401;
        throw error;
      }),
    };
    const channelService = new ChannelService(
      new ChannelRepository(pool),
      new ChannelPermissionRepository(pool),
    );
    const messageRepository = new MessageRepository(pool);
    const messageService = new MessageService(messageRepository, channelService);

    server = http.createServer(createApp({ authService }));
    gateway = createWebSocketGateway(server, { authService, channelService, messageService });
    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    baseUrl = `ws://127.0.0.1:${server.address().port}/api/ws`;
  });

  afterEach(async () => {
    gateway.clients.forEach((client) => client.terminate());
    gateway.close();
    await new Promise((resolve) => {
      server.close(resolve);
    });
    await pool.end();
  });

  function connect(token) {
    return new WebSocket(baseUrl, [PROTOCOL, `bearer.${token}`]);
  }

  function nextMessage(socket) {
    return new Promise((resolve, reject) => {
      socket.once('message', (message) => resolve(JSON.parse(message.toString())));
      socket.once('error', reject);
    });
  }

  test('broadcasts PRESENCE_UPDATE with status online when user connects', async () => {
    const socket = connect('owner-token');
    const msg = await nextMessage(socket);

    expect(msg).toEqual({
      type: 'PRESENCE_UPDATE',
      payload: {
        userId: OWNER_ID,
        status: 'online',
        updatedAt: expect.any(String),
      },
    });
    socket.close();
  });

  test('broadcasts PRESENCE_UPDATE with status offline when user disconnects', async () => {
    const socket = connect('owner-token');
    await nextMessage(socket);

    const observer = connect('member-token');
    await nextMessage(observer);

    const offlinePromise = nextMessage(observer);
    socket.close();

    const msg = await offlinePromise;
    expect(msg).toEqual({
      type: 'PRESENCE_UPDATE',
      payload: {
        userId: OWNER_ID,
        status: 'offline',
        updatedAt: expect.any(String),
      },
    });
    observer.close();
  });

  test('SET_PRESENCE updates presence and broadcasts to all connected clients', async () => {
    const socket = connect('owner-token');
    await nextMessage(socket);

    const observer = connect('member-token');
    await nextMessage(observer);
    await nextMessage(socket); // drain observer's online message delivered to socket

    const ownerReceived = nextMessage(socket);
    const observerReceived = nextMessage(observer);
    socket.send(JSON.stringify({ type: 'SET_PRESENCE', payload: { status: 'idle' } }));

    const [ownerMsg, observerMsg] = await Promise.all([ownerReceived, observerReceived]);

    expect(ownerMsg).toEqual({
      type: 'PRESENCE_UPDATE',
      payload: { userId: OWNER_ID, status: 'idle', updatedAt: expect.any(String) },
    });
    expect(observerMsg).toEqual({
      type: 'PRESENCE_UPDATE',
      payload: { userId: OWNER_ID, status: 'idle', updatedAt: expect.any(String) },
    });

    socket.close();
    observer.close();
  });

  test('SET_PRESENCE with invalid status sends ERROR', async () => {
    const socket = connect('owner-token');
    await nextMessage(socket);

    const errorPromise = nextMessage(socket);
    socket.send(JSON.stringify({ type: 'SET_PRESENCE', payload: { status: 'invisible' } }));

    const msg = await errorPromise;
    expect(msg).toMatchObject({
      type: 'ERROR',
      code: 'INVALID_EVENT',
    });
    socket.close();
  });

  test('TYPING_START broadcasts TYPING event to channel members who joined', async () => {
    const owner = connect('owner-token');
    await nextMessage(owner);

    const ownerJoined = nextMessage(owner);
    owner.send(JSON.stringify({ type: 'JOIN_CHANNEL', payload: { channelId: CHANNEL_ID } }));
    await ownerJoined;

    const member = connect('member-token');
    await nextMessage(member);

    const memberJoined = nextMessage(member);
    member.send(JSON.stringify({ type: 'JOIN_CHANNEL', payload: { channelId: CHANNEL_ID } }));
    await memberJoined;

    const typingPromise = nextMessage(member);
    owner.send(JSON.stringify({ type: 'TYPING_START', payload: { channelId: CHANNEL_ID } }));

    const msg = await typingPromise;
    expect(msg).toEqual({
      type: 'TYPING',
      payload: { userId: OWNER_ID, channelId: CHANNEL_ID, typing: true },
    });

    owner.close();
    member.close();
  });

  test('TYPING_START does NOT send TYPING to users not in that channel', async () => {
    const owner = connect('owner-token');
    await nextMessage(owner);

    const ownerJoined = nextMessage(owner);
    owner.send(JSON.stringify({ type: 'JOIN_CHANNEL', payload: { channelId: CHANNEL_ID } }));
    await ownerJoined;

    const member = connect('member-token');
    await nextMessage(member);

    owner.send(JSON.stringify({ type: 'TYPING_START', payload: { channelId: CHANNEL_ID } }));

    const unexpected = await Promise.race([
      nextMessage(member),
      new Promise((resolve) => {
        setTimeout(() => resolve(null), 300);
      }),
    ]);

    expect(unexpected).toBeNull();

    owner.close();
    member.close();
  });

  test('TYPING_START does NOT echo back to sender', async () => {
    const owner = connect('owner-token');
    await nextMessage(owner);

    const ownerJoined = nextMessage(owner);
    owner.send(JSON.stringify({ type: 'JOIN_CHANNEL', payload: { channelId: CHANNEL_ID } }));
    await ownerJoined;

    owner.send(JSON.stringify({ type: 'TYPING_START', payload: { channelId: CHANNEL_ID } }));

    const unexpected = await Promise.race([
      nextMessage(owner),
      new Promise((resolve) => {
        setTimeout(() => resolve(null), 300);
      }),
    ]);

    expect(unexpected).toBeNull();

    owner.close();
  });

  test('TYPING_STOP broadcasts TYPING with typing:false', async () => {
    const owner = connect('owner-token');
    await nextMessage(owner);

    const ownerJoined = nextMessage(owner);
    owner.send(JSON.stringify({ type: 'JOIN_CHANNEL', payload: { channelId: CHANNEL_ID } }));
    await ownerJoined;

    const member = connect('member-token');
    await nextMessage(member);

    const memberJoined = nextMessage(member);
    member.send(JSON.stringify({ type: 'JOIN_CHANNEL', payload: { channelId: CHANNEL_ID } }));
    await memberJoined;

    const typingPromise = nextMessage(member);
    owner.send(JSON.stringify({ type: 'TYPING_STOP', payload: { channelId: CHANNEL_ID } }));

    const msg = await typingPromise;
    expect(msg).toEqual({
      type: 'TYPING',
      payload: { userId: OWNER_ID, channelId: CHANNEL_ID, typing: false },
    });

    owner.close();
    member.close();
  });

  test('TYPING_START requires user to have joined the channel first', async () => {
    const owner = connect('owner-token');
    await nextMessage(owner);

    const errorPromise = nextMessage(owner);
    owner.send(JSON.stringify({ type: 'TYPING_START', payload: { channelId: CHANNEL_ID } }));

    const msg = await errorPromise;
    expect(msg).toMatchObject({
      type: 'ERROR',
      code: 'NOT_IN_CHANNEL',
    });

    owner.close();
  });
});
