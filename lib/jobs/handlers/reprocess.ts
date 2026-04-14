import pgvector from 'pgvector';
import { query, getClient } from '../../db';
import { getEmbeddingProvider, splitOversizedChunks } from '../../pipeline/embed';
import { chunkText } from '../../pipeline/chunk';
import { getFile } from '../../storage';
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

        // Text chunks
        const chunks = await chunkText(content, mem.content_type);
        const safeChunks = splitOversizedChunks(chunks.length > 0 ? chunks : [content]);
        const textsToEmbed = safeChunks.length > 0 ? safeChunks : [content];
        const embeddings = await embedder.embed(textsToEmbed);

        // Image embeddings: find locally-stored images referenced in content
        const imageEmbeddings: { mediaId: string; embedding: number[] }[] = [];
        const mediaPattern = /\/api\/media\/([a-zA-Z0-9_-]+)/g;
        const mediaIds = [...new Set([...content.matchAll(mediaPattern)].map(m => m[1]))];

        // Also check metadata for media references
        const meta = mem.metadata || {};
        if (meta.avatarUrl?.startsWith('/api/media/')) {
          const id = meta.avatarUrl.replace('/api/media/', '');
          if (!mediaIds.includes(id)) mediaIds.push(id);
        }
        if (meta.mediaUrls) {
          for (const u of meta.mediaUrls.split(',').map((s: string) => s.trim())) {
            if (u.startsWith('/api/media/')) {
              const id = u.replace('/api/media/', '');
              if (!mediaIds.includes(id)) mediaIds.push(id);
            }
          }
        }

        for (const mediaId of mediaIds) {
          try {
            const mediaRow = await query('SELECT key, content_type FROM media WHERE id = $1', [mediaId]);
            if (!mediaRow.rows[0]) continue;
            const { key, content_type } = mediaRow.rows[0];
            if (!content_type.startsWith('image/')) continue;
            const file = await getFile(key);
            if (!file) continue;
            const embedding = await embedder.embedImage(file.data.toString('base64'));
            imageEmbeddings.push({ mediaId, embedding });
          } catch { /* skip failed image embeddings */ }
        }

        const client = await getClient();
        try {
          await client.query('BEGIN');
          await client.query('DELETE FROM memory_chunks WHERE memory_id = $1', [mem.id]);

          // Text chunks
          for (let idx = 0; idx < textsToEmbed.length; idx++) {
            await client.query(
              `INSERT INTO memory_chunks (memory_id, chunk_index, text, embedding)
               VALUES ($1, $2, $3, $4)`,
              [mem.id, idx, textsToEmbed[idx], pgvector.toSql(embeddings[idx])],
            );
          }

          // Image chunks
          for (let idx = 0; idx < imageEmbeddings.length; idx++) {
            const ie = imageEmbeddings[idx];
            await client.query(
              `INSERT INTO memory_chunks (memory_id, chunk_index, text, embedding)
               VALUES ($1, $2, $3, $4)`,
              [mem.id, textsToEmbed.length + idx, `[image:${ie.mediaId}]`, pgvector.toSql(ie.embedding)],
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
