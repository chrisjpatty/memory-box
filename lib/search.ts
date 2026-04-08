/**
 * Hybrid search: combines semantic vector search with keyword fulltext search
 * using Reciprocal Rank Fusion for the final ranking.
 *
 * Both searches run as parallel Postgres queries.
 */
import pgvector from 'pgvector';
import { query } from './db';
import { getEmbeddingProvider } from './pipeline/embed';

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
}

/**
 * Vector search via pgvector embeddings.
 */
async function vectorSearch(queryText: string, limit: number): Promise<SearchHit[]> {
  const queryEmbedding = await getEmbeddingProvider().embedOne(queryText);

  const result = await query(
    `SELECT DISTINCT ON (mc.memory_id)
       mc.memory_id, mc.text AS snippet,
       1 - (mc.embedding <=> $1::vector) AS score,
       m.title, m.content_type, m.summary, m.tags, m.category,
       m.created_at, m.source_url, m.metadata, m.file_key
     FROM memory_chunks mc
     JOIN memories m ON m.id = mc.memory_id
     ORDER BY mc.memory_id, mc.embedding <=> $1::vector
     LIMIT $2`,
    [pgvector.toSql(queryEmbedding), limit * 3],
  );

  // Re-sort by score after DISTINCT ON
  return result.rows
    .sort((a: any, b: any) => b.score - a.score)
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
      source: r.source_url,
      hasImage: r.file_key != null && !r.file_key.endsWith('/original.html'),
      extra: r.metadata || {},
    }));
}

/**
 * Keyword search via Postgres fulltext (tsvector/tsquery).
 */
async function keywordSearch(queryText: string, limit: number): Promise<SearchHit[]> {
  try {
    const result = await query(
      `SELECT m.id AS memory_id, m.title, m.content_type, m.summary, m.tags,
              m.category, m.created_at, m.source_url, m.metadata, m.file_key,
              LEFT(m.search_content, 300) AS snippet,
              ts_rank(m.search_vector, plainto_tsquery('english', $1)) AS score
       FROM memories m
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
      source: r.source_url,
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
export async function hybridSearch(queryText: string, limit = 5): Promise<{
  results: SearchHit[];
  totalFound: number;
}> {
  const [vectorHits, keywordHits] = await Promise.all([
    vectorSearch(queryText, limit * 2),
    keywordSearch(queryText, limit * 2),
  ]);

  const merged = reciprocalRankFusion(vectorHits, keywordHits);
  const results = merged.slice(0, limit);

  return { results, totalFound: results.length };
}
