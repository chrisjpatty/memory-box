import { Hono } from 'hono';
import { hybridSearch } from '../../lib/search';

const search = new Hono();

search.post('/', async (c) => {
  const { query, limit = 10, collectionId } = await c.req.json<{
    query: string;
    limit?: number;
    collectionId?: number;
  }>();

  if (!query) {
    return c.json({ error: 'Missing query' }, 400);
  }

  const { results, totalFound } = await hybridSearch(query, {
    limit: Math.floor(limit),
    collectionId,
  });

  return c.json({ results, totalFound });
});

export { search };
