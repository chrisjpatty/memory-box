import { createHash } from 'crypto';
import { classifyContent } from './classifier';
import { ingestText } from './pipelines/text';
import { ingestUrl } from './pipelines/url';
import { ingestImage } from './pipelines/image';
import { ingestPdf } from './pipelines/pdf';
import { getRedis } from './clients';
import type { IngestRequest, IngestResult, ClassificationResult, ContentType } from './types';

/**
 * Deterministic content type detection for cases where we don't need an LLM.
 * @internal Exported for testing.
 */
export function detectContentType(content: string): ContentType | null {
  const trimmed = content.trim();

  try {
    const url = new URL(trimmed);
    if (url.protocol === 'http:' || url.protocol === 'https:') return 'url';
  } catch { /* not a URL */ }

  if (trimmed.startsWith('data:application/pdf;base64,')) return 'pdf';
  if (trimmed.startsWith('data:image/')) return 'image';

  return null;
}

/**
 * Detect content type from a file buffer's magic bytes.
 * @internal Exported for testing.
 */
export function detectFromBuffer(buffer: Buffer, mimeType?: string): ContentType {
  // PDF: starts with %PDF
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) return 'pdf';
  // PNG
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'image';
  // JPEG
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image';
  // GIF
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) return 'image';
  // WebP (RIFF....WEBP)
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) return 'image';

  if (mimeType?.startsWith('image/')) return 'image';
  if (mimeType === 'application/pdf') return 'pdf';

  return 'file';
}

/**
 * Build classification metadata for images without calling the LLM.
 * @internal Exported for testing.
 */
export function classifyImage(content: string, title?: string, tags?: string[]): ClassificationResult {
  const mimeMatch = content.match(/^data:([^;]+);/);
  const mimeType = mimeMatch ? mimeMatch[1] : 'image/unknown';
  const extension = mimeType.split('/')[1] || 'unknown';

  return {
    contentType: 'image',
    title: title || `Image (${extension})`,
    tags: tags || [],
    category: 'image',
    summary: `Uploaded ${extension} image`,
    metadata: { mimeType },
  };
}

/**
 * Build classification metadata for PDFs without calling the LLM.
 * The PDF pipeline extracts text and re-classifies with richer content.
 * @internal Exported for testing.
 */
export function classifyPdf(title?: string, tags?: string[], fileName?: string): ClassificationResult {
  return {
    contentType: 'pdf',
    title: title || fileName || 'PDF Document',
    tags: tags || ['pdf'],
    category: 'document',
    summary: 'Uploaded PDF document',
    metadata: {},
  };
}

// --- Deduplication ---

/** @internal Exported for testing. */
export function contentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

