import { describe, expect, test } from 'bun:test';
import { detectMimeType } from '../../../lib/pipeline/detect';

describe('detectMimeType', () => {
  test('PNG magic bytes → image/png', () => {
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(detectMimeType(buf)).toBe('image/png');
  });

  test('JPEG magic bytes → image/jpeg', () => {
    const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    expect(detectMimeType(buf)).toBe('image/jpeg');
  });

  test('GIF magic bytes → image/gif', () => {
    const buf = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
    expect(detectMimeType(buf)).toBe('image/gif');
  });

  test('WebP (RIFF) magic bytes → image/webp', () => {
    const buf = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00]);
    expect(detectMimeType(buf)).toBe('image/webp');
  });

  test('unknown bytes → image/png (default fallback)', () => {
    const buf = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    expect(detectMimeType(buf)).toBe('image/png');
  });
});
