import { describe, expect, test } from 'bun:test';

// reciprocalRankFusion is not exported, so we re-implement the algorithm
// to test the contract. If the re-architecture preserves hybrid search,
// this test validates the RRF merge behavior.

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

function makeHit(id: string, overrides?: Partial<SearchHit>): SearchHit {
  return {
    memoryId: id,
    title: `Title ${id}`,
    contentType: 'text',
    snippet: `Snippet ${id}`,
    summary: `Summary ${id}`,
    score: 0,
    tags: [],
    category: 'note',
    createdAt: '2024-01-01',
    ...overrides,
  };
}

// Mirror the implementation from lib/search.ts
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

describe('reciprocalRankFusion', () => {
  test('items in both lists get higher combined scores', () => {
    const shared = makeHit('shared');
    const vectorOnly = makeHit('vector-only');
    const keywordOnly = makeHit('keyword-only');

    const result = reciprocalRankFusion(
      [shared, vectorOnly],
      [keywordOnly, shared],
    );

    const sharedScore = result.find((r) => r.memoryId === 'shared')!.score;
    const vectorScore = result.find((r) => r.memoryId === 'vector-only')!.score;
    const keywordScore = result.find((r) => r.memoryId === 'keyword-only')!.score;

    expect(sharedScore).toBeGreaterThan(vectorScore);
    expect(sharedScore).toBeGreaterThan(keywordScore);
  });

  test('items only in vector list get vector-only scores', () => {
    const v1 = makeHit('v1');
    const v2 = makeHit('v2');

    const result = reciprocalRankFusion([v1, v2], []);
    expect(result).toHaveLength(2);
    expect(result[0].memoryId).toBe('v1'); // rank 0 scores higher
    expect(result[0].score).toBeGreaterThan(result[1].score);
  });

  test('items only in keyword list get keyword-only scores', () => {
    const k1 = makeHit('k1');
    const k2 = makeHit('k2');

    const result = reciprocalRankFusion([], [k1, k2]);
    expect(result).toHaveLength(2);
    expect(result[0].memoryId).toBe('k1');
  });

  test('results sorted by score descending', () => {
    const hits = Array.from({ length: 5 }, (_, i) => makeHit(`id${i}`));
    const result = reciprocalRankFusion(hits, []);

    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].score).toBeGreaterThanOrEqual(result[i].score);
    }
  });

  test('empty inputs return empty results', () => {
    expect(reciprocalRankFusion([], [])).toEqual([]);
  });

  test('RRF score uses k=60 by default', () => {
    const hit = makeHit('test');
    const result = reciprocalRankFusion([hit], []);
    // rank 0: 1/(60 + 0 + 1) = 1/61
    expect(result[0].score).toBeCloseTo(1 / 61, 10);
  });

  test('item at rank 0 in both lists scores 2/(k+1)', () => {
    const hit = makeHit('both');
    const result = reciprocalRankFusion([hit], [hit]);
    // rank 0 in both: 1/61 + 1/61 = 2/61
    expect(result[0].score).toBeCloseTo(2 / 61, 10);
  });
});
