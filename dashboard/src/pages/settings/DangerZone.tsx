import { useState } from 'react';
import { useStats } from '../../hooks/queries';
import { api } from '../../api';
import { useQueryClient } from '@tanstack/react-query';

export function DangerZone() {
  const { data: stats } = useStats();
  const qc = useQueryClient();
  const [confirmText, setConfirmText] = useState('');
  const [status, setStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const memoryCount = stats?.memories ?? 0;
  const confirmPhrase = 'delete all memories';
  const confirmed = confirmText.toLowerCase() === confirmPhrase;

  const handleClearAll = async () => {
    if (!confirmed) return;
    setIsDeleting(true);
    setStatus(null);
    try {
      await api.clearAllMemories();
      qc.invalidateQueries({ queryKey: ['memories'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
      setStatus({ type: 'success', text: 'All memories have been deleted.' });
      setConfirmText('');
    } catch (e: any) {
      setStatus({ type: 'error', text: e.message || 'Failed to delete memories.' });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-red-400 mb-1">Danger Zone</h2>
        <p className="text-sm text-neutral-500">Irreversible actions that affect all your data</p>
      </div>

      {status && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm ${
          status.type === 'success' ? 'bg-green-950 border border-green-800 text-green-400' : 'bg-red-950 border border-red-800 text-red-400'
        }`}>
          {status.text}
        </div>
      )}

      <section className="border border-red-900/50 rounded-lg p-5">
        <h3 className="text-sm font-medium text-neutral-200 mb-1">Clear all memories</h3>
        <p className="text-xs text-neutral-500 mb-4">
          Permanently delete all {memoryCount > 0 ? <span className="text-neutral-300">{memoryCount}</span> : ''} memories, including files and embeddings. This cannot be undone.
        </p>
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="block text-xs text-neutral-500 mb-1.5">
              Type <span className="font-mono text-neutral-400">{confirmPhrase}</span> to confirm
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={confirmPhrase}
              className="w-full bg-neutral-950 border-[1.5px] border-neutral-600 rounded-lg px-4 py-2 text-sm text-neutral-200 placeholder-neutral-700 focus:outline-none focus:border-red-800"
            />
          </div>
          <button
            onClick={handleClearAll}
            disabled={!confirmed || isDeleting}
            className="shrink-0 px-4 py-2 rounded-lg text-sm font-medium border border-red-800 text-red-400 hover:bg-red-950 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            {isDeleting ? 'Deleting...' : 'Delete all'}
          </button>
        </div>
      </section>
    </div>
  );
}
