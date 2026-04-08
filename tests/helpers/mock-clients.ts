/**
 * In-memory mock PostgreSQL pool for testing.
 * Intercepts pool.query() calls and routes to in-memory data structures.
 */
import { mock } from 'bun:test';

interface MockMemory {
  id: string;
  content_type: string;
  title: string;
  tags: string[];
  category: string;
  summary: string;
  raw_content: string;
  processed_content: string;
  search_content: string;
  markdown: string | null;
  source_url: string | null;
  content_hash: string | null;
  file_key: string | null;
  mime_type: string | null;
  has_html: boolean;
  metadata: any;
  created_at: string;
  updated_at: string;
}

export function createMockPool() {
  const memories = new Map<string, MockMemory>();
  const chunks: Array<{ memory_id: string; chunk_index: number; text: string; embedding: number[] }> = [];
  let authTokenSeq = 0;
  const authTokens: Array<{ id: number; name: string; token_hash: string; hint: string; active: boolean; created_at: string }> = [];
  const sessions = new Map<string, { id: string; expires_at: string }>();
  const jobs = new Map<string, any>();
  const settings = new Map<string, string>();

  const queryFn = mock(async (text: string, params?: any[]) => {
    const sql = text.trim().toLowerCase();
    const p = params || [];

    // --- memories ---
    if (sql.includes('insert into memories')) {
      const mem: MockMemory = {
        id: p[0], content_type: p[1], title: p[2], tags: p[3] || [],
        category: p[4], summary: p[5], raw_content: p[6] || '',
        processed_content: p[7] || '', search_content: p[8] || '',
        markdown: p[9], source_url: p[10], content_hash: p[11],
        file_key: p[12], mime_type: p[13], has_html: p[14] || false,
        metadata: p[15] ? JSON.parse(p[15]) : {}, created_at: p[16] || new Date().toISOString(),
        updated_at: p[16] || new Date().toISOString(),
      };
      // Check unique constraints
      if (mem.content_hash) {
        for (const existing of memories.values()) {
          if (existing.content_hash === mem.content_hash) return { rows: [], rowCount: 0 };
        }
      }
      if (mem.source_url) {
        for (const existing of memories.values()) {
          if (existing.source_url === mem.source_url) return { rows: [], rowCount: 0 };
        }
      }
      memories.set(mem.id, mem);
      return { rows: [mem], rowCount: 1 };
    }

    if (sql.includes('select') && sql.includes('from memories') && sql.includes('where id =')) {
      const id = p[0];
      const mem = memories.get(id);
      return { rows: mem ? [mem] : [], rowCount: mem ? 1 : 0 };
    }

    if (sql.includes('select') && sql.includes('from memories') && sql.includes('content_hash =')) {
      const hash = p[0];
      for (const mem of memories.values()) {
        if (mem.content_hash === hash) return { rows: [{ id: mem.id }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }

    if (sql.includes('select') && sql.includes('from memories') && sql.includes('source_url =')) {
      const url = p[0];
      for (const mem of memories.values()) {
        if (mem.source_url === url) return { rows: [{ id: mem.id }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }

    if (sql.includes('delete from memories')) {
      const id = p[0];
      memories.delete(id);
      // CASCADE: remove chunks
      for (let i = chunks.length - 1; i >= 0; i--) {
        if (chunks[i].memory_id === id) chunks.splice(i, 1);
      }
      return { rows: [], rowCount: 1 };
    }

    if (sql.includes('select') && sql.includes('from memories') && sql.includes('order by')) {
      const allMems = [...memories.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
      return { rows: allMems, rowCount: allMems.length };
    }

    if (sql.includes('select') && sql.includes('from memories') && !sql.includes('where')) {
      return { rows: [...memories.values()], rowCount: memories.size };
    }

    // --- memory_chunks ---
    if (sql.includes('insert into memory_chunks')) {
      chunks.push({ memory_id: p[0], chunk_index: p[1], text: p[2], embedding: p[3] });
      return { rows: [], rowCount: 1 };
    }

    if (sql.includes('delete from memory_chunks')) {
      const memId = p[0];
      for (let i = chunks.length - 1; i >= 0; i--) {
        if (chunks[i].memory_id === memId) chunks.splice(i, 1);
      }
      return { rows: [], rowCount: 0 };
    }

    // Vector search mock: return chunks sorted by index
    if (sql.includes('memory_chunks') && sql.includes('<=>')) {
      const limit = p[1] || 10;
      const results = chunks.slice(0, limit).map((c) => ({
        memory_id: c.memory_id,
        snippet: c.text,
        score: 0.9,
        ...memories.get(c.memory_id),
      }));
      return { rows: results, rowCount: results.length };
    }

    // --- auth_tokens ---
    if (sql.includes('insert into auth_tokens')) {
      const t = { id: ++authTokenSeq, name: p[0], token_hash: p[1], hint: p[2], active: true, created_at: new Date().toISOString() };
      authTokens.push(t);
      return { rows: [t], rowCount: 1 };
    }

    if (sql.includes('update auth_tokens') && sql.includes('where id =')) {
      const id = p[0];
      const t = authTokens.find((t) => t.id === id && t.active);
      if (t) {
        t.active = false;
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }

    if (sql.includes('select') && sql.includes('auth_tokens') && sql.includes('token_hash')) {
      const hash = p[0];
      const found = authTokens.find((t) => t.token_hash === hash && t.active);
      return { rows: found ? [found] : [], rowCount: found ? 1 : 0 };
    }

    if (sql.includes('select') && sql.includes('auth_tokens') && sql.includes('active = true')) {
      const found = authTokens.filter((t) => t.active).sort((a, b) => b.created_at.localeCompare(a.created_at));
      return { rows: found, rowCount: found.length };
    }

    // --- sessions ---
    if (sql.includes('insert into sessions')) {
      sessions.set(p[0], { id: p[0], expires_at: p[1] });
      return { rows: [], rowCount: 1 };
    }

    if (sql.includes('select') && sql.includes('sessions') && sql.includes('where id =')) {
      const sess = sessions.get(p[0]);
      if (sess && new Date(sess.expires_at) > new Date()) {
        return { rows: [sess], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }

    if (sql.includes('delete from sessions')) {
      if (p[0]) sessions.delete(p[0]);
      return { rows: [], rowCount: 1 };
    }

    // --- jobs ---
    if (sql.includes('insert into jobs')) {
      const job = { id: p[0], type: p[1], status: 'running', total: 0, completed: 0, skipped: 0, failed: 0 };
      jobs.set(p[0], job);
      return { rows: [job], rowCount: 1 };
    }

    if (sql.includes('select') && sql.includes('from jobs') && sql.includes('where id =')) {
      const job = jobs.get(p[0]);
      return { rows: job ? [job] : [], rowCount: job ? 1 : 0 };
    }

    // --- settings ---
    if (sql.includes('insert into settings') || sql.includes('on conflict')) {
      settings.set(p[0], p[1]);
      return { rows: [], rowCount: 1 };
    }

    if (sql.includes('select') && sql.includes('settings') && sql.includes('where key =')) {
      const val = settings.get(p[0]);
      return { rows: val !== undefined ? [{ key: p[0], value: val }] : [], rowCount: val !== undefined ? 1 : 0 };
    }

    if (sql.includes('delete from settings')) {
      if (sql.includes('in')) {
        // DELETE FROM settings WHERE key IN (...)
        for (const k of p) settings.delete(k);
      } else {
        settings.delete(p[0]);
      }
      return { rows: [], rowCount: 1 };
    }

    // Stats queries
    if (sql.includes('count(*)') && sql.includes('memories')) {
      const tagSet = new Set<string>();
      const catSet = new Set<string>();
      for (const m of memories.values()) {
        m.tags.forEach((t: string) => tagSet.add(t));
        if (m.category) catSet.add(m.category);
      }
      return { rows: [{ memories: memories.size, tags: tagSet.size, categories: catSet.size }], rowCount: 1 };
    }

    // Fulltext search mock
    if (sql.includes('search_vector') && sql.includes('@@')) {
      return { rows: [...memories.values()].slice(0, p[1] || 5).map((m, i) => ({
        memory_id: m.id, title: m.title, content_type: m.content_type,
        summary: m.summary, tags: m.tags, category: m.category,
        created_at: m.created_at, source_url: m.source_url,
        snippet: m.processed_content?.slice(0, 300) || '', score: 1 - i * 0.1,
      })), rowCount: 0 };
    }

    // Schema init (CREATE TABLE, CREATE INDEX, etc.)
    if (sql.includes('create') || sql.includes('drop') || sql.includes('extension')) {
      return { rows: [], rowCount: 0 };
    }

    // Default: empty result
    return { rows: [], rowCount: 0 };
  });

  return {
    memories,
    chunks,
    authTokens,
    sessions,
    jobs,
    settings,
    reset() {
      memories.clear();
      chunks.length = 0;
      authTokens.length = 0;
      authTokenSeq = 0;
      sessions.clear();
      jobs.clear();
      settings.clear();
    },
    instance: {
      query: queryFn,
      connect: mock(async () => ({
        query: queryFn,
        release: mock(() => {}),
      })),
    },
  };
}

// --- Mock Storage (MinIO) --- kept from original

export function createMockStorage() {
  const files = new Map<string, { data: Buffer; contentType: string }>();

  return {
    files,
    reset() { files.clear(); },
    putFile: mock(async (key: string, data: Buffer, contentType: string) => {
      files.set(key, { data, contentType });
    }),
    getFile: mock(async (key: string) => files.get(key) || null),
    deleteFile: mock(async (key: string) => { files.delete(key); }),
    fileKey: (memoryId: string, filename: string) => `${memoryId}/${filename}`,
  };
}
