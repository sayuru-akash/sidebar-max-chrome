import { describe, expect, test } from 'vitest';

import { evaluateEmbedHeaders } from '../src/lib/embed';

function createHeaders(values: Record<string, string | null>) {
  return {
    get(name: string) {
      return values[name.toLowerCase()] ?? null;
    },
  } satisfies Pick<Headers, 'get'>;
}

describe('evaluateEmbedHeaders', () => {
  test('blocks x-frame-options', () => {
    const result = evaluateEmbedHeaders(
      createHeaders({
        'x-frame-options': 'DENY',
      }),
      'chrome-extension://abc123',
    );

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('x-frame-options');
  });

  test('blocks restrictive frame-ancestors policies', () => {
    const result = evaluateEmbedHeaders(
      createHeaders({
        'content-security-policy': "default-src 'self'; frame-ancestors 'self'",
      }),
      'chrome-extension://abc123',
    );

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('content-security-policy');
  });

  test('allows wildcard frame-ancestors policies', () => {
    const result = evaluateEmbedHeaders(
      createHeaders({
        'content-security-policy': 'frame-ancestors *',
      }),
      'chrome-extension://abc123',
    );

    expect(result.allowed).toBe(true);
  });
});
