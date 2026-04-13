import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  useTwitterStatus,
  useSaveTwitterCredentials,
  useDisconnectTwitter,
  useGetTwitterAuthUrl,
  useDiscoverTwitterBookmarks,
  useUploadTwitterExport,
  useActiveJob,
  useJobStatus,
  useStartJob,
  useCancelJob,
  queryKeys,
} from '../hooks/queries';
import { ImportTabs } from '../components/ImportTabs';

interface BookmarkInfo {
  id: string;
  url: string;
  text: string;
  authorName: string;
  authorUsername: string;
  createdAt: string;
  metrics: { likes: number; retweets: number; replies: number; bookmarks: number };
  hasMedia: boolean;
  alreadyImported: boolean;
  existingMemoryId?: string;
}

interface BookmarkFolder {
  id: string;
  name: string;
}

interface JobResult {
  tweet: string;
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

// --- Twitter Connection Section ---

function TwitterConnection() {
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [error, setError] = useState('');

  const { data: status } = useTwitterStatus();
  const saveCredentials = useSaveTwitterCredentials();
  const getAuthUrl = useGetTwitterAuthUrl();
  const disconnect = useDisconnectTwitter();

  const callbackUrl = `${window.location.origin}/api/import/twitter/callback`;

  const handleSaveCredentials = async () => {
    setError('');
    try {
      await saveCredentials.mutateAsync({ clientId, clientSecret });
      setClientId('');
      setClientSecret('');
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleAuthorize = async () => {
    setError('');
    try {
      const { url } = await getAuthUrl.mutateAsync();
      window.location.href = url;
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDisconnect = async () => {
    await disconnect.mutateAsync();
  };

  const saving = saveCredentials.isPending;
  const authorizing = getAuthUrl.isPending;

  // --- Connected ---
  if (status?.hasToken) {
    return (
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 mb-6">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-500 mb-3">Twitter Connection</h3>
        <div className="flex items-center gap-3">
          <span className="text-sm text-green-400">Connected</span>
          {status.username && (
            <span className="text-sm text-neutral-300">@{status.username}</span>
          )}
          <button onClick={handleDisconnect} className="text-xs text-red-400 hover:text-red-300 ml-auto">
            Disconnect
          </button>
        </div>
      </div>
    );
  }

  // --- Credentials saved, needs authorization ---
  if (status?.hasCredentials) {
    return (
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 mb-6">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-500 mb-3">Twitter Connection</h3>
        <div className="space-y-3">
          <p className="text-sm text-neutral-400">
            Credentials saved. Click below to authorize Memory Box to read your bookmarks.
          </p>
          <button
            onClick={handleAuthorize}
            disabled={authorizing}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-500 disabled:opacity-50 transition-colors"
          >
            {authorizing ? 'Redirecting...' : 'Authorize with Twitter'}
          </button>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button onClick={handleDisconnect} className="block text-xs text-neutral-500 hover:text-neutral-300">
            Reset credentials
          </button>
        </div>
      </div>
    );
  }

  // --- No credentials — show setup instructions ---
  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 mb-6">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-500 mb-3">Twitter Connection</h3>
      <div className="space-y-4">
        <div className="text-sm text-neutral-400 space-y-3">
          <p className="font-medium text-neutral-300">Setup (one-time)</p>
          <ol className="list-decimal list-inside space-y-2 text-neutral-400">
            <li>
              Go to{' '}
              <a
                href="https://developer.x.com/en/portal/dashboard"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300"
              >
                developer.x.com
              </a>{' '}
              and create a project &amp; app{' '}
              <span className="text-neutral-500">(Basic plan or higher required for bookmark access)</span>
            </li>
            <li>
              In your app settings, click <strong className="text-neutral-300">Set up</strong> under
              {' '}<strong className="text-neutral-300">User authentication settings</strong>
            </li>
            <li>
              Set <strong className="text-neutral-300">App permissions</strong> to <strong className="text-neutral-300">Read</strong>,{' '}
              type to <strong className="text-neutral-300">Web App</strong>, and add this callback URL:
              <code className="block mt-1 px-3 py-1.5 bg-neutral-800 rounded text-xs text-neutral-300 select-all break-all">
                {callbackUrl}
              </code>
            </li>
            <li>
              Copy the <strong className="text-neutral-300">Consumer Key</strong> and{' '}
              <strong className="text-neutral-300">Consumer Secret</strong> from your app's Keys and Tokens page
            </li>
          </ol>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); handleSaveCredentials(); }} className="space-y-2">
          <input
            type="text"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder="Consumer Key"
            className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-neutral-600"
          />
          <input
            type="password"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            placeholder="Consumer Secret"
            className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-neutral-600"
          />
          <button
            type="submit"
            disabled={!clientId || !clientSecret || saving}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-500 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving...' : 'Save Credentials'}
          </button>
        </form>
        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>
    </div>
  );
}

// --- Main Twitter Import Page ---

export function ImportTwitter() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  // Connection status via React Query
  const { data: status } = useTwitterStatus();

