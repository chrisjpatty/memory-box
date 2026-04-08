import { useState, useEffect, useRef, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useChangePassword } from '../../hooks/queries';
import Prism from 'prismjs';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-python';
import 'prismjs/themes/prism-tomorrow.css';

type SnippetLang = 'curl' | 'javascript' | 'python';

function ApiReference() {
  const [tab, setTab] = useState<SnippetLang>('curl');
  const codeRef = useRef<HTMLElement>(null);
  const [copied, setCopied] = useState(false);

  const baseUrl = window.location.origin;
  const url = `${baseUrl}/ingest`;
  const token = '<your-token>';

  const snippets: Record<SnippetLang, { code: string; prismLang: string }> = {
    curl: {
      prismLang: 'bash',
      code: `# Save a link
curl -X POST ${url} \\
  -H "Authorization: Bearer ${token}" \\
  -H "Content-Type: application/json" \\
  -d '{"content": "https://example.com/article", "tags": ["reading-list"]}'`,
    },
    javascript: {
      prismLang: 'javascript',
      code: `// Save a link
fetch("${url}", {
  method: "POST",
  headers: {
    "Authorization": "Bearer ${token}",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    content: "https://example.com/article",
    tags: ["reading-list"],
  }),
});

// Save an image (base64)
const base64 = btoa(await file.arrayBuffer());
fetch("${url}", {
  method: "POST",
  headers: {
    "Authorization": "Bearer ${token}",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    content: \`data:image/png;base64,\${base64}\`,
    title: "Whiteboard photo from standup",
  }),
});`,
    },
    python: {
      prismLang: 'python',
      code: `import requests, base64

# Save a link
requests.post(
    "${url}",
    headers={"Authorization": "Bearer ${token}"},
    json={"content": "https://example.com/article", "tags": ["reading-list"]},
)

# Save an image
with open("photo.png", "rb") as f:
    img = "data:image/png;base64," + base64.b64encode(f.read()).decode()
requests.post(
    "${url}",
    headers={"Authorization": "Bearer ${token}"},
    json={"content": img, "title": "Whiteboard photo from standup"},
)`,
    },
  };

  const active = snippets[tab];

  useEffect(() => {
    if (codeRef.current) Prism.highlightElement(codeRef.current);
  }, [tab]);

  const handleCopy = () => {
    navigator.clipboard.writeText(active.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-lg border border-neutral-800 overflow-hidden">
      <div className="flex items-center justify-between bg-neutral-900/80 border-b border-neutral-800 px-1">
        <div className="flex">
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
          className={`mr-2 px-2.5 py-1 rounded text-xs border transition-colors ${
            copied ? 'border-green-600 text-green-400' : 'border-neutral-700 text-neutral-500 hover:text-neutral-300'
          }`}
        >
          {copied ? 'Copied!' : 'Copy'}
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

function ChangePassword() {
  const changePassword = useChangePassword();
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [localError, setLocalError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setLocalError('');
    setSuccess(false);

    if (newPassword.length < 8) {
      setLocalError('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setLocalError('New passwords do not match.');
      return;
    }

    changePassword.mutate({ currentPassword, newPassword }, {
      onSuccess: () => {
        setSuccess(true);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setOpen(false);
      },
      onError: (err: Error) => {
        setLocalError(err.message);
      },
    });
  };

  const handleCancel = () => {
    setOpen(false);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setLocalError('');
  };

  if (!open) {
    return (
      <div>
        {success && (
          <div className="mb-3 px-4 py-3 rounded-lg text-sm bg-green-950 border border-green-800 text-green-400">
            Password updated.
          </div>
        )}
        <button
          onClick={() => { setSuccess(false); setOpen(true); }}
          className="px-4 py-2 rounded-lg text-sm font-medium border border-neutral-700 text-neutral-300 hover:text-white hover:border-neutral-500 transition-colors"
        >
          Change password
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      {localError && (
        <div className="mb-3 px-4 py-3 rounded-lg text-sm bg-red-950 border border-red-800 text-red-400">
          {localError}
        </div>
      )}
      <div className="space-y-3">
        <input
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          placeholder="Current password"
          required
          autoFocus
          className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2 text-sm text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-neutral-600"
        />
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="New password (min 8 characters)"
          required
          className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2 text-sm text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-neutral-600"
        />
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Confirm new password"
          required
          className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2 text-sm text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-neutral-600"
        />
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="submit"
          disabled={changePassword.isPending}
          className="px-4 py-2 bg-white text-black rounded-lg text-sm font-medium hover:bg-neutral-200 disabled:opacity-50 transition-colors"
        >
          {changePassword.isPending ? 'Updating...' : 'Update Password'}
        </button>
        <button
          type="button"
          onClick={handleCancel}
          className="px-4 py-2 rounded-lg text-sm text-neutral-400 hover:text-neutral-200 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export function General() {
  const [endpointCopied, setEndpointCopied] = useState(false);
  const endpoint = `${window.location.origin}/ingest`;

  const handleCopyEndpoint = () => {
    navigator.clipboard.writeText(endpoint);
    setEndpointCopied(true);
    setTimeout(() => setEndpointCopied(false), 2000);
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-semibold mb-1">General</h2>
        <p className="text-sm text-neutral-500">Account and instance settings</p>
      </div>

      <section className="pb-6 mb-6 border-b border-neutral-800">
        <h3 className="text-sm font-medium text-neutral-200 mb-1">Password</h3>
        <p className="text-xs text-neutral-500 mb-3">Change your admin password.</p>
        <ChangePassword />
      </section>

      <section className="pb-6 mb-6 border-b border-neutral-800">
        <h3 className="text-sm font-medium text-neutral-200 mb-1">API Endpoint</h3>
        <p className="text-xs text-neutral-500 mb-3">Send memories to this URL using a POST request with an <Link to="/settings/tokens" className="text-neutral-300 underline underline-offset-2 hover:text-white transition-colors">API token</Link>.</p>
        <div className="flex items-center gap-3">
          <code className="flex-1 bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2.5 text-sm text-neutral-300 font-mono">
            {endpoint}
          </code>
          <button
            onClick={handleCopyEndpoint}
            className={`shrink-0 px-3 py-2 rounded-lg text-xs border transition-colors ${
              endpointCopied ? 'border-green-600 text-green-400' : 'border-neutral-700 text-neutral-400 hover:text-neutral-200'
            }`}
          >
            {endpointCopied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </section>

      <section>
        <h3 className="text-sm font-medium text-neutral-200 mb-1">API Reference</h3>
        <p className="text-xs text-neutral-500 mb-3">Example code for ingesting memories. Replace <code className="text-neutral-400">&lt;your-token&gt;</code> with an API token.</p>
        <ApiReference />
      </section>
    </div>
  );
}
