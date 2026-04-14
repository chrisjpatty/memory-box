/**
 * Media handling: download external images, store locally in MinIO,
 * and rewrite markdown to reference local URLs.
 */
import { nanoid } from 'nanoid';
import { putFile } from '../storage';
import { query } from '../db';

export interface LocalizedImage {
  /** Unique ID for serving via /api/media/:id */
  id: string;
  /** Raw image bytes (for embedding) */
  buffer: Buffer;
  /** MIME type */
  contentType: string;
}

const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * Scan markdown for external image URLs, download them,
 * store in MinIO, and rewrite the markdown with local URLs.
 *
 * On failure for any individual image, the original external URL is kept.
 * Returns the rewritten markdown and the successfully downloaded image buffers.
 */
export async function downloadAndLocalizeImages(markdown: string): Promise<{
  markdown: string;
  images: LocalizedImage[];
  /** Map from original external URL → local /api/media/:id URL */
  replacements: Map<string, string>;
}> {
  const imageRegex = /!\[[^\]]*\]\((https?:\/\/[^)]+)\)/g;
  const urls = [...new Set([...markdown.matchAll(imageRegex)].map(m => m[1]))];

  if (urls.length === 0) return { markdown, images: [], replacements: new Map() };

  const images: LocalizedImage[] = [];
  const replacements = new Map<string, string>();

  const results = await Promise.all(
    urls.map(async (url) => {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
        if (!res.ok) return null;
        const ct = res.headers.get('content-type') || '';
        if (!ct.startsWith('image/')) return null;
        const length = parseInt(res.headers.get('content-length') || '0', 10);
        if (length > MAX_IMAGE_SIZE) return null;
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > MAX_IMAGE_SIZE) return null;
        return { url, buf, ct };
      } catch {
        return null;
      }
    }),
  );

  for (const r of results) {
    if (!r) continue;
    try {
      const id = nanoid();
      const ext = r.ct.includes('png') ? 'png' : r.ct.includes('gif') ? 'gif' : r.ct.includes('webp') ? 'webp' : 'jpg';
      const key = `media/${id}.${ext}`;

      await putFile(key, r.buf, r.ct);
      await query(
        'INSERT INTO media (id, key, content_type, created_at) VALUES ($1, $2, $3, NOW())',
        [id, key, r.ct],
      );

      images.push({ id, buffer: r.buf, contentType: r.ct });
      replacements.set(r.url, `/api/media/${id}`);
    } catch {
      // Storage failed — keep the external URL
    }
  }

  let rewritten = markdown;
  for (const [url, localUrl] of replacements) {
    rewritten = rewritten.split(url).join(localUrl);
  }

  return { markdown: rewritten, images, replacements };
}

/**
 * Store a single image in MinIO and the media table.
 * Returns the media ID and buffer for embedding.
 */
export async function storeMedia(
  buffer: Buffer,
  contentType: string,
): Promise<LocalizedImage> {
  const id = nanoid();
  const ext = contentType.includes('png') ? 'png' : contentType.includes('gif') ? 'gif' : contentType.includes('webp') ? 'webp' : 'jpg';
  const key = `media/${id}.${ext}`;

  await putFile(key, buffer, contentType);
  await query(
    'INSERT INTO media (id, key, content_type, created_at) VALUES ($1, $2, $3, NOW())',
    [id, key, contentType],
  );

  return { id, buffer, contentType };
}
