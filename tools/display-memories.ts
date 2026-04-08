import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { query } from '../lib/db';

export const displayMemories = createTool({
  id: 'display-memories',
  description:
    'Display one or more memories to the user as rich visual cards in the chat. ' +
    'Call this tool whenever you want the user to SEE a memory — after searching, browsing, ' +
    'or referencing a specific memory. Pass the memory IDs you want to show.',
  inputSchema: z.object({
    memoryIds: z
      .array(z.string())
      .min(1)
      .describe('One or more memory IDs to display as cards to the user'),
  }),
  outputSchema: z.object({
    memories: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        contentType: z.string(),
        category: z.string(),
        summary: z.string(),
        tags: z.array(z.string()),
        createdAt: z.string(),
        source: z.string().optional(),
        hasImage: z.boolean(),
        extra: z.record(z.any()).optional(),
      }),
    ),
  }),
  execute: async ({ memoryIds }) => {
    if (memoryIds.length === 0) return { memories: [] };

    const placeholders = memoryIds.map((_, i) => `$${i + 1}`).join(', ');
    const result = await query(
      `SELECT id, title, content_type, category, summary, tags, created_at,
              source_url, file_key, metadata
       FROM memories WHERE id IN (${placeholders})`,
      memoryIds,
    );

    // Preserve the requested order
    const byId = new Map(result.rows.map((r: any) => [r.id, r]));
    const memories = memoryIds
      .map((id) => byId.get(id))
      .filter(Boolean)
      .map((r: any) => ({
        id: r.id,
        title: r.title,
        contentType: r.content_type,
        category: r.category || '',
        summary: r.summary || '',
        tags: r.tags || [],
        createdAt: typeof r.created_at === 'string' ? r.created_at : new Date(r.created_at).toISOString(),
        source: r.source_url || undefined,
        hasImage: r.file_key != null && !r.file_key.endsWith('/original.html'),
        extra: r.metadata || undefined,
      }));

    return { memories };
  },
});
