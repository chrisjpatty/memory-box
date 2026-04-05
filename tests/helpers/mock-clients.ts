/**
 * In-memory mock implementations of database clients for testing.
 * Mocks: Redis, Qdrant, Neo4j, MinIO storage.
 */
import { mock } from 'bun:test';

// --- Mock Redis ---

export function createMockRedis() {
  const store = new Map<string, string>();
  const hashes = new Map<string, Map<string, string>>();
  const ttls = new Map<string, number>();

  return {
    store,
    hashes,
    reset() {
      store.clear();
      hashes.clear();
      ttls.clear();
    },
    instance: {
      get: mock(async (key: string) => store.get(key) || null),
      set: mock(async (key: string, value: string, ...args: any[]) => {
        store.set(key, value);
        if (args[0] === 'EX' && args[1]) {
          ttls.set(key, args[1]);
        }
        return 'OK';
      }),
      del: mock(async (...keys: string[]) => {
        let count = 0;
        for (const key of keys) {
          if (store.has(key)) { store.delete(key); count++; }
          if (hashes.has(key)) { hashes.delete(key); count++; }
        }
        return count;
      }),
      incr: mock(async (key: string) => {
        const val = parseInt(store.get(key) || '0') + 1;
        store.set(key, String(val));
        return val;
      }),
      expire: mock(async (key: string, seconds: number) => {
        ttls.set(key, seconds);
        return 1;
      }),
      ttl: mock(async (key: string) => ttls.get(key) ?? -1),
      hset: mock(async (key: string, ...args: any[]) => {
        if (!hashes.has(key)) hashes.set(key, new Map());
        const h = hashes.get(key)!;
        if (args.length === 1 && typeof args[0] === 'object') {
          for (const [k, v] of Object.entries(args[0])) {
            h.set(k, String(v));
          }
        } else if (args.length === 2) {
          h.set(args[0], String(args[1]));
        }
        return 1;
      }),
      hget: mock(async (key: string, field: string) => {
        return hashes.get(key)?.get(field) || null;
      }),
      hgetall: mock(async (key: string) => {
        const h = hashes.get(key);
        if (!h || h.size === 0) return {};
        const obj: Record<string, string> = {};
        h.forEach((v, k) => { obj[k] = v; });
        return obj;
      }),
      hincrby: mock(async (key: string, field: string, increment: number) => {
        if (!hashes.has(key)) hashes.set(key, new Map());
        const h = hashes.get(key)!;
        const val = parseInt(h.get(field) || '0') + increment;
        h.set(field, String(val));
        return val;
      }),
      scan: mock(async (cursor: string, ...args: any[]) => {
        // Simple mock: return all matching keys in one batch
        const matchIdx = args.indexOf('MATCH');
        const pattern = matchIdx >= 0 ? args[matchIdx + 1] : '*';
        const prefix = pattern.replace('*', '');
        const keys = [...store.keys()].filter((k) => k.startsWith(prefix));
        return ['0', keys];
      }),
    },
  };
}

// --- Mock Qdrant ---

export function createMockQdrant() {
  const vectors: Array<{ id: string; vector: number[]; metadata: any }> = [];
  let indexCreated = false;

  return {
    vectors,
    reset() {
      vectors.length = 0;
      indexCreated = false;
    },
    instance: {
      createIndex: mock(async () => { indexCreated = true; }),
      upsert: mock(async ({ vectors: vecs, metadata }: any) => {
        for (let i = 0; i < vecs.length; i++) {
          vectors.push({
            id: `${Date.now()}-${i}`,
            vector: vecs[i],
            metadata: metadata[i],
          });
        }
      }),
      query: mock(async ({ topK }: any) => {
        return vectors.slice(0, topK).map((v, i) => ({
          id: v.id,
          score: 1 - i * 0.1,
          metadata: v.metadata,
        }));
      }),
      deleteVectors: mock(async ({ filter }: any) => {
        const memoryId = filter?.memoryId;
        if (memoryId) {
          const toRemove = vectors.filter((v) => v.metadata?.memoryId === memoryId);
          for (const v of toRemove) {
            const idx = vectors.indexOf(v);
            if (idx >= 0) vectors.splice(idx, 1);
          }
        }
      }),
      deleteIndex: mock(async () => {
        vectors.length = 0;
        indexCreated = false;
      }),
    },
  };
}

