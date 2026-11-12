const { createDatabasePool } = require('./config/database');
const { UserRepository } = require('./repositories/userRepository');
const { CommunityRepository } = require('./repositories/communityRepository');
const { CommunityService } = require('./services/communityService');
const { ChannelRepository } = require('./repositories/channelRepository');
const { ChannelPermissionRepository } = require('./repositories/channelPermissionRepository');
const { MessageRepository } = require('./repositories/messageRepository');
const { MembershipRepository } = require('./repositories/membershipRepository');
const { AuthService } = require('./services/authService');
const { ChannelService } = require('./services/channelService');
const { MessageService } = require('./services/messageService');
const { MembershipService } = require('./services/membershipService');
const { createApp } = require('./app');
const { createWebSocketGateway } = require('./realtime/webSocketGateway');

function createServer(pool, authOptions = {}) {
  const authService = new AuthService(new UserRepository(pool), undefined, undefined, authOptions);
  const communityService = new CommunityService(new CommunityRepository(pool));
  const channelService = new ChannelService(
    new ChannelRepository(pool),
    new ChannelPermissionRepository(pool),
  );
  const messageService = new MessageService(new MessageRepository(pool), channelService);
  const membershipService = new MembershipService(new MembershipRepository(pool));
  const app = createApp({
    authService,
    communityService,
    channelService,
    messageService,
    membershipService,
  });
  const server = require('node:http').createServer(app);
  const webSocketServer = createWebSocketGateway(server, { authService, channelService, messageService });
  return {
    server,
    webSocketServer,
    authService,
    communityService,
    channelService,
    messageService,
    membershipService,
  };
}

if (require.main === module) {
  const port = Number(process.env.API_PORT || 5000);
  const pool = createDatabasePool();
  const { server, webSocketServer } = createServer(pool);
  server.listen(port, () => console.log(`NexusChat: http://localhost:${port}`));

  const shutDown = () => {
    for (const socket of webSocketServer.clients) socket.terminate();
    webSocketServer.close();
    server.close(() => pool.end());
  };
  process.once('SIGINT', shutDown);
  process.once('SIGTERM', shutDown);
}

module.exports = { createServer };
