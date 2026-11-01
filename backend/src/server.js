const { createDatabasePool } = require('./config/database');
const { UserRepository } = require('./repositories/userRepository');
const { CommunityRepository } = require('./repositories/communityRepository');
const { CommunityService } = require('./services/communityService');
const { ChannelRepository } = require('./repositories/channelRepository');
const { ChannelPermissionRepository } = require('./repositories/channelPermissionRepository');
const { AuthService } = require('./services/authService');
const { ChannelService } = require('./services/channelService');
const { createApp } = require('./app');

const port = Number(process.env.API_PORT || 5000);
const pool = createDatabasePool();
const userRepository = new UserRepository(pool);
const communityService = new CommunityService(new CommunityRepository(pool));
const channelRepository = new ChannelRepository(pool);
const channelPermissionRepository = new ChannelPermissionRepository(pool);
const authService = new AuthService(userRepository);
const channelService = new ChannelService(channelRepository, channelPermissionRepository);
const app = createApp({ authService, communityService, channelService });

const server = app.listen(port, () => {
  console.log(`NexusChat API listening on port ${port}.`);
});

async function shutDown() {
  server.close(async () => {
    await pool.end();
  });
}

process.on('SIGINT', shutDown);
process.on('SIGTERM', shutDown);