// --- Mock Neo4j ---

export function createMockNeo4j() {
  const memories: Map<string, any> = new Map();
  const tags: Map<string, Set<string>> = new Map(); // memoryId -> tags
  const queries: Array<{ query: string; params: any }> = [];

  function toNeo4jInt(n: number) {
    return { toNumber: () => n };
  }

  return {
    memories,
    tags,
    queries,
    reset() {
      memories.clear();
      tags.clear();
      queries.length = 0;
    },
    instance: {
      session: () => ({
        run: mock(async (query: string, params?: any) => {
          queries.push({ query, params });

          // Handle Memory list query
          if (query.includes('RETURN m ORDER BY')) {
            const skip = typeof params?.skip === 'object' ? Number(params.skip) : (params?.skip || 0);
            const limit = typeof params?.limit === 'object' ? Number(params.limit) : (params?.limit || 20);
            const records = [...memories.values()]
              .sort((a, b) => b.createdAt?.localeCompare?.(a.createdAt) || 0)
              .slice(skip, skip + limit)
              .map((m) => ({
                get: (field: string) => {
                  if (field === 'm') return { properties: m };
                  return m[field];
                },
              }));
            return { records };
          }

          // Handle count query
          if (query.includes('count(m) as total')) {
            return {
              records: [{
                get: (field: string) => {
                  if (field === 'total') return toNeo4jInt(memories.size);
                  return toNeo4jInt(0);
                },
              }],
            };
          }

          // Handle stats query
          if (query.includes('count(c) AS categories')) {
            const allTags = new Set<string>();
            tags.forEach((t) => t.forEach((tag) => allTags.add(tag)));
            const allCategories = new Set<string>();
            memories.forEach((m) => { if (m.category) allCategories.add(m.category); });
            return {
              records: [{
                get: (field: string) => {
                  if (field === 'memories') return toNeo4jInt(memories.size);
                  if (field === 'tags') return toNeo4jInt(allTags.size);
                  if (field === 'categories') return toNeo4jInt(allCategories.size);
                  return toNeo4jInt(0);
                },
              }],
            };
          }

          // Handle MERGE (upsert from ingest)
          if (query.includes('MERGE (m:Memory')) {
            if (params?.id) {
              memories.set(params.id, {
                id: params.id,
                title: params.title,
                contentType: params.contentType,
                category: params.category,
                createdAt: params.createdAt,
                summary: params.summary,
                searchContent: params.searchContent,
              });
              if (params.tags) {
                tags.set(params.id, new Set(params.tags));
              }
            }
            return { records: [] };
          }

          // Handle DELETE
          if (query.includes('DETACH DELETE')) {
            if (params?.id) {
              memories.delete(params.id);
              tags.delete(params.id);
            }
            return { records: [] };
          }

          // Handle fulltext index creation
          if (query.includes('CREATE FULLTEXT INDEX')) {
            return { records: [] };
          }

          // Handle fulltext search
          if (query.includes('db.index.fulltext.queryNodes')) {
            const results = [...memories.values()].slice(0, params?.limit || 5);
            return {
              records: results.map((m, i) => ({
                get: (field: string) => {
                  if (field === 'm') return { properties: m };
                  if (field === 'score') return 1 - i * 0.1;
                  if (field === 'tags') return [...(tags.get(m.id) || [])];
                  return null;
                },
              })),
            };
          }

          return { records: [] };
        }),
        close: mock(async () => {}),
      }),
    },
  };
}

// --- Mock Storage (MinIO) ---

export function createMockStorage() {
  const files = new Map<string, { data: Buffer; contentType: string }>();

  return {
    files,
    reset() {
      files.clear();
    },
    putFile: mock(async (key: string, data: Buffer, contentType: string) => {
      files.set(key, { data, contentType });
    }),
    getFile: mock(async (key: string) => files.get(key) || null),
    deleteFile: mock(async (key: string) => { files.delete(key); }),
    fileKey: (memoryId: string, filename: string) => `${memoryId}/${filename}`,
  };
}
