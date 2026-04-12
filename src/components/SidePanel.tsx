import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { PanelResponseSchema } from '../lib/schema';
import type {
  PanelEvent,
  PanelResponse,
  SidePanelSession,
  WorkspaceTab,
} from '../lib/schema';
import {
  CloseIcon,
  PlusIcon,
  SearchIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  RefreshIcon,
} from './icons';

async function send(message: object): Promise<PanelResponse> {
  const response: unknown = await chrome.runtime.sendMessage(message);
  return PanelResponseSchema.parse(response);
}

function Favicon({ tab }: { tab: WorkspaceTab }) {
  if (tab.faviconUrl) {
    return <img alt="" className="sm__favicon" src={tab.faviconUrl} />;
  }
  return (
    <span aria-hidden className="sm__favicon sm__favicon--fallback">
      {tab.title.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function SidePanel() {
  const [session, setSession] = useState<SidePanelSession | null>(null);
  const [addressValue, setAddressValue] = useState('');

  useEffect(() => {
    void send({ type: 'PANEL_READY' }).then((res) => {
      if (res.ok && res.session) setSession(res.session);
    });

    const handler = (msg: unknown) => {
      const evt = msg as PanelEvent;
      if (evt.type === 'SESSION_UPDATED' && evt.session) {
        setSession(evt.session);
      }
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, []);

  const activeTab = useMemo(
    () =>
      session
        ? session.workspaceTabs.find((t) => t.id === session.activeTabId) ??
          session.workspaceTabs[0]
        : undefined,
    [session],
  );

  useEffect(() => {
    setAddressValue(activeTab?.url ?? '');
  }, [activeTab?.id]);

  const windowId = session?.windowId ?? 0;

  const handleNavigate = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!activeTab) return;
      await send({
        type: 'NAVIGATE_TAB',
        windowId,
        workspaceTabId: activeTab.id,
        input: addressValue,
      });
    },
    [activeTab, addressValue, windowId],
  );

  const handleCreate = useCallback(async () => {
    await send({ type: 'CREATE_TAB', windowId });
  }, [windowId]);

  const handleActivate = useCallback(
    async (id: string) => {
      await send({ type: 'ACTIVATE_TAB', windowId, workspaceTabId: id });
    },
    [windowId],
  );

  const handleClose = useCallback(
    async (id: string) => {
      await send({ type: 'CLOSE_TAB', windowId, workspaceTabId: id });
    },
    [windowId],
  );

  const handleBack = useCallback(async () => {
    if (!activeTab) return;
    await send({ type: 'GO_BACK', windowId, workspaceTabId: activeTab.id });
  }, [activeTab, windowId]);

  const handleForward = useCallback(async () => {
    if (!activeTab) return;
    await send({ type: 'GO_FORWARD', windowId, workspaceTabId: activeTab.id });
  }, [activeTab, windowId]);

  const handleReload = useCallback(async () => {
    if (!activeTab) return;
    await send({ type: 'RELOAD', windowId, workspaceTabId: activeTab.id });
  }, [activeTab, windowId]);

  if (!session) {
    return (
      <div className="sm sm--loading">
        <div className="sm__spinner" />
        <p>Initializing workspace...</p>
      </div>
    );
  }

  return (
    <div className="sm">
      <nav className="sm__tabbar" aria-label="Workspace tabs">
        <button
          className="sm__tab-btn sm__tab-btn--new"
          onClick={() => void handleCreate()}
          title="New tab"
          type="button"
        >
          <PlusIcon className="sm__icon" />
        </button>
        <div className="sm__tablist">
          {session.workspaceTabs.map((tab) => {
            const isActive = tab.id === session.activeTabId;
            return (
              <div key={tab.id} className={`sm__tab-slot${isActive ? ' is-active' : ''}`}>
                <button
                  className="sm__tab-btn"
                  onClick={() => void handleActivate(tab.id)}
                  title={tab.title}
                  type="button"
                >
                  <Favicon tab={tab} />
                  <span className="sm__tab-label">{tab.title}</span>
                </button>
                {session.workspaceTabs.length > 1 && (
                  <button
                    className="sm__tab-close"
                    onClick={() => void handleClose(tab.id)}
                    title={`Close ${tab.title}`}
                    type="button"
                  >
                    <CloseIcon className="sm__icon sm__icon--tiny" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </nav>

      <header className="sm__toolbar">
        <div className="sm__nav-buttons">
          <button
            className="sm__icon-btn"
            onClick={() => void handleBack()}
            title="Back"
            type="button"
          >
            <ArrowLeftIcon className="sm__icon" />
          </button>
          <button
            className="sm__icon-btn"
            onClick={() => void handleForward()}
            title="Forward"
            type="button"
          >
            <ArrowRightIcon className="sm__icon" />
          </button>
          <button
            className="sm__icon-btn"
            onClick={() => void handleReload()}
            title="Reload"
            type="button"
          >
            <RefreshIcon className="sm__icon" />
          </button>
        </div>

        <form className="sm__address" onSubmit={(e) => void handleNavigate(e)}>
          <label className="sm__search">
            <SearchIcon className="sm__icon sm__icon--muted" />
            <input
              aria-label="Address or search"
              autoComplete="off"
              className="sm__input"
              onChange={(e) => setAddressValue(e.target.value)}
              spellCheck={false}
              type="text"
              value={addressValue}
            />
          </label>
        </form>
      </header>

      {session.lastError && (
        <div className="sm__error" role="alert">
          {session.lastError}
        </div>
      )}

      {activeTab && (
        <div className="sm__status">
          <span className="sm__status-pill">Live</span>
          <span className="sm__status-text">{activeTab.title}</span>
        </div>
      )}
    </div>
  );
}
