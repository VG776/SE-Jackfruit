const { createDatabasePool } = require('./config/database');
const { UserRepository } = require('./repositories/userRepository');
const { CommunityRepository } = require('./repositories/communityRepository');
const { CommunityService } = require('./services/communityService');
const { ChannelRepository } = require('./repositories/channelRepository');
const { ChannelPermissionRepository } = require('./repositories/channelPermissionRepository');
const { MessageRepository } = require('./repositories/messageRepository');
const { DirectMessageRepository } = require('./repositories/directMessageRepository');
const { AuthService } = require('./services/authService');
const { ChannelService } = require('./services/channelService');
const { MessageService } = require('./services/messageService');
const { DirectMessageService } = require('./services/directMessageService');
const { createApp } = require('./app');
const { createWebSocketGateway } = require('./realtime/webSocketGateway');

const port = Number(process.env.API_PORT || 5000);
const pool = createDatabasePool();
const userRepository = new UserRepository(pool);
const communityService = new CommunityService(new CommunityRepository(pool));
const channelRepository = new ChannelRepository(pool);
const channelPermissionRepository = new ChannelPermissionRepository(pool);
const messageRepository = new MessageRepository(pool);
const directMessageRepository = new DirectMessageRepository(pool);
const authService = new AuthService(userRepository);
const channelService = new ChannelService(channelRepository, channelPermissionRepository);
const messageService = new MessageService(messageRepository, channelService);
const directMessageService = new DirectMessageService(directMessageRepository);
const app = createApp({
  authService,
  communityService,
  channelService,
  messageService,
  directMessageService,
});

const server = app.listen(port, () => {
  console.log(`NexusChat API listening on port ${port}.`);
});
const webSocketServer = createWebSocketGateway(server, { authService, channelService, messageService });

async function shutDown() {
  webSocketServer.close();
  server.close(async () => {
    await pool.end();
  });
}

process.on('SIGINT', shutDown);
process.on('SIGTERM', shutDown);
