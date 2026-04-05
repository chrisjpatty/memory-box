import { describe, expect, test } from 'bun:test';
import { fallbackClassify } from '../../lib/classifier';

describe('fallbackClassify', () => {
  test('URL content → url type, bookmark category', () => {
    const result = fallbackClassify('https://example.com/article');
    expect(result.contentType).toBe('url');
    expect(result.category).toBe('bookmark');
  });

  test('image data URI → image type', () => {
    const result = fallbackClassify('data:image/png;base64,iVBOR');
    expect(result.contentType).toBe('image');
  });

  test('PDF data URI → pdf type, document category', () => {
    const result = fallbackClassify('data:application/pdf;base64,JVBERi0=');
    expect(result.contentType).toBe('pdf');
    expect(result.category).toBe('document');
  });

  test('plain text → text type, note category', () => {
    const result = fallbackClassify('Just some regular notes about things');
    expect(result.contentType).toBe('text');
    expect(result.category).toBe('note');
  });

  test('uses user-provided title when given', () => {
    const result = fallbackClassify('some content', 'My Custom Title');
    expect(result.title).toBe('My Custom Title');
  });

  test('without user title, uses first 80 chars of content', () => {
    const longContent = 'x'.repeat(200);
    const result = fallbackClassify(longContent);
    expect(result.title).toBe('x'.repeat(80));
  });

  test('uses user-provided tags when given', () => {
    const result = fallbackClassify('content', undefined, ['tag1', 'tag2']);
    expect(result.tags).toEqual(['tag1', 'tag2']);
  });

  test('without user tags, returns empty array', () => {
    const result = fallbackClassify('content');
    expect(result.tags).toEqual([]);
  });

  test('summary is first 200 chars of content', () => {
    const content = 'a'.repeat(300);
    const result = fallbackClassify(content);
    expect(result.summary).toBe('a'.repeat(200));
  });

  test('metadata is always empty object', () => {
    const result = fallbackClassify('content');
    expect(result.metadata).toEqual({});
  });
});
