import { useState, useEffect, useRef, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useSearch } from '../hooks/queries';
import { MemoryCard } from '../components/MemoryCard';
import type { MemoryCardData } from '../components/MemoryCard';

interface SearchResult {
  memoryId: string;
  title: string;
  contentType: string;
  snippet: string;
  summary: string;
  score: number;
  tags: string[];
  category: string;
  createdAt: string;
  source?: string;
  hasImage?: boolean;
  extra?: Record<string, string>;
}

function toCardData(r: SearchResult): MemoryCardData {
  return {
    id: r.memoryId,
    title: r.title,
    contentType: r.contentType as MemoryCardData['contentType'],
    category: r.category,
    summary: r.summary,
    tags: r.tags,
    createdAt: r.createdAt,
    source: r.source,
    hasImage: r.hasImage,
    imageUrl: r.hasImage ? `/api/memories/${r.memoryId}/image` : undefined,
    extra: r.extra,
  };
}

// Module-level cache survives component unmount/remount (route changes)
let cachedState: {
  query: string;
  results: SearchResult[];
  searched: boolean;
  scrollTop: number;
} | null = null;

export function Search() {
  const [query, setQuery] = useState(cachedState?.query ?? '');
  const [results, setResults] = useState<SearchResult[]>(cachedState?.results ?? []);
  const [searched, setSearched] = useState(cachedState?.searched ?? false);
  const search = useSearch();
  const scrollRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({ query, results, searched });
  stateRef.current = { query, results, searched };

  // Restore scroll position on mount, save on unmount
  useEffect(() => {
    const scrollContainer = scrollRef.current?.closest('main');
    if (cachedState?.scrollTop && scrollContainer) {
      requestAnimationFrame(() => {
        scrollContainer.scrollTop = cachedState!.scrollTop;
      });
    }

    return () => {
      cachedState = {
        ...stateRef.current,
        scrollTop: scrollRef.current?.closest('main')?.scrollTop ?? 0,
      };
    };
  }, []);

  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    search.mutate({ query: query.trim() }, {
      onSuccess: (r) => {
        setResults(r.results);
        setSearched(true);
      },
    });
  };

  return (
    <div className="max-w-3xl" ref={scrollRef}>
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-1">Search</h1>
        <p className="text-neutral-500 text-sm">Semantic search across your memories</p>
      </div>

      <form onSubmit={handleSearch} className="flex gap-3 mb-6">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search your memories..."
          className="flex-1 px-4 py-2.5 bg-neutral-900 border border-neutral-800 rounded-lg text-sm text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-neutral-600 transition-colors"
          autoFocus
        />
        <button
          type="submit"
          disabled={search.isPending}
          className="px-5 py-2.5 bg-white text-black rounded-lg text-sm font-medium hover:bg-neutral-200 disabled:opacity-50 transition-colors"
        >
          {search.isPending ? 'Searching...' : 'Search'}
        </button>
      </form>

      {search.isPending ? (
        <div className="text-neutral-500 text-sm py-8 text-center">Searching...</div>
      ) : results.length > 0 ? (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
          {results.map((r) => (
            <Link key={r.memoryId} to={`/memories/${r.memoryId}`} className="block">
              <div className="relative">
                <MemoryCard memory={toCardData(r)} />
                <span className="absolute top-2 right-2 text-[10px] text-neutral-500 bg-neutral-900/80 px-1.5 py-0.5 rounded">
                  {Math.round(r.score * 100)}%
                </span>
              </div>
            </Link>
          ))}
        </div>
      ) : searched ? (
        <div className="text-neutral-500 text-sm py-8 text-center">No results found for "{query}"</div>
      ) : null}
    </div>
  );
}
