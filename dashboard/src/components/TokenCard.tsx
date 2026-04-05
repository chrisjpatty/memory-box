import { useState, useEffect } from 'react';
import { api } from '../api';

export function TokenCard() {
  const [hint, setHint] = useState<string | null>(null);
  const [hasToken, setHasToken] = useState(false);
  const [revealedToken, setRevealedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    api.tokenHint().then((r) => {
      setHint(r.hint);
      setHasToken(r.hasToken);
    });
  }, []);

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const r = await api.tokenGenerate();
      setRevealedToken(r.token);
      setHasToken(true);
      setMessage({ type: 'success', text: 'Token generated. Copy it now — it won\'t be shown again.' });
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message });
    }
    setLoading(false);
  };

  const handleRotate = async () => {
    if (!confirm('Rotate token? The current token will stop working immediately.')) return;
    setLoading(true);
    try {
      const r = await api.tokenRotate();
      setRevealedToken(r.token);
      setMessage({ type: 'success', text: 'Token rotated. Copy the new one now.' });
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message });
    }
    setLoading(false);
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
      <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-4">API Token</h2>

      {message && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm ${
          message.type === 'success' ? 'bg-green-950 border border-green-800 text-green-400' : 'bg-red-950 border border-red-800 text-red-400'
        }`}>
          {message.text}
        </div>
      )}

      <div className="flex items-center gap-3 bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-3 font-mono text-sm">
        <span className="flex-1 break-all">
          {revealedToken || hint || 'No token generated yet'}
        </span>
        {revealedToken && (
          <button
            onClick={handleCopy}
            className={`shrink-0 px-3 py-1 rounded text-xs border transition-colors ${
              copied ? 'border-green-600 text-green-400' : 'border-neutral-700 text-neutral-400 hover:text-neutral-200'
            }`}
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        )}
      </div>

      <div className="flex gap-3 mt-4">
        {!hasToken ? (
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="px-4 py-2 bg-white text-black rounded-lg text-sm font-medium hover:bg-neutral-200 disabled:opacity-50 transition-colors"
          >
            Generate Token
          </button>
        ) : (
          <button
            onClick={handleRotate}
            disabled={loading}
            className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            Rotate Token
          </button>
        )}
      </div>
    </div>
  );
}
