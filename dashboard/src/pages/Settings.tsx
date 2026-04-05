import { TokenCard } from '../components/TokenCard';
import { StatsCard } from '../components/StatsCard';
import { CodeSnippet } from '../components/CodeSnippet';

export function Settings() {
  const baseUrl = window.location.origin;
  const url = `${baseUrl}/ingest`;
  const token = '<your-token>';

  const curlCode = `# Save a link
curl -X POST ${url} \\
  -H "Authorization: Bearer ${token}" \\
  -H "Content-Type: application/json" \\
  -d '{"content": "https://example.com/article", "tags": ["reading-list"]}'`;

  const jsCode = `// Save a link
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
});`;

  const pyCode = `import requests, base64

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
)`;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-1">Settings</h1>
        <p className="text-neutral-500 text-sm">API tokens, stats, and quick start guides</p>
      </div>

      <TokenCard />
      <StatsCard />

      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-3">Quick Start</h2>
        <div className="space-y-4">
          <CodeSnippet label="curl" language="bash" code={curlCode} />
          <CodeSnippet label="JavaScript" language="javascript" code={jsCode} />
          <CodeSnippet label="Python" language="python" code={pyCode} />
        </div>
      </div>
    </div>
  );
}
