import { useState, useEffect, useRef } from 'react';
import { useTokens, useCreateToken, useRevokeToken } from '../hooks/queries';
import Prism from 'prismjs';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-python';
import 'prismjs/themes/prism-tomorrow.css';
import { CopySimpleIcon as CopySimple } from '@phosphor-icons/react/dist/icons/CopySimple';
import { CheckIcon as Check } from '@phosphor-icons/react/dist/icons/Check';

type SnippetLang = 'curl' | 'javascript' | 'python';

function QuickStart({ token }: { token: string }) {
  const [tab, setTab] = useState<SnippetLang>('curl');
  const codeRef = useRef<HTMLElement>(null);
  const [copied, setCopied] = useState(false);

  const baseUrl = window.location.origin;
  const url = `${baseUrl}/ingest`;

  const snippets: Record<SnippetLang, { code: string; prismLang: string }> = {
    curl: {
      prismLang: 'bash',
      code: `curl -X POST ${url} \\
  -H "Authorization: Bearer ${token}" \\
  -H "Content-Type: application/json" \\
  -d '{"content": "https://example.com/article", "tags": ["reading-list"]}'`,
    },
    javascript: {
      prismLang: 'javascript',
      code: `fetch("${url}", {
  method: "POST",
  headers: {
    "Authorization": "Bearer ${token}",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    content: "https://example.com/article",
    tags: ["reading-list"],
  }),
});`,
    },
    python: {
      prismLang: 'python',
      code: `import requests

requests.post(
    "${url}",
    headers={"Authorization": "Bearer ${token}"},
    json={"content": "https://example.com/article", "tags": ["reading-list"]},
)`,
    },
  };

  const active = snippets[tab];

  useEffect(() => {
    if (codeRef.current) Prism.highlightElement(codeRef.current);
  }, [tab, token]);

  const handleCopy = () => {
    navigator.clipboard.writeText(active.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mt-4 rounded-lg border border-neutral-800 overflow-hidden">
      <div className="flex items-center justify-between bg-neutral-900/80 border-b border-neutral-800 px-1">
        <div className="flex overflow-x-auto">
          {(['curl', 'javascript', 'python'] as SnippetLang[]).map((lang) => (
            <button
              key={lang}
              onClick={() => setTab(lang)}
              className={`px-3 py-2 text-xs font-medium transition-colors ${
                tab === lang
                  ? 'text-neutral-200 border-b-2 border-neutral-200'
                  : 'text-neutral-500 hover:text-neutral-300'
              }`}
            >
              {lang === 'curl' ? 'curl' : lang === 'javascript' ? 'JavaScript' : 'Python'}
            </button>
          ))}
        </div>
        <button
          onClick={handleCopy}
          className={`mr-2 px-2.5 py-1 rounded text-xs border inline-flex items-center gap-1.5 transition-colors ${
            copied ? 'border-green-600 text-green-400' : 'border-neutral-700 text-neutral-500 hover:text-neutral-300'
          }`}
        >
          {copied ? <><Check size={14} weight="bold" /> Copied!</> : <><CopySimple size={14} weight="bold" /> Copy</>}
        </button>
      </div>
      <pre className="!m-0 !rounded-none !bg-neutral-950 p-4 overflow-x-auto">
        <code ref={codeRef} className={`language-${active.prismLang} !text-[13px] !leading-relaxed`}>
          {active.code}
        </code>
      </pre>
    </div>
  );
}

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
    <div>
      {message && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm ${
          message.type === 'success' ? 'bg-green-950 border border-green-800 text-green-400' : 'bg-red-950 border border-red-800 text-red-400'
        }`}>
          {message.text}
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
          className="border-glow flex-1 bg-neutral-950 rounded-lg px-4 py-2 text-sm text-neutral-200 placeholder-neutral-500 focus:outline-none"
        />
        <button
          onClick={handleCreate}
          disabled={!name.trim() || createToken.isPending}
          className="px-4 py-2 bg-white text-black rounded-lg text-sm font-medium hover:bg-neutral-200 disabled:opacity-50 transition-colors"
        >
          Create
        </button>
      </div>

      {/* Revealed token + quick start */}
      {revealedToken && (
        <div className="mb-4">
          <div className="flex items-center gap-3 bg-neutral-950 border border-green-800 rounded-lg px-4 py-3 font-mono text-sm">
            <span className="flex-1 break-all text-green-400">{revealedToken}</span>
            <button
              onClick={handleCopy}
              className={`shrink-0 px-3 py-1 rounded text-xs border inline-flex items-center gap-1.5 transition-colors ${
                copied ? 'border-green-600 text-green-400' : 'border-neutral-700 text-neutral-400 hover:text-neutral-200'
              }`}
            >
              {copied ? <><Check size={14} weight="bold" /> Copied!</> : <><CopySimple size={14} weight="bold" /> Copy</>}
            </button>
          </div>
          <QuickStart token={revealedToken} />
        </div>
      )}

      {/* Token list */}
      {isLoading ? (
        <div className="text-neutral-500 text-sm">Loading...</div>
      ) : tokens.length === 0 ? (
        <div className="text-neutral-500 text-sm">No tokens yet. Create one to get started.</div>
      ) : (
        <div className="space-y-2">
          {tokens.map((t) => (
            <div key={t.id} className="border-glow flex items-center gap-3 bg-neutral-950 rounded-lg px-4 py-3">
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
