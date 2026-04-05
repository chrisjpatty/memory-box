import { describe, expect, test } from 'bun:test';
import { splitOversizedChunks } from '../../lib/embeddings';

describe('splitOversizedChunks', () => {
  test('text under maxChars passes through unchanged', () => {
    const result = splitOversizedChunks(['short text'], 100);
    expect(result).toEqual(['short text']);
  });

  test('multiple short texts pass through unchanged', () => {
    const input = ['one', 'two', 'three'];
    expect(splitOversizedChunks(input, 100)).toEqual(input);
  });

  test('splits at sentence boundary when break is in lower half', () => {
    // The algorithm looks for sentence breaks between maxChars*0.5 and maxChars-1.
    // We need the period+space to fall within that window.
    const text = 'A'.repeat(55) + '. ' + 'B'.repeat(50);
    const result = splitOversizedChunks([text], 100);
    expect(result.length).toBeGreaterThan(1);
    expect(result[0]).toEndWith('.');
  });

  test('splits at word boundary when no sentence break in range', () => {
    // No sentence-ending punctuation in the scanning window, just spaces
    const text = 'What an amazing thing and then this other part continues on for a while to exceed the limit here';
    const result = splitOversizedChunks([text], 50);
    expect(result.length).toBeGreaterThan(1);
    // Should split at a word boundary -- both chunks should contain whole words
    // The original text at position 50 is mid-word, so the split backs up to a space
    expect(result[0].length).toBeLessThanOrEqual(50);
    expect(result[0].length).toBeGreaterThan(25); // found a boundary in the lower half
  });

  test('falls back to word boundary if no sentence break', () => {
    // No sentence-ending punctuation, but has spaces
    const text = 'word '.repeat(20); // 100 chars
    const result = splitOversizedChunks([text.trim()], 50);
    expect(result.length).toBeGreaterThan(1);
    // Each chunk should end at a word boundary (no partial words)
    for (const chunk of result) {
      expect(chunk).not.toMatch(/^\s/);
      expect(chunk).not.toMatch(/\s$/);
    }
  });

  test('falls back to hard split if no word boundary', () => {
    const text = 'a'.repeat(100); // no spaces at all
    const result = splitOversizedChunks([text], 50);
    expect(result.length).toBe(2);
    expect(result[0].length).toBe(50);
    expect(result[1].length).toBe(50);
  });

  test('multiple oversized chunks each get split', () => {
    const long1 = 'First sentence here. ' + 'x'.repeat(80);
    const long2 = 'Second sentence here. ' + 'y'.repeat(80);
    const result = splitOversizedChunks([long1, long2], 50);
    expect(result.length).toBeGreaterThan(2);
  });

  test('empty array returns empty array', () => {
    expect(splitOversizedChunks([])).toEqual([]);
  });

  test('preserves all content', () => {
    const text = 'Hello world. This is a test. More content here. Even more stuff to process.';
    const result = splitOversizedChunks([text], 30);
    const rejoined = result.join(' ');
    // All words from original should appear in the result
    for (const word of text.split(/\s+/)) {
      expect(rejoined).toContain(word);
    }
  });

  test('uses default maxChars of 4000', () => {
    const shortText = 'x'.repeat(3999);
    expect(splitOversizedChunks([shortText])).toEqual([shortText]);

    const longText = 'word '.repeat(1000); // 5000 chars
    const result = splitOversizedChunks([longText.trim()]);
    expect(result.length).toBeGreaterThan(1);
  });
});
