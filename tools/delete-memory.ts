import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getQdrant, getRedis, getNeo4j, QDRANT_INDEX_NAME } from '../lib/clients';
import { cleanupDedupKeys } from '../lib/ingest';

export const deleteMemory = createTool({
  id: 'delete-memory',
  description: 'Delete a specific memory by its ID. Removes it from all stores (vector database, cache, and graph).',
  inputSchema: z.object({
    memoryId: z.string().describe('The unique ID of the memory to delete'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
  }),
  execute: async ({ memoryId }) => {
    try {
      // Delete from Qdrant
      const qdrant = getQdrant();
      await qdrant.deleteVectors({
        indexName: QDRANT_INDEX_NAME,
        filter: { memoryId },
      });

      // Delete from Redis (memory data + dedup keys)
      const redis = getRedis();
      await redis.del(`memory:${memoryId}`);
      await cleanupDedupKeys(memoryId);

      // Delete from Neo4j
      const driver = getNeo4j();
      const session = driver.session();
      try {
        await session.run(
          'MATCH (m:Memory {id: $id}) DETACH DELETE m',
          { id: memoryId },
        );
      } finally {
        await session.close();
      }

      return { success: true, message: `Memory ${memoryId} deleted successfully.` };
    } catch (err: any) {
      return { success: false, message: `Failed to delete: ${err.message}` };
    }
  },
});
