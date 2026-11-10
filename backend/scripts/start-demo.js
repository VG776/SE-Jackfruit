const { randomBytes, randomUUID } = require('node:crypto');
const { newDb } = require('pg-mem');
const { runMigrations } = require('../src/db/migrate');
const { createServer } = require('../src/server');

async function main() {
  const { Pool } = newDb().adapters.createPg();
  const pool = new Pool();
  await runMigrations(pool);
  const { server, webSocketServer, authService, communityService, channelService, messageService } =
    createServer(pool, { jwtSecret: randomBytes(32).toString('hex') });
  const password = 'NexusDemo2026!';
  const owner = await authService.register({ username: 'demo_owner', email: 'owner@example.com', password });
  const member = await authService.register({ username: 'demo_member', email: 'member@example.com', password });
  const community = await communityService.create({
    ownerId: owner.id,
    name: 'Project Jackfruit',
    description: 'A shared workspace for the NexusChat team.',
  });
  await pool.query(
    'INSERT INTO community_members (id, community_id, user_id, role) VALUES ($1, $2, $3, $4)',
    [randomUUID(), community.id, member.id, 'member'],
  );
  const general = await channelService.create(owner.id, community.id, { name: 'general', type: 'text' });
  await channelService.create(owner.id, community.id, { name: 'sprint-updates', type: 'text' });
  await messageService.sendMessage(owner.id, general.id, { content: 'Welcome to Project Jackfruit! Use this space to share updates and questions.' });
  await messageService.sendMessage(member.id, general.id, { content: 'Ready for the Sprint 1 walkthrough.' });

  const port = Number(process.env.DEMO_PORT || 5000);
  server.listen(port, '127.0.0.1', () => console.log(`NexusChat demo: http://127.0.0.1:${port}/?demo=1`));
  server.once('error', (error) => {
    console.error(error.message);
    process.exitCode = 1;
    pool.end();
  });
  function shutDown() {
    for (const socket of webSocketServer.clients) socket.terminate();
    webSocketServer.close();
    server.close(() => pool.end());
  }
  process.once('SIGINT', shutDown);
  process.once('SIGTERM', shutDown);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
