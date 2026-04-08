import { query } from '../db';
import { twitterFetch, tweetExpansionParams } from '../pipeline/url-handlers/twitter';
import { getTwitterToken, getTwitterUserId } from './twitter-token-store';
// @ts-ignore — no type declarations for yauzl-promise
import * as yauzl from 'yauzl-promise';

// --- Types ---

export interface BookmarkedTweet {
  id: string;
  url: string;
  text: string;
  authorName: string;
  authorUsername: string;
  createdAt: string;
  metrics: { likes: number; retweets: number; replies: number; bookmarks: number };
  hasMedia: boolean;
  alreadyImported: boolean;
  existingMemoryId?: string;
}

export interface BookmarkFolder {
  id: string;
  name: string;
}

export interface DiscoverBookmarksResult {
  bookmarks: BookmarkedTweet[];
  folders: BookmarkFolder[];
  totalBookmarks: number;
  alreadyImported: number;
  newCount: number;
  /** True when results are ID-only (folder/upload view) — no per-tweet detail available */
  idsOnly?: boolean;
  /** Warning message shown to the user (e.g. API truncation) */
  warning?: string;
}

// --- Discovery ---

/**
 * Fetch bookmark folders for the authenticated user.
 * Returns empty array if the API doesn't support folders or they aren't available.
 */
export async function discoverBookmarkFolders(token?: string): Promise<BookmarkFolder[]> {
  const resolvedToken = token || (await getTwitterToken()) || undefined;
  if (!resolvedToken) throw new Error('No Twitter token available');

  const userId = await resolveUserId(resolvedToken);

  try {
    const response = await twitterFetch(
      `/2/users/${userId}/bookmarks/folders`,
      resolvedToken,
    );
    if (!response.data || !Array.isArray(response.data)) return [];
    return response.data.map((folder: any) => ({
      id: folder.id,
      name: folder.name || folder.title || 'Untitled',
    }));
  } catch (err: any) {
    if (err.message?.includes('404') || err.message?.includes('403')) {
      return [];
    }
    throw err;
  }
}

/**
 * Fetch all bookmarks for the authenticated user, optionally from a specific folder.
 */
export async function discoverBookmarks(
  folderId?: string,
  token?: string,
): Promise<DiscoverBookmarksResult> {
  const resolvedToken = token || (await getTwitterToken()) || undefined;
  if (!resolvedToken) throw new Error('No Twitter token available');

  const userId = await resolveUserId(resolvedToken);

  if (folderId) {
    return discoverFolderBookmarks(userId, folderId, resolvedToken);
  }
  return discoverAllBookmarks(userId, resolvedToken);
}

/**
 * Folder path: paginate to collect all tweet IDs (lightweight, no hydration).
 */
async function discoverFolderBookmarks(
  userId: string,
  folderId: string,
  token: string,
): Promise<DiscoverBookmarksResult> {
  const tweetIds: string[] = [];
  let paginationToken: string | undefined;
  let gotPagination = false;

  while (true) {
    const path = paginationToken
      ? `/2/users/${userId}/bookmarks/folders/${folderId}?pagination_token=${paginationToken}`
      : `/2/users/${userId}/bookmarks/folders/${folderId}`;

    const response = await twitterFetch(path, token);

    if (response.data && Array.isArray(response.data)) {
      for (const item of response.data) {
        tweetIds.push(item.id);
      }
    }

    if (response.meta?.next_token) {
      paginationToken = response.meta.next_token;
      gotPagination = true;
    } else {
      break;
    }
  }

  const result = await buildIdsOnlyResult(tweetIds);

  // Warn if results look truncated (got items but no pagination)
  if (tweetIds.length > 0 && !gotPagination) {
    result.warning =
      `The X API returned ${tweetIds.length} bookmarks from this folder without pagination. ` +
      `Your folder may contain more — consider using a Twitter data export for complete results.`;
  }

  return result;
}

