import { describe, expect, test } from 'bun:test';
import { safeCompare } from '../../lib/auth';
import { tokenHint } from '../../lib/import/token-store';

describe('safeCompare', () => {
  test('identical strings → true', () => {
    expect(safeCompare('password123', 'password123')).toBe(true);
  });

  test('different strings → false', () => {
    expect(safeCompare('password123', 'password456')).toBe(false);
  });

  test('empty string vs non-empty → false', () => {
    expect(safeCompare('', 'something')).toBe(false);
  });

  test('non-empty vs empty → false', () => {
    expect(safeCompare('something', '')).toBe(false);
  });

  test('both empty → true', () => {
    expect(safeCompare('', '')).toBe(true);
  });

  test('same long string → true', () => {
    const long = 'a'.repeat(1000);
    expect(safeCompare(long, long)).toBe(true);
  });

  test('strings differing by one char → false', () => {
    expect(safeCompare('abcdef', 'abcdeg')).toBe(false);
  });
});

describe('tokenHint', () => {
  test('long token → first 4 + ... + last 4', () => {
    const token = 'abcdefghijklmnopqrstuvwxyz123456';
    expect(tokenHint(token)).toBe('abcd...3456');
  });

  test('short token (≤8 chars) → ****', () => {
    expect(tokenHint('12345678')).toBe('****');
  });

  test('very short token → ****', () => {
    expect(tokenHint('abc')).toBe('****');
  });

  test('exactly 9 chars → shows hint', () => {
    expect(tokenHint('123456789')).toBe('1234...6789');
  });
});
