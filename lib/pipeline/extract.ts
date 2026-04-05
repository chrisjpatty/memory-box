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
  /** File to store in MinIO: { buffer, key, contentType } */
  file?: { buffer: Buffer; filename: string; contentType: string };
  /** Extra metadata from extraction */
  metadata?: Record<string, string>;
  /** Extra tags from extraction */
  tags?: string[];
  /** Category override from extraction */
  category?: string;
  /** Classification override (for re-classification after text extraction, e.g. PDF) */
  reclassify?: boolean;
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
      'X-With-Generated-Alt': 'true',
    };
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

  return { markdown, title, description, cleanHtml };
}

async function fetchStatic(url: string): Promise<{
  markdown: string;
  title: string;
  description: string;
  cleanHtml: string;
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
    };
  }

  // Generic URL pipeline: Jina Reader → static fallback
  const rawFetched = await fetchViaJina(trimmedUrl) ?? await fetchStatic(trimmedUrl);
  const markdown = resolveRelativeUrls(rawFetched.markdown, trimmedUrl);

  // Fetch HTML snapshot for iframe rendering (in parallel if Jina was used)
  const htmlSnapshot = 'cleanHtml' in rawFetched
    ? (rawFetched as any).cleanHtml
    : await fetchHtmlSnapshot(trimmedUrl);

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
    file: { buffer: originalBuffer, filename: `original.${ext}`, contentType: originalMimeType },
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
    file: { buffer, filename: 'original.pdf', contentType: 'application/pdf' },
    reclassify: true,
  };
}
