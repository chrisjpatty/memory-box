/**
 * Hybrid search: combines semantic vector search with keyword fulltext search
 * using Reciprocal Rank Fusion for the final ranking.
 *
 * Both searches run as parallel Postgres queries.
 */
import pgvector from 'pgvector';
import { query } from './db';
import { getEmbeddingProvider } from './pipeline/embed';

export interface SearchOptions {
  limit?: number;
  collectionId?: number;
}

interface SearchHit {
  memoryId: string;
  title: string;
  contentType: string;
  snippet: string;
  summary: string;
  score: number;
  tags: string[];
  category: string;
  createdAt: string;
  source?: string;
  hasImage?: boolean;
  extra?: Record<string, string>;
  collectionIds?: number[];
}

/**
 * Vector search via pgvector embeddings.
 */
async function vectorSearch(queryText: string, limit: number, collectionId?: number): Promise<SearchHit[]> {
  const queryEmbedding = await getEmbeddingProvider().embedOne(queryText);

  const collectionJoin = collectionId
    ? `JOIN collection_memories cm ON cm.memory_id = mc.memory_id AND cm.collection_id = ${collectionId}`
    : '';

  const result = await query(
    `SELECT * FROM (
       SELECT DISTINCT ON (mc.memory_id)
         mc.memory_id, mc.text AS snippet,
         1 - (mc.embedding <=> $1::vector) AS score,
         m.title, m.content_type, m.summary, m.tags, m.category,
         m.created_at, m.source_url, m.metadata, m.file_key
       FROM memory_chunks mc
       JOIN memories m ON m.id = mc.memory_id
       ${collectionJoin}
       ORDER BY mc.memory_id, mc.embedding <=> $1::vector
     ) sub
     ORDER BY score DESC
     LIMIT $2`,
    [pgvector.toSql(queryEmbedding), limit * 3],
  );

  return result.rows
    .slice(0, limit)
    .map((r: any) => ({
      memoryId: r.memory_id,
      title: r.title || 'Untitled',
      contentType: r.content_type || 'text',
      snippet: r.snippet || '',
      summary: r.summary || '',
      score: r.score || 0,
      tags: r.tags || [],
      category: r.category || '',
      createdAt: r.created_at?.toISOString?.() || r.created_at || '',
      source: r.source_url || undefined,
      hasImage: r.file_key != null && !r.file_key.endsWith('/original.html'),
      extra: r.metadata || {},
    }));
}

/**
 * Keyword search via Postgres fulltext (tsvector/tsquery).
 */
async function keywordSearch(queryText: string, limit: number, collectionId?: number): Promise<SearchHit[]> {
  try {
    const collectionJoin = collectionId
      ? `JOIN collection_memories cm ON cm.memory_id = m.id AND cm.collection_id = ${collectionId}`
      : '';

    const result = await query(
      `SELECT m.id AS memory_id, m.title, m.content_type, m.summary, m.tags,
              m.category, m.created_at, m.source_url, m.metadata, m.file_key,
              LEFT(m.search_content, 300) AS snippet,
              ts_rank(m.search_vector, plainto_tsquery('english', $1)) AS score
       FROM memories m
       ${collectionJoin}
       WHERE m.search_vector @@ plainto_tsquery('english', $1)
       ORDER BY score DESC
       LIMIT $2`,
      [queryText, limit],
    );

    return result.rows.map((r: any) => ({
      memoryId: r.memory_id,
      title: r.title || 'Untitled',
      contentType: r.content_type || 'text',
      snippet: r.snippet || '',
      summary: r.summary || '',
      score: r.score || 0,
      tags: r.tags || [],
      category: r.category || '',
      createdAt: r.created_at?.toISOString?.() || r.created_at || '',
      source: r.source_url || undefined,
      hasImage: r.file_key != null && !r.file_key.endsWith('/original.html'),
      extra: r.metadata || {},
    }));
  } catch (e: any) {
    console.warn('Keyword search failed, falling back to vector-only:', e.message);
    return [];
  }
}

/**
 * Reciprocal Rank Fusion: merge two ranked lists into a single ranking.
 */
function reciprocalRankFusion(
  vectorResults: SearchHit[],
  keywordResults: SearchHit[],
  k = 60,
): SearchHit[] {
  const scores = new Map<string, { hit: SearchHit; rrfScore: number }>();

  vectorResults.forEach((hit, rank) => {
    const rrfScore = 1 / (k + rank + 1);
    scores.set(hit.memoryId, { hit, rrfScore });
  });

  keywordResults.forEach((hit, rank) => {
    const rrfScore = 1 / (k + rank + 1);
    const existing = scores.get(hit.memoryId);
    if (existing) {
      existing.rrfScore += rrfScore;
    } else {
      scores.set(hit.memoryId, { hit, rrfScore });
    }
  });

  return Array.from(scores.values())
    .sort((a, b) => b.rrfScore - a.rrfScore)
    .map(({ hit, rrfScore }) => ({ ...hit, score: rrfScore }));
}

/**
 * Hybrid search: combines semantic vector search with keyword fulltext search
 * using Reciprocal Rank Fusion for the final ranking.
 */
export async function hybridSearch(
  queryText: string,
  options: SearchOptions = {},
): Promise<{
  results: SearchHit[];
  totalFound: number;
}> {
  const limit = options.limit ?? 5;

  const [vectorHits, keywordHits] = await Promise.all([
    vectorSearch(queryText, limit * 2, options.collectionId),
    keywordSearch(queryText, limit * 2, options.collectionId),
  ]);

  const merged = reciprocalRankFusion(vectorHits, keywordHits);
  const results = merged.slice(0, limit);

  return { results, totalFound: results.length };
}
