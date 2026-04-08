/**
 * MCP Apps display renderer for membox_display.
 *
 * Uses React SSR (renderToStaticMarkup) to render the real dashboard card
 * components into HTML. The pre-rendered HTML is returned as part of the tool
 * result, and the static MCP Apps iframe template injects it into the DOM.
 *
 * This ensures visual parity: MCP cards ARE the dashboard cards.
 *
 * React deduplication: The root package.json declares a Bun workspace
 * including the dashboard, which hoists React so both react-dom/server
 * and the dashboard components resolve to the same instance.
 */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryCard } from '../dashboard/src/components/MemoryCard/index';
import type { MemoryCardData } from '../dashboard/src/components/MemoryCard/types';
import { getMcpAppsAdapterScript } from '@mcp-ui/server';
import { CARD_CSS } from './card-css';

// Cache the adapter script — it's static
const MCP_APPS_ADAPTER = getMcpAppsAdapterScript();

export type { MemoryCardData };

/**
 * Render an array of memories to HTML using the real React card components.
 * Returns pre-rendered HTML that can be injected into the MCP Apps iframe.
 */
export function renderMemoryCards(memories: MemoryCardData[]): string {
  const cards = memories.map((memory) => {
    const cardHtml = renderToStaticMarkup(
      React.createElement(MemoryCard, { memory, onDelete: undefined }),
    );
    // Wrap each card in a clickable container that links to the source URL
    // (or the memory page in the dashboard). The iframe JS handles data-link
    // via ui/open-link postMessage to the host.
    const link = memory.source || '';
    const memoryId = memory.id;
    return `<div data-link="${link}" data-memory-id="${memoryId}" style="cursor:pointer">${cardHtml}</div>`;
  });

  return `<div class="cards-container">${cards.join('')}</div>`;
}

/**
 * Build the complete static HTML document served as the MCP Apps resource.
 * This is a shell that:
 * 1. Contains the pre-extracted Tailwind CSS for card styling
 * 2. Receives tool-result data via MCP Apps protocol
 * 3. Injects the pre-rendered card HTML from the result
 * 4. Handles link clicks via ui/open-link
 */
export function buildDisplayResourceHtml(): string {
  return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    ${CARD_CSS}

    /* All custom styles must be in a layer to avoid overriding Tailwind utilities.
       Unlayered CSS beats @layer rules in the cascade. */
    @layer mcp-shell {
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        background: transparent;
        color: #e5e5e5;
      }
      .cards-container {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
        gap: 12px;
        padding: 8px;
      }
      .cards-container > * { min-width: 0; }
      .loading, .empty {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        font-size: 13px;
      }
      .loading { color: #737373; }
      .empty { color: #525252; }
      [data-link] { cursor: pointer; }
      [data-link]:hover { opacity: 0.85; }
    }

    @media (prefers-color-scheme: light) {
      html { color-scheme: light; }
      html:not(.dark) body { color: #171717; }
    }
  </style>
</head>
<body>
  <div id="root"><div class="loading">Loading memories...</div></div>

  <!-- MCP Apps adapter — handles init handshake and message routing -->
  ${MCP_APPS_ADAPTER}

  <script>
    const root = document.getElementById('root');

    function extractPayload(renderData) {
      // The adapter delivers toolOutput which contains the CallToolResult
      const toolOutput = renderData?.toolOutput;
      if (!toolOutput) return null;

      // toolOutput may have content array (CallToolResult format)
      // or may be the result directly
      let raw = toolOutput;
      if (toolOutput.content) {
        const tc = toolOutput.content.find(c => c.type === 'text');
        if (tc) raw = tc.text;
      }
      if (typeof raw === 'string') {
        try { raw = JSON.parse(raw); } catch {}
      }
      return raw;
    }

    let dashboardBaseUrl = '';

    function render(payload) {
      if (payload?.baseUrl) dashboardBaseUrl = payload.baseUrl;
      if (payload?.html) {
        root.innerHTML = payload.html;
        attachLinkHandlers();
      } else if (payload?.memories?.length > 0) {
        root.innerHTML = '<div class="empty">Memory data received but no rendered cards</div>';
      } else {
        root.innerHTML = '<div class="empty">No memories to display</div>';
      }
    }

    // Listen for render-data events from the MCP Apps adapter
    window.addEventListener('message', (event) => {
      const data = event.data;
      if (!data) return;

      if (data.type === 'ui-lifecycle-iframe-render-data') {
        const payload = extractPayload(data.payload?.renderData);
        if (payload) render(payload);
      }

      // Also handle direct tool-result messages (fallback for hosts without the adapter)
      if (data.type === 'ui/notifications/tool-result') {
        const payload = extractPayload(data.params);
        if (payload) render(payload);
      }
    });

    function attachLinkHandlers() {
      document.querySelectorAll('[data-memory-id]').forEach(el => {
        el.addEventListener('click', e => {
          e.preventDefault();
          const sourceUrl = el.getAttribute('data-link');
          const memoryId = el.getAttribute('data-memory-id');
          const url = sourceUrl || (dashboardBaseUrl && memoryId ? dashboardBaseUrl + '/memories/' + memoryId : '');
          if (url) {
            window.parent.postMessage({ type: 'link', payload: { url } }, '*');
          }
        });
      });
    }
  </script>
</body>
</html>`;
}
