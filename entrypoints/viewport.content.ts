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

    function getTabId(): string | undefined {
      const m = window.name.match(/^sm-(?:offscreen|panel)-(.+)$/);
      return m ? m[1] : undefined;
    }

    function syncUrl(tabId: string): void {
      const current = window.location.href;
      try {
        chrome.runtime.sendMessage({
          type: 'SYNC_IFRAME_URL',
          url: current,
          tabId,
        }).catch(() => {});
      } catch {
        // extension context invalidated
      }
    }

    function autoPlay(): void {
      document.querySelectorAll('video').forEach((v) => {
        try { void v.play(); } catch { /* autoplay blocked */ }
      });
      document.querySelectorAll('audio').forEach((a) => {
        try { void a.play(); } catch { /* autoplay blocked */ }
      });
    }

    const tabId = getTabId();
    if (!tabId) return;

    const isOffscreen = window.name.startsWith('sm-offscreen-');

    if (isOffscreen) {
      autoPlay();
      document.addEventListener('load', autoPlay);
      setInterval(autoPlay, 3000);
    }

    let lastSyncedUrl = '';

    function syncIfChanged(): void {
      const current = window.location.href;
      if (current === lastSyncedUrl) return;
      lastSyncedUrl = current;
      syncUrl(tabId);
    }

    window.addEventListener('load', syncIfChanged);
    window.addEventListener('popstate', syncIfChanged);
    window.addEventListener('hashchange', syncIfChanged);
    document.addEventListener('click', () => setTimeout(syncIfChanged, 100), true);

    const origPush = history.pushState.bind(history);
    history.pushState = function (...args: Parameters<typeof history.pushState>) {
      origPush(...args);
      setTimeout(syncIfChanged, 50);
    };

    const origReplace = history.replaceState.bind(history);
    history.replaceState = function (...args: Parameters<typeof history.replaceState>) {
      origReplace(...args);
      setTimeout(syncIfChanged, 50);
    };

    setInterval(syncIfChanged, 1000);
  },
});
