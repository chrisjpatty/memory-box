/**
 * Content extraction: fetches/processes raw content into text for indexing.
 * Side effects: HTTP fetches. No database access (except media storage).
 */
import * as cheerio from 'cheerio';
import TurndownService from 'turndown';
import { tryUrlHandler } from './url-handlers';
import { isTweetUrl } from './url-handlers/twitter';
import { fetchTweetSyndication, buildCleanTweetText, bestVideoUrl } from './url-handlers/twitter-syndication';
import { resolveRelativeUrls } from './url-utils';
import { downloadAndLocalizeImages, storeMedia } from './media';
import { describeImage } from './vision';
import type { ClassificationResult } from '../types';
import type { LocalizedImage } from './media';

// Re-export for consumers that import from extract
export { resolveRelativeUrls } from './url-utils';

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
});

// --- Types ---

export interface ExtractionResult {
  /** Primary text content for indexing */
  text: string;
  /** Title extracted during extraction (may override classification) */
  title?: string;
  /** Description from page metadata */
  description?: string;
  /** Source URL (for URL content) */
  sourceUrl?: string;
  /** Cleaned HTML for iframe rendering */
  html?: string;
  /** Files to store in MinIO (images, media, etc.) */
  files?: { buffer: Buffer; filename: string; contentType: string }[];
  /** Images that were downloaded and stored via the media table (for embedding) */
  localizedImages?: LocalizedImage[];
  /** Extra metadata from extraction */
  metadata?: Record<string, string>;
  /** Extra tags from extraction */
  tags?: string[];
  /** Category override from extraction */
  category?: string;
  /** Classification override (for re-classification after text extraction, e.g. PDF) */
  reclassify?: boolean;
  /** Override content type (e.g. 'github', 'tweet') — promotes to first-class type */
  contentType?: string;
}

interface JinaReaderResponse {
  code: number;
  data: {
    content: string;
    title?: string;
    description?: string;
    url?: string;
    metadata?: Record<string, string | string[]>;
  };
}

async function fetchViaJina(url: string): Promise<{
  markdown: string;
  title: string;
  description: string;
  ogImage: string;
} | null> {
  try {
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'X-Return-Format': 'markdown',
    };
    if (process.env.JINA_API_KEY) {
      headers['Authorization'] = `Bearer ${process.env.JINA_API_KEY}`;
      headers['X-With-Generated-Alt'] = 'true';
    }

    const response = await fetch(`https://r.jina.ai/${url}`, {
      headers,
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) return null;

    const json = await response.json() as JinaReaderResponse;
    if (!json.data?.content) return null;

    const meta = json.data.metadata || {};
    const ogImage = (typeof meta['og:image'] === 'string' ? meta['og:image'] : '')
      || (typeof meta['twitter:image'] === 'string' ? meta['twitter:image'] : '');

    return {
      markdown: json.data.content.slice(0, 100_000),
      title: json.data.title || '',
      description: json.data.description || '',
      ogImage,
    };
  } catch {
    return null;
  }
}

function processHtml(rawHtml: string, url: string): {
  markdown: string;
  title: string;
  description: string;
  cleanHtml: string;
  ogImage: string;
} {
  const $ = cheerio.load(rawHtml);
  const title =
    $('meta[property="og:title"]').attr('content') ||
    $('title').text().trim() ||
    $('h1').first().text().trim() ||
    url;
  const description =
    $('meta[property="og:description"]').attr('content') ||
    $('meta[name="description"]').attr('content') ||
    '';
  const ogImage =
    $('meta[property="og:image"]').attr('content') ||
    $('meta[name="twitter:image"]').attr('content') ||
    '';

  $('script, noscript').remove();

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (href && !href.startsWith('#') && !href.startsWith('data:') && !href.startsWith('mailto:')) {
      try { new URL(href); } catch {
        try { $(el).attr('href', new URL(href, url).href); } catch { /* leave as-is */ }
      }
    }
  });
  $('[src]').each((_, el) => {
    const src = $(el).attr('src');
    if (src && !src.startsWith('data:')) {
      try { new URL(src); } catch {
        try { $(el).attr('src', new URL(src, url).href); } catch { /* leave as-is */ }
      }
    }
  });
  $('link[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (href) {
      try { new URL(href); } catch {
        try { $(el).attr('href', new URL(href, url).href); } catch { /* leave as-is */ }
      }
    }
  });

  const headContent = $('head').html() || '';
  if (!headContent.includes('<base')) {
    $('head').prepend(`<base href="${url}">`);
  }
  const cleanHtml = $.html().slice(0, 500_000);

  $('style, nav, footer, header, aside, iframe').remove();
  const bodyHtml = $('body').html() || $.html();
  const markdown = turndown.turndown(bodyHtml).slice(0, 100_000);

  return { markdown, title, description, cleanHtml, ogImage };
}

