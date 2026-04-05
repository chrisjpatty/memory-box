import * as cheerio from 'cheerio';
import TurndownService from 'turndown';
import type { ClassificationResult, IngestResult } from '../types';
import { putFile, fileKey } from '../storage';
import { ingestText } from './text';
import { tryUrlHandler } from './url-handlers';

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
});

/**
 * Resolve all relative URLs in markdown to absolute URLs using the source page's base URL.
 * Handles markdown links [text](url), images ![alt](url), and bare HTML href/src attributes
 * that may survive the HTML-to-markdown conversion.
 */
export function resolveRelativeUrls(markdown: string, sourceUrl: string): string {
  let base: URL;
  try {
    base = new URL(sourceUrl);
  } catch {
    return markdown;
  }

  // Markdown links: [text](url) and images: ![alt](url)
  // Also handles optional titles: [text](url "title")
  return markdown.replace(
    /(!?\[[^\]]*\]\()([^)\s]+)(\s*(?:"[^"]*")?\s*\))/g,
    (_match, prefix, url, suffix) => {
      try {
        // Skip anchors, data URIs, and already-absolute URLs
        if (url.startsWith('#') || url.startsWith('data:') || url.startsWith('mailto:')) return _match;
        new URL(url); // throws if relative
        return _match;
      } catch {
        // It's relative — resolve against the source page
        try {
          const resolved = new URL(url, base).href;
          return `${prefix}${resolved}${suffix}`;
        } catch {
          return _match;
        }
      }
    },
  );
}

interface JinaReaderResponse {
  code: number;
  data: {
    content: string;
    title?: string;
    description?: string;
    url?: string;
    links?: Record<string, string>;
    images?: Record<string, string>;
  };
}

/**
 * Fetch page content via Jina Reader, which handles JS-rendered pages.
 * Returns clean markdown with metadata.
 */
async function fetchViaJina(url: string): Promise<{
  markdown: string;
  title: string;
  description: string;
} | null> {
  try {
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'X-Return-Format': 'markdown',
      'X-With-Generated-Alt': 'true',
    };

    // Use API key if configured for higher rate limits
    if (process.env.JINA_API_KEY) {
      headers['Authorization'] = `Bearer ${process.env.JINA_API_KEY}`;
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

interface FetchResult {
  markdown: string;
  title: string;
  description: string;
  /** Cleaned HTML with resolved URLs — for optional iframe rendering */
  cleanHtml?: string;
}

/**
 * Fetch raw HTML from a URL, clean it, resolve relative URLs, and return
 * both cleaned HTML (for iframe storage) and markdown (for indexing).
 */
function processHtml(rawHtml: string, url: string): {
  markdown: string;
  title: string;
  description: string;
  cleanHtml: string;
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

  $('script, noscript').remove();

  // Resolve relative links/images in the DOM
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

  // Snapshot the cleaned HTML with styles intact (for iframe rendering)
  // Add a <base> tag so any remaining relative refs resolve correctly
  const headContent = $('head').html() || '';
  if (!headContent.includes('<base')) {
    $('head').prepend(`<base href="${url}">`);
  }
  const cleanHtml = $.html().slice(0, 500_000);

  // For markdown conversion, strip non-content elements
  $('style, nav, footer, header, aside, iframe').remove();
  const bodyHtml = $('body').html() || $.html();
  const markdown = turndown.turndown(bodyHtml).slice(0, 100_000);

  return { markdown, title, description, cleanHtml };
}

/**
 * Static fallback: fetch raw HTML, parse with cheerio, convert with turndown.
 * Used when Jina Reader is unavailable or fails.
 */
async function fetchStatic(url: string): Promise<FetchResult> {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'MemoryBox/1.0' },
    signal: AbortSignal.timeout(15_000),
  });
  const html = await response.text();
  return processHtml(html, url);
}

/**
 * Fetch the raw HTML from a URL for iframe snapshot storage.
 * Lightweight — used alongside Jina when we want the original page rendering.
 */
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

