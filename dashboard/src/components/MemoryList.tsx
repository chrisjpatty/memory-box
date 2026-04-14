import { useEffect, useRef, useMemo, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Masonry from 'react-masonry-css';
import { useInfiniteMemories, useSearch, useDeleteMemory } from '../hooks/queries';
import { MemoryCard } from './MemoryCard';
import type { MemoryCardData } from './MemoryCard';

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

interface MemoryListProps {
  searchQuery: string;
  typeFilters: string[];
  onCountChange?: (count: number, isSearching: boolean) => void;
}

export function MemoryList({ searchQuery, typeFilters, onCountChange }: MemoryListProps) {
  const location = useLocation();
  const navigate = useNavigate();

  const handleCardClick = useCallback((e: React.MouseEvent, memory: MemoryCardData) => {
    e.preventDefault();
    navigate(`/memories/${memory.id}`, {
      state: { backgroundLocation: location, cardData: memory },
    });
  }, [location, navigate]);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // When a single type is selected and not searching, let the API filter
  const apiType = !searchQuery && typeFilters.length === 1 ? typeFilters[0] : undefined;
  const infiniteMemories = useInfiniteMemories(apiType);
  const search = useSearch();
  const deleteMemory = useDeleteMemory();

  const isSearching = !!searchQuery;

  // Execute search when searchQuery changes (only changes on explicit submit).
  // Also fires on mount if URL already has a query.
  useEffect(() => {
    if (searchQuery) {
      search.mutate({ query: searchQuery, limit: 50 });
    }
  }, [searchQuery]);

  // Flatten results, applying type filters to both search and browse results
  const memories = useMemo(() => {
    if (isSearching) {
      const results = (search.data?.results ?? []).map(toCardData);
      if (typeFilters.length > 0) {
        return results.filter((m) => typeFilters.includes(m.contentType));
      }
      return results;
    }
    const all = infiniteMemories.data?.pages.flatMap((p) => p.memories.map(toCardData)) ?? [];
    if (typeFilters.length > 1) {
      return all.filter((m) => typeFilters.includes(m.contentType));
    }
    return all;
  }, [infiniteMemories.data, search.data, isSearching, typeFilters]);

  const total = isSearching
    ? memories.length
    : typeFilters.length > 1
      ? memories.length
      : infiniteMemories.data?.pages[0]?.total ?? 0;

  useEffect(() => {
    onCountChange?.(total, isSearching);
  }, [total, isSearching]);

  const loading = isSearching ? search.isPending : infiniteMemories.isLoading;

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
            <a
              key={m.id}
              href={`/memories/${m.id}`}
              onClick={(e) => handleCardClick(e, m)}
              className="block mb-4 cursor-pointer"
            >
              <MemoryCard memory={m} onDelete={handleDelete} />
            </a>
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
