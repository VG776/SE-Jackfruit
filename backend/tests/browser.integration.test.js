const { randomUUID } = require('node:crypto');
const { newDb } = require('pg-mem');
const request = require('supertest');
const { runMigrations } = require('../src/db/migrate');
const { createServer } = require('../src/server');

test('serves the browser UI and lists only communities and channels the signed-in user can access', async () => {
  const { Pool } = newDb().adapters.createPg();
  const pool = new Pool();
  let gateway;
  try {
    await runMigrations(pool);
    const { server, webSocketServer, authService, communityService, channelService } = createServer(pool);
    gateway = webSocketServer;
    const api = request(server);
    const password = 'DemoPassword123!';
    const owner = await authService.register({ username: 'owner', email: 'owner@example.com', password });
    const member = await authService.register({ username: 'member', email: 'member@example.com', password });
    const outsider = await authService.register({ username: 'outsider', email: 'outsider@example.com', password });
    const community = await communityService.create({ name: 'Project Jackfruit', ownerId: owner.id });
    await pool.query(
      'INSERT INTO community_members (id, community_id, user_id, role) VALUES ($1, $2, $3, $4)',
      [randomUUID(), community.id, member.id, 'member'],
    );
    const channel = await channelService.create(owner.id, community.id, { name: 'general', type: 'text' });
    const authorization = async (username) => {
      const result = await api.post('/api/auth/login').send({ username, password }).expect(200);
      return 'Bearer ' + result.body.data.token;
    };

    await api.get('/').expect('Content-Type', /html/).expect(200, /NexusChat/);
    await api.get('/chat.js').expect(200);
    await api.get('/styles.css').expect(200);
    await api.get('/api/communities').expect(401);
    const route = '/api/communities/' + community.id + '/channels';
    await api.get(route).expect(401);

    for (const [username, role] of [[owner.username, 'admin'], [member.username, 'member']]) {
      const header = await authorization(username);
      const listed = await api.get('/api/communities').set('Authorization', header).expect(200);
      expect(listed.body.data).toEqual([expect.objectContaining({ id: community.id, role })]);
      const textChannels = await api.get(route).set('Authorization', header).expect(200);
      expect(textChannels.body.data).toEqual([expect.objectContaining({ id: channel.id, name: 'general' })]);
    }

    const outsiderHeader = await authorization(outsider.username);
    const hidden = await api.get('/api/communities').set('Authorization', outsiderHeader).expect(200);
    expect(hidden.body.data).toEqual([]);
    await api.get(route).set('Authorization', outsiderHeader).expect(404);
  } finally {
    gateway?.close();
    await pool.end();
  }
});
