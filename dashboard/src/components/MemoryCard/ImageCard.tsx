import { CardShell } from './CardShell';
import { cn } from '../../lib/cn';
import type { MemoryCardProps } from './types';
import { formatDate } from './types';

export function ImageCard({ memory, onDelete, variant }: MemoryCardProps) {
  const h = variant === 'hero';

  return (
    <CardShell id={memory.id} onDelete={onDelete} variant={variant}>
      <div className="absolute inset-0 rounded-xl pointer-events-none bg-gradient-to-br from-violet-500/[0.04] to-transparent z-10" />

      <div className="relative aspect-[16/10] bg-neutral-800">
        {memory.hasImage ? (
          <img
            draggable={false}
            src={memory.imageUrl || `/api/memories/${memory.id}/image`}
            alt={memory.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-violet-950/30 to-neutral-900">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" className="text-neutral-700">
              <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.5" />
              <circle cx="9" cy="9" r="2" stroke="currentColor" strokeWidth="1.5" />
              <path d="M3 16l5-5 4 4 3-3 6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-neutral-900 via-neutral-900/60 to-transparent" />
        <span className={cn(
          'absolute top-3 left-3 px-2 py-0.5 rounded-md font-medium bg-violet-500/20 text-violet-300 border border-violet-500/20 backdrop-blur-sm',
          h ? 'text-xs' : 'text-[10px]',
        )}>
          image
        </span>
      </div>

      <div className={cn('-mt-3 relative', h ? 'px-6 pb-6' : 'px-4 pb-4')}>
        <h3 className={cn('font-semibold text-neutral-200 truncate', h ? 'text-lg mb-1.5' : 'text-sm mb-1')}>
          {memory.title}
        </h3>

        {memory.summary && (
          <p className={cn('text-neutral-500 line-clamp-2 leading-relaxed', h ? 'text-sm mb-4' : 'text-xs mb-3')}>
            {memory.summary}
          </p>
        )}

        <div className="flex items-center gap-3">
          <div className={cn('flex items-center gap-1.5 text-neutral-600', h ? 'text-xs' : 'text-[10px]')}>
            {memory.category && <span>{memory.category}</span>}
            {memory.category && <span className="text-neutral-700">/</span>}
            <span>{formatDate(memory.createdAt)}</span>
          </div>

          {memory.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1 ml-auto">
              {memory.tags.slice(0, 3).map((tag) => (
                <span key={tag} className={cn(
                  'px-1.5 py-0.5 rounded bg-violet-500/[0.06] text-violet-400/50 border border-violet-500/10',
                  h ? 'text-[11px]' : 'text-[9px]',
                )}>
                  {tag}
                </span>
              ))}
              {memory.tags.length > 3 && (
                <span className={cn('text-neutral-600 self-center', h ? 'text-[11px]' : 'text-[9px]')}>
                  +{memory.tags.length - 3}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </CardShell>
  );
}
