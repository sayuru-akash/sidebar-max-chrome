import {
  CONTENT_SCRIPT_FILE,
  DEFAULT_WORKSPACE_START_URL,
  EXTENSION_NAME,
  SESSION_SYNC_DEBOUNCE_MS,
  TOGGLE_COMMAND,
} from '../lib/constants';
import { probeUrlForEmbedding } from '../lib/embed';
import {
  DockRequestMessageSchema,
  type DockEventMessage,
  type DockResponse,
  type DockWindowSession,
  type StoredWorkspaceSnapshot,
  type UserPreferences,
  type WorkspaceTab,
} from '../lib/schema';
import {
  DEFAULT_USER_PREFERENCES,
  loadStoredWorkspaceSnapshot,
  loadUserPreferences,
  loadWindowSessions,
  saveStoredWorkspaceSnapshot,
  saveUserPreferences,
  saveWindowSessions,
} from '../lib/storage';
import { getDisplayTitle, isSupportedDockUrl, normalizeAddressInput } from '../lib/url';
import {
  activateWorkspaceTab,
  closeWorkspaceTabInSession,
  createWindowSession,
  createWorkspaceTab,
  createWorkspaceTabInSession,
  setCollapsedState,
  setHostAccessGranted,
  setPinnedState,
  setSessionError,
  toStoredWorkspaceSnapshot,
  updateWorkspaceTab,
} from '../lib/workspace';

type RuntimeMessageSender = chrome.runtime.MessageSender;
type BrowserTabChangeInfo = {
  title?: string;
  favIconUrl?: string;
  url?: string;
  status?: string;
};

function formatBlockedReason(url: string, details?: string): string {
  const title = getDisplayTitle(url);
  if (details) {
    return `${title} blocks embedded browsing (${details}). Open it in a browser tab from the dock.`;
  }

  return `${title} blocks embedded browsing. Open it in a browser tab from the dock.`;
}

export class DockBackgroundController {
  private readonly initPromise: Promise<void>;
  private userPreferences: UserPreferences = DEFAULT_USER_PREFERENCES;
  private tabSessions = new Map<number, DockWindowSession>();
  private storedSnapshot: StoredWorkspaceSnapshot | null = null;
  private persistTimer: number | null = null;

  constructor() {
    this.initPromise = this.initialize();
  }

