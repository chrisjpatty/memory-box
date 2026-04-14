import { CardShell } from './CardShell';
import { cn } from '../../lib/cn';
import type { MemoryCardProps } from './types';
import { formatDate } from './types';

export function TextCard({ memory, onDelete, variant }: MemoryCardProps) {
  const h = variant === 'hero';

  return (
    <CardShell id={memory.id} onDelete={onDelete} variant={variant}>
      <div className="absolute inset-0 rounded-xl pointer-events-none bg-gradient-to-br from-amber-500/[0.04] to-transparent" />

      <div className={cn('p-4', h && 'p-6')}>
        <span className={cn(
          'absolute top-1 right-4 font-serif leading-none text-amber-500/[0.07] select-none pointer-events-none',
          h ? 'text-[96px]' : 'text-[72px]',
        )}>
          &ldquo;
        </span>

        {memory.summary && (
          <p className={cn(
            'leading-relaxed text-neutral-300 italic font-serif relative',
            h ? 'text-base line-clamp-6 mb-4' : 'text-[13px] line-clamp-4 mb-3',
          )}>
            {memory.summary}
          </p>
        )}

        <h3 className={cn(
          'font-medium text-neutral-500 truncate',
          h ? 'text-sm mb-3' : 'text-[11px] mb-2.5',
        )}>
          {memory.title}
        </h3>

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
                  'px-1.5 py-0.5 rounded bg-amber-500/[0.06] text-amber-400/50 border border-amber-500/10',
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
