import { z } from 'zod';

export const WorkspaceTabSchema = z.object({
  id: z.string().min(1),
  url: z.string().min(1),
  title: z.string(),
  faviconUrl: z.string().nullable(),
  lastActiveAt: z.number().int().nonnegative(),
});

export const SidePanelSessionSchema = z.object({
  windowId: z.number().int().nonnegative(),
  activeTabId: z.string().min(1),
  workspaceTabs: z.array(WorkspaceTabSchema).min(0),
  pinned: z.boolean(),
  updatedAt: z.number().int().nonnegative(),
});

export const StoredSessionSnapshotSchema = z.object({
  activeTabId: z.string().min(1),
  workspaceTabs: z.array(WorkspaceTabSchema).min(0),
  updatedAt: z.number().int().nonnegative(),
});

export const NavigateTabMessageSchema = z.object({
  type: z.literal('NAVIGATE_TAB'),
  windowId: z.number().int().nonnegative(),
  workspaceTabId: z.string().min(1),
  input: z.string().min(1),
});

export const CreateTabMessageSchema = z.object({
  type: z.literal('CREATE_TAB'),
  windowId: z.number().int().nonnegative(),
  input: z.string().optional(),
});

export const CloseTabMessageSchema = z.object({
  type: z.literal('CLOSE_TAB'),
  windowId: z.number().int().nonnegative(),
  workspaceTabId: z.string().min(1),
});

export const ActivateTabMessageSchema = z.object({
  type: z.literal('ACTIVATE_TAB'),
  windowId: z.number().int().nonnegative(),
  workspaceTabId: z.string().min(1),
});

export const GoBackMessageSchema = z.object({
  type: z.literal('GO_BACK'),
  windowId: z.number().int().nonnegative(),
  workspaceTabId: z.string().min(1),
});

export const GoForwardMessageSchema = z.object({
  type: z.literal('GO_FORWARD'),
  windowId: z.number().int().nonnegative(),
  workspaceTabId: z.string().min(1),
});

export const ReloadMessageSchema = z.object({
  type: z.literal('RELOAD'),
  windowId: z.number().int().nonnegative(),
  workspaceTabId: z.string().min(1),
});

export const GetSessionMessageSchema = z.object({
  type: z.literal('GET_SESSION'),
  windowId: z.number().int().nonnegative(),
});

export const PanelReadyMessageSchema = z.object({
  type: z.literal('PANEL_READY'),
});

export const SyncIframeUrlMessageSchema = z.object({
  type: z.literal('SYNC_IFRAME_URL'),
  url: z.string().min(1),
  tabId: z.string().optional(),
});

export const PanelRequestSchema = z.discriminatedUnion('type', [
  NavigateTabMessageSchema,
  CreateTabMessageSchema,
  CloseTabMessageSchema,
  ActivateTabMessageSchema,
  GoBackMessageSchema,
  GoForwardMessageSchema,
  ReloadMessageSchema,
  GetSessionMessageSchema,
  PanelReadyMessageSchema,
  SyncIframeUrlMessageSchema,
]);

export const SessionUpdatedEventSchema = z.object({
  type: z.literal('SESSION_UPDATED'),
  session: SidePanelSessionSchema,
});

export const PanelEventSchema = z.discriminatedUnion('type', [
  SessionUpdatedEventSchema,
]);

export const PanelResponseSchema = z.object({
  ok: z.boolean(),
  session: SidePanelSessionSchema.optional(),
  error: z.string().optional(),
});

export type WorkspaceTab = z.infer<typeof WorkspaceTabSchema>;
export type SidePanelSession = z.infer<typeof SidePanelSessionSchema>;
export type StoredSessionSnapshot = z.infer<typeof StoredSessionSnapshotSchema>;
export type PanelRequest = z.infer<typeof PanelRequestSchema>;
export type PanelEvent = z.infer<typeof PanelEventSchema>;
export type PanelResponse = z.infer<typeof PanelResponseSchema>;
