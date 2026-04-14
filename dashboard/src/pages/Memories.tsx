import { useState, useRef, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { MemoryList } from '../components/MemoryList';
import type { MemoriesContext } from '../components/MemoriesLayout';
import { TextAaIcon as TextAa } from '@phosphor-icons/react/dist/icons/TextAa';
import { LinkIcon as LinkIcon } from '@phosphor-icons/react/dist/icons/Link';
import { TwitterLogoIcon as TwitterLogo } from '@phosphor-icons/react/dist/icons/TwitterLogo';
import { GithubLogoIcon as GithubLogo } from '@phosphor-icons/react/dist/icons/GithubLogo';
import { ImageIcon as Image } from '@phosphor-icons/react/dist/icons/Image';
import { FileIcon as File } from '@phosphor-icons/react/dist/icons/File';
import { FunnelSimpleIcon as FunnelSimple } from '@phosphor-icons/react/dist/icons/FunnelSimple';
import { MagnifyingGlassIcon as MagnifyingGlass } from '@phosphor-icons/react/dist/icons/MagnifyingGlass';
import { XIcon as X } from '@phosphor-icons/react/dist/icons/X';

const typeFilters = [
  { value: 'text', label: 'Text', icon: TextAa },
  { value: 'url', label: 'URL', icon: LinkIcon },
  { value: 'tweet', label: 'Tweet', icon: TwitterLogo },
  { value: 'github', label: 'GitHub', icon: GithubLogo },
  { value: 'image', label: 'Image', icon: Image },
  { value: 'file', label: 'File', icon: File },
];

export function Memories() {
  const { searchQuery, setSearchQuery, typeFilters: activeTypes, setTypeFilters } = useOutletContext<MemoriesContext>();
  const [inputValue, setInputValue] = useState(searchQuery);
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  const stickyRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  // Scroll-driven size interpolation with spring-like lerp.
  // Bypasses React state entirely — sets CSS custom properties on each frame.
  useEffect(() => {
    const main = stickyRef.current?.closest('main');
    if (!main) return;

    const SCROLL_RANGE = 60; // px of scroll to fully shrink
    const SMOOTHING = 0.15;  // lerp factor per frame
    let target = 0;
    let current = 0;
    let animating = false;
    let rafId = 0;

    function apply(t: number) {
      const el = barRef.current;
      if (!el) return;
      el.style.setProperty('--bar-h', `${52 - 12 * t}px`);
      el.style.setProperty('--bar-maxw', `${672 - 96 * t}px`);
      el.style.setProperty('--bar-fs', `${16 - 2 * t}px`);
    }

    function tick() {
      current += (target - current) * SMOOTHING;
      if (Math.abs(target - current) < 0.005) current = target;
      apply(current);
      if (current !== target) {
        rafId = requestAnimationFrame(tick);
      } else {
        animating = false;
      }
    }

    function onScroll() {
      target = Math.min(1, Math.max(0, main!.scrollTop / SCROLL_RANGE));
      if (!animating) {
        animating = true;
        rafId = requestAnimationFrame(tick);
      }
    }

    apply(0);
    main.addEventListener('scroll', onScroll, { passive: true });
    return () => { main.removeEventListener('scroll', onScroll); cancelAnimationFrame(rafId); };
  }, []);

  // Sync local input when URL changes externally (e.g. back/forward navigation)
  useEffect(() => {
    setInputValue(searchQuery);
  }, [searchQuery]);

  const submitSearch = () => {
    setSearchQuery(inputValue.trim());
  };

  const clearSearch = () => {
    setInputValue('');
    setSearchQuery('');
  };

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
      <div ref={stickyRef} className="sticky -top-[26px] z-[16] -mx-8 px-8">
        <div ref={barRef} className="relative flex items-center pt-8 pb-6">
          <div style={{ maxWidth: 'min(var(--bar-maxw), 100%)' }} className="mx-auto w-full flex items-center gap-2">
            {/* Filter button */}
            <div className="relative" ref={filterRef}>
              <button
                onClick={() => setFilterOpen((v) => !v)}
                style={{ width: 'var(--bar-h)', height: 'var(--bar-h)' }}
                className={`flex items-center justify-center shrink-0 rounded-lg text-sm border-[1.5px] backdrop-blur-xl bg-neutral-950/60 ${
                  activeTypes.length > 0
                    ? 'text-white border-neutral-600'
                    : 'text-neutral-400 border-neutral-600 hover:text-neutral-200'
                }`}
              >
                <FunnelSimple size={20} weight="bold" />
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
            <form
              onSubmit={(e) => { e.preventDefault(); submitSearch(); }}
              className="flex-1 min-w-0 flex items-center gap-0 relative backdrop-blur-xl bg-neutral-950/60 rounded-lg"
            >
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Search memories..."
                style={{ height: 'var(--bar-h)', fontSize: 'var(--bar-fs)' }}
                className="flex-1 min-w-0 pl-4 pr-10 bg-transparent border-[1.5px] border-neutral-600 border-r-0 rounded-l-lg text-neutral-200 placeholder-neutral-500 focus:outline-none"
              />
              {inputValue && (
                <button
                  type="button"
                  onClick={clearSearch}
                  style={{ right: 'var(--bar-h)' }}
                  className="absolute text-neutral-500 hover:text-neutral-300"
                >
                  <X size={15} />
                </button>
              )}
              <button
                type="submit"
                style={{ width: 'var(--bar-h)', height: 'var(--bar-h)' }}
                className="flex items-center justify-center shrink-0 rounded-r-lg border-[1.5px] border-neutral-600 border-l-0 text-neutral-400 hover:text-neutral-200"
              >
                <MagnifyingGlass size={18} weight="bold" />
              </button>
            </form>
          </div>
        </div>
      </div>
      <MemoryList searchQuery={searchQuery} typeFilters={activeTypes} />
    </div>
  );
}
