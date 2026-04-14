import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Markdown from 'react-markdown';
import { useMemory } from '../hooks/queries';
import { MemoryCard } from './MemoryCard';
import type { MemoryCardData } from './MemoryCard';

interface Props {
  memoryId: string;
  onClose?: () => void;
  cardData?: MemoryCardData;
}

function ActionButton({ onClick, label }: { onClick: () => void; label: string }) {
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleClick = () => {
    onClick();
    setFeedback(label === 'Copy' ? 'Copied!' : 'Downloading...');
    setTimeout(() => setFeedback(null), 2000);
  };

  return (
    <button
      onClick={handleClick}
      className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${
        feedback
          ? 'border-green-700 text-green-400'
          : 'border-neutral-700 text-neutral-500 hover:text-neutral-300 hover:border-neutral-600'
      }`}
    >
      {feedback || label}
    </button>
  );
}

type ViewMode = 'markdown' | 'plain' | 'original';

export function MemoryDetail({ memoryId, onClose, cardData }: Props) {
  const navigate = useNavigate();
  const { data, isLoading } = useMemory(memoryId);
  const [viewMode, setViewMode] = useState<ViewMode>('markdown');

  const memory = data?.found ? data.memory : null;
  // Use cardData for immediate hero card rendering while full data loads
  const heroCard: MemoryCardData | null = memory as MemoryCardData ?? cardData ?? null;

  const rawContent = memory?.markdown || memory?.processedContent;
  const content = rawContent?.replace(
    /\[\s*(\!\[[^\]]*\]\([^)]*\))\s*\]\(([^)]*)\)/g,
    '[$1]($2)'
  );

  if (!isLoading && !memory) return <div className="text-neutral-500 text-sm py-8 text-center">Memory not found</div>;

  const inModal = !!onClose;

  return (
    <div className={inModal ? '' : 'max-w-3xl'}>
      {!onClose && (
        <button onClick={() => navigate(-1)} className="text-sm text-neutral-400 hover:text-neutral-200 mb-4 transition-colors">
          &larr; Back
        </button>
      )}

      {/* Card rendered as hero -- full-width in modal, constrained otherwise */}
      <div className={inModal ? '' : 'max-w-lg mb-6'}>
        {heroCard ? (
          <MemoryCard memory={heroCard} variant={inModal ? 'hero' : undefined} />
        ) : (
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 h-32 animate-pulse" />
        )}
      </div>

      {/* Content area -- padded when in modal */}
      <div className={inModal ? 'p-6' : ''}>

      {isLoading && (
        <div className="text-neutral-500 text-sm py-4 text-center">Loading details...</div>
      )}

      {/* Source link */}
      {memory && memory.source && (
        <a
          href={memory.source}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 mb-6 px-4 py-3 bg-neutral-900 border border-neutral-800 rounded-xl hover:border-neutral-700 transition-colors group"
        >
          <div className="w-8 h-8 rounded-lg bg-neutral-800 flex items-center justify-center shrink-0 group-hover:bg-neutral-750">
            <svg width="14" height="14" viewBox="0 0 12 12" fill="none" className="text-neutral-400">
              <path d="M3.5 8.5L8.5 3.5M8.5 3.5H4.5M8.5 3.5V7.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium text-neutral-200 group-hover:text-white transition-colors">
              Visit source
            </div>
            <div className="text-xs text-neutral-500 truncate">
              {memory.source}
            </div>
          </div>
        </a>
      )}

      {/* Image */}
      {memory && memory.hasImage && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 mb-6">
          <img
            src={`/api/memories/${memoryId}/image`}
            alt={memory.title}
            className="rounded-lg max-w-full max-h-[500px] object-contain"
          />
          <div className="flex gap-2 mt-3">
            <ActionButton
              label="Copy"
              onClick={async () => {
                const res = await fetch(`/api/memories/${memoryId}/image`, { credentials: 'include' });
                const blob = await res.blob();
                await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
              }}
            />
            <ActionButton
              label="Download"
              onClick={() => {
                const a = document.createElement('a');
                a.href = `/api/memories/${memoryId}/image`;
                a.download = memory.title || 'image';
                a.click();
              }}
            />
          </div>
        </div>
      )}

      {/* Full content */}
      {content && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
              {memory?.hasImage ? 'Description' : 'Content'}
            </h3>
            <div className="flex items-center gap-2">
              <ActionButton
                label="Copy"
                onClick={() => navigator.clipboard.writeText(rawContent)}
              />
              <ActionButton
                label="Download"
                onClick={() => {
                  const blob = new Blob([rawContent], { type: 'text/markdown' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `${memory.title || 'memory'}.md`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              />
              <div className="flex bg-neutral-800 rounded-lg p-0.5">
                <button
                  onClick={() => setViewMode('markdown')}
                  className={`px-3 py-1 rounded-md text-[11px] font-medium transition-colors ${
                    viewMode === 'markdown'
                      ? 'bg-neutral-700 text-neutral-200'
                      : 'text-neutral-500 hover:text-neutral-300'
                  }`}
                >
                  Rendered
                </button>
                <button
                  onClick={() => setViewMode('plain')}
                  className={`px-3 py-1 rounded-md text-[11px] font-medium transition-colors ${
                    viewMode === 'plain'
                      ? 'bg-neutral-700 text-neutral-200'
                      : 'text-neutral-500 hover:text-neutral-300'
                  }`}
                >
                  Plain
                </button>
                {memory.hasHtml && (
                  <button
                    onClick={() => setViewMode('original')}
                    className={`px-3 py-1 rounded-md text-[11px] font-medium transition-colors ${
                      viewMode === 'original'
                        ? 'bg-neutral-700 text-neutral-200'
                        : 'text-neutral-500 hover:text-neutral-300'
                    }`}
                  >
                    Original
                  </button>
                )}
              </div>
            </div>
          </div>

          {viewMode === 'original' && memory?.hasHtml ? (
            <div className="rounded-lg overflow-hidden border border-neutral-700">
              <iframe
                src={`/api/memories/${memoryId}/html`}
                sandbox="allow-same-origin"
                title={`Original page: ${memory.title}`}
                className="w-full bg-white rounded-lg"
                style={{ height: '70vh' }}
              />
            </div>
          ) : viewMode === 'plain' ? (
            <pre className="whitespace-pre-wrap break-words text-sm text-neutral-300 leading-relaxed font-mono">
              {content}
            </pre>
          ) : (
            <div className="prose prose-invert prose-sm max-w-none break-words
              prose-headings:text-neutral-200 prose-headings:font-semibold
              prose-h1:text-xl prose-h1:mt-6 prose-h1:mb-3
              prose-h2:text-lg prose-h2:mt-5 prose-h2:mb-2
              prose-h3:text-base prose-h3:mt-4 prose-h3:mb-2
              prose-p:text-neutral-300 prose-p:leading-relaxed prose-p:mb-3
              prose-a:text-blue-400 prose-a:no-underline hover:prose-a:text-blue-300
              prose-strong:text-neutral-200
              prose-code:text-neutral-300 prose-code:bg-neutral-800 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:before:content-none prose-code:after:content-none
              prose-pre:bg-neutral-950 prose-pre:border prose-pre:border-neutral-800 prose-pre:rounded-lg
              prose-blockquote:border-neutral-700 prose-blockquote:text-neutral-400
              prose-li:text-neutral-300
              prose-img:rounded-lg
              prose-hr:border-neutral-800
              prose-table:text-sm
              prose-th:text-neutral-300 prose-th:border-neutral-700
              prose-td:border-neutral-800
            ">
              <Markdown>{content}</Markdown>
            </div>
          )}
        </div>
      )}

      </div>
    </div>
  );
}
