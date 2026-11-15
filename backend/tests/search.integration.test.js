const fs = require('fs/promises');
const path = require('path');
const { newDb } = require('pg-mem');
const request = require('supertest');
const { createApp } = require('../src/app');
const { AuthService } = require('../src/services/authService');
const { UserRepository } = require('../src/repositories/userRepository');
const { SearchRepository } = require('../src/repositories/searchRepository');
const { SearchService } = require('../src/services/searchService');

const migrations = [
  path.resolve(__dirname, '../../database/migrations/001_create_users.sql'),
  path.resolve(__dirname, '../../database/migrations/002_create_communities.sql'),
  path.resolve(__dirname, '../../database/migrations/003_create_channels.sql'),
  path.resolve(__dirname, '../../database/migrations/004_create_messages.sql'),
  path.resolve(__dirname, '../../database/migrations/005_index_message_history.sql'),
  path.resolve(__dirname, '../../database/migrations/006_create_community_invites.sql'),
  path.resolve(__dirname, '../../database/migrations/007_add_message_soft_delete.sql'),
  path.resolve(__dirname, '../../database/migrations/007_create_direct_messages.sql'),
  path.resolve(__dirname, '../../database/migrations/008_create_message_reactions.sql'),
];

// Documented evaluation dataset fixtures
const ALICE_ID = '11111111-1111-4111-8111-111111111111';
const BOB_ID = '22222222-2222-4222-8222-222222222222';
const CHARLIE_OUTSIDER_ID = '33333333-3333-4333-8333-333333333333';

const PUBLIC_COMMUNITY_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PRIVATE_COMMUNITY_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const PUB_CHANNEL_GENERAL_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const PUB_CHANNEL_DEV_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const PRIV_CHANNEL_SECRET_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

async function buildTestContext() {
  const database = newDb();
  const adapter = database.adapters.createPg();
  const pool = new adapter.Pool();

  for (const migration of migrations) {
    await pool.query(await fs.readFile(migration, 'utf8'));
  }

  // 1. Insert Users
  await pool.query(
    `INSERT INTO users (id, username, email, password_hash, display_name)
     VALUES
       ($1, 'alice_dev', 'alice@example.com', 'hash', 'Alice Dev'),
       ($2, 'bob_member', 'bob@example.com', 'hash', 'Bob Member'),
       ($3, 'charlie_outsider', 'charlie@example.com', 'hash', 'Charlie Outsider')`,
    [ALICE_ID, BOB_ID, CHARLIE_OUTSIDER_ID],
  );

  // 2. Insert Communities
  // Alice owns Public Community; Bob is an added member. Charlie is NOT a member.
  await pool.query(
    `INSERT INTO communities (id, owner_id, name, description)
     VALUES
       ($1, $2, 'Public Engineers', 'Public engineering community'),
       ($3, $4, 'Private Ops', 'Private operations community')`,
    [PUBLIC_COMMUNITY_ID, ALICE_ID, PRIVATE_COMMUNITY_ID, ALICE_ID],
  );

  // Bob is a member of Public Community only
  await pool.query(
    `INSERT INTO community_members (id, community_id, user_id, role)
     VALUES ('99999999-9999-4999-8999-999999999999', $1, $2, 'member')`,
    [PUBLIC_COMMUNITY_ID, BOB_ID],
  );

  // 3. Insert Channels
  await pool.query(
    `INSERT INTO channels (id, community_id, name, type)
     VALUES
       ($1, $2, 'general', 'text'),
       ($3, $2, 'dev-ops', 'text'),
       ($4, $5, 'classified-announcements', 'text')`,
    [
      PUB_CHANNEL_GENERAL_ID,
      PUBLIC_COMMUNITY_ID,
      PUB_CHANNEL_DEV_ID,
      PRIV_CHANNEL_SECRET_ID,
      PRIVATE_COMMUNITY_ID,
    ],
  );

  // 4. Populate Documented Evaluation Dataset Messages
  // Message 1: In public general channel
  await pool.query(
    `INSERT INTO messages (id, channel_id, sender_id, content, created_at)
     VALUES ('10000000-0000-4000-8000-000000000001', $1, $2, 'Please verify your docker setup before testing the build.', '2026-10-13T10:15:30Z')`,
    [PUB_CHANNEL_GENERAL_ID, ALICE_ID],
  );

  // Message 2: In public general channel from Bob
  await pool.query(
    `INSERT INTO messages (id, channel_id, sender_id, content, created_at)
     VALUES ('10000000-0000-4000-8000-000000000002', $1, $2, 'Docker container is up and PostgreSQL database is connected.', '2026-10-13T10:20:00Z')`,
    [PUB_CHANNEL_GENERAL_ID, BOB_ID],
  );

  // Message 3: In public dev-ops channel
  await pool.query(
    `INSERT INTO messages (id, channel_id, sender_id, content, created_at)
     VALUES ('10000000-0000-4000-8000-000000000003', $1, $2, 'Production deployment pipeline configuration updated.', '2026-10-13T11:00:00Z')`,
    [PUB_CHANNEL_DEV_ID, ALICE_ID],
  );

  // Message 4: In private ops channel (ONLY Alice can see this; Bob and Charlie CANNOT)
  await pool.query(
    `INSERT INTO messages (id, channel_id, sender_id, content, created_at)
     VALUES ('10000000-0000-4000-8000-000000000004', $1, $2, 'Confidential: Docker root credentials rotation scheduled tonight.', '2026-10-13T12:00:00Z')`,
    [PRIV_CHANNEL_SECRET_ID, ALICE_ID],
  );

  // Message 5: Soft-deleted message (must NOT appear in any search results)
  await pool.query(
    `INSERT INTO messages (id, channel_id, sender_id, content, deleted_at, created_at)
     VALUES ('10000000-0000-4000-8000-000000000005', $1, $2, 'Deleted message mentioning docker and database.', NOW(), '2026-10-13T12:30:00Z')`,
    [PUB_CHANNEL_GENERAL_ID, ALICE_ID],
  );

  const userRepository = new UserRepository(pool);
  const authService = new AuthService(userRepository);
  const searchRepository = new SearchRepository(pool);
  const searchService = new SearchService(searchRepository);

  const authenticate = (incomingRequest, _response, next) => {
    const authHeader = incomingRequest.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return next();
    }
    const token = authHeader.slice(7);
    const userMap = {
      alice_token: { id: ALICE_ID, username: 'alice_dev', sub: ALICE_ID },
      bob_token: { id: BOB_ID, username: 'bob_member', sub: BOB_ID },
      charlie_token: { id: CHARLIE_OUTSIDER_ID, username: 'charlie_outsider', sub: CHARLIE_OUTSIDER_ID },
    };
    if (userMap[token]) {
      incomingRequest.user = userMap[token];
    }
    next();
  };

  const app = createApp({
    authService,
    searchService,
    authenticate,
    enableRateLimit: false,
  });

  return { app, pool };
}

