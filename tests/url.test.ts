import { describe, expect, test } from 'vitest';

import {
  getDisplayTitle,
  isSupportedUrl,
  normalizeAddressInput,
} from '../src/lib/url';

describe('normalizeAddressInput', () => {
  test('normalizes explicit URLs unchanged', () => {
    expect(normalizeAddressInput('https://example.com/docs').url).toBe(
      'https://example.com/docs',
    );
  });

  test('adds https for host-like values', () => {
    expect(normalizeAddressInput('example.com').url).toBe('https://example.com/');
  });

  test('converts plain text to search', () => {
    const result = normalizeAddressInput('best sidebar extension');
    expect(result.kind).toBe('search');
    expect(result.url).toContain('https://www.google.com/search?q=');
  });
});

describe('url helpers', () => {
  test('accepts http and https urls only', () => {
    expect(isSupportedUrl('https://example.com')).toBe(true);
    expect(isSupportedUrl('http://localhost:3000')).toBe(true);
    expect(isSupportedUrl('chrome://extensions')).toBe(false);
  });

  test('derives readable titles from hostnames', () => {
    expect(getDisplayTitle('https://www.example.com/products')).toBe(
      'example.com',
    );
  });
});
