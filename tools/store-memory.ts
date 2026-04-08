import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { ingest } from '../lib/ingest';

export const storeMemory = createTool({
  id: 'store-memory',
  description: 'Store a new memory in the database. Use this when the user wants to save text, a URL, or any content for later recall. The content will be automatically classified, processed, and made searchable.',
  inputSchema: z.object({
    content: z.string().describe('The content to store - can be text, a URL, or base64 image data'),
    title: z.string().optional().describe('Optional title for the memory'),
    tags: z.array(z.string()).optional().describe('Optional tags for categorization'),
  }),
  outputSchema: z.object({
    memoryId: z.string(),
    contentType: z.string(),
    title: z.string(),
    chunks: z.number(),
    message: z.string(),
  }),
  execute: async ({ content, title, tags }) => {
    const result = await ingest({ content, title, tags });
    if (Array.isArray(result)) {
      const titles = result.map(r => r.title).join(', ');
      return {
        memoryId: result[0]?.memoryId || '',
        contentType: 'multiple',
        title: titles,
        chunks: result.reduce((sum, r) => sum + r.chunks, 0),
        message: `Stored ${result.length} items: ${titles}`,
      };
    }
    return {
      ...result,
      message: `Stored "${result.title}" as ${result.contentType} memory (${result.chunks} chunks).`,
    };
  },
});
