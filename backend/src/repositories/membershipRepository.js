class MembershipRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async findCommunityById(communityId) {
    const result = await this.pool.query(
      `SELECT id, owner_id, name, description, created_at, updated_at
         FROM communities
        WHERE id = $1`,
      [communityId],
    );
    return result.rows[0] || null;
  }

  async getRole(userId, communityId) {
    const result = await this.pool.query(
      `SELECT CASE WHEN c.owner_id = $2 THEN 'admin' ELSE cm.role END AS role
         FROM communities c
         LEFT JOIN community_members cm
           ON cm.community_id = c.id
          AND cm.user_id = $2
        WHERE c.id = $1
          AND (c.owner_id = $2 OR cm.user_id IS NOT NULL)
        LIMIT 1`,
      [communityId, userId],
    );
    return result.rows[0]?.role || null;
  }

  async isMember(userId, communityId) {
    const role = await this.getRole(userId, communityId);
    return Boolean(role);
  }

  async listMembers(communityId) {
    // 1. Fetch community owner
    const ownerRes = await this.pool.query(
      `SELECT u.id, u.username, u.display_name, u.avatar_url,
              'admin' AS role,
              c.created_at AS joined_at
         FROM communities c
         JOIN users u ON u.id = c.owner_id
        WHERE c.id = $1`,
      [communityId],
    );

    // 2. Fetch regular/moderator/admin community members
    const membersRes = await this.pool.query(
      `SELECT u.id, u.username, u.display_name, u.avatar_url,
              cm.role,
              cm.joined_at
         FROM community_members cm
         JOIN users u ON u.id = cm.user_id
        WHERE cm.community_id = $1
        ORDER BY cm.joined_at ASC, u.username ASC`,
      [communityId],
    );

    const allMembers = [];
    if (ownerRes.rows[0]) {
      allMembers.push(ownerRes.rows[0]);
    }

    for (const member of membersRes.rows) {
      if (ownerRes.rows[0] && member.id === ownerRes.rows[0].id) {
        continue;
      }
      allMembers.push(member);
    }

    return allMembers;
  }

  async addMember({ id, communityId, userId, role = 'member' }) {
    const result = await this.pool.query(
      `INSERT INTO community_members (id, community_id, user_id, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, community_id, user_id, role, joined_at`,
      [id, communityId, userId, role],
    );
    return result.rows[0];
  }

  async updateMemberRole(communityId, userId, role) {
    const result = await this.pool.query(
      `UPDATE community_members
          SET role = $3
        WHERE community_id = $1
          AND user_id = $2
        RETURNING id, community_id, user_id, role, joined_at`,
      [communityId, userId, role],
    );
    return result.rows[0] || null;
  }

  async removeMember(communityId, userId) {
    const result = await this.pool.query(
      `DELETE FROM community_members
        WHERE community_id = $1
          AND user_id = $2
        RETURNING id, community_id, user_id, role, joined_at`,
      [communityId, userId],
    );
    return result.rows[0] || null;
  }

  async createInvite({ id, communityId, inviterId, code, maxUses, expiresAt }) {
    const result = await this.pool.query(
      `INSERT INTO community_invites (id, community_id, inviter_id, code, max_uses, uses, expires_at)
       VALUES ($1, $2, $3, $4, $5, 0, $6)
       RETURNING id, community_id, inviter_id, code, max_uses, uses, expires_at, created_at`,
      [id, communityId, inviterId, code, maxUses, expiresAt ?? null],
    );
    return result.rows[0];
  }

  async findInviteByCode(code) {
    const result = await this.pool.query(
      `SELECT i.id, i.community_id, i.inviter_id, i.code, i.max_uses, i.uses, i.expires_at, i.created_at,
              c.name AS community_name
         FROM community_invites i
         JOIN communities c ON c.id = i.community_id
        WHERE i.code = $1`,
      [code],
    );
    return result.rows[0] || null;
  }

  async incrementInviteUses(inviteId) {
    const result = await this.pool.query(
      `UPDATE community_invites
          SET uses = uses + 1
        WHERE id = $1
        RETURNING id, community_id, inviter_id, code, max_uses, uses, expires_at, created_at`,
      [inviteId],
    );
    return result.rows[0];
  }
}

module.exports = { MembershipRepository };
