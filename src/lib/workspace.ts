import {
  DEFAULT_DOCK_WIDTH,
  DEFAULT_WORKSPACE_TITLE,
  LAST_SESSION_KEY,
} from './constants';
import type {
  DockState,
  DockWindowSession,
  StoredWorkspaceSnapshot,
  UserPreferences,
  WorkspaceTab,
} from './schema';
import { getDisplayTitle } from './url';

function createWorkspaceTabId(): string {
  return `workspace-${crypto.randomUUID()}`;
}

function now(): number {
  return Date.now();
}

export function createWorkspaceTab(
  url: string,
  overrides: Partial<WorkspaceTab> = {},
): WorkspaceTab {
  return {
    id: overrides.id ?? createWorkspaceTabId(),
    url,
    title:
      overrides.title ??
      getDisplayTitle(url) ??
      DEFAULT_WORKSPACE_TITLE,
    faviconUrl: overrides.faviconUrl ?? null,
    mode: overrides.mode ?? 'embedded',
    loadingState: overrides.loadingState ?? 'loading',
    lastActiveAt: overrides.lastActiveAt ?? now(),
    nativeTabId: overrides.nativeTabId ?? null,
    blockedReason: overrides.blockedReason ?? null,
    embedConfidence: overrides.embedConfidence ?? 'unknown',
  };
}

export function deriveDockState(
  pinned: boolean,
  collapsed: boolean,
  activeTab: WorkspaceTab | undefined,
): DockState {
  if (activeTab?.mode === 'nativeFallback') {
    return 'native-fallback';
  }

  if (pinned) {
    return 'pinned';
  }

  return collapsed ? 'collapsed' : 'hover-expanded';
}

export function createWindowSession(
  windowId: number,
  browserTabId: number,
  preferences: UserPreferences,
  snapshot?: StoredWorkspaceSnapshot | null,
  seedUrl?: string,
): DockWindowSession {
  const seededTabs =
    snapshot?.workspaceTabs.length && snapshot.workspaceTabs.length > 0
      ? snapshot.workspaceTabs
      : [createWorkspaceTab(seedUrl ?? 'https://www.google.com')];
  const activeWorkspaceTabId =
    snapshot?.activeWorkspaceTabId ?? seededTabs.at(0)?.id ?? createWorkspaceTabId();
  const activeWorkspaceTab =
    seededTabs.find((tab) => tab.id === activeWorkspaceTabId) ?? seededTabs[0];
  const pinned = snapshot?.pinned ?? preferences.defaultPinned;
  const collapsed = pinned ? false : false;

  return {
    windowId,
    currentBrowserTabId: browserTabId,
    activeWorkspaceTabId: activeWorkspaceTab.id,
    workspaceTabs: seededTabs,
    state: deriveDockState(pinned, collapsed, activeWorkspaceTab),
    pinned,
    collapsed,
    dockWidth: snapshot?.dockWidth ?? preferences.dockWidth ?? DEFAULT_DOCK_WIDTH,
    hostAccessGranted: false,
    lastError: null,
    updatedAt: now(),
  };
}

type SessionTransform = (session: DockWindowSession) => DockWindowSession;

function withSessionUpdate(
  session: DockWindowSession,
  transform: SessionTransform,
): DockWindowSession {
  const nextSession = transform(session);
  const activeTab =
    nextSession.workspaceTabs.find(
      (workspaceTab) => workspaceTab.id === nextSession.activeWorkspaceTabId,
    ) ?? nextSession.workspaceTabs[0];

  return {
    ...nextSession,
    activeWorkspaceTabId: activeTab.id,
    state: deriveDockState(
      nextSession.pinned,
      nextSession.collapsed,
      activeTab,
    ),
    updatedAt: now(),
  };
}

