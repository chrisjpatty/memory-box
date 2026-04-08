import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { query } from '../lib/db';

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
    const maxLimit = Math.floor(limit || 20);
    const offset = Math.floor(skip || 0);

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

    // Fetch memories
    const selectQuery = `SELECT id, title, content_type, category, summary, created_at
      FROM memories${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(maxLimit, offset);

    const result = await query(selectQuery, params);

    const memories = result.rows.map((r: any) => ({
      id: r.id,
      title: r.title,
      contentType: r.content_type,
      category: r.category || '',
      summary: r.summary || '',
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at || '',
    }));

    // Count total (reuse conditions but without LIMIT/OFFSET params)
    const countParams = params.slice(0, params.length - 2);
    const countQuery = `SELECT COUNT(*) AS total FROM memories${whereClause}`;
    const countResult = await query(countQuery, countParams);
    const total = Number(countResult.rows[0]?.total || 0);

    return { memories, total };
  },
});
