import {
  LAST_SESSION_KEY,
} from './constants';
import {
  SidePanelSessionSchema,
  StoredSessionSnapshotSchema,
  type SidePanelSession,
  type StoredSessionSnapshot,
} from './schema';

export async function loadSessionSnapshot(): Promise<StoredSessionSnapshot | null> {
  const storedValue = await chrome.storage.local.get(LAST_SESSION_KEY);
  const parsed = StoredSessionSnapshotSchema.safeParse(
    storedValue[LAST_SESSION_KEY] ?? null,
  );
  return parsed.success ? parsed.data : null;
}

export async function saveSessionSnapshot(
  snapshot: StoredSessionSnapshot,
): Promise<void> {
  await chrome.storage.local.set({ [LAST_SESSION_KEY]: snapshot });
}

export async function loadAllWindowSessions(): Promise<SidePanelSession[]> {
  const all = await chrome.storage.local.get(null);
  const sessions: SidePanelSession[] = [];
  for (const [key, value] of Object.entries(all)) {
    if (!key.startsWith('ws-')) continue;
    const parsed = SidePanelSessionSchema.safeParse(value);
    if (parsed.success) sessions.push(parsed.data);
  }
  return sessions;
}

export async function saveWindowSession(
  session: SidePanelSession,
): Promise<void> {
  const key = `ws-${session.windowId}`;
  await chrome.storage.local.set({ [key]: session });
}

export async function removeWindowSession(windowId: number): Promise<void> {
  const key = `ws-${windowId}`;
  await chrome.storage.local.remove(key);
}
