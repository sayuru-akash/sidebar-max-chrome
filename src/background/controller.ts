import {
  DEFAULT_WORKSPACE_START_URL,
  TOGGLE_COMMAND,
  SESSION_SYNC_DEBOUNCE_MS,
} from '../lib/constants';
import {
  PanelRequestSchema,
  type PanelEvent,
  type PanelResponse,
  type SidePanelSession,
  type WorkspaceTab,
} from '../lib/schema';
import { loadSessionSnapshot, saveSessionSnapshot, saveWindowSession } from '../lib/storage';
import { getDisplayTitle, normalizeAddressInput } from '../lib/url';
import {
  activateTab,
  addTab,
  createSession,
  createWorkspaceTab,
  removeTab,
  setError,
  toSnapshot,
  updateTab,
} from '../lib/workspace';

type RuntimeSender = chrome.runtime.MessageSender;

export class SidePanelController {
  private readonly initPromise: Promise<void>;
  private sessions = new Map<number, SidePanelSession>();
  private persistTimer: number | null = null;
  private snapshot: Awaited<ReturnType<typeof loadSessionSnapshot>> = null;

  constructor() {
    this.initPromise = this.initialize();
  }

  async start(): Promise<void> {
    await this.initPromise;

    chrome.action.onClicked.addListener((tab) => {
      if (tab.windowId !== undefined) {
        void this.togglePanel(tab.windowId);
      }
    });

    chrome.commands.onCommand.addListener((command) => {
      if (command === TOGGLE_COMMAND) {
        void chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
          if (tab?.windowId !== undefined) {
            void this.togglePanel(tab.windowId);
          }
        });
      }
    });

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      void this.handleMessage(message, sender).then(sendResponse);
      return true;
    });

    chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
      this.onTabUpdated(tabId, info as { url?: string; title?: string; favIconUrl?: string }, tab);
    });

    chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
      this.onTabRemoved(tabId, removeInfo.windowId);
    });

    chrome.windows.onRemoved.addListener((windowId) => {
      void this.onWindowRemoved(windowId);
    });
  }

  private async initialize(): Promise<void> {
    this.snapshot = await loadSessionSnapshot();
  }

  private getSession(windowId: number): SidePanelSession | null {
    return this.sessions.get(windowId) ?? null;
  }

  private setSession(windowId: number, session: SidePanelSession): void {
    this.sessions.set(windowId, session);
    this.schedulePersistence();
    this.sendToPanel(windowId, {
      type: 'SESSION_UPDATED',
      session,
    });
  }

  private schedulePersistence(): void {
    if (this.persistTimer !== null) {
      globalThis.clearTimeout(this.persistTimer);
    }
    this.persistTimer = globalThis.setTimeout(() => {
      void this.persistAll();
      this.persistTimer = null;
    }, SESSION_SYNC_DEBOUNCE_MS);
  }

  private async persistAll(): Promise<void> {
    for (const session of this.sessions.values()) {
      await saveWindowSession(session);
    }
  }

  private async persistSnapshot(session: SidePanelSession): Promise<void> {
    const snap = toSnapshot(session);
    this.snapshot = snap['last-session'];
    if (this.snapshot) {
      await saveSessionSnapshot(this.snapshot);
    }
  }

  private sendToPanel(windowId: number, event: PanelEvent): void {
    chrome.runtime.sendMessage(event).catch(() => {
      // panel not open
    });
  }

  private async togglePanel(windowId: number): Promise<void> {
    await chrome.sidePanel.open({ windowId });
    if (!this.sessions.has(windowId)) {
      const session = createSession(windowId, this.snapshot);
      this.sessions.set(windowId, session);
      await saveWindowSession(session);

      const tab = session.workspaceTabs[0];
      if (tab) {
        const created = await chrome.tabs.create({
          windowId,
          url: tab.url,
          active: false,
        });
        const next = updateTab(session, tab.id, {
          nativeTabId: created.id ?? null,
          title: created.title ?? tab.title,
          faviconUrl: created.favIconUrl ?? null,
        });
        this.sessions.set(windowId, next);
      }
    }
  }

  private async handleMessage(
    message: unknown,
    sender: RuntimeSender,
  ): Promise<PanelResponse> {
    await this.initPromise;

    const parsed = PanelRequestSchema.safeParse(message);
    if (!parsed.success) {
      return { ok: false, error: 'Invalid message.' };
    }

    const req = parsed.data;

    if (req.type === 'PANEL_READY') {
      const windowId = sender.tab?.windowId;
      if (windowId === undefined) {
        // Try to find any active session or the last focused window
        const lastFocused = await chrome.windows.getLastFocused();
        if (lastFocused.id !== undefined) {
          let session = this.sessions.get(lastFocused.id) ?? null;
          if (!session) {
            session = createSession(lastFocused.id, this.snapshot);
            this.sessions.set(lastFocused.id, session);
            await saveWindowSession(session);
          }
          return { ok: true, session };
        }
        return { ok: false, error: 'Cannot determine window.' };
      }

      let session = this.sessions.get(windowId) ?? null;
      if (!session) {
        session = createSession(windowId, this.snapshot);
        this.sessions.set(windowId, session);
        await saveWindowSession(session);
      }
      return { ok: true, session };
    }

    if (req.type === 'GET_SESSION') {
      const session = this.sessions.get(req.windowId);
      return session
        ? { ok: true, session }
        : { ok: false, error: 'No session for this window.' };
    }

    const session = this.sessions.get(req.windowId);
    if (!session) {
      return { ok: false, error: 'No session.' };
    }

    switch (req.type) {
      case 'CREATE_TAB': {
        const rawInput = req.input?.trim();
        const url = rawInput
          ? normalizeAddressInput(rawInput).url
          : DEFAULT_WORKSPACE_START_URL;
        const createdTab = await chrome.tabs.create({
          windowId: session.windowId,
          url,
          active: true,
        });
        const wsTab = createWorkspaceTab(url, {
          nativeTabId: createdTab.id ?? null,
          title: createdTab.title ?? getDisplayTitle(url),
          faviconUrl: createdTab.favIconUrl ?? null,
        });
        const next = addTab(session, wsTab);
        this.setSession(req.windowId, setError(next, null));
        return { ok: true, session: this.sessions.get(req.windowId) as SidePanelSession };
      }

      case 'NAVIGATE_TAB': {
        const target = session.workspaceTabs.find((t) => t.id === req.workspaceTabId);
        if (!target) return { ok: false, error: 'Tab not found.' };

        const { url } = normalizeAddressInput(req.input);
        if (target.nativeTabId !== null) {
          await chrome.tabs.update(target.nativeTabId, { url, active: true });
        } else {
          const created = await chrome.tabs.create({
            windowId: session.windowId,
            url,
            active: true,
          });
          const next = updateTab(session, target.id, {
            nativeTabId: created.id ?? null,
            url,
          });
          this.setSession(req.windowId, next);
        }
        return { ok: true, session: this.sessions.get(req.windowId) as SidePanelSession };
      }

      case 'ACTIVATE_TAB': {
        const target = session.workspaceTabs.find((t) => t.id === req.workspaceTabId);
        if (!target) return { ok: false, error: 'Tab not found.' };
        if (target.nativeTabId !== null) {
          await chrome.tabs.update(target.nativeTabId, { active: true });
        }
        const next = activateTab(session, req.workspaceTabId);
        this.setSession(req.windowId, next);
        return { ok: true, session: next };
      }

      case 'CLOSE_TAB': {
        const target = session.workspaceTabs.find((t) => t.id === req.workspaceTabId);
        if (target?.nativeTabId !== null && target?.nativeTabId !== undefined) {
          try {
            await chrome.tabs.remove(target.nativeTabId);
          } catch {
            // already closed
          }
        }
        const next = removeTab(session, req.workspaceTabId);

        // activate the new active tab's real tab
        const newActive = next.workspaceTabs.find((t) => t.id === next.activeTabId);
        if (newActive?.nativeTabId !== null && newActive?.nativeTabId !== undefined) {
          try {
            await chrome.tabs.update(newActive.nativeTabId, { active: true });
          } catch {
            // ignore
          }
        }

        this.setSession(req.windowId, setError(next, null));
        return { ok: true, session: this.sessions.get(req.windowId) as SidePanelSession };
      }

      case 'GO_BACK': {
        const target = session.workspaceTabs.find((t) => t.id === req.workspaceTabId);
        if (target?.nativeTabId == null) return { ok: false, error: 'No native tab.' };
        try {
          await chrome.tabs.goBack(target.nativeTabId);
        } catch {
          // ignore
        }
        return { ok: true, session };
      }

      case 'GO_FORWARD': {
        const target = session.workspaceTabs.find((t) => t.id === req.workspaceTabId);
        if (target?.nativeTabId == null) return { ok: false, error: 'No native tab.' };
        try {
          await chrome.tabs.goForward(target.nativeTabId);
        } catch {
          // ignore
        }
        return { ok: true, session };
      }

      case 'RELOAD': {
        const target = session.workspaceTabs.find((t) => t.id === req.workspaceTabId);
        if (target?.nativeTabId == null) return { ok: false, error: 'No native tab.' };
        await chrome.tabs.reload(target.nativeTabId);
        return { ok: true, session };
      }

      default:
        return { ok: false, error: 'Unhandled.' };
    }
  }

  private onTabUpdated(
    tabId: number,
    info: { url?: string; title?: string; favIconUrl?: string },
    tab: chrome.tabs.Tab,
  ): void {
    if (tab.windowId === undefined) return;

    const session = this.sessions.get(tab.windowId);
    if (!session) return;

    const wsTab = session.workspaceTabs.find((t) => t.nativeTabId === tabId);
    if (!wsTab) return;

    const updates: Partial<WorkspaceTab> = {};
    if (info.url) updates.url = info.url;
    if (info.title) updates.title = info.title;
    if (info.favIconUrl) updates.faviconUrl = info.favIconUrl;

    if (Object.keys(updates).length > 0) {
      const next = updateTab(session, wsTab.id, updates);
      this.setSession(tab.windowId, next);
    }
  }

  private onTabRemoved(tabId: number, windowId: number): void {
    const session = this.sessions.get(windowId);
    if (!session) return;

    const wsTab = session.workspaceTabs.find((t) => t.nativeTabId === tabId);
    if (!wsTab) return;

    const next = removeTab(session, wsTab.id);
    this.setSession(windowId, setError(next, null));
  }

  private async onWindowRemoved(windowId: number): Promise<void> {
    const session = this.sessions.get(windowId);
    if (!session) return;
    await this.persistSnapshot(session);
    this.sessions.delete(windowId);
  }
}
