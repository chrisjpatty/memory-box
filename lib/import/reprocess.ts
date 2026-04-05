import { nanoid } from 'nanoid';
import { MDocument } from '@mastra/rag';
import { getQdrant, getRedis, getNeo4j, QDRANT_INDEX_NAME, EMBEDDING_DIMENSION } from '../clients';
import { generateEmbeddings, splitOversizedChunks } from '../embeddings';

/**
 * Reprocess all existing memories: re-chunk and re-embed with the current model.
 * Used after switching embedding models or changing chunk settings.
 *
 * This rebuilds the Qdrant index from scratch using content stored in Redis.
 */
export async function processReprocessJob(jobId: string): Promise<void> {
  const redis = getRedis();
  const qdrant = getQdrant();

  // 1. Collect all memory IDs from Redis
  const memoryIds: string[] = [];
  let cursor = '0';
  do {
    const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', 'memory:*', 'COUNT', 200);
    cursor = nextCursor;
    for (const key of keys) {
      // Skip non-memory keys (like memory-box config keys)
      const id = key.replace('memory:', '');
      if (id && !id.includes(':')) memoryIds.push(id);
    }
  } while (cursor !== '0');

  await redis.hset(`reprocess-job:${jobId}`, {
    total: String(memoryIds.length),
  });

  if (memoryIds.length === 0) {
    await redis.hset(`reprocess-job:${jobId}`, {
      status: 'completed',
      completedAt: new Date().toISOString(),
    });
    return;
  }

  // 2. Delete and recreate the Qdrant index with the correct dimension
  try {
    await qdrant.deleteIndex({ indexName: QDRANT_INDEX_NAME });
  } catch { /* might not exist */ }

  await qdrant.createIndex({
    indexName: QDRANT_INDEX_NAME,
    dimension: EMBEDDING_DIMENSION,
  });

  // 3. Re-embed each memory
  for (let i = 0; i < memoryIds.length; i++) {
    // Check cancellation
    const status = await redis.hget(`reprocess-job:${jobId}`, 'status');
    if (status === 'cancelled') {
      await redis.hset(`reprocess-job:${jobId}`, 'completedAt', new Date().toISOString());
      return;
    }

    const memoryId = memoryIds[i];
    const raw = await redis.get(`memory:${memoryId}`);
    if (!raw) {
      await redis.hincrby(`reprocess-job:${jobId}`, 'completed', 1);
      await redis.hincrby(`reprocess-job:${jobId}`, 'skipped', 1);
      continue;
    }

    const meta = JSON.parse(raw);
    await redis.hset(`reprocess-job:${jobId}`, 'currentMemory', meta.title || memoryId);

    try {
      // Get the best available content for re-embedding
      const content = meta.markdown || meta.rawContent || meta.processedContent || meta.summary || '';
      if (!content) {
        await redis.hincrby(`reprocess-job:${jobId}`, 'completed', 1);
        await redis.hincrby(`reprocess-job:${jobId}`, 'skipped', 1);
        continue;
      }

      // Re-chunk with content-aware strategy
      const headingCount = (content.match(/^#{1,6}\s+/gm) || []).length;
      let chunks: { text: string }[];

      if (headingCount >= 2) {
        const doc = MDocument.fromMarkdown(content);
        chunks = await doc.chunk({ strategy: 'markdown' as const, maxSize: 4096, overlap: 200 });
      } else {
        const doc = MDocument.fromText(content);
        chunks = await doc.chunk({ strategy: 'recursive' as const, maxSize: 2048, overlap: 100 });
      }

      const chunkTexts = chunks.map((c) => c.text).filter(Boolean) as string[];
      const safeChunks = splitOversizedChunks(chunkTexts.length > 0 ? chunkTexts : [content]);
      const textsToEmbed = safeChunks.length > 0 ? safeChunks : [content];

      // Generate new embeddings
      const embeddings = await generateEmbeddings(textsToEmbed);

      // Store in Qdrant
      await qdrant.upsert({
        indexName: QDRANT_INDEX_NAME,
        vectors: embeddings,
        metadata: textsToEmbed.map((text, idx) => ({
          text,
          memoryId,
          chunkIndex: idx,
          title: meta.title,
          contentType: meta.contentType,
          tags: meta.tags || [],
          category: meta.category,
          summary: meta.summary,
          createdAt: meta.createdAt,
          source: meta.source,
        })),
      });

      await redis.hincrby(`reprocess-job:${jobId}`, 'completed', 1);
    } catch (err: any) {
      console.error(`Reprocess failed for memory ${memoryId} (${meta.title}):`, err.message);
      await redis.hincrby(`reprocess-job:${jobId}`, 'completed', 1);
      await redis.hincrby(`reprocess-job:${jobId}`, 'failed', 1);
    }
  }

  await redis.hset(`reprocess-job:${jobId}`, {
    status: 'completed',
    completedAt: new Date().toISOString(),
    currentMemory: '',
  });
  await redis.del('active-reprocess-job');
}

export async function startReprocessJob(): Promise<string> {
  const redis = getRedis();

  const activeJob = await redis.get('active-reprocess-job');
  if (activeJob) {
    const activeStatus = await redis.hget(`reprocess-job:${activeJob}`, 'status');
    if (activeStatus === 'running') {
      throw new Error('A reprocessing job is already in progress');
    }
    await redis.del('active-reprocess-job');
  }

  const jobId = nanoid(21);
  await redis.hset(`reprocess-job:${jobId}`, {
    status: 'running',
    total: '0',
    completed: '0',
    skipped: '0',
    failed: '0',
    currentMemory: '',
    startedAt: new Date().toISOString(),
  });
  await redis.expire(`reprocess-job:${jobId}`, 86400);
  await redis.set('active-reprocess-job', jobId, 'EX', 86400);

  processReprocessJob(jobId).catch(async (err) => {
    console.error('Reprocess job failed:', err);
    await redis.hset(`reprocess-job:${jobId}`, {
      status: 'failed',
      error: err.message,
      completedAt: new Date().toISOString(),
    });
    await redis.del('active-reprocess-job');
  });

  return jobId;
}
