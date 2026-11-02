const fs = require('fs/promises');
const http = require('http');
const path = require('path');
const { newDb } = require('pg-mem');
const WebSocket = require('ws');
const { createApp } = require('../src/app');
const { ChannelRepository } = require('../src/repositories/channelRepository');
const { ChannelPermissionRepository } = require('../src/repositories/channelPermissionRepository');
const { ChannelService } = require('../src/services/channelService');
const { createWebSocketGateway, PROTOCOL } = require('../src/realtime/webSocketGateway');

const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const MEMBER_ID = '22222222-2222-4222-8222-222222222222';
const COMMUNITY_ID = '33333333-3333-4333-8333-333333333333';
const CHANNEL_ID = '44444444-4444-4444-8444-444444444444';

describe('US-07 WebSocket permission enforcement', () => {
  let pool;
  let server;
  let gateway;
  let baseUrl;
  let authService;

  beforeEach(async () => {
    const database = newDb();
    const adapter = database.adapters.createPg();
    pool = new adapter.Pool();
    for (const migrationName of ['001_create_users.sql', '002_create_communities.sql', '003_create_channels.sql']) {
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
    server = http.createServer(createApp({ authService }));
    gateway = createWebSocketGateway(server, { authService, channelService });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `ws://127.0.0.1:${server.address().port}/api/ws`;
  });

  afterEach(async () => {
    gateway.clients.forEach((client) => client.terminate());
    gateway.close();
    await new Promise((resolve) => server.close(resolve));
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

  test('rejects a connection without a valid token during the handshake', async () => {
    const socket = new WebSocket(baseUrl, PROTOCOL);
    socket.on('error', () => {});
    const response = await new Promise((resolve) => socket.once('unexpected-response', (_request, result) => resolve(result)));
    expect(response.statusCode).toBe(401);
  });

  test('rejects an invalid token during the handshake', async () => {
    const socket = connect('invalid-token');
    socket.on('error', () => {});
    const response = await new Promise((resolve) => socket.once('unexpected-response', (_request, result) => resolve(result)));
    expect(response.statusCode).toBe(401);
  });

  test.each([
    ['community owner', 'owner-token'],
    ['community member', 'member-token'],
  ])('allows an authenticated %s to join an accessible channel', async (_role, token) => {
    const socket = connect(token);
    await new Promise((resolve) => socket.once('open', resolve));
    const message = nextMessage(socket);
    socket.send(JSON.stringify({ type: 'JOIN_CHANNEL', payload: { channelId: CHANNEL_ID } }));
    await expect(message).resolves.toEqual({ type: 'ACK', event: 'JOIN_CHANNEL', channelId: CHANNEL_ID });
    expect(authService.authenticateToken).toHaveBeenCalledTimes(2);
    socket.close();
  });

  test('authorizes channel leave events before removing the subscription', async () => {
    const socket = connect('owner-token');
    await new Promise((resolve) => socket.once('open', resolve));
    const joined = nextMessage(socket);
    socket.send(JSON.stringify({ type: 'JOIN_CHANNEL', payload: { channelId: CHANNEL_ID } }));
    await joined;
    const left = nextMessage(socket);
    socket.send(JSON.stringify({ type: 'LEAVE_CHANNEL', payload: { channelId: CHANNEL_ID } }));

    await expect(left).resolves.toEqual({ type: 'ACK', event: 'LEAVE_CHANNEL', channelId: CHANNEL_ID });
    expect(authService.authenticateToken).toHaveBeenCalledTimes(3);
    socket.close();
  });

  test('denies a non-member the same way as a missing channel and does not join it', async () => {
    const outsiderId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    authService.authenticateToken.mockImplementation(async (token) => {
      if (token === 'outsider-token') return { id: outsiderId };
      if (token === 'owner-token') return { id: OWNER_ID };
      if (token === 'member-token') return { id: MEMBER_ID };
      const error = new Error('Invalid token');
      error.status = 401;
      throw error;
    });
    const socket = connect('outsider-token');
    await new Promise((resolve) => socket.once('open', resolve));

    const denied = nextMessage(socket);
    socket.send(JSON.stringify({ type: 'JOIN_CHANNEL', payload: { channelId: CHANNEL_ID } }));
    const missing = nextMessage(socket);
    socket.send(JSON.stringify({ type: 'JOIN_CHANNEL', payload: { channelId: '66666666-6666-4666-8666-666666666666' } }));

    const [deniedResult, missingResult] = await Promise.all([denied, missing]);
    expect(deniedResult).toEqual(missingResult);
    expect(deniedResult).toMatchObject({ type: 'ERROR', code: 'RESOURCE_NOT_FOUND' });
    const serverSocket = [...gateway.clients][0];
    expect(serverSocket.channels.has(CHANNEL_ID)).toBe(false);
    socket.close();
  });

  test('revalidates authentication before processing each event', async () => {
    const socket = connect('owner-token');
    await new Promise((resolve) => socket.once('open', resolve));
    authService.authenticateToken.mockRejectedValueOnce(Object.assign(new Error('Revoked'), { status: 401 }));

    const closed = new Promise((resolve) => socket.once('close', resolve));
    const message = nextMessage(socket);
    socket.send(JSON.stringify({ type: 'JOIN_CHANNEL', payload: { channelId: CHANNEL_ID } }));
    await expect(message).resolves.toMatchObject({ type: 'ERROR', code: 'UNAUTHORIZED' });
    await closed;
    expect(socket.readyState).toBe(WebSocket.CLOSED);
  });
});