export async function ingestUrl(
  url: string,
  classification: ClassificationResult,
  userTitle?: string,
  userTags?: string[],
): Promise<IngestResult> {
  const trimmedUrl = url.trim();

  // --- Try site-specific handlers first (GitHub, etc.) ---
  const handlerResult = await tryUrlHandler(trimmedUrl);
  if (handlerResult) {
    const enrichedClassification: ClassificationResult = {
      ...classification,
      contentType: 'url',
      title: userTitle || handlerResult.title || classification.title || trimmedUrl,
      summary: handlerResult.description || classification.summary,
      tags: [...new Set([...(userTags || []), ...classification.tags, ...handlerResult.tags])],
      category: handlerResult.category || classification.category,
      metadata: {
        ...classification.metadata,
        ...handlerResult.metadata,
        url: trimmedUrl,
      },
    };

    const markdown = resolveRelativeUrls(handlerResult.markdown, trimmedUrl);
    const result = await ingestText(markdown, enrichedClassification, userTitle, userTags);

    // Store HTML snapshot if the handler provided one
    let hasHtml = false;
    if (handlerResult.cleanHtml) {
      const key = fileKey(result.memoryId, 'original.html');
      await putFile(key, Buffer.from(handlerResult.cleanHtml, 'utf-8'), 'text/html');
      hasHtml = true;
    }

    const { getRedis } = await import('../clients');
    const redis = getRedis();
    const existing = await redis.get(`memory:${result.memoryId}`);
    if (existing) {
      const meta = JSON.parse(existing);
      meta.markdown = markdown;
      meta.source = trimmedUrl;
      meta.processedContent = markdown.slice(0, 5000);
      meta.hasHtml = hasHtml;
      if (hasHtml) meta.fileKey = meta.fileKey || fileKey(result.memoryId, 'original.html');
      await redis.set(`memory:${result.memoryId}`, JSON.stringify(meta), 'EX', 86400 * 365);
    }

    return result;
  }

  // --- Generic URL pipeline (Jina Reader → static fallback) ---
  const rawFetched: FetchResult = await fetchViaJina(trimmedUrl) ?? await fetchStatic(trimmedUrl);

  // Resolve relative links in the markdown so they survive without the source URL context
  const fetched = {
    ...rawFetched,
    markdown: resolveRelativeUrls(rawFetched.markdown, trimmedUrl),
  };

  // If Jina was used (no cleanHtml), fetch the HTML snapshot in parallel with ingestion
  const htmlSnapshotPromise = fetched.cleanHtml
    ? Promise.resolve(fetched.cleanHtml)
    : fetchHtmlSnapshot(trimmedUrl);

  const enrichedClassification: ClassificationResult = {
    ...classification,
    title: userTitle || classification.title || fetched.title || trimmedUrl,
    summary: classification.summary || fetched.description,
    metadata: {
      ...classification.metadata,
      url: trimmedUrl,
      pageTitle: fetched.title,
      ...(fetched.description ? { metaDescription: fetched.description } : {}),
    },
  };

  // Add URL domain as a tag
  try {
    const domain = new URL(trimmedUrl).hostname.replace('www.', '');
    enrichedClassification.tags = [...new Set([...enrichedClassification.tags, domain])];
  } catch { /* ignore */ }

  // Ingest the markdown through the text pipeline
  const result = await ingestText(fetched.markdown, enrichedClassification, userTitle, userTags);

  // Store HTML snapshot in MinIO for iframe rendering
  const htmlSnapshot = await htmlSnapshotPromise;
  let hasHtml = false;
  if (htmlSnapshot) {
    const key = fileKey(result.memoryId, 'original.html');
    await putFile(key, Buffer.from(htmlSnapshot, 'utf-8'), 'text/html');
    hasHtml = true;
  }

  // Enrich the Redis metadata with the full markdown, source URL, and HTML flag
  const { getRedis } = await import('../clients');
  const redis = getRedis();
  const existing = await redis.get(`memory:${result.memoryId}`);
  if (existing) {
    const meta = JSON.parse(existing);
    meta.markdown = fetched.markdown;
    meta.source = trimmedUrl;
    meta.processedContent = fetched.markdown.slice(0, 5000);
    meta.hasHtml = hasHtml;
    meta.fileKey = meta.fileKey || (hasHtml ? fileKey(result.memoryId, 'original.html') : undefined);
    await redis.set(`memory:${result.memoryId}`, JSON.stringify(meta), 'EX', 86400 * 365);
  }

  return result;
}