  // Discovery state
  const [bookmarks, setBookmarks] = useState<BookmarkInfo[] | null>(null);
  const [folders, setFolders] = useState<BookmarkFolder[]>([]);
  const [activeFolder, setActiveFolder] = useState<string | undefined>(undefined);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [idsOnly, setIdsOnly] = useState(false);
  const [warning, setWarning] = useState('');

  // Import state
  const [importError, setImportError] = useState('');

  // Job tracking: local jobId set from activeJob query or startJob mutation
  const [jobId, setJobId] = useState<string | null>(null);

  // Mutations
  const discoverMutation = useDiscoverTwitterBookmarks();
  const uploadMutation = useUploadTwitterExport();
  const startJobMutation = useStartJob();
  const cancelJobMutation = useCancelJob();

  // Active job query - check on mount if there's already a running import
  const activeJobQuery = useActiveJob('twitter-import');

  // When activeJob data arrives, seed jobId
  useEffect(() => {
    const data = activeJobQuery.data;
    if (data?.active && data.id) {
      setJobId(data.id);
    }
  }, [activeJobQuery.data]);

  // Job status with auto-polling while running
  const jobStatusQuery = useJobStatus(jobId, !!jobId);

  // Derive progress from jobStatusQuery or activeJobQuery
  const progress: ProgressState | null = (() => {
    const data = jobStatusQuery.data;
    if (data && jobId) {
      return {
        jobId,
        status: data.status,
        completed: data.completed,
        total: data.total,
        skipped: data.skipped,
        failed: data.failed,
        currentItem: data.currentItem,
        results: data.results || [],
      };
    }
    // Fall back to activeJob data while jobStatus hasn't loaded yet
    const active = activeJobQuery.data;
    if (active?.active && active.id && jobId) {
      return {
        jobId: active.id,
        status: active.status,
        completed: active.completed,
        total: active.total,
        skipped: active.skipped,
        failed: active.failed,
        currentItem: active.currentItem,
        results: active.results || [],
      };
    }
    return null;
  })();

