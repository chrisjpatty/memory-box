import { useState, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeftIcon as ArrowLeft } from '@phosphor-icons/react/dist/icons/ArrowLeft';
import { PencilSimpleIcon as PencilSimple } from '@phosphor-icons/react/dist/icons/PencilSimple';
import { TrashIcon as Trash } from '@phosphor-icons/react/dist/icons/Trash';
import { ExportIcon as Export } from '@phosphor-icons/react/dist/icons/Export';
import { PlusIcon as Plus } from '@phosphor-icons/react/dist/icons/Plus';
import Masonry from 'react-masonry-css';
import {
  useCollectionMemories,
  useUpdateCollection,
  useDeleteCollection,
  useRemoveMemoryFromCollection,
} from '../hooks/queries';
import { api } from '../api';
import { MemoryCard } from '../components/MemoryCard';
import type { MemoryCardData } from '../components/MemoryCard';
import { AddMemoriesModal } from '../components/AddMemoriesModal';

const COLORS = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink'];

const COLOR_BG: Record<string, string> = {
  red: 'bg-red-500',
  orange: 'bg-orange-500',
  yellow: 'bg-yellow-500',
  green: 'bg-green-500',
  blue: 'bg-blue-500',
  purple: 'bg-purple-500',
  pink: 'bg-pink-500',
};

export function CollectionDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const collectionId = parseInt(id ?? '0');

  const { data, isLoading } = useCollectionMemories(collectionId, { limit: 200 });
  const updateCollection = useUpdateCollection();
  const deleteCollection = useDeleteCollection();
  const removeMemory = useRemoveMemoryFromCollection();

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editColor, setEditColor] = useState('');
  const [addModalOpen, setAddModalOpen] = useState(false);

  const collection = data?.collection;
  const memories = data?.memories ?? [];

  const handleCardClick = useCallback((e: React.MouseEvent, memory: MemoryCardData) => {
    e.preventDefault();
    navigate(`/memories/${memory.id}`, {
      state: { backgroundLocation: location, cardData: memory },
    });
  }, [location, navigate]);

  const startEditing = () => {
    if (!collection) return;
    setEditName(collection.name);
    setEditDesc(collection.description || '');
    setEditColor(collection.color || 'blue');
    setEditing(true);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName.trim()) return;
    await updateCollection.mutateAsync({
      id: collectionId,
      name: editName.trim(),
      description: editDesc.trim() || undefined,
      color: editColor,
    });
    setEditing(false);
  };

  const handleDelete = async () => {
    if (!confirm('Delete this collection? Memories inside will not be deleted.')) return;
    await deleteCollection.mutateAsync(collectionId);
    navigate('/collections');
  };

  const handleRemoveMemory = async (memoryId: string) => {
    if (!confirm('Remove this memory from the collection?')) return;
    await removeMemory.mutateAsync({ collectionId, memoryId });
  };

  const handleExport = async () => {
    const data = await api.exportCollection(collectionId);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `collection-${collection?.name?.replace(/\s+/g, '-').toLowerCase() || collectionId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="pt-8">
        <div className="text-neutral-500 text-sm py-8 text-center">Loading...</div>
      </div>
    );
  }

  if (!collection) {
    return (
      <div className="pt-8">
        <div className="text-neutral-500 text-sm py-8 text-center">Collection not found.</div>
      </div>
    );
  }

  return (
    <div className="pt-8 pb-16">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate('/collections')}
          className="flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-300 transition-colors mb-4"
        >
          <ArrowLeft size={14} weight="bold" />
          Back to collections
        </button>

        {editing ? (
          <form onSubmit={handleUpdate} className="p-4 rounded-xl bg-neutral-900 border border-neutral-800 space-y-3">
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              autoFocus
              className="w-full px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-sm text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-neutral-700"
            />
            <input
              type="text"
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
              placeholder="Description (optional)"
              className="w-full px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-sm text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-neutral-700"
            />
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-neutral-500 mr-1">Color:</span>
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setEditColor(c)}
                  className={`w-6 h-6 rounded-full ${COLOR_BG[c]} transition-all ${
                    editColor === c ? 'ring-2 ring-white ring-offset-2 ring-offset-neutral-900 scale-110' : 'opacity-60 hover:opacity-100'
                  }`}
                />
              ))}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="px-4 py-2 rounded-lg text-sm text-neutral-400 hover:text-neutral-200 border border-neutral-800 hover:border-neutral-700 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!editName.trim() || updateCollection.isPending}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 transition-colors"
              >
                Save
              </button>
            </div>
          </form>
        ) : (
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-lg font-semibold text-neutral-200 tracking-tight">{collection.name}</h1>
              {collection.description && (
                <p className="text-sm text-neutral-500 mt-1">{collection.description}</p>
              )}
              <p className="text-xs text-neutral-600 mt-1">
                {collection.memoryCount} {collection.memoryCount === 1 ? 'memory' : 'memories'}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => setAddModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-neutral-400 hover:text-neutral-200 bg-neutral-800 hover:bg-neutral-700 transition-colors"
              >
                <Plus size={14} weight="bold" />
                Add
              </button>
              <button
                onClick={startEditing}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition-colors"
                title="Edit collection"
              >
                <PencilSimple size={16} weight="bold" />
              </button>
              <button
                onClick={handleExport}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition-colors"
                title="Export as JSON"
              >
                <Export size={16} weight="bold" />
              </button>
              <button
                onClick={handleDelete}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-neutral-400 hover:text-red-400 hover:bg-neutral-800 transition-colors"
                title="Delete collection"
              >
                <Trash size={16} weight="bold" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Memory grid */}
      {memories.length === 0 ? (
        <div className="text-neutral-500 text-sm py-8 text-center">
          No memories in this collection yet.
        </div>
      ) : (
        <Masonry
          breakpointCols={{ default: 4, 1280: 3, 1024: 2, 640: 1 }}
          className="flex gap-2 -ml-2"
          columnClassName="pl-2 bg-clip-padding"
        >
          {memories.map((m: any) => {
            const cardData: MemoryCardData = {
              id: m.id,
              title: m.title,
              contentType: m.contentType,
              category: m.category || '',
              summary: m.summary || '',
              tags: m.tags || [],
              createdAt: m.createdAt,
              source: m.source,
              hasImage: m.hasImage,
              imageUrl: m.hasImage ? `/api/memories/${m.id}/image` : undefined,
              extra: m.extra,
            };
            return (
              <a
                key={m.id}
                href={`/memories/${m.id}`}
                onClick={(e) => handleCardClick(e, cardData)}
                className="block mb-4 cursor-pointer"
              >
                <MemoryCard
                  memory={cardData}
                  onDelete={() => handleRemoveMemory(m.id)}
                />
              </a>
            );
          })}
        </Masonry>
      )}

      <AddMemoriesModal
        collectionId={collectionId}
        open={addModalOpen}
        onOpenChange={setAddModalOpen}
      />
    </div>
  );
}
