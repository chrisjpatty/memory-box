import { CardShell } from './CardShell';
import type { MemoryCardProps } from './types';

export function PDFCard({ memory, onDelete }: MemoryCardProps) {
  return (
    <CardShell memory={memory} onDelete={onDelete}>
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
