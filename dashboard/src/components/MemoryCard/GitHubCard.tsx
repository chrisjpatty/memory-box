import { useState } from 'react';
import { CardShell } from './CardShell';
import type { MemoryCardProps } from './types';
import { formatDate, formatCount } from './types';

function GitHubLogo() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="text-neutral-300 shrink-0">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

function IssueIcon({ state }: { state?: string }) {
  const color = state === 'closed' ? 'text-red-400' : 'text-emerald-400';
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className={`${color} shrink-0`}>
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="8" cy="8" r="1.5" fill="currentColor" />
    </svg>
  );
}

function PRIcon({ state }: { state?: string }) {
  const color = state === 'merged' ? 'text-violet-400' : state === 'closed' ? 'text-red-400' : 'text-emerald-400';
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className={`${color} shrink-0`}>
      <circle cx="5" cy="4" r="2" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="11" cy="12" r="2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M5 6v6M11 4v6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

const stateColors: Record<string, string> = {
  open: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  closed: 'bg-red-500/10 text-red-400 border-red-500/20',
  merged: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
};

// Known language colors (subset)
const langColors: Record<string, string> = {
  TypeScript: 'bg-blue-400',
  JavaScript: 'bg-yellow-400',
  Python: 'bg-blue-300',
  Rust: 'bg-orange-400',
  Go: 'bg-cyan-400',
  Ruby: 'bg-red-400',
  Java: 'bg-amber-600',
  C: 'bg-gray-400',
  'C++': 'bg-pink-400',
  'C#': 'bg-green-500',
  Swift: 'bg-orange-500',
  Kotlin: 'bg-violet-400',
  Shell: 'bg-emerald-500',
  HTML: 'bg-orange-500',
  CSS: 'bg-blue-500',
  Lua: 'bg-indigo-400',
  Zig: 'bg-amber-400',
};

function GitHubRepoCard({ memory, onDelete }: MemoryCardProps) {
  const extra = memory.extra || {};
  const language = extra.language;
  const langDot = langColors[language] || 'bg-neutral-500';
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <CardShell id={memory.id} onDelete={onDelete}>
      {/* Subtle background glow */}
      <div className="absolute inset-0 rounded-xl pointer-events-none bg-gradient-to-br from-emerald-500/[0.04] to-transparent z-10" />

      {/* README hero image */}
      {extra.readmeImage && !imgFailed && (
        <div className="relative aspect-[2.4/1] bg-neutral-800 overflow-hidden">
          <img
            src={extra.readmeImage}
            alt=""
            className="w-full h-full object-cover"
            onError={() => setImgFailed(true)}
          />
          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-neutral-900 via-neutral-900/60 to-transparent" />
        </div>
      )}

      <div className={extra.readmeImage && !imgFailed ? 'px-4 pb-4 -mt-3 relative' : 'p-4'}>
        {/* Repo identity */}
        <div className="flex items-center gap-2.5 mb-2.5">
          <GitHubLogo />
          <div className="font-mono text-[13px] truncate">
            <span className="text-neutral-500">{extra.owner}/</span>
            <span className="text-neutral-200 font-semibold">{extra.repo}</span>
          </div>
        </div>

        {/* Description */}
        {memory.summary && (
          <p className="text-xs text-neutral-400 line-clamp-2 mb-3 leading-relaxed pl-[26px]">
            {memory.summary}
          </p>
        )}

        {/* Stats row */}
        <div className="flex items-center gap-4 pl-[26px] mb-3">
          {extra.stars && extra.stars !== '0' && (
            <div className="flex items-center gap-1 text-[11px] text-neutral-400">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" className="text-amber-500/70">
                <path d="M8 .25a.75.75 0 01.673.418l1.882 3.815 4.21.612a.75.75 0 01.416 1.279l-3.046 2.97.719 4.192a.75.75 0 01-1.088.791L8 12.347l-3.766 1.98a.75.75 0 01-1.088-.79l.72-4.194L.818 6.374a.75.75 0 01.416-1.28l4.21-.611L7.327.668A.75.75 0 018 .25z" />
              </svg>
              <span>{formatCount(extra.stars)}</span>
            </div>
          )}
          {extra.forks && extra.forks !== '0' && (
            <div className="flex items-center gap-1 text-[11px] text-neutral-400">
              <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" className="text-neutral-500">
                <path d="M5 3.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm0 2.122a2.25 2.25 0 10-1.5 0v.878A2.25 2.25 0 005.75 8.5h1.5v2.128a2.251 2.251 0 101.5 0V8.5h1.5a2.25 2.25 0 002.25-2.25v-.878a2.25 2.25 0 10-1.5 0v.878a.75.75 0 01-.75.75h-4.5A.75.75 0 015 6.25v-.878zm3.75 7.378a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm3-8.75a.75.75 0 100-1.5.75.75 0 000 1.5z" />
              </svg>
              <span>{formatCount(extra.forks)}</span>
            </div>
          )}
          {language && (
            <div className="flex items-center gap-1.5 text-[11px] text-neutral-400">
              <span className={`w-2 h-2 rounded-full ${langDot}`} />
              <span>{language}</span>
            </div>
          )}
        </div>

        {/* Topics */}
        {extra.topics && (
          <div className="flex flex-wrap gap-1 pl-[26px] mb-3">
            {(() => {
              const topics = extra.topics.split(', ').filter(Boolean);
              return (
                <>
                  {topics.slice(0, 4).map((t) => (
                    <span
                      key={t}
                      className="px-1.5 py-0.5 rounded bg-emerald-500/[0.06] text-[9px] text-emerald-400/50 border border-emerald-500/10"
                    >
                      {t}
                    </span>
                  ))}
                  {topics.length > 4 && (
                    <span className="text-[9px] text-neutral-600 self-center">
                      +{topics.length - 4}
                    </span>
                  )}
                </>
              );
            })()}
          </div>
        )}

        {/* Date */}
        <div className="pl-[26px] text-[10px] text-neutral-600">
          {formatDate(memory.createdAt)}
        </div>
      </div>
    </CardShell>
  );
}

