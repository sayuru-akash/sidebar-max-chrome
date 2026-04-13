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

    if (window.name.startsWith('sm-offscreen-')) {
      function autoPlay(): void {
        document.querySelectorAll('video').forEach((v) => {
          try { void v.play(); } catch { /* autoplay blocked */ }
        });
        document.querySelectorAll('audio').forEach((a) => {
          try { void a.play(); } catch { /* autoplay blocked */ }
        });
      }
      autoPlay();
      document.addEventListener('load', autoPlay);
      setInterval(autoPlay, 3000);
      return;
    }

    if (window.name !== 'sm-panel') return;

    let lastSyncedUrl = '';

    function syncUrl(): void {
      const current = window.location.href;
      if (current === lastSyncedUrl) return;
      lastSyncedUrl = current;
      try {
        chrome.runtime.sendMessage({
          type: 'SYNC_IFRAME_URL',
          url: current,
        }).catch(() => {});
      } catch {
        // extension context invalidated
      }
    }

    window.addEventListener('load', syncUrl);
    window.addEventListener('popstate', syncUrl);
    window.addEventListener('hashchange', syncUrl);
    document.addEventListener('click', () => setTimeout(syncUrl, 100), true);

    if ('navigation' in window) {
      try {
        (window as unknown as { navigation: EventTarget }).navigation.addEventListener('navigate', () => setTimeout(syncUrl, 50));
      } catch { /* Navigation API not available */ }
    }

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

    setInterval(syncUrl, 500);
  },
});
