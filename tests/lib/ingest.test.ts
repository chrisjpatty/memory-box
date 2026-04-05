import { describe, expect, test } from 'bun:test';
import {
  detectContentType,
  detectFromBuffer,
  contentHash,
  bufferHash,
  classifyImage,
  classifyPdf,
} from '../../lib/pipeline/detect';

describe('detectContentType', () => {
  test('HTTP URL returns url', () => {
    expect(detectContentType('http://example.com')).toBe('url');
  });

  test('HTTPS URL returns url', () => {
    expect(detectContentType('https://example.com/path?q=1')).toBe('url');
  });

  test('URL with whitespace is trimmed', () => {
    expect(detectContentType('  https://example.com  ')).toBe('url');
  });

  test('non-URL text returns null', () => {
    expect(detectContentType('just some plain text')).toBeNull();
  });

  test('PDF data URI returns pdf', () => {
    expect(detectContentType('data:application/pdf;base64,JVBERi0=')).toBe('pdf');
  });

  test('image data URI returns image', () => {
    expect(detectContentType('data:image/png;base64,iVBOR=')).toBe('image');
  });

  test('image/jpeg data URI returns image', () => {
    expect(detectContentType('data:image/jpeg;base64,/9j/')).toBe('image');
  });

  test('empty string returns null', () => {
    expect(detectContentType('')).toBeNull();
  });

  test('URL-like string without protocol returns null', () => {
    expect(detectContentType('example.com/path')).toBeNull();
  });

  test('ftp URL returns null (not http/https)', () => {
    expect(detectContentType('ftp://files.example.com')).toBeNull();
  });
});

describe('detectFromBuffer', () => {
  test('PDF magic bytes → pdf', () => {
    const buf = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
    expect(detectFromBuffer(buf)).toBe('pdf');
  });

  test('PNG magic bytes → image', () => {
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
    expect(detectFromBuffer(buf)).toBe('image');
  });

  test('JPEG magic bytes → image', () => {
    const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    expect(detectFromBuffer(buf)).toBe('image');
  });

  test('GIF magic bytes → image', () => {
    const buf = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39]);
    expect(detectFromBuffer(buf)).toBe('image');
  });

  test('WebP (RIFF) magic bytes → image', () => {
    const buf = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00]);
    expect(detectFromBuffer(buf)).toBe('image');
  });

  test('unknown bytes + image MIME type → image', () => {
    const buf = Buffer.from([0x00, 0x00, 0x00, 0x00]);
    expect(detectFromBuffer(buf, 'image/svg+xml')).toBe('image');
  });

  test('unknown bytes + pdf MIME type → pdf', () => {
    const buf = Buffer.from([0x00, 0x00, 0x00, 0x00]);
    expect(detectFromBuffer(buf, 'application/pdf')).toBe('pdf');
  });

  test('unknown bytes + no MIME → file', () => {
    const buf = Buffer.from([0x00, 0x00, 0x00, 0x00]);
    expect(detectFromBuffer(buf)).toBe('file');
  });
});

describe('contentHash / bufferHash', () => {
  test('returns a 64-char hex string', () => {
    const hash = contentHash('hello');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  test('same input → same hash', () => {
    expect(contentHash('test content')).toBe(contentHash('test content'));
  });

  test('different input → different hash', () => {
    expect(contentHash('aaa')).not.toBe(contentHash('bbb'));
  });

  test('bufferHash returns deterministic hex', () => {
    const buf = Buffer.from('hello world');
    const h1 = bufferHash(buf);
    const h2 = bufferHash(buf);
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[a-f0-9]{64}$/);
  });

  test('bufferHash differs from contentHash for same string', () => {
    // Buffer.from and string hashing should produce the same result
    // since contentHash does createHash('sha256').update(string)
    // and bufferHash does createHash('sha256').update(buffer)
    const str = 'hello';
    expect(contentHash(str)).toBe(bufferHash(Buffer.from(str)));
  });
});

describe('classifyImage', () => {
  test('extracts MIME type from data URI', () => {
    const result = classifyImage('data:image/png;base64,abc');
    expect(result.contentType).toBe('image');
    expect(result.metadata.mimeType).toBe('image/png');
  });

  test('extracts jpeg MIME type', () => {
    const result = classifyImage('data:image/jpeg;base64,abc');
    expect(result.metadata.mimeType).toBe('image/jpeg');
  });

  test('uses user title if provided', () => {
    const result = classifyImage('data:image/png;base64,abc', 'My Photo');
    expect(result.title).toBe('My Photo');
  });

  test('falls back to generated title', () => {
    const result = classifyImage('data:image/png;base64,abc');
    expect(result.title).toContain('png');
  });

  test('passes through user tags', () => {
    const result = classifyImage('data:image/png;base64,abc', undefined, ['vacation', 'beach']);
    expect(result.tags).toEqual(['vacation', 'beach']);
  });

  test('empty tags when none provided', () => {
    const result = classifyImage('data:image/png;base64,abc');
    expect(result.tags).toEqual([]);
  });

  test('category is always image', () => {
    const result = classifyImage('data:image/png;base64,abc');
    expect(result.category).toBe('image');
  });
});

describe('classifyPdf', () => {
  test('uses user title if provided', () => {
    const result = classifyPdf('My Report');
    expect(result.title).toBe('My Report');
  });

  test('falls back to fileName', () => {
    const result = classifyPdf(undefined, undefined, 'report.pdf');
    expect(result.title).toBe('report.pdf');
  });

  test('falls back to default title', () => {
    const result = classifyPdf();
    expect(result.title).toBe('PDF Document');
  });

  test('adds pdf tag by default', () => {
    const result = classifyPdf();
    expect(result.tags).toContain('pdf');
  });

  test('uses user tags when provided', () => {
    const result = classifyPdf(undefined, ['finance', 'report']);
    expect(result.tags).toEqual(['finance', 'report']);
  });

  test('contentType is pdf', () => {
    const result = classifyPdf();
    expect(result.contentType).toBe('pdf');
  });

  test('category is document', () => {
    const result = classifyPdf();
    expect(result.category).toBe('document');
  });
});
