import type { EmbedProbeResult } from './schema';

function extractFrameAncestors(csp: string | null): string[] | null {
  if (!csp) {
    return null;
  }

  for (const directive of csp.split(';')) {
    const trimmed = directive.trim();
    if (!trimmed.toLowerCase().startsWith('frame-ancestors')) {
      continue;
    }

    return trimmed
      .split(/\s+/)
      .slice(1)
      .map((token) => token.replace(/;+$/, ''));
  }

  return null;
}

export function evaluateEmbedHeaders(
  headers: Pick<Headers, 'get'>,
  extensionOrigin: string,
): EmbedProbeResult {
  const xFrameOptions = headers.get('x-frame-options');
  if (xFrameOptions) {
    return {
      allowed: false,
      confidence: 'high',
      reason: 'x-frame-options',
      details: xFrameOptions,
    };
  }

  const frameAncestors = extractFrameAncestors(
    headers.get('content-security-policy'),
  );
  if (!frameAncestors || frameAncestors.length === 0) {
    return {
      allowed: true,
      confidence: 'low',
    };
  }

  const normalizedOrigin = extensionOrigin.replace(/\/$/, '');
  const allowsWildcard = frameAncestors.includes('*');
  const allowsExtension = frameAncestors.some((value) => {
    const token = value.replace(/^'+|'+$/g, '');
    return token === 'chrome-extension:' || token === normalizedOrigin;
  });

  if (allowsWildcard || allowsExtension) {
    return {
      allowed: true,
      confidence: 'high',
    };
  }

  return {
    allowed: false,
    confidence: 'high',
    reason: 'content-security-policy',
    details: frameAncestors.join(' '),
  };
}

export async function probeUrlForEmbedding(
  url: string,
  extensionOrigin: string,
  fetchImpl: typeof fetch = fetch,
): Promise<EmbedProbeResult> {
  try {
    const headResponse = await fetchImpl(url, {
      method: 'HEAD',
      redirect: 'follow',
      credentials: 'omit',
      cache: 'no-store',
    });

    return evaluateEmbedHeaders(headResponse.headers, extensionOrigin);
  } catch {
    return {
      allowed: true,
      confidence: 'unknown',
      reason: 'probe-failed',
    };
  }
}

