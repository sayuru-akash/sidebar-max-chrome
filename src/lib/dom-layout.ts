import {
  COLLAPSED_RAIL_WIDTH,
  PAGE_LAYOUT_ATTRIBUTE,
  PAGE_LAYOUT_STYLE_ID,
} from './constants';
import type { DockWindowSession } from './schema';

export type PageLayoutController = ReturnType<typeof createPageLayoutController>;

export function createPageLayoutController(doc: Document = document) {
  const styleElement =
    doc.getElementById(PAGE_LAYOUT_STYLE_ID) ??
    Object.assign(doc.createElement('style'), {
      id: PAGE_LAYOUT_STYLE_ID,
    });

  if (!styleElement.isConnected) {
    doc.head.append(styleElement);
  }

  const rootElement = doc.documentElement;
  const bodyElement = doc.body;

  function reset(): void {
    styleElement.textContent = '';
    rootElement.removeAttribute(PAGE_LAYOUT_ATTRIBUTE);
    bodyElement?.removeAttribute(PAGE_LAYOUT_ATTRIBUTE);
  }

  function apply(session: DockWindowSession | null): void {
    if (!session) {
      reset();
      return;
    }

    const shift = session.pinned
      ? session.dockWidth
      : session.collapsed
        ? COLLAPSED_RAIL_WIDTH
        : 0;

    rootElement.setAttribute(PAGE_LAYOUT_ATTRIBUTE, session.state);
    bodyElement?.setAttribute(PAGE_LAYOUT_ATTRIBUTE, session.state);
    styleElement.textContent = `
      html[${PAGE_LAYOUT_ATTRIBUTE}],
      body[${PAGE_LAYOUT_ATTRIBUTE}] {
        transition:
          margin-right 220ms cubic-bezier(0.2, 0.8, 0.2, 1),
          width 220ms cubic-bezier(0.2, 0.8, 0.2, 1),
          transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
      }

      html[${PAGE_LAYOUT_ATTRIBUTE}] {
        overflow-x: clip !important;
      }

      body[${PAGE_LAYOUT_ATTRIBUTE}] {
        margin-right: ${shift}px !important;
        width: calc(100% - ${shift}px) !important;
      }
    `;
  }

  return {
    apply,
    teardown() {
      reset();
      styleElement.remove();
    },
  };
}

