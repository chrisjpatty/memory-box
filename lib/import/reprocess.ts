import { nanoid } from 'nanoid';
import pgvector from 'pgvector';
import { query, getClient } from '../db';
import { getEmbeddingProvider, splitOversizedChunks } from '../pipeline/embed';
import { chunkText } from '../pipeline/chunk';

/**
 * Reprocess all existing memories: re-chunk and re-embed with the current model.
 * Used after switching embedding models or changing chunk settings.
 *
 * This replaces chunks per memory in the memory_chunks table.
 */
export async function processReprocessJob(jobId: string): Promise<void> {
  const embedder = getEmbeddingProvider();

  // 1. Collect all memories from Postgres
  const memoriesResult = await query(
    `SELECT id, title, content_type, raw_content, processed_content, markdown,
            summary, tags, category, created_at, source_url
     FROM memories`,
  );
  const memories = memoriesResult.rows;

  await query('UPDATE jobs SET total = $1 WHERE id = $2', [memories.length, jobId]);

  if (memories.length === 0) {
    await query(
      `UPDATE jobs SET status = 'completed', completed_at = $1 WHERE id = $2`,
      [new Date().toISOString(), jobId],
    );
    return;
  }

  // 2. Re-embed each memory
  for (let i = 0; i < memories.length; i++) {
    // Check cancellation
    const statusResult = await query('SELECT status FROM jobs WHERE id = $1', [jobId]);
    if (statusResult.rows[0]?.status === 'cancelled') {
      await query('UPDATE jobs SET completed_at = $1 WHERE id = $2', [new Date().toISOString(), jobId]);
      return;
    }

    const mem = memories[i];
    await query('UPDATE jobs SET current_item = $1 WHERE id = $2', [mem.title || mem.id, jobId]);

    try {
      // Get the best available content for re-embedding
      const content = mem.markdown || mem.raw_content || mem.processed_content || mem.summary || '';
      if (!content) {
        await query('UPDATE jobs SET completed = completed + 1, skipped = skipped + 1 WHERE id = $1', [jobId]);
        continue;
      }

      // Re-chunk with content-aware strategy
      const chunks = await chunkText(content, mem.content_type);
      const safeChunks = splitOversizedChunks(chunks.length > 0 ? chunks : [content]);
      const textsToEmbed = safeChunks.length > 0 ? safeChunks : [content];

      // Generate new embeddings
      const embeddings = await embedder.embed(textsToEmbed);

      // Replace chunks for this memory in a transaction
      const client = await getClient();
      try {
        await client.query('BEGIN');

        // Delete old chunks
        await client.query('DELETE FROM memory_chunks WHERE memory_id = $1', [mem.id]);

        // Insert new chunks with embeddings
        for (let idx = 0; idx < textsToEmbed.length; idx++) {
          await client.query(
            `INSERT INTO memory_chunks (memory_id, chunk_index, text, embedding)
             VALUES ($1, $2, $3, $4)`,
            [mem.id, idx, textsToEmbed[idx], pgvector.toSql(embeddings[idx])],
          );
        }

        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }

      await query('UPDATE jobs SET completed = completed + 1 WHERE id = $1', [jobId]);
    } catch (err: any) {
      console.error(`Reprocess failed for memory ${mem.id} (${mem.title}):`, err.message);
      await query('UPDATE jobs SET completed = completed + 1, failed = failed + 1 WHERE id = $1', [jobId]);
    }
  }

  await query(
    `UPDATE jobs SET status = 'completed', completed_at = $1, current_item = '' WHERE id = $2`,
    [new Date().toISOString(), jobId],
  );
}

export async function startReprocessJob(): Promise<string> {
  // Enforce single reprocess at a time
  const activeResult = await query(
    `SELECT id FROM jobs WHERE type = 'reprocess' AND status = 'running' LIMIT 1`,
  );
  if (activeResult.rows.length > 0) {
    throw new Error('A reprocessing job is already in progress');
  }

  const jobId = nanoid(21);
  await query(
    `INSERT INTO jobs (id, type, status, total, completed, skipped, failed, current_item, results, started_at)
     VALUES ($1, 'reprocess', 'running', 0, 0, 0, 0, '', '[]'::jsonb, $2)`,
    [jobId, new Date().toISOString()],
  );

  processReprocessJob(jobId).catch(async (err) => {
    console.error('Reprocess job failed:', err);
    await query(
      `UPDATE jobs SET status = 'failed', error = $1, completed_at = $2 WHERE id = $3`,
      [err.message, new Date().toISOString(), jobId],
    );
  });

  return jobId;
}