/**
 * Main bookmarks path: full expansions included in each page.
 */
async function discoverAllBookmarks(
  userId: string,
  token: string,
): Promise<DiscoverBookmarksResult> {
  const expansionParams = tweetExpansionParams();
  const allTweets: any[] = [];
  const allIncludes: { users: any[]; media: any[]; tweets: any[] } = {
    users: [],
    media: [],
    tweets: [],
  };
  let paginationToken: string | undefined;
  let gotPagination = false;

  while (true) {
    const pageParams = paginationToken
      ? `${expansionParams}&max_results=100&pagination_token=${paginationToken}`
      : `${expansionParams}&max_results=100`;

    const response = await twitterFetch(
      `/2/users/${userId}/bookmarks?${pageParams}`,
      token,
    );

    if (response.data && Array.isArray(response.data)) {
      allTweets.push(...response.data);
    }

    if (response.includes) {
      if (response.includes.users) allIncludes.users.push(...response.includes.users);
      if (response.includes.media) allIncludes.media.push(...response.includes.media);
      if (response.includes.tweets) allIncludes.tweets.push(...response.includes.tweets);
    }

    if (response.meta?.next_token) {
      paginationToken = response.meta.next_token;
      gotPagination = true;
    } else {
      break;
    }
  }

  // Build canonical tweet URLs for dedup
  const tweetUrls = allTweets.map((tweet: any) => {
    const author = allIncludes.users.find((u: any) => u.id === tweet.author_id);
    const username = author?.username || 'i';
    return `https://x.com/${username}/status/${tweet.id}`;
  });

  // Batch dedup check against both x.com and twitter.com variants
  const altUrls = tweetUrls.map((url) =>
    url.replace('https://x.com/', 'https://twitter.com/'),
  );
  const allCheckUrls = [...tweetUrls, ...altUrls];

  const dedupResult = await query(
    'SELECT id, source_url FROM memories WHERE source_url = ANY($1)',
    [allCheckUrls],
  );
  const importedMap = new Map<string, string>();
  for (const row of dedupResult.rows) {
    const normalized = row.source_url.replace(
      'https://twitter.com/',
      'https://x.com/',
    );
    importedMap.set(normalized, row.id);
  }

  const bookmarks: BookmarkedTweet[] = allTweets.map((tweet: any, i: number) => {
    const author = allIncludes.users.find((u: any) => u.id === tweet.author_id);
    const tweetUrl = tweetUrls[i];
    const existingMemoryId = importedMap.get(tweetUrl);
    const metrics = tweet.public_metrics || {};
    const text = tweet.note_tweet?.text || tweet.text;

    return {
      id: tweet.id,
      url: tweetUrl,
      text: text.slice(0, 280),
      authorName: author?.name || '',
      authorUsername: author?.username || '',
      createdAt: tweet.created_at || '',
      metrics: {
        likes: metrics.like_count || 0,
        retweets: metrics.retweet_count || 0,
        replies: metrics.reply_count || 0,
        bookmarks: metrics.bookmark_count || 0,
      },
      hasMedia: !!(tweet.attachments?.media_keys?.length),
      alreadyImported: !!existingMemoryId,
      existingMemoryId,
    };
  });

  // Try to get folders (best effort)
  let folders: BookmarkFolder[] = [];
  try {
    folders = await discoverBookmarkFolders(token);
  } catch {
    /* non-critical */
  }

  const alreadyImported = bookmarks.filter((b) => b.alreadyImported).length;

  const result: DiscoverBookmarksResult = {
    bookmarks,
    folders,
    totalBookmarks: bookmarks.length,
    alreadyImported,
    newCount: bookmarks.length - alreadyImported,
  };

  // Warn if results look truncated
  if (allTweets.length > 0 && !gotPagination) {
    result.warning =
      `The X API returned ${allTweets.length} bookmarks without pagination — your API plan may limit results. ` +
      `For complete bookmarks, use a Twitter data export (Settings > Your Account > Download an archive).`;
  }

  return result;
}

