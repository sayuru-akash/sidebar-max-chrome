import { describe, expect, test } from 'vitest';

import type { UserPreferences } from '../src/lib/schema';
import {
  activateWorkspaceTab,
  createWindowSession,
  createWorkspaceTab,
  createWorkspaceTabInSession,
  setCollapsedState,
  setPinnedState,
  updateWorkspaceTab,
} from '../src/lib/workspace';

const preferences: UserPreferences = {
  defaultPinned: true,
  dockWidth: 428,
  reducedMotion: false,
};

describe('workspace session helpers', () => {
  test('creates a pinned session by default', () => {
    const session = createWindowSession(
      10,
      20,
      preferences,
      null,
      'https://example.com',
    );

    expect(session.windowId).toBe(10);
    expect(session.pinned).toBe(true);
    expect(session.state).toBe('pinned');
    expect(session.workspaceTabs).toHaveLength(1);
  });

  test('creates and activates new workspace tabs', () => {
    const session = createWindowSession(
      10,
      20,
      preferences,
      null,
      'https://example.com',
    );
    const workspaceTab = createWorkspaceTab('https://second.example.com');
    const nextSession = createWorkspaceTabInSession(session, workspaceTab);

    expect(nextSession.activeWorkspaceTabId).toBe(workspaceTab.id);
    expect(nextSession.workspaceTabs[0]?.id).toBe(workspaceTab.id);
  });

  test('derives hover-expanded state for unpinned sessions', () => {
    const session = createWindowSession(
      10,
      20,
      preferences,
      null,
      'https://example.com',
    );
    const unpinned = setPinnedState(session, false);

    expect(unpinned.state).toBe('hover-expanded');
    expect(unpinned.pinned).toBe(false);
  });

  test('derives collapsed state when floating dock is collapsed', () => {
    const session = createWindowSession(
      10,
      20,
      preferences,
      null,
      'https://example.com',
    );
    const collapsed = setCollapsedState(setPinnedState(session, false), true);

    expect(collapsed.state).toBe('collapsed');
    expect(collapsed.collapsed).toBe(true);
  });

  test('enters native-fallback state when active tab is fallback', () => {
    const session = createWindowSession(
      10,
      20,
      preferences,
      null,
      'https://example.com',
    );
    const activeWorkspaceId = session.activeWorkspaceTabId;
    const fallbackSession = updateWorkspaceTab(session, activeWorkspaceId, {
      mode: 'nativeFallback',
    });

    expect(fallbackSession.state).toBe('native-fallback');
  });

  test('tracks tab activation timestamps', () => {
    const session = createWindowSession(
      10,
      20,
      preferences,
      null,
      'https://example.com',
    );
    const workspaceTab = createWorkspaceTab('https://second.example.com');
    const updatedSession = createWorkspaceTabInSession(session, workspaceTab);
    const activatedSession = activateWorkspaceTab(
      updatedSession,
      session.activeWorkspaceTabId,
    );

    expect(activatedSession.activeWorkspaceTabId).toBe(session.activeWorkspaceTabId);
  });
});
