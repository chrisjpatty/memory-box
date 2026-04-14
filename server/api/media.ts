import { Hono } from 'hono';
import { query } from '../../lib/db';
import { getFile } from '../../lib/storage';

const media = new Hono();

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
