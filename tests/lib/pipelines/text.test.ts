import { describe, expect, test } from 'bun:test';
import { detectChunkingStrategy } from '../../../lib/pipelines/text';

describe('detectChunkingStrategy', () => {
  test('content with 2+ markdown headings → markdown strategy', () => {
    const content = '# Heading One\nSome text\n## Heading Two\nMore text\n';
    const result = detectChunkingStrategy(content);
    expect(result).toEqual({ strategy: 'markdown', maxSize: 4096, overlap: 200 });
  });

  test('content with 3+ HTML structural tags → html strategy', () => {
    const content = '<div>Hello</div><p>World</p><section>Content</section><article>More</article>';
    const result = detectChunkingStrategy(content);
    expect(result).toEqual({ strategy: 'html', maxSize: 4096, overlap: 200 });
  });

  test('content with 3+ code signals → recursive with 4096', () => {
    const content = 'function foo() {}\nconst bar = 1;\nlet baz = 2;\nimport x from "y";';
    const result = detectChunkingStrategy(content);
    expect(result).toEqual({ strategy: 'recursive', maxSize: 4096, overlap: 200 });
  });

  test('plain prose → recursive with 2048', () => {
    const content = 'This is just a regular paragraph of text with no special formatting or code patterns. It goes on for a while but has nothing special about it.';
    const result = detectChunkingStrategy(content);
    expect(result).toEqual({ strategy: 'recursive', maxSize: 2048, overlap: 100 });
  });

  test('headings AND code → markdown wins (checked first)', () => {
    const content = '# My Code\nfunction foo() {}\n## More Code\nconst bar = 1;\nlet baz = 2;';
    const result = detectChunkingStrategy(content);
    expect(result.strategy).toBe('markdown');
  });

  test('HTML AND code → html wins (checked before code)', () => {
    const content = '<div>function foo() {}</div><p>const bar = 1;</p><section>let baz = 2;</section>';
    const result = detectChunkingStrategy(content);
    expect(result.strategy).toBe('html');
  });

  test('single heading is not enough for markdown', () => {
    const content = '# Only One Heading\nSome text underneath it.';
    const result = detectChunkingStrategy(content);
    expect(result.strategy).not.toBe('markdown');
  });

  test('1 HTML tag (open+close counts as 2) is not enough for html', () => {
    // The regex matches both opening and closing tags, so <div></div> = 2 matches
    const content = '<div>Hello</div> some text';
    const result = detectChunkingStrategy(content);
    expect(result.strategy).not.toBe('html');
  });

  test('1 code signal is not enough for code', () => {
    const content = 'function foo() {}';
    const result = detectChunkingStrategy(content);
    expect(result).toEqual({ strategy: 'recursive', maxSize: 2048, overlap: 100 });
  });
});
