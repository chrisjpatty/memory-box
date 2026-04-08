import { useState, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useActiveJobs, useJobHistory, useCancelJob, queryKeys } from '../hooks/queries';

interface Job {
  id: string;
  type: string;
  status: string;
  payload: any;
  total: number;
  completed: number;
  skipped: number;
  failed: number;
  currentItem: string;
  results: any[];
  error: string | null;
  startedAt: string;
  completedAt: string | null;
}

const TYPE_LABELS: Record<string, string> = {
  'github-import': 'GitHub Import',
  'reprocess': 'Reprocess',
  'github-sync': 'GitHub Sync',
};

const STATUS_STYLES: Record<string, string> = {
  running: 'bg-blue-900/40 text-blue-400 border-blue-800',
  completed: 'bg-green-900/40 text-green-400 border-green-800',
  cancelled: 'bg-yellow-900/40 text-yellow-400 border-yellow-800',
  failed: 'bg-red-900/40 text-red-400 border-red-800',
  pending: 'bg-neutral-800 text-neutral-400 border-neutral-700',
};

const PROGRESS_COLORS: Record<string, string> = {
  running: 'bg-blue-500',
  completed: 'bg-green-500',
  cancelled: 'bg-yellow-500',
  failed: 'bg-red-500',
};

function formatDuration(start: string, end: string | null): string {
  const startTime = new Date(start).getTime();
  const endTime = end ? new Date(end).getTime() : Date.now();
  const seconds = Math.floor((endTime - startTime) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remaining}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Yesterday ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: 'short' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// --- Active Job Card ---

function ActiveJobCard({ job, onCancel }: { job: Job; onCancel: (id: string) => void }) {
  const pct = job.total > 0 ? (job.completed / job.total) * 100 : 0;
  const imported = job.completed - job.skipped - job.failed;

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-medium px-2 py-0.5 rounded border ${STATUS_STYLES[job.status] || STATUS_STYLES.pending}`}>
            {job.status}
          </span>
          <span className="text-sm font-medium text-neutral-200">
            {TYPE_LABELS[job.type] || job.type}
          </span>
          <span className="text-xs text-neutral-600">
            {formatDuration(job.startedAt, null)}
          </span>
        </div>
        <button
          onClick={() => onCancel(job.id)}
          className="text-xs text-red-400 hover:text-red-300 border border-red-800 px-3 py-1 rounded-lg transition-colors"
        >
          Cancel
        </button>
      </div>

      <div className="w-full bg-neutral-800 rounded-full h-2 mb-3">
        <div
          className={`h-2 rounded-full transition-all duration-300 ${PROGRESS_COLORS[job.status] || 'bg-blue-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="flex gap-4 text-xs text-neutral-400 mb-2">
        <span>{job.completed} / {job.total} processed</span>
        {imported > 0 && <span className="text-green-400">{imported} imported</span>}
        {job.skipped > 0 && <span className="text-neutral-500">{job.skipped} skipped</span>}
        {job.failed > 0 && <span className="text-red-400">{job.failed} failed</span>}
      </div>

      {job.currentItem && (
        <p className="text-xs text-neutral-500 truncate">
          Current: <span className="text-neutral-400">{job.currentItem}</span>
        </p>
      )}
    </div>
  );
}

// --- Job History Row ---

function summarizeJob(job: Job): string {
  const imported = job.completed - job.skipped - job.failed;
  if (job.status === 'cancelled') return `Cancelled at ${job.completed}/${job.total}`;
  if (job.status === 'failed' && job.error) return 'Failed';
  if (imported === 0 && job.failed === 0) return 'Nothing new';
  const parts: string[] = [];
  if (imported > 0) parts.push(`${imported} imported`);
  if (job.failed > 0) parts.push(`${job.failed} failed`);
  return parts.join(', ');
}

function JobHistoryRow({ job }: { job: Job }) {
  const [expanded, setExpanded] = useState(false);
  const imported = job.completed - job.skipped - job.failed;
  const summary = summarizeJob(job);
  const isNoop = imported === 0 && job.failed === 0 && job.status === 'completed';

  return (
    <div className="border-b border-neutral-800 last:border-b-0">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-neutral-800/30 transition-colors text-left"
      >
        <span className={`text-[10px] font-medium px-2 py-0.5 rounded border flex-shrink-0 ${STATUS_STYLES[job.status] || STATUS_STYLES.pending}`}>
          {job.status}
        </span>
        <span className="text-sm text-neutral-200 flex-shrink-0">
          {TYPE_LABELS[job.type] || job.type}
        </span>
        <span className={`text-xs flex-shrink-0 ${isNoop ? 'text-neutral-600' : imported > 0 ? 'text-neutral-400' : 'text-neutral-500'}`}>
          {summary}
        </span>

        <span className="text-xs text-neutral-600 flex-shrink-0 ml-auto">
          {formatDuration(job.startedAt, job.completedAt)}
        </span>
        <span className="text-xs text-neutral-600 flex-shrink-0 w-32 text-right">
          {formatTime(job.startedAt)}
        </span>
        <span className="text-neutral-600 text-xs flex-shrink-0">{expanded ? '\u25B2' : '\u25BC'}</span>
      </button>

      {expanded && (
        <div className="px-4 pt-3 pb-3 space-y-2 bg-neutral-950/50">
          <div className="flex gap-4 text-xs text-neutral-400">
            <span className="text-neutral-500">Checked {job.total} items</span>
            {imported > 0 && <span className="text-green-400">{imported} imported</span>}
            {job.skipped > 0 && <span className="text-neutral-600">{job.skipped} already existed</span>}
            {job.failed > 0 && <span className="text-red-400">{job.failed} failed</span>}
          </div>

          {job.error && (
            <p className="text-xs text-red-400 bg-red-900/20 rounded px-3 py-2">{job.error}</p>
          )}

          {job.results.length > 0 && (
            <div className="max-h-40 overflow-y-auto space-y-0.5">
              {job.results.map((r: any, i: number) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className={
                    r.status === 'imported' ? 'text-green-400' :
                    r.status === 'skipped' ? 'text-neutral-500' : 'text-red-400'
                  }>
                    {r.status === 'imported' ? '+' : r.status === 'skipped' ? '-' : '!'}
                  </span>
                  <span className="text-neutral-400 truncate">{(r.repo || r.item || '').replace('https://github.com/', '')}</span>
                  <span className="text-neutral-600 ml-auto flex-shrink-0">{r.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// --- Main Page ---

export function Jobs() {
  const qc = useQueryClient();

  const activeJobsQuery = useActiveJobs();
  const jobHistoryQuery = useJobHistory();
  const cancelJobMutation = useCancelJob();

  const activeJobs: Job[] = activeJobsQuery.data?.jobs ?? [];
  const history: Job[] = jobHistoryQuery.data?.jobs ?? [];
  const historyTotal: number = jobHistoryQuery.data?.total ?? 0;
  const loading = activeJobsQuery.isLoading || jobHistoryQuery.isLoading;

  // Track previous active jobs count to detect when jobs complete naturally
  const prevActiveCountRef = useRef<number>(activeJobs.length);
  useEffect(() => {
    const prevCount = prevActiveCountRef.current;
    prevActiveCountRef.current = activeJobs.length;

    // If active count dropped, a job completed — refresh history
    if (prevCount > 0 && activeJobs.length < prevCount) {
      qc.invalidateQueries({ queryKey: queryKeys.jobHistory });
    }
  }, [activeJobs.length, qc]);

  const handleCancel = (jobId: string) => {
    cancelJobMutation.mutate(jobId);
  };

  if (loading) {
    return (
      <div className="max-w-3xl">
        <h1 className="text-2xl font-bold mb-1">Jobs</h1>
        <p className="text-sm text-neutral-500 mb-6">Loading...</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold mb-1">Jobs</h1>
      <p className="text-sm text-neutral-500 mb-6">Background tasks: imports, reprocessing, and sync</p>

      {/* Active Jobs */}
      <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-500 mb-3">Active</h3>

      {activeJobs.length === 0 ? (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 mb-6">
          <p className="text-sm text-neutral-500 text-center">No active jobs</p>
        </div>
      ) : (
        <div className="space-y-3 mb-6">
          {activeJobs.map((job) => (
            <ActiveJobCard key={job.id} job={job} onCancel={handleCancel} />
          ))}
        </div>
      )}

      {/* Job History */}
      <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-500 mb-3">
        History
        {historyTotal > 0 && <span className="text-neutral-600 font-normal ml-2">({historyTotal})</span>}
      </h3>

      {history.length === 0 ? (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
          <p className="text-sm text-neutral-500 text-center">No job history</p>
        </div>
      ) : (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
          {history.filter((j) => j.status !== 'running').map((job) => (
            <JobHistoryRow key={job.id} job={job} />
          ))}
          {history.filter((j) => j.status !== 'running').length === 0 && (
            <p className="text-sm text-neutral-500 text-center py-4">No completed jobs yet</p>
          )}
        </div>
      )}
    </div>
  );
}
