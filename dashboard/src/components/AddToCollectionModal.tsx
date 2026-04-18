import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { FolderIcon as Folder } from '@phosphor-icons/react/dist/icons/Folder';
import { PlusIcon as Plus } from '@phosphor-icons/react/dist/icons/Plus';
import { CheckIcon as Check } from '@phosphor-icons/react/dist/icons/Check';
import { XIcon as X } from '@phosphor-icons/react/dist/icons/X';
import { useCollections, useCreateCollection, useAddMemoriesToCollection } from '../hooks/queries';

interface AddToCollectionModalProps {
  memoryIds: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

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

export function AddToCollectionModal({ memoryIds, open, onOpenChange }: AddToCollectionModalProps) {
  const { data } = useCollections();
  const createCollection = useCreateCollection();
  const addMemories = useAddMemoriesToCollection();
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('blue');
  const [addedTo, setAddedTo] = useState<Set<number>>(new Set());

  const collections = data?.collections ?? [];

  const handleAdd = async (collectionId: number) => {
    await addMemories.mutateAsync({ collectionId, memoryIds });
    setAddedTo((prev) => new Set(prev).add(collectionId));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    const result = await createCollection.mutateAsync({
      name: newName.trim(),
      color: newColor,
    });
    await addMemories.mutateAsync({ collectionId: result.id, memoryIds });
    setAddedTo((prev) => new Set(prev).add(result.id));
    setNewName('');
    setShowNewForm(false);
  };

  const handleOpenChange = (value: boolean) => {
    if (!value) {
      setShowNewForm(false);
      setNewName('');
      setAddedTo(new Set());
    }
    onOpenChange(value);
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-neutral-950 border border-neutral-800 shadow-2xl outline-none">
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <Dialog.Title className="text-base font-semibold text-neutral-200">
              Add to collection
            </Dialog.Title>
            <Dialog.Close className="w-7 h-7 flex items-center justify-center rounded-full text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800 transition-colors">
              <X size={16} />
            </Dialog.Close>
          </div>

          <div className="px-5 pb-2 max-h-64 overflow-y-auto">
            {collections.length === 0 && !showNewForm && (
              <p className="text-sm text-neutral-500 py-4 text-center">
                No collections yet. Create one below.
              </p>
            )}

            {collections.map((col: any) => {
              const wasAdded = addedTo.has(col.id);
              return (
                <button
                  key={col.id}
                  onClick={() => handleAdd(col.id)}
                  disabled={wasAdded || addMemories.isPending}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-neutral-900 transition-colors disabled:opacity-60"
                >
                  <Folder size={18} weight="duotone" className="text-neutral-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-neutral-200 truncate block">{col.name}</span>
                    <span className="text-xs text-neutral-500">{col.memoryCount} memories</span>
                  </div>
                  {wasAdded && <Check size={16} weight="bold" className="text-green-400 shrink-0" />}
                </button>
              );
            })}
          </div>

          <div className="px-5 pb-5 pt-2 border-t border-neutral-800/50">
            {showNewForm ? (
              <form onSubmit={handleCreate} className="space-y-3">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Collection name"
                  autoFocus
                  className="w-full px-3 py-2 rounded-lg bg-neutral-900 border border-neutral-800 text-sm text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-neutral-700"
                />
                <div className="flex items-center gap-1.5">
                  {COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setNewColor(color)}
                      className={`w-6 h-6 rounded-full ${COLOR_BG[color]} transition-all ${
                        newColor === color ? 'ring-2 ring-white ring-offset-2 ring-offset-neutral-950 scale-110' : 'opacity-60 hover:opacity-100'
                      }`}
                    />
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowNewForm(false)}
                    className="flex-1 px-3 py-2 rounded-lg text-sm text-neutral-400 hover:text-neutral-200 border border-neutral-800 hover:border-neutral-700 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!newName.trim() || createCollection.isPending}
                    className="flex-1 px-3 py-2 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 transition-colors"
                  >
                    Create & add
                  </button>
                </div>
              </form>
            ) : (
              <button
                onClick={() => setShowNewForm(true)}
                className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900 transition-colors"
              >
                <Plus size={16} weight="bold" />
                New collection
              </button>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
