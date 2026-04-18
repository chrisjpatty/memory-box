import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlusIcon as Plus } from '@phosphor-icons/react/dist/icons/Plus';
import { useCollections, useCreateCollection, useDeleteCollection } from '../hooks/queries';
import { CollectionCard } from '../components/CollectionCard';

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

export function Collections() {
  const navigate = useNavigate();
  const { data, isLoading } = useCollections();
  const createCollection = useCreateCollection();
  const deleteCollection = useDeleteCollection();

  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('blue');

  const collections = data?.collections ?? [];

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await createCollection.mutateAsync({
      name: name.trim(),
      description: description.trim() || undefined,
      color,
    });
    setName('');
    setDescription('');
    setColor('blue');
    setShowCreate(false);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this collection? Memories inside will not be deleted.')) return;
    await deleteCollection.mutateAsync(id);
  };

  return (
    <div className="pt-8 pb-16">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold text-neutral-200 tracking-tight">Collections</h1>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-neutral-300 hover:text-white bg-neutral-800 hover:bg-neutral-700 transition-colors"
        >
          <Plus size={14} weight="bold" />
          New
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="mb-6 p-4 rounded-xl bg-neutral-900 border border-neutral-800 space-y-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Collection name"
            autoFocus
            className="w-full px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-sm text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-neutral-700"
          />
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)"
            className="w-full px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-sm text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-neutral-700"
          />
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-neutral-500 mr-1">Color:</span>
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`w-6 h-6 rounded-full ${COLOR_BG[c]} transition-all ${
                  color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-neutral-900 scale-110' : 'opacity-60 hover:opacity-100'
                }`}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="px-4 py-2 rounded-lg text-sm text-neutral-400 hover:text-neutral-200 border border-neutral-800 hover:border-neutral-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || createCollection.isPending}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 transition-colors"
            >
              Create collection
            </button>
          </div>
        </form>
      )}

      {isLoading ? (
        <div className="text-neutral-500 text-sm py-8 text-center">Loading...</div>
      ) : collections.length === 0 ? (
        <div className="text-neutral-500 text-sm py-8 text-center">
          No collections yet. Create one to start organizing your memories.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {collections.map((col: any) => (
            <a
              key={col.id}
              href={`/collections/${col.id}`}
              onClick={(e) => {
                e.preventDefault();
                navigate(`/collections/${col.id}`);
              }}
              className="block cursor-pointer"
            >
              <CollectionCard collection={col} onDelete={handleDelete} />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
