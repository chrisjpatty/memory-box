import { Hono } from 'hono';
import { query } from '../../lib/db';

const stats = new Hono();

stats.get('/', async (c) => {
  try {
    const result = await query(`
      SELECT
        count(*) AS memories,
        (SELECT count(DISTINCT t) FROM memories, unnest(tags) AS t) AS tags,
        count(DISTINCT category) AS categories
      FROM memories
    `);
    const row = result.rows[0];
    return c.json({
      memories: parseInt(row.memories) || 0,
      tags: parseInt(row.tags) || 0,
      categories: parseInt(row.categories) || 0,
    });
  } catch {
    return c.json({ memories: 0, tags: 0, categories: 0 });
  }
});

export { stats };