  async start(): Promise<void> {
    await this.initPromise;

    chrome.action.onClicked.addListener((tab) => {
      void this.openFromBrowserAction(tab);
    });
    chrome.commands.onCommand.addListener((command) => {
      if (command === TOGGLE_COMMAND) {
        void this.openFromFocusedTab();
      }
    });
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      void this.handleIncomingMessage(message, sender).then(sendResponse);
      return true;
    });
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      void this.handleBrowserTabUpdated(tabId, changeInfo, tab);
    });
    chrome.tabs.onRemoved.addListener((tabId) => {
      void this.handleBrowserTabRemoved(tabId);
    });
  }

  private async initialize(): Promise<void> {
    const [preferences, sessions, snapshot, tabs] = await Promise.all([
      loadUserPreferences(),
      loadWindowSessions(),
      loadStoredWorkspaceSnapshot(),
      chrome.tabs.query({}),
    ]);

    this.userPreferences = preferences;
    this.storedSnapshot = snapshot;

    const liveTabIds = new Set(
      tabs.map((tab) => tab.id).filter((tabId): tabId is number => tabId !== undefined),
    );

    this.tabSessions = new Map<number, DockWindowSession>(
      Object.entries(sessions)
        .map(([hostTabId, session]) => [Number(hostTabId), session] as const)
        .filter(([hostTabId]) => liveTabIds.has(hostTabId)),
    );

    if (this.tabSessions.size !== Object.keys(sessions).length) {
      this.schedulePersistence();
    }
  }

  private schedulePersistence(): void {
    if (this.persistTimer !== null) {
      globalThis.clearTimeout(this.persistTimer);
    }

    this.persistTimer = globalThis.setTimeout(() => {
      void saveWindowSessions(Object.fromEntries(this.tabSessions));
      this.persistTimer = null;
    }, SESSION_SYNC_DEBOUNCE_MS);
  }

  private async persistSnapshot(session: DockWindowSession): Promise<void> {
    const snapshot = toStoredWorkspaceSnapshot(session);
    this.storedSnapshot = snapshot['last-session'];
    await saveStoredWorkspaceSnapshot(this.storedSnapshot);
  }

  private isInjectableTab(tab: chrome.tabs.Tab): boolean {
    return Boolean(
      tab.id !== undefined &&
        tab.windowId !== undefined &&
        isSupportedDockUrl(tab.url ?? tab.pendingUrl ?? ''),
    );
  }

  private async ensureContentScript(tabId: number): Promise<void> {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: [CONTENT_SCRIPT_FILE],
    });
  }

  private async ensureContentScriptSafely(tab: chrome.tabs.Tab): Promise<void> {
    if (tab.id === undefined || !this.isInjectableTab(tab)) {
      return;
    }

    try {
      await this.ensureContentScript(tab.id);
    } catch {
      // The manifest-registered content script and the UI-ready retry loop
      // cover early navigation races during first load.
    }
  }

  private async sendEventToHostTab(
    hostTabId: number,
    payload: DockEventMessage,
  ): Promise<void> {
    try {
      await chrome.tabs.sendMessage(hostTabId, payload);
    } catch {
      // Ignore tabs that have not mounted the dock UI yet.
    }
  }

  private async pushSessionToHostTab(hostTabId: number): Promise<void> {
    const session = this.tabSessions.get(hostTabId);
    if (!session) {
      return;
    }

    const hostTab = await chrome.tabs.get(hostTabId).catch(() => null);
    if (!hostTab || !this.isInjectableTab(hostTab)) {
      return;
    }

    await this.ensureContentScriptSafely(hostTab);
    await this.sendEventToHostTab(hostTabId, {
      type: 'SESSION_UPDATED',
      windowId: session.windowId,
      session,
    });
  }

  private async setActionHint(
    tabId: number,
    text: string,
    title: string,
  ): Promise<void> {
    await Promise.all([
      chrome.action.setBadgeBackgroundColor({
        color: '#2563eb',
        tabId,
      }),
      chrome.action.setBadgeText({
        tabId,
        text,
      }),
      chrome.action.setTitle({
        tabId,
        title,
      }),
    ]);
  }

  private async clearActionHint(tabId: number): Promise<void> {
    await Promise.all([
      chrome.action.setBadgeText({
        tabId,
        text: '',
      }),
      chrome.action.setTitle({
        tabId,
        title: 'Toggle Sidebar Max',
      }),
    ]);
  }

  private sanitizeSnapshot(
    snapshot: StoredWorkspaceSnapshot | null,
  ): StoredWorkspaceSnapshot | null {
    if (!snapshot) {
      return null;
    }

    return {
      ...snapshot,
      workspaceTabs: snapshot.workspaceTabs.map((workspaceTab) => ({
        ...workspaceTab,
        nativeTabId: null,
        loadingState: workspaceTab.mode === 'nativeFallback' ? 'blocked' : 'ready',
      })),
    };
  }

  private async buildWorkspaceTab(
    inputUrl: string,
    overrides: Partial<WorkspaceTab> = {},
  ): Promise<WorkspaceTab> {
    const extensionOrigin = chrome.runtime.getURL('');

    if (!isSupportedDockUrl(inputUrl)) {
      return createWorkspaceTab(inputUrl, {
        ...overrides,
        title: overrides.title ?? getDisplayTitle(inputUrl),
        mode: 'nativeFallback',
        nativeTabId: null,
        loadingState: 'blocked',
        blockedReason: 'Only normal http and https pages can load in the dock.',
        embedConfidence: 'high',
      });
    }

    const probe = await probeUrlForEmbedding(inputUrl, extensionOrigin);
    if (probe.allowed) {
      return createWorkspaceTab(inputUrl, {
        ...overrides,
        title: overrides.title ?? getDisplayTitle(inputUrl),
        mode: 'embedded',
        nativeTabId: null,
        loadingState: 'ready',
        blockedReason: null,
        embedConfidence: probe.confidence,
      });
    }

    return createWorkspaceTab(inputUrl, {
      ...overrides,
      title: overrides.title ?? getDisplayTitle(inputUrl),
      mode: 'nativeFallback',
      nativeTabId: null,
      loadingState: 'blocked',
      blockedReason: formatBlockedReason(inputUrl, probe.reason),
      embedConfidence: probe.confidence,
    });
  }

  private async createSessionForHostTab(
    tab: chrome.tabs.Tab,
  ): Promise<DockWindowSession | null> {
    if (!this.isInjectableTab(tab) || tab.id === undefined || tab.windowId === undefined) {
      return null;
    }

    const snapshot = this.sanitizeSnapshot(this.storedSnapshot);
    let session = createWindowSession(
      tab.windowId,
      tab.id,
      this.userPreferences,
      snapshot,
      DEFAULT_WORKSPACE_START_URL,
    );

    if (!snapshot) {
      const firstWorkspaceTab = await this.buildWorkspaceTab(
        DEFAULT_WORKSPACE_START_URL,
        {
          id: session.activeWorkspaceTabId,
        },
      );
      session = updateWorkspaceTab(session, session.activeWorkspaceTabId, firstWorkspaceTab);
    }

    session = setHostAccessGranted(session, true);
    session = setSessionError(session, null);

    return session;
  }

  private async openFromFocusedTab(): Promise<void> {
    const [activeTab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (activeTab) {
      await this.openFromBrowserAction(activeTab);
    }
  }

  private async openFromBrowserAction(tab: chrome.tabs.Tab): Promise<void> {
    if (tab.id === undefined) {
      return;
    }

    await this.clearActionHint(tab.id);

    if (!this.isInjectableTab(tab)) {
      await this.setActionHint(
        tab.id,
        '!',
        `${EXTENSION_NAME} only opens on normal http and https pages.`,
      );
      return;
    }

    const currentSession = this.tabSessions.get(tab.id);
    if (currentSession) {
      const nextSession = setCollapsedState(currentSession, false);
      this.tabSessions.set(tab.id, nextSession);
      this.schedulePersistence();
      await this.pushSessionToHostTab(tab.id);
      return;
    }

    const nextSession = await this.createSessionForHostTab(tab);
    if (!nextSession) {
      await this.setActionHint(
        tab.id,
        '!',
        `${EXTENSION_NAME} could not open in this tab.`,
      );
      return;
    }

    this.tabSessions.set(tab.id, nextSession);
    this.schedulePersistence();
    await this.pushSessionToHostTab(tab.id);
  }

  private getSessionFromSender(
    sender: RuntimeMessageSender,
  ): { hostTabId: number; session: DockWindowSession } | null {
    const hostTabId = sender.tab?.id;
    if (hostTabId === undefined) {
      return null;
    }

    const session = this.tabSessions.get(hostTabId);
    if (!session) {
      return null;
    }

    return {
      hostTabId,
      session,
    };
  }

  private async handleIncomingMessage(
    message: unknown,
    sender: RuntimeMessageSender,
  ): Promise<DockResponse> {
    await this.initPromise;

    const parsed = DockRequestMessageSchema.safeParse(message);
    if (!parsed.success) {
      return {
        ok: false,
        error: 'Invalid message payload.',
      };
    }

    const request = parsed.data;

    switch (request.type) {
      case 'OPEN_DOCK': {
        if (sender.tab) {
          await this.openFromBrowserAction(sender.tab);
        }

        return {
          ok: true,
          session: sender.tab?.id !== undefined ? this.tabSessions.get(sender.tab.id) : undefined,
        };
      }
      case 'RESTORE_SESSION':
      case 'UI_READY': {
        const result = this.getSessionFromSender(sender);
        if (!result) {
          return {
            ok: false,
            error: `${EXTENSION_NAME} is not open in this tab.`,
          };
        }

        return {
          ok: true,
          session: result.session,
        };
      }
      case 'CLOSE_DOCK': {
        const result = this.getSessionFromSender(sender);
        if (!result) {
          return {
            ok: false,
            error: 'No dock session to close.',
          };
        }

        await this.persistSnapshot(result.session);
        this.tabSessions.delete(result.hostTabId);
        this.schedulePersistence();
        await this.sendEventToHostTab(result.hostTabId, {
          type: 'SESSION_CLOSED',
          windowId: result.session.windowId,
        });
        return { ok: true };
      }
      case 'SET_PINNED': {
        const result = this.getSessionFromSender(sender);
        if (!result) {
          return {
            ok: false,
            error: 'Dock session not found.',
          };
        }

        const nextSession = setPinnedState(result.session, request.pinned);
        this.userPreferences = {
          ...this.userPreferences,
          defaultPinned: request.pinned,
        };
        this.tabSessions.set(result.hostTabId, nextSession);
        this.schedulePersistence();
        await saveUserPreferences(this.userPreferences);
        await this.pushSessionToHostTab(result.hostTabId);
        return {
          ok: true,
          session: nextSession,
        };
      }
      case 'SET_COLLAPSED': {
        const result = this.getSessionFromSender(sender);
        if (!result) {
          return {
            ok: false,
            error: 'Dock session not found.',
          };
        }

        const nextSession = setCollapsedState(result.session, request.collapsed);
        this.tabSessions.set(result.hostTabId, nextSession);
        this.schedulePersistence();
        await this.pushSessionToHostTab(result.hostTabId);
        return {
          ok: true,
          session: nextSession,
        };
      }
      case 'CREATE_WORKSPACE_TAB': {
        const result = this.getSessionFromSender(sender);
        if (!result) {
          return {
            ok: false,
            error: 'Dock session not found.',
          };
        }

        const targetUrl =
          request.input && request.input.trim().length > 0
            ? normalizeAddressInput(request.input).url
            : DEFAULT_WORKSPACE_START_URL;
        const workspaceTab = await this.buildWorkspaceTab(targetUrl);
        let nextSession = createWorkspaceTabInSession(result.session, workspaceTab);
        nextSession = setSessionError(nextSession, null);
        this.tabSessions.set(result.hostTabId, nextSession);
        this.schedulePersistence();
        await this.pushSessionToHostTab(result.hostTabId);
        return {
          ok: true,
          session: nextSession,
        };
      }
      case 'NAVIGATE_WORKSPACE_TAB': {
        const result = this.getSessionFromSender(sender);
        if (!result) {
          return {
            ok: false,
            error: 'Dock session not found.',
          };
        }

        const targetUrl = normalizeAddressInput(request.input).url;
        const workspaceTab = await this.buildWorkspaceTab(targetUrl, {
          id: request.workspaceTabId,
        });
        let nextSession = updateWorkspaceTab(
          result.session,
          request.workspaceTabId,
          workspaceTab,
        );
        nextSession = activateWorkspaceTab(nextSession, request.workspaceTabId);
        nextSession = setSessionError(nextSession, null);
        this.tabSessions.set(result.hostTabId, nextSession);
        this.schedulePersistence();
        await this.pushSessionToHostTab(result.hostTabId);
        return {
          ok: true,
          session: nextSession,
        };
      }
      case 'ACTIVATE_WORKSPACE_TAB': {
        const result = this.getSessionFromSender(sender);
        if (!result) {
          return {
            ok: false,
            error: 'Dock session not found.',
          };
        }

        const nextSession = activateWorkspaceTab(result.session, request.workspaceTabId);
        this.tabSessions.set(result.hostTabId, nextSession);
        this.schedulePersistence();
        await this.pushSessionToHostTab(result.hostTabId);
        return {
          ok: true,
          session: nextSession,
        };
      }
      case 'CLOSE_WORKSPACE_TAB': {
        const result = this.getSessionFromSender(sender);
        if (!result) {
          return {
            ok: false,
            error: 'Dock session not found.',
          };
        }

        const closingTab = result.session.workspaceTabs.find(
          (workspaceTab) => workspaceTab.id === request.workspaceTabId,
        );
        if (!closingTab) {
          return {
            ok: false,
            error: 'Workspace tab not found.',
          };
        }

        if (closingTab.nativeTabId !== null && closingTab.nativeTabId !== undefined) {
          await chrome.tabs.remove(closingTab.nativeTabId).catch(() => undefined);
        }

        const nextSession = closeWorkspaceTabInSession(
          result.session,
          request.workspaceTabId,
        );
        this.tabSessions.set(result.hostTabId, nextSession);
        this.schedulePersistence();
        await this.pushSessionToHostTab(result.hostTabId);
        return {
          ok: true,
          session: nextSession,
        };
      }
      case 'SYNC_FALLBACK_TAB': {
        const result = this.getSessionFromSender(sender);
        if (!result) {
          return {
            ok: false,
            error: 'Dock session not found.',
          };
        }

        const targetWorkspaceTab = result.session.workspaceTabs.find(
          (workspaceTab) => workspaceTab.id === request.workspaceTabId,
        );
        if (!targetWorkspaceTab) {
          return {
            ok: false,
            error: 'Workspace tab not found.',
          };
        }

        let browserTab = targetWorkspaceTab.nativeTabId
          ? await chrome.tabs.get(targetWorkspaceTab.nativeTabId).catch(() => null)
          : null;

        if (browserTab?.id !== undefined) {
          browserTab = await chrome.tabs.update(browserTab.id, {
            active: true,
          });
        } else {
          browserTab = await chrome.tabs.create({
            windowId: result.session.windowId,
            url: targetWorkspaceTab.url,
            active: true,
          });
        }

        const nextSession = updateWorkspaceTab(result.session, request.workspaceTabId, {
          nativeTabId: browserTab.id ?? null,
          title: browserTab.title ?? targetWorkspaceTab.title,
          faviconUrl: browserTab.favIconUrl ?? targetWorkspaceTab.faviconUrl,
          loadingState: browserTab.status === 'complete' ? 'ready' : 'loading',
          blockedReason: targetWorkspaceTab.blockedReason,
          mode: 'nativeFallback',
        });
        this.tabSessions.set(result.hostTabId, nextSession);
        this.schedulePersistence();
        await this.pushSessionToHostTab(result.hostTabId);
        return {
          ok: true,
          session: nextSession,
        };
      }
      case 'REQUEST_HOST_ACCESS': {
        const result = this.getSessionFromSender(sender);
        return {
          ok: Boolean(result),
          session: result?.session,
          error: result ? undefined : 'Dock session not found.',
        };
      }
      default:
        return {
          ok: false,
          error: 'Unhandled message type.',
        };
    }
  }

  private async handleBrowserTabUpdated(
    tabId: number,
    changeInfo: BrowserTabChangeInfo,
    tab: chrome.tabs.Tab,
  ): Promise<void> {
    const hostSession = this.tabSessions.get(tabId);
    if (hostSession) {
      if (!isSupportedDockUrl(tab.url ?? tab.pendingUrl ?? '')) {
        await this.persistSnapshot(hostSession);
        this.tabSessions.delete(tabId);
        this.schedulePersistence();
        return;
      }

      if (changeInfo.status === 'complete') {
        await this.pushSessionToHostTab(tabId);
      }
    }

    for (const [hostTabId, session] of this.tabSessions.entries()) {
      const linkedWorkspaceTab = session.workspaceTabs.find(
        (workspaceTab) => workspaceTab.nativeTabId === tabId,
      );

      if (!linkedWorkspaceTab) {
        continue;
      }

      const nextSession = updateWorkspaceTab(session, linkedWorkspaceTab.id, {
        title:
          changeInfo.title ??
          tab.title ??
          getDisplayTitle(changeInfo.url ?? tab.url ?? linkedWorkspaceTab.url),
        faviconUrl: changeInfo.favIconUrl ?? tab.favIconUrl ?? linkedWorkspaceTab.faviconUrl,
        url: changeInfo.url ?? tab.url ?? linkedWorkspaceTab.url,
        loadingState: changeInfo.status === 'complete' ? 'ready' : 'loading',
      });
      this.tabSessions.set(hostTabId, nextSession);
      this.schedulePersistence();
      await this.pushSessionToHostTab(hostTabId);
      break;
    }
  }

  private async handleBrowserTabRemoved(tabId: number): Promise<void> {
    const hostSession = this.tabSessions.get(tabId);
    if (hostSession) {
      await this.persistSnapshot(hostSession);
      this.tabSessions.delete(tabId);
      this.schedulePersistence();
      return;
    }

    for (const [hostTabId, session] of this.tabSessions.entries()) {
      const linkedWorkspaceTab = session.workspaceTabs.find(
        (workspaceTab) => workspaceTab.nativeTabId === tabId,
      );

      if (!linkedWorkspaceTab) {
        continue;
      }

      const nextSession = updateWorkspaceTab(session, linkedWorkspaceTab.id, {
        nativeTabId: null,
        loadingState: 'blocked',
      });
      this.tabSessions.set(hostTabId, nextSession);
      this.schedulePersistence();
      await this.pushSessionToHostTab(hostTabId);
      break;
    }
  }
}
