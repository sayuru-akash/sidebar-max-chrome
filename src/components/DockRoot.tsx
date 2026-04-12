import {
  startTransition,
  type CSSProperties,
  type FormEvent,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from 'react';

import { HOVER_COLLAPSE_DELAY_MS, HOVER_EXPAND_DELAY_MS } from '../lib/constants';
import { DockResponseSchema } from '../lib/schema';
import type {
  DockEventMessage,
  DockResponse,
  DockWindowSession,
  WorkspaceTab,
} from '../lib/schema';
import type { PageLayoutController } from '../lib/dom-layout';
import { CloseIcon, PinIcon, PlusIcon, SearchIcon } from './icons';

type DockRootProps = {
  pageLayout: PageLayoutController;
};

const SESSION_RETRY_COUNT = 20;
const SESSION_RETRY_DELAY_MS = 150;

async function sendMessage(message: object): Promise<DockResponse> {
  const response: unknown = await chrome.runtime.sendMessage(message);
  return DockResponseSchema.parse(response);
}

function getWorkspaceTabById(
  session: DockWindowSession | null,
  workspaceTabId: string,
): WorkspaceTab | undefined {
  return session?.workspaceTabs.find((tab) => tab.id === workspaceTabId);
}

function Favicon({ tab }: { tab: WorkspaceTab }) {
  if (tab.faviconUrl) {
    return <img alt="" className="sidebar-max__favicon" src={tab.faviconUrl} />;
  }

  return (
    <span aria-hidden className="sidebar-max__favicon sidebar-max__favicon--fallback">
      {tab.title.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function DockRoot({ pageLayout }: DockRootProps) {
  const [session, setSession] = useState<DockWindowSession | null>(null);
  const [addressValue, setAddressValue] = useState('');
  const [surfaceMessage, setSurfaceMessage] = useState<string | null>(null);
  const collapseTimerRef = useRef<number | null>(null);
  const expandTimerRef = useRef<number | null>(null);
  const hydrateTimerRef = useRef<number | null>(null);

  const applySession = useEffectEvent((nextSession: DockWindowSession | null) => {
    pageLayout.apply(nextSession);
    startTransition(() => {
      setSession(nextSession);
    });
  });

  const hydrateSession = useEffectEvent(async () => {
    for (let attempt = 0; attempt < SESSION_RETRY_COUNT; attempt += 1) {
      const response = await sendMessage({
        type: 'UI_READY',
      }).catch(() => null);

      if (response?.ok && response.session) {
        applySession(response.session);
        return;
      }

      if (attempt < SESSION_RETRY_COUNT - 1) {
        await new Promise<void>((resolve) => {
          hydrateTimerRef.current = window.setTimeout(resolve, SESSION_RETRY_DELAY_MS);
        });
      }
    }
  });

  useEffect(() => {
    void hydrateSession();

    const handleMessage = (message: unknown) => {
      const runtimeMessage = message as DockEventMessage;
      if (
        runtimeMessage.type === 'SESSION_UPDATED' &&
        (!session || runtimeMessage.windowId === session.windowId)
      ) {
        applySession(runtimeMessage.session);
      }
      if (
        runtimeMessage.type === 'SESSION_CLOSED' &&
        (!session || runtimeMessage.windowId === session.windowId)
      ) {
        applySession(null);
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);

    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
      pageLayout.teardown();
      if (collapseTimerRef.current !== null) {
        window.clearTimeout(collapseTimerRef.current);
      }
      if (expandTimerRef.current !== null) {
        window.clearTimeout(expandTimerRef.current);
      }
      if (hydrateTimerRef.current !== null) {
        window.clearTimeout(hydrateTimerRef.current);
      }
    };
  }, [applySession, hydrateSession, pageLayout, session]);

  const activeWorkspaceTab = useMemo(
    () =>
      session
        ? getWorkspaceTabById(session, session.activeWorkspaceTabId) ?? session.workspaceTabs[0]
        : undefined,
    [session],
  );

  useEffect(() => {
    setAddressValue(activeWorkspaceTab?.url ?? '');
  }, [activeWorkspaceTab?.id, activeWorkspaceTab?.url]);

  if (!session || !activeWorkspaceTab) {
    return null;
  }

  const windowId = session.windowId;

  async function updatePinnedState(pinned: boolean): Promise<void> {
    await sendMessage({
      type: 'SET_PINNED',
      windowId,
      pinned,
    });
  }

  async function updateCollapsedState(collapsed: boolean): Promise<void> {
    await sendMessage({
      type: 'SET_COLLAPSED',
      windowId,
      collapsed,
    });
  }

  async function handleAddressSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSurfaceMessage(null);
    await sendMessage({
      type: 'NAVIGATE_WORKSPACE_TAB',
      windowId,
      workspaceTabId: activeWorkspaceTab.id,
      input: addressValue,
    });
  }

  async function handleCreateTab() {
    setSurfaceMessage(null);
    await sendMessage({
      type: 'CREATE_WORKSPACE_TAB',
      windowId,
    });
  }

  async function handleCloseDock() {
    await sendMessage({
      type: 'CLOSE_DOCK',
      windowId,
    });
  }

  async function handleActivateTab(workspaceTabId: string) {
    setSurfaceMessage(null);
    await sendMessage({
      type: 'ACTIVATE_WORKSPACE_TAB',
      windowId,
      workspaceTabId,
    });
  }

  async function handleCloseWorkspaceTab(workspaceTabId: string) {
    setSurfaceMessage(null);
    await sendMessage({
      type: 'CLOSE_WORKSPACE_TAB',
      windowId,
      workspaceTabId,
    });
  }

  function scheduleCollapse(): void {
    if (session.pinned) {
      return;
    }

    if (expandTimerRef.current !== null) {
      window.clearTimeout(expandTimerRef.current);
    }

    collapseTimerRef.current = window.setTimeout(() => {
      void updateCollapsedState(true);
    }, HOVER_COLLAPSE_DELAY_MS);
  }

  function scheduleExpand(): void {
    if (session.pinned) {
      return;
    }

    if (collapseTimerRef.current !== null) {
      window.clearTimeout(collapseTimerRef.current);
    }

    expandTimerRef.current = window.setTimeout(() => {
      void updateCollapsedState(false);
    }, HOVER_EXPAND_DELAY_MS);
  }

  return (
    <div
      className={[
        'sidebar-max',
        session.pinned ? 'is-pinned' : 'is-floating',
        session.collapsed ? 'is-collapsed' : 'is-open',
      ].join(' ')}
      style={
        {
          '--sidebar-max-width': `${session.dockWidth}px`,
        } as CSSProperties
      }
      onMouseEnter={scheduleExpand}
      onMouseLeave={scheduleCollapse}
    >
      <button
        aria-label="Expand and pin workspace"
        className="sidebar-max__hover-rail"
        onClick={() => void updatePinnedState(true)}
        type="button"
      />

      <aside className="sidebar-max__shell" aria-label="Sidebar Max workspace">
        <nav className="sidebar-max__tabs" aria-label="Workspace tabs">
          <button
            className="sidebar-max__tab-button sidebar-max__tab-button--new"
            onClick={() => {
              void handleCreateTab();
            }}
            title="New workspace tab"
            type="button"
          >
            <PlusIcon className="sidebar-max__icon" />
          </button>
          {session.workspaceTabs.map((workspaceTab) => {
            const isActive = workspaceTab.id === session.activeWorkspaceTabId;

            return (
              <div key={workspaceTab.id} className="sidebar-max__tab-slot">
                <button
                  className={[
                    'sidebar-max__tab-button',
                    isActive ? 'is-active' : '',
                  ].join(' ')}
                  onClick={() => void handleActivateTab(workspaceTab.id)}
                  title={workspaceTab.title}
                  type="button"
                >
                  <Favicon tab={workspaceTab} />
                </button>
                {session.workspaceTabs.length > 1 ? (
                  <button
                    className="sidebar-max__tab-close"
                    onClick={() => void handleCloseWorkspaceTab(workspaceTab.id)}
                    title={`Close ${workspaceTab.title}`}
                    type="button"
                  >
                    <CloseIcon className="sidebar-max__icon sidebar-max__icon--tiny" />
                  </button>
                ) : null}
              </div>
            );
          })}
        </nav>

        <section className="sidebar-max__chrome">
          <header className="sidebar-max__header">
            <div className="sidebar-max__header-copy">
              <p className="sidebar-max__eyebrow">Workspace</p>
              <h1 className="sidebar-max__title">{activeWorkspaceTab.title}</h1>
            </div>
            <div className="sidebar-max__header-actions">
              <button
                aria-label={session.pinned ? 'Unpin workspace' : 'Pin workspace'}
                className="sidebar-max__icon-button"
                onClick={() => void updatePinnedState(!session.pinned)}
                type="button"
              >
                <PinIcon className="sidebar-max__icon" />
              </button>
              <button
                aria-label="Close workspace"
                className="sidebar-max__icon-button"
                onClick={() => {
                  void handleCloseDock();
                }}
                type="button"
              >
                <CloseIcon className="sidebar-max__icon" />
              </button>
            </div>
          </header>

          <form
            className="sidebar-max__address"
            onSubmit={(event) => {
              void handleAddressSubmit(event);
            }}
          >
            <label className="sidebar-max__search">
              <SearchIcon className="sidebar-max__icon sidebar-max__icon--muted" />
              <input
                aria-label="Address or search"
                autoComplete="off"
                className="sidebar-max__input"
                onChange={(event) => setAddressValue(event.target.value)}
                spellCheck={false}
                type="text"
                value={addressValue}
              />
            </label>
            <button className="sidebar-max__submit" type="submit">
              Go
            </button>
          </form>

          {session.lastError ? (
            <div className="sidebar-max__notice" role="status">
              <div>{session.lastError}</div>
            </div>
          ) : (
            <div className="sidebar-max__status-strip" role="status">
              <span className="sidebar-max__status-pill">Real Browser</span>
              <span className="sidebar-max__status-text">
                {session.pinned
                  ? 'Pinned on the right edge'
                  : session.collapsed
                    ? 'Collapsed'
                    : 'Hover-expanded'}
              </span>
            </div>
          )}

          {surfaceMessage ? (
            <div className="sidebar-max__surface-message">{surfaceMessage}</div>
          ) : null}
        </section>
      </aside>
    </div>
  );
}
