import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  type FormEvent,
  useCallback,
  useEffect,
  useState,
} from 'react';
import ReactDOM from 'react-dom/client';

import '../src/styles/sidepanel.css';

interface WorkspaceTab {
  id: string;
  url: string;
  title: string;
  favicon_url: string | null;
}

interface WorkspaceState {
  tabs: WorkspaceTab[];
  active_tab_id: string;
  sidebar_visible: boolean;
}

function Favicon({ tab }: { tab: WorkspaceTab }) {
  if (tab.favicon_url) {
    return <img alt="" className="sm__favicon" src={tab.favicon_url} />;
  }
  return (
    <span aria-hidden className="sm__favicon sm__favicon--fallback">
      {tab.title.slice(0, 1).toUpperCase()}
    </span>
  );
}

function App() {
  const [state, setState] = useState<WorkspaceState | null>(null);
  const [addressValue, setAddressValue] = useState('');

  useEffect(() => {
    void invoke<WorkspaceState>('get_state').then(setState);
    const unlisten = listen<WorkspaceState>('state-changed', (e) => {
      setState(e.payload);
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, []);

  const activeTab = state?.tabs.find((t) => t.id === state.active_tab_id);

  useEffect(() => {
    if (activeTab) setAddressValue(activeTab.url);
  }, [activeTab?.id, activeTab?.url]);

  const handleNavigate = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!activeTab || !addressValue.trim()) return;
      const result = await invoke<WorkspaceState>('navigate_tab', {
        id: activeTab.id,
        url: addressValue,
      });
      setState(result);
    },
    [activeTab, addressValue],
  );

  const handleCreate = useCallback(async () => {
    const result = await invoke<WorkspaceState>('create_tab', { url: null });
    setState(result);
  }, []);

  const handleActivate = useCallback(async (id: string) => {
    const result = await invoke<WorkspaceState>('activate_tab', { id });
    setState(result);
  }, []);

  const handleClose = useCallback(async (id: string) => {
    const result = await invoke<WorkspaceState>('close_tab', { id });
    setState(result);
  }, []);

  const handleBack = useCallback(async () => {
    if (!activeTab) return;
    await invoke('go_back', { id: activeTab.id });
  }, [activeTab]);

  const handleForward = useCallback(async () => {
    if (!activeTab) return;
    await invoke('go_forward', { id: activeTab.id });
  }, [activeTab]);

  const handleReload = useCallback(async () => {
    if (!activeTab) return;
    await invoke('reload_tab', { id: activeTab.id });
  }, [activeTab]);

  const handleToggle = useCallback(async () => {
    const result = await invoke<WorkspaceState>('toggle_sidebar');
    setState(result);
  }, []);

  if (!state) {
    return (
      <div className="sm sm--loading">
        <div className="sm__spinner" />
        <p>Initializing...</p>
      </div>
    );
  }

  const showTabs = state.tabs.length > 1;

  return (
    <div className="sm">
      <header className="sm__toolbar">
        <div className="sm__toolbar-row">
          <div className="sm__nav-buttons">
            <button className="sm__icon-btn" onClick={() => void handleBack()} title="Back" type="button">
              &#8592;
            </button>
            <button className="sm__icon-btn" onClick={() => void handleForward()} title="Forward" type="button">
              &#8594;
            </button>
            <button className="sm__icon-btn" onClick={() => void handleReload()} title="Reload" type="button">
              &#8635;
            </button>
          </div>

          <form className="sm__address" onSubmit={(e) => void handleNavigate(e)}>
            <label className="sm__search">
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
              +
            </button>
          </div>
        </div>

        {showTabs && (
          <div className="sm__tabstrip">
            {state.tabs.map((tab) => {
              const isActive = tab.id === state.active_tab_id;
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
                  {state.tabs.length > 1 && (
                    <button
                      className="sm__chip-close"
                      onClick={() => void handleClose(tab.id)}
                      title={`Close ${tab.title}`}
                      type="button"
                    >
                      &times;
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </header>


    </div>
  );
}

const root = document.getElementById('root');
if (root) {
  ReactDOM.createRoot(root).render(<App />);
}
