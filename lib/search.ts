import { getQdrant, getNeo4j, QDRANT_INDEX_NAME } from './clients';
import { generateEmbedding } from './embeddings';

const FULLTEXT_INDEX_NAME = 'memory_fulltext';

let fulltextIndexReady = false;

/**
 * Ensure the Neo4j fulltext index exists for hybrid keyword search.
 * Creates it on first call; subsequent calls are no-ops.
 */
export async function ensureFulltextIndex(): Promise<void> {
  if (fulltextIndexReady) return;
  const driver = getNeo4j();
  const session = driver.session();
  try {
    await session.run(
      `CREATE FULLTEXT INDEX ${FULLTEXT_INDEX_NAME} IF NOT EXISTS
       FOR (m:Memory)
       ON EACH [m.title, m.summary, m.searchContent]`,
    );
    fulltextIndexReady = true;
  } catch (e: any) {
    // Index may already exist under a different config — that's fine
    if (!e.message?.includes('already exists')) {
      console.warn('Fulltext index creation warning:', e.message);
    }
    fulltextIndexReady = true;
  } finally {
    await session.close();
  }
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
}

/**
 * Vector search via Qdrant embeddings.
 */
async function vectorSearch(query: string, limit: number): Promise<SearchHit[]> {
  const qdrant = getQdrant();
  const queryEmbedding = await generateEmbedding(query);

  const results = await qdrant.query({
    indexName: QDRANT_INDEX_NAME,
    queryVector: queryEmbedding,
    topK: limit * 3,
  });

  // Deduplicate by memoryId (multiple chunks may match)
  const seen = new Set<string>();
  return results
    .filter((r: any) => {
      const mid = r.metadata?.memoryId;
      if (!mid || seen.has(mid)) return false;
      seen.add(mid);
      return true;
    })
    .slice(0, limit)
    .map((r: any) => ({
      memoryId: r.metadata?.memoryId || r.id,
      title: r.metadata?.title || 'Untitled',
      contentType: r.metadata?.contentType || 'text',
      snippet: r.metadata?.text || '',
      summary: r.metadata?.summary || '',
      score: r.score || 0,
      tags: r.metadata?.tags || [],
      category: r.metadata?.category || '',
      createdAt: r.metadata?.createdAt || '',
      source: r.metadata?.source,
    }));
}

/**
 * Keyword search via Neo4j fulltext index (Lucene-based).
 */
async function keywordSearch(query: string, limit: number): Promise<SearchHit[]> {
  await ensureFulltextIndex();

  const driver = getNeo4j();
  const session = driver.session();
  try {
    // Escape special Lucene characters and build a fuzzy query
    const sanitized = query.replace(/[+\-&|!(){}[\]^"~*?:\\/]/g, '\\$&');
    // Split into terms and add fuzzy matching (~)
    const fuzzyQuery = sanitized.split(/\s+/).filter(Boolean).map((t) => `${t}~`).join(' ');

    const result = await session.run(
      `CALL db.index.fulltext.queryNodes($indexName, $query)
       YIELD node, score
       WITH node AS m, score
       OPTIONAL MATCH (m)-[:TAGGED]->(t:Tag)
       WITH m, score, collect(t.name) AS tags
       RETURN m, score, tags
       ORDER BY score DESC
       LIMIT $limit`,
      { indexName: FULLTEXT_INDEX_NAME, query: fuzzyQuery || query, limit: Math.floor(limit) },
    );

    return result.records.map((r: any) => {
      const m = r.get('m').properties;
      const score = r.get('score');
      const tags = r.get('tags') || [];
      return {
        memoryId: m.id,
        title: m.title || 'Untitled',
        contentType: m.contentType || 'text',
        snippet: (m.searchContent || '').slice(0, 300),
        summary: m.summary || '',
        score: typeof score === 'number' ? score : score?.toNumber?.() || 0,
        tags,
        category: m.category || '',
        createdAt: m.createdAt || '',
        source: undefined,
      };
    });
  } catch (e: any) {
    console.warn('Keyword search failed, falling back to vector-only:', e.message);
    return [];
  } finally {
    await session.close();
  }
}

/**
 * Reciprocal Rank Fusion: merge two ranked lists into a single ranking.
 * Higher-scored items from either list get boosted; items in both lists get the most boost.
 *
 * @param k - smoothing constant (default 60, standard in RRF literature)
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
      // Prefer the vector hit's snippet (chunk-level) over keyword hit's snippet
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
export async function hybridSearch(query: string, limit = 5): Promise<{
  results: SearchHit[];
  totalFound: number;
}> {
  // Run both searches in parallel
  const [vectorHits, keywordHits] = await Promise.all([
    vectorSearch(query, limit * 2),
    keywordSearch(query, limit * 2),
  ]);

  const merged = reciprocalRankFusion(vectorHits, keywordHits);
  const results = merged.slice(0, limit);

  return { results, totalFound: results.length };
}
