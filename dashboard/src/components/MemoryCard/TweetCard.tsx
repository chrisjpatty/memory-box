import { CardShell } from './CardShell';
import type { MemoryCardProps } from './types';

function XLogo({ className = '' }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function VerifiedBadge() {
  return (
    <svg width="14" height="14" viewBox="0 0 22 22" fill="none" className="shrink-0">
      <circle cx="11" cy="11" r="10" fill="#1D9BF0" />
      <path d="M9.5 14.25L6.75 11.5L7.81 10.44L9.5 12.13L14.19 7.44L15.25 8.5L9.5 14.25Z" fill="white" />
    </svg>
  );
}

function formatTweetDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffH = diffMs / (1000 * 60 * 60);

  if (diffH < 1) return `${Math.max(1, Math.floor(diffMs / 60000))}m`;
  if (diffH < 24) return `${Math.floor(diffH)}h`;
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatStat(n: string | undefined): string | null {
  if (!n || n === '0') return null;
  const num = parseInt(n, 10);
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(num);
}

function MediaGrid({ urls }: { urls: string[] }) {
  const count = urls.length;
  const img = (src: string, className: string) => (
    <img src={src} alt="" className={`object-cover w-full h-full ${className}`} />
  );

  if (count === 1) {
    return (
      <div className="rounded-xl overflow-hidden border border-neutral-800 mb-2.5">
        {img(urls[0], 'max-h-[200px]')}
      </div>
    );
  }

  if (count === 2) {
    return (
      <div className="grid grid-cols-2 gap-0.5 rounded-xl overflow-hidden border border-neutral-800 mb-2.5 h-[180px]">
        {img(urls[0], '')}
        {img(urls[1], '')}
      </div>
    );
  }

  if (count === 3) {
    return (
      <div className="grid grid-cols-2 gap-0.5 rounded-xl overflow-hidden border border-neutral-800 mb-2.5 h-[200px]">
        <div className="row-span-2">{img(urls[0], 'h-full')}</div>
        {img(urls[1], '')}
        {img(urls[2], '')}
      </div>
    );
  }

  // 4+
  return (
    <div className="grid grid-cols-2 grid-rows-2 gap-0.5 rounded-xl overflow-hidden border border-neutral-800 mb-2.5 h-[220px]">
      {urls.slice(0, 4).map((url, i) => img(url, i === 0 ? '' : ''))}
    </div>
  );
}

export function TweetCard({ memory, onDelete }: MemoryCardProps) {
  const extra = memory.extra || {};
  const authorName = extra.authorName || extra.author || 'Unknown';
  const handle = extra.handle || extra.author || 'user';
  const avatarUrl = extra.avatarUrl;
  const verified = extra.verified === 'true';
  const tweetText = memory.summary || memory.title;
  const mediaUrls = (extra.mediaUrls || extra.mediaUrl || '').split(',').map((u) => u.trim()).filter(Boolean);

  const replies = formatStat(extra.replies);
  const retweets = formatStat(extra.retweets);
  const likes = formatStat(extra.likes);
  const views = formatStat(extra.views);

  return (
    <CardShell id={memory.id} onDelete={onDelete}>
      <div className="p-4">
        {/* Author row */}
        <div className="flex items-start gap-2.5">
          {/* Avatar */}
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt=""
              className="w-9 h-9 rounded-full bg-neutral-800 shrink-0 object-cover"
            />
          ) : (
            <div className="w-9 h-9 rounded-full bg-neutral-800 shrink-0 flex items-center justify-center text-neutral-600 text-sm font-bold">
              {authorName[0]?.toUpperCase()}
            </div>
          )}

          <div className="flex-1 min-w-0">
            {/* Name + handle + timestamp */}
            <div className="flex items-center gap-1 mb-0.5">
              <span className="text-[13px] font-bold text-neutral-200 truncate">
                {authorName}
              </span>
              {verified && <VerifiedBadge />}
              <span className="text-[12px] text-neutral-600 truncate">
                @{handle}
              </span>
              <span className="text-neutral-700 text-[12px]">&middot;</span>
              <span className="text-[12px] text-neutral-600 shrink-0">
                {formatTweetDate(memory.createdAt)}
              </span>
              {/* X logo */}
              <XLogo className="text-neutral-700 ml-auto shrink-0" />
            </div>

            {/* Tweet body */}
            <p className="text-[13px] text-neutral-300 leading-[1.4] whitespace-pre-line mb-2.5">
              {tweetText}
            </p>

            {/* Attached media */}
            {mediaUrls.length > 0 && (
              <MediaGrid urls={mediaUrls} />
            )}

            {/* Engagement stats */}
            <div className="flex items-center gap-5">
              {/* Replies */}
              <div className="flex items-center gap-1.5 text-neutral-600 group/stat">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="group-hover/stat:text-sky-400 transition-colors">
                  <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {replies && <span className="text-[11px]">{replies}</span>}
              </div>

              {/* Retweets */}
              <div className="flex items-center gap-1.5 text-neutral-600 group/stat">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="group-hover/stat:text-emerald-400 transition-colors">
                  <path d="M17 1l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M3 11V9a4 4 0 014-4h14" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M7 23l-4-4 4-4" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M21 13v2a4 4 0 01-4 4H3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {retweets && <span className="text-[11px]">{retweets}</span>}
              </div>

              {/* Likes */}
              <div className="flex items-center gap-1.5 text-neutral-600 group/stat">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="group-hover/stat:text-pink-500 transition-colors">
                  <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {likes && <span className="text-[11px]">{likes}</span>}
              </div>

              {/* Views */}
              <div className="flex items-center gap-1.5 text-neutral-600 group/stat">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="group-hover/stat:text-sky-400 transition-colors">
                  <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                {views && <span className="text-[11px]">{views}</span>}
              </div>
            </div>
          </div>
        </div>

        {/* Tags */}
        {memory.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-3 pl-[46px]">
            {memory.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="px-1.5 py-0.5 rounded bg-sky-500/[0.06] text-[9px] text-sky-400/50 border border-sky-500/10"
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
    </CardShell>
  );
}
