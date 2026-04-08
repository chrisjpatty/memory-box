import { useState, useEffect, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import Masonry from 'react-masonry-css';
import { useInfiniteMemories, useSearch, useDeleteMemory } from '../hooks/queries';
import { MemoryCard } from './MemoryCard';
import type { MemoryCardData } from './MemoryCard';

const typeFilters = ['', 'text', 'url', 'tweet', 'github', 'image', 'pdf', 'file'];

function toCardData(m: any): MemoryCardData {
  return {
    id: m.id || m.memoryId,
    title: m.title,
    contentType: m.contentType,
    category: m.category || '',
    summary: m.summary || '',
    tags: m.tags || [],
    createdAt: m.createdAt,
    source: m.source,
    hasImage: m.hasImage,
    imageUrl: m.hasImage ? `/api/memories/${m.id || m.memoryId}/image` : undefined,
    extra: m.extra,
  };
}

export function MemoryList() {
  const [typeFilter, setTypeFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<MemoryCardData[] | null>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const infiniteMemories = useInfiniteMemories(typeFilter || undefined);
  const search = useSearch();
  const deleteMemory = useDeleteMemory();

  const isSearching = searchResults !== null;

  // Flatten infinite query pages into a single array
  const memories = useMemo(() => {
    if (isSearching) return searchResults;
    return infiniteMemories.data?.pages.flatMap((p) => p.memories.map(toCardData)) ?? [];
  }, [infiniteMemories.data, searchResults, isSearching]);

  const total = isSearching
    ? searchResults.length
    : infiniteMemories.data?.pages[0]?.total ?? 0;

  const loading = isSearching ? search.isPending : infiniteMemories.isLoading;

  // Debounced search
  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      const q = searchQuery.trim();
      if (!q) {
        setSearchResults(null);
        return;
      }
      search.mutate({ query: q, limit: 50 }, {
        onSuccess: (r) => setSearchResults(r.results.map(toCardData)),
      });
    }, 300);
    return () => { if (searchTimeout.current) clearTimeout(searchTimeout.current); };
  }, [searchQuery, search]);

  // Infinite scroll
  const loadMoreRef = useRef(() => {});
  loadMoreRef.current = () => {
    if (!infiniteMemories.isFetchingNextPage && infiniteMemories.hasNextPage) {
      infiniteMemories.fetchNextPage();
    }
  };

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const scrollRoot = el.closest('main');
    if (!scrollRoot) return;

    const onScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = scrollRoot;
      if (scrollHeight - scrollTop - clientHeight < 300) {
        loadMoreRef.current();
      }
    };

    scrollRoot.addEventListener('scroll', onScroll, { passive: true });
    return () => scrollRoot.removeEventListener('scroll', onScroll);
  }, [loading]);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this memory?')) return;
    await deleteMemory.mutateAsync(id);
  };

  return (
    <div>
      {/* Search + Filters */}
      <div className="mb-4 space-y-2">
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search memories..."
            className="flex-1 px-3 py-2 bg-neutral-900 border border-neutral-800 rounded-lg text-sm text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-neutral-600 transition-colors"
          />
          <span className="text-xs text-neutral-500 shrink-0">{total} {isSearching ? 'results' : 'total'}</span>
        </div>
        {!isSearching && (
          <div className="flex items-center gap-1 flex-wrap">
            {typeFilters.map((t) => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  typeFilter === t
                    ? 'bg-neutral-700 text-white'
                    : 'bg-neutral-800/50 text-neutral-400 hover:bg-neutral-800'
                }`}
              >
                {t || 'All'}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="text-neutral-500 text-sm py-8 text-center">
          {isSearching ? 'Searching...' : 'Loading...'}
        </div>
      ) : memories.length === 0 ? (
        <div className="text-neutral-500 text-sm py-8 text-center">
          {isSearching ? `No results for "${searchQuery}"` : 'No memories found'}
        </div>
      ) : (
        <Masonry
          breakpointCols={{ default: 4, 1280: 3, 1024: 2, 640: 1 }}
          className="flex gap-2 -ml-2"
          columnClassName="pl-2 bg-clip-padding"
        >
          {memories.map((m) => (
            <Link key={m.id} to={`/memories/${m.id}`} className="block mb-4">
              <MemoryCard memory={m} onDelete={handleDelete} />
            </Link>
          ))}
        </Masonry>
      )}

      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} className="py-4 text-center">
        {infiniteMemories.isFetchingNextPage && <span className="text-xs text-neutral-500">Loading more...</span>}
      </div>
    </div>
  );
}
