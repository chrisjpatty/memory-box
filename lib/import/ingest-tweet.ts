/**
 * Direct tweet ingestion — bypasses the URL/classification pipeline entirely.
 *
 * Fetches tweet data via the Twitter API, builds structured metadata,
 * downloads media, chunks, embeds (text + images), and stores as content_type: 'tweet'.
 */
import {
  twitterFetch,
  tweetExpansionParams,
  buildTweetMarkdown,
  parseTweetUrl,
  TwitterRateLimitError,
} from '../pipeline/url-handlers/twitter';
import { chunkText } from '../pipeline/chunk';
import { getEmbeddingProvider } from '../pipeline/embed';
import { checkDuplicate, store } from '../pipeline/store';
import { contentHash } from '../pipeline/detect';
import { storeMedia } from '../pipeline/media';
import { getTwitterToken } from './twitter-token-store';
import { query } from '../db';
import type { IngestResult, ClassificationResult } from '../types';

export { TwitterRateLimitError };

/**
 * Ingest a tweet by ID or URL. Fetches full data from the API,
 * stores as a first-class 'tweet' content type with structured metadata.
 */
export async function ingestTweet(
  tweetIdOrUrl: string,
  token?: string,
): Promise<IngestResult> {
  const resolvedToken =
    token ||
    process.env.TWITTER_BEARER_TOKEN ||
    (await getTwitterToken()) ||
    undefined;
  if (!resolvedToken) throw new Error('No Twitter token available');

  // Parse tweet ID from URL if needed
  let tweetId = tweetIdOrUrl;
  try {
    const parsed = parseTweetUrl(new URL(tweetIdOrUrl));
    if (parsed) tweetId = parsed.tweetId;
  } catch {
    // Not a URL — assume raw tweet ID
  }

  // Dedup check by tweet URL pattern
  const canonicalUrl = `https://x.com/i/status/${tweetId}`;
  const idPattern = `%/status/${tweetId}`;
  const existingByPattern = await checkDuplicateByPattern(idPattern);
  if (existingByPattern) {
    return {
      memoryId: existingByPattern,
      contentType: 'tweet',
      title: 'Duplicate',
      chunks: 0,
      deduplicated: true,
      existingMemoryId: existingByPattern,
    };
  }

  // Fetch full tweet data from API
  const params = tweetExpansionParams();
  const response = await twitterFetch(`/2/tweets/${tweetId}?${params}`, resolvedToken);

  const tweet = response.data;
  if (!tweet) throw new Error(`Tweet ${tweetId} not found`);

  const includes = response.includes || {};
  const { markdown, author, mediaUrls } = buildTweetMarkdown(tweet, includes);

  const tweetText = tweet.note_tweet?.text || tweet.text;

  // Build the canonical source URL with the real author username
  const sourceUrl = author
    ? `https://x.com/${author.username}/status/${tweetId}`
    : canonicalUrl;

  // Check for exact source URL dedup
  const dupId = await checkDuplicate(undefined, sourceUrl);
  if (dupId) {
    return {
      memoryId: dupId,
      contentType: 'tweet',
      title: 'Duplicate',
      chunks: 0,
      deduplicated: true,
      existingMemoryId: dupId,
    };
  }

  // Download and store media images locally
  const localMediaUrls: string[] = [];
  const imageBuffers: { mediaId: string; buffer: Buffer }[] = [];
  for (const mediaUrl of mediaUrls) {
    try {
      const res = await fetch(mediaUrl, { signal: AbortSignal.timeout(15_000) });
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        const ct = res.headers.get('content-type') || 'image/jpeg';
        const img = await storeMedia(buf, ct);
        localMediaUrls.push(`/api/media/${img.id}`);
        imageBuffers.push({ mediaId: img.id, buffer: img.buffer });
      } else {
        localMediaUrls.push(mediaUrl);
      }
    } catch {
      localMediaUrls.push(mediaUrl);
    }
  }

  // Download and store avatar
  let avatarUrl = '';
  const profileImageUrl = includes.users?.find((u: any) => u.id === tweet.author_id)?.profile_image_url;
  if (profileImageUrl) {
    try {
      const bigUrl = profileImageUrl.replace('_normal.', '_bigger.');
      const res = await fetch(bigUrl, { signal: AbortSignal.timeout(10_000) });
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        const ct = res.headers.get('content-type') || 'image/jpeg';
        const img = await storeMedia(buf, ct);
        avatarUrl = `/api/media/${img.id}`;
      }
    } catch { /* skip */ }
  }

  // Build tags
  const tags: string[] = ['twitter', 'tweet'];
  if (author) tags.push(author.username.toLowerCase());
  if (tweet.entities?.hashtags) {
    for (const ht of tweet.entities.hashtags) {
      tags.push(ht.tag.toLowerCase());
    }
  }
  if (tweet.context_annotations) {
    for (const ann of tweet.context_annotations.slice(0, 5)) {
      if (ann.entity?.name) tags.push(ann.entity.name.toLowerCase());
    }
  }

  // Determine category
  let category = 'tweet';
  if (tweet.referenced_tweets?.some((r: any) => r.type === 'replied_to')) {
    category = 'reply';
    tags.push('reply');
  }
  if (tweet.conversation_id && tweet.conversation_id !== tweet.id) {
    tags.push('thread');
  }

  const metrics = tweet.public_metrics || {};

  const classification: ClassificationResult = {
    contentType: 'tweet',
    title: author
      ? `@${author.username}: ${tweetText.slice(0, 100)}${tweetText.length > 100 ? '…' : ''}`
      : `Tweet: ${tweetText.slice(0, 100)}`,
    tags: [...new Set(tags)],
    category,
    summary: tweetText.slice(0, 300),
    metadata: {
      tweetId: tweet.id,
      authorName: author?.name || '',
      handle: author?.username || '',
      avatarUrl,
      verified: author?.verified ? 'true' : 'false',
      conversationId: tweet.conversation_id || '',
      likes: String(metrics.like_count || 0),
      retweets: String(metrics.retweet_count || 0),
      replies: String(metrics.reply_count || 0),
      quotes: String(metrics.quote_count || 0),
      bookmarks: String(metrics.bookmark_count || 0),
      views: String(metrics.impression_count || 0),
      createdAt: tweet.created_at || '',
      url: sourceUrl,
      ...(localMediaUrls.length > 0 ? { mediaUrls: localMediaUrls.join(', ') } : {}),
    },
  };

  // Chunk and embed text
  const embedder = getEmbeddingProvider();
  const chunks = await chunkText(markdown, 'tweet');
  const embeddings = await embedder.embed(chunks);

  // Embed images
  const imageEmbeddings: { mediaId: string; embedding: number[] }[] = [];
  for (const { mediaId, buffer } of imageBuffers) {
    try {
      const embedding = await embedder.embedImage(buffer.toString('base64'));
      imageEmbeddings.push({ mediaId, embedding });
    } catch { /* skip */ }
  }

  // Store
  const hash = contentHash(markdown);
  const result = await store({
    content: tweetText,
    classification,
    chunks,
    embeddings,
    sourceUrl,
    markdown,
    imageEmbeddings: imageEmbeddings.length > 0 ? imageEmbeddings : undefined,
    contentHash: hash,
  });

  return {
    memoryId: result.memoryId,
    contentType: 'tweet',
    title: result.title,
    chunks: result.chunks,
  };
}

async function checkDuplicateByPattern(pattern: string): Promise<string | null> {
  const result = await query(
    'SELECT id FROM memories WHERE source_url LIKE $1 LIMIT 1',
    [pattern],
  );
  return result.rows[0]?.id || null;
}