function GitHubIssueCard({ memory, onDelete }: MemoryCardProps) {
  const extra = memory.extra || {};
  const isPR = extra.githubType === 'pull-request';
  const Icon = isPR ? PRIcon : IssueIcon;
  const stateColor = stateColors[extra.state] || stateColors.open;

  return (
    <CardShell id={memory.id} onDelete={onDelete}>
      {/* Subtle background glow */}
      <div className="absolute inset-0 rounded-xl pointer-events-none bg-gradient-to-br from-emerald-500/[0.04] to-transparent" />

      <div className="p-4">
        {/* Repo + number reference */}
        <div className="flex items-center gap-2 mb-2">
          <Icon state={extra.state} />
          <span className="font-mono text-[11px] text-neutral-500 truncate">
            {extra.owner}/{extra.repo}#{extra.number}
          </span>
          <span className={`ml-auto px-2 py-0.5 rounded-full text-[9px] font-semibold border ${stateColor}`}>
            {extra.state}
          </span>
        </div>

        {/* Title */}
        <h3 className="text-sm font-medium text-neutral-200 line-clamp-2 mb-2 pl-[26px] leading-snug">
          {memory.title}
        </h3>

        {/* Meta row */}
        <div className="flex items-center gap-3 pl-[26px] mb-2 text-[11px] text-neutral-500">
          {extra.author && (
            <span>by <span className="text-neutral-400">{extra.author}</span></span>
          )}
          {extra.commentCount && extra.commentCount !== '0' && (
            <div className="flex items-center gap-1">
              <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" className="text-neutral-600">
                <path d="M1 2.75C1 1.784 1.784 1 2.75 1h10.5c.966 0 1.75.784 1.75 1.75v7.5A1.75 1.75 0 0113.25 12H9.06l-2.573 2.573A1.458 1.458 0 014 13.543V12H2.75A1.75 1.75 0 011 10.25v-7.5z" />
              </svg>
              <span>{extra.commentCount}</span>
            </div>
          )}
        </div>

        {/* PR diff stats */}
        {isPR && (extra.additions || extra.deletions) && (
          <div className="flex items-center gap-2.5 pl-[26px] mb-2 text-[11px] font-mono">
            {extra.additions && extra.additions !== '0' && (
              <span className="text-emerald-400/70">+{extra.additions}</span>
            )}
            {extra.deletions && extra.deletions !== '0' && (
              <span className="text-red-400/70">-{extra.deletions}</span>
            )}
            {extra.changedFiles && extra.changedFiles !== '0' && (
              <span className="text-neutral-500">{extra.changedFiles} files</span>
            )}
          </div>
        )}

        {/* Labels */}
        {extra.labels && (
          <div className="flex flex-wrap gap-1 pl-[26px] mb-2">
            {extra.labels.split(', ').filter(Boolean).map((l) => (
              <span
                key={l}
                className="px-1.5 py-0.5 rounded bg-neutral-800 text-[9px] text-neutral-400 border border-neutral-700/50"
              >
                {l}
              </span>
            ))}
          </div>
        )}

        {/* Date */}
        <div className="pl-[26px] text-[10px] text-neutral-600">
          {formatDate(memory.createdAt)}
        </div>
      </div>
    </CardShell>
  );
}

export function GitHubCard(props: MemoryCardProps) {
  const ghType = props.memory.extra?.githubType;
  if (ghType === 'issue' || ghType === 'pull-request') {
    return <GitHubIssueCard {...props} />;
  }
  return <GitHubRepoCard {...props} />;
}
