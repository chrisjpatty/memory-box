import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { hybridSearch } from '../lib/search';

export const searchMemories = createTool({
  id: 'search-memories',
  description: 'Search stored memories using hybrid semantic + keyword search. Returns matching memories ranked by relevance with a snippet and summary. Use multiple searches with different queries to get a broader picture of what the user knows about a topic. To read the full content of a specific memory, use the get-memory tool with the memoryId.',
  inputSchema: z.object({
    query: z.string().describe('The search query - a question, topic, or concept to search for'),
    limit: z.number().optional().describe('Maximum number of results to return (default: 5)'),
  }),
  outputSchema: z.object({
    results: z.array(z.object({
      memoryId: z.string(),
      title: z.string(),
      contentType: z.string(),
      snippet: z.string(),
      summary: z.string(),
      score: z.number(),
      tags: z.array(z.string()),
      category: z.string(),
      createdAt: z.string(),
      source: z.string().optional(),
    })),
    totalFound: z.number(),
  }),
  execute: async ({ query, limit }) => {
    return hybridSearch(query, limit || 5);
  },
});
