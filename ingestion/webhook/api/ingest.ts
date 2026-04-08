import { Hono } from 'hono';
import { ingest as runIngest } from '../../../lib/ingest';

const ingestApi = new Hono();

ingestApi.post('/', async (c) => {
  const contentType = c.req.header('content-type') || '';

  // Handle multipart file uploads
  if (contentType.includes('multipart/form-data')) {
    const body = await c.req.parseBody();
    const file = body['file'];

    if (!file || !(file instanceof File)) {
      return c.json({ error: 'Missing "file" field' }, 400);
    }

    const title = typeof body['title'] === 'string' ? body['title'] : undefined;
    const tagsRaw = typeof body['tags'] === 'string' ? body['tags'] : undefined;
    const tags = tagsRaw ? tagsRaw.split(',').map((t) => t.trim()).filter(Boolean) : undefined;

    try {
      const arrayBuffer = await file.arrayBuffer();
      const fileBuffer = Buffer.from(arrayBuffer);
      const result = await runIngest({
        content: '',
        title,
        tags,
        fileBuffer,
        fileName: file.name,
        fileMimeType: file.type,
      });
      if (Array.isArray(result)) {
        return c.json({ success: true, results: result }, 201);
      }
      return c.json({ success: true, ...result }, 201);
    } catch (err: any) {
      console.error('File upload ingestion error:', err);
      return c.json({ error: `Ingestion failed: ${err.message}` }, 500);
    }
  }

  // Handle JSON body (existing behavior)
  const { content, title, tags } = await c.req.json<{
    content: string;
    title?: string;
    tags?: string[];
  }>();

  if (!content) {
    return c.json({ error: 'Missing "content" field' }, 400);
  }

  try {
    const result = await runIngest({ content, title, tags });
    if (Array.isArray(result)) {
      return c.json({ success: true, results: result }, 201);
    }
    return c.json({ success: true, ...result }, 201);
  } catch (err: any) {
    console.error('Ingestion error:', err);
    return c.json({ error: `Ingestion failed: ${err.message}` }, 500);
  }
});

export { ingestApi };
