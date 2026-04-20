import { useState, useRef, useEffect } from 'react';
import { FolderIcon as Folder } from '@phosphor-icons/react/dist/icons/Folder';

interface CollectionCardProps {
  collection: {
    id: number;
    name: string;
    description: string | null;
    color: string | null;
    memoryCount: number;
    updatedAt: string;
  };
  onDelete?: (id: number) => void;
}

const COLOR_MAP: Record<string, string> = {
  red: 'bg-red-500/15 text-red-300 border-red-500/30',
  orange: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
  yellow: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30',
  green: 'bg-green-500/15 text-green-300 border-green-500/30',
  blue: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  purple: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
  pink: 'bg-pink-500/15 text-pink-300 border-pink-500/30',
};

const ICON_COLOR_MAP: Record<string, string> = {
  red: 'text-red-400',
  orange: 'text-orange-400',
  yellow: 'text-yellow-400',
  green: 'text-green-400',
  blue: 'text-blue-400',
  purple: 'text-purple-400',
  pink: 'text-pink-400',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

export function CollectionCard({ collection, onDelete }: CollectionCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const colorClass = collection.color ? COLOR_MAP[collection.color] : 'bg-neutral-500/15 text-neutral-300 border-neutral-500/30';
  const iconColor = collection.color ? ICON_COLOR_MAP[collection.color] : 'text-neutral-400';

  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  return (
    <div className="relative bg-neutral-900 border border-neutral-800 rounded-xl hover:border-neutral-700 transition-all duration-200 overflow-hidden group">
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${colorClass}`}>
            <Folder size={20} weight="duotone" className={iconColor} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-neutral-200 truncate">{collection.name}</h3>
            {collection.description && (
              <p className="text-xs text-neutral-500 mt-0.5 line-clamp-2">{collection.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 mt-3 text-xs text-neutral-500">
          <span>{collection.memoryCount} {collection.memoryCount === 1 ? 'memory' : 'memories'}</span>
          <span className="text-neutral-700">&middot;</span>
          <span>{formatDate(collection.updatedAt)}</span>
        </div>
      </div>

      {onDelete && (
        <div
          ref={menuRef}
          className="absolute top-2.5 right-2.5 z-10"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
        >
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className={`w-6 h-6 rounded-md flex items-center justify-center transition-all duration-150 ${
              menuOpen
                ? 'bg-neutral-800 opacity-100'
                : 'opacity-0 group-hover:opacity-100 bg-neutral-950/80 backdrop-blur-sm hover:bg-neutral-800'
            }`}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" className="text-neutral-400">
              <circle cx="6" cy="2" r="1.1" />
              <circle cx="6" cy="6" r="1.1" />
              <circle cx="6" cy="10" r="1.1" />
            </svg>
          </button>

          {menuOpen && (
            <div className="absolute top-7 right-0 min-w-[120px] py-1 rounded-lg bg-neutral-800 border border-neutral-700 shadow-xl shadow-black/40">
              <button
                onClick={() => {
                  setMenuOpen(false);
                  onDelete(collection.id);
                }}
                className="w-full px-3 py-1.5 text-left text-xs text-red-400 hover:bg-red-950/50 transition-colors"
              >
                Delete
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