describe('US-14: Search authorized messages (FR-UX-02, FR-COM-04, SRS §6.1)', () => {
  let app;
  let pool;

  beforeEach(async () => {
    ({ app, pool } = await buildTestContext());
  });

  afterEach(async () => {
    await pool.end();
  });

  describe('GET /api/search - Functional Querying & Relevant Matches', () => {
    it('returns relevant matching messages for an authorized community member', async () => {
      const response = await request(app)
        .get('/api/search')
        .query({ q: 'docker setup' })
        .set('Authorization', 'Bearer bob_token');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data).toMatchObject({
        query: 'docker setup',
        totalMatches: 1,
        page: 1,
        limit: 20,
      });

      expect(response.body.data.results).toHaveLength(1);
      const match = response.body.data.results[0];
      expect(match).toMatchObject({
        id: '10000000-0000-4000-8000-000000000001',
        channelId: PUB_CHANNEL_GENERAL_ID,
        channelName: 'general',
        communityId: PUBLIC_COMMUNITY_ID,
        communityName: 'Public Engineers',
        content: 'Please verify your docker setup before testing the build.',
      });
      expect(match.sender).toMatchObject({
        id: ALICE_ID,
        username: 'alice_dev',
        displayName: 'Alice Dev',
      });
      expect(match.snippet).toContain('<b>docker</b>');
      expect(match.snippet).toContain('<b>setup</b>');
      expect(typeof match.rank).toBe('number');
      expect(typeof response.body.data.executionTimeMs).toBe('number');
    });

    it('returns multiple matching messages ordered by recency', async () => {
      const response = await request(app)
        .get('/api/search')
        .query({ q: 'docker' })
        .set('Authorization', 'Bearer bob_token');

      expect(response.status).toBe(200);
      // Bob has access to msg 1 and msg 2; msg 4 is private; msg 5 is deleted
      expect(response.body.data.totalMatches).toBe(2);
      expect(response.body.data.results).toHaveLength(2);
      expect(response.body.data.results[0].id).toBe('10000000-0000-4000-8000-000000000002');
      expect(response.body.data.results[1].id).toBe('10000000-0000-4000-8000-000000000001');
    });

    it('returns an empty results list when no messages match the query', async () => {
      const response = await request(app)
        .get('/api/search')
        .query({ q: 'kubernetes cluster orchestration' })
        .set('Authorization', 'Bearer bob_token');

      expect(response.status).toBe(200);
      expect(response.body.data.totalMatches).toBe(0);
      expect(response.body.data.results).toEqual([]);
    });

    it('supports scoped search by channelId', async () => {
      const response = await request(app)
        .get('/api/search')
        .query({ q: 'pipeline', channelId: PUB_CHANNEL_DEV_ID })
        .set('Authorization', 'Bearer bob_token');

      expect(response.status).toBe(200);
      expect(response.body.data.totalMatches).toBe(1);
      expect(response.body.data.results[0].channelId).toBe(PUB_CHANNEL_DEV_ID);
    });

    it('supports pagination with page and limit parameters', async () => {
      const response = await request(app)
        .get('/api/search')
        .query({ q: 'docker', page: 1, limit: 1 })
        .set('Authorization', 'Bearer bob_token');

      expect(response.status).toBe(200);
      expect(response.body.data.totalMatches).toBe(2);
      expect(response.body.data.results).toHaveLength(1);
      expect(response.body.data.page).toBe(1);
      expect(response.body.data.limit).toBe(1);
    });
  });

  describe('Authorization & Resource Exclusion Boundary (FR-UX-02, FR-COM-04)', () => {
    it('strictly excludes messages from private communities the user is NOT a member of', async () => {
      // Alice owns Private Ops so she can find confidential messages
      const aliceRes = await request(app)
        .get('/api/search')
        .query({ q: 'Confidential' })
        .set('Authorization', 'Bearer alice_token');

      expect(aliceRes.status).toBe(200);
      expect(aliceRes.body.data.totalMatches).toBe(1);
      expect(aliceRes.body.data.results[0].communityId).toBe(PRIVATE_COMMUNITY_ID);

      // Bob is NOT in Private Ops; he must NOT see the message or know it exists
      const bobRes = await request(app)
        .get('/api/search')
        .query({ q: 'Confidential' })
        .set('Authorization', 'Bearer bob_token');

      expect(bobRes.status).toBe(200);
      expect(bobRes.body.data.totalMatches).toBe(0);
      expect(bobRes.body.data.results).toEqual([]);
    });

    it('excludes all community messages from an outsider with no memberships', async () => {
      const charlieRes = await request(app)
        .get('/api/search')
        .query({ q: 'docker' })
        .set('Authorization', 'Bearer charlie_token');

      expect(charlieRes.status).toBe(200);
      expect(charlieRes.body.data.totalMatches).toBe(0);
      expect(charlieRes.body.data.results).toEqual([]);
    });

    it('never returns soft-deleted messages regardless of user authorization', async () => {
      const response = await request(app)
        .get('/api/search')
        .query({ q: 'Deleted message mentioning docker' })
        .set('Authorization', 'Bearer alice_token');

      expect(response.status).toBe(200);
      expect(response.body.data.totalMatches).toBe(0);
      expect(response.body.data.results).toEqual([]);
    });

    it('rejects unauthenticated requests with 401', async () => {
      const response = await request(app)
        .get('/api/search')
        .query({ q: 'docker' });

      expect(response.status).toBe(401);
      expect(response.body.code).toBe('AUTHENTICATION_REQUIRED');
    });
  });

  describe('Validation & Error Handling', () => {
    it('rejects missing search query with 400', async () => {
      const response = await request(app)
        .get('/api/search')
        .set('Authorization', 'Bearer bob_token');

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('INVALID_INPUT_PAYLOAD');
      expect(JSON.stringify(response.body.invalidParams)).toContain('q');
    });

    it('rejects empty or whitespace-only search query with 400', async () => {
      const response = await request(app)
        .get('/api/search')
        .query({ q: '    ' })
        .set('Authorization', 'Bearer bob_token');

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('INVALID_INPUT_PAYLOAD');
    });

    it('rejects invalid UUID channelId with 400', async () => {
      const response = await request(app)
        .get('/api/search')
        .query({ q: 'docker', channelId: 'not-a-valid-uuid' })
        .set('Authorization', 'Bearer bob_token');

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('INVALID_INPUT_PAYLOAD');
    });

    it('rejects unexpected query parameters with 400', async () => {
      const response = await request(app)
        .get('/api/search')
        .query({ q: 'docker', maliciousParam: 'inject' })
        .set('Authorization', 'Bearer bob_token');

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('INVALID_INPUT_PAYLOAD');
    });
  });

  describe('Performance Target Verification (SRS §6.1 / TC-NF03)', () => {
    it('executes search well within the 2-second SLA under defined test dataset', async () => {
      const start = Date.now();
      const response = await request(app)
        .get('/api/search')
        .query({ q: 'docker setup' })
        .set('Authorization', 'Bearer bob_token');

      const elapsed = Date.now() - start;
      expect(response.status).toBe(200);
      expect(response.body.data.executionTimeMs).toBeLessThan(2000);
      expect(elapsed).toBeLessThan(2000);
    });
  });
});
