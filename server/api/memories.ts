import { Hono } from 'hono';
import { query } from '../../lib/db';
import { deleteMemory } from '../../lib/pipeline/store';
import { getFile, fileKey } from '../../lib/storage';

const memories = new Hono();

// List memories
memories.get('/', async (c) => {
  const contentType = c.req.query('type');
  const category = c.req.query('category');
  const tag = c.req.query('tag');
  const limit = Math.floor(parseInt(c.req.query('limit') || '20'));
  const skip = Math.floor(parseInt(c.req.query('skip') || '0'));

  const conditions: string[] = [];
  const params: any[] = [];
  let paramIndex = 1;

  if (contentType) {
    conditions.push(`content_type = $${paramIndex++}`);
    params.push(contentType);
  }

  if (category) {
    conditions.push(`category = $${paramIndex++}`);
    params.push(category);
  }

  if (tag) {
    conditions.push(`$${paramIndex++} = ANY(tags)`);
    params.push(tag);
  }

  const whereClause = conditions.length > 0
    ? ` WHERE ${conditions.join(' AND ')}`
    : '';

  const listQuery = `SELECT id, title, content_type, category, summary, tags, source_url, metadata, file_key, created_at FROM memories${whereClause} ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
  params.push(limit, skip);

  const listResult = await query(listQuery, params);

  const memoryList = listResult.rows.map((m: any) => ({
    id: m.id,
    title: m.title,
    contentType: m.content_type,
    category: m.category || '',
    summary: m.summary || '',
    tags: m.tags || [],
    createdAt: m.created_at,
    source: m.source_url,
    hasImage: m.file_key != null && !m.file_key.endsWith('/original.html'),
    extra: m.metadata || {},
  }));

  // Count query uses same conditions but without LIMIT/OFFSET
  const countParams = params.slice(0, params.length - 2);
  const countQuery = `SELECT count(*) AS total FROM memories${whereClause}`;
  const countResult = await query(countQuery, countParams);
  const total = parseInt(countResult.rows[0]?.total) || 0;

  return c.json({ memories: memoryList, total });
});

// Get single memory
memories.get('/:id', async (c) => {
  const id = c.req.param('id');
  const result = await query('SELECT * FROM memories WHERE id = $1', [id]);

  if (result.rows.length === 0) return c.json({ found: false }, 404);

  const m = result.rows[0];
  return c.json({
    found: true,
    memory: {
      id: m.id,
      title: m.title,
      contentType: m.content_type,
      category: m.category,
      summary: m.summary,
      tags: m.tags || [],
      createdAt: m.created_at,
      source: m.source_url,
      processedContent: m.processed_content,
      markdown: m.markdown,
      hasImage: m.file_key != null && !m.file_key.endsWith('/original.html'),
      hasHtml: m.has_html,
      extra: m.metadata || {},
    },
  });
});

// Serve stored HTML snapshot for iframe rendering
memories.get('/:id/html', async (c) => {
  const id = c.req.param('id');
  const result = await query('SELECT has_html FROM memories WHERE id = $1', [id]);

  if (result.rows.length === 0) return c.json({ error: 'Not found' }, 404);

  const memory = result.rows[0];
  if (!memory.has_html) return c.json({ error: 'No HTML snapshot' }, 404);

  const htmlKey = `${id}/original.html`;
  const file = await getFile(htmlKey);
  if (!file) return c.json({ error: 'HTML file not found in storage' }, 404);

  return new Response(new Uint8Array(file.data), {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=31536000, immutable',
      // CSP: allow inline styles and images from anywhere, but no scripts
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline' *; img-src * data:; font-src *; frame-src 'none'; script-src 'none';",
    },
  });
});

// Serve image/file from MinIO
memories.get('/:id/image', async (c) => {
  const id = c.req.param('id');
  const result = await query('SELECT file_key FROM memories WHERE id = $1', [id]);

  if (result.rows.length === 0) return c.json({ error: 'Not found' }, 404);

  const memory = result.rows[0];
  if (!memory.file_key) return c.json({ error: 'No file' }, 404);

  const file = await getFile(memory.file_key);
  if (!file) return c.json({ error: 'File not found in storage' }, 404);

  return new Response(new Uint8Array(file.data), {
    headers: {
      'Content-Type': file.contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
});

// Serve a named media file (e.g. tweet images, avatar)
memories.get('/:id/media/:filename', async (c) => {
  const id = c.req.param('id');
  const filename = c.req.param('filename');

  // Sanitize filename to prevent path traversal
  if (filename.includes('..') || filename.includes('/')) {
    return c.json({ error: 'Invalid filename' }, 400);
  }

  const file = await getFile(fileKey(id, filename));
  if (!file) return c.json({ error: 'File not found' }, 404);

  return new Response(new Uint8Array(file.data), {
    headers: {
      'Content-Type': file.contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
});

// Delete memory
memories.delete('/:id', async (c) => {
  const id = c.req.param('id');

  try {
    await deleteMemory(id);
    return c.json({ success: true, message: `Memory ${id} deleted.` });
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

export { memories };
