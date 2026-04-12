import { CardShell } from './CardShell';
import type { MemoryCardProps } from './types';

export function PDFCard({ memory, onDelete }: MemoryCardProps) {
  return (
    <CardShell id={memory.id} onDelete={onDelete}>
      {/* Subtle background glow */}
      <div className="absolute inset-0 rounded-xl pointer-events-none bg-gradient-to-br from-neutral-500/[0.04] to-transparent" />

      <div className="flex items-center gap-2 mb-1">
        <span className="text-sm">📄</span>
        {memory.source && (
          <p className="text-[11px] text-neutral-400 truncate">{memory.source}</p>
        )}
      </div>
      {memory.summary && (
        <p className="text-xs text-neutral-500 line-clamp-2">{memory.summary}</p>
      )}
    </CardShell>
  );
}
