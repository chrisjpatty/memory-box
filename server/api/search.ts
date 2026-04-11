import { Hono } from 'hono';
import { hybridSearch } from '../../lib/search';

const search = new Hono();

search.post('/', async (c) => {
  const { query, limit = 10 } = await c.req.json<{ query: string; limit?: number }>();

  if (!query) {
    return c.json({ error: 'Missing query' }, 400);
  }

  const { results } = await hybridSearch(query, Math.floor(limit));
  return c.json({ results });
});

export { search };
