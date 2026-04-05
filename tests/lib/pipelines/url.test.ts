import { describe, expect, test } from 'bun:test';
import { resolveRelativeUrls } from '../../../lib/pipeline/url-utils';

describe('resolveRelativeUrls', () => {
  const base = 'https://example.com/docs/guide/';

  test('resolves relative markdown links to absolute', () => {
    const md = '[link](./page.html)';
    const result = resolveRelativeUrls(md, base);
    expect(result).toBe('[link](https://example.com/docs/guide/page.html)');
  });

  test('resolves relative image paths', () => {
    const md = '![alt](images/foo.png)';
    const result = resolveRelativeUrls(md, base);
    expect(result).toBe('![alt](https://example.com/docs/guide/images/foo.png)');
  });

  test('resolves parent-relative paths', () => {
    const md = '[up](../other.html)';
    const result = resolveRelativeUrls(md, base);
    expect(result).toBe('[up](https://example.com/docs/other.html)');
  });

  test('leaves absolute URLs unchanged', () => {
    const md = '[link](https://other.com/path)';
    const result = resolveRelativeUrls(md, base);
    expect(result).toBe('[link](https://other.com/path)');
  });

  test('leaves anchor-only links unchanged', () => {
    const md = '[section](#heading)';
    const result = resolveRelativeUrls(md, base);
    expect(result).toBe('[section](#heading)');
  });

  test('leaves data: URIs unchanged', () => {
    const md = '![img](data:image/png;base64,abc)';
    const result = resolveRelativeUrls(md, base);
    expect(result).toBe('![img](data:image/png;base64,abc)');
  });

  test('leaves mailto: links unchanged', () => {
    const md = '[email](mailto:test@example.com)';
    const result = resolveRelativeUrls(md, base);
    expect(result).toBe('[email](mailto:test@example.com)');
  });

  test('handles links with titles', () => {
    const md = '[link](./page.html "My Title")';
    const result = resolveRelativeUrls(md, base);
    expect(result).toBe('[link](https://example.com/docs/guide/page.html "My Title")');
  });

  test('invalid base URL returns markdown unchanged', () => {
    const md = '[link](./page.html)';
    const result = resolveRelativeUrls(md, 'not-a-valid-url');
    expect(result).toBe(md);
  });

  test('multiple links in same string all get resolved', () => {
    const md = '[a](./one.html) and [b](./two.html) and ![c](img.png)';
    const result = resolveRelativeUrls(md, base);
    expect(result).toContain('https://example.com/docs/guide/one.html');
    expect(result).toContain('https://example.com/docs/guide/two.html');
    expect(result).toContain('https://example.com/docs/guide/img.png');
  });

  test('root-relative paths resolve correctly', () => {
    const md = '[link](/absolute/path.html)';
    const result = resolveRelativeUrls(md, base);
    expect(result).toBe('[link](https://example.com/absolute/path.html)');
  });
});
