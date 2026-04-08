import { CardShell } from './CardShell';
import type { MemoryCardProps } from './types';
import { formatDate } from './types';

export function ImageCard({ memory, onDelete }: MemoryCardProps) {
  return (
    <CardShell id={memory.id} onDelete={onDelete}>
      {/* Image area — the card's hero */}
      <div className="relative aspect-[16/10] bg-neutral-800">
        {memory.hasImage ? (
          <img
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

        {/* Bottom gradient scrim */}
        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-neutral-900 via-neutral-900/60 to-transparent" />

        {/* Type pill floating over image */}
        <span className="absolute top-3 left-3 px-2 py-0.5 rounded-md text-[10px] font-medium bg-violet-500/20 text-violet-300 border border-violet-500/20 backdrop-blur-sm">
          image
        </span>
      </div>

      {/* Content below, pulled up slightly into the gradient */}
      <div className="px-4 pb-4 -mt-3 relative">
        <h3 className="text-sm font-semibold text-neutral-200 truncate mb-1">
          {memory.title}
        </h3>

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
                  className="px-1.5 py-0.5 rounded bg-violet-500/[0.06] text-[9px] text-violet-400/50 border border-violet-500/10"
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
