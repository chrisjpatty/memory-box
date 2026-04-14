/**
 * Content type detection and hashing. Pure functions, no side effects.
 */
import { createHash } from 'crypto';
import type { ContentType, ClassificationResult } from '../types';

/**
 * Deterministic content type detection from string content.
 */
export function detectContentType(content: string): ContentType | null {
  const trimmed = content.trim();

  try {
    const url = new URL(trimmed);
    if (url.protocol === 'http:' || url.protocol === 'https:') return 'url';
  } catch { /* not a URL */ }

  if (trimmed.startsWith('data:image/')) return 'image';

  return null;
}

/**
 * Detect content type from a file buffer's magic bytes.
 */
export function detectFromBuffer(buffer: Buffer, mimeType?: string): ContentType {
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'image';
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image';
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) return 'image';
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) return 'image';

  if (mimeType?.startsWith('image/')) return 'image';

  return 'file';
}

export function contentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

export function bufferHash(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

/**
 * Build classification metadata for images without calling the LLM.
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
 * Detect actual image MIME type from binary magic bytes.
 */
export function detectMimeType(buffer: Buffer): string {
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'image/png';
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) return 'image/gif';
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) return 'image/webp';
  return 'image/png';
}
