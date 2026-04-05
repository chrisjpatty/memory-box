import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { query } from '../lib/db';

export const graphQuery = createTool({
  id: 'graph-query',
  description: `Explore the knowledge graph to discover relationships between memories, tags, and categories. Use this to:
- Find what tags/topics co-occur (what subjects are connected)
- Discover memories related to a specific memory through shared tags
- Get an overview of what categories or tags exist
- Find temporal patterns (what was saved when)
- Understand the landscape of stored knowledge before doing targeted searches`,
  inputSchema: z.object({
    queryType: z.enum([
      'related-memories',
      'tag-co-occurrence',
      'top-tags',
      'top-categories',
      'tags-for-category',
      'recent-activity',
      'memory-connections',
    ]).describe('The type of graph query to run'),
    memoryId: z.string().optional().describe('Memory ID (for related-memories and memory-connections queries)'),
    tag: z.string().optional().describe('Tag name (for tag-co-occurrence query)'),
    category: z.string().optional().describe('Category name (for tags-for-category query)'),
    limit: z.number().optional().describe('Max results (default: 10)'),
  }),
  outputSchema: z.object({
    queryType: z.string(),
    results: z.array(z.record(z.any())),
    summary: z.string(),
  }),
  execute: async ({ queryType, memoryId, tag, category, limit }) => {
    const maxResults = Math.floor(limit || 10);

    switch (queryType) {
      case 'related-memories': {
        if (!memoryId) return { queryType, results: [], summary: 'Missing memoryId parameter' };

        const result = await query(
          `SELECT m2.id, m2.title, m2.content_type, m2.summary, m2.created_at,
                  array_agg(shared_tag) AS shared_tags, COUNT(shared_tag) AS overlap
           FROM memories m1, unnest(m1.tags) AS shared_tag
           JOIN memories m2 ON shared_tag = ANY(m2.tags) AND m2.id != m1.id
           WHERE m1.id = $1
           GROUP BY m2.id, m2.title, m2.content_type, m2.summary, m2.created_at
           ORDER BY overlap DESC
           LIMIT $2`,
          [memoryId, maxResults],
        );

        const results = result.rows.map((r: any) => ({
          id: r.id,
          title: r.title,
          contentType: r.content_type,
          summary: r.summary,
          createdAt: r.created_at,
          sharedTags: r.shared_tags,
          overlap: Number(r.overlap),
        }));

        return {
          queryType,
          results,
          summary: `Found ${results.length} memories related to ${memoryId} through shared tags`,
        };
      }

      case 'tag-co-occurrence': {
        if (!tag) return { queryType, results: [], summary: 'Missing tag parameter' };

        const result = await query(
          `SELECT t2 AS co_tag, COUNT(*) AS co_count
           FROM memories m, unnest(m.tags) AS t1, unnest(m.tags) AS t2
           WHERE t1 = $1 AND t2 != $1
           GROUP BY t2
           ORDER BY co_count DESC
           LIMIT $2`,
          [tag, maxResults],
        );

        const results = result.rows.map((r: any) => ({
          tag: r.co_tag,
          coOccurrences: Number(r.co_count),
        }));

        return {
          queryType,
          results,
          summary: `Tags that co-occur with "${tag}": ${results.map((r: any) => `${r.tag} (${r.coOccurrences})`).join(', ')}`,
        };
      }

      case 'top-tags': {
        const result = await query(
          `SELECT tag AS tag_name, COUNT(*) AS memory_count
           FROM (SELECT unnest(tags) AS tag FROM memories) sub
           GROUP BY tag
           ORDER BY memory_count DESC
           LIMIT $1`,
          [maxResults],
        );

        const results = result.rows.map((r: any) => ({
          tag: r.tag_name,
          count: Number(r.memory_count),
        }));

        return {
          queryType,
          results,
          summary: `Top ${results.length} tags: ${results.map((r: any) => `${r.tag} (${r.count})`).join(', ')}`,
        };
      }

      case 'top-categories': {
        const result = await query(
          `SELECT category AS category_name, COUNT(*) AS memory_count
           FROM memories
           GROUP BY category
           ORDER BY memory_count DESC
           LIMIT $1`,
          [maxResults],
        );

        const results = result.rows.map((r: any) => ({
          category: r.category_name,
          count: Number(r.memory_count),
        }));

        return {
          queryType,
          results,
          summary: `Top ${results.length} categories: ${results.map((r: any) => `${r.category} (${r.count})`).join(', ')}`,
        };
      }

      case 'tags-for-category': {
        if (!category) return { queryType, results: [], summary: 'Missing category parameter' };

        const result = await query(
          `SELECT tag AS tag_name, COUNT(*) AS memory_count
           FROM (SELECT unnest(tags) AS tag FROM memories WHERE category = $1) sub
           GROUP BY tag
           ORDER BY memory_count DESC
           LIMIT $2`,
          [category, maxResults],
        );

        const results = result.rows.map((r: any) => ({
          tag: r.tag_name,
          count: Number(r.memory_count),
        }));

        return {
          queryType,
          results,
          summary: `Tags in category "${category}": ${results.map((r: any) => `${r.tag} (${r.count})`).join(', ')}`,
        };
      }

      case 'recent-activity': {
        const result = await query(
          `SELECT m.id, m.title, m.content_type AS "contentType", m.category,
                  m.created_at AS "createdAt", m.tags
           FROM memories m
           ORDER BY m.created_at DESC
           LIMIT $1`,
          [maxResults],
        );

        const results = result.rows.map((r: any) => ({
          id: r.id,
          title: r.title,
          contentType: r.contentType,
          category: r.category,
          createdAt: r.createdAt,
          tags: r.tags || [],
        }));

        return {
          queryType,
          results,
          summary: `${results.length} most recently saved memories`,
        };
      }

      case 'memory-connections': {
        if (!memoryId) return { queryType, results: [], summary: 'Missing memoryId parameter' };

        // First get the memory's own data
        const memResult = await query(
          `SELECT title, content_type, summary, created_at, tags, category
           FROM memories WHERE id = $1`,
          [memoryId],
        );

        if (memResult.rows.length === 0) {
          return { queryType, results: [], summary: `Memory ${memoryId} not found in graph` };
        }

        const mem = memResult.rows[0];

        // Find related memories via tag overlap
        const relatedResult = await query(
          `SELECT DISTINCT m2.id, m2.title
           FROM memories m1, unnest(m1.tags) AS shared_tag
           JOIN memories m2 ON shared_tag = ANY(m2.tags) AND m2.id != m1.id
           WHERE m1.id = $1`,
          [memoryId],
        );

        const connections = {
          title: mem.title,
          contentType: mem.content_type,
          summary: mem.summary,
          createdAt: mem.created_at,
          tags: mem.tags || [],
          categories: mem.category ? [mem.category] : [],
          relatedMemories: relatedResult.rows.map((r: any) => ({ id: r.id, title: r.title })),
        };

        return {
          queryType,
          results: [connections],
          summary: `Memory "${connections.title}" has ${connections.tags.length} tags, ${connections.relatedMemories.length} related memories`,
        };
      }

      default:
        return { queryType, results: [], summary: `Unknown query type: ${queryType}` };
    }
  },
});
