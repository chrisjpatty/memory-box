import { Hono } from 'hono';
import neo4jDriver from 'neo4j-driver';
import { getRedis, getNeo4j, getQdrant, QDRANT_INDEX_NAME } from '../../../lib/clients';
import { getFile, deleteFile } from '../../../lib/storage';
import { cleanupDedupKeys } from '../../../lib/ingest';

const memories = new Hono();

// List memories
memories.get('/', async (c) => {
  const contentType = c.req.query('type');
  const category = c.req.query('category');
  const tag = c.req.query('tag');
  const limit = Math.floor(parseInt(c.req.query('limit') || '20'));
  const skip = Math.floor(parseInt(c.req.query('skip') || '0'));

  const driver = getNeo4j();
  const session = driver.session();
  try {
    const conditions: string[] = [];
    const params: Record<string, any> = {
      limit: neo4jDriver.int(limit),
      skip: neo4jDriver.int(skip),
    };

    let matchClause = 'MATCH (m:Memory)';

    if (tag) {
      matchClause = 'MATCH (m:Memory)-[:TAGGED]->(t:Tag {name: $tag})';
      params.tag = tag;
    }

    if (contentType) {
      conditions.push('m.contentType = $contentType');
      params.contentType = contentType;
    }

    if (category) {
      conditions.push('m.category = $category');
      params.category = category;
    }

    const whereClause = conditions.length > 0
      ? ` WHERE ${conditions.join(' AND ')}`
      : '';

    const query = `${matchClause}${whereClause} RETURN m ORDER BY m.createdAt DESC SKIP $skip LIMIT $limit`;
    const result = await session.run(query, params);

    const memoryList = result.records.map((r: any) => {
      const m = r.get('m').properties;
      return {
        id: m.id,
        title: m.title,
        contentType: m.contentType,
        category: m.category || '',
        summary: m.summary || '',
        createdAt: m.createdAt,
      };
    });

    const countQuery = `${matchClause}${whereClause} RETURN count(m) as total`;
    const countResult = await session.run(countQuery, params);
    const total = countResult.records[0]?.get('total')?.toNumber?.() || 0;

    return c.json({ memories: memoryList, total });
  } finally {
    await session.close();
  }
});

// Get single memory
memories.get('/:id', async (c) => {
  const id = c.req.param('id');
  const redis = getRedis();
  const data = await redis.get(`memory:${id}`);

  if (!data) return c.json({ found: false }, 404);

  const memory = JSON.parse(data);
  return c.json({
    found: true,
    memory: {
      id: memory.id,
      title: memory.title,
      contentType: memory.contentType,
      category: memory.category,
      summary: memory.summary,
      tags: memory.tags || [],
      createdAt: memory.createdAt,
      source: memory.source,
      processedContent: memory.processedContent,
      markdown: memory.markdown,
      hasImage: !!memory.fileKey || !!memory.imageUrl,
      hasHtml: !!memory.hasHtml,
      extra: memory.extra || {},
    },
  });
});

// Serve stored HTML snapshot for iframe rendering
memories.get('/:id/html', async (c) => {
  const id = c.req.param('id');
  const redis = getRedis();
  const data = await redis.get(`memory:${id}`);

  if (!data) return c.json({ error: 'Not found' }, 404);

  const memory = JSON.parse(data);
  if (!memory.hasHtml) return c.json({ error: 'No HTML snapshot' }, 404);

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
  const redis = getRedis();
  const data = await redis.get(`memory:${id}`);

  if (!data) return c.json({ error: 'Not found' }, 404);

  const memory = JSON.parse(data);
  if (!memory.fileKey) return c.json({ error: 'No file' }, 404);

  const file = await getFile(memory.fileKey);
  if (!file) return c.json({ error: 'File not found in storage' }, 404);

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
    const qdrant = getQdrant();
    await qdrant.deleteVectors({
      indexName: QDRANT_INDEX_NAME,
      filter: { memoryId: id },
    });

    const redis = getRedis();
    const memData = await redis.get(`memory:${id}`);
    if (memData) {
      const mem = JSON.parse(memData);
      if (mem.fileKey) await deleteFile(mem.fileKey);
    }
    await redis.del(`memory:${id}`);
    await cleanupDedupKeys(id);

    const driver = getNeo4j();
    const session = driver.session();
    try {
      await session.run('MATCH (m:Memory {id: $id}) DETACH DELETE m', { id });
    } finally {
      await session.close();
    }

    return c.json({ success: true, message: `Memory ${id} deleted.` });
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

export { memories };
