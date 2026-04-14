import { Hono } from 'hono';
import { query } from '../../lib/db';
import { getFile } from '../../lib/storage';

const media = new Hono();

// Proxy video from Twitter's CDN (which blocks browser Referer/Origin headers)
media.get('/video-proxy', async (c) => {
  const url = c.req.query('url');
  if (!url) return c.json({ error: 'Missing url parameter' }, 400);

  // Only proxy video.twimg.com URLs to prevent open proxy abuse
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== 'video.twimg.com') {
      return c.json({ error: 'Only video.twimg.com URLs are allowed' }, 403);
    }
  } catch {
    return c.json({ error: 'Invalid URL' }, 400);
  }

  const upstream = await fetch(url, {
    headers: { 'User-Agent': 'MemoryBox/1.0' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!upstream.ok) return c.json({ error: `Upstream ${upstream.status}` }, 502);

  return new Response(upstream.body, {
    headers: {
      'Content-Type': upstream.headers.get('content-type') || 'video/mp4',
      'Content-Length': upstream.headers.get('content-length') || '',
      'Cache-Control': 'public, max-age=86400',
      'Accept-Ranges': 'bytes',
    },
  });
});

// Serve a stored media file by ID
media.get('/:id', async (c) => {
  const id = c.req.param('id');

  const result = await query('SELECT key, content_type FROM media WHERE id = $1', [id]);
  if (result.rows.length === 0) return c.json({ error: 'Not found' }, 404);

  const { key, content_type } = result.rows[0];
  const file = await getFile(key);
  if (!file) return c.json({ error: 'File not found in storage' }, 404);

  return new Response(new Uint8Array(file.data), {
    headers: {
      'Content-Type': content_type,
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
});

export { media as mediaApi };
