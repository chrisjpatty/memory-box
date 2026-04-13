import { useState, useRef, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { MemoryList } from '../components/MemoryList';
import type { MemoriesContext } from '../components/MemoriesLayout';
import { TextAaIcon as TextAa } from '@phosphor-icons/react/dist/icons/TextAa';
import { LinkIcon as LinkIcon } from '@phosphor-icons/react/dist/icons/Link';
import { TwitterLogoIcon as TwitterLogo } from '@phosphor-icons/react/dist/icons/TwitterLogo';
import { GithubLogoIcon as GithubLogo } from '@phosphor-icons/react/dist/icons/GithubLogo';
import { ImageIcon as Image } from '@phosphor-icons/react/dist/icons/Image';
import { FilePdfIcon as FilePdf } from '@phosphor-icons/react/dist/icons/FilePdf';
import { FileIcon as File } from '@phosphor-icons/react/dist/icons/File';
import { FunnelSimpleIcon as FunnelSimple } from '@phosphor-icons/react/dist/icons/FunnelSimple';

const typeFilters = [
  { value: 'text', label: 'Text', icon: TextAa },
  { value: 'url', label: 'URL', icon: LinkIcon },
  { value: 'tweet', label: 'Tweet', icon: TwitterLogo },
  { value: 'github', label: 'GitHub', icon: GithubLogo },
  { value: 'image', label: 'Image', icon: Image },
  { value: 'pdf', label: 'PDF', icon: FilePdf },
  { value: 'file', label: 'File', icon: File },
];

export function Memories() {
  const { searchQuery, setSearchQuery, typeFilters: activeTypes, setTypeFilters } = useOutletContext<MemoriesContext>();
  const [countInfo, setCountInfo] = useState<{ count: number; isSearching: boolean }>({ count: 0, isSearching: false });
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  const toggleType = (value: string) => {
    if (activeTypes.includes(value)) {
      setTypeFilters(activeTypes.filter((t) => t !== value));
    } else {
      setTypeFilters([...activeTypes, value]);
    }
  };

  // Close popover on outside click
  useEffect(() => {
    if (!filterOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setFilterOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [filterOpen]);

  return (
    <div>
      <div className="sticky -top-[26px] z-[18] -mx-8 px-8">
        <div className="relative flex items-center pt-8 pb-6">
          <div className="mx-auto w-full max-w-xl flex items-center gap-2">
            {/* Filter button */}
            <div className="relative" ref={filterRef}>
              <button
                onClick={() => setFilterOpen((v) => !v)}
                className={`flex items-center justify-center shrink-0 w-9 h-9 rounded-lg text-sm transition-colors border ${
                  activeTypes.length > 0
                    ? 'bg-neutral-700 text-white border-neutral-600'
                    : 'bg-neutral-900 text-neutral-400 border-neutral-800 hover:text-neutral-200 hover:border-neutral-600'
                }`}
              >
                <FunnelSimple size={18} weight="bold" />
                {activeTypes.length > 0 && (
                  <span className="text-xs">{activeTypes.length}</span>
                )}
              </button>

              {/* Popover */}
              {filterOpen && (
                <div className="absolute top-full left-0 mt-2 w-52 bg-neutral-900 border border-neutral-800 rounded-xl p-3 shadow-xl">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] uppercase tracking-wider text-neutral-500 font-medium">Filter by type</span>
                    {activeTypes.length > 0 && (
                      <button
                        onClick={() => setTypeFilters([])}
                        className="text-[10px] text-neutral-500 hover:text-neutral-300 transition-colors"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {typeFilters.map((t) => {
                      const active = activeTypes.includes(t.value);
                      const Icon = t.icon;
                      return (
                        <button
                          key={t.value}
                          onClick={() => toggleType(t.value)}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors border ${
                            active
                              ? 'bg-neutral-700 text-white border-neutral-600'
                              : 'bg-transparent text-neutral-400 border-neutral-700 hover:text-neutral-200 hover:border-neutral-600'
                          }`}
                        >
                          <Icon size={13} weight="bold" />
                          {t.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Search bar */}
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search memories..."
              className="flex-1 h-9 px-3 bg-neutral-900 border border-neutral-800 rounded-lg text-sm text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-neutral-600 transition-colors"
            />
          </div>
          <span className="absolute right-0 text-xs text-neutral-500">
            {countInfo.count} {countInfo.isSearching ? 'results' : 'total'}
          </span>
        </div>
      </div>
      <MemoryList searchQuery={searchQuery} typeFilters={activeTypes} onCountChange={(count, isSearching) => setCountInfo({ count, isSearching })} />
    </div>
  );
}
