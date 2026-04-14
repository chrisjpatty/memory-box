import { CardShell } from './CardShell';
import { cn } from '../../lib/cn';
import type { MemoryCardProps } from './types';

export function FileCard({ memory, onDelete, variant }: MemoryCardProps) {
  const h = variant === 'hero';

  return (
    <CardShell id={memory.id} onDelete={onDelete} variant={variant}>
      <div className="absolute inset-0 rounded-xl pointer-events-none bg-gradient-to-br from-neutral-500/[0.04] to-transparent" />

      <div className={cn('p-4', h && 'p-6')}>
        <div className={cn('flex items-center gap-2 mb-1', h ? 'text-base' : 'text-sm')}>
          <span>📎</span>
          {memory.source && (
            <p className={cn('text-neutral-400 truncate', h ? 'text-sm' : 'text-[11px]')}>{memory.source}</p>
          )}
        </div>
        {memory.summary && (
          <p className={cn('text-neutral-500 line-clamp-2', h ? 'text-sm' : 'text-xs')}>{memory.summary}</p>
        )}
      </div>
    </CardShell>
  );
}
