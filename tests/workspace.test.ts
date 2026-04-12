import { describe, expect, test } from 'vitest';

import {
  createWorkspaceTab,
  createSession,
  activateTab,
  addTab,
  removeTab,
  updateTab,
} from '../src/lib/workspace';

describe('workspace session helpers', () => {
  test('creates a session with a default tab', () => {
    const session = createSession(10);
    expect(session.windowId).toBe(10);
    expect(session.workspaceTabs).toHaveLength(1);
    expect(session.activeTabId).toBe(session.workspaceTabs[0].id);
  });

  test('creates a session from snapshot', () => {
    const tab = createWorkspaceTab('https://example.com');
    const session = createSession(10, {
      activeTabId: tab.id,
      workspaceTabs: [tab],
      updatedAt: Date.now(),
    });
    expect(session.workspaceTabs).toHaveLength(1);
    expect(session.activeTabId).toBe(tab.id);
  });

  test('adds a new tab and makes it active', () => {
    let session = createSession(10);
    const tab = createWorkspaceTab('https://second.example.com');
    session = addTab(session, tab);
    expect(session.workspaceTabs).toHaveLength(2);
    expect(session.activeTabId).toBe(tab.id);
  });

  test('removes a tab and falls back to first', () => {
    let session = createSession(10);
    const tab = createWorkspaceTab('https://second.example.com');
    session = addTab(session, tab);
    session = removeTab(session, tab.id);
    expect(session.workspaceTabs).toHaveLength(1);
  });

  test('removes last tab and creates fallback', () => {
    let session = createSession(10);
    const onlyId = session.workspaceTabs[0].id;
    session = removeTab(session, onlyId);
    expect(session.workspaceTabs).toHaveLength(1);
    expect(session.workspaceTabs[0].id).not.toBe(onlyId);
  });

  test('activates a tab by id', () => {
    let session = createSession(10);
    const tab = createWorkspaceTab('https://test.com');
    session = addTab(session, tab);
    session = activateTab(session, tab.id);
    expect(session.activeTabId).toBe(tab.id);
  });

  test('updates tab properties', () => {
    let session = createSession(10);
    const tabId = session.workspaceTabs[0].id;
    session = updateTab(session, tabId, { title: 'Updated' });
    expect(session.workspaceTabs[0].title).toBe('Updated');
  });
});
