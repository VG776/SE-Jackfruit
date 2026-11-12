const { randomUUID, randomBytes } = require('crypto');
const { AppError } = require('../errors/AppError');

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

function inviteNotFoundError() {
  return new AppError({
    status: 404,
    code: 'INVITE_NOT_FOUND',
    detail: 'Invite link is invalid or expired.',
  });
}

function inviteExpiredOrExhaustedError() {
  return new AppError({
    status: 404,
    code: 'INVITE_EXPIRED',
    detail: 'Invite link is invalid or has expired.',
  });
}

function alreadyMemberError() {
  return new AppError({
    status: 409,
    code: 'ALREADY_MEMBER',
    detail: 'You are already a member of this community.',
  });
}

function memberNotFoundError() {
  return new AppError({
    status: 404,
    code: 'MEMBER_NOT_FOUND',
    detail: 'The requested member could not be found in this community.',
  });
}

function cannotModifyOwnerError() {
  return new AppError({
    status: 400,
    code: 'CANNOT_MODIFY_OWNER',
    detail: 'The community owner role cannot be modified or removed.',
  });
}

function toMemberDto(row) {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: row.avatar_url || null,
    role: row.role,
    joinedAt: row.joined_at instanceof Date ? row.joined_at.toISOString() : row.joined_at,
  };
}

function toInviteDto(row) {
  return {
    id: row.id,
    communityId: row.community_id,
    code: row.code,
    maxUses: row.max_uses,
    uses: row.uses,
    expiresAt: row.expires_at instanceof Date ? row.expires_at.toISOString() : row.expires_at,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

class MembershipService {
  constructor(membershipRepository) {
    this.membershipRepository = membershipRepository;
  }

  async assertAdmin(userId, communityId) {
    const community = await this.membershipRepository.findCommunityById(communityId);
    if (!community) {
      throw communityNotFoundError();
    }

    const role = await this.membershipRepository.getRole(userId, communityId);
    if (!role) {
      // Non-member gets 404 to prevent community enumeration
      throw communityNotFoundError();
    }

    if (role !== 'admin') {
      throw insufficientPermissionsError();
    }

    return community;
  }

  async listMembers(requesterId, communityId) {
    const community = await this.membershipRepository.findCommunityById(communityId);
    if (!community) {
      throw communityNotFoundError();
    }

    const role = await this.membershipRepository.getRole(requesterId, communityId);
    if (!role) {
      throw communityNotFoundError();
    }

    const rows = await this.membershipRepository.listMembers(communityId);
    return rows.map(toMemberDto);
  }

  async createInvite(requesterId, communityId, { maxUses = 1, expiresInHours } = {}) {
    await this.assertAdmin(requesterId, communityId);

    const code = randomBytes(16).toString('hex');
    let expiresAt = null;
    if (expiresInHours && expiresInHours > 0) {
      expiresAt = new Date(Date.now() + expiresInHours * 3600 * 1000);
    }

    const invite = await this.membershipRepository.createInvite({
      id: randomUUID(),
      communityId,
      inviterId: requesterId,
      code,
      maxUses,
      expiresAt,
    });

    return toInviteDto(invite);
  }

  async joinByCode(userId, code) {
    const invite = await this.membershipRepository.findInviteByCode(code);
    if (!invite) {
      throw inviteNotFoundError();
    }

    // Check expiration
    if (invite.expires_at) {
      const expDate = new Date(invite.expires_at);
      if (expDate.getTime() <= Date.now()) {
        throw inviteExpiredOrExhaustedError();
      }
    }

    // Check max uses
    if (invite.max_uses > 0 && invite.uses >= invite.max_uses) {
      throw inviteExpiredOrExhaustedError();
    }

    // Check if already a member or owner
    const existingRole = await this.membershipRepository.getRole(userId, invite.community_id);
    if (existingRole) {
      throw alreadyMemberError();
    }

    // Increment invite usage
    await this.membershipRepository.incrementInviteUses(invite.id);

    // Add user as member
    const member = await this.membershipRepository.addMember({
      id: randomUUID(),
      communityId: invite.community_id,
      userId,
      role: 'member',
    });

    return {
      communityId: invite.community_id,
      communityName: invite.community_name,
      role: member.role,
      joinedAt: member.joined_at instanceof Date ? member.joined_at.toISOString() : member.joined_at,
    };
  }

  async updateMemberRole(requesterId, communityId, targetUserId, newRole) {
    const community = await this.assertAdmin(requesterId, communityId);

    if (community.owner_id === targetUserId) {
      throw cannotModifyOwnerError();
    }

    const updated = await this.membershipRepository.updateMemberRole(communityId, targetUserId, newRole);
    if (!updated) {
      throw memberNotFoundError();
    }

    return {
      userId: updated.user_id,
      communityId: updated.community_id,
      role: updated.role,
    };
  }

  async removeMember(requesterId, communityId, targetUserId) {
    const community = await this.assertAdmin(requesterId, communityId);

    if (community.owner_id === targetUserId) {
      throw cannotModifyOwnerError();
    }

    const removed = await this.membershipRepository.removeMember(communityId, targetUserId);
    if (!removed) {
      throw memberNotFoundError();
    }

    return {
      message: 'Member successfully removed.',
    };
  }
}

module.exports = { MembershipService };

