const { createDatabasePool } = require('./config/database');
const { UserRepository } = require('./repositories/userRepository');
const { CommunityRepository } = require('./repositories/communityRepository');
const { CommunityService } = require('./services/communityService');
const { ChannelRepository } = require('./repositories/channelRepository');
const { ChannelPermissionRepository } = require('./repositories/channelPermissionRepository');
const { MessageRepository } = require('./repositories/messageRepository');
const { MembershipRepository } = require('./repositories/membershipRepository');
const DirectMessageRepository = require('./repositories/directMessageRepository');
const { ReactionRepository } = require('./repositories/reactionRepository');
const { ModerationRepository } = require('./repositories/moderationRepository');
const { ModerationService } = require('./services/moderationService');
const { SearchRepository } = require('./repositories/searchRepository');
const { UnreadRepository } = require('./repositories/unreadRepository');
const { ReactionService } = require('./services/reactionService');
const { AuthService } = require('./services/authService');
const { ChannelService } = require('./services/channelService');
const { MessageService } = require('./services/messageService');
const { AuditRepository } = require('./repositories/auditRepository');
const { AuditService } = require('./services/auditService');
const { MembershipService } = require('./services/membershipService');
const DirectMessageService = require('./services/directMessageService');
const { SearchService } = require('./services/searchService');
const { UnreadService } = require('./services/unreadService');
const { createApp } = require('./app');
const { createWebSocketGateway } = require('./realtime/webSocketGateway');

function createServer(pool, authOptions = {}) {
  const authService = new AuthService(new UserRepository(pool), undefined, undefined, authOptions);
  const communityService = new CommunityService(new CommunityRepository(pool));
  const channelService = new ChannelService(
    new ChannelRepository(pool),
    new ChannelPermissionRepository(pool),
  );
  const messageRepository = new MessageRepository(pool);
  const moderationService = new ModerationService(
    new ModerationRepository(pool),
    messageRepository,
    channelService,
  );
  const messageService = new MessageService(messageRepository, channelService, moderationService);
  const auditService = new AuditService(new AuditRepository(pool), channelService.permissionRepository);
  const membershipService = new MembershipService(new MembershipRepository(pool), auditService);
  const directMessageRepository = new DirectMessageRepository(pool);
  const directMessageService = new DirectMessageService(directMessageRepository, authService.userRepository);
  const reactionService = new ReactionService(
    new ReactionRepository(pool),
    messageRepository,
    channelService,
  );
  const searchService = new SearchService(new SearchRepository(pool));
  const unreadService = new UnreadService(new UnreadRepository(pool), channelService);

  const app = createApp({
    reactionService,
    authService,
    communityService,
    channelService,
    messageService,
    membershipService,
    directMessageService,
    searchService,
    unreadService,
    moderationService,
    auditService,
  });
  const server = require('node:http').createServer(app);
  const webSocketServer = createWebSocketGateway(server, {
    authService,
    channelService,
    messageService,
    unreadService,
  });
  return {
    server,
    webSocketServer,
    authService,
    communityService,
    channelService,
    messageService,
    membershipService,
    directMessageService,
    reactionService,
    searchService,
    unreadService,
    moderationService,
    auditService,
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
