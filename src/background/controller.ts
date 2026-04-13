import {
  DEFAULT_WORKSPACE_START_URL,
  TAB_GROUP_TITLE,
  TOGGLE_COMMAND,
  SESSION_SYNC_DEBOUNCE_MS,
} from '../lib/constants';
import {
  PanelRequestSchema,
  type PanelEvent,
  type PanelResponse,
  type SidePanelSession,
} from '../lib/schema';
import {
  loadAllWindowSessions,
  loadSessionSnapshot,
  removeWindowSession,
  saveSessionSnapshot,
  saveWindowSession,
} from '../lib/storage';
import { getDisplayTitle, getFaviconUrl, normalizeAddressInput } from '../lib/url';
import {
  activateTab,
  addTab,
  createSession,
  createWorkspaceTab,
  removeTab,
  setError,
  setTabGroupId,
  toSnapshot,
  updateTab,
} from '../lib/workspace';

type RuntimeSender = chrome.runtime.MessageSender;

async function makePersistentTab(tabId: number): Promise<void> {
  try {
    await chrome.tabs.update(tabId, { autoDiscardable: false });
  } catch {
    // tab might not exist yet briefly
  }
}

async function injectMediaPlay(tabId: number): Promise<void> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        document.querySelectorAll('video').forEach((v) => {
          try { void v.play(); } catch { /* autoplay blocked */ }
        });
        document.querySelectorAll('audio').forEach((a) => {
          try { void a.play(); } catch { /* autoplay blocked */ }
        });
      },
    });
  } catch {
    // tab not ready or no permission
  }
}

export class SidePanelController {
  private readonly initPromise: Promise<void>;
  private sessions = new Map<number, SidePanelSession>();
  private persistTimer: number | null = null;
  private snapshot: Awaited<ReturnType<typeof loadSessionSnapshot>> = null;
  private keepAliveAlarm = 'sm-keepalive';
  private offscreenReady = false;

  constructor() {
    this.initPromise = this.initialize();
  }

