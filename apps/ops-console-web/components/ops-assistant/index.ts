/**
 * Ops Assistant — public surface.
 *
 * Phase A (ASSIST-FE-CTX) ships the Context Envelope provider + page selection
 * plumbing. The floating widget (ASSIST-FE-WIDGET) and action bridge land in
 * later tasks and re-export from here.
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
