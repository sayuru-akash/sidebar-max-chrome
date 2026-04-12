import {
  COLLAPSED_RAIL_WIDTH,
  CONTENT_SCRIPT_FILE,
  DEFAULT_WORKSPACE_START_URL,
  DEFAULT_WORKSPACE_WINDOW_WIDTH,
  EXTENSION_NAME,
  MIN_WORKSPACE_WINDOW_HEIGHT,
  SESSION_SYNC_DEBOUNCE_MS,
  TOGGLE_COMMAND,
} from '../lib/constants';
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
  setCurrentBrowserTab,
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

export class DockBackgroundController {
  private readonly initPromise: Promise<void>;
  private userPreferences: UserPreferences = DEFAULT_USER_PREFERENCES;
  private windowSessions = new Map<number, DockWindowSession>();
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
    chrome.tabs.onActivated.addListener((activeInfo) => {
      void this.handleBrowserTabActivated(activeInfo.windowId, activeInfo.tabId);
    });
    chrome.tabs.onCreated.addListener((tab) => {
      void this.handleBrowserTabCreated(tab);
    });
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      void this.handleBrowserTabUpdated(tabId, changeInfo, tab);
    });
    chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
      void this.handleBrowserTabRemoved(tabId, removeInfo.windowId);
    });
    chrome.windows.onRemoved.addListener((windowId) => {
      void this.handleWindowRemoved(windowId);
    });
  }

  private async initialize(): Promise<void> {
    const [preferences, sessions, snapshot] = await Promise.all([
      loadUserPreferences(),
      loadWindowSessions(),
      loadStoredWorkspaceSnapshot(),
    ]);

    this.userPreferences = preferences;
    this.windowSessions = new Map<number, DockWindowSession>(
      Object.entries(sessions).map(([windowId, session]) => [
        Number(windowId),
        session,
      ]),
    );
    this.storedSnapshot = snapshot;
  }

  private getManagedSession(): DockWindowSession | null {
    return this.windowSessions.values().next().value ?? null;
  }

  private schedulePersistence(): void {
    if (this.persistTimer !== null) {
      globalThis.clearTimeout(this.persistTimer);
    }

    this.persistTimer = globalThis.setTimeout(() => {
      void saveWindowSessions(Object.fromEntries(this.windowSessions));
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

  private createBrowserWorkspaceTab(tab: chrome.tabs.Tab): WorkspaceTab {
    const url = tab.url ?? tab.pendingUrl ?? DEFAULT_WORKSPACE_START_URL;

    return createWorkspaceTab(url, {
      title: tab.title ?? getDisplayTitle(url),
      faviconUrl: tab.favIconUrl ?? null,
      mode: 'embedded',
      nativeTabId: tab.id ?? null,
      loadingState: tab.status === 'complete' ? 'ready' : 'loading',
      blockedReason: null,
      embedConfidence: 'high',
    });
  }

  private syncSessionWithBrowserTab(
    session: DockWindowSession,
    tab: chrome.tabs.Tab,
    activateTab: boolean,
  ): DockWindowSession {
    if (tab.id === undefined) {
      return session;
    }

    const existingWorkspaceTab = session.workspaceTabs.find(
      (workspaceTab) => workspaceTab.nativeTabId === tab.id,
    );

    let nextSession = existingWorkspaceTab
      ? updateWorkspaceTab(session, existingWorkspaceTab.id, {
          url: tab.url ?? tab.pendingUrl ?? existingWorkspaceTab.url,
          title:
            tab.title ??
            getDisplayTitle(tab.url ?? tab.pendingUrl ?? existingWorkspaceTab.url),
          faviconUrl: tab.favIconUrl ?? existingWorkspaceTab.faviconUrl,
          mode: 'embedded',
          nativeTabId: tab.id,
          loadingState: tab.status === 'complete' ? 'ready' : 'loading',
          blockedReason: null,
          embedConfidence: 'high',
        })
      : createWorkspaceTabInSession(session, this.createBrowserWorkspaceTab(tab));

    nextSession = setCurrentBrowserTab(nextSession, tab.id);
    nextSession = setHostAccessGranted(nextSession, true);
    nextSession = setSessionError(nextSession, null);

    if (activateTab) {
      const targetWorkspaceTabId =
        existingWorkspaceTab?.id ?? nextSession.activeWorkspaceTabId;
      nextSession = activateWorkspaceTab(nextSession, targetWorkspaceTabId);
    }

    return nextSession;
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
      // The UI_READY retry loop covers short races during navigation.
    }
  }

  private async ensureDockOnTab(tab: chrome.tabs.Tab): Promise<void> {
    if (!this.isInjectableTab(tab) || tab.id === undefined || tab.windowId === undefined) {
      return;
    }

    await this.ensureContentScriptSafely(tab);
    const session = this.windowSessions.get(tab.windowId);
    if (!session) {
      return;
    }

    await this.broadcast(tab.windowId, {
      type: 'SESSION_UPDATED',
      windowId: tab.windowId,
      session,
    });
  }

  private async broadcast(
    windowId: number,
    payload: DockEventMessage,
  ): Promise<void> {
    const tabs = await chrome.tabs.query({
      windowId,
    });

    await Promise.all(
      tabs
        .filter((tab) => tab.id !== undefined)
        .map(async (tab) => {
          try {
            await chrome.tabs.sendMessage(tab.id!, payload);
          } catch {
            // Ignore tabs without an injected content script.
          }
        }),
    );
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

  private async getAnchorWindow(
    sourceWindowId?: number,
  ): Promise<chrome.windows.Window | null> {
    try {
      if (sourceWindowId !== undefined) {
        return await chrome.windows.get(sourceWindowId);
      }

      return await chrome.windows.getLastFocused();
    } catch {
      return null;
    }
  }

  private getWorkspaceWindowPlacement(anchor: chrome.windows.Window | null): {
    width: number;
    height: number;
    left?: number;
    top?: number;
  } {
    const width = Math.max(DEFAULT_WORKSPACE_WINDOW_WIDTH, this.userPreferences.dockWidth);
    const height = Math.max(
      anchor?.height ?? MIN_WORKSPACE_WINDOW_HEIGHT,
      MIN_WORKSPACE_WINDOW_HEIGHT,
    );

    if (
      anchor?.left === undefined ||
      anchor.top === undefined ||
      anchor.width === undefined
    ) {
      return { width, height };
    }

    return {
      width,
      height,
      left: anchor.left + Math.max(0, anchor.width - width),
      top: anchor.top,
    };
  }

  private async applyWorkspaceWindowLayout(session: DockWindowSession): Promise<void> {
    let currentWindow: chrome.windows.Window;
    try {
      currentWindow = await chrome.windows.get(session.windowId);
    } catch {
      return;
    }

    const nextWidth = session.collapsed ? COLLAPSED_RAIL_WIDTH : session.dockWidth;
    const nextHeight = currentWindow.height ?? MIN_WORKSPACE_WINDOW_HEIGHT;
    const nextLeft =
      currentWindow.left !== undefined && currentWindow.width !== undefined
        ? currentWindow.left + Math.max(0, currentWindow.width - nextWidth)
        : undefined;

    await chrome.windows.update(session.windowId, {
      width: nextWidth,
      height: nextHeight,
      left: nextLeft,
      top: currentWindow.top,
    });
  }

  private async focusManagedWindow(session: DockWindowSession): Promise<boolean> {
    let nextSession = session;
    if (session.collapsed) {
      nextSession = setPinnedState(session, true);
      this.windowSessions.set(session.windowId, nextSession);
      this.schedulePersistence();
      await this.applyWorkspaceWindowLayout(nextSession);
    }

    try {
      await chrome.windows.update(nextSession.windowId, {
        focused: true,
      });
    } catch {
      return false;
    }

    const activeBrowserTabId =
      nextSession.currentBrowserTabId ??
      nextSession.workspaceTabs.find(
        (workspaceTab) => workspaceTab.id === nextSession.activeWorkspaceTabId,
      )?.nativeTabId;

    if (activeBrowserTabId !== undefined && activeBrowserTabId !== null) {
      try {
        const focusedTab = await chrome.tabs.update(activeBrowserTabId, {
          active: true,
        });
        await this.ensureDockOnTab(focusedTab);
      } catch {
        return false;
      }
    }

    return true;
  }

  private async createManagedWindow(
    sourceWindowId?: number,
  ): Promise<DockWindowSession | null> {
    const anchorWindow = await this.getAnchorWindow(sourceWindowId);
    const placement = this.getWorkspaceWindowPlacement(anchorWindow);
    const snapshot = this.storedSnapshot;
    const activeSnapshotTab =
      snapshot?.workspaceTabs.find(
        (workspaceTab) => workspaceTab.id === snapshot.activeWorkspaceTabId,
      ) ?? snapshot?.workspaceTabs[0];
    const seedUrl = activeSnapshotTab?.url ?? DEFAULT_WORKSPACE_START_URL;

    const createdWindow = await chrome.windows.create({
      url: seedUrl,
      type: 'popup',
      focused: true,
      width: placement.width,
      height: placement.height,
      left: placement.left,
      top: placement.top,
    });

    const createdTab = createdWindow.tabs?.[0];
    if (
      createdWindow.id === undefined ||
      createdTab?.id === undefined ||
      createdTab.windowId === undefined
    ) {
      return null;
    }

    let session = createWindowSession(
      createdWindow.id,
      createdTab.id,
      this.userPreferences,
      null,
      seedUrl,
    );

    const initialWorkspaceTabId = session.activeWorkspaceTabId;
    session = updateWorkspaceTab(session, initialWorkspaceTabId, {
      ...this.createBrowserWorkspaceTab(createdTab),
      id: initialWorkspaceTabId,
    });
    session = setPinnedState(session, true);
    session = setHostAccessGranted(session, true);
    session = setSessionError(session, null);

    this.windowSessions.clear();
    this.windowSessions.set(createdWindow.id, session);
    this.schedulePersistence();

    if (snapshot && snapshot.workspaceTabs.length > 1) {
      for (const workspaceTab of snapshot.workspaceTabs) {
        if (workspaceTab.url === seedUrl) {
          continue;
        }

        const restoredTab = await chrome.tabs.create({
          windowId: createdWindow.id,
          url: workspaceTab.url,
          active: false,
        });
        const currentSession = this.windowSessions.get(createdWindow.id);
        if (!currentSession) {
          break;
        }

        const nextSession = this.syncSessionWithBrowserTab(currentSession, restoredTab, false);
        this.windowSessions.set(createdWindow.id, nextSession);
      }
      this.schedulePersistence();
    }

    await this.ensureDockOnTab(createdTab);
    return this.windowSessions.get(createdWindow.id) ?? session;
  }

  private async openFromFocusedTab(): Promise<void> {
    const [activeTab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (activeTab) {
      await this.openFromBrowserAction(activeTab);
      return;
    }

    await this.createManagedWindow();
  }

  private async openFromBrowserAction(tab: chrome.tabs.Tab): Promise<void> {
    if (tab.id !== undefined) {
      await this.clearActionHint(tab.id);
    }

    const currentSession = this.getManagedSession();
    if (currentSession) {
      const focused = await this.focusManagedWindow(currentSession);
      if (focused) {
        return;
      }

      this.windowSessions.delete(currentSession.windowId);
      this.schedulePersistence();
    }

    const createdSession = await this.createManagedWindow(tab.windowId);
    if (!createdSession && tab.id !== undefined) {
      await this.setActionHint(
        tab.id,
        '!',
        `${EXTENSION_NAME} could not open the dedicated workspace window.`,
      );
    }
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
        } else {
          await this.createManagedWindow();
        }

        return {
          ok: true,
          session: this.getManagedSession() ?? undefined,
        };
      }
      case 'RESTORE_SESSION':
      case 'UI_READY': {
        const senderWindowId = sender.tab?.windowId;
        if (senderWindowId === undefined) {
          return {
            ok: false,
            error: 'Unable to infer sender window.',
          };
        }

        const currentSession = this.windowSessions.get(senderWindowId) ?? null;
        if (!currentSession) {
          return {
            ok: false,
            error: `${EXTENSION_NAME} is not open in this window.`,
          };
        }

        return {
          ok: true,
          session: currentSession,
        };
      }
      case 'CLOSE_DOCK': {
        const currentSession = this.windowSessions.get(request.windowId);
        if (!currentSession) {
          return {
            ok: false,
            error: 'No dock session to close.',
          };
        }

        await chrome.windows.remove(currentSession.windowId);
        return { ok: true };
      }
      case 'SET_PINNED': {
        const currentSession = this.windowSessions.get(request.windowId);
        if (!currentSession) {
          return {
            ok: false,
            error: 'Dock session not found.',
          };
        }

        const nextSession = setPinnedState(currentSession, request.pinned);
        this.userPreferences = {
          ...this.userPreferences,
          defaultPinned: request.pinned,
        };
        this.windowSessions.set(request.windowId, nextSession);
        this.schedulePersistence();
        await saveUserPreferences(this.userPreferences);
        await this.applyWorkspaceWindowLayout(nextSession);
        await this.broadcast(request.windowId, {
          type: 'SESSION_UPDATED',
          windowId: request.windowId,
          session: nextSession,
        });
        return {
          ok: true,
          session: nextSession,
        };
      }
      case 'SET_COLLAPSED': {
        const currentSession = this.windowSessions.get(request.windowId);
        if (!currentSession) {
          return {
            ok: false,
            error: 'Dock session not found.',
          };
        }

        const nextSession = setCollapsedState(currentSession, request.collapsed);
        this.windowSessions.set(request.windowId, nextSession);
        this.schedulePersistence();
        await this.applyWorkspaceWindowLayout(nextSession);
        await this.broadcast(request.windowId, {
          type: 'SESSION_UPDATED',
          windowId: request.windowId,
          session: nextSession,
        });
        return {
          ok: true,
          session: nextSession,
        };
      }
      case 'CREATE_WORKSPACE_TAB': {
        const currentSession = this.windowSessions.get(request.windowId);
        if (!currentSession) {
          return {
            ok: false,
            error: 'Dock session not found.',
          };
        }

        const targetUrl =
          request.input && request.input.trim().length > 0
            ? normalizeAddressInput(request.input).url
            : DEFAULT_WORKSPACE_START_URL;
        const createdTab = await chrome.tabs.create({
          windowId: currentSession.windowId,
          url: targetUrl,
          active: true,
        });

        let nextSession = this.syncSessionWithBrowserTab(
          currentSession,
          createdTab,
          true,
        );
        nextSession = setSessionError(nextSession, null);
        this.windowSessions.set(request.windowId, nextSession);
        this.schedulePersistence();
        await this.ensureDockOnTab(createdTab);
        return {
          ok: true,
          session: nextSession,
        };
      }
      case 'NAVIGATE_WORKSPACE_TAB': {
        const currentSession = this.windowSessions.get(request.windowId);
        if (!currentSession) {
          return {
            ok: false,
            error: 'Dock session not found.',
          };
        }

        await this.handleWorkspaceNavigation(
          currentSession,
          request.workspaceTabId,
          request.input,
        );
        return {
          ok: true,
          session: this.windowSessions.get(request.windowId),
        };
      }
      case 'ACTIVATE_WORKSPACE_TAB': {
        const currentSession = this.windowSessions.get(request.windowId);
        if (!currentSession) {
          return {
            ok: false,
            error: 'Dock session not found.',
          };
        }

        const targetWorkspaceTab = currentSession.workspaceTabs.find(
          (workspaceTab) => workspaceTab.id === request.workspaceTabId,
        );
        if (!targetWorkspaceTab) {
          return {
            ok: false,
            error: 'Workspace tab not found.',
          };
        }

        if (targetWorkspaceTab.nativeTabId !== null && targetWorkspaceTab.nativeTabId !== undefined) {
          const activeTab = await chrome.tabs.update(targetWorkspaceTab.nativeTabId, {
            active: true,
          });
          const nextSession = this.syncSessionWithBrowserTab(
            currentSession,
            activeTab,
            true,
          );
          this.windowSessions.set(request.windowId, nextSession);
          this.schedulePersistence();
          await this.ensureDockOnTab(activeTab);
          return {
            ok: true,
            session: nextSession,
          };
        }

        return {
          ok: false,
          error: 'Workspace tab is not attached to a browser tab.',
        };
      }
      case 'CLOSE_WORKSPACE_TAB': {
        const currentSession = this.windowSessions.get(request.windowId);
        if (!currentSession) {
          return {
            ok: false,
            error: 'Dock session not found.',
          };
        }

        const closingTab = currentSession.workspaceTabs.find(
          (workspaceTab) => workspaceTab.id === request.workspaceTabId,
        );
        if (closingTab?.nativeTabId !== null && closingTab?.nativeTabId !== undefined) {
          try {
            await chrome.tabs.remove(closingTab.nativeTabId);
          } catch {
            // Ignore tabs already closed manually.
          }
        }

        return {
          ok: true,
          session: this.windowSessions.get(request.windowId),
        };
      }
      case 'SYNC_FALLBACK_TAB':
      case 'REQUEST_HOST_ACCESS': {
        const currentSession = this.windowSessions.get(request.windowId);
        return {
          ok: Boolean(currentSession),
          session: currentSession ?? undefined,
          error: currentSession ? undefined : 'Dock session not found.',
        };
      }
      default:
        return {
          ok: false,
          error: 'Unhandled message type.',
        };
    }
  }

  private async handleWorkspaceNavigation(
    session: DockWindowSession,
    workspaceTabId: string,
    input: string,
  ): Promise<void> {
    const normalizedTarget = normalizeAddressInput(input);
    const targetWorkspaceTab = session.workspaceTabs.find(
      (workspaceTab) => workspaceTab.id === workspaceTabId,
    );

    let nextBrowserTab: chrome.tabs.Tab;
    if (targetWorkspaceTab?.nativeTabId !== null && targetWorkspaceTab?.nativeTabId !== undefined) {
      nextBrowserTab = await chrome.tabs.update(targetWorkspaceTab.nativeTabId, {
        url: normalizedTarget.url,
        active: true,
      });
    } else {
      nextBrowserTab = await chrome.tabs.create({
        windowId: session.windowId,
        url: normalizedTarget.url,
        active: true,
      });
    }

    let nextSession = this.syncSessionWithBrowserTab(session, nextBrowserTab, true);
    nextSession = setSessionError(nextSession, null);
    this.windowSessions.set(session.windowId, nextSession);
    this.schedulePersistence();
    await this.ensureDockOnTab(nextBrowserTab);
  }

  private handleBrowserTabCreated(tab: chrome.tabs.Tab): void {
    if (tab.windowId === undefined) {
      return;
    }

    const currentSession = this.windowSessions.get(tab.windowId);
    if (!currentSession) {
      return;
    }

    const targetUrl = tab.url ?? tab.pendingUrl ?? '';
    if (!targetUrl || !isSupportedDockUrl(targetUrl)) {
      return;
    }

    const nextSession = this.syncSessionWithBrowserTab(
      currentSession,
      tab,
      tab.active ?? false,
    );
    this.windowSessions.set(tab.windowId, nextSession);
    this.schedulePersistence();
  }

  private async handleBrowserTabActivated(
    windowId: number,
    browserTabId: number,
  ): Promise<void> {
    const currentSession = this.windowSessions.get(windowId);
    if (!currentSession) {
      return;
    }

    const tab = await chrome.tabs.get(browserTabId);
    const nextSession = this.syncSessionWithBrowserTab(currentSession, tab, true);
    this.windowSessions.set(windowId, nextSession);
    this.schedulePersistence();

    await this.ensureDockOnTab(tab);
  }

  private async handleBrowserTabUpdated(
    tabId: number,
    changeInfo: BrowserTabChangeInfo,
    tab: chrome.tabs.Tab,
  ): Promise<void> {
    if (tab.windowId === undefined) {
      return;
    }

    const currentSession = this.windowSessions.get(tab.windowId);
    if (!currentSession) {
      return;
    }

    if (!isSupportedDockUrl(tab.url ?? tab.pendingUrl ?? '')) {
      return;
    }

    const nextSession = this.syncSessionWithBrowserTab(
      currentSession,
      {
        ...tab,
        title: changeInfo.title ?? tab.title,
        favIconUrl: changeInfo.favIconUrl ?? tab.favIconUrl,
        url: changeInfo.url ?? tab.url,
        status: changeInfo.status ?? tab.status,
      },
      tab.active ?? false,
    );

    this.windowSessions.set(tab.windowId, nextSession);
    this.schedulePersistence();

    if (changeInfo.status === 'complete') {
      await this.ensureDockOnTab(tab);
    }
  }

  private async handleBrowserTabRemoved(
    tabId: number,
    windowId: number,
  ): Promise<void> {
    const currentSession = this.windowSessions.get(windowId);
    if (!currentSession) {
      return;
    }

    const linkedWorkspaceTab = currentSession.workspaceTabs.find(
      (workspaceTab) => workspaceTab.nativeTabId === tabId,
    );
    if (!linkedWorkspaceTab) {
      return;
    }

    const nextSession = closeWorkspaceTabInSession(
      currentSession,
      linkedWorkspaceTab.id,
    );
    this.windowSessions.set(windowId, nextSession);
    this.schedulePersistence();
    await this.broadcast(windowId, {
      type: 'SESSION_UPDATED',
      windowId,
      session: nextSession,
    });
  }

  private async handleWindowRemoved(windowId: number): Promise<void> {
    const currentSession = this.windowSessions.get(windowId);
    if (!currentSession) {
      return;
    }

    await this.persistSnapshot(currentSession);
    this.windowSessions.delete(windowId);
    this.schedulePersistence();
  }
}
