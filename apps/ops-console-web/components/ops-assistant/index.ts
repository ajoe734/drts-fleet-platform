/**
 * Ops Assistant — public surface.
 *
 * Ships the Context Envelope provider, page selection/scope publishers, and
 * the floating widget shell used to surface assistant navigation/deep-link
 * actions inside ops-console.
 */

export type {
  AssistantActionBridge,
  AssistantActionReceipt,
  AssistantEntityKind,
  AssistantScope,
  AssistantSelection,
  OpsAssistantContext,
  OpsAssistantIdentity,
} from "./context-envelope";

export {
  OpsAssistantContextProvider,
  useOpsAssistantContext,
  useOpsAssistantActionBridge,
  useOpsAssistantContextActions,
  useAssistantActionBridgeRegistration,
  useAssistantSelection,
  type OpsAssistantContextActions,
  type OpsAssistantContextProviderProps,
} from "./assistant-context-provider";

export {
  PublishAssistantSelection,
  PublishAssistantScope,
  type PublishAssistantSelectionProps,
  type PublishAssistantScopeProps,
} from "./publish-assistant-context";
export { OpsAssistantWidget } from "./assistant-widget";
export {
  buildAssistantActions,
  buildAssistantNavigationHref,
  resolveAssistantActionHref,
  type AssistantAction,
  type AssistantNavigationAction,
  type AssistantCrossAppAction,
} from "./assistant-actions";
export {
  resolveCrossAppHref,
  resolvePlatformAdminOrigin,
  buildPlatformAdminAuditUrl,
  sanitizeAuditHref,
  type PlatformAdminAuditContext,
} from "./cross-app-url";
export {
  type DockSide,
  type WidgetState,
  type Rect,
  type AssistantTheme,
  STORAGE_KEY,
  WIDGET_MIN_WIDTH,
  WIDGET_MIN_HEIGHT,
  WIDGET_MAX_WIDTH,
  WIDGET_MAX_HEIGHT,
  HEADER_HEIGHT,
  MINIMIZED_HEIGHT,
  EDGE_GAP,
  MOVE_STEP,
  RESIZE_STEP,
  STREAM_TICK_MS,
  STREAM_PAUSE_MS,
  FORCE_DEGRADED_KEY,
  FORCE_DISABLED_KEY,
  PORTAL_ROOT_ATTR,
  getViewportRect,
  buildDefaultState,
  clamp,
  clampRect,
  resolveDockedPosition,
  readStoredState,
  writeStoredState,
  isAssistantEnabled,
  isForcedDegraded,
  buildPortalRootStyle,
  buildLauncherButtonStyle,
  buildShellPanelStyle,
  toggleWidgetClosed,
  toggleWidgetMinimized,
  resolveEffectivePointerEvents,
} from "./assistant-layout";
