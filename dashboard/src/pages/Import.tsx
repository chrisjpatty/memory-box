import { useState, useEffect } from 'react';
import { ImportTabs } from '../components/ImportTabs';
import {
  useGitHubToken,
  useSaveGitHubToken,
  useRemoveGitHubToken,
  useSyncStatus,
  useToggleSync,
  useDiscoverGitHubStars,
  useActiveJob,
  useJobStatus,
  useStartJob,
  useCancelJob,
} from '../hooks/queries';

interface RepoInfo {
  url: string;
  fullName: string;
  description: string;
  stars: number;
  language: string | null;
  alreadyImported: boolean;
  existingMemoryId?: string;
}

interface JobResult {
  repo: string;
  status: 'imported' | 'skipped' | 'failed';
  memoryId?: string;
  error?: string;
}

interface ProgressState {
  jobId: string;
  status: string;
  completed: number;
  total: number;
  skipped: number;
  failed: number;
  currentItem: string;
  results: JobResult[];
}

// --- GitHub Settings Section ---

function GitHubSettings() {
  const [tokenInput, setTokenInput] = useState('');
  const [error, setError] = useState('');

  const { data: tokenInfo } = useGitHubToken();
  const { data: syncStatus } = useSyncStatus();
  const saveToken = useSaveGitHubToken();
  const removeToken = useRemoveGitHubToken();
  const toggleSync = useToggleSync();

  const handleSave = async () => {
    setError('');
    try {
      await saveToken.mutateAsync(tokenInput);
      setTokenInput('');
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleRemove = () => {
    removeToken.mutate();
  };

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 mb-6">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-500 mb-3">GitHub Connection</h3>

      {!tokenInfo?.hasToken ? (
        <div className="space-y-3">
          <p className="text-sm text-neutral-400">
            Paste a GitHub Personal Access Token to connect.{' '}
            <a href="https://github.com/settings/tokens" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">
              Create one here
            </a>
            {' '}(no special scopes needed for public repos).
          </p>
          <form onSubmit={(e) => { e.preventDefault(); handleSave(); }} className="flex gap-2">
            <input
              type="password"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
              className="flex-1 bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-neutral-600"
            />
            <button
              type="submit"
              disabled={!tokenInput || saveToken.isPending}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-500 disabled:opacity-50 transition-colors"
            >
              {saveToken.isPending ? 'Saving...' : 'Save Token'}
            </button>
          </form>
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm text-green-400">Connected</span>
            {tokenInfo.username && (
              <span className="text-sm text-neutral-300">@{tokenInfo.username}</span>
            )}
            <code className="text-xs text-neutral-500 bg-neutral-800 px-2 py-0.5 rounded">{tokenInfo.hint}</code>
            {tokenInfo.rateLimit && (
              <span className="text-xs text-neutral-500">
                {tokenInfo.rateLimit.remaining}/{tokenInfo.rateLimit.limit} API calls remaining
              </span>
            )}
            <button onClick={handleRemove} className="text-xs text-red-400 hover:text-red-300 ml-auto">
              Remove
            </button>
          </div>

          {/* Auto-sync toggle */}
          <div className="flex items-center gap-3 pt-2 border-t border-neutral-800">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={syncStatus?.enabled || false}
                onChange={(e) => toggleSync.mutate(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm text-neutral-300">Auto-import new stars</span>
            </label>
            {syncStatus?.enabled && syncStatus?.lastCheck && (
              <span className="text-xs text-neutral-500">
                Last checked: {new Date(syncStatus.lastCheck).toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// --- Reprocess Section ---

function ReprocessSection() {
  const [jobId, setJobId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');

  const activeJob = useActiveJob('reprocess');
  const jobStatus = useJobStatus(jobId, !!jobId);
  const startJob = useStartJob();
  const cancelJob = useCancelJob();

  // Seed jobId from active job on mount
  useEffect(() => {
    if (activeJob.data?.active && activeJob.data?.id) {
      setJobId(activeJob.data.id);
    }
  }, [activeJob.data]);

  // Derive reprocess state from hook data
  const reprocess = jobStatus.data ?? (activeJob.data?.active ? activeJob.data : null);

  const handleStart = async () => {
    setError('');
    setConfirming(false);
    try {
      const { jobId: newJobId } = await startJob.mutateAsync({ type: 'reprocess' });
      setJobId(newJobId);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleCancel = () => {
    if (!jobId) return;
    cancelJob.mutate(jobId);
  };

  const isDone = reprocess && reprocess.status !== 'running';
  const isRunning = reprocess && reprocess.status === 'running';

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 mt-6">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-500 mb-3">Re-embed All Memories</h3>

      {!reprocess || isDone ? (
        <div className="space-y-3">
          <p className="text-xs text-neutral-500">
            Re-chunk and re-embed all existing memories with the current embedding model. Use this after changing embedding models or chunk settings. This will rebuild the entire search index.
          </p>

          {isDone && (
            <div className={`text-xs px-3 py-2 rounded-lg ${
              reprocess.status === 'completed' ? 'bg-green-900/30 text-green-400' :
              reprocess.status === 'cancelled' ? 'bg-yellow-900/30 text-yellow-400' :
              'bg-red-900/30 text-red-400'
            }`}>
              {reprocess.status === 'completed'
                ? `Completed: ${reprocess.completed - reprocess.skipped - reprocess.failed} re-embedded, ${reprocess.skipped} skipped, ${reprocess.failed} failed`
                : reprocess.status === 'cancelled' ? `Cancelled at ${reprocess.completed}/${reprocess.total}`
                : `Failed: ${reprocess.error || 'Unknown error'}`}
            </div>
          )}

          {error && <p className="text-xs text-red-400">{error}</p>}

          {!confirming ? (
            <button
              onClick={() => setConfirming(true)}
              className="px-4 py-2 bg-neutral-800 text-neutral-300 text-sm rounded-lg hover:bg-neutral-700 border border-neutral-700 transition-colors"
            >
              Reprocess All Memories
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs text-yellow-400">This will rebuild the search index. Continue?</span>
              <button onClick={handleStart} className="px-3 py-1.5 bg-yellow-600 text-white text-xs rounded-lg hover:bg-yellow-500">
                Yes, reprocess
              </button>
              <button onClick={() => setConfirming(false)} className="px-3 py-1.5 text-neutral-400 text-xs hover:text-neutral-200">
                Cancel
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-neutral-300">Reprocessing...</span>
            <button onClick={handleCancel} className="text-xs text-red-400 hover:text-red-300 border border-red-800 px-3 py-1 rounded-lg">
              Cancel
            </button>
          </div>

          <div className="w-full bg-neutral-800 rounded-full h-2">
            <div
              className="h-2 rounded-full bg-blue-500 transition-all duration-300"
              style={{ width: `${reprocess.total > 0 ? (reprocess.completed / reprocess.total) * 100 : 0}%` }}
            />
          </div>

          <div className="flex gap-4 text-xs text-neutral-400">
            <span>{reprocess.completed} / {reprocess.total} memories</span>
            {reprocess.failed > 0 && <span className="text-red-400">{reprocess.failed} failed</span>}
          </div>

          {reprocess.currentItem && (
            <p className="text-xs text-neutral-500 truncate">
              Current: <span className="text-neutral-400">{reprocess.currentItem}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// --- Main Import Page ---

export function Import() {
  // Discovery state (local UI state)
  const [username, setUsername] = useState('');
  const [discovering, setDiscovering] = useState(false);
  const [repos, setRepos] = useState<RepoInfo[] | null>(null);
  const [discoverMeta, setDiscoverMeta] = useState<{ privateExcluded: number; rateLimit: any } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importError, setImportError] = useState('');

  // Job tracking state
  const [jobId, setJobId] = useState<string | null>(null);

  // Hooks for data fetching
  const { data: tokenInfo } = useGitHubToken();
  const activeJob = useActiveJob('github-import');
  const jobStatus = useJobStatus(jobId, !!jobId);
  const discoverStars = useDiscoverGitHubStars();
  const startJob = useStartJob();
  const cancelJob = useCancelJob();

  // Set username from token info
  useEffect(() => {
    if (tokenInfo?.username) setUsername(tokenInfo.username);
  }, [tokenInfo]);

  // Seed jobId from active job on mount
  useEffect(() => {
    if (activeJob.data?.active && activeJob.data?.id) {
      setJobId(activeJob.data.id);
    }
  }, [activeJob.data]);

  // Derive progress from hook data
  const progress: ProgressState | null = (() => {
    const data = jobStatus.data ?? (activeJob.data?.active ? activeJob.data : null);
    if (!data) return null;
    const id = jobId ?? activeJob.data?.id;
    if (!id) return null;
    return {
      jobId: id,
      status: data.status,
      completed: data.completed,
      total: data.total,
      skipped: data.skipped,
      failed: data.failed,
      currentItem: data.currentItem,
      results: data.results || [],
    };
  })();

  // --- Actions ---

  const handleDiscover = async () => {
    if (!username) return;
    setDiscovering(true);
    setRepos(null);
    setImportError('');
    try {
      const result = await discoverStars.mutateAsync({ username });
      setRepos(result.repos);
      setDiscoverMeta({ privateExcluded: result.privateExcluded, rateLimit: result.rateLimit });
      const newRepos = new Set<string>(result.repos.filter((r: RepoInfo) => !r.alreadyImported).map((r: RepoInfo) => r.url));
      setSelected(newRepos);
    } catch (err: any) {
      setImportError(err.message);
    } finally {
      setDiscovering(false);
    }
  };

  const handleStartImport = async () => {
    const repoUrls = Array.from(selected);
    if (repoUrls.length === 0) return;
    setImportError('');

    try {
      const { jobId: newJobId } = await startJob.mutateAsync({ type: 'github-import', payload: { repos: repoUrls } });
      setJobId(newJobId);
    } catch (err: any) {
      setImportError(err.message);
    }
  };

  const handleCancel = () => {
    if (!progress?.jobId) return;
    cancelJob.mutate(progress.jobId);
  };

  const handleReset = () => {
    setJobId(null);
    setRepos(null);
    setSelected(new Set());
  };

  // --- Computed ---
  const newCount = repos?.filter((r) => !r.alreadyImported).length || 0;
  const importedCount = repos?.filter((r) => r.alreadyImported).length || 0;
  const isDone = progress && progress.status !== 'running';
  const isCancelled = progress?.status === 'cancelled';

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold mb-1">Import</h1>
      <p className="text-sm text-neutral-500 mb-6">Import your GitHub starred repositories into Memory Box</p>

      <ImportTabs />

      <GitHubSettings />

      {importError && (
        <div className="bg-red-900/30 border border-red-800 rounded-lg px-4 py-3 mb-4 text-sm text-red-400">
          {importError}
        </div>
      )}

      {/* Progress View — shown whenever there's an active or completed job */}
      {progress ? (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-neutral-300">
              {isDone
                ? isCancelled ? 'Import Cancelled' : progress.status === 'failed' ? 'Import Failed' : 'Import Complete'
                : 'Importing...'}
            </h3>
            {!isDone && (
              <button onClick={handleCancel} className="text-xs text-red-400 hover:text-red-300 border border-red-800 px-3 py-1 rounded-lg">
                Cancel
              </button>
            )}
            {isDone && (
              <button onClick={handleReset} className="text-xs text-neutral-400 hover:text-neutral-200 border border-neutral-700 px-3 py-1 rounded-lg">
                New Import
              </button>
            )}
          </div>

          {/* Progress bar */}
          <div className="w-full bg-neutral-800 rounded-full h-2 mb-3">
            <div
              className={`h-2 rounded-full transition-all duration-300 ${
                isDone
                  ? isCancelled ? 'bg-yellow-500' : progress.status === 'failed' ? 'bg-red-500' : 'bg-green-500'
                  : 'bg-blue-500'
              }`}
              style={{ width: `${progress.total > 0 ? (progress.completed / progress.total) * 100 : 0}%` }}
            />
          </div>

          {/* Stats */}
          <div className="flex gap-4 text-xs text-neutral-400 mb-3">
            <span>{progress.completed} / {progress.total} processed</span>
            {progress.completed - progress.skipped - progress.failed > 0 && (
              <span className="text-green-400">{progress.completed - progress.skipped - progress.failed} imported</span>
            )}
            {progress.skipped > 0 && <span className="text-neutral-500">{progress.skipped} skipped</span>}
            {progress.failed > 0 && <span className="text-red-400">{progress.failed} failed</span>}
          </div>

          {/* Current repo */}
          {progress.currentItem && !isDone && (
            <p className="text-xs text-neutral-500 mb-3 truncate">
              Processing: <span className="text-neutral-400">{progress.currentItem.replace('https://github.com/', '')}</span>
            </p>
          )}

          {/* Results list */}
          {progress.results.length > 0 && (
            <div className="max-h-60 overflow-y-auto space-y-1 mt-3 pt-3 border-t border-neutral-800">
              {[...progress.results].reverse().map((r, i) => (
                <div key={i}>
                  <div className="flex items-center gap-2 text-xs">
                    <span className={
                      r.status === 'imported' ? 'text-green-400' :
                      r.status === 'skipped' ? 'text-neutral-500' : 'text-red-400'
                    }>
                      {r.status === 'imported' ? '+' : r.status === 'skipped' ? '-' : '!'}
                    </span>
                    <span className="text-neutral-400 truncate">{r.repo.replace('https://github.com/', '')}</span>
                    <span className="text-neutral-600 ml-auto flex-shrink-0">{r.status}</span>
                  </div>
                  {r.error && (
                    <p className="text-[10px] text-red-400/70 ml-5 mt-0.5 truncate" title={r.error}>
                      {r.error}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {isDone && !isCancelled && progress.status !== 'failed' && (
            <div className="mt-4 pt-3 border-t border-neutral-800">
              <a href="/memories" className="text-sm text-blue-400 hover:text-blue-300">
                View imported memories &rarr;
              </a>
            </div>
          )}
        </div>
      ) : (
        /* Discovery & Selection View */
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
          <div className="flex gap-2 mb-4">
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleDiscover()}
              placeholder="GitHub username"
              className="flex-1 bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-neutral-600"
            />
            <button
              onClick={handleDiscover}
              disabled={!username || discovering}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-500 disabled:opacity-50 transition-colors"
            >
              {discovering ? 'Discovering...' : 'Discover Stars'}
            </button>
          </div>

          {repos && (
            <>
              <div className="text-sm text-neutral-400 mb-3 flex flex-wrap gap-x-3">
                <span>{repos.length} public stars</span>
                <span className="text-green-400">{importedCount} already imported</span>
                <span>{newCount} new</span>
                {discoverMeta && discoverMeta.privateExcluded > 0 && (
                  <span className="text-neutral-500">{discoverMeta.privateExcluded} private excluded</span>
                )}
              </div>

              {newCount > 0 && (
                <div className="flex items-center gap-2 mb-3">
                  <button
                    onClick={() => setSelected(new Set<string>(repos.filter((r) => !r.alreadyImported).map((r) => r.url)))}
                    className="text-xs text-blue-400 hover:text-blue-300"
                  >
                    Select All New
                  </button>
                  <span className="text-neutral-700">|</span>
                  <button
                    onClick={() => setSelected(new Set())}
                    className="text-xs text-neutral-500 hover:text-neutral-300"
                  >
                    Deselect All
                  </button>
                  <button
                    onClick={handleStartImport}
                    disabled={selected.size === 0}
                    className="ml-auto px-4 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-500 disabled:opacity-50 transition-colors"
                  >
                    Import Selected ({selected.size})
                  </button>
                </div>
              )}

              <div className="max-h-96 overflow-y-auto space-y-1">
                {repos.map((repo) => (
                  <label
                    key={repo.url}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                      repo.alreadyImported
                        ? 'opacity-60'
                        : selected.has(repo.url)
                          ? 'bg-neutral-800/70'
                          : 'hover:bg-neutral-800/40'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={repo.alreadyImported || selected.has(repo.url)}
                      disabled={repo.alreadyImported}
                      onChange={(e) => {
                        const next = new Set(selected);
                        if (e.target.checked) next.add(repo.url);
                        else next.delete(repo.url);
                        setSelected(next);
                      }}
                      className="rounded flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-neutral-200 truncate">{repo.fullName}</span>
                        {repo.language && (
                          <span className="text-[10px] text-neutral-500 flex-shrink-0">{repo.language}</span>
                        )}
                        <span className="text-[10px] text-neutral-600 flex-shrink-0">{repo.stars.toLocaleString()}</span>
                        {repo.alreadyImported && (
                          <span className="text-[10px] text-green-500 flex-shrink-0">imported</span>
                        )}
                      </div>
                      {repo.description && (
                        <p className="text-xs text-neutral-500 truncate">{repo.description}</p>
                      )}
                    </div>
                  </label>
                ))}
              </div>

              {repos.length === 0 && (
                <p className="text-sm text-neutral-500 text-center py-4">No public starred repos found.</p>
              )}
            </>
          )}
        </div>
      )}

      <ReprocessSection />
    </div>
  );
}
