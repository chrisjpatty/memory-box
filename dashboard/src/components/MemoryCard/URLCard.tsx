import { CardShell } from './CardShell';
import { cn } from '../../lib/cn';
import type { MemoryCardProps } from './types';
import { extractDomain, formatDate } from './types';

export function URLCard({ memory, onDelete, variant }: MemoryCardProps) {
  const h = variant === 'hero';
  const domain = memory.source ? extractDomain(memory.source) : null;
  const imageUrl = memory.extra?.imageUrl;

  return (
    <CardShell id={memory.id} onDelete={onDelete} variant={variant}>
      <div className="absolute inset-0 rounded-xl pointer-events-none bg-gradient-to-br from-yellow-500/[0.04] to-transparent" />

      {imageUrl && (
        <div className="relative aspect-[2.4/1] bg-neutral-800 overflow-hidden">
          <img src={imageUrl} alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-neutral-900 via-neutral-900/60 to-transparent" />
        </div>
      )}

      <div className={cn(
        imageUrl ? '-mt-3 relative' : '',
        imageUrl && h && 'px-6 pb-6',
        imageUrl && !h && 'px-4 pb-4',
        !imageUrl && h && 'p-6',
        !imageUrl && !h && 'p-4',
      )}>
        {domain && (
          <div className={cn('flex items-center gap-2', h ? 'mb-4' : 'mb-3')}>
            <div className="w-[18px] h-[18px] rounded-[5px] bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center shrink-0">
              <svg width="9" height="9" viewBox="0 0 12 12" fill="none" className="text-yellow-400">
                <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2" />
                <ellipse cx="6" cy="6" rx="2.5" ry="5" stroke="currentColor" strokeWidth="1" />
                <line x1="1" y1="6" x2="11" y2="6" stroke="currentColor" strokeWidth="1" />
              </svg>
            </div>
            <span className={cn('text-yellow-400/60 font-mono truncate', h ? 'text-sm' : 'text-[11px]')}>{domain}</span>
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" className="text-neutral-600 shrink-0 ml-auto">
              <path d="M3.5 8.5L8.5 3.5M8.5 3.5H4.5M8.5 3.5V7.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        )}

        <h3 className={cn('font-semibold text-neutral-200 leading-snug line-clamp-2', h ? 'text-lg mb-2' : 'text-sm mb-1.5')}>
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
                  'px-1.5 py-0.5 rounded bg-yellow-500/[0.06] text-yellow-400/50 border border-yellow-500/10',
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
