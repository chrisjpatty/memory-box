/**
 * Twitter Syndication API client.
 *
 * Uses the public cdn.syndication.twimg.com endpoint (no auth required)
 * to fetch rich tweet data including video URLs, entity expansion,
 * verification status, and timestamps.
 */

// --- Types ---

export interface SyndicationUser {
  id_str: string;
  name: string;
  screen_name: string;
  is_blue_verified: boolean;
  profile_image_url_https: string;
  verified: boolean;
}

export interface SyndicationVideoVariant {
  content_type: string;
  bitrate?: number;
  url: string;
}

export interface SyndicationMediaDetail {
  type: 'photo' | 'video' | 'animated_gif';
  media_url_https: string;
  display_url?: string;
  expanded_url?: string;
  url?: string; // t.co URL for this media
  video_info?: {
    duration_millis: number;
    variants: SyndicationVideoVariant[];
    aspect_ratio?: number[];
  };
  original_info?: { height: number; width: number };
  ext_media_availability?: { status: string };
}

export interface SyndicationEntityUrl {
  url: string;          // t.co shortlink
  expanded_url: string; // full URL
  display_url: string;  // truncated display form
  indices: [number, number];
}

export interface SyndicationTweet {
  __typename?: string;
  id_str: string;
  text: string;
  display_text_range?: [number, number];
  created_at?: string;
  favorite_count?: number;
  user: SyndicationUser;
  entities?: {
    urls?: SyndicationEntityUrl[];
    media?: { url: string; expanded_url?: string; indices: [number, number] }[];
    hashtags?: { text: string }[];
    user_mentions?: { screen_name: string }[];
  };
  mediaDetails?: SyndicationMediaDetail[];
  lang?: string;
}

// --- API ---

/**
 * Fetch tweet data from the public syndication API.
 * Returns null on any failure (timeout, non-200, parse error).
 */
export async function fetchTweetSyndication(tweetId: string): Promise<SyndicationTweet | null> {
  try {
    const res = await fetch(
      `https://cdn.syndication.twimg.com/tweet-result?id=${tweetId}&token=0`,
      {
        headers: { 'User-Agent': 'MemoryBox/1.0' },
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.id_str) return null;
    return data as SyndicationTweet;
  } catch {
    return null;
  }
}

// --- Helpers ---

/**
 * Select the highest-bitrate video/mp4 variant URL.
 * Returns empty string if no suitable variant found.
 */
export function bestVideoUrl(variants: SyndicationVideoVariant[]): string {
  const mp4s = variants.filter(v => v.content_type === 'video/mp4' && v.bitrate != null);
  if (mp4s.length === 0) return '';
  mp4s.sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));
  return mp4s[0].url;
}

/**
 * Build clean tweet text from syndication data:
 * - Trims media URL suffixes using display_text_range
 * - Replaces t.co URLs with their expanded forms
 * - Removes t.co URLs that reference media attachments
 */
export function buildCleanTweetText(tweet: SyndicationTweet): string {
  let text = tweet.text;

  // Trim to display range (removes trailing media t.co URLs)
  if (tweet.display_text_range) {
    text = text.slice(tweet.display_text_range[0], tweet.display_text_range[1]);
  }

  // Collect media t.co URLs for removal
  const mediaTcoUrls = new Set<string>();
  if (tweet.entities?.media) {
    for (const m of tweet.entities.media) {
      mediaTcoUrls.add(m.url);
    }
  }

  // Replace entity URLs with expanded forms, remove media URLs
  if (tweet.entities?.urls) {
    for (const entity of tweet.entities.urls) {
      if (mediaTcoUrls.has(entity.url)) {
        text = text.replace(entity.url, '');
      } else {
        text = text.replace(entity.url, entity.expanded_url);
      }
    }
  }

  // Remove any remaining media t.co URLs that weren't in entities.urls
  for (const tco of mediaTcoUrls) {
    text = text.split(tco).join('');
  }

  return text.replace(/\n{3,}/g, '\n\n').trim();
}
