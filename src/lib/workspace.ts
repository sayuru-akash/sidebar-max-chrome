import {
  DEFAULT_WORKSPACE_START_URL,
  DEFAULT_WORKSPACE_TITLE,
  LAST_SESSION_KEY,
} from './constants';
import type {
  SidePanelSession,
  StoredSessionSnapshot,
  WorkspaceTab,
} from './schema';
import { getDisplayTitle } from './url';

function createWorkspaceTabId(): string {
  return `ws-${crypto.randomUUID()}`;
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
    title: overrides.title ?? getDisplayTitle(url) ?? DEFAULT_WORKSPACE_TITLE,
    faviconUrl: overrides.faviconUrl ?? null,
    nativeTabId: overrides.nativeTabId ?? null,
    lastActiveAt: overrides.lastActiveAt ?? now(),
  };
}

export function createSession(
  windowId: number,
  snapshot?: StoredSessionSnapshot | null,
): SidePanelSession {
  const tabs =
    snapshot && snapshot.workspaceTabs.length > 0
      ? snapshot.workspaceTabs
      : [createWorkspaceTab(DEFAULT_WORKSPACE_START_URL)];
  const activeTabId = snapshot?.activeTabId ?? tabs[0].id;

  return {
    windowId,
    activeTabId,
    workspaceTabs: tabs,
    tabGroupId: null,
    pinned: true,
    lastError: null,
    updatedAt: now(),
  };
}

export function activateTab(
  session: SidePanelSession,
  workspaceTabId: string,
): SidePanelSession {
  return {
    ...session,
    activeTabId: workspaceTabId,
    workspaceTabs: session.workspaceTabs.map((t) =>
      t.id === workspaceTabId ? { ...t, lastActiveAt: now() } : t,
    ),
    updatedAt: now(),
  };
}

export function addTab(
  session: SidePanelSession,
  tab: WorkspaceTab,
): SidePanelSession {
  return {
    ...session,
    activeTabId: tab.id,
    workspaceTabs: [tab, ...session.workspaceTabs],
    updatedAt: now(),
  };
}

export function removeTab(
  session: SidePanelSession,
  workspaceTabId: string,
): SidePanelSession {
  const nextTabs = session.workspaceTabs.filter((t) => t.id !== workspaceTabId);
  const nextActiveId =
    session.activeTabId === workspaceTabId
      ? nextTabs[0]?.id ?? createWorkspaceTab(DEFAULT_WORKSPACE_START_URL).id
      : session.activeTabId;

  if (nextTabs.length === 0) {
    const fallback = createWorkspaceTab(DEFAULT_WORKSPACE_START_URL);
    return {
      ...session,
      activeTabId: fallback.id,
      workspaceTabs: [fallback],
      updatedAt: now(),
    };
  }

  return {
    ...session,
    activeTabId: nextActiveId,
    workspaceTabs: nextTabs,
    updatedAt: now(),
  };
}

export function updateTab(
  session: SidePanelSession,
  workspaceTabId: string,
  update: Partial<WorkspaceTab>,
): SidePanelSession {
  return {
    ...session,
    workspaceTabs: session.workspaceTabs.map((t) =>
      t.id === workspaceTabId ? { ...t, ...update } : t,
    ),
    updatedAt: now(),
  };
}

export function setPinned(
  session: SidePanelSession,
  pinned: boolean,
): SidePanelSession {
  return { ...session, pinned, updatedAt: now() };
}

export function setTabGroupId(
  session: SidePanelSession,
  tabGroupId: number | null,
): SidePanelSession {
  return { ...session, tabGroupId, updatedAt: now() };
}

export function setError(
  session: SidePanelSession,
  error: string | null,
): SidePanelSession {
  return { ...session, lastError: error, updatedAt: now() };
}

export function toSnapshot(session: SidePanelSession): Record<string, StoredSessionSnapshot> {
  return {
    [LAST_SESSION_KEY]: {
      activeTabId: session.activeTabId,
      workspaceTabs: session.workspaceTabs,
      updatedAt: now(),
    },
  };
}