  async start(): Promise<void> {
    await this.initPromise;

    void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

    chrome.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === this.keepAliveAlarm) {
        void this.persistAll();
        void this.keepAliveMedia();
        this.syncOffscreen();
      }
    });
    void chrome.alarms.create(this.keepAliveAlarm, { periodInMinutes: 0.4 });

    chrome.commands.onCommand.addListener((command) => {
      if (command === TOGGLE_COMMAND) {
        void chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
          if (tab?.windowId !== undefined) {
            void chrome.sidePanel.open({ windowId: tab.windowId });
          }
        });
      }
    });

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      void this.handleMessage(message, sender).then(sendResponse);
      return true;
    });

    chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
      this.onTabUpdated(tabId, info as { url?: string; title?: string; favIconUrl?: string; discarded?: boolean }, tab);
    });

    chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
      this.onTabRemoved(tabId, removeInfo.windowId);
    });

    chrome.windows.onRemoved.addListener((windowId) => {
      void this.onWindowRemoved(windowId);
    });
  }

  private async initialize(): Promise<void> {
    const [snapshot, storedSessions] = await Promise.all([
      loadSessionSnapshot(),
      loadAllWindowSessions(),
    ]);
    this.snapshot = snapshot;
    for (const session of storedSessions) {
      this.sessions.set(session.windowId, session);
    }
  }

  private setSession(windowId: number, session: SidePanelSession): void {
    this.sessions.set(windowId, session);
    this.schedulePersistence();
    this.syncOffscreen();
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

  private async keepAliveMedia(): Promise<void> {
    for (const session of this.sessions.values()) {
      for (const wsTab of session.workspaceTabs) {
        if (wsTab.nativeTabId == null) continue;
        try {
          const tab = await chrome.tabs.get(wsTab.nativeTabId);
          if (tab.discarded) {
            await chrome.tabs.reload(wsTab.nativeTabId);
          } else {
            await injectMediaPlay(wsTab.nativeTabId);
          }
        } catch {
          // dead tab
        }
      }
    }
  }

  private sendToPanel(windowId: number, event: PanelEvent): void {
    chrome.runtime.sendMessage(event).catch(() => {});
  }

  private async ensureOffscreenDoc(): Promise<void> {
    if (this.offscreenReady) return;
    try {
      const has = await chrome.offscreen.hasDocument();
      if (has) {
        this.offscreenReady = true;
        return;
      }
      await chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: [chrome.offscreen.Reason.AUDIO_PLAYBACK],
        justification: 'Keep workspace tab media playing while side panel is closed',
      });
      this.offscreenReady = true;
    } catch {
      // offscreen doc creation failed or already exists
      this.offscreenReady = true;
    }
  }

  private syncOffscreen(): void {
    void this.ensureOffscreenDoc().then(() => {
      const allTabs: { id: string; url: string }[] = [];
      for (const session of this.sessions.values()) {
        for (const tab of session.workspaceTabs) {
          allTabs.push({ id: tab.id, url: tab.url });
        }
      }
      chrome.runtime.sendMessage({
        target: 'offscreen',
        type: 'OFFSCREEN_SYNC',
        tabs: allTabs,
      }).catch(() => { this.offscreenReady = false; });
    });
  }

  private closeOffscreenTab(tabId: string): void {
    chrome.runtime.sendMessage({
      target: 'offscreen',
      type: 'OFFSCREEN_CLOSE',
      tabId,
    }).catch(() => {});
  }

  private async syncTabGroup(session: SidePanelSession): Promise<SidePanelSession> {
    const nativeTabIds = session.workspaceTabs
      .map((t) => t.nativeTabId)
      .filter((id): id is number => id !== null);

    if (nativeTabIds.length === 0) return session;

    let groupId = session.tabGroupId;

    if (groupId !== null) {
      try {
        await chrome.tabGroups.get(groupId);
      } catch {
        groupId = null;
      }
    }

    if (groupId === null) {
      groupId = await chrome.tabs.group({ tabIds: nativeTabIds, createProperties: { windowId: session.windowId } });
      try {
        await chrome.tabGroups.update(groupId, {
          title: TAB_GROUP_TITLE,
          collapsed: false,
          color: 'blue',
        });
      } catch {
        // non-critical
      }
      return setTabGroupId(session, groupId);
    }

    try {
      await chrome.tabs.group({ groupId, tabIds: nativeTabIds });
    } catch {
      groupId = await chrome.tabs.group({ tabIds: nativeTabIds, createProperties: { windowId: session.windowId } });
      try {
        await chrome.tabGroups.update(groupId, {
          title: TAB_GROUP_TITLE,
          collapsed: false,
          color: 'blue',
        });
      } catch {
        // non-critical
      }
      return setTabGroupId(session, groupId);
    }
    return session;
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

  private async getOrCreateSession(windowId: number): Promise<SidePanelSession> {
    let session = this.sessions.get(windowId) ?? null;
    if (session) return session;

    session = createSession(windowId, this.snapshot);
    this.sessions.set(windowId, session);
    await saveWindowSession(session);
    return session;
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

      let session = await this.getOrCreateSession(windowId);
      session = await this.ensureAllBackingTabs(windowId, session);
      session = await this.syncTabGroup(session);
      this.sessions.set(windowId, session);
      await saveWindowSession(session);
      return { ok: true, session };
    }

    if (req.type === 'SYNC_IFRAME_URL') {
      await this.onIframeUrlChanged(req.url);
      return { ok: true };
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

        const bgTab = await chrome.tabs.create({
          windowId: session.windowId,
          url,
          active: false,
        });
        if (bgTab.id !== undefined) await makePersistentTab(bgTab.id);

        const wsTab = createWorkspaceTab(url, {
          nativeTabId: bgTab.id ?? null,
          title: bgTab.title ?? getDisplayTitle(url),
          faviconUrl: bgTab.favIconUrl ?? getFaviconUrl(url),
        });
        let next = addTab(session, wsTab);
        next = await this.syncTabGroup(next);
        this.setSession(req.windowId, setError(next, null));
        return { ok: true, session: this.sessions.get(req.windowId) as SidePanelSession };
      }

      case 'NAVIGATE_TAB': {
        const target = session.workspaceTabs.find((t) => t.id === req.workspaceTabId);
        if (!target) return { ok: false, error: 'Tab not found.' };

        const { url } = normalizeAddressInput(req.input);

        if (target.nativeTabId != null) {
          await chrome.tabs.update(target.nativeTabId, { url });
        } else {
          const bgTab = await chrome.tabs.create({
            windowId: session.windowId,
            url,
            active: false,
          });
          if (bgTab.id !== undefined) await makePersistentTab(bgTab.id);
          const patched = updateTab(session, target.id, { nativeTabId: bgTab.id ?? null });
          this.sessions.set(req.windowId, patched);
        }

        const updated = updateTab(
          this.sessions.get(req.windowId) as SidePanelSession,
          target.id,
          { url, title: getDisplayTitle(url), faviconUrl: getFaviconUrl(url) },
        );
        this.setSession(req.windowId, setError(updated, null));
        return { ok: true, session: this.sessions.get(req.windowId) as SidePanelSession };
      }

      case 'ACTIVATE_TAB': {
        const next = activateTab(session, req.workspaceTabId);
        this.setSession(req.windowId, next);
        return { ok: true, session: next };
      }

      case 'VIEW_TAB': {
        const target = session.workspaceTabs.find((t) => t.id === req.workspaceTabId);
        if (!target) return { ok: false, error: 'Tab not found.' };
        if (target.nativeTabId != null) {
          try {
            const tabGroup = await chrome.tabGroups.get(session.tabGroupId ?? -1).catch(() => null);
            if (tabGroup) {
              await chrome.tabGroups.update(tabGroup.id, { collapsed: false });
            }
            await chrome.tabs.update(target.nativeTabId, { active: true });
          } catch {
            // ignore
          }
        }
        return { ok: true, session };
      }

      case 'CLOSE_TAB': {
        const target = session.workspaceTabs.find((t) => t.id === req.workspaceTabId);
        if (target?.nativeTabId != null) {
          try {
            await chrome.tabs.remove(target.nativeTabId);
          } catch {
            // already closed
          }
        }
        let next = removeTab(session, req.workspaceTabId);
        next = await this.syncTabGroup(next);
        this.setSession(req.windowId, setError(next, null));
        return { ok: true, session: this.sessions.get(req.windowId) as SidePanelSession };
      }

      case 'GO_BACK': {
        const target = session.workspaceTabs.find((t) => t.id === req.workspaceTabId);
        if (target?.nativeTabId != null) {
          try { await chrome.tabs.goBack(target.nativeTabId); } catch { /* ignore */ }
        }
        return { ok: true, session };
      }

      case 'GO_FORWARD': {
        const target = session.workspaceTabs.find((t) => t.id === req.workspaceTabId);
        if (target?.nativeTabId != null) {
          try { await chrome.tabs.goForward(target.nativeTabId); } catch { /* ignore */ }
        }
        return { ok: true, session };
      }

      case 'RELOAD': {
        const target = session.workspaceTabs.find((t) => t.id === req.workspaceTabId);
        if (target?.nativeTabId != null) {
          await chrome.tabs.reload(target.nativeTabId);
        }
        return { ok: true, session };
      }

      default:
        return { ok: false, error: 'Unhandled.' };
    }
  }

  private async onIframeUrlChanged(newUrl: string): Promise<void> {
    for (const [windowId, session] of this.sessions) {
      const active = session.workspaceTabs.find((t) => t.id === session.activeTabId);
      if (!active || active.url === newUrl) continue;

      const next = updateTab(session, active.id, {
        url: newUrl,
        title: getDisplayTitle(newUrl),
        faviconUrl: getFaviconUrl(newUrl),
      });
      this.setSession(windowId, next);

      if (active.nativeTabId != null) {
        try {
          const bgTab = await chrome.tabs.get(active.nativeTabId);
          if (bgTab.url !== newUrl) {
            await chrome.tabs.update(active.nativeTabId, { url: newUrl });
            chrome.tabs.onUpdated.addListener(function listener(tid, info) {
              if (tid === active.nativeTabId && info.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(listener);
                void injectMediaPlay(active.nativeTabId);
              }
            });
          }
        } catch {
          // dead tab
        }
      }
      break;
    }
  }

  private async ensureAllBackingTabs(
    windowId: number,
    session: SidePanelSession,
  ): Promise<SidePanelSession> {
    let current = session;
    for (const wsTab of current.workspaceTabs) {
      if (wsTab.nativeTabId != null) {
        try {
          const existing = await chrome.tabs.get(wsTab.nativeTabId);
          await makePersistentTab(existing.id!);

          // If the tab was discarded, reload it
          if (existing.discarded) {
            await chrome.tabs.reload(existing.id!);
          }

          const syncUpdate: { url?: string; title?: string; faviconUrl?: string } = {};
          if (existing.url && existing.url !== wsTab.url) syncUpdate.url = existing.url;
          if (existing.title && existing.title !== wsTab.title) syncUpdate.title = existing.title;
          if (existing.favIconUrl && existing.favIconUrl !== wsTab.faviconUrl) syncUpdate.faviconUrl = existing.favIconUrl;
          if (Object.keys(syncUpdate).length > 0) {
            current = updateTab(current, wsTab.id, syncUpdate);
          }
          continue;
        } catch {
          // dead tab, recreate below
        }
      }

      const bgTab = await chrome.tabs.create({
        windowId,
        url: wsTab.url,
        active: false,
      });
      if (bgTab.id !== undefined) await makePersistentTab(bgTab.id);
      current = updateTab(current, wsTab.id, {
        nativeTabId: bgTab.id ?? null,
        title: bgTab.title ?? wsTab.title,
        faviconUrl: bgTab.favIconUrl ?? wsTab.faviconUrl,
      });
    }
    return current;
  }

  private onTabUpdated(
    tabId: number,
    info: { url?: string; title?: string; favIconUrl?: string; discarded?: boolean },
    tab: chrome.tabs.Tab,
  ): void {
    if (tab.windowId === undefined) return;

    const session = this.sessions.get(tab.windowId);
    if (!session) return;

    const wsTab = session.workspaceTabs.find((t) => t.nativeTabId === tabId);
    if (!wsTab) return;

    // If tab was discarded, immediately reload it
    if (info.discarded) {
      void chrome.tabs.reload(tabId);
      return;
    }

    const updates: { url?: string; title?: string; faviconUrl?: string } = {};
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

    for (const wsTab of session.workspaceTabs) {
      if (wsTab.nativeTabId != null) {
        try { await chrome.tabs.remove(wsTab.nativeTabId); } catch { /* ignore */ }
      }
    }

    await this.persistSnapshot(session);
    this.sessions.delete(windowId);
    this.syncOffscreen();
    await removeWindowSession(windowId);
  }
}
