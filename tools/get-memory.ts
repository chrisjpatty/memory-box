import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getRedis } from '../lib/clients';

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
      processedContent: z.string(),
      markdown: z.string().optional(),
    }).optional(),
  }),
  execute: async ({ memoryId }) => {
    const redis = getRedis();
    const data = await redis.get(`memory:${memoryId}`);

    if (!data) return { found: false };

    const memory = JSON.parse(data);
    return {
      found: true,
      memory: {
        id: memory.id,
        title: memory.title,
        contentType: memory.contentType,
        category: memory.category,
        summary: memory.summary,
        tags: memory.tags || [],
        createdAt: memory.createdAt,
        source: memory.source,
        processedContent: memory.processedContent,
        markdown: memory.markdown,
      },
    };
  },
});
