import { useState, useRef, useEffect } from 'react';
import { cn } from '../../lib/cn';
import type { CardVariant } from './types';

interface CardShellProps {
  id: string;
  onDelete?: (id: string) => void;
  children: React.ReactNode;
  className?: string;
  variant?: CardVariant;
}

export function CardShell({ id, onDelete, children, className, variant }: CardShellProps) {
  const isHero = variant === 'hero';
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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
    <div
      className={cn(
        'relative bg-neutral-900 overflow-hidden group',
        isHero
          ? 'rounded-t-xl rounded-b-none'
          : 'border border-neutral-800 rounded-xl hover:border-neutral-700 transition-all duration-200',
        className,
      )}
    >
      {children}
      {onDelete && (
        <div ref={menuRef} className="absolute top-2.5 right-2.5 z-10" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }} onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}>
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className={cn(
              'w-6 h-6 rounded-md flex items-center justify-center transition-all duration-150',
              menuOpen
                ? 'bg-neutral-800 opacity-100'
                : 'opacity-0 group-hover:opacity-100 bg-neutral-950/80 backdrop-blur-sm hover:bg-neutral-800',
            )}
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
                  onDelete(id);
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
