import type { UrlHandler, UrlHandlerResult } from './index';

const API_BASE = 'https://api.twitter.com';

// Standard tweet fields and expansions for rich data
const TWEET_FIELDS = 'author_id,created_at,public_metrics,entities,attachments,referenced_tweets,conversation_id,context_annotations,note_tweet';
const EXPANSIONS = 'author_id,attachments.media_keys,referenced_tweets.id,referenced_tweets.id.author_id';
const USER_FIELDS = 'name,username,verified,verified_type,profile_image_url,description';
const MEDIA_FIELDS = 'url,preview_image_url,type,alt_text,width,height';

/**
 * Thrown when Twitter returns 429 due to rate limiting.
 * Contains the Unix timestamp when the rate limit resets.
 */
export class TwitterRateLimitError extends Error {
  resetAt: number;
  constructor(resetAt: number) {
    super(`Twitter API rate limited. Resets at ${new Date(resetAt * 1000).toISOString()}`);
    this.resetAt = resetAt;
  }
}

export async function twitterFetch(path: string, token: string): Promise<any> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'User-Agent': 'MemoryBox/1.0',
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (res.status === 429) {
    const resetHeader = res.headers.get('x-rate-limit-reset');
    const resetAt = resetHeader ? parseInt(resetHeader) : Math.floor(Date.now() / 1000) + 900;
    throw new TwitterRateLimitError(resetAt);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Twitter API ${res.status}: ${path} — ${body.slice(0, 200)}`);
  }
  return res.json();
}

/** Build query string for tweet expansions */
export function tweetExpansionParams(): string {
  return new URLSearchParams({
    'tweet.fields': TWEET_FIELDS,
    'expansions': EXPANSIONS,
    'user.fields': USER_FIELDS,
    'media.fields': MEDIA_FIELDS,
  }).toString();
}

/** Parse a tweet URL into its ID and author username */
export function parseTweetUrl(url: URL): { username: string; tweetId: string } | null {
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length >= 3 && parts[1] === 'status') {
    return { username: parts[0], tweetId: parts[2] };
  }
  return null;
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

/** Get the best available Twitter token (env var first, then stored) */
async function resolveToken(): Promise<string | undefined> {
  if (process.env.TWITTER_BEARER_TOKEN) return process.env.TWITTER_BEARER_TOKEN;
  try {
    const { getTwitterToken } = await import('../../import/twitter-token-store');
    return (await getTwitterToken()) || undefined;
  } catch {
    return undefined;
  }
}

interface TweetData {
  id: string;
  text: string;
  author_id?: string;
  created_at?: string;
  public_metrics?: {
    retweet_count: number;
    reply_count: number;
    like_count: number;
    quote_count: number;
    bookmark_count?: number;
  };
  entities?: {
    urls?: { url: string; expanded_url: string; display_url: string }[];
    mentions?: { username: string }[];
    hashtags?: { tag: string }[];
  };
  attachments?: { media_keys?: string[] };
  referenced_tweets?: { type: string; id: string }[];
  conversation_id?: string;
  context_annotations?: { entity?: { name: string } }[];
  note_tweet?: { text: string };
}

interface IncludesData {
  users?: {
    id: string;
    name: string;
    username: string;
    verified?: boolean;
    verified_type?: string;
    profile_image_url?: string;
    description?: string;
  }[];
  media?: {
    media_key: string;
    type: string;
    url?: string;
    preview_image_url?: string;
    alt_text?: string;
    width?: number;
    height?: number;
  }[];
  tweets?: TweetData[];
}

/** Build markdown from a tweet and its includes */
export function buildTweetMarkdown(
  tweet: TweetData,
  includes: IncludesData,
): { markdown: string; author: { name: string; username: string; verified?: boolean } | null; mediaUrls: string[] } {
  const author = includes.users?.find((u) => u.id === tweet.author_id) || null;
  const tweetText = tweet.note_tweet?.text || tweet.text;

  // Resolve t.co URLs to their expanded forms
  let resolvedText = tweetText;
  if (tweet.entities?.urls) {
    for (const urlEntity of tweet.entities.urls) {
      if (urlEntity.url && urlEntity.expanded_url) {
        resolvedText = resolvedText.replace(urlEntity.url, urlEntity.expanded_url);
      }
    }
  }

  const sections: string[] = [];

  if (author) {
    sections.push(`# ${author.name} (@${author.username})`);
  }
  sections.push('');
  sections.push(resolvedText);
  sections.push('');

  // Metrics
  const m = tweet.public_metrics;
  if (m) {
    const parts = [
      `${formatCount(m.like_count)} likes`,
      `${formatCount(m.retweet_count)} retweets`,
      `${formatCount(m.reply_count)} replies`,
      `${formatCount(m.quote_count)} quotes`,
    ];
    if (m.bookmark_count !== undefined) {
      parts.push(`${formatCount(m.bookmark_count)} bookmarks`);
    }
    sections.push(`**${parts.join(' · ')}**`);
  }

  if (tweet.created_at) {
    sections.push(`**Posted:** ${new Date(tweet.created_at).toLocaleString()}`);
  }
  sections.push('');

  // Media
  const mediaUrls: string[] = [];
  if (tweet.attachments?.media_keys && includes.media) {
    const tweetMedia = tweet.attachments.media_keys
      .map((key) => includes.media!.find((m) => m.media_key === key))
      .filter(Boolean);

    if (tweetMedia.length > 0) {
      sections.push('---', '');
      for (const media of tweetMedia) {
        if (!media) continue;
        const url = media.url || media.preview_image_url;
        if (url) {
          mediaUrls.push(url);
          sections.push(`![${media.alt_text || media.type}](${url})`, '');
        }
      }
    }
  }

  // Referenced tweets (quotes, replies)
  if (tweet.referenced_tweets && includes.tweets) {
    for (const ref of tweet.referenced_tweets) {
      const refTweet = includes.tweets.find((t) => t.id === ref.id);
      if (!refTweet) continue;

      const refAuthor = includes.users?.find((u) => u.id === refTweet.author_id);
      const label =
        ref.type === 'quoted'
          ? 'Quoted Tweet'
          : ref.type === 'replied_to'
            ? 'Replying To'
            : 'Referenced Tweet';

      sections.push('---', '', `### ${label}`, '');
      if (refAuthor) {
        sections.push(`**${refAuthor.name} (@${refAuthor.username})**`);
      }
      const refText = refTweet.note_tweet?.text || refTweet.text;
      sections.push('', `> ${refText.replace(/\n/g, '\n> ')}`, '');
    }
  }

  return { markdown: sections.join('\n'), author, mediaUrls };
}

