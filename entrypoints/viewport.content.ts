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
  },
});
