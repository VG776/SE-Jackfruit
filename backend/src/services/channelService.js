const { randomUUID } = require('crypto');
const { AppError } = require('../errors/AppError');

function normalizeChannelName(name) {
  return name.trim().toLowerCase().replace(/[ _]+/g, '-').replace(/-+/g, '-');
}

function channelConflictError() {
  return new AppError({
    status: 409,
    code: 'CHANNEL_ALREADY_EXISTS',
    detail: 'A channel with this name already exists in the community.',
    invalidParams: [{ name: 'name', reason: 'Channel name must be unique per community' }],
  });
}

function channelNotFoundError() {
  return new AppError({
    status: 404,
    code: 'CHANNEL_NOT_FOUND',
    detail: 'The requested channel could not be found.',
  });
}

function communityNotFoundError() {
  return new AppError({
    status: 404,
    code: 'RESOURCE_NOT_FOUND',
    detail: 'The requested resource could not be found.',
  });
}

function insufficientPermissionsError() {
  return new AppError({
    status: 403,
    code: 'INSUFFICIENT_PERMISSIONS',
    detail: 'You do not have permission to perform this operation.',
  });
}

function toChannelDto(channel) {
  return {
    id: channel.id,
    communityId: channel.community_id,
    name: channel.name,
    type: channel.type,
    createdAt:
      channel.created_at instanceof Date ? channel.created_at.toISOString() : channel.created_at,
    updatedAt:
      channel.updated_at instanceof Date ? channel.updated_at.toISOString() : channel.updated_at,
  };
}

class ChannelService {
  constructor(channelRepository, permissionRepository) {
    this.channelRepository = channelRepository;
    this.permissionRepository = permissionRepository;
  }

  async assertCanManageChannels(userId, communityId, notFoundError = communityNotFoundError) {
    const role = await this.permissionRepository.roleInCommunity(userId, communityId);
    if (!role) throw notFoundError();
    if (role !== 'admin') throw insufficientPermissionsError();
  }

  async assertCanAccessChannel(userId, channelId) {
    const channel = await this.channelRepository.findById(channelId);
    if (!channel) throw channelNotFoundError();

    const role = await this.permissionRepository.roleInCommunity(userId, channel.community_id);
    if (!role) throw channelNotFoundError();
    return channel;
  }

  async create(userId, communityId, channelData) {
    await this.assertCanManageChannels(userId, communityId);
    const name = normalizeChannelName(channelData.name);
    const conflict = await this.channelRepository.findNameConflict(communityId, name);

    if (conflict) {
      throw channelConflictError();
    }

    try {
      const channel = await this.channelRepository.create({
        id: randomUUID(),
        communityId,
        name,
        type: channelData.type,
      });
      return toChannelDto(channel);
    } catch (error) {
      if (error.code === '23505') {
        throw channelConflictError();
      }
      throw error;
    }
  }

  async rename(userId, channelId, channelData) {
    const existingChannel = await this.channelRepository.findById(channelId);

    if (!existingChannel) {
      throw channelNotFoundError();
    }

    await this.assertCanManageChannels(userId, existingChannel.community_id, channelNotFoundError);
    const name = normalizeChannelName(channelData.name);
    const conflict = await this.channelRepository.findNameConflict(
      existingChannel.community_id,
      name,
      channelId,
    );

    if (conflict) {
      throw channelConflictError();
    }

    try {
      const channel = await this.channelRepository.rename(channelId, name);
      if (!channel) {
        throw channelNotFoundError();
      }
      return toChannelDto(channel);
    } catch (error) {
      if (error.code === '23505') {
        throw channelConflictError();
      }
      throw error;
    }
  }

  async delete(userId, channelId) {
    const channel = await this.channelRepository.findById(channelId);

    if (!channel) {
      throw channelNotFoundError();
    }

    await this.assertCanManageChannels(userId, channel.community_id, channelNotFoundError);
    await this.channelRepository.delete(channelId);
  }
}

module.exports = { ChannelService, normalizeChannelName };
