import { CardShell } from './CardShell';
import type { MemoryCardProps } from './types';
import { extractDomain, formatDate } from './types';

export function URLCard({ memory, onDelete }: MemoryCardProps) {
  const domain = memory.source ? extractDomain(memory.source) : null;

  return (
    <CardShell id={memory.id} onDelete={onDelete}>
      {/* Top edge glow line */}
      <div className="h-px bg-gradient-to-r from-transparent via-blue-500/60 to-transparent" />

      <div className="p-4">
        {/* Domain bar */}
        {domain && (
          <div className="flex items-center gap-2 mb-3">
            <div className="w-[18px] h-[18px] rounded-[5px] bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
              <svg width="9" height="9" viewBox="0 0 12 12" fill="none" className="text-blue-400">
                <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2" />
                <ellipse cx="6" cy="6" rx="2.5" ry="5" stroke="currentColor" strokeWidth="1" />
                <line x1="1" y1="6" x2="11" y2="6" stroke="currentColor" strokeWidth="1" />
              </svg>
            </div>
            <span className="text-[11px] text-blue-400/60 font-mono truncate">{domain}</span>
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" className="text-neutral-600 shrink-0 ml-auto">
              <path d="M3.5 8.5L8.5 3.5M8.5 3.5H4.5M8.5 3.5V7.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        )}

        {/* Title */}
        <h3 className="text-sm font-semibold text-neutral-200 leading-snug line-clamp-2 mb-1.5">
          {memory.title}
        </h3>

        {/* Summary */}
        {memory.summary && (
          <p className="text-xs text-neutral-500 line-clamp-2 mb-3 leading-relaxed">
            {memory.summary}
          </p>
        )}

        {/* Footer */}
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
                  className="px-1.5 py-0.5 rounded bg-blue-500/[0.06] text-[9px] text-blue-400/50 border border-blue-500/10"
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
