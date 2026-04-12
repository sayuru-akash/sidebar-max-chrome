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
} from '../lib/schema';
import { loadSessionSnapshot, saveSessionSnapshot, saveWindowSession } from '../lib/storage';
import { getDisplayTitle, getFaviconUrl, normalizeAddressInput } from '../lib/url';
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

    chrome.windows.onRemoved.addListener((windowId) => {
      void this.onWindowRemoved(windowId);
    });
  }

  private async initialize(): Promise<void> {
    this.snapshot = await loadSessionSnapshot();
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
    }
  }

  private async resolveWindowId(sender: RuntimeSender): Promise<number | null> {
    if (sender.tab?.windowId !== undefined) {
      return sender.tab.windowId;
    }
    try {
      const win = await chrome.windows.getLastFocused();
      return win.id ?? null;
    } catch {
      return null;
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
      const windowId = await this.resolveWindowId(sender);
      if (windowId === null) {
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
        const wsTab = createWorkspaceTab(url, {
          title: getDisplayTitle(url),
          faviconUrl: getFaviconUrl(url),
        });
        const next = addTab(session, wsTab);
        this.setSession(req.windowId, setError(next, null));
        return { ok: true, session: this.sessions.get(req.windowId) as SidePanelSession };
      }

      case 'NAVIGATE_TAB': {
        const target = session.workspaceTabs.find((t) => t.id === req.workspaceTabId);
        if (!target) return { ok: false, error: 'Tab not found.' };

        const { url } = normalizeAddressInput(req.input);
        const next = updateTab(session, target.id, {
          url,
          title: getDisplayTitle(url),
          faviconUrl: getFaviconUrl(url),
        });
        this.setSession(req.windowId, setError(next, null));
        return { ok: true, session: this.sessions.get(req.windowId) as SidePanelSession };
      }

      case 'ACTIVATE_TAB': {
        const next = activateTab(session, req.workspaceTabId);
        this.setSession(req.windowId, next);
        return { ok: true, session: next };
      }

      case 'CLOSE_TAB': {
        const next = removeTab(session, req.workspaceTabId);
        this.setSession(req.windowId, setError(next, null));
        return { ok: true, session: this.sessions.get(req.windowId) as SidePanelSession };
      }

      case 'GO_BACK':
      case 'GO_FORWARD':
      case 'RELOAD': {
        return { ok: true, session };
      }

      default:
        return { ok: false, error: 'Unhandled.' };
    }
  }

  private async onWindowRemoved(windowId: number): Promise<void> {
    const session = this.sessions.get(windowId);
    if (!session) return;
    await this.persistSnapshot(session);
    this.sessions.delete(windowId);
  }
}
