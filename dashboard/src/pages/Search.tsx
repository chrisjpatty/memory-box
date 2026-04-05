import { useState, useEffect, useRef, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

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
}

const typeBadgeColors: Record<string, string> = {
  url: 'bg-blue-900/50 text-blue-400 border-blue-800',
  text: 'bg-green-900/50 text-green-400 border-green-800',
  image: 'bg-purple-900/50 text-purple-400 border-purple-800',
};

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
  const [loading, setLoading] = useState(false);
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

  const handleSearch = async (e: FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    try {
      const r = await api.search(query.trim());
      setResults(r.results);
      setSearched(true);
    } catch { /* ignore */ }
    setLoading(false);
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
          disabled={loading}
          className="px-5 py-2.5 bg-white text-black rounded-lg text-sm font-medium hover:bg-neutral-200 disabled:opacity-50 transition-colors"
        >
          {loading ? 'Searching...' : 'Search'}
        </button>
      </form>

      {loading ? (
        <div className="text-neutral-500 text-sm py-8 text-center">Searching...</div>
      ) : results.length > 0 ? (
        <div className="space-y-2">
          {results.map((r) => (
            <Link
              key={r.memoryId}
              to={`/memories/${r.memoryId}`}
              className="flex gap-4 bg-neutral-900 border border-neutral-800 rounded-xl p-4 hover:border-neutral-700 transition-colors"
            >
              {r.contentType === 'image' && (
                <img
                  src={`/api/memories/${r.memoryId}/image`}
                  alt=""
                  className="w-16 h-16 rounded-lg object-cover shrink-0 bg-neutral-800"
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-medium border ${typeBadgeColors[r.contentType] || 'bg-neutral-800 text-neutral-400 border-neutral-700'}`}>
                    {r.contentType}
                  </span>
                  <span className="text-[10px] text-neutral-600">{Math.round(r.score * 100)}% match</span>
                  {r.category && <span className="text-[10px] text-neutral-500">{r.category}</span>}
                  <span className="text-[10px] text-neutral-600 ml-auto">{new Date(r.createdAt).toLocaleDateString()}</span>
                </div>
                <h3 className="text-sm font-medium">{r.title}</h3>
                {r.summary && <p className="text-xs text-neutral-500 mt-1 line-clamp-2">{r.summary}</p>}
                {r.source && (
                  <p className="text-xs text-blue-400/70 mt-1 truncate">{r.source}</p>
                )}
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
