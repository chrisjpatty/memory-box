import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getNeo4j } from '../lib/clients';

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
    const driver = getNeo4j();
    const session = driver.session();
    const maxResults = Math.floor(limit || 10);

    try {
      switch (queryType) {
        case 'related-memories': {
          // Find memories that share tags with the given memory
          if (!memoryId) return { queryType, results: [], summary: 'Missing memoryId parameter' };

          const result = await session.run(
            `MATCH (m:Memory {id: $id})-[:TAGGED]->(t:Tag)<-[:TAGGED]-(related:Memory)
             WHERE related.id <> $id
             WITH related, collect(DISTINCT t.name) AS sharedTags, count(t) AS overlap
             RETURN related.id AS id, related.title AS title, related.contentType AS contentType,
                    related.summary AS summary, related.createdAt AS createdAt,
                    sharedTags, overlap
             ORDER BY overlap DESC
             LIMIT $limit`,
            { id: memoryId, limit: maxResults },
          );

          const results = result.records.map((r: any) => ({
            id: r.get('id'),
            title: r.get('title'),
            contentType: r.get('contentType'),
            summary: r.get('summary'),
            createdAt: r.get('createdAt'),
            sharedTags: r.get('sharedTags'),
            overlap: r.get('overlap')?.toNumber?.() || r.get('overlap'),
          }));

          return {
            queryType,
            results,
            summary: `Found ${results.length} memories related to ${memoryId} through shared tags`,
          };
        }

        case 'tag-co-occurrence': {
          // Find tags that frequently appear alongside the given tag
          if (!tag) return { queryType, results: [], summary: 'Missing tag parameter' };

          const result = await session.run(
            `MATCH (t1:Tag {name: $tag})<-[:TAGGED]-(m:Memory)-[:TAGGED]->(t2:Tag)
             WHERE t2.name <> $tag
             WITH t2.name AS coTag, count(m) AS coCount
             RETURN coTag, coCount
             ORDER BY coCount DESC
             LIMIT $limit`,
            { tag, limit: maxResults },
          );

          const results = result.records.map((r: any) => ({
            tag: r.get('coTag'),
            coOccurrences: r.get('coCount')?.toNumber?.() || r.get('coCount'),
          }));

          return {
            queryType,
            results,
            summary: `Tags that co-occur with "${tag}": ${results.map((r: any) => `${r.tag} (${r.coOccurrences})`).join(', ')}`,
          };
        }

        case 'top-tags': {
          const result = await session.run(
            `MATCH (t:Tag)<-[:TAGGED]-(m:Memory)
             WITH t.name AS tagName, count(m) AS memoryCount
             RETURN tagName, memoryCount
             ORDER BY memoryCount DESC
             LIMIT $limit`,
            { limit: maxResults },
          );

          const results = result.records.map((r: any) => ({
            tag: r.get('tagName'),
            count: r.get('memoryCount')?.toNumber?.() || r.get('memoryCount'),
          }));

          return {
            queryType,
            results,
            summary: `Top ${results.length} tags: ${results.map((r: any) => `${r.tag} (${r.count})`).join(', ')}`,
          };
        }

        case 'top-categories': {
          const result = await session.run(
            `MATCH (c:Category)<-[:CATEGORIZED]-(m:Memory)
             WITH c.name AS categoryName, count(m) AS memoryCount
             RETURN categoryName, memoryCount
             ORDER BY memoryCount DESC
             LIMIT $limit`,
            { limit: maxResults },
          );

          const results = result.records.map((r: any) => ({
            category: r.get('categoryName'),
            count: r.get('memoryCount')?.toNumber?.() || r.get('memoryCount'),
          }));

          return {
            queryType,
            results,
            summary: `Top ${results.length} categories: ${results.map((r: any) => `${r.category} (${r.count})`).join(', ')}`,
          };
        }

        case 'tags-for-category': {
          if (!category) return { queryType, results: [], summary: 'Missing category parameter' };

          const result = await session.run(
            `MATCH (c:Category {name: $category})<-[:CATEGORIZED]-(m:Memory)-[:TAGGED]->(t:Tag)
             WITH t.name AS tagName, count(m) AS memoryCount
             RETURN tagName, memoryCount
             ORDER BY memoryCount DESC
             LIMIT $limit`,
            { category, limit: maxResults },
          );

          const results = result.records.map((r: any) => ({
            tag: r.get('tagName'),
            count: r.get('memoryCount')?.toNumber?.() || r.get('memoryCount'),
          }));

          return {
            queryType,
            results,
            summary: `Tags in category "${category}": ${results.map((r: any) => `${r.tag} (${r.count})`).join(', ')}`,
          };
        }

        case 'recent-activity': {
          const result = await session.run(
            `MATCH (m:Memory)
             OPTIONAL MATCH (m)-[:TAGGED]->(t:Tag)
             WITH m, collect(t.name) AS tags
             RETURN m.id AS id, m.title AS title, m.contentType AS contentType,
                    m.category AS category, m.createdAt AS createdAt, tags
             ORDER BY m.createdAt DESC
             LIMIT $limit`,
            { limit: maxResults },
          );

          const results = result.records.map((r: any) => ({
            id: r.get('id'),
            title: r.get('title'),
            contentType: r.get('contentType'),
            category: r.get('category'),
            createdAt: r.get('createdAt'),
            tags: r.get('tags'),
          }));

          return {
            queryType,
            results,
            summary: `${results.length} most recently saved memories`,
          };
        }

        case 'memory-connections': {
          // Show the full connection graph for a specific memory
          if (!memoryId) return { queryType, results: [], summary: 'Missing memoryId parameter' };

          const result = await session.run(
            `MATCH (m:Memory {id: $id})
             OPTIONAL MATCH (m)-[:TAGGED]->(t:Tag)
             OPTIONAL MATCH (m)-[:CATEGORIZED]->(c:Category)
             WITH m, collect(DISTINCT t.name) AS tags, collect(DISTINCT c.name) AS categories
             OPTIONAL MATCH (m)-[:TAGGED]->(t:Tag)<-[:TAGGED]-(related:Memory)
             WHERE related.id <> $id
             WITH m, tags, categories, collect(DISTINCT {id: related.id, title: related.title}) AS relatedMemories
             RETURN m.title AS title, m.contentType AS contentType, m.summary AS summary,
                    m.createdAt AS createdAt, tags, categories, relatedMemories`,
            { id: memoryId },
          );

          if (result.records.length === 0) {
            return { queryType, results: [], summary: `Memory ${memoryId} not found in graph` };
          }

          const r = result.records[0];
          const connections = {
            title: r.get('title'),
            contentType: r.get('contentType'),
            summary: r.get('summary'),
            createdAt: r.get('createdAt'),
            tags: r.get('tags'),
            categories: r.get('categories'),
            relatedMemories: r.get('relatedMemories'),
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
    } finally {
      await session.close();
    }
  },
});
