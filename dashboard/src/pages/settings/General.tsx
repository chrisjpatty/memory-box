import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
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
        <p className="text-sm text-neutral-500">Instance information and API reference</p>
      </div>

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
