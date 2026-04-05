import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { query } from '../lib/db';

export const getMemory = createTool({
  id: 'get-memory',
  description: 'Get a specific memory by its ID. Returns the full metadata for a single memory.',
  inputSchema: z.object({
    memoryId: z.string().describe('The unique ID of the memory to retrieve'),
  }),
  outputSchema: z.object({
    found: z.boolean(),
    memory: z.object({
      id: z.string(),
      title: z.string(),
      contentType: z.string(),
      category: z.string(),
      summary: z.string(),
      tags: z.array(z.string()),
      createdAt: z.string(),
      source: z.string().optional(),
      rawContent: z.string().optional(),
      processedContent: z.string(),
      markdown: z.string().optional(),
      extra: z.record(z.any()).optional(),
    }).optional(),
  }),
  execute: async ({ memoryId }) => {
    const result = await query('SELECT * FROM memories WHERE id = $1', [memoryId]);

    if (result.rows.length === 0) return { found: false };

    const row = result.rows[0];
    return {
      found: true,
      memory: {
        id: row.id,
        title: row.title,
        contentType: row.content_type,
        category: row.category,
        summary: row.summary,
        tags: row.tags || [],
        createdAt: row.created_at,
        source: row.source_url || undefined,
        rawContent: row.raw_content || undefined,
        processedContent: row.processed_content || '',
        markdown: row.markdown || undefined,
        extra: row.metadata || undefined,
      },
    };
  },
});
