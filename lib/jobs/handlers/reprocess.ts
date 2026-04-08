import pgvector from 'pgvector';
import { query, getClient } from '../../db';
import { getEmbeddingProvider, splitOversizedChunks } from '../../pipeline/embed';
import { chunkText } from '../../pipeline/chunk';
import type { JobHandler } from '../types';

export const reprocessHandler: JobHandler<{}> = {
  displayName: 'Reprocessing',
  exclusive: true,

  async process(_payload, ctx) {
    const embedder = getEmbeddingProvider();

    const memoriesResult = await query(
      `SELECT id, title, content_type, raw_content, processed_content, markdown,
              summary, tags, category, created_at, source_url
       FROM memories`,
    );
    const memories = memoriesResult.rows;

    await ctx.progress({ total: memories.length });

    if (memories.length === 0) return;

    for (let i = 0; i < memories.length; i++) {
      if (await ctx.isCancelled()) return;

      const mem = memories[i];
      await ctx.progress({ currentItem: mem.title || mem.id });

      try {
        const content = mem.markdown || mem.raw_content || mem.processed_content || mem.summary || '';
        if (!content) {
          await ctx.tickSkipped();
          continue;
        }

        const chunks = await chunkText(content, mem.content_type);
        const safeChunks = splitOversizedChunks(chunks.length > 0 ? chunks : [content]);
        const textsToEmbed = safeChunks.length > 0 ? safeChunks : [content];

        const embeddings = await embedder.embed(textsToEmbed);

        const client = await getClient();
        try {
          await client.query('BEGIN');
          await client.query('DELETE FROM memory_chunks WHERE memory_id = $1', [mem.id]);

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

        await ctx.tick();
      } catch (err: any) {
        console.error(`Reprocess failed for memory ${mem.id} (${mem.title}):`, err.message);
        await ctx.tickFailed();
      }
    }
  },
};
