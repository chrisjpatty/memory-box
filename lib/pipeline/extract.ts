/**
 * Content extraction: fetches/processes raw content into text for indexing.
 * Side effects: HTTP fetches, Claude Vision API calls. No database access.
 */
import * as cheerio from 'cheerio';
import TurndownService from 'turndown';
import sharp from 'sharp';
import { PDFParse } from 'pdf-parse';
import { Agent } from '@mastra/core/agent';
import { tryUrlHandler } from './url-handlers';
import { isTweetUrl } from './url-handlers/twitter';
import { resolveRelativeUrls } from './url-utils';
import type { ClassificationResult } from '../types';

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
  };
}

async function fetchViaJina(url: string): Promise<{
  markdown: string;
  title: string;
  description: string;
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

    return {
      markdown: json.data.content.slice(0, 100_000),
      title: json.data.title || '',
      description: json.data.description || '',
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

  // Tweet text: the paragraph between the handle line and the first image or timestamp
  const handlePattern = `\\[@${handle || '\\w+'}\\]`;
  const textMatch = markdown.match(new RegExp(handlePattern + '\\([^)]+\\)\\s*\\n\\n([\\s\\S]*?)(?=\\n\\n\\[!\\[Image|\\n\\n\\[Last edited|\\n\\n\\[\\d)', 'i'));
  const tweetText = textMatch?.[1]?.trim() || '';

  // Media: all twimg media URLs (not profile images)
  const mediaUrls: string[] = [];
  const mediaRegex = /\(https:\/\/pbs\.twimg\.com\/media\/([^)]+)\)/g;
  let match;
  while ((match = mediaRegex.exec(markdown)) !== null) {
    // Upgrade to large format
    const mediaUrl = `https://pbs.twimg.com/media/${match[1]}`.replace(/name=\w+/, 'name=large');
    mediaUrls.push(mediaUrl);
  }

  // Engagement stats: after the views line, X renders bare numbers on separate lines.
  // The count varies — tweets with zero engagement omit those stats entirely.
  // Order when present: replies, retweets, likes, bookmarks
  const viewsMatch = markdown.match(/([\d,]+)\s*Views?\]/i);
  const statsNums: string[] = [];
  const afterViews = markdown.match(/\[[\d,]+ Views?\][^\n]*\n([\s\S]*?)(?=\n##|\nRead \d|\n\[Show more)/i);
  if (afterViews) {
    const numMatches = afterViews[1].match(/\b(\d[\d,]*)\b/g);
    if (numMatches) statsNums.push(...numMatches.map((n) => n.replace(/,/g, '')));
  }

  // If we have all 4 stats, map them to specific fields. Otherwise, sum as engagements.
  const views = viewsMatch?.[1]?.replace(/,/g, '') || '0';
  if (statsNums.length >= 4) {
    return { tweetText, authorName, handle, avatarUrl, mediaUrls, views,
      replies: statsNums[0], retweets: statsNums[1], likes: statsNums[2], bookmarks: statsNums[3] };
  }
  const engagements = statsNums.reduce((sum, n) => sum + parseInt(n, 10), 0);
  return { tweetText, authorName, handle, avatarUrl, mediaUrls, views,
    replies: '0', retweets: '0', likes: '0', bookmarks: '0',
    engagements: String(engagements) };
}

export async function extractUrl(url: string): Promise<ExtractionResult> {
  const trimmedUrl = url.trim();

  // Try site-specific handlers first (GitHub, etc.)
  const handlerResult = await tryUrlHandler(trimmedUrl);
  if (handlerResult) {
    const markdown = resolveRelativeUrls(handlerResult.markdown, trimmedUrl);
    return {
      text: markdown,
      title: handlerResult.title,
      description: handlerResult.description,
      sourceUrl: trimmedUrl,
      html: handlerResult.cleanHtml,
      metadata: { ...handlerResult.metadata, url: trimmedUrl },
      tags: handlerResult.tags,
      category: handlerResult.category,
      contentType: handlerResult.contentType,
    };
  }

  // Generic URL pipeline: Jina Reader → static fallback
  const rawFetched = await fetchViaJina(trimmedUrl) ?? await fetchStatic(trimmedUrl);
  const markdown = resolveRelativeUrls(rawFetched.markdown, trimmedUrl);

  // Tweet URLs via Jina: parse structured fields from the markdown
  if (isTweetUrl(trimmedUrl)) {
    const tweet = parseTweetFromJinaMarkdown(markdown, trimmedUrl);
    const tweetIdMatch = trimmedUrl.match(/\/status\/(\d+)/);

    const cleanText = tweet.tweetText || rawFetched.title || '';
    const title = tweet.handle
      ? `@${tweet.handle}: ${cleanText.slice(0, 100)}${cleanText.length > 100 ? '…' : ''}`
      : rawFetched.title;

    // Build rich search text with all visible context
    const searchParts = [];
    if (tweet.authorName) searchParts.push(tweet.authorName);
    if (tweet.handle) searchParts.push(`@${tweet.handle}`);
    if (cleanText) searchParts.push(cleanText);
    const searchText = searchParts.join('\n');

    // Download tweet media and avatar, run media through vision pipeline
    const files: { buffer: Buffer; filename: string; contentType: string }[] = [];
    const localMediaUrls: string[] = [];
    const mediaBuffers: Buffer[] = [];

    // Download media images in parallel
    const mediaDownloads = tweet.mediaUrls.map(async (url, i) => {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
        if (res.ok) {
          const buf = Buffer.from(await res.arrayBuffer());
          const ct = res.headers.get('content-type') || 'image/jpeg';
          const ext = ct.includes('png') ? 'png' : 'jpg';
          return { buf, ct, ext, i };
        }
      } catch { /* skip */ }
      return null;
    });

    for (const result of await Promise.all(mediaDownloads)) {
      if (result) {
        files.push({ buffer: result.buf, filename: `media-${result.i}.${result.ext}`, contentType: result.ct });
        localMediaUrls.push(`media-${result.i}.${result.ext}`);
        mediaBuffers.push(result.buf);
      }
    }

    // Download avatar
    if (tweet.avatarUrl) {
      try {
        const res = await fetch(tweet.avatarUrl, { signal: AbortSignal.timeout(10_000) });
        if (res.ok) {
          const buf = Buffer.from(await res.arrayBuffer());
          const ct = res.headers.get('content-type') || 'image/jpeg';
          files.push({ buffer: buf, filename: 'avatar.jpg', contentType: ct });
        }
      } catch { /* skip */ }
    }

    // Run media images through vision pipeline in parallel for descriptions
    if (mediaBuffers.length > 0) {
      const visionResults = await Promise.all(
        mediaBuffers.map(async (buf) => {
          try {
            const vision = await prepareForVision(buf);
            const response = await getVisionAgent().generate([{
              role: 'user',
              content: [
                { type: 'text', text: 'Describe this image in detail for a personal memory database:' },
                { type: 'image', image: vision.base64, mimeType: vision.mimeType },
              ],
            }]);
            return response.text || '';
          } catch {
            return '';
          }
        }),
      );
      const descriptions = visionResults.filter(Boolean);
      if (descriptions.length > 0) {
        searchParts.push('Images:', ...descriptions);
      }
    }

    return {
      text: searchParts.join('\n'),
      title,
      description: cleanText.slice(0, 300),
      sourceUrl: trimmedUrl,
      contentType: 'tweet',
      category: 'tweet',
      tags: ['twitter', 'tweet', ...(tweet.handle ? [tweet.handle.toLowerCase()] : [])],
      files: files.length > 0 ? files : undefined,
      metadata: {
        url: trimmedUrl,
        tweetId: tweetIdMatch?.[1] || '',
        authorName: tweet.authorName,
        handle: tweet.handle,
        avatarUrl: tweet.avatarUrl ? 'avatar.jpg' : '',
        verified: 'false',
        likes: tweet.likes,
        retweets: tweet.retweets,
        replies: tweet.replies,
        views: tweet.views,
        ...(tweet.engagements ? { engagements: tweet.engagements } : {}),
        ...(localMediaUrls.length > 0 ? { mediaUrls: localMediaUrls.join(', ') } : {}),
      },
    };
  }

  // Fetch HTML snapshot for iframe rendering (in parallel if Jina was used)
  const htmlSnapshot = 'cleanHtml' in rawFetched
    ? (rawFetched as any).cleanHtml
    : await fetchHtmlSnapshot(trimmedUrl);

  // Find a representative image: prefer OG image, fall back to first markdown image
  const ogImage = 'ogImage' in rawFetched ? (rawFetched as any).ogImage : '';
  const imageUrl = ogImage || firstMarkdownImage(markdown) || '';

  // Add domain as a tag
  const tags: string[] = [];
  try {
    tags.push(new URL(trimmedUrl).hostname.replace('www.', ''));
  } catch { /* ignore */ }

  return {
    text: markdown,
    title: rawFetched.title,
    description: rawFetched.description,
    sourceUrl: trimmedUrl,
    html: htmlSnapshot || undefined,
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

const VISION_MAX_DIMENSION = 1024;

let visionAgent: Agent | null = null;

function getVisionAgent(): Agent {
  if (!visionAgent) {
    visionAgent = new Agent({
      id: 'image-describer',
      name: 'Image Describer',
      instructions: `You are an image description specialist. Given an image, provide a detailed text description that captures:
1. The main subject and composition
2. Important details, text, or objects visible
3. Colors, mood, and style
4. Any text or numbers visible in the image
5. Context clues about what this image represents

Be thorough but concise. Your description will be used to make this image searchable in a personal memory database, so include details that someone might search for later.`,
      model: 'anthropic/claude-sonnet-4-5',
    });
  }
  return visionAgent;
}

async function prepareForVision(originalBuffer: Buffer): Promise<{ base64: string; mimeType: string }> {
  const image = sharp(originalBuffer);
  const metadata = await image.metadata();
  const width = metadata.width || 0;
  const height = metadata.height || 0;

  let pipeline = image;
  if (width > VISION_MAX_DIMENSION || height > VISION_MAX_DIMENSION) {
    pipeline = pipeline.resize(VISION_MAX_DIMENSION, VISION_MAX_DIMENSION, {
      fit: 'inside',
      withoutEnlargement: true,
    });
  }

  const resized = await pipeline.jpeg({ quality: 85 }).toBuffer();
  return { base64: resized.toString('base64'), mimeType: 'image/jpeg' };
}

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

  // Prepare smaller version for Claude Vision
  const vision = await prepareForVision(originalBuffer);

  // Generate description
  let description: string;
  try {
    const response = await getVisionAgent().generate([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Describe this image in detail for a personal memory database:' },
          { type: 'image', image: vision.base64, mimeType: vision.mimeType },
        ],
      },
    ]);
    description = response.text || 'Image (no description generated)';
  } catch (e: any) {
    description = userTitle || `Image (${originalMimeType}) - description unavailable: ${e.message}`;
  }

  const ext = originalMimeType.split('/')[1] || 'bin';

  return {
    text: description,
    metadata: { mimeType: originalMimeType, imageDescription: description },
    files: [{ buffer: originalBuffer, filename: `original.${ext}`, contentType: originalMimeType }],
  };
}

// --- PDF Extraction ---

export async function extractPdf(buffer: Buffer, userTitle?: string): Promise<ExtractionResult> {
  const parser = new PDFParse({ data: buffer });
  const textResult = await parser.getText();
  const extractedText = textResult.text?.trim();

  if (!extractedText) {
    await parser.destroy();
    throw new Error('PDF contained no extractable text');
  }

  let pageCount = textResult.total || 0;
  let pdfTitle = '';
  try {
    const info = await parser.getInfo();
    pageCount = info.total || pageCount;
    pdfTitle = info.info?.Title || '';
  } catch { /* best-effort */ }

  await parser.destroy();

  return {
    text: extractedText,
    title: userTitle || pdfTitle || undefined,
    metadata: { pageCount: String(pageCount), pdfInfo: pdfTitle },
    files: [{ buffer, filename: 'original.pdf', contentType: 'application/pdf' }],
    reclassify: true,
  };
}