async function fetchStatic(url: string): Promise<{
  markdown: string;
  title: string;
  description: string;
  cleanHtml: string;
  ogImage: string;
}> {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'MemoryBox/1.0' },
    signal: AbortSignal.timeout(15_000),
  });
  const html = await response.text();
  return processHtml(html, url);
}

async function fetchHtmlSnapshot(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'MemoryBox/1.0' },
      signal: AbortSignal.timeout(10_000),
    });
    const html = await response.text();
    const { cleanHtml } = processHtml(html, url);
    return cleanHtml;
  } catch {
    return null;
  }
}

/** Find the first image URL in markdown content */
function firstMarkdownImage(md: string): string | null {
  const match = md.match(/!\[[^\]]*\]\(([^)]+)\)/);
  return match?.[1] || null;
}

/**
 * Parse structured tweet fields from Jina Reader markdown.
 * Jina returns X.com's SSR HTML as markdown with a consistent structure:
 *   - Author name and handle as linked text
 *   - Avatar as a profile image
 *   - Tweet body text
 *   - Media images as markdown images
 *   - Engagement stats as bare numbers after the tweet body
 */
function parseTweetFromJinaMarkdown(markdown: string, url: string): {
  tweetText: string;
  authorName: string;
  handle: string;
  avatarUrl: string;
  mediaUrls: string[];
  createdAt: string;
  views: string;
  replies: string;
  retweets: string;
  likes: string;
  bookmarks: string;
  engagements?: string;
} {
  // Author name: first linked text to a user profile after "Conversation"
  const authorNameMatch = markdown.match(/# Conversation\s+[\s\S]*?\[([^\]]+)\]\(https:\/\/x\.com\/\w+\)\s*\n\s*\[@(\w+)\]/);
  const authorName = authorNameMatch?.[1] || '';
  const handle = authorNameMatch?.[2] || '';

  // Avatar: profile image URL from twimg
  const avatarMatch = markdown.match(/\[!\[Image[^\]]*\]\((https:\/\/pbs\.twimg\.com\/profile_images\/[^)]+)\)/);
  const avatarUrl = avatarMatch?.[1]?.replace('_normal.', '_bigger.') || '';

  // Tweet text: the paragraph between the handle line and the first image/video or timestamp.
  // Lookahead matches: [![Image (linked image), ![Image (bare image/video thumb),
  // [Last edited, or [<digit> (timestamp/stats).
  const handlePattern = `\\[@${handle || '\\w+'}\\]`;
  const textMatch = markdown.match(new RegExp(
    handlePattern + '\\([^)]+\\)\\s*\\n\\n([\\s\\S]*?)(?=\\n\\n!\\[Image|\\n\\n\\[!\\[Image|\\n\\n\\[Last edited|\\n\\n\\[\\d)',
    'i',
  ));
  let tweetText = textMatch?.[1]?.trim() || '';

  // Clean markdown artifacts from tweet text
  tweetText = tweetText
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')              // strip markdown images
    .replace(/\[([^\]]+)\]\(https?:\/\/t\.co\/[^)]+\)/g, '$1') // [display](t.co/...) → display
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // Media: all twimg media URLs (photos and video thumbnails, not profile images)
  const mediaUrls: string[] = [];
  const mediaRegex = /\((https:\/\/pbs\.twimg\.com\/(?:media|amplify_video_thumb)\/[^)]+)\)/g;
  let match;
  while ((match = mediaRegex.exec(markdown)) !== null) {
    let mediaUrl = match[1];
    // Upgrade photos to large format (video thumbs don't use the name param)
    if (mediaUrl.includes('/media/')) {
      mediaUrl = mediaUrl.replace(/name=\w+/, 'name=large');
    }
    mediaUrls.push(mediaUrl);
  }

  // Timestamp: Jina renders as "[7:10 PM · Apr 8, 2026](link)"
  let createdAt = '';
  const tsMatch = markdown.match(/\[(\d{1,2}:\d{2}\s*[AP]M\s*·\s*[A-Za-z]{3}\s+\d{1,2},\s*\d{4})\]\(/i);
  if (tsMatch) {
    try {
      const cleaned = tsMatch[1].replace(/\s*·\s*/, ' ');
      createdAt = new Date(cleaned).toISOString();
    } catch { /* skip */ }
  }

  // Engagement stats: after the views line, X renders bare numbers on separate lines.
  // The count varies — tweets with zero engagement omit those stats entirely.
  // Order when present: replies, retweets, likes, bookmarks
  const viewsMatch = markdown.match(/([\d,]+[KMB]?)\s*Views?\]/i);
  const statsNums: string[] = [];
  const afterViews = markdown.match(/\[[\d,]+[KMB]?\s*Views?\][^\n]*\n([\s\S]*?)(?=\n##|\nRead \d|\n\[Show more)/i);
  if (afterViews) {
    const numMatches = afterViews[1].match(/\b(\d[\d,]*)\b/g);
    if (numMatches) statsNums.push(...numMatches.map((n) => n.replace(/,/g, '')));
  }

  // Parse views — handle suffixed values like "11K"
  let views = '0';
  if (viewsMatch) {
    const raw = viewsMatch[1].replace(/,/g, '');
    const suffixMatch = raw.match(/^(\d+(?:\.\d+)?)([KMB])$/i);
    if (suffixMatch) {
      const multiplier = { K: 1000, M: 1_000_000, B: 1_000_000_000 }[suffixMatch[2].toUpperCase()] || 1;
      views = String(Math.round(parseFloat(suffixMatch[1]) * multiplier));
    } else {
      views = raw;
    }
  }

  // If we have all 4 stats, map them to specific fields. Otherwise, sum as engagements.
  if (statsNums.length >= 4) {
    return { tweetText, authorName, handle, avatarUrl, mediaUrls, createdAt, views,
      replies: statsNums[0], retweets: statsNums[1], likes: statsNums[2], bookmarks: statsNums[3] };
  }
  const engagements = statsNums.reduce((sum, n) => sum + parseInt(n, 10), 0);
  return { tweetText, authorName, handle, avatarUrl, mediaUrls, createdAt, views,
    replies: '0', retweets: '0', likes: '0', bookmarks: '0',
    engagements: String(engagements) };
}

export async function extractUrl(url: string): Promise<ExtractionResult> {
  const trimmedUrl = url.trim();

  // Try site-specific handlers first (GitHub, etc.)
  const handlerResult = await tryUrlHandler(trimmedUrl);
  if (handlerResult) {
    let markdown = resolveRelativeUrls(handlerResult.markdown, trimmedUrl);
    const { markdown: localizedMd, images, replacements } = await downloadAndLocalizeImages(markdown);
    markdown = localizedMd;

    // Update metadata image URLs that were localized
    const metadata: Record<string, string> = { ...handlerResult.metadata, url: trimmedUrl };
    for (const [key, value] of Object.entries(metadata)) {
      if (typeof value === 'string' && replacements.has(value)) {
        metadata[key] = replacements.get(value)!;
      }
    }

    return {
      text: markdown,
      title: handlerResult.title,
      description: handlerResult.description,
      sourceUrl: trimmedUrl,
      html: handlerResult.cleanHtml,
      metadata,
      tags: handlerResult.tags,
      category: handlerResult.category,
      contentType: handlerResult.contentType,
      localizedImages: images,
    };
  }

  // Generic URL pipeline: Jina Reader → static fallback
  const rawFetched = await fetchViaJina(trimmedUrl) ?? await fetchStatic(trimmedUrl);
  const markdown = resolveRelativeUrls(rawFetched.markdown, trimmedUrl);

  // Tweet URLs: Jina for page content + syndication API for structured data
  if (isTweetUrl(trimmedUrl)) {
    const jinaTweet = parseTweetFromJinaMarkdown(markdown, trimmedUrl);
    const tweetIdMatch = trimmedUrl.match(/\/status\/(\d+)/);
    const tweetId = tweetIdMatch?.[1] || '';

    // Enrich with syndication API (video URLs, verification, clean text, entities)
    const syndication = tweetId ? await fetchTweetSyndication(tweetId) : null;

    // Prefer syndication for author info, fall back to Jina
    const authorName = syndication?.user?.name || jinaTweet.authorName;
    const handle = syndication?.user?.screen_name || jinaTweet.handle;
    const verified = syndication?.user?.is_blue_verified ?? false;
    const createdAt = syndication?.created_at || jinaTweet.createdAt || '';

    // Prefer syndication for clean text (with expanded URLs), fall back to Jina
    const cleanText = (syndication ? buildCleanTweetText(syndication) : null)
      || jinaTweet.tweetText || rawFetched.title || '';

    const title = handle
      ? `@${handle}: ${cleanText.replace(/\n+/g, ' ').slice(0, 100)}${cleanText.length > 100 ? '…' : ''}`
      : rawFetched.title;

    // Tweet text is the primary content — author info lives in metadata/title
    const searchParts: string[] = [];
    if (cleanText) searchParts.push(cleanText);

    // Build media lists from syndication (preferred) or Jina thumbnails
    const localizedImages: LocalizedImage[] = [];
    const localMediaUrls: string[] = [];
    const mediaTypes: string[] = [];
    const videoUrls: string[] = [];

    if (syndication?.mediaDetails?.length) {
      // Use syndication for typed media details
      const thumbResults = await Promise.all(
        syndication.mediaDetails.map(async (media) => {
          try {
            const res = await fetch(media.media_url_https, { signal: AbortSignal.timeout(15_000) });
            if (!res.ok) return null;
            const buf = Buffer.from(await res.arrayBuffer());
            const ct = res.headers.get('content-type') || 'image/jpeg';
            return await storeMedia(buf, ct);
          } catch { return null; }
        }),
      );

      for (let i = 0; i < syndication.mediaDetails.length; i++) {
        const media = syndication.mediaDetails[i];
        const stored = thumbResults[i];
        if (stored) {
          localizedImages.push(stored);
          localMediaUrls.push(`/api/media/${stored.id}`);
        } else {
          // Fallback to external thumbnail URL
          localMediaUrls.push(media.media_url_https);
        }
        mediaTypes.push(media.type);
        if ((media.type === 'video' || media.type === 'animated_gif') && media.video_info?.variants) {
          videoUrls.push(bestVideoUrl(media.video_info.variants));
        } else {
          videoUrls.push('');
        }
      }
    } else if (jinaTweet.mediaUrls.length > 0) {
      // Fallback: use Jina-extracted thumbnails (no video URLs or type info)
      const mediaResults = await Promise.all(
        jinaTweet.mediaUrls.map(async (url) => {
          try {
            const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
            if (!res.ok) return null;
            const buf = Buffer.from(await res.arrayBuffer());
            const ct = res.headers.get('content-type') || 'image/jpeg';
            return await storeMedia(buf, ct);
          } catch { return null; }
        }),
      );
      for (const img of mediaResults) {
        if (img) {
          localizedImages.push(img);
          localMediaUrls.push(`/api/media/${img.id}`);
          mediaTypes.push('photo');
          videoUrls.push('');
        }
      }
    }

    // Download avatar (prefer syndication URL, fall back to Jina)
    let avatarMediaId = '';
    const avatarSrc = syndication?.user?.profile_image_url_https?.replace('_normal.', '_bigger.')
      || jinaTweet.avatarUrl;
    if (avatarSrc) {
      try {
        const res = await fetch(avatarSrc, { signal: AbortSignal.timeout(10_000) });
        if (res.ok) {
          const buf = Buffer.from(await res.arrayBuffer());
          const ct = res.headers.get('content-type') || 'image/jpeg';
          const avatar = await storeMedia(buf, ct);
          avatarMediaId = `/api/media/${avatar.id}`;
        }
      } catch { /* skip */ }
    }

    // Engagement stats: Jina for views/replies/retweets/bookmarks, syndication for likes fallback
    const likes = jinaTweet.likes !== '0' ? jinaTweet.likes
      : syndication?.favorite_count != null ? String(syndication.favorite_count) : '0';

    // Tags: include hashtags from syndication entities
    const tags = ['twitter', 'tweet'];
    if (handle) tags.push(handle.toLowerCase());
    if (syndication?.entities?.hashtags) {
      for (const ht of syndication.entities.hashtags) {
        tags.push(ht.text.toLowerCase());
      }
    }

    return {
      text: searchParts.join('\n'),
      title,
      description: cleanText.slice(0, 300),
      sourceUrl: trimmedUrl,
      contentType: 'tweet',
      category: 'tweet',
      tags,
      localizedImages,
      metadata: {
        url: trimmedUrl,
        tweetId,
        authorName,
        handle,
        avatarUrl: avatarMediaId,
        verified: String(verified),
        createdAt,
        likes,
        retweets: jinaTweet.retweets,
        replies: jinaTweet.replies,
        bookmarks: jinaTweet.bookmarks,
        views: jinaTweet.views,
        ...(jinaTweet.engagements ? { engagements: jinaTweet.engagements } : {}),
        ...(localMediaUrls.length > 0 ? { mediaUrls: localMediaUrls.join(', ') } : {}),
        ...(mediaTypes.length > 0 ? { mediaTypes: mediaTypes.join(', ') } : {}),
        ...(videoUrls.some(v => v) ? { videoUrls: videoUrls.join(', ') } : {}),
      },
    };
  }

  // Download and localize all images in the markdown
  const { markdown: localizedMd, images } = await downloadAndLocalizeImages(markdown);

  // Fetch HTML snapshot for iframe rendering (in parallel if Jina was used)
  const htmlSnapshot = 'cleanHtml' in rawFetched
    ? (rawFetched as any).cleanHtml
    : await fetchHtmlSnapshot(trimmedUrl);

  // Find a representative image from the localized markdown
  const ogImage = 'ogImage' in rawFetched ? (rawFetched as any).ogImage : '';
  const imageUrl = ogImage || firstMarkdownImage(localizedMd) || '';

  // Add domain as a tag
  const tags: string[] = [];
  try {
    tags.push(new URL(trimmedUrl).hostname.replace('www.', ''));
  } catch { /* ignore */ }

  return {
    text: localizedMd,
    title: rawFetched.title,
    description: rawFetched.description,
    sourceUrl: trimmedUrl,
    html: htmlSnapshot || undefined,
    localizedImages: images,
    metadata: {
      url: trimmedUrl,
      pageTitle: rawFetched.title,
      ...(rawFetched.description ? { metaDescription: rawFetched.description } : {}),
      ...(imageUrl ? { imageUrl } : {}),
    },
    tags,
  };
}

// --- Image Extraction ---

export async function extractImage(content: string, userTitle?: string): Promise<ExtractionResult> {
  let base64Data: string;
  if (content.startsWith('data:')) {
    const match = content.match(/^data:[^;]+;base64,(.+)$/);
    base64Data = match ? match[1] : content;
  } else {
    base64Data = content;
  }

  const originalBuffer = Buffer.from(base64Data, 'base64');
  const { detectMimeType } = await import('./detect');
  const originalMimeType = detectMimeType(originalBuffer);

  // Store the image via the media table (for embeddings)
  const img = await storeMedia(originalBuffer, originalMimeType);

  // Generate a rich description via Claude Vision
  const description = await describeImage(originalBuffer);
  const text = description || userTitle || 'Image';

  // Determine file extension for the primary file
  const ext = originalMimeType.includes('png') ? 'png'
    : originalMimeType.includes('gif') ? 'gif'
    : originalMimeType.includes('webp') ? 'webp'
    : 'jpg';

  return {
    text,
    title: userTitle || undefined,
    metadata: {
      mimeType: originalMimeType,
      mediaId: img.id,
      ...(description ? { imageDescription: description } : {}),
    },
    localizedImages: [img],
    // Store as the memory's primary file so hasImage works and /image endpoint serves it
    files: [{ buffer: originalBuffer, filename: `image.${ext}`, contentType: originalMimeType }],
  };
}

