const { MembershipService } = require('../src/services/membershipService');

describe('MembershipService', () => {
  let membershipRepository;
  let membershipService;

  const COMMUNITY_ID = '11111111-1111-4111-8111-111111111111';
  const OWNER_ID = '22222222-2222-4222-8222-222222222222';
  const ADMIN_ID = '33333333-3333-4333-8333-333333333333';
  const MEMBER_ID = '44444444-4444-4444-8444-444444444444';
  const NON_MEMBER_ID = '55555555-5555-4555-8555-555555555555';

  beforeEach(() => {
    membershipRepository = {
      findCommunityById: jest.fn(),
      getRole: jest.fn(),
      listMembers: jest.fn(),
      createInvite: jest.fn(),
      findInviteByCode: jest.fn(),
      incrementInviteUses: jest.fn(),
      addMember: jest.fn(),
      updateMemberRole: jest.fn(),
      removeMember: jest.fn(),
    };
    membershipService = new MembershipService(membershipRepository);
  });

  describe('createInvite', () => {
    it('creates an invite if requester is admin/owner', async () => {
      membershipRepository.findCommunityById.mockResolvedValue({ id: COMMUNITY_ID, owner_id: OWNER_ID });
      membershipRepository.getRole.mockResolvedValue('admin');
      membershipRepository.createInvite.mockResolvedValue({
        id: 'inv-1',
        community_id: COMMUNITY_ID,
        inviter_id: ADMIN_ID,
        code: 'randomcode123',
        max_uses: 5,
        uses: 0,
        expires_at: new Date('2026-11-20T00:00:00Z'),
        created_at: new Date('2026-11-12T00:00:00Z'),
      });

      const result = await membershipService.createInvite(ADMIN_ID, COMMUNITY_ID, {
        maxUses: 5,
        expiresInHours: 24,
      });

      expect(membershipRepository.createInvite).toHaveBeenCalledWith(
        expect.objectContaining({
          communityId: COMMUNITY_ID,
          inviterId: ADMIN_ID,
          maxUses: 5,
        }),
      );
      expect(result.code).toBe('randomcode123');
      expect(result.maxUses).toBe(5);
    });

    it('rejects with 404 if community does not exist', async () => {
      membershipRepository.findCommunityById.mockResolvedValue(null);

      await expect(
        membershipService.createInvite(ADMIN_ID, COMMUNITY_ID, { maxUses: 1 }),
      ).rejects.toMatchObject({
        status: 404,
        code: 'RESOURCE_NOT_FOUND',
      });
    });

    it('rejects with 404 if requester is not a member (to prevent enumeration)', async () => {
      membershipRepository.findCommunityById.mockResolvedValue({ id: COMMUNITY_ID, owner_id: OWNER_ID });
      membershipRepository.getRole.mockResolvedValue(null);

      await expect(
        membershipService.createInvite(NON_MEMBER_ID, COMMUNITY_ID, { maxUses: 1 }),
      ).rejects.toMatchObject({
        status: 404,
        code: 'RESOURCE_NOT_FOUND',
      });
    });

    it('rejects with 403 if requester is ordinary member or moderator', async () => {
      membershipRepository.findCommunityById.mockResolvedValue({ id: COMMUNITY_ID, owner_id: OWNER_ID });
      membershipRepository.getRole.mockResolvedValue('member');

      await expect(
        membershipService.createInvite(MEMBER_ID, COMMUNITY_ID, { maxUses: 1 }),
      ).rejects.toMatchObject({
        status: 403,
        code: 'INSUFFICIENT_PERMISSIONS',
      });
    });
  });

  describe('joinByCode', () => {
    it('successfully joins a valid invite', async () => {
      membershipRepository.findInviteByCode.mockResolvedValue({
        id: 'inv-1',
        community_id: COMMUNITY_ID,
        community_name: 'Test Community',
        max_uses: 5,
        uses: 1,
        expires_at: new Date(Date.now() + 3600 * 1000),
      });
      membershipRepository.getRole.mockResolvedValue(null);
      membershipRepository.incrementInviteUses.mockResolvedValue({});
      membershipRepository.addMember.mockResolvedValue({
        id: 'cm-1',
        community_id: COMMUNITY_ID,
        user_id: NON_MEMBER_ID,
        role: 'member',
        joined_at: new Date('2026-11-12T12:00:00Z'),
      });

      const result = await membershipService.joinByCode(NON_MEMBER_ID, 'validcode');

      expect(membershipRepository.incrementInviteUses).toHaveBeenCalledWith('inv-1');
      expect(membershipRepository.addMember).toHaveBeenCalledWith(
        expect.objectContaining({
          communityId: COMMUNITY_ID,
          userId: NON_MEMBER_ID,
          role: 'member',
        }),
      );
      expect(result.communityId).toBe(COMMUNITY_ID);
      expect(result.role).toBe('member');
    });

    it('rejects if invite code does not exist', async () => {
      membershipRepository.findInviteByCode.mockResolvedValue(null);

      await expect(membershipService.joinByCode(NON_MEMBER_ID, 'invalidcode')).rejects.toMatchObject({
        status: 404,
        code: 'INVITE_NOT_FOUND',
      });
    });

    it('rejects if invite code has expired', async () => {
      membershipRepository.findInviteByCode.mockResolvedValue({
        id: 'inv-1',
        community_id: COMMUNITY_ID,
        max_uses: 5,
        uses: 1,
        expires_at: new Date(Date.now() - 3600 * 1000), // past
      });

      await expect(membershipService.joinByCode(NON_MEMBER_ID, 'expiredcode')).rejects.toMatchObject({
        status: 404,
        code: 'INVITE_EXPIRED',
      });
    });

    it('rejects if invite code has reached max_uses', async () => {
      membershipRepository.findInviteByCode.mockResolvedValue({
        id: 'inv-1',
        community_id: COMMUNITY_ID,
        max_uses: 2,
        uses: 2,
        expires_at: null,
      });

      await expect(membershipService.joinByCode(NON_MEMBER_ID, 'exhaustedcode')).rejects.toMatchObject({
        status: 404,
        code: 'INVITE_EXPIRED',
      });
    });

    it('rejects with 409 if user is already a member', async () => {
      membershipRepository.findInviteByCode.mockResolvedValue({
        id: 'inv-1',
        community_id: COMMUNITY_ID,
        max_uses: 5,
        uses: 0,
        expires_at: null,
      });
      membershipRepository.getRole.mockResolvedValue('member');

      await expect(membershipService.joinByCode(MEMBER_ID, 'validcode')).rejects.toMatchObject({
        status: 409,
        code: 'ALREADY_MEMBER',
      });
    });
  });

  describe('updateMemberRole', () => {
    it('updates member role when requested by admin', async () => {
      membershipRepository.findCommunityById.mockResolvedValue({ id: COMMUNITY_ID, owner_id: OWNER_ID });
      membershipRepository.getRole.mockResolvedValue('admin');
      membershipRepository.updateMemberRole.mockResolvedValue({
        id: 'cm-1',
        community_id: COMMUNITY_ID,
        user_id: MEMBER_ID,
        role: 'moderator',
      });

      const result = await membershipService.updateMemberRole(ADMIN_ID, COMMUNITY_ID, MEMBER_ID, 'moderator');

      expect(result.role).toBe('moderator');
      expect(membershipRepository.updateMemberRole).toHaveBeenCalledWith(COMMUNITY_ID, MEMBER_ID, 'moderator');
    });

    it('prevents modifying the community owner', async () => {
      membershipRepository.findCommunityById.mockResolvedValue({ id: COMMUNITY_ID, owner_id: OWNER_ID });
      membershipRepository.getRole.mockResolvedValue('admin');

      await expect(
        membershipService.updateMemberRole(ADMIN_ID, COMMUNITY_ID, OWNER_ID, 'member'),
      ).rejects.toMatchObject({
        status: 400,
        code: 'CANNOT_MODIFY_OWNER',
      });
    });

    it('rejects if target member not found in community', async () => {
      membershipRepository.findCommunityById.mockResolvedValue({ id: COMMUNITY_ID, owner_id: OWNER_ID });
      membershipRepository.getRole.mockResolvedValue('admin');
      membershipRepository.updateMemberRole.mockResolvedValue(null);

      await expect(
        membershipService.updateMemberRole(ADMIN_ID, COMMUNITY_ID, NON_MEMBER_ID, 'moderator'),
      ).rejects.toMatchObject({
        status: 404,
        code: 'MEMBER_NOT_FOUND',
      });
    });
  });

  describe('removeMember', () => {
    it('removes member when requested by admin', async () => {
      membershipRepository.findCommunityById.mockResolvedValue({ id: COMMUNITY_ID, owner_id: OWNER_ID });
      membershipRepository.getRole.mockResolvedValue('admin');
      membershipRepository.removeMember.mockResolvedValue({
        id: 'cm-1',
        community_id: COMMUNITY_ID,
        user_id: MEMBER_ID,
      });

      const result = await membershipService.removeMember(ADMIN_ID, COMMUNITY_ID, MEMBER_ID);
      expect(result.message).toContain('successfully removed');
    });

    it('prevents removing the community owner', async () => {
      membershipRepository.findCommunityById.mockResolvedValue({ id: COMMUNITY_ID, owner_id: OWNER_ID });
      membershipRepository.getRole.mockResolvedValue('admin');

      await expect(
        membershipService.removeMember(ADMIN_ID, COMMUNITY_ID, OWNER_ID),
      ).rejects.toMatchObject({
        status: 400,
        code: 'CANNOT_MODIFY_OWNER',
      });
    });

    it('rejects if target member does not exist in community', async () => {
      membershipRepository.findCommunityById.mockResolvedValue({ id: COMMUNITY_ID, owner_id: OWNER_ID });
      membershipRepository.getRole.mockResolvedValue('admin');
      membershipRepository.removeMember.mockResolvedValue(null);

      await expect(
        membershipService.removeMember(ADMIN_ID, COMMUNITY_ID, NON_MEMBER_ID),
      ).rejects.toMatchObject({
        status: 404,
        code: 'MEMBER_NOT_FOUND',
      });
    });
  });

  describe('listMembers', () => {
    it('returns member list for authorized member', async () => {
      membershipRepository.findCommunityById.mockResolvedValue({ id: COMMUNITY_ID, owner_id: OWNER_ID });
      membershipRepository.getRole.mockResolvedValue('member');
      membershipRepository.listMembers.mockResolvedValue([
        {
          id: OWNER_ID,
          username: 'owner',
          display_name: 'Owner',
          avatar_url: null,
          role: 'admin',
          joined_at: new Date('2026-11-01T00:00:00Z'),
        },
        {
          id: MEMBER_ID,
          username: 'member',
          display_name: 'Member',
          avatar_url: null,
          role: 'member',
          joined_at: new Date('2026-11-02T00:00:00Z'),
        },
      ]);

      const result = await membershipService.listMembers(MEMBER_ID, COMMUNITY_ID);
      expect(result).toHaveLength(2);
      expect(result[0].role).toBe('admin');
      expect(result[1].role).toBe('member');
    });

    it('rejects with 404 for non-members', async () => {
      membershipRepository.findCommunityById.mockResolvedValue({ id: COMMUNITY_ID, owner_id: OWNER_ID });
      membershipRepository.getRole.mockResolvedValue(null);

      await expect(membershipService.listMembers(NON_MEMBER_ID, COMMUNITY_ID)).rejects.toMatchObject({
        status: 404,
        code: 'RESOURCE_NOT_FOUND',
      });
    });
  });
});

