import { Hono } from 'hono';
import { getNeo4j } from '../../../lib/clients';
import neo4j from 'neo4j-driver';

const stats = new Hono();

stats.get('/', async (c) => {
  try {
    const driver = getNeo4j();
    const session = driver.session();
    try {
      const result = await session.run(`
        OPTIONAL MATCH (m:Memory)
        WITH count(m) AS memories
        OPTIONAL MATCH (t:Tag)
        WITH memories, count(t) AS tags
        OPTIONAL MATCH (c:Category)
        RETURN memories, tags, count(c) AS categories
      `);
      const record = result.records[0];
      return c.json({
        memories: record?.get('memories')?.toNumber?.() ?? 0,
        tags: record?.get('tags')?.toNumber?.() ?? 0,
        categories: record?.get('categories')?.toNumber?.() ?? 0,
      });
    } finally {
      await session.close();
    }
  } catch {
    return c.json({ memories: 0, tags: 0, categories: 0 });
  }
});

export { stats };
