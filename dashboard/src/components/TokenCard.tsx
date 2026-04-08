import { useState } from 'react';
import { useTokens, useCreateToken, useRevokeToken } from '../hooks/queries';

export function TokenCard() {
  const { data, isLoading } = useTokens();
  const createToken = useCreateToken();
  const revokeToken = useRevokeToken();

  const [name, setName] = useState('');
  const [revealedToken, setRevealedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const tokens = data?.tokens ?? [];

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setMessage(null);
    try {
      const r = await createToken.mutateAsync(trimmed);
      setRevealedToken(r.token);
      setName('');
      setMessage({ type: 'success', text: 'Token created. Copy it now — it won\'t be shown again.' });
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message });
    }
  };

  const handleRevoke = async (id: number, tokenName: string) => {
    if (!confirm(`Revoke token "${tokenName}"? It will stop working immediately.`)) return;
    setMessage(null);
    try {
      await revokeToken.mutateAsync(id);
      setRevealedToken(null);
      setMessage({ type: 'success', text: `Token "${tokenName}" revoked.` });
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message });
    }
  };

  const handleCopy = () => {
    if (revealedToken) {
      navigator.clipboard.writeText(revealedToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-4">API Tokens</h2>

      {message && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm ${
          message.type === 'success' ? 'bg-green-950 border border-green-800 text-green-400' : 'bg-red-950 border border-red-800 text-red-400'
        }`}>
          {message.text}
        </div>
      )}

      {revealedToken && (
        <div className="mb-4 flex items-center gap-3 bg-neutral-950 border border-green-800 rounded-lg px-4 py-3 font-mono text-sm">
          <span className="flex-1 break-all text-green-400">{revealedToken}</span>
          <button
            onClick={handleCopy}
            className={`shrink-0 px-3 py-1 rounded text-xs border transition-colors ${
              copied ? 'border-green-600 text-green-400' : 'border-neutral-700 text-neutral-400 hover:text-neutral-200'
            }`}
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      )}

      {/* Create form */}
      <div className="flex gap-3 mb-4">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          placeholder="Token name (e.g. CLI, CI/CD, Automation)"
          className="flex-1 bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2 text-sm text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-neutral-600"
        />
        <button
          onClick={handleCreate}
          disabled={!name.trim() || createToken.isPending}
          className="px-4 py-2 bg-white text-black rounded-lg text-sm font-medium hover:bg-neutral-200 disabled:opacity-50 transition-colors"
        >
          Create Token
        </button>
      </div>

      {/* Token list */}
      {isLoading ? (
        <div className="text-neutral-500 text-sm">Loading...</div>
      ) : tokens.length === 0 ? (
        <div className="text-neutral-500 text-sm">No tokens yet. Create one to get started.</div>
      ) : (
        <div className="space-y-2">
          {tokens.map((t) => (
            <div key={t.id} className="flex items-center gap-3 bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-neutral-200 truncate">{t.name}</div>
                <div className="text-xs text-neutral-500 font-mono">{t.hint}</div>
              </div>
              <div className="text-xs text-neutral-600 shrink-0">
                {new Date(t.created_at).toLocaleDateString()}
              </div>
              <button
                onClick={() => handleRevoke(t.id, t.name)}
                disabled={revokeToken.isPending}
                className="shrink-0 px-3 py-1 rounded text-xs border border-red-800 text-red-400 hover:bg-red-950 disabled:opacity-50 transition-colors"
              >
                Revoke
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