/** @internal Exported for testing. */
export function bufferHash(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

/**
 * Check if content has already been ingested. Returns existing memoryId if duplicate.
 * Verifies the referenced memory still exists — cleans up stale keys if it was deleted.
 */
async function checkDuplicate(hash: string, url?: string): Promise<string | null> {
  const redis = getRedis();

  // Check content hash
  const existing = await redis.get(`content-hash:${hash}`);
  if (existing) {
    // Verify the memory still exists
    const memoryData = await redis.get(`memory:${existing}`);
    if (memoryData) return existing;
    // Stale key — memory was deleted, clean up
    await redis.del(`content-hash:${hash}`);
  }

  // Check URL dedup
  if (url) {
    const existingUrl = await redis.get(`url-dedup:${url}`);
    if (existingUrl) {
      const memoryData = await redis.get(`memory:${existingUrl}`);
      if (memoryData) return existingUrl;
      await redis.del(`url-dedup:${url}`);
    }
  }

  return null;
}

/**
 * Store dedup keys after successful ingestion.
 */
async function storeDedupKeys(memoryId: string, hash: string, url?: string): Promise<void> {
  const redis = getRedis();
  // Same TTL as memory metadata (365 days)
  await redis.set(`content-hash:${hash}`, memoryId, 'EX', 86400 * 365);
  if (url) {
    await redis.set(`url-dedup:${url}`, memoryId, 'EX', 86400 * 365);
  }
}

/**
 * Clean up dedup keys when a memory is deleted.
 * Scans for content-hash and url-dedup keys pointing to the given memoryId.
 */
export async function cleanupDedupKeys(memoryId: string): Promise<void> {
  const redis = getRedis();

  // Scan for content-hash keys pointing to this memory
  let cursor = '0';
  do {
    const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', 'content-hash:*', 'COUNT', 100);
    cursor = nextCursor;
    for (const key of keys) {
      const val = await redis.get(key);
      if (val === memoryId) await redis.del(key);
    }
  } while (cursor !== '0');

  // Scan for url-dedup keys pointing to this memory
  cursor = '0';
  do {
    const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', 'url-dedup:*', 'COUNT', 100);
    cursor = nextCursor;
    for (const key of keys) {
      const val = await redis.get(key);
      if (val === memoryId) await redis.del(key);
    }
  } while (cursor !== '0');
}

/**
 * Main ingestion entry point.
 *
 * Supports: text, URLs, images (base64), PDFs (base64 or buffer), file uploads (buffer).
 * Deduplicates by content hash and URL before ingesting.
 */
export async function ingest(request: IngestRequest): Promise<IngestResult> {
  const { content, title, tags, fileBuffer, fileName, fileMimeType } = request;

  // --- File buffer path (multipart uploads) ---
  if (fileBuffer) {
    const fileType = detectFromBuffer(fileBuffer, fileMimeType);
    const hash = bufferHash(fileBuffer);

    const dupId = await checkDuplicate(hash);
    if (dupId) {
      return { memoryId: dupId, contentType: fileType, title: title || fileName || 'Duplicate', chunks: 0, deduplicated: true, existingMemoryId: dupId };
    }

    let result: IngestResult;

    if (fileType === 'pdf') {
      const classification = classifyPdf(title, tags, fileName);
      result = await ingestPdf(fileBuffer, classification, title, tags);
    } else if (fileType === 'image') {
      // Convert buffer to data URI for the image pipeline
      const mimeType = fileMimeType || 'image/png';
      const dataUri = `data:${mimeType};base64,${fileBuffer.toString('base64')}`;
      const classification = classifyImage(dataUri, title, tags);
      result = await ingestImage(dataUri, classification, title, tags);
    } else {
      // Generic file: extract text content and ingest as text
      const textContent = fileBuffer.toString('utf-8');
      const classification = await classifyContent(textContent, title, tags);
      classification.contentType = 'file';
      result = await ingestText(textContent, classification, title, tags);
    }

    await storeDedupKeys(result.memoryId, hash);
    return result;
  }

  // --- String content path (existing API) ---
  const detectedType = detectContentType(content);

  // Compute hash for dedup
  const hash = contentHash(content);
  const urlForDedup = detectedType === 'url' ? content.trim() : undefined;
  const dupId = await checkDuplicate(hash, urlForDedup);
  if (dupId) {
    return { memoryId: dupId, contentType: detectedType || 'text', title: title || 'Duplicate', chunks: 0, deduplicated: true, existingMemoryId: dupId };
  }

  let result: IngestResult;

  // PDFs as base64 data URIs
  if (detectedType === 'pdf') {
    const match = content.match(/^data:[^;]+;base64,(.+)$/);
    const buffer = Buffer.from(match ? match[1] : content, 'base64');
    const classification = classifyPdf(title, tags);
    result = await ingestPdf(buffer, classification, title, tags);
    await storeDedupKeys(result.memoryId, hash);
    return result;
  }

  // Images: bypass classifier completely
  if (detectedType === 'image') {
    const classification = classifyImage(content, title, tags);
    result = await ingestImage(content, classification, title, tags);
    await storeDedupKeys(result.memoryId, hash);
    return result;
  }

  // Text and URLs: run classifier for metadata enrichment
  const classification = await classifyContent(content, title, tags);

  if (detectedType) {
    classification.contentType = detectedType;
  }

  switch (classification.contentType) {
    case 'url':
      result = await ingestUrl(content, classification, title, tags);
      await storeDedupKeys(result.memoryId, hash, content.trim());
      return result;

    case 'text':
    default:
      result = await ingestText(content, classification, title, tags);
      await storeDedupKeys(result.memoryId, hash);
      return result;
  }
}
