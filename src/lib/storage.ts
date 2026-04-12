import {
  LAST_SESSION_KEY,
  USER_PREFERENCES_KEY,
  WINDOW_SESSIONS_KEY,
  DEFAULT_DOCK_WIDTH,
} from './constants';
import {
  DockWindowSessionSchema,
  StoredWorkspaceSnapshotSchema,
  UserPreferencesSchema,
  type DockWindowSession,
  type StoredWorkspaceSnapshot,
  type UserPreferences,
} from './schema';

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  defaultPinned: true,
  dockWidth: DEFAULT_DOCK_WIDTH,
  reducedMotion: false,
};

export async function loadUserPreferences(): Promise<UserPreferences> {
  const storedValue = await chrome.storage.sync.get(USER_PREFERENCES_KEY);
  const parsed = UserPreferencesSchema.safeParse(
    storedValue[USER_PREFERENCES_KEY] ?? DEFAULT_USER_PREFERENCES,
  );

  return parsed.success ? parsed.data : DEFAULT_USER_PREFERENCES;
}

export async function saveUserPreferences(
  preferences: UserPreferences,
): Promise<void> {
  await chrome.storage.sync.set({
    [USER_PREFERENCES_KEY]: preferences,
  });
}

export async function loadWindowSessions(): Promise<Record<number, DockWindowSession>> {
  const storedValue = await chrome.storage.session.get(WINDOW_SESSIONS_KEY);
  const sessions = storedValue[WINDOW_SESSIONS_KEY] as
    | Record<string, DockWindowSession>
    | undefined;

  if (!sessions) {
    return {};
  }

  const entries = Object.entries(sessions)
    .map(([windowId, session]) => {
      const parsed = DockWindowSessionSchema.safeParse(session);
      return parsed.success ? [Number(windowId), parsed.data] : null;
    })
    .filter(
      (value): value is [number, DockWindowSession] => value !== null,
    );

  return Object.fromEntries(entries);
}

export async function saveWindowSessions(
  sessions: Record<number, DockWindowSession>,
): Promise<void> {
  await chrome.storage.session.set({
    [WINDOW_SESSIONS_KEY]: sessions,
  });
}

export async function loadStoredWorkspaceSnapshot(): Promise<StoredWorkspaceSnapshot | null> {
  const storedValue = await chrome.storage.local.get(LAST_SESSION_KEY);
  const parsed = StoredWorkspaceSnapshotSchema.safeParse(
    storedValue[LAST_SESSION_KEY] ?? null,
  );

  return parsed.success ? parsed.data : null;
}

export async function saveStoredWorkspaceSnapshot(
  snapshot: StoredWorkspaceSnapshot,
): Promise<void> {
  await chrome.storage.local.set({
    [LAST_SESSION_KEY]: snapshot,
  });
}

