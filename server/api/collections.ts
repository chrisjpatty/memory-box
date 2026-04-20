import { Hono } from 'hono';
import {
  listCollections,
  getCollection,
  createCollection,
  updateCollection,
  deleteCollection,
  getCollectionMemories,
  addMemoriesToCollection,
  removeMemoryFromCollection,
  exportCollection,
} from '../../lib/collections';

const collections = new Hono();

// List all collections with memory counts
collections.get('/', async (c) => {
  const rows = await listCollections();
  return c.json({
    collections: rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      color: r.color,
      memoryCount: r.memory_count ?? 0,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
  });
});

// Create a new collection
collections.post('/', async (c) => {
  const { name, description, color } = await c.req.json<{
    name: string;
    description?: string;
    color?: string;
  }>();

  if (!name?.trim()) {
    return c.json({ error: 'Collection name is required' }, 400);
  }

  try {
    const collection = await createCollection(name.trim(), description, color);
    return c.json(
      {
        id: collection.id,
        name: collection.name,
        description: collection.description,
        color: collection.color,
        memoryCount: 0,
        createdAt: collection.created_at,
        updatedAt: collection.updated_at,
      },
      201,
    );
  } catch (err: any) {
    if (err.code === '23505') {
      return c.json({ error: 'A collection with that name already exists' }, 409);
    }
    throw err;
  }
});

// Get single collection with paginated memories
collections.get('/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ error: 'Invalid collection ID' }, 400);

  const limit = Math.floor(parseInt(c.req.query('limit') || '20'));
  const skip = Math.floor(parseInt(c.req.query('skip') || '0'));

  const collection = await getCollection(id);
  if (!collection) return c.json({ error: 'Collection not found' }, 404);

  const { memories, total } = await getCollectionMemories(id, limit, skip);

  return c.json({
    collection: {
      id: collection.id,
      name: collection.name,
      description: collection.description,
      color: collection.color,
      memoryCount: collection.memory_count ?? 0,
      createdAt: collection.created_at,
      updatedAt: collection.updated_at,
    },
    memories: memories.map((m) => ({
      id: m.id,
      title: m.title,
      contentType: m.content_type,
      category: m.category || '',
      summary: m.summary || '',
      tags: m.tags || [],
      createdAt: m.created_at,
      source: m.source_url,
      hasImage: m.file_key != null && !m.file_key.endsWith('/original.html'),
      extra: m.metadata || {},
      addedAt: m.added_at,
    })),
    total,
  });
});

// Update collection
collections.put('/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ error: 'Invalid collection ID' }, 400);

  const { name, description, color } = await c.req.json<{
    name?: string;
    description?: string;
    color?: string;
  }>();

  if (name !== undefined && !name.trim()) {
    return c.json({ error: 'Collection name cannot be empty' }, 400);
  }

  try {
    const updated = await updateCollection(id, {
      name: name?.trim(),
      description,
      color,
    });
    if (!updated) return c.json({ error: 'Collection not found' }, 404);

    return c.json({
      id: updated.id,
      name: updated.name,
      description: updated.description,
      color: updated.color,
      memoryCount: updated.memory_count ?? 0,
      createdAt: updated.created_at,
      updatedAt: updated.updated_at,
    });
  } catch (err: any) {
    if (err.code === '23505') {
      return c.json({ error: 'A collection with that name already exists' }, 409);
    }
    throw err;
  }
});

// Delete collection (not the memories inside)
collections.delete('/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ error: 'Invalid collection ID' }, 400);

  const deleted = await deleteCollection(id);
  if (!deleted) return c.json({ error: 'Collection not found' }, 404);

  return c.json({ success: true, message: `Collection ${id} deleted.` });
});

// Add memories to a collection
collections.post('/:id/memories', async (c) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ error: 'Invalid collection ID' }, 400);

  const { memoryIds } = await c.req.json<{ memoryIds: string[] }>();
  if (!Array.isArray(memoryIds) || memoryIds.length === 0) {
    return c.json({ error: 'memoryIds array is required' }, 400);
  }

  const collection = await getCollection(id);
  if (!collection) return c.json({ error: 'Collection not found' }, 404);

  const added = await addMemoriesToCollection(id, memoryIds);
  return c.json({ success: true, added });
});

// Remove a memory from a collection
collections.delete('/:id/memories/:memoryId', async (c) => {
  const id = parseInt(c.req.param('id'));
  const memoryId = c.req.param('memoryId');
  if (isNaN(id)) return c.json({ error: 'Invalid collection ID' }, 400);

  const removed = await removeMemoryFromCollection(id, memoryId);
  if (!removed) return c.json({ error: 'Memory not found in collection' }, 404);

  return c.json({ success: true });
});

// Export collection as JSON
collections.get('/:id/export', async (c) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ error: 'Invalid collection ID' }, 400);

  const data = await exportCollection(id);
  if (!data) return c.json({ error: 'Collection not found' }, 404);

  return c.json({
    collection: {
      name: data.collection.name,
      description: data.collection.description,
      color: data.collection.color,
      createdAt: data.collection.created_at,
    },
    memories: data.memories.map((m) => ({
      id: m.id,
      title: m.title,
      contentType: m.content_type,
      category: m.category || '',
      summary: m.summary || '',
      tags: m.tags || [],
      source: m.source_url,
      createdAt: m.created_at,
      addedAt: m.added_at,
    })),
    exportedAt: new Date().toISOString(),
  });
});

export { collections };
