/**
 * Site-specific URL handler registry.
 *
 * Each handler claims URLs it knows how to process (via `match`) and returns
 * enriched content with site-specific metadata. The URL pipeline checks
 * handlers first; if none match, it falls through to the generic Jina/static flow.
 *
 * To add a new handler (e.g. Twitter, YouTube), create a file in this directory
 * that exports a UrlHandler and register it in the `handlers` array below.
 */

export interface UrlHandlerResult {
  /** Primary content for indexing (markdown preferred) */
  markdown: string;
  title: string;
  description: string;
  /** Extra metadata that gets merged into the classification */
  metadata: Record<string, string>;
  /** Extra tags to add */
  tags: string[];
  /** Override category (e.g. 'repository', 'issue', 'tweet') */
  category?: string;
  /** Cleaned HTML for iframe rendering (optional) */
  cleanHtml?: string;
}

export interface UrlHandler {
  /** Human-readable name for logging */
  name: string;
  /** Return true if this handler should process the given URL */
  match(url: URL): boolean;
  /** Fetch and process the URL, returning enriched content */
  fetch(url: URL): Promise<UrlHandlerResult>;
}

import { githubHandler } from './github';

/**
 * Registered handlers, checked in order. First match wins.
 */
const handlers: UrlHandler[] = [
  githubHandler,
];

/**
 * Try to find a site-specific handler for the given URL.
 * Returns null if no handler matches (fall through to generic pipeline).
 */
export async function tryUrlHandler(rawUrl: string): Promise<UrlHandlerResult | null> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }

  for (const handler of handlers) {
    if (handler.match(parsed)) {
      try {
        return await handler.fetch(parsed);
      } catch (e) {
        console.warn(`URL handler "${handler.name}" failed for ${rawUrl}, falling through:`, e);
        return null;
      }
    }
  }

  return null;
}
