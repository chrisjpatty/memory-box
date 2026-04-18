import { useState, useMemo } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { MagnifyingGlassIcon as MagnifyingGlass } from '@phosphor-icons/react/dist/icons/MagnifyingGlass';
import { XIcon as X } from '@phosphor-icons/react/dist/icons/X';
import { CheckIcon as Check } from '@phosphor-icons/react/dist/icons/Check';
import { useMemories, useSearch, useAddMemoriesToCollection } from '../hooks/queries';

interface AddMemoriesModalProps {
  collectionId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddMemoriesModal({ collectionId, open, onOpenChange }: AddMemoriesModalProps) {
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [added, setAdded] = useState(false);

  const { data: browsedData } = useMemories({ limit: 20 });
  const search = useSearch();
  const addMemories = useAddMemoriesToCollection();

  const isSearching = !!searchQuery;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchInput.trim();
    setSearchQuery(q);
    if (q) {
      search.mutate({ query: q, limit: 30 });
    }
  };

  const memories = useMemo(() => {
    if (isSearching && search.data) {
      return search.data.results.map((r: any) => ({
        id: r.id || r.memoryId,
        title: r.title,
        contentType: r.contentType,
        summary: r.summary || '',
      }));
    }
    return (browsedData?.memories ?? []).map((m: any) => ({
      id: m.id,
      title: m.title,
      contentType: m.contentType,
      summary: m.summary || '',
    }));
  }, [isSearching, search.data, browsedData]);

  const toggleMemory = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAdd = async () => {
    if (selected.size === 0) return;
    await addMemories.mutateAsync({ collectionId, memoryIds: Array.from(selected) });
    setAdded(true);
    setTimeout(() => {
      handleOpenChange(false);
    }, 600);
  };

  const handleOpenChange = (value: boolean) => {
    if (!value) {
      setSearchInput('');
      setSearchQuery('');
      setSelected(new Set());
      setAdded(false);
    }
    onOpenChange(value);
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-neutral-950 border border-neutral-800 shadow-2xl outline-none">
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <Dialog.Title className="text-base font-semibold text-neutral-200">
              Add memories
            </Dialog.Title>
            <Dialog.Close className="w-7 h-7 flex items-center justify-center rounded-full text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800 transition-colors">
              <X size={16} />
            </Dialog.Close>
          </div>

          <form onSubmit={handleSearch} className="px-5 pb-3">
            <div className="flex items-center gap-2 bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2">
              <MagnifyingGlass size={16} className="text-neutral-500 shrink-0" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search memories to add..."
                className="flex-1 bg-transparent text-sm text-neutral-200 placeholder-neutral-500 focus:outline-none"
              />
            </div>
          </form>

          <div className="px-5 pb-2 max-h-72 overflow-y-auto">
            {memories.length === 0 ? (
              <p className="text-sm text-neutral-500 py-4 text-center">No memories found.</p>
            ) : (
              memories.map((m: any) => {
                const isSelected = selected.has(m.id);
                return (
                  <button
                    key={m.id}
                    onClick={() => toggleMemory(m.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                      isSelected ? 'bg-blue-950/30' : 'hover:bg-neutral-900'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                      isSelected ? 'bg-blue-600 border-blue-600' : 'border-neutral-700'
                    }`}>
                      {isSelected && <Check size={12} weight="bold" className="text-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-neutral-200 truncate block">{m.title}</span>
                      <span className="text-xs text-neutral-500 truncate block">{m.contentType}{m.summary ? ` - ${m.summary}` : ''}</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <div className="px-5 pb-5 pt-3 border-t border-neutral-800/50 flex items-center justify-between">
            <span className="text-xs text-neutral-500">
              {selected.size} selected
            </span>
            <button
              onClick={handleAdd}
              disabled={selected.size === 0 || addMemories.isPending || added}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 transition-colors"
            >
              {added ? 'Added!' : addMemories.isPending ? 'Adding...' : `Add to collection`}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
