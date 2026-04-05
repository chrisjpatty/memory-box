import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

interface Memory {
  id: string;
  title: string;
  contentType: string;
  category: string;
  summary: string;
  createdAt: string;
}

const typeBadgeColors: Record<string, string> = {
  url: 'bg-blue-900/50 text-blue-400 border-blue-800',
  text: 'bg-green-900/50 text-green-400 border-green-800',
  image: 'bg-purple-900/50 text-purple-400 border-purple-800',
};

export function MemoryList() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [total, setTotal] = useState(0);
  const [typeFilter, setTypeFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const params: any = { limit: 50 };
      if (typeFilter) params.type = typeFilter;
      const r = await api.memories(params);
      setMemories(r.memories);
      setTotal(r.total);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { load(); }, [typeFilter]);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('Delete this memory?')) return;
    await api.deleteMemory(id);
    load();
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        {['', 'text', 'url', 'image'].map((t) => (
          <button
            key={t}
            onClick={() => setTypeFilter(t)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              typeFilter === t
                ? 'bg-neutral-700 text-white'
                : 'bg-neutral-800/50 text-neutral-400 hover:bg-neutral-800'
            }`}
          >
            {t || 'All'}
          </button>
        ))}
        <span className="text-xs text-neutral-500 ml-auto">{total} total</span>
      </div>

      {loading ? (
        <div className="text-neutral-500 text-sm py-8 text-center">Loading...</div>
      ) : memories.length === 0 ? (
        <div className="text-neutral-500 text-sm py-8 text-center">No memories found</div>
      ) : (
        <div className="space-y-2">
          {memories.map((m) => (
            <Link
              key={m.id}
              to={`/memories/${m.id}`}
              className="flex gap-4 bg-neutral-900 border border-neutral-800 rounded-xl p-4 hover:border-neutral-700 transition-colors group"
            >
              {m.contentType === 'image' && (
                <img
                  src={`/api/memories/${m.id}/image`}
                  alt=""
                  className="w-16 h-16 rounded-lg object-cover shrink-0 bg-neutral-800"
                />
              )}
              <div className="flex items-start justify-between gap-3 flex-1 min-w-0">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-medium border ${typeBadgeColors[m.contentType] || 'bg-neutral-800 text-neutral-400 border-neutral-700'}`}>
                      {m.contentType}
                    </span>
                    {m.category && (
                      <span className="text-[10px] text-neutral-500">{m.category}</span>
                    )}
                  </div>
                  <h3 className="text-sm font-medium truncate">{m.title}</h3>
                  {m.summary && (
                    <p className="text-xs text-neutral-500 mt-1 line-clamp-2">{m.summary}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] text-neutral-600">{new Date(m.createdAt).toLocaleDateString()}</span>
                  <button
                    onClick={(e) => handleDelete(m.id, e)}
                    className="opacity-0 group-hover:opacity-100 px-2 py-1 rounded text-[10px] text-red-400 hover:bg-red-950 transition-all"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