async function handleTweet(tweetId: string, url: URL): Promise<UrlHandlerResult> {
  const token = await resolveToken();
  if (!token) {
    throw new Error('No Twitter token available — falling through to generic handler');
  }

  const params = tweetExpansionParams();
  const response = await twitterFetch(`/2/tweets/${tweetId}?${params}`, token);

  const tweet: TweetData = response.data;
  if (!tweet) throw new Error(`Tweet ${tweetId} not found`);

  const includes: IncludesData = response.includes || {};
  const { markdown, author, mediaUrls } = buildTweetMarkdown(tweet, includes);

  const tweetText = tweet.note_tweet?.text || tweet.text;

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

  // Determine category based on tweet type
  let category = 'tweet';
  if (tweet.referenced_tweets?.some((r) => r.type === 'replied_to')) {
    category = 'reply';
    tags.push('reply');
  }
  if (tweet.conversation_id && tweet.conversation_id !== tweet.id) {
    tags.push('thread');
  }

  const metrics = tweet.public_metrics;

  return {
    markdown: markdown.slice(0, 200_000),
    title: author
      ? `@${author.username}: ${tweetText.slice(0, 100)}${tweetText.length > 100 ? '…' : ''}`
      : `Tweet: ${tweetText.slice(0, 100)}`,
    description: tweetText.slice(0, 300),
    tags: [...new Set(tags)],
    category,
    metadata: {
      tweetId: tweet.id,
      authorName: author?.name || '',
      authorUsername: author?.username || '',
      authorVerified: author?.verified ? 'true' : 'false',
      conversationId: tweet.conversation_id || '',
      likes: String(metrics?.like_count || 0),
      retweets: String(metrics?.retweet_count || 0),
      replies: String(metrics?.reply_count || 0),
      quotes: String(metrics?.quote_count || 0),
      bookmarks: String(metrics?.bookmark_count || 0),
      createdAt: tweet.created_at || '',
      hasMedia: String(mediaUrls.length > 0),
      mediaCount: String(mediaUrls.length),
      url: url.href,
      ...(mediaUrls.length > 0 ? { mediaUrls: mediaUrls.join(', ') } : {}),
    },
  };
}

/** Check if a URL string points to a tweet on twitter.com or x.com */
export function isTweetUrl(url: string): boolean {
  try {
    const parsed = new URL(url.trim());
    if (!twitterHandler.match(parsed)) return false;
    return !!parseTweetUrl(parsed);
  } catch {
    return false;
  }
}

// --- Main handler export ---

export const twitterHandler: UrlHandler = {
  name: 'twitter',

  match(url: URL): boolean {
    return (
      url.hostname === 'twitter.com' ||
      url.hostname === 'www.twitter.com' ||
      url.hostname === 'x.com' ||
      url.hostname === 'www.x.com'
    );
  },

  async fetch(url: URL): Promise<UrlHandlerResult> {
    const parsed = parseTweetUrl(url);
    if (!parsed) {
      throw new Error(`Could not parse tweet URL: ${url.href} — falling through to generic`);
    }
    return handleTweet(parsed.tweetId, url);
  },
};