// --- Twitter Data Export (zip upload) ---

/**
 * Parse a Twitter data export zip and extract bookmark tweet IDs.
 *
 * Twitter exports contain `data/bookmarks.js` with the format:
 *   window.YTD.bookmarks.part0 = [ { "bookmarks": { "tweetId": "123" } }, ... ]
 */
export async function parseBookmarksFromExport(
  zipBuffer: Buffer,
): Promise<DiscoverBookmarksResult> {
  const zip = await yauzl.fromBuffer(zipBuffer);
  let bookmarksJs: string | null = null;

  for await (const entry of zip) {
    // The file is typically at data/bookmarks.js or bookmarks.js
    if (
      entry.filename === 'data/bookmarks.js' ||
      entry.filename === 'bookmarks.js'
    ) {
      const stream = await entry.openReadStream();
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      bookmarksJs = Buffer.concat(chunks).toString('utf-8');
      break;
    }
  }

  if (!bookmarksJs) {
    throw new Error(
      'Could not find data/bookmarks.js in the zip. Make sure this is a Twitter/X data export.',
    );
  }

  // Strip the `window.YTD.bookmarks.part0 = ` prefix to get valid JSON
  const jsonStart = bookmarksJs.indexOf('[');
  if (jsonStart === -1) {
    throw new Error('Could not parse bookmarks.js — unexpected format.');
  }
  const json = JSON.parse(bookmarksJs.slice(jsonStart));

  // Extract tweet IDs — format: [{ "bookmarks": { "tweetId": "123" } }, ...]
  // Some exports may use a slightly different structure
  const tweetIds: string[] = [];
  for (const entry of json) {
    const id =
      entry?.bookmarks?.tweetId ||
      entry?.bookmark?.tweetId ||
      entry?.tweetId;
    if (id) tweetIds.push(id);
  }

  if (tweetIds.length === 0) {
    throw new Error('No bookmarks found in the export file.');
  }

  return buildIdsOnlyResult(tweetIds);
}

// --- Shared helpers ---

/**
 * Build a lightweight discovery result from just tweet IDs (no hydration).
 */
async function buildIdsOnlyResult(
  tweetIds: string[],
): Promise<DiscoverBookmarksResult> {
  const tweetUrls = tweetIds.map((id) => `https://x.com/i/status/${id}`);

  // Dedup: match any URL ending in /status/{id}
  const idPattern = tweetIds.map((id) => `%/status/${id}`);
  const dedupResult = await query(
    'SELECT id, source_url FROM memories WHERE source_url LIKE ANY($1)',
    [idPattern],
  );
  const importedIds = new Set<string>();
  for (const row of dedupResult.rows) {
    const match = row.source_url.match(/\/status\/(\d+)/);
    if (match) importedIds.add(match[1]);
  }

  const bookmarks: BookmarkedTweet[] = tweetIds.map((tweetId, i) => ({
    id: tweetId,
    url: tweetUrls[i],
    text: '',
    authorName: '',
    authorUsername: '',
    createdAt: '',
    metrics: { likes: 0, retweets: 0, replies: 0, bookmarks: 0 },
    hasMedia: false,
    alreadyImported: importedIds.has(tweetId),
    existingMemoryId: undefined,
  }));

  const alreadyImported = bookmarks.filter((b) => b.alreadyImported).length;

  return {
    bookmarks,
    folders: [],
    totalBookmarks: bookmarks.length,
    alreadyImported,
    newCount: bookmarks.length - alreadyImported,
    idsOnly: true,
  };
}

async function resolveUserId(token: string): Promise<string> {
  const storedId = await getTwitterUserId();
  if (storedId) return storedId;

  const response = await twitterFetch('/2/users/me', token);
  return response.data.id;
}
