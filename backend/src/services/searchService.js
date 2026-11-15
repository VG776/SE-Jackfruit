function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function generateSnippet(content, terms) {
  if (!content) return '';
  if (!terms || terms.length === 0) return content.slice(0, 150);

  // Find position of the earliest matching term
  const lowerContent = content.toLowerCase();
  let firstIdx = -1;
  for (const term of terms) {
    const idx = lowerContent.indexOf(term.toLowerCase());
    if (idx !== -1 && (firstIdx === -1 || idx < firstIdx)) {
      firstIdx = idx;
    }
  }

  let start = 0;
  let end = content.length;
  if (firstIdx !== -1 && content.length > 150) {
    start = Math.max(0, firstIdx - 40);
    end = Math.min(content.length, start + 120);
  }

  const hasLeading = start > 0;
  const hasTrailing = end < content.length;

  let snippet = content.slice(start, end);

  // Highlight all matched terms with <b>...</b>
  for (const term of terms) {
    const regex = new RegExp(`(${escapeRegex(term)})`, 'gi');
    snippet = snippet.replace(regex, '<b>$1</b>');
  }

  if (hasLeading) snippet = '...' + snippet;
  if (hasTrailing) snippet = snippet + '...';

  return snippet;
}

function calculateRank(content, terms) {
  if (!content || !terms || terms.length === 0) return 0;
  const lower = content.toLowerCase();
  let matchCount = 0;
  for (const term of terms) {
    let pos = 0;
    while ((pos = lower.indexOf(term.toLowerCase(), pos)) !== -1) {
      matchCount += 1;
      pos += term.length;
    }
  }
  return Number((Math.min(1, 0.1 * matchCount + 0.1 * terms.length)).toFixed(3));
}

class SearchService {
  constructor(searchRepository) {
    this.searchRepository = searchRepository;
  }

  async searchMessages(userId, { q, channelId, communityId, page = 1, limit = 20 }) {
    const startTime = Date.now();

    // Extract terms: split by whitespace, filter out empty strings
    const terms = q
      .trim()
      .split(/\s+/)
      .filter((term) => term.length > 0);

    const offset = (page - 1) * limit;

    const { totalCount, rows } = await this.searchRepository.searchMessages({
      userId,
      terms,
      channelId,
      communityId,
      limit,
      offset,
    });

    const executionTimeMs = Date.now() - startTime;

    const results = rows.map((row) => ({
      id: row.id,
      channelId: row.channel_id,
      channelName: row.channel_name,
      communityId: row.community_id,
      communityName: row.community_name,
      sender: {
        id: row.sender_id,
        username: row.sender_username,
        displayName: row.sender_display_name,
        avatarUrl: row.sender_avatar_url || null,
      },
      content: row.content,
      snippet: generateSnippet(row.content, terms),
      rank: calculateRank(row.content, terms),
      createdAt:
        row.created_at instanceof Date
          ? row.created_at.toISOString()
          : row.created_at,
    }));

    return {
      query: q,
      totalMatches: totalCount,
      page,
      limit,
      results,
      executionTimeMs,
    };
  }
}

module.exports = { SearchService, generateSnippet, calculateRank };
