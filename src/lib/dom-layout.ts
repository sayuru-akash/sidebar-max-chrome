import {
  COLLAPSED_RAIL_WIDTH,
  PAGE_LAYOUT_ATTRIBUTE,
  PAGE_LAYOUT_STYLE_ID,
  WORKSPACE_RAIL_WIDTH,
  WORKSPACE_TOPBAR_HEIGHT,
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

    const leftInset = session.collapsed ? COLLAPSED_RAIL_WIDTH : WORKSPACE_RAIL_WIDTH;
    const topInset = session.collapsed ? 0 : WORKSPACE_TOPBAR_HEIGHT;

    rootElement.setAttribute(PAGE_LAYOUT_ATTRIBUTE, session.state);
    bodyElement?.setAttribute(PAGE_LAYOUT_ATTRIBUTE, session.state);
    styleElement.textContent = `
      html[${PAGE_LAYOUT_ATTRIBUTE}],
      body[${PAGE_LAYOUT_ATTRIBUTE}] {
        transition:
          margin-left 220ms cubic-bezier(0.2, 0.8, 0.2, 1),
          margin-top 220ms cubic-bezier(0.2, 0.8, 0.2, 1),
          width 220ms cubic-bezier(0.2, 0.8, 0.2, 1),
          height 220ms cubic-bezier(0.2, 0.8, 0.2, 1),
          transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
      }

      html[${PAGE_LAYOUT_ATTRIBUTE}] {
        overflow: clip !important;
      }

      body[${PAGE_LAYOUT_ATTRIBUTE}] {
        margin-left: ${leftInset}px !important;
        margin-top: ${topInset}px !important;
        width: calc(100% - ${leftInset}px) !important;
        height: calc(100% - ${topInset}px) !important;
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