  // Handle OAuth callback query params
  useEffect(() => {
    const connected = searchParams.get('connected');
    const error = searchParams.get('error');
    if (connected) {
      queryClient.invalidateQueries({ queryKey: queryKeys.twitterStatus });
      // Clean up URL params
      setSearchParams({}, { replace: true });
    }
    if (error) {
      setImportError(`Twitter authorization failed: ${error}`);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams, queryClient]);

  // Derived flags
  const discovering = discoverMutation.isPending;
  const uploading = uploadMutation.isPending;

  // --- Actions ---

  function applyDiscoverResult(result: any, folderId?: string) {
    setBookmarks(result.bookmarks);
    setIdsOnly(!!result.idsOnly);
    setWarning(result.warning || '');
    if (result.folders?.length > 0 && !folderId) {
      setFolders(result.folders);
    }
    const newTweets = new Set<string>(
      result.bookmarks
        .filter((b: BookmarkInfo) => !b.alreadyImported)
        .map((b: BookmarkInfo) => b.url),
    );
    setSelected(newTweets);
  }

  const handleDiscover = async (folderId?: string) => {
    setBookmarks(null);
    setImportError('');
    setWarning('');
    setActiveFolder(folderId);
    try {
      const result = await discoverMutation.mutateAsync(folderId);
      applyDiscoverResult(result, folderId);
    } catch (err: any) {
      setImportError(err.message);
    }
  };

  const handleUpload = async (file: File) => {
    setBookmarks(null);
    setImportError('');
    setWarning('');
    setActiveFolder(undefined);
    try {
      const result = await uploadMutation.mutateAsync(file);
      applyDiscoverResult(result);
    } catch (err: any) {
      setImportError(err.message);
    }
  };

  const handleStartImport = async () => {
    const tweetUrls = Array.from(selected);
    if (tweetUrls.length === 0) return;
    setImportError('');

    try {
      const { jobId: newJobId } = await startJobMutation.mutateAsync({
        type: 'twitter-import',
        payload: { tweets: tweetUrls },
      });
      setJobId(newJobId);
    } catch (err: any) {
      setImportError(err.message);
    }
  };

  const handleCancel = async () => {
    if (!progress?.jobId) return;
    try {
      await cancelJobMutation.mutateAsync(progress.jobId);
    } catch { /* jobStatus polling will pick up the state change */ }
  };

  const handleReset = () => {
    setJobId(null);
    setBookmarks(null);
    setSelected(new Set());
    setActiveFolder(undefined);
    setWarning('');
    setIdsOnly(false);
  };

  // --- Computed ---
  const newCount = bookmarks?.filter((b) => !b.alreadyImported).length || 0;
  const importedCount = bookmarks?.filter((b) => b.alreadyImported).length || 0;
  const isDone = progress && progress.status !== 'running';
  const isCancelled = progress?.status === 'cancelled';

  const shortUrl = (url: string) => {
    try {
      return url.replace(/^https:\/\/(x\.com|twitter\.com)\//, '@').replace(/\/status\//, '/');
    } catch {
      return url;
    }
  };

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold mb-1">Import</h1>
      <p className="text-sm text-neutral-500 mb-6">Import your Twitter/X bookmarks into Memory Box</p>

      <ImportTabs />

      <TwitterConnection />

      {importError && (
        <div className="bg-red-900/30 border border-red-800 rounded-lg px-4 py-3 mb-4 text-sm text-red-400">
          {importError}
        </div>
      )}

      {warning && (
        <div className="bg-yellow-900/30 border border-yellow-800 rounded-lg px-4 py-3 mb-4 text-sm text-yellow-400">
          {warning}
        </div>
      )}

      {/* Progress View */}
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

          <div className="flex gap-4 text-xs text-neutral-400 mb-3">
            <span>{progress.completed} / {progress.total} processed</span>
            {progress.completed - progress.skipped - progress.failed > 0 && (
              <span className="text-green-400">{progress.completed - progress.skipped - progress.failed} imported</span>
            )}
            {progress.skipped > 0 && <span className="text-neutral-500">{progress.skipped} skipped</span>}
            {progress.failed > 0 && <span className="text-red-400">{progress.failed} failed</span>}
          </div>

          {progress.currentItem && !isDone && (
            <p className="text-xs text-neutral-500 mb-3 truncate">
              Processing: <span className="text-neutral-400">{shortUrl(progress.currentItem)}</span>
            </p>
          )}

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
                    <span className="text-neutral-400 truncate">{shortUrl(r.tweet)}</span>
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
          {!status?.hasToken ? (
            <div className="space-y-4 py-2">
              <p className="text-sm text-neutral-500 text-center">
                {status?.hasCredentials
                  ? 'Authorize with Twitter above to discover bookmarks.'
                  : 'Connect your Twitter account above to discover bookmarks via the API.'}
              </p>
              <div className="border-t border-neutral-800 pt-4">
                <p className="text-sm text-neutral-400 mb-2">
                  Or import from a <strong className="text-neutral-300">Twitter data export</strong>
                </p>
                <p className="text-xs text-neutral-500 mb-3">
                  Request your archive at{' '}
                  <span className="text-neutral-400">Settings &gt; Your Account &gt; Download an archive of your data</span>.
                  Upload the zip file to import all your bookmarks — no API key needed.
                </p>
                <label className={`inline-flex items-center gap-2 px-4 py-2 bg-neutral-800 text-neutral-200 text-sm rounded-lg hover:bg-neutral-700 border border-neutral-700 transition-colors cursor-pointer ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
                  <input
                    type="file"
                    accept=".zip"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleUpload(file);
                      e.target.value = '';
                    }}
                  />
                  {uploading ? 'Processing...' : 'Upload Twitter Export (.zip)'}
                </label>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-4">
                <button
                  onClick={() => handleDiscover(undefined)}
                  disabled={discovering || uploading}
                  className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-500 disabled:opacity-50 transition-colors"
                >
                  {discovering ? 'Discovering...' : 'Discover via API'}
                </button>
                <span className="text-neutral-600 text-xs">or</span>
                <label className={`inline-flex items-center gap-2 px-4 py-2 bg-neutral-800 text-neutral-300 text-sm rounded-lg hover:bg-neutral-700 border border-neutral-700 transition-colors cursor-pointer ${uploading || discovering ? 'opacity-50 pointer-events-none' : ''}`}>
                  <input
                    type="file"
                    accept=".zip"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleUpload(file);
                      e.target.value = '';
                    }}
                  />
                  {uploading ? 'Processing...' : 'Upload Export (.zip)'}
                </label>
              </div>

              {/* Folder tabs */}
              {folders.length > 0 && (
                <div className="flex gap-1 mb-4 flex-wrap">
                  <button
                    onClick={() => handleDiscover(undefined)}
                    disabled={discovering}
                    className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                      !activeFolder
                        ? 'bg-neutral-700 text-neutral-200'
                        : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800'
                    }`}
                  >
                    All Bookmarks
                  </button>
                  {folders.map((folder) => (
                    <button
                      key={folder.id}
                      onClick={() => handleDiscover(folder.id)}
                      disabled={discovering}
                      className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                        activeFolder === folder.id
                          ? 'bg-neutral-700 text-neutral-200'
                          : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800'
                      }`}
                    >
                      {folder.name}
                    </button>
                  ))}
                </div>
              )}

              {bookmarks && (
                <>
                  <div className="text-sm text-neutral-400 mb-3 flex flex-wrap gap-x-3">
                    <span>{bookmarks.length} bookmarks</span>
                    <span className="text-green-400">{importedCount} already imported</span>
                    <span>{newCount} new</span>
                  </div>

                  {bookmarks.length === 0 && (
                    <p className="text-sm text-neutral-500 text-center py-4">No bookmarks found.</p>
                  )}

                  {idsOnly ? (
                    /* Folder view: ID-only, no per-tweet detail */
                    newCount > 0 && (
                      <div className="space-y-3">
                        <p className="text-xs text-neutral-500">
                          Tweet details will be fetched during import.
                        </p>
                        <button
                          onClick={handleStartImport}
                          className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-500 transition-colors"
                        >
                          Import {newCount} New Bookmarks
                        </button>
                      </div>
                    )
                  ) : (
                    /* All bookmarks view: full detail with per-tweet selection */
                    <>
                      {newCount > 0 && (
                        <div className="flex items-center gap-2 mb-3">
                          <button
                            onClick={() => setSelected(new Set<string>(bookmarks.filter((b) => !b.alreadyImported).map((b) => b.url)))}
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
                        {bookmarks.map((bm) => (
                          <label
                            key={bm.id}
                            className={`flex items-start gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                              bm.alreadyImported
                                ? 'opacity-60'
                                : selected.has(bm.url)
                                  ? 'bg-neutral-800/70'
                                  : 'hover:bg-neutral-800/40'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={bm.alreadyImported || selected.has(bm.url)}
                              disabled={bm.alreadyImported}
                              onChange={(e) => {
                                const next = new Set(selected);
                                if (e.target.checked) next.add(bm.url);
                                else next.delete(bm.url);
                                setSelected(next);
                              }}
                              className="rounded flex-shrink-0 mt-1"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className="text-sm text-neutral-300 font-medium truncate">
                                  {bm.authorName || bm.authorUsername}
                                </span>
                                <span className="text-xs text-neutral-500 flex-shrink-0">
                                  @{bm.authorUsername}
                                </span>
                                {bm.createdAt && (
                                  <span className="text-[10px] text-neutral-600 flex-shrink-0">
                                    {new Date(bm.createdAt).toLocaleDateString()}
                                  </span>
                                )}
                                {bm.alreadyImported && (
                                  <span className="text-[10px] text-green-500 flex-shrink-0">imported</span>
                                )}
                              </div>
                              <p className="text-xs text-neutral-400 line-clamp-2">{bm.text}</p>
                              <div className="flex gap-3 mt-1 text-[10px] text-neutral-600">
                                {bm.metrics.likes > 0 && <span>{bm.metrics.likes.toLocaleString()} likes</span>}
                                {bm.metrics.retweets > 0 && <span>{bm.metrics.retweets.toLocaleString()} retweets</span>}
                                {bm.metrics.replies > 0 && <span>{bm.metrics.replies.toLocaleString()} replies</span>}
                                {bm.hasMedia && <span className="text-neutral-500">has media</span>}
                              </div>
                            </div>
                          </label>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
