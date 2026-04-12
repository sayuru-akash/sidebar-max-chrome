/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */

import '../src/styles/dock.css';

import ReactDOM, { type Root } from 'react-dom/client';

import { createShadowRootUi, defineContentScript } from '#imports';

import { createPageLayoutController } from '../src/lib/dom-layout';
import { DockRoot } from '../src/components/DockRoot';

const MOUNTED_ATTRIBUTE = 'data-sidebar-max-mounted';

type ShadowDockUi = {
  mount: () => Promise<void>;
  remove: () => void;
};

export default defineContentScript({
  matches: ['<all_urls>'],
  registration: 'runtime',
  cssInjectionMode: 'ui',
  async main(ctx) {
    if (document.documentElement.hasAttribute(MOUNTED_ATTRIBUTE)) {
      return;
    }

    document.documentElement.setAttribute(MOUNTED_ATTRIBUTE, 'true');
    const pageLayout = createPageLayoutController(document);

    const ui = (await createShadowRootUi(ctx, {
      name: 'sidebar-max-dock',
      position: 'inline',
      anchor: 'body',
      isolateEvents: ['keydown', 'keyup', 'keypress'],
      onMount: (container: HTMLElement) => {
        const app = document.createElement('div');
        container.append(app);

        const root: Root = ReactDOM.createRoot(app);
        root.render(<DockRoot pageLayout={pageLayout} />);

        return root;
      },
      onRemove: (root?: Root) => {
        document.documentElement.removeAttribute(MOUNTED_ATTRIBUTE);
        root?.unmount();
        pageLayout.teardown();
      },
    })) as ShadowDockUi;

    await ui.mount();

    const closeListener = (message: unknown) => {
      const payload = message as { type?: string };
      if (payload.type === 'SESSION_CLOSED') {
        ui.remove();
      }
    };

    chrome.runtime.onMessage.addListener(closeListener);
    ctx.onInvalidated(() => {
      chrome.runtime.onMessage.removeListener(closeListener);
      ui.remove();
    });
  },
});
