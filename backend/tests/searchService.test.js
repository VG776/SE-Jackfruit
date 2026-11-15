const { SearchService, generateSnippet, calculateRank } = require('../src/services/searchService');

describe('SearchService', () => {
  let searchRepository;
  let searchService;

  beforeEach(() => {
    searchRepository = {
      searchMessages: jest.fn(),
    };
    searchService = new SearchService(searchRepository);
  });

  describe('generateSnippet', () => {
    it('returns empty string if content is empty', () => {
      expect(generateSnippet('', ['foo'])).toBe('');
    });

    it('highlights matching terms with <b>...</b>', () => {
      const content = 'The quick brown fox jumps over the lazy dog';
      const snippet = generateSnippet(content, ['fox', 'dog']);
      expect(snippet).toContain('<b>fox</b>');
      expect(snippet).toContain('<b>dog</b>');
    });

    it('is case-insensitive for highlighting while preserving original case', () => {
      const content = 'Docker Setup Guide for Production';
      const snippet = generateSnippet(content, ['docker', 'setup']);
      expect(snippet).toContain('<b>Docker</b>');
      expect(snippet).toContain('<b>Setup</b>');
    });

    it('truncates and ellipses long content centered around first match', () => {
      const prefix = 'A'.repeat(80);
      const suffix = 'B'.repeat(80);
      const content = `${prefix} distinctive-term ${suffix}`;
      const snippet = generateSnippet(content, ['distinctive-term']);
      expect(snippet).toContain('<b>distinctive-term</b>');
      expect(snippet.startsWith('...')).toBe(true);
      expect(snippet.endsWith('...')).toBe(true);
    });
  });

  describe('calculateRank', () => {
    it('returns 0 for empty content or terms', () => {
      expect(calculateRank('', ['term'])).toBe(0);
      expect(calculateRank('some content', [])).toBe(0);
    });

    it('calculates higher rank for multiple term occurrences', () => {
      const rank1 = calculateRank('hello world', ['hello']);
      const rank2 = calculateRank('hello hello world', ['hello']);
      expect(rank2).toBeGreaterThan(rank1);
    });
  });

  describe('searchMessages', () => {
    it('calls repository with parsed terms and offset, returning structured results DTO', async () => {
      const userId = '11111111-1111-4111-8111-111111111111';
      searchRepository.searchMessages.mockResolvedValue({
        totalCount: 1,
        rows: [
          {
            id: 'm-1',
            channel_id: 'ch-1',
            channel_name: 'general',
            community_id: 'com-1',
            community_name: 'Engineering',
            sender_id: 'u-1',
            sender_username: 'alice_dev',
            sender_display_name: 'Alice',
            sender_avatar_url: null,
            content: 'Please check the deployment instructions.',
            created_at: new Date('2026-11-15T10:00:00.000Z'),
          },
        ],
      });

      const response = await searchService.searchMessages(userId, {
        q: 'deployment instructions',
        page: 1,
        limit: 10,
      });

      expect(searchRepository.searchMessages).toHaveBeenCalledWith({
        userId,
        terms: ['deployment', 'instructions'],
        channelId: undefined,
        communityId: undefined,
        limit: 10,
        offset: 0,
      });

      expect(response.query).toBe('deployment instructions');
      expect(response.totalMatches).toBe(1);
      expect(response.page).toBe(1);
      expect(response.limit).toBe(10);
      expect(typeof response.executionTimeMs).toBe('number');
      expect(response.results).toHaveLength(1);
      expect(response.results[0]).toMatchObject({
        id: 'm-1',
        channelId: 'ch-1',
        channelName: 'general',
        communityId: 'com-1',
        communityName: 'Engineering',
        content: 'Please check the deployment instructions.',
        createdAt: '2026-11-15T10:00:00.000Z',
      });
      expect(response.results[0].snippet).toContain('<b>deployment</b>');
      expect(response.results[0].snippet).toContain('<b>instructions</b>');
      expect(response.results[0].sender).toEqual({
        id: 'u-1',
        username: 'alice_dev',
        displayName: 'Alice',
        avatarUrl: null,
      });
    });

    it('returns empty results array when no matches are found', async () => {
      const userId = '11111111-1111-4111-8111-111111111111';
      searchRepository.searchMessages.mockResolvedValue({
        totalCount: 0,
        rows: [],
      });

      const response = await searchService.searchMessages(userId, {
        q: 'nonexistentterm',
      });

      expect(response.totalMatches).toBe(0);
      expect(response.results).toEqual([]);
      expect(response.executionTimeMs).toBeGreaterThanOrEqual(0);
    });
  });
});
