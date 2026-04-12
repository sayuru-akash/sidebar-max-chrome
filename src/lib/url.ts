import { SEARCH_ENGINE_URL } from './constants';

export function isSupportedDockUrl(input: string): boolean {
  try {
    const url = new URL(input);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function looksLikeIpAddress(value: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/.*)?$/.test(value);
}

function looksLikeHost(value: string): boolean {
  return (
    value.startsWith('localhost') ||
    value.startsWith('127.0.0.1') ||
    value.includes('.') ||
    looksLikeIpAddress(value)
  );
}

export function normalizeAddressInput(input: string): {
  url: string;
  kind: 'url' | 'search';
} {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return {
      url: SEARCH_ENGINE_URL,
      kind: 'search',
    };
  }

  try {
    const directUrl = new URL(trimmed);
    return {
      url: directUrl.toString(),
      kind: 'url',
    };
  } catch {
    // fall through
  }

  if (!trimmed.includes(' ') && looksLikeHost(trimmed)) {
    return {
      url: new URL(`https://${trimmed}`).toString(),
      kind: 'url',
    };
  }

  return {
    url: `${SEARCH_ENGINE_URL}${encodeURIComponent(trimmed)}`,
    kind: 'search',
  };
}

export function getDisplayTitle(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '') || parsed.toString();
  } catch {
    return url;
  }
}

