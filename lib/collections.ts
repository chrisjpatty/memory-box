import { query, getClient } from './db';

export interface Collection {
  id: number;
  name: string;
  description: string | null;
  color: string | null;
  created_at: string;
  updated_at: string;
  memory_count?: number;
}

export interface CollectionMemory {
  id: string;
  title: string;
  content_type: string;
  category: string;
  summary: string;
  tags: string[];
  source_url: string | null;
  file_key: string | null;
  metadata: Record<string, any>;
  created_at: string;
  added_at: string;
}

export async function listCollections(): Promise<Collection[]> {
  const result = await query(
    `SELECT c.*, count(cm.memory_id)::int AS memory_count
     FROM collections c
     LEFT JOIN collection_memories cm ON cm.collection_id = c.id
     GROUP BY c.id
     ORDER BY c.updated_at DESC`,
  );
  return result.rows;
}

export async function getCollection(id: number): Promise<Collection | null> {
  const result = await query(
    `SELECT c.*, count(cm.memory_id)::int AS memory_count
     FROM collections c
     LEFT JOIN collection_memories cm ON cm.collection_id = c.id
     WHERE c.id = $1
     GROUP BY c.id`,
    [id],
  );
  return result.rows[0] ?? null;
}

export async function createCollection(
  name: string,
  description?: string,
  color?: string,
): Promise<Collection> {
  const result = await query(
    `INSERT INTO collections (name, description, color)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [name, description ?? null, color ?? null],
  );
  return { ...result.rows[0], memory_count: 0 };
}

export async function updateCollection(
  id: number,
  fields: { name?: string; description?: string; color?: string },
): Promise<Collection | null> {
  const sets: string[] = [];
  const params: any[] = [];
  let idx = 1;

  if (fields.name !== undefined) {
    sets.push(`name = $${idx++}`);
    params.push(fields.name);
  }
  if (fields.description !== undefined) {
    sets.push(`description = $${idx++}`);
    params.push(fields.description);
  }
  if (fields.color !== undefined) {
    sets.push(`color = $${idx++}`);
    params.push(fields.color);
  }

  if (sets.length === 0) return getCollection(id);

  params.push(id);
  const result = await query(
    `UPDATE collections SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
    params,
  );
  if (result.rows.length === 0) return null;

  // Fetch with memory count
  return getCollection(result.rows[0].id);
}

export async function deleteCollection(id: number): Promise<boolean> {
  const result = await query('DELETE FROM collections WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}

export async function getCollectionMemories(
  collectionId: number,
  limit: number,
  offset: number,
): Promise<{ memories: CollectionMemory[]; total: number }> {
  const countResult = await query(
    'SELECT count(*)::int AS total FROM collection_memories WHERE collection_id = $1',
    [collectionId],
  );
  const total = countResult.rows[0]?.total ?? 0;

  const result = await query(
    `SELECT m.id, m.title, m.content_type, m.category, m.summary, m.tags,
            m.source_url, m.file_key, m.metadata, m.created_at, cm.added_at
     FROM collection_memories cm
     JOIN memories m ON m.id = cm.memory_id
     WHERE cm.collection_id = $1
     ORDER BY cm.added_at DESC
     LIMIT $2 OFFSET $3`,
    [collectionId, limit, offset],
  );

  return { memories: result.rows, total };
}

export async function addMemoriesToCollection(
  collectionId: number,
  memoryIds: string[],
): Promise<number> {
  if (memoryIds.length === 0) return 0;

  const client = await getClient();
  try {
    await client.query('BEGIN');
    let added = 0;
    for (const memoryId of memoryIds) {
      const res = await client.query(
        `INSERT INTO collection_memories (collection_id, memory_id)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [collectionId, memoryId],
      );
      added += res.rowCount ?? 0;
    }
    await client.query('COMMIT');
    return added;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function removeMemoryFromCollection(
  collectionId: number,
  memoryId: string,
): Promise<boolean> {
  const result = await query(
    'DELETE FROM collection_memories WHERE collection_id = $1 AND memory_id = $2',
    [collectionId, memoryId],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function exportCollection(id: number): Promise<{
  collection: Collection;
  memories: CollectionMemory[];
} | null> {
  const collection = await getCollection(id);
  if (!collection) return null;

  const result = await query(
    `SELECT m.id, m.title, m.content_type, m.category, m.summary, m.tags,
            m.source_url, m.file_key, m.metadata, m.created_at, cm.added_at
     FROM collection_memories cm
     JOIN memories m ON m.id = cm.memory_id
     WHERE cm.collection_id = $1
     ORDER BY cm.added_at DESC`,
    [id],
  );

  return { collection, memories: result.rows };
}
