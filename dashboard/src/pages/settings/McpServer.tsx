import { useState, useEffect, useRef } from 'react';
import { useMcpStatus, useEnableMcp, useDisableMcp } from '../../hooks/queries';
import Prism from 'prismjs';
import 'prismjs/components/prism-json';
import 'prismjs/themes/prism-tomorrow.css';

type ConfigTab = 'claude' | 'vscode' | 'generic';

function McpConfigSnippets({ token, mcpUrl }: { token: string; mcpUrl: string }) {
  const [tab, setTab] = useState<ConfigTab>('claude');
  const codeRef = useRef<HTMLElement>(null);
  const [copied, setCopied] = useState(false);

  const snippets: Record<ConfigTab, { label: string; code: string }> = {
    claude: {
      label: 'Claude Desktop',
      code: JSON.stringify({
        mcpServers: {
          'memory-box': {
            url: mcpUrl,
            headers: { Authorization: `Bearer ${token}` },
          },
        },
      }, null, 2),
    },
    vscode: {
      label: 'VS Code',
      code: JSON.stringify({
        servers: {
          'memory-box': {
            url: mcpUrl,
            headers: { Authorization: `Bearer ${token}` },
          },
        },
      }, null, 2),
    },
    generic: {
      label: 'Generic',
      code: JSON.stringify({
        url: mcpUrl,
        transport: 'streamable-http',
        headers: { Authorization: `Bearer ${token}` },
      }, null, 2),
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
    <div className="rounded-lg border border-neutral-800 overflow-hidden">
      <div className="flex items-center justify-between bg-neutral-900/80 border-b border-neutral-800 px-1">
        <div className="flex">
          {(['claude', 'vscode', 'generic'] as ConfigTab[]).map((key) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-3 py-2 text-xs font-medium transition-colors ${
                tab === key
                  ? 'text-neutral-200 border-b-2 border-neutral-200'
                  : 'text-neutral-500 hover:text-neutral-300'
              }`}
            >
              {snippets[key].label}
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
        <code ref={codeRef} className="language-json !text-[13px] !leading-relaxed">
          {active.code}
        </code>
      </pre>
    </div>
  );
}

export function McpServer() {
  const { data: status, isLoading } = useMcpStatus();
  const enableMcp = useEnableMcp();
  const disableMcp = useDisableMcp();

  const [revealedToken, setRevealedToken] = useState<string | null>(null);
  const [tokenCopied, setTokenCopied] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const mcpUrl = `${window.location.origin}/mcp`;

  const handleEnable = () => {
    setMessage(null);
    enableMcp.mutate(undefined, {
      onSuccess: (data) => {
        setRevealedToken(data.token);
        setMessage({ type: 'success', text: 'MCP server enabled. Copy the token below — it won\'t be shown again.' });
      },
      onError: (err: Error) => {
        setMessage({ type: 'error', text: err.message });
      },
    });
  };

  const handleDisable = () => {
    if (!confirm('Disable the MCP server? The token will be revoked and all connected clients will lose access.')) return;
    setMessage(null);
    setRevealedToken(null);
    disableMcp.mutate(undefined, {
      onSuccess: () => {
        setMessage({ type: 'success', text: 'MCP server disabled.' });
      },
      onError: (err: Error) => {
        setMessage({ type: 'error', text: err.message });
      },
    });
  };

  const handleCopyToken = () => {
    if (revealedToken) {
      navigator.clipboard.writeText(revealedToken);
      setTokenCopied(true);
      setTimeout(() => setTokenCopied(false), 2000);
    }
  };

  if (isLoading) {
    return (
      <div>
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-1">MCP Server</h2>
          <p className="text-sm text-neutral-500">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-semibold mb-1">MCP Server</h2>
        <p className="text-sm text-neutral-500">Connect external AI clients to your knowledge base</p>
      </div>

      {message && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm ${
          message.type === 'success' ? 'bg-green-950 border border-green-800 text-green-400' : 'bg-red-950 border border-red-800 text-red-400'
        }`}>
          {message.text}
        </div>
      )}

      {!status?.enabled ? (
        /* --- Disabled state --- */
        <section>
          <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-5 mb-4">
            <p className="text-sm text-neutral-400 leading-relaxed mb-4">
              The MCP (Model Context Protocol) server lets AI clients like Claude Desktop, VS Code Copilot,
              and Postman connect directly to your Memory Box. They can search, store, and explore your
              memories using the <span className="text-neutral-300 font-medium">membox_</span> tools.
            </p>
            <p className="text-sm text-neutral-500">
              Enabling this will generate a dedicated bearer token for MCP client authentication.
            </p>
          </div>
          <button
            onClick={handleEnable}
            disabled={enableMcp.isPending}
            className="px-4 py-2 bg-white text-black rounded-lg text-sm font-medium hover:bg-neutral-200 disabled:opacity-50 transition-colors"
          >
            {enableMcp.isPending ? 'Enabling...' : 'Enable MCP Server'}
          </button>
        </section>
      ) : (
        /* --- Enabled state --- */
        <div>
          {/* Status indicator */}
          <section className="pb-6 mb-6 border-b border-neutral-800">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-sm font-medium text-neutral-200">MCP Server is active</span>
            </div>

            {/* Token display */}
            {revealedToken ? (
              <div className="mb-3">
                <div className="flex items-center gap-3 bg-neutral-950 border border-green-800 rounded-lg px-4 py-3 font-mono text-sm">
                  <span className="flex-1 break-all text-green-400">{revealedToken}</span>
                  <button
                    onClick={handleCopyToken}
                    className={`shrink-0 px-2.5 py-1 rounded text-xs border transition-colors ${
                      tokenCopied ? 'border-green-600 text-green-400' : 'border-neutral-700 text-neutral-500 hover:text-neutral-300'
                    }`}
                  >
                    {tokenCopied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <p className="mt-2 text-xs text-yellow-400/80">
                  Copy this token now — it won't be shown again.
                </p>
              </div>
            ) : status.tokenHint ? (
              <div className="flex items-center gap-3 bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-3 mb-3">
                <span className="font-mono text-sm text-neutral-400">{status.tokenHint}</span>
              </div>
            ) : null}
          </section>

          {/* Connection details */}
          <section className="pb-6 mb-6 border-b border-neutral-800">
            <h3 className="text-sm font-medium text-neutral-200 mb-1">Endpoint</h3>
            <p className="text-xs text-neutral-500 mb-3">MCP clients connect to this URL using Streamable HTTP transport.</p>
            <code className="block bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2.5 text-sm text-neutral-300 font-mono">
              {mcpUrl}
            </code>
          </section>

          {/* Config snippets */}
          <section className="pb-6 mb-6 border-b border-neutral-800">
            <h3 className="text-sm font-medium text-neutral-200 mb-1">Client Configuration</h3>
            <p className="text-xs text-neutral-500 mb-3">
              {revealedToken
                ? 'Add this configuration to your MCP client.'
                : <>Add this to your MCP client. Replace <code className="text-neutral-400">&lt;your-token&gt;</code> with the token shown when you enabled MCP.</>
              }
            </p>
            <McpConfigSnippets token={revealedToken || '<your-token>'} mcpUrl={mcpUrl} />
          </section>

          {/* Available tools */}
          <section className="pb-6 mb-6 border-b border-neutral-800">
            <h3 className="text-sm font-medium text-neutral-200 mb-1">Available Tools</h3>
            <p className="text-xs text-neutral-500 mb-3">These tools are exposed to connected MCP clients.</p>
            <div className="grid gap-2">
              {[
                { name: 'membox_store', desc: 'Store text, URLs, or images' },
                { name: 'membox_search', desc: 'Hybrid semantic + keyword search' },
                { name: 'membox_get', desc: 'Get a memory by ID' },
                { name: 'membox_list', desc: 'List memories with filters' },
                { name: 'membox_delete', desc: 'Delete a memory' },
                { name: 'membox_graph', desc: 'Explore the knowledge graph' },
                { name: 'membox_display', desc: 'Render memories as rich cards' },
                { name: 'membox_ask', desc: 'Chat with the Memory Box agent' },
              ].map((tool) => (
                <div key={tool.name} className="flex items-center gap-3 bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2">
                  <code className="text-xs text-neutral-300 font-mono">{tool.name}</code>
                  <span className="text-xs text-neutral-500">{tool.desc}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Disable */}
          <section>
            <button
              onClick={handleDisable}
              disabled={disableMcp.isPending}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-red-800 text-red-400 hover:bg-red-950 disabled:opacity-30 transition-colors"
            >
              {disableMcp.isPending ? 'Disabling...' : 'Disable MCP Server'}
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
