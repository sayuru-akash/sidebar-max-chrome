/* eslint-disable @typescript-eslint/no-unsafe-call */

import { defineContentScript } from '#imports';

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'],
  runAt: 'document_start',
  allFrames: true,
  main() {
    if (window.self === window.top) return;

    const viewport = 'width=device-width, initial-scale=1, maximum-scale=5';

    function ensureViewport(): void {
      let meta = document.querySelector('meta[name="viewport"]');
      if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute('name', 'viewport');
        const target = document.head || document.documentElement;
        target.prepend(meta);
      }
      meta.setAttribute('content', viewport);
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', ensureViewport);
    } else {
      ensureViewport();
    }

    if (window.name !== 'sm-panel') return;

    function syncUrl(): void {
      try {
        chrome.runtime.sendMessage({
          type: 'SYNC_IFRAME_URL',
          url: window.location.href,
        }).catch(() => {});
      } catch {
        // extension context invalidated
      }
    }

    window.addEventListener('load', syncUrl);
    window.addEventListener('popstate', syncUrl);
    window.addEventListener('hashchange', syncUrl);

    const origPush = history.pushState.bind(history);
    history.pushState = function (...args: Parameters<typeof history.pushState>) {
      origPush(...args);
      setTimeout(syncUrl, 50);
    };

    const origReplace = history.replaceState.bind(history);
    history.replaceState = function (...args: Parameters<typeof history.replaceState>) {
      origReplace(...args);
      setTimeout(syncUrl, 50);
    };

    setInterval(syncUrl, 2000);
  },
});
