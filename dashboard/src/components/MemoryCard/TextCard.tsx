import { CardShell } from './CardShell';
import type { MemoryCardProps } from './types';
import { formatDate } from './types';

export function TextCard({ memory, onDelete }: MemoryCardProps) {
  return (
    <CardShell id={memory.id} onDelete={onDelete}>
      {/* Warm amber accent bar */}
      <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b from-amber-400 via-amber-500 to-amber-700/40" />

      <div className="pl-5 pr-4 py-4">
        {/* Decorative quotation mark */}
        <span className="absolute top-1 right-4 text-[72px] font-serif leading-none text-amber-500/[0.07] select-none pointer-events-none">
          &ldquo;
        </span>

        {/* Summary as hero text — the excerpt feel */}
        {memory.summary && (
          <p className="text-[13px] leading-relaxed text-neutral-300 italic font-serif line-clamp-4 mb-3 relative">
            {memory.summary}
          </p>
        )}

        {/* Title as secondary label */}
        <h3 className="text-[11px] font-medium text-neutral-500 truncate mb-2.5">
          {memory.title}
        </h3>

        {/* Footer row */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-[10px] text-neutral-600">
            {memory.category && <span>{memory.category}</span>}
            {memory.category && <span className="text-neutral-700">/</span>}
            <span>{formatDate(memory.createdAt)}</span>
          </div>

          {memory.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1 ml-auto">
              {memory.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="px-1.5 py-0.5 rounded bg-amber-500/[0.06] text-[9px] text-amber-400/50 border border-amber-500/10"
                >
                  {tag}
                </span>
              ))}
              {memory.tags.length > 3 && (
                <span className="text-[9px] text-neutral-600 self-center">
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