export function setPinnedState(
  session: DockWindowSession,
  pinned: boolean,
): DockWindowSession {
  return withSessionUpdate(session, (currentSession) => ({
    ...currentSession,
    pinned,
    collapsed: pinned ? false : currentSession.collapsed,
  }));
}

export function setCollapsedState(
  session: DockWindowSession,
  collapsed: boolean,
): DockWindowSession {
  return withSessionUpdate(session, (currentSession) => ({
    ...currentSession,
    collapsed: currentSession.pinned ? false : collapsed,
  }));
}

export function activateWorkspaceTab(
  session: DockWindowSession,
  workspaceTabId: string,
): DockWindowSession {
  return withSessionUpdate(session, (currentSession) => ({
    ...currentSession,
    workspaceTabs: currentSession.workspaceTabs.map((workspaceTab) =>
      workspaceTab.id === workspaceTabId
        ? {
            ...workspaceTab,
            lastActiveAt: now(),
          }
        : workspaceTab,
    ),
    activeWorkspaceTabId: workspaceTabId,
    collapsed: currentSession.pinned ? false : false,
  }));
}

export function createWorkspaceTabInSession(
  session: DockWindowSession,
  workspaceTab: WorkspaceTab,
): DockWindowSession {
  return withSessionUpdate(session, (currentSession) => ({
    ...currentSession,
    workspaceTabs: [workspaceTab, ...currentSession.workspaceTabs],
    activeWorkspaceTabId: workspaceTab.id,
    collapsed: currentSession.pinned ? false : false,
  }));
}

export function closeWorkspaceTabInSession(
  session: DockWindowSession,
  workspaceTabId: string,
): DockWindowSession {
  return withSessionUpdate(session, (currentSession) => {
    const nextTabs = currentSession.workspaceTabs.filter(
      (workspaceTab) => workspaceTab.id !== workspaceTabId,
    );

    const nextActiveId =
      currentSession.activeWorkspaceTabId === workspaceTabId
        ? nextTabs[0]?.id ?? currentSession.activeWorkspaceTabId
        : currentSession.activeWorkspaceTabId;

    return {
      ...currentSession,
      workspaceTabs:
        nextTabs.length > 0
          ? nextTabs
          : [createWorkspaceTab('https://www.google.com')],
      activeWorkspaceTabId: nextActiveId,
    };
  });
}

export function updateWorkspaceTab(
  session: DockWindowSession,
  workspaceTabId: string,
  update: Partial<WorkspaceTab>,
): DockWindowSession {
  return withSessionUpdate(session, (currentSession) => ({
    ...currentSession,
    workspaceTabs: currentSession.workspaceTabs.map((workspaceTab) =>
      workspaceTab.id === workspaceTabId
        ? {
            ...workspaceTab,
            ...update,
          }
        : workspaceTab,
    ),
  }));
}

export function setSessionError(
  session: DockWindowSession,
  error: string | null,
): DockWindowSession {
  return withSessionUpdate(session, (currentSession) => ({
    ...currentSession,
    lastError: error,
  }));
}

export function setHostAccessGranted(
  session: DockWindowSession,
  granted: boolean,
): DockWindowSession {
  return withSessionUpdate(session, (currentSession) => ({
    ...currentSession,
    hostAccessGranted: granted,
  }));
}

export function setCurrentBrowserTab(
  session: DockWindowSession,
  browserTabId: number | null,
): DockWindowSession {
  return withSessionUpdate(session, (currentSession) => ({
    ...currentSession,
    currentBrowserTabId: browserTabId,
  }));
}

export function toStoredWorkspaceSnapshot(
  session: DockWindowSession,
): Record<typeof LAST_SESSION_KEY, StoredWorkspaceSnapshot> {
  return {
    [LAST_SESSION_KEY]: {
      activeWorkspaceTabId: session.activeWorkspaceTabId,
      workspaceTabs: session.workspaceTabs,
      dockWidth: session.dockWidth,
      pinned: session.pinned,
      updatedAt: now(),
    },
  };
}
