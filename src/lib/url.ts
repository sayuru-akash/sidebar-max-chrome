import { DEFAULT_WORKSPACE_TITLE, SEARCH_ENGINE_URL } from './constants';

export function isSupportedUrl(input: string): boolean {
  try {
    const url = new URL(input);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function looksLikeHost(value: string): boolean {
  return (
    value.startsWith('localhost') ||
    value.startsWith('127.0.0.1') ||
    value.includes('.')
  );
}

export function normalizeAddressInput(input: string): {
  url: string;
  kind: 'url' | 'search';
} {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return { url: SEARCH_ENGINE_URL, kind: 'search' };
  }

  try {
    const directUrl = new URL(trimmed);
    return { url: directUrl.toString(), kind: 'url' };
  } catch {
    // fall through
  }

  if (!trimmed.includes(' ') && looksLikeHost(trimmed)) {
    return { url: new URL(`https://${trimmed}`).toString(), kind: 'url' };
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
    return url || DEFAULT_WORKSPACE_TITLE;
  }
}

export function getFaviconUrl(pageUrl: string): string {
  try {
    const url = new URL(pageUrl);
    return `https://www.google.com/s2/favicons?domain=${url.hostname}&sz=32`;
  } catch {
    return '';
  }
}
