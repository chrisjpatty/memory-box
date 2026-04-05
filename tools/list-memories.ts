import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import neo4j from 'neo4j-driver';
import { getNeo4j } from '../lib/clients';

export const listMemories = createTool({
  id: 'list-memories',
  description: 'List stored memories with optional filtering by content type, category, or tag. Good for browsing what has been stored.',
  inputSchema: z.object({
    contentType: z.enum(['text', 'url', 'image']).optional().describe('Filter by content type'),
    category: z.string().optional().describe('Filter by category'),
    tag: z.string().optional().describe('Filter by a specific tag'),
    limit: z.number().optional().describe('Maximum number of results (default: 20)'),
    skip: z.number().optional().describe('Number of results to skip for pagination'),
  }),
  outputSchema: z.object({
    memories: z.array(z.object({
      id: z.string(),
      title: z.string(),
      contentType: z.string(),
      category: z.string(),
      summary: z.string(),
      createdAt: z.string(),
    })),
    total: z.number(),
  }),
  execute: async ({ contentType, category, tag, limit, skip }) => {
    const driver = getNeo4j();
    const session = driver.session();
    try {
      const conditions: string[] = [];
      const params: Record<string, any> = {
        limit: neo4j.int(Math.floor(limit || 20)),
        skip: neo4j.int(Math.floor(skip || 0)),
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

      const memories = result.records.map((r: any) => {
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

      // Count total
      const countQuery = `${matchClause}${whereClause} RETURN count(m) as total`;
      const countResult = await session.run(countQuery, params);
      const total = countResult.records[0]?.get('total')?.toNumber?.() || 0;

      return { memories, total };
    } finally {
      await session.close();
    }
  },
});
