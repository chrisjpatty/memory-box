import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Markdown from 'react-markdown';
import { api } from '../api';

interface Props {
  memoryId: string;
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

const typeBadgeColors: Record<string, string> = {
  url: 'bg-blue-900/50 text-blue-400 border-blue-800',
  text: 'bg-green-900/50 text-green-400 border-green-800',
  image: 'bg-purple-900/50 text-purple-400 border-purple-800',
  pdf: 'bg-red-900/50 text-red-400 border-red-800',
  file: 'bg-yellow-900/50 text-yellow-400 border-yellow-800',
};

type ViewMode = 'markdown' | 'plain' | 'original';

// --- GitHub metadata display ---

function Stat({ label, value, icon }: { label: string; value: string; icon?: string }) {
  if (!value || value === '0') return null;
  return (
    <div className="flex items-center gap-1.5 text-xs">
      {icon && <span className="text-sm">{icon}</span>}
      <span className="text-neutral-400">{value}</span>
      <span className="text-neutral-600">{label}</span>
    </div>
  );
}

function StateBadge({ state }: { state: string }) {
  const colors: Record<string, string> = {
    open: 'bg-green-900/60 text-green-400 border-green-700',
    closed: 'bg-red-900/60 text-red-400 border-red-700',
    merged: 'bg-purple-900/60 text-purple-400 border-purple-700',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${colors[state] || 'bg-neutral-800 text-neutral-400 border-neutral-700'}`}>
      {state}
    </span>
  );
}

function GitHubRepoMeta({ extra }: { extra: Record<string, string> }) {
  return (
    <div className="bg-neutral-800/50 border border-neutral-700/50 rounded-lg p-4 mb-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-sm">&#128193;</span>
        <a
          href={extra.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-semibold text-blue-400 hover:text-blue-300"
        >
          {extra.owner}/{extra.repo}
        </a>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        <Stat icon="&#11088;" value={extra.stars} label="stars" />
        <Stat icon="&#128268;" value={extra.forks} label="forks" />
        {extra.language && (
          <div className="flex items-center gap-1.5 text-xs">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-400 inline-block" />
            <span className="text-neutral-300">{extra.language}</span>
          </div>
        )}
        {extra.license && extra.license !== '' && (
          <Stat icon="&#128220;" value={extra.license} label="" />
        )}
      </div>

      {extra.topics && (
        <div className="flex flex-wrap gap-1.5">
          {extra.topics.split(', ').filter(Boolean).map((t) => (
            <span key={t} className="px-2 py-0.5 bg-blue-900/30 border border-blue-800/50 rounded-full text-[10px] text-blue-400">
              {t}
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-neutral-500">
        {extra.defaultBranch && <span>branch: <span className="text-neutral-400">{extra.defaultBranch}</span></span>}
        {extra.createdAt && <span>created: <span className="text-neutral-400">{new Date(extra.createdAt).toLocaleDateString()}</span></span>}
        {extra.updatedAt && <span>updated: <span className="text-neutral-400">{new Date(extra.updatedAt).toLocaleDateString()}</span></span>}
      </div>
    </div>
  );
}

function GitHubIssueMeta({ extra }: { extra: Record<string, string> }) {
  return (
    <div className="bg-neutral-800/50 border border-neutral-700/50 rounded-lg p-4 mb-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm">{extra.githubType === 'pull-request' ? '\u{1F501}' : '\u{1F4CB}'}</span>
        <a
          href={extra.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-semibold text-blue-400 hover:text-blue-300"
        >
          {extra.owner}/{extra.repo}#{extra.number}
        </a>
        <StateBadge state={extra.state} />
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {extra.author && <Stat icon="&#128100;" value={extra.author} label="" />}
        {extra.commentCount && <Stat icon="&#128172;" value={extra.commentCount} label="comments" />}
      </div>

      {/* PR-specific diff stats */}
      {extra.githubType === 'pull-request' && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
          {extra.additions && extra.additions !== '0' && (
            <span className="text-green-400">+{extra.additions}</span>
          )}
          {extra.deletions && extra.deletions !== '0' && (
            <span className="text-red-400">-{extra.deletions}</span>
          )}
          {extra.changedFiles && extra.changedFiles !== '0' && (
            <span className="text-neutral-400">{extra.changedFiles} files</span>
          )}
          {extra.baseBranch && extra.headBranch && (
            <span className="text-neutral-500">
              <span className="text-neutral-400">{extra.headBranch}</span>
              {' \u2192 '}
              <span className="text-neutral-400">{extra.baseBranch}</span>
            </span>
          )}
        </div>
      )}

      {extra.labels && (
        <div className="flex flex-wrap gap-1.5">
          {extra.labels.split(', ').filter(Boolean).map((l) => (
            <span key={l} className="px-2 py-0.5 bg-neutral-700/60 border border-neutral-600/50 rounded-full text-[10px] text-neutral-300">
              {l}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function GitHubMeta({ extra }: { extra: Record<string, string> }) {
  if (!extra?.githubType) return null;
  if (extra.githubType === 'repo') return <GitHubRepoMeta extra={extra} />;
  if (extra.githubType === 'issue' || extra.githubType === 'pull-request') return <GitHubIssueMeta extra={extra} />;
  return null;
}

export function MemoryDetail({ memoryId }: Props) {
  const navigate = useNavigate();
  const [memory, setMemory] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('markdown');

  useEffect(() => {
    setLoading(true);
    api.memory(memoryId)
      .then((r) => { if (r.found) setMemory(r.memory); })
      .finally(() => setLoading(false));
  }, [memoryId]);

  if (loading) return <div className="text-neutral-500 text-sm py-8 text-center">Loading...</div>;
  if (!memory) return <div className="text-neutral-500 text-sm py-8 text-center">Memory not found</div>;

  const rawContent = memory.markdown || memory.processedContent;

  // Clean up markdown for rendering:
  // Jina Reader often produces linked images with newlines inside brackets, e.g.:
  //   [\n\n![alt](img)\n\n](link)
  // Collapse these into proper inline markdown: [![alt](img)](link)
  const content = rawContent?.replace(
    /\[\s*(\!\[[^\]]*\]\([^)]*\))\s*\]\(([^)]*)\)/g,
    '[$1]($2)'
  );

  return (
    <div className="max-w-3xl">
      <button onClick={() => navigate(-1)} className="text-sm text-neutral-400 hover:text-neutral-200 mb-4 transition-colors">
        &larr; Back
      </button>

      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-3">
          <span className={`px-2 py-0.5 rounded text-[10px] font-medium border ${typeBadgeColors[memory.contentType] || 'bg-neutral-800 text-neutral-400 border-neutral-700'}`}>
            {memory.contentType}
          </span>
          {memory.category && (
            <span className="text-xs text-neutral-500">{memory.category}</span>
          )}
          <span className="text-[10px] text-neutral-600 ml-auto">{new Date(memory.createdAt).toLocaleDateString()}</span>
        </div>

        <h2 className="text-xl font-semibold mb-2">{memory.title}</h2>

        {memory.summary && (
          <p className="text-sm text-neutral-400 mb-4">{memory.summary}</p>
        )}

        {memory.source && !memory.extra?.githubType && (
          <a href={memory.source} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-400 hover:text-blue-300 mb-4 block break-all">
            {memory.source}
          </a>
        )}

        <GitHubMeta extra={memory.extra} />

        {memory.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {memory.tags.map((tag: string) => (
              <span key={tag} className="px-2 py-0.5 bg-neutral-800 rounded text-[11px] text-neutral-400">
                {tag}
              </span>
            ))}
          </div>
        )}

        {memory.hasImage && (
          <div className="mt-4 pt-4 border-t border-neutral-800">
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

        {content && (
          <div className="mt-4 pt-4 border-t border-neutral-800">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                {memory.hasImage ? 'Description' : 'Content'}
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

            {viewMode === 'original' && memory.hasHtml ? (
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
