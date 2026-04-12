import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
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
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [iframeError, setIframeError] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const navHistory = useRef<Map<string, string[]>>(new Map());

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
    if (activeTab) {
      setAddressValue(activeTab.url);
      setIframeError(false);
      setIframeLoaded(false);
    }
  }, [activeTab?.id, activeTab?.url]);

  const windowId = session?.windowId ?? 0;

  const handleNavigate = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!activeTab || !addressValue.trim()) return;

      const history = navHistory.current.get(activeTab.id) ?? [];
      navHistory.current.set(activeTab.id, [...history, activeTab.url]);

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

  const handleBack = useCallback(() => {
    if (!activeTab) return;
    const history = navHistory.current.get(activeTab.id);
    if (history && history.length > 0) {
      const prevUrl = history.pop()!;
      navHistory.current.set(activeTab.id, history);
      void send({
        type: 'NAVIGATE_TAB',
        windowId,
        workspaceTabId: activeTab.id,
        input: prevUrl,
      });
    }
  }, [activeTab, windowId]);

  const handleForward = useCallback(() => {
    // forward nav not tracked in v1 — iframe handles its own internal forward via browser
  }, []);

  const handleReload = useCallback(() => {
    if (iframeRef.current) {
      iframeRef.current.src = iframeRef.current.src;
    }
  }, []);

  const handleIframeLoad = useCallback(() => {
    setIframeLoaded(true);
    setIframeError(false);
  }, []);

  const handleIframeError = useCallback(() => {
    setIframeError(true);
    setIframeLoaded(true);
  }, []);

  if (!session) {
    return (
      <div className="sm sm--loading">
        <div className="sm__spinner" />
        <p>Initializing workspace...</p>
      </div>
    );
  }

  const showTabs = session.workspaceTabs.length > 1;

  return (
    <div className="sm">
      <header className="sm__toolbar">
        <div className="sm__toolbar-row">
          <div className="sm__nav-buttons">
            <button
              className="sm__icon-btn"
              onClick={handleBack}
              title="Back"
              type="button"
            >
              <ArrowLeftIcon className="sm__icon" />
            </button>
            <button
              className="sm__icon-btn"
              onClick={handleForward}
              title="Forward"
              type="button"
            >
              <ArrowRightIcon className="sm__icon" />
            </button>
            <button
              className="sm__icon-btn"
              onClick={handleReload}
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

          <div className="sm__tab-actions">
            <button
              className="sm__icon-btn"
              onClick={() => void handleCreate()}
              title="New tab"
              type="button"
            >
              <PlusIcon className="sm__icon" />
            </button>
          </div>
        </div>

        {showTabs && (
          <div className="sm__tabstrip">
            {session.workspaceTabs.map((tab) => {
              const isActive = tab.id === session.activeTabId;
              return (
                <div key={tab.id} className={`sm__chip${isActive ? ' is-active' : ''}`}>
                  <button
                    className="sm__chip-btn"
                    onClick={() => void handleActivate(tab.id)}
                    title={tab.title}
                    type="button"
                  >
                    <Favicon tab={tab} />
                    <span className="sm__chip-label">{tab.title}</span>
                  </button>
                  <button
                    className="sm__chip-close"
                    onClick={() => void handleClose(tab.id)}
                    title={`Close ${tab.title}`}
                    type="button"
                  >
                    <CloseIcon className="sm__icon sm__icon--tiny" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </header>

      <div className="sm__viewer">
        {activeTab && (
          <>
            {!iframeLoaded && (
              <div className="sm__viewer-loader">
                <div className="sm__spinner" />
              </div>
            )}
            {iframeError && (
              <div className="sm__viewer-error">
                <p>This page cannot be displayed in the sidebar.</p>
                <p className="sm__viewer-error-hint">
                  The site may use frame-busting techniques.
                </p>
              </div>
            )}
            <iframe
              ref={iframeRef}
              key={activeTab.id}
              src={activeTab.url}
              className="sm__iframe"
              sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
              onLoad={handleIframeLoad}
              onError={handleIframeError}
            />
          </>
        )}
      </div>

      {session.lastError && (
        <div className="sm__error" role="alert">
          {session.lastError}
        </div>
      )}
    </div>
  );
}
