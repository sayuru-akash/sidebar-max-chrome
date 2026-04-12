import { z } from 'zod';

export const WorkspaceTabModeSchema = z.enum(['embedded', 'nativeFallback']);
export const WorkspaceTabLoadingStateSchema = z.enum([
  'idle',
  'loading',
  'ready',
  'blocked',
  'error',
]);
export const DockStateSchema = z.enum([
  'closed',
  'pinned',
  'collapsed',
  'hover-expanded',
  'native-fallback',
]);
export const EmbedProbeReasonSchema = z.enum([
  'x-frame-options',
  'content-security-policy',
  'unsupported-protocol',
  'probe-failed',
]);
export const EmbedProbeConfidenceSchema = z.enum(['high', 'low', 'unknown']);

export const WorkspaceTabSchema = z.object({
  id: z.string().min(1),
  url: z.string().min(1),
  title: z.string().min(1),
  faviconUrl: z.string().nullable().optional(),
  mode: WorkspaceTabModeSchema,
  loadingState: WorkspaceTabLoadingStateSchema,
  lastActiveAt: z.number().int().nonnegative(),
  nativeTabId: z.number().int().nullable().optional(),
  blockedReason: z.string().nullable().optional(),
  embedConfidence: EmbedProbeConfidenceSchema.default('unknown'),
});

export const UserPreferencesSchema = z.object({
  defaultPinned: z.boolean(),
  dockWidth: z.number().int().min(340).max(560),
  reducedMotion: z.boolean(),
});

export const DockWindowSessionSchema = z.object({
  windowId: z.number().int().nonnegative(),
  state: DockStateSchema,
  pinned: z.boolean(),
  collapsed: z.boolean(),
  activeWorkspaceTabId: z.string().min(1),
  workspaceTabs: z.array(WorkspaceTabSchema).min(1),
  currentBrowserTabId: z.number().int().nonnegative().nullable().optional(),
  dockWidth: z.number().int().min(340).max(560),
  hostAccessGranted: z.boolean(),
  lastError: z.string().nullable().optional(),
  updatedAt: z.number().int().nonnegative(),
});

export const StoredWorkspaceSnapshotSchema = z.object({
  activeWorkspaceTabId: z.string().min(1),
  workspaceTabs: z.array(WorkspaceTabSchema).min(1),
  dockWidth: z.number().int().min(340).max(560),
  pinned: z.boolean(),
  updatedAt: z.number().int().nonnegative(),
});

export const EmbedProbeResultSchema = z.object({
  allowed: z.boolean(),
  confidence: EmbedProbeConfidenceSchema,
  reason: EmbedProbeReasonSchema.optional(),
  details: z.string().optional(),
});

export const OpenDockMessageSchema = z.object({
  type: z.literal('OPEN_DOCK'),
  windowId: z.number().int().nonnegative(),
  tabId: z.number().int().nonnegative(),
});

export const CloseDockMessageSchema = z.object({
  type: z.literal('CLOSE_DOCK'),
  windowId: z.number().int().nonnegative(),
});

export const SetPinnedMessageSchema = z.object({
  type: z.literal('SET_PINNED'),
  windowId: z.number().int().nonnegative(),
  pinned: z.boolean(),
});

export const SetCollapsedMessageSchema = z.object({
  type: z.literal('SET_COLLAPSED'),
  windowId: z.number().int().nonnegative(),
  collapsed: z.boolean(),
});

export const NavigateWorkspaceTabMessageSchema = z.object({
  type: z.literal('NAVIGATE_WORKSPACE_TAB'),
  windowId: z.number().int().nonnegative(),
  workspaceTabId: z.string().min(1),
  input: z.string().min(1),
});

export const CreateWorkspaceTabMessageSchema = z.object({
  type: z.literal('CREATE_WORKSPACE_TAB'),
  windowId: z.number().int().nonnegative(),
  input: z.string().min(1).optional(),
});

export const CloseWorkspaceTabMessageSchema = z.object({
  type: z.literal('CLOSE_WORKSPACE_TAB'),
  windowId: z.number().int().nonnegative(),
  workspaceTabId: z.string().min(1),
});

export const ActivateWorkspaceTabMessageSchema = z.object({
  type: z.literal('ACTIVATE_WORKSPACE_TAB'),
  windowId: z.number().int().nonnegative(),
  workspaceTabId: z.string().min(1),
});

export const SyncFallbackTabMessageSchema = z.object({
  type: z.literal('SYNC_FALLBACK_TAB'),
  windowId: z.number().int().nonnegative(),
  workspaceTabId: z.string().min(1),
  browserTabId: z.number().int().nonnegative().nullable().optional(),
});

export const RequestHostAccessMessageSchema = z.object({
  type: z.literal('REQUEST_HOST_ACCESS'),
  windowId: z.number().int().nonnegative(),
});

export const RestoreSessionMessageSchema = z.object({
  type: z.literal('RESTORE_SESSION'),
});

export const UiReadyMessageSchema = z.object({
  type: z.literal('UI_READY'),
});

export const DockRequestMessageSchema = z.discriminatedUnion('type', [
  OpenDockMessageSchema,
  CloseDockMessageSchema,
  SetPinnedMessageSchema,
  SetCollapsedMessageSchema,
  NavigateWorkspaceTabMessageSchema,
  CreateWorkspaceTabMessageSchema,
  CloseWorkspaceTabMessageSchema,
  ActivateWorkspaceTabMessageSchema,
  SyncFallbackTabMessageSchema,
  RequestHostAccessMessageSchema,
  RestoreSessionMessageSchema,
  UiReadyMessageSchema,
]);

export const SessionUpdatedEventSchema = z.object({
  type: z.literal('SESSION_UPDATED'),
  windowId: z.number().int().nonnegative(),
  session: DockWindowSessionSchema,
});

export const SessionClosedEventSchema = z.object({
  type: z.literal('SESSION_CLOSED'),
  windowId: z.number().int().nonnegative(),
});

export const DockEventMessageSchema = z.discriminatedUnion('type', [
  SessionUpdatedEventSchema,
  SessionClosedEventSchema,
]);

export const DockResponseSchema = z.object({
  ok: z.boolean(),
  session: DockWindowSessionSchema.optional(),
  error: z.string().optional(),
});

export type WorkspaceTab = z.infer<typeof WorkspaceTabSchema>;
export type UserPreferences = z.infer<typeof UserPreferencesSchema>;
export type DockWindowSession = z.infer<typeof DockWindowSessionSchema>;
export type StoredWorkspaceSnapshot = z.infer<
  typeof StoredWorkspaceSnapshotSchema
>;
export type EmbedProbeResult = z.infer<typeof EmbedProbeResultSchema>;
export type DockRequestMessage = z.infer<typeof DockRequestMessageSchema>;
export type DockEventMessage = z.infer<typeof DockEventMessageSchema>;
export type DockResponse = z.infer<typeof DockResponseSchema>;
export type DockState = z.infer<typeof DockStateSchema>;
