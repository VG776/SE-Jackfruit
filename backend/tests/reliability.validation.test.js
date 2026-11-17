const fs = require('fs/promises');
const http = require('http');
const path = require('path');
const { newDb } = require('pg-mem');
const request = require('supertest');
const WebSocket = require('ws');
const { createApp } = require('../src/app');
const { ChannelRepository } = require('../src/repositories/channelRepository');
const { ChannelPermissionRepository } = require('../src/repositories/channelPermissionRepository');
const { ChannelService } = require('../src/services/channelService');
const { MessageRepository } = require('../src/repositories/messageRepository');
const { MessageService } = require('../src/services/messageService');
const { createWebSocketGateway, PROTOCOL } = require('../src/realtime/webSocketGateway');

const ALICE_ID = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const BOB_ID = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';
const COMMUNITY_ID = 'cccccccc-3333-4333-8333-cccccccccccc';
const CHANNEL_ID = 'dddddddd-4444-4444-8444-dddddddddddd';

describe('NFR-03: Verify Reliability, Reconnection, and Deduplication Behaviour (SRS §6.4, TC-NF04, TC-NF05)', () => {
  let pool;
  let server;
  let gateway;
  let baseUrl;
  let authService;
  let messageService;
  let app;

  beforeEach(async () => {
    const database = newDb();
    const adapter = database.adapters.createPg();
    pool = new adapter.Pool();

    for (const migrationName of [
      '001_create_users.sql',
      '002_create_communities.sql',
      '003_create_channels.sql',
      '004_create_messages.sql',
      '007_add_message_soft_delete.sql',
    ]) {
      const migration = path.resolve(__dirname, `../../database/migrations/${migrationName}`);
      await pool.query(await fs.readFile(migration, 'utf8'));
    }

    await pool.query(
      `INSERT INTO users (id, username, email, password_hash, display_name)
       VALUES ($1, 'alice', 'alice@example.com', 'hash', 'Alice'),
              ($2, 'bob', 'bob@example.com', 'hash', 'Bob')`,
      [ALICE_ID, BOB_ID],
    );

    await pool.query(
      'INSERT INTO communities (id, owner_id, name) VALUES ($1, $2, $3)',
      [COMMUNITY_ID, ALICE_ID, 'Reliability Community'],
    );

    await pool.query(
      `INSERT INTO community_members (id, community_id, user_id, role)
       VALUES ('11111111-1111-4111-8111-111111111111', $1, $2, 'admin'),
              ('22222222-2222-4222-8222-222222222222', $1, $3, 'member')`,
      [COMMUNITY_ID, ALICE_ID, BOB_ID],
    );

    await pool.query(
      'INSERT INTO channels (id, community_id, name) VALUES ($1, $2, $3)',
      [CHANNEL_ID, COMMUNITY_ID, 'general'],
    );

    authService = {
      authenticateToken: jest.fn(async (token) => {
        if (token === 'alice-token') return { id: ALICE_ID, username: 'alice' };
        if (token === 'bob-token') return { id: BOB_ID, username: 'bob' };
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
    messageService = new MessageService(messageRepository, channelService);

    app = createApp({ authService, channelService, messageService });
    server = http.createServer(app);
    gateway = createWebSocketGateway(server, {
      authService,
      channelService,
      messageService,
    });

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

  function nextMessage(socket, predicate = () => true) {
    return new Promise((resolve, reject) => {
      const onMessage = (message) => {
        const parsed = JSON.parse(message.toString());
        if (predicate(parsed)) {
          socket.off('message', onMessage);
          socket.off('error', onError);
          resolve(parsed);
        }
      };
      const onError = (error) => {
        socket.off('message', onMessage);
        reject(error);
      };
      socket.on('message', onMessage);
      socket.once('error', onError);
    });
  }

  describe('1. Connection Interruption and Reconnection Recovery (AC 1, AC 6)', () => {
    test('client reconnects successfully after an abrupt connection loss and rejoins channel', async () => {
      let client = connect('bob-token');
      await new Promise((resolve) => client.once('open', resolve));

      client.send(JSON.stringify({ type: 'JOIN_CHANNEL', payload: { channelId: CHANNEL_ID } }));
      const initialAck = await nextMessage(client, (m) => m.type === 'ACK');
      expect(initialAck.channelId).toBe(CHANNEL_ID);

      // Simulate unexpected network termination
      client.terminate();
      await new Promise((resolve) => client.once('close', resolve));

      // Client performs reconnection
      client = connect('bob-token');
      await new Promise((resolve) => client.once('open', resolve));

      client.send(JSON.stringify({ type: 'JOIN_CHANNEL', payload: { channelId: CHANNEL_ID } }));
      const reconnectAck = await nextMessage(client, (m) => m.type === 'ACK');
      expect(reconnectAck.channelId).toBe(CHANNEL_ID);

      client.close();
    });
  });

  describe('2. Message Persistence and Retrieval Across Disconnects (AC 2, TC-NF04, FR-MSG-02)', () => {
    test('persisted messages sent while a client is offline are fully recovered without data loss', async () => {
      const alice = connect('alice-token');
      let bob = connect('bob-token');
      await Promise.all([
        new Promise((resolve) => alice.once('open', resolve)),
        new Promise((resolve) => bob.once('open', resolve)),
      ]);

      // Both join channel
      alice.send(JSON.stringify({ type: 'JOIN_CHANNEL', payload: { channelId: CHANNEL_ID } }));
      bob.send(JSON.stringify({ type: 'JOIN_CHANNEL', payload: { channelId: CHANNEL_ID } }));
      await Promise.all([
        nextMessage(alice, (m) => m.type === 'ACK'),
        nextMessage(bob, (m) => m.type === 'ACK'),
      ]);

      // Message 1 sent while Bob is online
      alice.send(JSON.stringify({
        type: 'SEND_MESSAGE',
        payload: { channelId: CHANNEL_ID, content: 'Message 1 before disconnect' },
      }));
      await nextMessage(bob, (m) => m.type === 'MESSAGE_CREATED');

      // Bob disconnects (network loss)
      bob.terminate();
      await new Promise((resolve) => bob.once('close', resolve));

      // Alice sends Message 2 and Message 3 while Bob is offline
      alice.send(JSON.stringify({
        type: 'SEND_MESSAGE',
        payload: { channelId: CHANNEL_ID, content: 'Message 2 while offline' },
      }));
      await nextMessage(alice, (m) => m.type === 'ACK' && m.event === 'SEND_MESSAGE');

      alice.send(JSON.stringify({
        type: 'SEND_MESSAGE',
        payload: { channelId: CHANNEL_ID, content: 'Message 3 while offline' },
      }));
      await nextMessage(alice, (m) => m.type === 'ACK' && m.event === 'SEND_MESSAGE');

      // Bob reconnects
      bob = connect('bob-token');
      await new Promise((resolve) => bob.once('open', resolve));
      bob.send(JSON.stringify({ type: 'JOIN_CHANNEL', payload: { channelId: CHANNEL_ID } }));
      await nextMessage(bob, (m) => m.type === 'ACK');

      // Bob retrieves channel history via REST API to catch up
      const historyRes = await request(app)
        .get(`/api/channels/${CHANNEL_ID}/messages`)
        .set('Authorization', 'Bearer bob-token');

      expect(historyRes.status).toBe(200);
      const retrieved = historyRes.body.data.messages;
      expect(retrieved).toHaveLength(3);
      expect(retrieved[0].content).toBe('Message 1 before disconnect');
      expect(retrieved[1].content).toBe('Message 2 while offline');
      expect(retrieved[2].content).toBe('Message 3 while offline');

      // Check chronological ordering and no duplicates
      const ids = retrieved.map((m) => m.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(3);

      alice.close();
      bob.close();
    });
  });

  describe('3. Presence Updates on Connection Loss and Recovery (AC 3, FR-MSG-05)', () => {
    test('broadcasts online on connect, offline on disconnect, and online on reconnect', async () => {
      const observer = connect('alice-token');
      await new Promise((resolve) => observer.once('open', resolve));

      // Bob connects -> Observer sees Bob online
      const bobOnlinePromise = nextMessage(
        observer,
        (m) => m.type === 'PRESENCE_UPDATE' && m.payload.userId === BOB_ID && m.payload.status === 'online',
      );
      const bob = connect('bob-token');
      await bobOnlinePromise;

      // Bob disconnects -> Observer sees Bob offline
      const bobOfflinePromise = nextMessage(
        observer,
        (m) => m.type === 'PRESENCE_UPDATE' && m.payload.userId === BOB_ID && m.payload.status === 'offline',
      );
      bob.terminate();
      await bobOfflinePromise;

      // Bob reconnects -> Observer sees Bob online again
      const bobReconnectedPromise = nextMessage(
        observer,
        (m) => m.type === 'PRESENCE_UPDATE' && m.payload.userId === BOB_ID && m.payload.status === 'online',
      );
      const bob2 = connect('bob-token');
      await bobReconnectedPromise;

      observer.close();
      bob2.close();
    });
  });

  describe('4. Concurrent Submissions and Idempotent Timeline Deduplication (AC 4, TC-NF05)', () => {
    test('handles concurrent message sends from multiple clients without loss or corruption', async () => {
      const alice = connect('alice-token');
      const bob = connect('bob-token');
      await Promise.all([
        new Promise((resolve) => alice.once('open', resolve)),
        new Promise((resolve) => bob.once('open', resolve)),
      ]);

      alice.send(JSON.stringify({ type: 'JOIN_CHANNEL', payload: { channelId: CHANNEL_ID } }));
      bob.send(JSON.stringify({ type: 'JOIN_CHANNEL', payload: { channelId: CHANNEL_ID } }));
      await Promise.all([
        nextMessage(alice, (m) => m.type === 'ACK'),
        nextMessage(bob, (m) => m.type === 'ACK'),
      ]);

      // Simultaneous submissions from both clients
      const sends = [
        messageService.sendMessage(ALICE_ID, CHANNEL_ID, { content: 'Simultaneous message from Alice' }),
        messageService.sendMessage(BOB_ID, CHANNEL_ID, { content: 'Simultaneous message from Bob' }),
      ];

      const [msgAlice, msgBob] = await Promise.all(sends);
      expect(msgAlice.id).toBeDefined();
      expect(msgBob.id).toBeDefined();
      expect(msgAlice.id).not.toBe(msgBob.id);

      // Verify all concurrent messages exist in history without corruption
      const history = await messageService.getChannelHistory(ALICE_ID, CHANNEL_ID);
      expect(history.messages.length).toBe(2);
      const contents = history.messages.map((m) => m.content);
      expect(contents).toContain('Simultaneous message from Alice');
      expect(contents).toContain('Simultaneous message from Bob');

      alice.close();
      bob.close();
    });

    test('re-fetching history merges into client view map without creating duplicate entries', async () => {
      // Simulate client Map-based timeline store
      const clientTimeline = new Map();

      // First batch
      const res1 = await messageService.sendMessage(ALICE_ID, CHANNEL_ID, { content: 'First entry' });
      clientTimeline.set(res1.id, res1);

      // Client re-fetches history after network reconnect
      const history = await messageService.getChannelHistory(ALICE_ID, CHANNEL_ID);
      for (const msg of history.messages) {
        clientTimeline.set(msg.id, msg);
      }

      // Re-adding existing messages into Map produces exactly 1 entry
      expect(clientTimeline.size).toBe(1);
      expect(clientTimeline.get(res1.id).content).toBe('First entry');
    });
  });

  describe('5. Error Handling During Failure States (AC 5)', () => {
    test('rejects connection upgrade when token is missing or invalid with 401', async () => {
      const unauthorizedSocket = new WebSocket(baseUrl, [PROTOCOL, 'bearer.bad-token']);
      const closed = await new Promise((resolve) => {
        unauthorizedSocket.on('error', () => {});
        unauthorizedSocket.on('unexpected-response', (_req, res) => {
          resolve(res.statusCode);
        });
      });
      expect(closed).toBe(401);
    });

    test('returns structured error event when malformed JSON or unsupported event is sent', async () => {
      const client = connect('alice-token');
      await new Promise((resolve) => client.once('open', resolve));

      // Malformed JSON
      client.send('NOT_VALID_JSON');
      const jsonError = await nextMessage(client, (m) => m.type === 'ERROR');
      expect(jsonError.code).toBe('INVALID_EVENT');

      // Unsupported event type
      client.send(JSON.stringify({ type: 'UNKNOWN_ACTION', payload: {} }));
      const typeError = await nextMessage(client, (m) => m.type === 'ERROR');
      expect(typeError.code).toBe('UNSUPPORTED_EVENT');

      client.close();
    });

    test('returns error when attempting to join a non-existent or inaccessible channel', async () => {
      const client = connect('alice-token');
      await new Promise((resolve) => client.once('open', resolve));

      const fakeChannelId = '99999999-9999-4999-8999-999999999999';
      client.send(JSON.stringify({ type: 'JOIN_CHANNEL', payload: { channelId: fakeChannelId } }));
      const errorMsg = await nextMessage(client, (m) => m.type === 'ERROR');
      expect(['RESOURCE_NOT_FOUND', 'CHANNEL_NOT_FOUND']).toContain(errorMsg.code);

      client.close();
    });
  });
});
