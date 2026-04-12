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

export async function loadWindowSession(
  windowId: number,
): Promise<SidePanelSession | null> {
  const key = `ws-${windowId}`;
  const storedValue = await chrome.storage.session.get(key);
  const parsed = SidePanelSessionSchema.safeParse(storedValue[key] ?? null);
  return parsed.success ? parsed.data : null;
}

export async function saveWindowSession(
  session: SidePanelSession,
): Promise<void> {
  const key = `ws-${session.windowId}`;
  await chrome.storage.session.set({ [key]: session });
}
