import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { deleteMemory as deleteMemoryFromStore } from '../lib/pipeline/store';

export const deleteMemory = createTool({
  id: 'delete-memory',
  description: 'Delete a specific memory by its ID. Removes it from all stores (database, vector chunks, and files).',
  inputSchema: z.object({
    memoryId: z.string().describe('The unique ID of the memory to delete'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
  }),
  execute: async ({ memoryId }) => {
    try {
      await deleteMemoryFromStore(memoryId);
      return { success: true, message: `Memory ${memoryId} deleted successfully.` };
    } catch (err: any) {
      return { success: false, message: `Failed to delete: ${err.message}` };
    }
  },
});
