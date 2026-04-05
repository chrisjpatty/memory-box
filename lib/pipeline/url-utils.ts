/**
 * URL utility functions. Separated to avoid circular imports between
 * extract.ts and url-handlers/.
 */

/**
 * Resolve all relative URLs in markdown to absolute URLs using the source page's base URL.
 */
export function resolveRelativeUrls(markdown: string, sourceUrl: string): string {
  let base: URL;
  try {
    base = new URL(sourceUrl);
  } catch {
    return markdown;
  }

  return markdown.replace(
    /(!?\[[^\]]*\]\()([^)\s]+)(\s*(?:"[^"]*")?\s*\))/g,
    (_match, prefix, url, suffix) => {
      try {
        if (url.startsWith('#') || url.startsWith('data:') || url.startsWith('mailto:')) return _match;
        new URL(url);
        return _match;
      } catch {
        try {
          const resolved = new URL(url, base).href;
          return `${prefix}${resolved}${suffix}`;
        } catch {
          return _match;
        }
      }
    },
  );
}
