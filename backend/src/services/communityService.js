const { randomUUID } = require('crypto');
const { AppError } = require('../errors/AppError');

function duplicateCommunityError() {
  return new AppError({
    status: 409,
    code: 'COMMUNITY_ALREADY_EXISTS',
    detail: 'You already own a community with that name.',
    invalidParams: [{ name: 'name', reason: 'Community name must be unique per owner' }],
  });
}

class CommunityService {
  constructor(communityRepository) {
    this.communityRepository = communityRepository;
  }

  async create({ name, description, ownerId }) {
    const trimmedName = name.trim();

    const existing = await this.communityRepository.findByOwnerAndName(ownerId, trimmedName);
    if (existing) {
      throw duplicateCommunityError();
    }

    try {
      const community = await this.communityRepository.create({
        id: randomUUID(),
        ownerId,
        name: trimmedName,
        description: description ? description.trim() : undefined,
      });

      return {
        id: community.id,
        ownerId: community.owner_id,
        name: community.name,
        description: community.description ?? null,
        createdAt:
          community.created_at instanceof Date
            ? community.created_at.toISOString()
            : community.created_at,
      };
    } catch (error) {
      // Race-condition safety: unique constraint violation
      if (error.code === '23505') {
        throw duplicateCommunityError();
      }

      throw error;
    }
  }
}

module.exports = { CommunityService };
